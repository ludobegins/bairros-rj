import {
  Map as MapLibreMap,
  setWorkerUrl,
  type ExpressionSpecification,
  type FilterSpecification,
  type LayerSpecification,
  type LngLatBoundsLike,
  type MapGeoJSONFeature,
  type Point,
  type PointLike,
  type StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre v6 loads its worker from a separate module; let Vite emit it as an asset.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { FeatureCollection, Geometry, Position } from 'geojson';
import type { PlaceProps } from '../types.ts';
import {
  BASEMAP_STYLE_URL,
  DATA_ATTRIBUTION,
  MAP_COLORS,
  type MapColors,
  type Theme,
} from './style.ts';

/** Visual status of a place, stored as MapLibre feature-state. */
export type PlaceStatus = 'default' | 'correct1' | 'correctLate' | 'missed';

export interface PlacesData {
  neighborhoods: FeatureCollection<Geometry, PlaceProps>;
  municipalities: FeatureCollection<Geometry, PlaceProps>;
}

type Bbox = [number, number, number, number];
type SourceId = 'neighborhoods' | 'municipalities';
const SOURCES: SourceId[] = ['neighborhoods', 'municipalities'];

setWorkerUrl(workerUrl);

/** Smallest on-screen size (px) a highlighted place should have. */
const MIN_VISIBLE_PX = 44;
/** Fill opacity of places outside the zone filter. */
const DIMMED_OPACITY = 0.3;
/** Prefix of layers copied from the basemap style. */
const BASEMAP_PREFIX = 'basemap-';
/** Tap tolerance (px) when the tap point hits no place (e.g. tiny islands). */
const TAP_TOLERANCE_PX = 10;
/** Whole RMRJ, with margin; the map can't be panned far away from it. */
const MAX_BOUNDS: LngLatBoundsLike = [
  [-44.6, -23.4],
  [-42.0, -22.0],
];

export interface MapViewOptions {
  container: HTMLElement;
  data: PlacesData;
  theme: Theme;
}

/**
 * Wraps MapLibre and exposes a small game-oriented API. Knows nothing about
 * game rules: callers tell it which places are playable and what to color.
 */
export class MapView {
  readonly map: MapLibreMap;
  private readonly places = new Map<string, { props: PlaceProps; source: SourceId; bbox: Bbox }>();
  private theme: Theme;
  private playable: (p: PlaceProps) => boolean = () => true;
  private showMunicipalities = true;
  private clickHandler: ((id: string) => void) | null = null;
  private hoveredId: string | null = null;
  private highlightedId: string | null = null;
  private pulseFrame = 0;
  private flashTimers = new Map<string, number>();
  private backgroundOn = false;
  /** Theme whose basemap layers are currently in the style (null = none loaded). */
  private basemapTheme: Theme | null = null;
  private basemapRequest = 0;
  private readonly ready: Promise<void>;

  constructor({ container, data, theme }: MapViewOptions) {
    this.theme = theme;
    for (const source of SOURCES) {
      for (const f of data[source].features) {
        this.places.set(f.properties.id, { props: f.properties, source, bbox: bboxOf(f.geometry) });
      }
    }

    this.map = new MapLibreMap({
      container,
      style: buildStyle(data, theme),
      bounds: this.boundsOf([...this.places.keys()].filter((id) => id.startsWith('nb-'))),
      fitBoundsOptions: { padding: 16 },
      maxBounds: MAX_BOUNDS,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: true },
    });
    this.map.touchZoomRotate.disableRotation();
    this.map.keyboard.disableRotation();

    this.ready = new Promise((resolve) => this.map.once('load', () => resolve()));
    this.map.on('click', (e) => this.handleClick(e.point));
    if (window.matchMedia('(hover: hover)').matches) {
      this.map.on('mousemove', (e) => this.handleHover(e.point));
      this.map.on('mouseout', () => this.setHover(null));
    }
  }

  whenReady(): Promise<void> {
    return this.ready;
  }

  getPlace(id: string): PlaceProps | undefined {
    return this.places.get(id)?.props;
  }

  onPlaceClick(handler: ((id: string) => void) | null): void {
    this.clickHandler = handler;
  }

  /** Show/hide the Metropolitan Region municipalities (Grande Rio vs. Só Rio). */
  setShowMunicipalities(show: boolean): void {
    this.showMunicipalities = show;
    const v = show ? 'visible' : 'none';
    for (const layer of ['municipalities-fill', 'municipalities-line']) {
      this.map.setLayoutProperty(layer, 'visibility', v);
    }
  }

  /** Places outside the predicate are dimmed and ignore clicks/hover. */
  setPlayable(predicate: (p: PlaceProps) => boolean): void {
    this.playable = predicate;
    for (const [id, { props }] of this.places) this.setState(id, { dimmed: !predicate(props) });
  }

  setBackground(on: boolean): void {
    this.backgroundOn = on;
    for (const source of SOURCES) {
      this.map.setPaintProperty(`${source}-fill`, 'fill-opacity', fillOpacity(on ? 0.55 : 1));
    }
    if (on && this.basemapTheme !== this.theme) void this.loadBasemap(this.theme);
    else this.setBasemapVisibility(on);
  }

  /** Copies the non-label layers of the themed basemap style under our layers. */
  private async loadBasemap(theme: Theme): Promise<void> {
    const request = ++this.basemapRequest;
    let style: StyleSpecification;
    try {
      const res = await fetch(BASEMAP_STYLE_URL[theme]);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      style = (await res.json()) as StyleSpecification;
    } catch (err) {
      console.warn('Basemap unavailable', err);
      return;
    }
    await this.ready;
    if (request !== this.basemapRequest) return; // superseded by a newer theme/toggle

    this.removeBasemap();
    for (const [id, source] of Object.entries(style.sources)) {
      this.map.addSource(BASEMAP_PREFIX + id, source);
    }
    for (const layer of style.layers) {
      if (layer.type === 'symbol') continue; // labels and icons
      const copy = { ...layer, id: BASEMAP_PREFIX + layer.id } as LayerSpecification;
      if ('source' in copy && typeof copy.source === 'string') {
        copy.source = BASEMAP_PREFIX + copy.source;
      }
      this.map.addLayer(copy, 'municipalities-fill');
    }
    this.basemapTheme = theme;
    this.setBasemapVisibility(this.backgroundOn);
  }

  private removeBasemap(): void {
    const style = this.map.getStyle();
    for (const layer of style.layers) {
      if (layer.id.startsWith(BASEMAP_PREFIX)) this.map.removeLayer(layer.id);
    }
    for (const id of Object.keys(style.sources)) {
      if (id.startsWith(BASEMAP_PREFIX)) this.map.removeSource(id);
    }
    this.basemapTheme = null;
  }

  private setBasemapVisibility(on: boolean): void {
    for (const layer of this.map.getStyle().layers) {
      if (layer.id.startsWith(BASEMAP_PREFIX)) {
        this.map.setLayoutProperty(layer.id, 'visibility', on ? 'visible' : 'none');
      }
    }
  }

  setTheme(theme: Theme): void {
    if (theme === this.theme) return;
    this.theme = theme;
    const c = MAP_COLORS[theme];
    this.map.setPaintProperty('background', 'background-color', c.background);
    for (const source of SOURCES) {
      this.map.setPaintProperty(`${source}-fill`, 'fill-color', fillColor(c, source));
      this.map.setPaintProperty(`${source}-line`, 'line-color', lineColor(c, source));
      this.map.setPaintProperty(`${source}-highlight`, 'fill-color', c.target);
    }
    if (this.backgroundOn) void this.loadBasemap(theme);
    else if (this.basemapTheme) this.removeBasemap();
  }

  setStatus(id: string, status: PlaceStatus): void {
    this.setState(id, { status });
  }

  clearStatuses(): void {
    for (const id of this.places.keys()) this.setState(id, { status: 'default', flash: false });
  }

  /** Briefly flashes a place (wrong click feedback). */
  flash(id: string, ms = 700): void {
    window.clearTimeout(this.flashTimers.get(id));
    this.setState(id, { flash: true });
    this.flashTimers.set(
      id,
      window.setTimeout(() => this.setState(id, { flash: false }), ms),
    );
  }

  /** Pulses one place (null to clear). */
  highlight(id: string | null): void {
    this.highlightedId = id;
    const filter: FilterSpecification = ['==', ['get', 'id'], id ?? ''];
    for (const source of SOURCES) this.map.setFilter(`${source}-highlight`, filter);
    cancelAnimationFrame(this.pulseFrame);
    if (!id) return;
    const start = performance.now();
    const tick = (t: number) => {
      const opacity = 0.55 + 0.4 * Math.sin(((t - start) / 600) * Math.PI);
      for (const source of SOURCES) {
        this.map.setPaintProperty(`${source}-highlight`, 'fill-opacity', opacity);
      }
      this.pulseFrame = requestAnimationFrame(tick);
    };
    this.pulseFrame = requestAnimationFrame(tick);
  }

  /**
   * Makes sure a place is on screen and at least MIN_VISIBLE_PX in size,
   * zooming in only as much as needed so the surroundings stay visible.
   */
  ensureVisible(id: string): void {
    const entry = this.places.get(id);
    if (!entry) return;
    const [w, s, e, n] = entry.bbox;
    const sw = this.map.project([w, s]);
    const ne = this.map.project([e, n]);
    const size = Math.min(Math.abs(ne.x - sw.x), Math.abs(sw.y - ne.y));
    const canvas = this.map.getCanvas();
    const { clientWidth: cw, clientHeight: ch } = canvas;
    const margin = 24;
    const onScreen =
      Math.min(sw.x, ne.x) >= margin &&
      Math.max(sw.x, ne.x) <= cw - margin &&
      Math.min(sw.y, ne.y) >= margin &&
      Math.max(sw.y, ne.y) <= ch - margin;

    const zoom = this.map.getZoom();
    const neededZoom =
      size < MIN_VISIBLE_PX ? zoom + Math.log2(MIN_VISIBLE_PX / Math.max(size, 1)) : zoom;
    if (onScreen && neededZoom === zoom) return;

    const center: [number, number] = [(w + e) / 2, (s + n) / 2];
    // If it would not fit after centering, zoom out to fit it.
    const fitZoom = this.map.cameraForBounds(entry.bbox, { padding: margin })?.zoom ?? zoom;
    this.map.easeTo({ center, zoom: Math.min(neededZoom, fitZoom), duration: 700 });
  }

  /** Frames the given places (or all visible places). */
  fitTo(ids?: string[], animate = true): void {
    const targets =
      ids ??
      [...this.places.entries()]
        .filter(([, p]) => p.source === 'neighborhoods' || this.showMunicipalities)
        .map(([id]) => id);
    const bounds = this.boundsOf(targets);
    if (bounds) this.map.fitBounds(bounds, { padding: 24, duration: animate ? 700 : 0 });
  }

  private boundsOf(ids: string[]): LngLatBoundsLike | undefined {
    if (ids.length === 0) return undefined;
    const b: Bbox = [Infinity, Infinity, -Infinity, -Infinity];
    for (const id of ids) {
      const bb = this.places.get(id)?.bbox;
      if (!bb) continue;
      b[0] = Math.min(b[0], bb[0]);
      b[1] = Math.min(b[1], bb[1]);
      b[2] = Math.max(b[2], bb[2]);
      b[3] = Math.max(b[3], bb[3]);
    }
    return [
      [b[0], b[1]],
      [b[2], b[3]],
    ];
  }

  private interactiveLayers(): string[] {
    return this.showMunicipalities
      ? ['neighborhoods-fill', 'municipalities-fill']
      : ['neighborhoods-fill'];
  }

  /** Playable place under a screen point, with a small tolerance for misses. */
  private placeAt(point: Point, tolerance: number): string | null {
    const layers = this.interactiveLayers();
    const pick = (features: MapGeoJSONFeature[]) =>
      features
        .map((f) => this.places.get(String(f.properties.id)))
        .find((p) => p && this.playable(p.props))?.props.id ?? null;

    const direct = this.map.queryRenderedFeatures(point, { layers });
    if (direct.length > 0) return pick(direct);
    if (tolerance === 0) return null;
    const box: [PointLike, PointLike] = [
      [point.x - tolerance, point.y - tolerance],
      [point.x + tolerance, point.y + tolerance],
    ];
    return pick(this.map.queryRenderedFeatures(box, { layers }));
  }

  private handleClick(point: Point): void {
    const id = this.placeAt(point, TAP_TOLERANCE_PX);
    if (id && this.clickHandler) this.clickHandler(id);
  }

  private handleHover(point: Point): void {
    const id = this.clickHandler ? this.placeAt(point, 0) : null;
    this.setHover(id);
    this.map.getCanvas().style.cursor = id ? 'pointer' : '';
  }

  private setHover(id: string | null): void {
    if (id === this.hoveredId) return;
    if (this.hoveredId) this.setState(this.hoveredId, { hover: false });
    this.hoveredId = id;
    if (id) this.setState(id, { hover: true });
  }

  private setState(id: string, state: Record<string, unknown>): void {
    const entry = this.places.get(id);
    if (!entry) return;
    const apply = () => this.map.setFeatureState({ source: entry.source, id }, state);
    if (this.map.loaded()) apply();
    else void this.ready.then(apply);
  }

  /** Currently pulsing place, if any. */
  get highlighted(): string | null {
    return this.highlightedId;
  }

  destroy(): void {
    cancelAnimationFrame(this.pulseFrame);
    this.map.remove();
  }
}

