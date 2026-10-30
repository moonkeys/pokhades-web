import { loadMove, type Move } from '../combat/moves';
import { BASE_TEAM_LEVEL, Pokemon } from '../combat/pokemon';
import { sheetOf } from '../data/bestiary';
import { PLAYER_SPECIES } from '../data/species';
import { BUILDINGS, CANDY, CS_LIST, HELD_ITEMS, STAT_FR, TMS, UPGRADES, heldItem, teamSlots, type HeldItem, type Upgrade } from '../meta/catalog';
import { level, startLevel, type Save } from '../meta/save';
import { typeColor } from '../render/combatfx';
import { STATIONS, type Station } from '../run/camp';
import { moveInfo, typePill } from './hud';

// Écrans des postes du Repaire, dans la DA « Tag sacré » : à gauche le gardien
// du poste en grand (son illustration détourée de blanc), son rôle au
// marqueur et le nom du poste ; à droite, sur des bandes de papier, ce qu'il
// propose. Les Baies en haut à droite. Le jeu se fige tant qu'un écran est
// ouvert (main.ts) ; Échap ferme (d'abord la fenêtre ouverte par-dessus).
//
// - CT (M. Mime) : achat définitif d'une CT ; un clic ouvre sa fiche et les
//   Pokémon libérés qui peuvent l'apprendre (MoveShopScreen) ;
// - Équipe (Porygon) : on glisse les Pokémon dans l'équipe, hors d'elle ou à
//   une autre place (le premier mène), et les attaques dans leurs quatre
//   emplacements ; la fiche montre les statistiques de tout Pokémon cliqué,
//   même resté au camp (PokedexScreen, partie équipe) ;
// - Améliorations (Alakazam) : améliorations permanentes, capacités spéciales
//   (Surf, pour l'instant), objets tenus et Super Bonbons (UpgradeShopScreen,
//   ShopScreen, GromagoShopScreen réunis) ;
// - Aménagements (Ossatueur) : ce que le camp peut bâtir (BuilderScreen) ;
// - En ligne (Roucarnage) : héberger ou rejoindre une partie, à venir ;
// - Départ (Dracolosse) : la prochaine run, l'équipe et ce qu'elle emporte.

export interface CampCtx {
  save: Save;
  /** Enregistre la progression (et rafraîchit les Baies affichées). */
  persist(): void;
  /** L'équipe a changé : le camp et les Pokémon qui suivent le joueur se recomposent. */
  teamChanged(): void;
  depart(): void;
  notify(title: string, text: string, art?: number): void;
  /** Ce qui attend à la prochaine run : biome du premier acte, sa couleur, et son champion. */
  preview(): { biome: string; color: string; champion: string; champType: string };
}

/** Fiche d'espèce embarquée (data/pokeapi/pokemon) : ce que l'écran d'équipe et le tuteur en lisent. */
interface SpeciesData {
  id: number;
  name: string;
  types: string[];
  levelUp: { level: number; name: string }[];
  learnable: Set<string>;
}

const speciesCache = new Map<number, Promise<SpeciesData>>();
function species(id: number): Promise<SpeciesData> {
  let p = speciesCache.get(id);
  if (!p) {
    p = fetch(`/game/data/pokeapi/pokemon/${id}.json`)
      .then((r) => r.json())
      .then((d: { name_fr?: string; types?: string[]; level_up_moves?: { level: number; name: string }[]; learnable_moves?: string[] }) => ({
        id,
        name: d.name_fr ?? `#${id}`,
        types: d.types ?? ['normal'],
        levelUp: d.level_up_moves ?? [],
        learnable: new Set(d.learnable_moves ?? []),
      }));
    speciesCache.set(id, p);
  }
  return p;
}
const moveCache = new Map<string, Promise<Move | null>>();
function move(api: string): Promise<Move | null> {
  let p = moveCache.get(api);
  if (!p) moveCache.set(api, (p = loadMove(api, 0)));
  return p;
}

/**
 * Attaques qu'un Pokémon peut équiper au départ : celles apprises jusqu'à son
 * niveau de départ, plus les CT achetées qu'il sait apprendre
 * (PokedexScreen._move_options).
 */
export async function movePool(id: number, save: Save): Promise<Move[]> {
  const sp = await species(id);
  const lvl = startLevel(save, id, BASE_TEAM_LEVEL);
  const names = [...new Set([...sp.levelUp.filter((m) => m.level <= lvl).map((m) => m.name), ...save.tms.filter((t) => sp.learnable.has(t)), ...(sheetOf(id)?.moves ?? [])])];
  return (await Promise.all(names.map(move))).filter((m): m is Move => !!m);
}

/**
 * Les attaques équipées : le choix enregistré, sinon celles que le bestiaire
 * impose à l'espèce, sinon le jeu de départ du jeu (les CT s'équipent à la main).
 */
async function loadout(id: number, save: Save, pool: readonly Move[]): Promise<string[]> {
  const sp = await species(id);
  const lvl = startLevel(save, id, BASE_TEAM_LEVEL);
  const learned = pool.filter((m) => sp.levelUp.some((l) => l.name === m.api && l.level <= lvl));
  return (save.loadouts[id] ?? sheetOf(id)?.moves ?? defaultLoadout(learned)).filter((api) => pool.some((m) => m.api === api));
}

