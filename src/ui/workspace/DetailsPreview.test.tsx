// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Group, type Node, type Project, emptyGroup, emptyProject, newAttribute, newGroupLink } from '../../core/model';
import { useStore } from '../../state/store';
import { pngDataUrl } from '../../test/images';
import { OutputPanel } from './OutputPanel';

const DE = 'de-CH';
const group = (...children: Node[]): Group => ({ ...emptyGroup(), children });

/** A dog licence with a name, a sensitive birth date and an owner group holding an address group. */
function load(configure?: (project: Project) => void) {
  const project = emptyProject([DE, 'en-GB']);
  project.meta[DE] = { name: 'Hundebewilligung', description: '' };
  project.branding[DE] = { light: { primaryBackgroundColor: '#3B82F6', logo: pngDataUrl(4, 4) } };
  project.root.children.push(
    newAttribute('name', { source: ['name'], labels: { [DE]: 'Name' } }),
    newAttribute('born', { source: ['born'], sensitive: true, labels: { [DE]: 'Geboren' } }),
    newGroupLink('owner', {
      source: ['owner'],
      labels: { [DE]: 'Halter' },
      group: group(
        newAttribute('given_name', { source: ['owner', 'given_name'], labels: { [DE]: 'Vorname' } }),
        newGroupLink('address', {
          source: ['owner', 'address'],
          labels: { [DE]: 'Adresse' },
          group: group(newAttribute('city', { source: ['owner', 'address', 'city'], labels: { [DE]: 'Ort' } })),
        }),
      ),
    }),
  );
  project.sample = { name: 'Rex', born: '2020', owner: { given_name: 'Anna', address: { city: 'Bern' } } };
  configure?.(project);
  useStore.getState().load(project);
  useStore.setState({ cardPlatform: 'ios', cardVariant: 'details', editLang: DE, brandingTheme: 'light' });
}

const renderPreview = () => render(<OutputPanel exportState={{ status: 'working' }} />);
const phone = () => within(screen.getByRole('region', { name: 'iOS details screen' }));
/** A claim row by its accessible name: label, value and, when sensitive, "Sensitive information". */
const row = (name: string) => phone().getByRole('group', { name });

beforeEach(() => {
  localStorage.clear();
  load();
});

