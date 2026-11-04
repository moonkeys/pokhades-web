import { sfx } from '../audio/audio';
import { net } from '../net/net';

// Le jeu en ligne, toujours sous les yeux (ajout, retour de test : « ouvrir
// la partie sans rester coincé chez Roucarnage ») : en haut, un bandeau avec
// le code de la partie — un clic le copie —, et sur le côté, au Repaire, les
// joueurs qui sont là, au fil des arrivées.

const el = (tag: string, cls: string, parent?: HTMLElement, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
};

export class NetBadge {
  private readonly badge: HTMLElement;
  private readonly list: HTMLElement;
  /** Au Repaire : la liste des joueurs se montre ; en run, le bandeau seul (le HUD d'équipe a déjà sa place). */
  private inCamp = true;

  constructor(parent: HTMLElement) {
    this.badge = el('button', 'net-badge da-paper', parent);
    this.badge.hidden = true;
    this.badge.title = 'Copier le code';
    this.badge.addEventListener('click', () => {
      if (!net.code) return;
      void navigator.clipboard?.writeText(net.code).then(
        () => this.flash('Code copié !'),
        () => {},
      );
      sfx('click', -6);
    });
    this.list = el('div', 'net-players', parent);
    this.list.hidden = true;
    net.onChange(() => this.render());
  }

  /** Le jeu change de lieu : au Repaire la liste des joueurs, en run le bandeau seul. */
  setCamp(inCamp: boolean): void {
    if (this.inCamp === inCamp) return;
    this.inCamp = inCamp;
    this.render();
  }

  private flash(text: string): void {
    const tip = this.badge.querySelector('.net-tip');
    if (!tip) return;
    tip.textContent = text;
    setTimeout(() => this.render(), 1200);
  }

  private render(): void {
    const on = net.active && !!net.code;
    this.badge.hidden = !on;
    this.list.hidden = !on || !this.inCamp;
    if (!on) return;
    this.badge.replaceChildren();
    el('span', 'net-dot', this.badge);
    el('small', '', this.badge, net.role === 'host' ? 'Partie ouverte' : 'En ligne chez l’hôte');
    el('b', 'net-code', this.badge, net.code);
    el('span', 'net-count', this.badge, `${net.players.length}/6`);
    el('small', 'net-tip', this.badge, net.role === 'host' ? 'clic : copier le code' : 'clic : copier');

    this.list.replaceChildren();
    el('div', 'net-players-title da-tape', this.list, 'Joueurs');
    for (const p of net.players) {
      const row = el('div', `net-player${p.id === net.id ? ' me' : ''}`, this.list);
      if (p.loadout) {
        const img = el('img', '', row) as HTMLImageElement;
        img.src = `/game/artwork/${p.loadout.species}.png`;
        img.alt = '';
        const txt = el('div', '', row);
        el('b', '', txt, p.loadout.name);
        el('small', '', txt, `N.${p.loadout.level}${p.host ? ' · hôte' : ''}${p.id === net.id ? ' · toi' : ''}`);
      } else el('b', '', row, '…');
    }
    if (net.role === 'host') el('small', 'net-hint', this.list, net.guests.length ? 'Dracolosse emmène tout le monde.' : 'Donne le code : tes alliés le tapent chez leur Roucarnage.');
    else el('small', 'net-hint', this.list, 'Roucarnage : quitter la partie.');
  }
}
