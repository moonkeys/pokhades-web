import { PLAYER_SPECIES } from '../data/species';
import { BIOMES, BIOME_ORDER } from '../world/biomes';
import type { Options } from './options';

// Panneau de réglages de la DA, en HTML par-dessus le canvas. Il ne touche
// jamais au jeu directement : il modifie les options et signale lesquelles
// ont changé ; main.ts décide quoi reconstruire. Seule exception, pour tester
// vite : « Aller à une salle » demande à main.ts de sauter à un combat, à la
// boutique ou au boss d'un acte.

type Key = keyof Options;
type OnChange = (changed: Key) => void;
/** Où aller, ou quoi faire au Repaire : 'baies' (+1000 Baies) et 'reset' (progression neuve) servent aux tests. */
export type RoomKind = 'combat' | 'shop' | 'boss' | 'camp' | 'baies' | 'reset';
type OnGo = (act: number, kind: RoomKind) => void;
/** Plafond d'une équipe en run (CombatArena.MAX_RUN_TEAM). */
const MAX_TEAM = 6;

const TOGGLES: [Key, string][] = [
  ['grading', 'Étalonnage par biome'],
  ['glow', 'Halos lumineux'],
  ['particles', 'Particules d’ambiance'],
  ['vignette', 'Vignette'],
  ['shadows', 'Ombres des Pokémon'],
  ['treeFade', 'Arbres translucides devant le joueur'],
  ['heightScale', 'Pokémon plus grand en hauteur'],
  ['wild', 'Pokémon sauvages'],
  ['debug', 'Afficher les collisions'],
];

function el<E extends HTMLElement = HTMLElement>(tag: string, props: Record<string, unknown> = {}, children: (Node | string)[] = []): E {
  const node = Object.assign(document.createElement(tag), props) as E;
  node.append(...children);
  return node;
}

function select<T extends string | number>(value: T, choices: [T, string][], onPick: (v: T) => void): HTMLSelectElement {
  const s = el<HTMLSelectElement>('select');
  for (const [v, label] of choices) s.append(el('option', { value: String(v), textContent: label, selected: v === value }));
  s.addEventListener('change', () => {
    const picked = choices.find(([v]) => String(v) === s.value);
    if (picked) onPick(picked[0]);
    // Rend les flèches au jeu : sinon elles feraient défiler la liste.
    s.blur();
  });
  return s;
}

export class Panel {
  private readonly root: HTMLElement;
  private readonly seedInput: HTMLInputElement;
  private readonly biomeSelect: HTMLSelectElement;
  private readonly status: HTMLElement;
  /** Redessine la liste de l'équipe (elle a changé au Repaire). */
  refreshTeam: () => void = () => {};

