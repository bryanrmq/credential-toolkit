/**
 * The projects the conformance run exports and hands to the wallets: the start screen's examples, the imported
 * bundle fixtures, the CLI's sample project file, and edge cases built here with the model's own helpers. Each one
 * becomes a project the same way the app gets it (`importBundle` for a bundle, `parseProjectFile` for a project
 * file), so the outputs come from the real export path.
 */
import { readFile, readdir } from 'node:fs/promises';
import { importBundle } from '../src/core/import/bundle.ts';
import {
  type AttributeNode,
  type Group,
  type GroupLink,
  type Node,
  type Project,
  emptyProject,
  newAttribute,
  newGroupLink,
} from '../src/core/model.ts';
import { parseProjectFile } from '../src/core/projectFile.ts';

export interface Sample {
  id: string;
  /** Where the project comes from, for the report. */
  source: string;
  load(): Promise<Project>;
}

const ROOT = new URL('../', import.meta.url);

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(new URL(path, ROOT), 'utf8'));
}

function bundleSample(id: string, path: string): Sample {
  return { id, source: path, load: async () => (await importBundle(await readJson(path))).project };
}

/** A 1×1 PNG, small enough to embed and decodable by both wallets. */
export const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

type Labels = Record<string, string>;

/** Labels in every language: `text (lang)`. */
function labels(languages: readonly string[], text: string): Labels {
  return Object.fromEntries(languages.map((lang) => [lang, `${text} (${lang})`]));
}

function attribute(languages: readonly string[], key: string, init: Partial<Omit<AttributeNode, 'kind' | 'id' | 'key'>> = {}): AttributeNode {
  return newAttribute(key, { labels: labels(languages, key), ...init });
}

function group(languages: readonly string[], key: string, children: Node[], init: Partial<Omit<GroupLink, 'kind' | 'id' | 'key' | 'group'>> = {}): GroupLink {
  const link = newGroupLink(key, { labels: labels(languages, key), ...init });
  link.group.children = children;
  return link;
}

/** Sets each node's `source` from its place in the tree, as the editor does for a new attribute. */
function setSources(group: Group, prefix: (string | number | null)[]): void {
  for (const node of group.children) {
    if (node.kind === 'attribute') {
      node.source = Array.isArray(node.source) && node.source.at(-1) === null ? [...prefix, node.key, null] : [...prefix, node.key];
    } else {
      node.source = node.array ? [...prefix, node.key, null] : [...prefix, node.key];
      setSources(node.group, node.source);
    }
  }
}

/**
 * Four languages, nested and array groups, a list of plain values, entry codes, sensitive attributes, an image
 * claim (Binary, base64, `image/png`) and a data URL image, dates with Format overlays, light and dark branding with
 * a logo and a summary template. Embedded as a data URL, like a project that sets no hosting URL.
 */
