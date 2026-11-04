import { fbm } from '../core/noise';
import { Rng } from '../core/rng';
import type { Biome } from './biomes';
import { BLOB, CAVE, CHEST, FLOWERS, GROUND, PROPS, TILE, TOWN_STYLES, type Blob, type SpriteDef, type Tile } from './tiles';
import { coreDepth, LAYOUT_NAMES, pickLayout, shapeDepth, type LayoutId, type Shape } from './layouts';
import { furnishTown, layoutStreets, type Paving } from './town';

// Générateur de zone simplifié pour juger la DA : une zone jouable bordée
// d'une lisière dense (sa forme et sa taille viennent de layouts.ts), des
// chemins qui relient l'entrée aux sorties, de l'eau, des plaques de sol, de
// l'herbe haute, des arbres et des décors.
// Il ne cherche pas à reproduire MapGenerator.gd (3 200 lignes), seulement à
// produire des cartes plausibles pour chaque biome.

/** Taille de la boutique, et de la clairière d'origine (les salles de run varient, cf. layouts.ts). */
export const MAP_W = 64;
export const MAP_H = 40;
/** Le Repaire voit plus grand : un camp aéré, et un lac assez large pour cacher son île. */
export const CAMP_W = 88;
/** Une poche ouverte dans la forêt du Repaire (centre et demi-axes, en cases). */
export interface Pocket {
  x: number;
  y: number;
  rx: number;
  ry: number;
}
export const CAMP_H = 66;
/**
 * La clairière défrichée du Repaire (aménagement « Défrichage », camp.ts) :
 * un ovale gagné sur la forêt, à l'ouest de la place, où s'installent le
 * champ et les maisons. Centre décalé du feu (`hub`) de (dx, dy), demi-axes
 * rx × ry, en cases.
 */
export const CAMP_GLADE = { dx: -31, dy: -1, rx: 9.5, ry: 8.5 } as const;
/**
 * Ajout : la clairière de l'est (« Défrichage de l'est », camp.ts), pendant
 * de celle de l'ouest derrière la hutte de l'équipe, où s'élève le bourg.
 * Un peu plus petite : la lisière de l'est est plus près du bord de la carte.
 */
export const CAMP_EAST_GLADE = { dx: 30, dy: -1, rx: 8.5, ry: 8 } as const;
/**
 * Ajout (retour de test : « l'atelier plus à droite du ponton, un espace plus
 * grand, enlever un peu d'arbres, et un chemin qui y mène ») : la clairière
 * de l'atelier de l'artisan (camp.ts), sur la berge à l'est du ponton, et le
 * couloir qui y descend depuis l'allée de l'est (de `from` à `to`, demi-largeur
 * `r`), gagnés sur la forêt une fois l'atelier bâti.
 */
export const CAMP_ATELIER_GLADE = { dx: 23, dy: 17.5, rx: 8, ry: 5.5, from: { dx: 18, dy: 3 }, to: { dx: 18, dy: 16 }, r: 2.6 } as const;

/**
 * Taille de la grille en cours de traitement, pour les outils de masques
 * (lissage, bordures en blob). Une salle fait MAP_W × MAP_H, le Repaire est
 * plus grand : generate() la pose, et Renderer.bake aussi avant de cuire les
 * bordures d'une carte.
 */
let GW = MAP_W;
let GH = MAP_H;
export function useGrid(w: number, h: number): void {
  GW = w;
  GH = h;
}

/** Cases que bloque la base d'un objet posé en (px, py) : [x0, x1, y0, y1], ou null s'il ne bloque rien. */
function trunkCells(sp: SpriteDef, px: number, py: number): [number, number, number, number] | null {
  if (sp.trunk <= 0) return null;
  const half = (sp.trunk * TILE) / 2;
  return [
    Math.floor((px - half + 2) / TILE),
    Math.floor((px + half - 2) / TILE),
    Math.floor((py - (sp.depth ?? (sp.trunk >= 3 ? 20 : 6))) / TILE),
    Math.floor((py - 1) / TILE),
  ];
}

export interface WorldObject {
  sprite: SpriteDef;
  /** Position monde (px) du point de contact au sol, au centre. */
  x: number;
  y: number;
  /** Les arbres deviennent translucides quand un Pokémon passe derrière. */
  fades: boolean;
}

export interface FlatDecor {
  tile: Tile;
  x: number;
  y: number;
}

export interface WorldMap {
  w: number;
  h: number;
  biome: Biome;
  seed: number;
  inside: Uint8Array;
  path: Uint8Array;
  patch: Uint8Array;
  water: Uint8Array;
  tall: Uint8Array;
  /** Falaises de niveau 1 et plus : montagnes de bordure et plateaux (null si aucun). */
  cliff: Uint8Array | null;
  /** Falaises de niveau 2, posées sur les plateaux de niveau 1. */
  cliff2: Uint8Array | null;
  /**
   * Escaliers taillés dans les parois sud : case haute-gauche, hauteur en
   * cases, étage d'arrivée ; `rise` : niveaux gravis (1 par défaut, plus pour
   * le grand escalier du temple de l'île).
   */
  stairs: { x: number; y: number; rows: number; level: number; rise?: number }[];
  /** Paroi haute du second étage (case de roche sous son rebord sud). */
  face: Uint8Array;
  blocked: Uint8Array;
  /**
   * Ce que même un dash ne traverse pas : hors de la zone, parois de falaise,
   * et grosses constructions (base de 3 cases ou plus : maisons, huttes,
   * ruines). Arbres, rochers, décors et eau se franchissent d'un dash.
   */
  solid: Uint8Array;
  /** Cases atteignables à pied depuis le point de départ. */
  reachable: Uint8Array;
  objects: WorldObject[];
  flat: FlatDecor[];
  /** Nénuphars : dessinés à part pour flotter sur l'eau. */
  lilies: FlatDecor[];
  /** Village : revêtements rectangulaires (rues, place, allées), style et plan. */
  paving: Paving[];
  /**
   * Ajout : allées du Repaire (camp.ts) — une bande d'un sol à part (pavés,
   * sable, gravier…) bordée d'herbe déchiquetée (BLOB.ringGrass), qui se fond
   * dans le gazon au lieu d'y couper net comme un revêtement. `fill` : une
   * tuile, ou quatre (motif 2 × 2, ligne par ligne).
   */
  lanes?: { mask: Uint8Array; fill: readonly Tile[] }[];
  townStyle: string | null;
  townLayout: string | null;
  /** Fontaines du village (case haut-gauche du bassin). */
  fountains: { x: number; y: number }[];
  /** Feux de camp (le Repaire, posés par camp.ts) : leur lumière éclaire la nuit. */
  fires?: { x: number; y: number }[];
  spawn: { x: number; y: number };
  /** Bord par lequel on arrive dans la salle. */
  entrySide: Side;
  /** Carrefour des chemins ; en boutique, le centre de la place. */
  hub: { x: number; y: number };
  /**
   * Sorties : une ouverture du bord de carte atteignable à pied, au plus une
   * par bord autre que celui de l'entrée (MapGenerator._compute_portals).
   * Point au milieu de l'ouverture, une case en retrait du bord.
   */
  exits: Exit[];
  /**
   * Entrée de grotte creusée dans une paroi sud (case de paroi au centre de
   * la bouche) ; `used` : visitée, elle ne rouvre plus. Absente le plus souvent.
   */
  cave?: { x: number; y: number; used: boolean } | null;
  /**
   * Arbres à baies (case du tronc, bloquée) : run/berries.ts les dessine et
   * les fait tomber. Absents en boutique, au Repaire, et dans les biomes
   * sans baie (Biome.berry).
   */
  berries?: { x: number; y: number }[];
  /**
   * Coffre de la salle (case du coffre, bloquée) et ce qui le garde : un
   * obstacle sur la case au sud, seule entrée de son alcôve de rochers (CS
   * Coupe ou Éclate-Roc), ou rien (îlot du Lac, coffre à découvert).
   * run/chests.ts l'ouvre et lève l'obstacle.
   */
  chest?: { x: number; y: number; guard: 'cut' | 'rock-smash' | null } | null;
  /** Ligne de front (layouts.ts) : les deux bouts du couloir, où surgissent les vagues. */
  front: { near: { x: number; y: number }; far: { x: number; y: number } } | null;
  /** Forme de la salle (layouts.ts) ; null en boutique et au Repaire. */
  layout: LayoutId | null;
  /** Son nom, pour le panneau de test. */
  layoutName: string | null;
}

export type Side = 'N' | 'S' | 'E' | 'W';
export interface Exit {
  x: number;
  y: number;
  side: Side;
  /** Largeur de l'ouverture, en cases. */
  width: number;
}

/**
 * Ouvertures du bord : les cases de bordure atteignables à pied (hors eau),
 * regroupées en segments contigus ; on garde la plus large de chaque bord,
 * sauf sur le bord d'entrée. En pleine mer (`swimExits`), l'eau compte : le
 * bord n'y est que de l'eau, et sans cela la salle n'avait aucune sortie (en
 * run, on nage toujours).
 */
function findExits(W: number, H: number, reachable: Uint8Array, water: Uint8Array, entrySide: Side, swimExits = false): Exit[] {
  const sides: Side[] = ['N', 'E', 'S', 'W'];
  const exits: Exit[] = [];
  for (const side of sides) {
    if (side === entrySide) continue;
    const len = side === 'N' || side === 'S' ? W : H;
    const cell = (t: number) => {
      const x = side === 'N' || side === 'S' ? t : side === 'W' ? 0 : W - 1;
      const y = side === 'E' || side === 'W' ? t : side === 'N' ? 0 : H - 1;
      return y * W + x;
    };
    const open = (t: number) => reachable[cell(t)] && (swimExits || !water[cell(t)]);
    let best: [number, number] | null = null;
    for (let t = 0; t < len; ) {
      if (!open(t)) {
        t++;
        continue;
      }
      const from = t;
      while (t < len && open(t)) t++;
      if (!best || t - from > best[1] - best[0]) best = [from, t];
    }
    if (!best || best[1] - best[0] < 2) continue;
    const mid = (best[0] + best[1]) / 2;
    const x = side === 'N' || side === 'S' ? mid : side === 'W' ? 1.5 : W - 1.5;
    const y = side === 'E' || side === 'W' ? mid + 0.5 : side === 'N' ? 1.6 : H - 0.6;
    exits.push({ x, y, side, width: best[1] - best[0] });
  }
  return exits;
}

