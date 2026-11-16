import { loadInfo, loadSheet } from '../assets/pmd';
import type { Rng } from '../core/rng';
import { Actor, dirFromVector } from '../entities/actor';
import type { InputSample } from '../input/input';
import type { Errand, CalmRoom } from '../meta/errands';
import type { Projector } from '../render/combatfx';
import type { WorldMap } from '../world/generate';

// Habitants des salles calmes (retour de test du 16 novembre 2026 : « d'autres
// Pokémon qui se baladent, avec qui tu peux parler ») : deux ou trois Pokémon
// de la place (des fées à la Source, des apprentis au Dojo, des spectres à
// l'Autel, des pensionnaires à la Pension). Ils vont et viennent autour de leur
// coin, s'arrêtent et se tournent vers toi quand tu approches ; [E] leur parle
// (main.ts décide quoi dire : une réplique, un service à rendre — errands.ts —,
// ou le paiement d'un service rempli).
//
// On ne retrouve pas à coup sûr un habitant d'une run à l'autre : chacun a sa
// salle (RESIDENTS) ; celui à qui l'on doit une réponse y revient souvent.

/** Les habitants possibles de chaque salle (n° national). */
export const RESIDENTS: Record<CalmRoom, readonly number[]> = {
  spring: [35, 175, 176, 183, 39],
  dojo: [66, 106, 107, 236, 56],
  altar: [93, 302, 708, 710],
  pension: [128, 77, 133, 216, 209],
};

/** Ce que disent les habitants, par salle. */
const LINES: Record<CalmRoom, readonly string[]> = {
  spring: ['L’eau de la source brille la nuit. Tu l’as vue ?', 'On vient ici quand on a mal. On repart toujours mieux.', 'Chut… Leveinard dit que la source écoute.'],
  dojo: ['Cent coups de poing avant le petit-déjeuner !', 'Le maître dit que la force vient des jambes.', 'Un jour, je casserai ce rocher. Un jour.'],
  altar: ['Hi hi… Tu as vu les gargouilles bouger ?', 'Les pactes, ça finit toujours mal. Toujours.', 'Ici, la nuit ne s’arrête jamais.'],
  pension: ['On mange, on dort, on court. La belle vie.', 'Écrémeuh nous trait… euh, nous traite très bien.', 'Le foin est frais ce matin !'],
};

/** Chance qu'un habitant à qui l'on doit une réponse revienne dans une salle de son genre. */
const OWED_CHANCE = 0.85;
const TALK_REACH = 1.6;
const SPEED = 1.3;

export interface Resident {
  actor: Actor;
  id: number;
  room: CalmRoom;
  home: { x: number; y: number };
  radius: number;
  goal: { x: number; y: number };
  wait: number;
  /** Il a un service à proposer (si l'on n'en a pas déjà trop). */
  offers: boolean;
  talk: number;
  bubble: HTMLElement;
  bubbleT: number;
  /** Le « ! » d'Essentials, comme au Repaire : un service à proposer ou à payer. */
  news: HTMLElement;
}

export class Residents {
  readonly npcs: Actor[] = [];
  readonly list: Resident[] = [];
  private readonly layer: HTMLElement;
  /** L'invite en bas à droite, comme au Repaire (« [E] Parler à Mélofée »). */
  private readonly prompt: HTMLElement;
  private near: Resident | null = null;

  constructor(
    parent: HTMLElement,
    private readonly host: { talk(r: Resident): void; news(r: Resident): boolean },
  ) {
    this.layer = document.createElement('div');
    this.layer.className = 'room-labels';
    this.prompt = document.createElement('div');
    this.prompt.className = 'shop-prompt da-paper';
    this.prompt.hidden = true;
    parent.append(this.layer, this.prompt);
  }

  clear(): void {
    this.list.length = 0;
    this.npcs.length = 0;
    this.near = null;
    this.layer.replaceChildren();
    this.hide();
  }

  hide(): void {
    this.prompt.hidden = true;
    this.prompt.dataset.key = '';
  }

