import { loadMove, type Move } from '../combat/moves';
import type { Pokemon } from '../combat/pokemon';
import type { Rng } from '../core/rng';

// Récompense « ✦ Nouvelle attaque » (CombatArena._roll_move_offers) : jusqu'à
// 3 attaques fortes que l'espèce peut apprendre et n'a pas déjà, plus jusqu'à
// 2 attaques équipées à renforcer (+25 % de puissance, 4 fois au plus).
// Le jeu retirait l'offre à chaque ouverture de l'écran ; ici elle est tirée
// une fois, quand la récompense apparaît, comme celle des dons.

/** CombatArena.STRONG_MOVES */
const STRONG_MOVES = ['flamethrower', 'thunderbolt', 'ice-beam', 'surf', 'earthquake', 'psychic', 'shadow-ball', 'energy-ball', 'brick-break', 'rock-slide'];
/** MoveData.MAX_UPGRADES et UPGRADE_PCT */
export const MAX_UPGRADES = 4;
export const UPGRADE_PCT = 0.25;
/** Emplacements de capacités (GameManager.move_slot_count). */
export const MOVE_SLOTS = 4;

export interface SkillOffer {
  learn: Move[];
  /** Index des capacités équipées à renforcer. */
  upgrade: number[];
}

export function canUpgrade(m: Move): boolean {
  return m.power > 0 && (m.upgrades ?? 0) < MAX_UPGRADES;
}

/** MoveData.apply_upgrade : la puissance seule, la portée et la cadence ne bougent pas. */
export function upgradeMove(m: Move): void {
  m.power = Math.ceil(m.power * (1 + UPGRADE_PCT));
  m.upgrades = (m.upgrades ?? 0) + 1;
}

export async function rollSkillOffer(mon: Pokemon, rng: Rng): Promise<SkillOffer> {
  const shuffle = <T>(a: T[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const equipped = new Set(mon.moves.map((m) => m.api));
  const apis = shuffle(STRONG_MOVES.filter((api) => !equipped.has(api) && mon.learnable.has(api))).slice(0, 3);
  const learn = (await Promise.all(apis.map((api) => loadMove(api, 0)))).filter((m): m is Move => !!m);
  const upgrade = shuffle(mon.moves.map((m, i) => (canUpgrade(m) ? i : -1)).filter((i) => i >= 0)).slice(0, 2);
  return { learn, upgrade };
}
