import { sfx } from '../audio/audio';
import {
  cloudConflict,
  cloudEmail,
  cloudError,
  cloudLastSync,
  cloudStatus,
  deleteAccount,
  flush,
  logout,
  onCloudChange,
  resolveConflict,
  sendCode,
  verifyCode,
  type SaveSummary,
} from '../net/cloud';

// Écran « Compte » : créer son compte (e-mail puis code à 6 chiffres), voir que la partie est
// à l'abri, se déconnecter, supprimer son compte, ou choisir entre deux parties quand elles ont
// avancé chacune de leur côté. Ouvert depuis l'écran titre (main.ts). La même feuille de papier
// que le menu des réglages.
//
// Le clavier : les champs de saisie reçoivent leurs touches (Input les ignore déjà), Entrée
// valide le formulaire, Échap ferme. La souris et le doigt marchent partout.

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
};

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** Une partie en une ligne : de quoi reconnaître la sienne. */
const describe = (s: SaveSummary) =>
  s.started ? [plural(s.mons, 'Pokémon'), plural(s.badges, 'champion') + ' battu' + (s.badges > 1 ? 's' : ''), plural(s.wins, 'victoire'), `${s.baies} Baies`].join(' · ') : 'Partie pas encore commencée';

const ago = (d: Date): string => {
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `le ${d.toLocaleDateString('fr-FR')}`;
};

export class AccountScreen {
  private readonly root: HTMLElement;
  private onClose: (() => void) | null = null;
  /** Formulaire de connexion : l'e-mail tapé, et s'il attend le code. */
  private email = '';
  private codeSent = false;
  private message = '';
  private busy = false;
  /** Suppression du compte : deux appuis, comme « Abandonner la run ». */
  private confirmDelete = false;
  private unsub: (() => void) | null = null;

  constructor(
    parent: HTMLElement,
    /** La partie du compte a remplacé celle d'ici : main.ts recharge la page. */
    private readonly onReplaced: () => void,
  ) {
    this.root = el('div', 'reward optmenu acct', parent);
    this.root.hidden = true;
    addEventListener(
      'keydown',
      (e) => {
        if (this.root.hidden) return;
        // Les autres écrans et le jeu (figé derrière) ne reçoivent rien ; les champs, si.
        const field = e.target instanceof HTMLInputElement && this.root.contains(e.target);
        if (e.code === 'Escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          return this.close();
        }
        if (!field) {
          e.stopImmediatePropagation();
          if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
            // Entrée sur un bouton : le navigateur le clique déjà.
            if (!(e.target instanceof HTMLButtonElement)) e.preventDefault();
          }
        }
      },
      { capture: true },
    );
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(onClose: () => void): void {
    sfx('menuOpen');
    this.onClose = onClose;
    this.message = '';
    this.confirmDelete = false;
    this.root.hidden = false;
    this.root.classList.remove('play');
    this.unsub = onCloudChange(() => this.render());
    this.render();
    requestAnimationFrame(() => this.root.classList.add('play'));
  }

  close(): void {
    if (this.root.hidden) return;
    sfx('menuClose');
    this.root.hidden = true;
    this.root.replaceChildren();
    this.unsub?.();
    this.unsub = null;
    const done = this.onClose;
    this.onClose = null;
    done?.();
  }

  private async act(f: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.render();
    try {
      await f();
    } finally {
      this.busy = false;
      if (!this.root.hidden) this.render();
    }
  }

  // ── Rendu ──────────────────────────────────────────────────────────────

  private render(): void {
    this.root.replaceChildren();
    el('div', 'poster-dim', this.root).addEventListener('click', () => this.close());
    const wrap = el('div', 'poster-wrap', this.root);
    const sheet = el('div', 'poster opt-sheet', wrap);
    const head = el('div', 'opt-head', sheet);
    el('span', 'banner da-tape', head, 'COMPTE');
    el('h3', '', head, 'SAUVEGARDE EN LIGNE');
    const body = el('div', 'opt-body acct-body', sheet);

    const st = cloudStatus();
    if (st === 'conflict') this.renderConflict(body);
    else if (st === 'out') this.renderLogin(body);
    else this.renderAccount(body);

    const close = el('button', 'acct-close', sheet, 'FERMER');
    close.addEventListener('click', () => this.close());
  }

