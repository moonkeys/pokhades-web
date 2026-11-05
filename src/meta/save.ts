// Progression permanente, gardée d'une run à l'autre (GameManager.gd, save.json) :
// les Baies, l'équipe composée au Repaire, ses attaques et ses objets tenus,
// les CT achetées et les améliorations. Mémorisée dans le navigateur ; sans
// stockage (navigation privée), elle vit le temps de l'onglet.
//
// Déblocage (GameManager.gd:789-873) : on part d'un seul Pokémon, le starter
// choisi au premier lancement (StarterScreen) ; 10 victoires sur une espèce de
// base en font venir un. Écarts voulus : les prisonniers libérés dans les
// grottes rejoignent aussi le camp (le jeu n'a pas de prisonniers), et (version
// 3, retour de test) chaque Pokémon est un individu (meta/mons.ts) : on peut
// en avoir plusieurs de la même espèce, chacun sa nature et ses talents.
// L'équipe, les attaques, les objets tenus et les niveaux se rangent par
// individu (`uid`) ; les victoires et le Pokédex, par espèce.

import { hash2 } from '../core/rng';
import { preEvolutionOf } from '../data/evolutions';
import { rollMon, type Mon } from './mons';
import { campCapacity, RESOURCE_IDS, type BuildingId, type CsId, type ResourceId, type UpgradeId } from './catalog';
import { GARDEN, MATERIALS, NECTARS, OLD_SEEDS } from './crafting';
import { MISSIONS, type MissionId } from './missions';
import { sanitizeQuests, type QuestId } from './quests';

