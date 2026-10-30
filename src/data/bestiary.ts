import data from './bestiary.json' with { type: 'json' };
import { PERSONAS } from './chatter';

// Le bestiaire : ce que la page de config (config.html, servie par
// `npm run dev`) enregistre dans bestiary.json. Les biomes y donnent la
// faune sauvage (species.ts, FAUNA) ; chaque espèce peut y avoir une fiche :
// son caractère, ses répliques, son histoire et les attaques qu'on lui impose.

export interface SpeciesSheet {
  /** Caractère (nom d'un PERSONAS de chatter.ts) : ses répliques servent quand l'espèce n'a pas les siennes. */
  persona?: string;
  /** Répliques propres ; {champion}, {zone} et {lead} sont remplacés à l'affichage. */
  lines?: string[];
  /** Histoire de l'espèce : une référence d'écriture, pas encore affichée en jeu. */
  story?: string;
  /** Attaques imposées (noms PokéAPI, 4 au plus) à la place du jeu de départ. */
  moves?: string[];
}

export interface Bestiary {
  biomes: Record<string, number[]>;
  species: Record<string, SpeciesSheet>;
}

const SHEETS: Record<string, SpeciesSheet> = data.species;

export function sheetOf(id: number): SpeciesSheet | undefined {
  return SHEETS[id];
}

/** Ce que dit l'espèce : ses répliques, sinon celles de son caractère ; null si elle n'a ni l'un ni l'autre. */
export function linesOf(id: number): string[] | null {
  const sheet = SHEETS[id];
  if (sheet?.lines?.length) return [...sheet.lines];
  const persona = sheet?.persona ? PERSONAS.find((p) => p.name === sheet.persona) : undefined;
  return persona ? [...persona.lines] : null;
}
