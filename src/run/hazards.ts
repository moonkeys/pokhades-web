import { loadImage } from '../assets/pmd';
import { sfx } from '../audio/audio';
import { Rng } from '../core/rng';
import type { Actor } from '../entities/actor';
import type { CombatFx } from '../render/combatfx';
import type { WorldMap } from '../world/generate';
import { TILE } from '../world/tiles';

// Les dangers du terrain (ajout, retour de test : « le but, c'est que chaque biome ait
// vraiment son gameplay »). La boue du Marais ralentit (entities/actor.ts, terrainMult), la
// glace fait glisser, la grêle use ; ici :
//
//   - la lave du Volcan : avec la CS Surf, on peut s'y aventurer (Actor.lavaOk), mais elle
//     brûle — une part des PV toutes les LAVA_EVERY secondes, et parfois une brûlure. Les
//     types Feu n'y craignent rien. Jamais de K.O. : la lave pousse à sortir, elle ne tue pas
//     d'un coup ;
//   - les tourbillons de sable des Rocailleux : deux ou trois colonnes de poussière qui errent
//     au hasard dans la salle (pas dans toutes : une sur deux). Qui s'y fait prendre encaisse
//     des dégâts et se fait éjecter. Roche, Sol et Acier y résistent, comme à la tempête.
//
// Seule l'équipe du joueur les subit : les sauvages connaissent leur terrain.

/** Lave : toutes les tant de secondes, une part des PV max ; chance de brûlure. */
const LAVA_EVERY = 0.6;
const LAVA_SHARE = 0.06;
const LAVA_BURN = 0.25;
/**
 * Entre deux brûlures de la lave (s) : un statut s'éteint de lui-même au bout de quelques
 * secondes (combat/pokemon.ts, STATUS), et la lave ne doit pas le rallumer sans fin (retour
 * de test : « un état ne dure pas indéfiniment, sinon le Pokémon meurt tout seul »).
 */
const LAVA_REBURN = 10;
/** Tourbillon : rayon de prise (cases), vitesse d'errance, dégâts et recul. */
const DEVIL_RADIUS = 1.1;
const DEVIL_SPEED = 1.8;
const DEVIL_EVERY = 0.7;
const DEVIL_SHARE = 0.07;
const DEVIL_PUSH = 9;
/**
 * Tourbillons de l'Océan : ils dérivent lentement sur l'eau ; un nageur pris dedans tourne,
 * perd des PV, puis est recraché dans une direction au hasard (retour de test : « ça fait
 * perdre des points de vie, ou ça te met dans tous les sens » — les deux).
 */
const POOL_RADIUS = 2.2;
const POOL_SPEED = 0.8;
const POOL_EVERY = 0.9;
const POOL_SHARE = 0.05;
const POOL_SPIN = 7;
/**
 * Rafales de l'Automne : de temps en temps, le vent se lève dans une direction, emporte des
 * feuilles et pousse l'équipe (pas les sauvages, qui connaissent leur forêt). Sans dégâts.
 */
const GUST_EVERY = [7, 11] as const;
const GUST_TIME = 1.8;
const GUST_PUSH = 3.2;
/** Qui résiste au sable (world/weather.ts, comme la tempête). */
const SAND_PROOF = new Set(['rock', 'ground', 'steel']);

interface Devil {
  x: number;
  y: number;
  vx: number;
  vy: number;
  turnT: number;
  t: number;
}

export class Hazards {
  private devils: Devil[] = [];
  private pools: Devil[] = [];
  /** Rafale d'Automne : direction, temps restant, prochaine, feuilles emportées. */
  private gust: { dx: number; dy: number; t: number } | null = null;
  private gustIn = 0;
  private autumn = false;
  private leaves: { x: number; y: number; vx: number; vy: number; t: number; c: string }[] = [];
  private pulse: HTMLImageElement | null = null;
  private lava = false;
  /** Prochain coup de chaque danger, par membre. */
  private readonly burnT = new Map<Actor, number>();
  private readonly hitT = new Map<Actor, number>();
  /** Dernière brûlure de la lave, par membre (temps de la salle). */
  private readonly burnedAt = new Map<Actor, number>();
  private clock = 0;
  private rng = new Rng(1);

  constructor(private readonly fx: CombatFx) {
    // Les ondes de Water pulse (Essentials, Graphics/Animations), jouées à l'envers et à plat :
    // des anneaux qui se resserrent vers le centre, l'aspiration du tourbillon.
    void loadImage('/game/assets/essentials/animations/Water pulse.png')
      .then((img) => (this.pulse = img))
      .catch(() => {});
  }