describe('DetailsPreview on iOS', () => {
  it('draws the card, the sections with their rows, and the child group titles', () => {
    renderPreview();
    expect(phone().getByRole('figure', { name: 'iOS card' })).toHaveTextContent('Hundebewilligung');
    expect(row('Name, Rex')).toHaveTextContent(/^NameRex$/);
    expect(row('Vorname, Anna')).toBeInTheDocument();
    expect(row('Ort, Bern')).toBeInTheDocument();
    // The root section has no title; "Halter" heads a group in it and "Adresse" a group nested in that one.
    expect(phone().getByRole('heading', { level: 4, name: 'Halter' })).toBeInTheDocument();
    expect(phone().getByRole('heading', { level: 5, name: 'Adresse' })).toBeInTheDocument();
    expect(phone().getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['Ausgestellt von']);
  });

  it('links each row and group to its node and claims path', () => {
    renderPreview();
    const project = useStore.getState().project!;
    const owner = project.root.children[2];
    expect(row('Name, Rex')).toHaveAttribute('data-node-id', project.root.children[0].id);
    expect(row('Ort, Bern')).toHaveAttribute('data-path', '["owner","address","city"]');
    expect(phone().getByRole('heading', { name: 'Halter' })).toHaveAttribute('data-node-id', owner.id);
  });

  it('puts the Sensitive pill on sensitive rows only, without masking the value', () => {
    renderPreview();
    expect(row('Geboren, 2020, Sensitive information')).toHaveTextContent(/2020Sensibel$/);
    expect(within(row('Name, Rex')).queryByText('Sensibel')).not.toBeInTheDocument();
  });

  it('draws an image value inline under its label', () => {
    const photo = pngDataUrl(2, 2);
    load((project) => {
      project.root.children.push(newAttribute('photo', { source: ['photo'], standard: 'urn:ietf:rfc:2397', labels: { [DE]: 'Foto' } }));
      (project.sample as Record<string, unknown>).photo = photo;
    });
    const { container } = renderPreview();
    const image = row('Foto, Image');
    expect(image).toHaveAttribute('data-value', 'image');
    expect(image.querySelector('img')).toHaveAttribute('src', photo);
    expect(container.querySelectorAll('.ios-claim__image img')).toHaveLength(1);
  });

  it('shows the type as a placeholder without a sample, with a note', () => {
    load((project) => {
      delete project.sample;
    });
    renderPreview();
    expect(row('Name, Text')).toHaveAttribute('data-value', 'placeholder');
    expect(within(row('Name, Text')).getByText('Text')).toHaveClass('ios-details__placeholder');
    expect(screen.getByText(/Attach a sample credential/)).toBeInTheDocument();
  });

  it('has no order note when every row has its own order', () => {
    renderPreview();
    expect(screen.queryByText(/wallet may list them in another order/)).not.toBeInTheDocument();
  });

  it('notes the undefined order of claims that share an order value', () => {
    load((project) => {
      // Sample claims without an attribute all sort as 32767, so their order is undefined.
      Object.assign(project.sample as object, { extra: 'x', more: 'y' });
    });
    renderPreview();
    expect(row('["extra"], x')).toBeInTheDocument();
    expect(screen.getByText(/wallet may list them in another order/)).toBeInTheDocument();
  });

  it('draws "Issued by" with a placeholder name and the card logo, and says where the wallet takes it from', () => {
    renderPreview();
    const issuer = phone().getByRole('region', { name: 'Ausgestellt von' });
    expect(within(issuer).getByText('Issuer name')).toHaveClass('ios-details__placeholder');
    expect(issuer.querySelector('.ios-details__issuer-logo img')).toHaveAttribute('src', useStore.getState().project!.branding[DE].light.logo);
    expect(issuer).toHaveTextContent('AusstellungsartStandard');
    expect(screen.getByText(/name and logo from the issuer metadata/)).toBeInTheDocument();
  });

  it('shows Valid by default and the status picked above the preview', async () => {
    const user = userEvent.setup();
    renderPreview();
    const badge = () => phone().getByRole('figure', { name: 'iOS card' }).querySelector('.ios-badge')!;
    expect(badge()).toHaveTextContent('Gültig');
    expect(badge()).toHaveAttribute('data-status', 'valid');
    expect(badge()).toHaveClass('ios-badge--success', 'ios-badge--on-black');

    // The picker sits above the screen.
    expect(screen.getByLabelText('Card status').compareDocumentPosition(screen.getByRole('region', { name: 'iOS details screen' }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    await user.selectOptions(screen.getByLabelText('Card status'), 'Revoked');
    expect(badge()).toHaveTextContent('Widerrufen');
    expect(badge()).toHaveClass('ios-badge--error');

    await user.selectOptions(screen.getByLabelText('Card status'), 'Not yet valid');
    expect(badge()).toHaveTextContent(/^Valid on \d\d\.\d\d\.\d{4}$/);
  });

  it('uses the wallet texts in the editing language, else English', () => {
    load((project) => {
      project.meta['en-GB'] = { name: 'Dog licence', description: '' };
    });
    useStore.setState({ editLang: 'en-GB' });
    renderPreview();
    expect(phone().getByRole('region', { name: 'Issued by' })).toBeInTheDocument();
    expect(phone().getByText('Dog licence', { selector: '.ios-details__title' })).toBeInTheDocument();
  });

  it('follows the dark theme', () => {
    useStore.setState({ brandingTheme: 'dark' });
    renderPreview();
    expect(screen.getByRole('region', { name: 'iOS details screen' })).toHaveClass('ios-details--dark');
  });

  it('keeps an empty state for Android', () => {
    useStore.setState({ cardPlatform: 'android' });
    renderPreview();
    expect(screen.queryByRole('region', { name: /details screen/ })).not.toBeInTheDocument();
    expect(screen.getByText('No details preview for Android here yet.')).toBeInTheDocument();
  });
});
