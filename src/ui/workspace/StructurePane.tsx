import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  BinaryIcon,
  CalendarBlankIcon,
  DotsSixVerticalIcon,
  FolderSimpleIcon,
  HashIcon,
  IdentificationCardIcon,
  ImageIcon,
  ListBulletsIcon,
  LockSimpleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  StackIcon,
  TextTIcon,
  ToggleLeftIcon,
} from '@phosphor-icons/react';
import { type ReactNode, useState } from 'react';
import { type PendingLink, pendingLinks, textIn } from '../../core/import/i14y';
import { importSample } from '../../core/import/sample';
import {
  type Group,
  KNOWN_STANDARDS,
  type Node,
  type Project,
  findNode,
  isArrayType,
  newAttribute,
  newGroupLink,
  walkNodes,
} from '../../core/model';
import { NEW_NODE_KEYS, insertNode, moveNode, sourcePrefixFor, uniqueKey } from '../../core/operations';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { Button } from '../components/controls';
import { fieldId, focusField, useIssues } from '../issues';
import { useI14yCatalogue } from '../lib/i14y';
import { I14yDialog } from './I14yDialog';
import { SampleDialog } from './SampleControl';

function nodeIcon(node: Node): ReactNode {
  if (node.kind === 'group') return node.array ? <StackIcon /> : <FolderSimpleIcon />;
  const type = isArrayType(node.type) ? node.type.array : node.type;
  if (isArrayType(node.type)) return <ListBulletsIcon />;
  if (node.standard === KNOWN_STANDARDS.dataUrl) return <ImageIcon />;
  if (type === 'Numeric') return <HashIcon />;
  if (type === 'Boolean') return <ToggleLeftIcon />;
  if (type === 'DateTime') return <CalendarBlankIcon />;
  if (type === 'Binary') return <BinaryIcon />;
  return <TextTIcon />;
}

/** The group new nodes go into: the selected group, the selected attribute's group, or the root. */
function targetGroup(project: Project, selectionId: string | null): Group {
  if (!selectionId) return project.root;
  const visit = findNode(project.root, selectionId);
  if (!visit) return project.root;
  return visit.node.kind === 'group' ? visit.node.group : visit.parent;
}

/** Unlinked attributes that look like I14Y concepts, by node id. */
type Matches = Map<string, PendingLink>;

function NodeRow({ node, matches, onSelect }: { node: Node; matches: Matches; onSelect: () => void }) {
  const selected = useStore((state) => state.selection.kind === 'node' && state.selection.id === node.id);
  const editLang = useStore((state) => state.editLang);
  const select = useStore((state) => state.select);
  const issues = useIssues().filter((issue) => issue.target.kind === 'node' && issue.target.nodeId === node.id);
  const severity = issues.some((issue) => issue.severity === 'error') ? 'error' : issues.length ? 'warning' : null;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.id });
  const match = matches.get(node.id)?.hits[0];

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? 'tree__dragging' : undefined}>
      <div
        className="tree__row"
        role="button"
        tabIndex={0}
        aria-current={selected}
        onClick={() => {
          select({ kind: 'node', id: node.id });
          onSelect();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            select({ kind: 'node', id: node.id });
            onSelect();
          }
        }}
      >
        <button type="button" className="tree__handle" aria-label={t.structure.dragHandle(node.key)} {...attributes} {...listeners}>
          <DotsSixVerticalIcon />
        </button>
        {nodeIcon(node)}
        <span className="tree__key">{node.key || '—'}</span>
        {node.kind === 'attribute' && node.i14y && (
          <span className="tree__tag" title={t.i14yLink.tagTitle(node.i14y.identifier)}>
            {t.i14yLink.tag}
          </span>
        )}
        {match && (
          <span className="tree__tag tree__tag--maybe" title={t.i14yMatch.markerTitle(textIn(match.name, editLang) || match.identifier, match.identifier)}>
            {t.i14yMatch.marker}
          </span>
        )}
        {node.sensitive && <LockSimpleIcon size={12} aria-label={t.inspector.sensitive} />}
        <span className="tree__label">{node.labels[editLang]}</span>
        {severity && <span className={`tree__dot tree__dot--${severity}`} aria-hidden="true" />}
      </div>
      {node.kind === 'group' && <NodeList group={node.group} matches={matches} onSelect={onSelect} />}
    </li>
  );
}

function NodeList({ group, matches, onSelect }: { group: Group; matches: Matches; onSelect: () => void }) {
  return (
    <SortableContext items={group.children.map((child) => child.id)} strategy={verticalListSortingStrategy}>
      <ul className="tree">
        {group.children.length === 0 && <li className="tree__empty">{t.structure.empty}</li>}
        {group.children.map((child) => (
          <NodeRow key={child.id} node={child} matches={matches} onSelect={onSelect} />
        ))}
      </ul>
    </SortableContext>
  );
}

