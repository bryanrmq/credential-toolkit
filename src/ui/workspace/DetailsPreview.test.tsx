// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Group, type Node, type Project, emptyGroup, emptyProject, newAttribute, newGroupLink } from '../../core/model';
import { useStore } from '../../state/store';
import { pngDataUrl } from '../../test/images';
import { EditPreview } from './EditPreview';

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

const renderPreview = () => render(<EditPreview beside />);
const phone = () => within(screen.getByRole('region', { name: 'iOS details screen' }));
/** A claim row by its accessible name: label, value and, when sensitive, "Sensitive information". */
const row = (name: string) => phone().getByRole('button', { name });
/** A row for a sample claim no attribute maps to, which does not link to the editor. */
const rawRow = (name: string) => phone().getByRole('group', { name });

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
    expect(rawRow('["extra"], x')).toBeInTheDocument();
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

  it('lists where Android would show the details differently, under the preview', () => {
    load((project) => {
      project.root.children.push(newAttribute('vaccinated', { type: 'Boolean', source: ['vaccinated'], labels: { [DE]: 'Geimpft' } }));
      (project.sample as Record<string, unknown>).vaccinated = true;
    });
    renderPreview();
    expect(row('Geimpft, 1')).toBeInTheDocument();
    const differences = screen.getByRole('list', { name: 'Where Android differs' });
    expect(within(differences).getByText('Android: "Geimpft" shows "true"')).toBeInTheDocument();
  });
});

describe('DetailsPreview on Android', () => {
  beforeEach(() => useStore.setState({ cardPlatform: 'android' }));

  const android = () => within(screen.getByRole('region', { name: 'Android details screen' }));
  const androidRow = (name: string) => android().getByRole('button', { name });

  it('draws the card, the sections with their rows, and the group titles', () => {
    renderPreview();
    expect(android().getByRole('figure', { name: 'Android card' })).toHaveTextContent('Hundebewilligung');
    expect(androidRow('Name, Rex')).toHaveTextContent(/^NameRex$/);
    expect(androidRow('Vorname, Anna')).toBeInTheDocument();
    expect(androidRow('Ort, Bern')).toBeInTheDocument();
    expect(android().getByRole('heading', { level: 4, name: 'Halter' })).toBeInTheDocument();
    expect(android().getByRole('heading', { level: 5, name: 'Adresse' })).toBeInTheDocument();
    // The root section has no title, so only "Issued by" is a section heading.
    expect(android().getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['Ausgestellt von']);
    expect(screen.getByText(/Approximation of the Android wallet's details screen/)).toBeInTheDocument();
  });

  it('links each row and group to its node and claims path', () => {
    renderPreview();
    const project = useStore.getState().project!;
    expect(androidRow('Name, Rex')).toHaveAttribute('data-node-id', project.root.children[0].id);
    expect(androidRow('Ort, Bern')).toHaveAttribute('data-path', '["owner","address","city"]');
    expect(android().getByRole('heading', { name: 'Halter' })).toHaveAttribute('data-node-id', project.root.children[2].id);
  });

  it("marks every row below a sensitive group, with Android's pill and words, without masking", () => {
    load((project) => {
      const owner = project.root.children[2];
      if (owner.kind === 'group') owner.sensitive = true;
    });
    useStore.setState({ cardPlatform: 'android' });
    renderPreview();
    expect(androidRow('Geboren, 2020, Sensible Information')).toHaveTextContent(/2020Sensibel$/);
    expect(androidRow('Vorname, Anna, Sensible Information')).toBeInTheDocument();
    expect(androidRow('Ort, Bern, Sensible Information')).toBeInTheDocument();
    expect(within(androidRow('Name, Rex')).queryByText('Sensibel')).not.toBeInTheDocument();
    // iOS marks only the address rows here, which the differences name.
    expect(within(screen.getByRole('list', { name: 'Where iOS differs' })).getByText('iOS: "Vorname" has no Sensitive pill')).toBeInTheDocument();
  });

  it('lists a null claim as –, and drops a group without claims, unlike iOS', () => {
    load((project) => {
      project.root.children.push(newAttribute('note', { source: ['note'], labels: { [DE]: 'Notiz' } }));
      Object.assign(project.sample as object, { note: null, owner: { given_name: 'Anna' } });
    });
    useStore.setState({ cardPlatform: 'android' });
    renderPreview();
    expect(androidRow('Notiz, –')).toHaveTextContent(/^Notiz–$/);
    expect(android().queryByRole('heading', { name: 'Adresse' })).not.toBeInTheDocument();
    const differences = within(screen.getByRole('list', { name: 'Where iOS differs' }));
    expect(differences.getByText('iOS: leaves out "Notiz"')).toBeInTheDocument();
    expect(differences.getByText('iOS: shows the empty group "Adresse"')).toBeInTheDocument();
  });

  it('draws "Issued by" with a placeholder name, the card logo in the avatar, and the issuance type', () => {
    renderPreview();
    const issuer = android().getByRole('region', { name: 'Ausgestellt von' });
    expect(within(issuer).getByText('Issuer name')).toHaveClass('android-details__placeholder');
    expect(issuer.querySelector('.android-details__avatar img')).toHaveAttribute('src', useStore.getState().project!.branding[DE].light.logo);
    expect(issuer).toHaveTextContent('AusstellungsartStandard');
  });

  it("shows the status in Android's badge and words", async () => {
    const user = userEvent.setup();
    renderPreview();
    const badge = () => android().getByRole('figure', { name: 'Android card' }).querySelector('.android-badge')!;
    expect(badge()).toHaveTextContent('Gültig');
    expect(badge()).toHaveClass('android-badge--outline');
    await user.selectOptions(screen.getByLabelText('Card status'), 'Revoked');
    expect(badge()).toHaveTextContent('Widerrufen');
    expect(badge()).toHaveClass('android-badge--error');
    // Translated on Android, unlike iOS.
    await user.selectOptions(screen.getByLabelText('Card status'), 'Not yet valid');
    expect(badge()).toHaveTextContent(/^gültig ab \d\d\.\d\d\.\d{4}$/);
  });

  it('follows the dark theme', () => {
    useStore.setState({ brandingTheme: 'dark' });
    renderPreview();
    expect(screen.getByRole('region', { name: 'Android details screen' })).toHaveClass('android-details--dark');
  });
});
