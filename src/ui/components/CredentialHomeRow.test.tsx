// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CARD_PROFILES } from '../../core/card/profiles';
import { pngDataUrl } from '../../test/images';
import { CredentialHomeRow } from './CredentialHomeRow';

const BLUE = { r: 59, g: 130, b: 246, a: 1 };

function draw(overrides: Partial<Parameters<typeof CredentialHomeRow>[0]> = {}) {
  render(
    <CredentialHomeRow
      label="iOS home row"
      layout={CARD_PROFILES.ios.home}
      theme="light"
      background={BLUE}
      ink="black"
      name="Hundebewilligung"
      summary={[{ kind: 'text', text: 'Seraina Muster' }]}
      {...overrides}
    />,
  );
  return screen.getByRole('figure', { name: 'iOS home row' });
}

describe('CredentialHomeRow', () => {
  it('draws a logo-only thumbnail in the card colour, with the tinted logo and the gradient', () => {
    const thumbnail = draw({ logo: pngDataUrl(64, 64) }).querySelector<HTMLElement>('.home-row__thumbnail')!;
    expect(thumbnail.style.background).toBe('rgb(59, 130, 246)');
    expect(thumbnail.style.width).toBe('72px');
    expect(thumbnail.querySelector('img')?.style.filter).toBe('brightness(0)');
    expect(thumbnail.querySelectorAll('.card-gradient')).toHaveLength(1);
    expect(thumbnail).not.toHaveTextContent('Hundebewilligung');
  });

  it('writes the name and summary in the list colours of the theme', () => {
    const row = draw();
    expect(row.style.background).toBe('rgb(255, 255, 255)');
    expect(screen.getByText('Hundebewilligung')).toHaveStyle({ color: 'rgb(10, 40, 65)' });
    expect(screen.getByText('Seraina Muster')).toHaveStyle({ color: 'rgba(10, 40, 65, 0.68)' });
  });

  it('uses the dark list colours on the dark tab', () => {
    expect(draw({ theme: 'dark' }).style.background).toBe('rgb(44, 44, 46)');
    expect(screen.getByText('Hundebewilligung')).toHaveStyle({ color: 'rgb(255, 255, 255)' });
  });

  it('shows a chevron only where the wallet does', () => {
    expect(draw().querySelector('.home-row__chevron')).toBeNull();
  });

  it('shows the Android chevron', () => {
    expect(draw({ layout: CARD_PROFILES.android.home }).querySelector('.home-row__chevron')).not.toBeNull();
  });

  it("tiles Android's small fallback pattern in the thumbnail over the default colour", () => {
    const android = CARD_PROFILES.android;
    const row = draw({ layout: android.home, background: android.fallbackBackground, defaultBackground: true });
    const pattern = row.querySelector('.home-row__thumbnail > .card-pattern');
    expect(pattern).toHaveAttribute('data-pattern', 'small');
    expect(pattern?.nextElementSibling).toHaveClass('card-gradient');
  });

  it('draws no thumbnail pattern on any other colour', () => {
    expect(draw({ layout: CARD_PROFILES.android.home }).querySelector('.card-pattern')).toBeNull();
  });

  it('draws no thumbnail pattern on iOS, whatever the colour', () => {
    expect(draw({ defaultBackground: true }).querySelector('.card-pattern')).toBeNull();
  });

  it('draws no name line when the name is null', () => {
    expect(draw({ name: null }).querySelector('.home-row__name')).toBeNull();
  });
});
