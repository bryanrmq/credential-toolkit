import { TrashIcon } from '@phosphor-icons/react';
import { type FillOptions, compareWithI14y, fillFromConcept, i14yLabel, i14yLanguage, matchConcepts, textIn } from '../../core/import/i14y';
import {
  type AttrType,
  type AttributeNode,
  EDITABLE_TYPES,
  type Group,
  type GroupLink,
  KNOWN_STANDARDS,
  type Node,
  type PrimitiveType,
  findNode,
  isArrayType,
} from '../../core/model';
import { moveNode, removeNode, renameNode } from '../../core/operations';
import { templatePaths } from '../../core/templates';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { Button, Field, Toggle } from '../components/controls';
import { CommitInput, PathInput, type SuggestionSource, TemplateInput } from '../components/inputs';
import { fieldId } from '../issues';
import { fetchConcept, useI14yCatalogue } from '../lib/i14y';
import { EntriesEditor } from './EntriesEditor';
import { I14yLabelHint, I14yLinkLine } from './I14yLink';
import { InspectorHeader } from './InspectorHeader';

/** Every group a node may move to: all groups except the node's own subtree. */
function moveTargets(root: Group, node: Node): Array<{ id: string; label: string }> {
  const targets: Array<{ id: string; label: string }> = [];
  const visit = (group: Group, path: string[]) => {
    if (node.kind === 'group' && group === node.group) return;
    targets.push({ id: group.id, label: path.length ? path.join(' › ') : t.inspector.root });
    for (const child of group.children) if (child.kind === 'group') visit(child.group, [...path, child.key]);
  };
  visit(root, []);
  return targets;
}

function standardOptions(type: PrimitiveType): Array<{ value: string; label: string }> {
  if (type === 'DateTime') {
    return [
      { value: KNOWN_STANDARDS.iso8601, label: t.inspector.iso8601 },
      { value: KNOWN_STANDARDS.unixEpoch, label: t.inspector.unixTime },
    ];
  }
  if (type === 'Text') {
    return [
      { value: '', label: t.inspector.plainText },
      { value: KNOWN_STANDARDS.dataUrl, label: t.inspector.image },
    ];
  }
  return [];
}

/** Fills the attribute from an I14Y concept and reports what is still missing, or that I14Y could not be reached. */
async function fillFromI14y(nodeId: string, conceptId: string, options: FillOptions): Promise<void> {
  const { update, setReport } = useStore.getState();
  try {
    const concept = await fetchConcept(conceptId);
    let report: ReturnType<typeof fillFromConcept> = [];
    update((draft) => void (report = fillFromConcept(draft, nodeId, concept, options)));
    setReport(report);
  } catch {
    setReport([{ level: 'warning', message: t.i14y.unreachable }]);
  }
}

function defaultStandard(type: PrimitiveType, current?: string): string | undefined {
  const options = standardOptions(type).map((option) => option.value);
  if (current !== undefined && options.includes(current)) return current || undefined;
  return type === 'DateTime' ? KNOWN_STANDARDS.iso8601 : undefined;
}

