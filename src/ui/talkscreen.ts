import { sfx } from '../audio/audio';
import { hint } from './hints';

// Parler à un Pokémon des salles calmes quand il y a quelque chose à choisir
// (retour de test du 16 novembre 2026) : le menu d'Écrémeuh (entraîner ou
// échanger), un service proposé par un habitant (accepter ou non). Son
// portrait, ce qu'il dit, et des boutons ; 1, 2, 3 choisissent, Échap ferme.
// Le jeu se fige derrière (main.ts, paused).

export interface TalkOption {
  label: string;
  /** Grisé, avec la raison en info-bulle. */
  disabled?: string;
  pick: () => void;
}

const el = (tag: string, cls: string, parent?: HTMLElement, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
};

export class TalkScreen {
  private readonly root: HTMLElement;
  private options: TalkOption[] = [];
  private onClose: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'stats talk', parent);
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
        if (e.code === 'Escape') return this.close();
        const n = Number(e.key);
        if (n >= 1 && n <= this.options.length) this.choose(this.options[n - 1]);
      },
      { capture: true },
    );
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /** `onClose` : refermé sans choisir. */
  show(species: number, name: string, text: string, options: TalkOption[], onClose?: () => void): void {
    this.options = options;
    this.onClose = onClose ?? null;
    this.root.replaceChildren();
    const card = el('div', 'talk-card da-paper', this.root);
    const img = el('img', 'talk-art', card) as HTMLImageElement;
    img.src = `/game/artwork/${species}.png`;
    img.alt = '';
    const body = el('div', 'talk-body', card);
    el('span', 'da-tape', body, name.toUpperCase());
    el('p', 'talk-text', body, `« ${text} »`);
    const acts = el('div', 'recruit-acts talk-acts', body);
    options.forEach((o, i) => {
      const b = el('button', i === 0 ? 'recruit-yes' : 'recruit-no', acts, `${i + 1}. ${o.label}`) as HTMLButtonElement;
      if (o.disabled) {
        b.disabled = true;
        b.title = o.disabled;
      }
      b.addEventListener('click', () => this.choose(o));
    });
    el('small', 'talk-hint', body, hint('1, 2, 3 : choisir · Échap : fermer', 'Touche à côté pour fermer'));
    sfx('menuOpen');
    this.root.hidden = false;
  }

  private choose(o: TalkOption): void {
    if (o.disabled) return sfx('buzzer');
    this.hide();
    sfx('confirm');
    o.pick();
  }

  private hide(): void {
    this.root.hidden = true;
    this.root.replaceChildren();
    this.options = [];
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
