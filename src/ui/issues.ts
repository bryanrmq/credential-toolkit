import { createContext, useContext } from 'react';
import type { Group, LangTag, Project } from '../core/model';
import type { Issue, IssueTarget, Severity } from '../core/validate';
import { type Fix, type FixTools, LANGUAGE_RENAME_CODES, fixesFor } from '../core/validate/fixes';
import { useStore } from '../state/store';
import { t } from '../strings';
import { downscaleLogo } from './lib/logo';

export const IssuesContext = createContext<Issue[]>([]);

export function useIssues(): Issue[] {
  return useContext(IssuesContext);
}

/** The DOM id of the input an issue points to. Inputs use the same function for their `id`. */
export function fieldId(target: IssueTarget): string {
  if (target.kind === 'languages') return 'field-languages';
  if (target.kind === 'hosting') return 'field-hosting-url';
  if (target.kind === 'credential') return `field-credential-${target.theme ?? 'light'}-${target.field}`;
  return `field-${target.nodeId}-${target.field}`;
}

export interface IssueGroup {
  severity: Severity;
  code: string;
  summary: string;
  /** Languages the issue occurs in, in order of appearance; empty when it is not language-specific. */
  langs: LangTag[];
  issues: Issue[];
}

/** One entry per issue and field, merging the copies raised for each language. Errors come first. */
export function groupIssues(issues: Issue[]): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();
  for (const issue of issues) {
    const key = [issue.severity, issue.code, fieldId(issue.target), issue.summary].join('|');
    let group = groups.get(key);
    if (!group) {
      group = { severity: issue.severity, code: issue.code, summary: issue.summary, langs: [], issues: [] };
      groups.set(key, group);
    }
    group.issues.push(issue);
    const lang = 'lang' in issue.target ? issue.target.lang : undefined;
    if (lang && !group.langs.includes(lang)) group.langs.push(lang);
  }
  const list = [...groups.values()];
  return [...list.filter((group) => group.severity === 'error'), ...list.filter((group) => group.severity === 'warning')];
}

/** Image work for fixes, done with the browser's canvas. */
export const FIX_TOOLS: FixTools = { reencodePng: downscaleLogo };

/** One fix button: its label and the fix it applies in each language of the group. */
export interface GroupFix {
  label: string;
  fixes: Fix[];
}

/**
 * The fix buttons of an issue group: none, one (Fix all applies it) or one per choice. When every issue has a single
 * fix but the labels differ between languages (a different colour in each), the one button is labelled "Fix".
 */
export function groupFixes(group: IssueGroup, project: Project, tools: FixTools = FIX_TOOLS): GroupFix[] {
  const perIssue = group.issues.map((issue) => fixesFor(issue, project, tools)).filter((fixes) => fixes.length > 0);
  if (perIssue.length === 0) return [];
  if (perIssue.every((fixes) => fixes.length === 1)) {
    const fixes = perIssue.map(([fix]) => fix);
    return [{ label: fixes.every((fix) => fix.label === fixes[0].label) ? fixes[0].label : t.fixes.fix, fixes }];
  }
  const byLabel = new Map<string, Fix[]>();
  for (const fix of perIssue.flat()) byLabel.set(fix.label, [...(byLabel.get(fix.label) ?? []), fix]);
  return [...byLabel].map(([label, fixes]) => ({ label, fixes }));
}

/** What Fix all applies: the fixes of every group with a single button, in list order, language renames last. */
export function fixAllGroups(groups: IssueGroup[], project: Project, tools: FixTools = FIX_TOOLS): Fix[][] {
  const renames = (group: IssueGroup) => LANGUAGE_RENAME_CODES.includes(group.code);
  return [...groups.filter((group) => !renames(group)), ...groups.filter(renames)]
    .map((group) => groupFixes(group, project, tools))
    .filter((options) => options.length === 1)
    .map(([option]) => option.fixes);
}

/** The keys from the root down to a node, or null when the node is not in `group`. */
function keyPath(group: Group, nodeId: string): string[] | null {
  for (const node of group.children) {
    if (node.id === nodeId) return [node.key];
    const below = node.kind === 'group' ? keyPath(node.group, nodeId) : null;
    if (below) return [node.key, ...below];
  }
  return null;
}

/** Where an issue sits, as shown in the Issues panel: the attribute's key path, or what else it is about. */
export function issueLocation(issue: Issue, project: Project): string {
  const target = issue.target;
  if (target.kind !== 'node') return t.issues.locations[target.kind];
  return keyPath(project.root, target.nodeId)?.join('.') ?? '';
}

export function useFieldIssues(id: string): Issue[] {
  const lang = useStore((state) => state.editLang);
  return useIssues().filter((issue) => fieldId(issue.target) === id && (!('lang' in issue.target) || !issue.target.lang || issue.target.lang === lang));
}

export function focusField(id: string): void {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const element = document.getElementById(id);
      if (!element) return;
      element.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      element.focus({ preventScroll: true });
    }),
  );
}

/** Selects whatever an issue points to, switches language and theme, and focuses the field. */
export function goToIssue(issue: Issue): void {
  const state = useStore.getState();
  const target = issue.target;
  state.setView('editor');
  if (target.kind === 'languages') {
    state.setLanguagesOpen(true);
    return;
  }
  if (target.kind === 'hosting') {
    state.setOutputTab('bundle');
  } else if (target.kind === 'credential') {
    state.select({ kind: 'credential' });
    state.setEditLang(target.lang);
    state.setBrandingTheme(target.theme ?? 'light');
  } else {
    state.select({ kind: 'node', id: target.nodeId });
    if (target.lang) state.setEditLang(target.lang);
  }
  focusField(fieldId(target));
}
