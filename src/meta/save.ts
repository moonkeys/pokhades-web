// Progression permanente, gardée d'une run à l'autre (GameManager.gd, save.json) :
// les Baies, l'équipe composée au Repaire, ses attaques et ses objets tenus,
// les CT achetées et les améliorations. Mémorisée dans le navigateur ; sans
// stockage (navigation privée), elle vit le temps de l'onglet.
//
// Écart voulu avec le jeu : pas encore de Pokémon à débloquer, de poids
// d'équipe, de ressources ni de bâtiments — les huit Pokémon jouables du
// prototype sont tous disponibles, seules les places dans l'équipe s'achètent.

import type { BuildingId, CsId, UpgradeId } from './catalog';

export interface Save {
  version: number;
  /** Monnaie permanente (GameManager.gold, affichée « Baies »). */
  baies: number;
  /** Runs lancées depuis le Repaire. */
  runs: number;
  /** L'équipe (n° de Pokédex) ; le premier mène, au camp comme en run. */
  team: number[];
  /** Attaques choisies par Pokémon (noms d'API), 4 au plus (GameManager.move_loadouts). */
  loadouts: Record<number, string[]>;
  /** CT achetées chez le tuteur : apprenables par tout Pokémon qui le peut (purchased_move_names). */
  tms: string[];
  /** Objets tenus possédés, par nom d'API (item_inventory). */
  items: Record<string, number>;
  /** Objet tenu par chaque Pokémon (pokemon_item). */
  held: Record<number, string>;
  /** Niveau de chaque amélioration permanente. */
  upgrades: Partial<Record<UpgradeId, number>>;
  /** PNJ dont on a déjà entendu la présentation (seen_npc_intros). */
  intros: string[];
  /** Capacités spéciales achetées à l'étude (owned_cs). */
  cs: CsId[];
  /** Aménagements bâtis par Ossatueur (BaseManager : base.built). */
  built: BuildingId[];
  /** Niveaux de départ gagnés aux Super Bonbons, par Pokémon (start_level_bonus). */
  levels: Record<number, number>;
  /** Super Bonbons achetés (candies_bought) : leur prix en dépend. */
  candies: number;
}

/** GameManager.reset_save : 200 Baies, Pikachu seul. */
const DEFAULTS: Save = {
  version: 1,
  baies: 200,
  runs: 0,
  team: [25],
  loadouts: {},
  tms: [],
  items: {},
  held: {},
  upgrades: {},
  intros: [],
  cs: [],
  built: [],
  levels: {},
  candies: 0,
};

const KEY = 'pokhades-save';

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...structuredClone(DEFAULTS), ...(JSON.parse(raw) as Partial<Save>) };
  } catch {
    // Stockage indisponible : une partie neuve.
  }
  return structuredClone(DEFAULTS);
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

/** Niveau de départ d'un Pokémon : le niveau de base, plus ses Super Bonbons. */
export const startLevel = (save: Save, id: number, base: number): number => base + (save.levels[id] ?? 0);
