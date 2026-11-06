import { typeColor } from '../render/combatfx';
import { species } from './campscreen';
import { typePill } from './hud';
import { hint } from './hints';

// Choix d'une évolution (retour de test : « Évoli et toutes ses évolutions, au choix du joueur »). Quand un
// Pokémon à plusieurs évolutions (data/evolutions.ts, BRANCHES) atteint son niveau, le jeu se fige et cet écran
// propose ses formes, une carte chacune, sur le modèle du choix du partenaire. « Plus tard » (ou Échap) referme
// sans rien décider : il retentera au niveau suivant, comme une évolution dont la planche n'a pas pu se charger.

const el = (tag: string, cls: string, parent?: HTMLElement, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
};

/** Le Pokémon qui évolue, tel qu'on le montre en tête de l'écran. */
export interface EvolvingMon {
  id: number;
  name: string;
  level: number;
}

const COLS = 4;

export class EvolutionScreen {
  private readonly root: HTMLElement;
  private onPick: ((id: number | null) => void) | null = null;
  private ids: readonly number[] = [];
  private cards: HTMLElement[] = [];
  private sel = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'stats starter evo', parent);
    this.root.hidden = true;
    // En capture : le jeu ne reçoit aucune touche tant qu'on n'a pas répondu.
    addEventListener(
      'keydown',
      (e) => {
        if (this.root.hidden) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        const n = this.ids.length;
        if (e.code === 'ArrowLeft') this.select((this.sel + n - 1) % n);
        else if (e.code === 'ArrowRight') this.select((this.sel + 1) % n);
        else if (e.code === 'ArrowUp') this.select((this.sel + n - COLS) % n);
        else if (e.code === 'ArrowDown') this.select((this.sel + COLS) % n);
        else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' || e.code === 'KeyE') this.pick(false);
        else if (e.code === 'Escape') this.pick(true);
      },
      { capture: true },
    );
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /** `onPick` reçoit la forme choisie, ou null pour « plus tard ». */
  show(from: EvolvingMon, ids: readonly number[], onPick: (id: number | null) => void): void {
    this.onPick = onPick;
    this.ids = ids;
    this.root.replaceChildren();
    const page = el('div', 'stats-page starter-page evo-page', this.root);
    const head = el('div', 'stats-head', page);
    el('span', 'da-tape', head, 'Évolution');
    el('small', 'stats-keys', head, hint('Flèches ou clic : choisir · Entrée : valider · Échap : plus tard', 'Touche une forme, puis valide'));

    const who = el('div', 'evo-from', page);
    const art = el('img', 'art', who) as HTMLImageElement;
    art.src = `/game/artwork/${from.id}.png`;
    art.alt = '';
    art.draggable = false;
    const txt = el('div', '', who);
    el('b', '', txt, `${from.name} évolue !`);
    el('small', '', txt, `Niveau ${from.level} · choisis sa nouvelle forme`);

    const grid = el('div', 'starter-grid evo-grid', page);
    this.cards = ids.map((id, i) => {
      const card = el('button', 'starter-card da-paper', grid);
      const img = el('img', 'art', card) as HTMLImageElement;
      img.src = `/game/artwork/${id}.png`;
      img.alt = '';
      img.draggable = false;
      const nm = el('b', 'nm', card, `#${id}`);
      const types = el('div', 'types', card);
      void species(id).then((d) => {
        nm.textContent = d.name;
        card.style.setProperty('--c', typeColor(d.types[0]));
        for (const t of d.types) typePill(t, types);
      });
      card.addEventListener('click', () => this.select(i));
      card.addEventListener('dblclick', () => this.pick(false));
      return card;
    });

    const row = el('div', 'starter-actions', page);
    el('button', 'starter-go', row, 'Évoluer !').addEventListener('click', () => this.pick(false));
    el('button', 'starter-go cancel', row, 'Plus tard').addEventListener('click', () => this.pick(true));
    this.select(0);
    this.root.hidden = false;
  }

  private select(i: number): void {
    this.sel = i;
    this.cards.forEach((c, k) => c.classList.toggle('sel', k === i));
  }

  private pick(later: boolean): void {
    if (this.root.hidden) return;
    const id = later ? null : this.ids[this.sel];
    this.root.hidden = true;
    this.root.replaceChildren();
    this.cards = [];
    const done = this.onPick;
    this.onPick = null;
    done?.(id);
  }
}
