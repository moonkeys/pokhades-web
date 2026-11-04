import { TILE } from '../world/tiles';
import { typeColor, withAlpha } from './combatfx';

// Entrée en puissance d'un Pokémon de champion (Combat.bossIntro) : il
// concentre son énergie (des particules à la couleur de son type convergent),
// puis la libère d'un coup — onde au sol, secousse — dans un motif propre à
// son type : flammes qui montent, éclairs qui tombent, sol qui se fend,
// cristaux de glace, feuilles en spirale…
// Écart voulu avec le jeu, où le Pokémon sortait de sa ball sans plus de
// cérémonie : l'as d'un champion doit sembler plus fort qu'un sauvage avant
// même le premier coup (retour de test).
//
// Dessiné dans le tampon du canvas, en petits aplats : pas d'image fine qui
// sortirait pixellisée. Positions en cases, hauteur `h` en cases au-dessus du sol.

type Shape = 'dot' | 'flame' | 'leaf' | 'shard' | 'bubble' | 'smoke' | 'star' | 'chunk';

interface Particle {
  x: number;
  y: number;
  h: number;
  vx: number;
  vy: number;
  vh: number;
  /** Gravité (cases/s², vers le sol) ; négative : ça monte en accélérant. */
  g: number;
  t: number;
  life: number;
  size: number;
  color: string;
  shape: Shape;
  rot: number;
  vrot: number;
  /** Tourne autour du centre de l'effet (feuilles, essaim, dragon) : rayon et vitesse angulaire. */
  orbit?: { cx: number; cy: number; r: number; a: number; va: number; vr: number };
}

/** Éclair : une ligne brisée du ciel au sol, qui s'efface en 0,25 s. */
interface Bolt {
  pts: [number, number][];
  t: number;
}
/** Fissure au sol : une ligne brisée depuis le centre, qui s'efface lentement. */
interface Crack {
  pts: [number, number][];
  t: number;
  life: number;
}
/** Onde : un anneau au sol qui s'élargit. */
interface Ring {
  x: number;
  y: number;
  t: number;
  life: number;
  r: number;
  color: string;
  width: number;
}

interface Effect {
  x: number;
  y: number;
  type: string;
  color: string;
  /** L'as : effet plus ample et plus long qu'un simple Pokémon de champion. */
  big: boolean;
  t: number;
  /** Instant de la libération (fin de la concentration), et durée totale. */
  burst: number;
  dur: number;
  burstDone: boolean;
  /** Prochaine émission du motif continu (s). */
  emit: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Couleurs secondaires du motif (la principale est celle du type), plus soutenues : elles doivent se lire sur l'herbe claire. */
const ACCENT: Record<string, string> = {
  fire: '#ffe066', water: '#2f7fd9', electric: '#c9a000', grass: '#3f9f2f', ice: '#4fb0e0', ground: '#8a6a3c',
  rock: '#8f7d5a', psychic: '#c94f8f', ghost: '#3a2a5c', dark: '#2a2030', dragon: '#5f3fbf', fighting: '#b8402a',
  poison: '#7a3a9f', flying: '#6f8fd0', bug: '#7f9f1f', steel: '#6f7c96', fairy: '#ff6fbf', normal: '#b8a070',
};

export class PowerUps {
  private effects: Effect[] = [];
  private parts: Particle[] = [];
  private bolts: Bolt[] = [];
  private cracks: Crack[] = [];
  private rings: Ring[] = [];

  reset(): void {
    this.effects = [];
    this.parts = [];
    this.bolts = [];
    this.cracks = [];
    this.rings = [];
  }

  /** Lance l'entrée en puissance en (x, y) : concentration pendant `burst` s, libération, motif jusqu'à `dur`. */
  start(x: number, y: number, type: string, big: boolean, burst: number, dur: number): void {
    this.effects.push({ x, y, type, color: typeColor(type), big, t: 0, burst, dur, burstDone: false, emit: 0 });
  }

