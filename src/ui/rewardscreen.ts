import { sfx } from '../audio/audio';
import { BOONS, DONORS, RARITY_COLOR, RARITY_NAME, STAT_BOONS, valueText, type BoonCard, type BoonOffer, type DonorId } from '../combat/boons';
import type { Move } from '../combat/moves';
import type { Pokemon } from '../combat/pokemon';
import { typeColor } from '../render/combatfx';
import { canUpgrade, MOVE_SLOTS, UPGRADE_PCT, type SkillOffer } from '../run/rewards';
import { typePill } from './hud';
import { curve, halves, spray } from './spray';

// Écran de récompense (dons de légendaires, nouvelle attaque), d'après
// BoutiqueScreen.gd, dans la DA « Tag sacré » (src/ui/da.css, planche
// ui-r4.html) : la moitié gauche peinte à la bombe à la couleur du dieu (ou
// du type du Pokémon), qui rejoint en douceur l'écran sombre de droite ; à
// gauche « Pour qui ? », l'équipe ; puis l'illustration en sticker, sur le
// sceau d'un dieu ou dans l'aura de son type pour un Pokémon ; à droite le
// titre et les cartes, sur bandes de papier.
//
// Le jeu se fige tant que l'écran est ouvert. On choisit au clic, aux flèches
// puis Entrée, ou directement avec 1, 2, 3… ; Tab change de Pokémon ; Échap
// ferme sans rien prendre (la récompense reste au centre de la salle et se
// rouvre avec E).
//
// Écart voulu avec le jeu : la valeur chiffrée de chaque don est affichée (le
// jeu ne la montrait que pour les dons de statistique). La colonne « Pour
// qui ? » reprend celle du jeu : pour une nouvelle attaque, choisir un autre
// Pokémon redessine l'écran avec ses propres attaques à apprendre ou
// renforcer ; pour un don, les dons de la run valent pour toute l'équipe (le
// choix ne fait que désigner le porteur).

type Choice = { el: HTMLElement; pick: () => void };
/** « Nouvelle attaque » en cours : de quoi la redessiner quand on change de Pokémon. */
type SkillCtx = {
  team: Pokemon[];
  offerFor: (mon: Pokemon) => Promise<SkillOffer>;
  onLearn: (mon: Pokemon, move: Move, replace: number) => void;
  onUpgrade: (mon: Pokemon, slot: number) => void;
  onClose: () => void;
  price: number;
};

const el = (tag: string, cls: string, parent?: HTMLElement, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
};

/** Couleur de chaque légendaire pour la moitié peinte (plus parlante que celle de son type). */
const DONOR_TINT: Record<DonorId, string> = {
  electhor: '#f2c414',
  sulfura: '#f08030',
  artikodin: '#5bc8d8',
  mew: '#ff8ac8',
  darkrai: '#6a3fc1',
  groudon: '#d0603a',
  celebi: '#5fb83e',
  hooh: '#ff9a2a',
  rayquaza: '#2f9d6a',
  jirachi: '#e8c23a',
};

/**
 * Le trait de bombe qui sépare les deux moitiés (repère 160 × 90) : assez à
 * droite pour que l'illustration reste dans la moitié peinte, assez à gauche
 * pour ne pas toucher le kicker.
 */
const SLASH = [78, -4, 73, 28, 67, 58, 57, 96];
const BALL_X = '<svg class="da-ballx" viewBox="0 0 40 40"><circle cx="20" cy="20" r="15"/><path d="M5 20 H35"/><circle cx="20" cy="20" r="4.5"/><path class="x" d="M6 6 L34 34 M34 6 L6 34"/></svg>';
const SIGIL = '<div class="sigil"><i class="rays"></i><i class="ring"></i><i class="ring2"></i></div>';

/**
 * Particules d'aura par type : de vraies particules, jamais des pictogrammes.
 * `at` : où elles naissent — autour du Pokémon, en bas (elles montent) ou en
 * haut (elles tombent).
 */
