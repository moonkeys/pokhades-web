// Ce que vend le Repaire, en Baies : les améliorations permanentes
// (UpgradeShopScreen et ShopScreen « La Réserve »), les CT du tuteur
// (MoveShopScreen.MOVE_LIST) et les objets tenus (ItemCatalog.ITEMS).

export type UpgradeId = 'slots' | 'xp' | 'purse' | 'vigor' | 'dash' | 'revives' | 'magnet' | 'weight';

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
  /** Monnaie du prix : les Baies, sauf mention des Éclats de Champion. */
  currency?: 'shards';
}

/** GameManager.TEAM_SLOT_COSTS : places 2 à 6. */
const TEAM_SLOT_COSTS = [80, 120, 180, 250, 350];
/** GameManager.DASH_CHARGE_COSTS, moins la première charge que le prototype donne d'office. */
const DASH_CHARGE_COSTS = [120, 200];
/** GameManager.WEIGHT_CAP_COSTS, en Éclats de Champion : plafond 24 → 28 → 32 → 36 → 40. */
const WEIGHT_CAP_COSTS = [2, 4, 7, 12];

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
    // terminal, contre du poids d'équipe ; ici, l'équipe emporte une réserve commune de autant
    // de Rappels que le niveau, et le premier K.O. venu en consomme un (écart voulu : retour de
    // test, un compte par Pokémon rendait les runs trop faciles ; d'où un 3ᵉ niveau).
    id: 'revives',
    name: 'Ceinture de Rappels',
    effect: (n) => `${n} Rappel${n > 1 ? 's' : ''} pour toute l’équipe, utilisé${n > 1 ? 's' : ''} seul${n > 1 ? 's' : ''} au K.O.`,
    max: 3,
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
  {
    // GameManager.BERRY_MAGNET_COST : 300 Baies, achat unique.
    id: 'magnet',
    name: 'Aimant à Baies',
    effect: () => 'Les baies tombées des arbres filent vers toi (7 cases)',
    max: 1,
    price: () => 300,
    icon: 'MAGNET',
  },
  {
    // GameManager.buy_weight_cap : le plafond de poids d'équipe (meta/weight.ts), seule dépense des Éclats.
    id: 'weight',
    name: 'Bracelet de charge',
    effect: (n) => `Poids d’équipe jusqu’à ${24 + 4 * n}`,
    max: WEIGHT_CAP_COSTS.length,
    price: (n) => WEIGHT_CAP_COSTS[n],
    icon: 'MACHOBRACE',
    currency: 'shards',
  },
];

/** Éclats de Champion lâchés par un champion (CombatArena._reward_boss) : 1 + l'acte, 3 de plus pour le Dresseur final. */
export const SHARDS = { boss: (act: number) => 1 + act, finalBonus: 3, icon: 'COMETSHARD' } as const;

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
  /** Autres statistiques touchées (objets de l'atelier) : un multiplicateur chacune, < 1 pour un malus. */
  also?: readonly [HeldStat, number][];
  /** Prix chez Miaouss ; 0 pour un objet qu'on ne fait qu'à l'atelier (`crafted`). */
  price: number;
  icon: string;
  /** Façonné à l'atelier de Queulorior (meta/crafting.ts), introuvable à l'étal. Ajout. */
  crafted?: true;
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
  // Ajout : les objets de l'atelier (recettes dans meta/crafting.ts). Pas d'objet de Godot à
  // reprendre : ils portent le nom et l'icône de leur pendant des jeux, et touchent souvent deux
  // statistiques à la fois — ce que l'étal ne vend pas.
  { api: 'expert-belt', name: 'Ceinture Pro', stat: 'atk', mult: 1.12, also: [['spAtk', 1.12]], price: 0, icon: 'EXPERTBELT', crafted: true },
  { api: 'shell-bell', name: 'Grelot Coque', stat: 'hp', mult: 1.12, also: [['spDef', 1.12]], price: 0, icon: 'SHELLBELL', crafted: true },
  { api: 'rocky-helmet', name: 'Casque Brut', stat: 'def', mult: 1.25, also: [['hp', 1.06]], price: 0, icon: 'ROCKYHELMET', crafted: true },
  { api: 'focus-band', name: 'Bandeau', stat: 'hp', mult: 1.2, also: [['def', 1.1]], price: 0, icon: 'FOCUSBAND', crafted: true },
  { api: 'eviolite', name: 'Évoluroc', stat: 'def', mult: 1.2, also: [['spDef', 1.2]], price: 0, icon: 'EVIOLITE', crafted: true },
  { api: 'choice-scarf', name: 'Mouchoir Choix', stat: 'speed', mult: 1.5, price: 0, icon: 'CHOICESCARF', crafted: true },
  { api: 'choice-specs', name: 'Lunettes Choix', stat: 'spAtk', mult: 1.5, price: 0, icon: 'CHOICESPECS', crafted: true },
  { api: 'zoom-lens', name: 'Lentille Zoom', stat: 'spAtk', mult: 1.15, also: [['speed', 1.15]], price: 0, icon: 'ZOOMLENS', crafted: true },
  { api: 'life-orb', name: 'Orbe Vie', stat: 'atk', mult: 1.25, also: [['spAtk', 1.25], ['hp', 0.9]], price: 0, icon: 'LIFEORB', crafted: true },
];

