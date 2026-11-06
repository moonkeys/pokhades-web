import type { Pokemon } from '../combat/pokemon';
import { NICK_MAX } from '../meta/save';
import { statCard } from './statsheet';
import { hint } from './hints';

// Fiche de recrutement, en grotte : le prisonnier qu'on vient de libérer. À gauche sa bande de papier (la même que la fiche des
// statistiques, touche C : PV, stats, attaques) ; à droite un surnom à lui
// donner et la question qui compte — rejoint-il l'équipe tout de suite ?
// Le jeu se fige tant qu'elle est ouverte (main.ts) ; Entrée valide le
// premier choix, Échap ou un clic à côté referment sans choisir (il attend
// alors sur place, on peut revenir lui parler).
//
// Le jeu Godot n'a pas d'équivalent : son demi-boss de grotte débloquait
// l'espèce sans rien demander, et il n'y avait ni prisonniers ni surnoms.
// Ici aussi, l'espèce est débloquée d'office (main.ts) : la fiche ne décide
// que de la run en cours.

/** 'team' : il rejoint l'équipe tout de suite ; 'stay' : il part au Repaire. */
export type RecruitChoice = 'team' | 'stay';

export interface RecruitOffer {
  mon: Pokemon;
  /** Six membres déjà : le premier choix est grisé. */
  teamFull: boolean;
  /**
   * Ajout : les textes d'une autre rencontre que le prisonnier de grotte — le
   * visiteur qu'un nectar attire au Repaire (main.ts). Absents : ceux de la grotte.
   */
  text?: { tape: string; quote: string; ask: string; yes: string; no: string; hint: string };
}

const CAVE_TEXT: NonNullable<RecruitOffer['text']> = {
  tape: 'Prisonnier libéré',
  quote: '« Merci ! Sans vous, je pourrissais encore au fond de cette grotte. »',
  ask: 'Rejoint-il l’équipe tout de suite ?',
  yes: 'Oui, dans l’équipe',
  no: 'Non, au Repaire',
  hint: 'Libéré, son espèce est débloquée : il vit désormais au Repaire, et Porygon peut l’ajouter à l’équipe d’une run à l’autre. Dans l’équipe tout de suite, il se bat avec vous jusqu’à la fin de celle-ci.',
};

const el = (tag: string, cls: string, parent?: HTMLElement, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
};

export class RecruitScreen {
  private readonly root: HTMLElement;
  private onPick: ((choice: RecruitChoice | null, nick: string) => void) | null = null;
  private input: HTMLInputElement | null = null;
  private primary: HTMLButtonElement | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'stats recruit', parent);
    this.root.hidden = true;
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.pick(null);
    });
    // En capture : fiche ouverte, le jeu ne reçoit aucune touche. Le champ du
    // surnom garde la frappe (pas de preventDefault quand on y écrit).
    addEventListener(
      'keydown',
      (e) => {
        if (this.root.hidden) return;
        e.stopImmediatePropagation();
        if (e.code === 'Escape') {
          e.preventDefault();
          this.pick(null);
        } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
          e.preventDefault();
          this.pick(this.primary && !this.primary.disabled ? 'team' : 'stay');
        } else if (e.target !== this.input) e.preventDefault();
      },
      { capture: true },
    );
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /** `onPick(null, …)` : refermée sans choisir. Le surnom est rendu tel que tapé (vide : aucun). */
  show(offer: RecruitOffer, onPick: (choice: RecruitChoice | null, nick: string) => void): void {
    const { mon, teamFull } = offer;
    const text = offer.text ?? CAVE_TEXT;
    this.onPick = onPick;
    this.root.replaceChildren();
    const page = el('div', 'stats-page recruit-page', this.root);
    const head = el('div', 'stats-head', page);
    el('span', 'da-tape', head, text.tape);
    el('small', 'stats-keys', head, hint('Entrée : valider · Échap : plus tard', 'Touche « Plus tard » pour décider après'));

    const body = el('div', 'recruit-body', page);
    const card = statCard(body, { mon });
    // Le nom de la carte suit le surnom qu'on tape.
    const nameNode = card.querySelector('.nm')!.firstChild!;

    const side = el('div', 'recruit-side da-paper', body);
    el('p', 'recruit-quote', side, text.quote);
    const label = el('label', 'recruit-nick', side);
    el('small', '', label, 'Surnom');
    const input = el('input', '', label) as HTMLInputElement;
    input.type = 'text';
    input.maxLength = NICK_MAX;
    input.placeholder = mon.name;
    input.spellcheck = false;
    input.addEventListener('input', () => (nameNode.textContent = input.value.trim() || mon.name));
    this.input = input;

    el('div', 'recruit-ask', side, text.ask);
    const acts = el('div', 'recruit-acts', side);
    const yes = el('button', 'recruit-yes', acts, teamFull ? 'Équipe au complet' : text.yes) as HTMLButtonElement;
    yes.disabled = teamFull;
    yes.addEventListener('click', () => this.pick('team'));
    this.primary = yes;
    const no = el('button', 'recruit-no', acts, text.no) as HTMLButtonElement;
    no.addEventListener('click', () => this.pick('stay'));
    el('small', 'recruit-hint', side, text.hint);

    this.root.hidden = false;
    // On peut taper le surnom d'emblée.
    input.focus();
  }

  private pick(choice: RecruitChoice | null): void {
    if (this.root.hidden) return;
    const nick = this.input?.value.trim() ?? '';
    this.input?.blur();
    this.root.hidden = true;
    this.root.replaceChildren();
    this.input = this.primary = null;
    const done = this.onPick;
    this.onPick = null;
    done?.(choice, nick);
  }
}
