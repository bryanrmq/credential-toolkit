import { type StateCreator, create } from 'zustand';
import type { Baseline } from '../core/baseline';
import type { CardPlatform, CardVariant } from '../core/card/profiles';
import type { ReportNote } from '../core/import/report';
import { type LangTag, type Project, newId } from '../core/model';
import { pruneReview } from '../core/review';
import type { Fix } from '../core/validate/fixes';
import { CREDENTIAL, type Selection, type SelectionRequest, normalizeSelection, selectionIn } from './selection';
import { loadCollapsed, revealSelection, saveCollapsed, selectionOnCollapse } from './treeView';

export type { Selection, SelectionRequest } from './selection';
export type View = 'editor' | 'translations';
export type Theme = 'light' | 'dark';
export type OutputTab = 'bundle' | 'vct' | 'changes';

/**
 * What the toast reports: how many issues a fix fixed, that it failed, or that the project changed meanwhile;
 * an error of another action, such as a project file that could not be opened (`error`); or another action
 * that its Undo button takes back, such as deleting a draft from the start screen (`undoable`).
 */
export type FixNotice =
  | { kind: 'fixed'; fixed: number; total: number }
  | { kind: 'failed'; label?: string }
  | { kind: 'stale' }
  | { kind: 'error'; message: string }
  | { kind: 'undoable'; message: string; undo: () => void };

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
  /** The stored draft (`persistence.ts`) the open project belongs to; null on the start screen. */
  draftId: string | null;
  /**
   * The open draft's published baseline (`core/baseline.ts`): the bundle it was last published as, or null.
   * Stored with the draft; it is not part of the project, so undo leaves it alone.
   */
  baseline: Baseline | null;
  selection: Selection;
  /**
   * The Structure tree's collapsed groups, by node id, remembered per project. A selected node is never
   * inside one: whatever selects it (a click, undo, an issue, a new node) expands the groups around it.
   */
  collapsed: string[];
  /**
   * The text in the Structure tree's filter box: while it is not blank, the tree shows only the nodes
   * that match it and the groups around them (`filteredIds`). A selected node may then be out of sight.
   */
  treeFilter: string;
  editLang: LangTag;
  view: View;
  brandingTheme: Theme;
  languagesOpen: boolean;
  tourOpen: boolean;
  outputTab: OutputTab;
  /** Whether a wide window shows the Output pane. The workspace remembers it with the pane layout. */
  outputOpen: boolean;
  /** The platform and view the wallet preview shows; a variant the platform lacks shows its detail card (`shownVariant`). */
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
  /** Opens `project` in the workspace: as stored draft `options.draftId`, or else as a new draft; with `options.baseline`. */
  load: (project: Project, report?: ReportNote[], options?: { reviewI14y?: boolean; draftId?: string; baseline?: Baseline }) => void;
  close: () => void;
  /** Replaces the open draft's published baseline; the project stays as it is. */
  setBaseline: (baseline: Baseline | null) => void;
  /**
   * Applies `recipe` to a copy of the project, so every change produces a new object, and records the
   * project before it as an undo step. Updates typed in the same `field` (by default the focused text
   * field) merge into one step until the field loses focus or typing pauses for `TYPING_PAUSE_MS`.
   * A suggested text whose text changed loses its "needs review" mark in the same step (`pruneReview`).
   */
  update: (recipe: (draft: Project) => void, options?: { field?: string | Element }) => void;
  undo: () => void;
  redo: () => void;
  /** Selects the credential, one node, or several nodes (`ids`) with `id` as the primary. */
  select: (selection: SelectionRequest) => void;
  /** Expands or collapses group node `id`. Collapsing it moves the selected nodes inside it to the group itself. */
  setGroupOpen: (id: string, open: boolean) => void;
  setEditLang: (lang: LangTag) => void;
  setTreeFilter: (text: string) => void;
  setView: (view: View) => void;
  setBrandingTheme: (theme: Theme) => void;
  setLanguagesOpen: (open: boolean) => void;
  setTourOpen: (open: boolean) => void;
  setOutputTab: (tab: OutputTab) => void;
  setOutputOpen: (open: boolean) => void;
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
  /** Shows `message` in the error toast. */
  showError: (message: string) => void;
  /** Shows `message` in the toast with an Undo button that runs `undo`. */
  showUndoable: (message: string, undo: () => void) => void;
}

