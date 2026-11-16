import type { WorldMap, WorldObject } from '../world/generate';
import { TILE, type SpriteDef } from '../world/tiles';

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

  /**
   * Dégage un rectangle de cases (coin haut-gauche, taille) pour y poser un décor de salle
   * spéciale : les rochers, arbres et buissons de la salle dont le pied y tombe (ou juste
   * dessous : leur sprite monterait dessus) et les fleurs s'en vont, les cases se libèrent,
   * l'herbe haute est fauchée. L'eau et les falaises restent.
   */
  clearArea(x0: number, y0: number, w: number, h: number): void {
    const world = this.world;
    const inRect = (x: number, y: number, pad: number) => x >= x0 - 1 && x < x0 + w + 1 && y >= y0 && y < y0 + h + pad;
    for (let i = world.objects.length - 1; i >= 0; i--) {
      const o = world.objects[i];
      if (inRect(Math.floor(o.x / TILE), Math.floor(o.y / TILE), 2)) world.objects.splice(i, 1);
    }
    // Les fleurs posées à plat aussi (elles restaient sur le dallage de l'Autel), les arbres à baies
    // (un a poussé sur le tatami du Dojo) et le coffre : la salle les relit ensuite (main.ts).
    world.flat = world.flat.filter((f) => !inRect(f.x, f.y, 0));
    if (world.berries) world.berries = world.berries.filter((b) => !inRect(Math.floor(b.x), Math.floor(b.y), 2));
    if (world.chest && inRect(Math.floor(world.chest.x), Math.floor(world.chest.y), 2)) world.chest = null;
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        if (x < 0 || y < 0 || x >= world.w || y >= world.h) continue;
        const i = y * world.w + x;
        if (!world.inside[i] || world.water[i] || world.cliff?.[i]) continue;
        world.blocked[i] = world.solid[i] = world.tall[i] = 0;
      }
  }

  /**
   * Pose un objet du décor (`x` : son milieu, `y` : la rangée où il touche le sol, en cases),
   * comme le Repaire (camp.ts, put) : il barre les cases de son pied, sur sa largeur et sa
   * profondeur ; un gros (trois cases et plus) ne se traverse pas même en dash. Rend l'objet.
   */
  prop(sprite: SpriteDef, x: number, y: number, blocks = true): WorldObject {
    const world = this.world;
    const o: WorldObject = { sprite, x: Math.round(x * TILE), y: Math.round(y * TILE), fades: false };
    world.objects.push(o);
    this.take({ x, y });
    if (!blocks || sprite.trunk <= 0) return o;
    const rows = Math.max(1, Math.ceil((sprite.depth ?? 6) / TILE));
    const row = Math.floor(y - 0.05);
    for (let ry = row - rows + 1; ry <= row; ry++) {
      for (let cx = Math.floor(x - sprite.trunk / 2 + 0.1); cx <= Math.floor(x + sprite.trunk / 2 - 0.1); cx++) {
        this.block(cx, ry);
        if (sprite.trunk >= 3 && cx >= 0 && ry >= 0 && cx < world.w && ry < world.h) world.solid[ry * world.w + cx] = 1;
      }
    }
    return o;
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
