import { loadImage } from '../assets/pmd';
import type { Exit, WorldMap } from '../world/generate';
import { TILE } from '../world/tiles';

// Dresseur d'un champion, repris de TrainerNPC.gd : planche RPG Maker 4 × 4
// d'Essentials (cases de 32 × 48 : bas, gauche, droite, haut), 6 images/s.
// Il fait les cent pas devant la sortie pendant le combat, puis s'enfuit par
// elle quand son équipe tombe. Il ne se bat pas et ne se frappe pas.
//
// Écarts voulus avec le jeu : il reste sur les cases franchissables (le jeu ne
// testait rien et pouvait sortir de la carte), et sa fuite le fait vraiment
// quitter la salle (le jeu le renvoyait sur son propre point d'ancrage).
//
// Sert aussi au sbire des grottes (run/cave.ts) : ancré au cœur de l'arène,
// il s'arrête et se tourne vers sa cible pour lancer ses Poké Balls (`aim`),
// puis s'enfuit par la bouche de la grotte (`fleeTo`).

const FRAME_W = 32;
const FRAME_H = 48;
/** Les planches d'Essentials sont prévues pour des cases de 32 px : moitié de taille ici. */
const SCALE = 0.5;
const WANDER_RADIUS = 3.5;
const WANDER_SPEED = 2.2;
const FLEE_SPEED = 6.5;
/**
 * Dresseur de salle au combat (`direct`) : il se tient à tant de cases derrière ses
 * Pokémon, à l'opposé du joueur ; il recule s'il l'approche de plus près que KEEP_OUT.
 */
const COMMAND_BACK = 3.2;
const KEEP_OUT = 4;
const COMMAND_SPEED = 2.8;
const RETREAT_SPEED = 3.6;

export class Trainer {
  x: number;
  y: number;
  /** Ligne de la planche : 0 bas, 1 gauche, 2 droite, 3 haut. */
  private row = 0;
  private animT = 0;
  private moving = false;
  private waitT = 1.2;
  private target: { x: number; y: number } | null = null;
  private fleeing = false;
  gone = false;
  image: HTMLImageElement | null = null;
  private readonly anchorX: number;
  private readonly anchorY: number;
  /** Arrêté (s) : il vise, puis reprend ses cent pas. */
  private holdT = 0;

  /** Le dresseur d'un champion : deux cases devant la sortie, côté salle (visible, sans boucher le passage). */
  static atExit(sprite: string, exit: Exit): Trainer {
    const inX = exit.side === 'W' ? 2.5 : exit.side === 'E' ? -2.5 : 0;
    const inY = exit.side === 'N' ? 2.5 : exit.side === 'S' ? -2.5 : 0;
    return new Trainer(sprite, { x: exit.x + inX, y: exit.y + inY }, exit);
  }

  constructor(
    sprite: string,
    anchor: { x: number; y: number },
    private readonly exit: Exit | null = null,
    private readonly wanderRadius = WANDER_RADIUS,
  ) {
    this.anchorX = this.x = anchor.x;
    this.anchorY = this.y = anchor.y;
    void loadImage(`/game/assets/essentials/trainers/${sprite}`)
      .then((img) => (this.image = img))
      .catch(() => {});
  }

  /** TrainerNPC.flee_to : il part en courant par la sortie, au-delà du bord de la carte. */
  flee(world: WorldMap): void {
    const e = this.exit;
    if (!e) return;
    this.fleeing = true;
    this.target = {
      x: e.side === 'W' ? -2 : e.side === 'E' ? world.w + 2 : e.x,
      y: e.side === 'N' ? -2 : e.side === 'S' ? world.h + 2 : e.y,
    };
  }

  /** Fuite vers un point précis (la bouche d'une grotte) : il disparaît en l'atteignant. */
  fleeTo(x: number, y: number): void {
    this.fleeing = true;
    this.holdT = 0;
    this.target = { x, y };
  }

  /** Il s'arrête `t` s, tourné vers (x, y) : le temps de viser et de lancer. */
  aim(x: number, y: number, t: number): void {
    if (this.fleeing) return;
    this.holdT = t;
    this.target = null;
    this.moving = false;
    const dx = x - this.x;
    const dy = y - this.y;
    this.row = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 0;
  }

  update(dt: number, world: WorldMap, random: () => number): void {
    this.animT += dt;
    if (this.holdT > 0) {
      this.holdT -= dt;
      return;
    }
    if (!this.target) {
      this.moving = false;
      this.waitT -= dt;
      if (this.waitT > 0) return;
      // Prochaine étape : un point au hasard autour de l'ancre, sur une case franchissable.
      for (let tries = 0; tries < 8; tries++) {
        const a = random() * Math.PI * 2;
        const d = 1 + random() * (this.wanderRadius - 1);
        const x = this.anchorX + Math.cos(a) * d;
        const y = this.anchorY + Math.sin(a) * d;
        const cx = Math.floor(x);
        const cy = Math.floor(y - 0.1);
        if (cx < 1 || cy < 1 || cx >= world.w - 1 || cy >= world.h - 1) continue;
        const i = cy * world.w + cx;
        if (world.blocked[i] || world.water[i]) continue;
        this.target = { x, y };
        break;
      }
      this.waitT = 1.2 + random() * 1.8;
      return;
    }
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const d = Math.hypot(dx, dy);
    const step = (this.fleeing ? FLEE_SPEED : WANDER_SPEED) * dt;
    this.moving = true;
    this.row = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 0;
    if (d <= Math.max(0.15, step)) {
      this.x = this.target.x;
      this.y = this.target.y;
      this.target = null;
      if (this.fleeing) this.gone = true;
      return;
    }
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
  }

