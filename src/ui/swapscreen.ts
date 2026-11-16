import { sfx } from '../audio/audio';
import { hint } from './hints';

// Échange à la Pension (run/pension.ts, retour de test du 16 novembre 2026 :
// « pouvoir juste échanger avec un Pokémon déjà existant… le renvoyer au
// Repaire et prendre un nouveau à la place ») : on choisit le membre qui
// rentre, puis le libéré du Repaire qui prend sa place. Mêmes fond et en-tête
// que la fiche de l'équipe (.stats).

export interface SwapEntry {
  /** Rang dans l'équipe (sortant) ou uid au Repaire (entrant). */
  key: number;
  species: number;
  name: string;
  level: number;
  ko?: boolean;
}

const el = (tag: string, cls: string, parent?: HTMLElement, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
};

export class SwapScreen {
  private readonly root: HTMLElement;
  private onPick: ((out: number, inc: number) => void) | null = null;
  private onCancel: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'stats swap', parent);
    this.root.hidden = true;
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.close();
    });
    // En capture : écran ouvert, le jeu ne reçoit aucune touche.
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

  show(outs: readonly SwapEntry[], ins: readonly SwapEntry[], onPick: (out: number, inc: number) => void, onCancel: () => void): void {
    this.onPick = onPick;
    this.onCancel = onCancel;
    this.root.replaceChildren();
    const page = el('div', 'stats-page swap-page', this.root);
    const head = el('div', 'stats-head', page);
    el('span', 'da-tape', head, 'Pension · échange');
    el('small', 'stats-keys', head, hint('Échap : fermer', 'Touche à côté pour fermer'));

    let out = -1;
    let inc = -1;
    const go = document.createElement('button');
    const refresh = () => (go.disabled = out < 0 || inc < 0);
    const column = (title: string, list: readonly SwapEntry[], pick: (k: number) => void, empty: string) => {
      const box = el('div', 'swap-col da-paper', page);
      el('b', 'swap-title', box, title);
      if (!list.length) el('p', 'swap-empty', box, empty);
      const grid = el('div', 'swap-grid', box);
      for (const e of list) {
        const card = el('button', `swap-mon${e.ko ? ' ko' : ''}`, grid) as HTMLButtonElement;
        const img = el('img', '', card) as HTMLImageElement;
        img.src = `/game/artwork/${e.species}.png`;
        img.alt = '';
        el('span', '', card, e.name);
        el('small', '', card, `N.${e.level}${e.ko ? ' · K.O.' : ''}`);
        card.addEventListener('click', () => {
          for (const c of grid.querySelectorAll('.on')) c.classList.remove('on');
          card.classList.add('on');
          sfx('click');
          pick(e.key);
          refresh();
        });
      }
    };
    column('Qui rentre au Repaire ?', outs, (k) => (out = k), '');
    column('Qui prend sa place ?', ins, (k) => (inc = k), 'Personne au Repaire n’est libre : ils sont tous dans l’équipe ou en mission.');
    const acts = el('div', 'recruit-acts swap-acts', page);
    go.className = 'recruit-yes';
    go.textContent = 'Échanger';
    acts.append(go);
    go.addEventListener('click', () => {
      if (out < 0 || inc < 0) return;
      const done = this.onPick;
      this.hide();
      done?.(out, inc);
    });
    const no = el('button', 'recruit-no', acts, 'Plus tard') as HTMLButtonElement;
    no.addEventListener('click', () => this.close());
    el('small', 'swap-note', page, 'Le nouveau venu arrive avec ses attaques et son objet, PV pleins, au niveau de celui qu’il remplace s’il est plus bas.');
    refresh();
    this.root.hidden = false;
  }

  private hide(): void {
    this.root.hidden = true;
    this.root.replaceChildren();
    this.onPick = null;
    this.onCancel = null;
  }

  private close(): void {
    if (this.root.hidden) return;
    const cancel = this.onCancel;
    this.hide();
    cancel?.();
  }
}
