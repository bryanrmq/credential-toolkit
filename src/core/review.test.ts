import { describe, expect, it } from 'vitest';
import { compareProjects } from './compare';
import { buildBundle, serializeBundle } from './export/bundle';
import { type AttributeNode, type Project, type TextPlace, emptyProject, newAttribute } from './model';
import { removeLanguage, removeNode, renameLanguage } from './operations';
import { parseProjectFile, serializeProjectFile } from './projectFile';
import {
  confirmReview,
  hasUnreviewed,
  markSuggested,
  placeOrder,
  pruneReview,
  reviewMarkAt,
  reviewMarks,
  setTextAt,
  suggestText,
  textAt,
} from './review';

/** De and fr; a credential name in German, a `sex` attribute labelled in German with a value list. */
function sample(): { project: Project; sex: AttributeNode } {
  const project = emptyProject(['de-CH', 'fr-CH']);
  project.meta['de-CH'] = { name: 'Bewilligung', description: '' };
  const sex = newAttribute('sex', {
    labels: { 'de-CH': 'Geschlecht' },
    entries: { codes: ['f', 'm'], labels: { 'de-CH': { f: 'weiblich', m: 'männlich' } } },
  });
  project.root.children.push(sex);
  project.hosting = { mode: 'dataUrl' };
  return { project, sex };
}

const label = (sex: AttributeNode): TextPlace => ({ kind: 'label', nodeId: sex.id });
const entry = (sex: AttributeNode, code: string): TextPlace => ({ kind: 'entry', nodeId: sex.id, code });
const NAME: TextPlace = { kind: 'meta', field: 'name' };
const ISSUER: TextPlace = { kind: 'issuerName' };

describe('texts by place', () => {
  it('reads and writes every kind of translatable text', () => {
    const { project, sex } = sample();
    setTextAt(project, label(sex), 'fr-CH', 'Sexe');
    setTextAt(project, entry(sex, 'f'), 'fr-CH', 'féminin');
    setTextAt(project, NAME, 'fr-CH', 'Autorisation');
    setTextAt(project, { kind: 'primaryField', theme: 'light' }, 'fr-CH', '{{sex}}');
    expect(textAt(project, label(sex), 'fr-CH')).toBe('Sexe');
    expect(textAt(project, entry(sex, 'f'), 'fr-CH')).toBe('féminin');
    expect(textAt(project, NAME, 'fr-CH')).toBe('Autorisation');
    expect(textAt(project, { kind: 'primaryField', theme: 'light' }, 'fr-CH')).toBe('{{sex}}');
    expect(textAt(project, { kind: 'meta', field: 'description' }, 'fr-CH')).toBe('');
  });

  it('has no text where the node, code, language or dark branding is missing', () => {
    const { project, sex } = sample();
    expect(textAt(project, { kind: 'label', nodeId: 'gone' }, 'de-CH')).toBeUndefined();
    expect(textAt(project, entry(sex, 'x'), 'de-CH')).toBeUndefined();
    expect(textAt(project, label(sex), 'it-CH')).toBeUndefined();
    expect(textAt(project, { kind: 'primaryField', theme: 'dark' }, 'de-CH')).toBeUndefined();
  });
});

