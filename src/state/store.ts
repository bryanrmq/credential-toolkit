import { create } from 'zustand';
import type { ReportNote } from '../core/import/report';
import type { LangTag, Project } from '../core/model';

export type Selection = { kind: 'credential' } | { kind: 'node'; id: string };
export type View = 'editor' | 'translations';
export type Theme = 'light' | 'dark';
export type OutputTab = 'issues' | 'bundle' | 'vct';

export interface AppState {
  project: Project | null;
  selection: Selection;
  editLang: LangTag;
  view: View;
  brandingTheme: Theme;
  languagesOpen: boolean;
  outputTab: OutputTab;
  draftSaveFailed: boolean;
  report: ReportNote[] | null;
  load: (project: Project, report?: ReportNote[]) => void;
  close: () => void;
  /** Applies `recipe` to a copy of the project, so every change produces a new object. */
  update: (recipe: (draft: Project) => void) => void;
  select: (selection: Selection) => void;
  setEditLang: (lang: LangTag) => void;
  setView: (view: View) => void;
  setBrandingTheme: (theme: Theme) => void;
  setLanguagesOpen: (open: boolean) => void;
  setOutputTab: (tab: OutputTab) => void;
  setDraftSaveFailed: (failed: boolean) => void;
  dismissReport: () => void;
}

export const useStore = create<AppState>()((set, get) => ({
  project: null,
  selection: { kind: 'credential' },
  editLang: '',
  view: 'editor',
  brandingTheme: 'light',
  languagesOpen: false,
  outputTab: 'issues',
  draftSaveFailed: false,
  report: null,
  load: (project, report) =>
    set({
      project,
      report: report && report.length ? report : null,
      selection: { kind: 'credential' },
      editLang: project.languages[0] ?? '',
      view: 'editor',
      brandingTheme: 'light',
    }),
  close: () => set({ project: null, report: null, selection: { kind: 'credential' }, languagesOpen: false }),
  update: (recipe) => {
    const current = get().project;
    if (!current) return;
    const next = structuredClone(current);
    recipe(next);
    const editLang = next.languages.includes(get().editLang) ? get().editLang : (next.languages[0] ?? '');
    set({ project: next, editLang });
  },
  select: (selection) => set({ selection }),
  setEditLang: (editLang) => set({ editLang }),
  setView: (view) => set({ view }),
  setBrandingTheme: (brandingTheme) => set({ brandingTheme }),
  setLanguagesOpen: (languagesOpen) => set({ languagesOpen }),
  setOutputTab: (outputTab) => set({ outputTab }),
  setDraftSaveFailed: (draftSaveFailed) => set({ draftSaveFailed }),
  dismissReport: () => set({ report: null }),
}));
