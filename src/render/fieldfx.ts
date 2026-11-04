import type { Actor } from '../entities/actor';
import type { WorldMap } from '../world/generate';
import { FIELD_FX, TILE } from '../world/tiles';

// Effets de terrain des jeux Pokémon (planche Essentials « Overworld dust
// and grass ») : l'herbe gicle à chaque nouvelle case d'herbe foulée, la
// poussière s'élève pendant un dash sur sol nu.
//
// Ajout (retour de test : « une animation sur la glissade ») : sur la glace
// de la Montagne glacée, la glissade laisse deux traces de patin qui
// s'effacent et soulève des éclats de glace qui retombent en scintillant
// (dessinés à la main : la planche n'a rien pour la glace).

const FRAME_TIME = 0.09;

interface Fx {
  x: number;
  y: number;
  frames: readonly number[];
  age: number;
}

/** Un éclat de glace : position au sol (cases), hauteur (px), vitesses, âge et durée de vie (s). */
interface Spark {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
}

/** Durée (s) d'une trace de patin, d'un éclat. */
const MARK_LIFE = 0.6;
const SPARK_LIFE = 0.45;

export class FieldFx {
  private items: Fx[] = [];
  private sparks: Spark[] = [];
  /** Les traces de patin : un point par pas de 2 px, sous chaque pied. */
  private marks: { x: number; y: number; age: number }[] = [];
  private lastSlide = new WeakMap<Actor, { x: number; y: number }>();
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
    this.sparks = [];
    this.marks = [];
    // Sans quoi la première trace relierait l'ancienne carte au point d'apparition.
    this.lastSlide = new WeakMap();
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
    for (const m of this.marks) m.age += dt;
    this.marks = this.marks.filter((m) => m.age < MARK_LIFE);
    for (const p of this.sparks) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vz -= 260 * dt;
      p.z = Math.max(0, p.z + p.vz * dt);
    }
    this.sparks = this.sparks.filter((p) => p.age < p.life);

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
      if (a.slideT > 0) this.slide(a);
      else this.lastSlide.delete(a);
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

  /** Une glissade : les traces sous les deux pieds depuis la dernière image, et des éclats projetés vers l'arrière. */
  private slide(a: Actor): void {
    const from = this.lastSlide.get(a) ?? { x: a.x, y: a.y };
    this.lastSlide.set(a, { x: a.x, y: a.y });
    const len = Math.hypot(a.x - from.x, a.y - from.y);
    const ux = len > 0 ? (a.x - from.x) / len : a.slideDx;
    const uy = len > 0 ? (a.y - from.y) / len : a.slideDy;
    // Les deux pieds, de part et d'autre de la direction (3 px).
    const side = 3 / TILE;
    const steps = Math.ceil((len * TILE) / 2);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = from.x + (a.x - from.x) * t;
      const y = from.y + (a.y - from.y) * t;
      this.marks.push({ x: x - uy * side, y: y + ux * side, age: 0 }, { x: x + uy * side, y: y - ux * side, age: 0 });
    }
    for (let i = 0; i < 2; i++) {
      const spread = (Math.random() - 0.5) * 3;
      const back = 1 + Math.random() * 2.5;
      this.sparks.push({
        x: a.x,
        y: a.y,
        z: 1,
        vx: -ux * back - uy * spread,
        vy: -uy * back + ux * spread,
        vz: 40 + Math.random() * 50,
        age: 0,
        life: SPARK_LIFE * (0.6 + Math.random() * 0.6),
      });
    }
  }

  /** La planche est dessinée en ×2 : chaque case de 192 px est réduite de moitié. */
  draw(ctx: CanvasRenderingContext2D, sheet: CanvasImageSource, camX: number, camY: number, k: number): void {
    const C = FIELD_FX.cell;
    const half = C / 2;
    for (const m of this.marks) {
      ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - m.age / MARK_LIFE)})`;
      ctx.fillRect(Math.round((m.x * TILE - camX) * k), Math.round((m.y * TILE - 1 - camY) * k), Math.ceil(k), Math.ceil(k));
    }
    for (const p of this.sparks) {
      const u = p.age / p.life;
      // Un éclat sur deux scintille (blanc pur), les autres sont bleu glacier.
      ctx.fillStyle = (p.life * 100) % 2 < 1 ? `rgba(255,255,255,${1 - u})` : `rgba(170,225,255,${1 - u})`;
      const size = Math.ceil((u < 0.5 ? 2 : 1) * k);
      ctx.fillRect(Math.round((p.x * TILE - camX) * k), Math.round((p.y * TILE - p.z - 2 - camY) * k), size, size);
    }
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
