// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProject } from '../core/model';
import { initDrafts } from '../state/persistence';
import { useStore } from '../state/store';
import { App } from './App';
import { TOUR_SEEN_KEY } from './lib/tour';
import { useTranslationState } from './lib/translate';
import { Workspace } from './workspace/Workspace';

/*
 * Every dialog is modal (the shared `Dialog`): focus goes in when it opens and stays in on Tab and
 * Shift+Tab, the page behind is inert, and Escape closes it, with focus back on the control that opened it.
 */

beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem(TOUR_SEEN_KEY, '1');
  vi.stubGlobal('indexedDB', new IDBFactory());
  await initDrafts();
  useStore.getState().close();
  useTranslationState.setState({ running: false, notice: null });
});

/** Checks the dialog named `name`, just opened from `opener`, then closes it with Escape. */
async function expectModal(user: UserEvent, name: string, opener: HTMLElement, initial: () => HTMLElement) {
  const dialog = screen.getByRole('dialog', { name });
  expect(initial()).toHaveFocus();
  expect(dialog).toContainElement(initial());
  // The page behind can't be reached: the app's other content is inert while the dialog is open.
  expect(opener.closest('[inert]')).not.toBeNull();

  // Twice round with Tab, and back with Shift+Tab: focus never leaves.
  const stops = within(dialog).getAllByRole('button').length + within(dialog).queryAllByRole('textbox').length;
  for (let press = 0; press < stops * 2; press += 1) {
    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  }
  for (let press = 0; press < stops * 2; press += 1) {
    await user.tab({ shift: true });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  }

  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
  expect(document.querySelector('[inert]')).toBeNull();
}

describe('the start screen dialogs', () => {
  for (const [opener, field] of [
    ['Start from a sample credential', 'Paste JSON'],
    ['Open an OCA bundle', 'Paste JSON'],
    ['Import Issuer Metadata', 'Paste JSON'],
  ] as const) {
    it(`“${opener}” focuses its text field, keeps focus and closes on Escape`, async () => {
      const user = userEvent.setup();
      render(<App />);
      const card = screen.getByRole('button', { name: new RegExp(opener) });
      await user.click(card);
      await expectModal(user, opener, card, () => screen.getByLabelText(new RegExp(field)));
    });
  }

  it('“Start blank” focuses the first language, keeps focus and closes on Escape', async () => {
    const user = userEvent.setup();
    render(<App />);
    const card = screen.getByRole('button', { name: /Start blank/ });
    await user.click(card);
    await expectModal(user, 'Start blank', card, () => within(screen.getByRole('dialog')).getAllByRole('checkbox')[0]);
  });

  it('closes on Escape wherever focus is inside it', async () => {
    const user = userEvent.setup();
    render(<App />);
    const card = screen.getByRole('button', { name: /Open an OCA bundle/ });
    await user.click(card);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(card).toHaveFocus();
    await user.click(card);
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Open in editor' }).focus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(card).toHaveFocus();
  });

  it('closes on a click outside it, with focus back on the opener and nothing behind it clicked', async () => {
    const user = userEvent.setup();
    render(<App />);
    const card = screen.getByRole('button', { name: /Open an OCA bundle/ });
    await user.click(card);
    await user.click(document.querySelector<HTMLElement>('.dialog-backdrop')!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(card).toHaveFocus();
  });

  it('shows invalid JSON under the text field, which is marked invalid', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Start from a sample credential/ }));
    const dialog = screen.getByRole('dialog');
    const field = within(dialog).getByLabelText(/Paste JSON/);
    expect(field).not.toHaveAttribute('aria-invalid', 'true');
    await user.paste('{"name": }');
    await user.click(within(dialog).getByRole('button', { name: 'Open in editor' }));

    const error = within(dialog).getByRole('alert');
    expect(error).toHaveTextContent('Invalid JSON at line 1, column 10.');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription('Invalid JSON at line 1, column 10.');
    // Right under the field, not under the languages further down.
    expect(field.parentElement).toContainElement(error);
  });

  it('shows a missing language under the languages', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Start blank/ }));
    const dialog = screen.getByRole('dialog');
    for (const box of within(dialog).getAllByRole('checkbox', { checked: true })) await user.click(box);
    await user.click(within(dialog).getByRole('button', { name: 'Open in editor' }));
    expect(within(dialog).getByRole('alert').closest('.field')).toHaveTextContent('Languages');
  });
});

describe('the workspace dialogs', () => {
  beforeEach(() => {
    useStore.getState().load(emptyProject(['de-CH', 'fr-CH']));
  });

  it('Languages focuses its tag field, keeps focus and closes on Escape', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    const more = screen.getByRole('button', { name: 'More actions' });
    await user.click(more);
    await user.click(screen.getByRole('menuitem', { name: 'Manage languages' }));
    await expectModal(user, 'Languages', more, () => within(screen.getByRole('dialog')).getByRole('textbox', { name: /Other language/ }));
  });

  it('“Attach a sample credential” focuses its text field, keeps focus and closes on Escape', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    const attach = screen.getByRole('button', { name: 'Attach sample' });
    await user.click(attach);
    await expectModal(user, 'Attach a sample credential', attach, () => screen.getByLabelText(/Paste JSON/));
  });

  it('shows a sample error under its text field, which is marked invalid', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(screen.getByRole('button', { name: 'Attach sample' }));
    const dialog = screen.getByRole('dialog');
    await user.paste('[1, 2]');
    await user.click(within(dialog).getByRole('button', { name: 'Attach' }));
    const field = within(dialog).getByLabelText(/Paste JSON/);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription('The sample credential must be a JSON object of claims.');
    expect(field.parentElement).toContainElement(within(dialog).getByRole('alert'));
  });

  it('“Fill from a sample credential” focuses its text field, keeps focus and closes on Escape', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    const fill = screen.getByRole('button', { name: 'Fill from a sample' });
    await user.click(fill);
    await expectModal(user, 'Fill from a sample credential', fill, () => screen.getByLabelText(/Paste JSON/));
  });

  it('“Add attributes from I14Y” focuses its search, keeps focus and closes on Escape', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    const add = screen.getAllByRole('button', { name: 'Add attributes from I14Y' })[0];
    await user.click(add);
    await expectModal(user, 'Add attributes from I14Y', add, () => screen.getByLabelText('Search I14Y'));
  });

  it('the translation model notice focuses Download, keeps focus and cancels on Escape', async () => {
    const user = userEvent.setup();
    const answer = vi.fn((download: boolean) => void download);
    render(<Workspace />);
    const more = screen.getByRole('button', { name: 'More actions' });
    more.focus();
    act(() => useTranslationState.setState({ notice: { pairs: ['German to French'], answer } }));
    const name = 'Download a translation model?';
    const dialog = screen.getByRole('dialog', { name });
    expect(within(dialog).getByRole('button', { name: 'Download and translate' })).toHaveFocus();
    for (let press = 0; press < 4; press += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    await user.keyboard('{Escape}');
    expect(answer).toHaveBeenCalledWith(false);
    act(() => useTranslationState.setState({ notice: null }));
    expect(more).toHaveFocus();
  });
});