/** Toutes les statistiques qu'un objet touche, la principale en tête. */
export const heldBoosts = (it: HeldItem): [HeldStat, number][] => [[it.stat, it.mult], ...(it.also ?? [])];

/** « Attaque +12 % · Atq. Spé. +12 % » ; un malus s'écrit en négatif. */
export const heldText = (it: HeldItem): string =>
  heldBoosts(it)
    .map(([s, m]) => `${STAT_FR[s]} ${m >= 1 ? '+' : '−'}${Math.round(Math.abs(m - 1) * 100)} %`)
    .join(' · ');

/** Applique l'objet tenu aux statistiques d'un Pokémon (PV max à part : ils remontent avec). */
export function applyHeld(mon: { boostMaxHp(m: number): void; mult: Record<Exclude<HeldStat, 'hp'>, number> }, it: HeldItem | undefined): void {
  for (const [s, m] of it ? heldBoosts(it) : []) {
    if (s === 'hp') mon.boostMaxHp(m);
    else mon.mult[s] *= m;
  }
}

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

/** Ressources de construction (GameManager.RESOURCE_DEFS), trouvées dans les coffres de run. */
export type ResourceId = 'wood' | 'stone' | 'food';

/**
 * `icon` : une icône d'objet d'Essentials (assets/essentials/items), ou
 * `tile` : un morceau du tileset, en pixels (x, y, largeur, hauteur) —
 * Essentials n'a pas d'objet « bois » : la petite souche à la coupe claire
 * (PROPS.stump[1], une case carrée de 16 px) en tient lieu, lisible en petit.
 */
export const RESOURCES: Record<ResourceId, { name: string; icon?: string; tile?: [number, number, number, number] }> = {
  wood: { name: 'Bois', tile: [96, 192, 16, 16] },
  stone: { name: 'Pierre', icon: 'HARDSTONE' },
  food: { name: 'Nourriture', icon: 'HONEY' },
};
export const RESOURCE_IDS = Object.keys(RESOURCES) as ResourceId[];

export type Cost = Partial<Record<ResourceId, number>>;

/** Le stock couvre tout le coût (GameManager.can_afford_resources). */
export const canAfford = (stock: Record<ResourceId, number>, cost: Cost = {}): boolean => RESOURCE_IDS.every((r) => stock[r] >= (cost[r] ?? 0));

export type BuildingId = 'outpost' | 'tavern' | 'study' | 'market' | 'dorm' | 'training' | 'jetty' | 'clearing' | 'field' | 'houses' | 'gardens' | 'lamps' | 'eastglade' | 'hamlet' | 'atelier';

/**
 * Aménagements du Repaire, bâtis par le bâtisseur (Charpenti, puis ses
 * évolutions ; BaseManager.BUILDINGS, HubWorld) : au début, le camp n'a que
 * son feu, Dracolosse, Porygon, le bâtisseur, le messager et le savant ;
 * chaque construction y fait venir du monde. Écart voulu (retour de test) :
 * le pisteur (missions) et la doyenne (quêtes) arrivent eux aussi avec leur
 * chantier, le Poste d'expédition et la Buvette, au lieu d'être là d'office. Le jeu les payait en bois,
 * pierre et vivres rapportés d'expédition. Écart voulu (retour de test :
 * « soit tu as les ressources, soit tu payes, c'est bizarre d'avoir les
 * deux ») : un chantier se paie d'une seule façon. Ceux qui font venir un
 * gardien et son service (Poste d'expédition, Buvette, Étude, Marché,
 * Atelier) coûtent des Baies (`price`) ; les vraies constructions, du bois,
 * de la pierre et des vivres (`cost`), trouvés dans les coffres de run et
 * rapportés des missions.
 *
 * Écart voulu : le Défrichage ouvre une clairière dans la forêt de l'ouest
 * (generate.ts, CAMP_GLADE), où l'on bâtit ensuite le Champ et les Maisons
 * (`needs`) ; Godot n'agrandissait pas son camp.
 *
 * Ajout : la seconde vague, pour agrandir encore le camp et le faire vivre —
 * les Jardins et les Lampadaires (décor, et des libérés qui s'y posent), puis
 * le Défrichage de l'est (CAMP_EAST_GLADE) et son Bourg. Plus aucun sauvage
 * ne vient au Repaire : seuls les Pokémon libérés y vivent, et chaque
 * construction leur fait de la place (camp.ts, `dwellers`).
 */