const at = (m: Uint8Array, x: number, y: number) => m[y * GW + x];

/** Lecture avec bords « collants » : hors carte, on répète la case la plus proche (pas de berge au bord du monde). */
function clampAt(m: Uint8Array, x: number, y: number): number {
  return m[Math.min(GH - 1, Math.max(0, y)) * GW + Math.min(GW - 1, Math.max(0, x))];
}

const CORNER_ORDER = {
  default: { se: [0, 0], sw: [1, 0], ne: [0, 1], nw: [1, 1] },
  mirror: { se: [1, 0], sw: [0, 0], ne: [1, 1], nw: [0, 1] },
  outer: { nw: [0, 0], ne: [1, 0], sw: [0, 1], se: [1, 1] },
} as const;

/**
 * Choisit la tuile d'un jeu « blob » pour une case membre du masque.
 * Même logique que MapGenerator._apply_blob, complétée des coins intérieurs.
 */
export function blobTile(mask: Uint8Array, x: number, y: number, blob: Blob): Tile {
  const m = (dx: number, dy: number) => clampAt(mask, x + dx, y + dy) !== 0;
  const row = !m(0, -1) ? 0 : !m(0, 1) ? 2 : 1;
  const col = !m(-1, 0) ? 0 : !m(1, 0) ? 2 : 1;
  if (row === 1 && col === 1 && blob.inner) {
    const [ic, ir] = blob.inner;
    // Décalage, dans le bloc 2×2, de la tuile dont l'encoche est au sud-est, sud-ouest, nord-est, nord-ouest.
    const order = CORNER_ORDER[blob.corners ?? 'default'];
    if (!m(1, 1)) return [ic + order.se[0], ir + order.se[1]];
    if (!m(-1, 1)) return [ic + order.sw[0], ir + order.sw[1]];
    if (!m(1, -1)) return [ic + order.ne[0], ir + order.ne[1]];
    if (!m(-1, -1)) return [ic + order.nw[0], ir + order.nw[1]];
  }
  return [blob.origin[0] + col, blob.origin[1] + row];
}

/** Automate cellulaire : lisse les contours bruités. */
export function smooth(mask: Uint8Array, passes: number, allowed: (x: number, y: number) => boolean): void {
  for (let p = 0; p < passes; p++) {
    const copy = mask.slice();
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (clampAt(copy, x + dx, y + dy)) n++;
        mask[y * GW + x] = n >= 5 && allowed(x, y) ? 1 : 0;
      }
    }
  }
}

/**
 * Les jeux blob ne savent pas dessiner une bande d'une case de large (il
 * faudrait une tuile avec deux bords opposés). On corrige ces cases fines et
 * on bouche les trous d'une case, jusqu'à stabilité :
 * - `erode` retire la case fine (mares, plaques : on peut les rogner) ;
 * - `grow` épaissit autour d'elle (chemins : les rogner les coupait, une
 *   diagonale étroite pouvant s'effacer en entier de proche en proche).
 */
export function cleanThin(mask: Uint8Array, allowed: (x: number, y: number) => boolean, mode: 'erode' | 'grow' = 'erode'): void {
  const grow = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= GW || y >= GH || mask[y * GW + x] || !allowed(x, y)) return false;
    mask[y * GW + x] = 1;
    return true;
  };
  for (let iter = 0; iter < 20; iter++) {
    let changed = false;
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        const i = y * GW + x;
        const n = clampAt(mask, x, y - 1), s = clampAt(mask, x, y + 1);
        const w = clampAt(mask, x - 1, y), e = clampAt(mask, x + 1, y);
        if (mask[i]) {
          const pinchA = !clampAt(mask, x + 1, y + 1) && !clampAt(mask, x - 1, y - 1) && n && s && e && w;
          const pinchB = !clampAt(mask, x - 1, y + 1) && !clampAt(mask, x + 1, y - 1) && n && s && e && w;
          if (!((!n && !s) || (!w && !e) || pinchA || pinchB)) continue;
          if (mode === 'grow') {
            let grew = false;
            if (!n && !s) grew = grow(x, y + 1) || grow(x, y - 1) || grew;
            if (!w && !e) grew = grow(x + 1, y) || grow(x - 1, y) || grew;
            if (pinchA) grew = grow(x + 1, y + 1) || grew;
            if (pinchB) grew = grow(x - 1, y + 1) || grew;
            changed ||= grew;
          } else {
            mask[i] = 0;
            changed = true;
          }
        } else if (n + s + w + e >= 3 && allowed(x, y)) {
          mask[i] = 1;
          changed = true;
        }
      }
    }
    if (!changed) return;
  }
}

export function dilate(mask: Uint8Array, radius: number): Uint8Array {
  let cur = mask.slice();
  for (let r = 0; r < radius; r++) {
    const next = cur.slice();
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        if (cur[y * GW + x]) continue;
        if (clampAt(cur, x + 1, y) || clampAt(cur, x - 1, y) || clampAt(cur, x, y + 1) || clampAt(cur, x, y - 1)) {
          next[y * GW + x] = 1;
        }
      }
    }
    cur = next;
  }
  return cur;
}

type Pt = { x: number; y: number };

function catmullRom(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
}

/**
 * Trace un chemin sinueux de a à b (spline par deux points de contrôle
 * décalés d'au plus `wobble` cases : moins dans une forme étroite, où un
 * grand écart taillerait une tranchée dans la lisière).
 */
function carvePath(mask: Uint8Array, a: Pt, b: Pt, radius: number, rng: Rng, seed: number, wobble = 6): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const ctrl = (t: number) => {
    const off = rng.range(-wobble, wobble);
    return { x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off };
  };
  const pts = [a, a, ctrl(0.33), ctrl(0.66), b, b];
  for (let seg = 0; seg < pts.length - 3; seg++) {
    for (let t = 0; t <= 1; t += 0.02) {
      const p = catmullRom(pts[seg], pts[seg + 1], pts[seg + 2], pts[seg + 3], t);
      const r = radius + (fbm(p.x * 0.2, p.y * 0.2, seed + 71) - 0.5) * 0.6;
      for (let y = Math.floor(p.y - r - 1); y <= Math.ceil(p.y + r + 1); y++) {
        for (let x = Math.floor(p.x - r - 1); x <= Math.ceil(p.x + r + 1); x++) {
          if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
          if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) <= r) mask[y * GW + x] = 1;
        }
      }
    }
  }
}

/**
 * `store` : salle de boutique (MapGenerator en store_mode) — une place ronde
 * dégagée (rayon 7 ± 1 case de bruit) autour du carrefour, où s'installe le marchand.
 *
 * Écarts voulus avec le jeu : la boutique est une petite clairière au centre
 * de la carte (le jeu ouvrait une carte entière), avec une entrée en bas et
 * une sortie en haut, et jamais d'eau dedans — à la Plage et à l'Océan, c'est
 * une île de sable au milieu de la mer. main.ts lui donne une graine fixe par
 * biome : chaque biome a toujours la même boutique. Le Village garde ses rues
 * et sa place.
 *
 * `camp` : le Repaire, entre deux runs — une carte plus grande (CAMP_W ×
 * CAMP_H), la même clairière en bien plus large (place de 8,5 cases) et un
 * lac au sud, où le camp installe ses postes autour du feu (camp.ts).
 * `glade` (au Repaire) : la forêt de l'ouest est défrichée (CAMP_GLADE), et
 * une allée y mène depuis la place ; `eastGlade` : de même à l'est
 * (CAMP_EAST_GLADE) ; `atelier` : la clairière de l'atelier et son couloir
 * (CAMP_ATELIER_GLADE).
 *
 * `layout` : forme imposée à une salle de run (panneau de test) ; sinon elle
 * se tire dans la liste du biome (layouts.ts), avec sa propre graine : la
 * même salle garde toujours la même forme.
 */
