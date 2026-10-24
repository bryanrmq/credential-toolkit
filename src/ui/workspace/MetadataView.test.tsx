// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { VCT_INTEGRITY_PLACEHOLDER } from '../../core/export/issuerMetadata';
import { exportProject } from '../../core/export/project';
import { emptyProject, ensureIssuer, newAttribute } from '../../core/model';
import { reviewMarks, suggestText } from '../../core/review';
import { useStore } from '../../state/store';
import { pngDataUrl } from '../../test/images';
import { TOUR_SEEN_KEY } from '../lib/tour';
import { Inspector } from './Inspector';
import { MetadataView } from './MetadataView';
import { Workspace } from './Workspace';

/** De and fr, named "Lernfahrausweis" in German; no issuer settings yet. */
function loadProject() {
  const project = emptyProject(['de-CH', 'fr-CH']);
  project.meta['de-CH'] = { name: 'Lernfahrausweis', description: 'Für Lernende' };
  project.meta['fr-CH'] = { name: 'Permis d’élève', description: 'Pour les élèves' };
  project.root.children.push(newAttribute('name', { source: ['name'], labels: { 'de-CH': 'Name', 'fr-CH': 'Nom' } }));
  project.hosting = { mode: 'dataUrl' };
  useStore.getState().load(project);
}

const project = () => useStore.getState().project!;
const issuer = () => project().issuer!;
const page = () => screen.getByRole('region', { name: 'Metadata' });
const field = (label: string | RegExp) => within(page()).getByText(label, { selector: 'label' }).closest<HTMLElement>('.field')!;
const areaTabs = () => within(screen.getByRole('tablist', { name: 'File' }));
/** The page on its own, without the files built: the tests here are about the form and the preview. */
const working = { status: 'working' } as const;
const issuesPanel = () => screen.getByRole('region', { name: 'Issues' });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOUR_SEEN_KEY, '1');
  loadProject();
});

