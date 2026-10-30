import { loadImage } from '../assets/pmd';
import { MOVE_SHEETS, TYPE_SHEETS } from '../data/attackanims';
import { TILE } from '../world/tiles';

// Retour visuel du combat, repris de CombatVFX.gd et AttackAnim.gd : impacts
// et étincelles à la couleur du type, nuage de K.O., planches d'attaque
// d'Essentials, orbes des attaques spéciales, chiffres de dégâts.
//
// Positions en cases (comme les acteurs), avec une hauteur `h` en cases
// au-dessus du sol : vu de dessus, elle remonte simplement à l'écran.
// Les chiffres de dégâts sont des éléments HTML posés sur le canvas : un
// texte de 8 px dans un tampon de 270 px de haut serait illisible.

/** CombatVFX.TYPE_COLORS : couleur d'impact par type (repli : blanc chaud). */
const TYPE_COLORS: Record<string, string> = {
  fire: '#ff8c33', water: '#59a6ff', grass: '#80e566', electric: '#ffe640', ice: '#a6e5ff',
  fighting: '#e5664d', poison: '#b86bd9', ground: '#d9ad66', flying: '#b8ccf2', psychic: '#ff73b8',
  bug: '#b3d14d', rock: '#c7ad73', ghost: '#8c73cc', dragon: '#738cf2', dark: '#8c7a8c',
  steel: '#bfcce0', fairy: '#ffb3e0', normal: '#fff2c7',
};

export function typeColor(type: string): string {
  return TYPE_COLORS[type] ?? TYPE_COLORS.normal;
}

/** Case d'Essentials (192 px) ramenée à 2,6 cases de large, comme AttackAnim.WORLD_SIZE. */
const CELL = 192;
const ANIM_PX = Math.round(2.6 * TILE);

/** CombatVFX.spawn_damage_number : taille (font_size × pixel_size 0,01 → cases), couleur, texte. */
export type NumberKind = 'immune' | 'super' | 'weak' | 'player' | 'heal' | 'crit' | 'dodge' | 'normal' | 'buff' | 'debuff';
const NUMBER_STYLE: Record<NumberKind, { size: number; color: string; text?: string; bang?: boolean }> = {
  immune: { size: 40, color: '#999aa6', text: '∅' },
  super: { size: 64, color: '#ff9e1f', bang: true },
  weak: { size: 40, color: '#b8b8b8' },
  player: { size: 52, color: '#ff4d40' },
  heal: { size: 46, color: '#59f273', text: '+PV' },
  crit: { size: 60, color: '#ffd933', bang: true },
  dodge: { size: 44, color: '#8cd9ff', text: 'ESQUIVE !' },
  normal: { size: 50, color: '#faf2e0' },
  // Hausse ou baisse de stat : doré comme les étiquettes de buff du jeu, bleu pour une baisse.
  buff: { size: 40, color: '#ffd959' },
  debuff: { size: 40, color: '#7fb8ff' },
};

/** CombatVFX.kind_from_multiplier */
export function kindFromMultiplier(mult: number): NumberKind {
  if (mult <= 0.01) return 'immune';
  if (mult > 1.01) return 'super';
  if (mult < 0.99) return 'weak';
  return 'normal';
}

interface Impact {
  x: number;
  y: number;
  h: number;
  color: string;
  t: number;
}
interface Spark {
  x: number;
  y: number;
  h: number;
  vx: number;
  vy: number;
  vh: number;
  t: number;
  color: string;
}
interface Poof {
  x: number;
  y: number;
  t: number;
  seed: number;
}
interface PlayingAnim {
  frames: HTMLCanvasElement[];
  fps: number;
  x: number;
  y: number;
  h: number;
  t: number;
}
interface BallSend {
  x: number;
  y: number;
  t: number;
  seed: number;
}
interface FloatingNumber {
  el: HTMLElement;
  x: number;
  y: number;
  h: number;
  t: number;
  size: number;
}

/** Projection monde → écran fournie par le renderer (px CSS) ; `perTile` = px CSS par case. */
export interface Projector {
  toCss(x: number, y: number): { x: number; y: number };
  perTile: number;
}

export class CombatFx {
  private impacts: Impact[] = [];
  private sparks: Spark[] = [];
  private poofs: Poof[] = [];
  private anims: PlayingAnim[] = [];
  private numbers: FloatingNumber[] = [];
  private balls: BallSend[] = [];
  /** Planches d'Essentials (Graphics/Battle animations), chargées une fois. */
  private ballImg: Record<string, HTMLImageElement> = {};
  private readonly sheets = new Map<string, Promise<HTMLCanvasElement[]>>();
  private readonly layer: HTMLElement;

