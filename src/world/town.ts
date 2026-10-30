import type { Rng } from '../core/rng';
import { FLOWERS, LAMP, TILE, TOWN_DECOR, TREES, type SpriteDef, type Tile, type TownStyle } from './tiles';

// Génération d'un village : un plan rectangulaire (rues pavées à angle
// droit, une place centrale), le Centre Pokémon et la Boutique sur la place,
// des maisons d'une même famille alignées le long des rues, des allées de
// terre vers les maisons en retrait, des jardins clos et du mobilier urbain.
// Trois plans possibles, et des curiosités tirées au sort (fontaine, étang,
// champ de tournesols) : deux villages ne s'organisent pas pareil.

export interface Paving {
  mask: Uint8Array;
  tile: Tile;
}

/** Ce que generate() partage avec le village (mêmes tableaux, modifiés sur place). */
export interface TownContext {
  W: number;
  H: number;
  rng: Rng;
  style: TownStyle;
  inside: Uint8Array;
  path: Uint8Array;
  water: Uint8Array;
  blocked: Uint8Array;
  tall: Uint8Array;
  reserved: Uint8Array;
  objects: { sprite: SpriteDef; x: number; y: number; fades: boolean }[];
  flat: { tile: Tile; x: number; y: number }[];
  blockUnder: (sp: SpriteDef, px: number, py: number) => void;
  nearSpawn: (x: number, y: number) => boolean;
}

export interface TownPlan {
  layout: string;
  street: Uint8Array;
  plaza: Uint8Array;
  alley: Uint8Array;
  /** Carrefour central : sert de repère pour les chemins. */
  center: { x: number; y: number };
  plazaRect: { x0: number; y0: number; x1: number; y1: number };
  entryX: number;
  /** Fontaines (case haut-gauche d'un bassin de 4 × 3 cases). */
  fountains: { x: number; y: number }[];
}

export const FOUNTAIN_W = 4;
export const FOUNTAIN_H = 3;

/** Trace le plan des rues (étape 2 de generate) : rien n'y est encore construit. */
export function layoutStreets(W: number, H: number, rng: Rng): TownPlan {
  const N = W * H;
  const street = new Uint8Array(N);
  const plaza = new Uint8Array(N);
  const rect = (m: Uint8Array, x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) m[y * W + x] = 1;
  };
  const xc = 29 + rng.int(6);
  const ym = 21 + rng.int(4);
  const layouts = ['Croisée', 'Grand-rue', 'Boucle'] as const;
  const layout = layouts[rng.int(layouts.length)];
  // Toujours : la rue d'entrée, qui monte du bas de la carte.
  rect(street, xc - 1, ym, xc + 1, H - 1);

  if (layout === 'Croisée') {
    // Grand-rue nord-sud traversante, avenue est-ouest, rue du nord reliée par deux ruelles.
    rect(street, xc - 1, 2, xc + 1, ym);
    const west = rng.chance(0.5);
    rect(street, west ? 0 : 3, ym - 1, west ? W - 4 : W - 1, ym + 1);
    const y2 = 10 + rng.int(3);
    const half = 11 + rng.int(5);
    rect(street, xc - half, y2 - 1, xc + half, y2 + 1);
    rect(street, xc - half, y2, xc - half + 2, ym);
    rect(street, xc + half - 2, y2, xc + half, ym);
  } else if (layout === 'Grand-rue') {
    // Une seule longue avenue d'un bord à l'autre, et une rue arrière au nord, reliée par une ruelle.
    rect(street, 0, ym - 1, W - 1, ym + 1);
    const y2 = 9 + rng.int(3);
    const off = rng.chance(0.5) ? -14 : 12;
    rect(street, 6, y2 - 1, W - 7, y2 + 1);
    rect(street, xc + off, y2, xc + off + 2, ym);
  } else {
    // Boucle : une rue en rectangle autour du cœur du village, deux sorties est et ouest.
    const x0 = xc - 16;
    const x1 = xc + 16;
    const y0 = 8 + rng.int(3);
    rect(street, x0, y0, x1, y0 + 2);
    rect(street, x0, ym - 1, x1, ym + 1);
    rect(street, x0, y0, x0 + 2, ym + 1);
    rect(street, x1 - 2, y0, x1, ym + 1);
    rect(street, 0, y0 + 6, x0, y0 + 8);
    rect(street, x1, ym - 6, W - 1, ym - 4);
  }

  // Place : un rectangle au nord du carrefour, bordé au sud par l'avenue.
  const plazaRect = { x0: xc - 6, y0: ym - 7, x1: xc + 6, y1: ym - 2 };
  rect(plaza, plazaRect.x0, plazaRect.y0, plazaRect.x1, plazaRect.y1);
  for (let i = 0; i < N; i++) if (plaza[i]) street[i] = 0;
  const fountains = rng.chance(0.65) ? [{ x: xc - 2, y: plazaRect.y0 + 2 }] : [];
  return { layout, street, plaza, alley: new Uint8Array(N), center: { x: xc, y: ym }, plazaRect, entryX: xc, fountains };
}

