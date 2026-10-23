// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type LangTag, emptyProject, newAttribute } from '../../core/model';
import { reviewMarks, textAt } from '../../core/review';
import { useStore } from '../../state/store';
import { availableCommands, runCommand } from '../lib/commands';
import { TOUR_SEEN_KEY } from '../lib/tour';
import { missingTexts, translateMissing, useDownloadNotice } from '../lib/translate';
import { Inspector } from './Inspector';
import { Workspace } from './Workspace';

/**
 * De, fr and en, edited in German. Missing from German: the French description and label, the English name and
 * description. The French name and the English label are there already; `age` has no German label to start from.
 */
function loadProject(languages: LangTag[] = ['de-CH', 'fr-CH', 'en-GB']) {
  const project = emptyProject(languages);
  project.meta['de-CH'] = { name: 'Hundebewilligung', description: 'Für Hundehalter' };
  project.meta['fr-CH'] = { name: 'Permis pour chiens', description: '' };
  project.root.children.push(newAttribute('name', { source: ['name'], labels: { 'de-CH': 'Name', 'en-GB': 'Name' } }));
  project.root.children.push(newAttribute('age', { source: ['age'], labels: {} }));
  project.hosting = { mode: 'dataUrl' };
  useStore.getState().load(project);
}

type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable';

/**
 * A browser Translator that "translates" by prefixing the target language (`fr:Name`). `downloads` holds the
 * create calls of the pairs that download a model, each waiting until the test releases it.
 */
function mockTranslator(availability: Record<string, Availability> = {}) {
  const downloads: { progress: (loaded: number) => void; release: () => void }[] = [];
  const translate = vi.fn(async (text: string, target: string) => `${target}:${text}`);
  const api = {
    availability: vi.fn(async ({ targetLanguage }: { targetLanguage: string }) => availability[targetLanguage] ?? 'available'),
    create: vi.fn(async ({ targetLanguage, monitor }: { targetLanguage: string; monitor?: (target: EventTarget) => void }) => {
      const events = new EventTarget();
      monitor?.(events);
      if (availability[targetLanguage] === 'downloadable' || availability[targetLanguage] === 'downloading') {
        await new Promise<void>((release) =>
          downloads.push({ progress: (loaded) => events.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded })), release }),
        );
      }
      return { translate: (text: string) => translate(text, targetLanguage), destroy: vi.fn() };
    }),
  };
  vi.stubGlobal('Translator', api);
  return { api, translate, downloads };
}

const project = () => useStore.getState().project!;
const nameNode = () => project().root.children[0];
const ageNode = () => project().root.children[1];
const label = (lang: LangTag, node = nameNode()) => textAt(project(), { kind: 'label', nodeId: node.id }, lang);
const meta = (lang: LangTag) => project().meta[lang];
const marked = () => reviewMarks(project()).map((mark) => `${mark.place.kind} ${mark.lang} ${mark.source}`);
const languageRow = (input: HTMLElement) => input.closest<HTMLElement>('.lang-row')!;
const toast = () => document.querySelector('.toast');
const commandIds = () => availableCommands().map((entry) => entry.id);
const fetchSpy = vi.fn();

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOUR_SEEN_KEY, '1');
  useDownloadNotice.setState({ notice: null });
  loadProject();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchSpy.mockClear();
});

describe('feature detection', () => {
  it('shows no translation action where the browser has no Translator API', async () => {
    vi.stubGlobal('Translator', undefined);
    const user = userEvent.setup();
    useStore.getState().select({ kind: 'node', id: nameNode().id });
    render(<Workspace />);
    expect(screen.queryByRole('button', { name: /^Suggest/ })).not.toBeInTheDocument();
    expect(commandIds()).not.toContain('workspace.translateMissing');
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.queryByRole('menuitem', { name: 'Translate missing languages' })).not.toBeInTheDocument();
  });

  it('shows them where it has one', async () => {
    mockTranslator();
    const user = userEvent.setup();
    useStore.getState().select({ kind: 'node', id: nameNode().id });
    render(<Workspace />);
    expect(screen.getByRole('button', { name: 'Suggest the Label (fr-CH) from de-CH' })).toHaveTextContent('Suggest from de-CH');
    expect(commandIds()).toContain('workspace.translateMissing');
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menuitem', { name: 'Translate missing languages' })).toBeInTheDocument();
  });
});

