import { loadInfo, loadSheet } from '../assets/pmd';
import { Actor } from '../entities/actor';
import type { InputSample } from '../input/input';
import type { CombatFx, Projector } from '../render/combatfx';
import type { WorldMap } from '../world/generate';
import { CAMP_PROPS, FENCES, PROPS, TILE } from '../world/tiles';
import { Placer } from './placement';
import { promptHtml } from '../net/prompthtml';

// Pension, salle spéciale (A-FAIRE 1.9 : « d'autres salles »). Pas d'ennemis,
// portes ouvertes, comme la Source et le Dojo : au centre, un enclos de bois
// garni de foin, gardé par Écrémeuh. [E] à l'enclos, une fois : l'équipe
// s'entraîne, chaque membre gagne PENSION_LEVELS niveau, le plus faible un de
// plus (le rattrapage des derniers venus). Les niveaux passent par main.ts,
// qui sait annoncer et faire évoluer.
//
// L'échange (retour de test du 16 novembre 2026) : [E] à côté d'Écrémeuh, une
// fois par Pension, renvoie un membre au Repaire et en fait venir un autre
// parmi les libérés (écran ui/swapscreen.ts, mené par main.ts).
//
// L'enclos est fait du tileset (retour de test du 16 novembre 2026 : pas de décor
// dessiné à la main) : le foin des paillasses du Repaire, la clôture des jardins.

export const PENSION_NPC = 241;
/** Niveaux gagnés par chaque membre ; le plus faible en gagne un de plus. */
export const PENSION_LEVELS = 1;
const KEEPER_REACH = 1.8;
const LINES = ['Meuh ! Laisse-les gambader dans l’enclos, ils en ressortiront plus forts.', 'Écrémeuh rumine, le regard sur le foin frais.'];

export interface PensionHost {
  /**
   * Le menu d'Écrémeuh (main.ts) : `trained(n)` si l'équipe s'est entraînée (n niveaux
   * répartis), `swapped(true)` après un échange, `swapped(false)` si personne n'était libre,
   * `swapped(null)` ou `closed()` si l'on a refermé sans rien faire.
   */
  menu(state: { trained: boolean; swapped: boolean }, trained: (levels: number) => void, swapped: (ok: boolean | null) => void, closed: () => void): void;
  message(text: string): void;
}