export const BUILDINGS: readonly { id: BuildingId; name: string; desc: string; price?: number; cost?: Cost; art: number; needs?: BuildingId }[] = [
  { id: 'outpost', name: 'Poste d’expédition', desc: 'Une petite place de briques et la carte des expéditions : Démolosse s’y installe et envoie des libérés en mission chercher des ressources.', price: 80, art: 229 },
  { id: 'tavern', name: 'Buvette', desc: 'Un comptoir, une table et le tableau des quêtes : Kangourex s’y installe, et ses quêtes font venir des Pokémon introuvables ailleurs.', price: 150, art: 115 },
  { id: 'study', name: 'Étude d’Alakazam', desc: 'Une hutte de mousse et sa statue : Alakazam s’y installe et vend améliorations et CS.', price: 100, art: 65 },
  { id: 'market', name: 'Marché du tuteur', desc: 'Trois étals sous auvent : M. Mime y enseigne les CT, Miaouss y vend objets tenus et Super Bonbons.', price: 150, art: 122 },
  { id: 'dorm', name: 'Dortoir', desc: 'Deux tipis et des paillasses : 3 places de plus au Repaire, et Démolosse, au poste d’expédition, peut mener une mission de plus.', cost: { wood: 15, food: 5 }, art: 143 },
  { id: 'training', name: 'Terrain d’entraînement', desc: 'De la terre battue et des mannequins : des libérés s’y entraînent, et Démolosse y envoie qui veut gagner des niveaux.', cost: { wood: 20, stone: 15 }, art: 4 },
  { id: 'jetty', name: 'Ponton', desc: 'Un ponton de bois sur le lac, à l’écart du feu : on marche jusqu’au bout, au-dessus de l’eau.', cost: { wood: 30 }, art: 7 },
  { id: 'clearing', name: 'Défrichage', desc: 'On abat la forêt à l’ouest de la place : une clairière s’ouvre, où des libérés viennent se promener.', cost: { food: 15 }, art: 532 },
  { id: 'field', name: 'Champ de cultures', desc: 'De la terre labourée dans la clairière : des libérés la cultivent, et le camp gagne de la Nourriture à chaque salle franchie. Héliatronc y tient un potager : il y plante les herbes de l’atelier.', cost: { wood: 10, stone: 5 }, art: 1, needs: 'clearing' },
  { id: 'houses', name: 'Maisons', desc: 'Deux chaumières et des paillasses dans la clairière : 4 places de plus au Repaire.', cost: { wood: 30, stone: 20, food: 10 }, art: 25, needs: 'clearing' },
  { id: 'gardens', name: 'Jardins fleuris', desc: 'Des massifs fleuris autour de la place, et deux bancs face au tableau de Bouldeneu : des libérés viennent y suivre ses leçons.', cost: { wood: 10, food: 10 }, art: 182 },
  { id: 'lamps', name: 'Lampadaires', desc: 'Quelques lampadaires le long des allées, comme en ville : des libérés viennent veiller dessous.', cost: { stone: 20, wood: 5 }, art: 125, needs: 'study' },
  { id: 'eastglade', name: 'Défrichage de l’est', desc: 'On abat la forêt derrière la hutte de l’équipe : le camp s’agrandit d’une seconde clairière, à l’est.', cost: { wood: 10, food: 20 }, art: 75, needs: 'houses' },
  { id: 'hamlet', name: 'Bourg', desc: 'Deux maisons, une place pavée et son puits dans la clairière de l’est : un coin de ville, et 6 places de plus au Repaire.', cost: { wood: 40, stone: 30, food: 15 }, art: 133, needs: 'eastglade' },
  // Ajout (retour de test : « un nouvel aménagement, un atelier avec un Pokémon artisan ») :
  // il suit le champ, dont le potager fournit les herbes de ses recettes (meta/crafting.ts).
  { id: 'atelier', name: 'Atelier de l’artisan', desc: 'Une maison de briques sur la rive du lac : Queulorior y façonne des objets tenus introuvables ailleurs et des nectars qui attirent de nouveaux Pokémon, avec les matériaux des coffres et les herbes du potager.', price: 220, art: 235, needs: 'field' },
];