/** Bâtit le village (étape 6b de generate), une fois l'eau et les cases bloquées connues. */
export function furnishTown(ctx: TownContext, plan: TownPlan, houseCount: number): void {
  const { W, H, rng, style, inside, path, water, blocked, tall, reserved, objects } = ctx;
  const idx = (x: number, y: number) => y * W + x;
  const paved = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && (plan.street[idx(x, y)] || plan.plaza[idx(x, y)]) === 1;
  const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const houses: { sp: SpriteDef; px: number; py: number; cx: number; cy: number }[] = [];
  const free = (x: number, y: number) =>
    x > 0 && y > 0 && x < W - 1 && y < H - 1 && inside[idx(x, y)] && !blocked[idx(x, y)] && !path[idx(x, y)] && !water[idx(x, y)] && !reserved[idx(x, y)];
  const freeRect = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (!free(x, y)) return false;
    return true;
  };
  const reserve = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x >= 0 && y >= 0 && x < W && y < H) reserved[idx(x, y)] = 1;
  };
  /** Pose un décor sur une case (ou plusieurs s'il est large) et bloque ses cases. */
  const decor = (sp: SpriteDef, cx: number, cy: number) => {
    const wCells = Math.max(1, Math.ceil(sp.rect[2] / TILE));
    for (let x = cx; x < cx + wCells; x++) if (blocked[idx(x, cy)]) return false;
    objects.push({ sprite: sp, x: cx * TILE + (wCells * TILE) / 2, y: (cy + 1) * TILE - 1, fades: false });
    for (let x = cx; x < cx + wCells; x++) blocked[idx(x, cy)] = 1;
    return true;
  };

  /** Pose un bâtiment dont la porte tombe à la jonction des cases cx et cx+1, sur la rangée cy. */
  const tryPlace = (sp: SpriteDef, cx: number, cy: number) => {
    const [, , w] = sp.rect;
    const px = Math.round((cx + 1) * TILE - (sp.door ?? w / 2) + w / 2);
    const py = (cy + 1) * TILE - 2;
    // Marge de 14 px : place pour un jardin, une haie ou un panneau entre deux maisons.
    const box = { x0: px - w / 2 - 14, y0: py - sp.foot - 4, x1: px + w / 2 + 14, y1: py + 6 };
    if (box.y0 < 0 || boxes.some((f) => box.x0 < f.x1 && f.x0 < box.x1 && box.y0 < f.y1 && f.y0 < box.y1)) return false;
    const half = (sp.trunk * TILE) / 2;
    if (ctx.nearSpawn(cx, cy)) return false;
    for (let y = Math.floor((py - (sp.depth ?? 40)) / TILE); y <= cy; y++) {
      for (let x = Math.floor((px - half) / TILE); x <= Math.floor((px + half - 1) / TILE); x++) if (!free(x, y)) return false;
    }
    boxes.push(box);
    objects.push({ sprite: sp, x: px, y: py, fades: true });
    ctx.blockUnder(sp, px, py);
    houses.push({ sp, px, py, cx, cy });
    return true;
  };

  // 1) Centre Pokémon et Boutique sur le bord nord de la place, porte sur la place.
  const { x0, y0, x1, y1 } = plan.plazaRect;
  tryPlace(style.center, plan.center.x - 4, y0 - 1) || tryPlace(style.center, plan.center.x - 5, y0 - 1);
  tryPlace(style.mart, plan.center.x + 3, y0 - 1) || tryPlace(style.mart, plan.center.x + 4, y0 - 1);

  // 2) La place : une fontaine (dessinée au rendu) ou une statue, des bancs et des bacs fleuris.
  //    Rien sur la rangée du haut : c'est là que s'ouvrent les portes du Centre et de la Boutique.
  for (const f of plan.fountains) {
    for (let y = f.y; y < f.y + FOUNTAIN_H; y++) for (let x = f.x; x < f.x + FOUNTAIN_W; x++) blocked[idx(x, y)] = 1;
  }
  if (!plan.fountains.length) decor(TOWN_DECOR.statue, plan.center.x - 1, y0 + 3);
  decor(TOWN_DECOR.bench, x0 + 1, y1 - 1);
  decor(TOWN_DECOR.bench, x1 - 3, y1 - 1);
  flowerPlanter(ctx, x0, y0 + 2);
  flowerPlanter(ctx, x1 - 2, y0 + 2);

  // Grand panneau à l'entrée du village, au bord de la rue d'entrée.
  for (const dx of [-3, 2]) {
    const sx = plan.entryX + dx;
    if (freeRect(sx, H - 6, 2, 2)) {
      decor(TOWN_DECOR.townSign, sx, H - 5);
      break;
    }
  }

  // 3) Curiosités tirées au sort (avant les maisons, qui s'organisent autour).
  if (rng.chance(0.5)) smallPond(ctx, freeRect);
  if (rng.chance(0.45)) sunflowerField(ctx, freeRect, reserve);

  // 4) Maisons : ~60 % en façade sur une rue, le reste en retrait avec une allée de terre.
  const front: [number, number][] = [];
  const back: [number, number][] = [];
  for (let cy = 3; cy < H - 3; cy++) {
    for (let cx = 2; cx < W - 3; cx++) {
      if (paved(cx, cy) || paved(cx + 1, cy)) continue;
      if (paved(cx, cy + 1) && paved(cx + 1, cy + 1)) front.push([cx, cy]);
      else if (paved(cx, cy + 3) || paved(cx, cy + 4) || paved(cx, cy + 5)) back.push([cx, cy]);
    }
  }
  const shuffle = <T,>(a: T[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const target = houseCount + 2;
  const frontTarget = 2 + Math.round(houseCount * 0.6);
  for (const [cx, cy] of shuffle(front)) {
    if (houses.length >= frontTarget) break;
    tryPlace(rng.pick(style.houses), cx, cy);
  }
  for (const [cx, cy] of shuffle(back)) {
    if (houses.length >= target) break;
    if (!tryPlace(rng.pick(style.houses), cx, cy)) continue;
    carveAlley(ctx, plan, cx, cy + 1);
  }
  // Pas assez de places en retrait : on complète en façade.
  for (const [cx, cy] of front) {
    if (houses.length >= target) break;
    tryPlace(rng.pick(style.houses), cx, cy);
  }

  // 5) Jardins clos à côté d'une maison sur deux.
  for (const h of houses) {
    if (h.sp === style.center || h.sp === style.mart || !rng.chance(0.55)) continue;
    const [, , w] = h.sp.rect;
    const gw = 4 + rng.int(3);
    const right = Math.ceil((h.px + w / 2 - 12) / TILE) + 1;
    const left = Math.floor((h.px - w / 2 + 12) / TILE) - gw - 1;
    for (const gx of [right, left]) {
      if (!freeRect(gx, h.cy - 3, gw, 4)) continue;
      buildGarden(ctx, gx, h.cy - 3, gw, 4);
      break;
    }
  }

  // 6) Devant les maisons : petit panneau, puis bac fleuri, pot ou massif.
  for (const h of houses) {
    if (h.sp === style.center || h.sp === style.mart) continue;
    const [, , w] = h.sp.rect;
    const side = Math.floor((h.px - w / 2) / TILE) - 1;
    if (free(side, h.cy) && rng.chance(0.6)) {
      decor(TOWN_DECOR.sign, side, h.cy);
      reserve(side, h.cy, 1, 1);
    }
    const other = Math.ceil((h.px + w / 2 - 12) / TILE);
    if (freeRect(other, h.cy, 3, 1) && rng.chance(0.35)) {
      flowerPlanter(ctx, other, h.cy);
    } else if (free(other, h.cy) && rng.chance(0.5)) {
      decor(rng.chance(0.5) ? rng.pick(TOWN_DECOR.pots) : rng.pick(TOWN_DECOR.bushes), other, h.cy);
      reserve(other, h.cy, 1, 1);
    }
  }

  // 7) Lampadaires au bord des rues, espacés d'au moins 8 cases.
  const lamps: [number, number][] = [];
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      if (!paved(x, y + 1) || !free(x, y) || !free(x, y - 1) || !free(x, y - 2)) continue;
      if (lamps.some(([lx, ly]) => Math.hypot(lx - x, ly - y) < 8) || !rng.chance(0.25)) continue;
      lamps.push([x, y]);
      objects.push({ sprite: LAMP, x: x * TILE + TILE / 2, y: (y + 1) * TILE - 1, fades: false });
      blocked[idx(x, y)] = 1;
      reserve(x, y - 2, 1, 3);
    }
  }

  // 8) Petits arbres d'ornement le long des rues.
  for (let n = 0, tries = 0; n < 10 && tries < 400; tries++) {
    const x = 2 + rng.int(W - 4);
    const y = 3 + rng.int(H - 5);
    if (!freeRect(x - 1, y - 1, 3, 2)) continue;
    if (!paved(x, y + 2) && !paved(x, y + 1)) continue;
    const tree = rng.pick(TREES.small);
    objects.push({ sprite: tree, x: x * TILE + TILE / 2, y: (y + 1) * TILE - 2, fades: true });
    ctx.blockUnder(tree, x * TILE + TILE / 2, (y + 1) * TILE - 2);
    reserve(x - 1, y - 1, 3, 2);
    n++;
  }

  for (let i = 0; i < W * H; i++) {
    if (plan.street[i] || plan.plaza[i] || plan.alley[i]) {
      path[i] = 1;
      tall[i] = 0;
    }
  }
}

