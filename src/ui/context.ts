import type { GameStorage } from '../core/storage.ts';
import type { GameResult, GameSession } from '../core/session.ts';
import type { MapView } from '../map/mapView.ts';
import type { GameConfig, PlaceProps } from '../types.ts';

/** Shared services available to every screen. */
export interface AppContext {
  view: MapView;
  places: PlaceProps[];
  storage: GameStorage;
  /** Container where screens render their panels. */
  root: HTMLElement;
  /** Current menu choices (kept in sync with prefs). */
  config: GameConfig;
  background: boolean;
  setConfig(config: GameConfig): void;
  setBackground(on: boolean): void;
  /** Applies area/zone of a config to the map (visibility, dimming, framing). */
  prepareMap(config: GameConfig, fit?: boolean): void;
  /** Re-measures panels covering the map; call after rendering, before framing. */
  updateInsets(): void;
  toast(message: string): void;
}

/** Navigation between screens. */
export interface Nav {
  menu(): void;
  play(config: GameConfig): void;
  results(session: GameSession, result: GameResult, isNewRecord: boolean): void;
  stats(): void;
}

/** A screen renders itself and returns a cleanup function. */
export type Screen = (ctx: AppContext, nav: Nav) => () => void;
