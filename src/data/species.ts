// Données pures (sans DOM) : importées à la fois par le jeu et par vite.config.ts,
// qui s'en sert pour savoir quelles planches copier dans le build.
import bestiary from './bestiary.json' with { type: 'json' };
// Extension explicite : scripts/import-assets.ts charge ce fichier directement avec Node.
import { laterForms } from './evolutions.ts';

/** Pokémon jouables dans le prototype — de quoi juger l'échelle, du petit au géant. */
export const PLAYER_SPECIES: readonly { id: number; name: string }[] = [
  { id: 25, name: 'Pikachu' },
  { id: 1, name: 'Bulbizarre' },
  { id: 4, name: 'Salamèche' },
  { id: 7, name: 'Carapuce' },
  { id: 133, name: 'Évoli' },
  { id: 6, name: 'Dracaufeu' },
  { id: 143, name: 'Ronflex' },
  { id: 95, name: 'Onix' },
];

/**
 * Starters proposés au premier lancement (GameManager.STARTER_IDS) : Pikachu,
 * Zorua, Absol, Flamiaou, Grenousse, Ouisticram, Pandespiègle, Baggiguane,
 * Riolu, Carapuce et Évoli (ajouts, retours de test). Seul celui qu'on choisit est
 * débloqué (StarterScreen).
 */
export const STARTER_IDS: readonly number[] = [25, 570, 359, 725, 656, 390, 674, 559, 447, 7, 133];

export const BIOME_IDS = ['prairie', 'foret', 'automne', 'lac', 'marais', 'volcan', 'rocailleux', 'village', 'plage', 'ocean', 'glace'] as const;
export type BiomeId = (typeof BIOME_IDS)[number];

/**
 * Faune sauvage par biome, tenue par la page de config (bestiary.json).
 * Reprise au départ de scripts/combat/PokePools.gd (BIOME_POOLS) ; la Plage
 * et l'Océan n'y ont pas de pool. L'ordre compte : les 9 premières espèces
 * peuplent le début de chaque acte (run.ts, fauna).
 */
export const FAUNA: Record<BiomeId, readonly number[]> = bestiary.biomes;

/** Espèces qui nagent d'elles-mêmes (sans monture) quand elles sont dans l'eau. */
export const SWIMMERS = new Set([54, 72, 90, 98, 116, 117, 118, 119, 120, 121, 129, 130, 131, 170, 211, 349, 550]);

/** Toutes les espèces dont le prototype peut avoir besoin (pour la copie au build). */
/** Les 10 légendaires donateurs (RunBoons.GODS) : leur sprite sert de portrait sur l'écran de dons. */
export const DONOR_SPECIES = [145, 146, 144, 151, 491, 383, 251, 250, 384, 385];

/** Le marchand de la boutique de run : Perrserker (CombatArena.gd:3357-3366). */
export const MERCHANT_SPECIES = 863;

/**
 * Mercenaires de la boutique, par rang (CombatArena._roll_ally_pid, PokePools) :
 * Éclaireur (ELEM + FLYERS + RODENTS), Vétéran (SEMI_BOSS), Champion Sauvage (CAVE_DEMIBOSS).
 */
export const MERC_POOLS = {
  scout: [403, 261, 191, 43, 16, 396, 661, 519, 399, 19, 263, 161, 819],
  veteran: [20, 400, 17, 404, 402, 262, 55, 162],
  champion: [147, 246, 371, 443, 610, 633, 704, 374, 328, 782, 885, 996],
} as const;
export const MERC_SPECIES: readonly number[] = [...MERC_POOLS.scout, ...MERC_POOLS.veteran, ...MERC_POOLS.champion];

/**
 * Figurants de la place (PokePools.BOUTIQUE_STROLLERS), moins ceux dont le
 * dépôt n'a pas de planche PMD (Excelangue, Chaffreux, Coudlangue, Goinfrex,
 * Ramboum, Grodrive).
 */
