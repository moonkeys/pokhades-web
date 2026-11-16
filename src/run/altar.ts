import { sfx } from '../audio/audio';
import { loadInfo, loadSheet } from '../assets/pmd';
import { Actor } from '../entities/actor';
import type { InputSample } from '../input/input';
import type { CombatFx, Projector } from '../render/combatfx';
import type { WorldMap, WorldObject } from '../world/generate';
import { ALTAR_CIRCLE, ALTAR_FLOOR, ALTAR_PROPS, CAMP_PROPS, PROPS, TILE, TREES, type SpriteDef } from '../world/tiles';
import { Placer } from './placement';
import { CURSES, CURSE_IDS, type CurseId } from './run';

// Autel maudit, salle spéciale (A-FAIRE 1.9 : « d'autres salles (autel à dons
// maudits…) »). Pas d'ennemis, portes ouvertes, comme à la Source : au centre,
// un cercle magique entre deux torches, veillé par Feuforêve. La malédiction du pacte est tirée à l'arrivée et affichée sur la
// fiche : on sait ce qu'on signe. [E] : le pacte, une fois — un don d'un cran
// plus rare (main.ts : Boons.bonus), et la malédiction pèse jusqu'à la fin de
// l'acte (Run.curse). On peut aussi passer son chemin.
//
// Retour de test du 16 novembre 2026 (pas de décor dessiné à la main) : la
// dalle peinte au pinceau devient le cercle magique de la Tour des morts
// d'Essentials (ALTAR_CIRCLE), et ses flammes les torches du Repaire ; signer
// le pacte les éteint (elles quittent la salle).

export const ALTAR_NPC = 200;
const REACH = 2.2;
const LINES = ['Hi hi hi… Un don, un vrai. Il suffit de signer…', 'Feuforêve ricane : tout pouvoir a son prix.'];

export interface AltarHost {
  /** Le pacte : la malédiction (annoncée par l'hôte), et l'écran des dons (un cran plus rare). */
  pact(curse: CurseId): void;
}

