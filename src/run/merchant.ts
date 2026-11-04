import { sfx } from '../audio/audio';
import { loadImage, loadInfo, loadSheet } from '../assets/pmd';
import type { Rng } from '../core/rng';
import { Actor } from '../entities/actor';
import type { InputSample } from '../input/input';
import type { CombatFx, Projector } from '../render/combatfx';
import type { WorldMap } from '../world/generate';
import { TILE } from '../world/tiles';
import { Placer } from './placement';
import type { Run } from './run';

// Marchand ambulant, salle spéciale proposée au choix des portes (Run.special,
// ajout : le jeu Godot n'en a pas). Pas d'ennemis : Miaouss attend au centre,
// entre ses deux offres qui flottent comme les articles de la boutique. On
// s'en approche, la fiche s'affiche, [E] accepte. Chacune ne sert qu'une fois.
// - Pari : la moitié de ses ₽ en jeu ; pile, on la double, face, on la perd.
// - Échange : un tiers des PV de chaque membre de l'équipe (jamais jusqu'au
//   K.O.) contre un don de légendaire, choisi sur l'écran des dons.

export const MERCHANT_NPC = 52;
const REACH = 1.3;
/** Mise minimale : sous ce seuil, Miaouss refuse de jouer. */
const MIN_STAKE = 10;
const LINES = ['Miaou ! Un rebelle ! Tu as l’air d’aimer le risque…', 'Pile ou face ? Ou peut-être un petit échange…', 'Approche, approche : rien n’est gratuit, mais tout se négocie.'];

type OfferId = 'bet' | 'trade';

interface Offer {
  id: OfferId;
  name: string;
  desc: string;
  icon: string;
  x: number;
  y: number;
  /** 0 : là ; > 0 : déjà pris, il s'efface en montant. */
  used: number;
  phase: number;
}

export interface MerchantHost {
  message(text: string): void;
  /** L'équipe sur le terrain (pour payer en PV). */
  team(): readonly Actor[];
  /** Le don de l'échange : tirer un donateur et ouvrir l'écran des dons. */
  grantBoon(): void;
}