describe('OCA / Metadata switch', () => {
  it('opens on the OCA and switches to the Metadata page, which hides Editor and Translations', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    expect(areaTabs().getByRole('tab', { name: 'OCA' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('group', { name: 'View' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Metadata' })).not.toBeInTheDocument();

    await user.click(areaTabs().getByRole('tab', { name: 'Metadata' }));
    expect(useStore.getState().area).toBe('metadata');
    expect(page()).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'View' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Structure' })).not.toBeInTheDocument();
    // The Issues panel stays docked under the page.
    expect(issuesPanel()).toBeInTheDocument();

    await user.click(areaTabs().getByRole('tab', { name: 'OCA' }));
    expect(screen.getByRole('group', { name: 'View' })).toBeInTheDocument();
  });

  it('comes back to the OCA view that was open, and the narrow select switches too', async () => {
    useStore.getState().setView('translations');
    const user = userEvent.setup();
    render(<Workspace />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'File' }), 'metadata');
    expect(useStore.getState().area).toBe('metadata');
    await user.selectOptions(screen.getByRole('combobox', { name: 'File' }), 'oca');
    expect(useStore.getState()).toMatchObject({ area: 'oca', view: 'translations' });
  });

  it('leaves the issuer settings out of the credential editor', () => {
    render(<Inspector />);
    expect(screen.queryByLabelText('Issuer name')).not.toBeInTheDocument();
    expect([...document.querySelectorAll('.section__title')].map((title) => title.textContent)).toEqual(['Branding']);
  });
});

describe('Metadata page', () => {
  it('holds the Issuer and Identifiers sections and the details preview', () => {
    render(<MetadataView exportState={working} />);
    expect([...page().querySelectorAll('.section__title')].map((title) => title.textContent)).toEqual(['Issuer', 'Identifiers']);
    expect(within(page()).getByText(/^Settings for the Issuer Metadata and the Type Metadata/)).toHaveClass('section__intro');
    expect(within(page()).getAllByText(/./, { selector: 'label.field__label' }).map((label) => label.textContent)).toEqual([
      'Issuer name',
      'Issuer logo',
      'Issuer URL optional',
      'Configuration id',
      'Type key',
    ]);
    const preview = screen.getByRole('region', { name: 'Preview' });
    expect(within(preview).getByRole('group', { name: 'Preview platform' })).toBeInTheDocument();
    expect(preview.querySelector('.output-preview')).toHaveAttribute('data-view', 'details');
  });

  it('lists the issuer name per language, editing language first, empty ones highlighted', async () => {
    useStore.getState().setEditLang('fr-CH');
    const user = userEvent.setup();
    render(<MetadataView exportState={working} />);
    const rows = [...field('Issuer name').querySelectorAll<HTMLElement>('.lang-row')];
    expect(rows.map((row) => row.querySelector('.lang-row__code')!.textContent)).toEqual(['fr-CH', 'de-CH']);
    expect(rows[0]).toHaveAttribute('data-editing');
    const french = screen.getByLabelText('Issuer name');
    const german = screen.getByLabelText('Issuer name (de-CH)');
    expect(french).toHaveAttribute('data-empty');
    expect(german).toHaveAttribute('data-empty');

    await user.type(german, 'Kanton Bern');
    expect(issuer().name['de-CH']).toBe('Kanton Bern');
    expect(german).not.toHaveAttribute('data-empty');
    expect(french).toHaveAttribute('data-empty');
  });

  it('shows the needs-review marker on a suggested issuer name and clears it on edit', async () => {
    const draft = structuredClone(project());
    ensureIssuer(draft).name['de-CH'] = 'Kanton Bern';
    suggestText(draft, { kind: 'issuerName' }, 'fr-CH', 'Canton de Berne', 'translation');
    useStore.getState().load(draft);
    const user = userEvent.setup();
    render(<MetadataView exportState={working} />);
    const french = screen.getByLabelText('Issuer name (fr-CH)');
    const row = french.closest<HTMLElement>('.lang-row')!;
    expect(row).toHaveAttribute('data-review', 'translation');
    expect(within(row).getByRole('button', { name: 'Confirm the suggested Issuer name (fr-CH)' })).toBeInTheDocument();

    await user.type(french, '!');
    expect(row).not.toHaveAttribute('data-review');
    expect(reviewMarks(project())).toEqual([]);
  });

  it('stores a PNG or JPEG logo as a data URL and rejects other files', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<MetadataView exportState={working} />);
    const input = field('Issuer logo').querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input).toHaveAttribute('accept', 'image/png,image/jpeg');
    expect(within(field('Issuer logo')).getByText(/^PNG or JPEG, one logo for all languages\./)).toBeInTheDocument();

    await user.upload(input, new File(['GIF89a'], 'logo.gif', { type: 'image/gif' }));
    expect(within(field('Issuer logo')).getByText('Only PNG and JPEG files are supported.')).toHaveClass('error-text');
    expect(project().issuer?.logo).toBeUndefined();

    await user.upload(input, new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'logo.png', { type: 'image/png' }));
    await waitFor(() => expect(issuer().logo).toMatch(/^data:image\/png;base64,/));
    expect(within(field('Issuer logo')).queryByText('Only PNG and JPEG files are supported.')).not.toBeInTheDocument();

    await user.upload(input, new File([new Uint8Array([0xff, 0xd8, 0xff])], 'logo.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(issuer().logo).toMatch(/^data:image\/jpeg;base64,/));
    // The branding logo is a separate field and stays empty.
    expect(project().branding['de-CH'].light.logo).toBeUndefined();
  });

  it('shows an error for an Issuer URL that is not https, and none when it is empty', async () => {
    useStore.getState().setArea('metadata');
    const user = userEvent.setup();
    render(<Workspace />);
    const url = screen.getByLabelText(/^Issuer URL/);
    expect(url).toHaveAttribute('placeholder', 'https://issuer.example.ch');
    expect(url).toHaveClass('input--mono');
    expect(within(field(/^Issuer URL/)).queryByText(/must be an https URL/)).not.toBeInTheDocument();

    await user.type(url, 'http://issuer.example.ch');
    expect(issuer().url).toBe('http://issuer.example.ch');
    expect(within(field(/^Issuer URL/)).getByText('The Issuer URL must be an https URL such as https://issuer.example.ch.')).toBeInTheDocument();

    await user.clear(url);
    expect(issuer().url).toBeUndefined();
    expect(within(field(/^Issuer URL/)).queryByText(/must be an https URL/)).not.toBeInTheDocument();
  });

  it('shows the defaults from the credential name in empty identifiers and the Type Metadata path', async () => {
    const user = userEvent.setup();
    render(<MetadataView exportState={working} />);
    const configurationId = screen.getByLabelText('Configuration id');
    const typeKey = screen.getByLabelText('Type key');
    expect(configurationId).toHaveValue('');
    expect(configurationId).toHaveAttribute('placeholder', 'lernfahrausweis_sd_jwt');
    expect(typeKey).toHaveAttribute('placeholder', 'lernfahrausweis-v01');
    expect(within(field('Type key')).getByText('…/oid4vci/vct/lernfahrausweis-v01').tagName).toBe('CODE');
    expect(configurationId.closest('.issuer-identifiers')).toContainElement(typeKey);

    await user.type(typeKey, 'lfa-v02');
    expect(issuer().typeKey).toBe('lfa-v02');
    expect(within(field('Type key')).getByText('…/oid4vci/vct/lfa-v02')).toBeInTheDocument();

    await user.clear(typeKey);
    expect(issuer().typeKey).toBeUndefined();
    expect(within(field('Type key')).getByText('…/oid4vci/vct/lernfahrausweis-v01')).toBeInTheDocument();
  });

  it('shows an error on an identifier that is not lower-case letters, digits, _ and -', async () => {
    useStore.getState().setArea('metadata');
    const user = userEvent.setup();
    render(<Workspace />);
    await user.type(screen.getByLabelText('Configuration id'), 'Lernfahrausweis SD');
    expect(within(field('Configuration id')).getByText('The Configuration id may only contain lower-case letters, digits, _ and -.')).toBeInTheDocument();
    expect(within(field('Type key')).queryByText(/may only contain/)).not.toBeInTheDocument();
  });
});

