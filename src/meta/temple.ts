import type { BiomeId } from '../data/species';
import type { Save } from './save';

// La tour du temple (ajout du 27 novembre 2026, refaite le 28 : « faire quelque chose de l'île ;
// entrer dans le temple ; un seul Pokémon sur l'île, avec un rôle »). Roigada, ermite de l'île,
// garde le temple : une tour de cinq étages de dix vagues, avec l'équipe du Repaire, hors run
// (run/room.ts, special `temple` ; main.ts, newRun(true)).
//
// Retour du 28 novembre 2026, après un essai à six (« on a roulé jusqu'à la vague 25 ») :
//   • tous les dix, on monte un escalier et on change de terrain (cinq étages, cinq terrains) ;
//   • entre deux étages, de quoi se soigner et une amélioration (un don), comme dans Hades ;
//   • les mini-boss sont des formes évoluées, de plus en plus fortes ;
//   • au sommet de chaque étage, un boss — un légendaire jouable — à battre : battu, il rejoint la
//     rébellion. Plus on monte, plus il est rare. Pas de forme évoluée en récompense (les
//     légendaires n'évoluent pas), et pas Lugia comme gardien : il est le boss du dernier étage.

/** Un étage de la tour : son terrain, et le légendaire qui l'attend au sommet. */
export interface TempleFloor {
  biome: BiomeId;
  /** Le boss de l'étage, qui rejoint la rébellion la première fois qu'il est battu. */
  boss: number;
  name: string;
  /** Le dernier étage se joue dans le hall du temple (world/arena.ts, decorateTemple). */
  hall?: boolean;
}

/**
 * Les cinq étages, du plus accessible au plus rare. Les trois oiseaux, puis Ho-Oh, puis Lugia, le
 * maître des lieux. Tous ont leurs planches de combat complètes, et aucun ne s'obtient ailleurs.
 */
export const TEMPLE_FLOORS: readonly TempleFloor[] = [
  { biome: 'glace', boss: 144, name: 'Artikodin' },
  { biome: 'prairie', boss: 145, name: 'Électhor' },
  { biome: 'volcan', boss: 146, name: 'Sulfura' },
  { biome: 'automne', boss: 250, name: 'Ho-Oh' },
  { biome: 'village', boss: 249, name: 'Lugia', hall: true },
];
/** Vagues par étage : la dernière est celle du boss, la cinquième celle du mini-boss. */
export const TEMPLE_FLOOR_WAVES = 10;
export const TEMPLE_MINIBOSS_WAVE = 5;
export const TEMPLE_WAVES = TEMPLE_FLOORS.length * TEMPLE_FLOOR_WAVES;
/** Entre deux étages : part des PV rendus à chacun (les K.O. se relèvent avec elle). */
export const TEMPLE_REST_HEAL = 0.5;

/** Baies par vague vaincue, à chaque essai. */
export const TEMPLE_BAIES_PER_WAVE = 12;
/** Un Éclat de Champion par palier de vagues franchi pour la première fois (record battu). */
export const TEMPLE_SHARD_STEP = 5;

export interface TempleReward {
  baies: number;
  shards: number;
  /** Record battu. */
  record: boolean;
}

/** Ce que rapporte un essai qui a vaincu `cleared` vagues, d'après le record d'avant. */
export function templeReward(save: Save, cleared: number): TempleReward {
  const best = save.temple.best;
  return {
    baies: TEMPLE_BAIES_PER_WAVE * cleared,
    shards: Math.max(0, Math.floor(cleared / TEMPLE_SHARD_STEP) - Math.floor(best / TEMPLE_SHARD_STEP)),
    record: cleared > best,
  };
}

/** Inscrit l'essai dans la sauvegarde (record, essais) ; les Baies et Éclats, l'appelant les verse. */
export function noteTemple(save: Save, cleared: number): void {
  save.temple.tries++;
  save.temple.best = Math.max(save.temple.best, cleared);
}

/** Le boss d'un étage vient d'être battu : rend vrai s'il rejoint la rébellion (la première fois). */
export function claimFloorBoss(save: Save, floor: number): boolean {
  const boss = TEMPLE_FLOORS[floor]?.boss;
  if (boss === undefined || save.temple.beaten.includes(boss)) return false;
  save.temple.beaten.push(boss);
  return true;
}
