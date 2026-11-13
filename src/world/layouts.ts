import type { BiomeId } from '../data/species';
import type { Rng } from '../core/rng';
import type { Biome } from './biomes';

// Formes de salle : la silhouette de la zone jouable et le tracé de ses
// chemins, avant que generate() n'y pose eau, falaises, herbe et arbres.
//
// Écart voulu : MapGenerator.gd ouvrait toujours la même grande clairière
// rectangulaire, et le web aussi jusqu'ici (64 × 40). Les salles d'un même
// biome se ressemblaient toutes. Ici chaque salle tire une forme et une
// taille dans la liste de son biome, choisie pour lui aller : la Forêt
// préfère les clairières reliées et les sentiers en lacets, le Rocailleux
// ses canyons, le Volcan ses arènes et son anneau autour de la lave, le Lac
// sa rive qui fait le tour de l'eau.
//
// Une forme se décrit par des primitives (ellipses, capsules) dont l'union
// donne la « profondeur » de chaque case dans la zone (en cases, comme la
// distance au bord de la clairière d'origine) ; generate() garde la case si
// cette profondeur dépasse la lisière bruitée (1,8 à 4,4 cases). La forme
// ne touche jamais le bord de la carte : seuls les chemins le percent, et
// leurs bouts deviennent les portes (findExits). Les routes, elles, suivent
// le squelette de la forme pour ne pas tailler de tranchée dans la forêt.

export type LayoutId = 'clairiere' | 'arene' | 'couloir' | 'front' | 'haltere' | 'carrefour' | 'boucle' | 'lacets' | 'ile';

export const LAYOUT_NAMES: Record<LayoutId, string> = {
  clairiere: 'Clairière',
  arene: 'Arène',
  couloir: 'Couloir',
  front: 'Ligne de front',
  haltere: 'Deux clairières',
  carrefour: 'Carrefour',
  boucle: 'Boucle',
  lacets: 'Lacets',
  ile: 'Île',
};

type Pt = { x: number; y: number };

type Solid = { kind: 'ellipse'; x: number; y: number; rx: number; ry: number } | { kind: 'capsule'; a: Pt; b: Pt; r: number };
type Prim = { kind: 'rect' } | Solid;

/**
 * Ce qui remplit le cœur d'une boucle : la forêt (hors zone), l'eau ou la
 * lave du biome (dans la zone, mais on n'y marche pas), ou la roche (hors
 * zone : dans un biome à falaises, la bordure en montagne s'y dresse).
 */
export type CoreFill = 'trees' | 'water';

export interface Shape {
  id: LayoutId;
  w: number;
  h: number;
  /** Union des primitives ; `rect` : la carte entière (la clairière d'origine). */
  prims: Prim[];
  /** Trou au milieu de la zone (boucle), et ce qui le remplit. */
  core: { x: number; y: number; rx: number; ry: number; fill: CoreFill } | null;
  /**
   * Terre rendue au milieu du cœur, par-dessus l'eau : l'île et ses gués
   * (forme Île). Comptée après le cœur, contrairement à `prims`.
   */
  land?: Solid[];
  /** Point d'arrivée, sur un bord de la carte. */
  entry: Pt;
  /** Carrefour des chemins. */
  hub: Pt;
  /** Chemins à tailler : chaque route est une suite de points reliés deux à deux. */
  routes: Pt[][];
  /** Écart latéral max des chemins (cases) : faible dans une forme étroite. */
  wobble: number;
  /**
   * Ligne de front : les deux bouts du couloir, côté entrée puis côté
   * sortie. Les vagues surgissent au bout le plus éloigné du joueur
   * (run/room.ts) ; absent, elles tombent n'importe où dans la salle.
   */
  front?: { near: Pt; far: Pt };
  /**
   * Champs : l'intérieur de la forme se couvre d'herbe haute, hors du chemin
   * et de son bas-côté (generate.ts, étape 6). La Ligne de front en Prairie.
   */
  fields?: boolean;
}

/** Profondeur (cases) d'une case dans la forme, hors lisière ; ≤ 0 : dehors. */
export function shapeDepth(s: Shape, x: number, y: number): number {
  const px = x + 0.5;
  const py = y + 0.5;
  // Jamais plus profond que la distance au bord : la forme ne touche pas le cadre.
  const edge = Math.min(x, y, s.w - 1 - x, s.h - 1 - y);
  let d = -Infinity;
  for (const p of s.prims) d = Math.max(d, p.kind === 'rect' ? edge : primDepth(p, px, py));
  d = Math.min(d, edge);
  const c = s.core;
  if (c) d = Math.min(d, coreDepth(c, x, y));
  for (const p of s.land ?? []) d = Math.max(d, Math.min(edge, primDepth(p, px, py) + LAND_MARGIN));
  return d;
}

