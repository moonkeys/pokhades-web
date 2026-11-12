import { paletteOf, PALETTE_OF_MOVE, type MoveStyle } from '../data/movestyles';
import { TILE } from '../world/tiles';

// Effets dessinés des attaques (data/movestyles.ts dit quelle famille joue
// quelle capacité). Ils s'ajoutent aux planches d'Essentials, qui restent à
// l'impact : la planche dit « quoi » (une flamme, un éclair), l'effet dit
// « d'où et comment » (un rayon qui part de la bouche, des crocs qui se
// referment, des rochers qui tombent du ciel).
//
// Tout est tracé au canvas, en cases du monde comme les acteurs, avec une
// hauteur `h` au-dessus du sol (vu de dessus, elle remonte à l'écran). Les
// lumières s'additionnent ('lighter'), les fumées et la terre non.
//
// Le temps d'un effet part du lancer ; `arrive` est l'instant où le coup
// touche (0,12 s pour un tir de l'équipe, 0,45 s pour celui d'un sauvage,
// 0 au corps à corps) : un projectile arrive à cet instant, un rayon s'y
// allume, une morsure s'y referme.

type Pt = { x: number; y: number };
type Get = () => Pt;

/** Repère de dessin : cases → pixels du tampon. */
interface View {
  X(x: number): number;
  Y(y: number, h: number): number;
  /** Pixels par case. */
  S: number;
  k: number;
}

interface Effect {
  t: number;
  /** Durée totale, en secondes depuis le lancer. */
  end: number;
  update?(dt: number): void;
  draw(b: CanvasRenderingContext2D, v: View): void;
}

/** Hauteur des attaques au-dessus du sol : la poitrine d'un Pokémon. */
const BODY_H = 0.55;

