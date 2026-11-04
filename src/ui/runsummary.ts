import { sfx } from '../audio/audio';
import type { Champion } from '../data/champions';
import type { Actor } from '../entities/actor';
import { formatDuration, type RunStats } from '../meta/runstats';
import { curve, spray } from './spray';

// Bilan de fin de run (meta/runstats.ts), dans la DA « Tag sacré » : la même
// affiche scotchée que celle du prochain combat (bosspreview.ts), mais c'est
// le rapport de la rébellion — jusqu'où elle est allée, ce qu'elle rapporte,
// et le Pokémon qui a porté l'équipe, entouré à la bombe. Il s'ouvre quand le
// voile de fin est tombé ; le fermer (Entrée, E, Espace, Échap) rentre au
// Repaire.

export interface SummaryData {
  victory: boolean;
  /** Salles traversées (la salle où l'on tombe ne compte pas). */
  rooms: number;
  act: number;
  biome: string;
  color: string;
  /** Champion de l'acte où la run s'arrête. */
  champion: Champion;
  boons: number;
  team: readonly Actor[];
  stats: RunStats;
}

const el = (tag: string, cls: string, parent?: HTMLElement, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
};

const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');

export class RunSummary {
  private readonly root: HTMLElement;
  private onClose: (() => void) | null = null;
  /** Les touches qui ont fait tomber la run ne doivent pas fermer le bilan aussitôt ouvert. */
  private openedAt = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'reward', parent);
    this.root.hidden = true;
    // Au doigt : toucher le bilan le referme (pas aussitôt ouvert, comme au clavier).
    this.root.addEventListener('click', () => {
      if (performance.now() - this.openedAt >= 600) this.close();
    });
    addEventListener(
      'keydown',
      (e) => {
        if (this.root.hidden) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        if (performance.now() - this.openedAt < 600) return;
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
    sfx('menuClose');
    this.root.hidden = true;
    this.root.replaceChildren();
    const done = this.onClose;
    this.onClose = null;
    done?.();
  }

  show(d: SummaryData, onClose: () => void): void {
    sfx('menuOpen');
    this.onClose = onClose;
    this.openedAt = performance.now();
    this.root.replaceChildren();
    this.root.classList.remove('play');
    this.root.hidden = false;
    const s = d.stats;
    el('div', 'poster-dim', this.root);
    const wrap = el('div', 'poster-wrap', this.root);
    const poster = el('div', 'poster summary', wrap);
    poster.style.setProperty('--trainer', d.victory ? '#ffd23f' : d.color);

    const top = el('div', 'top', poster);
    const info = el('div', '', top);
    el('span', 'banner da-tape', info, d.victory ? 'VICTOIRE' : 'DÉFAITE');
    el('h3', '', info, d.victory ? 'MAÎTRE DE LA LIGUE' : `SALLE ${d.rooms + 1}`);
    el(
      'p',
      '',
      info,
      d.victory
        ? `La chaîne est brisée : ${d.stats.champions.length} champions tombés en ${formatDuration(s.time)}.`
        : `Tombé à l'acte ${d.act + 1}, ${d.biome}, sur la route de ${d.champion.name}.`,
    );
    const beaten = el('p', 'weak', info, 'Champions vaincus : ');
    el('b', '', beaten, s.champions.length ? s.champions.join(', ') : 'aucun');

    // Le meilleur frappeur, entouré à la bombe comme l'as sur l'affiche du champion.
    const mvp = s.mvp(d.team);
    if (mvp) {
      const box = el('div', 'mvp', top);
      const img = el('img', '', box) as HTMLImageElement;
      img.src = `/game/artwork/${mvp.speciesId}.png`;
      img.alt = '';
      el('b', '', box, mvp.pokemon?.name ?? '?');
      el('small', 'ace-tag', box, '★ MVP');
      box.insertAdjacentHTML(
        'beforeend',
        spray({ ...curve([8, 30, 4, -6, 96, -6, 92, 30]), viewBox: '0 0 100 60', color: '#ffd23f', width: 2.6, drips: 1, dripMax: 2, dots: 6, seed: 21, delay: 0.7, draw: 0.3 }) +
          spray({ ...curve([92, 30, 96, 66, 2, 66, 10, 22]), viewBox: '0 0 100 60', color: '#ffd23f', width: 2.6, drips: 2, dripMax: 3, dots: 6, seed: 22, delay: 0.95, draw: 0.3 }),
      );
    }

    // `sum-stats`, pas `stats` : cette classe est celle de la fiche des
    // statistiques (statsheet.ts, un voile plein écran), qui recouvrait les
    // chiffres d'un voile d'encre et les empilait au centre (retour de test :
    // « illisible »).
    const grid = el('div', 'sum-stats', poster);
    const stat = (value: string, label: string) => {
      const c = el('div', 'sum-stat', grid);
      el('b', '', c, value);
      el('small', '', c, label);
    };
    stat(String(d.rooms), d.rooms > 1 ? 'salles traversées' : 'salle traversée');
    stat(formatDuration(s.time), 'de combat');
    stat(fmt(s.kos), 'ennemis K.O.');
    stat(String(d.boons), d.boons > 1 ? 'dons reçus' : 'don reçu');
    stat(fmt(s.dealt), 'PV infligés');
    stat(fmt(s.taken), 'PV encaissés');
    stat(`+${fmt(s.baies)}`, 'Baies rapportées');
    stat(`+${s.shards} ✦`, s.shards > 1 ? 'Éclats de Champion' : 'Éclat de Champion');

    el('div', 'team-title', poster, "L'ÉQUIPE");
    const team = el('div', 'team', poster);
    const top1 = Math.max(1, ...d.team.map((a) => s.members.get(a)?.dealt ?? 0));
    for (const a of d.team) {
      const m = s.members.get(a) ?? { dealt: 0, taken: 0 };
      const ko = !a.pokemon || a.pokemon.fainted;
      const c = el('div', `mon${a === mvp ? ' ace' : ''}${ko ? ' ko' : ''}`, team);
      const img = el('img', '', c) as HTMLImageElement;
      img.src = `/game/artwork/${a.speciesId}.png`;
      img.alt = '';
      el('b', '', c, a.pokemon?.name ?? '?');
      el('small', '', c, `Niv. ${a.pokemon?.level ?? '?'}${ko ? ' · K.O.' : ''}`);
      const bar = el('i', 'bar', c);
      bar.style.setProperty('--w', `${(m.dealt / top1) * 100}%`);
      el('small', '', c, `⚔ ${fmt(m.dealt)}`);
    }
    el('p', 'keys', poster, 'Entrée, E ou Échap : rentrer au Repaire');
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