export class Altar {
  active = false;
  readonly npcs: Actor[] = [];
  private stone: { x: number; y: number } | null = null;
  private world: WorldMap | null = null;
  /** Les deux torches : signer le pacte les éteint (elles quittent la salle). */
  private torches: WorldObject[] = [];
  /** Où montent les esprits violets (cases). */
  private wisps: { x: number; y: number }[] = [];
  /** Les coins des habitants (residents.ts) : centre et rayon de promenade. */
  spots: { x: number; y: number; r: number }[] = [];
  private curse: CurseId = 'levels';
  /** 0 : intact ; 0 → 1 : les flammes s'éteignent après le pacte. */
  private used = 0;
  private near = false;
  private keeper: Actor | null = null;
  private talked = false;
  private bubbleT = 0;
  private readonly prompt: HTMLElement;
  private readonly bubble: HTMLElement;
  private readonly layer: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly fx: CombatFx,
    private readonly host: AltarHost,
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
    this.stone = null;
    this.world = null;
    this.torches = [];
    this.wisps = [];
    this.spots = [];
    this.keeper = null;
    this.npcs.length = 0;
    this.hide();
  }

  hide(): void {
    this.near = false;
    this.prompt.hidden = true;
    this.bubble.classList.remove('open');
  }

  /** L'autel au centre de la salle, Feuforêve qui flotte à côté ; `rand` tire la malédiction. */
  start(world: WorldMap, rand: () => number): void {
    this.clear();
    this.active = true;
    this.used = 0;
    this.talked = false;
    this.curse = CURSE_IDS[Math.floor(rand() * CURSE_IDS.length)];
    // Retour de test du 16 novembre 2026 (« il est tout petit, encore sur le chemin ») : au milieu
    // de la place du Sanctuaire, un dallage de la Tour des morts (9 × 7 cases, cuit avec le sol),
    // le cercle magique au centre, des gargouilles aux quatre coins, des urnes, et deux torches qui
    // s'éteignent au pacte. On marche sur le dallage ; on signe dans le cercle.
    const place = new Placer(world);
    const cx = Math.floor(world.hub.x);
    const cy = Math.floor(world.hub.y);
    place.clearArea(cx - 6, cy - 6, 13, 12);
    this.stone = { x: cx + 0.5, y: cy + 0.5 };
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const fx = (((dx + 4) % ALTAR_FLOOR.w) + ALTAR_FLOOR.w) % ALTAR_FLOOR.w;
        const fy = (((dy + 3) % ALTAR_FLOOR.h) + ALTAR_FLOOR.h) % ALTAR_FLOOR.h;
        world.decals.push({ tile: [ALTAR_FLOOR.tile[0] + fx, ALTAR_FLOOR.tile[1] + fy], x: cx + dx, y: cy + dy });
      }
    for (let dy = 0; dy < ALTAR_CIRCLE.h; dy++)
      for (let dx = 0; dx < ALTAR_CIRCLE.w; dx++) world.decals.push({ tile: [ALTAR_CIRCLE.tile[0] + dx, ALTAR_CIRCLE.tile[1] + dy], x: cx - 1 + dx, y: cy - 1 + dy });
    // Gargouilles : les hautes au fond, sur socle devant.
    place.prop(ALTAR_PROPS.tall, cx - 3.5, cy - 2);
    place.prop(ALTAR_PROPS.tall, cx + 4.5, cy - 2);
    place.prop(ALTAR_PROPS.statues[0], cx - 3.5, cy + 4);
    place.prop(ALTAR_PROPS.statues[1], cx + 4.5, cy + 4);
    place.prop(ALTAR_PROPS.urns[1], cx - 2.5, cy - 2);
    place.prop(ALTAR_PROPS.urns[0], cx + 3.5, cy - 2);
    this.world = world;
    this.torches = [-1.5, 2.5].map((dx) => place.prop(CAMP_PROPS.torch, cx + dx, cy - 1.6));
    // Autour du dallage (retour de test : « encore un peu plus de décor autour ») : arbres morts,
    // gargouilles sur socle le long des bords, grands champignons et cailloux.
    const around: [SpriteDef, number, number][] = [
      [TREES.dead[0], cx - 6.5, cy - 2],
      [TREES.dead[0], cx + 7.5, cy + 1],
      [TREES.dead[0], cx - 6, cy + 5],
      [ALTAR_PROPS.statues[0], cx - 5.5, cy + 1],
      [ALTAR_PROPS.statues[1], cx + 6.5, cy - 2],
      [PROPS.tallMushroom[0], cx + 6.5, cy + 4],
      [PROPS.tallMushroom[0], cx - 5.5, cy - 4],
      [ALTAR_PROPS.urns[1], cx + 5.5, cy + 5],
      [PROPS.rockSmall[0], cx + 2.5, cy + 5.5],
      [PROPS.rockSmall[1], cx - 2.5, cy - 5],
    ];
    for (const [sp, x, y] of around) place.prop(sp, x, y);
    // Les esprits qui montent (dessinés : extras), au-dessus des gargouilles et des torches.
    // (Retour de test : « encore plus de petites flammes violettes ».) Au-dessus des gargouilles, des
    // torches, des urnes et des arbres morts ; d'autres tournent autour du cercle (extras).
    this.wisps = [
      [cx - 3.5, cy - 4], [cx + 4.5, cy - 4], [cx - 1.5, cy - 3.4], [cx + 2.5, cy - 3.4], [cx - 3.5, cy + 2.4], [cx + 4.5, cy + 2.4],
      [cx - 2.5, cy - 2.6], [cx + 3.5, cy - 2.6], [cx - 6.5, cy - 4], [cx + 7.5, cy - 1], [cx - 6, cy + 3], [cx - 5.5, cy + 0.2], [cx + 6.5, cy - 3.2],
    ].map(([x, y]) => ({ x, y }));
    this.spots = [
      { x: cx - 4, y: cy + 6, r: 2.5 },
      { x: cx + 5, y: cy + 6.5, r: 2.5 },
    ];
    const n = { x: cx + 0.5, y: cy - 1.6 };
    const actor = new Actor(ALTAR_NPC, n.x, n.y);
    actor.dir = 0;
    void loadInfo(ALTAR_NPC).then((i) => (actor.info = i));
    void loadSheet(ALTAR_NPC, ['Idle']).then((sh) => {
      actor.sheet = sh;
      actor.setPose(['Idle']);
    });
    this.keeper = actor;
    this.npcs.push(actor);
  }

  update(dt: number, input: InputSample, player: Actor, rand: () => number): void {
    if (!this.active || !this.stone) return;
    if (this.used > 0) this.used = Math.min(1, this.used + dt / 1.5);
    this.near = this.used === 0 && Math.hypot(player.x - this.stone.x, player.y - this.stone.y) < REACH;
    this.bubbleT -= dt;
    const m = this.keeper;
    if (m && !this.talked && Math.hypot(player.x - m.x, player.y - m.y) < 5) {
      this.talked = true;
      this.bubble.textContent = LINES[Math.floor(rand() * LINES.length)];
      this.bubbleT = 3.5;
    }
    this.bubble.classList.toggle('open', this.bubbleT > 0);
    this.renderPrompt();
    if (input.interact && this.near) this.sign();
  }

  private sign(): void {
    const p = this.stone!;
    this.used = 0.01;
    this.near = false;
    this.prompt.hidden = true;
    sfx('buzzer');
    this.fx.attackAnim('ghost', p.x, p.y);
    for (const t of this.torches) {
      this.fx.attackAnim('ghost', t.x / TILE, t.y / TILE - 1, undefined, true);
      const list = this.world?.objects;
      const i = list ? list.indexOf(t) : -1;
      if (i >= 0) list!.splice(i, 1);
    }
    this.torches = [];
    this.bubble.textContent = 'Hi hi hi ! Marché conclu…';
    this.bubbleT = 2.5;
    this.host.pact(this.curse);
  }

  private renderPrompt(): void {
    if (!this.near) {
      this.prompt.hidden = true;
      return;
    }
    if (!this.prompt.hidden) return;
    const el = (cls: string, text: string) => Object.assign(document.createElement('div'), { className: cls, textContent: text });
    const c = CURSES[this.curse];
    this.prompt.replaceChildren(
      el('shop-name', 'Pacte de l’autel'),
      el('da-stamp shop-cost', `☠ ${c.name}`),
      el('shop-desc', `Un don d’un légendaire, d’un cran plus rare. En échange, jusqu’à la fin de l’acte : ${c.desc.charAt(0).toLowerCase()}${c.desc.slice(1)}`),
      el('shop-note', 'Une seule fois. Tu peux aussi passer ton chemin.'),
      el('shop-buy', '✔ Signer [E]'),
    );
    this.prompt.hidden = false;
  }

  /**
   * Les esprits de l'Autel (retour de test : « les petits esprits violets qui volaient, tu peux
   * les remettre ») : des feux follets qui montent au-dessus des gargouilles et des torches, en
   * mode additif ; ils pâlissent une fois le pacte signé.
   */
  extras(time: number): { y: number; draw(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void }[] {
    if (!this.active || !this.wisps.length) return [];
    const glow = 1 - this.used * 0.7;
    const c = this.stone!;
    // Des feux follets qui tournent autour du cercle, à hauteur d'épaule.
    const orbit = {
      y: (c.y + 2) * TILE,
      draw: (b: CanvasRenderingContext2D, camX: number, camY: number, k: number) => {
        b.save();
        b.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 5; i++) {
          const a = time * 0.6 + (i / 5) * Math.PI * 2;
          const x = ((c.x + Math.cos(a) * 2.4) * TILE - camX) * k;
          const y = ((c.y + Math.sin(a) * 1.4) * TILE - camY) * k - (1 + Math.sin(time * 2 + i) * 0.3) * TILE * k;
          const g = b.createRadialGradient(x, y, 0, x, y, 6 * k);
          g.addColorStop(0, `rgba(230,190,255,${0.85 * glow})`);
          g.addColorStop(0.35, `rgba(170,100,255,${0.45 * glow})`);
          g.addColorStop(1, 'rgba(120,60,200,0)');
          b.fillStyle = g;
          b.beginPath();
          b.arc(x, y, 6 * k, 0, Math.PI * 2);
          b.fill();
        }
        b.restore();
      },
    };
    return [orbit, ...this.wisps.map((w, j) => ({
      y: (w.y + 3) * TILE,
      draw: (b: CanvasRenderingContext2D, camX: number, camY: number, k: number) => {
        const fx = (w.x * TILE - camX) * k;
        const fy = (w.y * TILE - camY) * k;
        b.save();
        b.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 4; i++) {
          const u = (time * 0.7 + i / 4 + j * 0.37) % 1;
          const r = (1 - u) * 3 * k * glow;
          if (r <= 0.2) continue;
          b.fillStyle = `rgba(${170 + 60 * (1 - u)},${90 + 40 * u},255,${0.7 * (1 - u) * glow})`;
          b.beginPath();
          b.arc(fx + Math.sin(time * 3 + i + j) * 2 * k, fy - u * 1.6 * TILE * k, r, 0, Math.PI * 2);
          b.fill();
        }
        b.restore();
      },
    }))];
  }

  placeLabels(proj: Projector): void {
    const m = this.keeper;
    if (!this.active || !m) return;
    const head = m.sheet ? (m.sheet.footRow + 1 - m.sheet.topRow) / 16 : 1.4;
    const pos = proj.toCss(m.x, m.y - head - 0.4);
    this.bubble.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -100%)`;
  }
}
