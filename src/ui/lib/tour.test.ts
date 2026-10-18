// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TOUR_SEEN_KEY, loadTourSeen, placeCard, saveTourSeen, spotlightBox } from './tour';

beforeEach(() => localStorage.clear());

describe('tour seen flag', () => {
  it('is unset until the tour is saved as seen', () => {
    expect(loadTourSeen()).toBe(false);
    saveTourSeen();
    expect(localStorage.getItem(TOUR_SEEN_KEY)).toBe('1');
    expect(loadTourSeen()).toBe(true);
  });

  it('counts unreadable storage as not seen and ignores a failed save', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadTourSeen()).toBe(false);
    expect(() => saveTourSeen()).not.toThrow();
    get.mockRestore();
    set.mockRestore();
  });
});

describe('placeCard', () => {
  const viewport = { width: 1440, height: 900 };
  const card = { width: 360, height: 300 };

  it('centres the card when there is no area to point at', () => {
    expect(placeCard(null, card, viewport)).toEqual({ placement: 'center', left: 540, top: 300 });
  });

  it('puts the card beside a pane, on the side with room', () => {
    // Structure pane on the left: the card goes to its right.
    expect(placeCard({ top: 57, left: 0, width: 300, height: 843 }, card, viewport)).toEqual({ placement: 'right', left: 312, top: 57 });
    // Output pane on the right: no room to its right, so the card goes to its left.
    expect(placeCard({ top: 57, left: 1020, width: 420, height: 843 }, card, viewport)).toEqual({ placement: 'left', left: 648, top: 57 });
  });

  it('keeps a card beside an area inside the window vertically', () => {
    expect(placeCard({ top: 700, left: 0, width: 300, height: 400 }, card, viewport)).toEqual({ placement: 'right', left: 312, top: 584 });
  });

  it('puts the card below a bar, centred on it but inside the window', () => {
    expect(placeCard({ top: 0, left: 0, width: 1440, height: 56 }, card, viewport)).toEqual({ placement: 'bottom', left: 540, top: 68 });
    expect(placeCard({ top: 0, left: 1000, width: 440, height: 56 }, card, viewport)).toEqual({ placement: 'bottom', left: 1040, top: 68 });
  });

  it('puts the card above an area at the bottom of the window', () => {
    expect(placeCard({ top: 820, left: 0, width: 1440, height: 80 }, card, viewport)).toEqual({ placement: 'top', left: 540, top: 508 });
  });

  it('docks the card at the bottom when the area fills the window', () => {
    const phone = { width: 375, height: 812 };
    expect(placeCard({ top: 100, left: 0, width: 375, height: 712 }, { width: 343, height: 320 }, phone)).toEqual({ placement: 'dock', left: 16, top: 476 });
  });

  it('keeps a card taller than the window at the top margin', () => {
    expect(placeCard(null, { width: 343, height: 900 }, { width: 375, height: 600 })).toMatchObject({ top: 16, left: 16 });
  });
});

describe('spotlightBox', () => {
  it('pads the area', () => {
    expect(spotlightBox({ top: 100, left: 200, width: 300, height: 50 }, { width: 1440, height: 900 })).toEqual({ top: 96, left: 196, width: 308, height: 58 });
  });

  it('stays inside the window for an area that touches its edges', () => {
    expect(spotlightBox({ top: 57, left: 0, width: 300, height: 843 }, { width: 1440, height: 900 })).toEqual({ top: 53, left: 4, width: 300, height: 843 });
  });
});