export interface Save {
  version: number;
  /** Monnaie permanente (GameManager.gold, affichée « Baies »). */
  baies: number;
  /** Ressources de construction, trouvées dans les coffres de run (GameManager.resources). */
  resources: Record<ResourceId, number>;
  /** Éclats de Champion (GameManager.champion_shards) : lâchés par les champions, ils paient le plafond de poids. */
  shards: number;
  /**
   * Artisanat (meta/crafting.ts) : plantes du Potager,
   * matériaux de biome et nectars façonnés, par identifiant. Ajout.
   */
  materials: Record<string, number>;
  /** Parcelles du Potager : null si libre ; `left` : salles avant la récolte (0 : mûre). */
  garden: ({ plant: string; left: number } | null)[];
  /**
   * Nectar posé devant l'atelier : son visiteur (choisi à la pose) arrive
   * quand `left` tombe à 0, et attend au Repaire qu'on lui parle.
   */
  nectar: { id: string; left: number; visitor: number } | null;
  /**
   * Missions de Démolosse (ExpeditionManager._active), une case par
   * emplacement : null s'il est libre ; `left` : salles qui restent à
   * franchir en run, 0 quand le Pokémon est rentré (reste à récolter).
   */
  missions: ({ type: MissionId; pid: number; left: number } | null)[];
  /**
   * Quêtes de Kangourex (meta/quests.ts) : celles en cours (3 au plus), leur
   * progression depuis qu'on les a acceptées, et celles déjà réclamées.
   */
  quests: { active: QuestId[]; progress: Partial<Record<QuestId, number>>; done: QuestId[] };
  /** Runs lancées depuis le Repaire. */
  runs: number;
  /** L'équipe (uid des individus) ; le premier mène, au camp comme en run. */
  team: number[];
  /** Attaques choisies par individu (noms d'API), 4 au plus (GameManager.move_loadouts). */
  loadouts: Record<number, string[]>;
  /** CT achetées chez le tuteur : apprenables par tout Pokémon qui le peut (purchased_move_names). */
  tms: string[];
  /** Objets tenus possédés, par nom d'API (item_inventory). */
  items: Record<string, number>;
  /** Objet tenu par chaque individu (pokemon_item). */
  held: Record<number, string>;
  /** Niveau de chaque amélioration permanente. */
  upgrades: Partial<Record<UpgradeId, number>>;
  /** PNJ dont on a déjà entendu la présentation (seen_npc_intros). */
  intros: string[];
  /**
   * Ce que chaque poste du Repaire avait de neuf la dernière fois qu'on l'a
   * ouvert (meta/news.ts) : un repère « ! » flotte au-dessus de son gardien
   * tant que ça a changé. Ajout : le jeu n'a pas de tels repères.
   */
  newsSeen: Record<string, string>;
  /** Capacités spéciales achetées à l'étude (owned_cs). */
  cs: CsId[];
  /** Aménagements bâtis par le bâtisseur (BaseManager : base.built). */
  built: BuildingId[];
  /**
   * La run (`runs`) pendant laquelle chaque aménagement a été bâti : ce qui
   * en dépend n'apparaît chez le bâtisseur qu'après une run de plus.
   * Ajout : le jeu montrait tout d'emblée (retour de test : on débloquait
   * tout d'un coup).
   */
  builtAt: Partial<Record<BuildingId, number>>;
  /** Niveaux de départ gagnés aux Super Bonbons (et à l'entraînement), par individu (start_level_bonus). */
  levels: Record<number, number>;
  /** Super Bonbons achetés (candies_bought) : leur prix en dépend. */
  candies: number;
  /**
   * Super Bonbons donnés à chaque Pokémon : eux seuls se retirent (et
   * reviennent en réserve), pas les niveaux de l'entraînement de Démolosse.
   * Ajout (retour de test).
   */
  candied: Record<number, number>;
  /**
   * Les Pokémon de la rébellion, par uid, dans l'ordre de leur arrivée
   * (unlocked_pokemon, mais par individu) : espèce, nature, talents, surnom,
   * origine.
   */
  mons: Record<number, Mon>;
  /** Le prochain uid à donner. */
  nextUid: number;
  /** Le starter est choisi (avant : un Pikachu de passage tient l'équipe, le temps de l'écran). */
  started: boolean;
  /**
   * Le prologue (ajout, retour de test : « un début d'histoire ») : 'run', on se réveille en
   * prairie et des dresseurs nous traquent ; au premier retour au Repaire, Dracolosse raconte,
   * et c'est 'done'.
   */
  prologue: 'none' | 'run' | 'done';
  /**
   * Ceux qui veulent rejoindre la rébellion et attendent au Repaire qu'on leur parle (un
   * « ! » au-dessus d'eux) : vaincus assez de fois, ou arrivés quand le Repaire était plein.
   */
  candidates: { species: number; origin?: string; name?: string }[];
  /** Victoires par espèce depuis sa dernière recrue (la jauge du Pokédex). */
  progress: Record<number, number>;
  /** Recrues déjà venues de chaque espèce par les victoires : le seuil suivant en dépend. */
  recruited: Record<number, number>;
  /** Victoires par espèce, toutes formes et tous rôles confondus (defeat_counts). */
  defeats: Record<number, number>;
  /**
   * Espèces rencontrées, pour le Pokédex. Écart voulu : le jeu ne note une
   * espèce qu'à sa première défaite ; ici dès qu'elle apparaît.
   */
  seen: number[];
  /**
   * Carnet des exploits (meta/feats.ts, ajout) : les champions vaincus au moins une
   * fois (par nom), les biomes atteints par une porte de route, les runs gagnées, et
   * les exploits déjà réclamés.
   */
  beaten: string[];
  visited: string[];
  wins: number;
  feats: string[];
  /** Records (chez Xatu) : la salle la plus loin atteinte en run (1 à 35). */
  bestRoom: number;
  /**
   * Les formes atteintes par évolution en run, et les lignées complétées (forme finale
   * atteinte) : la prime de lignée ne tombe qu'une fois par lignée.
   */
  evolved: number[];
}

/** Longueur d'un surnom dans les jeux principaux (12 depuis la 6ᵉ génération). */
export const NICK_MAX = 12;

/**
 * GameManager.reset_save : 200 Baies, rien de débloqué — le starter se choisit
 * à l'arrivée. Pikachu tient l'équipe le temps de ce choix (le Repaire se
 * construit derrière l'écran, il lui faut un meneur).
 */
