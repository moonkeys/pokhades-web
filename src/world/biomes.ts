import { FAUNA, type BiomeId } from '../data/species';
import { BLOB, GROUND, LILIES, PROPS, SEA, TALL_GRASS, TREES, withFill, type Blob, type SpriteDef, type TallGrassDef, type Tile } from './tiles';

// Six biomes du jeu, reconstruits avec le seul tileset Pokémon. Les densités
// reprennent l'esprit de MapGenerator._theme_config (forêt dense, prairie
// ouverte, marais aéré…) ; elles ne sont pas une traduction exacte, le
// générateur du prototype étant volontairement simplifié.

export type ParticleKind = 'pollen' | 'leaves' | 'fireflies' | 'embers' | 'motes';

export interface Ambiance {
  /** Teinte multipliée sur toute l'image (assombrit et colore). */
  tint: string;
  tintAlpha: number;
  /** Lumière ajoutée en mode « screen » (réchauffe ou refroidit). */
  light: string;
  lightAlpha: number;
  /** Désaturation 0..1. */
  desat: number;
  vignette: number;
  particles: ParticleKind | null;
  /** Halos additifs autour de la lave. */
  lavaGlow?: boolean;
  /**
   * Nuit tombée, 0..1, quelle que soit la progression clair → sombre : la
   * scène s'assombrit et les lampes, les torches et les feux s'allument.
   */
  night?: number;
}

export interface PropRule {
  sprites: readonly SpriteDef[];
  rate: number;
  /** Uniquement au bord de l'eau (roseaux). */
  nearWater?: boolean;
  /** Regroupé en touffes plutôt que semé au hasard. */
  cluster?: boolean;
  /** Jamais sur les plaques (sable de la plage, îlots) : herbes et touffes restent dans l'herbe. */
  offPatch?: boolean;
}

export interface Biome {
  id: BiomeId;
  name: string;
  ground: { base: Tile; variants: readonly Tile[]; variantRate: number };
  /** Plaques d'un autre sol (sable, terre, boue). */
  patch: { blob: Blob; threshold: number; nearWaterOnly?: boolean } | null;
  path: { blob: Blob; radius: number } | null;
  /**
   * `swim` : on peut y nager (monture Surf) ; sinon l'eau bloque (lave).
   * `render` : 'blob' (mare à berge), 'waves' (mer à vagues et ressac), 'none' (déjà peinte au sol).
   */
  water: { blob: Blob; threshold: number; lake?: boolean; lilies: readonly Tile[]; swim: boolean; render?: 'blob' | 'waves' | 'none' } | null;
  /** Littoral : 'beach' (mer au nord, plage de sable, terre au sud) ou 'ocean' (îlots dans la mer). */
  coast?: 'beach' | 'ocean';
  /** `sand` : essences réservées au sable d'un littoral (tache du biome côtier). */
  trees: { interior: readonly SpriteDef[]; border: readonly SpriteDef[]; density: number; sand?: readonly SpriteDef[] };
  /** Bordure en montagnes ; `treeRate` = part des places de lisière qui gardent un arbre. */
  cliffs?: { blob: Blob; treeRate: number };
  /**
   * Falaises intérieures (plateaux praticables, avec escaliers) : seuil du
   * champ de bruit (plus haut = plus rares) et nombre d'étages (1 ou 2).
   */
  mesas?: { blob: Blob; threshold: number; levels: 1 | 2 };
  /** Village : nombre de bâtiments (dont un Centre Pokémon et une Boutique). */
  buildings?: { count: number };
  tallGrass: { def: TallGrassDef; threshold: number } | null;
  flowers: number;
  props: readonly PropRule[];
  fauna: readonly number[];
  ambiance: Ambiance;
}

