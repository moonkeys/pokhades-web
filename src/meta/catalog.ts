// Ce que vend le Repaire, en Baies : les améliorations permanentes
// (UpgradeShopScreen et ShopScreen « La Réserve »), les CT du tuteur
// (MoveShopScreen.MOVE_LIST) et les objets tenus (ItemCatalog.ITEMS).

export type UpgradeId = 'slots' | 'xp' | 'purse' | 'vigor' | 'dash' | 'revives';

export interface Upgrade {
  id: UpgradeId;
  name: string;
  /** Effet au niveau n (n ≥ 1). */
  effect(n: number): string;
  max: number;
  /** Prix pour passer du niveau n au niveau n + 1. */
  price(n: number): number;
  /** Icône d'objet d'Essentials (assets/essentials/items). */
  icon: string;
}

/** GameManager.TEAM_SLOT_COSTS : places 2 à 6. */
const TEAM_SLOT_COSTS = [80, 120, 180, 250, 350];
/** GameManager.DASH_CHARGE_COSTS, moins la première charge que le prototype donne d'office. */
const DASH_CHARGE_COSTS = [120, 200];

export const UPGRADES: readonly Upgrade[] = [
  {
    id: 'slots',
    name: 'Place dans l’équipe',
    effect: (n) => `${n + 1} Pokémon en run`,
    max: TEAM_SLOT_COSTS.length,
    price: (n) => TEAM_SLOT_COSTS[n],
    icon: 'POKEBALL',
  },
  {
    // La Réserve : xp_share, +20 % par niveau, 200 + 150·n.
    id: 'xp',
    name: 'Partage d’XP',
    effect: (n) => `+${n * 20} % d’XP par Pokémon vaincu`,
    max: 3,
    price: (n) => 200 + 150 * n,
    icon: 'EXPSHARE',
  },
  {
    // run_purse_level : 100 ₽ par palier (le jeu le payait en poids d'équipe).
    id: 'purse',
    name: 'Bourse de départ',
    effect: (n) => `${n * 100} ₽ en poche au départ`,
    max: 3,
    price: (n) => 150 + 100 * n,
    icon: 'COINCASE',
  },
  {
    // UpgradeShopScreen : charges de dash (le jeu en vend 3 ; la première est offerte ici).
    id: 'dash',
    name: 'Charge de dash',
    effect: (n) => `${n + 1} dash d’affilée`,
    max: DASH_CHARGE_COSTS.length,
    price: (n) => DASH_CHARGE_COSTS[n],
    icon: 'CARBOS',
  },
  {
    // La Réserve : « Ceinture de Rappels » (260 + 200·n). Le jeu les faisait porter un à un au
    // terminal, contre du poids d'équipe ; ici, chaque Pokémon en emporte autant que le niveau.
    id: 'revives',
    name: 'Ceinture de Rappels',
    effect: (n) => `${n} Rappel${n > 1 ? 's' : ''} par Pokémon, utilisé${n > 1 ? 's' : ''} seul${n > 1 ? 's' : ''} au K.O.`,
    max: 2,
    price: (n) => 260 + 200 * n,
    icon: 'REVIVE',
  },
  {
    // Écart voulu : pas dans le jeu, à la place des Rappels allégés (le prototype n'a pas de poids d'équipe).
    id: 'vigor',
    name: 'Vitalité',
    effect: (n) => `+${n * 8} % de PV max pour toute l’équipe`,
    max: 3,
    price: (n) => 180 + 140 * n,
    icon: 'HPUP',
  },
];

/** Nombre de Pokémon qu'on peut emmener : 1, plus une place par niveau acheté. */
export const teamSlots = (slotsLevel: number): number => 1 + slotsLevel;

/** CT du tuteur (MoveShopScreen.MOVE_LIST), sans les CS d'exploration. Prix en Baies, achat définitif. */
export const TMS: readonly { api: string; price: number }[] = [
  // Physiques
  { api: 'aerial-ace', price: 80 },
  { api: 'rock-slide', price: 90 },
  { api: 'brick-break', price: 90 },
  { api: 'shadow-claw', price: 100 },
  { api: 'iron-tail', price: 120 },
  { api: 'earthquake', price: 150 },
  // Spéciales
  { api: 'flamethrower', price: 100 },
  { api: 'ice-beam', price: 100 },
  { api: 'thunderbolt', price: 100 },
  { api: 'psychic', price: 100 },
  { api: 'shadow-ball', price: 120 },
  { api: 'dragon-pulse', price: 150 },
  // Effets
  { api: 'protect', price: 120 },
  { api: 'thunder-wave', price: 130 },
  { api: 'will-o-wisp', price: 130 },
  { api: 'sing', price: 130 },
  { api: 'toxic', price: 140 },
  { api: 'recover', price: 180 },
  { api: 'swords-dance', price: 200 },
  { api: 'calm-mind', price: 200 },
];

export type HeldStat = 'atk' | 'spAtk' | 'def' | 'spDef' | 'speed' | 'hp';

export interface HeldItem {
  api: string;
  name: string;
  stat: HeldStat;
  mult: number;
  price: number;
  icon: string;
}

export const STAT_FR: Record<HeldStat, string> = { atk: 'Attaque', spAtk: 'Atq. Spé.', def: 'Défense', spDef: 'Déf. Spé.', speed: 'Vitesse', hp: 'PV max' };