export function generate(
  biome: Biome,
  seed: number,
  options: { store?: boolean; camp?: boolean; cave?: boolean; glade?: boolean; eastGlade?: boolean; atelier?: boolean; layout?: LayoutId; pockets?: readonly Pocket[] } = {},
): WorldMap {
  const shape: Shape | null = options.store || options.camp ? null : pickLayout(biome, new Rng(seed * 2246822519 + 3), options.layout);
  const W = options.camp ? CAMP_W : (shape?.w ?? MAP_W);
  const H = options.camp ? CAMP_H : (shape?.h ?? MAP_H);
  useGrid(W, H);
  const N = W * H;
  const rng = new Rng(seed * 2654435761);
  const s = seed * 7919;
  const idx = (x: number, y: number) => y * W + x;
  const store = Boolean(options.store || options.camp);
  /** Le Repaire voit plus grand que la boutique : quatre postes et un feu autour de la place. */
  const roomy = options.camp ? 1.8 : 1;
  /** Centre de la place : au milieu de la carte, sauf au Repaire, remonté pour laisser le lac au sud. */
  const cy0 = options.camp ? 19 : H / 2;
  /** Clairière de la boutique : ovale au bord bruité, au centre de la carte. */
  // (`k` > 1 : une clairière élargie, pour l'anneau d'eau ou de lave et le pied des montagnes.)
  const inOpen = (x: number, y: number, k = 1) => Math.hypot((x + 0.5 - W / 2) / (13 * k * roomy), (y + 0.5 - cy0) / (9 * k * roomy)) + (fbm(x * 0.14, y * 0.14, s + 401) - 0.5) * 0.35 < 1;
  /**
   * Le Repaire compact (retour de test : « plus petit au tout départ, que le cercle… on verra
   * mieux l'évolution ») : la place autour du feu, et une poche par poste (camp.ts,
   * campPockets) ; chaque aménagement bâti ouvre la sienne dans la forêt.
   */
  const pockets = options.camp ? options.pockets : undefined;
  const inPocket = (x: number, y: number) =>
    pockets!.some((p) => Math.hypot((x + 0.5 - p.x) / p.rx, (y + 0.5 - p.y) / p.ry) + (fbm(x * 0.2, y * 0.2, s + 409) - 0.5) * 0.3 < 1);
  const inClearing = (x: number, y: number, k = 1) =>
    pockets ? Math.hypot((x + 0.5 - W / 2) / 13, (y + 0.5 - cy0) / 10.5) + (fbm(x * 0.14, y * 0.14, s + 401) - 0.5) * 0.3 < 1 || inPocket(x, y) : inOpen(x, y, k);
  /** Boutique du Lac ou du Volcan : un anneau d'eau, ou de lave, entre la clairière et la lisière. */
  const ringed = store && !options.camp && Boolean(biome.water) && !biome.coast;
  const inRing = (x: number, y: number) => ringed && !inClearing(x, y) && inClearing(x, y, 1.45);
  /** Boutique de bord de mer : la mer où l'on nage autour de l'île, jusqu'au récif. */
  const inBay = (x: number, y: number) => store && Boolean(biome.coast) && inClearing(x, y, 1.7);
  /**
   * Le Repaire : un lac au sud du camp, et une île en son milieu — on n'y
   * nage qu'avec la CS Surf (les acteurs décident, cf. main.ts).
   */
  // (L'île est loin de la rive : depuis le feu, on ne la voit pas ; il faut descendre au bord du lac.)
  const inLake = (x: number, y: number) => Boolean(options.camp) && Math.hypot((x + 0.5 - W / 2) / 31, (y + 0.5 - (H - 14)) / 11.5) + (fbm(x * 0.12, y * 0.12, s + 433) - 0.5) * 0.3 < 1;
  /** La berge : une bande de terre autour du lac, qui le relie à la clairière du camp. */
  // (Repaire compact : la berge se resserre au milieu, la forêt reprend ses côtés.)
  const inShore = (x: number, y: number) =>
    Boolean(options.camp) &&
    Math.hypot((x + 0.5 - W / 2) / (options.pockets ? 24 : 34), (y + 0.5 - (H - 14)) / 17.5) + (fbm(x * 0.12, y * 0.12, s + 437) - 0.5) * 0.3 < 1;
  /** Le Repaire défriché : la clairière de l'ouest (CAMP_GLADE), autour du feu (`hub`, connu plus bas). */
  const glade = Boolean(options.camp && options.glade);
  const eastGlade = Boolean(options.camp && options.eastGlade);
  const atelierGlade = Boolean(options.camp && options.atelier);
  const inOval = (x: number, y: number, g: { dx: number; dy: number; rx: number; ry: number }, salt: number) =>
    Math.hypot((x + 0.5 - hub.x - g.dx) / g.rx, (y + 0.5 - hub.y - g.dy) / g.ry) + (fbm(x * 0.14, y * 0.14, s + salt) - 0.5) * 0.3 < 1;
  /** Le couloir de l'atelier : une capsule aux bords bruités, de l'allée de l'est à la berge. */
  const inCorridor = (x: number, y: number) => {
    const a = CAMP_ATELIER_GLADE;
    const ax = hub.x + a.from.dx, ay = hub.y + a.from.dy;
    const bx = hub.x + a.to.dx, by = hub.y + a.to.dy;
    const u = Math.max(0, Math.min(1, ((x + 0.5 - ax) * (bx - ax) + (y + 0.5 - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    const d = Math.hypot(x + 0.5 - ax - (bx - ax) * u, y + 0.5 - ay - (by - ay) * u);
    return d + (fbm(x * 0.2, y * 0.2, s + 461) - 0.5) * 1.2 < a.r;
  };
  const inGlade = (x: number, y: number) =>
    (glade && inOval(x, y, CAMP_GLADE, 443)) || (eastGlade && inOval(x, y, CAMP_EAST_GLADE, 449)) || (atelierGlade && (inOval(x, y, CAMP_ATELIER_GLADE, 457) || inCorridor(x, y)));
  const inIsland = (x: number, y: number) => inLake(x, y) && Math.hypot((x + 0.5 - W / 2) / 11.5, (y + 0.5 - (H - 9.5)) / 5) + (fbm(x * 0.2, y * 0.2, s + 439) - 0.5) * 0.25 < 1;

  // 1) Zone jouable : la lisière a une épaisseur bruitée de 1,8 à 4,4 cases
  // (elle était de 2,5 à 6 : « ça fait trop forêt » sur les côtés). La
  // profondeur se mesure dans la forme de la salle (layouts.ts) ; pour la
  // clairière, c'est la distance au bord de la carte, comme avant.
  // Le cœur d'une boucle rempli d'eau ou de lave reste dans la zone (on la
  // voit, on y nage s'il le faut) : il devient de l'eau à l'étape 3.
  const inside = new Uint8Array(N);
  const coreWater = new Uint8Array(N);
  const wetCore = shape?.core?.fill === 'water' ? shape.core : null;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const edge = 1.8 + 2.6 * fbm(x * 0.13, y * 0.13, s + 11);
      const d = shape ? shapeDepth(shape, x, y) : Math.min(x, y, W - 1 - x, H - 1 - y);
      inside[idx(x, y)] = d >= edge ? 1 : 0;
      // Dans la forme, mais dans le cœur : c'est le lac (ou la lave), jusqu'à la rive.
      if (wetCore && !inside[idx(x, y)] && coreDepth(wetCore, x, y) < edge && shapeDepth({ ...shape!, core: null }, x, y) >= edge) {
        inside[idx(x, y)] = 1;
        coreWater[idx(x, y)] = 1;
      }
    }
  }

  // 1b) Littoral. Plage : la mer occupe un côté de la carte (tiré au sort),
  // puis une bande de sable, puis la terre ; on arrive par le côté opposé.
  // Océan : la mer partout, et des îlots.
  let coastSea: Uint8Array | null = null;
  let coastSand: Uint8Array | null = null;
  /** Côté de la mer sur la Plage : 0 nord, 1 sud, 2 ouest, 3 est. */
  let seaSide = 0;
  let beachHub = { x: W / 2, y: H / 2 };
  if (biome.coast === 'beach') {
    coastSea = new Uint8Array(N);
    coastSand = new Uint8Array(N);
    seaSide = rng.int(4);
    const vertical = seaSide >= 2;
    const len = vertical ? H : W;
    const deep = vertical ? W : H;
    // Rivage : une ligne qui n'avance ou ne recule que d'une case à la fois, et pas plus d'une fois
    // toutes les 3 cases. Profondeur de mer ≈ un quart de la carte, sable ≈ 5 cases derrière.
    const base = Math.round(deep * 0.26);
    const shore: number[] = [];
    let run = 0;
    for (let a = 0; a < len; a++) {
      const want = Math.min(base + 3, Math.max(base - 3, Math.round(base + (fbm(a * 0.06, 3.7, s + 107) - 0.5) * 9)));
      const prev = a ? shore[a - 1] : want;
      shore.push(run >= 3 && want !== prev ? prev + Math.sign(want - prev) : prev);
      run = shore[a] === prev ? run + 1 : 0;
    }
    let hubDepth = 0;
    for (let a = 0; a < len; a++) {
      const band = 4 + Math.round(fbm(a * 0.09, 9.1, s + 109) * 4);
      hubDepth += (shore[a] + band - 1) / len;
      for (let d = 0; d < deep; d++) {
        // Coordonnées (le long du rivage, profondeur depuis la mer) → case de la carte.
        const x = seaSide === 2 ? d : seaSide === 3 ? W - 1 - d : a;
        const y = seaSide === 0 ? d : seaSide === 1 ? H - 1 - d : a;
        if (d < shore[a]) coastSea[idx(x, y)] = 1;
        if (d < shore[a] + band) {
          coastSand[idx(x, y)] = 1;
          inside[idx(x, y)] = 1;
        }
      }
    }
    const hd = Math.round(hubDepth);
    beachHub =
      seaSide === 0 ? { x: W / 2, y: hd } : seaSide === 1 ? { x: W / 2, y: H - 1 - hd } : seaSide === 2 ? { x: hd, y: H / 2 } : { x: W - 1 - hd, y: H / 2 };
  }
  if (store && biome.coast) {
    // Boutique de bord de mer : une île de sable, la mer tout autour.
    coastSea = new Uint8Array(N);
    coastSand = new Uint8Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) (inClearing(x, y) ? coastSand : coastSea)[idx(x, y)] = 1;
  } else if (biome.coast === 'ocean') {
    inside.fill(1);
    coastSand = new Uint8Array(N);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const home = Math.hypot((x - W / 2) / 6, (y - (H - 6)) / 3.5) < 1;
        // Pas d'îlot collé aux bords : la ceinture de rochers en fait le tour.
        const edge = Math.min(x, y, W - 1 - x, H - 1 - y) < 3;
        if (home || (!edge && fbm(x * 0.1, y * 0.1, s + 101) > 0.6)) coastSand[idx(x, y)] = 1;
      }
    }
    smooth(coastSand, 2, () => true);
    cleanThin(coastSand, () => true);
    coastSea = coastSand.map((v) => (v ? 0 : 1));
  }

  // 2) Chemins : entrée en bas, un carrefour, une sortie en haut et une sur le côté.
  // Au Lac, le carrefour descend sous le plan d'eau et les sorties partent
  // sur les côtés : les chemins longent la rive au lieu de couper le lac.
  // Village : un plan de rues rectangulaire (cf. town.ts) au lieu de chemins sinueux.
  // (Le grand lac, ses chemins de rive et son îlot : propres à la clairière.
  // Les autres formes du Lac le mettent au cœur de leur boucle.)
  const lake = Boolean(biome.water?.lake) && shape?.id === 'clairiere';
  /** Les chemins de la forme (toutes sauf la clairière, qui garde le tracé d'origine). */
  const routed = Boolean(shape?.routes.length) && !biome.coast && !biome.buildings;
  const path = new Uint8Array(N);
  const townStyle = biome.buildings ? TOWN_STYLES[seed % TOWN_STYLES.length] : null;
  const plan = townStyle ? layoutStreets(W, H, rng) : null;
  // Entrée : en bas, sauf sur une Plage dont la mer est au sud (on arrive alors par le nord)
  // ou à l'ouest / à l'est (on arrive par le côté opposé).
  const entry =
    biome.coast === 'beach' && seaSide !== 0
      ? seaSide === 1
        ? { x: W / 2 + rng.range(-5, 5), y: 0.5 }
        : seaSide === 2
          ? { x: W - 0.5, y: H / 2 + rng.range(-4, 4) }
          : { x: 0.5, y: H / 2 + rng.range(-4, 4) }
      : routed
        ? shape!.entry
        : { x: plan ? plan.entryX : W / 2 + rng.range(-5, 5), y: H - 0.5 };
  /** La case d'arrivée, une case dans la carte (le bord où l'on entre). */
  const door = { x: Math.min(W - 1, Math.max(0, Math.floor(entry.x))), y: Math.min(H - 1, Math.max(0, Math.floor(entry.y))) };
  const hub = routed
    ? shape!.hub
    : plan
    ? plan.center
    : store
      ? { x: W / 2, y: cy0 }
      : biome.coast === 'beach'
      ? beachHub
      : lake
        ? { x: W / 2 + rng.range(-6, 6), y: H - 8 }
        : { x: W / 2 + rng.range(-9, 9), y: H / 2 + rng.range(-4, 4) };
  if (store && !plan) {
    // Boutique : l'allée d'entrée monte jusqu'à la place, une autre en repart vers le boss.
    const radius = biome.path?.radius ?? 1.5;
    // (Au Repaire, pas d'allée d'entrée : le lac occupe le sud, on arrive près du feu.)
    if (!options.camp) carvePath(path, { x: W / 2 + rng.range(-3, 3), y: H - 0.5 }, hub, radius, rng, s);
    carvePath(path, hub, { x: W / 2 + rng.range(-6, 6), y: 0.5 }, radius, rng, s);
    // L'allée de la clairière défrichée : son propre tirage, pour que le reste du camp ne bouge pas.
    if (glade) carvePath(path, hub, { x: hub.x + CAMP_GLADE.dx + 4, y: hub.y + CAMP_GLADE.dy + 1 }, 1.2, new Rng(seed * 48271 + 9), s);
    // (Celle de l'est part du sud-est de la place : en ligne droite, elle passerait sous la hutte de l'équipe.)
    if (eastGlade) carvePath(path, { x: hub.x + 9, y: hub.y + 3.5 }, { x: hub.x + CAMP_EAST_GLADE.dx - 4, y: hub.y + CAMP_EAST_GLADE.dy + 4 }, 1.2, new Rng(seed * 48271 + 13), s, 2);
    cleanThin(path, () => true, 'grow');
  } else if (biome.coast) {
    // Plage : un seul sentier, de l'entrée jusqu'au sable. Océan : aucun.
    if (biome.coast === 'beach') carvePath(path, entry, hub, biome.path?.radius ?? 1.4, rng, s);
  } else if (plan) {
    for (let i = 0; i < N; i++) if (plan.street[i] || plan.plaza[i]) path[i] = 1;
  } else if (routed) {
    // Les chemins suivent le squelette de la forme, tronçon par tronçon.
    const radius = biome.path?.radius ?? 1.5;
    for (const route of shape!.routes) for (let k = 1; k < route.length; k++) carvePath(path, route[k - 1], route[k], radius, rng, s, shape!.wobble);
    cleanThin(path, () => true, 'grow');
  } else {
    const exits = lake
      ? [{ x: 0.5, y: H - rng.range(11, 15) }, { x: W - 0.5, y: H - rng.range(11, 15) }]
      : [{ x: rng.range(14, W - 14), y: 0.5 }];
    if (!lake) {
      // Une sortie sur un côté, et dans 55 % des cas une troisième sur l'autre
      // (MapGenerator : 2 sorties à 45 %, 3 sinon).
      const west = rng.chance(0.5);
      exits.push(west ? { x: 0.5, y: rng.range(10, H - 10) } : { x: W - 0.5, y: rng.range(10, H - 10) });
      if (rng.chance(0.55)) exits.push(west ? { x: W - 0.5, y: rng.range(10, H - 10) } : { x: 0.5, y: rng.range(10, H - 10) });
    }
    const radius = biome.path?.radius ?? 1.5;
    carvePath(path, entry, hub, radius, rng, s);
    for (const exit of exits) carvePath(path, hub, exit, radius, rng, s);
    cleanThin(path, () => true, 'grow');
  }
  if (store) {
    // La place : comptée comme chemin, elle reste nue (ni arbre, ni herbe haute, ni accessoire).
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const r = (options.camp ? 8.5 : 7) + (fbm(x * 0.16, y * 0.16, s + 211) - 0.5) * 2;
        if (Math.hypot(x + 0.5 - hub.x, (y + 0.5 - hub.y) * 1.15) < r && x > 2 && y > 2 && x < W - 3 && y < H - 3) path[idx(x, y)] = 1;
      }
    }
  }
  if (store && !plan) {
    // Hors de la clairière (et des allées), plus rien de jouable : la lisière l'entoure.
    // L'eau qui la borde reste à nous (on y nage comme ailleurs) : l'anneau du Lac, la
    // mer autour de l'île. Celui du Volcan aussi, mais la lave bloque d'elle-même.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!inClearing(x, y) && !inRing(x, y) && !inBay(x, y) && !inShore(x, y) && !inGlade(x, y)) inside[idx(x, y)] = 0;
    // Les allées passent la mer sur une langue de sable.
    if (coastSea && coastSand) for (let i = 0; i < N; i++) if (path[i]) [coastSea[i], coastSand[i]] = [0, 1];
  }
  for (let i = 0; i < N; i++) if (path[i]) inside[i] = 1;
  const nearPath = dilate(path, 2);

  // 2b) Montagnes : la bordure devient un plateau rocheux au lieu d'un mur d'arbres.
  let cliff: Uint8Array | null = null;
  let cliff2: Uint8Array | null = null;
  if (biome.cliffs) {
    cliff = new Uint8Array(N);
    for (let i = 0; i < N; i++) cliff[i] = inside[i] || inRing(i % W, (i / W) | 0) ? 0 : 1;
    cleanThin(cliff, () => true);
  }

  // 3) Eau (mares de bruit, plus un grand lac au Lac, et le cœur d'une boucle).
  const water = new Uint8Array(N);
  let isleAt: Pt | null = null;
  if (coastSea) {
    water.set(coastSea);
  } else if (options.camp && biome.water) {
    const canBeLake = (x: number, y: number) => inLake(x, y) && !inIsland(x, y) && !path[idx(x, y)];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (canBeLake(x, y)) water[idx(x, y)] = 1;
    // Comme les mares des runs : le rivage bruité laissait des anses d'une case de large,
    // que la berge (jeu blob) ne sait pas border — la lèvre de terre s'y cassait.
    cleanThin(water, canBeLake);
  } else if (ringed) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inRing(x, y) && !path[idx(x, y)]) water[idx(x, y)] = 1;
  } else if (biome.water && !store) {
    /** Îlot à coffre : au milieu du grand lac de la clairière, ou du lac au cœur d'une boucle. */
    const isle = lake ? { x: W / 2, y: H / 2 - 4 } : wetCore && biome.water.lake ? { x: wetCore.x - 0.5, y: wetCore.y - 0.5 } : null;
    isleAt = isle;
    const lakeR = { x: W * 0.32, y: H * 0.3 };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = idx(x, y);
        if (!inside[i] || nearPath[i]) continue;
        if (lake) {
          // Ellipse au rivage bruité, centrée au-dessus du carrefour.
          const d = Math.hypot((x - W / 2) / lakeR.x, (y - H / 2 + 4) / lakeR.y);
          if (d + (fbm(x * 0.15, y * 0.15, s + 29) - 0.5) * 0.6 < 1) water[i] = 1;
          // Îlot au milieu, accessible seulement à la nage.
          if (Math.hypot((x - W / 2) / 4.5, (y - H / 2 + 4) / 3.2) < 1) water[i] = 0;
        }
        if (fbm(x * 0.08, y * 0.08, s + 23) > biome.water.threshold) water[i] = 1;
        if (coreWater[i]) water[i] = 1;
        // L'îlot au cœur de la boucle du Lac, comme celui de la clairière.
        if (isle && !lake && Math.hypot((x - isle.x) / 4.5, (y - isle.y) / 3.2) < 1) water[i] = 0;
      }
    }
    const canBeWater = (x: number, y: number) => inside[idx(x, y)] === 1 && !nearPath[idx(x, y)];
    smooth(water, 2, canBeWater);
    cleanThin(water, canBeWater);
  }

  // 3b) Falaises intérieures : des plateaux rocheux qui cloisonnent la zone,
  // à l'écart des chemins, de l'eau et du départ.
  // (Pas de plateau dans la boutique : l'étal et la place doivent rester de plain-pied.)
  if (biome.mesas && !store) {
    cliff ??= new Uint8Array(N);
    const mesa = new Uint8Array(N);
    const nearWet = dilate(water, 2);
    const farPath = dilate(path, 3);
    const ok = (x: number, y: number) => {
      const i = idx(x, y);
      return inside[i] === 1 && !farPath[i] && !nearWet[i] && Math.hypot(x - door.x, y - door.y) > 8;
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (ok(x, y) && fbm(x * 0.09, y * 0.09, s + 83) > biome.mesas.threshold) mesa[idx(x, y)] = 1;
      }
    }
    smooth(mesa, 2, ok);
    cleanThin(mesa, ok);
    for (let i = 0; i < N; i++) if (mesa[i]) cliff[i] = 1;
    cleanThin(cliff, () => true);
    // Une poche que les falaises encerclent serait une cuvette inaccessible :
    // on la comble, elle devient du plateau.
    const open = new Uint8Array(N);
    const startCell = idx(door.x, door.y);
    const stack = [startCell];
    open[startCell] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % W;
      const y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = idx(nx, ny);
        if (open[j] || !inside[j] || cliff[j]) continue;
        open[j] = 1;
        stack.push(j);
      }
    }
    for (let i = 0; i < N; i++) if (inside[i] && !cliff[i] && !open[i]) cliff[i] = 1;
    cleanThin(cliff, () => true);

    // Second étage : un plateau plus petit, posé au cœur d'un plateau assez
    // large (3 cases de marge tout autour, pour garder un replat praticable).
    if (biome.mesas.levels >= 2) {
      const lvl1 = cliff;
      const core = (x: number, y: number) => {
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H || !lvl1[idx(nx, ny)] || !inside[idx(nx, ny)]) return false;
          }
        }
        return true;
      };
      cliff2 = new Uint8Array(N);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (core(x, y) && fbm(x * 0.13, y * 0.13, s + 97) > 0.42) cliff2[idx(x, y)] = 1;
        }
      }
      smooth(cliff2, 1, core);
      cleanThin(cliff2, core);
    }
  }

  // Boutique en montagne (Rocailleux, Volcan) : la bordure monte d'un second étage
  // loin de la place — une montagne tout autour, qu'on ne peut pas gravir.
  if (store && cliff && biome.mesas?.levels) {
    cliff2 = new Uint8Array(N);
    const far = (x: number, y: number) => cliff![idx(x, y)] === 1 && !inClearing(x, y, ringed ? 1.75 : 1.35);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (far(x, y)) cliff2[idx(x, y)] = 1;
    smooth(cliff2, 1, far);
    cleanThin(cliff2, far);
  }

  // 4) Plaques de sol (boue du Marais, sable des rives du Lac).
  const patch = new Uint8Array(N);
  if (coastSand) {
    patch.set(coastSand);
  } else if (biome.patch) {
    const shore = biome.patch.nearWaterOnly ? dilate(water, 2) : null;
    for (let i = 0; i < N; i++) {
      if (water[i]) continue;
      const x = i % W;
      const y = (i / W) | 0;
      if (shore) patch[i] = shore[i];
      else if (inside[i] && fbm(x * 0.11, y * 0.11, s + 37) > biome.patch.threshold) patch[i] = 1;
    }
    // Sous l'eau aussi : la berge se pose sur la plaque, pas sur l'herbe.
    if (shore) for (let i = 0; i < N; i++) if (water[i]) patch[i] = 1;
    // Jamais sous une falaise : le dessus du plateau la recouvrirait, et la
    // plaque voisine, croyant la terre continue, n'aurait plus de bordure
    // d'herbe (bords droits « en escalier » vus à Rocailleux).
    const ok = (x: number, y: number) => !cliff?.[idx(x, y)];
    if (cliff) for (let i = 0; i < N; i++) if (cliff[i]) patch[i] = 0;
    smooth(patch, 1, ok);
    cleanThin(patch, ok);
  }

  // 5) Cases bloquantes : hors zone, eau non navigable (lave). L'eau où l'on
  // nage ne bloque pas ; c'est l'acteur qui décide s'il sait nager.
  const blocked = new Uint8Array(N);
  const solid = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (!inside[i] || (water[i] && !biome.water?.swim)) blocked[i] = 1;

  // 5b) Falaises : seule la paroi bloque (toute case de plateau qui touche un
  // niveau plus bas, diagonales comprises). Le dessus des plateaux se
  // parcourt, et l'on n'y accède que par les escaliers.
  const levelAt = (x: number, y: number) => {
    const cx = Math.min(W - 1, Math.max(0, x));
    const cy = Math.min(H - 1, Math.max(0, y));
    const i = idx(cx, cy);
    return (cliff?.[i] ?? 0) + (cliff2?.[i] ?? 0);
  };
  /** Parois de falaise (rebords et paroi haute) : ni arbre ni rocher à leurs abords. */
  const wall = new Uint8Array(N);
  if (cliff) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const lv = levelAt(x, y);
        if (!lv) continue;
        for (let dy = -1; dy <= 1 && !wall[idx(x, y)]; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (levelAt(x + dx, y + dy) < lv) {
              blocked[idx(x, y)] = 1;
              wall[idx(x, y)] = 1;
              solid[idx(x, y)] = 1;
              break;
            }
          }
        }
      }
    }
  }

  // 5b') Paroi haute du second étage : sous son rebord sud, une case de
  // roche de plus, posée sur le premier étage. Le second étage se lit ainsi
  // comme une falaise deux fois plus haute, pas comme une simple marche.
  const face = new Uint8Array(N);
  if (cliff2) {
    for (let y = 1; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = idx(x, y);
        // Seulement sur un vrai replat du premier étage : ni sur son rebord,
        // ni au-dessus de son rebord (sinon la paroi flotte dans le vide).
        const below = idx(x, Math.min(H - 1, y + 1));
        if (cliff2[idx(x, y - 1)] && !cliff2[i] && cliff?.[i] && !wall[i] && cliff?.[below] && !wall[below]) {
          face[i] = 1;
          blocked[i] = 1;
          wall[i] = 1;
          solid[i] = 1;
        }
      }
    }
  }

  // 5c) Escaliers : deux cases de paroi sud, avec un replat au-dessus et un
  // sol libre en dessous, d'un niveau exactement. Au second étage, la paroi
  // haute fait 2 cases : l'escalier aussi. Un ou deux par plateau.
  const stairs: { x: number; y: number; rows: number; level: number }[] = [];
  /** Cases à garder dégagées (abords d'escalier, jardins, lampadaires) : ni arbre, ni décor. */
  const reserved = new Uint8Array(N);
  if (cliff && biome.mesas) {
    const walkable = (x: number, y: number, lv: number) =>
      x >= 0 && y >= 0 && x < W && y < H && levelAt(x, y) === lv && !blocked[idx(x, y)] && !water[idx(x, y)] && inside[idx(x, y)];
    const candidates: [number, number, number][] = [];
    for (let y = 1; y < H - 2; y++) {
      for (let x = 1; x < W - 2; x++) {
        const lv = levelAt(x, y);
        if (!lv || levelAt(x + 1, y) !== lv || !inside[idx(x, y)] || !inside[idx(x + 1, y)]) continue;
        if (!walkable(x, y - 1, lv) || !walkable(x + 1, y - 1, lv)) continue;
        const rows = face[idx(x, y + 1)] && face[idx(x + 1, y + 1)] ? 2 : 1;
        if (walkable(x, y + rows, lv - 1) && walkable(x + 1, y + rows, lv - 1)) candidates.push([x, y, rows]);
      }
    }
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (const [x, y, rows] of candidates) {
      // Espacement : pas deux escaliers à moins de 7 cases.
      if (stairs.some((st) => Math.hypot(st.x - x, st.y - y) < 7)) continue;
      stairs.push({ x, y, rows, level: levelAt(x, y) });
      for (const sx of [x, x + 1]) for (let r = 0; r < rows; r++) blocked[idx(sx, y + r)] = 0;
      // Abords dégagés (ni arbre, ni touffe, ni rocher) : on voit l'escalier et on y accède.
      for (let dy = -2; dy <= rows + 1; dy++) {
        for (let dx = -1; dx <= 2; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H) reserved[idx(nx, ny)] = 1;
        }
      }
    }
  }

  // Point de départ provisoire (affiné en fin de génération) : sert à garder ses abords dégagés.
  // Le départ se cherche à 4 cases de l'entrée, vers l'intérieur de la carte.
  const spawn = {
    x: entry.x < 1 ? 4 : entry.x > W - 1 ? W - 5 : entry.x,
    y: entry.y < 1 ? 4 : entry.y > H - 1 ? H - 4 : entry.y,
  };
  const nearSpawn = (x: number, y: number) => Math.hypot(x - spawn.x, y - spawn.y) < 4;

  // 6) Herbe haute.
  const tall = new Uint8Array(N);
  if (biome.tallGrass) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = idx(x, y);
        if (blocked[i] || water[i] || path[i] || patch[i] || reserved[i] || nearSpawn(x, y)) continue;
        if (fbm(x * 0.17, y * 0.17, s + 41) > biome.tallGrass.threshold) tall[i] = 1;
      }
    }
    // Champs (Ligne de front en Prairie) : l'herbe haute couvre la forme de
    // part en part, sauf le chemin et une case de bas-côté, la place d'entrée
    // (on s'y replie à découvert) et quelques trouées du bruit.
    if (routed && shape!.fields) {
      const verge = dilate(path, 1);
      const near = shape!.front?.near;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = idx(x, y);
          if (!inside[i] || blocked[i] || water[i] || verge[i] || patch[i] || reserved[i] || nearSpawn(x, y)) continue;
          if (near && Math.hypot(x - near.x, y - near.y) < 7) continue;
          if (fbm(x * 0.21, y * 0.21, s + 43) > 0.3) tall[i] = 1;
        }
      }
    }
  }

  const objects: WorldObject[] = [];
  const flat: FlatDecor[] = [];

  const blockUnder = (sp: SpriteDef, px: number, py: number) => {
    const cells = trunkCells(sp, px, py);
    if (!cells) return;
    const [x0, x1, y0, y1] = cells;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        blocked[idx(x, y)] = 1;
        tall[idx(x, y)] = 0;
        if (sp.trunk >= 3) solid[idx(x, y)] = 1;
      }
    }
  };

  // 6b) Village : maisons, place, jardins et mobilier (cf. town.ts).
  if (plan && townStyle && biome.buildings) {
    furnishTown(
      { W, H, rng, style: townStyle, inside, path, water, blocked, tall, reserved, objects, flat, blockUnder, nearSpawn },
      plan,
      biome.buildings.count,
    );
  }

  // 7a) Lisière : arbres hors de la zone jouable et au-delà des bords. Plus
  // espacés qu'au premier essai ; sur une bordure de montagnes, seulement
  // quelques arbres clairsemés sur le plateau.
  for (let gy = -1.5; gy < H + 3; gy += 1.4) {
    for (let gx = -2; gx < W + 2; gx += 2.3) {
      const jx = gx + rng.range(-0.6, 0.6);
      const jy = gy + rng.range(-0.3, 0.3);
      const cx = Math.floor(jx);
      const cy = Math.floor(jy);
      const inMap = cx >= 0 && cy >= 0 && cx < W && cy < H;
      if (!biome.trees.border.length || (inMap && (inside[idx(cx, cy)] || path[idx(cx, cy)]))) continue;
      // Côté mer, pas d'arbres, même au-delà du bord : la case la plus proche dans la carte décide.
      const near = idx(Math.min(W - 1, Math.max(0, cx)), Math.min(H - 1, Math.max(0, cy)));
      if (water[near] || (biome.coast && patch[near])) continue;
      // Montagne de la boutique : le sommet reste presque nu, sinon les arbres cachent la roche
      // et la bordure se lit comme une forêt qu'on pourrait traverser.
      if (biome.cliffs && !rng.chance(biome.cliffs.treeRate * (store && cliff2?.[near] ? 0.25 : 1))) continue;
      objects.push({ sprite: rng.pick(biome.trees.border), x: Math.round(jx * TILE), y: Math.round((jy + 1) * TILE), fades: true });
    }
  }

  // 7a') Aucune case de lisière ne doit rester nue : une case bloquée qui
  // montre de l'herbe, c'est un mur invisible. Toute case hors zone qui n'est
  // ni falaise, ni couverte par la frondaison d'un arbre, en reçoit un.
  const borderTrees = objects.filter((o) => o.fades);
  const covered = (x: number, y: number) => {
    const cx = x * TILE + TILE / 2;
    const cy = y * TILE + TILE / 2;
    return borderTrees.some((o) => {
      const [, , w] = o.sprite.rect;
      return Math.abs(o.x - cx) < w * 0.4 && cy < o.y + 2 && cy > o.y - o.sprite.foot * 0.85;
    });
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      // (L'eau et la lave se voient : pas d'arbre dessus, l'anneau de la boutique en dépend.)
      if (!biome.trees.border.length || inside[i] || path[i] || water[i] || cliff?.[i] || covered(x, y)) continue;
      const tree = { sprite: rng.pick(biome.trees.border), x: x * TILE + TILE / 2, y: (y + 1) * TILE, fades: true };
      objects.push(tree);
      borderTrees.push(tree);
    }
  }

  /**
   * Vrai si toutes les cases du rectangle (relatif à cx, cy) sont au même
   * étage que (cx, cy) et loin de toute paroi : sinon un arbre poussait au
   * ras d'un rebord, son tronc posé dans le vide ou sur la roche.
   */
  const awayFromCliffs = (cx: number, cy: number, x0: number, x1: number, y0: number, y1: number) => {
    if (!cliff) return true;
    const lv = levelAt(cx, cy);
    for (let y = cy + y0; y <= cy + y1; y++) {
      for (let x = cx + x0; x <= cx + x1; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (levelAt(x, y) !== lv || wall[idx(x, y)]) return false;
      }
    }
    return true;
  };

  const nearSea = biome.coast ? dilate(water, 2) : null;

  // 7b) Arbres intérieurs, en bosquets (champ de bruit) plutôt qu'en semis uniforme.
  let insideCount = 0;
  for (let i = 0; i < N; i++) if (inside[i] && !water[i]) insideCount++;
  const target = Math.round((biome.trees.density * insideCount) / 7);
  const placed: WorldObject[] = [];
  for (let attempt = 0, n = 0; attempt < target * 8 && n < target; attempt++) {
    const x = rng.range(1, W - 1);
    const y = rng.range(2, H - 1);
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const i = idx(cx, cy);
    if (blocked[i] || water[i] || touchesPath(path, cx, cy) || touchesPath(reserved, cx, cy) || nearSpawn(x, y)) continue;
    // Littoral : un palmier pousse sur le sable, pas les pieds dans l'eau (2 cases de marge).
    if (nearSea && nearSea[i]) continue;
    // Glace : la patinoire reste nue, on y glisse d'un bord à l'autre.
    if (biome.patch?.ice && patch[i]) continue;
    if (fbm(x * 0.1, y * 0.1, s + 53) < 0.45 && rng.chance(0.75)) continue;
    const sp = rng.pick(biome.coast && biome.trees.sand && patch[i] ? biome.trees.sand : biome.trees.interior);
    // Une case de marge autour du tronc, deux au-dessus (le feuillage).
    const span = Math.ceil(Math.max(1, sp.trunk) / 2);
    if (!awayFromCliffs(cx, cy, -span, span, -2, 1)) continue;
    const px = Math.round(x * TILE);
    const py = Math.round((cy + 1) * TILE - 2);
    const w = sp.rect[2];
    // Espacement : deux arbres ne se chevauchent plus que de leurs bords de feuillage.
    if (placed.some((o) => Math.abs(o.x - px) < (o.sprite.rect[2] + w) * 0.42 && Math.abs(o.y - py) < 26)) continue;
    // Pas d'arbre dont le tronc tomberait sur l'eau ou le chemin.
    const half = Math.max(1, sp.trunk) * TILE * 0.5;
    let clear = true;
    for (let tx = Math.floor((px - half) / TILE); tx <= Math.floor((px + half - 1) / TILE); tx++) {
      if (tx < 0 || tx >= W || water[idx(tx, cy)] || path[idx(tx, cy)] || (biome.patch?.ice && patch[idx(tx, cy)])) clear = false;
    }
    if (!clear) continue;
    const obj = { sprite: sp, x: px, y: py, fades: true };
    placed.push(obj);
    objects.push(obj);
    blockUnder(sp, px, py);
    n++;
  }

  for (let i = 0; i < N; i++) if (blocked[i]) tall[i] = 0;

  // 9) Décors : fleurs cuites dans le sol, accessoires posés.
  const nearWater = dilate(water, 1);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = idx(x, y);
      if (blocked[i] || water[i] || path[i] || tall[i] || reserved[i] || nearSpawn(x, y)) continue;
      const field = fbm(x * 0.14, y * 0.14, s + 61);
      if (!patch[i] && biome.flowers > 0 && rng.chance(biome.flowers * field * field * 3)) {
        flat.push({ tile: rng.pick(FLOWERS), x, y });
        continue;
      }
      const clump = fbm(x * 0.2, y * 0.2, s + 67);
      for (const rule of biome.props) {
        if (rule.nearWater && !nearWater[i]) continue;
        if (rule.offPatch && patch[i]) continue;
        // Touffes : regroupées là où le champ de bruit est fort, absentes ailleurs.
        const rate = rule.cluster ? rule.rate * Math.max(0, clump - 0.45) * 12 : rule.rate;
        if (!rng.chance(rate)) continue;
        const sp = rng.pick(rule.sprites);
        const wide = sp.rect[2] > TILE ? 1 : 0;
        if (!awayFromCliffs(x, y, 0, wide, -Math.ceil(sp.rect[3] / TILE) + 1, 0)) continue;
        const px = x * TILE + TILE / 2 + wide * (TILE / 2);
        const py = (y + 1) * TILE;
        objects.push({ sprite: sp, x: px, y: py, fades: false });
        blockUnder(sp, px, py);
        break;
      }
    }
  }

  // Littoral : les bords de carte en mer sont fermés par une ceinture de
  // rochers (au lieu d'arbres posés sur l'eau), avec une passe de 4 cases au
  // milieu de chaque bord, qui servira plus tard de sortie.
  if (biome.coast) {
    const gap = (a: number, len: number) => Math.abs(a - len / 2) < 2;
    const edgeCells: [number, number][] = [];
    for (let x = 0; x < W; x++) {
      if (!gap(x, W)) edgeCells.push([x, 0], [x, H - 1]);
    }
    for (let y = 1; y < H - 1; y++) {
      if (!gap(y, H)) edgeCells.push([0, y], [W - 1, y]);
    }
    for (const [x, y] of edgeCells) {
      if (!water[idx(x, y)]) continue;
      blocked[idx(x, y)] = 1;
      // Un rocher toutes les 2 cases environ, gros ou petit.
      if ((x + y) % 2 && rng.chance(0.75)) continue;
      const big = rng.chance(0.45) && x < W - 1 && y > 0 && water[idx(x + 1, y)] && water[idx(x, y - 1)];
      const sp = big ? PROPS.waterRocks[0] : PROPS.waterRocks[1];
      const px = x * TILE + (big ? TILE : TILE / 2);
      objects.push({ sprite: sp, x: px, y: (y + 1) * TILE, fades: false });
      blockUnder(sp, px, (y + 1) * TILE);
    }
  }

  // Boutique de bord de mer : un récif ferme la baignade autour de l'île. Au-delà, la
  // mer continue jusqu'au bord, mais on ne la rejoint plus (hors zone, donc bloquée).
  if (store && biome.coast) {
    const swim = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && inside[idx(x, y)] === 1 && water[idx(x, y)] === 1;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (inside[idx(x, y)] || !water[idx(x, y)]) continue;
        if (!swim(x + 1, y) && !swim(x - 1, y) && !swim(x, y + 1) && !swim(x, y - 1)) continue;
        if ((x + y) % 2 && rng.chance(0.55)) continue;
        const sp = rng.chance(0.3) ? PROPS.waterRocks[0] : PROPS.waterRocks[1];
        const px = x * TILE + (sp.rect[2] > TILE ? TILE : TILE / 2);
        objects.push({ sprite: sp, x: px, y: (y + 1) * TILE, fades: false });
      }
    }
  }

  // Littoral : des rochers émergent de l'eau, loin des berges.
  if (biome.coast) {
    for (let y = 2; y < H - 2; y++) {
      for (let x = 2; x < W - 2; x++) {
        let open = true;
        for (let dy = -2; dy <= 1 && open; dy++) for (let dx = -2; dx <= 2; dx++) if (!water[idx(x + dx, y + dy)] || blocked[idx(x + dx, y + dy)]) open = false;
        if (!open || !rng.chance(0.012)) continue;
        const sp = rng.pick(PROPS.waterRocks);
        const px = x * TILE + (sp.rect[2] > TILE ? TILE : TILE / 2);
        objects.push({ sprite: sp, x: px, y: (y + 1) * TILE, fades: false });
        blockUnder(sp, px, (y + 1) * TILE);
      }
    }
  }

  // Nénuphars au cœur de l'eau. Écart voulu avec le jeu, où l'on devait les
  // contourner : ils ne bloquent plus, on nage au travers comme on traverse
  // l'herbe haute (retour de test : ils fermaient des passages à la nage).
  const lilies: FlatDecor[] = [];
  if (biome.water && biome.water.lilies.length) {
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (!water[idx(x, y)]) continue;
        const interior = water[idx(x + 1, y)] && water[idx(x - 1, y)] && water[idx(x, y + 1)] && water[idx(x, y - 1)];
        if (interior && rng.chance(0.05)) {
          lilies.push({ tile: rng.pick(biome.water.lilies), x, y });
        }
      }
    }
  }

  // Coffre sur l'îlot du Lac : la récompense de la traversée. En run, c'est
  // le coffre de la salle (étape 12), sans autre garde que l'eau.
  let islet: Pt | null = null;
  if (isleAt) {
    const cx = Math.floor(isleAt.x);
    const cy = Math.floor(isleAt.y);
    if (!water[idx(cx, cy)]) {
      islet = { x: cx, y: cy };
      objects.push({ sprite: CHEST, x: cx * TILE + TILE / 2, y: (cy + 1) * TILE, fades: false });
      blocked[idx(cx, cy)] = 1;
      tall[idx(cx, cy)] = 0;
    }
  }

  objects.sort((a, b) => a.y - b.y);

  // Départ : la case libre du chemin la plus proche du bas de la carte, au
  // centre de la case. L'ancien départ pouvait tomber dans la lisière ou à
  // cheval sur un obstacle, et le joueur restait coincé.
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < N; i++) {
    if (blocked[i] || blocked[i + 1] || !path[i]) continue;
    const d = Math.hypot((i % W) - spawn.x, ((i / W) | 0) - spawn.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best < 0) {
    // Sans sentier (Océan) : la terre ferme la plus proche du bas de la carte.
    for (let i = 0; i < N - 1; i++) {
      if (blocked[i] || blocked[i + 1] || water[i] || water[i + 1] || (i % W) === W - 1) continue;
      const d = Math.hypot((i % W) - spawn.x, ((i / W) | 0) - spawn.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  }
  if (best >= 0) {
    spawn.x = (best % W) + 1;
    spawn.y = ((best / W) | 0) + 0.9;
  }

  // Zone atteignable depuis le départ (remplissage en 4-voisinage).
  const reachable = new Uint8Array(N);
  const start = idx(Math.floor(spawn.x), Math.floor(spawn.y));
  const queue = [start];
  reachable[start] = 1;
  while (queue.length) {
    const i = queue.pop()!;
    const x = i % W;
    const y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = idx(nx, ny);
      if (reachable[j] || blocked[j]) continue;
      reachable[j] = 1;
      queue.push(j);
    }
  }

  const entrySide: Side = entry.y < 1 ? 'N' : entry.y > H - 1 ? 'S' : entry.x < 1 ? 'W' : 'E';
  const exits = findExits(W, H, reachable, water, entrySide, biome.coast === 'ocean');

  const paving: Paving[] = plan && townStyle
    ? [
        { mask: plan.street, tile: townStyle.street },
        { mask: plan.plaza, tile: townStyle.plaza },
        { mask: plan.alley, tile: GROUND.dirt },
      ]
    : [];

  for (let i = 0; i < N; i++) if (!inside[i]) solid[i] = 1;

  // 10) Grotte (run.hasCave) : une bouche creusée dans une paroi sud, sur
  // trois cases de roche pleine (le trou se dessine sur 2,5 cases de haut),
  // devant un sol atteignable à pied, loin des sorties et du départ. Son
  // propre tirage : le reste de la carte ne change pas qu'elle y soit ou non.
  let cave: WorldMap['cave'] = null;
  if (options.cave && cliff) {
    const crng = new Rng(seed * 4099 + 17);
    const floor = (x: number, y: number, lv: number) => {
      const i = idx(x, y);
      return levelAt(x, y) === lv && !blocked[i] && !!reachable[i] && !face[i] && !water[i];
    };
    const spots: Pt[] = [];
    for (let y = 3; y < H - 4; y++) {
      for (let x = 3; x < W - 3; x++) {
        const lv = levelAt(x, y);
        if (!lv) continue;
        let ok = true;
        for (let dx = -1; dx <= 1 && ok; dx++) {
          // La roche : même étage sur trois rangées, paroi au bas, et pas la paroi haute d'un second étage.
          for (let dy = -2; dy <= 0 && ok; dy++) ok = levelAt(x + dx, y + dy) === lv && !face[idx(x + dx, y + dy)];
          ok &&= wall[idx(x + dx, y)] === 1 && floor(x + dx, y + 1, lv - 1) && floor(x + dx, y + 2, lv - 1);
        }
        if (!ok) continue;
        if (exits.some((e) => Math.hypot(e.x - x, e.y - y) < 9) || Math.hypot(spawn.x - x, spawn.y - y) < 9) continue;
        if (stairs.some((st) => Math.abs(st.x - x) < 4 && Math.abs(st.y - y) < 4)) continue;
        spots.push({ x, y });
      }
    }
    if (spots.length) {
      const { x, y } = crng.pick(spots);
      cave = { x, y, used: false };
      // Ce qui poussait sur la roche au-dessus du trou, ou devant, disparaît : la bouche se voit.
      objects.splice(0, objects.length, ...objects.filter((o) => {
        const ox = o.x / TILE;
        const oy = o.y / TILE;
        return !(Math.abs(ox - (x + 0.5)) < 2.2 && oy > y - 2 && oy < y + 3.2);
      }));
      for (let dy = 1; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) tall[idx(x + dx, y + dy)] = 0;
      const rim = biome.cliffs?.blob ?? biome.mesas?.blob;
      const mouth = rim === BLOB.cliffGrass ? CAVE.mouth.grass : rim === BLOB.cliffSnow ? CAVE.mouth.snow : CAVE.mouth.rock;
      objects.push({ sprite: mouth, x: (x + 0.5) * TILE, y: (y + 1) * TILE, fades: false });
      objects.sort((a, b) => a.y - b.y);
    }
  }

  // 11) Arbres à baies (A-FAIRE 1.4) : deux ou trois par salle, sur une case
  // dégagée au bord du chemin (BerryTree placé par MapGenerator « hors
  // chemin, de préférence contre lui »), loin du départ, des sorties, de la
  // grotte et les uns des autres. Une seule case bloquée, entourée de huit
  // cases libres au même étage : on en fait toujours le tour, la zone
  // atteignable ne se coupe pas. Son propre tirage, comme la grotte.
  // Écart voulu : Godot en semait 4 à 8 par carte ; sur nos salles plus
  // courtes, 2 ou 3 suffisent à faire un petit détour sans en couvrir le sol.
  const berries: { x: number; y: number }[] = [];
  if (biome.berry && !store) {
    const brng = new Rng(seed * 7919 + 29);
    const near: Pt[] = [];
    const far: Pt[] = [];
    for (let y = 3; y < H - 3; y++) {
      for (let x = 3; x < W - 3; x++) {
        const i = idx(x, y);
        if (path[i] || patch[i]) continue;
        const lv = levelAt(x, y);
        let ok = true;
        for (let dy = -1; dy <= 1 && ok; dy++) {
          for (let dx = -1; dx <= 1 && ok; dx++) {
            const j = idx(x + dx, y + dy);
            ok = !!inside[j] && !blocked[j] && !!reachable[j] && !water[j] && !face[j] && levelAt(x + dx, y + dy) === lv;
          }
        }
        // La rangée au-dessus aussi : la ramure (deux cases de haut) ne mord pas sur une paroi.
        ok &&= !face[idx(x, y - 2)] && levelAt(x, y - 2) === lv;
        if (!ok || Math.hypot(spawn.x - x, spawn.y - y) < 5) continue;
        if (exits.some((e) => Math.hypot(e.x - x, e.y - y) < 5)) continue;
        if (cave && Math.hypot(cave.x - x, cave.y - y) < 6) continue;
        if (stairs.some((st) => x >= st.x - 2 && x <= st.x + 3 && y >= st.y - 2 && y <= st.y + st.rows + 2)) continue;
        // Pas de décor au pied : un buisson ou un rocher collé au tronc le cacherait.
        if (objects.some((o) => Math.abs(o.x / TILE - (x + 0.5)) < 1.6 && Math.abs(o.y / TILE - (y + 1)) < 1.6)) continue;
        (touchesPath(path, x - 1, y) || touchesPath(path, x + 1, y) || touchesPath(path, x, y + 1) ? near : far).push({ x, y });
      }
    }
    const want = 2 + brng.int(2);
    for (const pool of [near, far]) {
      while (berries.length < want && pool.length) {
        const p = pool.splice(brng.int(pool.length), 1)[0];
        if (!berries.some((b) => Math.hypot(b.x - p.x, b.y - p.y) < 7)) berries.push(p);
      }
    }
    for (const { x, y } of berries) {
      const i = idx(x, y);
      blocked[i] = 1;
      reachable[i] = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) tall[idx(x + dx, y + dy)] = 0;
    }
  }

  // 12) Coffre (A-FAIRE 1.5 ; MapGenerator._place_chest_gated) : dans deux
  // salles sur trois, au fond d'une alcôve de rochers ouverte au sud, dont un
  // obstacle (Biome.guard : arbuste à couper, rocher à briser) est la seule
  // entrée. Le bloc de l'alcôve (3 × 3) et son abord sont entourés d'un
  // anneau libre : on en fait le tour, la zone atteignable ne se coupe pas.
  // Sans place pour l'alcôve, un coffre à découvert (comme le repli de
  // Godot) ; l'îlot du Lac garde le sien. Son propre tirage, comme la grotte.
  let chest: WorldMap['chest'] = null;
  if (!store) {
    const crng = new Rng(seed * 6007 + 41);
    const far = (x: number, y: number, d: number) =>
      Math.hypot(spawn.x - x, spawn.y - y) >= Math.max(6, d) &&
      !exits.some((e) => Math.hypot(e.x - x, e.y - y) < 8) &&
      !(cave && Math.hypot(cave.x - x, cave.y - y) < 6) &&
      !stairs.some((st) => x >= st.x - 3 && x <= st.x + 4 && y >= st.y - 3 && y <= st.y + st.rows + 3) &&
      !berries.some((b) => Math.hypot(b.x - x, b.y - y) < 3.5);
    const free = (x: number, y: number, lv: number) => {
      const i = idx(x, y);
      return x > 0 && y > 0 && x < W - 1 && y < H - 1 && !!inside[i] && !blocked[i] && !!reachable[i] && !water[i] && !face[i] && levelAt(x, y) === lv;
    };
    /** Toutes les cases de x0..x1 × y0..y1 libres, au même étage ; `bare` : hors du chemin. */
    const clear = (x0: number, x1: number, y0: number, y1: number, lv: number, bare: boolean) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!free(x, y, lv) || (bare && (path[idx(x, y)] || patch[idx(x, y)]))) return false;
      return true;
    };
    /** Retire décor et herbe haute de x0..x1 × y0..y1 (pieds dedans). */
    const strip = (x0: number, x1: number, y0: number, y1: number) => {
      objects.splice(0, objects.length, ...objects.filter((o) => {
        const ox = Math.floor(o.x / TILE);
        const oy = Math.floor(o.y / TILE - 0.05);
        return ox < x0 || ox > x1 || oy < y0 || oy > y1;
      }));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tall[idx(x, y)] = 0;
    };
    const putChest = (x: number, y: number) => objects.push({ sprite: CHEST, x: (x + 0.5) * TILE, y: (y + 1) * TILE, fades: false });
    if (islet) chest = { ...islet, guard: null };
    else if (crng.chance(0.65)) {
      const near: Pt[] = [];
      const other: Pt[] = [];
      for (let y = 4; y < H - 6; y++) {
        for (let x = 4; x < W - 4; x++) {
          const lv = levelAt(x, y);
          // L'anneau (5 × 6) libre, le bloc de l'alcôve (3 × 3) hors du chemin.
          if (!clear(x - 2, x + 2, y - 2, y + 3, lv, false) || !clear(x - 1, x + 1, y - 1, y + 1, lv, true) || !far(x, y, 6)) continue;
          (touchesPath(path, x, y + 2) ? near : other).push({ x, y });
        }
      }
      const pool = near.length ? near : other;
      if (pool.length) {
        const { x, y } = crng.pick(pool);
        strip(x - 1, x + 1, y - 1, y + 1);
        // Rochers : le fond et les deux flancs ; l'obstacle, au sud du coffre, est dessiné par run/chests.ts.
        for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]) {
          objects.push({ sprite: crng.pick(PROPS.rockSmall), x: (x + dx + 0.5) * TILE, y: (y + dy + 1) * TILE, fades: false });
        }
        putChest(x, y);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const i = idx(x + dx, y + dy);
            // Plein, même pour un dash : on n'entre que par l'obstacle levé.
            blocked[i] = solid[i] = 1;
            reachable[i] = 0;
          }
        }
        chest = { x, y, guard: biome.guard };
      } else {
        // Repli : à découvert, sur une case dont les huit voisines restent libres.
        const spots: Pt[] = [];
        for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) if (clear(x - 1, x + 1, y - 1, y + 1, levelAt(x, y), false) && !path[idx(x, y)] && far(x, y, 6)) spots.push({ x, y });
        if (spots.length) {
          const { x, y } = crng.pick(spots);
          strip(x, x, y, y);
          putChest(x, y);
          blocked[idx(x, y)] = 1;
          reachable[idx(x, y)] = 0;
          chest = { x, y, guard: null };
        }
      }
      objects.sort((a, b) => a.y - b.y);
    }
  }

  return {
    w: W, h: H, biome, seed, inside, path, patch, water, tall, cliff, cliff2, stairs, face, blocked, solid, reachable,
    objects, flat, lilies, spawn, entrySide, exits, hub, paving, townStyle: townStyle?.name ?? null,
    townLayout: plan?.layout ?? null, fountains: plan?.fountains ?? [], cave, berries, chest,
    front: routed ? (shape!.front ?? null) : null,
    layout: shape?.id ?? null, layoutName: shape ? `${LAYOUT_NAMES[shape.id]} ${W}×${H}` : null,
  };
}

