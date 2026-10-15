import { CARD_PROFILES, type CardPlatform, type CardProfile, type CardVariant, type Ink, formatHex } from './profiles';

/** How the other platform's card would differ; every variant describes that other platform. */
export type CardDifference =
  | { kind: 'ink'; ink: Ink }
  | { kind: 'background'; fallback: string }
  | { kind: 'accepted'; translucent: boolean }
  | { kind: 'name'; text: string | null }
  | { kind: 'summary'; text: string };

export function otherPlatform(platform: CardPlatform): CardPlatform {
  return platform === 'ios' ? 'android' : 'ios';
}

/**
 * Where the other wallet would draw these card inputs differently from `current`. `variant` defaults to a card
 * (the home row has its own missing-name text); `summaries` holds the summary line each platform resolves
 * (their template index rules differ).
 */
export function cardDifferences(
  current: CardPlatform,
  inputs: { variant?: CardVariant; name: string; background?: string; summaries?: Record<CardPlatform, string> },
): CardDifference[] {
  const missingName = (profile: CardProfile) => (inputs.variant === 'home' ? profile.home.missingName : profile.missingName);
  const other = otherPlatform(current);
  const here = CARD_PROFILES[current];
  const there = CARD_PROFILES[other];
  const hereColour = here.parseBackground(inputs.background);
  const thereColour = there.parseBackground(inputs.background);
  const differences: CardDifference[] = [];
  if (hereColour && !thereColour) differences.push({ kind: 'background', fallback: formatHex(there.fallbackBackground) });
  if (!hereColour && thereColour) differences.push({ kind: 'accepted', translucent: thereColour.a < 1 });
  if (hereColour && thereColour) {
    const ink = there.textInk(thereColour);
    if (ink !== here.textInk(hereColour)) differences.push({ kind: 'ink', ink });
  }
  if (inputs.name === '' && missingName(here) !== missingName(there)) differences.push({ kind: 'name', text: missingName(there) });
  const { summaries } = inputs;
  if (summaries && summaries[current] !== summaries[other]) differences.push({ kind: 'summary', text: summaries[other] });
  return differences;
}
