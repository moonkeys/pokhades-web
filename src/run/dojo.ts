import { sfx } from '../audio/audio';
import { loadInfo, loadSheet } from '../assets/pmd';
import { Actor } from '../entities/actor';
import type { InputSample } from '../input/input';
import type { CombatFx, Projector } from '../render/combatfx';
import type { WorldMap } from '../world/generate';
import { TILE } from '../world/tiles';
import { Placer } from './placement';

// Dojo, salle spéciale (A-FAIRE 1.9 : « d'autres salles »). Pas d'ennemis,
// portes ouvertes, comme la Source et l'Autel : au centre, un tatami et un
// mannequin de paille, et Machopeur, maître des lieux. [E] au tatami : une
// leçon gratuite, l'écran « Nouvelle attaque » de la récompense (apprendre ou
// renforcer, pour le membre choisi). DOJO_LESSONS leçons par salle ; fermer
// l'écran sans rien prendre ne consomme rien.
//
// Ni le tileset ni Essentials n'ont de tatami : il est dessiné, comme le
// bassin et l'autel.

export const DOJO_NPC = 67;
/** Leçons offertes par le maître dans une même salle. */
export const DOJO_LESSONS = 2;
const REACH = 2.2;
const LINES = ['Ossu ! Monte sur le tatami, je vais t’apprendre un coup.', 'Machopeur fait craquer ses poings : la leçon est gratuite.'];

export interface DojoHost {
  /** Ouvre l'écran des attaques ; `taken` est appelé si une leçon est prise. */
  lesson(taken: () => void): void;
}