const clamp01 = (u: number) => Math.max(0, Math.min(1, u));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const easeOut = (u: number) => 1 - (1 - u) ** 3;

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${clamp01(a)})`;
}

function disc(b: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number): void {
  if (r <= 0 || a <= 0) return;
  b.fillStyle = rgba(color, a);
  b.beginPath();
  b.arc(x, y, r, 0, Math.PI * 2);
  b.fill();
}

/** Halo doux : un dégradé radial du cœur clair à la couleur, jusqu'au transparent. */
function glow(b: CanvasRenderingContext2D, x: number, y: number, r: number, core: string, color: string, a: number): void {
  if (r <= 0 || a <= 0) return;
  const g = b.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(core, a));
  g.addColorStop(0.4, rgba(color, a * 0.7));
  g.addColorStop(1, rgba(color, 0));
  b.fillStyle = g;
  b.fillRect(x - r, y - r, r * 2, r * 2);
}

function line(b: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number, color: string, a: number): void {
  if (w <= 0 || a <= 0) return;
  b.strokeStyle = rgba(color, a);
  b.lineWidth = w;
  b.lineCap = 'round';
  b.beginPath();
  b.moveTo(x1, y1);
  b.lineTo(x2, y2);
  b.stroke();
}

/** Trait en fuseau (griffe, lame) : fin aux deux bouts, `w` au milieu. */
function streak(b: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number, color: string, a: number): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * w * 0.5;
  const ny = (dx / len) * w * 0.5;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  b.fillStyle = rgba(color, a);
  b.beginPath();
  b.moveTo(x1, y1);
  b.quadraticCurveTo(mx + nx * 2, my + ny * 2, x2, y2);
  b.quadraticCurveTo(mx - nx * 0.6, my - ny * 0.6, x1, y1);
  b.fill();
}

/** Éclair brisé entre deux points (`jag` : écart des cassures, en pixels). */
function zigzag(x1: number, y1: number, x2: number, y2: number, segs: number, jag: number, seed: number): Pt[] {
  const pts: Pt[] = [{ x: x1, y: y1 }];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < segs; i++) {
    const u = i / segs;
    const off = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    const j = ((off - Math.floor(off)) * 2 - 1) * jag;
    pts.push({ x: x1 + dx * u + (-dy / len) * j, y: y1 + dy * u + (dx / len) * j });
  }
  pts.push({ x: x2, y: y2 });
  return pts;
}

function polyline(b: CanvasRenderingContext2D, pts: Pt[], w: number, color: string, a: number): void {
  b.strokeStyle = rgba(color, a);
  b.lineWidth = w;
  b.lineJoin = 'miter';
  b.lineCap = 'round';
  b.beginPath();
  pts.forEach((p, i) => (i ? b.lineTo(p.x, p.y) : b.moveTo(p.x, p.y)));
  b.stroke();
}

/**
 * Tête d'un projectile selon son type : flamme, goutte, éclat, feuille,
 * caillou, étoile, croissant de vent, ou sphère. (x, y) en pixels, `r` son
 * rayon, `ang` le sens du vol, `spin` sa rotation propre.
 */
function head(b: CanvasRenderingContext2D, type: string, x: number, y: number, r: number, ang: number, spin: number, pal: readonly [string, string, string], api?: string): void {
  const [c0, c1, c2] = pal;
  b.save();
  b.translate(x, y);
  const kind =
    api === 'swift' || type === 'fairy'
      ? 'star'
      : api === 'bubble' || api === 'bubble-beam'
        ? 'bubble'
        : type === 'fire'
          ? 'flame'
          : type === 'water'
            ? 'drop'
            : type === 'ice' || type === 'steel'
              ? 'shard'
              : type === 'rock' || type === 'ground'
                ? 'rock'
                : type === 'grass'
                  ? 'leaf'
                  : type === 'flying'
                    ? 'crescent'
                    : type === 'bug'
                      ? 'needle'
                      : 'orb';
  switch (kind) {
    case 'flame': {
      b.globalCompositeOperation = 'lighter';
      b.rotate(ang);
      glow(b, 0, 0, r * 2.2, c1, c2, 0.55);
      // Langues de feu vers l'arrière, qui ondulent.
      for (let i = 0; i < 3; i++) {
        const wob = Math.sin(spin * 9 + i * 2.1) * r * 0.35;
        b.fillStyle = rgba(i === 0 ? c2 : c1, 0.85);
        b.beginPath();
        b.moveTo(r * 0.9, 0);
        b.quadraticCurveTo(0, -r * (1 - i * 0.2), -r * (2.4 - i * 0.5), wob);
        b.quadraticCurveTo(0, r * (1 - i * 0.2), r * 0.9, 0);
        b.fill();
      }
      disc(b, r * 0.2, 0, r * 0.55, c0, 0.95);
      break;
    }
    case 'drop': {
      b.rotate(ang);
      b.fillStyle = rgba(c1, 0.9);
      b.beginPath();
      b.moveTo(-r * 2, 0);
      b.quadraticCurveTo(-r * 0.2, -r, r, 0);
      b.quadraticCurveTo(-r * 0.2, r, -r * 2, 0);
      b.fill();
      disc(b, r * 0.35, -r * 0.25, r * 0.28, c0, 0.9);
      break;
    }
    case 'bubble': {
      b.strokeStyle = rgba(c1, 0.95);
      b.lineWidth = Math.max(1, r * 0.25);
      b.beginPath();
      b.arc(0, 0, r, 0, Math.PI * 2);
      b.stroke();
      disc(b, 0, 0, r, c0, 0.25);
      disc(b, -r * 0.35, -r * 0.35, r * 0.25, '#ffffff', 0.9);
      break;
    }
    case 'shard': {
      b.rotate(ang + spin * 0.3);
      b.fillStyle = rgba(c1, 0.95);
      b.beginPath();
      b.moveTo(r * 1.6, 0);
      b.lineTo(0, -r * 0.55);
      b.lineTo(-r * 1.2, 0);
      b.lineTo(0, r * 0.55);
      b.closePath();
      b.fill();
      b.fillStyle = rgba(c0, 0.9);
      b.beginPath();
      b.moveTo(r * 1.6, 0);
      b.lineTo(0, -r * 0.55);
      b.lineTo(-r * 0.2, 0);
      b.closePath();
      b.fill();
      break;
    }
    case 'rock': {
      b.rotate(spin * 6);
      b.fillStyle = rgba(c2, 1);
      b.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const rr = r * (0.8 + 0.25 * Math.sin(i * 2.7));
        if (i) b.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else b.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      b.closePath();
      b.fill();
      disc(b, -r * 0.25, -r * 0.25, r * 0.4, c1, 0.9);
      break;
    }
    case 'leaf': {
      b.rotate(spin * 10);
      b.fillStyle = rgba(c1, 0.95);
      b.beginPath();
      b.moveTo(-r * 1.3, 0);
      b.quadraticCurveTo(0, -r * 0.9, r * 1.3, 0);
      b.quadraticCurveTo(0, r * 0.9, -r * 1.3, 0);
      b.fill();
      line(b, -r * 1.1, 0, r * 1.1, 0, Math.max(1, r * 0.15), c2, 0.9);
      break;
    }
    case 'crescent': {
      b.globalCompositeOperation = 'lighter';
      b.rotate(ang);
      b.fillStyle = rgba(c0, 0.85);
      b.beginPath();
      b.arc(0, 0, r * 1.5, -1.3, 1.3);
      b.arc(-r * 0.6, 0, r * 1.3, 1.1, -1.1, true);
      b.closePath();
      b.fill();
      break;
    }
    case 'needle': {
      b.rotate(ang);
      line(b, -r * 1.6, 0, r * 1.4, 0, Math.max(1, r * 0.35), c1, 1);
      line(b, r * 0.4, 0, r * 1.5, 0, Math.max(1, r * 0.2), c0, 1);
      break;
    }
    case 'star': {
      b.globalCompositeOperation = 'lighter';
      b.rotate(spin * 8);
      glow(b, 0, 0, r * 2, c0, c1, 0.5);
      b.fillStyle = rgba(c0, 1);
      b.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 ? r * 0.45 : r * 1.2;
        if (i) b.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else b.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      b.closePath();
      b.fill();
      break;
    }
    default: {
      // Sphère : Ball'Ombre, Éco-Sphère, Bombe Beurk… Un cœur, un halo, et
      // pour l'Électrik et le Spectre, ce qui crépite ou fume autour.
      const dark = type === 'ghost' || type === 'dark' || type === 'poison';
      b.globalCompositeOperation = dark ? 'source-over' : 'lighter';
      if (!dark) glow(b, 0, 0, r * 2.4, c0, c1, 0.6);
      else glow(b, 0, 0, r * 2.2, c1, c1, 0.45);
      disc(b, 0, 0, r, dark ? c2 : c1, 0.95);
      disc(b, -r * 0.2, -r * 0.2, r * 0.5, c0, dark ? 0.55 : 0.95);
      if (type === 'electric') {
        b.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
          const a = spin * 20 + i * 2.1;
          polyline(b, zigzag(0, 0, Math.cos(a) * r * 2, Math.sin(a) * r * 2, 3, r * 0.5, spin * 30 + i), Math.max(1, r * 0.15), c0, 0.9);
        }
      }
    }
  }
  b.restore();
}

export class MoveFx {
  private effects: Effect[] = [];

  reset(): void {
    this.effects = [];
  }

  update(dt: number): void {
    for (const e of this.effects) {
      e.t += dt;
      e.update?.(dt);
    }
    this.effects = this.effects.filter((e) => e.t < e.end);
  }

  draw(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void {
    if (!this.effects.length) return;
    const v: View = {
      X: (x) => (x * TILE - camX) * k,
      Y: (y, h) => (y * TILE - h * TILE - camY) * k,
      S: TILE * k,
      k,
    };
    for (const e of this.effects) {
      b.save();
      e.draw(b, v);
      b.restore();
    }
  }

  /**
   * Joue la famille `style` d'une attaque de `type`, de `from` (le lanceur)
   * vers `to` (la cible, ou le point visé) ; les deux sont relus à chaque
   * image, l'effet suit qui bouge. `power` grossit les gros coups.
   */
  play(style: MoveStyle, type: string, from: Get, to: Get, arrive: number, power = 60, api?: string): void {
    const pal = (api && PALETTE_OF_MOVE[api]) || paletteOf(type);
    const sz = 0.75 + clamp01(power / 120) * 0.55;
    const make = BUILDERS[style];
    this.effects.push(make({ type, pal, from, to, arrive: Math.max(0, arrive), sz, api, seed: Math.random() * 1000 }));
  }
}

interface Ctx {
  type: string;
  pal: readonly [string, string, string];
  from: Get;
  to: Get;
  arrive: number;
  sz: number;
  api?: string;
  seed: number;
}

/** Sens (unitaire) du lanceur vers la cible, et la distance. */
function aim(c: Ctx): { dx: number; dy: number; d: number } {
  const f = c.from();
  const t = c.to();
  const d = Math.hypot(t.x - f.x, t.y - f.y);
  return d < 0.01 ? { dx: 0, dy: 1, d: 0 } : { dx: (t.x - f.x) / d, dy: (t.y - f.y) / d, d };
}

const BUILDERS: Record<MoveStyle, (c: Ctx) => Effect> = {
  // ── À distance ────────────────────────────────────────────────────────
  /** Rayon : une lueur qui grossit sur le lanceur, puis le trait plein jusqu'à la cible, qui s'amincit en s'éteignant. */
  beam(c) {
    const fire = Math.max(0, c.arrive - 0.06);
    const HOLD = 0.34;
    return {
      t: 0,
      end: fire + HOLD,
      draw(b, v) {
        const [c0, c1, c2] = c.pal;
        const f = c.from();
        const to = c.to();
        const x1 = v.X(f.x);
        const y1 = v.Y(f.y, BODY_H);
        const x2 = v.X(to.x);
        const y2 = v.Y(to.y, BODY_H);
        b.globalCompositeOperation = 'lighter';
        if (this.t < fire) {
          const u = this.t / Math.max(0.01, fire);
          glow(b, x1, y1, v.S * (0.25 + 0.45 * u) * c.sz, c0, c1, 0.5 + 0.5 * u);
          return;
        }
        const u = (this.t - fire) / HOLD;
        const ext = clamp01((this.t - fire) / 0.06);
        const ex = lerp(x1, x2, ext);
        const ey = lerp(y1, y2, ext);
        const flick = 0.85 + 0.15 * Math.sin(this.t * 90 + c.seed);
        const w = v.S * 0.5 * c.sz * (1 - u * u) * flick;
        line(b, x1, y1, ex, ey, w * 1.5, c2, 0.35);
        line(b, x1, y1, ex, ey, w, c1, 0.75);
        line(b, x1, y1, ex, ey, w * 0.4, c0, 1);
        glow(b, x1, y1, w * 1.4, c0, c1, 0.9);
        glow(b, ex, ey, w * 2.2, c0, c1, 0.95 * (1 - u));
        // Étincelles le long du trait.
        for (let i = 0; i < 6; i++) {
          const s = (c.seed * (i + 3) * 0.137 + this.t * 3) % 1;
          const px = lerp(x1, ex, s) + Math.sin(c.seed + i * 5 + this.t * 40) * w * 0.8;
          const py = lerp(y1, ey, s) + Math.cos(c.seed + i * 3 + this.t * 37) * w * 0.8;
          disc(b, px, py, Math.max(1, v.k * 0.8), c0, 0.9 * (1 - u));
        }
      },
    };
  },

  /** Projectile : il vole jusqu'à la cible en arc léger, avec sa traînée, puis éclate. */
  orb(c) {
    const travel = c.arrive > 0.2 ? Math.min(0.35, c.arrive) : Math.max(0.1, c.arrive);
    const start = Math.max(0, c.arrive - travel);
    const BURST = 0.2;
    return {
      t: 0,
      end: start + travel + BURST,
      draw(b, v) {
        if (this.t < start) return;
        const f = c.from();
        const to = c.to();
        const u = clamp01((this.t - start) / travel);
        const pos = (w: number) => ({
          x: v.X(lerp(f.x, to.x, w)),
          y: v.Y(lerp(f.y, to.y, w), BODY_H + Math.sin(Math.PI * w) * 0.35),
        });
        const r = v.S * 0.3 * c.sz;
        if (u < 1) {
          // Traînée : la tête aux positions passées, de plus en plus petite et pâle.
          b.globalCompositeOperation = c.type === 'ghost' || c.type === 'dark' || c.type === 'poison' ? 'source-over' : 'lighter';
          for (let i = 6; i >= 1; i--) {
            const w = u - i * 0.05;
            if (w <= 0) continue;
            const p = pos(w);
            disc(b, p.x, p.y, r * (1 - i / 8), c.pal[1], 0.45 * (1 - i / 7));
          }
          const p = pos(u);
          const q = pos(Math.max(0, u - 0.05));
          head(b, c.type, p.x, p.y, r, Math.atan2(p.y - q.y, p.x - q.x), this.t, c.pal, c.api);
          return;
        }
        const w = (this.t - start - travel) / BURST;
        const p = pos(1);
        b.globalCompositeOperation = 'lighter';
        glow(b, p.x, p.y, r * (2 + 4 * w), c.pal[0], c.pal[1], 1 - w);
        b.strokeStyle = rgba(c.pal[1], 1 - w);
        b.lineWidth = Math.max(1, v.k * 1.5 * (1 - w));
        b.beginPath();
        b.ellipse(p.x, p.y, r * (1 + 5 * easeOut(w)), r * (1 + 5 * easeOut(w)) * 0.6, 0, 0, Math.PI * 2);
        b.stroke();
      },
    };
  },

  /** Salve : quatre petits projectiles décalés (feuilles, étoiles, aiguilles…) qui convergent sur la cible. */
  volley(c) {
    const N = 4;
    const travel = c.arrive > 0.2 ? Math.min(0.3, c.arrive) : 0.14;
    const start = Math.max(0, c.arrive - travel);
    const shots = Array.from({ length: N }, (_, i) => ({ delay: i * 0.05, side: (i - (N - 1) / 2) * 0.55, spin: Math.random() }));
    return {
      t: 0,
      end: start + travel + N * 0.05 + 0.15,
      draw(b, v) {
        const f = c.from();
        const to = c.to();
        const { dx, dy } = aim(c);
        const r = v.S * 0.13 * c.sz;
        for (const s of shots) {
          const u = (this.t - start - s.delay) / travel;
          if (u < 0) continue;
          if (u >= 1) {
            const w = (u - 1) * travel / 0.15;
            if (w < 1) {
              b.globalCompositeOperation = 'lighter';
              glow(b, v.X(to.x), v.Y(to.y, BODY_H), r * (2 + 3 * w), c.pal[0], c.pal[1], 0.7 * (1 - w));
            }
            continue;
          }
          // Écart latéral qui se resserre : départ en éventail, arrivée groupée.
          const off = s.side * Math.sin(Math.PI * u);
          const x = lerp(f.x, to.x, u) - dy * off;
          const y = lerp(f.y, to.y, u) + dx * off;
          head(b, c.type, v.X(x), v.Y(y, BODY_H), r, Math.atan2(dy, dx), this.t + s.spin, c.pal, c.api);
        }
      },
    };
  },

  /** Souffle : un jet de particules en cône, du lanceur vers la cible (flammes, vent, fumée, poudreuse). */
  stream(c) {
    const from = Math.max(0, c.arrive - 0.1);
    const until = c.arrive + 0.22;
    const LIFE = 0.32;
    const parts: { x: number; y: number; vx: number; vy: number; t: number; r: number }[] = [];
    let acc = 0;
    const smoke = c.type === 'poison' || c.type === 'dark' || c.type === 'ground';
    return {
      t: 0,
      end: until + LIFE,
      update(dt) {
        if (this.t >= from && this.t < until) {
          acc += dt * 90;
          const f = c.from();
          const { dx, dy, d } = aim(c);
          const speed = Math.max(4, (d + 0.6) / LIFE);
          while (acc >= 1) {
            acc--;
            const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.5;
            const sp = speed * (0.8 + Math.random() * 0.4);
            parts.push({ x: f.x + dx * 0.3, y: f.y + dy * 0.3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, r: 0.08 + Math.random() * 0.08 });
          }
        }
        for (const p of parts) {
          p.t += dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
        while (parts.length && parts[0].t > LIFE) parts.shift();
      },
      draw(b, v) {
        const [c0, c1, c2] = c.pal;
        b.globalCompositeOperation = smoke ? 'source-over' : 'lighter';
        for (const p of parts) {
          const u = p.t / LIFE;
          const r = v.S * (p.r + u * 0.4) * c.sz;
          const col = u < 0.3 ? c0 : u < 0.65 ? c1 : c2;
          const x = v.X(p.x);
          const y = v.Y(p.y, BODY_H);
          if (smoke) disc(b, x, y, r, col, 0.55 * (1 - u));
          else glow(b, x, y, r * 1.6, col, c1, 0.75 * (1 - u));
        }
      },
    };
  },

  /** Ondes : trois arcs qui partent du lanceur vers la cible (cris, Surf, Vibrobscur). */
  wave(c) {
    const starts = [c.arrive - 0.12, c.arrive - 0.05, c.arrive + 0.02].map((s) => Math.max(0, s));
    const RUN = 0.24;
    const water = c.type === 'water' || c.api === 'sludge-wave';
    return {
      t: 0,
      end: starts[2] + RUN + 0.05,
      draw(b, v) {
        const f = c.from();
        const { dx, dy, d } = aim(c);
        const ang = Math.atan2(dy * 0.6, dx);
        b.globalCompositeOperation = 'lighter';
        starts.forEach((s, i) => {
          const u = (this.t - s) / RUN;
          if (u < 0 || u > 1) return;
          const rad = (0.4 + (d + 0.6) * easeOut(u)) * v.S;
          const a = 1 - u * u;
          b.strokeStyle = rgba(i === 1 ? c.pal[0] : c.pal[1], a);
          b.lineWidth = Math.max(1, v.S * (water ? 0.22 : 0.1) * c.sz * (1 - u * 0.5));
          b.lineCap = 'round';
          b.beginPath();
          b.ellipse(v.X(f.x), v.Y(f.y, BODY_H * 0.6), rad, rad * 0.62, 0, ang - 0.55, ang + 0.55);
          b.stroke();
          if (water) {
            // Écume sur la crête.
            for (let j = -2; j <= 2; j++) {
              const aa = ang + j * 0.22;
              disc(b, v.X(f.x) + Math.cos(aa) * rad, v.Y(f.y, BODY_H * 0.6) + Math.sin(aa) * rad * 0.62 - v.S * 0.12, v.S * 0.07, c.pal[0], a);
            }
          }
        });
      },
    };
  },

  /** Du ciel : la foudre qui tombe, des rochers ou des grêlons qui s'abattent, un pilier de lumière. */
  sky(c) {
    const hit = c.arrive;
    const bolt = c.type === 'electric';
    const falling = c.type === 'ice' || c.type === 'rock' || c.type === 'steel' || c.type === 'ground';
    const FALL = 0.22;
    const drops = Array.from({ length: 5 }, (_, i) => ({ ox: (Math.random() - 0.5) * 1.6, oy: (Math.random() - 0.5) * 1, delay: i * 0.04 - 0.08, spin: Math.random() }));
    return {
      t: 0,
      end: hit + 0.35,
      draw(b, v) {
        const to = c.to();
        const [c0, c1, c2] = c.pal;
        const gx = v.X(to.x);
        const gy = v.Y(to.y, 0);
        if (bolt) {
          // Un premier éclair à l'impact, un second, plus pâle, juste après.
          const u = (this.t - (hit - 0.03)) / 0.3;
          if (u < 0) return;
          b.globalCompositeOperation = 'lighter';
          const seed = c.seed + Math.floor(this.t * 25);
          const top = v.Y(to.y, 7);
          const pts = zigzag(gx + Math.sin(c.seed) * v.S, top, gx, gy - v.S * 0.2, 9, v.S * 0.45, seed);
          const a = u < 0.5 ? 1 : (1 - u) * 2;
          polyline(b, pts, v.S * 0.35 * c.sz, c2, 0.45 * a);
          polyline(b, pts, v.S * 0.16 * c.sz, c1, a);
          polyline(b, pts, v.S * 0.06 * c.sz, c0, a);
          glow(b, gx, gy - v.S * 0.2, v.S * 1.3 * c.sz, c0, c1, a);
          return;
        }
        if (falling) {
          for (const d of drops) {
            const u = (this.t - (hit - FALL + d.delay)) / FALL;
            if (u < 0) continue;
            const x = v.X(to.x + d.ox);
            const yGround = v.Y(to.y + d.oy, 0);
            if (u < 1) {
              const yy = v.Y(to.y + d.oy, lerp(5, 0.2, u * u));
              // L'ombre au sol grandit à mesure que la pierre descend.
              b.globalCompositeOperation = 'source-over';
              b.fillStyle = `rgba(0,0,0,${0.25 * u})`;
              b.beginPath();
              b.ellipse(x, yGround, v.S * 0.3 * u, v.S * 0.15 * u, 0, 0, Math.PI * 2);
              b.fill();
              head(b, c.type, x, yy, v.S * 0.28 * c.sz, Math.PI / 2, this.t + d.spin, c.pal);
            } else {
              const w = (u - 1) * FALL / 0.18;
              if (w > 1) continue;
              b.globalCompositeOperation = c.type === 'ice' ? 'lighter' : 'source-over';
              for (let i = 0; i < 5; i++) {
                const a = (i / 5) * Math.PI * 2 + d.spin;
                disc(b, x + Math.cos(a) * v.S * 0.5 * w, yGround + Math.sin(a) * v.S * 0.25 * w - v.S * 0.3 * Math.sin(Math.PI * w), Math.max(1, v.S * 0.06), i % 2 ? c1 : c2, 1 - w);
              }
            }
          }
          return;
        }
        // Pilier de lumière (Prescience, Carnareket, Piqué).
        const u = (this.t - (hit - 0.1)) / 0.45;
        if (u < 0) return;
        b.globalCompositeOperation = 'lighter';
        const w = v.S * 0.9 * c.sz * Math.sin(Math.PI * clamp01(u));
        const g = b.createLinearGradient(gx - w, 0, gx + w, 0);
        g.addColorStop(0, rgba(c1, 0));
        g.addColorStop(0.5, rgba(c0, 0.85));
        g.addColorStop(1, rgba(c1, 0));
        b.fillStyle = g;
        b.fillRect(gx - w, v.Y(to.y, 7), w * 2, gy - v.Y(to.y, 7));
        glow(b, gx, gy, w * 1.5, c0, c1, 1 - u);
      },
    };
  },

  /** Pouvoir mental : des anneaux qui se resserrent autour de la cible, qui ondule (Psyko, Choc Mental, Maléfice). */
  mind(c) {
    const s0 = Math.max(0, c.arrive - 0.12);
    const RUN = 0.42;
    return {
      t: 0,
      end: s0 + RUN + 0.1,
      draw(b, v) {
        const to = c.to();
        const x = v.X(to.x);
        const y = v.Y(to.y, BODY_H);
        const ghost = c.type === 'ghost' || c.type === 'dark';
        b.globalCompositeOperation = ghost ? 'source-over' : 'lighter';
        for (let i = 0; i < 3; i++) {
          const u = (this.t - s0 - i * 0.07) / RUN;
          if (u < 0 || u > 1) continue;
          const r = v.S * lerp(1.4, 0.25, easeOut(u)) * c.sz;
          b.strokeStyle = rgba(i === 1 ? c.pal[0] : c.pal[1], 0.9 * (1 - u * 0.6));
          b.lineWidth = Math.max(1, v.S * 0.08);
          b.beginPath();
          b.ellipse(x, y, r, r * 0.7, this.t * (i % 2 ? 3 : -3), 0, Math.PI * 2);
          b.stroke();
        }
        const u = clamp01((this.t - s0) / RUN);
        if (ghost) {
          // Volutes qui montent.
          for (let i = 0; i < 5; i++) {
            const w = (u + i * 0.2) % 1;
            disc(b, x + Math.sin(c.seed + i * 1.7 + this.t * 6) * v.S * 0.5, y - w * v.S * 1.2, v.S * 0.18 * (1 - w), c.pal[i % 2 ? 1 : 2], 0.6 * (1 - w));
          }
        } else glow(b, x, y, v.S * 0.9 * c.sz, c.pal[0], c.pal[1], 0.6 * Math.sin(Math.PI * u));
      },
    };
  },

  /** Tourbillon : des particules qui tournent en montant autour de la cible (Siphon, Danse Flammes, Vent Violent). */
  vortex(c) {
    const s0 = Math.max(0, c.arrive - 0.1);
    const RUN = 0.6;
    const N = 14;
    return {
      t: 0,
      end: s0 + RUN,
      draw(b, v) {
        const to = c.to();
        const u = (this.t - s0) / RUN;
        if (u < 0) return;
        const a0 = Math.sin(Math.PI * clamp01(u));
        b.globalCompositeOperation = c.type === 'ground' ? 'source-over' : 'lighter';
        for (let i = 0; i < N; i++) {
          const w = i / N;
          const ang = w * Math.PI * 6 + this.t * 14;
          const h = w * 1.8 * c.sz;
          const r = v.S * (0.4 + w * 0.7) * c.sz;
          disc(b, v.X(to.x) + Math.cos(ang) * r, v.Y(to.y, h) + Math.sin(ang) * r * 0.45, Math.max(1, v.S * (0.12 - w * 0.05)), c.pal[i % 3], a0 * 0.85);
        }
      },
    };
  },

  /**
   * Le sol : un anneau qui court, des fissures, des pierres qui sautent.
   * Séisme, Ampleur et Piétisol partent du lanceur ; Telluriforce et
   * Lames Ancestrales sortent du sol sous la cible, en pics.
   */
  quake(c) {
    const fromCaster = c.api === 'earthquake' || c.api === 'magnitude' || c.api === 'bulldoze' || c.api === 'stomping-tantrum';
    const spikes = c.api === 'earth-power' || c.api === 'precipice-blades' || c.api === 'rock-tomb';
    const s0 = Math.max(0, c.arrive - 0.06);
    const RUN = 0.45;
    const cracks = Array.from({ length: 6 }, (_, i) => ({ a: (i / 6) * Math.PI * 2 + Math.random() * 0.6, len: 0.8 + Math.random() * 0.8, seed: Math.random() * 99 }));
    return {
      t: 0,
      end: s0 + RUN,
      draw(b, v) {
        const u = (this.t - s0) / RUN;
        if (u < 0) return;
        const o = fromCaster ? c.from() : c.to();
        const x = v.X(o.x);
        const y = v.Y(o.y, 0);
        const [c0, c1, c2] = c.pal;
        const R = (fromCaster ? 2.6 : 1.3) * c.sz;
        b.globalCompositeOperation = 'source-over';
        // Fissures sombres.
        for (const k of cracks) {
          const len = v.S * k.len * R * 0.6 * easeOut(clamp01(u * 3));
          const pts = zigzag(x, y, x + Math.cos(k.a) * len, y + Math.sin(k.a) * len * 0.55, 4, v.S * 0.12, k.seed);
          polyline(b, pts, Math.max(1, v.S * 0.08), c2, 0.85 * (1 - u));
        }
        // L'onde qui court.
        const r = v.S * R * easeOut(u);
        b.strokeStyle = rgba(c1, 0.9 * (1 - u));
        b.lineWidth = Math.max(1, v.S * 0.18 * (1 - u));
        b.beginPath();
        b.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2);
        b.stroke();
        if (spikes) {
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 + c.seed;
            const px = x + Math.cos(a) * v.S * 0.55;
            const py = y + Math.sin(a) * v.S * 0.3;
            const hgt = v.S * 1.1 * c.sz * Math.sin(Math.PI * clamp01(u * 1.4));
            b.fillStyle = rgba(i % 2 ? c1 : c2, 1 - u * 0.5);
            b.beginPath();
            b.moveTo(px - v.S * 0.18, py);
            b.lineTo(px, py - hgt);
            b.lineTo(px + v.S * 0.18, py);
            b.closePath();
            b.fill();
          }
          if (c.type === 'ground' && c.api === 'earth-power') {
            b.globalCompositeOperation = 'lighter';
            glow(b, x, y - v.S * 0.4, v.S * 1.1 * c.sz, '#fff3b0', '#ff8a30', 0.8 * Math.sin(Math.PI * u));
          }
        }
        // Pierres qui sautent.
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + c.seed;
          const d = v.S * R * 0.8 * u;
          disc(b, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.55 - v.S * 0.7 * Math.sin(Math.PI * u), Math.max(1, v.S * 0.08), i % 2 ? c0 : c2, 1 - u);
        }
      },
    };
  },

  /** Absorption : des lueurs quittent la cible et reviennent au lanceur en serpentant (Vole-Vie, Giga-Sangsue). */
  drain(c) {
    const s0 = c.arrive;
    const RUN = 0.55;
    const motes = Array.from({ length: 9 }, (_, i) => ({ delay: i * 0.035, side: (Math.random() - 0.5) * 2.2 }));
    return {
      t: 0,
      end: s0 + RUN + 9 * 0.035 + 0.15,
      draw(b, v) {
        const f = c.from();
        const to = c.to();
        const { dx, dy } = aim(c);
        b.globalCompositeOperation = 'lighter';
        let landed = 0;
        for (const m of motes) {
          const u = (this.t - s0 - m.delay) / RUN;
          if (u < 0) continue;
          if (u >= 1) {
            landed++;
            continue;
          }
          const w = easeOut(u);
          const off = m.side * Math.sin(Math.PI * w);
          const x = lerp(to.x, f.x, w) - dy * off;
          const y = lerp(to.y, f.y, w) + dx * off;
          glow(b, v.X(x), v.Y(y, BODY_H), v.S * 0.3, c.pal[0], c.pal[1], 0.9);
        }
        if (landed) glow(b, v.X(f.x), v.Y(f.y, BODY_H), v.S * (0.6 + landed * 0.06), c.pal[0], c.pal[1], 0.5);
      },
    };
  },

  /** Explosion sur le lanceur. */
  blast(c) {
    const RUN = 0.55;
    return {
      t: 0,
      end: RUN,
      draw(b, v) {
        const f = c.from();
        const u = this.t / RUN;
        const x = v.X(f.x);
        const y = v.Y(f.y, BODY_H);
        b.globalCompositeOperation = 'lighter';
        glow(b, x, y, v.S * 3 * easeOut(u), '#fff6d0', '#ff8a30', 1 - u);
        b.strokeStyle = rgba('#ffd27a', 1 - u);
        b.lineWidth = Math.max(1, v.S * 0.25 * (1 - u));
        b.beginPath();
        b.ellipse(x, y, v.S * 3.2 * easeOut(u), v.S * 3.2 * easeOut(u) * 0.6, 0, 0, Math.PI * 2);
        b.stroke();
      },
    };
  },

  // ── Au contact ────────────────────────────────────────────────────────
  /** Morsure : deux mâchoires de crocs qui se referment sur la cible ; les crocs élémentaires y ajoutent leur halo. */
  bite(c) {
    const s0 = c.arrive;
    return {
      t: 0,
      end: s0 + 0.36,
      draw(b, v) {
        const u = this.t - s0;
        if (u < 0) return;
        const to = c.to();
        const x = v.X(to.x);
        const y = v.Y(to.y, BODY_H);
        const close = easeOut(clamp01(u / 0.09));
        const fade = 1 - clamp01((u - 0.16) / 0.2);
        const gap = v.S * 0.75 * (1 - close) * c.sz;
        const W = v.S * 0.75 * c.sz;
        const [c0, c1, c2] = c.pal;
        const elemental = c.type !== 'dark' && c.type !== 'normal' && c.type !== 'bug';
        if (elemental && u > 0.08) {
          b.globalCompositeOperation = 'lighter';
          glow(b, x, y, v.S * 1.2 * c.sz, c0, c1, 0.8 * fade);
        }
        b.globalCompositeOperation = 'source-over';
        // Mâchoire du haut (crocs vers le bas) puis du bas (vers le haut).
        for (const side of [-1, 1]) {
          const jy = y + side * (gap + v.S * 0.08);
          b.fillStyle = rgba('#ffffff', fade);
          b.strokeStyle = rgba(elemental ? c2 : '#1a1418', fade);
          b.lineWidth = Math.max(1, v.k);
          b.beginPath();
          b.moveTo(x - W, jy + side * v.S * 0.25);
          b.quadraticCurveTo(x, jy + side * v.S * 0.45, x + W, jy + side * v.S * 0.25);
          for (let i = 4; i >= 0; i--) {
            const fx = x - W + (i / 4) * W * 2;
            const fy = jy + side * v.S * 0.3 * (1 - Math.abs(i - 2) * 0.1);
            const tip = jy - side * v.S * (i === 1 || i === 3 ? 0.38 : 0.22);
            b.lineTo(fx + W * 0.2, fy);
            b.lineTo(fx, tip);
            b.lineTo(fx - W * 0.2, fy);
          }
          b.closePath();
          b.fill();
          b.stroke();
        }
      },
    };
  },

  /** Griffes : trois entailles parallèles tracées d'un geste, en biais. */
  claw(c) {
    return slashes(c, 3, 0.32, 1.55, false);
  },

  /** Lame : une seule grande entaille courbe (Tranche, Lame Feuille, Aéropique). */
  slash(c) {
    return slashes(c, 1, 0, 1.8, true);
  },

  /** Croix : deux entailles qui se croisent (Plaie Croix, Poison-Croix). */
  cross(c) {
    const a = slashes(c, 1, 0, 1.6, false, -0.8);
    const bb = slashes(c, 1, 0, 1.6, false, 0.8, 0.06);
    return { t: 0, end: Math.max(a.end, bb.end), draw(b, v) {
      a.t = bb.t = this.t;
      a.draw(b, v);
      bb.draw(b, v);
    } };
  },

  /** Poing : une étoile d'impact qui jaillit et un anneau ; les poings élémentaires flambent, gèlent ou crépitent. */
  punch(c) {
    return burst(c, 8, 1, false);
  },

  /** Pied : un arc de balayage, puis une étoile plus petite. */
  kick(c) {
    const sweep = slashes(c, 1, 0, 1.6, true, 0.4);
    const hit = burst(c, 6, 0.75, false, 0.06);
    return { t: 0, end: Math.max(sweep.end, hit.end), draw(b, v) {
      sweep.t = hit.t = this.t;
      sweep.draw(b, v);
      hit.draw(b, v);
    } };
  },

  /** Estoc : trois piqûres fines qui se plantent dans la cible, depuis l'attaquant. */
  stab(c) {
    const s0 = c.arrive;
    const jabs = [0, 0.05, 0.1].map((d, i) => ({ d, off: (i - 1) * 0.35 }));
    return {
      t: 0,
      end: s0 + 0.35,
      draw(b, v) {
        const to = c.to();
        const { dx, dy } = aim(c);
        b.globalCompositeOperation = 'lighter';
        for (const j of jabs) {
          const u = (this.t - s0 - j.d) / 0.18;
          if (u < 0 || u > 1) continue;
          const reach = easeOut(clamp01(u * 2));
          const tx = to.x - dy * j.off * 0.5;
          const ty = to.y + dx * j.off * 0.5;
          const x2 = v.X(tx + dx * 0.2);
          const y2 = v.Y(ty + dy * 0.2, BODY_H);
          const x1 = v.X(tx - dx * 1.4 * reach);
          const y1 = v.Y(ty - dy * 1.4 * reach, BODY_H);
          line(b, x1, y1, x2, y2, Math.max(1, v.S * 0.1 * c.sz), c.pal[1], 1 - u);
          line(b, (x1 + x2 * 2) / 3, (y1 + y2 * 2) / 3, x2, y2, Math.max(1, v.S * 0.05), c.pal[0], 1 - u);
          if (u > 0.4) glow(b, x2, y2, v.S * 0.5, c.pal[0], c.pal[1], 1 - u);
        }
      },
    };
  },

  /** Fouet : une liane, une queue ou une langue qui part de l'attaquant et claque sur la cible. */
  whip(c) {
    const s0 = Math.max(0, c.arrive - 0.08);
    const RUN = 0.3;
    const bend = Math.random() < 0.5 ? -1 : 1;
    return {
      t: 0,
      end: s0 + RUN,
      draw(b, v) {
        const u = (this.t - s0) / RUN;
        if (u < 0) return;
        const f = c.from();
        const to = c.to();
        const { dx, dy, d } = aim(c);
        // Déployée jusqu'à 30 % du temps, puis elle se rétracte.
        const ext = u < 0.3 ? easeOut(u / 0.3) : 1 - (u - 0.3) / 0.7;
        const cx = (f.x + to.x) / 2 - dy * d * 0.35 * bend;
        const cy = (f.y + to.y) / 2 + dx * d * 0.35 * bend;
        const pt = (w: number) => {
          const a = (1 - w) * (1 - w);
          const m = 2 * (1 - w) * w;
          const z = w * w;
          return { x: v.X(a * f.x + m * cx + z * to.x), y: v.Y(a * f.y + m * cy + z * to.y, BODY_H) };
        };
        b.globalCompositeOperation = 'source-over';
        b.strokeStyle = rgba(c.pal[2], 1);
        b.lineWidth = Math.max(1, v.S * 0.14 * c.sz);
        b.lineCap = 'round';
        b.beginPath();
        const steps = 14;
        for (let i = 0; i <= steps; i++) {
          const p = pt((i / steps) * ext);
          if (i) b.lineTo(p.x, p.y);
          else b.moveTo(p.x, p.y);
        }
        b.stroke();
        b.strokeStyle = rgba(c.pal[1], 1);
        b.lineWidth = Math.max(1, v.S * 0.06 * c.sz);
        b.stroke();
        if (u > 0.22 && u < 0.6) {
          const p = pt(1);
          b.globalCompositeOperation = 'lighter';
          glow(b, p.x, p.y, v.S * 0.8, c.pal[0], c.pal[1], 1 - (u - 0.22) / 0.38);
        }
      },
    };
  },

  /** Ruée : des traits de vitesse derrière l'attaquant, un nuage de poussière et une étoile sur la cible. */
  charge(c) {
    const hit = burst(c, 6, 0.9, true);
    const lines = Array.from({ length: 5 }, () => ({ off: (Math.random() - 0.5) * 0.9, len: 0.8 + Math.random() * 0.8 }));
    return {
      t: 0,
      end: hit.end,
      draw(b, v) {
        hit.t = this.t;
        const u = this.t / 0.25;
        if (u < 1) {
          const f = c.from();
          const { dx, dy } = aim(c);
          for (const l of lines) {
            const bx = f.x - dy * l.off * 0.6;
            const by = f.y + dx * l.off * 0.6;
            line(b, v.X(bx - dx * 0.3), v.Y(by - dy * 0.3, BODY_H), v.X(bx - dx * (0.3 + l.len)), v.Y(by - dy * (0.3 + l.len), BODY_H), Math.max(1, v.k), '#ffffff', 0.7 * (1 - u));
          }
        }
        hit.draw(b, v);
      },
    };
  },

  /** Coup de masse : grosse étoile, onde au sol et fissures. */
  smash(c) {
    const hit = burst(c, 10, 1.35, true);
    const ground = BUILDERS.quake({ ...c, api: undefined, sz: c.sz * 0.7 });
    return { t: 0, end: Math.max(hit.end, ground.end), draw(b, v) {
      hit.t = ground.t = this.t;
      ground.draw(b, v);
      hit.draw(b, v);
    } };
  },
};

/**
 * Entailles (griffes, lame, croix, balayage de pied) : `n` traits parallèles
 * espacés de `gap` cases, longs de `len`, tracés en 0,08 s puis effacés.
 * `curve` les cintre ; `tilt` incline par rapport au sens du coup.
 */
function slashes(c: Ctx, n: number, gap: number, len: number, curve: boolean, tilt = 0.75, delay = 0): Effect {
  const s0 = c.arrive + delay;
  return {
    t: 0,
    end: s0 + 0.32,
    draw(b, v) {
      const u = this.t - s0;
      if (u < 0) return;
      const to = c.to();
      const { dx, dy } = aim(c);
      const draw = easeOut(clamp01(u / 0.08));
      const fade = 1 - clamp01((u - 0.1) / 0.22);
      // Le trait est perpendiculaire au coup, incliné de `tilt`.
      const a = Math.atan2(dy, dx) + Math.PI / 2 + tilt;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      b.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * gap;
        const ox = to.x + dx * off;
        const oy = to.y + dy * off;
        const L = len * c.sz;
        const x1 = v.X(ox - ux * L * 0.5);
        const y1 = v.Y(oy - uy * L * 0.5, BODY_H);
        const x2 = v.X(ox - ux * L * 0.5 + ux * L * draw);
        const y2 = v.Y(oy - uy * L * 0.5 + uy * L * draw, BODY_H);
        const w = v.S * (curve ? 0.32 : 0.18) * c.sz;
        streak(b, x1, y1, x2, y2, w * 1.6, c.pal[1], 0.55 * fade);
        streak(b, x1, y1, x2, y2, w * 0.7, c.pal[0], fade);
      }
    },
  };
}

/** Étoile d'impact à `spikes` branches, avec anneau ; `dust` y ajoute un nuage de poussière. */
function burst(c: Ctx, spikes: number, scale: number, dust: boolean, delay = 0): Effect {
  const s0 = c.arrive + delay;
  const RUN = 0.3;
  const rot = Math.random() * Math.PI;
  return {
    t: 0,
    end: s0 + RUN + 0.1,
    draw(b, v) {
      const u = (this.t - s0) / RUN;
      if (u < 0 || u > 1) return;
      const to = c.to();
      const x = v.X(to.x);
      const y = v.Y(to.y, BODY_H);
      const [c0, c1] = c.pal;
      const R = v.S * 0.9 * scale * c.sz;
      if (dust) {
        b.globalCompositeOperation = 'source-over';
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + rot;
          const d = R * 1.1 * easeOut(u);
          disc(b, x + Math.cos(a) * d, v.Y(to.y, 0.1) + Math.sin(a) * d * 0.45, R * 0.3 * (1 - u * 0.5), '#d8cdb8', 0.55 * (1 - u));
        }
      }
      b.globalCompositeOperation = 'lighter';
      const grow = easeOut(clamp01(u / 0.35));
      const a0 = 1 - clamp01((u - 0.3) / 0.7);
      b.fillStyle = rgba(c0, a0);
      b.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const a = rot + (i / (spikes * 2)) * Math.PI * 2;
        const r = (i % 2 ? 0.35 : 1) * R * grow;
        if (i) b.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8);
        else b.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8);
      }
      b.closePath();
      b.fill();
      glow(b, x, y, R * 1.2 * grow, c0, c1, a0 * 0.8);
      b.strokeStyle = rgba(c1, a0);
      b.lineWidth = Math.max(1, v.S * 0.1 * (1 - u));
      b.beginPath();
      b.ellipse(x, y, R * 1.4 * easeOut(u), R * 1.4 * easeOut(u) * 0.7, 0, 0, Math.PI * 2);
      b.stroke();
    },
  };
}
