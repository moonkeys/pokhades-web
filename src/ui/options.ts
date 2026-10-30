import type { BiomeId } from '../data/species';

// Réglages de DA exposés dans le panneau. Mémorisés dans le navigateur
// (confort de test uniquement : tout marche sans).

export type Density = 'native' | 'mixel';
export type SizeMode = 'pmd' | 'big2' | 'game';

export interface Options {
  /** 'run' : la séquence du jeu (un biome par acte) ; sinon toute la run dans ce biome (test_biome_override). */
  biome: BiomeId | 'run';
  seed: number;
  /** L'équipe de départ (n° de Pokédex), 1 à 6 Pokémon ; le premier est celui qu'on joue. */
  team: number[];
  /** native : 1 px de sprite = 1 px de décor ; mixel : 1 px de sprite = ½ px de décor. */
  density: Density;
  /** pmd : taille native des planches ; big2 : ×2 au-delà de 1,5 m ; game : comme le jeu 3D (non entier). */
  size: SizeMode;
  /** Hauteur de la résolution interne, en px de décor. */
  viewHeight: 216 | 270 | 360;
  /** Progression clair → sombre (DA_bible §4), 0..1. */
  danger: number;
  grading: boolean;
  glow: boolean;
  particles: boolean;
  vignette: boolean;
  shadows: boolean;
  treeFade: boolean;
  /** Le Pokémon grandit un peu avec l'altitude (non entier : pixels légèrement inégaux). */
  heightScale: boolean;
  wild: boolean;
  debug: boolean;
  /** Version du format mémorisé (2 : le biome devient celui de la run ; 3 : une équipe au lieu d'un Pokémon). */
  version: number;
}

export const DEFAULTS: Options = {
  biome: 'run',
  seed: 1,
  team: [25],
  density: 'native',
  size: 'pmd',
  viewHeight: 270,
  danger: 0,
  grading: true,
  glow: true,
  particles: true,
  vignette: true,
  shadows: true,
  treeFade: true,
  heightScale: true,
  wild: true,
  debug: false,
  version: 3,
};

const KEY = 'pokhades-proto-2d';

export function loadOptions(): Options {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Options> & { species?: number };
      // Avant la run, le biome choisi n'était qu'un décor à explorer : on repart sur la séquence du jeu.
      if (!saved.version) saved.biome = 'run';
      // Avant l'équipe, un seul Pokémon joué : il en devient le premier membre.
      if (!saved.team?.length) saved.team = [saved.species ?? DEFAULTS.team[0]];
      delete saved.species;
      return { ...DEFAULTS, ...saved, version: DEFAULTS.version };
    }
  } catch {
    // Stockage indisponible (navigation privée…) : réglages par défaut.
  }
  return { ...DEFAULTS };
}

export function saveOptions(opts: Options): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(opts));
  } catch {
    // Sans conséquence : seule la mémorisation est perdue.
  }
}
