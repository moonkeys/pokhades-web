import type { Combat } from '../combat/combat';
import { DONORS, ULT_MAX } from '../combat/boons';
import { BUFF_LABEL, STATUS, type Pokemon, type Status } from '../combat/pokemon';
import { DASH_RECHARGE, type Actor } from '../entities/actor';
import { BUFF_TIME, type Move } from '../combat/moves';
import { typeColor, type Projector } from '../render/combatfx';
import { GROWTH_FR, growthOf } from '../data/growth';
import { hint } from './hints';

// HUD de combat, repris de HUD.gd et redessiné dans la DA « Tag sacré »
// (src/ui/da.css, planche ui-r4.html) : en bas à gauche, la carte du Pokémon
// sur une bande de papier (PV avec barre fantôme qui rattrape, XP, charges de
// dash, bonus et statut, jauge d'ultime), et juste à sa droite ses 4 attaques
// en 2 × 2, comme dans les jeux Pokémon. En haut à gauche, sous le lieu,
// l'équipe (dès deux Pokémon) : PV et XP de chacun (les Rappels,
// communs, sont comptés à côté des ₽ : ui/runhud.ts), celui qu'on joue
// en avant, les K.O. en gris ; Tab ou un clic sur un membre pour le faire
// jouer. Puis le combo, la vignette rouge sous 25 % de PV, et les étiquettes
// de statut des sauvages.
//
// Écarts voulus avec le jeu : le voile de recharge est tenu à jour sur les
// quatre emplacements (le jeu ne rafraîchit que celui sélectionné), il y a
// autant de pastilles de dash que de charges (le jeu en dessine 3 au plus),
// et chaque attaque dit ce qu'elle fait, chiffres à l'appui. La carte et les
// attaques sont tenues basses, et les dons reçus n'y figurent plus (retour de
// test : ils mangeaient l'écran sans servir en combat) ; ils sont sur la fiche
// des statistiques (touche C, src/ui/statsheet.ts).

export const TYPE_FR: Record<string, string> = {
  normal: 'Normal', fire: 'Feu', water: 'Eau', electric: 'Électrik', grass: 'Plante', ice: 'Glace',
  fighting: 'Combat', poison: 'Poison', ground: 'Sol', flying: 'Vol', psychic: 'Psy', bug: 'Insecte',
  rock: 'Roche', ghost: 'Spectre', dragon: 'Dragon', dark: 'Ténèbres', steel: 'Acier', fairy: 'Fée',
};
const STATUS_FR: Record<Status, string> = { burn: 'Brûlure', poison: 'Poison', paralysis: 'Paralysie', freeze: 'Gel', sleep: 'Sommeil' };
const KEYS = ['1 · Q', '2 · Z', '3 · S', '4 · D'];
/** La barre fantôme des PV rattrape la vraie à 0,67 barre par seconde (HUD.gd:140-148). */
const GHOST_SPEED = 0.67;

const pct = (mult: number) => `${mult >= 1 ? '+' : '−'}${Math.round(Math.abs(mult - 1) * 100)} %`;

/** Ce que fait une attaque : sa catégorie et sa puissance, ou son effet chiffré (moves.ts : EFFECTS). */
export function moveInfo(m: Move): string {
  if (m.power > 0) return `${m.damageClass === 'special' ? 'Spéciale' : 'Physique'} · ${m.power}`;
  const fx = m.effect;
  if (!fx) return 'Effet au contact';
  switch (fx.kind) {
    case 'buff':
      return `${fx.stats.map(([st, mult]) => `${BUFF_LABEL[st]} ${pct(mult)}`).join(' ')} · ${BUFF_TIME} s`;
    case 'debuff':
      return `${BUFF_LABEL[fx.stat]} ennemis ${pct(fx.mult)} · ${BUFF_TIME} s`;
    case 'status':
      return `${STATUS_FR[fx.status]} ${STATUS[fx.status].duration} s${fx.status === 'paralysis' ? ' · VIT −50 %' : ''}`;
    case 'heal':
      return `Soin ${Math.round(fx.pct * 100)} %`;
    case 'protect':
      return 'Abri';
    case 'cleanse':
      return 'Soigne le statut';
  }
}