/** The language to keep editing after `before` became `after`: the same tag, else the tag now at its place (a rename), else the first. */
function followEditLang(before: Project, after: Project, lang: LangTag): LangTag {
  if (after.languages.includes(lang)) return lang;
  return after.languages[before.languages.indexOf(lang)] ?? after.languages[0] ?? '';
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

/** Makes every change of the store also expand, in the same change, the groups that would hide a selected node. */
function revealingSelection(config: StateCreator<AppState>): StateCreator<AppState> {
  return (set, get, api) =>
    config(
      (partial) =>
        set((state) => {
          const change = typeof partial === 'function' ? partial(state) : partial;
          const { project, selection, collapsed } = { ...state, ...change };
          const revealed = project ? revealSelection(project, selection, collapsed) : collapsed;
          return revealed === collapsed ? change : { ...change, collapsed: revealed };
        }),
      get,
      api,
    );
}

export const useStore = create<AppState>()(revealingSelection((set, get) => ({
  project: null,
  draftId: null,
  baseline: null,
  selection: CREDENTIAL,
  collapsed: [],
  treeFilter: '',
  editLang: '',
  view: 'editor',
  brandingTheme: 'light',
  languagesOpen: false,
  tourOpen: false,
  outputTab: 'bundle',
  outputOpen: true,
  cardPlatform: 'ios',
  cardVariant: 'detail',
  draftSaveFailed: false,
  report: null,
  i14yReview: false,
  past: [],
  future: [],
  fixNotice: null,
  fixing: false,
  load: (opened, report, options) => {
    typing = null;
    const project = pruneReview(opened);
    set({
      project,
      draftId: options?.draftId ?? newId(),
      baseline: options?.baseline ?? null,
      report: report && report.length ? report : null,
      i14yReview: options?.reviewI14y ?? false,
      selection: CREDENTIAL,
      collapsed: loadCollapsed(project),
      treeFilter: '',
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
      draftId: null,
      baseline: null,
      report: null,
      i14yReview: false,
      selection: CREDENTIAL,
      collapsed: [],
      treeFilter: '',
      languagesOpen: false,
      tourOpen: false,
      past: [],
      future: [],
      fixNotice: null,
    });
  },
  setBaseline: (baseline) => {
    if (get().project) set({ baseline });
  },
  update: (recipe, options) => {
    const { project: current, selection, past } = get();
    if (!current) return;
    const draft = structuredClone(current);
    recipe(draft);
    const next = pruneReview(draft);
    const editLang = next.languages.includes(get().editLang) ? get().editLang : (next.languages[0] ?? '');
    const field = options?.field ?? focusedTextField();
    const now = Date.now();
    const merges = field !== undefined && typing?.field === field && now - typing.at < TYPING_PAUSE_MS;
    typing = field === undefined ? null : { field, at: now };
    set({
      project: next,
      selection: selectionIn(next, selection),
      editLang,
      past: merges ? past : record(past, { project: current, selection }),
      future: [],
      fixNotice: null,
    });
  },
  undo: () => set(travel(get(), 'undo')),
  redo: () => set(travel(get(), 'redo')),
  select: (selection) => set({ selection: normalizeSelection(get().project, selection) }),
  setGroupOpen: (id, open) => {
    const { project, selection, collapsed } = get();
    if (!project || collapsed.includes(id) !== open) return;
    if (open) {
      set({ collapsed: collapsed.filter((groupId) => groupId !== id) });
      return;
    }
    const moved = selectionOnCollapse(project, selection, id);
    set({ collapsed: [...collapsed, id], ...(moved && { selection: normalizeSelection(project, moved) }) });
  },
  setEditLang: (editLang) => set({ editLang }),
  setTreeFilter: (treeFilter) => set({ treeFilter }),
  setView: (view) => set({ view }),
  setBrandingTheme: (brandingTheme) => set({ brandingTheme }),
  setLanguagesOpen: (languagesOpen) => set({ languagesOpen }),
  setTourOpen: (tourOpen) => set({ tourOpen }),
  setOutputTab: (outputTab) => set({ outputTab }),
  setOutputOpen: (outputOpen) => set({ outputOpen }),
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
    let draft = structuredClone(before);
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
    draft = pruneReview(draft);
    if (get().project !== before) {
      set({ fixing: false, fixNotice: { kind: 'stale' } });
    } else if (fixed === 0) {
      set({ fixing: false, fixNotice: { kind: 'failed', label: groups.length === 1 ? groups[0][0]?.label : undefined } });
    } else {
      typing = null;
      set({
        fixing: false,
        project: draft,
        selection: selectionIn(draft, get().selection),
        editLang: followEditLang(before, draft, get().editLang),
        past: record(get().past, { project: before, selection: get().selection }),
        future: [],
        fixNotice: { kind: 'fixed', fixed, total: groups.length },
      });
    }
  },
  dismissFixNotice: () => set({ fixNotice: null }),
  showError: (message) => set({ fixNotice: { kind: 'error', message } }),
  showUndoable: (message, undo) => set({ fixNotice: { kind: 'undoable', message, undo } }),
})));

// The project's collapsed groups are saved whenever they change, however they changed.
useStore.subscribe((state, previous) => {
  if (state.project && state.collapsed !== previous.collapsed) saveCollapsed(state.project, state.collapsed);
});
