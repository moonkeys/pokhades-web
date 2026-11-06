import { loadMove, type Move } from '../combat/moves';
import { sfx } from '../audio/audio';
import { fetchJson } from '../assets/json';
import { BASE_TEAM_LEVEL, Pokemon } from '../combat/pokemon';
import { sheetOf } from '../data/bestiary';
import { BUILDINGS, CANDY, CS_LIST, HELD_ITEMS, RESOURCES, RESOURCE_IDS, SHARDS, TMS, UPGRADES, applyHeld, buildingsShown, canAfford, heldBoosts, heldItem, heldText, teamSlots, type Cost, type HeldItem, type ResourceId, type Upgrade } from '../meta/catalog';
import { evolutionsOf } from '../data/evolutions';
import { BIOME_IDS, CAMP_NPCS, FAUNA, LEGENDARY_SPECIES, MERC_POOLS, QUEST_SPECIES, STARTER_IDS, type BiomeId } from '../data/species';
import { BIOME_MATERIAL, GARDEN, MATERIALS, NECTARS, NECTAR_ROOMS, RECIPES, canCraft, craft, harvest, materialName, pickVisitor, plots, recipeOutput, sow } from '../meta/crafting';
import { BIOME_GRUNTS, GRUNT_THEMES } from '../data/grunts';
import { BIOMES } from '../world/biomes';
import { MISSIONS, available, busy, collect, mission, missionSlots, open as missionOpen, recall, rewardText, send, type Mission, type MissionId } from '../meta/missions';
import { NICK_MAX, capacity, isBaseForm, recruitThreshold, welcomeMon, level, monName, ownedSpecies, ownsSpecies, roster as rosterIds, speciesOf, startLevel, type Save } from '../meta/save';
import { natureText, talentStars, TRAIT_LABEL, TRAIT_STATS, applyTraits } from '../meta/mons';
import { MAX_ACTIVE, QUESTS, abandonQuest, acceptQuest, claimQuest, questFor, questState } from '../meta/quests';
import { memberWeight, moveWeight, weightCap, type MemberWeight } from '../meta/weight';
import { typeColor } from '../render/combatfx';
import { STATIONS, stationId, type Station } from '../run/camp';
import { TYPE_FR, moveInfo, typePill } from './hud';
import { LORE, TYPES_CHAPTER, type LoreChapter } from '../data/lore';
import { TYPE_CHART } from '../combat/damage';
import { resIcon } from './resicon';
import { MAX_PLAYERS, cleanCode, net, type Loadout } from '../net/net';
import { inviteUrl } from '../net/invite';
import { qrSvg } from './qr';

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
//   même resté au camp (PokedexScreen, partie équipe) ; un second onglet,
//   le Pokédex, tient le compte des espèces rencontrées, débloquées, et des
//   victoires qui manquent aux autres (PokedexScreen, partie collection) ;
// - Améliorations (Alakazam) : améliorations permanentes et capacités
//   spéciales (UpgradeShopScreen, ShopScreen réunis) ;
// - Objets (Miaouss, au marché) : objets tenus et Super Bonbons
//   (GromagoShopScreen). Écart voulu (retour de test) : ils étaient un
//   troisième onglet d'Alakazam ; un marchand à part, plus lisible ;
// - Aménagements (le bâtisseur, Charpenti) : ce que le camp peut bâtir (BuilderScreen) ;
// - Quêtes (Kangourex, ajout) : des exploits de run à accepter (trois au
//   plus), puis à réclamer contre un Pokémon rare, voire légendaire ;
// - En ligne (Roucarnage) : héberger ou rejoindre une partie, à venir ;
// - Départ (Dracolosse) : la prochaine run, l'équipe et ce qu'elle emporte.
//
// Poids d'équipe (meta/weight.ts) : affiché à l'équipe et au départ ; au-delà
// du plafond, on compose librement mais « Partir » refuse (HubWorld._start_run).

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
  /** Le jeu en ligne (Roucarnage) : le Pokémon qu'on emmène, et le départ de la run (hôte). */
  online: { loadout(): Promise<Loadout>; start(): void };
}

/** Fiche d'espèce embarquée (data/pokeapi/pokemon) : ce que l'écran d'équipe et le tuteur en lisent. */
export interface SpeciesData {
  id: number;
  name: string;
  types: string[];
  levelUp: { level: number; name: string }[];
  learnable: Set<string>;
}

