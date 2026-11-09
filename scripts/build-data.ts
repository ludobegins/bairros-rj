/**
 * Builds public/data/places.json (TopoJSON) from data/raw + data/curated.
 * Fails with a non-zero exit code if validation finds any problem.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import mapshaper from 'mapshaper';
import { buildPlaces, type BuildInput } from './lib/places.ts';
import { CURATED_DIR, OUTPUT, RAW_MUNICIPALITIES, RAW_NEIGHBORHOODS } from './lib/paths.ts';

/** Percentage of removable vertices to keep (Visvalingam). Tuned for size vs. shape. */
const SIMPLIFY = process.env.SIMPLIFY ?? '20%';
/** Size budget for the output file. */
const MAX_BYTES = 500 * 1024;

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(path, 'utf8')) as T;

const input: BuildInput = {
  neighborhoods: await readJson(RAW_NEIGHBORHOODS),
  municipalities: await readJson(RAW_MUNICIPALITIES),
  zones: await readJson(join(CURATED_DIR, 'zones.json')),
  rmrj: await readJson(join(CURATED_DIR, 'rmrj.json')),
  overrides: await readJson(join(CURATED_DIR, 'overrides.json')),
};

const { neighborhoods, municipalities, errors } = buildPlaces(input);
if (errors.length > 0) {
  console.error(`Validation failed with ${errors.length} error(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const commands = [
  '-i neighborhoods.json municipalities.json combine-files',
  // IBGE and IPP borders don't match exactly; cut any overlap with Rio out of the neighbors.
  '-erase neighborhoods target=municipalities',
  `-simplify ${SIMPLIFY} keep-shapes target=*`,
  '-clean target=*',
  '-o format=topojson quantization=100000 places.json target=*',
].join(' ');

const out = await mapshaper.applyCommands(commands, {
  'neighborhoods.json': neighborhoods,
  'municipalities.json': municipalities,
});
const topo = out['places.json'];
const text = typeof topo === 'string' ? topo : new TextDecoder().decode(topo);

// Sanity check: everything survived simplification/cleaning.
const parsed = JSON.parse(text) as {
  objects: Record<string, { geometries: { properties?: { id: string } }[] }>;
};
for (const [layer, expected] of [
  ['neighborhoods', neighborhoods.features.length],
  ['municipalities', municipalities.features.length],
] as const) {
  const got = parsed.objects[layer]?.geometries.filter((g) => g.properties?.id).length ?? 0;
  if (got !== expected) {
    console.error(`Layer ${layer}: expected ${expected} features, got ${got}`);
    process.exit(1);
  }
}

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, text);
const kb = (Buffer.byteLength(text) / 1024).toFixed(0);
console.log(
  `Wrote ${OUTPUT}: ${neighborhoods.features.length} neighborhoods, ` +
    `${municipalities.features.length} municipalities, ${kb} KB (simplify ${SIMPLIFY})`,
);
if (Buffer.byteLength(text) > MAX_BYTES) {
  console.error(`Output exceeds ${MAX_BYTES / 1024} KB budget; lower SIMPLIFY.`);
  process.exit(1);
}