/** Distance (cases) au cœur d'une boucle, positive dehors. */
export function coreDepth(c: { x: number; y: number; rx: number; ry: number }, x: number, y: number): number {
  return (Math.hypot((x + 0.5 - c.x) / c.rx, (y + 0.5 - c.y) / c.ry) - 1) * Math.min(c.rx, c.ry);
}

/**
 * Marge de la terre rendue au lac (`land`) : la lisière (1,8 à 4,4 cases) ne
 * la ronge presque pas, sinon un gué devrait être aussi large que l'île pour
 * rester praticable, et l'île ne se lirait plus.
 */
const LAND_MARGIN = 3;

/** Profondeur d'un point dans une ellipse ou une capsule (cases), négative dehors. */
function primDepth(p: Solid, px: number, py: number): number {
  return p.kind === 'ellipse' ? (1 - Math.hypot((px - p.x) / p.rx, (py - p.y) / p.ry)) * Math.min(p.rx, p.ry) : p.r - segDist(px, py, p.a, p.b);
}

function segDist(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - a.x - dx * t, py - a.y - dy * t);
}

const ellipse = (x: number, y: number, rx: number, ry: number): Solid => ({ kind: 'ellipse', x, y, rx, ry });
const capsule = (a: Pt, b: Pt, r: number): Solid => ({ kind: 'capsule', a, b, r });
/** Une chaîne de capsules (le corps d'un couloir, d'un lacet). */
const chain = (pts: Pt[], r: number): Prim[] => pts.slice(1).map((p, i) => capsule(pts[i], p, r));

interface LayoutDef {
  /** Tailles possibles [largeur, hauteur], en cases. */
  sizes: readonly (readonly [number, number])[];
  build: (w: number, h: number, rng: Rng, fill: CoreFill, biome: BiomeId) => Omit<Shape, 'id' | 'w' | 'h'>;
}

