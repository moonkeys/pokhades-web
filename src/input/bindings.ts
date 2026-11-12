// Touches réassignables (A-FAIRE 1.11 : « reste à pouvoir réassigner les
// touches »). Chaque action garde ses touches par défaut (input.ts les
// lisait en constantes) ; le joueur peut en changer la touche principale
// dans Échap → Commandes. Les autres touches de l'action restent, sauf si
// elles servent désormais ailleurs.
//
// Les codes sont ceux de KeyboardEvent.code (position physique, voir
// input.ts) ; ce qu'on affiche est le caractère gravé sur la touche, lu dans
// la disposition du clavier quand le navigateur la donne, appris des appuis
// sinon, et à défaut celui d'un clavier AZERTY.
//
// Mémorisé dans le navigateur, à part des options et de la sauvegarde : ce
// sont les mains du joueur, pas la partie.

export type Action = 'up' | 'down' | 'left' | 'right' | 'dash' | 'move1' | 'move2' | 'move3' | 'move4' | 'ult' | 'mega' | 'interact' | 'swap' | 'stats';

export interface ActionInfo {
  id: Action;
  label: string;
  defaults: readonly string[];
}

export const ACTIONS: readonly ActionInfo[] = [
  { id: 'up', label: 'Haut', defaults: ['ArrowUp'] },
  { id: 'down', label: 'Bas', defaults: ['ArrowDown'] },
  { id: 'left', label: 'Gauche', defaults: ['ArrowLeft'] },
  { id: 'right', label: 'Droite', defaults: ['ArrowRight'] },
  { id: 'dash', label: 'Dash (esquive)', defaults: ['ShiftLeft', 'ShiftRight', 'Space'] },
  // Controls.CATALOG : use_move_1..4 = 1/Q, 2/Z, 3/S, 4/D (KeyA… : positions QWERTY).
  { id: 'move1', label: 'Capacité 1', defaults: ['Digit1', 'KeyA'] },
  { id: 'move2', label: 'Capacité 2', defaults: ['Digit2', 'KeyW'] },
  { id: 'move3', label: 'Capacité 3', defaults: ['Digit3', 'KeyS'] },
  { id: 'move4', label: 'Capacité 4', defaults: ['Digit4', 'KeyD'] },
  // R, ou W d'un clavier AZERTY (position KeyZ), comme Controls.CATALOG.
  { id: 'ult', label: 'Ultime', defaults: ['KeyR', 'KeyZ'] },
  { id: 'mega', label: 'Méga-évolution', defaults: ['KeyF'] },
  { id: 'interact', label: 'Interagir (parler, ouvrir…)', defaults: ['KeyE'] },
  { id: 'swap', label: 'Changer de Pokémon', defaults: ['Tab'] },
  { id: 'stats', label: 'Fiche de l’équipe', defaults: ['KeyC'] },
];

/** Touches qu'on ne peut pas prendre : le menu, le son, et les outils de test. */
export const RESERVED = new Set(['Escape', 'KeyM', 'Enter', 'NumpadEnter', 'MetaLeft', 'MetaRight', 'ContextMenu', ...(import.meta.env.PROD ? [] : ['KeyH', 'KeyN'])]);

const STORE = 'pokhades-keys';

/** Touche principale choisie par le joueur, par action. */
let custom: Partial<Record<Action, string>> = {};
try {
  const raw = localStorage.getItem(STORE);
  if (raw) {
    const saved = JSON.parse(raw) as Record<string, unknown>;
    for (const a of ACTIONS) if (typeof saved[a.id] === 'string' && !RESERVED.has(saved[a.id] as string)) custom[a.id] = saved[a.id] as string;
  }
} catch {
  custom = {};
}

let table = new Map<Action, string[]>();
let reverse = new Map<string, Action>();
const listeners: (() => void)[] = [];

/** Recalcule les touches de chaque action : la principale choisie d'abord, puis les défauts qui ne servent pas ailleurs. */
function rebuild(): void {
  table = new Map();
  reverse = new Map();
  // Les touches choisies d'abord : une touche par défaut prise ailleurs perd sa place.
  for (const a of ACTIONS) if (custom[a.id]) reverse.set(custom[a.id]!, a.id);
  for (const a of ACTIONS) {
    const main = custom[a.id];
    const keys = [...(main ? [main] : []), ...a.defaults.filter((k) => k !== main && !reverse.has(k))];
    table.set(a.id, keys);
    for (const k of keys) reverse.set(k, a.id);
  }
  for (const f of listeners) f();
}
rebuild();

function persist(): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(custom));
  } catch {
    // Sans conséquence : seule la mémorisation est perdue.
  }
}

/** Les touches d'une action, la principale d'abord. */
export const keysOf = (a: Action): readonly string[] => table.get(a) ?? [];

