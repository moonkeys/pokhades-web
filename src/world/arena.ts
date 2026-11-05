import type { BiomeId } from '../data/species';
import { findExits, type WorldMap } from './generate';
import type { Paving } from './town';
import { CAMP_PROPS, GYM, LAMP, PROPS, TILE, TOWN_DECOR, TREES, type SpriteDef, type Tile } from './tiles';

// L'arène d'un champion (ajout, retour de test : « de vraies arènes, un endroit
// précis pour chaque boss, toujours le même pour chaque biome… un cercle » ;
// puis « le sol d'arène, c'est pas top ; il faut du décor en rapport avec le
// biome »). generate() taille la clairière ronde (`arena`) avec la bordure de
// son biome (anneau d'eau au Lac, de lave au Volcan, montagnes aux Rocailleux,
// île de sable à la Plage) ; on la cerne ici d'un anneau de décor du lieu —
// palmiers à la Plage, rochers aux Rocailleux, rochers enneigés et cristaux en
// Montagne, arbres morts au Marais… —, ouvert seulement devant les quatre
// sorties, que deux torches encadrent. Le terrain reste le sol du biome.
// La graine est fixe par biome (main.ts) : on retrouve la même arène à chaque run.
// Exception, le Village : une arène d'intérieur, comme celles des jeux (buildGym).

/** Rayon de l'anneau de décor (cases ; l'axe vertical est un peu écrasé, comme la clairière). */
const RING_R = 10.4;
const RING_Y = 0.82;
/** Demi-ouverture (radians) laissée devant chaque sortie. */
const GAP = 0.32;

/**
 * L'anneau de chaque biome : de grosses pièces (`main`, qui ferment le cercle) en alternance
 * avec de petites (`fill`), et l'écart entre deux pièces le long de l'anneau (cases).
 */
const RING: Record<BiomeId, { main: readonly SpriteDef[]; fill: readonly SpriteDef[]; step: number }> = {
  prairie: { main: TREES.small, fill: [...TOWN_DECOR.bushes, ...PROPS.bunches], step: 2 },
  foret: { main: [...TREES.conifer.slice(0, 2), ...TREES.round.slice(2)], fill: [...PROPS.stump, ...PROPS.mushrooms], step: 2.4 },
  automne: { main: TREES.autumn, fill: [...PROPS.log, ...PROPS.mushrooms], step: 2.6 },
  village: { main: [LAMP], fill: [...TOWN_DECOR.bushes, ...TOWN_DECOR.pots], step: 2.2 },
  plage: { main: TREES.palm, fill: PROPS.rockSmall, step: 2.8 },
  ocean: { main: TREES.palm, fill: PROPS.rockSmall, step: 2.8 },
  lac: { main: TREES.roundB, fill: PROPS.reeds, step: 2.2 },
  marais: { main: [...TREES.dead, ...TREES.dark], fill: [...PROPS.mushrooms, ...PROPS.reeds], step: 2.6 },
  volcan: { main: PROPS.boulder, fill: [...TREES.dead, ...PROPS.rockSmall], step: 2.2 },
  rocailleux: { main: PROPS.boulder, fill: [...PROPS.rockSmall, ...PROPS.paleStones], step: 2.1 },
  glace: { main: [...PROPS.snowBoulder, ...TREES.snowy.slice(0, 2)], fill: [...PROPS.iceCrystals, ...PROPS.snowRocks], step: 2.2 },
};

/** Les quatre sorties (nord, est, sud, ouest), en angle. */
const EXITS = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];