export const SHOP_STROLLERS = [113, 241, 217, 143, 400, 164, 272, 185];
/** Le dormeur (Maushold) et le flâneur (Ramoloss) de la place (CombatArena.gd:4770-4804). */
export const SHOP_SLEEPER = 925;
export const SHOP_IDLER = 79;
/**
 * PNJ du Repaire (HubWorld.NPC_DEFS) : Dracolosse au départ, Porygon à
 * l'équipe, Charpenti le bâtisseur (BUILDER_LINE), Roucarnage, le messager du jeu en
 * ligne, Démolosse, le pisteur qui mène les missions (Godot : le PNJ
 * « rumors »), Kangourex, la doyenne des quêtes, et Bouldeneu, le savant qui
 * explique les mécaniques du jeu (deux ajouts) ; puis, une fois leur aménagement construit, M. Mime aux CT et
 * Alakazam aux améliorations, et Miaouss, le marchand d'objets tenus (au
 * marché, ajout : retour de test, l'étude en faisait trop), Héliatronc, la jardinière du
 * potager (au champ), et Queulorior, l'artisan de l'atelier (deux ajouts, meta/crafting.ts :
 * le joueur proposait Tritonde « ou un autre » ; Queulorior peint de sa queue, un artisan
 * qui se reconnaît d'un coup d'œil). Tous les autres Pokémon du camp sont des
 * libérés : ceux qu'on a débloqués et qu'on n'emmène pas.
 */
export const CAMP_NPCS = { start: 149, team: 137, builder: 532, moves: 122, upgrades: 65, items: 52, online: 18, missions: 229, quests: 115, lore: 465, garden: 192, craft: 235, feats: 178 } as const;

/**
 * Pokémon gagnés aux quêtes de Kangourex (meta/quests.ts), par quête : des
 * espèces qu'on ne croise nulle part ailleurs — ni faune, ni starter, ni
 * mercenaire, ni gardien de grotte, ni Pokémon de champion —, et deux
 * légendaires pour les plus dures. Ils se battent : planches de combat
 * complètes (scripts/import-assets.ts).
 */
export const QUEST_REWARDS = {
  first_steps: 175,
  gatherer: 357,
  untouched: 440,
  speedrun: 239,
  trapbreaker: 302,
  downpour: 186,
  sleeper: 446,
  storm: 449,
  champions: 243,
  victory: 150,
} as const;
export const QUEST_SPECIES: readonly number[] = Object.values(QUEST_REWARDS);
/** Les légendaires jouables (Raikou, Mewtwo) : ils pèsent lourd dans l'équipe (meta/weight.ts). */
export const LEGENDARY_SPECIES: readonly number[] = [QUEST_REWARDS.champions, QUEST_REWARDS.victory];

/**
 * Le bâtisseur grandit avec le camp : Charpenti au début, Ouvrifier au
 * troisième aménagement, Bétochef au sixième. Écart voulu : Godot confiait
 * le chantier à Ossatueur, qui ne changeait pas.
 */
export const BUILDER_LINE = [532, 533, 534] as const;
export const builderId = (built: number): number => BUILDER_LINE[built >= 6 ? 2 : built >= 3 ? 1 : 0];

/** L'île du lac (HubWorld.gd:52-56) : Lugia, le sage, et deux ermites, Roigada et Noadkoko. */
export const ISLAND_NPCS = { sage: 249, hermits: [199, 103] } as const;

/**
 * Formes évoluées des Pokémon qui gagnent de l'XP dans l'équipe (jouables,
 * mercenaires, et toute la faune, qui se débloque ou se recrute en grotte) :
 * elles ont besoin des mêmes planches de combat. Pas toute la table
 * d'évolution : les sauvages n'évoluent jamais en cours de run.
 */
export const EVOLVED_SPECIES: readonly number[] = [...new Set([...PLAYER_SPECIES.map((s) => s.id), ...STARTER_IDS, ...MERC_SPECIES, ...QUEST_SPECIES, ...Object.values(FAUNA).flat()].flatMap(laterForms))];

export function allSpecies(): number[] {
  const ids = new Set<number>([...PLAYER_SPECIES.map((s) => s.id), ...STARTER_IDS, ...EVOLVED_SPECIES, ...DONOR_SPECIES, MERCHANT_SPECIES, ...MERC_SPECIES, ...SHOP_STROLLERS, SHOP_SLEEPER, SHOP_IDLER, ...Object.values(CAMP_NPCS), ...BUILDER_LINE, ISLAND_NPCS.sage, ...ISLAND_NPCS.hermits, ...QUEST_SPECIES]);
  for (const pool of Object.values(FAUNA)) for (const id of pool) ids.add(id);
  return [...ids].sort((a, b) => a - b);
}
