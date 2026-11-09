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
  BASEMAP_EXCLUDED_LAYERS,
  BASEMAP_STYLE_URL,
  DATA_ATTRIBUTION,
  FILL_OPACITY,
  MAP_COLORS,
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
/** Prefix of layers/sources copied from the basemap style. */
const BASEMAP_PREFIX = 'basemap-';
/** Tap tolerance (px) when the tap point hits no place (e.g. tiny islands). */
const TAP_TOLERANCE_PX = 10;
/**
 * Whole RMRJ with a generous margin, so the map can't be panned far away but can
 * still shift a place into the free area above a bottom panel on phones.
 */
const MAX_BOUNDS: LngLatBoundsLike = [
  [-45.5, -24.6],
  [-41.5, -21.4],
];

/** Screen space (px) covered by UI panels on each side of the map. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface MapViewOptions {
  container: HTMLElement;
  data: PlacesData;
  /** Basemap style (see loadBasemapStyle); null draws a plain background. */
  basemap: StyleSpecification | null;
}

/** Fetches the basemap style; resolves to null if it's unavailable. */
export async function loadBasemapStyle(): Promise<StyleSpecification | null> {
  try {
    const res = await fetch(BASEMAP_STYLE_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as StyleSpecification;
  } catch (err) {
    console.warn('Basemap unavailable', err);
    return null;
  }
}

/**
 * Wraps MapLibre and exposes a small game-oriented API. Knows nothing about
 * game rules: callers tell it which places are playable and what to color.
 */
export class MapView {
  readonly map: MapLibreMap;
  private readonly places = new Map<string, { props: PlaceProps; source: SourceId; bbox: Bbox }>();
  private playable: (p: PlaceProps) => boolean = () => true;
  private showMunicipalities = true;
  private clickHandler: ((id: string) => void) | null = null;
  private hoveredId: string | null = null;
  private highlightedId: string | null = null;
  private pulseFrame = 0;
  private flashTimers = new Map<string, number>();
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private readonly ready: Promise<void>;

  constructor({ container, data, basemap }: MapViewOptions) {
    for (const source of SOURCES) {
      for (const f of data[source].features) {
        this.places.set(f.properties.id, { props: f.properties, source, bbox: bboxOf(f.geometry) });
      }
    }

    this.map = new MapLibreMap({
      container,
      style: buildStyle(data, basemap),
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
    for (const layer of ['fill', 'highlight', 'casing', 'line'].map((l) => `municipalities-${l}`)) {
      this.map.setLayoutProperty(layer, 'visibility', v);
    }
  }

  /** Places outside the predicate are dimmed and ignore clicks/hover. */
  setPlayable(predicate: (p: PlaceProps) => boolean): void {
    this.playable = predicate;
    for (const [id, { props }] of this.places) this.setState(id, { dimmed: !predicate(props) });
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
    let last = 0;
    const tick = (t: number) => {
      // ~20 fps is smooth enough for a pulse and spares mobile batteries.
      if (t - last >= 50) {
        last = t;
        const opacity = 0.45 + 0.3 * Math.sin(((t - start) / 600) * Math.PI);
        for (const source of SOURCES) {
          this.map.setPaintProperty(`${source}-highlight`, 'fill-opacity', opacity);
        }
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
    const pad = this.padding(24);
    const onScreen =
      Math.min(sw.x, ne.x) >= pad.left &&
      Math.max(sw.x, ne.x) <= cw - pad.right &&
      Math.min(sw.y, ne.y) >= pad.top &&
      Math.max(sw.y, ne.y) <= ch - pad.bottom;

    const zoom = this.map.getZoom();
    const neededZoom =
      size < MIN_VISIBLE_PX ? zoom + Math.log2(MIN_VISIBLE_PX / Math.max(size, 1)) : zoom;
    if (onScreen && neededZoom === zoom) return;

    const center: [number, number] = [(w + e) / 2, (s + n) / 2];
    // If it would not fit after centering, zoom out to fit it.
    const fitZoom = this.map.cameraForBounds(entry.bbox, { padding: pad })?.zoom ?? zoom;
    // Center it in the uncovered part of the screen.
    const offset: [number, number] = [(pad.left - pad.right) / 2, (pad.top - pad.bottom) / 2];
    this.map.easeTo({ center, offset, zoom: Math.min(neededZoom, fitZoom), duration: 700 });
  }

  /** Tells the map which parts of the screen are covered by UI panels. */
  setInsets(insets: Insets): void {
    this.insets = insets;
  }

  /** Insets plus a margin, as MapLibre padding. */
  private padding(margin: number) {
    const i = this.insets;
    return {
      top: i.top + margin,
      right: i.right + margin,
      bottom: i.bottom + margin,
      left: i.left + margin,
    };
  }

  /** Frames the given places (or all visible places). */
  fitTo(ids?: string[], animate = true): void {
    const targets =
      ids ??
      [...this.places.entries()]
        .filter(([, p]) => p.source === 'neighborhoods' || this.showMunicipalities)
        .map(([id]) => id);
    const bounds = this.boundsOf(targets);
    if (bounds) {
      this.map.fitBounds(bounds, { padding: this.padding(24), duration: animate ? 700 : 0 });
    }
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

const featureFlag = (name: string): ExpressionSpecification => [
  'boolean',
  ['feature-state', name],
  false,
];
const hasStatus: ExpressionSpecification = [
  'all',
  ['!=', ['feature-state', 'status'], null],
  ['!=', ['feature-state', 'status'], 'default'],
];

const FILL_COLOR: ExpressionSpecification = [
  'case',
  featureFlag('flash'),
  MAP_COLORS.missed,
  ['==', ['feature-state', 'status'], 'correct1'],
  MAP_COLORS.correct1,
  ['==', ['feature-state', 'status'], 'correctLate'],
  MAP_COLORS.correctLate,
  ['==', ['feature-state', 'status'], 'missed'],
  MAP_COLORS.missed,
  featureFlag('dimmed'),
  MAP_COLORS.dimmed,
  featureFlag('hover'),
  MAP_COLORS.hover,
  MAP_COLORS.fill,
];

const FILL_OPACITY_EXPR: ExpressionSpecification = [
  'case',
  featureFlag('flash'),
  FILL_OPACITY.flash,
  hasStatus,
  FILL_OPACITY.status,
  featureFlag('dimmed'),
  FILL_OPACITY.dimmed,
  featureFlag('hover'),
  FILL_OPACITY.hover,
  FILL_OPACITY.default,
];

/** Our place layers on top of the basemap's non-label layers. */
function buildStyle(data: PlacesData, basemap: StyleSpecification | null): StyleSpecification {
  const style: StyleSpecification = {
    version: 8,
    sources: {},
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': MAP_COLORS.background },
      },
    ],
  };

  if (basemap) {
    if (basemap.sprite) style.sprite = basemap.sprite; // needed by pattern fills
    for (const [id, source] of Object.entries(basemap.sources)) {
      style.sources[BASEMAP_PREFIX + id] = source;
    }
    for (const layer of basemap.layers) {
      if (layer.type === 'symbol' || BASEMAP_EXCLUDED_LAYERS.has(layer.id)) continue;
      const copy = { ...layer, id: BASEMAP_PREFIX + layer.id } as LayerSpecification;
      if ('source' in copy && typeof copy.source === 'string') {
        copy.source = BASEMAP_PREFIX + copy.source;
      }
      style.layers.push(copy);
    }
  }

  // Municipalities first so neighborhoods draw on top.
  for (const source of ['municipalities', 'neighborhoods'] as const) {
    const isMun = source === 'municipalities';
    style.sources[source] = {
      type: 'geojson',
      data: data[source],
      promoteId: 'id',
      attribution: isMun ? undefined : DATA_ATTRIBUTION,
    };
    // [zoom, width] stops; zoom expressions must be the outermost interpolate.
    const stops = isMun
      ? [
          [8, 1],
          [13, 2.5],
        ]
      : [
          [9, 0.6],
          [12, 1.4],
          [15, 2.5],
        ];
    const width = (extra: number): ExpressionSpecification => [
      'interpolate',
      ['linear'],
      ['zoom'],
      ...stops.flatMap(([z, w]) => [z, w + extra]),
    ];
    style.layers.push(
      {
        id: `${source}-fill`,
        type: 'fill',
        source,
        paint: { 'fill-color': FILL_COLOR, 'fill-opacity': FILL_OPACITY_EXPR },
      },
      {
        id: `${source}-highlight`,
        type: 'fill',
        source,
        filter: ['==', ['get', 'id'], ''],
        paint: { 'fill-color': MAP_COLORS.target, 'fill-opacity': 0.6 },
      },
      {
        // Light halo under the border so it stays legible over a busy basemap.
        id: `${source}-casing`,
        type: 'line',
        source,
        paint: {
          'line-color': MAP_COLORS.casing,
          'line-opacity': 0.7,
          'line-width': width(2),
        },
      },
      {
        id: `${source}-line`,
        type: 'line',
        source,
        paint: {
          'line-color': isMun ? MAP_COLORS.lineMunicipality : MAP_COLORS.line,
          'line-width': width(0),
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
