// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyProject } from '../../core/model';
import { useStore } from '../../state/store';
import { TOUR_SEEN_KEY, loadTourSeen } from '../lib/tour';
import { Workspace } from './Workspace';

const tour = () => screen.getByRole('dialog', { name: 'Workspace tour' });
const heading = () => within(tour()).getByRole('heading').textContent;
const shownPane = () => within(screen.getByRole('tablist', { name: 'Panes' })).getByRole('tab', { selected: true }).textContent;

beforeEach(() => {
  localStorage.clear();
  useStore.getState().close();
  useStore.getState().load(emptyProject(['de-CH', 'en-GB']));
});

describe('Tour', () => {
  it('opens by itself and walks through every area of the workspace', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    expect(heading()).toBe('Welcome to the workspace');
    expect(within(tour()).getByText('1 of 6')).toBeInTheDocument();
    expect(within(tour()).queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    expect(within(tour()).getByRole('button', { name: 'Next' })).toHaveFocus();

    const visited = [];
    for (let step = 0; step < 5; step++) {
      await user.click(within(tour()).getByRole('button', { name: 'Next' }));
      visited.push(heading());
    }
    expect(visited).toEqual(['Structure', 'Edit', 'Output', 'Top bar', 'Translations view']);
    expect(within(tour()).getByText('6 of 6')).toBeInTheDocument();
    expect(within(tour()).queryByRole('button', { name: 'Skip tour' })).not.toBeInTheDocument();

    await user.click(within(tour()).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog', { name: 'Workspace tour' })).not.toBeInTheDocument();
    expect(loadTourSeen()).toBe(true);
  });

  it('lists what each area can do', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(within(tour()).getByRole('button', { name: 'Next' }));
    const features = within(tour()).getAllByRole('listitem').map((item) => item.textContent);
    expect(features).toContain('Drag the handle beside an item to reorder it.');
    await user.click(within(tour()).getByRole('button', { name: 'Next' }));
    expect(within(tour()).getByText('{{', { selector: 'kbd' })).toBeInTheDocument();
  });

  it('shows the translations table for its step and puts the view and pane back when done', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    expect(shownPane()).toBe('Edit');
    await user.click(within(tour()).getByRole('button', { name: 'Next' }));
    expect(shownPane()).toBe('Structure');
    await user.click(within(tour()).getByRole('button', { name: 'Next' }));
    await user.click(within(tour()).getByRole('button', { name: 'Next' }));
    expect(shownPane()).toBe('Output');
    await user.click(within(tour()).getByRole('button', { name: 'Next' }));
    await user.click(within(tour()).getByRole('button', { name: 'Next' }));
    expect(useStore.getState().view).toBe('translations');
    expect(screen.getByRole('table')).toBeInTheDocument();

    await user.click(within(tour()).getByRole('button', { name: 'Back' }));
    expect(useStore.getState().view).toBe('editor');
    await user.click(within(tour()).getByRole('button', { name: 'Next' }));
    await user.click(within(tour()).getByRole('button', { name: 'Done' }));
    expect(useStore.getState().view).toBe('editor');
    expect(shownPane()).toBe('Edit');
  });

  it('moves with the arrow keys, keeps Tab on the card and closes with Escape', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(heading()).toBe('Edit');
    await user.keyboard('{ArrowLeft}');
    expect(heading()).toBe('Structure');

    expect(within(tour()).getByRole('button', { name: 'Next' })).toHaveFocus();
    await user.tab();
    expect(within(tour()).getByRole('button', { name: 'Skip tour' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(tour()).getByRole('button', { name: 'Next' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Workspace tour' })).not.toBeInTheDocument();
    expect(loadTourSeen()).toBe(true);
  });

  it('stays closed once seen and replays from the menu', async () => {
    localStorage.setItem(TOUR_SEEN_KEY, '1');
    const user = userEvent.setup();
    render(<Workspace />);
    expect(screen.queryByRole('dialog', { name: 'Workspace tour' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Take the tour' }));
    expect(heading()).toBe('Welcome to the workspace');
  });

  it('starts from the translations view and returns to it', async () => {
    localStorage.setItem(TOUR_SEEN_KEY, '1');
    useStore.getState().setView('translations');
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Take the tour' }));
    await user.click(within(tour()).getByRole('button', { name: 'Next' }));
    expect(useStore.getState().view).toBe('editor');
    await user.click(within(tour()).getByRole('button', { name: 'Skip tour' }));
    expect(useStore.getState().view).toBe('translations');
  });
});
