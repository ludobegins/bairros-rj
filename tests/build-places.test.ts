import { describe, expect, it } from 'vitest';
import type { Polygon } from 'geojson';
import { buildPlaces, type BuildInput } from '../scripts/lib/places.ts';

const square: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ],
};

function input(overrides: Partial<BuildInput> = {}): BuildInput {
  return {
    neighborhoods: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: square,
          properties: { nome: 'Freguesia (Ilha)', codbairro: '098' },
        },
        {
          type: 'Feature',
          geometry: square,
          properties: { nome: 'Freguesia (Jacarepaguá)', codbairro: '120' },
        },
        { type: 'Feature', geometry: square, properties: { nome: 'Leblon', codbairro: '026' } },
      ],
    },
    municipalities: {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: square, properties: { codarea: '3303302' } }],
    },
    zones: {
      norte: ['Freguesia (Ilha)'],
      sudoeste: ['Freguesia (Jacarepaguá)'],
      sul: ['Leblon'],
    },
    rmrj: { municipalities: [{ ibge: '3303302', name: 'Niterói' }] },
    overrides: {
      places: {
        'Freguesia (Ilha)': {
          displayName: 'Freguesia (Ilha do Governador)',
          aliases: ['Freguesia'],
        },
        'Freguesia (Jacarepaguá)': { aliases: ['Freguesia'] },
      },
    },
    ...overrides,
  };
}

describe('buildPlaces', () => {
  it('builds neighborhoods and municipalities with ids, zones and aliases', () => {
    const out = buildPlaces(input());
    expect(out.errors).toEqual([]);
    expect(out.neighborhoods.features.map((f) => f.properties)).toEqual([
      {
        id: 'nb-098',
        kind: 'neighborhood',
        zone: 'norte',
        name: 'Freguesia (Ilha do Governador)',
        aliases: ['Freguesia (Ilha)', 'Freguesia'],
      },
      {
        id: 'nb-120',
        kind: 'neighborhood',
        zone: 'sudoeste',
        name: 'Freguesia (Jacarepaguá)',
        aliases: ['Freguesia'],
      },
      { id: 'nb-026', kind: 'neighborhood', zone: 'sul', name: 'Leblon', aliases: [] },
    ]);
    expect(out.municipalities.features[0].properties).toEqual({
      id: 'mun-3303302',
      kind: 'municipality',
      name: 'Niterói',
      aliases: [],
    });
  });

  it('allows an alias shared by several places', () => {
    expect(buildPlaces(input()).errors).toEqual([]);
  });

  it('reports a neighborhood without zone and unknown zone entries', () => {
    const { errors } = buildPlaces(input({ zones: { norte: ['Freguesia (Ilha)', 'Atlantis'] } }));
    expect(errors).toContain('neighborhood "Leblon" has no zone');
    expect(errors).toContain('zones: "Atlantis" is not a known neighborhood');
  });

  it('reports a neighborhood listed in two zones', () => {
    const base = input();
    const { errors } = buildPlaces({ ...base, zones: { ...base.zones, oeste: ['Leblon'] } });
    expect(errors).toContain('zones: "Leblon" listed in more than one zone');
  });

  it('reports unknown municipalities and overrides', () => {
    const { errors } = buildPlaces(
      input({
        rmrj: { municipalities: [{ ibge: '999', name: 'Nowhere' }] },
        overrides: { places: { Atlantis: { aliases: ['A'] } } },
      }),
    );
    expect(errors).toContain('rmrj: IBGE code 999 (Nowhere) not found in municipal mesh');
    expect(errors).toContain('overrides: "Atlantis" is not a known place');
  });

  it('rejects an alias equal to another place name', () => {
    const { errors } = buildPlaces(
      input({ overrides: { places: { Niterói: { aliases: ['Leblon'] } } } }),
    );
    expect(errors).toContain(
      'alias "Leblon" of mun-3303302 (Niterói) collides with the name of nb-026',
    );
  });

  it('rejects empty geometry', () => {
    const base = input();
    base.neighborhoods.features[2].geometry = { type: 'Polygon', coordinates: [] };
    expect(buildPlaces(base).errors).toContain('nb-026 (Leblon) has empty geometry');
  });
});
