import { describe, expect, it } from 'vitest';
import { cardDifferences, otherPlatform } from './differences';

describe('cardDifferences', () => {
  it('names the other platform text colour when the wallets disagree', () => {
    expect(cardDifferences('ios', { name: 'Permit', background: '#3B82F6' })).toEqual([{ kind: 'ink', ink: 'white' }]);
    expect(cardDifferences('android', { name: 'Permit', background: '#3B82F6' })).toEqual([{ kind: 'ink', ink: 'black' }]);
  });

  it('reports nothing when both wallets draw the same card', () => {
    expect(cardDifferences('ios', { name: 'Permit', background: '#FF0000' })).toEqual([]);
    expect(cardDifferences('android', { name: 'Permit' })).toEqual([]);
  });

  it('says when Android falls back on a colour iOS accepts', () => {
    expect(cardDifferences('ios', { name: 'Permit', background: '#3B82F680' })).toEqual([{ kind: 'background', fallback: '#F0EDE5' }]);
    expect(cardDifferences('ios', { name: 'Permit', background: '3B82F6' })).toEqual([{ kind: 'background', fallback: '#F0EDE5' }]);
  });

  it('says when iOS shows a colour Android falls back on', () => {
    expect(cardDifferences('android', { name: 'Permit', background: '#3B82F680' })).toEqual([{ kind: 'accepted', translucent: true }]);
    expect(cardDifferences('android', { name: 'Permit', background: '3B82F6' })).toEqual([{ kind: 'accepted', translucent: false }]);
  });

  it('names the other platform missing-name text', () => {
    expect(cardDifferences('ios', { name: '' })).toEqual([{ kind: 'name', text: null }]);
    expect(cardDifferences('android', { name: '' })).toEqual([{ kind: 'name', text: 'n/a' }]);
  });

  it('flips the platform', () => {
    expect(otherPlatform('ios')).toBe('android');
    expect(otherPlatform('android')).toBe('ios');
  });
});