const DEFAULTS: Save = {
  version: 3,
  baies: 200,
  resources: { wood: 0, stone: 0, food: 0 },
  shards: 0,
  materials: {},
  garden: [],
  nectar: null,
  missions: [],
  quests: { active: [], progress: {}, done: [] },
  runs: 0,
  team: [1],
  loadouts: {},
  tms: [],
  items: {},
  held: {},
  upgrades: {},
  intros: [],
  newsSeen: {},
  cs: [],
  built: [],
  builtAt: {},
  levels: {},
  candies: 0,
  candied: {},
  mons: { 1: { uid: 1, species: 25, nature: 'hardy', iv: { hp: 0, atk: 0, def: 0, spAtk: 0, spDef: 0, speed: 0 } } },
  nextUid: 2,
  started: false,
  prologue: 'none',
  candidates: [],
  progress: {},
  recruited: {},
  defeats: {},
  seen: [],
  beaten: [],
  visited: [],
  wins: 0,
  feats: [],
  bestRoom: 0,
  evolved: [],
};

const KEY = 'pokhades-save';

export function loadSave(): Save {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
    if (raw) {
      const old = JSON.parse(raw) as Partial<Save>;
      // Avant la version 3, tout se rangeait par espèce : on repart d'une partie neuve (retour
      // de test : « tu peux reset ma sauvegarde »), l'ancienne gardée de côté.
      if ((old.version ?? 0) < 3) {
        localStorage.setItem(`${KEY}-v2`, raw);
        return structuredClone(DEFAULTS);
      }
      return migrate({ ...structuredClone(DEFAULTS), ...old });
    }
  } catch (err) {
    // Stockage indisponible : une partie neuve. Sauvegarde illisible : on la met de
    // côté avant que le prochain writeSave ne l'écrase.
    if (raw) {
      console.error('Sauvegarde illisible, copiée sous', `${KEY}-backup`, err);
      try {
        localStorage.setItem(`${KEY}-backup`, raw);
      } catch {
        // Plus de place : tant pis.
      }
    }
  }
  return structuredClone(DEFAULTS);
}

