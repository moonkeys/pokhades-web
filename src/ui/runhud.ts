import { curve, spray } from './spray';

// HUD de run, repris de HUD.gd et redessiné dans la DA « Tag sacré »
// (src/ui/da.css, planche ui-r4.html) : en haut à gauche le lieu et les ₽ de
// la run, au centre un message sur bande de papier (salle libérée, victoire,
// défaite), à droite les notifications, le nom de la zone tagué à l'entrée
// d'un biome, la barre du boss, et le voile noir des transitions.
//
// Écarts voulus avec le jeu : plus de ligne d'état (acte, salle, vague,
// niveau) — le lieu suffit, le reste se découvre ; les messages deviennent des
// notifications qui s'empilent au lieu de se remplacer. La barre de boss est
// un ajout : une seule grosse jauge pour toutes ses barres de PV (2 pour un
// Pokémon de champion, 5 pour son as).

export interface BossInfo {
  name: string;
  /** « As de Blanche », « Équipe de Blanche »… */
  sub: string;
  ace: boolean;
  bars: number;
  barsLeft: number;
  /** PV de la barre en cours, 0..1. */
  ratio: number;
}

/** Une notification : un titre, une ligne, et l'illustration d'un Pokémon (n° de Pokédex) ou un symbole. */
export interface Notice {
  title?: string;
  text: string;
  art?: number;
  icon?: string;
  /** Couleur du bord. */
  color?: string;
  /** Pokémon K.O. : son image passe en gris. */
  ko?: boolean;
}

/** Combien de notifications à la fois, et combien de temps chacune reste. */
const MAX_NOTICES = 4;
const NOTICE_TIME = 4.5;
const TOAST_TIME = 2.4;

const el = (tag: string, cls: string, parent?: HTMLElement, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
};