  constructor(parent: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.id = 'fx-layer';
    parent.append(this.layer);
    for (const f of ['ball_BEASTBALL', 'ball_BEASTBALL_open', 'ballBurst_particle', 'ballBurst_particle_s', 'ballBurst_dazzle']) {
      void loadImage(`/game/assets/essentials/battle/${f}.png`)
        .then((img) => (this.ballImg[f] = img))
        .catch(() => {});
    }
  }

  /**
   * Envoi d'un Pokémon de champion (PokeballFX.play_send) : la ball apparaît
   * sur place dans un éclat, tourne 0,55 s, puis s'ouvre dans une gerbe de
   * 8 étincelles pendant que le Pokémon se matérialise.
   */
  ballSend(x: number, y: number): void {
    this.balls.push({ x, y, t: 0, seed: Math.random() * Math.PI });
  }

  reset(): void {
    this.impacts = [];
    this.sparks = [];
    this.poofs = [];
    this.balls = [];
    this.anims = [];
    for (const n of this.numbers) n.el.remove();
    this.numbers = [];
  }

  /** CombatVFX.spawn_impact : un éclat qui grossit en s'effaçant, et 9 étincelles en éventail. */
  impact(x: number, y: number, color: string, dirX = 0, dirY = 1): void {
    this.impacts.push({ x, y, h: 0.6, color, t: 0 });
    const base = Math.atan2(dirY, dirX);
    for (let i = 0; i < 9; i++) {
      // Dispersion de 170° autour de la direction du coup.
      const a = base + (Math.random() - 0.5) * (170 * Math.PI) / 180;
      const v = 2.6 + Math.random() * 2.6;
      this.sparks.push({ x, y, h: 0.6, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6, vh: 1.5 + Math.random() * 2, t: 0, color });
    }
  }

  /** CombatVFX.spawn_death_poof */
  poof(x: number, y: number): void {
    this.poofs.push({ x, y, t: 0, seed: Math.random() * 10 });
  }

  /**
   * Planche d'attaque jouée une fois sur la cible (ou au point du coup dans
   * le vide) : celle de la capacité si elle en a une, sinon celle du type.
   */
  attackAnim(type: string, x: number, y: number, move?: string): void {
    const def = (move && MOVE_SHEETS[move]) || TYPE_SHEETS[type] || TYPE_SHEETS.normal;
    const key = `${def.file}|${def.tint ?? ''}|${def.frames ?? ''}`;
    let pending = this.sheets.get(key);
    if (!pending) {
      pending = sliceSheet(def.file, def.tint).then((all) => (def.frames ? all.slice(def.frames[0], def.frames[1] + 1) : all));
      this.sheets.set(key, pending);
    }
    void pending.then((frames) => {
      // AttackAnim.gd:108 : toute la planche en ~0,3 s, sans dépasser 22 images/s.
      if (frames.length) this.anims.push({ frames, fps: Math.min(22, frames.length / 0.3), x, y, h: 1, t: 0 });
    });
  }

  /** `text` remplace le montant (« ATT ↑ », « +12 »…). */
  number(kind: NumberKind, x: number, y: number, amount = 0, text?: string): void {
    const style = NUMBER_STYLE[kind];
    const el = document.createElement('span');
    el.className = 'dmg';
    el.textContent = text ?? style.text ?? `${amount}${style.bang ? ' !' : ''}`;
    el.style.color = style.color;
    this.layer.append(el);
    // Apparition légèrement au hasard autour de la tête (CombatVFX.gd:44).
    this.numbers.push({ el, x: x + (Math.random() - 0.5) * 0.7, y: y + (Math.random() - 0.5) * 0.3, h: 1.7, t: 0, size: style.size * 0.01 });
  }

  update(dt: number): void {
    for (const i of this.impacts) i.t += dt;
    this.impacts = this.impacts.filter((i) => i.t < 0.18);
    for (const s of this.sparks) {
      s.t += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.h = Math.max(0, s.h + s.vh * dt);
      s.vh -= 5 * dt;
    }
    this.sparks = this.sparks.filter((s) => s.t < 0.3);
    for (const p of this.poofs) p.t += dt;
    this.poofs = this.poofs.filter((p) => p.t < 0.45);
    for (const ball of this.balls) ball.t += dt;
    this.balls = this.balls.filter((ball) => ball.t < 1.05);
    for (const a of this.anims) a.t += dt;
    this.anims = this.anims.filter((a) => a.t * a.fps < a.frames.length);
    for (const n of this.numbers) n.t += dt;
    this.numbers = this.numbers.filter((n) => {
      if (n.t < 0.75) return true;
      n.el.remove();
      return false;
    });
  }