  /** Nouvelle salle : la lave est-elle praticable, et les tourbillons de sable s'y lèvent-ils ? */
  build(world: WorldMap, seed: number, arena: boolean): void {
    this.clear();
    this.rng = new Rng(seed * 6007 + 11);
    this.lava = world.biome.water?.swim === false;
    this.autumn = world.biome.id === 'automne' && !arena;
    this.gustIn = this.rng.range(GUST_EVERY[0], GUST_EVERY[1]) * 0.5;
    // L'Océan : deux à quatre tourbillons, sur la pleine eau, loin de l'arrivée.
    if (world.biome.id === 'ocean' && !arena) {
      const n = 2 + this.rng.int(3);
      for (let k = 0; k < n * 60 && this.pools.length < n; k++) {
        const x = this.rng.range(4, world.w - 4);
        const y = this.rng.range(4, world.h - 4);
        if (!this.openSea(world, x, y) || Math.hypot(x - world.spawn.x, y - world.spawn.y) < 8) continue;
        const a = this.rng.range(0, Math.PI * 2);
        this.pools.push({ x, y, vx: Math.cos(a), vy: Math.sin(a), turnT: this.rng.range(2, 4), t: this.rng.range(0, 10) });
      }
    }
    // Les Rocailleux, une salle sur deux, jamais dans l'arène du champion.
    if (world.biome.id !== 'rocailleux' || arena || !this.rng.chance(0.5)) return;
    const n = 2 + this.rng.int(2);
    for (let k = 0; k < n * 40 && this.devils.length < n; k++) {
      const x = this.rng.range(4, world.w - 4);
      const y = this.rng.range(4, world.h - 4);
      if (!this.free(world, x, y) || Math.hypot(x - world.spawn.x, y - world.spawn.y) < 9) continue;
      const a = this.rng.range(0, Math.PI * 2);
      this.devils.push({ x, y, vx: Math.cos(a), vy: Math.sin(a), turnT: this.rng.range(1, 3), t: this.rng.range(0, 10) });
    }
  }

  clear(): void {
    this.devils = [];
    this.pools = [];
    this.gust = null;
    this.autumn = false;
    this.leaves = [];
    this.lava = false;
    this.burnT.clear();
    this.hitT.clear();
    this.burnedAt.clear();
    this.clock = 0;
  }