/** « +50% ATT », « −25% DÉF »… pour chaque hausse ou baisse active. */
function buffTexts(mon: Pokemon): string[] {
  return [...mon.buffs].map(([stat, b]) => `${b.mult >= 1 ? '+' : '−'}${Math.round(Math.abs(b.mult - 1) * 100)}% ${BUFF_LABEL[stat]}`);
}

const el = (tag: string, cls: string, parent?: HTMLElement, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
};

/**
 * Couleurs des pastilles : celles des types dans les jeux, plus soutenues que
 * les couleurs d'impact (typeColor, pensées pour briller sur la carte) — en
 * blanc sur ces pastels, Normal ou Électrik ne se lisaient plus.
 */
const PILL_COLORS: Record<string, string> = {
  normal: '#9a9a8a', fire: '#e8622c', water: '#3d84e0', electric: '#f2c21b', grass: '#4ea838', ice: '#5cc9e0',
  fighting: '#c8402c', poison: '#9a4ac0', ground: '#c8963c', flying: '#7f9ee8', psychic: '#e8487e', bug: '#94ac1c',
  rock: '#ad9a54', ghost: '#6a52a0', dragon: '#5a4ae0', dark: '#5a4a44', steel: '#8a9cb4', fairy: '#e27ec8',
};
/** Types clairs : texte à l'encre plutôt qu'en blanc. */
const LIGHT_PILLS = new Set(['electric', 'ice', 'ground', 'bug', 'rock']);

/** Pastille de type (style commun, da.css). */
export function typePill(type: string, parent?: HTMLElement): HTMLElement {
  const p = el('span', `pill${LIGHT_PILLS.has(type) ? ' light' : ''}`, parent, TYPE_FR[type] ?? type);
  p.style.setProperty('--c', PILL_COLORS[type] ?? typeColor(type));
  return p;
}

export class Hud {
  private readonly root = el('div', 'hud');
  private readonly name: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly hpGhost: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly xpFill: HTMLElement;
  private readonly xpText: HTMLElement;
  private readonly dash: HTMLElement;
  private readonly buffs: HTMLElement;
  private readonly ult: HTMLElement;
  private readonly ultFill: HTMLElement;
  private readonly ultLabel: HTMLElement;
  /** Méga-évolution (main.ts) : prête (touche F) ou en cours. */
  private readonly mega: HTMLElement;
  private buffKey = '';
  private readonly moves: HTMLElement;
  private readonly combo = el('div', 'hud-combo');
  private readonly danger = el('div', 'hud-danger');
  private readonly ko = el('div', 'hud-ko', undefined, 'K.O. !');
  private readonly teamList = el('div', 'hud-team');
  private teamKey = '';
  /** Au Repaire, l'équipe se montre aussi (setCampTeam) : updateTeam, celui de la run, s'efface alors. */
  private campMode = false;
  private campKey = '';
  private members: { el: HTMLElement; hp: HTMLElement; xp: HTMLElement; lv: HTMLElement }[] = [];
  private readonly tags = new Map<Actor, HTMLElement>();
  private readonly tagLayer = el('div', 'hud-tags');
  private slots: { el: HTMLElement; veil: HTMLElement; cross: HTMLElement }[] = [];
  private mon: Actor['pokemon'] = null;
  private ghost = 1;
  private movesVersion = 0;
  private lastCombo = 0;
  private comboAge = 0;

