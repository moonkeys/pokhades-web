import { sfx } from '../audio/audio';
import { logo } from './logo';

// Le menu principal (demande du joueur : « ajouter un menu principal »), au lancement. Le
// Repaire se charge derrière, figé (main.ts compte cet écran dans `paused()`) et flouté :
// on voit le feu de camp sous le logo, des braises montent. Trois choix :
// - Jouer : ferme l'écran, et le jeu reprend là où il en était — le questionnaire du
//   starter si c'est une nouvelle partie (main.ts ne l'ouvre qu'après), sinon le Repaire ;
// - Réglages, Commandes : les deux onglets du menu de pause (settingsmenu.ts), ouverts
//   par-dessus ; on revient ici en le fermant.
//
// Au clavier : ↑↓ choisit, Entrée valide (comme les autres écrans) ; à la souris ou au
// doigt, un clic sur la ligne. Le premier son du jeu attend un geste (Web Audio) : le
// clic ou l'Entrée sur « Jouer » en est un, la musique du Repaire part avec.
//
// Repris de MainMenuScreen.gd (l'écran-titre du jeu Godot, qui mène au Hub, lequel ouvre
// lui-même le choix du starter à la première partie). Écart voulu : pas de scène à part
// ni de « Mode multijoueur » (en ligne, c’est Roucarnage, au Repaire, qui s’en charge) ; le
// Repaire est déjà là derrière, on y entre en levant l'affiche.

const el = (tag: string, cls: string, parent?: HTMLElement, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
};

export type TitleTab = 'Réglages' | 'Commandes';

export interface TitleHooks {
  /** « Jouer » : l'écran est déjà fermé quand on l'appelle. */
  play: () => void;
  /** Ouvre le menu des réglages sur cet onglet, et appelle `back` à sa fermeture. */
  settings: (tab: TitleTab, back: () => void) => void;
}

export class TitleScreen {
  private readonly root: HTMLElement;
  private hooks: TitleHooks | null = null;
  private items: { label: string; hint?: string; run: () => void }[] = [];
  private buttons: HTMLElement[] = [];
  private sel = 0;
  /** Le menu des réglages est ouvert par-dessus : il a la main sur le clavier. */
  private sub = false;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'title-screen', parent);
    this.root.hidden = true;
    // En capture, comme les autres écrans : le jeu (figé derrière) ne reçoit rien. Ce
    // gestionnaire est posé avant celui des réglages (main.ts crée cet écran plus tôt) :
    // tant qu'ils sont ouverts par-dessus, on les laisse faire.
    addEventListener(
      'keydown',
      (e) => {
        if (this.root.hidden || this.sub) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        if (e.repeat && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space')) return;
        const n = this.items.length;
        switch (e.code) {
          case 'ArrowUp':
          case 'KeyW':
          case 'KeyZ':
            return this.select((this.sel + n - 1) % n);
          case 'ArrowDown':
          case 'KeyS':
            return this.select((this.sel + 1) % n);
          case 'Enter':
          case 'NumpadEnter':
          case 'Space':
          case 'KeyE':
            return this.items[this.sel]?.run();
        }
      },
      { capture: true },
    );
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /** `started` : une partie existe déjà (« Jouer » ramène au Repaire, sinon le questionnaire). */
  show(hooks: TitleHooks, started: boolean): void {
    this.hooks = hooks;
    this.sel = 0;
    this.sub = false;
    this.items = [
      { label: 'Jouer', hint: started ? 'Retour au Repaire' : 'Nouvelle partie', run: () => this.play() },
      { label: 'Réglages', hint: 'Musique, bruitages, secousses', run: () => this.open_('Réglages') },
      { label: 'Commandes', hint: 'Clavier et manette tactile', run: () => this.open_('Commandes') },
    ];
    this.render();
    this.root.hidden = false;
    this.root.classList.remove('play');
    requestAnimationFrame(() => this.root.classList.add('play'));
  }

  close(): void {
    this.root.hidden = true;
    this.root.replaceChildren();
    this.buttons = [];
  }

  private play(): void {
    // Le premier son du jeu : ce geste débloque le Web Audio (audio.ts écoute keydown et pointerdown).
    sfx('confirm');
    const h = this.hooks;
    this.hooks = null;
    this.close();
    h?.play();
  }

  private open_(tab: TitleTab): void {
    if (!this.hooks) return;
    this.sub = true;
    this.root.classList.add('under');
    this.hooks.settings(tab, () => {
      this.sub = false;
      this.root.classList.remove('under');
    });
  }

  private select(i: number): void {
    if (i === this.sel) return;
    this.sel = i;
    sfx('click', -8);
    this.buttons.forEach((b, j) => b.classList.toggle('sel', j === i));
  }

  private render(): void {
    this.root.replaceChildren();
    // Les braises du feu de camp : des points qui montent en vacillant (CSS seul, chacune
    // sa colonne, sa vitesse et son retard ; tirées une fois, pas besoin d'aléa à chaque image).
    const embers = el('div', 'title-embers', this.root);
    for (let i = 0; i < 26; i++) {
      const s = el('i', '', embers);
      const r = (k: number) => ((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
      s.style.cssText = `left:${(r(1) * 100).toFixed(1)}%;--d:${(6 + r(2) * 7).toFixed(2)}s;--w:${(-r(3) * 12).toFixed(2)}s;--x:${((r(4) - 0.5) * 12).toFixed(1)}vw;--s:${(0.25 + r(5) * 0.45).toFixed(2)}`;
    }

    const wrap = el('div', 'title-wrap', this.root);
    wrap.append(logo());

    const menu = el('div', 'title-menu', wrap);
    this.buttons = this.items.map((it, i) => {
      const b = el('button', `title-item${i === this.sel ? ' sel' : ''}`, menu);
      el('b', '', b, it.label.toUpperCase());
      if (it.hint) el('small', '', b, it.hint);
      b.addEventListener('pointerenter', () => this.select(i));
      b.addEventListener('click', () => {
        this.select(i);
        it.run();
      });
      return b;
    });

    el('p', 'title-keys', wrap, '↑↓ choisir · Entrée valider');
    el('p', 'title-credits', this.root, 'Prototype web · jeu de fan non officiel · Pokémon © Nintendo, Game Freak, The Pokémon Company');
    // La version, pour savoir quelle mise en ligne on teste (cf. vite.config.ts).
    el('p', 'title-version', this.root, `v${__APP_VERSION__}`);
  }
}
