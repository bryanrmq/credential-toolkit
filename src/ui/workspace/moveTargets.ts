import type { Group, Node } from '../../core/model';
import { t } from '../../strings';

/** Every group the given nodes may move to: all groups except their own subtrees. */
export function moveTargets(root: Group, nodes: Node[]): Array<{ id: string; label: string }> {
  const targets: Array<{ id: string; label: string }> = [];
  const visit = (group: Group, path: string[]) => {
    if (nodes.some((node) => node.kind === 'group' && group === node.group)) return;
    targets.push({ id: group.id, label: path.length ? path.join(' › ') : t.inspector.root });
    for (const child of group.children) if (child.kind === 'group') visit(child.group, [...path, child.key]);
  };
  visit(root, []);
  return targets;
}
