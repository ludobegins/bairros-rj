import { describe, expect, it } from 'vitest';
import { GameStorage, STORAGE_KEY, isBetter } from '../src/core/storage.ts';
import type { GameResult } from '../src/core/session.ts';
import { place } from './helpers.ts';

class MemoryBackend {
  store = new Map<string, string>();
  getItem = (k: string) => this.store.get(k) ?? null;
  setItem = (k: string, v: string) => void this.store.set(k, v);
  removeItem = (k: string) => void this.store.delete(k);
}

const throwing = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

function result(score: number, durationMs: number): GameResult {
  return {
    config: { mode: 'type', area: 'rio', zone: 'sul' },
    score,
    maxScore: 30,
    durationMs,
    finishedAt: 123,
    results: [
      { place: place({ id: 'a', name: 'A' }), correctOnAttempt: 1, skipped: false, points: 3 },
      { place: place({ id: 'b', name: 'B' }), correctOnAttempt: 3, skipped: false, points: 1 },
      { place: place({ id: 'c', name: 'C' }), correctOnAttempt: null, skipped: true, points: 0 },
    ],
  };
}

describe('isBetter', () => {
  it('compares by score then time', () => {
    expect(isBetter({ score: 10, durationMs: 1 }, undefined)).toBe(true);
    expect(isBetter({ score: 10, durationMs: 9 }, { score: 9, durationMs: 1, date: 0 })).toBe(true);
    expect(isBetter({ score: 10, durationMs: 5 }, { score: 10, durationMs: 6, date: 0 })).toBe(
      true,
    );
    expect(isBetter({ score: 10, durationMs: 6 }, { score: 10, durationMs: 6, date: 0 })).toBe(
      false,
    );
  });
});

describe('GameStorage', () => {
  it('records high scores per config and persists them', () => {
    const backend = new MemoryBackend();
    const s = new GameStorage(backend);
    expect(s.recordGame(result(20, 60000))).toEqual({ isNewRecord: true });
    expect(s.recordGame(result(15, 1000))).toEqual({ isNewRecord: false });
    expect(s.recordGame(result(20, 50000))).toEqual({ isNewRecord: true });

    const reloaded = new GameStorage(backend);
    expect(reloaded.getHighScore({ mode: 'type', area: 'rio', zone: 'sul' })).toEqual({
      score: 20,
      durationMs: 50000,
      date: 123,
    });
    expect(reloaded.getHighScore({ mode: 'click', area: 'rio', zone: 'sul' })).toBeUndefined();
  });

  it('accumulates per-place stats', () => {
    const s = new GameStorage(new MemoryBackend());
    s.recordGame(result(4, 1));
    s.recordGame(result(4, 1));
    expect(s.getPlaceStats()).toEqual({
      a: { asked: 2, correctByAttempt: [2, 0, 0], missed: 0 },
      b: { asked: 2, correctByAttempt: [0, 0, 2], missed: 0 },
      c: { asked: 2, correctByAttempt: [0, 0, 0], missed: 2 },
    });
    s.resetStats();
    expect(s.getPlaceStats()).toEqual({});
  });

  it('works in memory when storage throws or is missing', () => {
    for (const backend of [throwing, null]) {
      const s = new GameStorage(backend);
      expect(s.recordGame(result(10, 1))).toEqual({ isNewRecord: true });
      expect(s.getHighScore(result(0, 0).config)?.score).toBe(10);
    }
  });

  it('persists menu prefs', () => {
    const backend = new MemoryBackend();
    const prefs = {
      config: { mode: 'click', area: 'grande-rio', zone: 'norte' },
      background: true,
    } as const;
    new GameStorage(backend).setPrefs(prefs);
    expect(new GameStorage(backend).getPrefs()).toEqual(prefs);
  });

  it('ignores corrupt or foreign data', () => {
    const backend = new MemoryBackend();
    backend.setItem(STORAGE_KEY, '{not json');
    expect(new GameStorage(backend).getPlaceStats()).toEqual({});
    backend.setItem(STORAGE_KEY, JSON.stringify({ version: 99 }));
    expect(new GameStorage(backend).getPlaceStats()).toEqual({});
  });
});