export function NodeInspector({ node, parent }: { node: Node; parent: Group }) {
  const project = useStore((state) => state.project)!;
  const lang = useStore((state) => state.editLang);
  const { update, select } = useStore.getState();
  const id = (field: 'key' | 'type' | 'source' | 'label' | 'entries') => fieldId({ kind: 'node', nodeId: node.id, field });
  const edit = (recipe: (draft: Node) => void) =>
    update((draft) => {
      const found = findNode(draft.root, node.id);
      if (found) recipe(found.node);
    });
  const paths = templatePaths(parent);
  const targets = moveTargets(project.root, node);
  const label = node.labels[lang] ?? '';
  const linkedLabel = node.kind === 'attribute' ? i14yLabel(node, lang) : undefined;
  const labelStatus = compareWithI14y(label, linkedLabel);
  const { catalogue, request } = useI14yCatalogue();
  // Labels match names in the editing language; keys also match I14Y identifiers.
  const i14y = (field: 'key' | 'label'): SuggestionSource | undefined =>
    node.kind === 'attribute'
      ? {
          heading: t.i14y.suggestHeading,
          prepare: request,
          find: (text) =>
            (catalogue ? matchConcepts(catalogue, text, { language: i14yLanguage(lang), identifier: field === 'key' }) : []).map((hit) => ({
              id: hit.id,
              label: textIn(hit.name, lang) || hit.identifier,
              detail: hit.identifier,
            })),
          pick: (suggestion) => void fillFromI14y(node.id, suggestion.id, field === 'key' ? { replaceKey: true } : { replaceLabelIn: lang }),
        }
      : undefined;

  return (
    <>
      <InspectorHeader
        kind={node.kind === 'group' ? (node.array ? t.structure.addList : t.structure.addGroup) : t.structure.addAttribute}
        lang={lang}
        title={node.labels[lang] || node.key || '—'}
        technicalKey={node.key}
      />

      {node.kind === 'attribute' && node.i14y && (
        <I14yLinkLine link={node.i14y} lang={lang} onUnlink={() => edit((draft) => void (draft.kind === 'attribute' && delete draft.i14y))} />
      )}

      <Field id={id('key')} label={t.inspector.key} hint={t.inspector.keyHint}>
        <CommitInput
          id={id('key')}
          mono
          value={node.key}
          onCommit={(value) => update((draft) => renameNode(draft, node.id, value))}
          suggestions={i14y('key')}
        />
      </Field>

      <Field
        id={id('label')}
        label={node.kind === 'group' ? t.inspector.headline : t.inspector.label}
        hint={
          node.kind === 'group'
            ? t.inspector.headlineHint
            : labelStatus === 'edited' || labelStatus === 'empty'
              ? <I14yLabelHint current={label} i14yText={linkedLabel} onReset={(text) => edit((draft) => void (draft.labels[lang] = text))} />
              : undefined
        }
      >
        <TemplateInput
          id={id('label')}
          value={node.labels[lang] ?? ''}
          paths={paths}
          placeholder={node.key}
          suggestions={i14y('label')}
          onChange={(value) =>
            edit((draft) => {
              if (value) draft.labels[lang] = value;
              else delete draft.labels[lang];
            })
          }
        />
      </Field>

      {node.kind === 'attribute' ? <AttributeFields node={node} edit={edit} id={id} /> : <GroupFields node={node} edit={edit} />}

      <Field id={id('source')} label={t.inspector.source} hint={t.inspector.sourceHint}>
        <PathInput
          id={id('source')}
          value={node.source ?? []}
          onChange={(path) =>
            edit((draft) => {
              if (draft.kind === 'group' && path.length === 0) delete draft.source;
              else draft.source = path;
            })
          }
        />
      </Field>

      <Field id={`field-${node.id}-sensitive`} label={t.inspector.sensitive} hint={t.inspector.sensitiveHint}>
        <Toggle id={`field-${node.id}-sensitive`} checked={node.sensitive} label={t.inspector.sensitiveToggle} onChange={(checked) => edit((draft) => void (draft.sensitive = checked))} />
      </Field>

      <div className="section">
        <Field id={`field-${node.id}-move`} label={t.inspector.moveTo}>
          <select
            id={`field-${node.id}-move`}
            className="select"
            value={parent.id}
            onChange={(event) => update((draft) => void moveNode(draft, node.id, event.target.value, Number.MAX_SAFE_INTEGER))}
          >
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
        </Field>
        {node.kind === 'group' && node.group.passthrough.length > 0 && (
          <p className="note">{t.inspector.passthrough(node.group.passthrough.map((overlay) => String(overlay.type)).join(', '))}</p>
        )}
        <Button
          variant="danger"
          onClick={() => {
            if (node.kind === 'group' && node.group.children.length && !window.confirm(t.inspector.confirmDeleteGroup(node.key))) return;
            update((draft) => void removeNode(draft, node.id));
            select({ kind: 'credential' });
          }}
        >
          <TrashIcon /> {t.inspector.delete}
        </Button>
      </div>
    </>
  );
}

function AttributeFields({
  node,
  edit,
  id,
}: {
  node: AttributeNode;
  edit: (recipe: (draft: Node) => void) => void;
  id: (field: 'type' | 'entries') => string;
}) {
  const base = isArrayType(node.type) ? node.type.array : node.type;
  const list = isArrayType(node.type);
  const options = standardOptions(base);
  const setType = (primitive: PrimitiveType, asList: boolean) =>
    edit((draft) => {
      if (draft.kind !== 'attribute') return;
      const type: AttrType = asList ? { array: primitive } : primitive;
      draft.type = type;
      const standard = defaultStandard(primitive, draft.standard);
      if (standard) draft.standard = standard;
      else delete draft.standard;
      if (asList && draft.source.length && draft.source[draft.source.length - 1] !== null) draft.source = [...draft.source, null];
      if (!asList && draft.source.length > 1 && draft.source[draft.source.length - 1] === null) draft.source = draft.source.slice(0, -1);
    });

  return (
    <>
      <Field id={id('type')} label={t.inspector.type}>
        <div className="row">
          <select id={id('type')} className="select grow" value={base} onChange={(event) => setType(event.target.value as PrimitiveType, list)}>
            {EDITABLE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
            {base === 'Binary' && <option value="Binary">{t.inspector.binaryImported}</option>}
          </select>
          <Toggle checked={list} label={t.inspector.list} onChange={(checked) => setType(base, checked)} />
        </div>
      </Field>
      {options.length > 0 && (
        <Field id={`field-${node.id}-standard`} label={t.inspector.format}>
          <select
            id={`field-${node.id}-standard`}
            className="select"
            value={node.standard ?? ''}
            onChange={(event) =>
              edit((draft) => {
                if (draft.kind !== 'attribute') return;
                if (event.target.value) draft.standard = event.target.value;
                else delete draft.standard;
              })
            }
          >
            {base === 'DateTime' && !node.standard && <option value="">—</option>}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
            {node.standard && !options.some((option) => option.value === node.standard) && <option value={node.standard}>{node.standard}</option>}
          </select>
        </Field>
      )}
      <EntriesEditor node={node} edit={edit} id={id('entries')} />
    </>
  );
}

function GroupFields({ node, edit }: { node: GroupLink; edit: (recipe: (draft: Node) => void) => void }) {
  return (
    <Field id={`field-${node.id}-array`} label={t.inspector.listOfObjects}>
      <Toggle
        id={`field-${node.id}-array`}
        checked={node.array}
        label={t.inspector.listOfObjectsToggle}
        onChange={(checked) =>
          edit((draft) => {
            if (draft.kind !== 'group') return;
            draft.array = checked;
            const source = draft.source ?? [draft.key];
            if (checked && source[source.length - 1] !== null) draft.source = [...source, null];
            if (!checked && source[source.length - 1] === null) draft.source = source.slice(0, -1);
          })
        }
      />
    </Field>
  );
}
