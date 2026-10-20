import { i14yLabel, i14yValueLabel } from '../../core/import/i14y';
import { type AttributeNode, type Group, type LangTag, type Node, type Project, findNode } from '../../core/model';
import { t } from '../../strings';

/** One translatable text with an accessor per language. Shared by the Translations table and column. */
export interface TranslationRow {
  id: string;
  /** Key path of the item, e.g. `pets.name`; absent for credential-level texts. */
  path?: string;
  label: string;
  get: (project: Project, lang: LangTag) => string;
  set: (draft: Project, lang: LangTag, value: string) => void;
  /** I14Y's text for this row, when it belongs to an attribute linked to an I14Y concept. */
  i14y?: (project: Project, lang: LangTag) => string | undefined;
}

function linkedAttribute(project: Project, nodeId: string): AttributeNode | undefined {
  const node = findNode(project.root, nodeId)?.node;
  return node?.kind === 'attribute' && node.i14y ? node : undefined;
}

function metaRow(field: 'name' | 'description', label: string): TranslationRow {
  return {
    id: `meta-${field}`,
    label,
    get: (project, lang) => project.meta[lang]?.[field] ?? '',
    set: (draft, lang, value) => void (draft.meta[lang] = { ...(draft.meta[lang] ?? { name: '', description: '' }), [field]: value }),
  };
}

/** Credential name, description and the (light) primary field. */
export function credentialRows(): TranslationRow[] {
  return [
    metaRow('name', t.translations.name),
    metaRow('description', t.translations.description),
    {
      id: 'branding-primary-field',
      label: t.translations.primaryField,
      get: (project, lang) => project.branding[lang]?.light.primaryField ?? '',
      set: (draft, lang, value) => {
        const pair = (draft.branding[lang] ??= { light: {} });
        if (value) pair.light.primaryField = value;
        else delete pair.light.primaryField;
      },
    },
  ];
}

/** The label (or headline) of one attribute or group, then its value translations. */
export function nodeRows(node: Node, path?: string): TranslationRow[] {
  const nodeId = node.id;
  const rows: TranslationRow[] = [
    {
      id: `${nodeId}-label`,
      path,
      label: node.kind === 'group' ? t.translations.headline : t.translations.label,
      get: (project, lang) => findNode(project.root, nodeId)?.node.labels[lang] ?? '',
      set: (draft, lang, value) => {
        const target = findNode(draft.root, nodeId)?.node;
        if (!target) return;
        if (value) target.labels[lang] = value;
        else delete target.labels[lang];
      },
      i14y: (project, lang) => {
        const attribute = linkedAttribute(project, nodeId);
        return attribute && i14yLabel(attribute, lang);
      },
    },
  ];
  if (node.kind === 'attribute' && node.entries) {
    for (const code of node.entries.codes) {
      rows.push({
        id: `${nodeId}-entry-${code}`,
        path,
        label: t.translations.value(code),
        get: (project, lang) => {
          const target = findNode(project.root, nodeId)?.node;
          return target?.kind === 'attribute' ? (target.entries?.labels[lang]?.[code] ?? '') : '';
        },
        set: (draft, lang, value) => {
          const target = findNode(draft.root, nodeId)?.node;
          if (target?.kind !== 'attribute' || !target.entries) return;
          target.entries.labels[lang] = { ...(target.entries.labels[lang] ?? {}), [code]: value };
        },
        i14y: (project, lang) => {
          const attribute = linkedAttribute(project, nodeId);
          return attribute && i14yValueLabel(attribute, lang, code);
        },
      });
    }
  }
  return rows;
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