type Fx = { cls: string; n: number; at: 'ring' | 'rise' | 'fall'; glyph?: string };
const LEAF = '<svg viewBox="0 0 20 10"><path d="M1 5 Q10 -3 19 5 Q10 13 1 5Z"/><path class="vein" d="M2 5 H17"/></svg>';
const FX: Record<string, Fx> = {
  electric: { cls: 'fx-electric', n: 9, at: 'ring' },
  fire: { cls: 'fx-fire', n: 9, at: 'rise' },
  water: { cls: 'fx-bubble', n: 8, at: 'rise' },
  poison: { cls: 'fx-bubble', n: 8, at: 'rise' },
  grass: { cls: 'fx-leaf', n: 6, at: 'fall', glyph: LEAF },
  bug: { cls: 'fx-leaf', n: 6, at: 'fall', glyph: LEAF },
  ice: { cls: 'fx-crystal', n: 9, at: 'fall' },
  steel: { cls: 'fx-crystal', n: 9, at: 'fall' },
};
const MOTES: Fx = { cls: 'fx-mote', n: 9, at: 'rise' };

/** Arc électrique : une ligne brisée tirée d'une graine fixe. */
function arc(i: number): string {
  const pts = [[0, 5]];
  for (let k = 1; k < 6; k++) pts.push([k * 4, 5 + (((i * 7 + k * 13) % 9) - 4) * 0.9]);
  pts.push([24, 5]);
  return `<svg viewBox="0 0 24 10"><polyline points="${pts.map((p) => p.join(',')).join(' ')}"/></svg>`;
}

/** L'aura d'un Pokémon : une lueur de son type qui respire, et ses particules. */
function aura(type: string): string {
  const fx = FX[type] ?? MOTES;
  const at = (i: number, n: number) => {
    const a = (i / n) * Math.PI * 2 + 0.4;
    if (fx.at === 'ring') return [50 + 34 * Math.cos(a), 50 + 34 * Math.sin(a)];
    if (fx.at === 'rise') return [20 + ((i * 61) % 60), 60 + ((i * 17) % 16)];
    return [18 + ((i * 53) % 64), 8 + ((i * 13) % 16)];
  };
  const parts = Array.from({ length: fx.n }, (_, i) => {
    const [x, y] = at(i, fx.n);
    return `<i class="spark" style="--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--d:${((i * 0.37) % 2.4).toFixed(2)}s">${fx.glyph ?? ''}</i>`;
  });
  // Électrik : quelques arcs qui claquent entre les étincelles.
  if (fx.cls === 'fx-electric') {
    for (let i = 0; i < 4; i++) {
      const [x, y] = at(i * 2 + 1, 8);
      parts.push(`<i class="arc" style="--x:${(x - 6).toFixed(1)}%;--y:${y.toFixed(1)}%;--r:${(i * 47) % 180}deg;--d:${(0.3 + i * 0.55).toFixed(2)}s">${arc(i)}</i>`);
    }
  }
  return `<div class="aura ${fx.cls}" style="--t:${typeColor(type)}">${parts.join('')}</div>`;
}

const artUrl = (dex: number) => `/game/artwork/${dex}.png`;

