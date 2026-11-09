import type { GameConfig, PlaceProps } from '../types.ts';

export const ROUND_SIZE = 10;
/** Municipalities per round in Grande Rio; the rest are Rio neighborhoods. */
export const MUNICIPALITIES_PER_ROUND = 2;

export type Rng = () => number;

/** Places that exist on the map (and are valid typed answers) for the area. */
export function placesInArea(places: readonly PlaceProps[], config: GameConfig): PlaceProps[] {
  return config.area === 'rio' ? places.filter((p) => p.kind === 'neighborhood') : [...places];
}

/** Whether a place can be asked/clicked under the zone filter. */
export function isPlayable(place: PlaceProps, config: GameConfig): boolean {
  if (place.kind === 'municipality') return config.area === 'grande-rio';
  return config.zone === 'all' || place.zone === config.zone;
}

/** Draws the places of a round, without repetition, in random order. */
export function drawRound(
  places: readonly PlaceProps[],
  config: GameConfig,
  rng: Rng = Math.random,
): PlaceProps[] {
  const playable = placesInArea(places, config).filter((p) => isPlayable(p, config));
  const neighborhoods = playable.filter((p) => p.kind === 'neighborhood');
  if (config.area === 'rio') return sample(neighborhoods, ROUND_SIZE, rng);

  const municipalities = playable.filter((p) => p.kind === 'municipality');
  const muns = sample(municipalities, MUNICIPALITIES_PER_ROUND, rng);
  const nbs = sample(neighborhoods, ROUND_SIZE - muns.length, rng);
  return shuffle([...nbs, ...muns], rng);
}

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sample<T>(items: readonly T[], n: number, rng: Rng): T[] {
  return shuffle(items, rng).slice(0, n);
}