  update(dt: number): void {
    for (const e of this.effects) {
      e.t += dt;
      if (e.t < e.burst) this.gather(e, dt);
      else {
        if (!e.burstDone) {
          e.burstDone = true;
          this.release(e);
        }
        e.emit -= dt;
        if (e.emit <= 0 && e.t < e.dur - 0.25) {
          e.emit = 0.06;
          this.motif(e);
        }
      }
    }
    this.effects = this.effects.filter((e) => e.t < e.dur);

    for (const p of this.parts) {
      p.t += dt;
      p.rot += p.vrot * dt;
      if (p.orbit) {
        const o = p.orbit;
        o.a += o.va * dt;
        o.r += o.vr * dt;
        p.x = o.cx + Math.cos(o.a) * o.r;
        p.y = o.cy + Math.sin(o.a) * o.r * 0.6;
        p.h += p.vh * dt;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vh -= p.g * dt;
      p.h += p.vh * dt;
      // Ce qui retombe s'arrête au sol (gouttes, éclats de roche).
      if (p.h < 0 && p.g > 0) {
        p.h = 0;
        p.vh = 0;
        p.vx *= 0.5;
        p.vy *= 0.5;
      }
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
    for (const b of this.bolts) b.t += dt;
    this.bolts = this.bolts.filter((b) => b.t < 0.25);
    for (const c of this.cracks) c.t += dt;
    this.cracks = this.cracks.filter((c) => c.t < c.life);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.life);
  }

  /** Concentration : des grains à la couleur du type filent vers le Pokémon. */
  private gather(e: Effect, dt: number): void {
    const n = Math.random() < dt * (e.big ? 70 : 45) ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = rand(1.8, e.big ? 3.4 : 2.6);
      const life = 0.35;
      this.parts.push({
        x: e.x + Math.cos(a) * d,
        y: e.y + Math.sin(a) * d * 0.6,
        h: rand(0.2, 1.4),
        vx: (-Math.cos(a) * d) / life,
        vy: (-Math.sin(a) * d * 0.6) / life,
        vh: 0,
        g: 0,
        t: 0,
        life,
        size: 1,
        color: Math.random() < 0.3 ? '#ffffff' : e.color,
        shape: 'dot',
        rot: 0,
        vrot: 0,
      });
    }
  }

  /** Libération : deux ondes au sol, une gerbe, et le coup d'envoi du motif. */
  private release(e: Effect): void {
    const s = e.big ? 1 : 0.7;
    this.rings.push({ x: e.x, y: e.y, t: 0, life: 0.5, r: 3.6 * s, color: '#ffffff', width: 2 });
    this.rings.push({ x: e.x, y: e.y, t: -0.08, life: 0.65, r: 4.6 * s, color: e.color, width: 2 });
    for (let i = 0; i < (e.big ? 22 : 14); i++) {
      const a = Math.random() * Math.PI * 2;
      const v = rand(3, 6) * s;
      this.parts.push({ x: e.x, y: e.y, h: 0.6, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6, vh: rand(0, 2), g: 4, t: 0, life: rand(0.3, 0.5), size: 1, color: i % 3 ? e.color : '#ffffff', shape: 'dot', rot: 0, vrot: 0 });
    }
    switch (e.type) {
      case 'ground':
      case 'rock':
      case 'fighting':
      case 'steel':
        // Le sol se fend autour de lui.
        for (let i = 0; i < (e.big ? 7 : 5); i++) {
          const a = (i / (e.big ? 7 : 5)) * Math.PI * 2 + rand(-0.3, 0.3);
          const pts: [number, number][] = [[e.x, e.y]];
          let r = 0;
          while (r < 2.6 * s) {
            r += rand(0.35, 0.6);
            const aa = a + rand(-0.35, 0.35);
            pts.push([e.x + Math.cos(aa) * r, e.y + Math.sin(aa) * r * 0.6]);
          }
          this.cracks.push({ pts, t: 0, life: e.dur - e.burst + 0.6 });
        }
        break;
      case 'ice':
        this.rings.push({ x: e.x, y: e.y, t: 0, life: e.dur - e.burst, r: 2.2 * s, color: '#dff6ff', width: 1 });
        break;
    }
  }