export function decorateArena(world: WorldMap, biome: BiomeId): void {
  if (biome === 'village') return buildGym(world);
  const { w, h } = world;
  const c = world.hub;
  const ring = RING[biome];
  const place = (sp: SpriteDef, x: number, y: number): boolean => {
    const cx = Math.floor(x);
    const cy = Math.floor(y - 0.05);
    const i = cy * w + cx;
    if (cx < 1 || cy < 1 || cx >= w - 1 || cy >= h - 1 || world.water[i] || world.blocked[i]) return false;
    world.objects.push({ sprite: sp, x: Math.round(x * TILE), y: Math.round(y * TILE), fades: sp.rect[3] > 40 });
    // Les grosses pièces ferment le cercle : on ne passe qu'aux sorties (un dash, oui).
    if (sp.trunk > 0) for (let dx = 0; dx < Math.max(1, Math.round(sp.trunk)); dx++) world.blocked[cy * w + cx + dx - Math.floor(sp.trunk / 2)] = 1;
    return true;
  };
  // Le long de l'anneau, pièce après pièce, sauf devant les sorties.
  const perimeter = Math.PI * 2 * RING_R * ((1 + RING_Y) / 2);
  const n = Math.round(perimeter / ring.step);
  const seed = biome.length * 7;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 - Math.PI;
    if (EXITS.some((e) => Math.abs(Math.atan2(Math.sin(a - e), Math.cos(a - e))) < GAP)) continue;
    const list = k % 2 === 0 ? ring.main : ring.fill;
    const sp = list[(k * 5 + seed) % list.length];
    place(sp, c.x + Math.cos(a) * RING_R, c.y + Math.sin(a) * RING_R * RING_Y);
  }
  // Deux torches à chaque entrée : on voit d'où l'on vient et où mènent les routes.
  for (const e of EXITS) {
    for (const side of [-1, 1]) {
      const a = e + side * (GAP + 0.05);
      place(CAMP_PROPS.torch, c.x + Math.cos(a) * RING_R, c.y + Math.sin(a) * RING_R * RING_Y);
    }
  }
  world.objects.sort((a, b) => a.y - b.y);
}

/**
 * L'arène du Village (retour de test : « une vraie arène de dresseur, comme
 * quand tu entres dans une arène dans les jeux Pokémon ») : une salle
 * d'intérieur bâtie avec le jeu d'arène d'Essentials (GYM, world/tiles.ts) à
 * la place de la clairière que generate() a taillée. On en garde la taille de
 * carte, le carrefour et la graine ; tout le reste est refait ici.
 *
 *   - le noir tout autour, comme hors des murs dans les jeux ;
 *   - au nord, le mur de bois (dessus, façade à appliques) et son ombre au sol ;
 *     à l'ouest et à l'est, les murs vus de dessus ;
 *   - au centre, le terrain de combat : cadre blanc, ligne médiane et emblème
 *     Poké Ball, la ligne passant au carrefour (`hub`), le champion sur la ligne
 *     de fond (main.ts le pose à hub.y − 7,5) ;
 *   - au sud, le paillasson de l'entrée entre deux statues d'arène (celles du
 *     tileset du jeu), où l'on arrive ;
 *   - trois passages vers les routes de la carte du monde : une ouverture dans
 *     le mur nord et un couloir à l'ouest et à l'est (findExits les retrouve
 *     comme sorties, à partir de `reachable`).
 *
 * Le sol se pose par `world.paving`. Astuce : la première couche (le parquet)
 * couvre TOUTE la carte. Renderer.drawPaving ne trace ses joints qu'entre deux
 * cases de couches différentes, et une case appartient à la première couche
 * qui la contient : tout est donc « parquet » pour lui, et les couches
 * suivantes (noir, murs, lignes du terrain) se peignent par-dessus sans le
 * moindre joint. Les murs latéraux et le haut du paillasson, en partie
 * transparents, laissent ainsi voir le parquet dessous.
 */
