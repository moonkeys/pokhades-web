import type { Actor } from '../entities/actor';
import type { WorldMap } from '../world/generate';
import { GROUND, TILE, type Tile } from '../world/tiles';

// Traces de pas : elles dépendent du sol (sable, terre, boue, herbe couchée,
// sillage dans l'eau) et de la morphologie du Pokémon (petites pattes,
// grosses empreintes, serpent qui ondule, ou rien pour ceux qui flottent).

type Surface = 'sand' | 'dirt' | 'mud' | 'grass' | 'dry' | 'water';
type Gait = 'paw' | 'big' | 'slither' | 'none';

interface Print {
  x: number;
  y: number;
  /** Direction de marche (unitaire), pour décaler pied gauche / pied droit. */
  dx: number;
  dy: number;
  side: number;
  age: number;
  life: number;
  gait: Gait | 'wake';
  color: string;
  alpha: number;
}

/** Teinte et durée de vie de la trace selon le sol. */
const SURFACES: Record<Exclude<Surface, 'water'>, { color: string; life: number; alpha: number }> = {
  sand: { color: '#b39a68', life: 7, alpha: 0.75 },
  dirt: { color: '#4f4032', life: 5, alpha: 0.6 },
  mud: { color: '#2f251a', life: 10, alpha: 0.75 },
  grass: { color: '#6f9f5e', life: 1.8, alpha: 0.55 },
  dry: { color: '#9a8f40', life: 2.6, alpha: 0.6 },
};

/** Serpents et apparentés : une trace continue qui ondule. */
const SLITHER = new Set([23, 24, 95, 147, 148, 208, 336, 349, 350]);
/** Ceux qui flottent ou volent au ras du sol : aucune trace. */
const FLOATING = new Set([41, 42, 92, 93, 109, 110, 200, 129, 607]);

const same = (a: Tile | undefined, b: Tile) => !!a && a[0] === b[0] && a[1] === b[1];

function surfaceOfTile(tile: Tile | undefined): Exclude<Surface, 'water'> | null {
  if (same(tile, GROUND.sand) || same(tile, GROUND.paleSand) || tile === undefined) return 'sand';
  if (same(tile, GROUND.dirt)) return 'dirt';
  if (same(tile, GROUND.mud)) return 'mud';
  if (same(tile, GROUND.grass)) return 'grass';
  if (same(tile, GROUND.dry)) return 'dry';
  return null;
}

function surfaceAt(world: WorldMap, x: number, y: number): Surface | null {
  const cx = Math.floor(x);
  const cy = Math.floor(y - 0.1);
  if (cx < 0 || cy < 0 || cx >= world.w || cy >= world.h) return null;
  const i = cy * world.w + cx;
  const b = world.biome;
  if (world.water[i]) return b.water?.swim ? 'water' : null;
  if (world.tall[i]) return null;
  // Remplissage implicite : le sentier de sable « cuit » n'a pas de fill, c'est du sable.
  if (world.path[i] && b.path) return surfaceOfTile(b.path.blob.fill);
  if (world.patch[i] && b.patch) return surfaceOfTile(b.patch.blob.fill);
  return surfaceOfTile(b.ground.base);
}

function gaitOf(a: Actor): Gait {
  if (FLOATING.has(a.speciesId)) return 'none';
  if (SLITHER.has(a.speciesId)) return 'slither';
  if ((a.info && a.info.heightM >= 1.2) || (a.sheet && a.sheet.bodyWidth >= 26)) return 'big';
  return 'paw';
}

interface Track {
  x: number;
  y: number;
  side: number;
}

export class Footprints {
  private prints: Print[] = [];
  private readonly tracks = new WeakMap<Actor, Track>();
  private time = 0;

  reset(): void {
    this.prints = [];
  }

  update(dt: number, actors: readonly Actor[], world: WorldMap): void {
    this.time += dt;
    for (const p of this.prints) p.age += dt;
    this.prints = this.prints.filter((p) => p.age < p.life);

    for (const a of actors) {
      if (!a.sheet) continue;
      let t = this.tracks.get(a);
      if (!t) {
        t = { x: a.x, y: a.y, side: 1 };
        this.tracks.set(a, t);
      }
      const dx = a.x - t.x;
      const dy = a.y - t.y;
      const dist = Math.hypot(dx, dy);
      // Téléportation (changement de carte, debug) : on repart de là sans tracer.
      if (dist > 3) {
        t.x = a.x;
        t.y = a.y;
        continue;
      }
      const surface = surfaceAt(world, a.x, a.y);
      const gait = gaitOf(a);
      const stride = surface === 'water' ? 0.45 : gait === 'slither' ? 0.16 : gait === 'big' ? 0.6 : 0.42;
      if (dist < stride) continue;
      t.x = a.x;
      t.y = a.y;
      t.side = -t.side;
      if (!surface || gait === 'none') continue;
      const ux = dx / dist;
      const uy = dy / dist;
      if (surface === 'water') {
        this.prints.push({ x: a.x, y: a.y, dx: ux, dy: uy, side: 1, age: 0, life: 1.3, gait: 'wake', color: '#ffffff', alpha: 0.8 });
        continue;
      }
      const look = SURFACES[surface];
      this.prints.push({ x: a.x, y: a.y, dx: ux, dy: uy, side: t.side, age: 0, life: look.life, gait, color: look.color, alpha: look.alpha });
    }
    // Garde-fou : jamais plus de 600 traces en mémoire.
    if (this.prints.length > 600) this.prints.splice(0, this.prints.length - 600);
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, k: number): void {
    for (const p of this.prints) {
      // Pleine intensité, puis effacement sur la dernière moitié de vie.
      const fade = Math.min(1, ((p.life - p.age) / p.life) * 2);
      ctx.globalAlpha = p.alpha * fade;
      ctx.fillStyle = p.color;
      const px = p.x * TILE;
      const py = p.y * TILE - 1;
      // Perpendiculaire à la marche : écarte pied gauche / pied droit.
      const nx = -p.dy;
      const ny = p.dx;
      const dot = (x: number, y: number, w: number, h: number) =>
        ctx.fillRect(Math.round((x - camX) * k), Math.round((y - camY) * k), w * k, h * k);
      switch (p.gait) {
        case 'paw':
          dot(px + nx * p.side * 2.5 - 1, py + ny * p.side * 2.5 - 1, 2, 2);
          break;
        case 'big':
          dot(px + nx * p.side * 4 - 1.5, py + ny * p.side * 4 - 1, 3, 2);
          dot(px + nx * p.side * 4 - 0.5, py + ny * p.side * 4 - 2, 1, 1);
          break;
        case 'slither': {
          const wave = Math.sin((p.x + p.y) * 9) * 2;
          dot(px + nx * wave - 1, py + ny * wave, 2, 1);
          break;
        }
        case 'wake': {
          // Deux vaguelettes qui s'écartent en V derrière la monture.
          const spread = 3 + p.age * 9;
          dot(px + nx * spread - p.dx * 2, py + ny * spread - p.dy * 2, 2, 1);
          dot(px - nx * spread - p.dx * 2, py - ny * spread - p.dy * 2, 2, 1);
          break;
        }
        case 'none':
          break;
      }
    }
    ctx.globalAlpha = 1;
  }
}