describe('marking suggested texts', () => {
  it('marks a text as it is, with its source, and replaces an earlier mark on it', () => {
    const { project, sex } = sample();
    expect(suggestText(project, label(sex), 'fr-CH', 'Sexe', 'i14y')).toBe(true);
    expect(textAt(project, label(sex), 'fr-CH')).toBe('Sexe');
    expect(reviewMarkAt(project, label(sex), 'fr-CH')).toEqual({ place: label(sex), lang: 'fr-CH', source: 'i14y', text: 'Sexe' });
    expect(reviewMarkAt(project, label(sex), 'de-CH')).toBeUndefined();

    suggestText(project, label(sex), 'fr-CH', 'Genre', 'translation');
    expect(reviewMarks(project)).toEqual([{ place: label(sex), lang: 'fr-CH', source: 'translation', text: 'Genre' }]);
    expect(hasUnreviewed(project)).toBe(true);
  });

  it('marks nothing for an empty or missing text', () => {
    const { project, sex } = sample();
    expect(markSuggested(project, label(sex), 'fr-CH', 'translation')).toBe(false);
    expect(suggestText(project, { kind: 'label', nodeId: 'gone' }, 'fr-CH', 'X', 'translation')).toBe(false);
    expect(suggestText(project, label(sex), 'it-CH', 'Sesso', 'translation')).toBe(false);
    expect(project.review).toBeUndefined();
    expect(hasUnreviewed(project)).toBe(false);
  });

  it('confirms the marks it is asked to, or all of them', () => {
    const { project, sex } = sample();
    suggestText(project, label(sex), 'fr-CH', 'Sexe', 'i14y');
    suggestText(project, entry(sex, 'f'), 'fr-CH', 'féminin', 'i14y');
    suggestText(project, NAME, 'fr-CH', 'Autorisation', 'translation');
    expect(confirmReview(project, (mark) => mark.place.kind === 'meta')).toBe(1);
    expect(reviewMarks(project).map((mark) => mark.place.kind)).toEqual(['label', 'entry']);
    expect(confirmReview(project)).toBe(2);
    expect(project.review).toBeUndefined();
    // The texts stay as they were.
    expect(textAt(project, label(sex), 'fr-CH')).toBe('Sexe');
  });
});

describe('the issuer name', () => {
  it('is a text per language like the credential name, also in a project saved before the issuer settings', () => {
    const { project } = sample();
    expect(textAt(project, ISSUER, 'fr-CH')).toBe('');
    setTextAt(project, ISSUER, 'fr-CH', 'Canton de Berne');
    expect(textAt(project, ISSUER, 'fr-CH')).toBe('Canton de Berne');
    expect(project.issuer?.name).toEqual({ 'de-CH': '', 'fr-CH': 'Canton de Berne' });
    expect(textAt(project, ISSUER, 'it-CH')).toBeUndefined();

    delete project.issuer;
    expect(textAt(project, ISSUER, 'de-CH')).toBe('');
    setTextAt(project, ISSUER, 'de-CH', 'Kanton Bern');
    expect(project.issuer).toEqual({ name: { 'de-CH': 'Kanton Bern', 'fr-CH': '' } });
  });

  it('takes a review mark that holds until the name is edited, its language removed or renamed', () => {
    const { project } = sample();
    expect(suggestText(project, ISSUER, 'fr-CH', 'Canton de Berne', 'translation')).toBe(true);
    expect(reviewMarkAt(project, ISSUER, 'fr-CH')).toEqual({ place: ISSUER, lang: 'fr-CH', source: 'translation', text: 'Canton de Berne' });
    expect(reviewMarkAt(project, NAME, 'fr-CH')).toBeUndefined();
    expect(hasUnreviewed(project)).toBe(true);

    renameLanguage(project, 'fr-CH', 'fr');
    expect(reviewMarkAt(project, ISSUER, 'fr')?.text).toBe('Canton de Berne');
    setTextAt(project, ISSUER, 'fr', 'Canton de Berne (BE)');
    expect(reviewMarks(pruneReview(project))).toEqual([]);

    suggestText(project, ISSUER, 'fr', 'Canton de Berne', 'i14y');
    removeLanguage(project, 'fr');
    expect(reviewMarks(project)).toEqual([]);
  });

  it('marks nothing while empty, and its marks survive a project file', () => {
    const { project } = sample();
    expect(markSuggested(project, ISSUER, 'de-CH', 'translation')).toBe(false);
    suggestText(project, ISSUER, 'de-CH', 'Kanton Bern', 'translation');
    const parsed = parseProjectFile(serializeProjectFile(project));
    expect(parsed.ok && reviewMarks(parsed.project)).toEqual([{ place: ISSUER, lang: 'de-CH', source: 'translation', text: 'Kanton Bern' }]);
  });

  it('is listed after the credential fields and before the attributes', () => {
    const { project, sex } = sample();
    const order = placeOrder(project);
    const places: TextPlace[] = [label(sex), ISSUER, { kind: 'primaryField', theme: 'dark' }, NAME];
    expect(places.sort((a, b) => order(a) - order(b))).toEqual([NAME, { kind: 'primaryField', theme: 'dark' }, ISSUER, label(sex)]);
  });
});