  /** Dessin dans le tampon (après les Pokémon). `k` : densité de pixels du tampon. */
  draw(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void {
    const sx = (x: number) => Math.round((x * TILE - camX) * k);
    const sy = (y: number, h: number) => Math.round((y * TILE - h * TILE - camY) * k);

    for (const a of this.anims) {
      const f = a.frames[Math.min(a.frames.length - 1, Math.floor(a.t * a.fps))];
      b.drawImage(f, sx(a.x) - (ANIM_PX * k) / 2, sy(a.y, a.h) - (ANIM_PX * k) / 2, ANIM_PX * k, ANIM_PX * k);
    }

    b.globalCompositeOperation = 'lighter';
    for (const i of this.impacts) {
      const u = i.t / 0.18;
      const r = (0.45 + 1.25 * u) * 0.5 * TILE * k;
      const g = b.createRadialGradient(sx(i.x), sy(i.y, i.h), 0, sx(i.x), sy(i.y, i.h), r);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - u)})`);
      g.addColorStop(0.35, withAlpha(i.color, 0.7 * (1 - u)));
      g.addColorStop(1, withAlpha(i.color, 0));
      b.fillStyle = g;
      b.fillRect(sx(i.x) - r, sy(i.y, i.h) - r, r * 2, r * 2);
    }
    for (const s of this.sparks) {
      b.fillStyle = withAlpha(s.color, 1 - s.t / 0.3);
      b.fillRect(sx(s.x), sy(s.y, s.h), k, k);
    }
    b.globalCompositeOperation = 'source-over';

    this.drawBalls(b, camX, camY, k);

    for (const p of this.poofs) {
      const u = p.t / 0.45;
      b.fillStyle = `rgba(235,235,242,${0.85 * (1 - u)})`;
      for (let i = 0; i < 6; i++) {
        const a = p.seed + (i * Math.PI * 2) / 6;
        const d = (0.25 + 0.55 * u) * TILE;
        const r = Math.max(1, Math.round((3.5 - 1.5 * u) * k));
        const cx = sx(p.x) + Math.round(Math.cos(a) * d * k);
        const cy = sy(p.y, 0.4) + Math.round(Math.sin(a) * d * 0.6 * k - u * 4 * k);
        b.beginPath();
        b.arc(cx, cy, r, 0, Math.PI * 2);
        b.fill();
      }
    }
  }

  private drawBalls(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void {
    const img = this.ballImg;
    const SPIN = 0.55;
    // Les planches d'Essentials sont dessinées en ×2 : moitié de taille pour retrouver le pixel du décor.
    const put = (src: HTMLImageElement | undefined, sx: number, sw: number, sh: number, cx: number, cy: number, scale: number, alpha: number) => {
      if (!src || alpha <= 0) return;
      b.globalAlpha = Math.min(1, alpha);
      const w = sw * scale * k;
      const h = sh * scale * k;
      b.drawImage(src, sx, 0, sw, sh, Math.round(cx - w / 2), Math.round(cy - h / 2), Math.round(w), Math.round(h));
      b.globalAlpha = 1;
    };
    for (const ball of this.balls) {
      const cx = (ball.x * TILE - camX) * k;
      const cy = (ball.y * TILE - 0.9 * TILE - camY) * k;
      const t = ball.t;
      b.globalCompositeOperation = 'lighter';
      // Éclat d'apparition : 0,3 → 1,4 en 0,22 s, effacé en 0,26 s.
      if (t < 0.26) put(img.ballBurst_dazzle, 0, 128, 128, cx, cy, 0.15 * (0.3 + 1.1 * Math.min(1, t / 0.22)), 1 - t / 0.26);
      if (t >= SPIN) {
        const u = t - SPIN;
        // Gerbe : éclat central 0,4 → 1,8 en 0,3 s, 8 étincelles projetées en 0,4 s.
        put(img.ballBurst_dazzle, 0, 128, 128, cx, cy, 0.15 * (0.4 + 1.4 * Math.min(1, u / 0.3)), 1 - u / 0.34);
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI * 2) / 8 + Math.sin(ball.seed + i) * 0.2;
          const d = (0.9 + 0.6 * ((i * 0.37) % 1)) * Math.min(1, u / 0.4) * TILE * k;
          put(i % 2 ? img.ballBurst_particle_s : img.ballBurst_particle, 0, 64, 64, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, 0.25, 1 - u / 0.42);
        }
      }
      b.globalCompositeOperation = 'source-over';
      if (t < SPIN) {
        // La ball tourne : frames 0 → 16 (modulo 8) de la bande de 8 cases de 32 × 64.
        const frame = Math.floor((t / SPIN) * 16) % 8;
        put(img.ball_BEASTBALL, frame * 32, 32, 64, cx, cy, 0.5, 1);
      } else {
        // Ouverte, elle monte d'une demi-case en s'effaçant (0,45 s).
        const u = (t - SPIN) / 0.45;
        put(img.ball_BEASTBALL_open, 0, 32, 64, cx, cy - 0.5 * TILE * k * Math.min(1, u), 0.5, 1 - u);
      }
    }
  }

  /** Orbe d'attaque spéciale (Projectile.gd:62-82) : halo à la couleur du type et cœur blanc. */
  drawOrb(b: CanvasRenderingContext2D, camX: number, camY: number, k: number, x: number, y: number, h: number, color: string): void {
    const cx = Math.round((x * TILE - camX) * k);
    const cy = Math.round((y * TILE - h * TILE - camY) * k);
    b.globalCompositeOperation = 'lighter';
    const r = 0.35 * TILE * k;
    const g = b.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, withAlpha(color, 0.95));
    g.addColorStop(1, withAlpha(color, 0));
    b.fillStyle = g;
    b.fillRect(cx - r, cy - r, r * 2, r * 2);
    b.globalCompositeOperation = 'source-over';
    b.fillStyle = '#fff';
    const c = Math.max(1, Math.round(1.5 * k));
    b.fillRect(cx - c, cy - c, c * 2, c * 2);
  }

  /** Les chiffres suivent la caméra : à repositionner à chaque image. */
  placeNumbers(proj: Projector): void {
    for (const n of this.numbers) {
      // Montée de 1,1 case en 0,7 s (cubique, ralentit), fondu après 0,4 s.
      const u = Math.min(1, n.t / 0.7);
      const rise = 1.1 * (1 - (1 - u) ** 3);
      const p = proj.toCss(n.x, n.y - n.h - rise);
      n.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
      n.el.style.fontSize = `${Math.round(n.size * proj.perTile)}px`;
      n.el.style.opacity = String(n.t < 0.4 ? 1 : Math.max(0, 1 - (n.t - 0.4) / 0.35));
    }
  }
}

/** '#rrggbb' → rgba avec l'alpha donné. */
export function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
}

/**
 * Découpe une planche Essentials en cases de 192 px, ligne par ligne, en
 * sautant les cases vides (AttackAnim.gd:90-101). Chaque case est réduite
 * une fois, lissée, à la taille d'affichage : un pas de 192 → 42 px au plus
 * proche voisin perdrait la moitié du dessin.
 */
async function sliceSheet(file: string, tint?: string): Promise<HTMLCanvasElement[]> {
  const img = await loadImage(`/game/assets/essentials/animations/${encodeURIComponent(file)}.png`).catch(() => null);
  if (!img) return [];
  const probe = document.createElement('canvas');
  probe.width = CELL;
  probe.height = CELL;
  const pg = probe.getContext('2d', { willReadFrequently: true })!;
  const frames: HTMLCanvasElement[] = [];
  for (let row = 0; row < Math.floor(img.height / CELL); row++) {
    for (let col = 0; col < Math.floor(img.width / CELL); col++) {
      pg.clearRect(0, 0, CELL, CELL);
      pg.drawImage(img, col * CELL, row * CELL, CELL, CELL, 0, 0, CELL, CELL);
      const px = pg.getImageData(0, 0, CELL, CELL).data;
      let opaque = false;
      for (let i = 3; i < px.length; i += 16) {
        if (px[i] > 8) {
          opaque = true;
          break;
        }
      }
      if (!opaque) continue;
      const c = document.createElement('canvas');
      c.width = ANIM_PX * 2;
      c.height = ANIM_PX * 2;
      const g = c.getContext('2d')!;
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(probe, 0, 0, c.width, c.height);
      if (tint) {
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = tint;
        g.fillRect(0, 0, c.width, c.height);
        g.globalCompositeOperation = 'destination-in';
        g.drawImage(probe, 0, 0, c.width, c.height);
      }
      frames.push(c);
    }
  }
  return frames;
}