  private renderLogin(body: HTMLElement): void {
    el('p', 'acct-lead', body, 'Tu joues sur plusieurs appareils ? Crée-toi un compte : ta progression te suit partout (ordinateur, téléphone, tablette).');
    el('p', 'acct-fine', body, 'On ne garde que ton e-mail et ta sauvegarde. Pas de mot de passe : un code arrive par e-mail à chaque connexion. Le compte est facultatif, le jeu marche aussi sans.');
    const form = el('form', 'acct-form', body);
    form.noValidate = true;
    if (!this.codeSent) {
      const input = el('input', 'acct-input', form);
      input.type = 'email';
      input.autocomplete = 'email';
      input.placeholder = 'ton@email.fr';
      input.value = this.email;
      input.required = true;
      const go = el('button', 'opt-big go', form, this.busy ? 'ENVOI…' : 'RECEVOIR MON CODE');
      go.type = 'submit';
      go.disabled = this.busy;
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = input.value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          this.message = 'Cette adresse ne ressemble pas à un e-mail.';
          return this.render();
        }
        this.email = email;
        void this.act(async () => {
          const err = await sendCode(email);
          this.message = err ?? '';
          if (!err) {
            this.codeSent = true;
            sfx('confirm');
          }
        });
      });
      requestAnimationFrame(() => input.focus());
    } else {
      el('p', 'acct-fine', form, `E-mail envoyé à ${this.email} (regarde aussi dans les indésirables). Tape son code, ou clique sur son lien depuis cet appareil.`);
      const input = el('input', 'acct-input acct-code', form);
      input.inputMode = 'numeric';
      input.autocomplete = 'one-time-code';
      input.placeholder = '123456';
      input.maxLength = 10;
      const go = el('button', 'opt-big go', form, this.busy ? 'VÉRIFICATION…' : 'SE CONNECTER');
      go.type = 'submit';
      go.disabled = this.busy;
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const code = input.value.replace(/\s+/g, '');
        if (!/^\d{6,10}$/.test(code)) {
          this.message = 'Le code fait 6 chiffres.';
          return this.render();
        }
        void this.act(async () => {
          const r = await verifyCode(this.email, code);
          this.message = r.error ?? '';
          if (r.error) return;
          sfx('confirm');
          this.codeSent = false;
          if (r.reload) this.onReplaced();
        });
      });
      const back = el('button', 'acct-link', form, 'Changer d’adresse ou renvoyer le code');
      back.type = 'button';
      back.addEventListener('click', () => {
        this.codeSent = false;
        this.message = '';
        this.render();
      });
      requestAnimationFrame(() => input.focus());
    }
    // Sinon, ce que la synchro a à dire (lien d'e-mail expiré, session perdue).
    const msg = this.message || cloudError();
    if (msg) el('p', 'acct-error', body, msg);
  }

  private renderAccount(body: HTMLElement): void {
    const st = cloudStatus();
    el('p', 'acct-lead', body, `Connecté : ${cloudEmail()}`);
    const last = cloudLastSync();
    const line =
      st === 'busy'
        ? 'Synchronisation…'
        : st === 'offline'
          ? cloudError() || 'Hors ligne : la partie sera envoyée plus tard.'
          : `Ta partie est à l’abri${last ? ` (synchronisée ${ago(last)})` : ''}. Elle s’envoie toute seule pendant que tu joues.`;
    el('p', `acct-state ${st}`, body, line);
    el('p', 'acct-fine', body, 'Sur un autre appareil : ouvre le jeu, Compte, et connecte-toi avec la même adresse.');

    const actions = el('div', 'acct-actions', body);
    const out = el('button', 'opt-switch', actions, 'SE DÉCONNECTER');
    out.disabled = this.busy;
    out.addEventListener('click', () =>
      this.act(async () => {
        await logout();
        sfx('confirm');
      }),
    );
    const del = el('button', `opt-switch acct-danger${this.confirmDelete ? ' sure' : ''}`, actions, this.confirmDelete ? 'CONFIRMER : TOUT EFFACER EN LIGNE' : 'SUPPRIMER MON COMPTE');
    del.disabled = this.busy;
    del.addEventListener('click', () => {
      if (!this.confirmDelete) {
        this.confirmDelete = true;
        sfx('click', -6);
        return this.render();
      }
      void this.act(async () => {
        await flush();
        const err = await deleteAccount();
        this.confirmDelete = false;
        this.message = err ?? 'Compte supprimé : ton e-mail et ta sauvegarde en ligne sont effacés. Ta partie reste sur cet appareil.';
      });
    });
    if (this.confirmDelete) el('p', 'acct-fine', body, 'Ton e-mail et ta sauvegarde en ligne seront effacés. La partie de cet appareil, elle, reste.');
    if (this.message) el('p', 'acct-error', body, this.message);
  }

  private renderConflict(body: HTMLElement): void {
    const c = cloudConflict();
    if (!c) return;
    el('p', 'acct-lead', body, 'Ta partie a avancé à deux endroits : ici, et sur un autre appareil. Laquelle garder ?');
    el('p', 'acct-fine', body, 'L’autre est mise de côté sur cet appareil, pas effacée.');
    const pick = el('div', 'acct-pick', body);
    const card = (title: string, sub: string, s: SaveSummary, keep: 'local' | 'cloud') => {
      const b = el('button', 'acct-card', pick);
      el('b', '', b, title);
      el('small', '', b, sub);
      el('span', '', b, describe(s));
      b.disabled = this.busy;
      b.addEventListener('click', () =>
        this.act(async () => {
          sfx('confirm');
          if (await resolveConflict(keep)) this.onReplaced();
        }),
      );
    };
    card('CET APPAREIL', 'la partie de ce navigateur', c.local, 'local');
    card('LE COMPTE', `envoyée ${ago(c.cloudAt)}`, c.cloud, 'cloud');
  }
}
