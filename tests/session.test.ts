import { describe, expect, it } from 'vitest';
import { createMatcher } from '../src/core/matcher.ts';
import { GameSession, type Feedback } from '../src/core/session.ts';
import type { GameConfig } from '../src/types.ts';
import { normalize } from '../src/core/normalize.ts';
import { place } from './helpers.ts';

const places = ['Leblon', 'Ipanema', 'Gávea', 'Lagoa', 'Urca'].map((name) =>
  place({ id: normalize(name), name }),
);
const byId = new Map(places.map((p) => [p.id, p]));

function makeSession(questions = places.slice(0, 2), mode: GameConfig['mode'] = 'click') {
  let t = 1000;
  const clock = { advance: (ms: number) => (t += ms) };
  const session = new GameSession({
    config: { mode, area: 'rio', zone: 'all' },
    questions,
    placeById: (id) => byId.get(id),
    matcher: createMatcher(places),
    now: () => t,
  });
  return { session, clock };
}

describe('GameSession', () => {
  it('scores 3/2/1 depending on the attempt', () => {
    const { session } = makeSession(places.slice(0, 3));
    expect(session.answerByPlace('leblon')).toEqual({ type: 'correct', points: 3, attempt: 1 });
    session.next();
    session.answerByPlace('urca');
    expect(session.answerByPlace('ipanema')).toEqual({ type: 'correct', points: 2, attempt: 2 });
    session.next();
    session.answerByPlace('urca');
    session.answerByPlace('lagoa');
    expect(session.answerByPlace('gavea')).toEqual({ type: 'correct', points: 1, attempt: 3 });
    expect(session.score).toBe(6);
  });

  it('reveals after 3 wrong attempts with 0 points', () => {
    const { session } = makeSession();
    session.answerByPlace('urca');
    session.answerByPlace('lagoa');
    const fb = session.answerByPlace('gavea');
    expect(fb).toMatchObject({ type: 'wrong', attemptsLeft: 0, revealed: true });
    expect(session.phase).toBe('revealed');
    expect(session.results[0]).toMatchObject({ correctOnAttempt: null, points: 0, skipped: false });
  });

  it('ignores a repeated wrong click', () => {
    const { session } = makeSession();
    session.answerByPlace('urca');
    expect(session.answerByPlace('urca')).toEqual({ type: 'ignored' });
    expect(session.attemptsLeft).toBe(2);
  });

  it('ignores answers while revealed', () => {
    const { session } = makeSession();
    session.answerByPlace('leblon');
    expect(session.answerByPlace('ipanema')).toEqual({ type: 'ignored' });
  });

  it('skip gives 0 points and reveals', () => {
    const { session } = makeSession();
    expect(session.skip()).toEqual({ type: 'skipped' });
    expect(session.results[0]).toMatchObject({ skipped: true, points: 0 });
    expect(session.phase).toBe('revealed');
  });

  it('type mode: unknown names cost no attempt, other places do', () => {
    const { session } = makeSession(places.slice(0, 2), 'type');
    expect(session.answerByName('Atlântida')).toEqual({ type: 'unknown' });
    expect(session.attemptsLeft).toBe(3);
    expect(session.answerByName('urca')).toMatchObject({ type: 'wrong', attemptsLeft: 2 });
    expect(session.answerByName('Urca')).toEqual({ type: 'ignored' });
    expect(session.answerByName('leblom')).toEqual({ type: 'correct', points: 2, attempt: 2 });
  });

  it('finishes after the last question and reports the result', () => {
    const { session, clock } = makeSession();
    session.answerByPlace('leblon');
    session.next();
    clock.advance(5000);
    session.skip();
    clock.advance(9999); // waiting on the reveal screen doesn't count
    session.next();
    expect(session.phase).toBe('finished');
    expect(session.result()).toMatchObject({ score: 3, maxScore: 6, durationMs: 5000 });
  });

  it('notifies subscribers with feedback', () => {
    const { session } = makeSession();
    const seen: (Feedback | null)[] = [];
    session.subscribe((_, fb) => seen.push(fb));
    session.answerByPlace('urca');
    session.skip();
    session.next();
    expect(seen.map((f) => f?.type ?? null)).toEqual(['wrong', 'skipped', null]);
  });
});