  /** Le motif du type, émis en continu après la libération. */
  private motif(e: Effect): void {
    const s = e.big ? 1 : 0.7;
    const around = (rMin: number, rMax: number) => {
      const a = Math.random() * Math.PI * 2;
      const r = rand(rMin, rMax) * s;
      return { a, x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r * 0.6 };
    };
    const accent = ACCENT[e.type] ?? '#ffffff';
    const push = (p: Partial<Particle> & Pick<Particle, 'x' | 'y' | 'shape' | 'life'>) =>
      this.parts.push({ h: 0, vx: 0, vy: 0, vh: 0, g: 0, t: 0, size: 1, color: e.color, rot: 0, vrot: 0, ...p });
    switch (e.type) {
      case 'fire':
        // Langues de feu qui montent en spirale autour de lui.
        for (let i = 0; i < 2; i++) {
          const p = around(0.4, 1.3);
          push({ x: p.x, y: p.y, shape: 'flame', life: 0.55, vh: rand(1.5, 2.6), g: -1.5, size: rand(1, 1.6), color: Math.random() < 0.4 ? accent : e.color });
        }
        break;
      case 'water': {
        // Geysers : des gouttes jaillissent et retombent.
        const p = around(0.6, 1.6);
        for (let i = 0; i < 3; i++) push({ x: p.x, y: p.y, shape: 'bubble', life: 0.8, vx: rand(-0.6, 0.6), vy: rand(-0.4, 0.4), vh: rand(3.5, 5), g: 9, size: rand(0.8, 1.2), color: i ? e.color : accent });
        break;
      }
      case 'electric': {
        // Éclairs qui tombent du ciel tout autour.
        if (Math.random() < 0.45) {
          const p = around(0.6, 2.2);
          const pts: [number, number][] = [];
          const top = rand(3.5, 5);
          for (let h = top; h > 0; h -= rand(0.35, 0.7)) pts.push([p.x + rand(-0.25, 0.25), p.y - h]);
          pts.push([p.x, p.y]);
          this.bolts.push({ pts, t: 0 });
          this.rings.push({ x: p.x, y: p.y, t: 0, life: 0.25, r: 0.7, color: e.color, width: 1 });
        }
        const q = around(0.3, 1);
        push({ x: q.x, y: q.y, h: rand(0.2, 1.4), shape: 'star', life: 0.18, size: 1, color: accent });
        break;
      }
      case 'grass':
      case 'bug':
        // Feuilles (ou essaim) qui tournent autour de lui en s'écartant.
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2;
          this.parts.push({
            x: e.x, y: e.y, h: rand(0.1, 1.2), vx: 0, vy: 0, vh: rand(0.3, 0.9), g: 0, t: 0, life: 0.9,
            size: e.type === 'bug' ? 0.6 : rand(1, 1.4), color: Math.random() < 0.4 ? accent : e.color,
            shape: e.type === 'bug' ? 'dot' : 'leaf', rot: a, vrot: rand(-8, 8),
            orbit: { cx: e.x, cy: e.y, r: rand(0.4, 0.9) * s, a, va: rand(4, 6) * (e.type === 'bug' && Math.random() < 0.5 ? -1 : 1), vr: rand(1, 1.8) * s },
          });
        }
        break;
      case 'dragon':
        // Deux courants d'énergie qui s'enroulent en montant.
        for (const k of [0, Math.PI]) {
          this.parts.push({
            x: e.x, y: e.y, h: 0, vx: 0, vy: 0, vh: 2.6, g: 0, t: 0, life: 0.7, size: 1.2, color: k ? accent : e.color, shape: 'dot', rot: 0, vrot: 0,
            orbit: { cx: e.x, cy: e.y, r: 0.9 * s, a: e.t * 9 + k, va: 9, vr: -0.4 },
          });
        }
        break;
      case 'ice': {
        // Cristaux projetés vers l'extérieur, qui tournent.
        const p = around(0.2, 0.5);
        push({ x: p.x, y: p.y, h: rand(0.3, 1.2), shape: 'shard', life: 0.5, vx: Math.cos(p.a) * rand(2, 3.5) * s, vy: Math.sin(p.a) * rand(2, 3.5) * s * 0.6, vh: rand(0.5, 1.5), g: 3, size: rand(1, 1.5), color: Math.random() < 0.5 ? accent : e.color, rot: p.a, vrot: rand(-10, 10) });
        break;
      }
      case 'ground':
      case 'rock':
      case 'steel':
        // Éclats de roche (ou de métal) soulevés par la secousse.
        if (Math.random() < 0.6) {
          const p = around(0.6, 2.2);
          push({ x: p.x, y: p.y, shape: e.type === 'steel' ? 'star' : 'chunk', life: 0.7, vh: rand(2.5, 4), g: 10, size: rand(1, 1.6), color: Math.random() < 0.5 ? accent : e.color, vrot: rand(-6, 6) });
        }
        break;
      case 'fighting':
        // Ondes de choc répétées.
        if (Math.random() < 0.18) this.rings.push({ x: e.x, y: e.y, t: 0, life: 0.35, r: 2.4 * s, color: Math.random() < 0.5 ? accent : e.color, width: 1 });
        break;
      case 'psychic':
      case 'fairy':
      case 'normal':
        // Anneaux concentriques et éclats (étoiles pour la fée).
        if (Math.random() < 0.16) this.rings.push({ x: e.x, y: e.y, t: 0, life: 0.6, r: 2.8 * s, color: e.color, width: 1 });
        {
          const p = around(0.3, 1.4);
          push({ x: p.x, y: p.y, h: rand(0.3, 1.6), shape: 'star', life: 0.35, vh: 0.6, size: e.type === 'fairy' ? 1.4 : 1, color: Math.random() < 0.5 ? accent : e.color });
        }
        break;
      case 'ghost':
      case 'dark': {
        // Fumée sombre qui monte et s'étale.
        const p = around(0.2, 1.1);
        push({ x: p.x, y: p.y, h: rand(0, 0.4), shape: 'smoke', life: 0.9, vh: rand(0.8, 1.4), vx: rand(-0.3, 0.3), size: rand(1.2, 2), color: Math.random() < 0.5 ? accent : e.color });
        break;
      }
      case 'poison': {
        // Bulles qui montent et éclatent.
        const p = around(0.3, 1.4);
        push({ x: p.x, y: p.y, shape: 'bubble', life: rand(0.5, 0.8), vh: rand(1, 1.8), size: rand(1, 1.8), color: Math.random() < 0.4 ? accent : e.color });
        break;
      }
      case 'flying':
        // Rafales : des traits qui tournent autour de lui.
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2;
          this.parts.push({
            x: e.x, y: e.y, h: rand(0.2, 1.4), vx: 0, vy: 0, vh: 0.3, g: 0, t: 0, life: 0.5, size: 1, color: i ? accent : e.color, shape: 'dot', rot: 0, vrot: 0,
            orbit: { cx: e.x, cy: e.y, r: rand(1, 1.8) * s, a, va: 10, vr: 0.6 },
          });
        }
        break;
      default: {
        const p = around(0.3, 1.4);
        push({ x: p.x, y: p.y, h: rand(0.3, 1.6), shape: 'star', life: 0.35, vh: 0.6 });
      }
    }
  }

  /** Au sol, sous les Pokémon : aura du type, ondes et fissures. */
  drawGround(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void {
    const sx = (x: number) => (x * TILE - camX) * k;
    const sy = (y: number) => (y * TILE - camY) * k;
    // Aura : une flaque de la couleur du type qui grandit pendant la concentration, bat après la libération.
    for (const e of this.effects) {
      const s = e.big ? 1 : 0.75;
      const grow = Math.min(1, e.t / e.burst);
      const fade = Math.min(1, (e.dur - e.t) / 0.4);
      const beat = e.t < e.burst ? 0 : 0.12 * Math.sin((e.t - e.burst) * 14);
      const r = (0.6 + 1.1 * grow + beat) * s * TILE * k;
      const g = b.createRadialGradient(sx(e.x), sy(e.y), 0, sx(e.x), sy(e.y), r);
      g.addColorStop(0, withAlpha(e.color, 0.75 * fade));
      g.addColorStop(0.6, withAlpha(e.color, 0.45 * fade));
      g.addColorStop(1, withAlpha(e.color, 0));
      b.fillStyle = g;
      b.beginPath();
      b.ellipse(sx(e.x), sy(e.y), r, r * 0.6, 0, 0, Math.PI * 2);
      b.fill();
    }
    for (const r of this.rings) {
      if (r.t < 0) continue;
      const u = r.t / r.life;
      const rad = r.r * (0.25 + 0.75 * (1 - (1 - u) ** 2)) * TILE * k;
      b.strokeStyle = withAlpha(r.color, 0.85 * (1 - u));
      b.lineWidth = Math.max(1, Math.round(r.width * k * (1.5 - u)));
      b.beginPath();
      b.ellipse(sx(r.x), sy(r.y), rad, rad * 0.6, 0, 0, Math.PI * 2);
      b.stroke();
    }
    for (const c of this.cracks) {
      const a = Math.min(1, (c.life - c.t) / 0.6);
      const grow = Math.min(1, c.t / 0.18);
      const n = Math.max(2, Math.ceil(c.pts.length * grow));
      b.strokeStyle = `rgba(40,28,16,${0.75 * a})`;
      b.lineWidth = Math.max(1, Math.round(1.5 * k));
      b.beginPath();
      c.pts.slice(0, n).forEach(([x, y], i) => (i ? b.lineTo(sx(x), sy(y)) : b.moveTo(sx(x), sy(y))));
      b.stroke();
    }
  }

  /** Par-dessus les Pokémon : particules et éclairs. */
  draw(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void {
    const sx = (x: number) => Math.round((x * TILE - camX) * k);
    const sy = (y: number, h: number) => Math.round((y * TILE - h * TILE - camY) * k);
    for (const p of this.parts) {
      const fade = Math.min(1, (p.life - p.t) / Math.min(0.25, p.life * 0.5));
      const x = sx(p.x);
      const y = sy(p.y, p.h);
      const u = Math.max(1, Math.round(p.size * 1.5 * k));
      // Aplats opaques : en mode additif, les couleurs claires disparaissaient sur l'herbe.
      b.fillStyle = withAlpha(p.color, (p.shape === 'smoke' ? 0.6 : 1) * fade);
      switch (p.shape) {
        case 'dot':
          b.fillRect(x, y, u, u);
          break;
        case 'flame': {
          // Goutte pointue vers le haut, qui rétrécit en montant.
          const w = u * 1.6 * (1 - p.t / p.life * 0.5);
          b.beginPath();
          b.moveTo(x, y - w * 2.2);
          b.quadraticCurveTo(x + w, y - w * 0.2, x, y + w * 0.6);
          b.quadraticCurveTo(x - w, y - w * 0.2, x, y - w * 2.2);
          b.fill();
          break;
        }
        case 'leaf':
        case 'shard': {
          const l = u * (p.shape === 'leaf' ? 2 : 2.6);
          const w = u * (p.shape === 'leaf' ? 1 : 0.7);
          const c = Math.cos(p.rot);
          const s = Math.sin(p.rot);
          b.beginPath();
          b.moveTo(x + c * l, y + s * l);
          b.lineTo(x - s * w, y + c * w);
          b.lineTo(x - c * l, y - s * l);
          b.lineTo(x + s * w, y - c * w);
          b.closePath();
          b.fill();
          break;
        }
        case 'bubble':
          b.strokeStyle = b.fillStyle;
          b.lineWidth = Math.max(1, Math.round(k * 0.8));
          b.beginPath();
          b.arc(x, y, u * 1.4, 0, Math.PI * 2);
          b.stroke();
          b.fillRect(x - Math.round(u * 0.5), y - Math.round(u * 0.6), Math.max(1, Math.round(u * 0.5)), Math.max(1, Math.round(u * 0.5)));
          break;
        case 'smoke': {
          const r = u * (1.5 + (p.t / p.life) * 2);
          b.beginPath();
          b.arc(x, y, r, 0, Math.PI * 2);
          b.fill();
          break;
        }
        case 'star':
          b.fillRect(x - u, y, u * 3, u);
          b.fillRect(x, y - u, u, u * 3);
          break;
        case 'chunk': {
          const w = u * 1.5;
          b.save();
          b.translate(x, y);
          b.rotate(p.rot);
          b.fillRect(-w / 2, -w / 2, w, w);
          b.restore();
          break;
        }
      }
    }
    for (const bolt of this.bolts) {
      const a = 1 - bolt.t / 0.25;
      for (const [w, col] of [[4, `rgba(60,40,0,${0.5 * a})`], [2.5, withAlpha('#ffe640', a)], [1, `rgba(255,255,255,${a})`]] as const) {
        b.strokeStyle = col;
        b.lineWidth = Math.max(1, Math.round(w * k));
        b.beginPath();
        bolt.pts.forEach(([x, y], i) => (i ? b.lineTo(sx(x), sy(y, 0)) : b.moveTo(sx(x), sy(y, 0))));
        b.stroke();
      }
    }
  }
}
