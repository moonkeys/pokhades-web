import { sfx } from '../audio/audio';
import { loadInfo, loadSheet } from '../assets/pmd';
import { Actor } from '../entities/actor';
import type { InputSample } from '../input/input';
import type { CombatFx, Projector } from '../render/combatfx';
import type { WorldMap } from '../world/generate';
import { TILE } from '../world/tiles';
import { Placer } from './placement';

// Pension, salle spéciale (A-FAIRE 1.9 : « d'autres salles »). Pas d'ennemis,
// portes ouvertes, comme la Source et le Dojo : au centre, un enclos de bois
// garni de foin, gardé par Écrémeuh. [E] à l'enclos, une fois : l'équipe
// s'entraîne, chaque membre gagne PENSION_LEVELS niveau, le plus faible un de
// plus (le rattrapage des derniers venus). Les niveaux passent par main.ts,
// qui sait annoncer et faire évoluer.
//
// Ni le tileset ni Essentials n'ont d'enclos : il est dessiné, comme le bassin.

export const PENSION_NPC = 241;
/** Niveaux gagnés par chaque membre ; le plus faible en gagne un de plus. */
export const PENSION_LEVELS = 1;
const REACH = 2.6;
const LINES = ['Meuh ! Laisse-les gambader dans l’enclos, ils en ressortiront plus forts.', 'Écrémeuh rumine, le regard sur le foin frais.'];

export interface PensionHost {
  /** Entraîne l'équipe ; rend le nombre total de niveaux gagnés. */
  train(): number;
  message(text: string): void;
}

