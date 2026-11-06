import { Rng } from '../core/rng';
import type { BiomeId } from '../data/species';

// Météo des salles de run. Absente du jeu Godot : c'est un ajout, inspiré des
// climats des jeux Pokémon. Elle se tire à chaque salle de combat, selon le
// biome (souvent temps clair), et pèse sur le combat des deux côtés :
// - Pluie : Eau ×1,5, Feu ×0,5 ; Soleil : l'inverse (damage.ts) ;
// - Tempête de sable, Grêle : une petite usure régulière, sauf pour les types
//   qui y résistent (Roche, Sol, Acier ; Glace) — Combat.weatherTick ;
// - Brouillard : rien que le voile, la vue bouchée.
// Ni la boutique, ni les grottes, ni le Repaire n'ont de météo.
//
// Écart voulu sur les jeux : l'usure ne met jamais K.O. (elle s'arrête à 1 PV),
// pour qu'un Pokémon ne tombe pas sans qu'on l'ait vu frapper.

export type WeatherId = 'clear' | 'rain' | 'sun' | 'sand' | 'hail' | 'fog';

export interface Weather {
  name: string;
  /** Glyphe des notifications. */
  icon: string;
  /** Ce qu'elle change, en une ligne (notification d'entrée de salle). */
  hint: string;
  /** Particules propres (rideau de pluie, flocons, grains de sable). */
  particles: 'rain' | 'snow' | 'sand' | null;
  /** Teinte multipliée sur la scène, et lumière ajoutée en « screen ». */
  tint?: [string, number];
  light?: [string, number];
  /** Voile blanc du brouillard, 0..1. */
  haze?: number;
  /** Usure : les types épargnés. */
  chip?: readonly string[];
}

export const WEATHERS: Record<WeatherId, Weather> = {
  clear: { icon: '☼', name: 'Temps clair', hint: '', particles: null },
  rain: { icon: '☂', name: 'Pluie', hint: 'Eau renforcée, Feu affaibli', particles: 'rain', tint: ['#6f86a8', 0.32] },
  sun: { icon: '☀', name: 'Soleil ardent', hint: 'Feu renforcé, Eau affaiblie', particles: null, light: ['#ffcf6a', 0.22], tint: ['#ffe2b0', 0.15] },
  sand: { icon: '≋', name: 'Tempête de sable', hint: 'Usure sauf Roche, Sol, Acier', particles: 'sand', tint: ['#c9a25e', 0.4], chip: ['rock', 'ground', 'steel'] },
  hail: { icon: '❄', name: 'Grêle', hint: 'Usure sauf Glace', particles: 'snow', tint: ['#b9d4ea', 0.3], light: ['#dff0ff', 0.12], chip: ['ice'] },
  fog: { icon: '☁', name: 'Brouillard', hint: 'La vue est bouchée', particles: null, haze: 0.38 },
};

/** Multiplicateur de dégâts d'une attaque de ce type sous cette météo. */
export function weatherMultiplier(weather: WeatherId, type: string): number {
  if (weather === 'rain') return type === 'water' ? 1.5 : type === 'fire' ? 0.5 : 1;
  if (weather === 'sun') return type === 'fire' ? 1.5 : type === 'water' ? 0.5 : 1;
  return 1;
}

/** Usure : part des PV max perdue à chaque coup, et intervalle (s). */
export const CHIP = { share: 0.03, every: 3 } as const;

/** La météo use-t-elle un Pokémon de ces types ? */
export const chips = (weather: WeatherId, types: readonly string[]): boolean => {
  const spared = WEATHERS[weather].chip;
  return !!spared && !types.some((t) => spared.includes(t));
};

/** Poids de tirage par biome : le temps clair domine partout. */
const ODDS: Record<BiomeId, [WeatherId, number][]> = {
  prairie: [['clear', 7], ['rain', 2], ['sun', 2]],
  foret: [['clear', 6], ['rain', 3], ['fog', 1]],
  automne: [['clear', 5], ['rain', 2], ['fog', 2], ['hail', 1]],
  village: [['clear', 7], ['rain', 2], ['sun', 1]],
  lac: [['clear', 5], ['rain', 4], ['fog', 1]],
  plage: [['clear', 5], ['sun', 4], ['rain', 1]],
  ocean: [['clear', 4], ['rain', 4], ['hail', 2]],
  marais: [['clear', 3], ['fog', 4], ['rain', 3]],
  rocailleux: [['clear', 5], ['sand', 4], ['sun', 1]],
  volcan: [['clear', 4], ['sun', 4], ['sand', 2]],
  // La neige tombe déjà (particules du biome) : la grêle y est fréquente, le soleil rare.
  glace: [['clear', 4], ['hail', 4], ['fog', 2]],
};

/**
 * Les ciels qui peuvent suivre un autre, d'une zone à la suivante (retour de test : « passer de la pluie à
 * l'ensoleillé direct d'une zone à l'autre, je trouve ça bizarre »). Le temps change par étapes : la pluie
 * se lève en brume ou en éclaircie, jamais en plein soleil ; le soleil ne se couvre pas d'un coup en grêle.
 */
const FOLLOWS: Record<WeatherId, readonly WeatherId[]> = {
  clear: ['clear', 'rain', 'sun', 'fog', 'sand', 'hail'],
  rain: ['rain', 'fog', 'clear', 'hail'],
  sun: ['sun', 'clear', 'sand'],
  sand: ['sand', 'clear', 'sun'],
  hail: ['hail', 'fog', 'clear', 'rain'],
  fog: ['fog', 'clear', 'rain', 'hail'],
};

/**
 * Tirage déterministe de la météo d'une salle (même graine, même ciel). `prev` : le ciel de la salle
 * précédente, dont celui-ci doit découler ; un ciel qui n'est pas clair a trois fois plus de chances de durer que de changer.
 */
export function rollWeather(biome: BiomeId, mapSeed: number, prev?: WeatherId): WeatherId {
  const base = ODDS[biome] ?? [['clear', 1]];
  // Les ciels de la table du biome compatibles avec le précédent ; si aucun ne l'est, le précédent s'éclaircit.
  const table = prev ? base.filter(([id]) => FOLLOWS[prev].includes(id)).map(([id, w]): [WeatherId, number] => [id, id === prev && prev !== 'clear' ? w * 3 : w]) : base;
  if (!table.length) return 'clear';
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = new Rng(mapSeed * 7 + 3).range(0, total);
  for (const [id, w] of table) if ((r -= w) < 0) return id;
  return 'clear';
}