const LAYOUTS: Record<LayoutId, LayoutDef> = {
  // La clairière d'origine : toute la carte, la lisière autour. Ses chemins
  // restent ceux de generate() (entrée en bas, une sortie en haut, une ou
  // deux sur les côtés ; au Lac, la rive) : `routes` vide.
  clairiere: {
    sizes: [[50, 32], [46, 30], [54, 34]],
    build: (w, h) => ({ prims: [{ kind: 'rect' }], core: null, entry: { x: w / 2, y: h - 0.5 }, hub: { x: w / 2, y: h / 2 }, routes: [], wobble: 6 }),
  },
  // Une petite arène ronde : on y voit tout, on s'y bat serré.
  arene: {
    sizes: [[38, 30], [42, 32]],
    build: (w, h, rng) => {
      const hub = { x: w / 2 + rng.range(-2, 2), y: h / 2 + rng.range(-1, 1) };
      const entry = { x: w / 2 + rng.range(-4, 4), y: h - 0.5 };
      const routes = [[entry, hub], [hub, { x: w / 2 + rng.range(-8, 8), y: 0.5 }]];
      if (rng.chance(0.6)) routes.push([hub, rng.chance(0.5) ? { x: 0.5, y: h / 2 + rng.range(-4, 4) } : { x: w - 0.5, y: h / 2 + rng.range(-4, 4) }]);
      return { prims: [ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1)], core: null, entry, hub, routes, wobble: 3 };
    },
  },
  // Un long couloir sinueux, d'un bord à l'autre (de gauche à droite, ou de
  // bas en haut), gonflé de petites clairières : on avance, la salle défile.
  couloir: {
    // Retour de test : « les couloirs sont beaucoup trop longs, c'est un peu chiant » (66 × 28
    // auparavant) : un tiers plus courts.
    sizes: [[46, 26], [42, 24], [28, 38]],
    build: (w, h, rng) => {
      const across = w > h;
      const n = 4;
      // Squelette : n nœuds le long du grand axe, décalés de quelques cases sur le petit.
      const nodes: Pt[] = Array.from({ length: n }, (_, i) => {
        const t = 0.13 + (0.74 * i) / (n - 1);
        return across ? { x: w * t, y: h / 2 + rng.range(-3, 3) } : { x: w / 2 + rng.range(-4, 4), y: h * (1 - t) };
      });
      const entry = across ? { x: 0.5, y: nodes[0].y } : { x: nodes[0].x, y: h - 0.5 };
      const end = across ? { x: w - 0.5, y: nodes[n - 1].y } : { x: nodes[n - 1].x, y: 0.5 };
      const r = across ? 9 : 9.5;
      // Les renflements remplissent la largeur de la carte : sinon des bandes de roche ou d'arbres, vides, la bordaient.
      const prims = [...chain(nodes, r), ...nodes.map((p) => (across ? ellipse(p.x, p.y, 12, h * 0.45) : ellipse(p.x, p.y, w * 0.45, 12)))];
      const routes = [[entry, ...nodes, end]];
      // Une sortie de plus, sur le flanc d'un nœud du milieu, par un bras court.
      if (rng.chance(0.5)) {
        const k = 1 + rng.int(n - 2);
        const p = nodes[k];
        const side = across ? { x: p.x, y: 0.5 } : { x: rng.chance(0.5) ? 0.5 : w - 0.5, y: p.y };
        prims.push(capsule(p, side, 7));
        routes.push([p, side]);
      }
      return { prims, core: null, entry, hub: nodes[1], routes, wobble: 2.5 };
    },
  },
  // Ligne de front : un couloir droit et large, sans recoin. On entre par un
  // bout, chaque vague surgit à l'autre et charge en masse : on la voit
  // venir de loin, on la tient ou on recule. La sortie est derrière elle.
  // (Écart voulu : le jeu n'a pas de salle de ce genre, ses vagues tombent
  // toujours autour du joueur.)
  //
  // Elle prend l'allure de son biome :
  // - Forêt : un sentier étroit entre deux murs d'arbres, qui serpente un
  //   peu. On s'y bat à trois de front, les vagues s'y allongent en file.
  // - Prairie : le couloir large, mais un chemin de terre au milieu de champs
  //   d'herbe haute (`fields`). Les sauvages s'y cachent en chargeant
  //   (enemy.ts, onTallGrass) : on les devine à l'herbe qui bouge.
  // - Ailleurs (Volcan, Rocailleux…) : le couloir large et nu d'origine.
  front: {
    sizes: [[48, 24], [44, 22], [26, 40]],
    build: (w, h, rng, _fill, biome) => {
      const across = w > h;
      const path = biome === 'foret';
      const n = 5;
      // Un tracé presque droit : à peine décalé, pour qu'on voie l'autre bout. Le sentier, lui, ondule un peu plus.
      const sway = path ? 2.5 : 1.5;
      const nodes: Pt[] = Array.from({ length: n }, (_, i) => {
        const t = 0.1 + (0.8 * i) / (n - 1);
        return across ? { x: w * t, y: h / 2 + rng.range(-sway, sway) } : { x: w / 2 + rng.range(-sway, sway), y: h * (1 - t) };
      });
      const near = nodes[0];
      const far = nodes[n - 1];
      const entry = across ? { x: 0.5, y: near.y } : { x: near.x, y: h - 0.5 };
      const end = across ? { x: w - 0.5, y: far.y } : { x: far.x, y: 0.5 };
      // Deux places aux bouts (on s'y replie, elles s'y massent), un couloir plus étroit entre elles.
      // Le sentier : couloir de 11 cases à peine (la lisière en ronge encore), petites trouées aux bouts.
      const [rx, fy, r, armR] = path ? [8, 0.32, across ? 5.5 : 6, 5] : [11, 0.46, across ? 8.5 : 9, 6.5];
      const place = (p: Pt) => (across ? ellipse(p.x, p.y, rx, h * fy) : ellipse(p.x, p.y, w * fy, rx));
      const prims = [...chain(nodes, r), place(near), place(far)];
      const routes = [[entry, ...nodes, end]];
      // Parfois une seconde porte, sur le flanc de la place du fond.
      if (rng.chance(0.6)) {
        const side = across ? { x: far.x - 3, y: rng.chance(0.5) ? 0.5 : h - 0.5 } : { x: rng.chance(0.5) ? 0.5 : w - 0.5, y: far.y + 3 };
        prims.push(capsule(far, side, armR));
        routes.push([far, side]);
      }
      return { prims, core: null, entry, hub: nodes[2], routes, wobble: path ? 2 : 1.5, front: { near, far }, fields: biome === 'prairie' };
    },
  },
  // Deux clairières reliées par un goulet : on prend la première, on force
  // le passage, la seconde mène aux portes.
  haltere: {
    sizes: [[52, 34], [50, 32], [54, 36]],
    build: (w, h, rng) => {
      const flip = rng.chance(0.5);
      const ax = flip ? w * 0.7 : w * 0.3;
      const bx = flip ? w * 0.3 : w * 0.7;
      const a = { x: ax, y: h * 0.62 };
      const b = { x: bx, y: h * 0.36 };
      const prims = [ellipse(a.x, a.y, w * 0.21, h * 0.3), ellipse(b.x, b.y, w * 0.21, h * 0.3), capsule(a, b, 6.5)];
      const entry = { x: a.x + rng.range(-3, 3), y: h - 0.5 };
      const routes = [[entry, a, b, { x: b.x + rng.range(-4, 4), y: 0.5 }], [b, { x: flip ? 0.5 : w - 0.5, y: b.y + rng.range(-2, 2) }]];
      // Parfois une porte dérobée depuis la première clairière.
      if (rng.chance(0.4)) routes.push([a, { x: flip ? w - 0.5 : 0.5, y: a.y + rng.range(-3, 3) }]);
      return { prims, core: null, entry, hub: b, routes, wobble: 3 };
    },
  },
  // Une place ronde et quatre bras vers les bords : trois portes au choix.
  carrefour: {
    sizes: [[44, 36], [46, 38]],
    build: (w, h, rng) => {
      const hub = { x: w / 2 + rng.range(-2, 2), y: h / 2 + rng.range(-1, 1) };
      const ends = [
        { x: hub.x + rng.range(-3, 3), y: h - 0.5 },
        { x: hub.x + rng.range(-3, 3), y: 0.5 },
        { x: 0.5, y: hub.y + rng.range(-3, 3) },
        { x: w - 0.5, y: hub.y + rng.range(-3, 3) },
      ];
      const prims = [ellipse(hub.x, hub.y, 15, 12), ...ends.map((e) => capsule(hub, e, 8))];
      return { prims, core: null, entry: ends[0], hub, routes: ends.slice(1).map((e) => [hub, e]).concat([[ends[0], hub]]), wobble: 2 };
    },
  },
  // Un anneau autour d'un cœur infranchissable (bosquet, lac, lave,
  // montagne) : deux chemins en font le tour, on choisit son côté.
  boucle: {
    sizes: [[52, 38], [56, 40]],
    build: (w, h, rng, fill) => {
      const c = { x: w / 2, y: h / 2 };
      const core = { ...c, rx: w * 0.2, ry: h * 0.21, fill };
      const S = { x: c.x, y: h * 0.84 };
      const N = { x: c.x, y: h * 0.16 };
      const Wp = { x: w * 0.14, y: c.y };
      const E = { x: w * 0.86, y: c.y };
      const entry = { x: c.x + rng.range(-3, 3), y: h - 0.5 };
      const routes = [[entry, S], [S, Wp, N], [S, E, N], [N, { x: c.x + rng.range(-5, 5), y: 0.5 }]];
      if (rng.chance(0.6)) routes.push(rng.chance(0.5) ? [Wp, { x: 0.5, y: c.y + rng.range(-3, 3) }] : [E, { x: w - 0.5, y: c.y + rng.range(-3, 3) }]);
      return { prims: [ellipse(c.x, c.y, w / 2 - 1, h / 2 - 1)], core, entry, hub: N, routes, wobble: 2 };
    },
  },
  // Île (A-FAIRE 1.12 : « une île au Lac ») : une rive qui fait le tour d'un
  // grand lac, et au milieu une île, reliée à la rive par deux gués, un au
  // sud vers l'entrée, un au nord vers la sortie. Le carrefour est sur l'île :
  // on la traverse, ou l'on fait le tour par la rive (les portes de côté y
  // donnent). Au Lac, on nage aussi d'une rive à l'autre.
  ile: {
    sizes: [[54, 40], [58, 42]],
    build: (w, h, rng, fill) => {
      const c = { x: w / 2 + rng.range(-1.5, 1.5), y: h / 2 };
      const core = { ...c, rx: w * 0.31, ry: h * 0.3, fill };
      const isle = { x: c.x, y: c.y, rx: w * 0.13 + rng.range(-1, 1), ry: h * 0.14 };
      // Le tour de la rive : des points sur une ellipse entre le lac et la lisière (en ligne
      // droite de S à O, le chemin couperait le lac).
      const rim = (deg: number): Pt => ({ x: c.x + Math.sin((deg * Math.PI) / 180) * w * 0.405, y: c.y + Math.cos((deg * Math.PI) / 180) * h * 0.4 });
      const S = rim(0);
      const N = rim(180);
      const Wp = rim(270);
      const E = rim(90);
      const entry = { x: S.x + rng.range(-2, 2), y: h - 0.5 };
      // Les gués : étroits (2 à 7 cases, selon la lisière), l'île reste une île.
      const ford = 2.5;
      const land = [ellipse(isle.x, isle.y, isle.rx, isle.ry), capsule(S, c, ford), capsule(c, N, ford)];
      const routes = [[entry, S, c, N, { x: N.x + rng.range(-4, 4), y: 0.5 }], [S, rim(315), Wp, rim(225), N], [S, rim(45), E, rim(135), N]];
      if (rng.chance(0.6)) routes.push(rng.chance(0.5) ? [Wp, { x: 0.5, y: c.y + rng.range(-3, 3) }] : [E, { x: w - 0.5, y: c.y + rng.range(-3, 3) }]);
      return { prims: [ellipse(c.x, c.y, w / 2 - 1, h / 2 - 1)], core, land, entry, hub: c, routes, wobble: 1.5 };
    },
  },
  // Un sentier en U : une bande en bas, un virage, une bande en haut qui
  // revient, la forêt entre les deux.
  lacets: {
    sizes: [[50, 34], [52, 36]],
    build: (w, h, rng) => {
      const left = rng.chance(0.5);
      const near = (t: number) => (left ? w * t : w * (1 - t));
      const yLow = h * 0.72;
      const yHigh = h * 0.29;
      const p0 = { x: near(0.16), y: yLow };
      const p1 = { x: near(0.84), y: yLow };
      const p2 = { x: near(0.84), y: yHigh };
      const p3 = { x: near(0.16), y: yHigh };
      // Deux bandes de 8 cases de rayon se toucheraient dans une carte basse : le rayon suit la hauteur.
      const r = Math.min(8, h * 0.17);
      const prims = [...chain([p0, p1, p2, p3], r), ellipse(p1.x, (yLow + yHigh) / 2, 9, h * 0.32), ellipse(p0.x, p0.y, 9, 8), ellipse(p3.x, p3.y, 10, 8)];
      const entry = { x: p0.x + rng.range(-2, 2), y: h - 0.5 };
      const routes = [[entry, p0, p1, p2, p3], [p3, { x: p3.x + rng.range(-3, 3), y: 0.5 }]];
      if (rng.chance(0.6)) routes.push([p3, { x: left ? 0.5 : w - 0.5, y: p3.y + rng.range(-2, 2) }]);
      return { prims, core: null, entry, hub: p2, routes, wobble: 2 };
    },
  },
};

