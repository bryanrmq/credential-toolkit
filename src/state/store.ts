import { create } from 'zustand';
import type { CardPlatform, CardVariant } from '../core/card/profiles';
import type { ReportNote } from '../core/import/report';
import type { LangTag, Project } from '../core/model';
import type { Fix } from '../core/validate/fixes';

export type Selection = { kind: 'credential' } | { kind: 'node'; id: string };
export type View = 'editor' | 'translations';
export type Theme = 'light' | 'dark';
export type OutputTab = 'issues' | 'bundle' | 'vct';

/** What the fix toast reports: how many issues a fix fixed, that it failed, or that the project changed meanwhile. */
export type FixNotice = { kind: 'fixed'; fixed: number; total: number } | { kind: 'failed'; label?: string } | { kind: 'stale' };

export interface AppState {
  project: Project | null;
  selection: Selection;
  editLang: LangTag;
  view: View;
  brandingTheme: Theme;
  languagesOpen: boolean;
  tourOpen: boolean;
  outputTab: OutputTab;
  cardPlatform: CardPlatform;
  cardVariant: CardVariant;
  draftSaveFailed: boolean;
  report: ReportNote[] | null;
  /** The project as it was before the last fix, while the toast still offers Undo. */
  undo: Project | null;
  fixNotice: FixNotice | null;
  fixing: boolean;
  load: (project: Project, report?: ReportNote[]) => void;
  close: () => void;
  /** Applies `recipe` to a copy of the project, so every change produces a new object. */
  update: (recipe: (draft: Project) => void) => void;
  select: (selection: Selection) => void;
  setEditLang: (lang: LangTag) => void;
  setView: (view: View) => void;
  setBrandingTheme: (theme: Theme) => void;
  setLanguagesOpen: (open: boolean) => void;
  setTourOpen: (open: boolean) => void;
  setOutputTab: (tab: OutputTab) => void;
  setCardPlatform: (platform: CardPlatform) => void;
  setCardVariant: (variant: CardVariant) => void;
  setDraftSaveFailed: (failed: boolean) => void;
  setReport: (report: ReportNote[]) => void;
  dismissReport: () => void;
  /** Applies each group of fixes (one group per listed issue) to one copy of the project; Undo restores it. */
  applyFixes: (groups: Fix[][]) => Promise<void>;
  undoFix: () => void;
  /** Hides the toast; its Undo goes with it. */
  dismissFixNotice: () => void;
}

/** The language to keep editing after `before` became `after`: the same tag, else the tag now at its place (a rename), else the first. */
function followEditLang(before: Project, after: Project, lang: LangTag): LangTag {
  if (after.languages.includes(lang)) return lang;
  return after.languages[before.languages.indexOf(lang)] ?? after.languages[0] ?? '';
}

export const useStore = create<AppState>()((set, get) => ({
  project: null,
  selection: { kind: 'credential' },
  editLang: '',
  view: 'editor',
  brandingTheme: 'light',
  languagesOpen: false,
  tourOpen: false,
  outputTab: 'issues',
  cardPlatform: 'ios',
  cardVariant: 'detail',
  draftSaveFailed: false,
  report: null,
  undo: null,
  fixNotice: null,
  fixing: false,
  load: (project, report) =>
    set({
      project,
      report: report && report.length ? report : null,
      selection: { kind: 'credential' },
      editLang: project.languages[0] ?? '',
      view: 'editor',
      brandingTheme: 'light',
      undo: null,
      fixNotice: null,
    }),
  close: () => set({ project: null, report: null, selection: { kind: 'credential' }, languagesOpen: false, tourOpen: false, undo: null, fixNotice: null }),
  update: (recipe) => {
    const current = get().project;
    if (!current) return;
    const next = structuredClone(current);
    recipe(next);
    const editLang = next.languages.includes(get().editLang) ? get().editLang : (next.languages[0] ?? '');
    set({ project: next, editLang, undo: null, fixNotice: null });
  },
  select: (selection) => set({ selection }),
  setEditLang: (editLang) => set({ editLang }),
  setView: (view) => set({ view }),
  setBrandingTheme: (brandingTheme) => set({ brandingTheme }),
  setLanguagesOpen: (languagesOpen) => set({ languagesOpen }),
  setTourOpen: (tourOpen) => set({ tourOpen }),
  setOutputTab: (outputTab) => set({ outputTab }),
  setCardPlatform: (cardPlatform) => set({ cardPlatform }),
  setCardVariant: (cardVariant) => set({ cardVariant }),
  setDraftSaveFailed: (draftSaveFailed) => set({ draftSaveFailed }),
  setReport: (report) => set({ report: report.length ? report : null }),
  dismissReport: () => set({ report: null }),
  applyFixes: async (groups) => {
    const before = get().project;
    if (!before || get().fixing || groups.length === 0) return;
    set({ fixing: true });
    const draft = structuredClone(before);
    let fixed = 0;
    for (const fixes of groups) {
      let ok = true;
      for (const fix of fixes) {
        try {
          await fix.apply(draft);
        } catch {
          ok = false;
        }
      }
      if (ok) fixed++;
    }
    if (get().project !== before) {
      set({ fixing: false, fixNotice: { kind: 'stale' } });
    } else if (fixed === 0) {
      set({ fixing: false, fixNotice: { kind: 'failed', label: groups.length === 1 ? groups[0][0]?.label : undefined } });
    } else {
      set({
        fixing: false,
        project: draft,
        editLang: followEditLang(before, draft, get().editLang),
        undo: before,
        fixNotice: { kind: 'fixed', fixed, total: groups.length },
      });
    }
  },
  undoFix: () => {
    const { undo, project, editLang } = get();
    if (!undo || !project) return;
    set({ project: undo, editLang: followEditLang(project, undo, editLang), undo: null, fixNotice: null });
  },
  dismissFixNotice: () => set({ fixNotice: null, undo: null }),
}));
