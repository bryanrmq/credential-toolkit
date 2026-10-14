import { createContext, useContext } from 'react';
import type { Issue, IssueTarget } from '../core/validate';
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
