import { describe, expect, it } from 'vitest';
import { summariseBundle } from './examples';

const branding = (language: string, color: string, logo: string) => ({
  type: 'aries/overlays/branding/1.1',
  capture_base: 'IRoot',
  language,
  logo,
  primary_background_color: color,
});

describe('summariseBundle', () => {
  it('counts attributes across capture bases, leaving out references to other capture bases', () => {
    const summary = summariseBundle({
      capture_bases: [
        { digest: 'IRoot', attributes: { name: 'Text', address: 'refs:IAddress', pets: 'Array[refs:IPet]' } },
        { digest: 'IAddress', attributes: { street: 'Text', since: 'DateTime' } },
        { digest: 'IPet', attributes: { weight: 'Numeric' } },
      ],
      overlays: [],
    });
    expect(summary.attributeCount).toBe(4);
  });

  it('lists the meta languages in bundle order without duplicates', () => {
    const summary = summariseBundle({
      capture_bases: [{ digest: 'IRoot', attributes: {} }],
      overlays: [
        { type: 'spec/overlays/meta/1.0', capture_base: 'IRoot', language: 'fr', name: 'Permis' },
        { type: 'spec/overlays/label/1.1', capture_base: 'IRoot', language: 'it', attribute_labels: {} },
        { type: 'spec/overlays/meta/1.0', capture_base: 'IRoot', language: 'de', name: 'Ausweis' },
        { type: 'spec/overlays/meta/1.0', capture_base: 'IOther', language: 'fr', name: 'Autre' },
      ],
    });
    expect(summary.languages).toEqual(['fr', 'de']);
  });

  it('takes the colour and logo from the English branding', () => {
    const summary = summariseBundle({
      capture_bases: [{ digest: 'IRoot', attributes: {} }],
      overlays: [branding('de', '#111111', 'data:de'), branding('en', '#222222', 'data:en')],
    });
    expect(summary).toMatchObject({ background: '#222222', logo: 'data:en' });
  });

  it('falls back to the first branding when there is no English one', () => {
    const summary = summariseBundle({
      capture_bases: [{ digest: 'IRoot', attributes: {} }],
      overlays: [branding('it', '#333333', 'data:it'), branding('fr', '#444444', 'data:fr')],
    });
    expect(summary).toMatchObject({ background: '#333333', logo: 'data:it' });
  });
});