describe('Issuer issues in the Issues panel', () => {
  /** A project with every issuer issue: no French name, a GIF logo, an http URL and two invalid identifiers. */
  function loadBroken() {
    const draft = structuredClone(project());
    const settings = ensureIssuer(draft);
    settings.name['de-CH'] = 'Kanton Bern';
    settings.logo = 'data:image/gif;base64,R0lGODlh';
    settings.url = 'http://issuer.example.ch';
    settings.configurationId = 'Lernfahrausweis';
    settings.typeKey = 'v 1';
    useStore.getState().load(draft);
  }

  const cases: Array<[RegExp, () => HTMLElement]> = [
    [/^The issuer name is missing\./, () => screen.getByLabelText('Issuer name')],
    [/^The issuer logo must be a PNG or JPEG data URL\./, () => screen.getByRole('button', { name: 'Issuer logo' })],
    [/^The Issuer URL must be an https URL/, () => screen.getByLabelText(/^Issuer URL/)],
    [/^The Configuration id may only contain/, () => screen.getByLabelText('Configuration id')],
    [/^The Type key may only contain/, () => screen.getByLabelText('Type key')],
  ];

  it.each(cases)('switches to the Metadata page and focuses the field of "%s"', async (summary, target) => {
    loadBroken();
    const nodeId = project().root.children[0].id;
    useStore.getState().select({ kind: 'node', id: nodeId });
    useStore.getState().setView('translations');
    const user = userEvent.setup();
    render(<Workspace />);

    await user.click(within(issuesPanel()).getByRole('button', { name: summary }));
    expect(useStore.getState().area).toBe('metadata');
    await waitFor(() => expect(target()).toHaveFocus());
    // The OCA keeps its view and selection for when the user switches back.
    expect(useStore.getState()).toMatchObject({ view: 'translations', selection: { kind: 'node', id: nodeId } });
  });

  it('jumps to the issuer name in the language that misses it', async () => {
    loadBroken();
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(within(issuesPanel()).getByRole('button', { name: /^The issuer name is missing\./ }));
    expect(useStore.getState().editLang).toBe('fr-CH');
  });

  it('places the issuer issues under Metadata, and an OCA issue switches back to the editor', async () => {
    loadBroken();
    const draft = structuredClone(project());
    draft.root.children.push(newAttribute('broken', { source: [], labels: { 'de-CH': 'Kaputt', 'fr-CH': 'Cassé' } }));
    useStore.getState().load(draft);
    useStore.getState().setArea('metadata');
    const user = userEvent.setup();
    render(<Workspace />);
    const row = (summary: RegExp) => within(issuesPanel()).getByRole('button', { name: summary }).closest('li')!;
    expect(row(/^The Type key may only contain/)).toHaveTextContent('Metadata');

    await user.click(within(issuesPanel()).getByRole('button', { name: /"broken" has no source path/ }));
    expect(useStore.getState()).toMatchObject({ area: 'oca', view: 'editor' });
    expect(screen.getByLabelText('Key')).toHaveValue('broken');
  });

  it('counts the issuer issues with the others, but leaves the bundle download open', async () => {
    loadBroken();
    render(<Workspace />);
    expect(within(issuesPanel()).getByText('4 errors')).toBeInTheDocument();
    expect(within(issuesPanel()).getByText('1 warning')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download bundle' })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Download bundle' })).not.toHaveAttribute('title');
    expect(screen.getByRole('button', { name: 'oca-bundle.json' })).toBeEnabled();
  });
});

