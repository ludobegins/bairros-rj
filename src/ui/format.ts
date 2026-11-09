import type { Area, Mode, ZoneFilter } from '../types.ts';

export const ZONE_LABELS: Record<ZoneFilter, string> = {
  all: 'Todas',
  centro: 'Centro',
  sul: 'Zona Sul',
  norte: 'Zona Norte',
  oeste: 'Zona Oeste',
  sudoeste: 'Zona Sudoeste',
};

export const MODE_LABELS: Record<Mode, string> = {
  type: 'Digitar o nome',
  click: 'Clicar no mapa',
};

export const AREA_LABELS: Record<Area, string> = {
  rio: 'Só Rio',
  'grande-rio': 'Grande Rio',
};

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function pluralize(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
