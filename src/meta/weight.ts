import { BASE_TEAM_LEVEL } from '../combat/pokemon';
import { evolvedStart, preEvolutionOf } from '../data/evolutions';
import { LEGENDARY_SPECIES } from '../data/species';
import BST from '../data/bst.json' with { type: 'json' };
import { heldBoosts, heldItem, type HeldItem } from './catalog';
import { level, speciesOf, startLevel, type Save } from './save';

// Poids d'équipe (GameManager.gd:604-680, « système de poids de build ») :
// chaque Pokémon emmené, son objet tenu et ses grosses attaques pèsent, et la
// somme ne doit pas dépasser le plafond pour partir en run. C'est ce qui
// empêche de descendre avec six Pokémon évolués bardés de CT et d'objets :
// une compo forte se paie en places, une compo légère laisse de la marge.
// Le plafond monte au Repaire, contre des Éclats de Champion (catalog.ts,
// amélioration « weight ») : il faut réussir des runs pour s'alourdir.
//
// Écarts voulus :
// - un légendaire jouable (gagné aux quêtes de Kangourex) pèse 10 : sans
//   pré-évolution, la règle du stade le compterait 3, le prix d'un Pichu ;
// - les Rappels et la bourse de départ ne pèsent pas : le prototype les vend
//   comme des améliorations définitives (catalog.ts), pas comme un choix de
//   build refait avant chaque run.
//
// Module pur : le loadout effectif (async) est résolu par campscreen.ts, qui
// passe ici les attaques déjà chargées.

/** Plafond de départ (GameManager.build_weight_cap) et gain par palier acheté (WEIGHT_CAP_STEP). */
export const BASE_CAP = 24;
export const CAP_STEP = 4;
/**
 * Poids d'un objet tenu, selon ce qu'il apporte en tout (le produit de ses multiplicateurs) :
 * 1 jusqu'à +20 % (Baie Oran, Bandeau Muscle), 2 jusqu'à +35 % (Vive Griffe, Ceinture Pro), 3
 * au-delà (Peau Métal, objets Choix, Évoluroc, Orbe Vie). Écart voulu (réglages du 18 novembre
 * 2026) : GameManager.ITEM_WEIGHT pesait 2 pour tout, une Baie Oran autant qu'un Bandeau Choix.
 */
export function itemWeight(it: HeldItem): number {
  const gain = heldBoosts(it).reduce((g, [, m]) => g * m, 1) - 1;
  return gain <= 0.2 ? 1 : gain <= 0.35 ? 2 : 3;
}
export const LEGENDARY_WEIGHT = 10;

/** Stade d'évolution : 0 pour une forme de base, 1 ou 2 ensuite (une forme sautée compte quand même). */
export function stageOf(id: number): number {
  let stage = 0;
  for (let prev = preEvolutionOf(id); prev !== null; prev = preEvolutionOf(prev)) stage++;
  return stage;
}

/**
 * Poids d'un Pokémon par stade. Écart voulu : GameManager.pokemon_weight
 * annonce 3 / 5 / 8 mais calcule `3 + 2 × stade`, soit 7 au stade final ; on
 * suit l'intention écrite, une lignée pleinement évoluée coûte plus cher.
 */
const STAGE_WEIGHT = [3, 5, 8] as const;

/**
 * Plancher selon la force (le total des stats de base, data/bst.json, scripts/build-bst.ts) : un
 * Pokémon sans évolution ou dont la pré-évolution manque au jeu pesait 3 quel qu'il soit —
 * Ronflex (540) comme Pichu (réglages du 18 novembre 2026). 480 et plus : 8, comme une forme
 * finale ; 400 et plus : 5.
 */
const BST_FLOOR: readonly [number, number][] = [
  [480, 8],
  [400, 5],
];
const bst = (id: number): number => (BST as Record<string, number>)[id] ?? 0;

/** Poids d'un Pokémon : selon son stade et sa force, ou 10 pour un légendaire. */
export function pokemonWeight(id: number): number {
  if (LEGENDARY_SPECIES.includes(id)) return LEGENDARY_WEIGHT;
  const floor = BST_FLOOR.find(([min]) => bst(id) >= min)?.[1] ?? 0;
  return Math.max(STAGE_WEIGHT[Math.min(2, stageOf(id))], floor);
}

/**
 * GameManager.move_weight : les attaques faibles (celles qu'on a d'office) sont
 * gratuites, les grosses frappes coûtent jusqu'à 3. Une capacité de statut
 * (puissance 0) ne pèse rien.
 */
export function moveWeight(power: number): number {
  if (power <= 40) return 0;
  if (power <= 70) return 1;
  if (power <= 90) return 2;
  return 3;
}

/** Plafond de poids, paliers achetés compris. */
export const weightCap = (save: Save): number => BASE_CAP + CAP_STEP * level(save, 'weight');

export interface MemberWeight {
  mon: number;
  moves: number;
  item: number;
  total: number;
}

/**
 * Poids d'un membre de l'équipe. L'espèce pesée est celle avec laquelle il
 * part (un Super Bonbon peut le faire partir évolué), pas celle rangée dans
 * la sauvegarde ; `movePowers` : la puissance de chaque attaque équipée.
 */
export function memberWeight(uid: number, save: Save, movePowers: readonly number[]): MemberWeight {
  const mon = pokemonWeight(evolvedStart(speciesOf(save, uid), startLevel(save, uid, BASE_TEAM_LEVEL)));
  const moves = movePowers.reduce((s, p) => s + moveWeight(p), 0);
  const held = heldItem(save.held[uid]);
  const item = held ? itemWeight(held) : 0;
  return { mon, moves, item, total: mon + moves + item };
}
