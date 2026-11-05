import { sfx } from '../audio/audio';
import type { Options } from './options';

// Menu des réglages, ouvert par Échap au Repaire comme en run (le jeu se
// fige). Le panneau de test (H) reste l'outil de DA ; ce menu-ci est celui du
// joueur : le son et les secousses, puis la liste des commandes. Repris de
// SettingsScreen.gd (onglets Général, Effets, Commandes), redessiné dans la
// DA « Tag sacré » : une feuille de papier scotchée, comme l'affiche du
// prochain combat.
//
// Tout se joue au clavier sans souris : ↑↓ choisit une ligne (la première,
// les onglets), ←→ la règle, Entrée bascule, Échap ferme. La souris marche
// aussi : clic sur un onglet, une case, une flèche ou la jauge.
//
// Il ne touche pas au jeu : comme le panneau, il modifie les options et
// signale lesquelles ont changé (main.ts applique, et resynchronise le panneau).

type Key = keyof Options;

interface Row {
  label: string;
  hint?: string;
  /** Dessine le contrôle dans `box`. */
  render: (box: HTMLElement) => void;
  /** ←→ : -1 ou +1. */
  adjust: (dir: number) => void;
  /** Entrée (sinon comme →). */
  activate?: () => void;
}

// Écart voulu (retour de test : « Zoom… plein d'onglets que tu peux supprimer ») : un seul
// onglet de réglages, le son et les secousses ; le zoom, les particules, les halos et la
// vignette ne se règlent plus que dans le panneau de test (H).
const TABS = ['Réglages', 'Commandes'] as const;
type Tab = (typeof TABS)[number];

/** Liste des commandes : [touches, action]. Les touches séparées par « / » sont des alternatives. */
const CONTROLS: [string[], string][] = [
  [['←↑→↓'], 'Se déplacer'],
  [['Maj', 'Espace'], 'Dash (esquive : on traverse les coups)'],
  [['1', '2', '3', '4'], 'Capacités'],
  [['Q', 'Z', 'S', 'D'], 'Capacités (autre disposition)'],
  [['R'], 'Ultime, jauge pleine'],
  [['E'], 'Parler, ramasser, ouvrir, choisir une porte'],
  [['Tab'], 'Changer de Pokémon'],
  [['C'], 'Fiche de l’équipe'],
  [['M'], 'Couper le son'],
  [['Échap'], 'Ce menu'],
  [['H'], 'Panneau de test (DA)'],
  [['N'], 'Nouvelle run (test)'],
];

const el = (tag: string, cls: string, parent?: HTMLElement, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
};

export class SettingsMenu {
  private readonly root: HTMLElement;
  private tab: Tab = 'Réglages';
  /** Ligne choisie : 0 = les onglets, puis les lignes de l'onglet. */
  private sel = 0;
  private rows: Row[] = [];
  private onClose: (() => void) | null = null;

  constructor(
    parent: HTMLElement,
    private readonly opts: Options,
    private readonly onChange: (changed: Key) => void,
  ) {
    this.root = el('div', 'reward optmenu', parent);
    this.root.hidden = true;
    addEventListener(
      'keydown',
      (e) => {
        if (this.root.hidden) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        if (e.repeat && (e.code === 'Escape' || e.code === 'Enter')) return;
        switch (e.code) {
          case 'Escape':
            return this.close();
          case 'ArrowUp':
          case 'KeyW':
            return this.move(-1);
          case 'ArrowDown':
            return this.move(1);
          case 'ArrowLeft':
          case 'KeyA':
          case 'KeyQ':
            return this.adjust(-1);
          case 'ArrowRight':
          case 'KeyD':
            return this.adjust(1);
          case 'Enter':
          case 'NumpadEnter':
          case 'Space':
          case 'KeyE':
            return this.activate();
          case 'KeyM':
            // M coupe le son même menu ouvert : c'est ici qu'on le cherche.
            this.set('muted', !this.opts.muted);
            return this.render();
        }
      },
      { capture: true },
    );
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /** `tab` : l'onglet à ouvrir (le menu principal ouvre directement « Commandes »). */
  show(onClose: () => void, tab?: Tab): void {
    sfx('menuOpen');
    this.onClose = onClose;
    if (tab) this.tab = tab;
    this.sel = 0;
    this.root.hidden = false;
    this.root.classList.remove('play');
    this.render();
    requestAnimationFrame(() => this.root.classList.add('play'));
  }

  close(): void {
    if (this.root.hidden) return;
    sfx('menuClose');
    this.root.hidden = true;
    this.root.replaceChildren();
    const done = this.onClose;
    this.onClose = null;
    done?.();
  }

  private set<K extends Key>(key: K, value: Options[K]): void {
    this.opts[key] = value;
    this.onChange(key);
  }

  private move(dir: number): void {
    const n = this.rows.length + 1;
    this.sel = (this.sel + dir + n) % n;
    sfx('click', -8);
    this.render();
  }

  private adjust(dir: number): void {
    if (this.sel === 0) {
      const i = TABS.indexOf(this.tab);
      this.tab = TABS[(i + dir + TABS.length) % TABS.length];
      sfx('click', -6);
    } else this.rows[this.sel - 1]?.adjust(dir);
    this.render();
  }

  private activate(): void {
    if (this.sel === 0) return this.adjust(1);
    const r = this.rows[this.sel - 1];
    if (!r) return;
    (r.activate ?? (() => r.adjust(1)))();
    this.render();
  }

  // ── Lignes ─────────────────────────────────────────────────────────────

  /** Jauge de 10 crans (0..1 au pas de 0,1), cliquable. */
  private volume(key: 'music' | 'sfx', label: string): Row {
    const step = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 10) / 10;
    return {
      label,
      render: (box) => {
        const gauge = el('div', 'opt-gauge', box);
        const v = Math.round(this.opts[key] * 10);
        for (let i = 1; i <= 10; i++) {
          const notch = el('i', i <= v ? 'on' : '', gauge);
          notch.style.setProperty('--n', String(i));
          notch.addEventListener('click', () => {
            // Recliquer le cran du bout éteint la jauge : sinon on ne descendrait jamais à 0 à la souris.
            this.set(key, step(i === v ? (i - 1) / 10 : i / 10));
            this.render();
          });
        }
        el('span', 'opt-value', box, `${v * 10} %`);
      },
      adjust: (dir) => {
        this.set(key, step(this.opts[key] + dir * 0.1));
        // On entend tout de suite le niveau des bruitages qu'on règle.
        if (key === 'sfx') sfx('hit');
      },
    };
  }