const speciesCache = new Map<number, Promise<SpeciesData>>();
export function species(id: number): Promise<SpeciesData> {
  let p = speciesCache.get(id);
  if (!p) {
    p = fetchJson<{ name_fr?: string; types?: string[]; level_up_moves?: { level: number; name: string }[]; learnable_moves?: string[] }>(`/game/data/pokeapi/pokemon/${id}.json`)
      .then((d) => d ?? {})
      .then((d) => ({
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
export async function movePool(uid: number, save: Save): Promise<Move[]> {
  const sid = speciesOf(save, uid);
  const sp = await species(sid);
  const lvl = startLevel(save, uid, BASE_TEAM_LEVEL);
  const names = [...new Set([...sp.levelUp.filter((m) => m.level <= lvl).map((m) => m.name), ...save.tms.filter((t) => sp.learnable.has(t)), ...(sheetOf(sid)?.moves ?? [])])];
  return (await Promise.all(names.map(move))).filter((m): m is Move => !!m);
}

/**
 * Les attaques équipées : le choix enregistré, sinon celles que le bestiaire
 * impose à l'espèce, sinon le jeu de départ du jeu (les CT s'équipent à la main).
 */
async function loadout(uid: number, save: Save, pool: readonly Move[]): Promise<string[]> {
  const sid = speciesOf(save, uid);
  const sp = await species(sid);
  const lvl = startLevel(save, uid, BASE_TEAM_LEVEL);
  const learned = pool.filter((m) => sp.levelUp.some((l) => l.name === m.api && l.level <= lvl));
  return (save.loadouts[uid] ?? sheetOf(sid)?.moves ?? defaultLoadout(learned)).filter((api) => pool.some((m) => m.api === api));
}

/** Poids d'un Pokémon tel qu'il partirait : son espèce de départ, ses attaques équipées, son objet. */
async function weigh(id: number, save: Save): Promise<MemberWeight> {
  const pool = await movePool(id, save);
  const names = await loadout(id, save, pool);
  return memberWeight(id, save, names.map((n) => pool.find((m) => m.api === n)?.power ?? 0));
}

/** Poids total de l'équipe composée (GameManager.compute_team_weight) et plafond. */
export async function teamWeight(save: Save): Promise<{ total: number; cap: number }> {
  const all = await Promise.all(save.team.map((sid) => weigh(sid, save)));
  return { total: all.reduce((s, w) => s + w.total, 0), cap: weightCap(save) };
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

/** D'où vient un individu (Mon.origin), pour sa fiche ; '' si on ne l'a pas noté. */
function originText(save: Save, uid: number): string {
  const o = save.mons[uid]?.origin ?? '';
  if (o === 'starter') return 'partenaire de départ';
  if (o === 'quest') return 'gagné à une quête de Kangourex';
  if (o === 'nectar') return 'attiré par un nectar de l’atelier';
  if (o === 'test') return 'venu du panneau de test';
  const cave = o.startsWith('cave:');
  const b = cave ? o.slice(5) : o;
  const biome = b in BIOMES ? BIOMES[b as BiomeId].name : '';
  if (cave) return biome ? `libéré d’une grotte · ${biome}` : 'libéré d’une grotte';
  return biome ? `recruté · ${biome}` : '';
}

/**
 * Où trouver une espèce (retour de test) : les biomes dont elle est la faune,
 * et ceux dont les sbires l'envoient au fond des grottes (data/grunts.ts).
 */
function habitat(id: number): { wild: string[]; caves: string[] } {
  const caves = BIOME_IDS.filter((b) => BIOME_GRUNTS[b].some((t) => GRUNT_THEMES[t].guardians.includes(id)));
  return { wild: BIOME_IDS.filter((b) => FAUNA[b].includes(id)).map((b) => BIOMES[b].name), caves: caves.map((b) => BIOMES[b].name) };
}

/** Le « ! » de ce qui est neuf (meta/news.ts), au coin d'une carte : la bulle du repère du camp. */
const newMark = (parent: HTMLElement) => {
  const m = el('i', 'cs-new', parent);
  m.title = 'Nouveau';
  return m;
};

/** Les herbes du potager, de la plus rapide à la plus rare. */
const PLANT_IDS = Object.keys(GARDEN);

/** Une rangée de ressources « 20 [souche] 10 [pierre] … » ; `stock` grise ce qui manque. */
/** Comme resRow, pour les matériaux d'artisan (meta/crafting.ts) : barrés s'il en manque au stock. */
const matRow = (amounts: Record<string, number>, parent: HTMLElement, cls: string, stock?: Record<string, number>) => {
  const row = el('div', cls, parent);
  for (const [m, n] of Object.entries(amounts)) {
    const chip = el('span', `cs-res${stock && (stock[m] ?? 0) < n ? ' short' : ''}`, row);
    chip.title = materialName(m);
    el('b', '', chip, String(n));
    icon(MATERIALS[m]?.icon ?? NECTARS[m]?.icon ?? 'POKEBALL', chip, 'cs-res-ico');
  }
  return row;
};
const resRow = (amounts: Cost, parent: HTMLElement, cls: string, stock?: Record<ResourceId, number>) => {
  const row = el('div', cls, parent);
  for (const r of RESOURCE_IDS) {
    const n = amounts[r];
    if (n === undefined) continue;
    const chip = el('span', `cs-res${stock && stock[r] < n ? ' short' : ''}`, row);
    chip.title = RESOURCES[r].name;
    el('b', '', chip, String(n));
    resIcon(r, chip);
  }
  return row;
};

/** Couleur de chaque poste : le liseré de l'écran et l'ombre du titre. */
const TINT: Record<Station, string> = { start: '#ff7a2a', moves: '#b88ceb', team: '#3ab0e0', upgrades: '#ffd23f', items: '#e8b04a', builder: '#c8963c', missions: '#9a86b8', quests: '#e0a35a', lore: '#7cc46a', online: '#7ac0e8', garden: '#e8c84a', craft: '#d9776a', visitor: '#f0a0c8', recruit: '#ffd23f', feats: '#ffd23f', map: '#c8963c' };

/**
 * Ce qui se choisit au clavier, dans l'ordre de l'écran : onglets, cartes,
 * Pokémon, attaques, objets, boutons. Fenêtre ouverte par-dessus : elle seule.
 */
const NAV = '.cs-tabs button, .cs-recall, .cs-card:not(.soon), .cs-slot.da-paper, .cs-chip, .cs-dex-card, .cs-dex-go, .cs-move, .cs-items button, .cs-candy button:not(:disabled), .cs-go';
const NAV_MODAL = '.cs-modal .cs-buy:not(:disabled), .cs-modal .cs-close';
const ARROWS: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

/** Onglets du Pokédex (PokedexScreen) : Débloqués / À débloquer / Rencontrés / Tous. */
type DexFilter = 'unlocked' | 'locked' | 'seen' | 'all';
const DEX_FILTERS: readonly [DexFilter, string][] = [
  ['unlocked', 'Débloqués'],
  ['locked', 'À débloquer'],
  ['seen', 'Rencontrés'],
  ['all', 'Tous'],
];

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
  /** Poste de Porygon : l'équipe ou le Pokédex. */
  private teamTab: 'team' | 'dex' = 'team';
  /** Pokédex : le filtre (onglets de PokedexScreen) et l'espèce dont on lit la fiche. */
  private dexFilter: DexFilter = 'all';
  private dexId = 0;
  /** Ce qui est neuf au poste ouvert (meta/news.ts) : un « ! » sur sa carte, le temps de cette visite. */
  private news: ReadonlySet<string> = new Set();
  /** Améliorations : onglet affiché. */
  private tab: 'upgrades' | 'cs' = 'upgrades';
  /** Leçons du savant : le chapitre ouvert. */
  private loreTab = LORE[0].id;
  /** Missions : l'envoi en cours (emplacement, puis mission choisie), null sur le tableau. */
  private sending: { slot: number; type?: MissionId } | null = null;
  /** CT dont la fiche est ouverte par-dessus l'écran. */
  private modal: string | null = null;
  private drag: Drag | null = null;
  /** Rendu en cours : un rendu asynchrone plus ancien ne doit pas écraser le dernier. */
  private ticket = 0;
  /** Élément choisi au clavier (rang dans NAV), -1 tant qu'on n'a pas touché aux flèches. */
  private navIndex = -1;
  /** Code saisi chez Roucarnage, gardé d'un rendu à l'autre. */
  joinCode = '';
  private readonly keys = (e: KeyboardEvent) => {
    if (!this.open) return;
    // Dans le champ du surnom, la frappe lui revient (flèches comprises) :
    // Entrée le valide, Échap l'annule — sans refermer l'écran.
    if (e.target instanceof HTMLInputElement) {
      if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (e.code === 'Escape') e.target.value = e.target.defaultValue;
        e.target.blur();
      }
      return;
    }
    const arrow = ARROWS[e.code];
    if (arrow) {
      e.preventDefault();
      e.stopPropagation();
      this.moveFocus(arrow[0], arrow[1]);
    } else if (e.code === 'Escape') {
      e.preventDefault();
      // Sans quoi l'Échap, l'écran fermé, ouvrirait aussitôt les réglages (main.ts).
      e.stopImmediatePropagation();
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
      void this.depart();
    }
  };

  constructor(private readonly parent: HTMLElement) {
    addEventListener('keydown', this.keys, true);
    // Le lobby de Roucarnage suit la partie en ligne : un joueur arrive, part, le code s'affiche.
    net.onChange(() => {
      if (this.open && this.station === 'online') void this.render();
    });
  }

  /** `news` : ce qui est neuf à ce poste (meta/news.ts), marqué d'un « ! » sur sa carte. */
  show(station: Station, ctx: CampCtx, onClose: () => void, news: ReadonlySet<string> = new Set()): void {
    this.close();
    this.open = true;
    this.news = news;
    this.station = station;
    this.ctx = ctx;
    this.onClose = onClose;
    this.selId = ctx.save.team[0];
    this.teamTab = 'team';
    this.sending = null;
    this.modal = null;
    this.navIndex = -1;
    sfx('menuOpen');
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
    sfx('menuClose');
    this.root?.remove();
    this.root = null;
    this.onClose();
  }

  private async depart(): Promise<void> {
    const ctx = this.ctx!;
    // Trop lourde, l'équipe ne part pas (HubWorld._start_run) : on reste sur l'écran.
    const w = await teamWeight(ctx.save);
    if (w.total > w.cap) {
      sfx('buzzer');
      ctx.notify('Trop lourd', `Poids d’équipe ${w.total} / ${w.cap} : allège l’équipe, ou monte le plafond chez Alakazam.`, STATIONS.start.id);
      return;
    }
    if (!this.open) return;
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
    art(stationId(this.station, ctx.save.built), side, 'cs-art');
    el('div', 'cs-kicker', side, st.kicker);
    // (Les noms longs — « Aménagements », « Améliorations » — tiendraient mal dans le volet au corps plein.)
    el('h1', `cs-title${st.title.length > 10 ? ' long' : ''}`, side, st.title);
    const main = el('div', 'cs-main', page);
    const purse = el('div', 'da-stamp cs-purse', page);
    purse.innerHTML = `${ctx.save.baies}<small>Baies</small>`;
    // Les ressources des coffres, sous la bourse : elles paient les aménagements.
    const stock = resRow(ctx.save.resources, page, 'cs-stock da-paper');
    // Les Éclats de Champion au bout de la rangée : ils paient le plafond de poids.
    const shard = el('span', 'cs-res', stock);
    shard.title = 'Éclats de Champion';
    el('b', '', shard, String(ctx.save.shards));
    icon(SHARDS.icon, shard, 'cs-res-ico');
    el('div', 'cs-keys', page, this.station === 'start' ? 'Entrée : partir · Échap : rester au camp' : this.station === 'team' && this.teamTab === 'team' ? 'Glisser-déposer ou flèches + Entrée (deux fois : entrer, sortir de l’équipe) · Échap : fermer' : 'Flèches + Entrée, ou clic : choisir · Échap : fermer');
    const close = el('button', 'cs-close', page, '✕');
    close.addEventListener('click', () => this.close());

    if (this.station === 'moves') await this.renderMoves(main, page, ctx);
    else if (this.station === 'upgrades') this.renderUpgrades(main, ctx);
    else if (this.station === 'items') this.renderItems(main, ctx);
    else if (this.station === 'team') {
      this.teamTabs(main);
      await (this.teamTab === 'dex' ? this.renderDex(main, ctx) : this.renderTeam(main, ctx));
    }
    else if (this.station === 'builder') this.renderBuilder(main, ctx);
    else if (this.station === 'missions') await this.renderMissions(main, ctx);
    else if (this.station === 'quests') await this.renderQuests(main, ctx);
    else if (this.station === 'online') this.renderOnline(main, ctx);
    else if (this.station === 'lore') this.renderLore(main);
    else if (this.station === 'garden') this.renderGarden(main, ctx);
    else if (this.station === 'craft') this.renderCraft(main, ctx);
    else await this.renderStart(main, ctx);
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

  private buy(price: number, then: () => void, cost: Cost = {}, currency?: 'shards'): void {
    const ctx = this.ctx!;
    const purse = currency === 'shards' ? 'shards' : 'baies';
    if (ctx.save[purse] < price || !canAfford(ctx.save.resources, cost)) return sfx('buzzer');
    ctx.save[purse] -= price;
    sfx('buy');
    for (const r of RESOURCE_IDS) ctx.save.resources[r] -= cost[r] ?? 0;
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
    const roster = await Promise.all(ownedSpecies(ctx.save).map(species));
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
    ] as const) {
      const t = el('button', this.tab === id ? 'sel' : '', tabs, label);
      t.addEventListener('click', () => {
        this.tab = id;
        void this.render();
      });
    }
    const grid = el('div', 'cs-grid', main);
    if (this.tab === 'upgrades') for (const u of UPGRADES) this.upgradeCard(grid, u, ctx);
    else this.renderCs(grid, ctx);
  }

  // ── Objets (Miaouss) ─────────────────────────────────────────────────
  private renderItems(main: HTMLElement, ctx: CampCtx): void {
    const grid = el('div', 'cs-grid', main);
    el('p', 'cs-quote wide', grid, 'Un objet tenu se donne à un Pokémon à la hutte de Porygon ; il le garde d’une run à l’autre. Un Super Bonbon s’y donne aussi, et s’y reprend.');
    this.candyCard(grid, ctx);
    for (const it of HELD_ITEMS) if (!it.crafted) this.itemCard(grid, it, ctx);
  }

  private upgradeCard(grid: HTMLElement, u: Upgrade, ctx: CampCtx): void {
    const n = level(ctx.save, u.id);
    const maxed = n >= u.max;
    const price = maxed ? 0 : u.price(n);
    const wallet = u.currency === 'shards' ? ctx.save.shards : ctx.save.baies;
    const card = el('div', `cs-card da-paper${maxed ? ' owned' : wallet < price ? ' poor' : ''}`, grid);
    icon(u.icon, card);
    const head = el('div', 'cs-head', card);
    el('b', '', head, u.name);
    const base = u.id === 'slots' ? '1 Pokémon en run' : u.id === 'dash' ? '1 dash d’affilée' : u.id === 'weight' ? u.effect(0) : '';
    el('small', 'cs-info', card, n ? `Actuel : ${u.effect(n)}` : base ? `Actuel : ${base}` : 'Pas encore acquise');
    if (!maxed) el('small', 'cs-next', card, `→ ${u.effect(n + 1)}`);
    const pips = el('div', 'cs-pips', card);
    for (let i = 0; i < u.max; i++) el('i', i < n ? 'on' : '', pips);
    if (maxed) el('div', 'da-tape cs-tag', card, 'Au max');
    else {
      // Le Bracelet de charge se paie en Éclats de Champion : le prix porte leur icône.
      const tag = el('div', 'da-stamp cs-price', card, String(price));
      if (u.currency === 'shards') icon(SHARDS.icon, tag, 'cs-res-ico');
      card.addEventListener('click', () =>
        this.buy(
          price,
          () => {
            ctx.save.upgrades[u.id] = n + 1;
            ctx.notify('Amélioration', `${u.name} : ${u.effect(n + 1)}.`, STATIONS.upgrades.id);
          },
          {},
          u.currency,
        ),
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
        ctx.notify('Super Bonbon', 'À donner à un Pokémon, à la hutte de Porygon.', STATIONS.items.id);
      }),
    );
  }

  private itemCard(grid: HTMLElement, it: HeldItem, ctx: CampCtx): void {
    const owned = ctx.save.items[it.api] ?? 0;
    const card = el('div', `cs-card da-paper${ctx.save.baies < it.price ? ' poor' : ''}`, grid);
    icon(it.icon, card);
    const head = el('div', 'cs-head', card);
    el('b', '', head, it.name);
    el('small', 'cs-info', card, heldText(it));
    if (owned) el('small', 'cs-next', card, `En réserve : ${owned}`);
    el('div', 'da-stamp cs-price', card, String(it.price));
    card.addEventListener('click', () =>
      this.buy(it.price, () => {
        ctx.save.items[it.api] = owned + 1;
        ctx.notify('Objet acheté', `${it.name} : à donner à la hutte de Porygon.`, STATIONS.items.id);
      }),
    );
  }

  // ── Potager (Héliatronc) ─────────────────────────────────────────────
  /**
   * Ajout (retour de test) : trois parcelles sur le champ. On choisit une
   * herbe, Héliatronc la plante dans la première libre (sans graines : retour
   * de test, « ça fait beaucoup de trucs à ramasser »), elle pousse d'une salle
   * franchie en run à l'autre, et se récolte ici ; ses plantes vont aux
   * recettes de l'atelier.
   */
  private renderGarden(main: HTMLElement, ctx: CampCtx): void {
    const save = ctx.save;
    el('p', 'cs-quote', main, 'Dis-moi quoi planter : je m’en occupe dans la première parcelle libre. Ça pousse à chaque salle que tu franchis en run ; quand c’est en fleur, reviens récolter. Les plantes servent à l’atelier de l’artisan.');
    const grid = el('div', 'cs-grid', main);
    plots(save).forEach((p, i) => {
      const ripe = p !== null && p.left <= 0;
      const card = el('div', `cs-card da-paper${ripe ? '' : ' owned'}`, grid);
      const seed = p ? GARDEN[p.plant] : null;
      icon(p && seed ? MATERIALS[p.plant].icon : 'GROWTHMULCH', card);
      el('div', 'cs-head', card).append(el('b', '', undefined, `Parcelle ${i + 1}`));
      if (!p || !seed) {
        el('small', 'cs-info', card, 'Libre : choisis quoi planter ci-dessous.');
        return;
      }
      el('small', 'cs-info', card, `${seed.yield} × ${materialName(p.plant)}`);
      if (!ripe) {
        el('small', 'cs-next', card, `Mûre dans ${p.left} salle${p.left > 1 ? 's' : ''}`);
        const pips = el('div', 'cs-pips', card);
        for (let k = 0; k < seed.rooms; k++) el('i', k < seed.rooms - p.left ? 'on' : '', pips);
        return;
      }
      newMark(card);
      el('small', 'cs-next', card, 'Mûre : clique pour récolter.');
      el('div', 'da-tape cs-tag', card, 'Récolter');
      card.addEventListener('click', () => {
        const got = harvest(save, i);
        if (!got) return sfx('buzzer');
        sfx('buy');
        ctx.notify('Récolte', `+${got.n} ${materialName(got.plant)}.`, CAMP_NPCS.garden);
        ctx.persist();
        // (Le camp se recompose : la parcelle redevient de la terre nue.)
        ctx.teamChanged();
        void this.render();
      });
    });

    el('div', 'cs-label', main, 'Que planter ?');
    const seeds = el('div', 'cs-grid', main);
    const free = plots(save).findIndex((p) => p === null);
    for (const [id, sd] of Object.entries(GARDEN)) {
      const card = el('div', `cs-card da-paper${free < 0 ? ' poor' : ''}`, seeds);
      icon(MATERIALS[id].icon, card);
      el('div', 'cs-head', card).append(el('b', '', undefined, materialName(id)));
      el('small', 'cs-info', card, `${sd.yield} × en ${sd.rooms} salles`);
      el('small', 'cs-next', card, free < 0 ? 'Toutes les parcelles sont prises' : 'Clique pour planter');
      card.addEventListener('click', () => {
        if (free < 0 || !sow(save, free, id)) return sfx('buzzer');
        sfx('buy');
        ctx.persist();
        ctx.teamChanged();
        void this.render();
      });
    }
    this.stockGrid(main, save, PLANT_IDS.map((m) => [m, 'Potager']), 'Récoltes en réserve');
  }

  /**
   * Les matériaux en réserve, en casiers : l'icône, le compte en gros, le nom,
   * et pour ceux qu'on n'a pas, d'où ils viennent (grisés). Écart voulu
   * (retour de test : « on ne voit pas très bien le compte… il y a peut-être
   * beaucoup de matériaux différents ») : c'était une rangée de petites
   * pastilles, rien que ce qu'on avait. Onze matériaux de biome, cinq herbes :
   * en casiers fixes, chacun garde sa place d'une visite à l'autre, et ceux
   * qui manquent disent où aller les chercher.
   */
  private stockGrid(main: HTMLElement, save: Save, ids: readonly (readonly [string, string])[], label: string): void {
    el('div', 'cs-label', main, label);
    const grid = el('div', 'cs-mats', main);
    for (const [m, from] of ids) {
      const n = save.materials[m] ?? 0;
      const cell = el('div', `cs-mat${n > 0 ? '' : ' none'}`, grid);
      cell.title = `${materialName(m)} — ${from}`;
      icon(MATERIALS[m]?.icon ?? 'POKEBALL', cell, 'cs-mat-ico');
      el('b', '', cell, n > 0 ? `×${n}` : '—');
      el('small', '', cell, n > 0 ? materialName(m) : from);
    }
  }

  // ── Atelier (Queulorior) ─────────────────────────────────────────────
  /**
   * Ajout (retour de test : « un atelier avec un Pokémon artisan ») : les
   * recettes (objets tenus introuvables ailleurs, nectars), et la coupelle
   * devant l'atelier où l'on pose un nectar. Le visiteur se choisit à la pose
   * (pickVisitor), arrive au bout de NECTAR_ROOMS salles, et attend qu'on lui parle.
   */
  private renderCraft(main: HTMLElement, ctx: CampCtx): void {
    const save = ctx.save;
    el('p', 'cs-quote', main, 'Les matériaux viennent des coffres — chaque biome a les siens —, les herbes du potager d’Héliatronc. Un objet façonné se donne à la hutte de Porygon, comme ceux de Miaouss.');
    const grid = el('div', 'cs-grid', main);
    for (const r of RECIPES) {
      const out = recipeOutput(r);
      const ok = canCraft(save, r);
      const card = el('div', `cs-card da-paper${ok ? '' : ' poor'}`, grid);
      icon(out.icon, card);
      el('div', 'cs-head', card).append(el('b', '', undefined, out.name));
      const held = r.kind === 'held' ? heldItem(r.out) : undefined;
      el('small', 'cs-info', card, held ? heldText(held) : NECTARS[r.out]?.desc ?? '');
      matRow(r.needs, card, 'cs-cost', save.materials);
      const owned = r.kind === 'held' ? save.items[r.out] ?? 0 : save.materials[r.out] ?? 0;
      if (owned) el('small', 'cs-next', card, `En réserve : ${owned}`);
      el('div', 'da-tape cs-tag', card, 'Façonner');
      card.addEventListener('click', () => {
        if (!craft(save, r)) return sfx('buzzer');
        sfx('buy');
        ctx.notify('Atelier', r.kind === 'held' ? `${out.name} : à donner à la hutte de Porygon.` : `${out.name} : à poser devant l’atelier.`, CAMP_NPCS.craft);
        ctx.persist();
        void this.render();
      });
    }

    el('div', 'cs-label', main, 'La coupelle à nectar');
    const lure = el('div', 'cs-grid', main);
    const n = save.nectar;
    if (n) {
      const card = el('div', 'cs-card da-paper owned', lure);
      icon(NECTARS[n.id]?.icon ?? 'POKEBALL', card);
      el('div', 'cs-head', card).append(el('b', '', undefined, materialName(n.id)));
      el('small', 'cs-info', card, n.left > 0 ? `Son parfum porte loin : quelqu’un arrivera dans ${n.left} salle${n.left > 1 ? 's' : ''} franchie${n.left > 1 ? 's' : ''} en run.` : 'Ton visiteur attend à côté de la coupelle : va lui parler.');
    } else {
      const owned = Object.keys(NECTARS).filter((id) => (save.materials[id] ?? 0) > 0);
      if (!owned.length) el('p', 'cs-quote wide', lure, 'Aucun nectar en réserve. Façonne-en un, puis pose-le ici : son parfum attire un Pokémon pas encore libéré, d’un type qu’il aime.');
      for (const id of owned) {
        const card = el('div', 'cs-card da-paper', lure);
        icon(NECTARS[id].icon, card);
        el('div', 'cs-head', card).append(el('b', '', undefined, `Poser : ${NECTARS[id].name}`));
        el('small', 'cs-info', card, NECTARS[id].desc);
        el('small', 'cs-next', card, `Un visiteur arrive en ${NECTAR_ROOMS} salles · en réserve : ${save.materials[id]}`);
        card.addEventListener('click', () => void this.placeNectar(id, ctx));
      }
    }
    this.stockGrid(main, save, (Object.entries(BIOME_MATERIAL) as [BiomeId, string][]).map(([b, m]) => [m, BIOMES[b].name]), 'Matériaux en réserve');
  }

  /**
   * Pose un nectar : le visiteur se choisit tout de suite parmi la faune pas
   * encore débloquée (formes de base, pas de légendaire), d'un type qu'il
   * attire. Personne à attirer : le nectar reste en réserve.
   */
  private async placeNectar(id: string, ctx: CampCtx): Promise<void> {
    const save = ctx.save;
    if (save.nectar || (save.materials[id] ?? 0) <= 0) return sfx('buzzer');
    const ids = [...new Set(Object.values(FAUNA).flat())].filter((s) => isBaseForm(s) && !ownsSpecies(save, s) && !LEGENDARY_SPECIES.includes(s));
    const data = await Promise.all(ids.map((s) => species(s)));
    const visitor = pickVisitor(save, id, data.map((d) => ({ id: d.id, types: d.types })));
    if (visitor === null) {
      sfx('buzzer');
      ctx.notify('Atelier', `Plus personne ne viendra pour le ${NECTARS[id].name} : tous ceux qu’il attire vivent déjà au Repaire.`, CAMP_NPCS.craft);
      return;
    }
    save.materials[id]--;
    save.nectar = { id, left: NECTAR_ROOMS, visitor };
    sfx('buy');
    ctx.notify('Nectar posé', `Son parfum se répand : un Pokémon viendra dans ${NECTAR_ROOMS} salles franchies en run.`, CAMP_NPCS.craft);
    ctx.persist();
    // (Le camp se recompose : le nectar apparaît sur sa coupelle.)
    ctx.teamChanged();
    void this.render();
  }

  // ── Équipe ───────────────────────────────────────────────────────────
  private teamTabs(main: HTMLElement): void {
    const tabs = el('div', 'cs-tabs', main);
    for (const [id, label] of [
      ['team', 'Équipe'],
      ['dex', 'Pokédex'],
    ] as const) {
      const t = el('button', this.teamTab === id ? 'sel' : '', tabs, label);
      t.addEventListener('click', () => {
        this.teamTab = id;
        void this.render();
      });
    }
  }

  // ── Pokédex ──────────────────────────────────────────────────────────
  /**
   * La collection (PokedexScreen) : toute espèce qu'on peut débloquer — la
   * faune, les starters, les gardiens de grotte —, plus celles qu'on a
   * croisées ailleurs. Verrouillée, sa silhouette d'encre et les victoires
   * qui lui manquent ; jamais croisée, ni nom ni types.
   *
   * Formes de base seulement (retour de test) : une évolution ne se débloque
   * pas, elle se gagne en faisant évoluer sa lignée en run ; la lister à part
   * promettait une case qu'aucune victoire ne remplit. Elle vit désormais
   * dans la fiche de sa forme de base (la lignée, plus bas), et les comptes
   * du bandeau ne portent que sur les formes de base.
   */
  private async renderDex(main: HTMLElement, ctx: CampCtx): Promise<void> {
    const save = ctx.save;
    const unlocked = new Set(ownedSpecies(save));
    const seen = new Set([...save.seen, ...unlocked, ...Object.keys(save.defeats).map(Number)]);
    const all = [...new Set([...Object.values(FAUNA).flat(), ...STARTER_IDS, ...MERC_POOLS.champion, ...QUEST_SPECIES, ...seen])].filter(isBaseForm).sort((a, b) => a - b);
    const shown = all.filter((id) =>
      this.dexFilter === 'unlocked' ? unlocked.has(id) : this.dexFilter === 'locked' ? seen.has(id) && !unlocked.has(id) : this.dexFilter === 'seen' ? seen.has(id) : true,
    );
    if (!shown.includes(this.dexId)) this.dexId = shown[0] ?? 0;
    // Les noms des espèces croisées seulement : les autres restent « ??? ».
    const names = new Map((await Promise.all(shown.filter((id) => seen.has(id)).map(species))).map((d) => [d.id, d.name]));
    const wins = (id: number) => save.defeats[id] ?? 0;
    // La jauge de la prochaine recrue : victoires depuis la dernière, et le seuil (10, 20, puis de 20 à 40).
    const gauge = (id: number) => `${save.progress[id] ?? 0} / ${recruitThreshold(save, id)}`;
    const waiting = (id: number) => save.candidates.some((c) => c.species === id);

    // Les comptes portent sur la grille (formes de base) : une évolution possédée ou croisée n'y ajoute rien.
    el('div', 'cs-label', main, `${all.filter((id) => unlocked.has(id)).length} débloqués · ${all.filter((id) => seen.has(id)).length} rencontrés · ${all.length} à découvrir`);
    const filters = el('div', 'cs-tabs cs-dex-filters', main);
    for (const [id, label] of DEX_FILTERS) {
      const t = el('button', this.dexFilter === id ? 'sel' : '', filters, label);
      t.addEventListener('click', () => {
        this.dexFilter = id;
        void this.render();
      });
    }
    const wrap = el('div', 'cs-dex', main);
    const grid = el('div', 'cs-dex-grid', wrap);
    if (!shown.length) el('small', 'cs-hint', grid, 'Aucune espèce ici pour l’instant.');
    for (const id of shown) {
      const own = unlocked.has(id);
      const card = el('button', `cs-dex-card${own ? ' own' : ''}${id === this.dexId ? ' sel' : ''}`, grid);
      art(id, card, own ? '' : 'shadow');
      if (this.news.has(String(id))) newMark(card);
      el('small', 'no', card, `n°${String(id).padStart(3, '0')}`);
      el('b', '', card, names.get(id) ?? '???');
      el('small', 'state', card, waiting(id) ? '! Au Repaire' : own ? '★ Débloqué' : questFor(id) ? 'Quête' : !seen.has(id) ? '—' : gauge(id));
      card.addEventListener('click', () => {
        this.dexId = id;
        void this.render();
      });
    }

    // ── Fiche : l'espèce choisie, et ce qu'il faut pour l'avoir.
    const id = this.dexId;
    if (!id) return;
    const own = unlocked.has(id);
    const met = seen.has(id);
    const data = met ? await species(id) : null;
    const card = el('div', 'cs-detail cs-dex-detail da-paper', wrap);
    card.style.setProperty('--c', data ? typeColor(data.types[0]) : 'var(--muted)');
    art(id, card, `cs-big${own ? '' : ' shadow'}`);
    const head = el('div', 'cs-head', card);
    el('b', '', head, data?.name ?? '???');
    for (const t of data?.types ?? []) typePill(t, head);
    el('small', 'cs-info', card, `n°${String(id).padStart(3, '0')}${met ? ` · ${wins(id)} victoire${wins(id) > 1 ? 's' : ''}` : ''}`);
    // Où le trouver, une fois croisé : ses biomes, et les grottes qui le gardent.
    if (met) {
      const { wild, caves } = habitat(id);
      const parts = [...(wild.length ? [`Vit en : ${wild.join(', ')}`] : []), ...(caves.length ? [`Grottes : ${caves.join(', ')}`] : [])];
      el('small', 'cs-info cs-habitat', card, parts.length ? parts.join(' · ') : 'Ne vit dans aucun biome de la Ligue.');
    }
    if (own) {
      // Ses individus au Repaire (plusieurs possibles, chacun sa nature) : le premier arrivé ouvre sa fiche.
      const mine = rosterIds(save).filter((uid) => speciesOf(save, uid) === id);
      const inTeam = mine.filter((uid) => save.team.includes(uid)).length;
      el('p', 'cs-dex-text', card, `${mine.length > 1 ? `${mine.length} au Repaire` : 'Un au Repaire'}${inTeam ? `, dont ${inTeam} dans l’équipe` : ''}.`);
      // Un autre peut venir, avec sa nature à lui : la jauge repart après chaque recrue.
      this.recruitBar(card, save, id, waiting(id));
      const go = el('button', 'cs-dex-go', card, 'Voir dans l’équipe');
      go.addEventListener('click', () => {
        this.teamTab = 'team';
        this.selId = mine[0];
        void this.render();
      });
    } else if (questFor(id)) el('p', 'cs-dex-text', card, `Kangourex le promet à qui remplira sa quête « ${questFor(id)!.name} ».`);
    else if (!met) el('p', 'cs-dex-text', card, 'Pas encore rencontré. Il se cache quelque part dans les biomes de la Ligue.');
    else this.recruitBar(card, save, id, waiting(id));
    if (!own && (MERC_POOLS.champion as readonly number[]).includes(id)) el('p', 'cs-dex-text', card, 'Gardien de grotte : le vaincre le débloque d’office.');
    if (!own && met && Object.values(FAUNA).some((pool) => pool.includes(id))) el('small', 'cs-info', card, 'Libéré d’une grotte, il serait débloqué aussi.');
    await this.lineage(card, id, seen, unlocked);
  }

  /**
   * La lignée d'une forme de base, sous sa fiche : chaque forme suivante, le
   * niveau où elle arrive (data/evolutions.ts, formes sautées comprises :
   * evolutionsOf), son illustration si on l'a croisée, sinon sa silhouette et
   * « ??? » — la même règle que la grille. Une forme possédée (quête, panneau
   * de test) porte l'étoile des cartes débloquées. Récursive : un
   * embranchement empile ses branches (.cs-evo-fork), chacune suivie de sa
   * propre suite ; rien si l'espèce n'évolue pas.
   */
  private async lineage(card: HTMLElement, id: number, seen: ReadonlySet<number>, owned: ReadonlySet<number>): Promise<void> {
    if (!evolutionsOf(id).length) return;
    el('div', 'cs-label cs-evo-label', card, 'Lignée');
    const line = el('div', 'cs-evo', card);
    const stage = async (from: number, parent: HTMLElement): Promise<void> => {
      const steps = evolutionsOf(from);
      if (!steps.length) return;
      // Une seule suite : elle prolonge la rangée ; plusieurs : une colonne de branches.
      const fork = steps.length > 1 ? el('div', 'cs-evo-fork', parent) : parent;
      for (const { level: lvl, next } of steps) {
        const branch = steps.length > 1 ? el('div', 'cs-evo-branch', fork) : fork;
        el('small', 'cs-evo-lvl', branch, `Niv. ${lvl}`);
        const met = seen.has(next);
        const form = el('div', `cs-evo-form${owned.has(next) ? ' own' : ''}`, branch);
        art(next, form, met ? '' : 'shadow');
        el('b', '', form, met ? (await species(next)).name : '???');
        await stage(next, branch);
      }
    };
    await stage(id, line);
  }

  /** La jauge des victoires jusqu'à la prochaine recrue de l'espèce (ou : elle attend au Repaire). */
  private recruitBar(card: HTMLElement, save: Save, id: number, waiting: boolean): void {
    if (waiting) {
      el('p', 'cs-dex-text', card, 'Une recrue de cette espèce t’attend près du feu : va lui parler !');
      return;
    }
    const n = save.progress[id] ?? 0;
    const need = recruitThreshold(save, id);
    const bar = el('div', 'cs-dex-bar', card);
    bar.style.setProperty('--w', `${Math.min(100, (n / need) * 100)}%`);
    el('small', '', bar, `${n} / ${need} victoires`);
    el('p', 'cs-dex-text', card, `Encore ${need - n} victoire${need - n > 1 ? 's' : ''} et l’un d’eux voudra rejoindre la rébellion.`);
  }

  private async renderTeam(main: HTMLElement, ctx: CampCtx): Promise<void> {
    const save = ctx.save;
    const slots = teamSlots(level(save, 'slots'));
    // Les individus (uid), dans l'ordre de leur arrivée ; `spOf` : leur espèce.
    const ids = rosterIds(save);
    if (!ids.includes(this.selId)) this.selId = save.team[0];
    const id = this.selId;
    const spOf = (uid: number) => speciesOf(save, uid);
    const lvl = startLevel(save, id, BASE_TEAM_LEVEL);
    const [kinds, pool, data, mon] = await Promise.all([Promise.all(ownedSpecies(save).map(species)), movePool(id, save), species(spOf(id)), Pokemon.load(spOf(id), lvl, false)]);
    const equipped = await loadout(id, save, pool);
    // Le poids de chacun (équipe et camp), pour l'afficher sur les cartes et peser l'équipe.
    const weights = new Map(await Promise.all(ids.map(async (sid) => [sid, await weigh(sid, save)] as const)));
    const cap = weightCap(save);
    const load = save.team.reduce((s, sid) => s + (weights.get(sid)?.total ?? 0), 0);
    // Le surnom d'abord (donné à la libération), sinon le nom de l'espèce.
    const nameOf = (uid: number) => monName(save, uid, kinds.find((s) => s.id === spOf(uid))?.name ?? `#${spOf(uid)}`);
    const wrap = el('div', 'cs-team', main);

    // ── Colonne de gauche : l'équipe (places achetées), puis les Pokémon restés au camp.
    const col = el('div', 'cs-roster', wrap);
    const label = el('div', 'cs-label', col, `Équipe ${save.team.length}/${slots} · `);
    const gauge = el('span', `cs-weight${load > cap ? ' over' : ''}`, label, `⚖ ${load} / ${cap}`);
    gauge.title = load > cap ? 'Trop lourd pour partir : retire un Pokémon, un objet ou une grosse attaque.' : 'Poids d’équipe : Pokémon (selon le stade), objets tenus et grosses attaques.';
    for (let i = 0; i < slots; i++) {
      const sid = save.team[i];
      const row = el('div', sid === undefined ? 'cs-slot empty' : `cs-slot da-paper${sid === id ? ' sel' : ''}`, col);
      this.dropZone(row, 'mon', (d) => this.dropMonOnSlot(d, i, slots, ctx));
      if (sid === undefined) {
        row.textContent = 'Glisse un Pokémon ici';
        continue;
      }
      art(spOf(sid), row);
      if (this.news.has(String(sid))) newMark(row);
      const txt = el('div', '', row);
      el('b', '', txt, nameOf(sid));
      el('small', '', txt, `${i === 0 ? '★ Mène · ' : ''}N.${startLevel(save, sid, BASE_TEAM_LEVEL)} · ⚖ ${weights.get(sid)?.total ?? '?'}`);
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
    el('div', 'cs-label', col, `Au camp · ${ids.length}/${capacity(save)} libérés au Repaire`);
    const bench = el('div', 'cs-bench', col);
    this.dropZone(bench, 'mon', (d) => {
      if (d.kind !== 'mon' || d.from !== 'team' || save.team.length < 2) return;
      save.team = save.team.filter((x) => x !== d.id);
      this.commitTeam(ctx);
    });
    for (const uid of ids.filter((u) => !save.team.includes(u))) {
      // Parti en mission chez Démolosse : on le voit, grisé, mais il ne peut pas entrer dans l'équipe.
      const away = busy(save, uid);
      const chip = el('div', `cs-chip${uid === id ? ' sel' : ''}${away ? ' away' : ''}`, bench);
      art(spOf(uid), chip);
      if (this.news.has(String(uid))) newMark(chip);
      el('i', 'cs-wt', chip, `⚖${weights.get(uid)?.total ?? '?'}`);
      const nature = natureText(save.mons[uid].nature);
      chip.title = away ? `${nameOf(uid)} — en mission` : `${nameOf(uid)} — ${nature} — poids ${weights.get(uid)?.total ?? '?'}`;
      if (away) {
        chip.addEventListener('click', () => this.select(uid));
        continue;
      }
      this.dragSource(chip, { kind: 'mon', id: uid, from: 'bench' });
      chip.addEventListener('click', () => this.select(uid));
      // Double-clic (ou Entrée une seconde fois) : il rejoint l'équipe, s'il reste une place.
      chip.addEventListener('dblclick', () => {
        if (save.team.length >= slots) return;
        save.team = [...save.team, uid];
        this.commitTeam(ctx);
      });
    }
    if (save.team.length >= ids.length) el('small', 'cs-hint', bench, 'Tout le monde part !');

    // ── Fiche du Pokémon choisi : qui il est, ses statistiques, ses attaques, son objet.
    const inTeam = save.team.includes(id);
    const card = el('div', 'cs-detail da-paper', wrap);
    card.style.setProperty('--c', typeColor(data.types[0]));
    art(spOf(id), card, 'cs-big');
    const head = el('div', 'cs-head', card);
    // Le nom se renomme sur place : vide (ou le nom de l'espèce), plus de surnom.
    const nick = el('input', 'cs-nick', head) as HTMLInputElement;
    nick.type = 'text';
    nick.maxLength = NICK_MAX;
    nick.spellcheck = false;
    nick.placeholder = data.name;
    const indiv = save.mons[id];
    nick.value = nick.defaultValue = indiv.name ?? '';
    nick.title = 'Cliquer pour le renommer';
    nick.addEventListener('change', () => {
      const v = nick.value.trim();
      if (v && v !== data.name) indiv.name = v;
      else delete indiv.name;
      ctx.persist();
      void this.render();
    });
    for (const t of data.types) typePill(t, head);
    const where = inTeam ? (save.team[0] === id ? 'mène l’équipe' : 'dans l’équipe') : busy(save, id) ? 'en mission' : 'reste au camp';
    const from = originText(save, id);
    el('small', 'cs-info', card, `${indiv.name ? `${data.name} · ` : ''}N.${lvl} au départ · ${where}${from ? ` · ${from}` : ''}`);
    // Ce qui le distingue d'un autre de son espèce (meta/mons.ts) : sa nature et ses talents.
    const stars = talentStars(indiv);
    const trait = el('small', 'cs-info cs-nature', card, `Nature : ${natureText(indiv.nature)} · Talent ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}`);
    trait.title = TRAIT_STATS.map((k) => `${TRAIT_LABEL[k]} +${indiv.iv[k]} %`).join(' · ');
    const w = weights.get(id);
    if (w) el('small', 'cs-info cs-weigh', card, `⚖ Poids ${w.total} : Pokémon ${w.mon} · attaques ${w.moves} · objet ${w.item}`);

    // Statistiques au départ, nature, talents, objet tenu et Vitalité compris (comme main.ts les applique).
    const item = heldItem(save.held[id]);
    const vigor = 1 + 0.08 * level(save, 'vigor');
    applyTraits(mon, indiv);
    applyHeld(mon, item);
    if (vigor > 1) mon.boostMaxHp(vigor);
    // Ce que l'objet relève (un malus, comme celui de l'Orbe Vie, ne s'allume pas).
    const ups = new Set(item ? heldBoosts(item).filter(([, m]) => m > 1).map(([st]) => st) : []);
    const stats = el('div', 'cs-stats', card);
    const rows: [string, number, boolean][] = [
      ['PV', mon.maxHp, ups.has('hp') || vigor > 1],
      ['ATT', mon.attack, ups.has('atk')],
      ['DÉF', mon.defense, ups.has('def')],
      ['ATT.S', mon.spAttack, ups.has('spAtk')],
      ['DÉF.S', mon.spDefense, ups.has('spDef')],
      ['VIT', mon.speed, ups.has('speed')],
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
      // Les grosses frappes pèsent (meta/weight.ts) ; les faibles et les statuts, rien.
      const mw = moveWeight(m.power);
      if (mw) el('i', 'wt', row, `⚖${mw}`);
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
      b.title = `${it.name} — ${heldText(it)}`;
      b.addEventListener('click', () => {
        save.held[id] = it.api;
        ctx.persist();
        void this.render();
      });
    }
    if (!HELD_ITEMS.some((it) => (save.items[it.api] ?? 0) > 0)) el('small', 'cs-info', items, `Aucun en réserve : Miaouss en vend, au marché${save.built.includes('atelier') ? ', et Queulorior en façonne, à l’atelier' : ''}.`);

    // Super Bonbon : +5 niveaux de départ, tant qu'il en reste et qu'on n'a pas atteint +20.
    // Écart voulu (retour de test) : il se retire comme un objet tenu, et revient en réserve —
    // changer d'équipe ne demande plus de racheter des Bonbons de plus en plus chers.
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
        save.candied[id] = (save.candied[id] ?? 0) + 1;
        ctx.notify('Super Bonbon', `${nameOf(id)} partira au niveau ${lvl + CANDY.step}.`, spOf(id));
        this.commitTeam(ctx);
      });
      if ((save.candied[id] ?? 0) > 0) {
        const back = el('button', 'cs-candy-back', row, 'Retirer') as HTMLButtonElement;
        back.title = `Le Super Bonbon revient en réserve : ${data.name} repartira au niveau ${lvl - CANDY.step}.`;
        back.addEventListener('click', () => {
          save.items['rare-candy'] = candies + 1;
          save.levels[id] = Math.max(0, bonus - CANDY.step);
          save.candied[id]--;
          if (save.levels[id] <= 0) delete save.levels[id];
          if (save.candied[id] <= 0) delete save.candied[id];
          ctx.notify('Super Bonbon', `Retiré : ${nameOf(id)} partira au niveau ${lvl - CANDY.step}. Le Bonbon attend en réserve.`, spOf(id));
          this.commitTeam(ctx);
        });
      }
    }
  }

  private select(id: number): void {
    this.selId = id;
    void this.render();
  }

  /** Un Pokémon déposé sur la place i de l'équipe : il y entre, ou y change de place (le premier mène). */
  private dropMonOnSlot(d: Drag, i: number, slots: number, ctx: CampCtx): void {
    if (d.kind !== 'mon' || busy(ctx.save, d.id)) return;
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
    el('p', 'cs-quote wide', grid, 'Une CS se garde pour toujours, et toute l’équipe en profite. Surf ouvre le lac du Repaire ; Coupe et Éclate-Roc ouvrent, en run, les alcôves où dorment les coffres.');
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
            ctx.notify(`CS ${c.name}`, c.id === 'surf' ? 'Ton équipe sait nager : le lac et son île t’attendent.' : c.id === 'cut' ? 'Les arbustes ne gardent plus les coffres : [E] devant pour couper.' : c.id === 'rock-smash' ? 'Les rochers fissurés ne gardent plus les coffres : [E] devant pour briser.' : c.desc, STATIONS.upgrades.id);
            ctx.teamChanged();
          }),
        );
      }
    }
  }

  // ── Aménagements ─────────────────────────────────────────────────────
  private renderBuilder(main: HTMLElement, ctx: CampCtx): void {
    const built = ctx.save.built;
    // Ce qu'il a en tête : la forêt de l'ouest, puis celle de l'est, puis le bourg.
    const quote = built.includes('eastglade')
      ? 'Deux clairières, des maisons, des jardins… Chaque libéré a sa place ici. Un bourg pavé à l’est, et le Repaire deviendrait une vraie petite ville.'
      : built.includes('houses')
        ? 'La clairière de l’ouest est pleine de vie. Derrière la hutte de l’équipe, à l’est, il reste de la forêt… on pourrait encore s’agrandir.'
        : built.includes('clearing')
          ? 'La clairière est à nous : un champ, des maisons, et le camp nourrira tout le monde.'
          : 'Chaque construction fait venir des libérés au camp. Ce qui est bâti l’est pour de bon. Et cette forêt, à l’ouest… on pourrait la défricher.';
    // (Démolosse n'est de bon conseil qu'une fois son poste bâti.)
    const supply = built.includes('outpost') ? ' Pour le bois, la pierre et les vivres, fouille les coffres en run, ou demande à Démolosse.' : ' Pour le bois, la pierre et les vivres, fouille les coffres en run.';
    el('p', 'cs-quote', main, quote + supply);
    const grid = el('div', 'cs-grid', main);
    // Le champ et les maisons attendent la clairière ; le bourg, celle de
    // l'est. Écart voulu (retour de test) : ce qui attend un chantier ne se
    // montre pas, et n'apparaît qu'une run après qu'il est bâti — la suite se
    // découvre au fil des runs, pas d'un coup. Le bâti passe en dernier.
    const shown = buildingsShown(ctx.save);
    const waiting = BUILDINGS.some((b) => !built.includes(b.id) && !shown.includes(b) && b.needs && built.includes(b.needs));
    for (const b of [...shown].sort((x, y) => Number(built.includes(x.id)) - Number(built.includes(y.id)))) {
      const done = built.includes(b.id);
      if (done && waiting && b === shown.find((x) => built.includes(x.id))) this.builderTeaser(grid);
      // Un chantier se paie en Baies (`price`) ou en ressources (`cost`), jamais les deux.
      const price = b.price ?? 0;
      const card = el('div', `cs-card cs-build da-paper${done ? ' owned' : ctx.save.baies < price || !canAfford(ctx.save.resources, b.cost) ? ' poor' : ''}`, grid);
      art(b.art, card, 'cs-icon cs-build-art');
      if (this.news.has(b.id)) newMark(card);
      el('div', 'cs-head', card).append(el('b', '', undefined, b.name));
      el('small', 'cs-info', card, b.desc);
      if (done) el('div', 'da-tape cs-tag', card, 'Bâti');
      else {
        if (b.cost) resRow(b.cost, card, 'cs-cost', ctx.save.resources);
        if (price) el('div', 'da-stamp cs-price', card, String(price));
        card.addEventListener('click', () =>
          this.buy(price, () => {
            const before = stationId('builder', built);
            built.push(b.id);
            ctx.save.builtAt[b.id] = ctx.save.runs;
            const now = stationId('builder', built);
            // Le bâtisseur évolue au troisième et au sixième chantier.
            if (now !== before) void species(now).then((sp) => ctx.notify('Évolution', `Le bâtisseur a évolué en ${sp.name} !`, now));
            ctx.notify('Aménagement', `${b.name} : c’est bâti. Va voir !`, now);
            ctx.teamChanged();
          }, b.cost),
        );
      }
    }
    if (waiting && !shown.some((b) => built.includes(b.id))) this.builderTeaser(grid);
  }

  /** Une carte « la suite après ta prochaine run », avant le déjà bâti. */
  private builderTeaser(grid: HTMLElement): void {
    const card = el('div', 'cs-card cs-build da-paper soon', grid);
    el('div', 'cs-icon cs-build-art cs-teaser', card, '?');
    el('div', 'cs-head', card).append(el('b', '', undefined, 'D’autres idées…'));
    el('small', 'cs-info', card, 'Le bâtisseur a de nouveaux plans en tête. Reviens après ta prochaine run.');
    el('div', 'da-tape cs-tag', card, 'Prochaine run');
  }

  // ── Missions ─────────────────────────────────────────────────────────
  // Le tableau de Démolosse (ExpeditionBoardScreen.gd) : une carte par
  // emplacement, puis l'envoi en deux temps — quelle mission, qui part.
  // ── Quêtes ───────────────────────────────────────────────────────────
  /**
   * Les quêtes de Kangourex (meta/quests.ts), une carte chacune : le Pokémon
   * promis en silhouette tant qu'on ne l'a pas gagné, la progression des
   * quêtes en cours, et le geste du moment — accepter, réclamer — au tampon.
   * Abandonner est un bouton à part : un clic sur la carte ne perd rien.
   */
  private async renderQuests(main: HTMLElement, ctx: CampCtx): Promise<void> {
    const save = ctx.save;
    const full = save.quests.active.length >= MAX_ACTIVE;
    const grid = el('div', 'cs-grid', main);
    el('p', 'cs-quote wide', grid, `Accepte une quête, puis remplis-la en run : rien ne compte avant de l’avoir acceptée. ${MAX_ACTIVE} à la fois, pas plus. (${save.quests.active.length} / ${MAX_ACTIVE} en cours.)`);
    // Les noms des Pokémon déjà gagnés seulement : les autres restent une surprise.
    const names = new Map((await Promise.all(QUESTS.filter((q) => questState(save, q.id) === 'done').map((q) => species(q.reward)))).map((d) => [d.id, d.name]));
    const order = { ready: 0, active: 1, open: 2, done: 3 } as const;
    for (const q of [...QUESTS].sort((a, b) => order[questState(save, a.id)] - order[questState(save, b.id)])) {
      const state = questState(save, q.id);
      const n = save.quests.progress[q.id] ?? 0;
      const locked = state === 'open' && full;
      const card = el('div', `cs-card da-paper cs-mission cs-quest q-${state}${locked ? ' soon' : ''}`, grid);
      art(q.reward, card, `cs-icon${state === 'done' ? '' : ' shadow'}`);
      if (state === 'ready') newMark(card);
      el('div', 'cs-head', card).append(el('b', '', undefined, q.name));
      el('small', 'cs-info', card, q.desc);
      el('small', 'cs-next', card, state === 'done' ? `★ ${names.get(q.reward) ?? '…'} a rejoint la rébellion` : `Récompense : ${q.legendary ? 'un Pokémon légendaire' : 'un Pokémon rare'}`);
      if (state === 'active' || state === 'ready') {
        const bar = el('div', 'cs-dex-bar', card);
        bar.style.setProperty('--w', `${Math.min(100, (n / q.goal) * 100)}%`);
        el('small', '', bar, `${n} / ${q.goal}`);
      }
      if (state === 'done') el('div', 'da-tape cs-tag', card, 'Accomplie');
      else if (locked) el('div', 'da-tape cs-tag', card, `${MAX_ACTIVE} en cours`);
      else if (state === 'open') {
        el('div', 'da-stamp cs-price', card, 'Accepter');
        card.addEventListener('click', () => {
          if (!acceptQuest(save, q.id)) return;
          ctx.persist();
          ctx.notify('Quête acceptée', `${q.name} : ${q.desc}`, CAMP_NPCS.quests);
          void this.render();
        });
      } else if (state === 'ready') {
        el('div', 'da-stamp cs-price', card, 'Réclamer');
        card.addEventListener('click', () => {
          const id = claimQuest(save, q.id);
          if (id === null) return;
          // Repaire plein : il attend près du feu qu'on lui fasse de la place.
          welcomeMon(save, id, 'quest');
          ctx.persist();
          void species(id).then((d) => ctx.notify('Quête accomplie', `★ ${d.name} rejoint la rébellion !`, id));
          // Le nouveau venu s'installe au camp, parmi les libérés.
          ctx.teamChanged();
          void this.render();
        });
      } else {
        const drop = el('button', 'cs-recall', card, 'Abandonner');
        drop.title = 'Sa progression est perdue.';
        drop.addEventListener('click', (e) => {
          e.stopPropagation();
          abandonQuest(save, q.id);
          ctx.persist();
          void this.render();
        });
      }
    }
  }

  private async renderMissions(main: HTMLElement, ctx: CampCtx): Promise<void> {
    const save = ctx.save;
    const nameOf = async (pid: number) => monName(save, pid, (await species(speciesOf(save, pid))).name);
    const go = (sending: typeof this.sending) => {
      this.sending = sending;
      this.navIndex = -1;
      void this.render();
    };
    const sending = this.sending;
    if (sending) {
      const tabs = el('div', 'cs-tabs', main);
      el('button', '', tabs, '← Retour').addEventListener('click', () => go(sending.type ? { slot: sending.slot } : null));
    }
    const grid = el('div', 'cs-grid', main);

    // Deuxième temps : qui part ? (Ceux de l'équipe en sortent ; le dernier reste.)
    if (sending?.type) {
      const m = mission(sending.type);
      el('p', 'cs-quote wide', grid, `${m.name} : qui part ? Il sera de retour dans ${m.rooms} salles franchies en run.`);
      const pids = available(save);
      const names = await Promise.all(pids.map(nameOf));
      if (!pids.length) el('p', 'cs-quote wide', grid, 'Personne de libre : garde au moins un Pokémon dans l’équipe.');
      pids.forEach((pid, k) => {
        // L'entraînement ne sert plus à qui a déjà tous ses niveaux de départ (plafond du Super Bonbon).
        const maxed = !!m.levels && (save.levels[pid] ?? 0) >= CANDY.max;
        const card = el('div', `cs-card da-paper cs-mission${maxed ? ' soon' : ''}`, grid);
        art(speciesOf(save, pid), card, 'cs-icon');
        el('div', 'cs-head', card).append(el('b', '', undefined, names[k]));
        el('small', 'cs-info', card, `N.${startLevel(save, pid, BASE_TEAM_LEVEL)}${save.team.includes(pid) ? ' · dans l’équipe — il en sortira' : ''}`);
        if (maxed) el('div', 'da-tape cs-tag', card, 'Au max');
        else
          card.addEventListener('click', () => {
            if (!send(save, sending.slot, m.id, pid)) return;
            ctx.persist();
            ctx.notify('Mission', `${names[k]} part : ${m.name}. Retour dans ${m.rooms} salles.`, CAMP_NPCS.missions);
            ctx.teamChanged();
            go(null);
          });
      });
      return;
    }

    // Premier temps : quelle mission ?
    if (sending) {
      el('p', 'cs-quote wide', grid, 'Quelle mission ? Plus elle est longue, plus elle rapporte.');
      for (const m of MISSIONS) {
        const ok = missionOpen(save, m);
        const card = el('div', `cs-card da-paper cs-mission${ok ? '' : ' soon'}`, grid);
        this.missionIcon(m, card);
        el('div', 'cs-head', card).append(el('b', '', undefined, m.name));
        el('small', 'cs-info', card, m.desc);
        this.rewardRow(m, card, `${m.rooms} salles`);
        if (!ok) el('div', 'da-tape cs-tag', card, 'Terrain requis');
        else card.addEventListener('click', () => go({ slot: sending.slot, type: m.id }));
      }
      return;
    }

    // Le tableau : une carte par emplacement.
    el('p', 'cs-quote wide', grid, 'Une mission avance à chaque salle franchie en run. Au retour, viens récolter ici. Un Pokémon parti ne peut pas entrer dans l’équipe.');
    const slots = missionSlots(save);
    for (let i = 0; i < slots; i++) {
      const slot = save.missions[i];
      if (!slot) {
        // Écart voulu : « Place libre » ne parlait pas (retour de test) ; la
        // carte dit ce qu'on y fait, avec ce que ça peut rapporter.
        const card = el('div', 'cs-card da-paper cs-mission cs-free', grid);
        el('div', 'cs-icon cs-mission-ico cs-free-ico', card, '+');
        el('div', 'cs-head', card).append(el('b', '', undefined, 'Lancer une mission'));
        el('small', 'cs-info', card, 'Personne n’est en route ici : envoie un libéré rapporter…');
        const row = el('div', 'cs-cost', card);
        for (const r of RESOURCE_IDS) resIcon(r, el('span', 'cs-res', row));
        icon('ORANBERRY', el('span', 'cs-res', row), 'cs-res-ico');
        el('div', 'da-stamp cs-price', card, 'Envoyer');
        card.addEventListener('click', () => go({ slot: i }));
        continue;
      }
      const m = mission(slot.type);
      const done = slot.left <= 0;
      const name = await nameOf(slot.pid);
      const card = el('div', `cs-card da-paper cs-mission${done ? ' done' : ' away'}`, grid);
      art(speciesOf(save, slot.pid), card, 'cs-icon');
      if (done) newMark(card);
      el('div', 'cs-head', card).append(el('b', '', undefined, done ? `${name} est rentré !` : m.name));
      el('small', 'cs-info', card, done ? `${m.name} :` : name);
      this.rewardRow(m, card);
      const pips = el('div', 'cs-pips', card);
      for (let k = 0; k < m.rooms; k++) el('i', k < m.rooms - slot.left ? 'on' : '', pips);
      if (done) {
        el('div', 'da-stamp cs-price', card, 'Récolter');
        card.addEventListener('click', () => {
          if (!collect(save, i)) return;
          ctx.persist();
          ctx.notify('Mission', `${name} rapporte ${rewardText(m)}.`, speciesOf(save, slot.pid));
          ctx.teamChanged();
          void this.render();
        });
      } else {
        // Rappeler : un bouton à part, pour qu'un clic sur la carte ne gâche pas des salles de route.
        const back = el('button', 'cs-recall', card, 'Rappeler');
        back.title = 'Il rentre tout de suite, les mains vides.';
        back.addEventListener('click', () => {
          recall(save, i);
          ctx.persist();
          ctx.teamChanged();
          void this.render();
        });
      }
    }
    if (!save.built.includes('dorm')) {
      const card = el('div', 'cs-card da-paper cs-mission soon', grid);
      el('div', 'cs-head', card).append(el('b', '', undefined, 'Une place de plus'));
      el('small', 'cs-info', card, 'Avec le Dortoir du bâtisseur, Démolosse mène une mission de plus.');
      el('div', 'da-tape cs-tag', card, 'Dortoir');
    }
  }

  /** Ce que rapporte une mission, en icônes (« 6 [vivres] ») plutôt qu'en mots, et `tail` à la suite. */
  private rewardRow(m: Mission, card: HTMLElement, tail?: string): void {
    const row = m.res ? resRow(m.res, card, 'cs-cost cs-reward') : el('div', 'cs-cost cs-reward', card);
    if (!m.res) {
      const chip = el('span', 'cs-res', row);
      chip.title = m.levels ? 'Niveaux de départ' : 'Baies';
      el('b', '', chip, m.levels ? `+${m.levels} N.` : String(m.baies ?? 0));
      icon(m.levels ? CANDY.icon : 'ORANBERRY', chip, 'cs-res-ico');
    }
    if (tail) el('small', 'cs-next', row, `· ${tail}`);
  }

  /** L'icône d'une mission : sa ressource, une baie, ou le Super Bonbon de l'entraînement. */
  private missionIcon(m: Mission, card: HTMLElement): void {
    const r = Object.keys(m.res ?? {})[0] as ResourceId | undefined;
    const box = el('div', 'cs-icon cs-mission-ico', card);
    if (r) resIcon(r, box);
    else icon(m.levels ? CANDY.icon : 'ORANBERRY', box, 'cs-res-ico');
  }

  // ── En ligne (Roucarnage) ────────────────────────────────────────────
  /**
   * Le relais de Roucarnage (net/net.ts) : héberger une partie (un code à
   * donner) ou en rejoindre une. Chacun emmène un seul Pokémon, le meneur de
   * son équipe ; l'hôte lance la run quand tout le monde est là.
   */
  private renderOnline(main: HTMLElement, ctx: CampCtx): void {
    const save = ctx.save;
    el('p', 'cs-quote', main, 'Jusqu’à six rebelles dans la même run : l’hôte ouvre son Repaire et donne son code, les autres l’y rejoignent et s’y promènent avec lui. Chacun emmène un Pokémon à lui : le meneur de sa propre équipe.');
    if (net.status) el('p', 'cs-load over', main, net.status);
    if (net.role === 'off') {
      const grid = el('div', 'cs-online', main);
      const host = el('div', 'cs-card da-paper', grid);
      el('div', 'cs-head', host).append(el('b', '', undefined, 'Héberger une partie'));
      el('small', 'cs-info', host, 'Ouvre le relais : un code s’affiche, à donner à tes alliés.');
      const open = el('button', 'cs-net-btn', host, 'Ouvrir la partie') as HTMLButtonElement;
      open.addEventListener('click', () => {
        sfx('click', -6);
        open.disabled = true;
        // La partie ouverte, l'écran reste là : le code et son QR code à montrer (retour de test :
        // « un QR code, comme ça les gens n'ont qu'à scanner »). Le code reste aussi affiché en haut
        // (ui/netbadge.ts) une fois l'écran fermé, pour se promener en attendant ses alliés.
        void ctx.online.loadout().then((lo) => net.host(lo));
      });
      const join = el('div', 'cs-card da-paper', grid);
      el('div', 'cs-head', join).append(el('b', '', undefined, 'Rejoindre une partie'));
      el('small', 'cs-info', join, 'Entre le code de l’hôte : tu arrives dans son Repaire.');
      const code = el('input', 'cs-code', join) as HTMLInputElement;
      code.placeholder = 'CODE';
      code.maxLength = 5;
      code.value = this.joinCode;
      code.autocomplete = 'off';
      code.spellcheck = false;
      const go = el('button', 'cs-net-btn', join, 'Rejoindre') as HTMLButtonElement;
      const tryJoin = () => {
        const c = cleanCode(code.value);
        this.joinCode = c;
        if (c.length < 5 || go.disabled) return;
        sfx('click', -6);
        go.disabled = true;
        void ctx.online.loadout().then((lo) => net.join(c, lo));
      };
      code.addEventListener('input', () => {
        code.value = cleanCode(code.value);
        this.joinCode = code.value;
      });
      // Entrée dans le champ le quitte (this.keys) : le changement suffit à lancer la connexion.
      code.addEventListener('change', tryJoin);
      go.addEventListener('click', tryJoin);
      const lead = save.team[0];
      if (lead !== undefined) {
        const who = el('div', 'cs-net-lead', main);
        art(speciesOf(save, lead), who);
        void species(speciesOf(save, lead)).then((d) => el('span', '', who, `Tu partiras avec ${monName(save, lead, d.name)}, N.${startLevel(save, lead, BASE_TEAM_LEVEL)} (le meneur de ton équipe, à changer à la hutte de Porygon).`));
      }
      return;
    }
    // Dans une partie : le code, les joueurs, et de quoi lancer ou partir.
    const box = el('div', 'cs-net-room da-paper', main);
    el('small', '', box, net.role === 'host' ? 'Ton code de partie' : 'Partie');
    el('b', 'cs-net-code', box, net.code || '…');
    if (net.role === 'host' && net.code) {
      el('small', '', box, 'Donne ce code à tes alliés, ou fais-leur scanner le QR code : ils arrivent dans ton Repaire.');
      const link = inviteUrl(net.code);
      const qr = el('div', 'cs-net-qr', box);
      qr.append(qrSvg(link));
      const copy = el('button', 'cs-net-btn', qr, 'Copier le lien') as HTMLButtonElement;
      copy.addEventListener('click', () => {
        sfx('click', -6);
        void navigator.clipboard?.writeText(link).then(
          () => (copy.textContent = 'Lien copié !'),
          () => (copy.textContent = link),
        );
      });
    }
    if (net.role === 'client') el('small', '', box, 'Tu es dans le Repaire de l’hôte. Ton Pokémon : le meneur de ton équipe, à choisir chez Porygon.');
    const list = el('div', 'cs-lineup cs-net-players', main);
    for (const p of net.players) {
      const fig = el('div', p.host ? 'lead' : '', list);
      if (p.loadout) {
        art(p.loadout.species, fig);
        el('b', '', fig, p.loadout.name);
        el('small', '', fig, `N.${p.loadout.level}${p.host ? ' · hôte' : ''}${p.id === net.id ? ' · toi' : ''}`);
      } else el('b', '', fig, '…');
    }
    for (let i = net.players.length; i < MAX_PLAYERS; i++) el('div', 'cs-net-empty', list, '?');
    const row = el('div', 'cs-net-row', main);
    if (net.role === 'host') {
      const go = el('button', 'cs-go', row) as HTMLButtonElement;
      go.disabled = !net.guests.length || !net.code;
      el('span', 'cs-go-word', go, 'Lancer la run');
      el('span', 'cs-go-arrow', go, '➜');
      go.addEventListener('click', () => {
        if (!net.guests.length || !this.open) return;
        this.open = false;
        this.root?.remove();
        this.root = null;
        ctx.online.start();
      });
      if (!net.guests.length) el('small', 'cs-info', row, 'En attente d’un allié…');
      if (net.guests.length) el('small', 'cs-info', row, 'Ou parle à Dracolosse : il emmène tout le monde.');
    } else el('p', 'cs-info', row, 'En attente : l’hôte lance la run (ici ou chez Dracolosse) quand tout le monde est là.');
    const quit = el('button', 'cs-net-btn quit', row, net.role === 'host' ? 'Fermer la partie' : 'Quitter la partie');
    quit.addEventListener('click', () => {
      sfx('click', -6);
      net.leave();
    });
  }

  // ── Leçons (Bouldeneu) ───────────────────────────────────────────────
  /**
   * Les mécaniques du jeu, par chapitre (data/lore.ts) : une carte de papier
   * par notion. Les types se lisent dans TYPE_CHART même, pour ne jamais
   * mentir sur une efficacité.
   */
  private renderLore(main: HTMLElement): void {
    const chapters: LoreChapter[] = [...LORE.slice(0, 2), TYPES_CHAPTER, ...LORE.slice(2)];
    const tabs = el('div', 'cs-tabs lore-tabs', main);
    for (const c of chapters) {
      const t = el('button', this.loreTab === c.id ? 'sel' : '', tabs, c.title);
      t.addEventListener('click', () => {
        this.loreTab = c.id;
        sfx('click', -6);
        void this.render().then(() => {
          const m = this.root?.querySelector('.cs-main');
          if (m) m.scrollTop = 0;
        });
      });
    }
    const chapter = chapters.find((c) => c.id === this.loreTab) ?? chapters[0];
    el('p', 'cs-quote', main, chapter.intro);
    const grid = el('div', 'cs-grid lore-grid', main);
    if (chapter === TYPES_CHAPTER) return this.typeCards(grid);
    for (const card of chapter.cards) {
      const c = el('div', 'cs-card da-paper lore-card', grid);
      if (card.color) c.style.setProperty('--c', card.color);
      const head = el('div', 'cs-head', c);
      el('b', '', head, card.title);
      if (card.type) typePill(card.type, head);
      el('p', 'lore-text', c, card.text);
    }
  }

  /** Une carte par type : ce qu'il frappe fort, mal, pas du tout. */
  private typeCards(grid: HTMLElement): void {
    const list = (t: string, f: (m: number) => boolean) =>
      Object.entries(TYPE_CHART[t] ?? {})
        .filter(([, m]) => f(m))
        .map(([d]) => TYPE_FR[d] ?? d)
        .join(', ');
    for (const t of Object.keys(TYPE_CHART)) {
      const c = el('div', 'cs-card da-paper lore-card', grid);
      c.style.setProperty('--c', typeColor(t));
      typePill(t, el('div', 'cs-head', c));
      const p = el('p', 'lore-text', c);
      const rows: [string, string][] = [
        ['Super efficace (×2) sur', list(t, (m) => m > 1)],
        ['Peu efficace (×0,5) sur', list(t, (m) => m > 0 && m < 1)],
        ['Sans effet sur', list(t, (m) => m === 0)],
      ];
      for (const [label, v] of rows) {
        if (!v) continue;
        const line = el('span', 'lore-line', p);
        el('b', '', line, `${label} : `);
        line.append(v);
      }
    }
  }

  // ── Départ ───────────────────────────────────────────────────────────
  private async renderStart(main: HTMLElement, ctx: CampCtx): Promise<void> {
    const save = ctx.save;
    // Les débloqués n'ont pas leur nom dans PLAYER_SPECIES : on lit les fiches d'espèce.
    const names = await Promise.all(save.team.map((uid) => species(speciesOf(save, uid)).then((d) => monName(save, uid, d.name))));
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
      art(speciesOf(save, sid), fig);
      const held = heldItem(save.held[sid]);
      if (held) icon(held.icon, fig, 'cs-held');
      el('b', '', fig, names[i]);
      el('small', '', fig, `N.${startLevel(save, sid, BASE_TEAM_LEVEL)}`);
    });
    const perks = el('div', 'cs-perks', main);
    const purse = level(save, 'purse');
    const xp = level(save, 'xp');
    const vigor = level(save, 'vigor');
    const revives = level(save, 'revives');
    const dash = level(save, 'dash');
    for (const t of [purse && `${purse * 100} ₽ en poche`, xp && `XP +${xp * 20} %`, vigor && `PV max +${vigor * 8} %`, revives && `${revives} Rappel${revives > 1 ? 's' : ''} pour l’équipe`, dash && `${dash + 1} dash`].filter(Boolean)) {
      el('span', 'da-tape', perks, String(t));
    }
    const w = await teamWeight(save);
    const over = w.total > w.cap;
    el('p', `cs-load${over ? ' over' : ''}`, main, over ? `⚖ Poids ${w.total} / ${w.cap} — trop lourd : allège l’équipe à la hutte de Porygon, ou monte le plafond chez Alakazam.` : `⚖ Poids ${w.total} / ${w.cap}`);
    const go = el('button', `cs-go${over ? ' heavy' : ''}`, main) as HTMLButtonElement;
    go.disabled = over;
    el('span', 'cs-go-word', go, 'Partir');
    el('span', 'cs-go-arrow', go, '➜');
    el('kbd', '', go, 'Entrée');
    go.addEventListener('click', () => void this.depart());
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
