import { sfx } from '../audio/audio';
import { loadInfo, loadSheet } from '../assets/pmd';
import { Actor } from '../entities/actor';
import type { InputSample } from '../input/input';
import type { CombatFx, Projector } from '../render/combatfx';
import type { WorldMap } from '../world/generate';
import { TILE } from '../world/tiles';
import { Placer } from './placement';
import { CURSES, CURSE_IDS, type CurseId } from './run';

// Autel maudit, salle spéciale (A-FAIRE 1.9 : « d'autres salles (autel à dons
// maudits…) »). Pas d'ennemis, portes ouvertes, comme à la Source : au centre,
// une dalle de pierre noire où brûlent des flammes violettes, veillée par
// Feuforêve. La malédiction du pacte est tirée à l'arrivée et affichée sur la
// fiche : on sait ce qu'on signe. [E] : le pacte, une fois — un don d'un cran
// plus rare (main.ts : Boons.bonus), et la malédiction pèse jusqu'à la fin de
// l'acte (Run.curse). On peut aussi passer son chemin.
//
// Ni le tileset ni Essentials n'ont d'autel : il est dessiné, comme le bassin.

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
    const place = new Placer(world);
    const at = place.freeSpot(Math.floor(world.hub.x), Math.floor(world.hub.y));
    this.stone = { x: at.x, y: at.y };
    // La dalle couvre trois cases de large : on en fait le tour.
    for (let dx = -1; dx <= 1; dx++) {
      const c = Math.floor(at.y) * world.w + Math.floor(at.x) + dx;
      if (world.blocked[c] === 0) world.blocked[c] = 1;
      place.block(Math.floor(at.x) + dx, Math.floor(at.y));
    }
    const n = place.freeSpot(Math.floor(at.x) - 3, Math.floor(at.y) - 1);
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

  /** La dalle : pierre sombre, runes et flammes violettes, éteintes une fois le pacte signé. */
  extras(time: number): { y: number; draw(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void }[] {
    const p = this.stone;
    if (!this.active || !p) return [];
    return [
      {
        y: (p.y + 0.3) * TILE,
        draw: (b, camX, camY, k) => {
          const cx = (p.x * TILE - camX) * k;
          const cy = ((p.y + 0.2) * TILE - camY) * k;
          const W = 1.5 * TILE * k;
          const H = 0.55 * TILE * k;
          // Ombre, puis la dalle (dessus clair, flanc sombre).
          b.fillStyle = 'rgba(10,4,20,0.4)';
          b.beginPath();
          b.ellipse(cx, cy + H * 0.9, W * 1.1, H * 0.7, 0, 0, Math.PI * 2);
          b.fill();
          b.fillStyle = '#2b2433';
          b.fillRect(cx - W, cy - H * 0.2, W * 2, H);
          b.fillStyle = '#4a4054';
          b.fillRect(cx - W, cy - H * 0.9, W * 2, H * 0.75);
          b.fillStyle = '#5d5268';
          b.fillRect(cx - W, cy - H * 0.9, W * 2, Math.max(1, k));
          // Runes gravées, qui luisent tant que le pacte n'est pas signé.
          const glow = 1 - this.used;
          b.fillStyle = `rgba(190,140,255,${0.25 + 0.55 * glow * (0.6 + 0.4 * Math.sin(time * 3))})`;
          for (let i = -2; i <= 2; i++) b.fillRect(cx + i * W * 0.38 - k, cy + H * 0.15, 2 * k, H * 0.4);
          // Flammes aux deux coins.
          b.save();
          b.globalCompositeOperation = 'lighter';
          for (const side of [-1, 1]) {
            const fx = cx + side * W * 0.82;
            const fy = cy - H * 0.9;
            for (let i = 0; i < 5; i++) {
              const u = (time * 1.4 + i / 5 + (side > 0 ? 0.37 : 0)) % 1;
              const r = (1 - u) * 3.2 * k * glow;
              if (r <= 0.2) continue;
              b.fillStyle = `rgba(${170 + 60 * (1 - u)},${90 + 40 * u},255,${0.75 * (1 - u) * glow})`;
              b.beginPath();
              b.arc(fx + Math.sin(time * 6 + i) * 1.2 * k, fy - u * 0.9 * TILE * k, r, 0, Math.PI * 2);
              b.fill();
            }
          }
          b.restore();
        },
      },
    ];
  }

  placeLabels(proj: Projector): void {
    const m = this.keeper;
    if (!this.active || !m) return;
    const head = m.sheet ? (m.sheet.footRow + 1 - m.sheet.topRow) / 16 : 1.4;
    const pos = proj.toCss(m.x, m.y - head - 0.4);
    this.bubble.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -100%)`;
  }
}
