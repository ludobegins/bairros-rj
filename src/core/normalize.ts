/**
 * Normalizes a place name for comparison: lowercase, no diacritics,
 * any run of non-alphanumeric characters collapsed to a single space.
 */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