/** Bac fleuri : le bac vide du tileset, garni de trois de nos fleurs. */
function flowerPlanter(ctx: TownContext, cx: number, cy: number): void {
  const { W, rng, blocked, reserved, objects } = ctx;
  for (let x = cx; x < cx + 3; x++) if (blocked[cy * W + x]) return;
  const base = TOWN_DECOR.planterEmpty;
  const by = (cy + 1) * TILE - 1;
  objects.push({ sprite: base, x: cx * TILE + 24, y: by, fades: false });
  const tile = rng.pick(FLOWERS);
  for (let i = 0; i < 3; i++) {
    // Les fleurs sortent du terreau : dessinées 7 px plus haut, triées juste après le bac.
    objects.push({ sprite: { rect: [tile[0] * TILE, tile[1] * TILE, TILE, TILE], foot: TILE + 6, trunk: 0 }, x: cx * TILE + 8 + i * 15, y: by + 0.01, fades: false });
  }
  for (let x = cx; x < cx + 3; x++) {
    blocked[cy * W + x] = 1;
    reserved[cy * W + x] = 1;
  }
}

/** Petit étang aux bords arrondis (5 × 4 cases), dans un coin libre du village. */
function smallPond(ctx: TownContext, freeRect: (x: number, y: number, w: number, h: number) => boolean): void {
  const { W, H, rng, water, reserved } = ctx;
  for (let tries = 0; tries < 200; tries++) {
    const x0 = 3 + rng.int(W - 12);
    const y0 = 4 + rng.int(H - 12);
    // Une case de marge tout autour, pour la berge et le passage.
    if (!freeRect(x0 - 1, y0 - 1, 7, 6)) continue;
    for (let y = y0; y < y0 + 4; y++) {
      for (let x = x0; x < x0 + 5; x++) {
        const corner = (x === x0 || x === x0 + 4) && (y === y0 || y === y0 + 3);
        if (!corner) water[y * W + x] = 1;
      }
    }
    for (let y = y0 - 1; y < y0 + 5; y++) for (let x = x0 - 1; x < x0 + 6; x++) reserved[y * W + x] = 1;
    return;
  }
}

