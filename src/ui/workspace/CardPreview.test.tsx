// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Project, emptyGroup, emptyProject, newAttribute, newGroupLink } from '../../core/model';
import { useStore } from '../../state/store';
import { EditPreview } from './EditPreview';

function load(configure?: (project: Project) => void) {
  const project = emptyProject(['de-CH', 'en-GB']);
  project.meta['de-CH'] = { name: 'Hundebewilligung', description: 'Für Hundehalter' };
  project.branding['de-CH'] = { light: { primaryBackgroundColor: '#3B82F6' } };
  project.root.children.push(newAttribute('given_name', { source: ['given_name'], labels: { 'de-CH': 'Vorname' } }));
  configure?.(project);
  useStore.getState().load(project);
  useStore.setState({ cardPlatform: 'ios', cardVariant: 'detail' });
}

const card = () => screen.getByRole('figure');
/** A button of one of the preview's segmented controls: platform, view, or Android's detail and offer cards. */
const control = (group: 'Preview platform' | 'Preview view' | 'Preview card', name: string) =>
  within(screen.getByRole('group', { name: group })).getByRole('button', { name });
const pressed = (group: string) =>
  within(screen.getByRole('group', { name: group }))
    .getAllByRole('button')
    .filter((button) => button.getAttribute('aria-pressed') === 'true')
    .map((button) => button.textContent);
/** The card preview as the Edit pane shows it beside the form, under the preview's controls. */
const renderPreview = () => render(<EditPreview beside />);

beforeEach(() => {
  localStorage.clear();
  load();
});

