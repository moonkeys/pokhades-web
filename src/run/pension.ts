import { sfx } from '../audio/audio';
import { loadInfo, loadSheet } from '../assets/pmd';
import { Actor } from '../entities/actor';
import type { InputSample } from '../input/input';
import type { CombatFx, Projector } from '../render/combatfx';
import type { WorldMap } from '../world/generate';
import { CAMP_PROPS, FENCES, TILE } from '../world/tiles';
import { Placer } from './placement';

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
const REACH = 3.6;
const KEEPER_REACH = 1.8;
const LINES = ['Meuh ! Laisse-les gambader dans l’enclos, ils en ressortiront plus forts.', 'Écrémeuh rumine, le regard sur le foin frais.'];

export interface PensionHost {
  /** Entraîne l'équipe ; rend le nombre total de niveaux gagnés. */
  train(): number;
  /** Ouvre l'écran d'échange ; `done(true)` si un membre a été échangé. Faux : pas d'échange possible. */
  swap(done: (swapped: boolean) => void): boolean;
  message(text: string): void;
}

export class Pension {
  active = false;
  readonly npcs: Actor[] = [];
  private pen: { x: number; y: number } | null = null;
  private used = false;
  private near = false;
  /** À côté d'Écrémeuh, l'échange encore possible. */
  private nearKeeper = false;
  private swapped = false;
  private busy = false;
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
    this.near = this.nearKeeper = false;
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
    const place = new Placer(world);
    const at = place.freeSpot(Math.floor(world.hub.x), Math.floor(world.hub.y));
    this.pen = { x: at.x, y: at.y };
    // L'enclos, 5 × 5 cases, tout du tileset : le foin des paillasses du Repaire (3 × 3) au
    // milieu, cuit avec le sol, et la clôture de bois des jardins de village tout autour. On en
    // fait le tour, on n'y marche pas.
    const cx = Math.floor(at.x);
    const cy = Math.floor(at.y);
    place.clearArea(cx - 2, cy - 2, 5, 5);
    const { col: hc, row: hr } = CAMP_PROPS.hay;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) world.decals.push({ tile: [hc + dx + 1, hr + dy + 1], x: cx + dx, y: cy + dy });
    const [fc, fr] = FENCES.wood.origin;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const c = (cy + dy) * world.w + cx + dx;
        if (world.blocked[c] === 0) world.blocked[c] = 1;
        place.block(cx + dx, cy + dy);
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) continue;
        const col = dx === -2 ? 0 : dx === 2 ? 2 : 1;
        const row = dy === -2 ? 0 : dy === 2 ? 2 : 1;
        world.objects.push({ sprite: { rect: [(fc + col) * TILE, (fr + row) * TILE, TILE, TILE], foot: TILE - 1, trunk: 1 }, x: (cx + dx) * TILE + TILE / 2, y: (cy + dy + 1) * TILE - 1, fades: false });
      }
    const n = place.freeSpot(cx - 4, cy + 1);
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
    const k = this.keeper;
    this.nearKeeper = !this.swapped && !this.busy && Boolean(k) && Math.hypot(player.x - k!.x, player.y - k!.y) < KEEPER_REACH;
    this.near = !this.nearKeeper && !this.used && !this.busy && Math.hypot(player.x - this.pen.x, player.y - this.pen.y) < REACH;
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
    if (input.interact && this.nearKeeper) this.trade();
    else if (input.interact && this.near) this.train();
  }

  private trade(): void {
    this.busy = true;
    this.nearKeeper = false;
    this.prompt.hidden = true;
    sfx('menuOpen');
    const opened = this.host.swap((swapped) => {
      this.busy = false;
      if (!swapped) return;
      this.swapped = true;
      this.say('Meuh ! Je l’ai renvoyé au Repaire. Prends bien soin du nouveau.');
    });
    if (!opened) {
      this.busy = false;
      this.swapped = true;
      this.say('Meuh… Personne au Repaire n’est libre pour un échange.');
    }
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
    const mode = this.nearKeeper ? 'swap' : this.near ? 'train' : '';
    if (!mode) {
      this.prompt.hidden = true;
      return;
    }
    if (!this.prompt.hidden && this.prompt.dataset.mode === mode) return;
    this.prompt.dataset.mode = mode;
    const el = (cls: string, text: string) => Object.assign(document.createElement('div'), { className: cls, textContent: text });
    if (mode === 'swap') {
      this.prompt.replaceChildren(
        el('shop-name', 'Échange'),
        el('da-stamp shop-cost', 'Gratuit'),
        el('shop-desc', 'Renvoie un membre de l’équipe au Repaire, et fais venir à sa place un Pokémon qui y vit.'),
        el('shop-note', 'Un échange par pension.'),
        el('shop-buy', '✔ Échanger [E]'),
      );
      this.prompt.hidden = false;
      return;
    }
    this.prompt.replaceChildren(
      el('shop-name', 'Pension'),
      el('da-stamp shop-cost', 'Gratuit'),
      el('shop-desc', `Chaque membre de l’équipe gagne ${PENSION_LEVELS} niveau, le plus faible ${PENSION_LEVELS + 1}.`),
      el('shop-note', 'Une seule fois.'),
      el('shop-buy', '✔ Entraîner l’équipe [E]'),
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
