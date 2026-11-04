import { BASE_TEAM_LEVEL } from '../combat/pokemon';
import { evolvedStart, preEvolutionOf } from '../data/evolutions';
import { LEGENDARY_SPECIES } from '../data/species';
import { heldItem } from './catalog';
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
/** ITEM_WEIGHT : objet tenu, poids fixe. */
export const ITEM_WEIGHT = 2;
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

/** Poids d'un Pokémon : selon son stade, ou 10 pour un légendaire. */
export const pokemonWeight = (id: number): number => (LEGENDARY_SPECIES.includes(id) ? LEGENDARY_WEIGHT : STAGE_WEIGHT[Math.min(2, stageOf(id))]);

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
  const item = heldItem(save.held[uid]) ? ITEM_WEIGHT : 0;
  return { mon, moves, item, total: mon + moves + item };
}