describe('CardPreview in the wallet preview', () => {
  it('starts on the iOS card and switches platform and card', async () => {
    const user = userEvent.setup();
    renderPreview();
    expect(screen.getByRole('figure', { name: 'iOS card' })).toHaveTextContent('Hundebewilligung');
    expect(card()).toHaveTextContent('Für Hundehalter');
    expect(card()).toHaveAttribute('data-ink', 'black');
    expect(screen.getByText('Android: white text')).toBeInTheDocument();

    await user.click(control('Preview platform', 'Android'));
    expect(screen.getByRole('figure', { name: 'Android detail card' })).toHaveAttribute('data-ink', 'white');
    expect(screen.getByText('iOS: black text')).toBeInTheDocument();

    await user.click(control('Preview card', 'Offer'));
    expect(screen.getByRole('figure', { name: 'Android offer card' })).toBeInTheDocument();
    expect(useStore.getState()).toMatchObject({ cardPlatform: 'android', cardVariant: 'offer' });
  });

  it('offers Detail and Offer under Card on Android only; iOS shows its card for Offer', async () => {
    const user = userEvent.setup();
    useStore.setState({ cardPlatform: 'android', cardVariant: 'offer' });
    renderPreview();
    expect(within(screen.getByRole('group', { name: 'Preview view' })).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Card',
      'Details',
      'Home',
    ]);
    expect(pressed('Preview view')).toEqual(['Card']);
    expect(within(screen.getByRole('group', { name: 'Preview card' })).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Detail',
      'Offer',
    ]);
    expect(pressed('Preview card')).toEqual(['Offer']);

    await user.click(control('Preview platform', 'iOS'));
    expect(screen.queryByRole('group', { name: 'Preview card' })).not.toBeInTheDocument();
    expect(pressed('Preview view')).toEqual(['Card']);
    expect(screen.getByRole('figure', { name: 'iOS card' })).toBeInTheDocument();

    // Card again keeps the card shown; Android still has its offer card.
    await user.click(control('Preview view', 'Card'));
    await user.click(control('Preview platform', 'Android'));
    expect(screen.getByRole('figure', { name: 'Android offer card' })).toBeInTheDocument();

    // Leaving Card and coming back opens the detail card.
    await user.click(control('Preview view', 'Home'));
    expect(screen.queryByRole('group', { name: 'Preview card' })).not.toBeInTheDocument();
    await user.click(control('Preview view', 'Card'));
    expect(screen.getByRole('figure', { name: 'Android detail card' })).toBeInTheDocument();
    expect(useStore.getState().cardVariant).toBe('detail');
  });

  it('shows the details screen of the picked platform in the Details view, without the card notes', async () => {
    const user = userEvent.setup();
    renderPreview();
    await user.click(control('Preview view', 'Details'));
    expect(useStore.getState().cardVariant).toBe('details');
    expect(pressed('Preview view')).toEqual(['Details']);
    expect(screen.getByRole('region', { name: 'iOS details screen' })).toBeInTheDocument();
    expect(screen.queryByText('Android: white text')).not.toBeInTheDocument();
    expect(screen.queryByText(/Approximation of the swiyu wallets/)).not.toBeInTheDocument();

    await user.click(control('Preview platform', 'Android'));
    expect(screen.getByRole('region', { name: 'Android details screen' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Preview card' })).not.toBeInTheDocument();

    await user.click(control('Preview view', 'Card'));
    expect(screen.getByRole('figure', { name: 'Android detail card' })).toBeInTheDocument();
  });

  it('puts the notes and the caption under the preview', () => {
    load((project) => {
      project.branding['de-CH'].light.primaryField = 'Halter: {{given_name}}';
    });
    renderPreview();
    act(() => useStore.getState().setBrandingTheme('dark'));
    const notes = [
      screen.getByText('No dark branding: both wallets show the light card in dark mode.'),
      screen.getByText("Attach a sample credential under the Output pane's Bundle tab to see real values."),
      screen.getByText('Android: white text'),
      screen.getByText("Approximation of the swiyu wallets. Uses this app's font and leaves out patterns and badges."),
    ];
    for (const note of notes) expect(card().compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('draws the home row on each platform list background', async () => {
    const user = userEvent.setup();
    renderPreview();
    await user.click(control('Preview view', 'Home'));
    const row = screen.getByRole('figure', { name: 'iOS home row' });
    expect(row).toHaveTextContent('Hundebewilligung');
    expect(row).toHaveTextContent('Für Hundehalter');
    expect(row.closest('.card-preview__stage')).toHaveStyle({ background: 'rgb(241, 245, 249)' });

    act(() => useStore.getState().setBrandingTheme('dark'));
    expect(row.closest('.card-preview__stage')).toHaveStyle({ background: 'rgb(28, 28, 30)' });
  });

  it('names the home row fallback title when the name is empty', async () => {
    const user = userEvent.setup();
    renderPreview();
    await user.click(control('Preview view', 'Home'));
    act(() => useStore.getState().setEditLang('en-GB'));
    expect(card()).toHaveTextContent('Credential');
    expect(screen.getByText('Android: no text when the name is empty')).toBeInTheDocument();

    await user.click(control('Preview platform', 'Android'));
    expect(card()).not.toHaveTextContent('Credential');
    expect(screen.getByText('iOS: shows "Credential" when the name is empty')).toBeInTheDocument();
  });

  it('follows the editing language, including one with no name or branding yet', async () => {
    const user = userEvent.setup();
    renderPreview();
    act(() => useStore.getState().setEditLang('en-GB'));
    expect(card()).toHaveTextContent('n/a');
    expect(card().style.background).toBe('rgb(215, 212, 205)');
    expect(screen.getByText('Android: no text when the name is empty')).toBeInTheDocument();

    await user.click(control('Preview platform', 'Android'));
    expect(card()).not.toHaveTextContent('n/a');
    expect(card().style.background).toBe('rgb(240, 237, 229)');
    expect(screen.getByText('iOS: shows "n/a" when the name is empty')).toBeInTheDocument();
  });

  it('shows the light card on the dark tab until a dark variant exists', () => {
    renderPreview();
    act(() => useStore.getState().setBrandingTheme('dark'));
    expect(screen.getByText('No dark branding: both wallets show the light card in dark mode.')).toBeInTheDocument();
    expect(card().style.background).toBe('rgb(59, 130, 246)');

    act(() =>
      useStore.getState().update((draft) => {
        draft.branding['de-CH'].dark = { primaryBackgroundColor: '#111111' };
      }),
    );
    expect(screen.queryByText(/No dark branding/)).not.toBeInTheDocument();
    expect(card().style.background).toBe('rgb(17, 17, 17)');
  });

  it('shows attribute placeholders until a sample credential is attached', () => {
    load((project) => {
      project.branding['de-CH'].light.primaryField = 'Halter: {{given_name}}';
    });
    renderPreview();
    expect(card()).toHaveTextContent('Halter: ‹Vorname›');
    expect(screen.getByText("Attach a sample credential under the Output pane's Bundle tab to see real values.")).toBeInTheDocument();

    act(() =>
      useStore.getState().update((draft) => {
        draft.sample = { given_name: 'Seraina' };
      }),
    );
    expect(card()).toHaveTextContent('Halter: Seraina');
    expect(screen.queryByText(/Attach a sample credential/)).not.toBeInTheDocument();
  });

  it('says when the other wallet resolves the summary differently', async () => {
    const user = userEvent.setup();
    load((project) => {
      const pets = { ...emptyGroup(), children: [newAttribute('name', { source: ['pets', null, 'name'] })] };
      project.root.children.push(newGroupLink('pets', { array: true, source: ['pets', null], group: pets }));
      project.branding['de-CH'].light.primaryField = '{{pets.name[1]}}';
      project.sample = { pets: [{ name: 'Rex' }, { name: 'Bello' }] };
    });
    renderPreview();
    expect(card()).toHaveTextContent('Bello');
    expect(screen.getByText('Android: empty summary')).toBeInTheDocument();

    await user.click(control('Preview platform', 'Android'));
    expect(card()).not.toHaveTextContent('Bello');
    expect(screen.getByText('iOS: summary "Bello"')).toBeInTheDocument();
  });

  it('says when the other wallet rejects the colour', () => {
    load((project) => {
      project.branding['de-CH'].light.primaryBackgroundColor = '#3B82F680';
    });
    renderPreview();
    expect(card().style.background).toBe('rgba(59, 130, 246, 0.502)');
    expect(screen.getByText('Android: colour not supported, shows #F0EDE5')).toBeInTheDocument();
  });
});
