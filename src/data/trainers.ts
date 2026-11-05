import type { Rng } from '../core/rng';
import { FAUNA, type BiomeId } from './species.ts';

// Les dresseurs de la Ligue, en run (ajout, retour de test : « tous les Pokémon qu'on
// affronte sortent de Poké Balls… voir les dresseurs dans les biomes, et les voir se
// déplacer » ; « pas que des sbires… des dresseurs par biome, plus d'autres, genre les
// top dresseurs, qui vont un peu partout, un peu demi-boss »). Le jeu Godot n'avait que
// des sauvages. Ici chaque vague d'une salle de combat appartient à un ou deux dresseurs,
// qui attendent dans la salle (on les voit faire les cent pas), lancent leurs Poké Balls
// quand vient leur tour, et s'enfuient quand leurs Pokémon sont libérés (run/room.ts).
//
// - Chaque biome a ses classes (pêcheur au lac, montagnard au rocailleux…), qui
//   reviennent souvent ; des classes itinérantes passent partout, pour varier.
// - Une équipe mêle la faune du biome et des Pokémon du type de prédilection de la
//   classe, pris dans toute la faune de la Ligue : plus de variété d'une salle à
//   l'autre, sans perdre le thème du lieu.
// - Le top dresseur, une fois de temps en temps, est un demi-boss : une vague à
//   lui seul, des Pokémon plus forts.
// Planches de personnages d'Essentials (Characters/trainer_*.png), importées par
// scripts/import-assets.ts.

export interface TrainerClass {
  name: string;
  sprite: string;
  /** Types de prédilection : une part de l'équipe en vient (toute la faune). */
  types: readonly string[];
}

export const TRAINER_CLASSES = {
  youngster: { name: 'Gamin', sprite: 'trainer_YOUNGSTER.png', types: ['normal', 'bug'] },
  lass: { name: 'Fillette', sprite: 'trainer_LASS.png', types: ['normal', 'fairy'] },
  bugcatcher: { name: 'Scout', sprite: 'trainer_BUGCATCHER.png', types: ['bug'] },
  camper: { name: 'Campeur', sprite: 'trainer_CAMPER.png', types: ['ground', 'normal'] },
  picnicker: { name: 'Pique-niqueuse', sprite: 'trainer_PICNICKER.png', types: ['grass', 'normal'] },
  aromalady: { name: 'Aromadame', sprite: 'trainer_AROMALADY.png', types: ['grass', 'poison'] },
  fisherman: { name: 'Pêcheur', sprite: 'trainer_FISHERMAN.png', types: ['water'] },
  swimmerF: { name: 'Nageuse', sprite: 'trainer_SWIMMER_F.png', types: ['water', 'ice'] },
  swimmerM: { name: 'Nageur', sprite: 'trainer_SWIMMER_M.png', types: ['water'] },
  channeler: { name: 'Exorciste', sprite: 'trainer_CHANNELER.png', types: ['ghost', 'poison'] },
  burglar: { name: 'Cambrioleur', sprite: 'trainer_BURGLAR.png', types: ['fire', 'poison', 'dark'] },
  biker: { name: 'Motard', sprite: 'trainer_BIKER.png', types: ['poison', 'fire'] },
  cueball: { name: 'Loubard', sprite: 'trainer_CUEBALL.png', types: ['fighting', 'fire'] },
  hiker: { name: 'Montagnard', sprite: 'trainer_HIKER.png', types: ['rock', 'ground'] },
  ruinmaniac: { name: 'Fana des ruines', sprite: 'trainer_RUINMANIAC.png', types: ['rock', 'ground', 'steel'] },
  gentleman: { name: 'Gentleman', sprite: 'trainer_GENTLEMAN.png', types: ['normal', 'fire'] },
  beauty: { name: 'Canon', sprite: 'trainer_BEAUTY.png', types: ['normal', 'fairy', 'grass'] },
  sailor: { name: 'Marin', sprite: 'trainer_SAILOR.png', types: ['water', 'fighting'] },
  tuber: { name: 'Bambinette', sprite: 'trainer_TUBER_F.png', types: ['water'] },
  blackbelt: { name: 'Karatéka', sprite: 'trainer_BLACKBELT.png', types: ['fighting', 'ice'] },
  crushgirl: { name: 'Battante', sprite: 'trainer_CRUSHGIRL.png', types: ['fighting', 'ice'] },
  // Itinérants : on les croise partout.
  psychicM: { name: 'Kinésiste', sprite: 'trainer_PSYCHIC_M.png', types: ['psychic', 'ghost'] },
  psychicF: { name: 'Médium', sprite: 'trainer_PSYCHIC_F.png', types: ['psychic', 'fairy'] },
  birdkeeper: { name: 'Ornithologue', sprite: 'trainer_BIRDKEEPER.png', types: ['flying'] },
  pokemaniac: { name: 'Pokémaniac', sprite: 'trainer_POKEMANIAC.png', types: ['dragon', 'rock', 'ground'] },
  engineer: { name: 'Ingénieur', sprite: 'trainer_ENGINEER.png', types: ['electric', 'steel'] },
  rocker: { name: 'Rockeur', sprite: 'trainer_ROCKER.png', types: ['electric', 'dark'] },
  juggler: { name: 'Jongleur', sprite: 'trainer_JUGGLER.png', types: ['psychic', 'normal'] },
  gambler: { name: 'Joueur', sprite: 'trainer_GAMBLER.png', types: ['normal', 'dark'] },
  tamer: { name: 'Dompteur', sprite: 'trainer_TAMER.png', types: ['dark', 'fire', 'normal'] },
  breeder: { name: 'Éleveuse', sprite: 'trainer_POKEMONBREEDER.png', types: ['normal', 'fairy'] },
  // Les top dresseurs : demi-boss.
  aceM: { name: 'Topdresseur', sprite: 'trainer_COOLTRAINER_M.png', types: [] },
  aceF: { name: 'Topdresseuse', sprite: 'trainer_COOLTRAINER_F.png', types: [] },
} as const satisfies Record<string, TrainerClass>;
export type TrainerClassId = keyof typeof TRAINER_CLASSES;

