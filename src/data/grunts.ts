import type { BiomeId } from './species';

// Les sbires des grottes (run/cave.ts) : des chasseurs de rebelles à la solde
// de la Ligue, embusqués au fond des grottes avec un Pokémon fort (le
// « gardien ») et une escorte tirée de la faune du biome. Ils parlent, puis
// envoient leurs Pokémon et lancent des Poké Balls sur le Pokémon joué
// (run/capture.ts) : c'est lui qu'ils veulent.
//
// Écart voulu : le jeu Godot gardait la grotte avec un demi-boss sauvage
// (CaveArena, CAVE_DEMIBOSS) ; ici, c'est un dresseur, dont le métier
// (planche Essentials) suit le type de son équipe, lui-même tiré du biome.

export interface GruntTheme {
  /** Type de l'équipe (pastille du dialogue). */
  type: string;
  /** Planches Essentials possibles (Graphics/Characters, et le portrait de même nom dans Graphics/Trainers) et le métier affiché. */
  looks: readonly { sprite: string; title: string }[];
  /** Le Pokémon fort qu'il envoie en premier (planches importées par import-assets). */
  guardians: readonly number[];
}

export const GRUNT_THEMES: Record<string, GruntTheme> = {
  normal: { type: 'normal', looks: [{ sprite: 'trainer_TEAMROCKET_M.png', title: 'Sbire' }, { sprite: 'trainer_TEAMROCKET_F.png', title: 'Sbire' }], guardians: [20, 53, 22, 217] },
  poison: { type: 'poison', looks: [{ sprite: 'trainer_TEAMROCKET_M.png', title: 'Sbire' }, { sprite: 'trainer_TEAMROCKET_F.png', title: 'Sbire' }], guardians: [24, 110, 42, 89, 33] },
  fire: { type: 'fire', looks: [{ sprite: 'trainer_BURGLAR.png', title: 'Cambrioleur' }], guardians: [58, 77, 126, 322, 78] },
  water: { type: 'water', looks: [{ sprite: 'trainer_FISHERMAN.png', title: 'Pêcheur' }, { sprite: 'trainer_SAILOR.png', title: 'Marin' }], guardians: [119, 131, 99, 73, 61] },
  rock: { type: 'rock', looks: [{ sprite: 'trainer_HIKER.png', title: 'Montagnard' }], guardians: [95, 111, 247, 328, 75] },
  fighting: { type: 'fighting', looks: [{ sprite: 'trainer_BLACKBELT.png', title: 'Karatéka' }], guardians: [67, 106, 107, 57, 237] },
  bug: { type: 'bug', looks: [{ sprite: 'trainer_BUGCATCHER.png', title: 'Scout' }], guardians: [127, 123, 15, 49, 168] },
  grass: { type: 'grass', looks: [{ sprite: 'trainer_AROMALADY.png', title: 'Aromatologue' }], guardians: [44, 70, 2, 153, 274] },
  ghost: { type: 'ghost', looks: [{ sprite: 'trainer_CHANNELER.png', title: 'Exorciste' }], guardians: [93, 200, 302, 708] },
  electric: { type: 'electric', looks: [{ sprite: 'trainer_ROCKER.png', title: 'Rocker' }, { sprite: 'trainer_ENGINEER.png', title: 'Ingénieur' }], guardians: [82, 125, 101, 180, 310] },
  // Ajout (biome de glace) : pas de skieur chez Essentials, ce sont des Rangers emmitouflés.
  ice: { type: 'ice', looks: [{ sprite: 'trainer_POKEMONRANGER_M.png', title: 'Ranger' }, { sprite: 'trainer_POKEMONRANGER_F.png', title: 'Ranger' }], guardians: [362, 221, 460, 614, 713] },
  psychic: { type: 'psychic', looks: [{ sprite: 'trainer_PSYCHIC_M.png', title: 'Kinésiste' }, { sprite: 'trainer_PSYCHIC_F.png', title: 'Kinésiste' }], guardians: [64, 97, 178, 203, 281] },
};

/** Les équipes possibles par biome : ce qu'on y affronte dehors. */
export const BIOME_GRUNTS: Record<BiomeId, readonly string[]> = {
  prairie: ['normal', 'fighting'],
  foret: ['bug', 'grass'],
  automne: ['ghost', 'grass'],
  lac: ['water'],
  marais: ['poison'],
  volcan: ['fire'],
  rocailleux: ['rock', 'fighting'],
  village: ['electric', 'psychic'],
  plage: ['water'],
  ocean: ['water'],
  glace: ['ice', 'rock'],
};

/** Répliques d’ouverture, une tirée par grotte. */
export const GRUNT_INTROS: readonly string[] = [
  'Tiens, tiens… un rebelle qui vient se jeter tout seul dans ma grotte. La Ligue paie bien pour ceux de ton espèce. Mes Poké Balls sont prêtes !',
  'Pas un pas de plus ! Ce trou est à moi, et le Pokémon derrière la grille aussi. Toi, tu feras un joli bonus.',
  'Encore un de ces sauvages qui jouent aux héros… Tu vas finir dans une Ball, comme les autres. Débats-toi tant que tu peux !',
  'On m’a dit de surveiller la grotte. On ne m’a pas dit qu’un rebelle viendrait se livrer. C’est mon jour de chance !',
  'Une rébellion de Pokémon ? Laisse-moi rire. Une Ball bien lancée, et c’est fini.',
];

/** Les espèces envoyées par les sbires, pour import-assets. */
export const gruntSpecies = (): number[] => [...new Set(Object.values(GRUNT_THEMES).flatMap((t) => t.guardians))];
/** Les planches de sbires, pour import-assets. */
export const gruntSprites = (): string[] => [...new Set(Object.values(GRUNT_THEMES).flatMap((t) => t.looks.map((l) => l.sprite)))];
