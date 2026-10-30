import type { BiomeId } from './species';

// Champions d'arène, repris de PokePools.gd (CHAMPION_TEAMS, BIOME_CHAMPIONS,
// CHAMPION_SPRITE, CHAMPION_INTRO_LINE, FINAL_BOSS_*).
//
// Chaque Pokémon du champion entre à son tour (une vague par Pokémon),
// escorté de sbires de sa forme de BASE (aucun sbire si l'espèce n'évolue pas,
// ou s'il est déjà la forme de base). Le dernier est l'as du champion.
//
// Écart voulu avec le jeu : les équipes sont celles des jeux Pokémon, dans
// l'ordre (Rouge Feu / Vert Feuille pour Kanto, HeartGold / SoulSilver pour
// Blanche), et non des équipes de 6 bâties sur le type de l'arène. Un champion
// du début aligne donc 2 Pokémon, Giovanni 5 : la difficulté suit les badges.

export interface Champion {
  name: string;
  /** Type de l'arène, pour la pastille du dialogue. */
  type: string;
  /** [forme finale affrontée, forme de base des sbires], vague par vague. */
  team: [number, number][];
  /** Planche du dresseur (Essentials, Graphics/Characters). */
  sprite: string;
  intro: string;
}

export const CHAMPIONS: Record<string, Champion> = {
  Pierre: {
    name: 'Pierre',
    type: 'rock',
    team: [[74, 74], [95, 95]],
    sprite: 'trainer_LEADER_Brock.png',
    intro: 'Un Pokémon sauvage qui prêche la « liberté » ? La Roche ne cède pas, et l’ordre non plus. Retourne dans le rang.',
  },
  Ondine: {
    name: 'Ondine',
    type: 'water',
    team: [[120, 120], [121, 120]],
    sprite: 'trainer_LEADER_Misty.png',
    intro: 'Ta petite rébellion ? Une vaguelette. Mes Pokémon d’Eau la noieront avant qu’elle n’atteigne le large.',
  },
  'Major Bob': {
    name: 'Major Bob',
    type: 'electric',
    team: [[100, 100], [25, 25], [26, 25]],
    sprite: 'trainer_LEADER_Surge.png',
    intro: 'Libérer les Pokémon ? Quelle idée électrisante… et parfaitement illégale. Je vais te remettre les idées en place !',
  },
  Erika: {
    name: 'Erika',
    type: 'grass',
    team: [[71, 69], [114, 114], [45, 43]],
    sprite: 'trainer_LEADER_Erika.png',
    intro: 'La liberté a un parfum enivrant, je le concède. Mais mes fleurs endorment les rêveurs de ton espèce.',
  },
  Koga: {
    name: 'Koga',
    type: 'poison',
    team: [[109, 109], [89, 88], [109, 109], [110, 109]],
    sprite: 'trainer_LEADER_Koga.png',
    intro: 'Fwahaha ! Un meneur de révolte se cache toujours dans l’ombre… tout comme mon poison. Il te trouvera.',
  },
  Morgane: {
    name: 'Morgane',
    type: 'psychic',
    team: [[64, 63], [122, 122], [49, 48], [65, 63]],
    sprite: 'trainer_LEADER_Sabrina.png',
    intro: 'Je lis ton avenir : une cage. Ta « rébellion » n’est qu’un caprice que l’ordre corrigera.',
  },
  Auguste: {
    name: 'Auguste',
    type: 'fire',
    team: [[58, 58], [77, 77], [78, 77], [59, 58]],
    sprite: 'trainer_LEADER_Blaine.png',
    intro: 'Ce feu dans ton regard, cette envie de tout brûler des chaînes… je vais l’éteindre, rebelle.',
  },
  Giovanni: {
    name: 'Giovanni',
    type: 'ground',
    team: [[111, 111], [51, 50], [31, 29], [34, 32], [112, 111]],
    sprite: 'trainer_LEADER_Giovanni.png',
    intro: 'La liberté ? Le pouvoir se prend, il ne se distribue pas. Les Pokémon m’appartiennent — toi le premier.',
  },
  Blanche: {
    name: 'Blanche',
    type: 'normal',
    team: [[35, 35], [241, 241]],
    sprite: 'trainer_COOLTRAINER_F.png',
    intro: 'Peu importe ta cause : la force fait la loi, et la loi enferme. Montre-moi si un sauvage peut la briser.',
  },
};

/** PokePools.BIOME_CHAMPIONS : le boss d'acte est assorti au type de sa région. */
export const BIOME_CHAMPIONS: Partial<Record<BiomeId, string[]>> = {
  prairie: ['Blanche'],
  foret: ['Erika'],
  automne: ['Blanche', 'Erika'],
  marais: ['Koga'],
  lac: ['Ondine'],
  rocailleux: ['Pierre', 'Giovanni'],
  volcan: ['Auguste'],
  village: ['Giovanni'],
  // Absents du jeu : la Plage et l'Océan ne sont jamais tirés en run.
  plage: ['Ondine'],
  ocean: ['Ondine'],
};

/** Répliques du Dresseur Final, le champion du dernier acte (PokePools.FINAL_BOSS_*). */
export const FINAL_BOSS_INTRO =
  'Alors c’est toi. Le sauvage qui rêve d’un monde sans Poké Balls. Je suis le dernier verrou de la Ligue — l’ordre lui-même. Franchis-moi, et tout s’effondre. Mais aucun rebelle n’a jamais brisé LA chaîne.';
export const FINAL_BOSS_DEFEAT =
  'Impossible… le dernier verrou a cédé. Va, alors. Que les Pokémon choisissent : suivre un dresseur… ou vivre libres. La chaîne est brisée — et c’est toi qui l’as brisée.';

/** Toutes les espèces qu'un champion peut aligner (formes finales et sbires) : à importer. */
export function championSpecies(): number[] {
  const ids = new Set<number>();
  for (const c of Object.values(CHAMPIONS)) for (const [f, b] of c.team) ids.add(f).add(b);
  return [...ids];
}
