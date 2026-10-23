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
    const card = draw({ layout: CARD_PROFILES.android.layout.offer! });
    const content = [...card.children].filter((child) => !child.classList.contains('card-gradient'));
    expect(content[0]).toHaveClass('credential-card__logo');
    expect(content[1]).toHaveClass('credential-card__text');
  });

  it("tiles Android's fallback pattern over the default colour, under the gradients", () => {
    const card = draw({ layout: CARD_PROFILES.android.layout.detail, background: CARD_PROFILES.android.fallbackBackground, defaultBackground: true });
    const pattern = card.querySelector<HTMLElement>('.card-pattern')!;
    expect(pattern).toHaveAttribute('data-pattern', 'large');
    expect(pattern).toHaveAttribute('aria-hidden', 'true');
    expect(pattern.style.backgroundSize).toBe('180px');
    expect(pattern.nextElementSibling).toHaveClass('card-gradient');
  });

  it('draws the pattern on the Android offer card too', () => {
    expect(draw({ layout: CARD_PROFILES.android.layout.offer!, defaultBackground: true }).querySelector('.card-pattern')).toHaveAttribute('data-pattern', 'large');
  });

  it('draws no pattern on any other colour', () => {
    expect(draw({ layout: CARD_PROFILES.android.layout.detail }).querySelector('.card-pattern')).toBeNull();
  });

  it('draws no pattern on iOS, whatever the colour', () => {
    expect(draw({ defaultBackground: true }).querySelector('.card-pattern')).toBeNull();
  });

  it('draws the wallet gradients over the colour, with their opacity and blur', () => {
    const layers = [...draw().querySelectorAll<HTMLElement>('.card-gradient')];
    expect(layers).toHaveLength(2);
    expect(layers[0].getAttribute('style')).toContain('linear-gradient(150deg');
    expect(layers[0].style.opacity).toBe('0.25');
    expect(layers[1].getAttribute('style')).toContain('radial-gradient(288.8px 113.81px at 0px 227.62px');
    expect(layers[1].style.filter).toBe('blur(6px)');
  });
});
