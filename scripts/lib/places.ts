/**
 * Pure functions that turn raw source data + curated files into place features.
 * Kept free of I/O so they can be unit-tested.
 */
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { normalize } from '../../src/core/normalize.ts';
import { ZONES, type PlaceProps, type Zone } from '../../src/types.ts';

export interface RawNeighborhoodProps {
  nome: string;
  codbairro: string;
}
export interface RawMunicipalityProps {
  codarea: string;
}
export type ZonesFile = { _notes?: string[] } & Partial<Record<Zone, string[]>>;
export interface RmrjFile {
  municipalities: { ibge: string; name: string }[];
}
export interface OverridesFile {
  places: Record<string, { displayName?: string; aliases?: string[] }>;
}

export interface BuildInput {
  neighborhoods: FeatureCollection<Geometry, RawNeighborhoodProps>;
  municipalities: FeatureCollection<Geometry, RawMunicipalityProps>;
  zones: ZonesFile;
  rmrj: RmrjFile;
  overrides: OverridesFile;
}

export interface BuildOutput {
  neighborhoods: FeatureCollection<Geometry, PlaceProps>;
  municipalities: FeatureCollection<Geometry, PlaceProps>;
  errors: string[];
}

export function buildPlaces(input: BuildInput): BuildOutput {
  const errors: string[] = [];
  const usedOverrides = new Set<string>();

  // Official neighborhood name → zone, checking each name appears exactly once.
  const zoneByName = new Map<string, Zone>();
  for (const zone of ZONES) {
    for (const name of input.zones[zone] ?? []) {
      if (zoneByName.has(name)) errors.push(`zones: "${name}" listed in more than one zone`);
      zoneByName.set(name, zone);
    }
  }
  for (const key of Object.keys(input.zones)) {
    if (key !== '_notes' && !ZONES.includes(key as Zone))
      errors.push(`zones: unknown zone "${key}"`);
  }

  function makeProps(officialName: string, base: Omit<PlaceProps, 'name' | 'aliases'>): PlaceProps {
    const override = input.overrides.places[officialName];
    if (override) usedOverrides.add(officialName);
    const name = override?.displayName ?? officialName;
    const aliases = uniqueByNormalized([officialName, ...(override?.aliases ?? [])]).filter(
      (a) => normalize(a) !== normalize(name),
    );
    return { ...base, name, aliases };
  }

  const neighborhoods: Feature<Geometry, PlaceProps>[] = [];
  const seenRawNames = new Set<string>();
  for (const f of input.neighborhoods.features) {
    const { nome, codbairro } = f.properties;
    seenRawNames.add(nome);
    const zone = zoneByName.get(nome);
    if (!zone) errors.push(`neighborhood "${nome}" has no zone`);
    neighborhoods.push({
      type: 'Feature',
      geometry: f.geometry,
      properties: makeProps(nome, { id: `nb-${codbairro}`, kind: 'neighborhood', zone }),
    });
  }
  for (const name of zoneByName.keys()) {
    if (!seenRawNames.has(name)) errors.push(`zones: "${name}" is not a known neighborhood`);
  }

  const rawMunByCode = new Map(input.municipalities.features.map((f) => [f.properties.codarea, f]));
  const municipalities: Feature<Geometry, PlaceProps>[] = [];
  for (const { ibge, name } of input.rmrj.municipalities) {
    const raw = rawMunByCode.get(ibge);
    if (!raw) {
      errors.push(`rmrj: IBGE code ${ibge} (${name}) not found in municipal mesh`);
      continue;
    }
    municipalities.push({
      type: 'Feature',
      geometry: raw.geometry,
      properties: makeProps(name, { id: `mun-${ibge}`, kind: 'municipality' }),
    });
  }

  for (const key of Object.keys(input.overrides.places)) {
    if (!usedOverrides.has(key)) errors.push(`overrides: "${key}" is not a known place`);
  }

  errors.push(...validatePlaces([...neighborhoods, ...municipalities]));

  return {
    neighborhoods: { type: 'FeatureCollection', features: neighborhoods },
    municipalities: { type: 'FeatureCollection', features: municipalities },
    errors,
  };
}

export function validatePlaces(features: Feature<Geometry | null, PlaceProps>[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const nameOwner = new Map<string, string>(); // normalized display name → id

  for (const { properties: p, geometry } of features) {
    if (ids.has(p.id)) errors.push(`duplicate id ${p.id}`);
    ids.add(p.id);
    if (!geometry || !hasCoordinates(geometry))
      errors.push(`${p.id} (${p.name}) has empty geometry`);
    const n = normalize(p.name);
    if (nameOwner.has(n)) errors.push(`duplicate name "${p.name}" (${nameOwner.get(n)}, ${p.id})`);
    nameOwner.set(n, p.id);
  }

  // An alias may be shared between places, but must never equal another place's name.
  for (const { properties: p } of features) {
    for (const alias of p.aliases) {
      const owner = nameOwner.get(normalize(alias));
      if (owner && owner !== p.id) {
        errors.push(`alias "${alias}" of ${p.id} (${p.name}) collides with the name of ${owner}`);
      }
    }
  }
  return errors;
}

function hasCoordinates(g: Geometry): boolean {
  switch (g.type) {
    case 'Polygon':
      return g.coordinates.length > 0 && g.coordinates[0].length >= 4;
    case 'MultiPolygon':
      return g.coordinates.some((poly) => poly.length > 0 && poly[0].length >= 4);
    default:
      return false;
  }
}

function uniqueByNormalized(names: string[]): string[] {
  const seen = new Set<string>();
  return names.filter((n) => {
    const key = normalize(n);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