describe('pruneReview', () => {
  it('drops the mark of an edited text and keeps the others', () => {
    const { project, sex } = sample();
    suggestText(project, label(sex), 'fr-CH', 'Sexe', 'i14y');
    suggestText(project, entry(sex, 'f'), 'fr-CH', 'féminin', 'i14y');
    expect(pruneReview(project)).toBe(project);
    setTextAt(project, label(sex), 'fr-CH', 'Sexe ');
    const pruned = pruneReview(project);
    expect(pruned).not.toBe(project);
    expect(reviewMarks(pruned).map((mark) => mark.place)).toEqual([entry(sex, 'f')]);
  });

  it('drops marks whose node, value code or language is gone, and malformed ones', () => {
    const { project, sex } = sample();
    suggestText(project, label(sex), 'fr-CH', 'Sexe', 'i14y');
    suggestText(project, entry(sex, 'm'), 'fr-CH', 'masculin', 'i14y');
    suggestText(project, NAME, 'fr-CH', 'Autorisation', 'translation');
    project.review!.push({ place: { kind: 'nope' }, lang: 'fr-CH', source: 'i14y', text: 'x' } as never);
    sex.entries!.codes = ['f'];
    removeLanguage(project, 'de-CH');
    expect(reviewMarks(project)).toHaveLength(2);
    removeNode(project, sex.id);
    expect(pruneReview(project).review).toEqual([{ place: NAME, lang: 'fr-CH', source: 'translation', text: 'Autorisation' }]);
    removeLanguage(project, 'fr-CH');
    expect('review' in pruneReview(project)).toBe(false);
  });

  it('keeps marks across a language rename', () => {
    const { project, sex } = sample();
    suggestText(project, label(sex), 'fr-CH', 'Sexe', 'i14y');
    renameLanguage(project, 'fr-CH', 'fr');
    expect(reviewMarkAt(project, label(sex), 'fr')?.text).toBe('Sexe');
  });
});

describe('marks stay in the editor', () => {
  it('never reach the bundle', async () => {
    const { project, sex } = sample();
    const before = serializeBundle((await buildBundle(structuredClone(project))).bundle);
    suggestText(project, label(sex), 'fr-CH', 'Sexe', 'translation');
    const plain = structuredClone(project);
    delete plain.review;
    const json = serializeBundle((await buildBundle(project)).bundle);
    expect(json).toBe(serializeBundle((await buildBundle(plain)).bundle));
    expect(json).not.toBe(before);
    expect(json).not.toContain('review');
    expect(json).not.toContain('translation');
  });

  it('are ignored by compare', async () => {
    const { project, sex } = sample();
    const marked = structuredClone(project);
    setTextAt(project, label(sex), 'fr-CH', 'Sexe');
    suggestText(marked, label(sex), 'fr-CH', 'Sexe', 'translation');
    expect(await compareProjects(project, marked)).toEqual([]);
  });

  it('round-trip through project files', () => {
    const { project, sex } = sample();
    suggestText(project, label(sex), 'fr-CH', 'Sexe', 'i14y');
    const parsed = parseProjectFile(serializeProjectFile(project));
    expect(parsed.ok && reviewMarks(parsed.project)).toEqual([{ place: label(sex), lang: 'fr-CH', source: 'i14y', text: 'Sexe' }]);
  });
});