/** Remet d'aplomb une sauvegarde de version 3 (champs manquants ou abîmés). */
export function migrate(save: Save): Save {
  save.mons = save.mons && typeof save.mons === 'object' ? save.mons : structuredClone(DEFAULTS.mons);
  save.team = save.team.filter((uid) => save.mons[uid]);
  if (!save.team.length) save.team = [Number(Object.keys(save.mons)[0])];
  save.nextUid = Math.max(save.nextUid || 1, ...Object.keys(save.mons).map((k) => Number(k) + 1));
  // ExpeditionManager.from_dict : une mission inconnue libère sa case, `left` ne descend pas sous 0.
  save.missions = (save.missions ?? []).map((m) => (m && MISSIONS.some((x) => x.id === m.type) ? { ...m, left: Math.max(0, m.left) } : null));
  // Quêtes inconnues oubliées, trois actives au plus, progression bornée à l'objectif.
  save.quests = sanitizeQuests(save.quests);
  // add_champion_shards : jamais sous 0, toujours entier.
  save.shards = Math.max(0, Math.floor(Number(save.shards) || 0));
  // Ressources : une clé manquante ou nulle donnerait NaN au premier ajout.
  const res = save.resources && typeof save.resources === 'object' ? save.resources : ({} as Partial<Record<ResourceId, number>>);
  save.resources = Object.fromEntries(RESOURCE_IDS.map((r) => [r, Math.max(0, Math.floor(Number(res[r]) || 0))])) as Record<ResourceId, number>;
  // Artisanat : des quantités entières, jamais négatives ; une parcelle ou un nectar inconnus s'oublient.
  const mats: Record<string, number> = {};
  for (const [k, v] of Object.entries(save.materials && typeof save.materials === 'object' ? save.materials : {})) {
    const n = Math.max(0, Math.floor(Number(v) || 0));
    if (n && (k in MATERIALS || k in NECTARS)) mats[k] = n;
  }
  save.materials = mats;
  // (Avant le potager sans graines, une parcelle gardait son sachet : elle devient sa plante.)
  save.garden = (Array.isArray(save.garden) ? save.garden : []).map((p) => {
    const plant = (p as { plant?: string; seed?: string } | null)?.plant ?? OLD_SEEDS[(p as { seed?: string } | null)?.seed ?? ''];
    return p && plant && plant in GARDEN ? { plant, left: Math.max(0, Math.floor(Number(p.left) || 0)) } : null;
  });
  const n = save.nectar;
  save.nectar = n && n.id in NECTARS && Number.isInteger(n.visitor) ? { id: n.id, left: Math.max(0, Math.floor(Number(n.left) || 0)), visitor: n.visitor } : null;
  // Bâtis avant builtAt : comme s'ils dataient d'avant la dernière run.
  save.builtAt = save.builtAt && typeof save.builtAt === 'object' ? save.builtAt : {};
  save.newsSeen = save.newsSeen && typeof save.newsSeen === 'object' ? save.newsSeen : {};
  // Le Poste d'expédition et la Buvette n'existaient pas (Démolosse et Kangourex étaient là
  // d'office) : une partie qui s'en servait déjà les garde, comme bâtis de longue date.
  const using = { outpost: save.missions.some((m) => m !== null), tavern: save.quests.active.length + save.quests.done.length > 0 } as const;
  for (const id of ['outpost', 'tavern'] as const) if (using[id] && !save.built.includes(id)) save.built.push(id);
  save.candied = save.candied && typeof save.candied === 'object' ? save.candied : {};
  if (save.prologue !== 'run' && save.prologue !== 'done') save.prologue = save.started ? 'done' : 'none';
  save.candidates = Array.isArray(save.candidates) ? save.candidates.filter((c) => c && Number.isInteger(c.species)) : [];
  save.progress = save.progress && typeof save.progress === 'object' ? save.progress : {};
  save.recruited = save.recruited && typeof save.recruited === 'object' ? save.recruited : {};
  const names = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : []);
  save.beaten = names(save.beaten);
  save.visited = names(save.visited);
  save.feats = names(save.feats);
  save.wins = Math.max(0, Math.floor(Number(save.wins) || 0));
  save.bestRoom = Math.max(0, Math.floor(Number(save.bestRoom) || 0));
  save.evolved = Array.isArray(save.evolved) ? [...new Set(save.evolved.filter((n) => Number.isInteger(n)))] : [];
  return save;
}

/** Une progression neuve (bouton de test du panneau). */
export const resetSave = (): Save => structuredClone(DEFAULTS);

export function writeSave(save: Save): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Stockage indisponible : la progression vit le temps de l'onglet.
  }
}

export const level = (save: Save, id: UpgradeId): number => save.upgrades[id] ?? 0;

/** Niveau de départ d'un individu : le niveau de base, plus ses Super Bonbons. */
export const startLevel = (save: Save, uid: number, base: number): number => base + (save.levels[uid] ?? 0);

/** Les Pokémon qu'on peut emmener (uid) : tous les individus, dans l'ordre de leur arrivée. */
export const roster = (save: Save): number[] => (save.started ? Object.keys(save.mons).map(Number) : []);

/** L'espèce d'un individu (Pikachu si l'uid est inconnu). */
export const speciesOf = (save: Save, uid: number): number => save.mons[uid]?.species ?? 25;

/** A-t-on au moins un individu de cette espèce ? (le Pokédex le marque « ★ ») */
export const ownsSpecies = (save: Save, species: number): boolean => save.started && Object.values(save.mons).some((m) => m.species === species);

/** Les espèces qu'on a, sans doublon. */
export const ownedSpecies = (save: Save): number[] => [...new Set(roster(save).map((uid) => save.mons[uid].species))];

/** Un nouvel individu au Repaire (nature et talents tirés) ; l'espèce est vue. */
export function addMon(save: Save, species: number, origin?: string, name?: string): Mon {
  const m = rollMon(save.nextUid++, species, origin);
  if (name) m.name = name;
  save.mons[m.uid] = m;
  markSeen(save, species);
  return m;
}

