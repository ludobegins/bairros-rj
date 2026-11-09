/**
 * Map styling. The basemap is always on and always light (even with a dark UI):
 * a familiar, colorful map is what people orient themselves with.
 */
export const MAP_COLORS = {
  /** Shown only if the basemap fails to load. */
  background: '#f2efe9',
  fill: '#ffffff',
  line: '#3b3832',
  lineMunicipality: '#1f1d1a',
  casing: '#ffffff',
  dimmed: '#5c5c5c',
  hover: '#ffd43b',
  target: '#e8590c',
  correct1: '#2f9e44',
  correctLate: '#f0b400',
  missed: '#e03131',
} as const;

/** Fill opacities: places stay almost transparent so the basemap shows through. */
export const FILL_OPACITY = {
  default: 0.04,
  hover: 0.35,
  status: 0.5,
  flash: 0.65,
  dimmed: 0.45,
} as const;

/** OpenFreeMap "liberty" (OSM-like colors; free, no API key). */
export const BASEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/**
 * Basemap layers left out besides all symbol (label/icon) layers: 3D buildings
 * (no pitch in this game) and administrative boundaries (ours are drawn instead).
 */
export const BASEMAP_EXCLUDED_LAYERS = new Set([
  'building-3d',
  'boundary_2',
  'boundary_3',
  'boundary_disputed',
]);

export const DATA_ATTRIBUTION = 'Bairros: IPP/Prefeitura do Rio · Municípios: IBGE';
