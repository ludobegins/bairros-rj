import type { GameConfig } from '../types.ts';
import type { GameResult } from './session.ts';

export const STORAGE_KEY = 'bairros-rj:v1';

export interface HighScore {
  score: number;
  durationMs: number;
  date: number;
}

export interface PlaceStats {
  asked: number;
  /** Correct answers on attempt 1, 2 and 3. */
  correctByAttempt: [number, number, number];
  missed: number;
}

/** Last menu choices, restored on the next visit. */
export interface Prefs {
  config: GameConfig;
}

interface StoredData {
  version: 1;
  highScores: Record<string, HighScore>;
  placeStats: Record<string, PlaceStats>;
  prefs?: Prefs;
}

type Backend = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function configKey(c: GameConfig): string {
  return `${c.mode}|${c.area}|${c.zone}`;
}

/** Higher score wins; on a tie, the faster time wins. */
export function isBetter(a: Pick<HighScore, 'score' | 'durationMs'>, b: HighScore | undefined) {
  return !b || a.score > b.score || (a.score === b.score && a.durationMs < b.durationMs);
}

function emptyData(): StoredData {
  return { version: 1, highScores: {}, placeStats: {} };
}

function defaultBackend(): Backend | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * High scores and per-place stats. Persists to localStorage when available and
 * silently falls back to memory when it isn't (private mode, blocked storage…).
 */
export class GameStorage {
  private data: StoredData;
  private readonly backend: Backend | null;

  constructor(backend: Backend | null = defaultBackend()) {
    this.backend = backend;
    this.data = this.load();
  }

  getHighScore(config: GameConfig): HighScore | undefined {
    return this.data.highScores[configKey(config)];
  }

  getPlaceStats(): Readonly<Record<string, PlaceStats>> {
    return this.data.placeStats;
  }

  /** Records a finished round. Returns whether it set a new high score. */
  recordGame(result: GameResult): { isNewRecord: boolean } {
    const key = configKey(result.config);
    const isNewRecord = isBetter(result, this.data.highScores[key]);
    if (isNewRecord) {
      this.data.highScores[key] = {
        score: result.score,
        durationMs: result.durationMs,
        date: result.finishedAt,
      };
    }
    for (const r of result.results) {
      const s = (this.data.placeStats[r.place.id] ??= {
        asked: 0,
        correctByAttempt: [0, 0, 0],
        missed: 0,
      });
      s.asked++;
      if (r.correctOnAttempt) s.correctByAttempt[r.correctOnAttempt - 1]++;
      else s.missed++;
    }
    this.save();
    return { isNewRecord };
  }

  getPrefs(): Prefs | undefined {
    return this.data.prefs;
  }

  setPrefs(prefs: Prefs): void {
    this.data.prefs = prefs;
    this.save();
  }

  resetStats(): void {
    this.data.placeStats = {};
    this.save();
  }

  private load(): StoredData {
    try {
      const raw = this.backend?.getItem(STORAGE_KEY);
      if (!raw) return emptyData();
      const parsed = JSON.parse(raw) as Partial<StoredData>;
      if (parsed.version !== 1) return emptyData();
      return { ...emptyData(), ...parsed } as StoredData;
    } catch {
      return emptyData();
    }
  }

  private save(): void {
    try {
      this.backend?.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Keep working from memory.
    }
  }
}
