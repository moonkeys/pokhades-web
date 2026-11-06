import { sfx } from '../audio/audio';
import { BOONS, DONORS, RARITY_COLOR, RARITY_NAME, valueText, type Boons } from '../combat/boons';
import type { Pokemon } from '../combat/pokemon';
import type { HeldItem } from '../meta/catalog';
import { typeColor } from '../render/combatfx';
import { typePill } from './hud';
import { hint } from './hints';

// Fiche des statistiques de l'équipe, touche C (comme « caractéristiques »,
// même place sur AZERTY et QWERTY), en run comme au Repaire : une bande de
// papier par membre (PV, ATT, DÉF, ATT.S, DÉF.S, VIT, objet tenu, attaques),
// et en run les dons reçus et l'ultime. Le jeu se fige tant qu'elle est
// ouverte (comme les écrans de choix) ; C, Échap ou un clic la referment.
//
// Les dons ont quitté la carte du HUD (retour de test) : c'est ici qu'on les
// relit. Le jeu Godot n'a pas d'équivalent en run (son écran d'équipe n'est
// qu'au hub).

/** Un membre tel que la fiche le montre : en run ses PV du moment, au Repaire PV pleins. */
export interface SheetEntry {
  mon: Pokemon;
  item?: HeldItem;
  ko?: boolean;
  /** Mercenaire recruté à la boutique. */
  ally?: boolean;
}

const el = (tag: string, cls: string, parent?: HTMLElement, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
};

/** Échelle des barres : la stat de base la plus haute des Pokémon jouables tourne autour de 130. */
const BAR_MAX = 140;

export class StatSheet {
  private readonly root: HTMLElement;
  private onClose: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'stats', parent);
    this.root.hidden = true;
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.close();
    });
    // En capture : fiche ouverte, le jeu ne reçoit aucune touche ; C et Échap la referment.
    addEventListener(
      'keydown',
      (e) => {
        if (this.root.hidden) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        if (e.code === 'KeyC' || e.code === 'Escape' || e.code === 'Enter') this.close();
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

  /** `boons` : ceux de la run en cours (absent au Repaire). */
  show(entries: readonly SheetEntry[], boons: Boons | null, onClose: () => void): void {
    sfx('menuOpen');
    this.onClose = onClose;
    this.root.replaceChildren();
    const page = el('div', 'stats-page', this.root);
    const head = el('div', 'stats-head', page);
    el('span', 'da-tape', head, boons ? 'Équipe · statistiques' : 'Équipe du Repaire · au départ');
    el('small', 'stats-keys', head, hint('C, Échap ou clic : fermer', 'Touche pour fermer'));

    const grid = el('div', 'stats-grid', page);
    for (const e of entries) statCard(grid, e);

    if (boons) this.boonList(page, boons);
    this.root.hidden = false;
  }

  private boonList(parent: HTMLElement, boons: Boons): void {
    const box = el('div', 'stats-boons da-paper', parent);
    el('div', 'lbl', box, `Dons reçus · ${boons.owned.size}`);
    if (boons.ult) {
      const d = DONORS[boons.ult];
      const row = el('div', 'boon ult', box);
      const i = el('i', '', row, d.sym);
      i.style.setProperty('--c', typeColor(d.type));
      el('b', '', row, `Ultime : ${d.ult}`);
      el('small', '', row, `${d.name} · touche R`);
    }
    if (!boons.owned.size && !boons.ult) {
      el('small', 'none', box, 'Aucun pour l’instant : les portes à badge mènent aux dons des légendaires.');
      return;
    }
    const list = el('div', 'list', box);
    for (const [id, r] of boons.owned) {
      const def = BOONS[id];
      if (!def) continue;
      const donor = def.god !== 'duo' ? DONORS[def.god] : null;
      const row = el('div', 'boon', list);
      const i = el('i', '', row, def.duo ? '✧' : (donor?.sym ?? '?'));
      i.style.setProperty('--c', donor ? typeColor(donor.type) : 'var(--spray)');
      const body = el('div', '', row);
      const name = el('b', '', body, def.name);
      const rar = el('span', 'rar', name, RARITY_NAME[r]);
      rar.style.setProperty('--r', RARITY_COLOR[r]);
      const value = valueText(id, r);
      el('small', '', body, value ? `${def.desc} (${value})` : def.desc);
    }
  }
}

/** La bande de papier d'un membre ; la fiche de recrutement (recruitscreen.ts) la reprend telle quelle. */
export function statCard(parent: HTMLElement, { mon, item, ko, ally }: SheetEntry): HTMLElement {
  const card = el('div', `stats-card da-paper${ko ? ' ko' : ''}`, parent);
  card.style.setProperty('--c', typeColor(mon.types[0]));
  const img = el('img', 'art', card) as HTMLImageElement;
  img.src = `/game/artwork/${mon.id}.png`;
  img.alt = '';
  const name = el('div', 'nm', card);
  name.append(mon.name);
  el('small', '', name, `N.${mon.level}`);
  const types = el('div', 'types', card);
  for (const t of mon.types) typePill(t, types);
  if (ally) el('span', 'tag', types, 'Mercenaire');
  if (ko) el('span', 'tag ko', types, 'K.O.');

  // PV du moment, puis les cinq stats ; ▲ quand un don, un objet ou un bonus la relève.
  const hp = el('div', 'hp', card);
  const gauge = el('div', 'da-gauge', hp);
  const fill = el('b', '', gauge);
  const ratio = mon.hp / mon.maxHp;
  fill.style.setProperty('--v', `${ratio * 100}%`);
  fill.dataset.band = ratio > 0.5 ? 'g' : ratio > 0.25 ? 'y' : 'r';
  el('span', '', hp, `${mon.hp} / ${mon.maxHp}`);
  const rows: [string, number, boolean][] = [
    ['ATT', mon.attack, mon.mult.atk * mon.buff('atk') > 1],
    ['DÉF', mon.defense, mon.mult.def * mon.buff('def') > 1],
    ['ATT.S', mon.spAttack, mon.mult.spAtk * mon.buff('atk') > 1],
    ['DÉF.S', mon.spDefense, mon.mult.spDef * mon.buff('def') > 1],
    ['VIT', mon.speed, mon.mult.speed > 1],
  ];
  const stats = el('div', 'rows', card);
  for (const [label, v, up] of rows) {
    const r = el('div', up ? 'up' : '', stats);
    el('small', '', r, label);
    el('b', '', r, String(v));
    el('i', '', r).style.setProperty('--w', `${Math.min(100, (v / BAR_MAX) * 100)}%`);
  }
  // Critique et esquive ne s'affichent que s'ils existent (dons, bonus).
  const extra: string[] = [];
  if (mon.critChance > 0.005) extra.push(`Critique ${Math.round(mon.critChance * 100)} %`);
  if (mon.dodgeChance > 0.005) extra.push(`Esquive ${Math.round(mon.dodgeChance * 100)} %`);
  if (extra.length) el('div', 'extra', card, extra.join(' · '));

  const held = el('div', 'held', card);
  if (item) {
    const ico = el('img', '', held) as HTMLImageElement;
    ico.src = `/game/assets/essentials/items/${item.icon}.png`;
    ico.alt = '';
    held.append(item.name);
  } else held.append('Aucun objet tenu');

  const moves = el('div', 'moves', card);
  for (const m of mon.moves) {
    const row = el('div', '', moves);
    row.style.setProperty('--c', typeColor(m.type));
    el('span', '', row, m.name);
    el('small', '', row, m.power > 0 ? String(m.power) : '—');
  }
  return card;
}
