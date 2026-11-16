import { sfx } from '../audio/audio';
import { loadInfo, loadSheet } from '../assets/pmd';
import { Actor } from '../entities/actor';
import type { InputSample } from '../input/input';
import type { CombatFx, Projector } from '../render/combatfx';
import type { WorldMap } from '../world/generate';
import { CAMP_PROPS, DOJO_HALL, DOJO_MAT, PROPS } from '../world/tiles';
import { Placer } from './placement';

// Dojo, salle spéciale (A-FAIRE 1.9 : « d'autres salles »). Pas d'ennemis,
// portes ouvertes, comme la Source et l'Autel : au centre, un tatami et un
// rocher d'entraînement, et Machopeur, maître des lieux. [E] au tatami : une
// leçon gratuite, l'écran « Nouvelle attaque » de la récompense (apprendre ou
// renforcer, pour le membre choisi). DOJO_LESSONS leçons par salle ; fermer
// l'écran sans rien prendre ne consomme rien.
//
// Retour de test du 16 novembre 2026 (pas de décor dessiné à la main) : le
// tatami est celui des arènes d'Essentials (DOJO_MAT, six nattes répétées en
// 9 × 6 cases), devant la salle d'entraînement au toit rouge du tileset ; le
// mannequin de paille devient un rocher du tileset, que le maître frappe à la
// fin de chaque leçon. [E] n'importe où sur le tatami.

export const DOJO_NPC = 67;
/** Leçons offertes par le maître dans une même salle. */
export const DOJO_LESSONS = 2;
const LINES = ['Ossu ! Monte sur le tatami, je vais t’apprendre un coup.', 'Machopeur fait craquer ses poings : la leçon est gratuite.'];

export interface DojoHost {
  /** Ouvre l'écran des attaques ; `taken` est appelé si une leçon est prise. */
  lesson(taken: () => void): void;
}

export class Dojo {
  active = false;
  readonly npcs: Actor[] = [];
  /** Le tatami : son milieu et ses demi-côtés (cases). On prend la leçon dessus. */
  private mat: { x: number; y: number; rx: number; ry: number } | null = null;
  /** Le rocher que frappe le maître (centre du sprite). */
  private rock = { x: 0, y: 0 };
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
    // Au milieu de la place du Sanctuaire (layouts.ts) : la salle d'entraînement au toit rouge,
    // le tatami devant (9 × 6 nattes, cuites avec le sol), des torches de part et d'autre de la
    // porte, des rochers d'entraînement sur les côtés. La place est dégagée d'abord.
    const place = new Placer(world);
    const cx = Math.floor(world.hub.x);
    const cy = Math.floor(world.hub.y);
    place.clearArea(cx - 7, cy - 7, 15, 13);
    place.prop(DOJO_HALL, cx + 0.5, cy - 1.9);
    const x0 = cx - 4;
    const y0 = cy;
    const MW = 3 * DOJO_MAT.w;
    const MH = 3 * DOJO_MAT.h;
    for (let dy = 0; dy < MH; dy++)
      for (let dx = 0; dx < MW; dx++) world.decals.push({ tile: [DOJO_MAT.tile[0] + (dx % DOJO_MAT.w), DOJO_MAT.tile[1] + (dy % DOJO_MAT.h)], x: x0 + dx, y: y0 + dy });
    this.mat = { x: x0 + MW / 2, y: y0 + MH / 2, rx: MW / 2, ry: MH / 2 };
    for (const dx of [-3.5, 4.5]) place.prop(CAMP_PROPS.torch, cx + dx, cy - 0.6);
    // Le rocher que frappe le maître, à droite du tatami ; un plus petit à gauche.
    const rx = x0 + MW + 1.5;
    const ry = y0 + 4;
    place.prop(PROPS.boulder[0], rx, ry);
    this.rock = { x: rx, y: ry - 0.8 };
    place.prop(PROPS.rockSmall[0], x0 - 1.5, y0 + 3);
    place.prop(PROPS.rockSmall[1], x0 - 1, y0 + 5);
    const n = { x: x0 + MW / 2, y: y0 + 1.4 };
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
    const on = Math.abs(player.x - this.mat.x) < this.mat.rx && Math.abs(player.y - this.mat.y) < this.mat.ry + 0.5;
    this.near = this.left > 0 && !this.busy && on;
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
      this.left--;
      // Le maître frappe le rocher pour conclure la leçon.
      if (m) {
        m.setPose(['Attack', 'Idle']);
        this.hitT = 0.8;
      }
      this.fx.attackAnim('fighting', this.rock.x, this.rock.y);
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

  placeLabels(proj: Projector): void {
    const m = this.master;
    if (!this.active || !m) return;
    const head = m.sheet ? (m.sheet.footRow + 1 - m.sheet.topRow) / 16 : 1.4;
    const pos = proj.toCss(m.x, m.y - head - 0.4);
    this.bubble.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -100%)`;
  }
}