  /**
   * `onPick(i)` : un clic sur le i-ème membre de l'équipe, pour le faire
   * jouer (main.ts vérifie qu'il est debout, comme pour Tab).
   */
  constructor(
    parent: HTMLElement,
    private readonly onPick: (i: number) => void = () => {},
  ) {
    const card = el('div', 'hud-card da-paper', this.root);
    this.name = el('div', 'hud-name', card);
    const hp = el('div', 'hud-stat', card);
    const bar = el('div', 'da-gauge', hp);
    this.hpGhost = el('i', '', bar);
    this.hpFill = el('b', '', bar);
    this.hpText = el('span', 'hud-val', hp);
    const xp = el('div', 'hud-stat', card);
    this.xpFill = el('b', '', el('div', 'da-gauge xp', xp));
    this.xpText = el('span', 'hud-val xp', xp);
    const row = el('div', 'hud-stat', card);
    this.dash = el('div', 'hud-dashes', row);
    this.buffs = el('div', 'hud-buffs', row);
    this.ult = el('div', 'hud-ult', card);
    this.ultFill = el('b', '', this.ult);
    this.ultLabel = el('span', '', this.ult);
    this.mega = el('div', 'hud-mega', card);
    this.mega.hidden = true;
    this.moves = el('div', 'hud-moves', this.root);
    parent.append(this.danger, this.tagLayer, this.teamList, this.root, this.combo, this.ko);
  }

  /** « ready » : la Méga de la salle est à prendre (F) ; « on » : le Pokémon joué est méga-évolué. */
  setMega(state: 'ready' | 'on' | null): void {
    this.mega.hidden = !state;
    if (!state) return;
    const text = state === 'ready' ? '◈ Méga-évolution — F' : '◈ Méga-évolué';
    if (this.mega.textContent !== text) this.mega.textContent = text;
    this.mega.classList.toggle('ready', state === 'ready');
  }

  /** Reconstruit la carte et les attaques quand le Pokémon joué change (HUD.set_active). */
  private rebuild(player: Actor): void {
    const mon = player.pokemon;
    this.mon = mon;
    this.ghost = 1;
    this.name.replaceChildren();
    this.moves.replaceChildren();
    this.slots = [];
    if (!mon) return;
    this.name.append(mon.name);
    el('span', 'lv', this.name, `N.${mon.level}`);
    typePill(mon.types[0], this.name);
    for (let i = 0; i < 4; i++) {
      const m = mon.moves[i];
      const slot = el('div', 'hud-move da-paper', this.moves);
      const top = el('div', 'top', slot);
      el('span', 'mname', top, m?.name ?? '—');
      if (m) typePill(m.type, top);
      el('span', 'key', top, KEYS[i]);
      if (m) {
        slot.style.setProperty('--c', typeColor(m.type));
        el('div', 'minfo', slot, moveInfo(m));
      } else slot.classList.add('empty');
      this.slots.push({ el: slot, veil: el('div', 'veil', slot), cross: el('div', 'cross', slot, '✕') });
    }
  }

  /** L'équipe à gauche : reconstruite quand sa composition change, PV et état tenus à jour. */
  /**
   * L'équipe à gauche, au Repaire comme en run (retour de test : « afficher l'équipe à gauche dans le hub également »).
   * Ses membres n'y sont pas sur le terrain : de simples cartes (portrait, nom, niveau de départ), sans PV.
   * `null` (ou moins de deux membres, comme en run) l'efface.
   */
  setCampTeam(entries: { id: number; name: string; level: number }[] | null): void {
    if (!entries || entries.length < 2) {
      if (this.campMode) {
        this.campMode = false;
        this.campKey = '';
        this.teamKey = '';
        this.teamList.replaceChildren();
      }
      return;
    }
    this.campMode = true;
    const key = JSON.stringify(entries);
    if (key === this.campKey) return;
    this.campKey = key;
    this.teamKey = 'camp';
    this.members = [];
    this.teamList.replaceChildren();
    el('div', 'lbl', this.teamList, 'Équipe');
    entries.forEach((e, i) => {
      const m = el('div', `member da-paper camp${i === 0 ? ' active' : ''}`, this.teamList);
      const img = el('img', '', m) as HTMLImageElement;
      img.src = `/game/artwork/${e.id}.png`;
      img.alt = '';
      const body = el('div', '', m);
      const nm = el('div', 'nm', body, e.name);
      el('small', '', nm, ` N.${e.level}`);
    });
  }

