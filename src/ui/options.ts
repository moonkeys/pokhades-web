import type { BiomeId } from '../data/species';
import type { LayoutId } from '../world/layouts';
import type { WeatherId } from '../world/weather';

// Réglages de DA exposés dans le panneau. Mémorisés dans le navigateur
// (confort de test uniquement : tout marche sans).

export type Density = 'native' | 'mixel';
export type SizeMode = 'pmd' | 'big2' | 'game';

export interface Options {
  /**
   * 'run' : la séquence du jeu (un biome par acte) ; sinon toute la run dans ce biome (test_biome_override).
   * 'grotte' (test) : chaque salle de combat commence directement dans sa grotte, au Rocailleux.
   */
  biome: BiomeId | 'run' | 'grotte';
  /** 'run' : la météo tirée à chaque salle ; sinon celle-ci partout en run (test). */
  weather: WeatherId | 'run';
  /** 'auto' : chaque salle tire sa forme dans la liste de son biome ; sinon celle-ci partout où le biome l'admet (test). */
  layout: LayoutId | 'auto';
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
  /** Secousses de l'écran (Combat.addShake) ; à couper si elles gênent. */
  shake: boolean;
  /** Volumes de la musique et des bruitages, 0..1 (src/audio/audio.ts) ; `muted` coupe tout (touche M). */
  music: number;
  sfx: number;
  muted: boolean;
  /** Version du format mémorisé (2 : le biome devient celui de la run ; 3 : une équipe au lieu d'un Pokémon). */
  version: number;
}

export const DEFAULTS: Options = {
  biome: 'run',
  weather: 'run',
  layout: 'auto',
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
  shake: true,
  // Musique plus basse par défaut (retour de test : « dès que je lance un truc, ça fout de la musique »).
  music: 0.2,
  sfx: 0.5,
  muted: false,
  version: 4,
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
      // Plus réglables depuis le menu (ui/settingsmenu.ts) : on revient au
      // rendu prévu, même si un ancien réglage les avait changés.
      const opts = { ...DEFAULTS, ...saved, size: DEFAULTS.size, shadows: true, treeFade: true, grading: true, version: DEFAULTS.version };
      // Version 4 : la musique par défaut a baissé ; qui n'avait pas encore changé de réglage la retrouve plus basse.
      if ((saved.version ?? 0) < 4) opts.music = DEFAULTS.music;
      // Jeu publié : le panneau n'a plus ces réglages de test (ui/panel.ts) ; un ancien
      // réglage gardé dans le navigateur ne doit pas fausser la partie.
      if (import.meta.env.PROD) Object.assign(opts, { biome: DEFAULTS.biome, weather: DEFAULTS.weather, layout: DEFAULTS.layout, wild: true, debug: false });
      return opts;
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
