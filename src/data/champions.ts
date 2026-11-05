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
  // Ajout (biome de glace) : Olga, du Conseil 4 de Kanto (Rouge Feu), réduite à
  // deux vagues comme les premiers champions : Lamantine puis Lippoutou.
  Olga: {
    name: 'Olga',
    type: 'ice',
    team: [[87, 86], [124, 238]],
    sprite: 'trainer_ELITEFOUR_Lorelei.png',
    intro: 'Tu as grimpé jusqu’ici pour parler de liberté ? Le froid fige tout, même les rêves. Tes Pokémon resteront pris dans la glace.',
  },
  // Ajout : le Conseil de Kanto (Rouge Feu), qui garde le dernier étage une fois la Route
  // Victoire ouverte (run.ts, ELITE_BY_BIOME), et le Maître de la Ligue qui l'attend au
  // bout. Équipes des jeux, réduites aux espèces dont le dépôt a les planches (Ectoplasma
  // devient Spectrum, Ptéra un Dracaufeu).
  Aldo: {
    name: 'Aldo',
    type: 'fighting',
    team: [[95, 95], [106, 106], [107, 107], [68, 66]],
    sprite: 'trainer_ELITEFOUR_Bruno.png',
    intro: 'Le Conseil ne se bat pas pour une idée, sauvage. Il se bat pour gagner. Tes poings contre les miens : voyons qui plie.',
  },
  Agatha: {
    name: 'Agatha',
    type: 'ghost',
    team: [[42, 41], [24, 23], [89, 88], [93, 93]],
    sprite: 'trainer_ELITEFOUR_Agatha.png',
    intro: 'Hé hé… Des rebelles, j’en ai vu passer. Leurs fantômes hantent encore ce marais. Tu veux les rejoindre ?',
  },
  Peter: {
    name: 'Peter',
    type: 'dragon',
    team: [[130, 129], [148, 147], [6, 4], [149, 147]],
    sprite: 'trainer_ELITEFOUR_Lance.png',
    intro: 'Les dragons ne servent personne… sauf moi. Si un sauvage peut briser une chaîne, qu’il brise d’abord la mienne.',
  },
  Régis: {
    name: 'Régis',
    type: 'normal',
    team: [[18, 16], [65, 63], [112, 111], [130, 129], [59, 58], [9, 7]],
    sprite: 'trainer_CHAMPION.png',
    intro: 'Alors c’est toi, la rumeur. Tous les champions à terre, le Conseil en déroute… Je suis le Maître de la Ligue. Au-dessus de moi, il n’y a rien. Montre-moi ce que vaut ta liberté.',
  },
  Blanche: {
    name: 'Blanche',
    type: 'normal',
    team: [[35, 35], [241, 241]],
    sprite: 'trainer_COOLTRAINER_F.png',
    intro: 'Peu importe ta cause : la force fait la loi, et la loi enferme. Montre-moi si un sauvage peut la briser.',
  },
};

/**
 * PokePools.BIOME_CHAMPIONS : le boss d'acte est assorti au type de sa région.
 * Écart voulu (retour de test : des Pokémon très forts dès le début) : rangés aussi par
 * étage de la carte du monde (world/worldmap.ts) — Giovanni et ses cinq Pokémon ne
 * gardent plus le Village, au deuxième acte, mais les Rocailleux, au dernier ; Major Bob
 * prend le Village, Morgane le Lac et l'Océan. Les petites équipes des premiers
 * champions sont complétées selon l'acte où on les croise (run.ts, reinforce).
 */
export const BIOME_CHAMPIONS: Partial<Record<BiomeId, string[]>> = {
  prairie: ['Blanche'],
  plage: ['Ondine'],
  village: ['Major Bob'],
  foret: ['Erika'],
  ocean: ['Morgane', 'Ondine'],
  marais: ['Koga'],
  lac: ['Ondine', 'Morgane'],
  automne: ['Erika', 'Pierre'],
  rocailleux: ['Giovanni', 'Pierre'],
  volcan: ['Auguste'],
  glace: ['Olga'],
};

/** Répliques du Dresseur Final, le champion du dernier acte (PokePools.FINAL_BOSS_*). */
export const FINAL_BOSS_INTRO =
  'Alors c’est toi. Le sauvage qui rêve d’un monde sans Poké Balls. Je suis le dernier verrou de la Ligue — l’ordre lui-même. Franchis-moi, et tout s’effondre. Mais aucun rebelle n’a jamais brisé LA chaîne.';
export const FINAL_BOSS_DEFEAT =
  'Impossible… le dernier verrou a cédé. Va, alors. Que les Pokémon choisissent : suivre un dresseur… ou vivre libres. La chaîne est brisée — et c’est toi qui l’as brisée.';

/** Réplique du Maître de la Ligue vaincu, au bout de la Route Victoire. */
export const MASTER_DEFEAT =
  'Battu… par un sauvage. Le titre est à toi, si tu en veux. Mais je crois que tu n’en veux pas : tu voulais seulement qu’on vous laisse choisir. Alors choisis.';

/** Toutes les espèces qu'un champion peut aligner (formes finales et sbires) : à importer. */
export function championSpecies(): number[] {
  const ids = new Set<number>();
  for (const c of Object.values(CHAMPIONS)) for (const [f, b] of c.team) ids.add(f).add(b);
  return [...ids];
}
