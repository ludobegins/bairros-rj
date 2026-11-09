import type { GameConfig, PlaceProps } from '../types.ts';
import type { Matcher } from './matcher.ts';

export const MAX_ATTEMPTS = 3;
/** Points for a correct answer on attempt 1, 2, 3. */
export const POINTS_BY_ATTEMPT = [3, 2, 1] as const;

export type Phase = 'asking' | 'revealed' | 'finished';

export interface QuestionResult {
  place: PlaceProps;
  /** Attempt number (1–3) on which it was answered; null if missed/skipped. */
  correctOnAttempt: number | null;
  skipped: boolean;
  points: number;
}

export type Feedback =
  | { type: 'correct'; points: number; attempt: number }
  /** A real but different place. `revealed` is true when attempts ran out. */
  | { type: 'wrong'; guessed: PlaceProps; attemptsLeft: number; revealed: boolean }
  /** Typed name matches no known place; no attempt used. */
  | { type: 'unknown' }
  /** Click on a place already tried for this question, or action not allowed now. */
  | { type: 'ignored' }
  | { type: 'skipped' };

export interface GameResult {
  config: GameConfig;
  score: number;
  maxScore: number;
  durationMs: number;
  results: QuestionResult[];
  finishedAt: number;
}

export interface SessionOptions {
  config: GameConfig;
  questions: PlaceProps[];
  /** Resolves a place id to its props (for click answers). */
  placeById: (id: string) => PlaceProps | undefined;
  /** Needed for type mode. */
  matcher?: Matcher;
  now?: () => number;
}

export type Listener = (session: GameSession, feedback: Feedback | null) => void;

/**
 * Game state machine for one round:
 * asking → (wrong → asking)* → revealed → next() → asking … → finished.
 */
export class GameSession {
  readonly config: GameConfig;
  readonly questions: readonly PlaceProps[];
  readonly results: QuestionResult[] = [];
  readonly startedAt: number;

  private _phase: Phase = 'asking';
  private _index = 0;
  private _wrongIds = new Set<string>();
  private _endedAt: number | null = null;
  private listeners = new Set<Listener>();
  private readonly placeById: SessionOptions['placeById'];
  private readonly matcher?: Matcher;
  private readonly now: () => number;

  constructor(opts: SessionOptions) {
    if (opts.questions.length === 0) throw new Error('A round needs at least one question');
    this.config = opts.config;
    this.questions = opts.questions;
    this.placeById = opts.placeById;
    this.matcher = opts.matcher;
    this.now = opts.now ?? Date.now;
    this.startedAt = this.now();
  }

  get phase(): Phase {
    return this._phase;
  }
  get index(): number {
    return this._index;
  }
  get current(): PlaceProps {
    return this.questions[this._index];
  }
  get attemptsUsed(): number {
    return this._wrongIds.size;
  }
  get attemptsLeft(): number {
    return MAX_ATTEMPTS - this._wrongIds.size;
  }
  /** Places wrongly guessed for the current question. */
  get wrongIds(): ReadonlySet<string> {
    return this._wrongIds;
  }
  get score(): number {
    return this.results.reduce((sum, r) => sum + r.points, 0);
  }
  get maxScore(): number {
    return this.questions.length * POINTS_BY_ATTEMPT[0];
  }
  get isLastQuestion(): boolean {
    return this._index === this.questions.length - 1;
  }
  elapsedMs(): number {
    return (this._endedAt ?? this.now()) - this.startedAt;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  answerByName(input: string): Feedback {
    if (!this.matcher) throw new Error('answerByName requires a matcher');
    if (this._phase !== 'asking') return this.emit({ type: 'ignored' });
    const match = this.matcher(input, this.current.id);
    switch (match.kind) {
      case 'correct':
        return this.emit(this.resolveCorrect());
      case 'unknown':
        return this.emit({ type: 'unknown' });
      case 'other':
        // Same wrong name typed twice doesn't cost another attempt.
        if (this._wrongIds.has(match.place.id)) return this.emit({ type: 'ignored' });
        return this.emit(this.resolveWrong(match.place));
    }
  }

  answerByPlace(placeId: string): Feedback {
    if (this._phase !== 'asking') return this.emit({ type: 'ignored' });
    if (placeId === this.current.id) return this.emit(this.resolveCorrect());
    const guessed = this.placeById(placeId);
    if (!guessed || this._wrongIds.has(placeId)) return this.emit({ type: 'ignored' });
    return this.emit(this.resolveWrong(guessed));
  }

  skip(): Feedback {
    if (this._phase !== 'asking') return this.emit({ type: 'ignored' });
    this.record({ correctOnAttempt: null, skipped: true, points: 0 });
    return this.emit({ type: 'skipped' });
  }

  /** Moves on from a revealed question. */
  next(): void {
    if (this._phase !== 'revealed') return;
    if (this.isLastQuestion) {
      this._phase = 'finished';
    } else {
      this._index++;
      this._wrongIds = new Set();
      this._phase = 'asking';
    }
    this.emit(null);
  }

  result(): GameResult {
    if (this._phase !== 'finished') throw new Error('Round not finished');
    return {
      config: this.config,
      score: this.score,
      maxScore: this.maxScore,
      durationMs: this.elapsedMs(),
      results: [...this.results],
      finishedAt: this._endedAt!,
    };
  }

  private resolveCorrect(): Feedback {
    const attempt = this._wrongIds.size + 1;
    const points = POINTS_BY_ATTEMPT[attempt - 1];
    this.record({ correctOnAttempt: attempt, skipped: false, points });
    return { type: 'correct', points, attempt };
  }

  private resolveWrong(guessed: PlaceProps): Feedback {
    this._wrongIds.add(guessed.id);
    const attemptsLeft = this.attemptsLeft;
    const revealed = attemptsLeft === 0;
    if (revealed) this.record({ correctOnAttempt: null, skipped: false, points: 0 });
    return { type: 'wrong', guessed, attemptsLeft, revealed };
  }

  private record(r: Omit<QuestionResult, 'place'>): void {
    this.results.push({ place: this.current, ...r });
    this._phase = 'revealed';
    if (this.isLastQuestion) this._endedAt = this.now();
  }

  private emit(feedback: Feedback | null): Feedback {
    for (const l of this.listeners) l(this, feedback);
    return feedback as Feedback;
  }
}