  private free(world: WorldMap, x: number, y: number): boolean {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 1 || cy < 1 || cx >= world.w - 1 || cy >= world.h - 1) return false;
    const i = cy * world.w + cx;
    return world.reachable[i] === 1 && !world.blocked[i] && !world.water[i];
  }

  /** Une case d'eau entourée d'eau (deux cases) : un tourbillon n'y touche pas le rivage. */
  private openSea(world: WorldMap, x: number, y: number): boolean {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const cx = Math.floor(x) + dx;
      const cy = Math.floor(y) + dy;
      if (cx < 0 || cy < 0 || cx >= world.w || cy >= world.h || !world.water[cy * world.w + cx]) return false;
    }
    return true;
  }

  update(dt: number, world: WorldMap, team: readonly Actor[]): void {
    this.clock += dt;
    this.updatePools(dt, world, team);
    this.updateGust(dt, world, team);
    for (const d of this.devils) {
      d.t += dt;
      d.turnT -= dt;
      if (d.turnT <= 0) {
        const a = Math.atan2(d.vy, d.vx) + this.rng.range(-1.4, 1.4);
        d.vx = Math.cos(a);
        d.vy = Math.sin(a);
        d.turnT = this.rng.range(1, 3);
      }
      const nx = d.x + d.vx * DEVIL_SPEED * dt;
      const ny = d.y + d.vy * DEVIL_SPEED * dt;
      // Contre un obstacle ou l'eau, il fait demi-tour.
      if (this.free(world, nx, ny)) [d.x, d.y] = [nx, ny];
      else [d.vx, d.vy] = [-d.vx, -d.vy];
    }
    for (const a of team) {
      const mon = a.pokemon;
      if (!mon || mon.fainted || a.deathT >= 0 || a.evolve || a.remote) continue;
      if (this.lava && a.swimming && !mon.types.includes('fire')) {
        const t = (this.burnT.get(a) ?? 0) - dt;
        if (t <= 0) {
          this.hurt(a, LAVA_SHARE, '#ff7a2a');
          const last = this.burnedAt.get(a) ?? -Infinity;
          if (this.clock - last > LAVA_REBURN && this.rng.chance(LAVA_BURN) && mon.applyStatus('burn')) this.burnedAt.set(a, this.clock);
          this.burnT.set(a, LAVA_EVERY);
        } else this.burnT.set(a, t);
      }
      for (const d of this.devils) {
        const dx = a.x - d.x;
        const dy = a.y - d.y;
        const dist = Math.hypot(dx, dy);
        if (dist > DEVIL_RADIUS || mon.types.some((ty) => SAND_PROOF.has(ty))) continue;
        const t = (this.hitT.get(a) ?? 0) - dt;
        this.hitT.set(a, t);
        if (t > 0) continue;
        this.hurt(a, DEVIL_SHARE, '#d8b878');
        // Éjecté hors de la colonne, de biais (il tourne).
        const ang = Math.atan2(dy, dx) + 0.9;
        a.kbVx = Math.cos(ang) * DEVIL_PUSH;
        a.kbVy = Math.sin(ang) * DEVIL_PUSH;
        a.kbT = 0.25;
        this.hitT.set(a, DEVIL_EVERY);
      }
    }
  }

  private updatePools(dt: number, world: WorldMap, team: readonly Actor[]): void {
    for (const p of this.pools) {
      p.t += dt;
      p.turnT -= dt;
      if (p.turnT <= 0) {
        const a = Math.atan2(p.vy, p.vx) + this.rng.range(-1.2, 1.2);
        [p.vx, p.vy, p.turnT] = [Math.cos(a), Math.sin(a), this.rng.range(2, 4)];
      }
      const nx = p.x + p.vx * POOL_SPEED * dt;
      const ny = p.y + p.vy * POOL_SPEED * dt;
      if (this.openSea(world, nx, ny)) [p.x, p.y] = [nx, ny];
      else [p.vx, p.vy] = [-p.vx, -p.vy];
      for (const a of team) {
        const mon = a.pokemon;
        if (!mon || mon.fainted || a.deathT >= 0 || a.remote || !a.swimming) continue;
        const dx = a.x - p.x;
        const dy = a.y - p.y;
        if (Math.hypot(dx, dy) > POOL_RADIUS) continue;
        const t = (this.hitT.get(a) ?? 0) - dt;
        this.hitT.set(a, t);
        if (t > 0) continue;
        // Il tourne autour du centre, puis le courant le recrache au hasard.
        this.hurt(a, POOL_SHARE, '#8fd0ff');
        const ang = this.rng.range(0, Math.PI * 2);
        a.kbVx = Math.cos(ang) * POOL_SPIN - dy * 2;
        a.kbVy = Math.sin(ang) * POOL_SPIN + dx * 2;
        a.kbT = 0.45;
        this.hitT.set(a, POOL_EVERY);
      }
    }
  }

  private updateGust(dt: number, world: WorldMap, team: readonly Actor[]): void {
    for (const l of this.leaves) {
      l.t += dt;
      l.x += l.vx * dt;
      l.y += l.vy * dt + Math.sin(l.t * 6) * 0.6 * dt;
    }
    this.leaves = this.leaves.filter((l) => l.t < 2.2);
    if (!this.autumn) return;
    if (!this.gust) {
      this.gustIn -= dt;
      if (this.gustIn > 0) return;
      const a = this.rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]) + this.rng.range(-0.3, 0.3);
      this.gust = { dx: Math.cos(a), dy: Math.sin(a), t: GUST_TIME };
      this.gustIn = this.rng.range(GUST_EVERY[0], GUST_EVERY[1]);
      sfx('dash', -6);
    }
    const g = this.gust;
    g.t -= dt;
    // Des feuilles emportées autour de l'équipe, dans le sens du vent.
    const lead = team.find((m) => !m.remote && m.deathT < 0) ?? team[0];
    if (lead && this.rng.chance(0.6)) {
      for (let k = 0; k < 1; k++) {
        this.leaves.push({
          x: lead.x - g.dx * 9 + this.rng.range(-8, 8) * Math.abs(g.dy || 0.4),
          y: lead.y - g.dy * 7 + this.rng.range(-6, 6) * Math.abs(g.dx || 0.4),
          vx: g.dx * this.rng.range(7, 11),
          vy: g.dy * this.rng.range(7, 11),
          t: 0,
          c: this.rng.pick(['#e8602a', '#f0b030', '#c84a20', '#e8a040']),
        });
      }
    }
    for (const a of team) {
      if (a.remote || a.deathT >= 0 || a.kbT > 0) continue;
      a.nudge(world, g.dx * GUST_PUSH * dt, g.dy * GUST_PUSH * dt);
    }
    if (g.t <= 0) this.gust = null;
  }

  /** Une part des PV max, jamais sous 1 PV, le chiffre et des étincelles. */
  private hurt(a: Actor, share: number, color: string): void {
    const mon = a.pokemon!;
    if (mon.hp <= 1) return;
    const dmg = Math.min(mon.hp - 1, Math.max(1, Math.round(mon.maxHp * share)));
    mon.hp -= dmg;
    this.fx.number('player', a.x, a.y, dmg);
    this.fx.impact(a.x, a.y - 0.4, color);
  }

  /** Les tourbillons, triés avec les Pokémon : une colonne de poussière qui tourne. */
  extras(time: number): { y: number; draw(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void }[] {
    type Extra = { y: number; draw(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void };
    const out: Extra[] = this.devils.map((d) => ({ y: d.y * TILE, draw: (b, camX, camY, k) => drawDevil(b, (d.x * TILE - camX) * k, (d.y * TILE - camY) * k, k, time + d.t) }));
    // Les tourbillons, à plat sur l'eau, sous les nageurs.
    for (const p of this.pools) out.push({ y: -Infinity, draw: (b, camX, camY, k) => this.drawPool(b, (p.x * TILE - camX) * k, (p.y * TILE - camY) * k, k, time + p.t) });
    // Les feuilles emportées par la rafale, par-dessus tout.
    if (this.leaves.length) {
      out.push({
        y: Infinity,
        draw: (b, camX, camY, k) => {
          for (const l of this.leaves) {
            b.globalAlpha = Math.min(1, (2.2 - l.t) * 1.5);
            b.fillStyle = l.c;
            b.fillRect(Math.round((l.x * TILE - camX) * k), Math.round((l.y * TILE - camY) * k), 2 * k, k + (Math.floor(l.t * 8) % 2) * k);
          }
          b.globalAlpha = 1;
        },
      });
    }
    return out;
  }

  /** Un tourbillon : les ondes de Water pulse à l'envers, écrasées à plat, et une spirale d'écume. */
  private drawPool(b: CanvasRenderingContext2D, cx: number, cy: number, k: number, t: number): void {
    const img = this.pulse;
    const w = 84 * k;
    // Le creux : un œil sombre au centre, qui aspire.
    const grad = b.createRadialGradient(cx, cy, 0, cx, cy, w * 0.42);
    grad.addColorStop(0, 'rgba(10, 40, 90, 0.55)');
    grad.addColorStop(1, 'rgba(10, 40, 90, 0)');
    b.fillStyle = grad;
    b.beginPath();
    b.ellipse(Math.round(cx), Math.round(cy), w * 0.45, w * 0.2, 0, 0, Math.PI * 2);
    b.fill();
    if (img) {
      // Les sept premières cases (anneaux) : on les joue du plus grand au plus petit.
      const f = 6 - (Math.floor(t * 9) % 7);
      b.globalAlpha = 0.85;
      b.drawImage(img, (f % 5) * 192, Math.floor(f / 5) * 192, 192, 192, Math.round(cx - w / 2), Math.round(cy - w * 0.22), Math.round(w), Math.round(w * 0.44));
      b.globalAlpha = 1;
    }
    b.fillStyle = 'rgba(240, 250, 255, 0.9)';
    for (let i = 0; i < 14; i++) {
      const u = (i / 14 + t * 0.6) % 1;
      const a = t * 4 + u * Math.PI * 4;
      const r = (1 - u) * 36 * k;
      b.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.42), k, k);
    }
  }

  /** La lave brûle-t-elle dans cette salle (pour les flammèches autour des nageurs) ? */
  get lavaRoom(): boolean {
    return this.lava;
  }
}

