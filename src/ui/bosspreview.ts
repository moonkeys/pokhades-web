import { loadInfo } from '../assets/pmd';
import { TYPE_CHART, typeMultiplier } from '../combat/damage';
import type { Champion } from '../data/champions';
import { typeColor } from '../render/combatfx';
import { typePill } from './hud';
import { curve, spray } from './spray';

// Affiche du prochain combat, reprise de BossPreviewScreen.gd et redessinée
// dans la DA « Tag sacré » (src/ui/da.css) : l'affiche officielle de la
// Ligue, scotchée au mur, que la rébellion a annotée — l'as du champion
// entouré à la bombe, à la couleur de son type. Le contenu reste net : le
// champion, son type, ce que ses Pokémon craignent, son portrait de combat,
// puis son équipe de 6 en illustrations, formes finales et niveaux du combat.
// Ouverte depuis l'affiche de la place (E), elle fige le jeu. « Compris »,
// Échap, Entrée ou E ferment.

const TYPE_FR: Record<string, string> = {
  normal: 'Normal', fire: 'Feu', water: 'Eau', electric: 'Électrik', grass: 'Plante', ice: 'Glace',
  fighting: 'Combat', poison: 'Poison', ground: 'Sol', flying: 'Vol', psychic: 'Psy', bug: 'Insecte',
  rock: 'Roche', ghost: 'Spectre', dragon: 'Dragon', dark: 'Ténèbres', steel: 'Acier', fairy: 'Fée',
};

const el = (tag: string, cls: string, parent?: HTMLElement, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
};

export class BossPreview {
  private readonly root: HTMLElement;
  private onClose: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'reward', parent);
    this.root.hidden = true;
    addEventListener(
      'keydown',
      (e) => {
        if (this.root.hidden) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') this.close();
      },
      { capture: true },
    );
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  close(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.root.replaceChildren();
    const done = this.onClose;
    this.onClose = null;
    done?.();
  }

  /** `bossRoom` : index de la salle du boss, pour les niveaux (RunManager.boss_wave_level). */
  show(champ: Champion, final: boolean, bossRoom: number, onClose: () => void): void {
    this.onClose = onClose;
    this.root.replaceChildren();
    this.root.classList.remove('play');
    this.root.hidden = false;
    const color = typeColor(champ.type);
    el('div', 'poster-dim', this.root);
    const wrap = el('div', 'poster-wrap', this.root);
    const poster = el('div', 'poster', wrap);
    poster.style.setProperty('--trainer', color);
    const top = el('div', 'top', poster);
    const info = el('div', '', top);
    el('span', 'banner da-tape', info, final ? 'DRESSEUR FINAL' : 'PROCHAIN COMBAT');
    const h = el('h3', '', info, champ.name.toUpperCase());
    typePill(champ.type, h);
    el('p', '', info, `Il t'attend derrière la porte, avec ${champ.team.length} Pokémon.`);
    // Ce que craint le type du champion (le jeu ne regarde que lui, pas les doubles types de chacun).
    const weak = Object.keys(TYPE_CHART).filter((t) => typeMultiplier(t, [champ.type]) > 1);
    const w = el('p', 'weak', info, 'Ses Pokémon craignent : ');
    el('b', '', w, weak.length ? weak.map((t) => TYPE_FR[t]).join(', ') : 'rien de particulier');
    const portrait = el('img', '', el('div', 'trainer', top)) as HTMLImageElement;
    portrait.src = `/game/assets/essentials/trainers/battle/${champ.sprite.replace(/^trainer_/, '')}`;
    portrait.alt = champ.name;

    el('div', 'team-title', poster, 'SON ÉQUIPE');
    const grid = el('div', 'team', poster);
    champ.team.forEach(([id], i) => {
      const ace = i === champ.team.length - 1;
      const c = el('div', `mon${ace ? ' ace' : ''}`, grid);
      const img = el('img', '', c) as HTMLImageElement;
      img.src = `/game/artwork/${id}.png`;
      img.alt = '';
      const name = el('b', '', c, '…');
      el('small', '', c, `Niv. ${18 + Math.floor(bossRoom * 0.7) + Math.floor(i * 1.4)}`);
      if (ace) {
        el('small', 'ace-tag', c, '★ son as');
        // Entouré à la bombe par la rébellion, en deux arcs.
        c.insertAdjacentHTML(
          'beforeend',
          spray({ ...curve([8, 30, 4, -6, 96, -6, 92, 30]), viewBox: '0 0 100 60', color, width: 2.6, drips: 1, dripMax: 2, dots: 6, seed: 14, delay: 0.7, draw: 0.3 }) +
            spray({ ...curve([92, 30, 96, 66, 2, 66, 10, 22]), viewBox: '0 0 100 60', color, width: 2.6, drips: 2, dripMax: 3, dots: 6, seed: 15, delay: 0.95, draw: 0.3 }),
        );
      }
      void loadInfo(id).then((inf) => (name.textContent = inf.name));
    });
    el('p', 'keys', poster, 'Entrée, E ou Échap : compris');
    // Deux bouts de scotch qui tiennent l'affiche au mur.
    for (const [side, rot] of [
      ['left: 4%', -14],
      ['right: 4%', 11],
    ] as const) {
      const t = el('i', 'da-tapestrip', wrap);
      t.style.cssText = `${side}; rotate: ${rot}deg`;
    }
    requestAnimationFrame(() => this.root.classList.add('play'));
  }
}
