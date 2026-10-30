import type { WorldMap } from '../world/generate';

// Navigation des ennemis, reprise de NavAgent.gd : vue dégagée → ligne
// droite vers la cible ; sinon chemin A* sur la grille des cases (8
// directions, diagonale seulement si les deux cases voisines sont libres),
// recalculé toutes les 0,6 s ou quand la cible a bougé de plus de 1,5 case.
// La vue ne se teste que sur la grille : il n'y a pas de rayons physiques
// ici, donc ni les autres Pokémon ni la cible ne bouchent la vue (le jeu
// les touchait probablement, cf. NavAgent.gd:116).

const SIGHT_EVERY = 0.15;
const REPATH_EVERY = 0.6;
const REPATH_MOVE = 1.5;
const WAYPOINT_REACHED = 0.55;

/** Case franchissable pour ce Pokémon : ni obstacle, ni eau s'il ne nage pas. */
function walkable(world: WorldMap, x: number, y: number, swims: boolean): boolean {
  if (x < 0 || y < 0 || x >= world.w || y >= world.h) return false;
  const i = y * world.w + x;
  return !world.blocked[i] && (swims || !world.water[i]);
}

/** Segment libre, échantillonné à la demi-case (MapBase.is_segment_clear). */
export function segmentClear(world: WorldMap, x0: number, y0: number, x1: number, y1: number, swims: boolean): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    if (!walkable(world, Math.floor(x0 + (x1 - x0) * t), Math.floor(y0 + (y1 - y0) * t), swims)) return false;
  }
  return true;
}

/** A* octile ; rend les centres des cases du chemin (départ exclu), ou [] s'il n'y en a pas. */
export function findPath(world: WorldMap, fx: number, fy: number, tx: number, ty: number, swims: boolean): { x: number; y: number }[] {
  const W = world.w;
  // Les extrémités sont ramenées sur une case libre voisine (NavAgent : bornes recalées).
  const snap = (x: number, y: number): [number, number] | null => {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    for (let r = 0; r <= 2; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (walkable(world, cx + dx, cy + dy, swims)) return [cx + dx, cy + dy];
        }
      }
    }
    return null;
  };
  const a = snap(fx, fy);
  const b = snap(tx, ty);
  if (!a || !b) return [];
  const start = a[1] * W + a[0];
  const goal = b[1] * W + b[0];
  const g = new Float32Array(W * world.h).fill(Infinity);
  const from = new Int32Array(W * world.h).fill(-1);
  const closed = new Uint8Array(W * world.h);
  const h = (i: number) => {
    const dx = Math.abs((i % W) - b[0]);
    const dy = Math.abs(Math.floor(i / W) - b[1]);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  // Tas binaire minimal sur f = g + h.
  const heap: [number, number][] = [];
  const push = (f: number, i: number) => {
    heap.push([f, i]);
    let n = heap.length - 1;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (heap[p][0] <= heap[n][0]) break;
      [heap[p], heap[n]] = [heap[n], heap[p]];
      n = p;
    }
  };
  const pop = (): number => {
    const top = heap[0][1];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let n = 0;
      for (;;) {
        const l = n * 2 + 1;
        const r = l + 1;
        let m = n;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === n) break;
        [heap[m], heap[n]] = [heap[n], heap[m]];
        n = m;
      }
    }
    return top;
  };
  g[start] = 0;
  push(h(start), start);
  while (heap.length) {
    const cur = pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % W;
    const cy = Math.floor(cur / W);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!walkable(world, nx, ny, swims)) continue;
        // Diagonale : seulement si on ne rogne pas un coin d'obstacle.
        if (dx && dy && (!walkable(world, cx + dx, cy, swims) || !walkable(world, cx, cy + dy, swims))) continue;
        const n = ny * W + nx;
        const cost = g[cur] + (dx && dy ? Math.SQRT2 : 1);
        if (cost < g[n]) {
          g[n] = cost;
          from[n] = cur;
          push(cost + h(n), n);
        }
      }
    }
  }
  if (from[goal] < 0 && goal !== start) return [];
  const path: { x: number; y: number }[] = [];
  for (let i = goal; i !== start && i >= 0; i = from[i]) path.push({ x: (i % W) + 0.5, y: Math.floor(i / W) + 0.75 });
  return path.reverse();
}

/** État de navigation d'un ennemi (NavAgent.gd). */
export class NavAgent {
  private sightT = 0;
  private clear = true;
  private pathT = 0;
  private path: { x: number; y: number }[] = [];
  private pathTo = { x: Infinity, y: Infinity };

  reset(): void {
    this.path = [];
    this.pathT = 0;
    this.sightT = 0;
  }

  /** Direction unitaire à suivre de (x, y) vers (tx, ty). */
  direction(dt: number, world: WorldMap, x: number, y: number, tx: number, ty: number, swims: boolean): { x: number; y: number } {
    this.sightT -= dt;
    this.pathT -= dt;
    if (this.sightT <= 0) {
      this.sightT = SIGHT_EVERY;
      // Le segment part un peu au-dessus des pieds, au milieu de la boîte au sol.
      this.clear = segmentClear(world, x, y - 0.25, tx, ty - 0.25, swims);
    }
    let gx = tx;
    let gy = ty;
    if (!this.clear) {
      if (this.pathT <= 0 || Math.hypot(tx - this.pathTo.x, ty - this.pathTo.y) > REPATH_MOVE) {
        this.path = findPath(world, x, y - 0.25, tx, ty - 0.25, swims);
        this.pathT = REPATH_EVERY;
        this.pathTo = { x: tx, y: ty };
      }
      while (this.path.length && Math.hypot(this.path[0].x - x, this.path[0].y - y) < WAYPOINT_REACHED) this.path.shift();
      // Chemin vide : ligne droite, comme le jeu.
      if (this.path.length) {
        gx = this.path[0].x;
        gy = this.path[0].y;
      }
    }
    const len = Math.hypot(gx - x, gy - y) || 1;
    return { x: (gx - x) / len, y: (gy - y) / len };
  }
}