const el = (tag: string, cls: string, parent?: HTMLElement, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
};
const icon = (name: string, parent: HTMLElement, cls = 'cs-icon') => {
  const img = el('img', cls, parent) as HTMLImageElement;
  img.src = `/game/assets/essentials/items/${name}.png`;
  img.alt = '';
  img.draggable = false;
  return img;
};
const art = (id: number, parent: HTMLElement, cls = '') => {
  const img = el('img', cls, parent) as HTMLImageElement;
  img.src = `/game/artwork/${id}.png`;
  img.alt = '';
  img.draggable = false;
  return img;
};

/** Couleur de chaque poste : le liseré de l'écran et l'ombre du titre. */
const TINT: Record<Station, string> = { start: '#ff7a2a', moves: '#b88ceb', team: '#3ab0e0', upgrades: '#ffd23f', builder: '#c8963c', online: '#7ac0e8' };

/**
 * Ce qui se choisit au clavier, dans l'ordre de l'écran : onglets, cartes,
 * Pokémon, attaques, objets, boutons. Fenêtre ouverte par-dessus : elle seule.
 */
const NAV = '.cs-tabs button, .cs-card:not(.soon), .cs-slot.da-paper, .cs-chip, .cs-move, .cs-items button, .cs-candy button:not(:disabled), .cs-go';
const NAV_MODAL = '.cs-modal .cs-buy:not(:disabled), .cs-modal .cs-close';
const ARROWS: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

/** Ce qu'on glisse dans l'écran d'équipe : un Pokémon (de l'équipe ou du camp) ou une attaque. */
type Drag = { kind: 'mon'; id: number; from: 'team' | 'bench' } | { kind: 'move'; api: string; from: 'slot' | 'pool' };