/** Zones déjà vues (toutes runs confondues) : « Nouvelle zone » ne s'affiche qu'à la première visite. */
const SEEN_KEY = 'pokhades-seen-zones';
function firstVisit(name: string): boolean {
  try {
    const seen = new Set<string>(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'));
    if (seen.has(name)) return false;
    seen.add(name);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    // Stockage indisponible : chaque visite compte comme la première.
  }
  return true;
}

export class RunHud {
  private readonly zone: HTMLElement;
  private readonly money: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly notices: HTMLElement;
  private readonly title: HTMLElement;
  private readonly veil: HTMLElement;
  private readonly boss: HTMLElement;
  private readonly bossName: HTMLElement;
  private readonly bossSub: HTMLElement;
  private readonly bossFill: HTMLElement;
  private readonly bossGhost: HTMLElement;
  private bossKey = '';
  private ghost = 1;
  private lastMoney = -1;
  private titleT = Infinity;
  private toastT = Infinity;
  private live: { el: HTMLElement; t: number }[] = [];

  constructor(parent: HTMLElement) {
    const bar = el('div', 'run-bar', parent);
    this.zone = el('span', 'da-tape', bar);
    this.money = el('span', 'da-stamp', bar);
    this.toastEl = el('div', 'run-toast da-paper', parent);
    this.toastEl.style.opacity = '0';
    this.notices = el('div', 'run-notifs', parent);
    this.title = el('div', 'run-title', parent);
    this.boss = el('div', 'boss-bar', parent);
    const who = el('div', 'who', this.boss);
    this.bossName = el('span', 'da-tape', who);
    this.bossSub = el('small', '', who);
    const gauge = el('div', 'da-gauge', this.boss);
    this.bossGhost = el('i', '', gauge);
    this.bossFill = el('b', '', gauge);
    this.boss.hidden = true;
    this.veil = el('div', 'run-veil', parent);
  }

  /**
   * Barre du Pokémon de champion en jeu (null : aucune). Une seule jauge pour
   * toutes ses barres de PV ; le fantôme rattrape les dégâts.
   */
  setBoss(info: BossInfo | null, dt: number): void {
    this.boss.hidden = !info;
    if (!info) return;
    const total = (info.barsLeft - 1 + info.ratio) / info.bars;
    const key = `${info.name}|${info.sub}`;
    if (key !== this.bossKey) {
      this.bossKey = key;
      this.bossName.replaceChildren();
      if (info.ace) el('span', 'ace', this.bossName, '★ ');
      this.bossName.append(info.name.toUpperCase());
      this.bossSub.textContent = info.sub;
      this.ghost = total;
    }
    this.ghost = Math.max(total, this.ghost - dt * 0.4);
    this.bossFill.style.setProperty('--v', `${total * 100}%`);
    this.bossGhost.style.setProperty('--v', `${this.ghost * 100}%`);
  }

  /** Une notification à droite, en haut de la pile ; les plus anciennes pâlissent puis partent. */
  notify(n: Notice): void {
    const card = el('div', 'notif da-paper');
    if (n.color) card.style.setProperty('--c', n.color);
    const ico = el('div', `ico${n.ko ? ' ko' : ''}`, card);
    if (n.art) {
      const img = el('img', '', ico) as HTMLImageElement;
      img.src = `/game/artwork/${n.art}.png`;
      img.alt = '';
    } else ico.textContent = n.icon ?? '✦';
    const body = el('div', '', card);
    if (n.title) el('b', '', body, n.title);
    el('span', '', body, n.text);
    this.notices.prepend(card);
    this.live.unshift({ el: card, t: 0 });
    for (const old of this.live.splice(MAX_NOTICES)) old.el.remove();
  }

  /** Message court sans titre (boutique, boons, montée de niveau…) : une notification simple. */
  message(text: string): void {
    this.notify({ text });
  }

  /** Message central sur bande de papier, avec une étiquette jaune optionnelle (« +38 ₽ »). */
  toast(text: string, stamp?: string): void {
    this.toastEl.replaceChildren(text);
    if (stamp) el('span', 'da-stamp', this.toastEl, stamp);
    this.toastT = 0;
    this.toastEl.animate([{ transform: 'scale(1.3) rotate(-6deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(0.2, 1.4, 0.4, 1)' });
  }

  /**
   * Le nom d'une zone, tagué au centre (HUD.show_zone_title : apparition 0,35 s,
   * tenue 1,6 s, disparition 0,5 s). `color` : celle du biome ; `kicker` force
   * l'étiquette au-dessus, sinon « Nouvelle zone » à la première visite.
   */
  announce(name: string, color: string, kicker?: string): void {
    const label = kicker ?? (firstVisit(name) ? 'NOUVELLE ZONE' : '');
    this.title.style.setProperty('--zone', color);
    this.title.replaceChildren();
    if (label) el('div', 'kick da-tape', this.title, label);
    el('div', 'name', this.title, name);
    const under = el('div', 'under', this.title);
    under.innerHTML = spray({ ...curve([0, 4, 30, 2, 70, 6, 100, 3]), viewBox: '0 0 100 8', color, width: 2.3, drips: 9, dripMax: 5, dots: 10, seed: name.length * 7 + 3, delay: 0.25, draw: 0.4 });
    this.title.classList.remove('play');
    void this.title.offsetWidth;
    this.title.classList.add('play');
    this.titleT = 0;
  }

  /** `unit` : ₽ en run, Baies au Repaire. */
  update(dt: number, zone: string, money: number, fade: number, unit = '₽'): void {
    if (this.zone.textContent !== zone) this.zone.textContent = zone;
    const purse = unit === '₽' ? `₽ ${money}` : `${money} ${unit}`;
    if (purse !== this.money.textContent) {
      // Un gain ou une dépense fait sauter l'étiquette ; passer du Repaire à la run, non.
      if (this.lastMoney >= 0 && money !== this.lastMoney) this.pop(this.money);
      this.lastMoney = money;
      this.money.textContent = purse;
    }
    this.titleT += dt;
    const t = this.titleT;
    this.title.style.opacity = String(t < 0.35 ? t / 0.35 : t < 1.95 ? 1 : Math.max(0, 1 - (t - 1.95) / 0.5));
    this.toastT += dt;
    this.toastEl.style.opacity = this.toastT < TOAST_TIME ? '1' : '0';
    for (const n of this.live) {
      n.t += dt;
      n.el.classList.toggle('old', n.t > NOTICE_TIME * 0.6);
      n.el.classList.toggle('gone', n.t > NOTICE_TIME);
    }
    this.live = this.live.filter((n) => {
      if (n.t < NOTICE_TIME + 0.6) return true;
      n.el.remove();
      return false;
    });
    this.veil.style.opacity = String(fade);
  }

  private pop(e: HTMLElement): void {
    e.animate([{ transform: 'scale(1.15) rotate(3deg)' }, { transform: 'rotate(3deg)' }], { duration: 180, easing: 'ease-out' });
  }
}
