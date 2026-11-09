import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const RAW_DIR = join(ROOT, 'data/raw');
export const CURATED_DIR = join(ROOT, 'data/curated');
export const RAW_NEIGHBORHOODS = join(RAW_DIR, 'bairros.geojson');
export const RAW_MUNICIPALITIES = join(RAW_DIR, 'municipios-rj.geojson');
export const OUTPUT = join(ROOT, 'public/data/places.json');
