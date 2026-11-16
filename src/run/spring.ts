import { sfx } from '../audio/audio';
import { loadInfo, loadSheet } from '../assets/pmd';
import { Actor } from '../entities/actor';
import type { InputSample } from '../input/input';
import type { CombatFx, Projector } from '../render/combatfx';
import type { WorldMap } from '../world/generate';
import { Placer } from './placement';

// Source, salle spéciale de soin (A-FAIRE 1.9 : « d'autres salles (soin…) »).
// Pas d'ennemis, portes ouvertes, comme chez le marchand : au centre, un
// bassin d'eau claire veillé par Leveinard. [E] au bord du bassin, une fois :
// chaque membre de l'équipe regagne SPRING_HEAL de ses PV max et perd son
// statut, et un membre K.O. se relève (le relever passe par main.ts, qui sait
// le faire pour les Rappels). Le bassin pâlit ensuite.
//
// Le bassin est la fontaine d'Essentials (retour de test du 16 novembre 2026 :
// pas de décor dessiné à la main ; il était peint au pinceau).

export const SPRING_NPC = 113;
/** Part des PV max rendue à chaque membre. */
export const SPRING_HEAL = 0.6;
const REACH = 2.4;
const LINES = ['Lei ! Bois, l’eau de la source soigne tout.', 'Lei-lei ! Repose-toi un peu avant de repartir.'];

export interface SpringHost {
  /** Soigne l'équipe ; rend combien de membres se sont relevés. */
  heal(): number;
  message(text: string): void;
}

export class Spring {
  active = false;
  readonly npcs: Actor[] = [];
  private pool: { x: number; y: number } | null = null;
  /** 0 : pleine ; 0 → 1 : l'eau pâlit après usage. */
  private used = 0;
  private near = false;
  private nurse: Actor | null = null;
  private talked = false;
  private bubbleT = 0;
  private readonly prompt: HTMLElement;
  private readonly bubble: HTMLElement;
  private readonly layer: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly fx: CombatFx,
    private readonly host: SpringHost,
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
    this.pool = null;
    this.nurse = null;
    this.npcs.length = 0;
    this.hide();
  }

  hide(): void {
    this.near = false;
    this.prompt.hidden = true;
    this.bubble.classList.remove('open');
  }

  /** Le bassin au centre de la salle, Leveinard à côté. */
  start(world: WorldMap): void {
    this.clear();
    this.active = true;
    this.used = 0;
    this.talked = false;
    const place = new Placer(world);
    const at = place.freeSpot(Math.floor(world.hub.x), Math.floor(world.hub.y));
    this.pool = { x: at.x, y: at.y };
    // Le bassin rond d'Essentials et son jet (le même que sur la place du Village, FOUNTAIN),
    // 3 × 3 cases : on en fait le tour, on n'y marche pas.
    const cx = Math.floor(at.x);
    const cy = Math.floor(at.y);
    place.clearArea(cx - 1, cy - 1, 3, 3);
    world.fountains.push({ x: cx - 1, y: cy - 1 });
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = (cy + dy) * world.w + cx + dx;
        if (world.blocked[c] === 0) world.blocked[c] = 1;
        place.block(cx + dx, cy + dy);
      }
    const n = place.freeSpot(Math.floor(at.x) + 3, Math.floor(at.y) - 1);
    const actor = new Actor(SPRING_NPC, n.x, n.y);
    actor.dir = 0;
    void loadInfo(SPRING_NPC).then((i) => (actor.info = i));
    void loadSheet(SPRING_NPC, ['Idle']).then((sh) => {
      actor.sheet = sh;
      actor.setPose(['Idle']);
    });
    this.nurse = actor;
    this.npcs.push(actor);
  }

  update(dt: number, input: InputSample, player: Actor, rand: () => number): void {
    if (!this.active || !this.pool) return;
    if (this.used > 0) this.used = Math.min(1, this.used + dt / 1.2);
    this.near = this.used === 0 && Math.hypot(player.x - this.pool.x, player.y - this.pool.y) < REACH;
    this.bubbleT -= dt;
    const m = this.nurse;
    if (m && !this.talked && Math.hypot(player.x - m.x, player.y - m.y) < 5) {
      this.talked = true;
      this.bubble.textContent = LINES[Math.floor(rand() * LINES.length)];
      this.bubbleT = 3.5;
    }
    this.bubble.classList.toggle('open', this.bubbleT > 0);
    this.renderPrompt();
    if (input.interact && this.near) this.drink();
  }

  private drink(): void {
    const p = this.pool!;
    this.used = 0.01;
    sfx('heal');
    this.fx.attackAnim('fx_heal', p.x, p.y);
    const up = this.host.heal();
    this.host.message(up ? `La source soigne l'équipe : ${up} membre${up > 1 ? 's' : ''} se relève${up > 1 ? 'nt' : ''} !` : 'La source soigne l’équipe.');
    this.bubble.textContent = 'Lei ! Bonne route !';
    this.bubbleT = 2.5;
  }

  private renderPrompt(): void {
    if (!this.near) {
      this.prompt.hidden = true;
      return;
    }
    if (!this.prompt.hidden) return;
    const el = (cls: string, text: string) => Object.assign(document.createElement('div'), { className: cls, textContent: text });
    this.prompt.replaceChildren(
      el('shop-name', 'Source'),
      el('da-stamp shop-cost', 'Gratuit'),
      el('shop-desc', `Chaque membre regagne ${Math.round(SPRING_HEAL * 100)} % de ses PV et perd son statut ; un membre K.O. se relève.`),
      el('shop-note', 'Une seule fois.'),
      el('shop-buy', '✔ Boire [E]'),
    );
    this.prompt.hidden = false;
  }

  placeLabels(proj: Projector): void {
    const m = this.nurse;
    if (!this.active || !m) return;
    const head = m.sheet ? (m.sheet.footRow + 1 - m.sheet.topRow) / 16 : 1.4;
    const pos = proj.toCss(m.x, m.y - head - 0.4);
    this.bubble.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -100%)`;
  }
}
