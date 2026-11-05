import { fbm } from '../core/noise';
import { Rng } from '../core/rng';
import { GROTTE } from './biomes';
import { cleanThin, smooth, useGrid, type WorldMap, type WorldObject } from './generate';
import { CAMP_PROPS, CAVE, CHEST, PROPS, TILE, type SpriteDef } from './tiles';

// Intérieur d'une grotte : un nouvel environnement, sans passer par
// generate(). Une salle se taille dans l'espace libre (on y pose des
// falaises, des arbres, de l'eau) ; une grotte se taille dans la roche
// pleine. On part donc d'un masque tout en roche et l'on y creuse des
// chambres reliées par des boyaux. Le reste réutilise les briques des
// salles, pour que le rendu, les collisions et le combat n'aient rien de
// neuf à apprendre :
// - la roche est un étage de falaise (`cliff` = 1), dessinée avec le massif
//   gris-brun du tileset (BLOB.caveRock) : bords, coins intérieurs et
//   ombre de paroi viennent de Renderer.bake tels quels ;
// - toute la roche bloque, même un dash (`blocked` et `solid`) : on ne
//   marche jamais sur le dessus d'une paroi de grotte ;
// - l'ambiance (biome GROTTE) met la nuit, et ce sont les torches et les
//   cristaux qui éclairent.
//
// Plan, du nord au sud : la sortie (bouche baignée de lumière, sur la paroi
// nord de la chambre d'entrée), un boyau vers l'arène du gardien au centre,
// et deux alcôves de part et d'autre — le prisonnier d'un côté, dans une
// cellule taillée dans la paroi nord et fermée d'une grille, le coffre de
// l'autre. Godot (CaveArena) faisait une arène unique de 32 × 22 bordée
// de deux cases de falaise.
// Écart voulu : un petit réseau de chambres plutôt qu'une seule arène, pour
// qu'on ait quelque chose à explorer — et les prisonniers à trouver.
// Agrandie (44 × 30 auparavant, retour de test) : l'arène doit laisser de
// la place pour esquiver les Poké Balls du sbire (run/capture.ts).

export const CAVE_W = 54;
export const CAVE_H = 36;

/** Points remarquables de la grotte, en cases (pied des Pokémon : y + 0,9). */
export interface CaveLayout {
  world: WorldMap;
  /** Bouche de sortie : case de paroi au centre du trou. */
  exit: { x: number; y: number };
  guardian: { x: number; y: number };
  /** Centre de l'arène et ses rayons : l'escorte apparaît dedans. */
  arena: { x: number; y: number; rx: number; ry: number };
  prisoners: { x: number; y: number }[];
  /**
   * La grille de la cellule : pied du sprite (x au centre, y sur la ligne de
   * sol, en cases) et les cases qu'elle bloque tant qu'elle est fermée
   * (indices de `blocked`/`solid`).
   */
  cell: { x: number; y: number; tiles: number[] };
  chest: { x: number; y: number };
}

type Pt = { x: number; y: number };