/** Les classes de chaque biome. */
export const BIOME_TRAINERS: Record<BiomeId, readonly TrainerClassId[]> = {
  prairie: ['youngster', 'lass'],
  foret: ['bugcatcher', 'camper'],
  automne: ['picnicker', 'aromalady'],
  lac: ['fisherman', 'swimmerF'],
  marais: ['channeler', 'burglar'],
  volcan: ['biker', 'cueball'],
  rocailleux: ['hiker', 'ruinmaniac'],
  village: ['gentleman', 'beauty'],
  plage: ['sailor', 'tuber'],
  ocean: ['swimmerM', 'sailor'],
  glace: ['blackbelt', 'crushgirl'],
};
/** Les classes qui passent partout (une sur trois environ). */
export const ROAMING: readonly TrainerClassId[] = ['psychicM', 'psychicF', 'birdkeeper', 'pokemaniac', 'engineer', 'rocker', 'juggler', 'gambler', 'tamer', 'breeder'];
export const ACES: readonly TrainerClassId[] = ['aceM', 'aceF'];

/** La faune de toute la Ligue, par type (relevé des fiches PokéAPI importées). */
const BY_TYPE: Record<string, readonly number[]> = {
  bug: [10, 11, 12, 13, 14, 15, 46, 123, 127, 204, 214, 265, 283, 401, 540, 543, 557, 636, 664, 742, 850, 872, 873],
  dark: [215, 434, 509],
  dragon: [776],
  electric: [25, 170],
  fairy: [39, 183, 209, 546, 742, 957, 958, 959],
  fighting: [56, 57, 66, 214, 236, 296, 447, 453, 674],
  fire: [4, 37, 58, 77, 126, 155, 218, 240, 255, 322, 324, 390, 607, 631, 636, 776, 850],
  flying: [12, 16, 21, 41, 83, 123, 130, 163, 187, 225, 226, 278, 279, 458, 627, 628],
  ghost: [200, 478, 607, 622, 708, 710, 769, 770],
  grass: [43, 46, 69, 114, 187, 270, 273, 285, 459, 460, 511, 540, 546, 585, 590, 708, 710],
  ground: [27, 50, 74, 75, 95, 111, 194, 220, 221, 231, 246, 322, 339, 622, 660, 749, 750, 769, 770, 980],
  ice: [87, 124, 131, 215, 220, 221, 225, 238, 361, 362, 363, 364, 459, 460, 478, 582, 583, 613, 614, 615, 712, 713, 872, 873],
  normal: [16, 19, 21, 39, 52, 83, 128, 161, 163, 190, 206, 216, 234, 241, 263, 293, 300, 351, 399, 431, 506, 572, 585, 627, 628, 659, 660, 819, 831, 924],
  poison: [13, 14, 15, 23, 41, 43, 69, 72, 88, 109, 211, 316, 336, 434, 453, 543, 568, 590, 690, 980],
  psychic: [79, 121, 124, 238],
  rock: [74, 75, 95, 111, 246, 304, 438, 524, 557, 744, 837],
  steel: [304, 957, 958, 959],
  water: [54, 60, 72, 79, 86, 87, 90, 98, 116, 117, 118, 119, 120, 121, 129, 130, 131, 170, 183, 194, 211, 226, 270, 278, 279, 283, 339, 341, 349, 363, 364, 458, 550, 690],
};
const ALL_FAUNA: readonly number[] = [...new Set(Object.values(FAUNA).flat())];

/** Les Pokémon d'un type dans la faune de la Ligue (renforts des champions, run.ts). */
export const typeMates = (type: string): number[] => [...(BY_TYPE[type] ?? [])];

/**
 * Une classe pour ce biome : souvent la sienne, parfois une itinérante. `roaming` : la
 * part d'itinérants (aucun au premier acte : on n'y croise que les gens du coin).
 */
export const pickClass = (rng: Rng, biome: BiomeId, roaming = 0.35): TrainerClassId => (rng.chance(roaming) ? rng.pick(ROAMING) : rng.pick(BIOME_TRAINERS[biome]));

/**
 * L'espèce d'un Pokémon de l'équipe : la faune du biome (`pool`), ou, avec la chance
 * `variety` (Run.variety : 0 au premier acte, jusqu'à deux sur cinq ensuite), un Pokémon
 * du type de prédilection de la classe, d'où qu'il vienne. Un top dresseur pioche dans
 * toute la faune de la Ligue. Retour de test : « on a mis trop de variété dans les
 * dresseurs, il y a des Pokémon très forts dès le début » — d'où le premier acte limité
 * à la faune du lieu, qui permet aussi d'en vaincre assez d'une espèce pour la recruter.
 */
export function pickMember(rng: Rng, cls: TrainerClassId, pool: readonly number[], variety = 0.4): number {
  const types: readonly string[] = TRAINER_CLASSES[cls].types;
  if (!types.length) return rng.pick(ALL_FAUNA);
  if (rng.chance(variety)) return rng.pick(BY_TYPE[rng.pick(types)] ?? pool);
  return rng.pick(pool);
}

/** Toutes les planches à importer. */
export const trainerSprites = (): string[] => Object.values(TRAINER_CLASSES).map((c) => c.sprite);
