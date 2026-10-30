import type { Actor } from '../entities/actor';
import type { WorldMap } from '../world/generate';
import { FIELD_FX, TILE } from '../world/tiles';

// Effets de terrain des jeux Pokémon (planche Essentials « Overworld dust
// and grass ») : l'herbe gicle à chaque nouvelle case d'herbe foulée, la
// poussière s'élève pendant un dash sur sol nu.

const FRAME_TIME = 0.09;

interface Fx {
  x: number;
  y: number;
  frames: readonly number[];
  age: number;
}

export class FieldFx {
  private items: Fx[] = [];
  private readonly lastCell = new WeakMap<Actor, number>();
  private readonly dustClock = new WeakMap<Actor, number>();

  /** Nuage de poussière ponctuel (un dash qui heurte un mur). */
  puff(x: number, y: number): void {
    this.items.push({ x, y, frames: FIELD_FX.dust, age: 0 });
  }
  private grassCells = new Set<number>();
  private grassWorld: WorldMap | null = null;

  reset(): void {
    this.items = [];
  }

  /** Cases occupées par une touffe ou un roseau (recalculé à chaque nouvelle carte). */
  private refreshGrass(world: WorldMap): void {
    if (this.grassWorld === world) return;
    this.grassWorld = world;
    this.grassCells = new Set(
      world.objects.filter((o) => o.sprite.grass).map((o) => Math.floor((o.y - 1) / TILE) * world.w + Math.floor(o.x / TILE)),
    );
  }

  update(dt: number, actors: readonly Actor[], world: WorldMap): void {
    this.refreshGrass(world);
    for (const fx of this.items) fx.age += dt;
    this.items = this.items.filter((fx) => fx.age < fx.frames.length * FRAME_TIME);

    for (const a of actors) {
      if (!a.sheet) continue;
      const cx = Math.floor(a.x);
      const cy = Math.floor(a.y - 0.1);
      if (cx < 0 || cy < 0 || cx >= world.w || cy >= world.h) continue;
      const cell = cy * world.w + cx;
      const inGrass = world.tall[cell] === 1 || this.grassCells.has(cell);
      if (this.lastCell.get(a) !== cell) {
        this.lastCell.set(a, cell);
        if (inGrass) this.items.push({ x: cx + 0.5, y: cy + 1, frames: FIELD_FX.grass, age: 0 });
      }
      // Poussière : seulement pendant un dash, au sol nu, un nuage toutes les 0,08 s.
      if (a.dashT > 0 && !inGrass && !world.water[cell]) {
        const t = (this.dustClock.get(a) ?? 0) - dt;
        if (t <= 0) {
          this.items.push({ x: a.x, y: a.y, frames: FIELD_FX.dust, age: 0 });
          this.dustClock.set(a, 0.08);
        } else {
          this.dustClock.set(a, t);
        }
      }
    }
  }

  /** La planche est dessinée en ×2 : chaque case de 192 px est réduite de moitié. */
  draw(ctx: CanvasRenderingContext2D, sheet: CanvasImageSource, camX: number, camY: number, k: number): void {
    const C = FIELD_FX.cell;
    const half = C / 2;
    for (const fx of this.items) {
      const f = fx.frames[Math.min(fx.frames.length - 1, Math.floor(fx.age / FRAME_TIME))];
      const sx = (f % FIELD_FX.cols) * C;
      const sy = Math.floor(f / FIELD_FX.cols) * C;
      // Le motif est centré dans sa case : on cale ce centre sur les pieds.
      const dx = Math.round((fx.x * TILE - half / 2 - camX) * k);
      const dy = Math.round((fx.y * TILE - half / 2 - 6 - camY) * k);
      ctx.drawImage(sheet, sx, sy, C, C, dx, dy, half * k, half * k);
    }
  }
}