function buildGym(world: WorldMap): void {
  const { w: W, h: H } = world;
  const N = W * H;
  const idx = (x: number, y: number) => y * W + x;
  // La salle est symétrique autour de la colonne cc + 0,5 : le terrain, l'emblème (3 cases)
  // et les passages (3 cases) ont un milieu de case, pas un joint.
  const cc = Math.floor(W / 2);
  /** La ligne médiane du terrain passe entre les rangées hy − 1 et hy. */
  const hy = Math.round(world.hub.y);
  // Le parquet : colonnes X0-X1, rangées Y0-Y1 (le mur nord occupe les trois rangées au-dessus,
  // le paillasson déborde d'une rangée au sud, sur le noir).
  const X0 = cc - 20;
  const X1 = cc + 20;
  const Y0 = 6;
  const Y1 = H - 3;
  // Le terrain : 23 × 18 cases autour du carrefour.
  const FX0 = cc - 11;
  const FX1 = cc + 11;
  const FY0 = hy - 9;
  const FY1 = hy + 8;

  const walk = new Uint8Array(N);
  const isVoid = new Uint8Array(N);
  const over: (Tile | null)[] = new Array(N).fill(null);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const room = x >= X0 && x <= X1 && y >= Y0 && y <= Y1;
      const north = x >= cc - 1 && x <= cc + 1 && y < Y0;
      const side = y >= hy - 1 && y <= hy + 1 && (x < X0 || x > X1);
      if (room || north || side) walk[idx(x, y)] = 1;
      else isVoid[idx(x, y)] = 1;
    }
  }
  /** Pose une tuile par-dessus le sol ; `base` : ce qui est dessous (le noir, ou le parquet là où la tuile est en partie transparente). */
  const set = (x: number, y: number, tile: Tile, base: 'void' | 'floor' = 'void') => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    over[idx(x, y)] = tile;
    isVoid[idx(x, y)] = base === 'void' ? 1 : 0;
  };
  /** Un pan de mur nord (dessus et façade) de x0 à x1, la façade sur les rangées y − 2 et y − 1. */
  const northWall = (x0: number, x1: number, y: number) => {
    for (let x = x0; x <= x1; x++) {
      if (walk[idx(x, y - 1)]) continue;
      const k = (x - x0) % GYM.face[0].length;
      set(x, y - 3, GYM.cap);
      set(x, y - 2, GYM.face[0][k]);
      set(x, y - 1, GYM.face[1][k]);
      if (walk[idx(x, y)]) set(x, y, GYM.shade, 'floor');
    }
  };
  /** Un mur latéral vu de dessus, sur la colonne x de y0 à y1 (une applique toutes les 5 cases). */
  const sideWall = (x: number, y0: number, y1: number, tiles: readonly Tile[]) => {
    for (let y = y0; y <= y1; y++) if (!walk[idx(x, y)]) set(x, y, tiles[(y - y0) % 5 === 2 ? 1 : 0], 'floor');
  };

  // Le mur nord, ouvert au milieu (le passage du nord), et ceux des couloirs de l'ouest et de l'est.
  northWall(X0 - 1, X1 + 1, Y0);
  northWall(0, X0 - 1, hy - 1);
  northWall(X1 + 1, W - 1, hy - 1);
  // Les murs latéraux de la salle (interrompus par les couloirs) et ceux du passage du nord.
  sideWall(X0 - 1, Y0, hy - 4, GYM.wallL);
  sideWall(X0 - 1, hy + 2, Y1, GYM.wallL);
  sideWall(X1 + 1, Y0, hy - 4, GYM.wallR);
  sideWall(X1 + 1, hy + 2, Y1, GYM.wallR);
  sideWall(cc - 2, 0, Y0 - 4, GYM.wallL);
  sideWall(cc + 2, 0, Y0 - 4, GYM.wallR);

  // Le terrain de combat, puis son emblème.
  for (let y = FY0; y <= FY1; y++) {
    for (let x = FX0; x <= FX1; x++) {
      const left = x === FX0;
      const right = x === FX1;
      const f = GYM.frame;
      let tile: Tile | null = null;
      if (y === FY0) tile = left ? f.tl : right ? f.tr : f.t;
      else if (y === FY1) tile = left ? f.bl : right ? f.br : f.b;
      else if (y === hy - 1 || y === hy) {
        const k = y === hy ? 1 : 0;
        tile = left ? GYM.midL[k] : right ? GYM.midR[k] : GYM.mid[k];
      } else if (left) tile = f.l;
      else if (right) tile = f.r;
      if (tile) set(x, y, tile, 'floor');
    }
  }
  GYM.emblem.forEach((row, r) => row.forEach((tile, c) => set(cc - 1 + c, hy - 2 + r, tile, 'floor')));
  // Le paillasson de l'entrée : sa rangée du haut sur le parquet, celle du bas sur le noir.
  for (let c = 0; c < 3; c++) {
    set(cc - 1 + c, Y1, GYM.mat[0][c], 'floor');
    set(cc - 1 + c, Y1 + 1, GYM.mat[1][c]);
  }

  // Le sol en couches (cf. l'astuce plus haut) : parquet partout, le noir, puis une couche par tuile posée.
  const paving: Paving[] = [{ mask: new Uint8Array(N).fill(1), tile: GYM.floor }, { mask: isVoid, tile: GYM.void }];
  const layers = new Map<string, Paving>();
  for (let i = 0; i < N; i++) {
    const tile = over[i];
    if (!tile) continue;
    const key = tile.join();
    let p = layers.get(key);
    if (!p) layers.set(key, (p = { mask: new Uint8Array(N), tile }));
    p.mask[i] = 1;
  }
  paving.push(...layers.values());

  // Le décor : les statues d'arène de part et d'autre de l'entrée (le tileset du jeu en a une,
  // celle des arènes de Kanto), et des plantes en pot aux coins et de chaque côté des passages.
  const blocked = walk.map((v) => (v ? 0 : 1));
  const objects: WorldMap['objects'] = [];
  const place = (sp: SpriteDef, px: number, cx0: number, cx1: number, cy: number) => {
    objects.push({ sprite: sp, x: px, y: (cy + 1) * TILE - 1, fades: sp.rect[3] > 32 });
    for (let x = cx0; x <= cx1; x++) blocked[idx(x, cy)] = 1;
  };
  place(TOWN_DECOR.statue, (cc - 3) * TILE, cc - 4, cc - 3, Y1 - 1);
  place(TOWN_DECOR.statue, (cc + 4) * TILE, cc + 3, cc + 4, Y1 - 1);
  const plant = TOWN_DECOR.pots[0];
  for (const [x, y] of [[X0, Y0], [X1, Y0], [X0, Y1], [X1, Y1], [cc - 2, Y0], [cc + 2, Y0], [X0, hy - 2], [X0, hy + 2], [X1, hy - 2], [X1, hy + 2]]) {
    place(plant, x * TILE + TILE / 2, x, x, y);
  }
  objects.sort((a, b) => a.y - b.y);

  // On arrive sur le paillasson ; la zone atteignable et les sorties se recalculent sur la salle.
  const spawn = { x: cc + 0.5, y: Y1 + 0.9 };
  const reachable = new Uint8Array(N);
  const queue = [idx(Math.floor(spawn.x), Math.floor(spawn.y))];
  reachable[queue[0]] = 1;
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

  // Plus rien de la clairière : ni eau (l'anneau d'eau des arènes à mares), ni herbe, ni fleurs.
  world.water.fill(0);
  world.tall.fill(0);
  world.hide.fill(0);
  world.patch.fill(0);
  world.face.fill(0);
  world.path.set(walk);
  world.inside.set(walk);
  world.blocked.set(blocked);
  world.solid.set(walk.map((v) => (v ? 0 : 1)));
  world.reachable.set(reachable);
  world.cliff = null;
  world.cliff2 = null;
  world.stairs = [];
  world.objects = objects;
  world.flat = [];
  world.lilies = [];
  world.fountains = [];
  world.lanes = undefined;
  world.berries = [];
  world.chest = null;
  world.cave = null;
  world.front = null;
  world.paving = paving;
  world.spawn = spawn;
  world.hub = { x: cc + 0.5, y: hy };
  world.entrySide = 'S';
  world.exits = findExits(W, H, reachable, world.water, 'S');
  world.layoutName = `Arène d'intérieur ${W}×${H}`;
}
