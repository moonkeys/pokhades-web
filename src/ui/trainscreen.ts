import { sfx } from '../audio/audio';
import { hint } from './hints';

// Entraînement à la Pension (retour de test du 16 novembre 2026 : « un petit
// menu pour savoir à qui tu donnes les niveaux ») : Écrémeuh offre quelques
// niveaux, on les répartit entre les membres avec + et −, puis on valide.
// Même fond que la fiche de l'équipe (.stats).

export interface TrainEntry {
  key: number;
  species: number;
  name: string;
  level: number;
}

const el = (tag: string, cls: string, parent?: HTMLElement, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
};

export class TrainScreen {
  private readonly root: HTMLElement;
  private onCancel: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'stats train', parent);
    this.root.hidden = true;
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.close();
    });
    addEventListener(
      'keydown',
      (e) => {
        if (this.root.hidden) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        if (e.code === 'Escape') this.close();
      },
      { capture: true },
    );
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /**
   * `done` reçoit les niveaux donnés à chaque membre (par clé) ; `cancel` : refermé sans valider.
   * `shop` (retour de test : « si on veut donner encore plus de niveaux, on peut payer ») : des
   * niveaux de plus, à `price` ₽ pièce, tant que `buy` accepte (il débite la bourse).
   */
  show(members: readonly TrainEntry[], points: number, done: (alloc: Map<number, number>) => void, cancel: () => void, shop?: { price: number; money: () => number; buy: () => boolean }): void {
    this.onCancel = cancel;
    this.root.replaceChildren();
    const page = el('div', 'stats-page swap-page', this.root);
    const head = el('div', 'stats-head', page);
    el('span', 'da-tape', head, 'Pension · entraînement');
    el('small', 'stats-keys', head, hint('Échap : plus tard', 'Touche à côté pour fermer'));
    const box = el('div', 'swap-col da-paper', page);
    const left = el('b', 'swap-title', box);
    const grid = el('div', 'swap-grid', box);
    const alloc = new Map<number, number>(members.map((m) => [m.key, 0]));
    const go = document.createElement('button');
    const extra = document.createElement('button');
    const refresh = () => {
      const used = [...alloc.values()].reduce((a, b) => a + b, 0);
      left.textContent = `${points - used} niveau${points - used > 1 ? 'x' : ''} à répartir`;
      if (shop) {
        extra.textContent = `+1 niveau · ${shop.price} ₽ (bourse : ${shop.money()} ₽)`;
        extra.disabled = shop.money() < shop.price;
      }
      go.disabled = used < points;
      for (const card of grid.querySelectorAll<HTMLElement>('.swap-mon')) {
        const k = Number(card.dataset.key);
        const n = alloc.get(k) ?? 0;
        const m = members.find((x) => x.key === k)!;
        card.querySelector('small')!.textContent = n ? `N.${m.level} → N.${m.level + n}` : `N.${m.level}`;
        card.classList.toggle('on', n > 0);
      }
    };
    for (const m of members) {
      const card = el('div', 'swap-mon train-mon', grid);
      card.dataset.key = String(m.key);
      const img = el('img', '', card) as HTMLImageElement;
      img.src = `/game/artwork/${m.species}.png`;
      img.alt = '';
      el('span', '', card, m.name);
      el('small', '', card);
      const row = el('div', 'train-btns', card);
      const minus = el('button', '', row, '−');
      const plus = el('button', '', row, '+');
      minus.addEventListener('click', () => {
        const n = alloc.get(m.key) ?? 0;
        if (n <= 0) return;
        alloc.set(m.key, n - 1);
        sfx('click');
        refresh();
      });
      plus.addEventListener('click', () => {
        const used = [...alloc.values()].reduce((a, b) => a + b, 0);
        if (used >= points) return sfx('buzzer');
        alloc.set(m.key, (alloc.get(m.key) ?? 0) + 1);
        sfx('click');
        refresh();
      });
    }
    const acts = el('div', 'recruit-acts swap-acts', page);
    go.className = 'recruit-yes';
    go.textContent = 'Entraîner';
    acts.append(go);
    go.addEventListener('click', () => {
      if (go.disabled) return;
      this.hide();
      done(alloc);
    });
    if (shop) {
      extra.className = 'recruit-no';
      acts.append(extra);
      extra.addEventListener('click', () => {
        if (!shop.buy()) return sfx('buzzer');
        points++;
        sfx('buy');
        refresh();
      });
    }
    const no = el('button', 'recruit-no', acts, 'Plus tard') as HTMLButtonElement;
    no.addEventListener('click', () => this.close());
    el('small', 'swap-note', page, 'Une seule fois par pension. Les niveaux montent comme en combat : nouvelles attaques et évolutions comprises. Les ₽ dépensés le sont même si tu refermes.');
    refresh();
    sfx('menuOpen');
    this.root.hidden = false;
  }

  private hide(): void {
    this.root.hidden = true;
    this.root.replaceChildren();
    this.onCancel = null;
  }

  private close(): void {
    if (this.root.hidden) return;
    const cb = this.onCancel;
    this.hide();
    cb?.();
  }
}
