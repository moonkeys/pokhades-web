import type { WeatherId } from '../world/weather';
import { evolutionsOf } from './evolutions';

// Talents météo (A-FAIRE 1.8 : « Reste : des talents »). Les données PokéAPI
// copiées n'ont pas les talents : la table est tenue à la main, et ne garde
// que ceux qui changent le temps en entrant en jeu. Écart voulu : un talent
// caché compte comme un talent normal (Feunard, Gigalithe), et chacun de ces
// Pokémon l'a toujours.

export interface WeatherAbility {
  name: string;
  weather: Exclude<WeatherId, 'clear' | 'fog'>;
}

const DRIZZLE: WeatherAbility = { name: 'Crachin', weather: 'rain' };
const DROUGHT: WeatherAbility = { name: 'Sécheresse', weather: 'sun' };
const SAND_STREAM: WeatherAbility = { name: 'Sable Volant', weather: 'sand' };
const SNOW_WARNING: WeatherAbility = { name: 'Alerte Neige', weather: 'hail' };

/** Espèce (n° national) → talent qui change le temps de la salle à son arrivée. */
export const WEATHER_ABILITIES: Readonly<Record<number, WeatherAbility>> = {
  186: DRIZZLE, // Tarpaud
  279: DRIZZLE, // Bekipan
  382: DRIZZLE, // Kyogre
  38: DROUGHT, // Feunard (talent caché)
  324: DROUGHT, // Chartor
  383: DROUGHT, // Groudon
  248: SAND_STREAM, // Tyranocif
  449: SAND_STREAM, // Hippopotas
  450: SAND_STREAM, // Hippodocus
  526: SAND_STREAM, // Gigalithe (talent caché)
  459: SNOW_WARNING, // Blizzi
  460: SNOW_WARNING, // Blizzaroi
};

// Intimidation (ajout, même table à la main) : à son arrivée, les adversaires
// à portée voient leur Attaque baisser, comme sous Rugissement. Écart voulu :
// les sauvages venant par vagues, chaque adversaire qui entre ensuite à portée
// d'un intimidateur encore debout est intimidé à son tour (une fois par salle).

/** Baisse d'Attaque infligée par Intimidation (Rugissement : 0,75). */
export const INTIMIDATE_MULT = 0.75;
/** Durée de la baisse, en secondes (Rugissement : 8). */
export const INTIMIDATE_TIME = 10;
/** Portée, en cases. */
export const INTIMIDATE_RANGE = 9;

/** Espèces (n° national) qui ont Intimidation (talent caché compris : Baggiguane, Baggaïd). */
export const INTIMIDATE: ReadonlySet<number> = new Set([
  23, 24, // Abo, Arbok
  58, 59, // Caninos, Arcanin
  128, 130, // Tauros, Léviator
  209, 210, // Snubbull, Granbull
  234, 237, // Cerfrouse, Kapoera
  262, 284, 303, 373, // Grahyèna, Maskadra, Mysdibule, Drattak
  397, 398, // Étourvol, Étouraptor
  403, 404, 405, // Lixy, Luxio, Luxray
  507, 508, // Ponchien, Mastouffe
  551, 552, 553, // Mascaïman, Escroco, Crocorible
  559, 560, // Baggiguane, Baggaïd (talent caché)
]);

// Lévitation et talents de contact (ajout, 17 novembre 2026, A-FAIRE 1.8 :
// « d'autres talents »). Même table à la main.

/** Lévitation : les attaques Sol ne le touchent pas. */
export const LEVITATE: ReadonlySet<number> = new Set([
  92, 93, // Fantominus, Spectrum (Ectoplasma l'a perdu en 7ᵉ génération)
  109, 110, // Smogo, Smogogo
  200, 429, // Feuforêve, Magirêve
  337, 338, // Séléroc, Solaroc
  355, // Skelénox
  380, 381, // Latias, Latios
  436, 437, // Archéomire, Archéodong
  479, // Motisma
  480, 481, 482, // Créhelf, Créfollet, Créfadet
]);

export type ContactStatus = 'paralysis' | 'burn' | 'poison';

/** Talents de contact : qui le frappe au corps à corps risque un statut (30 %). */
export const CONTACT_TALENTS: Readonly<Record<number, { name: string; status: ContactStatus }>> = {
  ...Object.fromEntries([25, 26, 172, 125, 239, 179, 180, 181, 309, 310, 587].map((id) => [id, { name: 'Statik', status: 'paralysis' as const }])),
  ...Object.fromEntries([77, 78, 126, 240, 218, 219, 467].map((id) => [id, { name: 'Corps Ardent', status: 'burn' as const }])),
  ...Object.fromEntries([29, 30, 31, 32, 33, 34, 211, 315, 406, 407].map((id) => [id, { name: 'Point Poison', status: 'poison' as const }])),
};
/** Chance qu'un talent de contact joue. */
export const CONTACT_CHANCE = 0.3;

