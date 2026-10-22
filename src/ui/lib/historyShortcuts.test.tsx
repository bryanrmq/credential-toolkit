// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyProject } from '../../core/model';
import { useStore } from '../../state/store';
import { Workspace } from '../workspace/Workspace';
import { TOUR_SEEN_KEY } from './tour';

const description = () => useStore.getState().project?.meta['de-CH'].description;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOUR_SEEN_KEY, '1');
  useStore.getState().close();
  useStore.getState().load(emptyProject(['de-CH', 'en-GB']));
});

describe('history shortcuts', () => {
  it('undoes a typing burst in one step with ⌘Z inside the field, and redoes it with ⇧⌘Z', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    const field = screen.getByLabelText('Description');
    await user.type(field, 'Dog');
    expect(useStore.getState().past).toHaveLength(1);

    await user.keyboard('{Meta>}z{/Meta}');
    expect(description()).toBe('');
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();

    await user.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}');
    expect(description()).toBe('Dog');
    expect(field).toHaveValue('Dog');
  });

  it('works with Ctrl+Z and Ctrl+Shift+Z', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.type(screen.getByLabelText('Description'), 'Dog');
    await user.keyboard('{Control>}z{/Control}');
    expect(description()).toBe('');
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(description()).toBe('Dog');
  });

  it('starts a new step once the field is left', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    const field = screen.getByLabelText('Description');
    await user.type(field, 'Dog');
    await user.click(screen.getByLabelText('Name'));
    await user.type(field, 's');
    expect(useStore.getState().past).toHaveLength(2);

    await user.keyboard('{Meta>}z{/Meta}');
    expect(description()).toBe('Dog');
  });

  it('does nothing while a dialog is open', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.type(screen.getByLabelText('Description'), 'Dog');
    useStore.getState().setLanguagesOpen(true);
    await user.click(within(await screen.findByRole('dialog')).getByRole('textbox'));
    await user.keyboard('{Meta>}z{/Meta}');
    expect(description()).toBe('Dog');
  });

  it('does nothing while the tour is open', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.type(screen.getByLabelText('Description'), 'Dog');
    useStore.getState().setTourOpen(true);
    await screen.findByRole('dialog', { name: 'Workspace tour' });
    await user.keyboard('{Meta>}z{/Meta}');
    expect(description()).toBe('Dog');
  });
});
