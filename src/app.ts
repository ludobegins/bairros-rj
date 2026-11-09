import { isPlayable } from './core/round.ts';
import { GameStorage } from './core/storage.ts';
import { loadPlaces } from './data.ts';
import { MapView, loadBasemapStyle } from './map/mapView.ts';
import type { GameConfig } from './types.ts';
import type { AppContext, Nav } from './ui/context.ts';
import { h } from './ui/dom.ts';
import { gameScreen } from './ui/game.ts';
import { menuScreen } from './ui/menu.ts';
import { resultsScreen } from './ui/results.ts';
import { statsScreen } from './ui/stats.ts';

const DEFAULT_CONFIG: GameConfig = { mode: 'type', area: 'rio', zone: 'all' };

export async function startApp(app: HTMLElement): Promise<void> {
  const mapEl = h('div', { id: 'map' });
  const root = h('div', { class: 'overlay' });
  const toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
  app.append(mapEl, root, toastEl);
  trackKeyboard();

  const [data, basemap] = await Promise.all([loadPlaces(), loadBasemapStyle()]);
  const view = new MapView({ container: mapEl, data, basemap });

  const updateInsets = watchInsets(root, view);

  const storage = new GameStorage();
  const prefs = storage.getPrefs();
  let toastTimer = 0;

  const ctx: AppContext = {
    view,
    places: [...data.neighborhoods.features, ...data.municipalities.features].map(
      (f) => f.properties,
    ),
    storage,
    root,
    config: prefs?.config ?? DEFAULT_CONFIG,
    setConfig(config) {
      ctx.config = config;
      storage.setPrefs({ config });
    },
    prepareMap(config, fit = true) {
      view.setShowMunicipalities(config.area === 'grande-rio');
      view.setPlayable((p) => isPlayable(p, config));
      if (!fit) return;
      if (config.zone === 'all') view.fitTo();
      else
        view.fitTo(
          ctx.places
            .filter((p) => p.kind === 'neighborhood' && p.zone === config.zone)
            .map((p) => p.id),
        );
    },
    updateInsets,
    toast(message) {
      toastEl.textContent = message;
      toastEl.classList.add('visible');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toastEl.classList.remove('visible'), 2200);
    },
  };

  let cleanup: (() => void) | null = null;
  const show = (render: () => () => void) => {
    cleanup?.();
    cleanup = render();
  };
  const nav: Nav = {
    menu: () => show(() => menuScreen(ctx, nav)),
    stats: () => show(() => statsScreen(ctx, nav)),
    play: (config) => show(() => gameScreen(ctx, nav, config)),
    results: (_session, result, isNewRecord) =>
      show(() => resultsScreen(ctx, nav, result, isNewRecord)),
  };

  await view.whenReady();
  nav.menu();
  if (import.meta.env.DEV) Object.assign(window, { __view: view, __ctx: ctx, __nav: nav });
}

/**
 * Measures the panels shown over the map and passes the covered screen edges to
 * the map, so framing and zoom-to-place keep targets in the uncovered area.
 * Must run before screens render so their initial framing uses fresh insets.
 */
function watchInsets(root: HTMLElement, view: MapView): () => void {
  const measure = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const insets = { top: 0, right: 0, bottom: 0, left: 0 };
    for (const el of root.children) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.width > vw * 0.6) {
        // Full-width bar: top or bottom.
        if (r.top + r.height / 2 < vh / 2) insets.top = Math.max(insets.top, r.bottom);
        else insets.bottom = Math.max(insets.bottom, vh - r.top);
      } else if (r.left < vw / 3) {
        insets.left = Math.max(insets.left, r.right);
      } else if (r.top + r.height / 2 < vh / 2) {
        insets.top = Math.max(insets.top, r.bottom);
      } else {
        insets.bottom = Math.max(insets.bottom, vh - r.top);
      }
    }
    view.setInsets(insets);
  };
  const resizeObserver = new ResizeObserver(measure);
  new MutationObserver(() => {
    resizeObserver.disconnect();
    for (const el of root.children) resizeObserver.observe(el);
    measure();
  }).observe(root, { childList: true });
  window.addEventListener('resize', measure);
  return measure;
}

/**
 * Exposes the on-screen keyboard height as --keyboard so bottom panels can sit
 * above it (iOS Safari doesn't resize the layout viewport).
 */
function trackKeyboard(): void {
  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--keyboard', `${kb}px`);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
}
