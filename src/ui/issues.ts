import { createContext, useContext } from 'react';
import type { LangTag } from '../core/model';
import type { Issue, IssueTarget, Severity } from '../core/validate';
import { useStore } from '../state/store';

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
