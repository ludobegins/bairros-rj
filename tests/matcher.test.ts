import { describe, expect, it } from 'vitest';
import { createMatcher, tolerance } from '../src/core/matcher.ts';
import { levenshtein } from '../src/core/normalize.ts';
import { loadRealPlaces, place } from './helpers.ts';

const places = [
  place({ id: 'jpa', name: 'Jacarepaguá' }),
  place({
    id: 'frg-ilha',
    name: 'Freguesia (Ilha do Governador)',
    aliases: ['Freguesia (Ilha)', 'Freguesia'],
  }),
  place({ id: 'frg-jpa', name: 'Freguesia (Jacarepaguá)', aliases: ['Freguesia'] }),
  place({ id: 'recreio', name: 'Recreio dos Bandeirantes', aliases: ['Recreio'] }),
  place({ id: 'penha', name: 'Penha' }),
  place({ id: 'penha-c', name: 'Penha Circular' }),
  place({ id: 'joa', name: 'Joá' }),
  place({ id: 'urca', name: 'Urca' }),
  place({ id: 'niteroi', name: 'Niterói', kind: 'municipality' }),
];
const match = createMatcher(places);

describe('levenshtein', () => {
  it('computes edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
  });
});

describe('tolerance', () => {
  it('scales with name length', () => {
    expect(tolerance(4)).toBe(0);
    expect(tolerance(5)).toBe(1);
    expect(tolerance(11)).toBe(1);
    expect(tolerance(12)).toBe(2);
  });
});

describe('createMatcher', () => {
  it('accepts names ignoring case, accents and punctuation', () => {
    expect(match('jacarepagua', 'jpa')).toEqual({ kind: 'correct' });
    expect(match('  NITEROI ', 'niteroi')).toEqual({ kind: 'correct' });
    expect(match('freguesia ilha do governador', 'frg-ilha')).toEqual({ kind: 'correct' });
  });

  it('accepts aliases', () => {
    expect(match('Recreio', 'recreio')).toEqual({ kind: 'correct' });
  });

  it('accepts a shared ambiguous alias for whichever place is asked', () => {
    expect(match('Freguesia', 'frg-ilha')).toEqual({ kind: 'correct' });
    expect(match('Freguesia', 'frg-jpa')).toEqual({ kind: 'correct' });
  });

  it('rejects the qualified name of the other homonym', () => {
    expect(match('Freguesia (Jacarepaguá)', 'frg-ilha')).toMatchObject({
      kind: 'other',
      place: { id: 'frg-jpa' },
    });
  });

  it('tolerates typos according to length', () => {
    expect(match('jacarepagu', 'jpa')).toEqual({ kind: 'correct' }); // 1 deletion, 11 chars
    expect(match('recreio dos bandeirante', 'recreio')).toEqual({ kind: 'correct' });
    expect(match('recrio dos bandeirante', 'recreio')).toEqual({ kind: 'correct' }); // 2 edits, long
    expect(match('jacrepgua', 'jpa')).toEqual({ kind: 'unknown' }); // 2 edits, too many
    expect(match('recrio dos bandeirnte', 'recreio')).toEqual({ kind: 'unknown' }); // 3 edits
  });

  it('requires exact match for short names', () => {
    expect(match('joa', 'joa')).toEqual({ kind: 'correct' });
    expect(match('jo', 'joa')).toEqual({ kind: 'unknown' });
    expect(match('urka', 'urca')).toEqual({ kind: 'unknown' });
  });

  it('prefers an exact match over a fuzzy one', () => {
    expect(match('Penha', 'penha-c')).toMatchObject({ kind: 'other', place: { id: 'penha' } });
  });

  it('reports a different real place', () => {
    expect(match('Urca', 'jpa')).toMatchObject({ kind: 'other', place: { id: 'urca' } });
  });

  it('reports unknown names and empty input', () => {
    expect(match('Atlântida', 'jpa')).toEqual({ kind: 'unknown' });
    expect(match('   ', 'jpa')).toEqual({ kind: 'unknown' });
  });
});

describe('matcher on real data', () => {
  const real = loadRealPlaces();
  const realMatch = createMatcher(real);

  it('accepts every place by its name and every alias', () => {
    for (const p of real) {
      for (const n of [p.name, ...p.aliases]) {
        expect(realMatch(n, p.id), `${n} → ${p.id}`).toEqual({ kind: 'correct' });
      }
    }
  });

  it('accepts a one-letter typo of any name with 5+ characters', () => {
    for (const p of real) {
      if (p.name.length < 5) continue;
      const typo = p.name.slice(0, -1); // drop last letter
      expect(realMatch(typo, p.id), `${typo} → ${p.id}`).toEqual({ kind: 'correct' });
    }
  });
});