/**
 * Formes de chaque biome, pondérées. Le Village garde sa clairière (ses rues
 * se tracent dans un rectangle) ; la Plage et l'Océan, leur littoral (seule
 * leur taille varie, voir COAST_SIZES).
 */
const POOLS: Record<BiomeId, readonly [LayoutId, number][]> = {
  prairie: [['clairiere', 3], ['arene', 2], ['haltere', 2], ['carrefour', 2], ['boucle', 1], ['front', 3]],
  foret: [['haltere', 3], ['lacets', 2], ['couloir', 2], ['boucle', 2], ['clairiere', 1], ['front', 3]],
  automne: [['clairiere', 2], ['haltere', 2], ['lacets', 2], ['boucle', 2], ['arene', 1], ['front', 1]],
  lac: [['clairiere', 3], ['boucle', 2], ['ile', 3]],
  marais: [['haltere', 2], ['boucle', 2], ['lacets', 2], ['clairiere', 2], ['front', 1]],
  volcan: [['arene', 3], ['boucle', 2], ['couloir', 2], ['carrefour', 1], ['front', 2]],
  rocailleux: [['couloir', 2], ['carrefour', 2], ['arene', 2], ['haltere', 2], ['front', 2]],
  village: [['clairiere', 1]],
  plage: [['clairiere', 1]],
  ocean: [['clairiere', 1]],
  // Des passages entre les falaises enneigées, comme un col de montagne. Retour de test : « la
  // montagne, c'est un peu trop long » — moins de couloirs, plus d'arènes et de carrefours.
  glace: [['arene', 3], ['carrefour', 2], ['lacets', 2], ['couloir', 1], ['front', 1]],
};