/** ItemCatalog.ITEMS (une sélection) : un multiplicateur de statistique, porté toute la run. */
export const HELD_ITEMS: readonly HeldItem[] = [
  { api: 'oran-berry', name: 'Baie Oran', stat: 'hp', mult: 1.08, price: 70, icon: 'ORANBERRY' },
  { api: 'light-clay', name: 'Lumargile', stat: 'spDef', mult: 1.1, price: 80, icon: 'LIGHTCLAY' },
  { api: 'power-anklet', name: 'Chaîne Pouvoir', stat: 'speed', mult: 1.15, price: 95, icon: 'POWERANKLET' },
  { api: 'hard-stone', name: 'Pierre Dure', stat: 'def', mult: 1.18, price: 100, icon: 'HARDSTONE' },
  { api: 'muscle-band', name: 'Bandeau Muscle', stat: 'atk', mult: 1.15, price: 110, icon: 'MUSCLEBAND' },
  { api: 'twisted-spoon', name: 'Cuiller Tordue', stat: 'spAtk', mult: 1.15, price: 110, icon: 'TWISTEDSPOON' },
  { api: 'wise-glasses', name: 'Lunettes Sages', stat: 'spAtk', mult: 1.2, price: 140, icon: 'WISEGLASSES' },
  { api: 'quick-claw', name: 'Vive Griffe', stat: 'speed', mult: 1.3, price: 150, icon: 'QUICKCLAW' },
  { api: 'metal-coat', name: 'Peau Métal', stat: 'def', mult: 1.45, price: 160, icon: 'METALCOAT' },
  { api: 'leftovers', name: 'Restes', stat: 'hp', mult: 1.25, price: 180, icon: 'LEFTOVERS' },
  { api: 'mystic-water', name: 'Eau Mystique', stat: 'spDef', mult: 1.5, price: 205, icon: 'MYSTICWATER' },
  { api: 'choice-band', name: 'Bandeau Choix', stat: 'atk', mult: 1.5, price: 220, icon: 'CHOICEBAND' },
];

export const heldItem = (api: string | undefined): HeldItem | undefined => HELD_ITEMS.find((i) => i.api === api);

/**
 * Super Bonbon (GromagoShopScreen) : +5 niveaux de départ pour un Pokémon,
 * +20 au plus. Son prix monte à chaque achat (250 + 90·n, 900 au plus).
 */
export const CANDY = {
  icon: 'RARECANDY',
  step: 5,
  max: 20,
  price: (bought: number) => Math.min(900, 250 + 90 * bought),
};

export type BuildingId = 'study' | 'market' | 'dorm' | 'training' | 'jetty';

/**
 * Aménagements du Repaire, bâtis par Ossatueur (BaseManager.BUILDINGS,
 * HubWorld) : au début, le camp n'a que son feu, Dracolosse, Porygon, le
 * bâtisseur et le messager ; chaque construction y fait venir du monde. Le jeu les payait en
 * bois, pierre et vivres rapportés d'expédition ; ici, en Baies.
 */
export const BUILDINGS: readonly { id: BuildingId; name: string; desc: string; price: number; art: number }[] = [
  { id: 'study', name: 'Étude d’Alakazam', desc: 'Une hutte de mousse et sa statue : Alakazam s’y installe et vend améliorations, objets tenus et CS.', price: 100, art: 65 },
  { id: 'market', name: 'Marché du tuteur', desc: 'Deux étals sous auvent : M. Mime y enseigne les CT.', price: 150, art: 122 },
  { id: 'dorm', name: 'Dortoir', desc: 'Deux tipis et des paillasses : des libérés viennent y dormir.', price: 80, art: 143 },
  { id: 'training', name: 'Terrain d’entraînement', desc: 'De la terre battue et des mannequins : des libérés s’y entraînent du matin au soir.', price: 120, art: 4 },
  { id: 'jetty', name: 'Ponton', desc: 'Un ponton de bois sur le lac, à l’écart du feu : on marche jusqu’au bout, au-dessus de l’eau.', price: 120, art: 7 },
];

export type CsId = 'surf' | 'cut' | 'strength' | 'rock-smash';

/**
 * Capacités spéciales (GameManager.CS_CATALOG), à l'étude d'Alakazam. Surf est la
 * seule à servir pour l'instant : sans elle, l'eau du Repaire est un mur, et
 * l'île du lac reste hors d'atteinte. Les autres viendront avec les coffres
 * et les rochers des salles de run.
 */
export const CS_LIST: readonly { id: CsId; name: string; price: number; desc: string; ready: boolean; icon: string }[] = [
  { id: 'surf', name: 'Surf', price: 250, desc: 'Nager à travers l’eau : le lac du Repaire, et l’île qu’il garde.', ready: true, icon: 'machine_WATER' },
  { id: 'cut', name: 'Coupe', price: 200, desc: 'Couper les arbustes qui gardent certains coffres.', ready: false, icon: 'machine_GRASS' },
  { id: 'rock-smash', name: 'Éclate-Roc', price: 180, desc: 'Briser les rochers fissurés qui barrent un passage.', ready: false, icon: 'machine_FIGHTING' },
  { id: 'strength', name: 'Force', price: 220, desc: 'Pousser les rochers qui bloquent l’accès à certains coffres.', ready: false, icon: 'machine_NORMAL' },
];

/** Baies gagnées (CombatArena.gd) : boss, victoire finale, et consolation d'une défaite. */
export const BAIES = {
  boss: (act: number) => 120 + act * 80,
  finalBonus: 300,
  victory: (rooms: number) => 500 + rooms * 30,
  defeat: (rooms: number) => rooms * 15,
};