export class Pension {
  active = false;
  readonly npcs: Actor[] = [];
  /** L'intérieur de l'enclos (cases, bornes comprises) : on s'entraîne dedans. */
  private pen: { x0: number; x1: number; y0: number; y1: number } | null = null;
  private used = false;
  /** À côté d'Écrémeuh, l'échange encore possible. */
  private nearKeeper = false;
  private swapped = false;
  private busy = false;
  private keeper: Actor | null = null;
  /** Les coins des pensionnaires (residents.ts) : centre et rayon de promenade. */
  spots: { x: number; y: number; r: number }[] = [];
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
    this.nearKeeper = false;
    this.prompt.hidden = true;
    this.bubble.classList.remove('open');
  }

  /** L'enclos au centre de la salle (on en fait le tour), Écrémeuh à son coin. */
  start(world: WorldMap): void {
    this.clear();
    this.active = true;
    this.used = false;
    this.swapped = false;
    this.busy = false;
    this.talked = false;
    // Retour de test du 16 novembre 2026 (« une grosse pension… une ouverture, on rentre dans la
    // pension, et c'est à l'intérieur qu'on peut l'utiliser ») : au milieu de la place du
    // Sanctuaire, un grand enclos de 13 × 9 cases fermé par la clôture de bois des jardins, une
    // ouverture de deux cases au sud ; dedans, la paillote du tileset, du foin (cuit avec le sol),
    // des caisses, et deux pensionnaires.
    const place = new Placer(world);
    const cx = Math.floor(world.hub.x);
    const cy = Math.floor(world.hub.y);
    const HW = 6;
    const HH = 4;
    place.clearArea(cx - HW - 1, cy - HH - 1, 2 * HW + 3, 2 * HH + 3);
    this.pen = { x0: cx - HW + 1, x1: cx + HW - 1, y0: cy - HH + 1, y1: cy + HH - 1 };
    const [fc, fr] = FENCES.wood.origin;
    for (let dy = -HH; dy <= HH; dy++)
      for (let dx = -HW; dx <= HW; dx++) {
        const edge = Math.abs(dx) === HW || Math.abs(dy) === HH;
        // L'ouverture, au milieu du côté sud.
        if (!edge || (dy === HH && (dx === 0 || dx === 1))) continue;
        place.block(cx + dx, cy + dy);
        const col = dx === -HW ? 0 : dx === HW ? 2 : 1;
        const row = dy === -HH ? 0 : dy === HH ? 2 : 1;
        world.objects.push({ sprite: { rect: [(fc + col) * TILE, (fr + row) * TILE, TILE, TILE], foot: TILE - 1, trunk: 1 }, x: (cx + dx) * TILE + TILE / 2, y: (cy + dy + 1) * TILE - 1, fades: false });
      }
    // Du foin (retour de test : « encore du foin et d'autres trucs ») : trois tas, cuits avec le sol.
    const { col: hc, row: hr } = CAMP_PROPS.hay;
    for (const [hx, hy] of [[cx + 1, cy - 3], [cx - 5, cy + 1], [cx + 2, cy + 1]])
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) world.decals.push({ tile: [hc + dx, hr + dy], x: hx + dx, y: hy + dy });
    place.prop(CAMP_PROPS.thatchHut, cx - 2.5, cy - 0.6);
    place.prop(CAMP_PROPS.barrels[0], cx + 4.5, cy - 2);
    place.prop(CAMP_PROPS.barrels[1], cx + 5.3, cy - 1.4);
    place.prop(CAMP_PROPS.barrels[0], cx + 5.4, cy + 3);
    place.prop(PROPS.stump[0], cx - 5.4, cy - 2.6);
    // Dehors, le long de la clôture : de quoi nourrir la pension.
    place.prop(CAMP_PROPS.barrels[0], cx - 7.5, cy + 4.6);
    place.prop(CAMP_PROPS.barrels[1], cx + 7.6, cy - 3.4);
    place.prop(PROPS.log[0], cx + 8, cy + 2);
    // Les pensionnaires (residents.ts) se promènent dans l'enclos.
    this.spots = [
      { x: cx + 3, y: cy + 0.4, r: 2 },
      { x: cx - 4, y: cy + 2.4, r: 1.5 },
      { x: cx + 1, y: cy - 1.8, r: 1.5 },
    ];
    const n = { x: cx - 1.5, y: cy + 2.9 };
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
    // Un seul interlocuteur (retour de test : on entraînait sans le vouloir en voulant échanger) :
    // Écrémeuh, et son menu (main.ts) — entraîner, échanger, ou rien.
    const k = this.keeper;
    this.nearKeeper = !this.busy && (!this.used || !this.swapped) && Boolean(k) && Math.hypot(player.x - k!.x, player.y - k!.y) < KEEPER_REACH;
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
    if (input.interact && this.nearKeeper) this.talkTo();
  }

  private talkTo(): void {
    this.busy = true;
    this.nearKeeper = false;
    this.prompt.hidden = true;
    this.host.menu(
      { trained: this.used, swapped: this.swapped },
      (levels) => {
        this.busy = false;
        this.trained(levels);
      },
      (ok) => {
        this.busy = false;
        this.swapped = this.swapped || ok !== null;
        if (ok) this.say('Meuh ! Je l’ai renvoyé au Repaire. Prends bien soin du nouveau.');
        else if (ok === false) this.say('Meuh… Personne au Repaire n’est libre pour un échange.');
      },
      () => (this.busy = false),
    );
  }

  private say(text: string): void {
    this.bubble.textContent = text;
    this.bubbleT = 3.5;
  }

  /** L'entraînement est fait : Écrémeuh piétine, l'enclos brille. */
  private trained(levels: number): void {
    const p = this.pen!;
    this.used = true;
    this.fx.attackAnim('fx_boost', (p.x0 + p.x1 + 1) / 2, (p.y0 + p.y1 + 1) / 2);
    const m = this.keeper;
    if (m) {
      m.setPose(['Stomp', 'Idle']);
      this.stompT = 0.9;
    }
    this.host.message(`L’équipe s’entraîne à la pension : ${levels} niveau${levels > 1 ? 'x' : ''} gagné${levels > 1 ? 's' : ''} !`);
    this.say('Meuh ! Revenez quand vous voulez.');
  }


  /** L'invite [E] telle qu'elle s'affiche (HTML), vide si elle est masquée : envoyée aux invités en ligne (main.ts). */
  promptHtml(): string {
    return promptHtml(this.prompt);
  }
  private renderPrompt(): void {
    if (!this.nearKeeper) {
      this.prompt.hidden = true;
      return;
    }
    if (!this.prompt.hidden) return;
    const el = (cls: string, text: string) => Object.assign(document.createElement('div'), { className: cls, textContent: text });
    const offers = [...(this.used ? [] : ['entraîner l’équipe']), ...(this.swapped ? [] : ['échanger un membre contre un Pokémon du Repaire'])];
    this.prompt.replaceChildren(
      el('shop-name', 'Pension'),
      el('da-stamp shop-cost', 'Gratuit'),
      el('shop-desc', `Écrémeuh peut ${offers.join(', ou ')}.`),
      el('shop-note', 'Chacun une fois par pension.'),
      el('shop-buy', '✔ Parler à Écrémeuh [E]'),
    );
    this.prompt.hidden = false;
  }

  placeLabels(proj: Projector): void {
    const m = this.keeper;
    if (!this.active || !m) return;
    const head = m.sheet ? (m.sheet.footRow + 1 - m.sheet.topRow) / 16 : 1.4;
    const pos = proj.toCss(m.x, m.y - head - 0.4);
    this.bubble.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -100%)`;
  }
}