/** Une colonne de sable : des arcs qui tournent, plus larges en haut, et des grains qui s'envolent. */
function drawDevil(b: CanvasRenderingContext2D, cx: number, cy: number, k: number, t: number): void {
  b.fillStyle = 'rgba(40, 30, 16, 0.25)';
  b.beginPath();
  b.ellipse(Math.round(cx), Math.round(cy), 9 * k, 3 * k, 0, 0, Math.PI * 2);
  b.fill();
  b.lineWidth = Math.max(1, k);
  for (let i = 0; i < 7; i++) {
    const h = i / 6;
    const rx = (4 + h * 9) * k;
    const y = cy - (2 + h * 30) * k;
    const sway = Math.sin(t * 2 + h * 3) * 3 * k;
    const a0 = t * (7 - h * 2) + i;
    b.strokeStyle = `rgba(${210 - i * 6}, ${180 - i * 6}, ${120 - i * 4}, ${0.75 - h * 0.35})`;
    b.beginPath();
    b.ellipse(Math.round(cx + sway), Math.round(y), rx, rx * 0.3, 0, a0, a0 + Math.PI * 1.3);
    b.stroke();
  }
  b.fillStyle = 'rgba(230, 205, 150, 0.85)';
  for (let i = 0; i < 10; i++) {
    const u = (t * 0.8 + i * 0.137) % 1;
    const a = t * 6 + i * 2.1;
    const r = (3 + u * 12) * k;
    b.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy - u * 34 * k), k, k);
  }
}