export function StructurePane({ onSelect }: { onSelect: () => void }) {
  const project = useStore((state) => state.project)!;
  const selection = useStore((state) => state.selection);
  const { update, select, setReport } = useStore.getState();
  const [filling, setFilling] = useState(false);
  const [i14yGroupId, setI14yGroupId] = useState<string | null>(null);
  // With unlinked attributes, load the cached I14Y catalogue to mark the ones that look like a concept.
  const unlinked = [...walkNodes(project.root)].some(({ node }) => node.kind === 'attribute' && !node.i14y);
  const { catalogue } = useI14yCatalogue(unlinked);
  const matches: Matches = new Map((catalogue && unlinked ? pendingLinks(project, catalogue) : []).map((pending) => [pending.nodeId, pending]));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const add = (kind: 'attribute' | 'group' | 'list') => {
    const group = targetGroup(project, selection.kind === 'node' ? selection.id : null);
    const prefix = sourcePrefixFor(project, group.id);
    const key = uniqueKey(group, NEW_NODE_KEYS[kind]);
    const node =
      kind === 'attribute'
        ? newAttribute(key, { source: [...prefix, key] })
        : newGroupLink(key, kind === 'list' ? { array: true, source: [...prefix, key, null] } : { source: [...prefix, key] });
    update((draft) => insertNode(draft, group.id, node));
    select({ kind: 'node', id: node.id });
    onSelect();
    focusField(fieldId({ kind: 'node', nodeId: node.id, field: 'key' }));
  };

  const openI14y = () => setI14yGroupId(targetGroup(project, selection.kind === 'node' ? selection.id : null).id);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    update((draft) => {
      const from = findNode(draft.root, String(active.id));
      const to = findNode(draft.root, String(over.id));
      if (!from || !to) return;
      const overIndex = to.parent.children.indexOf(to.node);
      const fromIndex = from.parent.children.indexOf(from.node);
      const sameGroup = from.parent === to.parent;
      moveNode(draft, from.node.id, to.parent.id, sameGroup && fromIndex < overIndex ? overIndex + 1 : overIndex);
    });
  };

  return (
    <>
      <div className="pane__header">
        <span className="pane__title">{t.structure.title}</span>
        <div className="row">
          <Button size="small" variant="ghost" onClick={() => add('attribute')} title={t.structure.addAttribute}>
            <PlusIcon /> {t.structure.addAttribute}
          </Button>
          <Button size="small" variant="ghost" onClick={openI14y} title={t.structure.addFromI14yTitle}>
            <MagnifyingGlassIcon /> {t.structure.addFromI14y}
          </Button>
          <Button size="small" variant="ghost" onClick={() => add('group')} aria-label={t.structure.addGroup} title={t.structure.addGroup}>
            <FolderSimpleIcon />
          </Button>
          <Button size="small" variant="ghost" onClick={() => add('list')} aria-label={t.structure.addList} title={t.structure.addList}>
            <StackIcon />
          </Button>
        </div>
      </div>
      <div className="pane__body">
        <div
          className="tree__row"
          role="button"
          tabIndex={0}
          aria-current={selection.kind === 'credential'}
          onClick={() => {
            select({ kind: 'credential' });
            onSelect();
          }}
          onKeyDown={(event) => event.key === 'Enter' && select({ kind: 'credential' })}
        >
          <IdentificationCardIcon />
          <span className="tree__key">{t.structure.credential}</span>
        </div>
        {project.root.children.length === 0 ? (
          <div className="empty-structure">
            <p className="empty-structure__title">{t.structure.empty}</p>
            <p className="field__hint">{t.structure.emptyHint}</p>
            <div className="row row--wrap">
              <Button size="small" variant="primary" onClick={() => add('attribute')}>
                <PlusIcon /> {t.structure.addFirst}
              </Button>
              <Button size="small" onClick={() => setFilling(true)}>
                {t.structure.fillFromSample}
              </Button>
              <Button size="small" onClick={openI14y}>
                <MagnifyingGlassIcon /> {t.structure.addFromI14yTitle}
              </Button>
            </div>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <NodeList group={project.root} matches={matches} onSelect={onSelect} />
          </DndContext>
        )}
        {i14yGroupId && (
          <I14yDialog
            groupId={i14yGroupId}
            onAdded={(nodeIds) => {
              if (nodeIds.length === 0) return;
              select({ kind: 'node', id: nodeIds[0] });
              onSelect();
            }}
            onClose={() => setI14yGroupId(null)}
          />
        )}
        {filling && (
          <SampleDialog
            title={t.structure.fillTitle}
            intro={t.structure.fillIntro}
            submitLabel={t.structure.fillSubmit}
            onSample={(sample) => {
              const result = importSample(sample, project.languages);
              update((draft) => {
                draft.root = result.project.root;
                draft.sample = sample;
              });
              setReport(result.report);
            }}
            onClose={() => setFilling(false)}
          />
        )}
      </div>
    </>
  );
}
