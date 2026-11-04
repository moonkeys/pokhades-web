import { loadImage } from '../assets/pmd';
import { sfx } from '../audio/audio';
import type { Actor } from '../entities/actor';
import type { InputSample } from '../input/input';
import type { CombatFx } from '../render/combatfx';
import { TILE } from '../world/tiles';

// Les Poké Balls du sbire des grottes (run/cave.ts). Il les lance sur le
// Pokémon joué, en cloche, vers l'endroit où il se tenait au lancer : un
// anneau rouge et blanc marque le point de chute, on en sort à pied ou d'un
// dash (Abri aussi). Touché, le Pokémon est aspiré dans la Ball (Actor.trapped)
// et doit s'en débattre : ← et → en alternance remplissent une jauge, qui
// se vide toute seule, d'autant plus vite qu'il lui reste peu de PV. Pleine,
// la Ball éclate ; vide, elle se referme d'un clic, et le Pokémon est
// capturé (CaptureHost.captured : il quitte l'équipe jusqu'à ce qu'on batte
// le sbire).
//
// Ajout : le jeu Godot n'a ni sbires ni captures du joueur.

/** Vol de la Ball (s), et hauteur de sa cloche (cases). */
const FLIGHT = 0.85;
const ARC = 2.4;
/** Rayon du point de chute (cases). */
const CATCH_RADIUS = 0.95;
/** Jauge de lutte : départ, gain par appui alterné, perte par seconde (+ jusqu'à LOW_HP_DRAIN à 0 PV). */
const QTE_START = 0.4;
const QTE_PUSH = 0.075;
const QTE_DRAIN = 0.22;
const LOW_HP_DRAIN = 0.38;
/** La Ball secoue (son) toutes les SHAKE_EVERY s pendant la lutte. */
const SHAKE_EVERY = 0.75;
/** Libéré : un instant intouchable, le temps de s'éloigner. */
const FREE_GRACE = 1.2;
/** Refermée : le clic, puis le Pokémon quitte l'équipe. */
const SNAP_TIME = 0.8;

interface Flying {
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  t: number;
}

interface Hold {
  actor: Actor;
  x: number;
  y: number;
  gauge: number;
  /** Dernière flèche comptée (-1 gauche, 1 droite) : il faut l'autre pour remplir. */
  last: number;
  shakeT: number;
  /** Secousse visuelle de la Ball après un appui (s). */
  wiggle: number;
  /** Refermée : temps restant avant la capture. */
  snapT: number;
}

export interface CaptureHost {
  /** La Ball s'est refermée : le Pokémon quitte l'équipe (il reste `trapped`). */
  captured(a: Actor): void;
  /** Il a fait éclater la Ball. */
  freed(a: Actor): void;
}

export class CaptureThreat {
  private flying: Flying[] = [];
  private hold: Hold | null = null;
  private ball: HTMLImageElement | null = null;
  private readonly root: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly keys: HTMLElement[];

  constructor(
    parent: HTMLElement,
    private readonly fx: CombatFx,
    private readonly host: CaptureHost,
  ) {
    void loadImage('/game/assets/essentials/battle/ball_POKEBALL.png')
      .then((img) => (this.ball = img))
      .catch(() => {});
    this.root = document.createElement('div');
    this.root.className = 'capture-qte da-paper';
    this.root.hidden = true;
    const title = Object.assign(document.createElement('b'), { textContent: 'Débats-toi !' });
    this.keys = ['←', '→'].map((k) => Object.assign(document.createElement('kbd'), { textContent: k }));
    const bar = Object.assign(document.createElement('div'), { className: 'capture-bar' });
    this.fill = document.createElement('i');
    bar.append(this.fill);
    const row = Object.assign(document.createElement('div'), { className: 'capture-row' });
    row.append(this.keys[0], bar, this.keys[1]);
    this.root.append(title, row);
    parent.append(this.root);
  }

  /** Une Ball en vol ou un Pokémon dedans : le sbire attend avant d'en lancer une autre. */
  get busy(): boolean {
    return this.hold !== null || this.flying.length > 0;
  }

  throwAt(fromX: number, fromY: number, toX: number, toY: number): void {
    this.flying.push({ fx: fromX, fy: fromY, tx: toX, ty: toY, t: 0 });
    sfx('ballThrow');
  }

  /** Tout s'arrête (grotte quittée) : le Pokémon encore dans la Ball en ressort. */
  reset(): void {
    if (this.hold) this.hold.actor.trapped = false;
    this.hold = null;
    this.flying = [];
    this.root.hidden = true;
  }

  update(dt: number, input: InputSample, player: Actor): void {
    for (const f of this.flying) f.t += dt;
    for (const f of this.flying.filter((f) => f.t >= FLIGHT)) this.land(f, player);
    this.flying = this.flying.filter((f) => f.t < FLIGHT);
    const h = this.hold;
    if (!h) return;
    const a = h.actor;
    // Tombé dans la Ball (poison, brûlure) : elle s'ouvre sur un K.O.
    if (a.deathT >= 0 || !a.pokemon || a.pokemon.fainted) {
      a.trapped = false;
      this.hold = null;
      this.root.hidden = true;
      return;
    }
    a.x = a.prevX = h.x;
    a.y = a.prevY = h.y;
    if (h.snapT > 0) {
      h.snapT -= dt;
      if (h.snapT <= 0) {
        this.hold = null;
        this.host.captured(a);
      }
      return;
    }
    h.wiggle = Math.max(0, h.wiggle - dt);
    const side = input.mx < -0.5 ? -1 : input.mx > 0.5 ? 1 : 0;
    if (side !== 0 && side !== h.last) {
      h.last = side;
      h.gauge += QTE_PUSH;
      h.wiggle = 0.14;
    }
    h.gauge -= dt * (QTE_DRAIN + LOW_HP_DRAIN * (1 - a.pokemon.hp / a.pokemon.maxHp));
    h.shakeT -= dt;
    if (h.shakeT <= 0) {
      h.shakeT = SHAKE_EVERY;
      sfx('ballShake');
    }
    this.renderQte(h);
    if (h.gauge >= 1) {
      // La Ball éclate : il ressort dans une gerbe, un instant intouchable.
      a.trapped = false;
      a.protectT = Math.max(a.protectT, FREE_GRACE);
      this.fx.ballSend(h.x, h.y);
      sfx('ballDrop');
      this.hold = null;
      this.root.hidden = true;
      this.host.freed(a);
    } else if (h.gauge <= 0) {
      h.snapT = SNAP_TIME;
      sfx('catchClick');
      this.root.hidden = true;
    }
  }