/** Vrai si la case touche le chemin (4-voisinage) : les troncs n'empiètent jamais dessus. */
function touchesPath(path: Uint8Array, x: number, y: number): boolean {
  return Boolean(at(path, x, y) || clampAt(path, x + 1, y) || clampAt(path, x - 1, y) || clampAt(path, x, y + 1) || clampAt(path, x, y - 1));
}

/**
 * Hauteur (en étages, continue) du sol sous un point : 0 en bas, 1 sur un
 * plateau, 2 au second étage. Sur un escalier, elle monte progressivement
 * d'une marche à l'autre. Sert à l'effet de hauteur du rendu.
 */
export function heightAt(world: WorldMap, x: number, y: number): { height: number; onStairs: boolean } {
  for (const st of world.stairs) {
    if (x >= st.x && x < st.x + 2 && y > st.y && y <= st.y + st.rows + 0.2) {
      const t = Math.min(1, Math.max(0, (y - st.y) / st.rows));
      return { height: st.level - t * (st.rise ?? 1), onStairs: true };
    }
  }
  const cx = Math.min(world.w - 1, Math.max(0, Math.floor(x)));
  const cy = Math.min(world.h - 1, Math.max(0, Math.floor(y - 0.1)));
  const i = cy * world.w + cx;
  return { height: (world.cliff?.[i] ?? 0) + (world.cliff2?.[i] ?? 0), onStairs: false };
}

