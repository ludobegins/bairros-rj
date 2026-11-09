/** Map colors per theme. UI colors live in styles.css; these feed MapLibre paint properties. */
export type Theme = 'light' | 'dark';

export interface MapColors {
  background: string;
  fill: string;
  fillMunicipality: string;
  line: string;
  lineMunicipality: string;
  dimmed: string;
  hover: string;
  target: string;
  correct1: string;
  correctLate: string;
  missed: string;
}

export const MAP_COLORS: Record<Theme, MapColors> = {
  light: {
    background: '#cfe3ee',
    fill: '#f4f1ea',
    fillMunicipality: '#e3ded3',
    line: '#7d776c',
    lineMunicipality: '#a39d91',
    dimmed: '#dcd8d0',
    hover: '#ffe9a8',
    target: '#e8590c',
    correct1: '#2f9e44',
    correctLate: '#f0b400',
    missed: '#e03131',
  },
  dark: {
    background: '#0f1b24',
    fill: '#2b2f36',
    fillMunicipality: '#24272d',
    line: '#7c8592',
    lineMunicipality: '#5b626d',
    dimmed: '#1c1f24',
    hover: '#5c5230',
    target: '#ff8a3d',
    correct1: '#40c057',
    correctLate: '#fcc419',
    missed: '#ff6b6b',
  },
};

/**
 * Vector basemap styles (OpenFreeMap, free, no API key) used when the background
 * toggle is on. Only their non-label layers are used, so no names are shown.
 */
export const BASEMAP_STYLE_URL: Record<Theme, string> = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

export const DATA_ATTRIBUTION = 'Bairros: IPP/Prefeitura do Rio · Municípios: IBGE';
