import type { WorldMap } from '../world/generate';
import { TILE } from '../world/tiles';

// Où poser les Pokémon d'une place (boutique, Repaire) : sur une case libre,
// à pied, hors de l'eau, que personne n'occupe déjà, et que rien ne cache — un
// arbre ou un rocher plus bas à l'écran se dessinerait par-dessus.

export type Spot = { x: number; y: number };

export class Placer {
  /** Cases déjà prises : deux Pokémon ne se posent pas l'un sur l'autre. */
  private taken: Spot[] = [];

  constructor(private readonly world: WorldMap) {}

  /** Réserve un point (un accessoire posé à la main). */
  take(at: Spot): void {
    this.taken.push(at);
  }

  /** Un Pokémon ou un accessoire est-il déjà posé à moins de `r` cases ? */
  occupied(at: Spot, r = 1.5): boolean {
    return this.taken.some((t) => Math.hypot(t.x - at.x, t.y - at.y) < r);
  }

  block(x: number, y: number): void {
    const w = this.world;
    if (x >= 0 && y >= 0 && x < w.w && y < w.h) w.blocked[y * w.w + x] = 1;
  }

  /** Case où poser un Pokémon de la place : libre, à pied, sur la terre, inoccupée, et visible si `view`. */
  private ok(cx: number, cy: number, view: boolean): boolean {
    const world = this.world;
    if (cx < 2 || cy < 2 || cx >= world.w - 2 || cy >= world.h - 2) return false;
    const i = cy * world.w + cx;
    if (world.blocked[i] || world.water[i] || !world.reachable[i]) return false;
    const at = { x: cx + 0.5, y: cy + 0.9 };
    if (this.taken.some((t) => Math.hypot(t.x - at.x, t.y - at.y) < 1.5)) return false;
    return !view || this.inView(at.x, at.y);
  }

  /**
   * Case libre la plus proche d'un point voulu, que rien ne cache et qu'aucun
   * autre Pokémon de la place n'occupe déjà. À défaut, la plus proche libre.
   * `viewReach` : jusqu'où chercher une case visible avant d'accepter la plus
   * proche, même cachée (un gardien reste à son poste).
   */
  freeSpot(x: number, y: number, viewReach = 9): Spot {
    for (const view of [true, false]) {
      for (let r = 0; r < (view ? viewReach : 9); r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !this.ok(x + dx, y + dy, view)) continue;
            const at = { x: x + dx + 0.5, y: y + dy + 0.9 };
            this.taken.push(at);
            return at;
          }
        }
      }
    }
    return { x: x + 0.5, y: y + 0.9 };
  }

  /**
   * Deux cases sur la même ligne, à `gap` cases l'une de l'autre, toutes deux
   * libres et visibles : un mercenaire et son mannequin, deux Pokémon qui se
   * parlent face à face. `side` : côté préféré de la seconde (1 à droite).
   */
  pairSpot(x: number, y: number, gap: number, side: 1 | -1): { a: Spot; b: Spot } {
    for (const view of [true, false]) {
      for (let r = 0; r < 9; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const cx = x + dx;
            const cy = y + dy;
            for (const sd of [side, -side]) {
              if (!this.ok(cx, cy, view) || !this.ok(cx + sd * gap, cy, view)) continue;
              const a = { x: cx + 0.5, y: cy + 0.9 };
              const b = { x: cx + sd * gap + 0.5, y: cy + 0.9 };
              this.taken.push(a, b);
              return { a, b };
            }
          }
        }
      }
    }
    return { a: this.freeSpot(x, y), b: this.freeSpot(x + side * gap, y) };
  }

  /** Rien de plus bas à l'écran ne recouvre ce qui se tient en (x, y) (un Pokémon ou un panneau, ~2 × 2,2 cases). */
  private inView(x: number, y: number): boolean {
    const px = x * TILE;
    const py = y * TILE;
    for (const o of this.world.objects) {
      if (o.y <= py) continue;
      const [, , w, h] = o.sprite.rect;
      const left = o.x - w / 2;
      const top = o.y - o.sprite.foot;
      if (px + 15 > left && px - 15 < left + w && py > top && py - 36 < top + h) return false;
    }
    return true;
  }
}