describe('Type metadata and Issuer metadata tabs', () => {
  const column = () => document.querySelector<HTMLElement>('.metadata__preview')!;
  const fileTabs = () => within(screen.getByRole('tablist', { name: 'Preview and files' }));
  /** What the core gives for the project as it is now. */
  const exported = async () => {
    const result = await exportProject(project());
    if (!result.ok) throw new Error('the test project has errors');
    return result;
  };
  const shownText = () => column().querySelector('pre')!.textContent;

  beforeEach(() => useStore.setState({ area: 'metadata', metadataTab: 'preview' }));

  it('puts the files beside the preview, Preview first', () => {
    render(<Workspace />);
    expect(fileTabs().getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Preview', 'Type metadata', 'Issuer metadata']);
    expect(fileTabs().getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'Preview' }).querySelector('.output-preview')).toBeInTheDocument();
  });

  it('shows vct.json as the core builds it, with its download and placeholders', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(fileTabs().getByRole('tab', { name: 'Type metadata' }));
    expect(useStore.getState().metadataTab).toBe('vct');
    const region = within(screen.getByRole('region', { name: 'Type metadata' }));
    expect(await region.findByRole('button', { name: 'vct.json' })).toBeEnabled();
    expect(shownText()).toBe((await exported()).vct.text);
    expect(region.queryByRole('group', { name: 'Preview platform' })).not.toBeInTheDocument();
    const list = within(region.getByRole('region', { name: 'Replace before use' }));
    expect(list.getAllByRole('listitem').map((row) => row.querySelector('code')!.textContent)).toEqual(['${external-url}']);
    expect(region.queryByRole('region', { name: 'After deploying, compute the integrity' })).not.toBeInTheDocument();
  });

  it('opens Type metadata when the stored tab is vct', async () => {
    useStore.setState({ metadataTab: 'vct' });
    render(<Workspace />);
    expect(fileTabs().getByRole('tab', { name: 'Type metadata' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('button', { name: 'vct.json' })).toBeInTheDocument();
  });

  it('shows the integrity command until the Issuer URL is set, then the integrity in the file', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(fileTabs().getByRole('tab', { name: 'Issuer metadata' }));
    const region = () => within(screen.getByRole('region', { name: 'Issuer metadata' }));
    expect(await region().findByRole('button', { name: 'issuer_metadata.json' })).toBeInTheDocument();
    expect(shownText()).toBe((await exported()).issuerMetadata.json);
    expect(region().getByRole('region', { name: 'After deploying, compute the integrity' })).toHaveTextContent("curl -s '${external-url}/oid4vci/vct/");
    expect(within(region().getByRole('region', { name: 'Replace before use' })).getByText('2')).toHaveClass('badge--yellow');

    await user.type(screen.getByLabelText(/^Issuer URL/), 'https://issuer.example.ch');
    await waitFor(() => expect(region().queryByRole('region', { name: 'After deploying, compute the integrity' })).not.toBeInTheDocument());
    const { issuerMetadata } = await exported();
    expect(issuerMetadata.json).not.toContain(VCT_INTEGRITY_PLACEHOLDER);
    expect(shownText()).toBe(issuerMetadata.json);
    expect(within(region().getByRole('region', { name: 'Replace before use' })).getAllByRole('listitem')).toHaveLength(1);
  });

  it('blocks the downloads while the project has an error, issuer ones included', async () => {
    act(() => useStore.getState().update((draft) => void (ensureIssuer(draft).url = 'http://issuer.example.ch')));
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(fileTabs().getByRole('tab', { name: 'Issuer metadata' }));
    const download = await screen.findByRole('button', { name: 'issuer_metadata.json' });
    expect(download).toBeDisabled();
    expect(download).toHaveAttribute('title', 'Fix 1 error to download');
    await user.click(fileTabs().getByRole('tab', { name: 'Type metadata' }));
    expect(await screen.findByRole('button', { name: 'vct.json' })).toBeDisabled();
  });
});

