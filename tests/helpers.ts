import { readFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { PlaceProps } from '../src/types.ts';

export function place(p: Partial<PlaceProps> & Pick<PlaceProps, 'id' | 'name'>): PlaceProps {
  return { kind: 'neighborhood', aliases: [], ...p };
}

/** Deterministic RNG (mulberry32) for reproducible draws. */
export function seededRng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Loads the real generated data set. */
export function loadRealPlaces(): PlaceProps[] {
  const topo = JSON.parse(
    readFileSync(new URL('../public/data/places.json', import.meta.url), 'utf8'),
  ) as Topology<Record<string, GeometryCollection<PlaceProps>>>;
  return Object.values(topo.objects).flatMap((obj) =>
    feature(topo, obj).features.map((f) => f.properties as PlaceProps),
  );
}
