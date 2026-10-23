import { i14yLabel, i14yValueLabel } from '../../core/import/i14y';
import { type AttributeNode, type Group, type LangTag, type Node, type Project, type TextPlace, findNode } from '../../core/model';
import { setTextAt, textAt } from '../../core/review';
import { t } from '../../strings';

/** One translatable text with an accessor per language. Shared by the Translations view and the form's language rows. */
export interface TranslationRow {
  id: string;
  /** Key path of the item, e.g. `pets.name`; absent for credential-level texts. */
  path?: string;
  label: string;
  /** Where the text lives, which also names its "needs review" mark (`core/review.ts`). */
  place: TextPlace;
  get: (project: Project, lang: LangTag) => string;
  set: (draft: Project, lang: LangTag, value: string) => void;
  /** I14Y's text for this row, when it belongs to an attribute linked to an I14Y concept. */
  i14y?: (project: Project, lang: LangTag) => string | undefined;
}

/** `get` and `set` for the text at `place`. */
function accessors(place: TextPlace): Pick<TranslationRow, 'place' | 'get' | 'set'> {
  return {
    place,
    get: (project, lang) => textAt(project, place, lang) ?? '',
    set: (draft, lang, value) => setTextAt(draft, place, lang, value),
  };
}

function linkedAttribute(project: Project, nodeId: string): AttributeNode | undefined {
  const node = findNode(project.root, nodeId)?.node;
  return node?.kind === 'attribute' && node.i14y ? node : undefined;
}

export function metaRow(field: 'name' | 'description', label: string): TranslationRow {
  return {
    id: `meta-${field}`,
    label,
    ...accessors({ kind: 'meta', field }),
  };
}

/** The primary field of the light branding, or of the dark one (which only languages with a dark branding have). */
export function primaryFieldRow(theme: 'light' | 'dark' = 'light'): TranslationRow {
  return {
    id: theme === 'light' ? 'branding-primary-field' : 'branding-dark-primary-field',
    label: t.translations.primaryField,
    ...accessors({ kind: 'primaryField', theme }),
  };
}

/** The issuer name, which goes into the Issuer Metadata rather than the bundle. */
export function issuerNameRow(): TranslationRow {
  return {
    id: 'issuer-name',
    label: t.issuerSection.name,
    ...accessors({ kind: 'issuerName' }),
  };
}

/** Credential name, description and the (light) primary field. */
export function credentialRows(): TranslationRow[] {
  return [metaRow('name', t.translations.name), metaRow('description', t.translations.description), primaryFieldRow()];
}

/** The label (or headline) of one attribute or group. */
export function labelRow(node: Node, path?: string): TranslationRow {
  const nodeId = node.id;
  return {
    id: `${nodeId}-label`,
    path,
    label: node.kind === 'group' ? t.translations.headline : t.translations.label,
    ...accessors({ kind: 'label', nodeId }),
    i14y: (project, lang) => {
      const attribute = linkedAttribute(project, nodeId);
      return attribute && i14yLabel(attribute, lang);
    },
  };
}

/** The text shown for one coded value of an attribute's value list. */
export function entryRow(nodeId: string, code: string, path?: string): TranslationRow {
  return {
    id: `${nodeId}-entry-${code}`,
    path,
    label: t.translations.value(code),
    ...accessors({ kind: 'entry', nodeId, code }),
    i14y: (project, lang) => {
      const attribute = linkedAttribute(project, nodeId);
      return attribute && i14yValueLabel(attribute, lang, code);
    },
  };
}

/** The label (or headline) of one attribute or group, then its value translations. */
export function nodeRows(node: Node, path?: string): TranslationRow[] {
  const codes = node.kind === 'attribute' && node.entries ? node.entries.codes : [];
  return [labelRow(node, path), ...codes.map((code) => entryRow(node.id, code, path))];
}

/** The project's languages with the editing one first, the rest in project order. */
export function editingFirst(languages: LangTag[], editLang: LangTag): LangTag[] {
  return languages.includes(editLang) ? [editLang, ...languages.filter((lang) => lang !== editLang)] : languages;
}

/** Every translatable text in the project, credential first, then the tree depth-first. */
export function allRows(project: Project): TranslationRow[] {
  const rows = credentialRows();
  const visit = (group: Group, prefix: string) => {
    for (const node of group.children) {
      const path = prefix ? `${prefix}.${node.key}` : node.key;
      rows.push(...nodeRows(node, path));
      if (node.kind === 'group') visit(node.group, path);
    }
  };
  visit(project.root, '');
  return rows;
}
