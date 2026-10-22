// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyGroup, emptyProject, newAttribute, newGroupLink } from '../../core/model';
import { useStore } from '../../state/store';
import { TOUR_SEEN_KEY } from '../lib/tour';
import { Workspace } from './Workspace';

/** A project with no issues at all. */
function cleanProject() {
  const project = emptyProject(['de-CH']);
  project.meta['de-CH'] = { name: 'Hundebewilligung', description: 'Für Hundehalter' };
  project.root.children.push(newAttribute('name', { source: ['name'], labels: { 'de-CH': 'Name' } }));
  project.hosting = { mode: 'dataUrl' };
  return project;
}

const panel = () => screen.getByRole('region', { name: 'Issues' });
const row = (summary: string | RegExp) => within(panel()).getByRole('button', { name: summary }).closest('li')!;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOUR_SEEN_KEY, '1');
});

describe('IssuesPanel', () => {
  it('says there are no issues when there are none', () => {
    useStore.getState().load(cleanProject());
    render(<Workspace />);
    expect(within(panel()).getByText('No issues')).toBeInTheDocument();
    expect(within(panel()).getByText('No issues. The bundle is ready.')).toBeInTheDocument();
    expect(within(panel()).queryByRole('list')).not.toBeInTheDocument();
    expect(within(panel()).queryByRole('button', { name: /Fix all/ })).not.toBeInTheDocument();
  });

  it('counts errors and warnings in the header', () => {
    const project = cleanProject();
    project.root.children.push(
      newAttribute('broken', { source: [], labels: { 'de-CH': 'Kaputt' } }),
      newAttribute('unlabelled', { source: ['unlabelled'] }),
      newAttribute('also', { source: ['also'] }),
    );
    useStore.getState().load(project);
    render(<Workspace />);
    expect(within(panel()).getByText('1 error')).toBeInTheDocument();
    expect(within(panel()).getByText('2 warnings')).toBeInTheDocument();
    expect(within(panel()).queryByText('No issues')).not.toBeInTheDocument();
    expect(within(panel()).getAllByRole('listitem')).toHaveLength(3);
  });

  it('collapses to its header and expands again', async () => {
    const project = cleanProject();
    project.root.children.push(newAttribute('broken', { source: [], labels: { 'de-CH': 'Kaputt' } }));
    useStore.getState().load(project);
    const user = userEvent.setup();
    render(<Workspace />);
    const collapse = within(panel()).getByRole('button', { name: 'Collapse issues' });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');

    await user.click(collapse);
    expect(within(panel()).queryByRole('list')).not.toBeInTheDocument();
    expect(within(panel()).getByText('1 error')).toBeInTheDocument();
    expect(within(panel()).getByRole('button', { name: 'Fix all (1)' })).toBeInTheDocument();
    const expand = within(panel()).getByRole('button', { name: 'Expand issues' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');

    await user.click(expand);
    expect(within(panel()).getByRole('list')).toBeInTheDocument();
  });

  it('jumps to the field when the row is clicked anywhere', async () => {
    const project = cleanProject();
    project.root.children.push(newAttribute('broken', { source: [], labels: { 'de-CH': 'Kaputt' } }));
    useStore.getState().load(project);
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(within(row(/"broken" has no source path/)).getByText('broken'));
    expect(useStore.getState().selection).toEqual({ kind: 'node', id: project.root.children[1].id });
    expect(screen.getByLabelText('Key')).toHaveValue('broken');
  });

  it('shows where each issue sits', () => {
    const project = emptyProject(['de-CH', 'fr']);
    project.meta['de-CH'] = { name: 'Hundebewilligung', description: 'Für Hundehalter' };
    project.meta.fr = { name: 'Permis', description: 'Pour les chiens' };
    const address = newGroupLink('address', { source: ['address'], labels: { 'de-CH': 'Adresse', fr: 'Adresse' }, group: emptyGroup() });
    address.group.children.push(newAttribute('city', { source: [], labels: { 'de-CH': 'Ort', fr: 'Lieu' } }));
    project.root.children.push(address);
    project.hosting = { mode: 'url', url: 'not a url' };
    useStore.getState().load(project);
    render(<Workspace />);

    const locations = within(panel())
      .getAllByRole('listitem')
      .map((item) => item.querySelector('.issues__location')?.textContent);
    expect(locations).toContain('address.city');
    expect(locations).toContain('Languages');
    expect(locations).toContain('Hosting');
  });

  it('shows credential issues under "Credential"', () => {
    const project = cleanProject();
    project.meta['de-CH'].name = '';
    useStore.getState().load(project);
    render(<Workspace />);
    const item = within(panel()).getAllByRole('listitem')[0];
    expect(item.querySelector('.issues__location')).toHaveTextContent('Credential');
  });

  it('leaves the Output pane with the Bundle and VCT tabs, Bundle first', () => {
    useStore.getState().load(cleanProject());
    useStore.setState({ outputTab: 'bundle' });
    render(<Workspace />);
    const output = screen.getByRole('region', { name: 'Output' });
    const tabs = within(output).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Bundle', 'VCT snippet']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(useStore.getInitialState().outputTab).toBe('bundle');
  });
});
