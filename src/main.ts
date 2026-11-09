/**
 * Temporary dev harness for the map (Phase 3). Replaced by the game UI in Phase 4.
 */
import './styles.css';
import { loadPlaces } from './data.ts';
import { MapView, type PlaceStatus } from './map/mapView.ts';
import type { Theme } from './map/style.ts';
import { ZONES, type PlaceProps, type ZoneFilter } from './types.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div id="map"></div>
  <div class="dev-panel">
    <label>Área
      <select id="area"><option value="rio">Só Rio</option><option value="grande-rio">Grande Rio</option></select>
    </label>
    <label>Zona
      <select id="zone"><option value="all">Todas</option>${ZONES.map((z) => `<option>${z}</option>`).join('')}</select>
    </label>
    <label><input type="checkbox" id="bg" /> Fundo</label>
    <button id="random">Destacar aleatório</button>
    <button id="clear">Limpar</button>
    <output id="out">Toque num lugar</output>
  </div>`;

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const theme = (): Theme => (darkQuery.matches ? 'dark' : 'light');

const data = await loadPlaces();
const view = new MapView({ container: document.getElementById('map')!, data, theme: theme() });
await view.whenReady();
darkQuery.addEventListener('change', () => view.setTheme(theme()));

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const area = $<HTMLSelectElement>('area');
const zone = $<HTMLSelectElement>('zone');
const out = $<HTMLOutputElement>('out');
const all = [...data.neighborhoods.features, ...data.municipalities.features].map(
  (f) => f.properties,
);

const playable = (p: PlaceProps) => {
  if (p.kind === 'municipality') return area.value === 'grande-rio';
  const z = zone.value as ZoneFilter;
  return z === 'all' || p.zone === z;
};

function applyFilters() {
  view.setShowMunicipalities(area.value === 'grande-rio');
  view.setPlayable(playable);
  const ids = all.filter(playable).map((p) => p.id);
  view.fitTo(zone.value === 'all' ? undefined : ids.filter((id) => id.startsWith('nb-')));
}
area.onchange = applyFilters;
zone.onchange = applyFilters;
$<HTMLInputElement>('bg').onchange = (e) =>
  view.setBackground((e.target as HTMLInputElement).checked);
$<HTMLButtonElement>('clear').onclick = () => {
  view.clearStatuses();
  view.highlight(null);
};
$<HTMLButtonElement>('random').onclick = () => {
  const pool = all.filter(playable);
  const p = pool[Math.floor(Math.random() * pool.length)];
  view.highlight(p.id);
  view.ensureVisible(p.id);
  out.textContent = `Destacado: ${p.name}`;
};

const statuses: PlaceStatus[] = ['correct1', 'correctLate', 'missed'];
let n = 0;
view.onPlaceClick((id) => {
  const p = view.getPlace(id)!;
  out.textContent = `${p.name}${p.zone ? ` (${p.zone})` : ''}`;
  if (id === view.highlighted) {
    view.setStatus(id, statuses[n++ % 3]);
    view.highlight(null);
  } else {
    view.flash(id);
  }
});
applyFilters();
// Exposed for automated visual checks.
Object.assign(window, { __view: view, __data: data });