export class Merchant {
  active = false;
  readonly npcs: Actor[] = [];
  private offers: Offer[] = [];
  private near: Offer | null = null;
  private miaouss: Actor | null = null;
  private run: Run | null = null;
  private rng: Rng | null = null;
  private talked = false;
  private bubbleT = 0;
  private readonly icons = new Map<string, HTMLImageElement>();
  private readonly prompt: HTMLElement;
  private readonly bubble: HTMLElement;
  private readonly layer: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly fx: CombatFx,
    private readonly host: MerchantHost,
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
    for (const f of ['AMULETCOIN', 'HPUP']) {
      void loadImage(`/game/assets/essentials/items/${f}.png`).then((img) => this.icons.set(f, img), () => {});
    }
  }

  clear(): void {
    this.active = false;
    this.offers = [];
    this.near = null;
    this.miaouss = null;
    this.npcs.length = 0;
    this.prompt.hidden = true;
    this.bubble.classList.remove('open');
  }

  /** Masque l'invite et la bulle (grotte, Repaire) sans rien oublier de la salle. */
  hide(): void {
    this.near = null;
    this.prompt.hidden = true;
    this.prompt.dataset.key = '';
    this.bubble.classList.remove('open');
  }

  /** Miaouss au centre de la salle, ses deux offres de part et d'autre. */
  start(world: WorldMap, run: Run, rng: Rng): void {
    this.clear();
    this.active = true;
    this.run = run;
    this.rng = rng;
    this.talked = false;
    const place = new Placer(world);
    const hx = Math.floor(world.hub.x);
    const hy = Math.floor(world.hub.y);
    const at = place.freeSpot(hx, hy);
    const actor = new Actor(MERCHANT_NPC, at.x, at.y);
    actor.dir = 0;
    void loadInfo(MERCHANT_NPC).then((i) => (actor.info = i));
    void loadSheet(MERCHANT_NPC, ['Idle']).then((sh) => {
      actor.sheet = sh;
      actor.setPose(['Idle']);
    });
    place.block(Math.floor(at.x), Math.floor(at.y));
    this.miaouss = actor;
    this.npcs.push(actor);
    const bet = place.freeSpot(Math.floor(at.x) - 2, Math.floor(at.y) + 1);
    const trade = place.freeSpot(Math.floor(at.x) + 2, Math.floor(at.y) + 1);
    this.offers = [
      { id: 'bet', name: 'Pari de Miaouss', desc: 'Mise la moitié de tes ₽ : pile, tu doubles la mise ; face, tu la perds.', icon: 'AMULETCOIN', ...bet, used: 0, phase: 0 },
      { id: 'trade', name: 'Échange', desc: 'Un tiers des PV de chaque membre de l’équipe contre un don de légendaire.', icon: 'HPUP', ...trade, used: 0, phase: 1.7 },
    ];
  }

  update(dt: number, input: InputSample, player: Actor): void {
    if (!this.active) return;
    for (const o of this.offers) if (o.used > 0) o.used = Math.min(2, o.used + dt / 0.45);
    let best: Offer | null = null;
    let bestD = REACH;
    for (const o of this.offers) {
      const d = Math.hypot(player.x - o.x, player.y - o.y);
      if (o.used === 0 && d < bestD) {
        best = o;
        bestD = d;
      }
    }
    this.near = best;
    // Miaouss interpelle le joueur la première fois qu'il approche.
    const m = this.miaouss;
    this.bubbleT -= dt;
    if (m && !this.talked && Math.hypot(player.x - m.x, player.y - m.y) < 4) {
      this.talked = true;
      this.bubble.textContent = this.rng!.pick(LINES);
      this.bubbleT = 3.5;
    }
    this.bubble.classList.toggle('open', this.bubbleT > 0);
    this.renderPrompt();
    if (input.interact && best && !this.refusal(best)) this.accept(best);
  }

  /** Pourquoi Miaouss refuse cette offre maintenant (texte), ou '' s'il l'accepte. */
  private refusal(o: Offer): string {
    if (o.id === 'bet') return (this.run?.money ?? 0) < MIN_STAKE * 2 ? `Il faut au moins ${MIN_STAKE * 2} ₽ pour parier.` : '';
    return this.host.team().some((a) => a.pokemon && !a.pokemon.fainted && a.pokemon.hp > 1) ? '' : 'Ton équipe est trop affaiblie.';
  }

  private accept(o: Offer): void {
    const run = this.run!;
    o.used = 0.01;
    sfx('buy');
    this.fx.attackAnim('fx_boost', o.x, o.y);
    if (o.id === 'bet') {
      const stake = Math.floor(run.money / 2);
      const win = this.rng!.chance(0.5);
      run.money += win ? stake : -stake;
      this.host.message(win ? `Pile ! Miaouss paie : +${stake} ₽` : `Face… Miaouss empoche ${stake} ₽`);
      this.say(win ? 'Miaou… tu as de la chance, toi.' : 'Hé hé ! La maison gagne toujours.');
      return;
    }
    // L'échange : chacun cède un tiers de ses PV max, sans tomber sous 1 PV.
    for (const a of this.host.team()) {
      const mon = a.pokemon;
      if (!mon || mon.fainted) continue;
      mon.hp = Math.max(1, mon.hp - Math.ceil(mon.maxHp / 3));
      a.flash = { color: '#ff4d4d', t: 0.2, dur: 0.2, alpha: 0.5 };
    }
    this.say('Marché conclu ! Un légendaire te tend la patte.');
    this.host.grantBoon();
  }

  private say(text: string): void {
    this.bubble.textContent = text;
    this.bubbleT = 3;
  }

  private renderPrompt(): void {
    const o = this.near;
    if (!o) {
      this.prompt.hidden = true;
      this.prompt.dataset.key = '';
      return;
    }
    const refuse = this.refusal(o);
    const stake = o.id === 'bet' ? Math.floor((this.run?.money ?? 0) / 2) : 0;
    const key = `${o.id}|${refuse}|${stake}`;
    if (this.prompt.dataset.key === key && !this.prompt.hidden) return;
    this.prompt.dataset.key = key;
    const el = (cls: string, text: string) => Object.assign(document.createElement('div'), { className: cls, textContent: text });
    const icon = document.createElement('canvas');
    icon.width = icon.height = 48;
    const img = this.icons.get(o.icon);
    if (img) icon.getContext('2d')!.drawImage(img, 0, 0);
    const cost = o.id === 'bet' ? `${stake} ₽` : '⅓ PV';
    this.prompt.replaceChildren(icon, el('shop-name', o.name), el('da-stamp shop-cost', cost), el('shop-desc', o.desc), el('shop-note', refuse || 'Une seule fois.'), el('shop-buy', refuse ? '' : '✔ Accepter [E]'));
    this.prompt.classList.toggle('refused', Boolean(refuse));
    this.prompt.hidden = false;
  }

  /** Les deux offres, qui flottent au-dessus de leur ombre, triées avec les Pokémon. */
  extras(time: number): { y: number; draw(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void }[] {
    if (!this.active) return [];
    return this.offers
      .filter((o) => o.used < 1)
      .map((o) => ({
        y: o.y * TILE,
        draw: (b: CanvasRenderingContext2D, camX: number, camY: number, k: number) => {
          const img = this.icons.get(o.icon);
          if (!img) return;
          const cx = Math.round((o.x * TILE - camX) * k);
          const ground = Math.round((o.y * TILE - camY) * k);
          const wave = Math.sin(time * 2.2 + o.phase);
          const lift = Math.round((wave * 1.5 + 10 + o.used * 14) * k);
          b.fillStyle = 'rgba(20,12,4,0.35)';
          b.beginPath();
          b.ellipse(cx, ground, (5 - wave) * k, 1.5 * k, 0, 0, Math.PI * 2);
          b.fill();
          b.globalAlpha = Math.max(0, 1 - o.used);
          // L'offre devant laquelle on se tient grossit : c'est elle que [E] accepte.
          const size = Math.round((o === this.near ? 28 : 22) * k);
          b.drawImage(img, cx - size / 2, ground - lift - size, size, size);
          b.globalAlpha = 1;
        },
      }));
  }

  placeLabels(proj: Projector): void {
    const m = this.miaouss;
    if (!this.active || !m) return;
    const head = m.sheet ? (m.sheet.footRow + 1 - m.sheet.topRow) / 16 : 1.4;
    const p = proj.toCss(m.x, m.y - head - 0.4);
    this.bubble.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
  }
}
