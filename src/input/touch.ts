// Commandes tactiles : un stick virtuel à gauche, les boutons d'action à droite.
//
// Le stick alimente directement Input (analogique, comme le stick d'une manette).
// Les boutons, eux, rejouent les touches du clavier (Espace, 1 à 4, E, R, Tab,
// Échap, C) : tous les écrans qui écoutent déjà le clavier y répondent sans
// code propre au tactile.
//
// Les attaques, elles, se touchent directement sur leurs cartes du HUD.

import type { Input } from './input';

/** Appareil tactile sans souris (téléphone, tablette), ou ?touch=1 pour tester au bureau. */
export function isTouch(): boolean {
  if (new URLSearchParams(location.search).has('touch')) return true;
  return matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(hover: hover)').matches);
}

/** Course du stick, en pixels CSS : au-delà, il est à fond. */
const STICK_RADIUS = 46;
const STICK_DEADZONE = 0.18;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
};

/** Une touche du clavier, rejouée tant que le doigt reste dessus. */
function key(code: string, type: 'keydown' | 'keyup'): void {
  dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }));
}

/** Garde le doigt à l'élément même s'il en sort (sans effet, et sans erreur, pour un pointeur déjà levé). */
function capture(target: HTMLElement, id: number): void {
  try {
    target.setPointerCapture(id);
  } catch {
    // Pointeur inconnu : rien à capturer.
  }
}

export class TouchControls {
  private readonly root = el('div', 'touch');
  private readonly base = el('div', 'touch-stick');
  private readonly knob = el('i', '', this.base);
  private stickId = -1;
  private ox = 0;
  private oy = 0;
  private readonly act: HTMLElement;
  private readonly ult: HTMLElement;
  private readonly swap: HTMLElement;

  constructor(private readonly input: Input) {
    document.body.classList.add('touch');
    document.getElementById('screen')!.after(this.root);

    // Moitié gauche : le stick apparaît là où le pouce se pose.
    const zone = el('div', 'touch-zone', this.root);
    zone.append(this.base);
    zone.addEventListener('pointerdown', (e) => {
      if (this.stickId >= 0) return;
      e.preventDefault();
      this.stickId = e.pointerId;
      capture(zone, e.pointerId);
      const r = zone.getBoundingClientRect();
      this.ox = e.clientX - r.left;
      this.oy = e.clientY - r.top;
      this.base.style.left = `${this.ox}px`;
      this.base.style.top = `${this.oy}px`;
      this.base.classList.add('on');
      this.moveStick(0, 0);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickId) return;
      const r = zone.getBoundingClientRect();
      this.moveStick(e.clientX - r.left - this.ox, e.clientY - r.top - this.oy);
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = -1;
      this.base.classList.remove('on');
      this.input.setStick(0, 0);
    };
    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);

    // Droite : le dash, l'interaction, l'ultime et le changement de Pokémon autour.
    const pad = el('div', 'touch-pad', this.root);
    this.button(pad, 'dash', 'Space', 'DASH');
    // Action (parler, ramasser, acheter…) : terne au repos, elle s'allume quand il y a quelque chose à faire.
    this.act = this.button(pad, 'act', 'KeyE', 'ACTION');
    this.ult = this.button(pad, 'ult', 'KeyR', 'ULTI');
    this.swap = this.button(pad, 'swap', 'Tab', '⇄');

    // Les attaques : on touche directement leurs cartes dans le HUD.
    addEventListener('pointerdown', (e) => {
      const slot = (e.target as Element | null)?.closest?.('.hud-move');
      if (!slot || slot.classList.contains('empty')) return;
      const i = [...slot.parentElement!.children].indexOf(slot);
      if (i < 0 || i > 3) return;
      e.preventDefault();
      slot.classList.add('down');
      navigator.vibrate?.(8);
      const code = `Digit${i + 1}`;
      key(code, 'keydown');
      const up = (u: PointerEvent) => {
        if (u.pointerId !== e.pointerId) return;
        slot.classList.remove('down');
        key(code, 'keyup');
        removeEventListener('pointerup', up);
        removeEventListener('pointercancel', up);
      };
      addEventListener('pointerup', up);
      addEventListener('pointercancel', up);
    });

    // En haut à droite : réglages et fiche de l'équipe. Ils ouvrent un écran : on attend
    // que le doigt se lève, sinon le même toucher retombe sur l'écran et le referme.
    const top = el('div', 'touch-top', this.root);
    this.tapButton(top, 'Escape', '☰');
    this.tapButton(top, 'KeyC', 'Fiche');

    // Consigne en portrait : l'interface est pensée pour un cadre 16:9.
    const rotate = el('div', 'touch-rotate');
    el('b', '', rotate, '⟳');
    el('span', '', rotate, 'Tourne ton appareil pour jouer');
    document.body.append(rotate);

    // Pas de menu contextuel ni de loupe sur un appui long.
    addEventListener('contextmenu', (e) => {
      if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault();
    });

    const tick = () => {
      this.sync();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private button(parent: HTMLElement, cls: string, code: string, label?: string): HTMLElement {
    const b = el('button', `touch-btn ${cls}`, parent, label);
    b.type = 'button';
    let id = -1;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (id >= 0) return;
      id = e.pointerId;
      capture(b, e.pointerId);
      b.classList.add('down');
      navigator.vibrate?.(8);
      key(code, 'keydown');
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      b.classList.remove('down');
      key(code, 'keyup');
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    return b;
  }

  /** Bouton qui ouvre un écran : la touche part au relâcher (click), pas à l'appui. */
  private tapButton(parent: HTMLElement, code: string, label: string): void {
    const b = el('button', 'touch-btn menu', parent, label);
    b.type = 'button';
    b.addEventListener('click', () => {
      key(code, 'keydown');
      key(code, 'keyup');
    });
  }

  private moveStick(dx: number, dy: number): void {
    const len = Math.hypot(dx, dy);
    const k = len > STICK_RADIUS ? STICK_RADIUS / len : 1;
    this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    const m = Math.min(1, len / STICK_RADIUS);
    if (m < STICK_DEADZONE) this.input.setStick(0, 0);
    else this.input.setStick((dx / len) * m, (dy / len) * m);
  }

  /** Suit le HUD : action possible, ultime et équipe disponibles. */
  private sync(): void {
    const prompts = document.querySelectorAll<HTMLElement>('.shop-prompt:not([hidden])');
    this.act.classList.toggle('ready', prompts.length > 0 || !!document.querySelector('.near'));
    // Les invites disent « [E] » : au doigt, c'est le bouton Action.
    for (const p of prompts) {
      for (const n of p.querySelectorAll('*')) {
        if (n.childElementCount === 0 && n.textContent?.includes('[E]')) n.textContent = n.textContent.replace('[E]', '[ACTION]');
      }
    }
    const ult = document.querySelector<HTMLElement>('.hud-ult');
    this.ult.hidden = !ult || ult.hidden;
    this.ult.classList.toggle('full', !!ult?.classList.contains('full'));
    this.swap.hidden = !document.querySelector('.hud-team .member');
  }
}