describe('Suggest from the editing language, on one row', () => {
  it('shows only on empty rows whose German text is not empty', () => {
    mockTranslator();
    useStore.getState().select({ kind: 'node', id: nameNode().id });
    const { unmount } = render(<Inspector />);
    expect(within(languageRow(screen.getByLabelText('Label'))).queryByRole('button', { name: /^Suggest/ })).not.toBeInTheDocument();
    expect(within(languageRow(screen.getByLabelText('Label (en-GB)'))).queryByRole('button', { name: /^Suggest/ })).not.toBeInTheDocument();
    unmount();
    // No German label to translate from.
    useStore.getState().select({ kind: 'node', id: ageNode().id });
    render(<Inspector />);
    expect(screen.queryByRole('button', { name: /^Suggest the Label/ })).not.toBeInTheDocument();
  });

  it('fills that row only, marked "Translated · review", as one undo step', async () => {
    const { translate } = mockTranslator();
    const user = userEvent.setup();
    useStore.getState().select({ kind: 'node', id: nameNode().id });
    render(<Workspace />);
    const steps = useStore.getState().past.length;
    await user.click(screen.getByRole('button', { name: 'Suggest the Label (fr-CH) from de-CH' }));
    await waitFor(() => expect(label('fr-CH')).toBe('fr:Name'));
    expect(translate).toHaveBeenCalledTimes(1);
    expect(marked()).toEqual(['label fr-CH translation']);
    expect(languageRow(screen.getByLabelText('Label (fr-CH)'))).toHaveAttribute('data-review', 'translation');
    expect(meta('fr-CH').description).toBe('');
    expect(useStore.getState().past).toHaveLength(steps + 1);
    expect(toast()).toHaveTextContent('Translated 1 text, marked for review');

    await user.click(within(toast() as HTMLElement).getByRole('button', { name: 'Undo' }));
    expect(label('fr-CH')).toBe('');
    expect(marked()).toEqual([]);
  });
});

