import { createContext, useContext } from 'react';
import type { Group, LangTag, Project, ReviewMark } from '../core/model';
import { confirmReview, placeOrder, reviewMarks } from '../core/review';
import { ISSUER_FIELDS, ISSUER_ISSUE_CODES, type Issue, type IssueTarget, type Severity, validate, validateIssuer } from '../core/validate';
import { type Fix, type FixTools, LANGUAGE_RENAME_CODES, fixesFor } from '../core/validate/fixes';
import { useStore } from '../state/store';
import { t } from '../strings';
import { downscaleLogo } from './lib/logo';

export const IssuesContext = createContext<Issue[]>([]);

export function useIssues(): Issue[] {
  return useContext(IssuesContext);
}

/** The code of the warning for suggested texts that need review. The Issues panel lists it; a field does not, as its rows show the marks. */
export const REVIEW_CODE = 'review-needed';

/** What a review warning points to: the attribute or group (all its texts), or the credential field. */
function reviewTarget(mark: ReviewMark): IssueTarget {
  const { place, lang } = mark;
  if (place.kind === 'label' || place.kind === 'entry') return { kind: 'node', nodeId: place.nodeId, field: 'label', lang };
  if (place.kind === 'meta') return { kind: 'credential', field: place.field, lang };
  if (place.kind === 'issuerName') return { kind: 'credential', field: 'issuerName', lang };
  return { kind: 'credential', field: 'primaryField', lang, theme: place.theme };
}

/**
 * One warning per attribute (or credential field) and language with suggested texts not yet confirmed, in the
 * order of the form. They never block the download; `groupIssues` merges the languages into one entry.
 */
export function reviewIssues(project: Project): Issue[] {
  const order = placeOrder(project);
  const langIndex = (lang: LangTag) => project.languages.indexOf(lang);
  const marks = reviewMarks(project).sort((a, b) => order(a.place) - order(b.place) || langIndex(a.lang) - langIndex(b.lang));
  const issues = new Map<string, Issue>();
  for (const mark of marks) {
    const target = reviewTarget(mark);
    const key = `${fieldId(target)}|${mark.lang}`;
    if (issues.has(key)) continue;
    issues.set(key, { severity: 'warning', code: REVIEW_CODE, message: t.review.issueIn(mark.lang), summary: t.review.issue, target });
  }
  return [...issues.values()];
}

/** Every issue of the project: the checks of the bundle, then of the issuer settings, then the suggested texts that need review. */
export function projectIssues(project: Project): Issue[] {
  return [...validate(project), ...validateIssuer(project), ...reviewIssues(project)];
}

/** Whether an issue blocks the bundle download: an error of the bundle checks, not of the issuer settings, which the bundle never has. */
export function blocksBundle(issue: Pick<Issue, 'severity' | 'code'>): boolean {
  return issue.severity === 'error' && !ISSUER_ISSUE_CODES.includes(issue.code);
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

/** Whether a mark belongs to what a review warning points to, in its language. */
function reviewedBy(issue: Issue): (mark: ReviewMark) => boolean {
  const target = issue.target;
  return (mark) => {
    const other = reviewTarget(mark);
    return fieldId(other) === fieldId(target) && 'lang' in other && 'lang' in target && other.lang === target.lang;
  };
}

/** The fixes of one issue: a review warning's Confirm, else the fix rules of `core/validate/fixes.ts`. */
export function issueFixes(issue: Issue, project: Project, tools: FixTools = FIX_TOOLS): Fix[] {
  if (issue.code === REVIEW_CODE) return [{ label: t.review.confirm, apply: (draft) => void confirmReview(draft, reviewedBy(issue)) }];
  return fixesFor(issue, project, tools);
}

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
  const perIssue = group.issues.map((issue) => issueFixes(issue, project, tools)).filter((fixes) => fixes.length > 0);
  if (perIssue.length === 0) return [];
  if (perIssue.every((fixes) => fixes.length === 1)) {
    const fixes = perIssue.map(([fix]) => fix);
    return [{ label: fixes.every((fix) => fix.label === fixes[0].label) ? fixes[0].label : t.fixes.fix, fixes }];
  }
  const byLabel = new Map<string, Fix[]>();
  for (const fix of perIssue.flat()) byLabel.set(fix.label, [...(byLabel.get(fix.label) ?? []), fix]);
  return [...byLabel].map(([label, fixes]) => ({ label, fixes }));
}

/**
 * What Fix all applies: the fixes of every group with a single button, in list order, language renames last.
 * It leaves suggested texts alone: confirming them without reading them would defeat the review.
 */
export function fixAllGroups(groups: IssueGroup[], project: Project, tools: FixTools = FIX_TOOLS): Fix[][] {
  const renames = (group: IssueGroup) => LANGUAGE_RENAME_CODES.includes(group.code);
  const fixable = groups.filter((group) => group.code !== REVIEW_CODE);
  return [...fixable.filter((group) => !renames(group)), ...fixable.filter(renames)]
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

/** Whether an issue points to the issuer settings, which the Metadata page holds. */
export function isIssuerIssue(issue: Pick<Issue, 'target'>): boolean {
  return issue.target.kind === 'credential' && ISSUER_FIELDS.includes(issue.target.field);
}

/** Where an issue sits, as shown in the Issues panel: the attribute's key path, or what else it is about. */
export function issueLocation(issue: Issue, project: Project): string {
  const target = issue.target;
  if (isIssuerIssue(issue)) return t.issues.locations.metadata;
  if (target.kind !== 'node') return t.issues.locations[target.kind];
  return keyPath(project.root, target.nodeId)?.join('.') ?? '';
}

export function useFieldIssues(id: string): Issue[] {
  const lang = useStore((state) => state.editLang);
  return useIssues().filter((issue) => issue.code !== REVIEW_CODE && fieldId(issue.target) === id && (!('lang' in issue.target) || !issue.target.lang || issue.target.lang === lang));
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

/** Selects whatever an issue points to, switches language and theme (or shows the Output pane's Bundle tab), and focuses the field. */
export function goToIssue(issue: Issue): void {
  const state = useStore.getState();
  const target = issue.target;
  if (isIssuerIssue(issue)) {
    // The issuer settings are on the Metadata page; the OCA keeps its view and selection.
    state.setArea('metadata');
    if ('lang' in target && target.lang) state.setEditLang(target.lang);
    focusField(fieldId(target));
    return;
  }
  state.setView('editor');
  if (target.kind === 'languages') {
    state.setLanguagesOpen(true);
    return;
  }
  if (target.kind === 'hosting') {
    // The hosting field is under the Output pane's Bundle tab.
    state.setOutputOpen(true);
    state.setOutputTab('bundle');
  } else if (target.kind === 'credential') {
    state.select({ kind: 'credential' });
    if (target.lang) state.setEditLang(target.lang);
    state.setBrandingTheme(target.theme ?? 'light');
  } else {
    state.select({ kind: 'node', id: target.nodeId });
    if (target.lang) state.setEditLang(target.lang);
  }
  focusField(fieldId(target));
}
