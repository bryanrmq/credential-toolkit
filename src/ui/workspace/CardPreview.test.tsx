// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Project, emptyProject, newAttribute } from '../../core/model';
import { useStore } from '../../state/store';
import { CardPreview } from './CardPreview';

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

beforeEach(() => {
  localStorage.clear();
  load();
});

describe('CardPreview', () => {
  it('starts on the iOS detail card and switches platform and card', async () => {
    const user = userEvent.setup();
    render(<CardPreview />);
    expect(screen.getByRole('figure', { name: 'iOS detail card' })).toHaveTextContent('Hundebewilligung');
    expect(card()).toHaveTextContent('Für Hundehalter');
    expect(card()).toHaveAttribute('data-ink', 'black');
    expect(screen.getByText('Android: white text')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Android' }));
    expect(screen.getByRole('figure', { name: 'Android detail card' })).toHaveAttribute('data-ink', 'white');
    expect(screen.getByText('iOS: black text')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Offer' }));
    expect(screen.getByRole('figure', { name: 'Android offer card' })).toBeInTheDocument();
    expect(useStore.getState()).toMatchObject({ cardPlatform: 'android', cardVariant: 'offer' });
  });

  it('follows the editing language, including one with no name or branding yet', async () => {
    const user = userEvent.setup();
    render(<CardPreview />);
    act(() => useStore.getState().setEditLang('en-GB'));
    expect(card()).toHaveTextContent('n/a');
    expect(card().style.background).toBe('rgb(215, 212, 205)');
    expect(screen.getByText('Android: no text when the name is empty')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Android' }));
    expect(card()).not.toHaveTextContent('n/a');
    expect(card().style.background).toBe('rgb(240, 237, 229)');
    expect(screen.getByText('iOS: shows "n/a" when the name is empty')).toBeInTheDocument();
  });

  it('shows the light card on the dark tab until a dark variant exists', () => {
    render(<CardPreview />);
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
    render(<CardPreview />);
    expect(card()).toHaveTextContent('Halter: ‹Vorname›');
    expect(screen.getByText('Attach a sample credential in the Output pane to see real values.')).toBeInTheDocument();

    act(() =>
      useStore.getState().update((draft) => {
        draft.sample = { given_name: 'Seraina' };
      }),
    );
    expect(card()).toHaveTextContent('Halter: Seraina');
    expect(screen.queryByText(/Attach a sample credential/)).not.toBeInTheDocument();
  });

  it('says when the other wallet rejects the colour', () => {
    load((project) => {
      project.branding['de-CH'].light.primaryBackgroundColor = '#3B82F680';
    });
    render(<CardPreview />);
    expect(card().style.background).toBe('rgba(59, 130, 246, 0.502)');
    expect(screen.getByText('Android: colour not supported, shows #F0EDE5')).toBeInTheDocument();
  });
});