export class CampScreen {
  open = false;
  private root: HTMLElement | null = null;
  private station: Station = 'start';
  private ctx: CampCtx | null = null;
  private onClose: () => void = () => {};
  /** Écran d'équipe : le Pokémon dont on lit la fiche (de l'équipe ou resté au camp). */
  private selId = 0;
  /** Améliorations : onglet affiché. */
  private tab: 'upgrades' | 'cs' | 'items' = 'upgrades';
  /** CT dont la fiche est ouverte par-dessus l'écran. */
  private modal: string | null = null;
  private drag: Drag | null = null;
  /** Rendu en cours : un rendu asynchrone plus ancien ne doit pas écraser le dernier. */
  private ticket = 0;
  /** Élément choisi au clavier (rang dans NAV), -1 tant qu'on n'a pas touché aux flèches. */
  private navIndex = -1;
  private readonly keys = (e: KeyboardEvent) => {
    if (!this.open) return;
    const arrow = ARROWS[e.code];
    if (arrow) {
      e.preventDefault();
      e.stopPropagation();
      this.moveFocus(arrow[0], arrow[1]);
    } else if (e.code === 'Escape') {
      e.preventDefault();
      if (this.modal) {
        this.modal = null;
        void this.render();
      } else this.close();
    } else if ((e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Space') && this.navIndex >= 0 && this.navEls()[this.navIndex]) {
      e.preventDefault();
      e.stopPropagation();
      this.activate(this.navEls()[this.navIndex]);
    } else if (this.station === 'start' && (e.code === 'Enter' || e.code === 'KeyE')) {
      e.preventDefault();
      this.depart();
    }
  };

  constructor(private readonly parent: HTMLElement) {
    addEventListener('keydown', this.keys, true);
  }

  show(station: Station, ctx: CampCtx, onClose: () => void): void {
    this.close();
    this.open = true;
    this.station = station;
    this.ctx = ctx;
    this.onClose = onClose;
    this.selId = ctx.save.team[0];
    this.modal = null;
    this.navIndex = -1;
    const root = el('div', 'camp-screen play', this.parent);
    root.style.setProperty('--tint', TINT[station]);
    this.root = root;
    void this.render();
    // La première image joue l'entrée ; les suivantes (achats, choix) se redessinent sans elle.
    setTimeout(() => root.classList.remove('play'), 900);
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.root?.remove();
    this.root = null;
    this.onClose();
  }

  private depart(): void {
    const ctx = this.ctx!;
    this.open = false;
    this.root?.remove();
    this.root = null;
    ctx.depart();
  }

  private async render(): Promise<void> {
    const root = this.root;
    const ctx = this.ctx;
    if (!root || !ctx) return;
    const ticket = ++this.ticket;
    const st = STATIONS[this.station];
    const page = document.createElement('div');
    page.className = 'cs-page';
    const side = el('div', 'cs-side', page);
    art(st.id, side, 'cs-art');
    el('div', 'cs-kicker', side, st.kicker);
    // (Les noms longs — « Aménagements », « Améliorations » — tiendraient mal dans le volet au corps plein.)
    el('h1', `cs-title${st.title.length > 10 ? ' long' : ''}`, side, st.title);
    const main = el('div', 'cs-main', page);
    const purse = el('div', 'da-stamp cs-purse', page);
    purse.innerHTML = `${ctx.save.baies}<small>Baies</small>`;
    el('div', 'cs-keys', page, this.station === 'start' ? 'Entrée : partir · Échap : rester au camp' : this.station === 'team' ? 'Glisser-déposer ou flèches + Entrée (deux fois : entrer, sortir de l’équipe) · Échap : fermer' : 'Flèches + Entrée, ou clic : choisir · Échap : fermer');
    const close = el('button', 'cs-close', page, '✕');
    close.addEventListener('click', () => this.close());

    if (this.station === 'moves') await this.renderMoves(main, page, ctx);
    else if (this.station === 'upgrades') this.renderUpgrades(main, ctx);
    else if (this.station === 'team') await this.renderTeam(main, ctx);
    else if (this.station === 'builder') this.renderBuilder(main, ctx);
    else if (this.station === 'online') this.renderOnline(main);
    else this.renderStart(main, ctx);
    if (ticket !== this.ticket || this.root !== root) return;
    // Garde le défilement de la colonne de droite d'un rendu à l'autre.
    const scroll = root.querySelector('.cs-main')?.scrollTop ?? 0;
    root.replaceChildren(page);
    main.scrollTop = scroll;
    this.showFocus();
  }

  // ── Clavier ──────────────────────────────────────────────────────────
  private navEls(): HTMLElement[] {
    return [...(this.root?.querySelectorAll<HTMLElement>(this.modal ? NAV_MODAL : NAV) ?? [])];
  }

  /**
   * Le focus va à l'élément le plus proche dans la direction des flèches,
   * d'abord parmi ceux de la même rangée (ou colonne) : à droite d'une carte,
   * sa voisine passe avant un onglet plus haut, même un peu plus près.
   */
  private moveFocus(dx: number, dy: number): void {
    const els = this.navEls();
    if (!els.length) return;
    const cur = els[this.navIndex];
    if (!cur) {
      this.navIndex = 0;
      return this.showFocus();
    }
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let best = -1;
    let bestScore = Infinity;
    els.forEach((el, i) => {
      if (el === cur) return;
      const q = el.getBoundingClientRect();
      const ax = q.left + q.width / 2 - cx;
      const ay = q.top + q.height / 2 - cy;
      const along = ax * dx + ay * dy;
      if (along <= 4) return;
      const across = Math.abs(ax * dy - ay * dx);
      const aligned = dx ? q.top < r.bottom && q.bottom > r.top : q.left < r.right && q.right > r.left;
      const score = (aligned ? 0 : 10000) + along + across * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0) this.navIndex = best;
    this.showFocus();
  }

  private showFocus(): void {
    for (const el of this.root?.querySelectorAll('.nav-focus') ?? []) el.classList.remove('nav-focus');
    if (this.navIndex < 0) return;
    const els = this.navEls();
    this.navIndex = Math.min(this.navIndex, els.length - 1);
    const el = els[this.navIndex];
    el?.classList.add('nav-focus');
    el?.scrollIntoView({ block: 'nearest' });
  }

  /** Entrée : un clic ; sur un Pokémon déjà choisi, un double-clic (il entre dans l'équipe, ou en sort). */
  private activate(el: HTMLElement): void {
    if (el.classList.contains('sel') && (el.classList.contains('cs-chip') || el.classList.contains('cs-slot'))) el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    else el.click();
  }

  private buy(price: number, then: () => void): void {
    const ctx = this.ctx!;
    if (ctx.save.baies < price) return;
    ctx.save.baies -= price;
    then();
    ctx.persist();
    void this.render();
  }

  // ── CT ───────────────────────────────────────────────────────────────
  private async renderMoves(main: HTMLElement, page: HTMLElement, ctx: CampCtx): Promise<void> {
    el('p', 'cs-quote', main, 'Une CT achetée l’est pour de bon. Clique sur une carte pour voir qui peut l’apprendre.');
    const grid = el('div', 'cs-grid', main);
    const moves = await Promise.all(TMS.map((t) => move(t.api)));
    TMS.forEach((tm, i) => {
      const m = moves[i];
      if (!m) return;
      const owned = ctx.save.tms.includes(tm.api);
      const card = el('div', `cs-card da-paper${owned ? ' owned' : ''}${!owned && ctx.save.baies < tm.price ? ' poor' : ''}`, grid);
      card.style.setProperty('--c', typeColor(m.type));
      icon(`machine_${m.type.toUpperCase()}`, card);
      const head = el('div', 'cs-head', card);
      el('b', '', head, m.name);
      typePill(m.type, head);
      el('small', 'cs-info', card, moveInfo(m));
      if (owned) el('div', 'da-tape cs-tag', card, 'Acquise');
      else el('div', 'da-stamp cs-price', card, String(tm.price));
      card.addEventListener('click', () => {
        this.modal = tm.api;
        void this.render();
      });
    });
    const tm = TMS.find((t) => t.api === this.modal);
    const m = tm && moves[TMS.indexOf(tm)];
    if (tm && m) await this.moveModal(page, ctx, tm, m);
  }

  /** Fiche d'une CT par-dessus l'écran : ce qu'elle fait, qui peut l'apprendre parmi les libérés, et l'achat. */
  private async moveModal(page: HTMLElement, ctx: CampCtx, tm: { api: string; price: number }, m: Move): Promise<void> {
    const roster = await Promise.all(PLAYER_SPECIES.map((s) => species(s.id)));
    const veil = el('div', 'cs-veil', page);
    veil.addEventListener('click', (e) => {
      if (e.target !== veil) return;
      this.modal = null;
      void this.render();
    });
    const box = el('div', 'cs-modal da-paper', veil);
    box.style.setProperty('--c', typeColor(m.type));
    icon(`machine_${m.type.toUpperCase()}`, box, 'cs-modal-icon');
    const head = el('div', 'cs-head', box);
    el('b', '', head, m.name);
    typePill(m.type, head);
    el('small', 'cs-info', box, moveInfo(m));
    const learners = roster.filter((s) => s.learnable.has(tm.api));
    el('div', 'cs-label', box, learners.length ? `Peuvent l’apprendre (${learners.length}/${roster.length} libérés)` : 'Aucun Pokémon libéré ne peut l’apprendre');
    const who = el('div', 'cs-learners', box);
    for (const s of roster) {
      const fig = el('div', s.learnable.has(tm.api) ? 'yes' : 'no', who);
      art(s.id, fig);
      el('small', '', fig, s.name);
    }
    const owned = ctx.save.tms.includes(tm.api);
    const act = el('div', 'cs-modal-act', box);
    if (owned) el('div', 'da-tape', act, 'Acquise : à équiper à la hutte');
    else {
      const b = el('button', 'cs-buy', act, `Acheter · ${tm.price} Baies`) as HTMLButtonElement;
      b.disabled = ctx.save.baies < tm.price;
      b.addEventListener('click', () =>
        this.buy(tm.price, () => {
          ctx.save.tms.push(tm.api);
          ctx.notify('CT acquise', `${m.name} : à équiper à la hutte de Porygon.`, STATIONS.moves.id);
        }),
      );
    }
    const x = el('button', 'cs-close', box, '✕');
    x.addEventListener('click', () => {
      this.modal = null;
      void this.render();
    });
  }

  // ── Améliorations ────────────────────────────────────────────────────
  private renderUpgrades(main: HTMLElement, ctx: CampCtx): void {
    const tabs = el('div', 'cs-tabs', main);
    for (const [id, label] of [
      ['upgrades', 'Améliorations'],
      ['cs', 'CS'],
      ['items', 'Objets'],
    ] as const) {
      const t = el('button', this.tab === id ? 'sel' : '', tabs, label);
      t.addEventListener('click', () => {
        this.tab = id;
        void this.render();
      });
    }
    const grid = el('div', 'cs-grid', main);
    if (this.tab === 'upgrades') for (const u of UPGRADES) this.upgradeCard(grid, u, ctx);
    else if (this.tab === 'cs') this.renderCs(grid, ctx);
    else {
      el('p', 'cs-quote wide', grid, 'Un objet tenu se donne à un Pokémon à la hutte de Porygon ; il le garde d’une run à l’autre. Un Super Bonbon s’y utilise aussi.');
      this.candyCard(grid, ctx);
      for (const it of HELD_ITEMS) this.itemCard(grid, it, ctx);
    }
  }

  private upgradeCard(grid: HTMLElement, u: Upgrade, ctx: CampCtx): void {
    const n = level(ctx.save, u.id);
    const maxed = n >= u.max;
    const price = maxed ? 0 : u.price(n);
    const card = el('div', `cs-card da-paper${maxed ? ' owned' : ctx.save.baies < price ? ' poor' : ''}`, grid);
    icon(u.icon, card);
    const head = el('div', 'cs-head', card);
    el('b', '', head, u.name);
    const base = u.id === 'slots' ? '1 Pokémon en run' : u.id === 'dash' ? '1 dash d’affilée' : '';
    el('small', 'cs-info', card, n ? `Actuel : ${u.effect(n)}` : base ? `Actuel : ${base}` : 'Pas encore acquise');
    if (!maxed) el('small', 'cs-next', card, `→ ${u.effect(n + 1)}`);
    const pips = el('div', 'cs-pips', card);
    for (let i = 0; i < u.max; i++) el('i', i < n ? 'on' : '', pips);
    if (maxed) el('div', 'da-tape cs-tag', card, 'Au max');
    else {
      el('div', 'da-stamp cs-price', card, String(price));
      card.addEventListener('click', () =>
        this.buy(price, () => {
          ctx.save.upgrades[u.id] = n + 1;
          ctx.notify('Amélioration', `${u.name} : ${u.effect(n + 1)}.`, STATIONS.upgrades.id);
        }),
      );
    }
  }

  private candyCard(grid: HTMLElement, ctx: CampCtx): void {
    const price = CANDY.price(ctx.save.candies);
    const stock = ctx.save.items['rare-candy'] ?? 0;
    const card = el('div', `cs-card da-paper${ctx.save.baies < price ? ' poor' : ''}`, grid);
    icon(CANDY.icon, card);
    el('div', 'cs-head', card).append(el('b', '', undefined, 'Super Bonbon'));
    el('small', 'cs-info', card, `+${CANDY.step} niveaux de départ pour un Pokémon (+${CANDY.max} au plus)`);
    el('small', 'cs-next', card, stock ? `En réserve : ${stock} · le prix monte à chaque achat` : 'Le prix monte à chaque achat');
    el('div', 'da-stamp cs-price', card, String(price));
    card.addEventListener('click', () =>
      this.buy(price, () => {
        ctx.save.items['rare-candy'] = stock + 1;
        ctx.save.candies++;
        ctx.notify('Super Bonbon', 'À donner à un Pokémon, à la hutte de Porygon.', STATIONS.upgrades.id);
      }),
    );
  }

  private itemCard(grid: HTMLElement, it: HeldItem, ctx: CampCtx): void {
    const owned = ctx.save.items[it.api] ?? 0;
    const card = el('div', `cs-card da-paper${ctx.save.baies < it.price ? ' poor' : ''}`, grid);
    icon(it.icon, card);
    const head = el('div', 'cs-head', card);
    el('b', '', head, it.name);
    el('small', 'cs-info', card, `${STAT_FR[it.stat]} +${Math.round((it.mult - 1) * 100)} %`);
    if (owned) el('small', 'cs-next', card, `En réserve : ${owned}`);
    el('div', 'da-stamp cs-price', card, String(it.price));
    card.addEventListener('click', () =>
      this.buy(it.price, () => {
        ctx.save.items[it.api] = owned + 1;
        ctx.notify('Objet acheté', `${it.name} : à donner à la hutte de Porygon.`, STATIONS.upgrades.id);
      }),
    );
  }

  // ── Équipe ───────────────────────────────────────────────────────────
  private async renderTeam(main: HTMLElement, ctx: CampCtx): Promise<void> {
    const save = ctx.save;
    const slots = teamSlots(level(save, 'slots'));
    if (!PLAYER_SPECIES.some((s) => s.id === this.selId)) this.selId = save.team[0];
    const id = this.selId;
    const lvl = startLevel(save, id, BASE_TEAM_LEVEL);
    const [roster, pool, data, mon] = await Promise.all([Promise.all(PLAYER_SPECIES.map((s) => species(s.id))), movePool(id, save), species(id), Pokemon.load(id, lvl, false)]);
    const equipped = await loadout(id, save, pool);
    const nameOf = (sid: number) => roster.find((s) => s.id === sid)?.name ?? `#${sid}`;
    const wrap = el('div', 'cs-team', main);

    // ── Colonne de gauche : l'équipe (places achetées), puis les Pokémon restés au camp.
    const col = el('div', 'cs-roster', wrap);
    el('div', 'cs-label', col, `Équipe ${save.team.length}/${slots}`);
    for (let i = 0; i < slots; i++) {
      const sid = save.team[i];
      const row = el('div', sid === undefined ? 'cs-slot empty' : `cs-slot da-paper${sid === id ? ' sel' : ''}`, col);
      this.dropZone(row, 'mon', (d) => this.dropMonOnSlot(d, i, slots, ctx));
      if (sid === undefined) {
        row.textContent = 'Glisse un Pokémon ici';
        continue;
      }
      art(sid, row);
      const txt = el('div', '', row);
      el('b', '', txt, nameOf(sid));
      el('small', '', txt, `${i === 0 ? '★ Mène · ' : ''}N.${startLevel(save, sid, BASE_TEAM_LEVEL)}`);
      const held = heldItem(save.held[sid]);
      if (held) icon(held.icon, row, 'cs-held');
      this.dragSource(row, { kind: 'mon', id: sid, from: 'team' });
      row.addEventListener('click', () => this.select(sid));
      // Double-clic (ou Entrée une seconde fois) : il reste au camp.
      row.addEventListener('dblclick', () => {
        if (save.team.length < 2) return;
        save.team = save.team.filter((x) => x !== sid);
        this.commitTeam(ctx);
      });
    }
    if (slots < 6) el('div', 'cs-slot locked', col, `+${6 - slots} place${6 - slots > 1 ? 's' : ''} : à l’étude d’Alakazam`);
    el('div', 'cs-label', col, 'Au camp');
    const bench = el('div', 'cs-bench', col);
    this.dropZone(bench, 'mon', (d) => {
      if (d.kind !== 'mon' || d.from !== 'team' || save.team.length < 2) return;
      save.team = save.team.filter((x) => x !== d.id);
      this.commitTeam(ctx);
    });
    for (const s of roster.filter((r) => !save.team.includes(r.id))) {
      const chip = el('div', `cs-chip${s.id === id ? ' sel' : ''}`, bench);
      art(s.id, chip);
      chip.title = s.name;
      this.dragSource(chip, { kind: 'mon', id: s.id, from: 'bench' });
      chip.addEventListener('click', () => this.select(s.id));
      // Double-clic (ou Entrée une seconde fois) : il rejoint l'équipe, s'il reste une place.
      chip.addEventListener('dblclick', () => {
        if (save.team.length >= slots) return;
        save.team = [...save.team, s.id];
        this.commitTeam(ctx);
      });
    }
    if (save.team.length >= roster.length) el('small', 'cs-hint', bench, 'Tout le monde part !');

    // ── Fiche du Pokémon choisi : qui il est, ses statistiques, ses attaques, son objet.
    const inTeam = save.team.includes(id);
    const card = el('div', 'cs-detail da-paper', wrap);
    card.style.setProperty('--c', typeColor(data.types[0]));
    art(id, card, 'cs-big');
    const head = el('div', 'cs-head', card);
    el('b', '', head, data.name);
    for (const t of data.types) typePill(t, head);
    el('small', 'cs-info', card, `N.${lvl} au départ · ${inTeam ? (save.team[0] === id ? 'mène l’équipe' : 'dans l’équipe') : 'reste au camp'}`);

    // Statistiques au départ, objet tenu et Vitalité compris (comme main.ts les applique).
    const item = heldItem(save.held[id]);
    const vigor = 1 + 0.08 * level(save, 'vigor');
    if (item?.stat === 'hp') mon.boostMaxHp(item.mult);
    else if (item) mon.mult[item.stat] *= item.mult;
    if (vigor > 1) mon.boostMaxHp(vigor);
    const stats = el('div', 'cs-stats', card);
    const rows: [string, number, boolean][] = [
      ['PV', mon.maxHp, item?.stat === 'hp' || vigor > 1],
      ['ATT', mon.attack, item?.stat === 'atk'],
      ['DÉF', mon.defense, item?.stat === 'def'],
      ['ATT.S', mon.spAttack, item?.stat === 'spAtk'],
      ['DÉF.S', mon.spDefense, item?.stat === 'spDef'],
      ['VIT', mon.speed, item?.stat === 'speed'],
    ];
    for (const [label, v, boosted] of rows) {
      const r = el('div', boosted ? 'up' : '', stats);
      el('small', '', r, label);
      el('b', '', r, String(Math.round(v)));
      const bar = el('i', '', r);
      bar.style.setProperty('--w', `${Math.min(100, (v / (label === 'PV' ? 90 : 60)) * 100)}%`);
    }

    // Attaques : quatre emplacements où l'on dépose une attaque (glisser, ou clic pour ajouter/retirer).
    el('div', 'cs-label', card, `Attaques ${equipped.length}/4`);
    const list = el('div', 'cs-moves', card);
    const setLoadout = (next: string[]) => {
      if (!next.length || next.length > 4) return;
      save.loadouts[id] = next;
      ctx.persist();
      void this.render();
    };
    const moveTile = (m: Move, parent: HTMLElement, from: 'slot' | 'pool') => {
      const row = el('div', `cs-move${from === 'slot' ? ' on' : ''}`, parent);
      row.style.setProperty('--c', typeColor(m.type));
      el('b', '', row, m.name);
      typePill(m.type, row);
      el('small', '', row, moveInfo(m));
      if (save.tms.includes(m.api)) el('i', 'ct', row, 'CT');
      this.dragSource(row, { kind: 'move', api: m.api, from });
      row.addEventListener('click', () => setLoadout(from === 'slot' ? equipped.filter((a) => a !== m.api) : equipped.length < 4 ? [...equipped, m.api] : equipped));
      return row;
    };
    for (let i = 0; i < 4; i++) {
      const m = pool.find((x) => x.api === equipped[i]);
      const holder = el('div', 'cs-moveslot', list);
      this.dropZone(holder, 'move', (d) => {
        if (d.kind !== 'move') return;
        const next = [...equipped];
        if (d.from === 'pool') {
          if (i < next.length) next[i] = d.api;
          else next.push(d.api);
        } else {
          const j = next.indexOf(d.api);
          if (j < 0 || i >= next.length) return;
          [next[i], next[j]] = [next[j], next[i]];
        }
        setLoadout(next);
      });
      if (m) moveTile(m, holder, 'slot');
      else el('div', 'empty', holder, 'Emplacement libre');
    }
    const rest = pool.filter((m) => !equipped.includes(m.api));
    el('div', 'cs-label', card, rest.length ? 'Disponibles — glisse-les dans un emplacement' : 'Toutes ses attaques sont équipées');
    const spare = el('div', 'cs-moves spare', card);
    this.dropZone(spare, 'move', (d) => {
      if (d.kind === 'move' && d.from === 'slot') setLoadout(equipped.filter((a) => a !== d.api));
    });
    for (const m of rest) moveTile(m, spare, 'pool');

    // Objet tenu : un par Pokémon, parmi ceux en réserve qu'aucun autre ne tient.
    el('div', 'cs-label', card, 'Objet tenu');
    const items = el('div', 'cs-items', card);
    const none = el('button', save.held[id] ? '' : 'on', items, 'Aucun');
    none.addEventListener('click', () => {
      delete save.held[id];
      ctx.persist();
      void this.render();
    });
    const heldBy = (api: string) => Object.entries(save.held).filter(([pid, a]) => a === api && Number(pid) !== id).length;
    for (const it of HELD_ITEMS) {
      const free = (save.items[it.api] ?? 0) - heldBy(it.api);
      const mine = save.held[id] === it.api;
      if (free <= 0 && !mine) continue;
      const b = el('button', mine ? 'on' : '', items);
      icon(it.icon, b);
      b.title = `${it.name} — ${STAT_FR[it.stat]} +${Math.round((it.mult - 1) * 100)} %`;
      b.addEventListener('click', () => {
        save.held[id] = it.api;
        ctx.persist();
        void this.render();
      });
    }
    if (!HELD_ITEMS.some((it) => (save.items[it.api] ?? 0) > 0)) el('small', 'cs-info', items, 'Aucun en réserve : Alakazam en vend.');

    // Super Bonbon : +5 niveaux de départ, tant qu'il en reste et qu'on n'a pas atteint +20.
    const candies = save.items['rare-candy'] ?? 0;
    const bonus = save.levels[id] ?? 0;
    if (candies > 0 || bonus > 0) {
      const row = el('div', 'cs-candy', card);
      icon(CANDY.icon, row);
      const b = el('button', '', row, bonus >= CANDY.max ? `Niveau de départ au maximum (+${CANDY.max})` : `Super Bonbon : N.${lvl} → N.${lvl + CANDY.step} (${candies} en réserve)`) as HTMLButtonElement;
      b.disabled = candies <= 0 || bonus >= CANDY.max;
      b.addEventListener('click', () => {
        save.items['rare-candy'] = candies - 1;
        save.levels[id] = bonus + CANDY.step;
        ctx.notify('Super Bonbon', `${data.name} partira au niveau ${lvl + CANDY.step}.`, id);
        this.commitTeam(ctx);
      });
    }
  }

  private select(id: number): void {
    this.selId = id;
    void this.render();
  }

  /** Un Pokémon déposé sur la place i de l'équipe : il y entre, ou y change de place (le premier mène). */
  private dropMonOnSlot(d: Drag, i: number, slots: number, ctx: CampCtx): void {
    if (d.kind !== 'mon') return;
    const team = [...ctx.save.team];
    const from = team.indexOf(d.id);
    if (from >= 0) {
      // Réordonner : il prend la place visée, les autres glissent.
      team.splice(from, 1);
      team.splice(Math.min(i, team.length), 0, d.id);
    } else if (i < team.length) team[i] = d.id;
    else if (team.length < slots) team.push(d.id);
    else return;
    ctx.save.team = team;
    this.selId = d.id;
    this.commitTeam(ctx);
  }

  private dragSource(node: HTMLElement, d: Drag): void {
    node.draggable = true;
    node.addEventListener('dragstart', (e) => {
      this.drag = d;
      e.dataTransfer?.setData('text/plain', d.kind);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      node.classList.add('dragging');
      this.root?.classList.add(`dragging-${d.kind}`);
    });
    node.addEventListener('dragend', () => {
      node.classList.remove('dragging');
      this.root?.classList.remove('dragging-mon', 'dragging-move');
      // Lâché hors d'une zone : aucun pointillé ne doit rester allumé.
      for (const z of this.root?.querySelectorAll('.over') ?? []) z.classList.remove('over');
      this.drag = null;
    });
  }

  /** `accepts` : ce qu'on peut y déposer — un Pokémon ne se lâche pas sur les attaques, ni l'inverse. */
  private dropZone(node: HTMLElement, accepts: Drag['kind'], onDrop: (d: Drag) => void): void {
    node.addEventListener('dragover', (e) => {
      if (this.drag?.kind !== accepts) return;
      e.preventDefault();
      node.classList.add('over');
    });
    node.addEventListener('dragleave', () => node.classList.remove('over'));
    node.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      node.classList.remove('over');
      const d = this.drag;
      this.drag = null;
      if (d?.kind === accepts) onDrop(d);
    });
  }

