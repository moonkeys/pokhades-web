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
// Talents de temps, Isograisse et Cran (ajout, 23 novembre 2026, A-FAIRE 1.8 : « Glissade,
// Chlorophylle, Isograisse… »). Même table à la main, vérifiée sur les talents des jeux
// (cachés compris : Psykokwak, Sabelette, Doudouvet), et seulement des espèces embarquées.

/**
 * Chlorophylle, Glissade, Baigne Sable, Chasse-Neige : sous leur temps, la cadence de ses
 * attaques ×WEATHER_SPEED_CADENCE et son pas ×WEATHER_SPEED_MOVE (Pokemon.speed, speedMult).
 * Écart voulu : les jeux doublent la Vitesse, qui n'y règle que l'ordre des tours ; ici elle
 * règle la cadence, et un pas doublé ferait traverser la salle en un clin d'œil (le dash
 * va déjà à 26 cases par seconde) : la cadence gagne la moitié, le pas un cinquième.
 */
export const WEATHER_SPEED: Readonly<Record<number, { name: string; weather: WeatherAbility['weather'] }>> = {
  ...Object.fromEntries([43, 44, 45, 69, 70, 71, 103, 114, 187, 188, 189, 191, 192, 273, 274, 275, 357, 465, 546, 547].map((id) => [id, { name: 'Chlorophylle', weather: 'sun' as const }])),
  ...Object.fromEntries([54, 55, 116, 117, 118, 119, 129, 226, 270, 271, 272, 283, 349, 458].map((id) => [id, { name: 'Glissade', weather: 'rain' as const }])),
  27: { name: 'Baigne Sable', weather: 'sand' },
  ...Object.fromEntries([613, 614].map((id) => [id, { name: 'Chasse-Neige', weather: 'hail' as const }])),
};
export const WEATHER_SPEED_CADENCE = 1.5;
export const WEATHER_SPEED_MOVE = 1.2;
/** Isograisse : les attaques Feu et Glace ne lui font que la moitié des dégâts. */
export const THICK_FAT: ReadonlySet<number> = new Set([86, 87, 143, 446, 183, 184, 220, 221, 241, 296, 297, 363, 364]);
/** Cran : sous un statut (brûlure, poison, paralysie), son Attaque ×1,5. */
export const GUTS: ReadonlySet<number> = new Set([19, 20, 66, 67, 68, 214, 217, 532, 533, 534]);
export const GUTS_MULT = 1.5;
// Technicien, Sniper, Médic Nature (ajout, 23 novembre 2026, deuxième passe : A-FAIRE 1.8).
/** Technicien : ses attaques de puissance TECHNICIAN_CAP au plus frappent ×1,5. */
export const TECHNICIAN: ReadonlySet<number> = new Set([52, 53, 123, 212, 235, 572]);
export const TECHNICIAN_CAP = 60;
/**
 * Sniper : ses coups critiques font ×2,25 au lieu de ×1,5, et il en porte SNIPER_CHANCE de
 * plus. Écart voulu : ici, un Pokémon n'a aucune chance de critique d'office (seuls le don
 * Précision et les attaques qui affûtent en donnent ; la Lentille Zoom de l'atelier, elle,
 * touche Atq. Spé. et Vitesse) ; le seul bonus des jeux n'aurait presque jamais joué.
 */
export const SNIPER: ReadonlySet<number> = new Set([15, 21, 22]);
export const SNIPER_CRIT = 2.25;
export const SNIPER_CHANCE = 0.1;
/**
 * Médic Nature : ses statuts s'usent deux fois plus vite. Écart voulu : dans les jeux, le
 * statut s'efface quand il rentre dans sa Ball ; ici, toute l'équipe reste sur le terrain
 * (les compagnons se battent), un changement ne le retire de rien.
 */
export const NATURAL_CURE: ReadonlySet<number> = new Set([113, 440, 120, 121]);
const WEATHER_FR: Record<WeatherAbility['weather'], string> = { rain: 'sous la pluie', sun: 'au soleil', sand: 'dans la tempête de sable', hail: 'sous la grêle' };


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
  const ws = WEATHER_SPEED[id];
  if (ws) return { name: ws.name, desc: `${WEATHER_FR[ws.weather]}, il attaque et court plus vite` };
  if (THICK_FAT.has(id)) return { name: 'Isograisse', desc: 'le Feu et la Glace ne lui font que la moitié des dégâts' };
  if (GUTS.has(id)) return { name: 'Cran', desc: 'brûlé, empoisonné ou paralysé, son Attaque monte de moitié' };
  if (TECHNICIAN.has(id)) return { name: 'Technicien', desc: `ses attaques de puissance ${TECHNICIAN_CAP} au plus frappent moitié plus fort` };
  if (SNIPER.has(id)) return { name: 'Sniper', desc: 'des coups critiques plus fréquents, et qui font bien plus mal' };
  if (NATURAL_CURE.has(id)) return { name: 'Médic Nature', desc: 'ses statuts passent deux fois plus vite' };
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
