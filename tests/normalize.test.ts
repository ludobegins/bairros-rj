import { describe, expect, it } from 'vitest';
import { normalize } from '../src/core/normalize.ts';

describe('normalize', () => {
  it('lowercases and strips diacritics', () => {
    expect(normalize('Jacarepaguá')).toBe('jacarepagua');
    expect(normalize('São Cristóvão')).toBe('sao cristovao');
    expect(normalize('Turiaçú')).toBe('turiacu');
  });

  it('collapses punctuation and whitespace', () => {
    expect(normalize('  Freguesia (Ilha)  ')).toBe('freguesia ilha');
    expect(normalize('Del-Castilho')).toBe('del castilho');
    expect(normalize('Barra   da\tTijuca')).toBe('barra da tijuca');
  });
});
