// Données pures (sans DOM) : importées à la fois par le jeu et par vite.config.ts,
// qui s'en sert pour savoir quelles planches copier dans le build.
import bestiary from './bestiary.json' with { type: 'json' };

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

export const BIOME_IDS = ['prairie', 'foret', 'automne', 'lac', 'marais', 'volcan', 'rocailleux', 'village', 'plage', 'ocean'] as const;
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
 * l'équipe, Ossatueur le bâtisseur et Roucarnage, le messager du jeu en
 * ligne ; puis, une fois leur aménagement construit, M. Mime aux CT et
 * Alakazam aux améliorations. Tous les autres Pokémon du camp sont des
 * libérés : ceux qu'on a débloqués et qu'on n'emmène pas.
 */
export const CAMP_NPCS = { start: 149, team: 137, builder: 105, moves: 122, upgrades: 65, online: 18 } as const;

/** L'île du lac (HubWorld.gd:52-56) : Lugia, le sage, et deux ermites, Roigada et Noadkoko. */
export const ISLAND_NPCS = { sage: 249, hermits: [199, 103] } as const;

export function allSpecies(): number[] {
  const ids = new Set<number>([...PLAYER_SPECIES.map((s) => s.id), ...DONOR_SPECIES, MERCHANT_SPECIES, ...MERC_SPECIES, ...SHOP_STROLLERS, SHOP_SLEEPER, SHOP_IDLER, ...Object.values(CAMP_NPCS), ISLAND_NPCS.sage, ...ISLAND_NPCS.hermits]);
  for (const pool of Object.values(FAUNA)) for (const id of pool) ids.add(id);
  return [...ids].sort((a, b) => a - b);
}
