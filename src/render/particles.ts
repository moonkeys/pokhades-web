import { Rng } from '../core/rng';
import type { ParticleKind } from '../world/biomes';

// Particules d'ambiance, en coordonnées monde (px de décor). Elles vivent
// dans la vue courante et renaissent dès qu'elles en sortent : leur nombre
// reste constant, quelle que soit la taille de la carte.

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  phase: number;
  color: string;
}

interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

const COUNT: Record<ParticleKind, number> = { pollen: 46, motes: 26, leaves: 34, fireflies: 28, embers: 48, rain: 150, snow: 90, sand: 130 };
/** Genres qui entrent par un bord de la vue (et non n'importe où) quand ils renaissent. */
const FROM_EDGE: readonly ParticleKind[] = ['leaves', 'embers', 'rain', 'snow', 'sand'];
const LEAF_COLORS = ['#e8622a', '#f2a33a', '#c9472a', '#f5c24a'];
const EMBER_COLORS = ['#ff9a3a', '#ffd36a', '#ff6a2a'];
const SAND_COLORS = ['#e8cf96', '#d6b16e', '#f2e0b4'];

export class Particles {
  private items: Particle[] = [];
  private kind: ParticleKind | null = null;
  private readonly rng = new Rng(9001);
  private time = 0;

  reset(): void {
    this.items = [];
  }

  private spawn(kind: ParticleKind, view: View, anywhere: boolean): Particle {
    const r = this.rng;
    const p: Particle = {
      x: view.x + r.range(0, view.w),
      y: view.y + r.range(0, view.h),
      vx: 0,
      vy: 0,
      life: r.range(4, 9),
      age: anywhere ? r.range(0, 3) : 0,
      phase: r.range(0, Math.PI * 2),
      color: '#ffffff',
    };
    switch (kind) {
      case 'pollen':
        p.vx = r.range(-4, 6);
        p.vy = r.range(-8, -2);
        p.color = r.chance(0.7) ? '#fff6c8' : '#ffffff';
        break;
      case 'motes':
        p.vx = r.range(-3, 3);
        p.vy = r.range(-4, 1);
        p.color = '#eaffd8';
        break;
      case 'leaves':
        // Elles tombent : nées au-dessus de la vue, sauf au premier remplissage.
        if (!anywhere) p.y = view.y - 4;
        p.vx = r.range(4, 12);
        p.vy = r.range(12, 22);
        p.life = 12;
        p.color = r.pick(LEAF_COLORS);
        break;
      case 'fireflies':
        p.vx = r.range(-6, 6);
        p.vy = r.range(-6, 6);
        p.color = '#d9ff7a';
        break;
      case 'embers':
        if (!anywhere) p.y = view.y + view.h + 2;
        p.vx = r.range(-4, 4);
        p.vy = r.range(-26, -10);
        p.life = r.range(3, 7);
        p.color = r.pick(EMBER_COLORS);
        break;
      // Météo : la pluie tombe en biais, vite ; la grêle tombe en flocons qui
      // dansent ; le sable file à l'horizontale, entré par la gauche.
      case 'rain':
        if (!anywhere) p.y = view.y - 6;
        p.vx = r.range(-40, -30);
        p.vy = r.range(230, 290);
        p.life = 3;
        p.color = r.chance(0.5) ? '#cfe2ff' : '#a9c6ee';
        break;
      case 'snow':
        if (!anywhere) p.y = view.y - 4;
        p.vx = r.range(-8, 8);
        p.vy = r.range(26, 44);
        p.life = 14;
        p.color = '#ffffff';
        break;
      case 'sand':
        if (!anywhere) p.x = view.x - 6;
        p.vx = r.range(150, 220);
        p.vy = r.range(-6, 14);
        p.life = 4;
        p.color = r.pick(SAND_COLORS);
        break;
    }
    return p;
  }

  update(dt: number, kind: ParticleKind | null, view: View): void {
    this.time += dt;
    if (kind !== this.kind) {
      this.kind = kind;
      this.items = [];
    }
    if (!kind) return;
    while (this.items.length < COUNT[kind]) this.items.push(this.spawn(kind, view, true));
    const margin = 24;
    for (let i = 0; i < this.items.length; i++) {
      const p = this.items[i];
      p.age += dt;
      if (kind === 'fireflies') {
        // Errance : la vitesse dérive doucement.
        p.vx += this.rng.range(-20, 20) * dt;
        p.vy += this.rng.range(-20, 20) * dt;
        p.vx = Math.max(-8, Math.min(8, p.vx));
        p.vy = Math.max(-8, Math.min(8, p.vy));
      }
      const sway = kind === 'leaves' ? Math.sin(this.time * 2.2 + p.phase) * 10 : kind === 'snow' ? Math.sin(this.time * 1.6 + p.phase) * 8 : 0;
      p.x += (p.vx + sway) * dt;
      p.y += p.vy * dt;
      const out = p.x < view.x - margin || p.x > view.x + view.w + margin || p.y < view.y - margin || p.y > view.y + view.h + margin;
      if (p.age > p.life || out) this.items[i] = this.spawn(kind, view, out && !FROM_EDGE.includes(kind));
    }
  }

  private alpha(p: Particle): number {
    const fade = Math.min(1, p.age / 0.6, (p.life - p.age) / 0.8);
    if (this.kind === 'fireflies') return Math.max(0, Math.sin(this.time * 2.6 + p.phase)) * fade;
    if (this.kind === 'pollen' || this.kind === 'motes') return (0.55 + 0.45 * Math.sin(this.time * 3 + p.phase)) * fade;
    if (this.kind === 'rain') return 0.55 * fade;
    if (this.kind === 'sand') return 0.7 * fade;
    return fade;
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, k: number): void {
    for (const p of this.items) {
      const a = this.alpha(p);
      if (a <= 0.02) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      const x = Math.round((p.x - camX) * k);
      const y = Math.round((p.y - camY) * k);
      // Une goutte est un trait penché (deux pixels décalés par rangée), un grain de sable un tiret.
      if (this.kind === 'rain') for (let j = 0; j < 4; j++) ctx.fillRect(x - Math.round(j * 0.5) * k, y + j * k, k, k);
      else if (this.kind === 'sand') ctx.fillRect(x, y, 3 * k, k);
      else ctx.fillRect(x, y, (this.kind === 'leaves' ? 2 : 1) * k, k);
    }
    ctx.globalAlpha = 1;
  }

  /** Halos additifs (lucioles, braises), à dessiner après l'étalonnage pour qu'ils percent la pénombre. */
  drawGlow(ctx: CanvasRenderingContext2D, camX: number, camY: number, k: number, strength: number): void {
    if (this.kind !== 'fireflies' && this.kind !== 'embers') return;
    const radius = (this.kind === 'fireflies' ? 7 : 5) * k;
    const rgb = this.kind === 'fireflies' ? '190,255,120' : '255,140,50';
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.items) {
      const a = this.alpha(p) * strength;
      if (a <= 0.02) continue;
      const x = (p.x - camX) * k;
      const y = (p.y - camY) * k;
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
      g.addColorStop(0, `rgba(${rgb},${0.35 * a})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}