/** L'action d'une touche, ou undefined. */
export const actionOf = (code: string): Action | undefined => reverse.get(code);

/** Une touche sert-elle au jeu (input.ts empêche alors le défilement de la page) ? */
export const isGameKey = (code: string): boolean => reverse.has(code);

/**
 * Donne `code` pour touche principale de `a`. Si elle était la principale
 * d'une autre action, celle-ci reprend l'ancienne de `a` (échange).
 */
export function rebind(a: Action, code: string): void {
  if (RESERVED.has(code)) return;
  const before = keysOf(a)[0];
  const other = ACTIONS.find((o) => o.id !== a && keysOf(o.id)[0] === code);
  custom[a] = code;
  if (other) {
    if (before && before !== code) custom[other.id] = before;
    else delete custom[other.id];
  }
  // Une action revenue à sa touche d'origine n'a plus besoin d'être retenue.
  for (const o of ACTIONS) if (custom[o.id] === o.defaults[0]) delete custom[o.id];
  persist();
  rebuild();
}

export function resetBindings(): void {
  custom = {};
  persist();
  rebuild();
}

/** Le joueur a-t-il changé quelque chose ? */
export const customized = (): boolean => Object.keys(custom).length > 0;

/** Prévenu à chaque changement (les invites « [E] », la liste des commandes). */
export const onBindings = (f: () => void): void => {
  listeners.push(f);
};

// ── Ce qui est gravé sur la touche ───────────────────────────────────────

const NAMES: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ShiftLeft: 'Maj',
  ShiftRight: 'Maj D',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl D',
  AltLeft: 'Alt',
  AltRight: 'Alt Gr',
  Space: 'Espace',
  Tab: 'Tab',
  Backspace: 'Retour',
  CapsLock: 'Verr. Maj',
  Delete: 'Suppr',
  Insert: 'Inser',
  Home: 'Début',
  End: 'Fin',
  PageUp: 'Pg ↑',
  PageDown: 'Pg ↓',
};
/** Faute de mieux, un clavier AZERTY : les touches qui diffèrent du QWERTY. */
const AZERTY: Record<string, string> = { KeyA: 'Q', KeyQ: 'A', KeyW: 'Z', KeyZ: 'W', KeyM: ',', Semicolon: 'M', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9', Digit0: '0' };
const learned = new Map<string, string>();

// La disposition réelle, quand le navigateur la donne (Chrome, Edge).
void (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } }).keyboard
  ?.getLayoutMap?.()
  .then((m) => {
    m.forEach((v, k) => {
      if (/^Key/.test(k) || ['Semicolon', 'Comma', 'Period', 'Slash', 'Quote', 'BracketLeft', 'BracketRight', 'Backquote', 'Minus', 'Equal', 'Backslash', 'IntlBackslash'].includes(k)) learned.set(k, v.toUpperCase());
    });
    for (const f of listeners) f();
  })
  .catch(() => {});

addEventListener(
  'keydown',
  (e) => {
    if (e.key.length === 1 && e.key !== ' ' && !e.code.startsWith('Digit') && !e.ctrlKey && !e.metaKey && !e.altKey) learned.set(e.code, e.key.toUpperCase());
  },
  { capture: true },
);

/** Le nom à afficher pour une touche. */
export function keyLabel(code: string): string {
  if (NAMES[code]) return NAMES[code];
  // Les chiffres du haut gardent leur chiffre (un clavier AZERTY y écrit « & é " ' »).
  if (code.startsWith('Digit')) return code.slice(5);
  if (learned.has(code)) return learned.get(code)!;
  if (AZERTY[code]) return AZERTY[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Pavé ${code.slice(6)}`;
  return code;
}

// ── Les invites « [E] » ──────────────────────────────────────────────────
// Toutes les invites du jeu disent « [E] » en dur. Si le joueur a changé la
// touche d'interaction, on réécrit le texte à l'affichage (comme touch.ts le
// fait pour le bouton Action).

let observer: MutationObserver | null = null;
function relabel(root: Node): void {
  const to = `[${keyLabel(keysOf('interact')[0] ?? 'KeyE')}]`;
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.nodeValue?.includes('[E]')) n.nodeValue = n.nodeValue.replaceAll('[E]', to);
}
function watchPrompts(): void {
  const changed = keysOf('interact')[0] !== 'KeyE';
  if (!changed) {
    observer?.disconnect();
    observer = null;
    return;
  }
  if (!observer) {
    observer = new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'characterData') relabel(m.target);
        else m.addedNodes.forEach((n) => relabel(n));
      }
    });
    if (document.body) observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  }
  if (document.body) relabel(document.body);
}
onBindings(watchPrompts);
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', watchPrompts);
else watchPrompts();