  private commitTeam(ctx: CampCtx): void {
    ctx.persist();
    ctx.teamChanged();
    void this.render();
  }

  // ── CS ───────────────────────────────────────────────────────────────
  private renderCs(grid: HTMLElement, ctx: CampCtx): void {
    el('p', 'cs-quote wide', grid, 'Une CS se garde pour toujours, et toute l’équipe en profite. Surf ouvre le lac du Repaire ; les autres serviront bientôt en run.');
    for (const c of CS_LIST) {
      const owned = ctx.save.cs.includes(c.id);
      const card = el('div', `cs-card da-paper${owned ? ' owned' : !c.ready ? ' soon' : ctx.save.baies < c.price ? ' poor' : ''}`, grid);
      icon(c.icon, card);
      el('div', 'cs-head', card).append(el('b', '', undefined, `CS ${c.name}`));
      el('small', 'cs-info', card, c.desc);
      if (owned) el('div', 'da-tape cs-tag', card, 'Acquise');
      else if (!c.ready) el('div', 'da-tape cs-tag', card, 'Bientôt');
      else {
        el('div', 'da-stamp cs-price', card, String(c.price));
        card.addEventListener('click', () =>
          this.buy(c.price, () => {
            ctx.save.cs.push(c.id);
            ctx.notify(`CS ${c.name}`, c.id === 'surf' ? 'Ton équipe sait nager : le lac et son île t’attendent.' : c.desc, STATIONS.upgrades.id);
            ctx.teamChanged();
          }),
        );
      }
    }
  }