export class Dojo {
  active = false;
  readonly npcs: Actor[] = [];
  private mat: { x: number; y: number } | null = null;
  private left = 0;
  /** Écran des attaques ouvert : on ne le rouvre pas tant qu'il l'est. */
  private busy = false;
  private near = false;
  private master: Actor | null = null;
  private talked = false;
  private bubbleT = 0;
  private hitT = 0;
  private readonly prompt: HTMLElement;
  private readonly bubble: HTMLElement;
  private readonly layer: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly fx: CombatFx,
    private readonly host: DojoHost,
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
    this.mat = null;
    this.master = null;
    this.busy = false;
    this.npcs.length = 0;
    this.hide();
  }

  hide(): void {
    this.near = false;
    this.prompt.hidden = true;
    this.bubble.classList.remove('open');
  }

  /** Le tatami au centre de la salle, Machopeur debout à son bord. */
  start(world: WorldMap): void {
    this.clear();
    this.active = true;
    this.left = DOJO_LESSONS;
    this.talked = false;
    const place = new Placer(world);
    const at = place.freeSpot(Math.floor(world.hub.x), Math.floor(world.hub.y));
    this.mat = { x: at.x, y: at.y };
    // Le mannequin, à droite du tatami, barre sa case.
    const dummy = Math.floor(at.y) * world.w + Math.floor(at.x) + 1;
    if (world.blocked[dummy] === 0) world.blocked[dummy] = 1;
    place.block(Math.floor(at.x) + 1, Math.floor(at.y));
    const n = place.freeSpot(Math.floor(at.x) - 2, Math.floor(at.y) - 1);
    const actor = new Actor(DOJO_NPC, n.x, n.y);
    actor.dir = 0;
    void loadInfo(DOJO_NPC).then((i) => (actor.info = i));
    void loadSheet(DOJO_NPC, ['Idle', 'Attack']).then((sh) => {
      actor.sheet = sh;
      actor.setPose(['Idle']);
    });
    this.master = actor;
    this.npcs.push(actor);
  }

  update(dt: number, input: InputSample, player: Actor, rand: () => number): void {
    if (!this.active || !this.mat) return;
    this.near = this.left > 0 && !this.busy && Math.hypot(player.x - this.mat.x, player.y - this.mat.y) < REACH;
    this.bubbleT -= dt;
    const m = this.master;
    if (m && this.hitT > 0) {
      this.hitT -= dt;
      if (this.hitT <= 0) m.setPose(['Idle']);
    }
    if (m && !this.talked && Math.hypot(player.x - m.x, player.y - m.y) < 5) {
      this.talked = true;
      this.say(LINES[Math.floor(rand() * LINES.length)]);
    }
    this.bubble.classList.toggle('open', this.bubbleT > 0);
    this.renderPrompt();
    if (input.interact && this.near) this.teach();
  }

  private say(text: string): void {
    this.bubble.textContent = text;
    this.bubbleT = 3.5;
  }

  private teach(): void {
    this.busy = true;
    this.near = false;
    this.prompt.hidden = true;
    sfx('menuOpen');
    this.host.lesson(() => {
      const m = this.master;
      const p = this.mat!;
      this.left--;
      // Le maître frappe le mannequin pour conclure la leçon.
      if (m) {
        m.setPose(['Attack', 'Idle']);
        this.hitT = 0.8;
      }
      this.fx.attackAnim('fighting', p.x + 1, p.y);
      this.say(this.left > 0 ? 'Ossu ! Encore une leçon, si tu veux.' : 'Ossu ! Tu en sais assez pour aujourd’hui.');
    });
  }

  /** L'écran des attaques est fermé (leçon prise ou non). */
  done(): void {
    this.busy = false;
  }

  private renderPrompt(): void {
    if (!this.near) {
      this.prompt.hidden = true;
      return;
    }
    if (!this.prompt.hidden) return;
    const el = (cls: string, text: string) => Object.assign(document.createElement('div'), { className: cls, textContent: text });
    this.prompt.replaceChildren(
      el('shop-name', 'Leçon du maître'),
      el('da-stamp shop-cost', 'Gratuit'),
      el('shop-desc', 'Apprendre une attaque forte, ou renforcer une attaque connue, pour le Pokémon de ton choix.'),
      el('shop-note', `${this.left} leçon${this.left > 1 ? 's' : ''} restante${this.left > 1 ? 's' : ''}`),
      el('shop-buy', '✔ Prendre la leçon [E]'),
    );
    this.prompt.hidden = false;
  }

  /** Le tatami (bordure sombre, paille claire) et le mannequin de paille sur son poteau. */
  extras(): { y: number; draw(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void }[] {
    const p = this.mat;
    if (!this.active || !p) return [];
    const mat = {
      // Au sol : dessous de tout ce qui se tient dessus.
      y: (p.y - 1.2) * TILE,
      draw: (b: CanvasRenderingContext2D, camX: number, camY: number, k: number) => {
        const cx = (p.x * TILE - camX) * k;
        const cy = (p.y * TILE - camY) * k;
        const W = 1.4 * TILE * k;
        const H = 0.95 * TILE * k;
        b.fillStyle = 'rgba(20,12,4,0.25)';
        b.fillRect(cx - W + k, cy - H + 2 * k, W * 2, H * 2);
        b.fillStyle = '#3d4a2c';
        b.fillRect(cx - W, cy - H, W * 2, H * 2);
        b.fillStyle = '#c9b77a';
        const e = 2 * k;
        b.fillRect(cx - W + e, cy - H + e, W * 2 - 2 * e, H * 2 - 2 * e);
        // Les nattes : deux moitiés, et le tressage en traits fins.
        b.fillStyle = '#b5a266';
        b.fillRect(cx - k / 2, cy - H + e, k, H * 2 - 2 * e);
        b.fillStyle = 'rgba(120,100,50,0.35)';
        for (let y = cy - H + e + 3 * k; y < cy + H - e; y += 3 * k) b.fillRect(cx - W + e, y, W * 2 - 2 * e, Math.max(1, k / 2));
      },
    };
    const dummy = {
      y: (p.y + 0.4) * TILE,
      draw: (b: CanvasRenderingContext2D, camX: number, camY: number, k: number) => {
        const shake = this.hitT > 0 ? Math.sin(this.hitT * 40) * 1.5 * k : 0;
        const cx = ((p.x + 1) * TILE - camX) * k + shake;
        const cy = ((p.y + 0.4) * TILE - camY) * k;
        const u = TILE * k;
        b.fillStyle = 'rgba(20,12,4,0.35)';
        b.beginPath();
        b.ellipse(cx, cy, 0.4 * u, 0.15 * u, 0, 0, Math.PI * 2);
        b.fill();
        // Poteau, bras, corps et tête de paille liée.
        b.fillStyle = '#6b4a2a';
        b.fillRect(cx - 0.08 * u, cy - 1.3 * u, 0.16 * u, 1.3 * u);
        b.fillRect(cx - 0.45 * u, cy - 1.0 * u, 0.9 * u, 0.12 * u);
        b.fillStyle = '#d8b864';
        b.fillRect(cx - 0.22 * u, cy - 1.15 * u, 0.44 * u, 0.7 * u);
        b.beginPath();
        b.arc(cx, cy - 1.35 * u, 0.2 * u, 0, Math.PI * 2);
        b.fill();
        b.fillStyle = '#a3443a';
        b.fillRect(cx - 0.22 * u, cy - 0.85 * u, 0.44 * u, 0.08 * u);
        b.fillRect(cx - 0.22 * u, cy - 1.42 * u, 0.44 * u, 0.06 * u);
      },
    };
    return [mat, dummy];
  }

  placeLabels(proj: Projector): void {
    const m = this.master;
    if (!this.active || !m) return;
    const head = m.sheet ? (m.sheet.footRow + 1 - m.sheet.topRow) / 16 : 1.4;
    const pos = proj.toCss(m.x, m.y - head - 0.4);
    this.bubble.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -100%)`;
  }
}