/** Le surnom d'un individu, sinon `fallback` (le nom de l'espèce). */
export const monName = (save: Save, uid: number, fallback: string): string => save.mons[uid]?.name || fallback;

/**
 * Victoires qui font venir une recrue d'une espèce (GameManager.UNLOCK_DEFEAT_THRESHOLD,
 * 20 dans le jeu). Écart voulu (retours de test : « au début, c'est dur d'avoir des
 * compagnons », puis « sinon on va avoir 10 000 Rattata ») : 10 la première fois, 20 la
 * deuxième, puis de 20 à 40, tiré pour chaque espèce et chaque fois.
 */
export const UNLOCK_THRESHOLD = 10;
export function recruitThreshold(save: Save, species: number): number {
  const n = save.recruited[species] ?? 0;
  return n === 0 ? UNLOCK_THRESHOLD : n === 1 ? 20 : 20 + Math.floor(hash2(species, n, 733) * 21);
}

/**
 * Seule une forme de base se débloque (is_base_form) : une évolution se gagne
 * en faisant monter sa lignée en run. Ses victoires comptent quand même.
 */
export const isBaseForm = (id: number): boolean => preEvolutionOf(id) === null;


export function markSeen(save: Save, id: number): boolean {
  if (save.seen.includes(id)) return false;
  save.seen.push(id);
  return true;
}

/**
 * GameManager.record_defeat : une victoire de plus (dans le biome `where`). Rend true si
 * elle fait venir une recrue : elle attend au Repaire qu'on lui parle (Save.candidates).
 * Une forme évoluée compte pour le Pokédex, pas pour les recrues ; une espèce dont une
 * recrue attend déjà ne remplit pas sa jauge.
 */
export function recordDefeat(save: Save, id: number, where?: string): boolean {
  save.defeats[id] = (save.defeats[id] ?? 0) + 1;
  markSeen(save, id);
  if (!isBaseForm(id) || save.candidates.some((c) => c.species === id)) return false;
  const n = (save.progress[id] = (save.progress[id] ?? 0) + 1);
  if (n < recruitThreshold(save, id)) return false;
  save.progress[id] = 0;
  save.recruited[id] = (save.recruited[id] ?? 0) + 1;
  save.candidates.push({ species: id, ...(where ? { origin: where } : {}) });
  return true;
}

/** Combien de libérés le Repaire loge (catalog.ts, campCapacity). */
export const capacity = (save: Save): number => campCapacity(save.built);
export const isFull = (save: Save): boolean => roster(save).length >= capacity(save);

/**
 * Un nouveau venu (prisonnier de grotte, visiteur du nectar, récompense de quête) : il entre
 * s'il reste une place, sinon il rejoint la file d'attente du Repaire. Rend l'individu, ou null.
 */
export function welcomeMon(save: Save, species: number, origin?: string, name?: string): Mon | null {
  if (!isFull(save)) return addMon(save, species, origin, name);
  save.candidates.push({ species, ...(origin ? { origin } : {}), ...(name ? { name } : {}) });
  return null;
}

/**
 * L'exil (retour de test : « choisir quel Pokémon doit partir… un peu triste ») : il quitte
 * la rébellion. Son objet tenu revient en réserve, ses Super Bonbons aussi. Pas celui en
 * mission, ni le dernier de l'équipe. Rend false si c'est impossible.
 */
export function exile(save: Save, uid: number): boolean {
  if (!save.mons[uid] || save.missions.some((m) => m?.pid === uid) || (save.team.length === 1 && save.team[0] === uid)) return false;
  save.items['rare-candy'] = (save.items['rare-candy'] ?? 0) + (save.candied[uid] ?? 0);
  delete save.mons[uid];
  delete save.held[uid];
  delete save.loadouts[uid];
  delete save.levels[uid];
  delete save.candied[uid];
  save.team = save.team.filter((t) => t !== uid);
  return true;
}