  private updateTeam(team: readonly Actor[], player: Actor): void {
    if (this.campMode) return;
    const key = team.map((a) => `${a.speciesId}:${a.pokemon ? 1 : 0}`).join();
    if (key !== this.teamKey) {
      this.teamKey = key;
      this.teamList.replaceChildren();
      this.members = [];
      if (team.length > 1) {
        el('div', 'lbl', this.teamList, hint('Équipe · Tab ou clic', 'Équipe · touche un membre'));
        team.forEach((a, i) => {
          const m = el('div', 'member da-paper', this.teamList);
          // mousedown plutôt que click : le changement part au premier appui, en plein combat.
          m.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.onPick(i);
          });
          const img = el('img', '', m) as HTMLImageElement;
          img.src = `/game/artwork/${a.speciesId}.png`;
          img.alt = '';
          const body = el('div', '', m);
          const nm = el('div', 'nm', body, a.pokemon?.name ?? '…');
          const lv = el('small', '', nm, '');
          const hp = el('b', '', el('div', 'da-gauge', body));
          const xp = el('b', '', el('div', 'da-gauge xp', body));
          m.title = `Croissance ${GROWTH_FR[growthOf(a.speciesId)]}`;
          this.members.push({ el: m, hp, xp, lv });
        });
      }
    }
    this.members.forEach((m, i) => {
      const a = team[i];
      const mon = a.pokemon;
      const ratio = mon ? mon.hp / mon.maxHp : 1;
      m.el.classList.toggle('active', a === player);
      m.el.classList.toggle('ko', a.deathT >= 0 || !!mon?.fainted);
      m.hp.style.setProperty('--v', `${ratio * 100}%`);
      m.hp.dataset.band = ratio > 0.5 ? 'g' : ratio > 0.25 ? 'y' : 'r';
      m.xp.style.setProperty('--v', `${(mon?.xpRatio ?? 0) * 100}%`);
      const lv = mon ? ` N.${mon.level}` : '';
      if (m.lv.textContent !== lv) m.lv.textContent = lv;
    });
  }

  update(dt: number, player: Actor, combat: Combat, enemies: readonly Actor[], proj: Projector, time: number, team: readonly Actor[] = [player]): void {
    this.updateTeam(team, player);
    if (player.pokemon !== this.mon || (player.pokemon && player.pokemon.movesVersion !== this.movesVersion)) {
      this.rebuild(player);
      this.movesVersion = player.pokemon?.movesVersion ?? 0;
    }
    const mon = this.mon;
    this.root.hidden = !mon;
    this.ko.classList.toggle('shown', player.deathT >= 0);
    if (!mon) return;
    if (this.name.querySelector('.lv')!.textContent !== `N.${mon.level}`) this.name.querySelector('.lv')!.textContent = `N.${mon.level}`;

    // PV : vert au-dessus de 50 %, jaune jusqu'à 25 %, rouge en dessous ; le fantôme rattrape.
    const ratio = mon.hp / mon.maxHp;
    this.hpFill.style.setProperty('--v', `${ratio * 100}%`);
    this.hpFill.dataset.band = ratio > 0.5 ? 'g' : ratio > 0.25 ? 'y' : 'r';
    this.ghost = Math.max(ratio, this.ghost - GHOST_SPEED * dt);
    this.hpGhost.style.setProperty('--v', `${this.ghost * 100}%`);
    this.hpText.textContent = `${mon.hp} / ${mon.maxHp}`;
    this.xpFill.style.setProperty('--v', `${mon.xpRatio * 100}%`);
    this.xpText.textContent = `${Math.floor(mon.xpRatio * 100)} %`;

    // Ultime : jauge à la couleur de la bombe, dorée une fois pleine (touche R).
    const boons = combat.run?.boons;
    this.ult.hidden = !boons?.ult;
    if (boons?.ult) {
      const full = boons.ultGauge >= ULT_MAX;
      const d = DONORS[boons.ult];
      this.ult.classList.toggle('full', full);
      this.ultFill.style.width = `${(boons.ultGauge / ULT_MAX) * 100}%`;
      this.ultLabel.textContent = full ? `${d.sym} ${d.ult} — R` : `${d.sym} ${d.ult} · ${Math.floor((boons.ultGauge / ULT_MAX) * 100)} %`;
    }
    // Bonus et statut à côté des dashs : vert en hausse, brique en baisse, statut à sa couleur.
    const chips: [string, string, string?][] = buffTexts(mon).map((t) => [t, t.startsWith('−') ? 'down' : '']);
    if (mon.status) chips.unshift([STATUS[mon.status].label, 'status', STATUS[mon.status].color]);
    if (player.protectT > 0) chips.unshift(['ABRI', '']);
    const buffKey = chips.map((c) => c[0]).join('|');
    if (buffKey !== this.buffKey) {
      this.buffKey = buffKey;
      this.buffs.replaceChildren(
        ...chips.map(([t, cls, c]) => {
          const s = el('span', cls, undefined, t);
          if (c) s.style.setProperty('--c', c);
          return s;
        }),
      );
    }
    this.danger.style.opacity = ratio <= 0.25 && ratio > 0 ? String(0.55 + 0.25 * Math.sin(time * 4)) : '0';

    // Dashs : une pastille par charge, celle qui recharge se remplit d'encre.
    if (this.dash.childElementCount !== player.dashMax) {
      this.dash.replaceChildren(...Array.from({ length: player.dashMax }, () => el('i', '')));
    }
    [...this.dash.children].forEach((c, i) => {
      const f = i < player.dashCharges ? 1 : i === player.dashCharges ? player.dashRecharge / DASH_RECHARGE : 0;
      (c as HTMLElement).style.setProperty('--f', f.toFixed(3));
    });

    this.slots.forEach((s, i) => {
      s.el.classList.toggle('selected', i === combat.selected);
      const r = combat.moveCd[i] / combat.moveCdMax[i];
      s.veil.style.height = `${Math.max(0, Math.min(1, r)) * 100}%`;
      s.cross.hidden = !mon.moves[i] || combat.ready(i);
    });

    // Combo : « combo ×n », qui grossit puis revient à sa taille ; le finisher s'efface ensuite.
    if (combat.comboStep !== this.lastCombo) {
      this.lastCombo = combat.comboStep;
      this.comboAge = 0;
      const step = combat.comboStep;
      if (step >= 2) {
        const b = el('b', '', undefined, `×${step}${step === 3 ? ' !' : ''}`);
        this.combo.replaceChildren(el('span', '', undefined, 'combo'), b);
      } else this.combo.replaceChildren();
    }
    this.comboAge += dt;
    const fin = combat.comboStep === 3;
    const pop = Math.max(0, 1 - this.comboAge / 0.18);
    this.combo.style.transform = `scale(${1 + (fin ? 0.5 : 0.25) * pop})`;
    this.combo.style.opacity = fin ? String(Math.max(0, 1 - Math.max(0, this.comboAge - 0.35) / 0.25)) : '1';

    // Étiquettes au-dessus des sauvages : statut (BRÛ, PSN…) et bonus d'un soutien (« +25% ATT »).
    const seen = new Set<Actor>();
    for (const e of enemies) {
      const st = e.pokemon?.status;
      const buffs = [...(e.pokemon?.buffs.keys() ?? [])];
      if ((!st && !buffs.length) || e.deathT >= 0 || e.hidden) continue;
      seen.add(e);
      let tag = this.tags.get(e);
      if (!tag) {
        tag = el('div', 'status-tag', this.tagLayer);
        this.tags.set(e, tag);
      }
      tag.textContent = [st ? STATUS[st].label : '', ...buffTexts(e.pokemon!)].filter(Boolean).join('  ');
      tag.style.setProperty('--c', st ? STATUS[st].color : '#ffd959');
      // Au-dessus de la tête et de la barre de vie (hauteur du corps, ×1,35 ou ×1,7 pour un champion).
      const body = e.sheet ? ((e.sheet.footRow + 1 - e.sheet.topRow) / 16) * (e.role === 'boss' ? 1.7 : e.role === 'champion' ? 1.35 : 1) : 1.2;
      const p = proj.toCss(e.x, e.y - body - 0.85);
      tag.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
    }
    for (const [a, tag] of this.tags) {
      if (seen.has(a)) continue;
      tag.remove();
      this.tags.delete(a);
    }
  }
}