  constructor(
    private readonly opts: Options,
    private readonly onChange: OnChange,
    onGo: OnGo,
  ) {
    this.root = document.getElementById('panel')!;
    const set = <K extends Key>(key: K, value: Options[K]) => {
      this.opts[key] = value;
      this.onChange(key);
    };

    const biomeChoices: [Options['biome'], string][] = [['run', 'Séquence du jeu'], ...BIOME_ORDER.map((id): [Options['biome'], string] => [id, `Toute la run : ${BIOMES[id].name}`])];
    this.biomeSelect = select(opts.biome, biomeChoices, (v) => set('biome', v));
    this.seedInput = el<HTMLInputElement>('input', { type: 'number', value: String(opts.seed), min: '1' });
    this.seedInput.addEventListener('change', () => {
      set('seed', Math.max(1, Number(this.seedInput.value) || 1));
      this.seedInput.blur();
    });
    const reroll = el('button', { type: 'button', textContent: 'Nouvelle carte (R)' });
    reroll.addEventListener('click', () => this.nextSeed());

    const danger = el<HTMLInputElement>('input', { type: 'range', min: '0', max: '100', value: String(Math.round(opts.danger * 100)) });
    danger.addEventListener('input', () => set('danger', Number(danger.value) / 100));
    danger.addEventListener('change', () => danger.blur());

    const toggles = TOGGLES.map(([key, label]) => {
      const box = el<HTMLInputElement>('input', { type: 'checkbox', checked: Boolean(opts[key]) });
      box.addEventListener('change', () => {
        set(key, box.checked as never);
        box.blur();
      });
      return el('label', { className: 'toggle' }, [box, label]);
    });

    // Équipe du Repaire (sans compter les places achetées) : chaque membre se remplace ou se
    // retire ; on en ajoute jusqu'à 6. Le premier est joué au départ.
    const species: [number, string][] = PLAYER_SPECIES.map((s) => [s.id, s.name]);
    const teamBox = el('div', { className: 'team' });
    const renderTeam = () => {
      const rows = opts.team.map((id, i) => {
        const pick = select(id, species, (v) => {
          const t = [...opts.team];
          t[i] = v;
          set('team', t);
        });
        const remove = el<HTMLButtonElement>('button', { type: 'button', textContent: '✕', title: 'Retirer de l’équipe', disabled: opts.team.length < 2 });
        remove.addEventListener('click', () => {
          set('team', opts.team.filter((_, j) => j !== i));
          renderTeam();
        });
        return el('div', { className: 'row' }, [pick, remove]);
      });
      const add =
        opts.team.length < MAX_TEAM
          ? [
              select<number | ''>('', [['', '+ Ajouter un Pokémon…'], ...species], (v) => {
                if (v === '') return;
                set('team', [...opts.team, v]);
                renderTeam();
              }),
            ]
          : [];
      teamBox.replaceChildren(...rows, ...add);
    };
    renderTeam();
    this.refreshTeam = renderTeam;

    // Aller à une salle : l'acte, puis combat, boutique ou boss (dans le biome forcé ci-dessus, s'il l'est).
    let act = 0;
    const actSelect = select(0, [0, 1, 2, 3].map((a): [number, string] => [a, `Acte ${a + 1}`]), (v) => (act = v));
    const go = (kind: RoomKind, label: string) => {
      const b = el('button', { type: 'button', textContent: label });
      b.addEventListener('click', () => {
        onGo(act, kind);
        b.blur();
      });
      return b;
    };

    this.status = el('p', { className: 'status' });

    const field = (label: string, control: Node, hint?: string) =>
      el('div', { className: 'field' }, [el('span', { className: 'label', textContent: label }), control, ...(hint ? [el('small', { textContent: hint })] : [])]);

    this.root.append(
      el('header', {}, [el('h1', { textContent: 'Prototype 2D' }), el('span', { className: 'tag', textContent: 'DA' })]),
      el('section', {}, [
        field('Biome de la run', this.biomeSelect),
        field('Graine', el('div', { className: 'row' }, [this.seedInput, reroll])),
        field('Équipe', teamBox, 'Tab : changer de Pokémon en jeu. Le premier part devant.'),
        field('Aller à une salle', el('div', { className: 'row' }, [actSelect, go('combat', 'Combat'), go('shop', 'Boutique'), go('boss', 'Boss')]), 'Dans le biome de la run choisi au-dessus.'),
        field('Repaire (tests)', el('div', { className: 'row' }, [go('camp', 'Retour au camp'), go('baies', '+1000 Baies'), go('reset', 'Tout remettre à zéro')]), 'La progression est gardée dans le navigateur.'),
      ]),
      el('section', {}, [
        field(
          'Taille des Pokémon',
          select(opts.size, [
            ['pmd', 'Native PMD (pixel net)'],
            ['big2', 'Native, ×2 au-delà de 1,5 m'],
            ['game', 'Comme le jeu 3D (pixels inégaux)'],
          ], (v) => set('size', v)),
        ),
        field(
          'Densité des pixels',
          select(opts.density, [
            ['native', 'Identique décor / Pokémon'],
            ['mixel', 'Pokémon en demi-pixel'],
          ], (v) => set('density', v)),
          'Demi-pixel : les Pokémon sont deux fois plus fins que le décor.',
        ),
        field(
          'Résolution interne',
          select(opts.viewHeight, [
            [216, '216 px de haut (13,5 cases)'],
            [270, '270 px de haut (≈ 17 cases)'],
            [360, '360 px de haut (22,5 cases)'],
          ], (v) => set('viewHeight', v)),
        ),
      ]),
      el('section', {}, [
        field('Progression clair → sombre', danger, 'DA_bible §4 : plus on avance, plus la scène s’assombrit.'),
        ...toggles,
      ]),
      el('footer', {}, [
        el('p', {
          className: 'keys',
          innerHTML:
            '<kbd>←↑→↓</kbd> se déplacer · <kbd>Maj</kbd> ou <kbd>Espace</kbd> dash<br>' +
            '<kbd>1</kbd>–<kbd>4</kbd> ou <kbd>Q</kbd> <kbd>Z</kbd> <kbd>S</kbd> <kbd>D</kbd> capacités · <kbd>R</kbd> ultime · <kbd>E</kbd> ramasser · <kbd>Tab</kbd> changer de Pokémon<br>' +
            '<kbd>Pg↑</kbd> <kbd>Pg↓</kbd> biome · <kbd>N</kbd> nouvelle run · <kbd>H</kbd> masquer ce panneau',
        }),
        this.status,
      ]),
    );

    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === 'KeyH') this.root.classList.toggle('hidden');
      // R lance l'ultime, comme le jeu : la nouvelle run passe sur N.
      else if (e.code === 'KeyN') this.nextSeed();
      else if (e.code === 'PageUp' || e.code === 'PageDown') {
        // Les chiffres lancent désormais les capacités : on parcourt les biomes page par page.
        e.preventDefault();
        const order = ['run', ...BIOME_ORDER] as const;
        const n = order.length;
        const at = order.indexOf(this.opts.biome);
        const id = order[(at + (e.code === 'PageDown' ? 1 : n - 1)) % n];
        this.biomeSelect.value = id;
        set('biome', id);
      }
    });
  }

  private nextSeed(): void {
    this.opts.seed += 1;
    this.seedInput.value = String(this.opts.seed);
    this.onChange('seed');
  }

  setStatus(text: string): void {
    if (this.status.textContent !== text) this.status.textContent = text;
  }
}
