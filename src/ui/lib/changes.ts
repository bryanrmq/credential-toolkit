import { useEffect, useState } from 'react';
import type { Baseline } from '../../core/baseline';
import { type ChangeSection, type ProjectChange, compareProjects } from '../../core/compare';
import { bundleIntegrity } from '../../core/export/outputs';
import { importBundle } from '../../core/import/bundle';
import { languageLabel } from '../../core/langs';
import type { Project } from '../../core/model';
import { formatPath } from '../../core/paths';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { fieldId, focusField } from '../issues';

/*
 * The Changes tab's data: what changed between the open draft's published baseline and the current project
 * (`useChanges`), how each change reads as a row (`changeRow`), and the jump to its field (`goToChange`).
 */

export type ChangesState =
  | { status: 'none' }
  | { status: 'working' }
  /** `integrity` is the baseline's `#integrity` with the project's current hosting, comparable with the output's. */
  | { status: 'ready'; changes: ProjectChange[]; integrity: string };

const CHANGES_DELAY_MS = 150;

/** The project a baseline's bundle imports as, read once per baseline text. */
const baselineProjects = new Map<string, Promise<Project>>();
function baselineProject(json: string): Promise<Project> {
  let project = baselineProjects.get(json);
  if (!project) {
    project = importBundle(JSON.parse(json)).then((result) => result.project);
    // Only the latest baseline is worth keeping.
    baselineProjects.clear();
    baselineProjects.set(json, project);
  }
  return project;
}

/** Compares `project` with `baseline` shortly after either changes, like the bundle export. */
export function useChanges(project: Project, baseline: Baseline | null): ChangesState {
  const [state, setState] = useState<ChangesState>({ status: 'working' });
  useEffect(() => {
    if (!baseline) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const before = await baselineProject(baseline.json);
        const [changes, integrity] = await Promise.all([compareProjects(before, project), bundleIntegrity(baseline.json, project.hosting)]);
        if (!cancelled) setState({ status: 'ready', changes, integrity });
      } catch {
        // A stored baseline was checked when it was set; if it still fails, there is nothing to compare with.
        if (!cancelled) setState({ status: 'none' });
      }
    }, CHANGES_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [project, baseline]);
  return baseline ? state : { status: 'none' };
}

/** How a change reads in the list: what it is about (a key path, a field, a language) and the detail after it. */
export function changeRow(change: ProjectChange): { subject: string; detail: string } {
  const text = t.changes;
  switch (change.section) {
    case 'attributes': {
      const subject = change.path;
      switch (change.kind) {
        case 'node':
          return { subject, detail: change.nodeKind === 'group' ? text.group : '' };
        case 'type':
          return { subject, detail: text.type(change.from, change.to) };
        case 'source':
          return { subject, detail: text.source(change.tag, formatPath(change.from), formatPath(change.to)) };
        case 'position':
          return { subject, detail: text.moved };
        case 'sensitive':
          return { subject, detail: text.sensitive(change.to) };
        case 'standard':
          return { subject, detail: text.format(change.from, change.to) };
        case 'entries':
          return { subject, detail: text.entries };
      }
      break;
    }
    case 'labels':
      return { subject: change.path, detail: change.languages.join(', ') };
    case 'branding': {
      const languages = change.languages.join(', ');
      return { subject: text.fields[change.field], detail: change.theme ? text.themed(text.themes[change.theme], languages) : languages };
    }
    case 'languages':
      return change.kind === 'language'
        ? { subject: languageLabel(change.language), detail: '' }
        : { subject: text.order, detail: text.reordered(change.from.join(', '), change.to.join(', ')) };
    case 'other':
      return { subject: text.bundle, detail: text.bundleDetail };
  }
}

/** Whether a row leads somewhere: not for removed items, nor for bundle content the editor does not show. */
export function canGoToChange(change: ProjectChange): boolean {
  if (change.tag === 'removed' || change.section === 'other') return false;
  return change.section === 'attributes' || change.section === 'labels' ? change.nodeId !== undefined : true;
}

/** The node field each kind of change is about, as `field-<id>-<field>` names it. */
const NODE_FIELDS = {
  node: 'key',
  type: 'type',
  source: 'source',
  position: 'move',
  sensitive: 'sensitive',
  standard: 'standard',
  entries: 'entries',
  label: 'label',
} as const;

/**
 * Selects what a change is about, switches to a language (and theme) it is in, and focuses the field, like
 * a click in the Issues panel. Language changes open the Languages dialog.
 */
export function goToChange(change: ProjectChange): void {
  if (!canGoToChange(change)) return;
  const state = useStore.getState();
  const languages = state.project?.languages ?? [];
  const inProject = (list: string[]) => list.find((lang) => languages.includes(lang));
  state.setView('editor');
  if (change.section === 'languages') {
    state.setLanguagesOpen(true);
  } else if (change.section === 'branding') {
    const lang = inProject(change.languages);
    state.select({ kind: 'credential' });
    if (lang) state.setEditLang(lang);
    state.setBrandingTheme(change.theme ?? 'light');
    focusField(fieldId({ kind: 'credential', field: change.field, lang: lang ?? '', theme: change.theme }));
  } else if ((change.section === 'attributes' || change.section === 'labels') && change.nodeId) {
    state.select({ kind: 'node', id: change.nodeId });
    if (change.section === 'labels') {
      const lang = inProject(change.languages);
      if (lang) state.setEditLang(lang);
    }
    // A group's type is its "list of objects" toggle.
    const field = change.kind === 'type' && change.nodeKind === 'group' ? 'array' : NODE_FIELDS[change.kind];
    focusField(`field-${change.nodeId}-${field}`);
  }
}

/** The list's groups, in section order, with only the sections that have changes. */
export function groupChanges(changes: ProjectChange[]): Array<{ section: ChangeSection; changes: ProjectChange[] }> {
  const groups: Array<{ section: ChangeSection; changes: ProjectChange[] }> = [];
  for (const change of changes) {
    const last = groups[groups.length - 1];
    if (last?.section === change.section) last.changes.push(change);
    else groups.push({ section: change.section, changes: [change] });
  }
  return groups;
}
