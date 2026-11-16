import { sfx } from '../audio/audio';
import { loadImage, loadInfo, loadSheet } from '../assets/pmd';
import { Actor } from '../entities/actor';
import type { InputSample } from '../input/input';
import type { CombatFx, Projector } from '../render/combatfx';
import { blobTile, useGrid, type WorldMap } from '../world/generate';
import { hash2 } from '../core/rng';
import { BLOB, CAMP_PROPS, FLOWERS, LILIES, PROPS, TILE } from '../world/tiles';
import { Placer } from './placement';

// Source, salle spéciale de soin (A-FAIRE 1.9 : « d'autres salles (soin…) »).
// Pas d'ennemis, portes ouvertes, comme chez le marchand : au centre, un
// bassin d'eau claire veillé par Leveinard. [E] au bord du bassin, une fois :
// chaque membre de l'équipe regagne SPRING_HEAL de ses PV max et perd son
// statut, et un membre K.O. se relève (le relever passe par main.ts, qui sait
// le faire pour les Rappels). Le bassin pâlit ensuite.
//
// L'étang est fait des tuiles de mare du tileset (retour de test du 16 novembre
// 2026 : pas de décor dessiné à la main, et la fontaine ne convainquait pas).

export const SPRING_NPC = 113;
/** Part des PV max rendue à chaque membre. */
export const SPRING_HEAL = 0.6;
/** Portée pour parler à Leveinard (cases), et les demi-axes de l'étang. */
const REACH = 1.8;
const POND_RX = 4.5;
const POND_RY = 3;
const LINES = ['Lei ! Bois, l’eau de la source soigne tout.', 'Lei-lei ! Repose-toi un peu avant de repartir.'];

export interface SpringHost {
  /** Soigne l'équipe ; rend combien de membres se sont relevés. */
  heal(): number;
  message(text: string): void;
  /** Parler à Leveinard (main.ts, menu) : `drink` s'il propose de boire et qu'on accepte, `closed` sinon. */
  menu(canDrink: boolean, drink: () => void, closed: () => void): void;
}

