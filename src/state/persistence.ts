import type { Project } from '../core/model';
import { isPlainObject } from '../core/import/report';

export const DRAFT_KEY = 'oca-generator:draft';
const AUTOSAVE_DELAY_MS = 500;

function isProject(value: unknown): value is Project {
  return (
    isPlainObject(value) &&
    value.version === 1 &&
    Array.isArray(value.languages) &&
    isPlainObject(value.root) &&
    Array.isArray(value.root.children) &&
    isPlainObject(value.meta) &&
    isPlainObject(value.branding)
  );
}

export function storageAvailable(): boolean {
  try {
    const probe = `${DRAFT_KEY}:probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function loadDraft(): Project | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isProject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** The stored draft exactly as saved, for the crash screen's "Download draft". */
export function rawDraft(): string | null {
  try {
    return localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
}

export function saveDraft(project: Project | null): boolean {
  try {
    if (project) localStorage.setItem(DRAFT_KEY, JSON.stringify(project));
    else localStorage.removeItem(DRAFT_KEY);
    return true;
  } catch {
    return false;
  }
}

type Subscribe = (listener: (state: { project: Project | null }, previous: { project: Project | null }) => void) => () => void;

/**
 * Saves the project shortly after it stops changing and reports whether saving worked
 * (it fails when big logos exceed the browser's storage quota). Returns the unsubscribe function.
 */
export function startAutosave(subscribe: Subscribe, onSaved: (ok: boolean) => void = () => {}): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = subscribe((state, previous) => {
    if (state.project === previous.project) return;
    clearTimeout(timer);
    const project = state.project;
    timer = setTimeout(() => onSaved(saveDraft(project)), AUTOSAVE_DELAY_MS);
  });
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}
