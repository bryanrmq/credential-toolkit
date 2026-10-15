import { describe, expect, it } from 'vitest';
import { gradientLayer } from './gradients';
import { CARD_PROFILES, type CardLayout } from './profiles';

/** Every gradient of a card at its reference size. */
const layers = (layout: CardLayout) =>
  layout.gradients.map((gradient) => gradientLayer(gradient, layout.referenceWidth, layout.referenceWidth / layout.aspectRatio));

describe('gradientLayer', () => {
  it('ports the iOS detail card: a 110° linear gradient and a blurred bottom-left ellipse', () => {
    expect(layers(CARD_PROFILES.ios.layout.detail)).toEqual([
      { image: 'linear-gradient(150deg, rgba(0, 0, 0, 1) 15.2%, rgba(0, 0, 0, 0) 84.8%)', opacity: 0.25, blur: 0 },
      {
        image: 'radial-gradient(ellipse 288.8px 113.81px at 0px 227.62px, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 50%, rgba(0, 0, 0, 0) 100%)',
        opacity: 0.15,
        blur: 6,
      },
    ]);
  });

  it('ports the Android detail card: corner-to-corner diagonal, bottom-left and bottom-centre radials', () => {
    expect(layers(CARD_PROFILES.android.layout.detail)).toEqual([
      { image: 'linear-gradient(122.23deg, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0) 100%)', opacity: 1, blur: 0 },
      { image: 'radial-gradient(circle 228px at 0px 239.6px, rgba(0, 0, 0, 0.3) 0px, rgba(0, 0, 0, 0) 228px)', opacity: 1, blur: 0 },
      { image: 'radial-gradient(circle 71.88px at 209px 215.64px, rgba(0, 0, 0, 0.1) 0px, rgba(0, 0, 0, 0) 71.88px)', opacity: 1, blur: 0 },
    ]);
  });

  it('ports the Android offer card: diagonal and a radial just below the bottom-left', () => {
    expect(layers(CARD_PROFILES.android.layout.offer!)).toEqual([
      { image: 'linear-gradient(145.78deg, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0) 100%)', opacity: 1, blur: 0 },
      { image: 'radial-gradient(circle 134px at 48.24px 409.88px, rgba(0, 0, 0, 0.3) 0px, rgba(0, 0, 0, 0) 134px)', opacity: 1, blur: 0 },
    ]);
  });

  it('draws only the linear gradient on the small home thumbnails', () => {
    expect(CARD_PROFILES.ios.home.thumbnail.gradients.map((gradient) => gradient.kind)).toEqual(['linear']);
    expect(CARD_PROFILES.android.home.thumbnail.gradients.map((gradient) => gradient.kind)).toEqual(['linear']);
  });
});
