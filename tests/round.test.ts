import { describe, expect, it } from 'vitest';
import { drawRound, isPlayable, placesInArea } from '../src/core/round.ts';
import type { GameConfig, PlaceProps } from '../src/types.ts';
import { loadRealPlaces, place, seededRng } from './helpers.ts';

const real = loadRealPlaces();
const cfg = (c: Partial<GameConfig> = {}): GameConfig => ({
  mode: 'type',
  area: 'rio',
  zone: 'all',
  ...c,
});
const kinds = (ps: PlaceProps[]) => ps.map((p) => p.kind);

describe('drawRound', () => {
  it('draws 10 distinct Rio neighborhoods in Só Rio', () => {
    const r = drawRound(real, cfg(), seededRng(1));
    expect(r).toHaveLength(10);
    expect(new Set(r.map((p) => p.id)).size).toBe(10);
    expect(kinds(r).every((k) => k === 'neighborhood')).toBe(true);
  });

  it('draws 8 neighborhoods + 2 municipalities in Grande Rio', () => {
    for (let seed = 0; seed < 20; seed++) {
      const r = drawRound(real, cfg({ area: 'grande-rio' }), seededRng(seed));
      expect(r).toHaveLength(10);
      expect(kinds(r).filter((k) => k === 'municipality')).toHaveLength(2);
    }
  });

  it('applies the zone filter to neighborhoods only', () => {
    const r = drawRound(real, cfg({ area: 'grande-rio', zone: 'sul' }), seededRng(3));
    const nbs = r.filter((p) => p.kind === 'neighborhood');
    expect(nbs).toHaveLength(8);
    expect(nbs.every((p) => p.zone === 'sul')).toBe(true);
  });

  it('uses all available places when the pool is smaller than a round', () => {
    const few = [
      place({ id: 'a', name: 'A', zone: 'sul' }),
      place({ id: 'b', name: 'B', zone: 'sul' }),
    ];
    expect(drawRound(few, cfg(), seededRng(1))).toHaveLength(2);
  });

  it('is deterministic for a given RNG', () => {
    const a = drawRound(real, cfg(), seededRng(42)).map((p) => p.id);
    const b = drawRound(real, cfg(), seededRng(42)).map((p) => p.id);
    expect(a).toEqual(b);
  });
});

describe('placesInArea / isPlayable', () => {
  it('excludes municipalities from Só Rio', () => {
    expect(placesInArea(real, cfg()).some((p) => p.kind === 'municipality')).toBe(false);
    expect(placesInArea(real, cfg({ area: 'grande-rio' }))).toHaveLength(real.length);
  });

  it('keeps municipalities playable under a zone filter in Grande Rio', () => {
    const mun = real.find((p) => p.kind === 'municipality')!;
    const leblon = real.find((p) => p.name === 'Leblon')!;
    expect(isPlayable(mun, cfg({ area: 'grande-rio', zone: 'norte' }))).toBe(true);
    expect(isPlayable(leblon, cfg({ zone: 'norte' }))).toBe(false);
    expect(isPlayable(leblon, cfg({ zone: 'sul' }))).toBe(true);
  });
});