/** Champ de tournesols : quelques massifs serrés en rangées, sur un coin libre. */
function sunflowerField(
  ctx: TownContext,
  freeRect: (x: number, y: number, w: number, h: number) => boolean,
  reserve: (x: number, y: number, w: number, h: number) => void,
): void {
  const { W, H, rng, blocked, objects } = ctx;
  const cols = 2 + rng.int(2);
  const rows = 2;
  const w = cols * 3;
  const h = rows * 3;
  for (let tries = 0; tries < 200; tries++) {
    const x0 = 2 + rng.int(W - w - 4);
    const y0 = 3 + rng.int(H - h - 6);
    if (!freeRect(x0 - 1, y0 - 1, w + 2, h + 2)) continue;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        objects.push({ sprite: TOWN_DECOR.sunflowers, x: (x0 + c * 3) * TILE + 24, y: (y0 + r * 3 + 3) * TILE - 1, fades: true });
      }
    }
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) blocked[y * W + x] = 1;
    reserve(x0 - 1, y0 - 1, w + 2, h + 2);
    return;
  }
}

/** Allée de terre d'une case de large, plus court chemin (4-voisinage) vers une rue. */
function carveAlley(ctx: TownContext, plan: TownPlan, sx: number, sy: number): void {
  const { W, H, inside, blocked, water } = ctx;
  const idx = (x: number, y: number) => y * W + x;
  const prev = new Int32Array(W * H).fill(-1);
  const start = idx(sx, sy);
  prev[start] = start;
  const queue = [start];
  let goal = -1;
  for (let q = 0; q < queue.length && goal < 0; q++) {
    const i = queue[q];
    if (plan.street[i] || plan.plaza[i]) {
      goal = i;
      break;
    }
    const x = i % W;
    const y = (i / W) | 0;
    // Le sud d'abord : l'allée descend de la porte avant de tourner.
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
      const j = idx(nx, ny);
      if (prev[j] >= 0 || !inside[j] || water[j] || (blocked[j] && !plan.street[j] && !plan.plaza[j])) continue;
      prev[j] = i;
      queue.push(j);
    }
  }
  if (goal < 0) return;
  for (let i = prev[goal]; i !== start && i >= 0; i = prev[i]) plan.alley[i] = 1;
  plan.alley[start] = 1;
}