export const BIOMES: Record<BiomeId, Biome> = {
  prairie: {
    id: 'prairie',
    name: 'Prairie',
    ground: { base: GROUND.grass, variants: [GROUND.grassFlowers], variantRate: 0.04 },
    patch: null,
    path: { blob: BLOB.sandPath, radius: 1.5 },
    water: { blob: BLOB.pond, threshold: 0.72, lilies: LILIES.pond, swim: true },
    trees: { interior: [...TREES.round.slice(0, 2), ...TREES.small], border: [...TREES.round, ...TREES.roundB], density: 0.05 },
    tallGrass: { def: TALL_GRASS.green, threshold: 0.55 },
    flowers: 0.09,
    props: [
      { sprites: PROPS.bunches.slice(0, 1), rate: 0.012 },
      { sprites: PROPS.sprouts, rate: 0.01 },
      { sprites: PROPS.rockSmall, rate: 0.004 },
    ],
    mesas: { blob: BLOB.cliffGrass, threshold: 0.64, levels: 1 },
    fauna: FAUNA.prairie,
    ambiance: { tint: '#fff4d6', tintAlpha: 0.0, light: '#fff2c0', lightAlpha: 0.08, desat: 0, vignette: 0.12, particles: 'pollen' },
  },
  foret: {
    id: 'foret',
    name: 'Forêt',
    ground: { base: GROUND.grass, variants: [], variantRate: 0 },
    patch: null,
    path: { blob: withFill(BLOB.ringGrass, GROUND.dirt), radius: 1.4 },
    water: { blob: BLOB.pond, threshold: 0.7, lilies: LILIES.pond, swim: true },
    trees: {
      interior: [...TREES.conifer.slice(1), ...TREES.round.slice(1), ...TREES.big, ...TREES.bigLeaf],
      border: [...TREES.conifer, ...TREES.round.slice(2), ...TREES.big.slice(2)],
      density: 0.3,
    },
    tallGrass: { def: TALL_GRASS.green, threshold: 0.62 },
    flowers: 0.02,
    props: [
      { sprites: PROPS.bunches, rate: 0.18, cluster: true },
      { sprites: PROPS.fern, rate: 0.03 },
      { sprites: PROPS.mushrooms, rate: 0.012 },
      { sprites: PROPS.stump, rate: 0.006 },
      { sprites: PROPS.log, rate: 0.004 },
      { sprites: PROPS.leafy, rate: 0.01 },
    ],
    // Petites buttes : le sous-bois gagne du relief sans se cloisonner.
    mesas: { blob: BLOB.cliffGrass, threshold: 0.63, levels: 1 },
    fauna: FAUNA.foret,
    ambiance: { tint: '#5d8a62', tintAlpha: 0.22, light: '#d8ffcf', lightAlpha: 0.04, desat: 0.05, vignette: 0.3, particles: 'motes' },
  },
  automne: {
    id: 'automne',
    name: 'Automne',
    ground: { base: GROUND.dry, variants: GROUND.dryVariants, variantRate: 0.08 },
    patch: null,
    path: { blob: withFill(BLOB.ringDry, GROUND.dirt), radius: 1.4 },
    water: { blob: BLOB.pond, threshold: 0.74, lilies: LILIES.pond, swim: true },
    trees: {
      interior: [...TREES.autumn, TREES.olive[1], TREES.olive[1], ...TREES.oliveCone],
      border: [...TREES.autumn, ...TREES.autumn, TREES.olive[1]],
      density: 0.26,
    },
    tallGrass: null,
    flowers: 0.0,
    props: [
      { sprites: PROPS.bunches.slice(1), rate: 0.2, cluster: true },
      { sprites: PROPS.mushrooms, rate: 0.015 },
      { sprites: PROPS.stump, rate: 0.008 },
      { sprites: PROPS.log, rate: 0.005 },
    ],
    // Dessus brun : l'herbe verte du plateau herbeux jurait sur le sol sec.
    mesas: { blob: BLOB.cliff, threshold: 0.63, levels: 1 },
    fauna: FAUNA.automne,
    ambiance: { tint: '#ffb070', tintAlpha: 0.16, light: '#ffcf80', lightAlpha: 0.08, desat: 0, vignette: 0.25, particles: 'leaves' },
  },
  lac: {
    id: 'lac',
    name: 'Lac',
    ground: { base: GROUND.grass, variants: [], variantRate: 0 },
    patch: { blob: BLOB.sandPath, threshold: 0, nearWaterOnly: true },
    path: { blob: BLOB.sandPath, radius: 1.4 },
    water: { blob: BLOB.pond, threshold: 0.8, lake: true, lilies: LILIES.pond, swim: true },
    // Une seule famille de feuillus : les palmiers au milieu des arbres classiques juraient.
    trees: { interior: TREES.roundB.slice(0, 2), border: [...TREES.roundB, ...TREES.round], density: 0.07 },
    tallGrass: { def: TALL_GRASS.green, threshold: 0.66 },
    flowers: 0.04,
    props: [
      { sprites: PROPS.reeds, rate: 0.12, nearWater: true },
      { sprites: PROPS.rockSmall, rate: 0.005 },
    ],
    fauna: FAUNA.lac,
    ambiance: { tint: '#a8d8ff', tintAlpha: 0.1, light: '#e0f4ff', lightAlpha: 0.06, desat: 0, vignette: 0.15, particles: 'motes' },
  },
  marais: {
    id: 'marais',
    name: 'Marais',
    ground: { base: GROUND.dry, variants: GROUND.dryVariants, variantRate: 0.1 },
    patch: { blob: withFill(BLOB.ringDry, GROUND.mud), threshold: 0.55 },
    path: null,
    water: { blob: BLOB.swamp, threshold: 0.55, lilies: LILIES.swamp, swim: true },
    trees: { interior: [...TREES.moss, ...TREES.dead, TREES.dark[0]], border: [...TREES.dark, ...TREES.olive.slice(2), TREES.coniferDark[0]], density: 0.08 },
    tallGrass: null,
    flowers: 0,
    props: [
      { sprites: PROPS.reeds, rate: 0.22, nearWater: true },
      { sprites: PROPS.mushrooms, rate: 0.02 },
      { sprites: PROPS.tallMushroom, rate: 0.006 },
      { sprites: PROPS.leafy.slice(2), rate: 0.012 },
    ],
    fauna: FAUNA.marais,
    ambiance: { tint: '#4f6a4a', tintAlpha: 0.38, light: '#9cffb0', lightAlpha: 0.03, desat: 0.25, vignette: 0.45, particles: 'fireflies' },
  },
  volcan: {
    id: 'volcan',
    name: 'Volcan',
    // Herbe sèche roussie par l'étalonnage : c'est elle qui permet un vrai chemin
    // de terre à bords raccordés (l'anneau d'herbe sèche n'existe que sur ce sol).
    ground: { base: GROUND.dry, variants: GROUND.dryVariants, variantRate: 0.06 },
    patch: { blob: withFill(BLOB.ringDry, GROUND.dirt), threshold: 0.62 },
    path: { blob: withFill(BLOB.ringDry, GROUND.dirt), radius: 1.5 },
    water: { blob: BLOB.lava, threshold: 0.56, lilies: [], swim: false },
    trees: { interior: [...TREES.dead, ...TREES.dead, ...TREES.pineSmall.slice(1), ...TREES.coniferDark], border: [...TREES.dead, ...TREES.coniferDark], density: 0.14 },
    cliffs: { blob: BLOB.cliff, treeRate: 0.18 },
    mesas: { blob: BLOB.cliff, threshold: 0.55, levels: 2 },
    tallGrass: null,
    flowers: 0,
    props: [
      { sprites: PROPS.boulder.slice(0, 1), rate: 0.012 },
      { sprites: PROPS.rockSmall, rate: 0.02 },
      { sprites: PROPS.stump, rate: 0.004 },
    ],
    fauna: FAUNA.volcan,
    ambiance: { tint: '#7a3a2a', tintAlpha: 0.5, light: '#ff9050', lightAlpha: 0.06, desat: 0.3, vignette: 0.5, particles: 'embers', lavaGlow: true },
  },
  rocailleux: {
    id: 'rocailleux',
    name: 'Rocailleux',
    ground: { base: GROUND.grass, variants: [], variantRate: 0 },
    patch: { blob: withFill(BLOB.ringGrass, GROUND.dirt), threshold: 0.6 },
    path: { blob: withFill(BLOB.ringGrass, GROUND.dirt), radius: 1.5 },
    water: null,
    // Peu d'arbres : ce sont les falaises qui cloisonnent la zone.
    trees: { interior: [...TREES.pineSmall, TREES.conifer[3]], border: [...TREES.conifer.slice(2), ...TREES.pineSmall], density: 0.05 },
    cliffs: { blob: BLOB.cliffGrass, treeRate: 0.25 },
    mesas: { blob: BLOB.cliffGrass, threshold: 0.54, levels: 2 },
    tallGrass: null,
    flowers: 0.01,
    props: [
      { sprites: PROPS.boulder, rate: 0.016 },
      { sprites: PROPS.rockSmall, rate: 0.03 },
      { sprites: PROPS.bunches.slice(0, 1), rate: 0.1, cluster: true },
    ],
    fauna: FAUNA.rocailleux,
    ambiance: { tint: '#d8c8a8', tintAlpha: 0.12, light: '#fff0d8', lightAlpha: 0.05, desat: 0.08, vignette: 0.22, particles: 'motes' },
  },
  village: {
    id: 'village',
    name: 'Village',
    ground: { base: GROUND.grass, variants: [GROUND.grassFlowers], variantRate: 0.02 },
    patch: null,
    // Rues et place dessinées par le village lui-même (revêtements rectangulaires, cf. town.ts).
    path: null,
    water: { blob: BLOB.pond, threshold: 0.8, lilies: LILIES.pond, swim: true },
    trees: { interior: [...TREES.round.slice(0, 2), ...TREES.small], border: [...TREES.round, ...TREES.roundB], density: 0.05 },
    buildings: { count: 10 },
    tallGrass: null,
    flowers: 0.07,
    props: [
      { sprites: PROPS.bunches.slice(0, 1), rate: 0.008 },
      { sprites: PROPS.rockSmall, rate: 0.003 },
    ],
    fauna: FAUNA.village,
    ambiance: { tint: '#fff4d6', tintAlpha: 0, light: '#fff2c0', lightAlpha: 0.06, desat: 0, vignette: 0.12, particles: 'pollen' },
  },
  plage: {
    id: 'plage',
    name: 'Plage',
    ground: { base: GROUND.grass, variants: [GROUND.grassFlowers], variantRate: 0.03 },
    // Sable clair (celui de la berge du rivage) bordé d'herbe côté terre ; le
    // sentier d'arrivée est du même sable, d'un seul tenant avec la plage.
    patch: { blob: withFill(BLOB.ringGrass, GROUND.paleSand), threshold: 1 },
    path: { blob: withFill(BLOB.ringGrass, GROUND.paleSand), radius: 1.4 },
    // Eau turquoise à berge de sable : le rivage se raccorde dans les quatre orientations.
    water: { blob: BLOB.shore, threshold: 2, lilies: [], swim: true },
    coast: 'beach',
    // Surtout des palmiers, quelques feuillus côté terre : on doit sentir qu'on arrive à la mer.
    // Sur le sable, rien que des palmiers ; l'herbe de l'arrière-pays garde
    // quelques feuillus, pour qu'on sente qu'on quitte un autre biome.
    trees: { interior: [...TREES.palm, ...TREES.palm, TREES.round[0]], sand: TREES.palm, border: [...TREES.palm, ...TREES.palm, ...TREES.round.slice(0, 2)], density: 0.09 },
    tallGrass: { def: TALL_GRASS.green, threshold: 0.66 },
    flowers: 0.04,
    props: [
      { sprites: PROPS.rockSmall, rate: 0.01 },
      { sprites: PROPS.bunches.slice(0, 1), rate: 0.06, cluster: true, offPatch: true },
    ],
    fauna: FAUNA.plage,
    ambiance: { tint: '#fff2d8', tintAlpha: 0.04, light: '#fff8e8', lightAlpha: 0.1, desat: 0, vignette: 0.1, particles: 'motes' },
  },
  ocean: {
    id: 'ocean',
    name: 'Océan',
    // Le « sol » est la mer ; les îlots sont des plaques de sable cerclées d'eau.
    ground: { base: SEA.flat, variants: [], variantRate: 0 },
    patch: { blob: BLOB.island, threshold: 1 },
    path: null,
    water: { blob: BLOB.pond, threshold: 2, lilies: [], swim: true, render: 'none' },
    coast: 'ocean',
    // Que des palmiers sur les îlots : un feuillu au milieu de la mer jurait.
    trees: { interior: TREES.palm, border: [], density: 0.22 },
    tallGrass: null,
    flowers: 0,
    props: [{ sprites: PROPS.rockSmall, rate: 0.03 }],
    fauna: FAUNA.ocean,
    ambiance: { tint: '#cdeeff', tintAlpha: 0.06, light: '#eaf8ff', lightAlpha: 0.08, desat: 0, vignette: 0.16, particles: 'motes' },
  },
};