  private land(f: Flying, player: Actor): void {
    const d = Math.hypot(player.x - f.tx, player.y - f.ty);
    const alive = player.deathT < 0 && player.pokemon && !player.pokemon.fainted;
    if (this.hold || !alive || player.trapped || d > CATCH_RADIUS) {
      // Ratée : elle rebondit au sol et disparaît.
      sfx('ballDrop');
      this.fx.poof(f.tx, f.ty);
      return;
    }
    // En plein dash (ou juste après) ou sous Abri : esquivée.
    if (player.dashT > 0 || player.sinceDash < 0.15 || player.protectT > 0) {
      this.fx.number('dodge', player.x, player.y);
      this.fx.poof(f.tx, f.ty);
      return;
    }
    player.trapped = true;
    player.dashT = 0;
    player.action = null;
    sfx('ballHit');
    sfx('ballEnter');
    this.hold = { actor: player, x: player.x, y: player.y, gauge: QTE_START, last: 0, shakeT: 0.3, wiggle: 0, snapT: 0 };
    this.root.hidden = false;
    this.renderQte(this.hold);
  }

  private renderQte(h: Hold): void {
    this.fill.style.width = `${Math.max(0, Math.min(1, h.gauge)) * 100}%`;
    this.root.classList.toggle('low', h.gauge < 0.25);
    // La flèche à presser maintenant s'allume.
    this.keys[0].classList.toggle('on', h.last !== -1);
    this.keys[1].classList.toggle('on', h.last !== 1);
  }

  /** Balls en vol (et leur point de chute), et la Ball qui retient un Pokémon : triées avec le reste. */
  extras(): { y: number; draw(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void }[] {
    const out: { y: number; draw(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void }[] = [];
    // L'anneau au sol, sous tout le reste.
    for (const f of this.flying) {
      out.push({
        y: -Infinity,
        draw: (b, camX, camY, k) => {
          const u = f.t / FLIGHT;
          const cx = (f.tx * TILE - camX) * k;
          const cy = (f.ty * TILE - camY) * k;
          const r = CATCH_RADIUS * TILE * k;
          b.save();
          b.lineWidth = Math.max(1, k);
          b.strokeStyle = `rgba(255,255,255,${0.5 + 0.4 * u})`;
          b.fillStyle = `rgba(232,64,64,${0.12 + 0.2 * u})`;
          b.beginPath();
          b.ellipse(cx, cy, r, r * 0.5, 0, 0, Math.PI * 2);
          b.fill();
          b.stroke();
          b.strokeStyle = 'rgba(232,64,64,0.9)';
          b.beginPath();
          b.ellipse(cx, cy, r * u, r * u * 0.5, 0, 0, Math.PI * 2);
          b.stroke();
          b.restore();
        },
      });
      // La Ball en vol, au-dessus de tout ce qu'elle survole.
      out.push({
        y: Infinity,
        draw: (b, camX, camY, k) => {
          const u = f.t / FLIGHT;
          const x = f.fx + (f.tx - f.fx) * u;
          const y = f.fy + (f.ty - f.fy) * u - 0.9 - Math.sin(u * Math.PI) * ARC;
          this.drawBall(b, (x * TILE - camX) * k, (y * TILE - camY) * k, k, Math.floor(f.t * 20) % 8, 0);
        },
      });
    }
    const h = this.hold;
    if (h) {
      out.push({
        y: h.y * TILE,
        draw: (b, camX, camY, k) => {
          // Elle penche à chaque appui, et d'elle-même à chaque secousse.
          const tilt = h.snapT > 0 ? 0 : Math.sin(performance.now() / 40) * (h.wiggle > 0 ? 0.5 : h.shakeT > SHAKE_EVERY - 0.2 ? 0.3 : 0);
          b.fillStyle = 'rgba(16,24,12,0.28)';
          b.beginPath();
          b.ellipse((h.x * TILE - camX) * k, (h.y * TILE - camY) * k, 4 * k, 1.6 * k, 0, 0, Math.PI * 2);
          b.fill();
          this.drawBall(b, (h.x * TILE - camX) * k, (h.y * TILE - 5 - camY) * k, k, 0, tilt);
        },
      });
    }
    return out;
  }

  /** Une case de la bande ball_POKEBALL (8 × 32 × 64, dessinée en ×2 : moitié de taille). */
  private drawBall(b: CanvasRenderingContext2D, cx: number, cy: number, k: number, frame: number, tilt: number): void {
    if (!this.ball) return;
    const w = 16 * k;
    const h = 32 * k;
    b.save();
    b.translate(Math.round(cx), Math.round(cy));
    b.rotate(tilt);
    b.drawImage(this.ball, frame * 32, 0, 32, 64, -w / 2, -h / 2, w, h);
    b.restore();
  }
}