const CONTACT_DESC: Record<ContactStatus, string> = {
  paralysis: 'qui le frappe au contact risque la paralysie',
  burn: 'qui le frappe au contact risque la brûlure',
  poison: 'qui le frappe au contact risque l’empoisonnement',
};

// Absorption, Torche et talents de détresse (ajout, 17 novembre 2026).

/** Absorb Eau, Absorb Volt : le type absorbé ne le blesse pas, il le soigne d'un quart de ses PV. */
export const ABSORB: Readonly<Record<number, { name: string; type: string }>> = {
  ...Object.fromEntries([60, 61, 62, 131, 134, 194, 195].map((id) => [id, { name: 'Absorb Eau', type: 'water' }])),
  ...Object.fromEntries([135, 170, 171].map((id) => [id, { name: 'Absorb Volt', type: 'electric' }])),
};
/** Torche : le Feu ne le blesse pas, et ses propres attaques Feu en sortent renforcées (×1,5). */
export const FLASH_FIRE: ReadonlySet<number> = new Set([37, 136, 228, 229]);
/**
 * Engrais, Brasier, Torrent : sous un tiers de ses PV, les attaques de son type gagnent 50 %.
 * Les starters de toutes les générations (Plante, Feu, Eau, dans cet ordre, trois stades).
 */
export const PINCH: Readonly<Record<number, { name: string; type: string }>> = Object.fromEntries(
  [1, 152, 252, 387, 495, 650, 722, 810, 906].flatMap((first) =>
    [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => {
      const kind = Math.floor(k / 3);
      return [first + k, [{ name: 'Engrais', type: 'grass' }, { name: 'Brasier', type: 'fire' }, { name: 'Torrent', type: 'water' }][kind]];
    }),
  ),
);
const TYPE_FR: Record<string, string> = { water: 'Eau', electric: 'Électrik', grass: 'Plante', fire: 'Feu' };

/** Ce que fait un talent, en une phrase (fiches de run et du Repaire). */
const WEATHER_DESC: Record<WeatherAbility['weather'], string> = {
  rain: 'fait pleuvoir sur la salle en y entrant',
  sun: 'allume un soleil ardent sur la salle en y entrant',
  sand: 'lève une tempête de sable sur la salle en y entrant',
  hail: 'fait tomber la grêle sur la salle en y entrant',
};

export interface Talent {
  name: string;
  desc: string;
}

/** Le talent d'une espèce (n° national), ou null : seuls ceux que le jeu fait jouer sont connus. */
export function talentOf(id: number): Talent | null {
  const w = WEATHER_ABILITIES[id];
  if (w) return { name: w.name, desc: WEATHER_DESC[w.weather] };
  if (INTIMIDATE.has(id)) return { name: 'Intimidation', desc: 'baisse l’Attaque des adversaires qui s’approchent' };
  if (LEVITATE.has(id)) return { name: 'Lévitation', desc: 'les attaques Sol ne le touchent pas' };
  const ab = ABSORB[id];
  if (ab) return { name: ab.name, desc: `les attaques ${TYPE_FR[ab.type]} le soignent au lieu de le blesser` };
  if (FLASH_FIRE.has(id)) return { name: 'Torche', desc: 'le Feu ne le blesse pas, et renforce ses attaques Feu' };
  const pinch = PINCH[id];
  if (pinch) return { name: pinch.name, desc: `sous un tiers de ses PV, ses attaques ${TYPE_FR[pinch.type]} gagnent 50 %` };
  const c = CONTACT_TALENTS[id];
  if (c) return { name: c.name, desc: CONTACT_DESC[c.status] };
  return null;
}

/**
 * Le talent d'une espèce ou, à défaut, celui que gagnera une de ses évolutions (Têtarte → Tarpaud :
 * Crachin), avec le niveau où elle arrive : `level` est 0 pour l'espèce elle-même.
 */
export function talentInLine(id: number): (Talent & { level: number; species: number }) | null {
  const own = talentOf(id);
  if (own) return { ...own, level: 0, species: id };
  for (const { level, next } of evolutionsOf(id)) {
    const t = talentInLine(next);
    if (t) return { ...t, level: Math.max(level, t.level), species: t.species };
  }
  return null;
}
