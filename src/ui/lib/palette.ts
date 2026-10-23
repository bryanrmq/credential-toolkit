import { type Group, type LangTag, type Node, type Project } from '../../core/model';
import { filteredIds } from '../../state/treeView';

/*
 * What the command palette (⌘K) finds for a query: attributes and groups of the tree, and commands.
 * Pure, so that ranking is tested apart from the dialog (`CommandPalette.tsx`).
 */

/** How many attributes, and how many commands, the palette lists at most for a query. */
export const PALETTE_LIMIT = 8;

/** How well a text matches a query: at its start (0), at the start of a word (1), anywhere (2). */
export type MatchRank = 0 | 1 | 2;

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** How `text` matches `query` (already lower case), ignoring case; null when it does not hold it. No fuzzy matching. */
export function matchRank(text: string, query: string): MatchRank | null {
  const lower = text.toLowerCase();
  let index = lower.indexOf(query);
  if (index < 0) return null;
  if (index === 0) return 0;
  for (; index > 0; index = lower.indexOf(query, index + 1)) if (!WORD_CHAR.test(lower[index - 1])) return 1;
  return 2;
}

/**
 * The `items` whose `texts` hold `query`, ignoring case: those matching at the start of a text first,
 * then at the start of a word, then anywhere, each item ranked by its best text. Ties keep the order
 * of `items`. At most `limit`. A blank query finds nothing.
 */
export function rankMatches<T>(items: readonly T[], query: string, texts: (item: T) => string[], limit = PALETTE_LIMIT): T[] {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return [];
  const ranked: { item: T; rank: MatchRank; index: number }[] = [];
  items.forEach((item, index) => {
    let rank: MatchRank | null = null;
    for (const text of texts(item)) {
      const found = matchRank(text, wanted);
      if (found !== null && (rank === null || found < rank)) rank = found;
    }
    if (rank !== null) ranked.push({ item, rank, index });
  });
  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return ranked.slice(0, limit).map((entry) => entry.item);
}

/** An attribute or group of the tree, as the palette lists it. */
export interface NodeEntry {
  node: Node;
  /** Its label in the editing language (empty when it has none). */
  label: string;
  /** The keys from the top of the tree down to it: `address.city`. */
  path: string;
  /** The label of the group around it, or its key when it has no label; empty at the top level. */
  parent: string;
}

/** Every attribute and group of `project`, in tree order (depth-first), labelled in `lang`. */
export function nodeEntries(project: Project, lang: LangTag): NodeEntry[] {
  const entries: NodeEntry[] = [];
  const visit = (group: Group, prefix: string, parent: string) => {
    for (const node of group.children) {
      const path = prefix ? `${prefix}.${node.key}` : node.key;
      const label = node.labels[lang] ?? '';
      entries.push({ node, label, path, parent });
      if (node.kind === 'group') visit(node.group, path, label || node.key);
    }
  };
  visit(project.root, '', '');
  return entries;
}

/** The attributes and groups the palette lists for `query`, matched on label, key and path. */
export function findNodes(entries: readonly NodeEntry[], query: string): NodeEntry[] {
  return rankMatches(entries, query, (entry) => [entry.label, entry.node.key, entry.path]);
}

/** Whether the tree filter `filter` hides node `id`, so revealing the node must clear it. */
export function filterHides(project: Project, filter: string, lang: LangTag, id: string): boolean {
  const shown = filteredIds(project, filter, lang);
  return shown !== null && !shown.has(id);
}
