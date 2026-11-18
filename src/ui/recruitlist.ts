import { sfx } from '../audio/audio';
import { hint } from './hints';

// Les recrues qui attendent (Save.candidates), chez Dracolosse (retour de test du 18 novembre
// 2026 : « quand il y en a beaucoup, ça pollue le terrain… c'est Dracolosse qui propose la
// liste de tous les Pokémon qui veulent le rejoindre, avec un point d'exclamation quand il y en
// a un nouveau ; une interface simple, efficace, pour les recruter si on veut »). Elles ne
// flânent plus autour du feu : une carte par recrue, « Nouveau » sur celles qu'on n'a pas encore
// vues ; la carte ouvre sa fiche (ui/recruitscreen.ts, surnom, équipe ou Repaire), « Renvoyer »
// la laisse repartir. Même fond que la fiche de l'équipe (.stats).

export interface RecruitEntry {
  /** Rang dans Save.candidates. */
  idx: number;
  species: number;
  name: string;
  origin: string;
  fresh: boolean;
}

const el = (tag: string, cls: string, parent?: HTMLElement, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
};

export class RecruitList {
  private readonly root: HTMLElement;
  private onClose: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'stats swap recruits', parent);
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

  /** `meet` : on ouvre la fiche d'une recrue ; `dismiss` : on la renvoie ; `onClose` : refermé. */
  show(list: readonly RecruitEntry[], places: string, meet: (idx: number) => void, dismiss: (idx: number) => void, onClose: () => void): void {
    this.onClose = onClose;
    this.root.replaceChildren();
    const page = el('div', 'stats-page swap-page', this.root);
    const head = el('div', 'stats-head', page);
    el('span', 'da-tape', head, 'Dracolosse · les recrues');
    el('small', 'stats-keys', head, hint('Échap : fermer', 'Touche à côté pour fermer'));
    const box = el('div', 'swap-col da-paper', page);
    el('b', 'swap-title', box, `${list.length} Pokémon veulent rejoindre la rébellion`);
    el('p', 'swap-empty', box, places);
    const grid = el('div', 'swap-grid', box);
    for (const e of list) {
      const card = el('div', `swap-mon recruit-card${e.fresh ? ' fresh' : ''}`, grid);
      if (e.fresh) el('em', 'recruit-new', card, 'Nouveau');
      const img = el('img', '', card) as HTMLImageElement;
      img.src = `/game/artwork/${e.species}.png`;
      img.alt = '';
      el('span', '', card, e.name);
      el('small', '', card, e.origin || '—');
      const acts = el('div', 'train-btns', card);
      const yes = el('button', '', acts, 'Recruter');
      const no = el('button', '', acts, 'Renvoyer');
      yes.addEventListener('click', () => {
        sfx('confirm');
        this.hide();
        meet(e.idx);
      });
      no.addEventListener('click', () => {
        sfx('click');
        this.hide();
        dismiss(e.idx);
      });
    }
    const acts = el('div', 'recruit-acts swap-acts', page);
    const later = el('button', 'recruit-no', acts, 'Plus tard') as HTMLButtonElement;
    later.addEventListener('click', () => this.close());
    sfx('menuOpen');
    this.root.hidden = false;
  }

  private hide(): void {
    this.root.hidden = true;
    this.root.replaceChildren();
    this.onClose = null;
  }

  close(): void {
    if (this.root.hidden) return;
    const cb = this.onClose;
    this.hide();
    sfx('menuClose');
    cb?.();
  }
}