/**
 * Le Village garde la taille de la clairière d'origine : ses rues et ses
 * maisons sont tracées pour elle (generate.ts, plan du bourg).
 */
const VILLAGE_SIZE: readonly (readonly [number, number])[] = [[64, 40]];

/** Tailles du littoral : une anse, une plus courte, une longue grève (plus petites que la plage d'origine, 64 × 40). */
const COAST_SIZES: readonly (readonly [number, number])[] = [[52, 34], [50, 32], [56, 32]];

/** Le cœur d'une boucle selon le biome : lac, lave ou marécage s'il y en a, sinon la forêt (ou la montagne, que les falaises dressent d'elles-mêmes). */
function coreFill(biome: Biome): CoreFill {
  const w = biome.water;
  return w && (w.lake || !w.swim || biome.id === 'marais') ? 'water' : 'trees';
}

/** Bord d'une carte (generate.ts, Side) : redéfini ici pour ne pas importer generate. */
type Edge = 'N' | 'S' | 'E' | 'W';
/** Ordre des bords sous un quart de tour horaire (S → W → N → E → S). */
const CW: readonly Edge[] = ['S', 'W', 'N', 'E'];

/** Le bord où une forme fait entrer : celui que touche son point d'arrivée. */
function edgeOf(s: { w: number; h: number; entry: Pt }): Edge {
  const { x, y } = s.entry;
  return y >= s.h - 1 ? 'S' : y < 1 ? 'N' : x < 1 ? 'W' : 'E';
}

