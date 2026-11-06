import { BASE_TEAM_LEVEL, Pokemon } from '../combat/pokemon';
import { STARTER_IDS } from '../data/species';
import { applyTraits, natureText, TRAIT_STATS, type NatureId, type TraitStat } from '../meta/mons';
import { NICK_MAX } from '../meta/save';
import { statCard } from './statsheet';
import { hint } from './hints';

// Le questionnaire du premier lancement (ajout, retour de test : « un petit questionnaire,
// un peu comme dans Donjon Mystère, qui permet de définir un Pokémon de départ »). Cinq
// questions, quatre réponses chacune ; chaque réponse penche vers deux des neuf starters
// (GameManager.STARTER_IDS). Le plus choisi l'emporte (à égalité, le hasard), avec la
// nature qui va avec — comme Donjon Mystère, où la nature décidait du Pokémon. On peut
// toujours préférer un autre partenaire (StarterScreen) : le questionnaire propose, il
// n'impose pas. Écart voulu (retour de test : « choisir un nom, voir ses stats et déjà ses
// attaques ») : la révélation est sa fiche (statistiques, attaques, nature) et son nom.

const el = (tag: string, cls: string, parent?: HTMLElement, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
};

/** La nature que révèle chaque starter. */
export const STARTER_NATURE: Record<number, NatureId> = {
  25: 'jolly', // Pikachu : joyeux, plein d'entrain
  570: 'impish', // Zorua : farceur
  359: 'calm', // Absol : solitaire, posé
  725: 'brave', // Flamiaou : fier
  656: 'timid', // Grenousse : discret
  390: 'hasty', // Ouisticram : impulsif
  674: 'naughty', // Pandespiègle : bagarreur au grand cœur
  559: 'rash', // Baggiguane : voyou
  447: 'adamant', // Riolu : droit
  7: 'bold', // Carapuce : posé, solide sous sa carapace
};

const [PIKACHU, ZORUA, ABSOL, FLAMIAOU, GRENOUSSE, OUISTICRAM, PANDESPIEGLE, BAGGIGUANE, RIOLU, CARAPUCE] = STARTER_IDS;

const QUESTIONS: readonly { q: string; a: readonly [string, readonly number[]][] }[] = [
  {
    q: 'Un dresseur te barre la route. Que fais-tu ?',
    a: [
      ['Je fonce, on verra bien.', [OUISTICRAM, PANDESPIEGLE]],
      ['Je le contourne en douce.', [GRENOUSSE, ZORUA]],
      ['Je le regarde droit dans les yeux.', [RIOLU, FLAMIAOU]],
      ['J’attends qu’il fasse le premier geste.', [ABSOL, PIKACHU, CARAPUCE]],
    ],
  },
  {
    q: 'Un ami a le moral à zéro. Tu…',
    a: [
      ['…le fais rire, coûte que coûte.', [PIKACHU, ZORUA]],
      ['…restes près de lui, sans rien dire.', [ABSOL, GRENOUSSE, CARAPUCE]],
      ['…l’emmènes courir loin d’ici.', [OUISTICRAM, PIKACHU]],
      ['…retrouves celui qui lui a fait du mal.', [BAGGIGUANE, PANDESPIEGLE]],
    ],
  },
  {
    q: 'Ton moment préféré de la journée ?',
    a: [
      ['L’aube, quand tout dort encore.', [RIOLU, GRENOUSSE, CARAPUCE]],
      ['Midi, en plein soleil.', [PIKACHU, OUISTICRAM]],
      ['Le crépuscule.', [FLAMIAOU, ABSOL]],
      ['La nuit noire.', [ZORUA, BAGGIGUANE]],
    ],
  },
  {
    q: 'Quelqu’un te tend une Poké Ball dorée. Tu…',
    a: [
      ['…la brises en mille morceaux.', [PANDESPIEGLE, BAGGIGUANE]],
      ['…la gardes, pour ne jamais oublier.', [RIOLU, ABSOL]],
      ['…la troques contre un bon repas.', [ZORUA, FLAMIAOU]],
      ['…la jettes au fond du lac.', [GRENOUSSE, OUISTICRAM, CARAPUCE]],
    ],
  },
  {
    q: 'Qu’est-ce qui compte le plus pour toi ?',
    a: [
      ['Être libre, quoi qu’il en coûte.', [FLAMIAOU, BAGGIGUANE]],
      ['Mes amis.', [PIKACHU, PANDESPIEGLE, CARAPUCE]],
      ['Ce qui est juste.', [RIOLU, ABSOL]],
      ['Ne jamais m’ennuyer.', [ZORUA, OUISTICRAM, GRENOUSSE]],
    ],
  },
];