function edgeStructures(): Project {
  const languages = ['de-CH', 'fr-CH', 'it-CH', 'en-GB'];
  const project = emptyProject(languages);
  const sex = attribute(languages, 'sex', {
    type: 'Numeric',
    entries: {
      codes: ['1', '2'],
      labels: Object.fromEntries(languages.map((lang) => [lang, { 1: `male (${lang})`, 2: `female (${lang})` }])),
    },
  });
  const address = group(languages, 'address', [
    attribute(languages, 'street'),
    attribute(languages, 'postal_code', { type: 'Numeric' }),
    attribute(languages, 'locality'),
  ]);
  const children = group(
    languages,
    'children',
    [attribute(languages, 'given_name'), attribute(languages, 'birth_date', { type: 'DateTime', standard: 'urn:iso:std:iso:8601' })],
    { array: true },
  );
  const photo = attribute(languages, 'photo', { type: 'Binary', sensitive: true });
  project.root.children = [
    attribute(languages, 'family_name'),
    attribute(languages, 'given_name'),
    attribute(languages, 'birth_date', { type: 'DateTime', standard: 'urn:iso:std:iso:8601', sensitive: true }),
    sex,
    attribute(languages, 'is_over_18', { type: 'Boolean' }),
    attribute(languages, 'nationalities', { type: { array: 'Text' }, source: ['nationalities', null] }),
    attribute(languages, 'signature', { standard: 'urn:ietf:rfc:2397' }),
    photo,
    address,
    children,
  ];
  setSources(project.root, []);
  project.root.passthrough = [
    { type: 'spec/overlays/character_encoding/1.0', default_character_encoding: 'utf-8', attribute_character_encoding: { photo: 'base64' } },
    { type: 'spec/overlays/format/1.0', attribute_formats: { photo: 'image/png', birth_date: 'yyyy-MM-dd' } },
  ];
  for (const lang of languages) {
    project.meta[lang] = { name: `Edge credential (${lang})`, description: `Every structure the editor makes (${lang})` };
    project.branding[lang] = {
      light: { logo: PNG_DATA_URL, primaryBackgroundColor: '#2C75E3', primaryField: '{{family_name}} {{given_name}}' },
      dark: { logo: PNG_DATA_URL, primaryBackgroundColor: '#0B1F3A', primaryField: '{{given_name}}' },
    };
    project.issuer!.name[lang] = `Conformance issuer (${lang})`;
  }
  project.hosting = { mode: 'dataUrl' };
  project.sample = {
    family_name: 'Muster',
    given_name: 'Erika',
    birth_date: '1990-02-01',
    sex: 1,
    is_over_18: true,
    nationalities: ['CH', 'FR'],
    signature: PNG_DATA_URL,
    photo: PNG_BASE64,
    address: { street: 'Bundesplatz 3', postal_code: 3005, locality: 'Bern' },
    children: [
      { given_name: 'Lena', birth_date: '2015-06-30' },
      { given_name: 'Noah', birth_date: '2018-11-12' },
    ],
  };
  return project;
}

/** The structures sample hosted at a URL, so the wallets fetch the file and hash its bytes. */
function edgeHosted(): Project {
  const project = edgeStructures();
  for (const lang of project.languages) project.meta[lang].name = `Hosted credential (${lang})`;
  project.hosting = { mode: 'url', url: 'https://issuer.conformance.example/oca/edge-hosted/oca-bundle.json' };
  return project;
}

/** The start screen's examples: `src/examples/examples.ts` offers every `oca-bundle-<id>.json` there. */
const EXAMPLE_FILE = /^oca-bundle-(.+)\.json$/;
const examples = (await readdir(new URL('src/examples', ROOT)))
  .sort()
  .flatMap((name) => {
    const id = EXAMPLE_FILE.exec(name)?.[1];
    return id ? [bundleSample(`example-${id}`, `src/examples/${name}`)] : [];
  });

export const SAMPLES: Sample[] = [
  ...examples,
  {
    id: 'cli-sample-project',
    source: 'packages/credential-toolkit/test/fixtures/sample.credential-project.json',
    load: async () => {
      const parsed = parseProjectFile(await readFile(new URL('packages/credential-toolkit/test/fixtures/sample.credential-project.json', ROOT), 'utf8'));
      if (!parsed.ok) throw new Error(`Can't open the sample project file: ${parsed.error}`);
      return parsed.project;
    },
  },
  bundleSample('fixture-elfa', 'src/test/fixtures/oca-bundle-elfa.json'),
  bundleSample('fixture-chasseral', 'src/test/fixtures/oca-bundle-chasseral.json'),
  bundleSample('fixture-nested', 'src/test/fixtures/oca-bundle-nested.json'),
  bundleSample('fixture-simple-sample', 'src/test/fixtures/oca-bundle-simple-sample.json'),
  { id: 'edge-structures', source: 'conformance/samples.ts (edge cases)', load: async () => edgeStructures() },
  { id: 'edge-hosted', source: 'conformance/samples.ts (edge cases, hosted at a URL)', load: async () => edgeHosted() },
];