export class RewardScreen {
  private readonly root: HTMLElement;
  private choices: Choice[] = [];
  private focus = 0;
  private onClose: (() => void) | null = null;
  /** Le Pokémon choisi dans « Pour qui ? ». */
  private sel = 0;
  private picks: HTMLElement[] = [];
  private skill: SkillCtx | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'reward', parent);
    this.root.hidden = true;
    // En capture : l'écran ouvert, le jeu ne reçoit aucune touche.
    addEventListener(
      'keydown',
      (e) => {
        if (this.root.hidden) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        const n = Number(e.key);
        if (n >= 1 && n <= this.choices.length) this.choices[n - 1].pick();
        else if (e.code === 'ArrowDown' || e.code === 'ArrowRight') this.setFocus(this.focus + 1);
        else if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') this.setFocus(this.focus - 1);
        else if (e.code === 'Tab') this.select(this.sel + 1);
        else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') this.choices[this.focus]?.pick();
        else if (e.code === 'Escape') this.close();
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
    this.skill = null;
    const done = this.onClose;
    this.onClose = null;
    done?.();
  }

  /**
   * Charpente commune : la moitié peinte, « Pour qui ? », l'illustration et
   * son halo, l'en-tête et la liste où poser les cartes (rendue).
   */
  private frame(o: { tint: string; art: number; halo: string; kicker: string; title: string; line: string; team: Pokemon[]; onClose: () => void }): HTMLElement {
    this.root.replaceChildren();
    this.root.classList.remove('play');
    this.root.hidden = false;
    this.choices = [];
    this.focus = 0;
    this.onClose = o.onClose;
    this.sel = Math.min(this.sel, Math.max(0, o.team.length - 1));
    const team = o.team;

    const h = halves(SLASH);
    const top = el('div', 'rw-half top', this.root);
    top.style.cssText = `--tint:${o.tint};--clip:${h.left};--clip0:${h.left0}`;
    el('div', 'rw-half bot', this.root).style.setProperty('--clip', h.right);
    el('div', 'rw-slash', this.root).innerHTML = spray({ ...curve(SLASH), color: o.tint, width: 3, drips: 6, dripMax: 3, dots: 24, seed: 23, cls: 'soft' });
    const tag = el('div', 'rw-walltag', this.root);
    tag.innerHTML = 'ni maître<br />ni Ball';
    el('div', 'rw-ballx', this.root).innerHTML = BALL_X;

    // Pour qui ? L'équipe, le Pokémon choisi en avant.
    const pick = el('div', 'rw-pick', this.root);
    el('div', 'lbl', pick, 'Pour qui ?');
    this.picks = o.team.map((mon, i) => {
      const m = el('div', 'mon da-paper', pick);
      const img = el('img', '', m) as HTMLImageElement;
      img.src = artUrl(mon.id);
      img.alt = '';
      const body = el('div', '', m);
      el('b', '', body, mon.name);
      el('small', '', body, `N.${mon.level} · ${mon.hp} / ${mon.maxHp} PV`);
      m.addEventListener('click', () => this.select(i));
      return m;
    });
    if (team.length > 1) el('div', 'keys', pick, 'Clique un Pokémon (ou Tab) pour en changer');
    this.highlight();

    const boon = el('div', 'rw-boon', this.root);
    const art = el('div', 'rw-art', boon);
    art.innerHTML = o.halo;
    const img = el('img', '', art) as HTMLImageElement;
    img.src = artUrl(o.art);
    img.alt = '';
    const text = el('div', 'rw-text', boon);
    el('div', 'rw-kicker', text, o.kicker);
    el('h2', 'rw-title', text, o.title);
    el('p', 'rw-quote', text, o.line);
    const list = el('div', 'rw-cards', text);
    el('p', 'rw-keys', text, 'Clic, chiffre de la carte, ou ↑ ↓ puis Entrée · Échap : plus tard (la récompense reste là)');
    // L'ouverture se joue une fois la charpente posée (les cartes arrivent l'une après l'autre).
    requestAnimationFrame(() => this.root.classList.add('play'));
    return list;
  }

  /** Change de Pokémon : pour une nouvelle attaque, l'écran se redessine avec ses attaques à lui. */
  private select(i: number): void {
    if (this.picks.length < 2) return;
    this.sel = (i + this.picks.length) % this.picks.length;
    this.highlight();
    const ctx = this.skill;
    if (ctx) {
      const mon = ctx.team[this.sel];
      void ctx.offerFor(mon).then((offer) => {
        if (this.skill === ctx && ctx.team[this.sel] === mon) this.renderSkill(mon, offer);
      });
    }
  }

  private highlight(): void {
    this.picks.forEach((p, j) => p.classList.toggle('sel', j === this.sel));
  }

  private addChoice(card: HTMLElement, pick: () => void): void {
    const i = this.choices.length;
    el('span', 'rw-num', card, String(i + 1));
    card.style.setProperty('--i', String(i));
    this.choices.push({ el: card, pick });
    card.addEventListener('mouseenter', () => this.setFocus(i));
    card.addEventListener('click', () => pick());
    this.setFocus(this.focus);
  }

  private setFocus(i: number): void {
    if (!this.choices.length) return;
    this.focus = (i + this.choices.length) % this.choices.length;
    this.choices.forEach((c, j) => c.el.classList.toggle('focus', j === this.focus));
  }

  /**
   * Une carte : pictogramme, une ligne de titre (le nom, son étiquette — rareté
   * ou type —, la portée en petit), la description, la valeur sur étiquette.
   */
  private card(list: HTMLElement, o: { color: string; icon: string; name: string; tag?: HTMLElement; scope?: string; act?: string; desc: string; value?: string; valueLabel?: string; upgrade?: boolean }): HTMLElement {
    const c = el('div', `rw-card da-paper${o.upgrade ? ' upgrade' : ''}`, list);
    el('div', 'rw-icon', c, o.icon).style.setProperty('--c', o.color);
    const body = el('div', 'rw-body', c);
    const head = el('div', 'rw-head', body);
    el('span', 'rw-cname', head, o.name);
    if (o.tag) head.append(o.tag);
    if (o.scope) el('small', '', head, o.scope);
    const desc = el('div', 'rw-desc', body);
    if (o.act) el('span', 'act', desc, o.act);
    desc.append(o.desc);
    if (o.value) {
      const v = el('div', 'da-stamp', c, o.value);
      if (o.valueLabel) el('small', '', v, o.valueLabel);
    }
    return c;
  }

  /** « Bénédiction de Darkrai » : trois cartes du même légendaire. */
  showBoons(offer: BoonOffer, onPick: (card: BoonCard) => void, onClose: () => void, team: Pokemon[] = [], sel = 0): void {
    sfx('menuOpen');
    this.skill = null;
    this.sel = sel;
    const donor = DONORS[offer.donor];
    const list = this.frame({
      tint: DONOR_TINT[offer.donor],
      art: donor.dex,
      halo: SIGIL,
      kicker: 'Bénédiction de',
      title: donor.name,
      line: `« ${donor.line} »`,
      team,
      onClose,
    });
    for (const card of offer.cards) {
      const ult = card.id.startsWith('__ult__');
      const def = BOONS[card.id];
      const stat = STAT_BOONS[card.id];
      const rarity = ult ? 'Ultime' : def?.duo ? `Duo · ${RARITY_NAME[card.result]}` : RARITY_NAME[card.result];
      // Couleur de rareté assombrie : lisible au feutre sur le papier.
      const rar = el('span', 'rw-rar', undefined, card.result > card.rarity && !ult ? `${rarity} ↑` : rarity);
      rar.style.setProperty('--c', `color-mix(in srgb, ${ult || def?.duo ? RARITY_COLOR[3] : RARITY_COLOR[card.result]} 70%, #000)`);
      const scope = ult ? 'Touche R' : def?.duo ? `${DONORS[def.duo[0]].name} + ${DONORS[def.duo[1]].name}` : def?.scope === 'T' ? 'Toute l’équipe' : 'Ton Pokémon';
      // Valeur mise en avant : « 40 % », « rayon 4,5 cases »… ; un don de stat montre son gain.
      const value = ult ? '' : stat ? stat.label.replace(/^.* (\S+ \S+)$/, '$1') : valueText(card.id, card.result);
      const c = this.card(list, {
        color: typeColor(donor.type),
        icon: ult ? '⚡' : def?.duo ? '✧' : donor.sym,
        name: ult ? donor.ult : (def?.name ?? card.id),
        tag: rar,
        scope,
        desc: ult ? ultDesc(offer.donor) : (def?.desc ?? ''),
        value,
        valueLabel: stat ? stat.label.replace(/ \S+ \S+$/, '') : value ? 'valeur' : undefined,
      });
      this.addChoice(c, () => {
        this.onClose = null;
        this.close();
        onPick(card);
      });
    }
  }

  /**
   * « Une nouvelle attaque » : apprendre une attaque forte, ou en renforcer
   * une, pour le Pokémon choisi dans « Pour qui ? » (`sel` au départ). Les 4
   * emplacements pleins, on choisit laquelle oublier.
   */
  showSkill(
    team: Pokemon[],
    sel: number,
    offerFor: (mon: Pokemon) => Promise<SkillOffer>,
    onLearn: (mon: Pokemon, move: Move, replace: number) => void,
    onUpgrade: (mon: Pokemon, slot: number) => void,
    onClose: () => void,
    price = 0,
  ): void {
    const ctx: SkillCtx = { team, offerFor, onLearn, onUpgrade, onClose, price };
    sfx('menuOpen');
    this.skill = ctx;
    this.sel = sel;
    const mon = team[sel];
    void offerFor(mon).then((offer) => {
      if (this.skill === ctx) this.renderSkill(mon, offer);
    });
  }

  private renderSkill(mon: Pokemon, offer: SkillOffer): void {
    const { team, onLearn, onUpgrade, onClose, price } = this.skill!;
    const list = this.frame({
      tint: typeColor(mon.types[0]),
      art: mon.id,
      halo: aura(mon.types[0]),
      kicker: price ? 'Le marchand propose' : 'Récompense',
      title: 'Une nouvelle attaque',
      line: price ? `La CT du marchand : ${price} ₽ la capacité, une par visite.` : 'Le parchemin s’ouvre. Choisis ce que tu emporteras.',
      team,
      onClose,
    });
    const learnable = offer.learn.filter((m) => !mon.moves.some((x) => x.api === m.api));
    const upgrades = offer.upgrade.filter((i) => mon.moves[i] && canUpgrade(mon.moves[i]));
    if (!learnable.length && !upgrades.length) {
      el('p', 'rw-empty', list, 'Rien à apprendre ni à renforcer pour ce Pokémon.');
      return;
    }
    const cost = price ? ` · ${price} ₽` : '';
    for (const m of learnable) {
      const c = this.moveCard(list, m, 'Apprendre', `${category(m)}${cost}`, String(m.power), 'puissance');
      this.addChoice(c, () => {
        if (mon.moves.length < MOVE_SLOTS) {
          this.onClose = null;
          this.close();
          onLearn(mon, m, -1);
        } else this.showReplace(mon, m, onLearn, () => this.renderSkill(mon, offer));
      });
    }
    upgrades.forEach((i, k) => {
      const m = mon.moves[i];
      const c = this.moveCard(list, m, `Renforcer +${Math.round(UPGRADE_PCT * 100)} %`, `Déjà connue · frappe plus fort${cost}`, `${m.power} → ${Math.ceil(m.power * (1 + UPGRADE_PCT))}`, 'puissance');
      // Un peu à l'écart des attaques à apprendre.
      if (k === 0 && learnable.length) c.classList.add('upgrade');
      this.addChoice(c, () => {
        this.onClose = null;
        this.close();
        onUpgrade(mon, i);
      });
    });
  }

  private showReplace(mon: Pokemon, incoming: Move, onLearn: (mon: Pokemon, move: Move, replace: number) => void, back: () => void): void {
    const prevClose = this.onClose;
    // Échap ferme tout l'écran, comme ailleurs ; « Garder mes attaques » revient au choix précédent.
    const list = this.frame({
      tint: typeColor(mon.types[0]),
      art: mon.id,
      halo: aura(mon.types[0]),
      kicker: `Apprendre ${incoming.name}`,
      title: 'Quelle attaque oublier ?',
      line: `Une place doit se libérer pour ${incoming.name}. Laquelle abandonnes-tu ?`,
      team: this.skill?.team ?? [mon],
      onClose: prevClose ?? (() => {}),
    });
    mon.moves.forEach((m, i) => {
      const c = this.moveCard(list, m, 'Oublier', m.power > 0 ? category(m) : 'Capacité de statut', m.power > 0 ? String(m.power) : '—', 'puissance');
      this.addChoice(c, () => {
        this.onClose = null;
        this.close();
        onLearn(mon, incoming, i);
      });
    });
    const cancel = this.card(list, { color: '#8a7a66', icon: '↩', name: 'Garder mes attaques', desc: 'Revenir au choix précédent.', upgrade: true });
    this.addChoice(cancel, () => {
      this.onClose = prevClose;
      back();
    });
  }

  /** Carte d'attaque : le type en pastille collé au nom, l'action sur ruban noir. */
  private moveCard(list: HTMLElement, m: Move, act: string, desc: string, value: string, valueLabel: string): HTMLElement {
    return this.card(list, {
      color: typeColor(m.type),
      icon: m.name.slice(0, 1).toUpperCase(),
      name: m.name,
      tag: typePill(m.type),
      scope: m.upgrades ? `renforcée ×${m.upgrades}` : undefined,
      act,
      desc,
      value,
      valueLabel,
    });
  }
}

/** « Spéciale · attaque à distance », « Physique · attaque au contact ». */
function category(m: Move): string {
  return m.damageClass === 'special' ? 'Spéciale · attaque à distance' : 'Physique · attaque au contact';
}

/** Effet de chaque ultime, en une ligne (CombatArena._play_ultimate). */
function ultDesc(donor: DonorId): string {
  const lines: Record<DonorId, string> = {
    electhor: 'Foudroie tous les ennemis et les paralyse.',
    sulfura: 'Embrase tous les ennemis.',
    artikodin: 'Gèle tous les ennemis.',
    mew: 'Relance trois fois ton attaque sélectionnée.',
    darkrai: 'Attire les ennemis à toi et les endort.',
    groudon: 'Frappe tout le monde et projette au loin.',
    celebi: 'Ralentit presque à l’arrêt tous les ennemis pendant 4 s.',
    hooh: 'Embrase tous les ennemis et te soigne entièrement.',
    rayquaza: 'Frappe très fort tout un couloir devant toi.',
    jirachi: 'Frappe tous les ennemis et rapporte des ₽.',
  };
  return `${lines[donor]} Se charge en frappant et en encaissant.`;
}