  // ── Aménagements ─────────────────────────────────────────────────────
  private renderBuilder(main: HTMLElement, ctx: CampCtx): void {
    el('p', 'cs-quote', main, 'Chaque construction fait venir du monde au camp. Ce qui est bâti l’est pour de bon.');
    const grid = el('div', 'cs-grid', main);
    for (const b of BUILDINGS) {
      const done = ctx.save.built.includes(b.id);
      const card = el('div', `cs-card cs-build da-paper${done ? ' owned' : ctx.save.baies < b.price ? ' poor' : ''}`, grid);
      art(b.art, card, 'cs-icon cs-build-art');
      el('div', 'cs-head', card).append(el('b', '', undefined, b.name));
      el('small', 'cs-info', card, b.desc);
      if (done) el('div', 'da-tape cs-tag', card, 'Bâti');
      else {
        el('div', 'da-stamp cs-price', card, String(b.price));
        card.addEventListener('click', () =>
          this.buy(b.price, () => {
            ctx.save.built.push(b.id);
            ctx.notify('Aménagement', `${b.name} : c’est bâti. Va voir !`, STATIONS.builder.id);
            ctx.teamChanged();
          }),
        );
      }
    }
  }

  // ── En ligne ─────────────────────────────────────────────────────────
  private renderOnline(main: HTMLElement): void {
    el('p', 'cs-quote', main, 'Jusqu’à six rebelles, un Pokémon chacun, dans la même run : l’hôte la lance, les autres le rejoignent avec son code (le multijoueur du jeu Godot).');
    const grid = el('div', 'cs-online', main);
    const host = el('div', 'cs-card da-paper soon', grid);
    el('div', 'cs-head', host).append(el('b', '', undefined, 'Héberger une partie'));
    el('small', 'cs-info', host, 'Ouvre ton camp : un code s’affiche, à donner à tes alliés.');
    el('div', 'da-tape cs-tag', host, 'Bientôt');
    const join = el('div', 'cs-card da-paper soon', grid);
    el('div', 'cs-head', join).append(el('b', '', undefined, 'Rejoindre une partie'));
    el('small', 'cs-info', join, 'Entre le code d’un hôte pour rejoindre sa run.');
    const code = el('input', 'cs-code', join) as HTMLInputElement;
    code.placeholder = 'CODE';
    code.disabled = true;
    el('div', 'da-tape cs-tag', join, 'Bientôt');
  }