/**
 * Places au Repaire (ajout, retour de test : « un nombre max de Pokémon dans le hub…
 * on achète de l'espace en construisant ») : combien de libérés il loge, en tout. Au-delà,
 * une recrue attend qu'on choisisse qui s'en va (main.ts, meetCandidate).
 */
export const BASE_CAPACITY = 6;
export const HOUSING: Partial<Record<BuildingId, number>> = { dorm: 3, houses: 4, hamlet: 6 };
export const campCapacity = (built: readonly BuildingId[]): number => BASE_CAPACITY + built.reduce((n, b) => n + (HOUSING[b] ?? 0), 0);

/**
 * Les chantiers que le bâtisseur propose ou a faits : ce qui attend un autre
 * chantier n'apparaît qu'une run après qu'il est bâti (Save.builtAt).
 * Écart voulu (retour de test) : tout se voyait, « X requis », dès le début.
 */
export function buildingsShown(save: { built: readonly BuildingId[]; builtAt: Partial<Record<BuildingId, number>>; runs: number }): typeof BUILDINGS {
  const ready = (id: BuildingId) => save.built.includes(id) && (save.builtAt[id] ?? -1) < save.runs;
  return BUILDINGS.filter((b) => save.built.includes(b.id) || !b.needs || ready(b.needs));
}

/** Champ de cultures : Nourriture récoltée par salle franchie en run (main.ts). */
export const FIELD_FOOD = 1;

export type CsId = 'surf' | 'cut' | 'strength' | 'rock-smash';

/**
 * Capacités spéciales (GameManager.CS_CATALOG), à l'étude d'Alakazam. Surf :
 * sans elle, l'eau du Repaire est un mur, et l'île du lac reste hors
 * d'atteinte. Coupe et Éclate-Roc lèvent les obstacles qui gardent les
 * coffres de run (run/chests.ts). Force (pousser un rocher) viendra plus tard.
 */
export const CS_LIST: readonly { id: CsId; name: string; price: number; desc: string; ready: boolean; icon: string }[] = [
  { id: 'surf', name: 'Surf', price: 250, desc: 'Nager à travers l’eau : le lac du Repaire et l’île qu’il garde, et en run l’eau des salles (l’îlot du Lac, la mer de la Plage) et la route de l’Océan. Sans elle, on ne nage plus.', ready: true, icon: 'machine_WATER' },
  { id: 'cut', name: 'Coupe', price: 200, desc: 'Couper les arbustes qui gardent les coffres des prairies, forêts, marais et lacs.', ready: true, icon: 'machine_GRASS' },
  { id: 'rock-smash', name: 'Éclate-Roc', price: 180, desc: 'Briser les rochers fissurés qui gardent les coffres des volcans, rocailles, montagnes glacées, villages et plages.', ready: true, icon: 'machine_FIGHTING' },
  { id: 'strength', name: 'Force', price: 220, desc: 'Pousser les rochers qui bloquent l’accès à certains coffres.', ready: false, icon: 'machine_NORMAL' },
];

/**
 * Baies gagnées (CombatArena.gd) : boss, victoire finale, et consolation d'une défaite.
 * Écart voulu (retour de test : « on se fait de l'argent beaucoup trop facilement… une
 * run gagnée, j'avais déjà 2000 Baies ») : divisées par trois environ — le jeu donnait
 * 120 + 80 par acte au boss, 300 au Dresseur final et 500 + 30 par salle à la victoire.
 * Les arbres (run/berries.ts) et les coffres (run/chests.ts) donnent moins aussi ; les
 * exploits du carnet (meta/feats.ts) paient surtout en Éclats.
 */
export const BAIES = {
  boss: (act: number) => 40 + act * 25,
  finalBonus: 120,
  victory: (rooms: number) => 150 + rooms * 6,
  defeat: (rooms: number) => rooms * 4,
};
