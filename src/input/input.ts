// Entrées clavier + manette, lues une fois par pas de simulation.
//
// Le clavier passe par KeyboardEvent.code (position physique) : KeyA, KeyW,
// KeyS, KeyD sont les touches Q, Z, S, D d'un clavier AZERTY, sans table par
// disposition. Comme Controls.gd, les flèches déplacent et ces quatre touches
// (ou 1 à 4) lancent les capacités.
// Dash et capacités sont des fronts montants mémorisés jusqu'au prochain pas :
// si deux pas tombent dans la même frame, ils ne se déclenchent qu'une fois
// (cf. le double saut parasite documenté dans PlatformMotion.gd:88-101).

const UP = ['ArrowUp'];
const DOWN = ['ArrowDown'];
const LEFT = ['ArrowLeft'];
const RIGHT = ['ArrowRight'];
const DASH = ['ShiftLeft', 'ShiftRight', 'Space'];
/** Controls.CATALOG : use_move_1..4 = 1/Q, 2/Z, 3/S, 4/D. */
const MOVES = [
  ['Digit1', 'KeyA'],
  ['Digit2', 'KeyW'],
  ['Digit3', 'KeyS'],
  ['Digit4', 'KeyD'],
];
/** Interagir (ramasser une récompense) : E, comme le jeu. */
const INTERACT = ['KeyE'];
/** Ultime : R, ou W d'un clavier AZERTY (position KeyZ), comme Controls.CATALOG. */
const ULT = ['KeyR', 'KeyZ'];
/** Changer de Pokémon : Tab, comme Controls.CATALOG (switch_pokemon). */
const SWAP = ['Tab'];
const GAME_KEYS = new Set([...UP, ...DOWN, ...LEFT, ...RIGHT, ...DASH, ...MOVES.flat(), ...INTERACT, ...ULT, ...SWAP]);

/** Zone morte du stick, reprise de PlayerInput.STICK_DEADZONE. */
const STICK_DEADZONE = 0.22;
/** Bouton « B / Cercle » en mapping standard de la Gamepad API (dash dans le jeu). */
const PAD_DASH = 1;
/** Capacités à la manette : X, Y, LB, RB (Controls.CATALOG). */
const PAD_MOVES = [2, 3, 4, 5];
/** Interagir à la manette : A / Croix. */
const PAD_INTERACT = 0;
/** Ultime à la manette : gâchette droite. */
const PAD_ULT = 7;
/** Changer de Pokémon à la manette : clic du stick droit. */
const PAD_SWAP = 11;

export interface InputSample {
  mx: number;
  my: number;
  dash: boolean;
  /** Emplacement de capacité pressé ce pas (0 à 3), ou -1. Un seul par pas, comme le jeu. */
  move: number;
  interact: boolean;
  ult: boolean;
  /** Passer au Pokémon suivant de l'équipe. */
  swap: boolean;
}

function isFormField(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
}

export class Input {
  private readonly held = new Set<string>();
  private dashQueued = false;
  private padDashWasDown = false;
  private moveQueued = -1;
  private interactQueued = false;
  private padInteractWasDown = false;
  private ultQueued = false;
  private padUltWasDown = false;
  private swapQueued = false;
  private padSwapWasDown = false;
  private padMovesWereDown = [false, false, false, false];
  /** Stick virtuel des commandes tactiles (src/input/touch.ts), déjà normé. */
  private stickX = 0;
  private stickY = 0;

  constructor() {
    addEventListener('keydown', (e) => {
      if (isFormField(e.target)) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!this.held.has(e.code) && DASH.includes(e.code)) this.dashQueued = true;
      const slot = MOVES.findIndex((keys) => keys.includes(e.code));
      if (!this.held.has(e.code) && slot >= 0 && this.moveQueued < 0) this.moveQueued = slot;
      if (!this.held.has(e.code) && INTERACT.includes(e.code)) this.interactQueued = true;
      if (!this.held.has(e.code) && ULT.includes(e.code)) this.ultQueued = true;
      if (!this.held.has(e.code) && SWAP.includes(e.code)) this.swapQueued = true;
      this.held.add(e.code);
    });
    addEventListener('keyup', (e) => this.held.delete(e.code));
    // Fenêtre qui perd le focus : on relâche tout, sinon le joueur continue de marcher seul.
    addEventListener('blur', () => this.held.clear());
  }

  private any(codes: readonly string[]): boolean {
    return codes.some((c) => this.held.has(c));
  }

  sample(): InputSample {
    let mx = (this.any(RIGHT) ? 1 : 0) - (this.any(LEFT) ? 1 : 0);
    let my = (this.any(DOWN) ? 1 : 0) - (this.any(UP) ? 1 : 0);
    let dash = this.dashQueued;
    this.dashQueued = false;
    let move = this.moveQueued;
    this.moveQueued = -1;
    let interact = this.interactQueued;
    this.interactQueued = false;
    let ult = this.ultQueued;
    this.ultQueued = false;
    let swap = this.swapQueued;
    this.swapQueued = false;

    if (this.stickX || this.stickY) {
      mx = this.stickX;
      my = this.stickY;
    }

    const pad = navigator.getGamepads?.().find((p) => p && p.connected);
    if (pad) {
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      if (Math.hypot(ax, ay) > STICK_DEADZONE) {
        mx = ax;
        my = ay;
      } else {
        const b = (i: number) => pad.buttons[i]?.pressed ?? false;
        mx += (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
        my += (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
      }
      const dashDown = pad.buttons[PAD_DASH]?.pressed ?? false;
      if (dashDown && !this.padDashWasDown) dash = true;
      this.padDashWasDown = dashDown;
      const interactDown = pad.buttons[PAD_INTERACT]?.pressed ?? false;
      if (interactDown && !this.padInteractWasDown) interact = true;
      this.padInteractWasDown = interactDown;
      const ultDown = pad.buttons[PAD_ULT]?.pressed ?? false;
      if (ultDown && !this.padUltWasDown) ult = true;
      this.padUltWasDown = ultDown;
      const swapDown = pad.buttons[PAD_SWAP]?.pressed ?? false;
      if (swapDown && !this.padSwapWasDown) swap = true;
      this.padSwapWasDown = swapDown;
      PAD_MOVES.forEach((button, slot) => {
        const down = pad.buttons[button]?.pressed ?? false;
        if (down && !this.padMovesWereDown[slot] && move < 0) move = slot;
        this.padMovesWereDown[slot] = down;
      });
    }

    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    return { mx, my, dash, move, interact, ult, swap };
  }

  /** Position du stick tactile, de -1 à 1 sur chaque axe. */
  setStick(x: number, y: number): void {
    this.stickX = x;
    this.stickY = y;
  }

  /** Oublie les appuis en attente (un écran de choix vient de se fermer : Entrée ne doit pas dasher). */
  flush(): void {
    this.dashQueued = this.interactQueued = this.ultQueued = this.swapQueued = false;
    this.moveQueued = -1;
    this.held.clear();
  }
}
