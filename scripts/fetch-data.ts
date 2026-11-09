/**
 * Downloads raw boundary data into data/raw/ (gitignored).
 * Sources are documented in data/README.md.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { RAW_DIR, RAW_MUNICIPALITIES, RAW_NEIGHBORHOODS } from './lib/paths.ts';

const SOURCES = [
  {
    // Prefeitura do Rio / IPP — "Limite de Bairros" (ArcGIS MapServer layer 4)
    file: RAW_NEIGHBORHOODS,
    url:
      'https://pgeo3.rio.rj.gov.br/arcgis/rest/services/Cartografia/Limites_administrativos/MapServer/4/query' +
      '?where=1%3D1&outFields=nome,codbairro,area_plane,rp&outSR=4326&f=geojson',
  },
  {
    // IBGE malhas API — municipalities of Rio de Janeiro state (UF 33)
    file: RAW_MUNICIPALITIES,
    url:
      'https://servicodados.ibge.gov.br/api/v3/malhas/estados/33' +
      '?formato=application/vnd.geo%2Bjson&intrarregiao=municipio&qualidade=maxima',
  },
];

await mkdir(RAW_DIR, { recursive: true });

for (const { file, url } of SOURCES) {
  process.stdout.write(`Downloading ${file} ... `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const body = await res.text();
  const json = JSON.parse(body) as { features?: unknown[] };
  if (!Array.isArray(json.features) || json.features.length === 0) {
    throw new Error(`No features in response from ${url}`);
  }
  await writeFile(file, body);
  console.log(`${json.features.length} features`);
}
