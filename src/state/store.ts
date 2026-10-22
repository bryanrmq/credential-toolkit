import { create } from 'zustand';
import type { CardPlatform, CardVariant } from '../core/card/profiles';
import type { ReportNote } from '../core/import/report';
import { type LangTag, type Project, findNode } from '../core/model';
import type { Fix } from '../core/validate/fixes';

export type Selection = { kind: 'credential' } | { kind: 'node'; id: string };
export type View = 'editor' | 'translations';
export type Theme = 'light' | 'dark';
export type OutputTab = 'bundle' | 'vct';

/** What the fix toast reports: how many issues a fix fixed, that it failed, or that the project changed meanwhile. */
export type FixNotice = { kind: 'fixed'; fixed: number; total: number } | { kind: 'failed'; label?: string } | { kind: 'stale' };

/** One undo or redo step: the project and the selection to go back to. */
export interface HistoryStep {
  project: Project;
  selection: Selection;
}

/** How many undo steps are kept. */
export const HISTORY_LIMIT = 100;
/** How long typing may pause before the next keystroke starts a new undo step. */
export const TYPING_PAUSE_MS = 1000;

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
  /** The project was just opened from a bundle: offer to link its attributes that look like I14Y concepts. */
  i14yReview: boolean;
  /** Undo steps, oldest first. Never saved: a reload starts without history. */
  past: HistoryStep[];
  /** Redo steps, the next one last. Any new edit clears them. */
  future: HistoryStep[];
  fixNotice: FixNotice | null;
  fixing: boolean;
  load: (project: Project, report?: ReportNote[], options?: { reviewI14y?: boolean }) => void;
  close: () => void;
  /**
   * Applies `recipe` to a copy of the project, so every change produces a new object, and records the
   * project before it as an undo step. Updates typed in the same `field` (by default the focused text
   * field) merge into one step until the field loses focus or typing pauses for `TYPING_PAUSE_MS`.
   */
  update: (recipe: (draft: Project) => void, options?: { field?: string | Element }) => void;
  undo: () => void;
  redo: () => void;
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
  dismissI14yReview: () => void;
  /** Applies each group of fixes (one group per listed issue) to one copy of the project, as one undo step. */
  applyFixes: (groups: Fix[][]) => Promise<void>;
  /** Hides the toast; the fix stays in the history. */
  dismissFixNotice: () => void;
}

/** The language to keep editing after `before` became `after`: the same tag, else the tag now at its place (a rename), else the first. */
function followEditLang(before: Project, after: Project, lang: LangTag): LangTag {
  if (after.languages.includes(lang)) return lang;
  return after.languages[before.languages.indexOf(lang)] ?? after.languages[0] ?? '';
}

/** `selection` if its node is still in `project`, else the credential. */
function selectionIn(project: Project, selection: Selection): Selection {
  return selection.kind === 'node' && !findNode(project.root, selection.id) ? { kind: 'credential' } : selection;
}

/** `past` with `step` added, keeping the last `HISTORY_LIMIT` steps. */
function record(past: HistoryStep[], step: HistoryStep): HistoryStep[] {
  return [...past, step].slice(-HISTORY_LIMIT);
}

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'email', 'tel', 'number']);

/** The focused element if it is a text field, which is where typing comes from. */
function focusedTextField(): Element | undefined {
  if (typeof document === 'undefined') return undefined;
  const element = document.activeElement;
  if (element instanceof HTMLTextAreaElement) return element;
  if (element instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(element.type)) return element;
  return undefined;
}

/** The field of the last update and when it came, while later updates from it may merge into its step. */
let typing: { field: string | Element; at: number } | null = null;

/** Ends the current typing burst, so the next update starts a new undo step (for example when a field loses focus). */
export function endTyping(): void {
  typing = null;
}

/** Restores the last undo (or redo) step and keeps the current project as a step the other way. */
function travel(state: AppState, direction: 'undo' | 'redo'): Partial<AppState> {
  const back = direction === 'undo';
  const step = (back ? state.past : state.future).at(-1);
  if (!step || !state.project) return {};
  typing = null;
  const current = { project: state.project, selection: state.selection };
  return {
    past: back ? state.past.slice(0, -1) : record(state.past, current),
    future: back ? [...state.future, current] : state.future.slice(0, -1),
    project: step.project,
    selection: selectionIn(step.project, step.selection),
    editLang: followEditLang(state.project, step.project, state.editLang),
    fixNotice: null,
  };
}

export const useStore = create<AppState>()((set, get) => ({
  project: null,
  selection: { kind: 'credential' },
  editLang: '',
  view: 'editor',
  brandingTheme: 'light',
  languagesOpen: false,
  tourOpen: false,
  outputTab: 'bundle',
  cardPlatform: 'ios',
  cardVariant: 'detail',
  draftSaveFailed: false,
  report: null,
  i14yReview: false,
  past: [],
  future: [],
  fixNotice: null,
  fixing: false,
  load: (project, report, options) => {
    typing = null;
    set({
      project,
      report: report && report.length ? report : null,
      i14yReview: options?.reviewI14y ?? false,
      selection: { kind: 'credential' },
      editLang: project.languages[0] ?? '',
      view: 'editor',
      brandingTheme: 'light',
      past: [],
      future: [],
      fixNotice: null,
    });
  },
  close: () => {
    typing = null;
    set({
      project: null,
      report: null,
      i14yReview: false,
      selection: { kind: 'credential' },
      languagesOpen: false,
      tourOpen: false,
      past: [],
      future: [],
      fixNotice: null,
    });
  },
  update: (recipe, options) => {
    const { project: current, selection, past } = get();
    if (!current) return;
    const next = structuredClone(current);
    recipe(next);
    const editLang = next.languages.includes(get().editLang) ? get().editLang : (next.languages[0] ?? '');
    const field = options?.field ?? focusedTextField();
    const now = Date.now();
    const merges = field !== undefined && typing?.field === field && now - typing.at < TYPING_PAUSE_MS;
    typing = field === undefined ? null : { field, at: now };
    set({
      project: next,
      editLang,
      past: merges ? past : record(past, { project: current, selection }),
      future: [],
      fixNotice: null,
    });
  },
  undo: () => set(travel(get(), 'undo')),
  redo: () => set(travel(get(), 'redo')),
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
  dismissI14yReview: () => set({ i14yReview: false }),
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
      typing = null;
      set({
        fixing: false,
        project: draft,
        editLang: followEditLang(before, draft, get().editLang),
        past: record(get().past, { project: before, selection: get().selection }),
        future: [],
        fixNotice: { kind: 'fixed', fixed, total: groups.length },
      });
    }
  },
  dismissFixNotice: () => set({ fixNotice: null }),
}));