/** Ordre de la progression clair → sombre (DA_bible §4), aussi l'ordre des touches 1-9 puis 0. */
export const BIOME_ORDER: BiomeId[] = ['prairie', 'village', 'plage', 'ocean', 'foret', 'lac', 'rocailleux', 'automne', 'marais', 'volcan'];

/** Couleur de chaque biome dans l'interface (nom de zone, combo) : une teinte qui évoque le lieu. */
export const BIOME_COLOR: Record<BiomeId, string> = {
  prairie: '#5fb83e',
  village: '#d08a5a',
  plage: '#e8b23a',
  ocean: '#2a7ad0',
  foret: '#2e8b4e',
  lac: '#3a9ae0',
  rocailleux: '#b89a6a',
  automne: '#e0803a',
  marais: '#8a9a3a',
  volcan: '#ff6a2a',
};

/**
 * Le Repaire, le camp des rebelles entre deux runs : une clairière de la
 * forêt, à la nuit tombée, sous les lucioles, et un lac au sud. Pas de
 * plateaux : la place reste de plain-pied, et seuls le feu et les torches
 * l'éclairent.
 */
export const REPAIRE: Biome = {
  ...BIOMES.foret,
  name: 'Le Repaire',
  // Le lac au sud du camp (generate, `camp`) : une mare à berge, avec ses nénuphars.
  water: { blob: BLOB.pond, threshold: 2, lilies: LILIES.pond, swim: true },
  mesas: undefined,
  // Un sous-bois clairsemé : le camp se voit d'un poste à l'autre, et respire.
  trees: { ...BIOMES.foret.trees, density: 0.04 },
  tallGrass: { def: TALL_GRASS.green, threshold: 0.88 },
  ambiance: { tint: '#7d8fd0', tintAlpha: 0.3, light: '#ffb070', lightAlpha: 0.03, desat: 0.1, vignette: 0.42, particles: 'fireflies', night: 0.85 },
};
