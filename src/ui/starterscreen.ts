import { STARTER_IDS } from '../data/species';
import { typeColor } from '../render/combatfx';
import { species } from './campscreen';
import { typePill } from './hud';

// Choix du starter, au premier lancement (StarterSelect du jeu Godot) : rien
// n'est encore débloqué, on choisit son partenaire parmi les neuf de
// GameManager.STARTER_IDS. Il devient l'équipe et la seule espèce jouable ;
// les autres se débloquent en run (10 victoires, grottes, recrue de fin de run). L'écran ne se
// referme pas sans choix : le Repaire attend derrière, figé (main.ts).
//
// Ajout : le même écran sert à l'exil (retour de test : le Repaire plein, une
// recrue arrive, « choisir quel Pokémon doit partir ») — les libérés, chacun
// sous son surnom et sa nature, et un bouton pour renvoyer plutôt la recrue
// (main.ts, meetCandidate).

/** Textes et cartes de l'écran : le choix du starter par défaut. */
export interface PickOptions {
  /** Espèce de chaque carte (illustration, types ; et nom, sauf `names`). */
  ids: readonly number[];
  names?: readonly string[];
  /** Une ligne sous le nom (la nature, au moment de l'exil). */
  subs?: readonly string[];
  tape: string;
  quote: string;
  go: string;
  /** Un second bouton, qui referme sans choisir (onPick reçoit -1). */
  cancel?: string;
  /**
   * Un troisième bouton, « plus tard », qui referme sans rien décider (onPick reçoit -2) ;
   * c'est alors lui que prend Échap. Ajout (retour de test : « si je fais Échap, je ne
   * peux pas juste annuler, je suis obligé de choisir qui part »).
   */
  later?: string;
}

const STARTER: PickOptions = {
  ids: STARTER_IDS,
  tape: 'Choisis ton partenaire',
  quote: '« La Ligue tient les routes, mais la rébellion grandit. Prends un partenaire : les autres te rejoindront quand tu auras fait tes preuves. »',
  go: 'Je te choisis !',
};

const el = (tag: string, cls: string, parent?: HTMLElement, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
};

/** Trois cartes par rangée : les flèches haut et bas sautent d'une rangée. */
const COLS = 3;

export class StarterScreen {
  private readonly root: HTMLElement;
  private onPick: ((id: number, index: number) => void) | null = null;
  private cards: HTMLElement[] = [];
  private sel = 0;
  private ids: readonly number[] = STARTER_IDS;
  private cancelable = false;
  private deferrable = false;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'stats starter', parent);
    this.root.hidden = true;
    // En capture : le jeu ne reçoit aucune touche tant qu'on n'a pas choisi.
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
        else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' || e.code === 'KeyE') this.pick();
        else if (e.code === 'Escape' && this.deferrable) this.pick(true, true);
        else if (e.code === 'Escape' && this.cancelable) this.pick(true);
      },
      { capture: true },
    );
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(onPick: (id: number, index: number) => void, o: PickOptions = STARTER): void {
    this.onPick = onPick;
    this.ids = o.ids;
    this.cancelable = !!o.cancel;
    this.deferrable = !!o.later;
    this.root.replaceChildren();
    const page = el('div', 'stats-page starter-page', this.root);
    const head = el('div', 'stats-head', page);
    el('span', 'da-tape', head, o.tape);
    el('small', 'stats-keys', head, `Flèches ou clic : choisir · Entrée : valider${o.later ? ' · Échap : plus tard' : ''}`);
    el('p', 'starter-quote', page, o.quote);
    const grid = el('div', 'starter-grid', page);
    this.cards = o.ids.map((id, i) => {
      const card = el('button', 'starter-card da-paper', grid);
      const img = el('img', 'art', card) as HTMLImageElement;
      img.src = `/game/artwork/${id}.png`;
      img.alt = '';
      img.draggable = false;
      const nm = el('b', 'nm', card, o.names?.[i] ?? `#${id}`);
      const types = el('div', 'types', card);
      // (Dans la rangée des types, pour ne pas ajouter de ligne à la carte.)
      if (o.subs?.[i]) el('small', 'sub', types, o.subs[i]);
      void species(id).then((d) => {
        if (!o.names?.[i]) nm.textContent = d.name;
        card.style.setProperty('--c', typeColor(d.types[0]));
        for (const t of d.types) typePill(t, types);
      });
      card.addEventListener('click', () => this.select(i));
      card.addEventListener('dblclick', () => this.pick());
      return card;
    });
    const row = el('div', 'starter-actions', page);
    const go = el('button', 'starter-go', row, o.go);
    go.addEventListener('click', () => this.pick());
    if (o.cancel) el('button', 'starter-go cancel', row, o.cancel).addEventListener('click', () => this.pick(true));
    if (o.later) el('button', 'starter-go cancel', row, o.later).addEventListener('click', () => this.pick(true, true));
    this.select(0);
    this.root.hidden = false;
  }

  private select(i: number): void {
    this.sel = i;
    this.cards.forEach((c, k) => c.classList.toggle('sel', k === i));
  }

  private pick(cancel = false, later = false): void {
    if (this.root.hidden) return;
    const index = later ? -2 : cancel ? -1 : this.sel;
    const id = cancel ? -1 : this.ids[this.sel];
    this.root.hidden = true;
    this.root.replaceChildren();
    this.cards = [];
    const done = this.onPick;
    this.onPick = null;
    done?.(id, index);
  }
}