export class Pension {
  active = false;
  readonly npcs: Actor[] = [];
  private pen: { x: number; y: number } | null = null;
  private used = false;
  private near = false;
  private keeper: Actor | null = null;
  private talked = false;
  private bubbleT = 0;
  private stompT = 0;
  private readonly prompt: HTMLElement;
  private readonly bubble: HTMLElement;
  private readonly layer: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly fx: CombatFx,
    private readonly host: PensionHost,
  ) {
    this.layer = document.createElement('div');
    this.layer.className = 'room-labels';
    this.bubble = document.createElement('div');
    this.bubble.className = 'room-label shop-bubble';
    this.layer.append(this.bubble);
    this.prompt = document.createElement('div');
    this.prompt.className = 'shop-prompt da-paper';
    this.prompt.hidden = true;
    parent.append(this.layer, this.prompt);
  }

  clear(): void {
    this.active = false;
    this.pen = null;
    this.keeper = null;
    this.npcs.length = 0;
    this.hide();
  }

  hide(): void {
    this.near = false;
    this.prompt.hidden = true;
    this.bubble.classList.remove('open');
  }

  /** L'enclos au centre de la salle (on en fait le tour), Écrémeuh à son coin. */
  start(world: WorldMap): void {
    this.clear();
    this.active = true;
    this.used = false;
    this.talked = false;
    const place = new Placer(world);
    const at = place.freeSpot(Math.floor(world.hub.x), Math.floor(world.hub.y));
    this.pen = { x: at.x, y: at.y };
    // L'enclos couvre trois cases sur trois : on en fait le tour, on n'y marche pas.
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = (Math.floor(at.y) + dy) * world.w + Math.floor(at.x) + dx;
        if (world.blocked[c] === 0) world.blocked[c] = 1;
        place.block(Math.floor(at.x) + dx, Math.floor(at.y) + dy);
      }
    const n = place.freeSpot(Math.floor(at.x) - 3, Math.floor(at.y) + 1);
    const actor = new Actor(PENSION_NPC, n.x, n.y);
    actor.dir = 0;
    void loadInfo(PENSION_NPC).then((i) => (actor.info = i));
    void loadSheet(PENSION_NPC, ['Idle', 'Stomp']).then((sh) => {
      actor.sheet = sh;
      actor.setPose(['Idle']);
    });
    this.keeper = actor;
    this.npcs.push(actor);
  }

  update(dt: number, input: InputSample, player: Actor, rand: () => number): void {
    if (!this.active || !this.pen) return;
    this.near = !this.used && Math.hypot(player.x - this.pen.x, player.y - this.pen.y) < REACH;
    this.bubbleT -= dt;
    const m = this.keeper;
    if (m && this.stompT > 0) {
      this.stompT -= dt;
      if (this.stompT <= 0) m.setPose(['Idle']);
    }
    if (m && !this.talked && Math.hypot(player.x - m.x, player.y - m.y) < 5) {
      this.talked = true;
      this.say(LINES[Math.floor(rand() * LINES.length)]);
    }
    this.bubble.classList.toggle('open', this.bubbleT > 0);
    this.renderPrompt();
    if (input.interact && this.near) this.train();
  }

  private say(text: string): void {
    this.bubble.textContent = text;
    this.bubbleT = 3.5;
  }

  private train(): void {
    const p = this.pen!;
    this.used = true;
    this.near = false;
    this.prompt.hidden = true;
    sfx('menuOpen');
    this.fx.attackAnim('fx_boost', p.x, p.y);
    const m = this.keeper;
    if (m) {
      m.setPose(['Stomp', 'Idle']);
      this.stompT = 0.9;
    }
    const n = this.host.train();
    this.host.message(n ? `L’équipe s’entraîne à la pension : ${n} niveau${n > 1 ? 'x' : ''} gagné${n > 1 ? 's' : ''} !` : 'L’équipe s’entraîne à la pension.');
    this.say('Meuh ! Revenez quand vous voulez.');
  }

  private renderPrompt(): void {
    if (!this.near) {
      this.prompt.hidden = true;
      return;
    }
    if (!this.prompt.hidden) return;
    const el = (cls: string, text: string) => Object.assign(document.createElement('div'), { className: cls, textContent: text });
    this.prompt.replaceChildren(
      el('shop-name', 'Pension'),
      el('da-stamp shop-cost', 'Gratuit'),
      el('shop-desc', `Chaque membre de l’équipe gagne ${PENSION_LEVELS} niveau, le plus faible ${PENSION_LEVELS + 1}.`),
      el('shop-note', 'Une seule fois.'),
      el('shop-buy', '✔ Entraîner l’équipe [E]'),
    );
    this.prompt.hidden = false;
  }

  /** L'enclos : foin au sol, clôture de piquets et de deux lisses, plus tassé une fois servi. */
  extras(time: number): { y: number; draw(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void }[] {
    const p = this.pen;
    if (!this.active || !p) return [];
    const W = 1.8;
    const H = 1.1;
    const post = (b: CanvasRenderingContext2D, x: number, y: number, u: number) => {
      b.fillStyle = '#5a3c20';
      b.fillRect(x - 0.07 * u, y - 0.75 * u, 0.14 * u, 0.75 * u);
      b.fillStyle = '#8a6036';
      b.fillRect(x - 0.07 * u, y - 0.75 * u, 0.07 * u, 0.75 * u);
    };
    const rails = (b: CanvasRenderingContext2D, x0: number, x1: number, y: number, u: number) => {
      b.fillStyle = '#7a5230';
      b.fillRect(x0, y - 0.6 * u, x1 - x0, 0.09 * u);
      b.fillRect(x0, y - 0.32 * u, x1 - x0, 0.09 * u);
    };
    // Le foin et la clôture du fond, sous ce qui se tient devant.
    const back = {
      y: (p.y - H) * TILE,
      draw: (b: CanvasRenderingContext2D, camX: number, camY: number, k: number) => {
        const u = TILE * k;
        const cx = (p.x * TILE - camX) * k;
        const cy = (p.y * TILE - camY) * k;
        b.fillStyle = 'rgba(20,12,4,0.22)';
        b.fillRect(cx - W * u + k, cy - H * u + 2 * k, 2 * W * u, 2 * H * u);
        b.fillStyle = this.used ? '#b49a52' : '#d9bf5e';
        b.fillRect(cx - W * u, cy - H * u, 2 * W * u, 2 * H * u);
        // Brins de foin qui bougent un peu.
        b.strokeStyle = this.used ? 'rgba(110,86,30,0.5)' : 'rgba(150,118,40,0.6)';
        b.lineWidth = Math.max(1, k / 2);
        for (let i = 0; i < 18; i++) {
          const hx = cx + ((i * 37) % 100) / 100 * 2 * (W - 0.15) * u - (W - 0.15) * u;
          const hy = cy + ((i * 53) % 100) / 100 * 2 * (H - 0.15) * u - (H - 0.15) * u;
          const sway = Math.sin(time * 1.5 + i) * 0.05 * u;
          b.beginPath();
          b.moveTo(hx, hy);
          b.lineTo(hx + 0.18 * u + sway, hy - 0.12 * u);
          b.stroke();
        }
        const top = cy - H * u;
        rails(b, cx - W * u, cx + W * u, top, u);
        for (let i = 0; i <= 4; i++) post(b, cx - W * u + (i / 4) * 2 * W * u, top, u);
        for (const sx of [-1, 1]) {
          b.fillStyle = '#7a5230';
          b.fillRect(cx + sx * W * u - 0.045 * u, top - 0.6 * u, 0.09 * u, 2 * H * u);
        }
      },
    };
    // La clôture de devant, par-dessus ce qui se tient dans l'enclos.
    const front = {
      y: (p.y + H) * TILE,
      draw: (b: CanvasRenderingContext2D, camX: number, camY: number, k: number) => {
        const u = TILE * k;
        const cx = (p.x * TILE - camX) * k;
        const bot = ((p.y + H) * TILE - camY) * k;
        rails(b, cx - W * u, cx + W * u, bot, u);
        for (let i = 0; i <= 4; i++) post(b, cx - W * u + (i / 4) * 2 * W * u, bot, u);
      },
    };
    return [back, front];
  }

  placeLabels(proj: Projector): void {
    const m = this.keeper;
    if (!this.active || !m) return;
    const head = m.sheet ? (m.sheet.footRow + 1 - m.sheet.topRow) / 16 : 1.4;
    const pos = proj.toCss(m.x, m.y - head - 0.4);
    this.bubble.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -100%)`;
  }
}