/**
 * Tourne une forme pour qu'on y entre par le bord `side` (ajout, retour de
 * test : « je sors par la droite de la prairie et j'arrive par le haut sur la
 * plage, ça n'a pas de logique »). La salle suivante se génère donc du côté
 * d'où l'on vient : sorti à l'est, on entre à l'ouest. Les formes sont
 * pensées pour une entrée en bas (ou à gauche pour les couloirs couchés) ;
 * on les fait pivoter d'un quart de tour à la fois — la carte échange sa
 * largeur et sa hauteur. Rien de dessiné ne tourne : generate() pose eau,
 * falaises et arbres d'après la forme, les tuiles se choisissent ensuite.
 */
export function orientShape(shape: Shape, side: Edge): Shape {
  const turns = (CW.indexOf(side) - CW.indexOf(edgeOf(shape)) + 4) % 4;
  let s = shape;
  for (let k = 0; k < turns; k++) s = turnCw(s);
  return s;
}

/** Un quart de tour : (x, y) → (h − y, x), la carte devient h × w. Le bas passe à gauche. */
function turnCw(s: Shape): Shape {
  const t = (p: Pt): Pt => ({ x: s.h - p.y, y: p.x });
  const prims = s.prims.map((p): Prim =>
    p.kind === 'rect' ? p : p.kind === 'ellipse' ? { kind: 'ellipse', ...t(p), rx: p.ry, ry: p.rx } : { kind: 'capsule', a: t(p.a), b: t(p.b), r: p.r },
  );
  return {
    ...s,
    w: s.h,
    h: s.w,
    prims,
    core: s.core && { ...s.core, ...t(s.core), rx: s.core.ry, ry: s.core.rx },
    land: s.land?.map((p): Solid => (p.kind === 'ellipse' ? { kind: 'ellipse', ...t(p), rx: p.ry, ry: p.rx } : { kind: 'capsule', a: t(p.a), b: t(p.b), r: p.r })),
    entry: t(s.entry),
    hub: t(s.hub),
    routes: s.routes.map((r) => r.map(t)),
    front: s.front && { near: t(s.front.near), far: t(s.front.far) },
  };
}

/**
 * Forme d'une salle de run, tirée de la liste de son biome. `force` : forme
 * imposée (panneau de test), si le biome l'admet — sinon celle du tirage.
 */
export function pickLayout(biome: Biome, rng: Rng, force?: LayoutId): Shape {
  const pool = POOLS[biome.id];
  let id: LayoutId;
  if (biome.coast || biome.buildings) id = 'clairiere';
  else if (force) id = force;
  else {
    let roll = rng.next() * pool.reduce((t, [, w]) => t + w, 0);
    id = pool.find(([, w]) => (roll -= w) < 0)?.[0] ?? pool[0][0];
  }
  const def = LAYOUTS[id];
  // Le littoral garde sa forme mais pas sa taille ; le Village, les deux.
  const sizes = biome.buildings ? VILLAGE_SIZE : biome.coast ? COAST_SIZES : def.sizes;
  const [w, h] = rng.pick(sizes);
  return { id, w, h, ...def.build(w, h, rng, coreFill(biome), biome.id) };
}
