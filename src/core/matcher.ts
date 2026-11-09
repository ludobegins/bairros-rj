import type { PlaceProps } from '../types.ts';
import { levenshtein, normalize } from './normalize.ts';

export type MatchResult =
  { kind: 'correct' } | { kind: 'other'; place: PlaceProps } | { kind: 'unknown' };

/** Typos allowed for a name, based on its normalized length. */
export function tolerance(normalizedLength: number): number {
  if (normalizedLength >= 12) return 2;
  if (normalizedLength >= 5) return 1;
  return 0;
}

interface Entry {
  norm: string;
  place: PlaceProps;
}

export type Matcher = (input: string, targetId: string) => MatchResult;

/**
 * Builds a matcher over the places that are valid answers in the current game
 * (the active area). Names and aliases are compared after normalization; an
 * alias shared by several places (e.g. "Freguesia") counts for the target.
 */
export function createMatcher(places: readonly PlaceProps[]): Matcher {
  const entries: Entry[] = places.flatMap((place) =>
    [place.name, ...place.aliases].map((name) => ({ norm: normalize(name), place })),
  );

  return (input, targetId) => {
    const n = normalize(input);
    if (!n) return { kind: 'unknown' };

    // Exact matches win over fuzzy ones.
    const exact = entries.filter((e) => e.norm === n);
    if (exact.length > 0) return verdict(exact, targetId);

    let best = Infinity;
    let candidates: Entry[] = [];
    for (const e of entries) {
      const d = levenshtein(n, e.norm);
      if (d > tolerance(e.norm.length)) continue;
      if (d < best) {
        best = d;
        candidates = [e];
      } else if (d === best) {
        candidates.push(e);
      }
    }
    return candidates.length > 0 ? verdict(candidates, targetId) : { kind: 'unknown' };
  };
}

function verdict(candidates: Entry[], targetId: string): MatchResult {
  if (candidates.some((e) => e.place.id === targetId)) return { kind: 'correct' };
  return { kind: 'other', place: candidates[0].place };
}