export class Spring {
  active = false;
  readonly npcs: Actor[] = [];
  /** L'étang : son milieu et ses demi-axes (cases). */
  private pool: { x: number; y: number; rx: number; ry: number } | null = null;
  /** 0 : pleine ; 0 → 1 : l'eau pâlit après usage. */
  private used = 0;
  /** Leveinard est en pleine conversation (menu ouvert). */
  private busy = false;
  private dew: HTMLImageElement | null = null;
  /** Les coins des fées (residents.ts) : centre et rayon de promenade. */
  spots: { x: number; y: number; r: number }[] = [];
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
    void loadImage('/game/assets/essentials/items/SOULDEW.png').then((img) => (this.dew = img), () => {});
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
    // Retour de test du 16 novembre 2026 (« pas convaincu par la source », posée en plein
    // chemin) : au milieu de la place du Sanctuaire, un étang aux bords du tileset (le jeu
    // « mare », cuit avec le sol), des nénuphars, des fleurs et des pierres pâles autour.
    const place = new Placer(world);
    const cx = Math.floor(world.hub.x);
    const cy = Math.floor(world.hub.y);
    place.clearArea(cx - 7, cy - 6, 15, 12);
    const pool = { x: cx + 0.5, y: cy + 1, rx: POND_RX, ry: POND_RY };
    this.pool = pool;
    const mask = new Uint8Array(world.w * world.h);
    // Un rectangle aux coins coupés : une ellipse tramée laissait des pointes d'une case, que le
    // jeu de bordures ne sait pas arrondir.
    const [ex0, ex1, ey0, ey1] = [cx - 4, cx + 4, cy - 2, cy + 3];
    for (let y = ey0; y <= ey1; y++)
      for (let x = ex0; x <= ex1; x++) if (!((x === ex0 || x === ex1) && (y === ey0 || y === ey1))) mask[y * world.w + x] = 1;
    useGrid(world.w, world.h);
    const blob = BLOB.pond;
    const deep: { x: number; y: number }[] = [];
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      const x = i % world.w;
      const y = (i / world.w) | 0;
      world.decals.push({ tile: blobTile(mask, x, y, blob), x, y });
      place.block(x, y);
      if (mask[i - 1] && mask[i + 1] && mask[i - world.w] && mask[i + world.w]) deep.push({ x, y });
    }
    // Trois nénuphars, au large.
    for (let k = 0; k < Math.min(3, deep.length); k++) {
      const d = deep[Math.floor(((k + 1) * deep.length) / 4) % deep.length];
      world.decals.push({ tile: LILIES.pond[k % LILIES.pond.length], x: d.x, y: d.y });
    }
    // Une couronne de fleurs et quelques pierres pâles sur la berge.
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2 + 0.3;
      const r = 1.35 + hash2(k, cx, 71) * 0.5;
      const x = Math.floor(pool.x + Math.cos(a) * pool.rx * r);
      const y = Math.floor(pool.y + Math.sin(a) * pool.ry * r);
      const i = y * world.w + x;
      if (world.blocked[i] || world.path[i] || world.water[i]) continue;
      world.flat.push({ tile: FLOWERS[k % FLOWERS.length], x, y });
    }
    place.prop(PROPS.paleRocks[0], cx - 5, cy - 1.5);
    place.prop(PROPS.paleStones[0], cx - 4.5, cy + 3.2, false);
    place.prop(PROPS.paleStones[2], cx + 3.5, cy - 2.8, false);
    place.prop(PROPS.paleStones[3], cx + 4.8, cy + 3.4, false);
    // Retour de test (« un truc qui fait plus source magique ») : une statue veille à la tête de
    // l'étang, d'où montent des éclats de lumière (extras), et l'eau jaillit en soins (update).
    place.prop(CAMP_PROPS.statue, cx + 0.5, cy - 2.2);
    place.prop(PROPS.paleRocks[1], cx - 2.5, cy - 2.6);
    place.prop(PROPS.paleStones[1], cx + 3, cy - 3, false);
    // Les fées de la source (residents.ts), autour de l'étang.
    this.spots = [
      { x: cx - 5.5, y: cy + 4.5, r: 2 },
      { x: cx + 5, y: cy + 5, r: 2 },
      { x: cx - 6.5, y: cy - 1, r: 1.5 },
    ];
    const n = { x: cx + 6.5, y: cy + 0.9 };
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
    // Retour de test : la Source s'active en parlant à Leveinard, qui la garde.
    const nurse = this.nurse;
    this.near = !this.busy && Boolean(nurse) && Math.hypot(player.x - nurse!.x, player.y - nurse!.y) < REACH;
    this.bubbleT -= dt;
    const m = this.nurse;
    if (m && !this.talked && Math.hypot(player.x - m.x, player.y - m.y) < 5) {
      this.talked = true;
      this.bubble.textContent = LINES[Math.floor(rand() * LINES.length)];
      this.bubbleT = 3.5;
    }
    this.bubble.classList.toggle('open', this.bubbleT > 0);
    this.renderPrompt();
    if (input.interact && this.near) {
      this.busy = true;
      this.near = false;
      this.prompt.hidden = true;
      this.host.menu(
        this.used === 0,
        () => {
          this.busy = false;
          this.drink();
        },
        () => (this.busy = false),
      );
    }
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
      el('shop-desc', this.used ? 'L’équipe a déjà bu à la source.' : `Chaque membre regagne ${Math.round(SPRING_HEAL * 100)} % de ses PV et perd son statut ; un membre K.O. se relève.`),
      el('shop-note', 'Une seule fois.'),
      el('shop-buy', '✔ Parler à Leveinard [E]'),
    );
    this.prompt.hidden = false;
  }

  /**
   * La magie de la source (retour de test : « des petits halos de lumière, un truc qui flotte au
   * milieu du lac ») : la Rosée Âme d'Essentials flotte au-dessus de l'eau, dans un grand halo qui
   * respire ; des halos plus petits naissent et s'éteignent sur l'étang, des éclats montent. Tout
   * pâlit une fois qu'on a bu.
   */
  extras(time: number): { y: number; draw(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void }[] {
    const q = this.pool;
    if (!this.active || !q) return [];
    const glow = 1 - this.used * 0.75;
    const halo = (b: CanvasRenderingContext2D, x: number, y: number, r: number, a: number) => {
      const g = b.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(220,255,250,${a})`);
      g.addColorStop(0.4, `rgba(140,230,255,${a * 0.45})`);
      g.addColorStop(1, 'rgba(120,200,255,0)');
      b.fillStyle = g;
      b.beginPath();
      b.arc(x, y, r, 0, Math.PI * 2);
      b.fill();
    };
    return [
      {
        y: (q.y + q.ry + 1) * TILE,
        draw: (b, camX, camY, k) => {
          const X = (x: number) => (x * TILE - camX) * k;
          const Y = (y: number) => (y * TILE - camY) * k;
          b.save();
          b.globalCompositeOperation = 'lighter';
          // Les halos qui naissent et s'éteignent sur l'eau.
          for (let i = 0; i < 6; i++) {
            const u = (time * 0.25 + i / 6) % 1;
            const a = i * 2.1 + Math.floor(time * 0.25 + i / 6) * 1.7;
            const life = Math.sin(u * Math.PI);
            halo(b, X(q.x + Math.cos(a) * q.rx * 0.6), Y(q.y + Math.sin(a) * q.ry * 0.5), (0.9 + life * 0.5) * TILE * k, 0.35 * life * glow);
          }
          // Les éclats qui montent.
          for (let i = 0; i < 14; i++) {
            const u = (time * 0.35 + i / 14) % 1;
            const a = i * 2.39;
            const r = Math.max(1, (1.6 - u) * k);
            b.fillStyle = `rgba(${190 + 50 * (1 - u)},255,235,${0.75 * (1 - u) * glow})`;
            b.beginPath();
            b.arc(X(q.x + Math.cos(a) * q.rx * 0.75) + Math.sin(time * 2 + i) * 1.5 * k, Y(q.y + Math.sin(a) * q.ry * 0.6) - u * 1.8 * TILE * k, r, 0, Math.PI * 2);
            b.fill();
          }
          // Le grand halo de la Rosée Âme, qui respire.
          const bob = Math.sin(time * 1.6) * 0.18;
          const ox = X(q.x);
          const oy = Y(q.y - 0.6 + bob);
          halo(b, ox, oy, (1.9 + Math.sin(time * 2.2) * 0.2) * TILE * k, 0.55 * glow);
          b.restore();
          // Son reflet, puis la Rosée Âme elle-même (pixels nets).
          const dew = this.dew;
          if (dew) {
            const s = k * 0.75;
            const w = dew.width * s;
            const h = dew.height * s;
            b.save();
            b.globalAlpha = 0.25 * glow;
            b.imageSmoothingEnabled = false;
            b.drawImage(dew, Math.round(ox - w / 2), Math.round(Y(q.y + 0.5 - bob) - h / 2), Math.round(w), Math.round(h * 0.5));
            b.globalAlpha = 0.6 + 0.4 * glow;
            b.drawImage(dew, Math.round(ox - w / 2), Math.round(oy - h / 2), Math.round(w), Math.round(h));
            b.restore();
          }
        },
      },
    ];
  }

  placeLabels(proj: Projector): void {
    const m = this.nurse;
    if (!this.active || !m) return;
    const head = m.sheet ? (m.sheet.footRow + 1 - m.sheet.topRow) / 16 : 1.4;
    const pos = proj.toCss(m.x, m.y - head - 0.4);
    this.bubble.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -100%)`;
  }
}