export class QuizScreen {
  private readonly root: HTMLElement;
  private onDone: ((id: number, nick: string) => void) | null = null;
  private pickOther: ((back: (id: number) => void) => void) | null = null;
  private input: HTMLInputElement | null = null;
  private step = 0;
  private sel = 0;
  private score = new Map<number, number>();
  private buttons: HTMLElement[] = [];
  private result: number | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'stats starter quiz', parent);
    this.root.hidden = true;
    // En capture : le jeu ne reçoit aucune touche tant que le questionnaire est ouvert.
    addEventListener(
      'keydown',
      (e) => {
        if (this.root.hidden) return;
        e.stopImmediatePropagation();
        // Le champ du nom garde la frappe ; Entrée y valide.
        if (e.target === this.input && e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
        e.preventDefault();
        const n = this.buttons.length;
        if (!n) return;
        if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') this.select((this.sel + n - 1) % n);
        else if (e.code === 'ArrowDown' || e.code === 'ArrowRight') this.select((this.sel + 1) % n);
        else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' || e.code === 'KeyE') this.buttons[this.sel].click();
      },
      { capture: true },
    );
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /**
   * `onDone` : le starter accepté, et le nom qu'on lui donne (vide : celui de l'espèce).
   * `pickOther` : « Choisir un autre » ouvre la liste des starters, qui rappelle `back`.
   */
  show(onDone: (id: number, nick: string) => void, pickOther: (back: (id: number) => void) => void): void {
    this.onDone = onDone;
    this.pickOther = pickOther;
    this.step = 0;
    this.score.clear();
    this.result = null;
    this.root.hidden = false;
    this.renderQuestion();
  }

  private select(i: number): void {
    this.sel = i;
    this.buttons.forEach((b, k) => b.classList.toggle('sel', k === i));
  }

  private page(tape: string): HTMLElement {
    this.root.replaceChildren();
    const page = el('div', 'stats-page starter-page quiz-page', this.root);
    const head = el('div', 'stats-head', page);
    el('span', 'da-tape', head, tape);
    el('small', 'stats-keys', head, hint('Flèches ou clic : choisir · Entrée : valider', 'Touche une réponse'));
    return page;
  }

  private renderQuestion(): void {
    const { q, a } = QUESTIONS[this.step];
    const page = this.page(`Qui es-tu ? · ${this.step + 1}/${QUESTIONS.length}`);
    el('p', 'quiz-q', page, q);
    const list = el('div', 'quiz-answers', page);
    this.buttons = a.map(([text, ids], i) => {
      const b = el('button', 'quiz-a da-paper', list, text);
      b.addEventListener('mouseenter', () => this.select(i));
      b.addEventListener('click', () => {
        for (const id of ids) this.score.set(id, (this.score.get(id) ?? 0) + 1);
        this.step++;
        if (this.step < QUESTIONS.length) this.renderQuestion();
        else void this.renderResult();
      });
      return b;
    });
    this.select(0);
  }

  private renderResult(): void {
    const best = Math.max(...STARTER_IDS.map((id) => this.score.get(id) ?? 0));
    const tied = STARTER_IDS.filter((id) => (this.score.get(id) ?? 0) === best);
    void this.reveal(tied[Math.floor(Math.random() * tied.length)]);
  }

  /** La fiche du starter : statistiques (nature comprise) et attaques, son nom à donner, et le choix. */
  private async reveal(id: number): Promise<void> {
    this.result = id;
    const mon = await Pokemon.load(id, BASE_TEAM_LEVEL);
    const nature = STARTER_NATURE[id] ?? 'hardy';
    applyTraits(mon, { uid: 0, species: id, nature, iv: Object.fromEntries(TRAIT_STATS.map((k) => [k, 0])) as Record<TraitStat, number> });
    this.root.hidden = false;
    const page = this.page('Voilà qui tu es');
    page.classList.add('recruit-page');
    const body = el('div', 'recruit-body', page);
    const card = statCard(body, { mon });
    const nameNode = card.querySelector('.nm')!.firstChild!;
    const side = el('div', 'recruit-side da-paper', body);
    el('p', 'quiz-q', side, `Tu es… ${mon.name} !`);
    el('small', 'quiz-nature', side, `Nature : ${natureText(nature)}`);
    const label = el('label', 'recruit-nick', side);
    el('small', '', label, 'Ton nom');
    const input = el('input', '', label) as HTMLInputElement;
    input.type = 'text';
    input.maxLength = NICK_MAX;
    input.placeholder = mon.name;
    input.spellcheck = false;
    input.addEventListener('input', () => (nameNode.textContent = input.value.trim() || mon.name));
    this.input = input;
    const acts = el('div', 'recruit-acts', side);
    const yes = el('button', 'recruit-yes', acts, 'C’est parti !');
    const other = el('button', 'recruit-no', acts, 'Choisir un autre');
    yes.addEventListener('click', () => this.finish(input.value.trim()));
    other.addEventListener('click', () => {
      this.root.hidden = true;
      this.pickOther?.((sid) => void this.reveal(sid));
    });
    this.buttons = [yes, other];
    this.select(0);
    input.focus();
  }

  private finish(nick: string): void {
    const id = this.result;
    this.input?.blur();
    this.root.hidden = true;
    this.root.replaceChildren();
    this.buttons = [];
    this.input = null;
    const done = this.onDone;
    this.onDone = this.pickOther = null;
    if (id !== null) done?.(id, nick);
  }
}