/** Enclos fleuri : clôture en cadre, une rangée de fleurs, une rangée de tournesols ou d'hortensias. */
function buildGarden(ctx: TownContext, gx: number, gy: number, gw: number, gh: number): void {
  const { W, rng, style, blocked, reserved, objects, flat } = ctx;
  const idx = (x: number, y: number) => y * W + x;
  const [fc, fr] = style.fence.origin;
  for (let y = gy; y < gy + gh; y++) {
    for (let x = gx; x < gx + gw; x++) {
      reserved[idx(x, y)] = 1;
      const col = x === gx ? 0 : x === gx + gw - 1 ? 2 : 1;
      const row = y === gy ? 0 : y === gy + gh - 1 ? 2 : 1;
      if (col === 1 && row === 1) continue;
      objects.push({
        sprite: { rect: [(fc + col) * TILE, (fr + row) * TILE, TILE, TILE], foot: TILE - 1, trunk: 1 },
        x: x * TILE + TILE / 2,
        y: (y + 1) * TILE - 1,
        fades: false,
      });
      blocked[idx(x, y)] = 1;
    }
  }
  // Intérieur : une rangée de fleurs, puis tournesols (un par case) ou hortensias.
  const tile = rng.pick(FLOWERS);
  for (let x = gx + 1; x < gx + gw - 1; x++) flat.push({ tile, x, y: gy + 1 });
  const inner = gw - 2;
  if (inner >= 3 && rng.chance(0.4)) {
    const sp = rng.pick(TOWN_DECOR.hydrangeas);
    objects.push({ sprite: sp, x: (gx + 1) * TILE + sp.rect[2] / 2, y: (gy + gh - 1) * TILE - 1, fades: false });
  } else {
    for (let x = gx + 1; x < gx + gw - 1; x++) {
      objects.push({ sprite: TOWN_DECOR.sunflower, x: x * TILE + TILE / 2, y: (gy + gh - 1) * TILE - 1, fades: false });
    }
  }
  for (let x = gx + 1; x < gx + gw - 1; x++) for (let y = gy + 1; y < gy + gh - 1; y++) blocked[idx(x, y)] = 1;
}