describe('Translate missing languages', () => {
  it('fills every empty text from German, never overwriting one, marks them and reports it with Undo, as one undo step', async () => {
    mockTranslator();
    const user = userEvent.setup();
    render(<Workspace />);
    const steps = useStore.getState().past.length;
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Translate missing languages' }));
    await waitFor(() => expect(toast()).toHaveTextContent('Translated 4 texts, marked for review'));

    expect(meta('fr-CH')).toEqual({ name: 'Permis pour chiens', description: 'fr:Für Hundehalter' });
    expect(meta('en-GB')).toEqual({ name: 'en:Hundebewilligung', description: 'en:Für Hundehalter' });
    expect(label('fr-CH')).toBe('fr:Name');
    expect(label('en-GB')).toBe('Name');
    expect(label('fr-CH', ageNode())).toBe('');
    expect(marked().sort()).toEqual(['label fr-CH translation', 'meta en-GB translation', 'meta en-GB translation', 'meta fr-CH translation']);
    expect(useStore.getState().past).toHaveLength(steps + 1);

    await user.click(within(toast() as HTMLElement).getByRole('button', { name: 'Undo' }));
    expect(meta('en-GB')).toEqual({ name: '', description: '' });
    expect(label('fr-CH')).toBe('');
    expect(marked()).toEqual([]);
    expect(useStore.getState().past).toHaveLength(steps);
  });

  it('runs from the command list, which offers it only while some text can be filled', async () => {
    mockTranslator();
    render(<Workspace />);
    expect(commandIds()).toContain('workspace.translateMissing');
    act(() => runCommand('workspace.translateMissing'));
    await waitFor(() => expect(label('fr-CH')).toBe('fr:Name'));
    expect(commandIds()).not.toContain('workspace.translateMissing');
  });

  it('is not offered with a single language', () => {
    mockTranslator();
    loadProject(['de-CH']);
    render(<Workspace />);
    expect(commandIds()).not.toContain('workspace.translateMissing');
  });

  it('keeps template expressions as they are, translating only the words around them', async () => {
    const { translate } = mockTranslator();
    act(() =>
      useStore.getState().update((draft) => {
        draft.branding['de-CH'] = { light: { primaryField: 'Halter {{name}}' } };
      }),
    );
    await translateMissing({ place: { kind: 'primaryField', theme: 'light' }, lang: 'fr-CH' });
    expect(textAt(project(), { kind: 'primaryField', theme: 'light' }, 'fr-CH')).toBe('fr:Halter {{name}}');
    expect(translate).toHaveBeenCalledWith('Halter', 'fr');
  });

  it('leaves a text typed while the translation ran', async () => {
    let finish!: () => void;
    const api = {
      availability: async () => 'available' as const,
      create: async () => ({
        translate: async (text: string) => {
          await new Promise<void>((resolve) => (finish = resolve));
          return `fr:${text}`;
        },
        destroy: () => {},
      }),
    };
    const running = translateMissing({ place: { kind: 'label', nodeId: nameNode().id }, lang: 'fr-CH' }, api);
    await waitFor(() => expect(finish).toBeDefined());
    useStore.getState().update((draft) => void (draft.root.children[0].labels['fr-CH'] = 'Nom'));
    finish();
    await running;
    expect(label('fr-CH')).toBe('Nom');
    expect(marked()).toEqual([]);
  });

  it('sends nothing over the network', async () => {
    mockTranslator();
    await translateMissing();
    expect(label('fr-CH')).toBe('fr:Name');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('the model download notice', () => {
  it('asks before the browser downloads a model; Cancel does nothing', async () => {
    const { api, translate } = mockTranslator({ fr: 'downloadable' });
    const user = userEvent.setup();
    render(<Workspace />);
    const steps = useStore.getState().past.length;
    act(() => runCommand('workspace.translateMissing'));
    const dialog = await screen.findByRole('dialog', { name: 'Download a translation model?' });
    expect(dialog).toHaveTextContent(
      'Your browser will download a translation model for German to French once. The text never leaves this device.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(commandIds()).toContain('workspace.translateMissing'));
    // Not even the English texts, which needed no download.
    expect(api.create).not.toHaveBeenCalled();
    expect(translate).not.toHaveBeenCalled();
    expect(meta('en-GB').name).toBe('');
    expect(useStore.getState().past).toHaveLength(steps);
    expect(toast()).toBeNull();
  });

  it('shows the download progress in the toast, then translates', async () => {
    const { downloads } = mockTranslator({ fr: 'downloadable' });
    const user = userEvent.setup();
    render(<Workspace />);
    act(() => runCommand('workspace.translateMissing'));
    await user.click(await screen.findByRole('button', { name: 'Download and translate' }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(toast()).toHaveTextContent('Downloading the translation model… 0%');
    act(() => downloads[0].progress(0.4));
    expect(toast()).toHaveTextContent('Downloading the translation model… 40%');
    act(() => downloads[0].release());
    await waitFor(() => expect(toast()).toHaveTextContent('Translated 4 texts, marked for review'));
    expect(label('fr-CH')).toBe('fr:Name');
  });

  it('names every pair to download', async () => {
    mockTranslator({ fr: 'downloadable', en: 'downloadable' });
    render(<Workspace />);
    act(() => runCommand('workspace.translateMissing'));
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'Your browser will download translation models for German to French and German to English once.',
    );
  });

  it('is not shown for a model already downloading or downloaded', async () => {
    const { downloads } = mockTranslator({ fr: 'downloading' });
    render(<Workspace />);
    act(() => runCommand('workspace.translateMissing'));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => downloads[0].release());
    await waitFor(() => expect(label('fr-CH')).toBe('fr:Name'));
  });
});

describe('unsupported pairs', () => {
  it('are skipped, with a note in the toast', async () => {
    mockTranslator({ rm: 'unavailable' });
    loadProject(['de-CH', 'fr-CH', 'rm-CH']);
    render(<Workspace />);
    act(() => runCommand('workspace.translateMissing'));
    await waitFor(() =>
      expect(toast()).toHaveTextContent("Translated 2 texts, marked for review. Romansh isn't available in this browser's translator"),
    );
    expect(label('fr-CH')).toBe('fr:Name');
    expect(label('rm-CH')).toBe('');
    expect(meta('rm-CH')?.name ?? '').toBe('');
  });

  it('say so when nothing could be translated', async () => {
    mockTranslator({ rm: 'unavailable' });
    loadProject(['de-CH', 'rm-CH']);
    useStore.getState().select({ kind: 'node', id: nameNode().id });
    const user = userEvent.setup();
    render(<Workspace />);
    const steps = useStore.getState().past.length;
    await user.click(screen.getByRole('button', { name: 'Suggest the Label (rm-CH) from de-CH' }));
    await waitFor(() => expect(toast()).toHaveTextContent("Romansh isn't available in this browser's translator"));
    expect(within(toast() as HTMLElement).queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    expect(useStore.getState().past).toHaveLength(steps);
  });
});

describe('missingTexts', () => {
  it('lists the empty texts whose editing-language text is not empty', () => {
    const missing = missingTexts(project(), 'de-CH').map(({ place, lang }) => `${place.kind} ${lang}`);
    expect(missing).toEqual(['meta en-GB', 'meta fr-CH', 'meta en-GB', 'label fr-CH']);
    expect(missingTexts(project(), 'de-CH', { lang: 'fr-CH' })).toHaveLength(2);
    expect(missingTexts(project(), 'it-CH')).toEqual([]);
  });
});
