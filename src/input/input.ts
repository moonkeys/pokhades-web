// Entrées clavier + manette, lues une fois par pas de simulation.
//
// Le clavier passe par KeyboardEvent.code (position physique) : KeyA, KeyW,
// KeyS, KeyD sont les touches Q, Z, S, D d'un clavier AZERTY, sans table par
// disposition. Comme Controls.gd, les flèches déplacent et ces quatre touches
// (ou 1 à 4) lancent les capacités.
// Dash et capacités sont des fronts montants mémorisés jusqu'au prochain pas :
// si deux pas tombent dans la même frame, ils ne se déclenchent qu'une fois
// (cf. le double saut parasite documenté dans PlatformMotion.gd:88-101).

import { actionOf, keysOf, type Action } from './bindings';

// Les touches de chaque action vivent dans bindings.ts : le joueur peut les
// réassigner (Échap → Commandes) ; par défaut, celles de Controls.CATALOG.
const MOVES: readonly Action[] = ['move1', 'move2', 'move3', 'move4'];

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
      const act = actionOf(e.code);
      if (act && !e.metaKey && !e.ctrlKey) e.preventDefault();
      if (!this.held.has(e.code)) {
        if (act === 'dash') this.dashQueued = true;
        const slot = act ? MOVES.indexOf(act) : -1;
        if (slot >= 0 && this.moveQueued < 0) this.moveQueued = slot;
        if (act === 'interact') this.interactQueued = true;
        if (act === 'ult') this.ultQueued = true;
        if (act === 'swap') this.swapQueued = true;
      }
      this.held.add(e.code);
    });
    addEventListener('keyup', (e) => this.held.delete(e.code));
    // Fenêtre qui perd le focus : on relâche tout, sinon le joueur continue de marcher seul.
    addEventListener('blur', () => this.held.clear());
  }

  private any(a: Action): boolean {
    return keysOf(a).some((c) => this.held.has(c));
  }

  sample(): InputSample {
    let mx = (this.any('right') ? 1 : 0) - (this.any('left') ? 1 : 0);
    let my = (this.any('down') ? 1 : 0) - (this.any('up') ? 1 : 0);
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