export function generateCave(seed: number): CaveLayout {
  const W = CAVE_W;
  const H = CAVE_H;
  useGrid(W, H);
  const N = W * H;
  const idx = (x: number, y: number) => y * W + x;
  const rng = new Rng(seed * 7477 + 3);
  const s = seed * 131;

  // 1) Les chambres : des ovales au bord bruité. L'entrée en haut, l'arène
  // au centre, les deux alcôves sur les flancs (le côté des prisonniers est tiré au sort).
  const cx = Math.round(W / 2 + rng.range(-5, 5));
  const entry = { x: cx, y: 7, rx: 5, ry: 3.4 };
  const arena = { x: W / 2 + rng.range(-3, 3), y: 21.5 + rng.range(-1, 1), rx: 12, ry: 7 };
  const left = rng.chance(0.5);
  const prison = { x: left ? 7.5 : W - 7.5, y: 27 + rng.range(-1, 2), rx: 4.5, ry: 3.2 };
  const vault = { x: left ? W - 7.5 : 7.5, y: 11 + rng.range(-1, 2), rx: 4, ry: 3 };
  const floor = new Uint8Array(N);
  const room = (c: { x: number; y: number; rx: number; ry: number }, salt: number) => {
    for (let y = 2; y < H - 2; y++) {
      for (let x = 2; x < W - 2; x++) {
        const d = Math.hypot((x + 0.5 - c.x) / c.rx, (y + 0.5 - c.y) / c.ry) + (fbm(x * 0.25, y * 0.25, s + salt) - 0.5) * 0.45;
        if (d < 1) floor[idx(x, y)] = 1;
      }
    }
  };
  room(entry, 11);
  room(arena, 13);
  room(prison, 17);
  room(vault, 19);

  // 2) Les boyaux : une ligne qui ondule (un sinus de phase tirée), 3 cases de large environ.
  const tunnel = (a: Pt, b: Pt) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const phase = rng.range(0, Math.PI * 2);
    const amp = rng.range(0.8, 2);
    for (let t = 0; t <= 1; t += 0.5 / len) {
      const wob = Math.sin(t * Math.PI * 2 + phase) * amp * Math.sin(t * Math.PI);
      const px = a.x + (b.x - a.x) * t + nx * wob;
      const py = a.y + (b.y - a.y) * t + ny * wob;
      const r = 1.5 + (fbm(px * 0.3, py * 0.3, s + 23) - 0.5) * 0.6;
      for (let y = Math.floor(py - r - 1); y <= Math.ceil(py + r + 1); y++) {
        for (let x = Math.floor(px - r - 1); x <= Math.ceil(px + r + 1); x++) {
          if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) continue;
          if (Math.hypot(x + 0.5 - px, y + 0.5 - py) <= r) floor[idx(x, y)] = 1;
        }
      }
    }
  };
  tunnel(entry, arena);
  tunnel(arena, prison);
  tunnel(arena, vault);

  // 3) Contours : un lissage, puis aucune langue de roche ni de sol d'une case
  // (le massif en blob ne sait pas dessiner une bande d'une case de large).
  const inner = (x: number, y: number) => x >= 2 && y >= 2 && x < W - 2 && y < H - 2;
  smooth(floor, 1, inner);
  cleanThin(floor, inner, 'grow');

  // 3 bis) La cellule du prisonnier : une niche de 3 × 2 cases creusée dans la
  // paroi nord de son alcôve, que la grille fermera. Le boyau de l'arène
  // longe souvent cette paroi : chercher un pan de roche assez épais ne
  // marchait qu'une fois sur deux. On la sculpte donc : au-dessus du sol le
  // plus haut de la colonne du centre, un bloc de roche de 7 × 4 cases (deux
  // cases tout autour de la niche, jamais de langue d'une case pour le blob)
  // et un mur droit devant (5 cases de sol), puis on refait le ménage des
  // bandes fines, sans toucher au bloc.
  const niche: Pt = { x: Math.round(prison.x - 0.5), y: Math.floor(prison.y) };
  while (niche.y > 6 && floor[idx(niche.x, niche.y - 1)]) niche.y--;
  const inBlock = (x: number, y: number) => Math.abs(x - niche.x) <= 3 && y >= niche.y - 4 && y < niche.y;
  // Le bloc a pu couper le boyau qui menait là : un boyau de plus, de l'arène
  // au pied de la grille (tracé avant le bloc, qui garde le dernier mot).
  tunnel(arena, { x: niche.x + 0.5, y: niche.y + 1.5 });
  for (let y = niche.y - 4; y < niche.y; y++) for (let x = niche.x - 3; x <= niche.x + 3; x++) floor[idx(x, y)] = 0;
  for (let dy = 1; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) floor[idx(niche.x + dx, niche.y - dy)] = 1;
  for (let dx = -2; dx <= 2; dx++) floor[idx(niche.x + dx, niche.y)] = 1;
  cleanThin(floor, (x, y) => inner(x, y) && !inBlock(x, y), 'grow');

  // 4) La sortie : trois cases de roche pleine au nord de la chambre d'entrée,
  // et deux de sol devant. On les force, le bruit a pu y mordre.
  let ey = Math.floor(entry.y);
  while (ey > 3 && floor[idx(cx, ey - 1)]) ey--;
  const exit = { x: cx, y: ey - 1 };
  // Le sol devant fait cinq cases de large : les deux torches qui encadrent le trou y tiennent toujours.
  for (let dx = -2; dx <= 2; dx++) {
    for (let y = 0; y <= exit.y; y++) floor[idx(cx + dx, y)] = 0;
    floor[idx(cx + dx, exit.y + 1)] = floor[idx(cx + dx, exit.y + 2)] = 1;
  }

  const rock = floor.map((v) => (v ? 0 : 1));
  const blocked = rock.slice();
  const solid = rock.slice();
  const objects: WorldObject[] = [];
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && !blocked[idx(x, y)];
  const nearRock = (x: number, y: number) => rock[idx(x + 1, y)] || rock[idx(x - 1, y)] || rock[idx(x, y + 1)] || rock[idx(x, y - 1)];
  /** Cases à garder libres : devant la sortie, autour des points de jeu. */
  const keep = new Uint8Array(N);
  const reserve = (p: Pt, r: number) => {
    for (let y = Math.floor(p.y - r); y <= Math.ceil(p.y + r); y++) {
      for (let x = Math.floor(p.x - r); x <= Math.ceil(p.x + r); x++) if (x >= 0 && y >= 0 && x < W && y < H) keep[idx(x, y)] = 1;
    }
  };
  const put = (sprite: SpriteDef, x: number, y: number) => {
    objects.push({ sprite, x: (x + 0.5) * TILE, y: (y + 1) * TILE, fades: false });
    if (sprite.trunk > 0) blocked[idx(x, y)] = 1;
  };

  objects.push({ sprite: CAVE.exit, x: (exit.x + 0.5) * TILE, y: (exit.y + 1) * TILE, fades: false });
  reserve({ x: exit.x, y: exit.y + 2 }, 1.5);

  /** La case libre la plus proche d'un point, hors cases réservées si possible. */
  const nearest = (p: Pt, avoidKeep = true): Pt => {
    let best: Pt = { x: Math.floor(p.x), y: Math.floor(p.y) };
    let bestD = Infinity;
    for (let y = 2; y < H - 2; y++) {
      for (let x = 2; x < W - 2; x++) {
        if (!free(x, y) || (avoidKeep && keep[idx(x, y)])) continue;
        const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y);
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    }
    return best;
  };

  // 5) Les points de jeu : le gardien au cœur de l'arène, le coffre au fond
  // de son alcôve (contre la paroi, comme rangé là), le prisonnier au fond de
  // sa cellule. Un seul : à deux, plus le gardien, on recrutait trois Pokémon
  // d'un coup par grotte (retour de test).
  const guardian = nearest(arena);
  reserve(guardian, 2);
  const chestAt = nearest({ x: vault.x + (left ? 1.5 : -1.5), y: vault.y - 0.5 });
  put(CHEST, chestAt.x, chestAt.y);
  reserve(chestAt, 1.2);
  // La grille ferme le rang avant de la niche.
  const prisoners: Pt[] = [{ x: niche.x, y: niche.y - 2 }];
  const bars = niche;
  for (const p of prisoners) reserve(p, 1.2);
  // Devant la grille, de quoi se tenir pour lui parler.
  reserve({ x: bars.x, y: bars.y }, 1);

  // 6) La lumière : deux torches qui encadrent la sortie, une près du coffre,
  // et quelques-unes contre les parois de l'arène.
  const torch = CAMP_PROPS.torch;
  for (const dx of [-2, 2]) {
    const x = exit.x + dx;
    const y = exit.y + 1;
    if (free(x, y)) put(torch, x, y);
  }
  const torchNear = (p: Pt) => {
    const at = nearest(p);
    if (!nearRock(at.x, at.y) || keep[idx(at.x, at.y)]) return;
    put(torch, at.x, at.y);
  };
  torchNear({ x: chestAt.x + (left ? -2 : 2), y: chestAt.y - 1 });
  // Une torche contre la paroi, à côté de la grille : on voit qui est derrière.
  torchNear({ x: bars.x + 2.5, y: bars.y + 0.5 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rng.range(-0.4, 0.4);
    torchNear({ x: arena.x + Math.cos(a) * (arena.rx + 1), y: arena.y + Math.sin(a) * (arena.ry + 1) });
  }

  // 7) Les cristaux, en grappes contre les parois (un champ de bruit choisit
  // les veines), un gros cristal dans un coin dégagé, et des rochers
  // seulement là où tout est dégagé sur 5 × 5 cases : jamais dans un boyau.
  // (Un gros cristal par grotte : deux mangeaient toute la place des rochers.)
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      const i = idx(x, y);
      if (!free(x, y) || keep[i] || !nearRock(x, y)) continue;
      const vein = fbm(x * 0.3, y * 0.3, s + 41);
      if (vein > 0.58 && rng.chance(0.5)) put(rng.pick(CAVE.shards), x, y);
      else if (rng.chance(0.03)) put(rng.pick(PROPS.mushrooms), x, y);
    }
  }
  const open5 = (x: number, y: number) => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (!free(x + dx, y + dy) || keep[idx(x + dx, y + dy)]) return false;
    return true;
  };
  let big = 0;
  let rocks = 0;
  for (let tries = 0; tries < 3000 && (big < 1 || rocks < 6); tries++) {
    const x = 3 + rng.int(W - 6);
    const y = 3 + rng.int(H - 6);
    if (!open5(x, y)) continue;
    if (big < 1) {
      put(CAVE.crystal, x, y);
      blocked[idx(x + 1, y)] = 1;
      big++;
    } else {
      const sp = rng.pick(CAVE.rocks);
      put(sp, x, y);
      if (sp.trunk >= 2) blocked[idx(x + 1, y)] = 1;
      rocks++;
    }
  }
  // Petits cailloux bleus au sol, çà et là : du relief sans gêner.
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      if (free(x, y) && !keep[idx(x, y)] && rng.chance(GROTTE.props[0].rate)) put(rng.pick(CAVE.pebbles), x, y);
    }
  }
  objects.sort((a, b) => a.y - b.y);

  // 8) Départ sous la sortie, et zone atteignable (4-voisinage) depuis là.
  const spawn = { x: exit.x + 0.5, y: exit.y + 2.9 };
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

  // La grille bloque (même un dash) une fois la zone atteignable calculée :
  // la cellule en fait partie, elle s'ouvrira (CaveDirector).
  const cellTiles: number[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    const x = bars.x + dx;
    const y = bars.y - 1;
    if (x < 0 || y < 0 || x >= W || y >= H || rock[idx(x, y)]) continue;
    cellTiles.push(idx(x, y));
    blocked[idx(x, y)] = solid[idx(x, y)] = 1;
  }

  const zero = () => new Uint8Array(N);
  const world: WorldMap = {
    w: W, h: H, biome: GROTTE, seed,
    inside: new Uint8Array(N).fill(1),
    path: zero(), patch: zero(), water: zero(), tall: zero(), hide: zero(),
    cliff: rock, cliff2: null, stairs: [], face: zero(),
    blocked, solid, reachable, objects, flat: [], lilies: [],
    spawn, entrySide: 'N', exits: [], hub: { x: arena.x, y: arena.y },
    paving: [], townStyle: null, townLayout: null, fountains: [], cave: null, front: null, layout: null, layoutName: null,
  };
  return {
    world,
    exit,
    guardian: { x: guardian.x + 0.5, y: guardian.y + 0.9 },
    arena,
    prisoners: prisoners.map((p) => ({ x: p.x + 0.5, y: p.y + 0.9 })),
    cell: { x: bars.x + 0.5, y: bars.y, tiles: cellTiles },
    chest: { x: chestAt.x + 0.5, y: chestAt.y + 0.9 },
  };
}