  private toggle(key: Key, label: string, hint?: string): Row {
    const flip = () => {
      this.set(key, !this.opts[key] as never);
      sfx('confirm');
    };
    return {
      label,
      hint,
      render: (box) => {
        const on = Boolean(this.opts[key]);
        const b = el('button', `opt-switch${on ? ' on' : ''}`, box, on ? 'OUI' : 'NON');
        b.addEventListener('click', () => {
          flip();
          this.render();
        });
      },
      adjust: flip,
      activate: flip,
    };
  }

  private rowsOf(tab: Tab): Row[] {
    switch (tab) {
      case 'Réglages':
        // La taille des Pokémon, les ombres, les arbres translucides, les couleurs par biome,
        // le zoom et les effets de lumière sont la direction artistique, pas une préférence.
        // Reste ce qui peut gêner : le son et les secousses.
        return [
          this.volume('music', 'Musique'),
          this.volume('sfx', 'Bruitages'),
          this.toggle('muted', 'Couper le son', 'Touche M, partout.'),
          this.toggle('shake', 'Secousses de l’écran', 'Coups, explosions, champions.'),
        ];
      case 'Commandes':
        return [];
    }
  }

  // ── Rendu ──────────────────────────────────────────────────────────────

  private render(): void {
    this.rows = this.rowsOf(this.tab);
    this.sel = Math.min(this.sel, this.rows.length);
    this.root.replaceChildren();
    el('div', 'poster-dim', this.root).addEventListener('click', () => this.close());
    const wrap = el('div', 'poster-wrap', this.root);
    const sheet = el('div', 'poster opt-sheet', wrap);
    const head = el('div', 'opt-head', sheet);
    el('span', 'banner da-tape', head, 'PAUSE');
    el('h3', '', head, 'RÉGLAGES');

    const tabs = el('div', `opt-tabs${this.sel === 0 ? ' focus' : ''}`, sheet);
    for (const t of TABS) {
      const b = el('button', t === this.tab ? 'sel' : '', tabs, t.toUpperCase());
      b.addEventListener('click', () => {
        this.tab = t;
        this.sel = 0;
        sfx('click', -6);
        this.render();
      });
    }

    const body = el('div', 'opt-body', sheet);
    if (this.tab === 'Commandes') this.renderControls(body);
    this.rows.forEach((r, i) => {
      const line = el('div', `opt-row${this.sel === i + 1 ? ' sel' : ''}`, body);
      line.addEventListener('pointerenter', () => {
        if (this.sel === i + 1) return;
        this.sel = i + 1;
        for (const o of body.querySelectorAll('.opt-row')) o.classList.toggle('sel', o === line);
        tabs.classList.remove('focus');
      });
      const label = el('div', 'opt-label', line);
      el('b', '', label, r.label);
      if (r.hint) el('small', '', label, r.hint);
      r.render(el('div', 'opt-ctrl', line));
    });

    el('p', 'keys', sheet, this.tab === 'Commandes' ? '←→ onglet · Échap : reprendre' : '↑↓ choisir · ←→ régler · Échap : reprendre');
    for (const [side, rot] of [
      ['left: 6%', -12],
      ['right: 6%', 9],
    ] as const) {
      const t = el('i', 'da-tapestrip', wrap);
      t.style.cssText = `${side}; rotate: ${rot}deg`;
    }
    if (this.root.classList.contains('play')) wrap.style.animation = 'none';
  }

  private renderControls(body: HTMLElement): void {
    const list = el('div', 'opt-keys', body);
    for (const [keys, action] of CONTROLS) {
      const line = el('div', 'opt-keyline', list);
      const caps = el('div', 'opt-caps', line);
      keys.forEach((k, i) => {
        if (i) el('span', 'or', caps, '/');
        el('kbd', '', caps, k);
      });
      el('span', '', line, action);
    }
  }
}