describe('undo and redo', () => {
  it('takes back and redoes each Metadata field edit', async () => {
    const user = userEvent.setup();
    render(<MetadataView exportState={working} />);
    const { undo, redo } = useStore.getState();

    await user.type(screen.getByLabelText('Issuer name'), 'Kanton Bern');
    fireEvent.blur(screen.getByLabelText('Issuer name'));
    await user.type(screen.getByLabelText(/^Issuer URL/), 'https://issuer.example.ch');
    fireEvent.blur(screen.getByLabelText(/^Issuer URL/));
    await user.type(screen.getByLabelText('Configuration id'), 'lfa_sd_jwt');
    fireEvent.blur(screen.getByLabelText('Configuration id'));
    act(() => useStore.getState().update((draft) => void (ensureIssuer(draft).logo = pngDataUrl(64, 64))));
    expect(issuer()).toMatchObject({ name: { 'de-CH': 'Kanton Bern' }, url: 'https://issuer.example.ch', configurationId: 'lfa_sd_jwt' });

    act(() => undo());
    expect(issuer().logo).toBeUndefined();
    act(() => undo());
    expect(issuer().configurationId).toBeUndefined();
    expect(screen.getByLabelText('Configuration id')).toHaveValue('');
    act(() => undo());
    expect(issuer().url).toBeUndefined();
    act(() => undo());
    expect(issuer().name['de-CH']).toBe('');
    expect(screen.getByLabelText('Issuer name')).toHaveValue('');

    act(() => redo());
    expect(screen.getByLabelText('Issuer name')).toHaveValue('Kanton Bern');
    act(() => redo());
    expect(screen.getByLabelText(/^Issuer URL/)).toHaveValue('https://issuer.example.ch');
    act(() => redo());
    expect(screen.getByLabelText('Configuration id')).toHaveValue('lfa_sd_jwt');
    act(() => redo());
    expect(issuer().logo).toBe(pngDataUrl(64, 64));
  });
});