  // ── Départ ───────────────────────────────────────────────────────────
  private renderStart(main: HTMLElement, ctx: CampCtx): void {
    const save = ctx.save;
    const next = ctx.preview();
    el('p', 'cs-quote', main, STATIONS.start.intro);
    const where = el('div', 'cs-next-run', main);
    where.style.setProperty('--b', next.color);
    el('small', '', where, 'Prochaine run · Acte 1');
    el('b', '', where, next.biome);
    const champ = el('span', '', where, `${next.champion} t’attend au bout `);
    typePill(next.champType, champ);
    const line = el('div', 'cs-lineup', main);
    save.team.forEach((sid, i) => {
      const fig = el('div', i === 0 ? 'lead' : '', line);
      art(sid, fig);
      const held = heldItem(save.held[sid]);
      if (held) icon(held.icon, fig, 'cs-held');
      el('b', '', fig, PLAYER_SPECIES.find((s) => s.id === sid)?.name ?? `#${sid}`);
      el('small', '', fig, `N.${startLevel(save, sid, BASE_TEAM_LEVEL)}`);
    });
    const perks = el('div', 'cs-perks', main);
    const purse = level(save, 'purse');
    const xp = level(save, 'xp');
    const vigor = level(save, 'vigor');
    const revives = level(save, 'revives');
    const dash = level(save, 'dash');
    for (const t of [purse && `${purse * 100} ₽ en poche`, xp && `XP +${xp * 20} %`, vigor && `PV max +${vigor * 8} %`, revives && `${revives} Rappel${revives > 1 ? 's' : ''} chacun`, dash && `${dash + 1} dash`].filter(Boolean)) {
      el('span', 'da-tape', perks, String(t));
    }
    const go = el('button', 'cs-go', main);
    el('span', 'cs-go-word', go, 'Partir');
    el('span', 'cs-go-arrow', go, '➜');
    el('kbd', '', go, 'Entrée');
    go.addEventListener('click', () => this.depart());
  }
}

/** GameManager.default_loadout : les attaques offensives d'abord, les plus faibles en tête, quatre au plus. */
export function defaultLoadout(pool: readonly Move[]): string[] {
  return [...pool]
    .sort((a, b) => {
      if (a.power > 0 !== b.power > 0) return a.power > 0 ? -1 : 1;
      if (a.power === b.power) return a.api < b.api ? -1 : 1;
      return a.power - b.power;
    })
    .slice(0, 4)
    .map((m) => m.api);
}
