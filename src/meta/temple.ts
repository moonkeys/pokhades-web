import type { Save } from './save';

// L'épreuve du temple de Lugia (ajout du 27 novembre 2026 : « il faut faire quelque chose de
// l'île ; entrer dans le temple pour avoir accès à une salle spéciale, des jeux ; un seul Pokémon
// sur l'île, mais qui a un rôle »). Lugia, au Repaire, ouvre le temple : des vagues sans fin, avec
// l'équipe du Repaire, hors run (run/room.ts, special `temple` ; main.ts, newRun(true)). Ce module
// dit ce qu'elle rapporte, pour l'écran de Lugia (ui/campscreen.ts) comme pour la fin d'épreuve.

/** Baies par vague vaincue, à chaque essai. */
export const TEMPLE_BAIES_PER_WAVE = 12;
/** Un Éclat de Champion par palier de vagues franchi pour la première fois (record battu). */
export const TEMPLE_SHARD_STEP = 5;
/** À cette vague vaincue, pour la première fois, la récompense du temple rejoint la rébellion. */
export const TEMPLE_PRIZE_AT = 15;
/**
 * La récompense du temple : Drattak, que Lugia confie. Lugia d'abord, mais ses planches PMD n'ont
 * ni attaque ni tir (retour du 27 novembre 2026 : « s'il n'y a pas d'animation du tout, on change
 * de Pokémon à débloquer »). Drattak a ses planches de combat complètes et n'est la récompense de
 * rien d'autre (Mewtwo et Raikou, les seuls légendaires complets, sont ceux des quêtes).
 */
export const TEMPLE_PRIZE = 373;
export const TEMPLE_PRIZE_NAME = 'Drattak';

export interface TempleReward {
  baies: number;
  shards: number;
  /** La récompense du temple (TEMPLE_PRIZE) rejoint la rébellion (une fois pour toutes). */
  prize: boolean;
  /** Record battu. */
  record: boolean;
}

/** Ce que rapporte un essai qui a vaincu `cleared` vagues, d'après le record d'avant. */
export function templeReward(save: Save, cleared: number): TempleReward {
  const best = save.temple.best;
  return {
    baies: TEMPLE_BAIES_PER_WAVE * cleared,
    shards: Math.max(0, Math.floor(cleared / TEMPLE_SHARD_STEP) - Math.floor(best / TEMPLE_SHARD_STEP)),
    prize: !save.temple.prize && cleared >= TEMPLE_PRIZE_AT,
    record: cleared > best,
  };
}

/** Inscrit l'essai dans la sauvegarde (record, essais, récompense) ; les Baies et Éclats, l'appelant les verse. */
export function noteTemple(save: Save, cleared: number, got: TempleReward): void {
  save.temple.tries++;
  save.temple.best = Math.max(save.temple.best, cleared);
  if (got.prize) save.temple.prize = true;
}