  /**
   * Dresseur de salle (run/room.ts), à la place des cent pas au hasard (retour de test :
   * « les dresseurs ont des comportements bizarres, ils se baladent au pif ; il faudrait
   * de la logique dans leur façon de combattre »). Avant son tour, il garde sa place,
   * tourné vers le joueur, et n'en bouge que de quelques pas. Ses Pokémon sortis, il les
   * mène : il se poste derrière eux, du côté opposé au joueur, toujours face à lui, et
   * recule si le joueur fonce sur lui. `mons` : ses Pokémon encore debout.
   */
  direct(dt: number, world: WorldMap, player: { x: number; y: number }, mons: readonly { x: number; y: number }[], random: () => number): void {
    if (this.fleeing || this.holdT > 0) {
      this.update(dt, world, random);
      return;
    }
    this.animT += dt;
    const face = () => {
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      this.row = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 0;
    };
    const pd = Math.hypot(player.x - this.x, player.y - this.y);
    let goal: { x: number; y: number } | null = null;
    let speed = COMMAND_SPEED;
    if (pd < KEEP_OUT) {
      // Trop près : il recule, droit à l'opposé du joueur.
      const k = (KEEP_OUT + 1.5) / Math.max(0.01, pd);
      goal = { x: player.x + (this.x - player.x) * k, y: player.y + (this.y - player.y) * k };
      speed = RETREAT_SPEED;
    } else if (mons.length) {
      // Derrière ses Pokémon, sur l'axe joueur → Pokémon.
      const cx = mons.reduce((s, m) => s + m.x, 0) / mons.length;
      const cy = mons.reduce((s, m) => s + m.y, 0) / mons.length;
      const dx = cx - player.x;
      const dy = cy - player.y;
      const d = Math.max(0.01, Math.hypot(dx, dy));
      goal = { x: cx + (dx / d) * COMMAND_BACK, y: cy + (dy / d) * COMMAND_BACK };
    } else {
      // Pas encore son tour : sa place, et quelques pas autour.
      goal = { x: this.anchorX, y: this.anchorY };
    }
    const dx = goal.x - this.x;
    const dy = goal.y - this.y;
    const d = Math.hypot(dx, dy);
    // Une petite marge : il ne piétine pas sur place pour une demi-case.
    if (d < 0.8) {
      this.moving = false;
      face();
      return;
    }
    const step = Math.min(d, speed * dt);
    const nx = this.x + (dx / d) * step;
    const ny = this.y + (dy / d) * step;
    const walk = (x: number, y: number) => {
      const cx = Math.floor(x);
      const cy = Math.floor(y - 0.1);
      if (cx < 1 || cy < 1 || cx >= world.w - 1 || cy >= world.h - 1) return false;
      const i = cy * world.w + cx;
      return !world.blocked[i] && !world.water[i];
    };
    // Contre un obstacle, il glisse le long (un axe à la fois), sinon il s'arrête.
    if (walk(nx, ny)) [this.x, this.y] = [nx, ny];
    else if (walk(nx, this.y)) this.x = nx;
    else if (walk(this.x, ny)) this.y = ny;
    else {
      this.moving = false;
      face();
      return;
    }
    this.moving = true;
    // En reculant ou en se plaçant, il garde les yeux sur le joueur (il marche à reculons).
    face();
  }

  /** Dessin trié avec les Pokémon et le décor (ligne de sol = pieds). */
  draw(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void {
    if (!this.image || this.gone) return;
    const col = this.moving ? Math.floor(this.animT * 6) % 4 : 0;
    const w = FRAME_W * SCALE * k;
    const h = FRAME_H * SCALE * k;
    const fx = Math.round((this.x * TILE - camX) * k - w / 2);
    const fy = Math.round((this.y * TILE - camY) * k - h + 1 * k);
    b.fillStyle = 'rgba(16,24,12,0.28)';
    b.beginPath();
    b.ellipse(Math.round((this.x * TILE - camX) * k), Math.round((this.y * TILE - camY) * k), 5 * k, 2 * k, 0, 0, Math.PI * 2);
    b.fill();
    b.drawImage(this.image, col * FRAME_W, this.row * FRAME_H, FRAME_W, FRAME_H, fx, fy, Math.round(w), Math.round(h));
  }

  /** Première case (de face, immobile) : portrait du dialogue. */
  portrait(): { image: HTMLImageElement; sx: number; sy: number; sw: number; sh: number } | null {
    return this.image ? { image: this.image, sx: 0, sy: 0, sw: FRAME_W, sh: FRAME_H } : null;
  }
}
