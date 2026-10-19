import { isPlainObject } from '../core/import/report';
import elfa from './oca-bundle-elfa.json';

export type ExampleId = 'elfa';

/** Real bundles from the swiyu program, offered on the start screen and kept unchanged. */
export const EXAMPLES: Array<{ id: ExampleId; bundle: unknown }> = [{ id: 'elfa', bundle: elfa }];

export interface BundleSummary {
  languages: string[];
  attributeCount: number;
  background?: string;
  logo?: string;
}

const REFERENCE = /^(?:Array\[)?refs:/;

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isPlainObject) : [];
}

/** What the start screen shows about a bundle without importing it: languages, attribute count and branding. */
export function summariseBundle(bundle: unknown): BundleSummary {
  const root = isPlainObject(bundle) ? bundle : {};
  const captureBases = records(root.capture_bases);
  const overlays = records(root.overlays);

  const attributeCount = captureBases
    .flatMap((captureBase) => Object.values(isPlainObject(captureBase.attributes) ? captureBase.attributes : {}))
    .filter((type) => typeof type === 'string' && !REFERENCE.test(type)).length;

  const languages: string[] = [];
  for (const overlay of overlays) {
    if (overlay.type !== 'spec/overlays/meta/1.0' || typeof overlay.language !== 'string') continue;
    if (!languages.includes(overlay.language)) languages.push(overlay.language);
  }

  const brandings = overlays.filter((overlay) => typeof overlay.type === 'string' && overlay.type.startsWith('aries/overlays/branding/'));
  const branding = brandings.find((overlay) => overlay.language === 'en') ?? brandings[0];
  const text = (value: unknown) => (typeof value === 'string' ? value : undefined);

  return { languages, attributeCount, background: text(branding?.primary_background_color), logo: text(branding?.logo) };
}