function fillColor(c: MapColors, source: SourceId): ExpressionSpecification {
  const base = source === 'municipalities' ? c.fillMunicipality : c.fill;
  return [
    'case',
    ['boolean', ['feature-state', 'flash'], false],
    c.missed,
    ['==', ['feature-state', 'status'], 'correct1'],
    c.correct1,
    ['==', ['feature-state', 'status'], 'correctLate'],
    c.correctLate,
    ['==', ['feature-state', 'status'], 'missed'],
    c.missed,
    ['boolean', ['feature-state', 'dimmed'], false],
    c.dimmed,
    ['boolean', ['feature-state', 'hover'], false],
    c.hover,
    base,
  ];
}

function fillOpacity(base: number): ExpressionSpecification {
  return ['case', ['boolean', ['feature-state', 'dimmed'], false], base * DIMMED_OPACITY, base];
}

function lineColor(c: MapColors, source: SourceId): string {
  return source === 'municipalities' ? c.lineMunicipality : c.line;
}

function buildStyle(data: PlacesData, theme: Theme): StyleSpecification {
  const c = MAP_COLORS[theme];
  const style: StyleSpecification = {
    version: 8,
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': c.background } }],
  };
  // Municipalities first so neighborhoods draw on top.
  for (const source of ['municipalities', 'neighborhoods'] as const) {
    style.sources[source] = {
      type: 'geojson',
      data: data[source],
      promoteId: 'id',
      attribution: source === 'neighborhoods' ? DATA_ATTRIBUTION : undefined,
    };
    style.layers.push(
      {
        id: `${source}-fill`,
        type: 'fill',
        source,
        paint: { 'fill-color': fillColor(c, source), 'fill-opacity': fillOpacity(1) },
      },
      {
        id: `${source}-highlight`,
        type: 'fill',
        source,
        filter: ['==', ['get', 'id'], ''],
        paint: { 'fill-color': c.target, 'fill-opacity': 0.8 },
      },
      {
        id: `${source}-line`,
        type: 'line',
        source,
        paint: {
          'line-color': lineColor(c, source),
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.4, 13, 1.2],
        },
      },
    );
  }
  return style;
}

function bboxOf(geometry: Geometry): Bbox {
  const b: Bbox = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (pos: Position) => {
    b[0] = Math.min(b[0], pos[0]);
    b[1] = Math.min(b[1], pos[1]);
    b[2] = Math.max(b[2], pos[0]);
    b[3] = Math.max(b[3], pos[1]);
  };
  if (geometry.type === 'Polygon') geometry.coordinates.forEach((r) => r.forEach(visit));
  else if (geometry.type === 'MultiPolygon')
    geometry.coordinates.forEach((p) => p.forEach((r) => r.forEach(visit)));
  return b;
}
