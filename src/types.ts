export type Zone = 'centro' | 'sul' | 'norte' | 'oeste' | 'sudoeste';
export const ZONES: readonly Zone[] = ['centro', 'sul', 'norte', 'oeste', 'sudoeste'];

export type PlaceKind = 'neighborhood' | 'municipality';

/** Properties of each feature in public/data/places.json. */
export interface PlaceProps {
  /** `nb-<IPP code>` for Rio neighborhoods, `mun-<IBGE code>` for municipalities. */
  id: string;
  kind: PlaceKind;
  /** Name shown in the UI. */
  name: string;
  /** Popular zone; only set for Rio neighborhoods. */
  zone?: Zone;
  /** Other accepted answers besides `name` (official name, nicknames). */
  aliases: string[];
}
