import { typePill } from './hud';
import { isTouch } from '../input/touch';

// Dialogue d'un champion, repris de ChampionDialogueScreen.gd et redessiné
// dans la DA « Tag sacré » (src/ui/da.css) : en bas de l'écran, comme une
// scène, le champion en grand (son portrait de combat d'Essentials, détouré de
// blanc) à côté d'une bande de papier — son nom sur ruban, son type, son
// rôle, le texte tapé à 0,022 s par caractère puis lu 2,2 s avant de se
// fermer seul. Entrée ou E : un premier appui finit la frappe, un second ferme.
// Le jeu continue derrière ; le HUD s'efface le temps du dialogue (classe
// `talking` sur <body>, posée par main.ts).
//
// Écart voulu avec le jeu : pas de voile sombre sur l'écran. Le dialogue ne
// met pas le jeu en pause et la première vague arrive pendant qu'il défile ;
// le voile cachait l'arène au moment où il fallait la voir.

const CHAR_TIME = 0.022;
const READ_TIME = 2.2;

export interface Speaker {
  name: string;
  /** « Champion de la Ligue », « Dresseur final »… */
  role: string;
  type: string;
  /** Portrait de combat (Graphics/Trainers), ou rien. */
  sprite: string | null;
}

const el = (tag: string, cls: string, parent?: HTMLElement, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
};

export class Dialogue {
  private readonly root: HTMLElement;
  private readonly speaker: HTMLImageElement;
  private readonly head: HTMLElement;
  private readonly text: HTMLElement;
  private full = '';
  private t = 0;
  private onDone: (() => void) | null = null;
  /** Se referme seule une fois lue (sinon, on attend Entrée : les répliques de l'histoire). */
  private auto = true;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'dialogue', parent);
    this.root.hidden = true;
    this.speaker = el('img', 'speaker', this.root) as HTMLImageElement;
    this.speaker.alt = '';
    const sheet = el('div', 'sheet da-paper', this.root);
    this.head = el('div', 'nm', sheet);
    this.text = el('p', '', sheet);
    el('div', 'hint', sheet, isTouch() ? 'Touche pour passer…' : 'Entrée pour passer…');
    const advance = () => {
      const typed = Math.floor(this.t / CHAR_TIME);
      if (typed < this.full.length) this.t = this.full.length * CHAR_TIME;
      else this.close();
    };
    addEventListener('keydown', (e) => {
      if (this.root.hidden || (e.code !== 'Enter' && e.code !== 'KeyE')) return;
      advance();
    });
    // Au doigt (ou à la souris) : toucher l'écran fait comme Entrée.
    addEventListener('pointerdown', () => {
      if (!this.root.hidden) advance();
    });
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /** Durée totale (frappe + lecture), pour caler ce qui suit le dialogue. */
  static duration(text: string): number {
    return (text.length + 4) * CHAR_TIME + READ_TIME;
  }

  show(who: Speaker, text: string, onDone?: () => void, auto = true): void {
    this.full = `« ${text} »`;
    this.t = 0;
    this.auto = auto;
    this.onDone = onDone ?? null;
    this.head.replaceChildren(el('span', 'da-tape', undefined, who.name.toUpperCase()), typePill(who.type), el('small', '', undefined, who.role));
    this.text.textContent = '';
    this.speaker.hidden = !who.sprite;
    if (who.sprite) this.speaker.src = who.sprite;
    // Rejoue l'entrée (les animations CSS ne repartent qu'au réaffichage).
    this.root.hidden = true;
    void this.root.offsetWidth;
    this.root.hidden = false;
  }

  close(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    const done = this.onDone;
    this.onDone = null;
    done?.();
  }

  /** Temps réel : la frappe continue même pendant un gel d'impact. */
  update(dt: number): void {
    if (this.root.hidden) return;
    this.t += dt;
    const n = Math.min(this.full.length, Math.floor(this.t / CHAR_TIME));
    if (this.text.textContent!.length !== n) this.text.textContent = this.full.slice(0, n);
    if (this.auto && this.t >= this.full.length * CHAR_TIME + READ_TIME) this.close();
  }
}