/**
 * Dégage des zones d'une carte déjà générée (le Repaire y installe ses
 * postes) : les arbres, rochers et touffes dont le pied y tombe
 * disparaissent, l'herbe haute aussi, et les cases qu'ils bloquaient se
 * libèrent. La zone atteignable est ensuite recalculée.
 */
export function clearAreas(world: WorldMap, zones: readonly { x: number; y: number; rx: number; ry: number }[]): void {
  const { w: W, h: H } = world;
  const inZone = (x: number, y: number) => zones.some((z) => Math.hypot((x - z.x) / z.rx, (y - z.y) / z.ry) < 1);
  world.objects = world.objects.filter((o) => {
    if (o.fades && !world.inside[Math.floor(o.y / TILE - 0.05) * W + Math.floor(o.x / TILE)]) return true;
    if (!inZone(o.x / TILE, o.y / TILE)) return true;
    const cells = trunkCells(o.sprite, o.x, o.y);
    if (cells) {
      const [x0, x1, y0, y1] = cells;
      for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
        for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
          const i = y * W + x;
          if (world.inside[i] && !world.water[i]) world.blocked[i] = world.solid[i] = 0;
        }
      }
    }
    return false;
  });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inZone(x + 0.5, y + 0.5)) world.tall[y * W + x] = 0;
  world.reachable.fill(0);
  const start = Math.floor(world.spawn.y) * W + Math.floor(world.spawn.x);
  const queue = [start];
  world.reachable[start] = 1;
  while (queue.length) {
    const i = queue.pop()!;
    const x = i % W;
    const y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (world.reachable[j] || world.blocked[j]) continue;
      world.reachable[j] = 1;
      queue.push(j);
    }
  }
}