  /**
   * Pose les habitants de la salle, un par coin (`spots` : centre et rayon de promenade). Ceux à
   * qui l'on doit une réponse d'abord (souvent), les autres tirés au hasard.
   */
  spawn(room: CalmRoom, spots: readonly { x: number; y: number; r: number }[], errands: readonly Errand[], rng: Rng): void {
    this.clear();
    const pool = [...RESIDENTS[room]];
    const picks: number[] = [];
    for (const e of errands) if (e.room === room && pool.includes(e.npc) && !picks.includes(e.npc) && rng.chance(OWED_CHANCE)) picks.push(e.npc);
    const rest = pool.filter((id) => !picks.includes(id));
    while (picks.length < spots.length && rest.length) picks.push(rest.splice(rng.int(rest.length), 1)[0]);
    picks.slice(0, spots.length).forEach((id, i) => {
      const s = spots[i];
      const actor = new Actor(id, s.x, s.y);
      actor.dir = rng.int(8);
      void loadInfo(id).then((info) => (actor.info = info));
      void loadSheet(id, ['Idle']).then((sh) => {
        actor.sheet = sh;
        actor.setPose(['Idle']);
      });
      const bubble = document.createElement('div');
      bubble.className = 'room-label shop-bubble';
      const news = document.createElement('div');
      news.className = 'room-label camp-news';
      news.hidden = true;
      this.layer.append(bubble, news);
      this.list.push({ actor, id, room, home: { x: s.x, y: s.y }, radius: s.r, goal: { x: s.x, y: s.y }, wait: rng.range(0.5, 3), offers: rng.chance(0.6), talk: 0, bubble, bubbleT: 0, news });
      this.npcs.push(actor);
    });
  }

  /** Rend vrai si [E] a servi à parler à un habitant (la salle ne doit pas le reprendre). */
  update(dt: number, world: WorldMap, player: Actor, input: InputSample, rand: () => number): boolean {
    this.near = null;
    let best = TALK_REACH;
    for (const r of this.list) {
      const a = r.actor;
      const d = Math.hypot(player.x - a.x, player.y - a.y);
      if (d < best) {
        best = d;
        this.near = r;
      }
      r.bubbleT -= dt;
      // (Basculée seulement quand il le faut : la rouvrir à chaque image la faisait clignoter.)
      const talking = r.bubbleT > 0;
      if (r.bubble.classList.contains('open') !== talking) r.bubble.classList.toggle('open', talking);
      const news = this.host.news(r);
      if (r.news.hidden === news) r.news.hidden = !news;
      // Près du joueur, il s'arrête (main.ts le tourne vers lui).
      if (d < 2.4) {
        this.stop(r);
        continue;
      }
      if (r.wait > 0) {
        r.wait -= dt;
        this.stop(r);
        if (r.wait <= 0) {
          const ang = rand() * Math.PI * 2;
          const k = 0.3 + rand() * 0.7;
          r.goal = { x: r.home.x + Math.cos(ang) * r.radius * k, y: r.home.y + Math.sin(ang) * r.radius * k * 0.7 };
        }
        continue;
      }
      const dx = r.goal.x - a.x;
      const dy = r.goal.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.15) {
        r.wait = 1.5 + rand() * 3;
        this.stop(r);
        continue;
      }
      // En marche, la planche de marche (la pose de repos, une action, passerait devant).
      if (a.action) a.action = null;
      const step = Math.min(len, SPEED * dt);
      const bx = a.x;
      const by = a.y;
      a.nudge(world, (dx / len) * step, (dy / len) * step);
      a.dir = dirFromVector(dx, dy);
      a.moving = true;
      // Bloqué (un obstacle) : il s'arrête et repart ailleurs.
      if (Math.abs(a.x - bx) + Math.abs(a.y - by) < step * 0.2) r.wait = 0.8 + rand() * 1.5;
    }
    const n = this.near;
    const hint = n ? `[E] Parler à ${n.actor.info?.name ?? '…'}` : '';
    if (this.prompt.dataset.key !== hint) {
      this.prompt.dataset.key = hint;
      this.prompt.hidden = !hint;
      if (hint) this.prompt.replaceChildren(Object.assign(document.createElement('div'), { className: 'shop-hint', textContent: hint }));
    }
    if (input.interact && n) {
      this.host.talk(n);
      return true;
    }
    return false;
  }

  /** Il s'arrête : sa pose de repos reprend. */
  private stop(r: Resident): void {
    const a = r.actor;
    a.moving = false;
    if (!a.action && a.sheet) a.setPose(['Idle']);
  }

  /** Une réplique au hasard de sa salle. */
  chatter(r: Resident): string {
    const lines = LINES[r.room];
    return lines[r.talk++ % lines.length];
  }

  say(r: Resident, text: string, seconds = 3.5): void {
    r.bubble.textContent = text;
    r.bubbleT = seconds;
    r.bubble.classList.add('open');
  }

  placeLabels(proj: Projector): void {
    for (const r of this.list) {
      const a = r.actor;
      const head = a.sheet ? (a.sheet.footRow + 1 - a.sheet.topRow) / 16 : 1.2;
      const pos = proj.toCss(a.x, a.y - head - 0.3);
      r.bubble.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -100%)`;
      if (!r.news.hidden) {
        r.news.style.transform = r.bubble.style.transform;
        r.news.style.setProperty('--px', `${proj.perTile / 16}px`);
      }
    }
  }
}
