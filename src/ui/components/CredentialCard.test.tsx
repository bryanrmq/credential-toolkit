// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CARD_PROFILES } from '../../core/card/profiles';
import { pngDataUrl } from '../../test/images';
import { CredentialCard } from './CredentialCard';

const BLUE = { r: 59, g: 130, b: 246, a: 1 };

function draw(overrides: Partial<Parameters<typeof CredentialCard>[0]> = {}) {
  render(
    <CredentialCard
      label="iOS detail card"
      layout={CARD_PROFILES.ios.layout.detail}
      background={BLUE}
      ink="black"
      name="Hundebewilligung"
      summary={[]}
      {...overrides}
    />,
  );
  return screen.getByRole('figure', { name: 'iOS detail card' });
}

describe('CredentialCard', () => {
  it('draws the name, the summary and placeholders', () => {
    const card = draw({ summary: [{ kind: 'text', text: 'Halter: ' }, { kind: 'placeholder', label: 'Vorname' }] });
    expect(card).toHaveTextContent('Hundebewilligung');
    expect(card).toHaveTextContent('Halter: ‹Vorname›');
  });

  it('draws no name line when the name is null', () => {
    const card = draw({ name: null, summary: [{ kind: 'text', text: 'Für Hundehalter' }] });
    expect(card.querySelector('.credential-card__name')).toBeNull();
    expect(card).toHaveTextContent('Für Hundehalter');
  });

  it('paints the background and the black or white content', () => {
    const card = draw({ background: { ...BLUE, a: 0.5 }, ink: 'white' });
    expect(card.style.background).toBe('rgba(59, 130, 246, 0.5)');
    expect(card).toHaveAttribute('data-ink', 'white');
  });

  it('tints a PNG logo black or white', () => {
    expect(draw({ logo: pngDataUrl(64, 64) }).querySelector('img')?.style.filter).toBe('brightness(0)');
  });

  it('tints a PNG logo white on dark cards', () => {
    expect(draw({ logo: pngDataUrl(64, 64), ink: 'white' }).querySelector('img')?.style.filter).toBe('brightness(0) invert(1)');
  });

  it('draws no logo for an SVG or a non-data URL, which neither wallet can show', () => {
    expect(draw({ logo: 'data:image/svg+xml;base64,PHN2Zy8+' }).querySelector('img')).toBeNull();
  });

  it('draws no logo for a plain URL', () => {
    expect(draw({ logo: 'https://issuer.example.ch/logo.png' }).querySelector('img')).toBeNull();
  });

  it('puts the text after the logo on offer cards', () => {
    const card = draw({ layout: CARD_PROFILES.android.layout.offer });
    expect(card.firstElementChild).toHaveClass('credential-card__logo');
    expect(card.lastElementChild).toHaveClass('credential-card__text');
  });
});
