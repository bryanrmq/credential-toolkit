// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyProject, ensureIssuer, newAttribute } from '../../core/model';
import { reviewMarks, suggestText } from '../../core/review';
import { useStore } from '../../state/store';
import { pngDataUrl } from '../../test/images';
import { IDENTIFIERS_OPEN_KEY, loadIdentifiersOpen, setIdentifiersOpen } from '../lib/identifiersDisclosure';
import { TOUR_SEEN_KEY } from '../lib/tour';
import { Inspector } from './Inspector';
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
const section = () => screen.getByText('Issuer', { selector: '.section__title' }).closest<HTMLElement>('.section')!;
const field = (label: string | RegExp) => within(section()).getByText(label, { selector: 'label' }).closest<HTMLElement>('.field')!;
const toggle = () => within(section()).getByRole('button', { name: 'Identifiers' });
const issuesPanel = () => screen.getByRole('region', { name: 'Issues' });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOUR_SEEN_KEY, '1');
  setIdentifiersOpen(false);
  localStorage.removeItem(IDENTIFIERS_OPEN_KEY);
  loadProject();
});

describe('Issuer section', () => {
  it('comes after Branding with the intro line and the four fields', () => {
    render(<Inspector />);
    const titles = [...document.querySelectorAll('.section__title')].map((title) => title.textContent);
    expect(titles.slice(-2)).toEqual(['Branding', 'Issuer']);
    expect(within(section()).getByText(/^Goes into the Issuer Metadata, not the bundle\./)).toHaveClass('section__intro');
    expect(within(section()).getAllByText(/./, { selector: 'label.field__label' }).map((label) => label.textContent)).toEqual([
      'Issuer name',
      'Issuer logo',
      'Issuer URL optional',
    ]);
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('lists the issuer name per language, editing language first, empty ones highlighted', async () => {
    useStore.getState().setEditLang('fr-CH');
    const user = userEvent.setup();
    render(<Inspector />);
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
    render(<Inspector />);
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
    const { container } = render(<Inspector />);
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
    expect(container.querySelector('#field-credential-light-issuerLogo')).toBeInTheDocument();
  });

  it('shows an error for an Issuer URL that is not https, and none when it is empty', async () => {
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
});

describe('Identifiers disclosure', () => {
  it('is collapsed by default and remembers being opened across a reload', async () => {
    const user = userEvent.setup();
    render(<Inspector />);
    expect(screen.queryByLabelText('Configuration id')).not.toBeInTheDocument();

    await user.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Configuration id')).toBeInTheDocument();
    expect(localStorage.getItem(IDENTIFIERS_OPEN_KEY)).toBe('true');
    expect(loadIdentifiersOpen()).toBe(true);

    await user.click(toggle());
    expect(screen.queryByLabelText('Configuration id')).not.toBeInTheDocument();
    expect(loadIdentifiersOpen()).toBe(false);
  });

  it('reads as closed when storage holds nothing usable or throws', () => {
    localStorage.setItem(IDENTIFIERS_OPEN_KEY, 'not json');
    expect(loadIdentifiersOpen()).toBe(false);
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(loadIdentifiersOpen()).toBe(false);
      expect(() => setIdentifiersOpen(true)).not.toThrow();
    } finally {
      Storage.prototype.getItem = getItem;
    }
  });

  it('shows the defaults from the credential name in empty inputs and the Type Metadata path', async () => {
    setIdentifiersOpen(true);
    const user = userEvent.setup();
    render(<Inspector />);
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
    setIdentifiersOpen(true);
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

  it.each(cases)('jumps to the field of "%s"', async (summary, target) => {
    loadBroken();
    useStore.getState().select({ kind: 'node', id: project().root.children[0].id });
    const user = userEvent.setup();
    render(<Workspace />);
    expect(screen.queryByLabelText('Configuration id')).not.toBeInTheDocument();

    await user.click(within(issuesPanel()).getByRole('button', { name: summary }));
    expect(useStore.getState().selection.kind).toBe('credential');
    await waitFor(() => expect(target()).toHaveFocus());
  });

  it('jumps to the issuer name in the language that misses it', async () => {
    loadBroken();
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(within(issuesPanel()).getByRole('button', { name: /^The issuer name is missing\./ }));
    expect(useStore.getState().editLang).toBe('fr-CH');
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

describe('undo and redo', () => {
  it('takes back and redoes each Issuer field edit', async () => {
    setIdentifiersOpen(true);
    const user = userEvent.setup();
    render(<Inspector />);
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
