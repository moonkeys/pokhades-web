import { sfx } from '../audio/audio';
import { loadImage, loadInfo, loadSheet, PLAYER_ACTIONS } from '../assets/pmd';
import type { Rng } from '../core/rng';
import { FAUNA, MERC_POOLS, MERCHANT_SPECIES, SHOP_IDLER, SHOP_STROLLERS, SWIMMERS } from '../data/species';
import { Pokemon } from '../combat/pokemon';
import { typePill } from '../ui/hud';
import { Actor } from '../entities/actor';
import type { InputSample } from '../input/input';
import type { Projector } from '../render/combatfx';
import type { WorldMap } from '../world/generate';
import { TILE, TOWN_DECOR } from '../world/tiles';
import { BIOMES } from '../world/biomes';
import { linesOf } from '../data/bestiary';
import { fillLine, GIFT_LINES, MERCENARY, PERSONAS, SLEEPY } from '../data/chatter';
import { HELD_ITEMS, heldText } from '../meta/catalog';
import { Placer } from './placement';
import type { Run } from './run';

// Boutique de run, reprise de CombatArena.gd (_enter_boutique, étal,
// _buy_near_item, mercenaires, figurants) et de ShopStock.gd : sur la place,
// le marchand derrière son comptoir, et sur le comptoir l'étal — une CT, deux
// soins tirés selon l'acte, un Rappel si un membre est K.O., et « Recharger
// l'étal », de plus en plus cher. On s'approche d'un article, sa fiche
// s'affiche à côté, E l'achète. Autour de la place : l'affiche du prochain
// champion, deux mercenaires à recruter, et des Pokémon de passage — un
// dormeur, un flâneur, une paire qui bavarde, un promeneur — à qui l'on peut
// parler (E). La porte vers le boss est ouverte d'emblée.
//
// Écarts voulus avec le jeu :
// - les articles flottent sur le comptoir sans tourner (vus de haut, la
//   rotation 3D du jeu se lisait comme un objet qui s'écrase) ;
// - recharger l'étal ne rouvre pas la CT déjà achetée (le jeu contournait
//   ainsi sa règle « une capacité par visite »), et la CT achetée quitte l'étal ;
// - pas d'échoppe de rachat (il faudrait un inventaire en run).
//
// Lot de Baies (ShopStock.BERRY_PACKS, porté depuis que le Repaire existe) :
// un par étal, pour convertir des ₽ de run en Baies du Repaire, au taux
// volontairement ingrat du jeu (≈ 0,08 Baie par ₽ ici, les Baies étant
// divisées par trois) : ce qu'on achète quand la run est déjà gagnée ou
// déjà perdue, jamais plus rentable que de quoi survivre.
//
// Objet tenu (ajout, A-FAIRE 1.9 : « un Marchand qui vend aussi des objets ») :
// un par étal, tiré parmi les moins chers du marché du Repaire (≤ 160 Baies),
// à 4 ₽ la Baie de son prix. Il rejoint la réserve du Repaire, à faire tenir
// au retour : l'autre façon de changer des ₽ en butin qui dure.
//
// Solde (CombatArena._collect_merc_retainers) : à la boutique suivante, chaque
// mercenaire encore debout réclame MERC_RETAINER de son prix ; faute de quoi
// il s'en va (main.ts, avant que la place ne se remplisse : la place libérée
// peut servir tout de suite).

/** ShopStock.HEALS : soins vendus en run (heal < 0 : PV au maximum), Rappels (part des PV max). */
const HEALS = {
  potion: { name: 'Potion', heal: 20, price: 40, icon: 'POTION' },
  super_potion: { name: 'Super Potion', heal: 50, price: 90, icon: 'SUPERPOTION' },
  hyper_potion: { name: 'Hyper Potion', heal: 120, price: 160, icon: 'HYPERPOTION' },
  max_potion: { name: 'Potion Max', heal: -1, price: 220, icon: 'MAXPOTION' },
} as const;
const REVIVES = {
  revive: { name: 'Rappel', pct: 0.5, price: 150, icon: 'REVIVE' },
  max_revive: { name: 'Rappel Max', pct: 1, price: 280, icon: 'MAXREVIVE' },
} as const;
type HealId = keyof typeof HEALS;
/** ShopStock.BERRY_PACKS, quantités divisées par trois comme toutes les Baies (lot 3). */
/** ₽ par Baie du prix de l'objet au marché du Repaire, et les objets que l'étal peut proposer. */
const HELD_RATE = 4;
const HELD_FOR_SALE = HELD_ITEMS.filter((h) => !h.crafted && h.price <= 160);

const BERRY_PACKS = [
  { amount: 7, price: 100 },
  { amount: 17, price: 220 },
  { amount: 40, price: 480 },
] as const;
/** CombatArena.BOUTIQUE_MOVE_PRICE */
export const CT_PRICE = 110;
/** Recharger l'étal : 60 × 1,6ⁿ ₽, n = recharges déjà faites à cette visite. */
const rerollPrice = (n: number) => Math.round(60 * 1.6 ** n);
/** Portée d'un article (on se tient devant le comptoir), de l'affiche et d'un Pokémon à qui parler. */
const ITEM_REACH = 1.3;
const POSTER_REACH = 2.2;
const TALK_REACH = 2;
/** Plafond d'une équipe en run (CombatArena.MAX_RUN_TEAM). */
const MAX_TEAM = 6;

/** Part du prix qu'un mercenaire réclame à chaque boutique suivante (CombatArena.MERC_RETAINER). */
export const MERC_RETAINER = 0.5;

/** Rangs des mercenaires (CombatArena.ALLY_RANKS) : décalage de niveau, prix de base, espèces. */
const RANKS = [
  { name: 'Éclaireur', lvl: -2, price: 120, pool: MERC_POOLS.scout },
  { name: 'Vétéran', lvl: 0, price: 260, pool: MERC_POOLS.veteran },
  { name: 'Champion Sauvage', lvl: 3, price: 450, pool: MERC_POOLS.champion },
] as const;

interface Item {
  kind: 'heal' | 'revive' | 'move' | 'reroll' | 'berries' | 'held';
  /** Objet tenu : son identifiant (meta/catalog.ts). */
  held?: string;
  id: string;
  name: string;
  desc: string;
  icon: string;
  price: number;
  /** Soin : PV rendus (< 0 : tous) ; Rappel : part des PV max. */
  heal: number;
  x: number;
  y: number;
  /** Vendu : il monte et s'efface (0 → 1), puis disparaît. */
  sold: number;
  phase: number;
  tag: HTMLElement;
}

/** Un Pokémon de la place : marchand, figurant ou mercenaire. */
interface Npc {
  actor: Actor;
  role: 'merchant' | 'sleeper' | 'idler' | 'chatter' | 'stroller' | 'merc';
  lines: readonly string[];
  talk: number;
  /** Promenade : point d'ancrage, rayon, but courant, pause restante. */
  home: { x: number; y: number };
  radius: number;
  goal: { x: number; y: number };
  wait: number;
  bubble: HTMLElement;
  bubbleT: number;
  /** Mercenaire : rang, niveau, prix, et sa fiche de combat (stats et attaques, pour sa fiche). */
  merc?: { rank: number; level: number; price: number; mon: Pokemon | null; dummy: { x: number; y: number }; trainT: number; hitT: number };
  /** A déjà fait un cadeau (un seul par Pokémon). */
  gifted?: boolean;
}

export interface ShopHost {
  message(text: string): void;
  /** Ouvre le parchemin de la CT ; `paid` est appelé si une attaque est prise. */
  openMoves(price: number, paid: () => void): void;
  openPoster(): void;
  /** L'équipe, pour soigner, ranimer et recruter. */
  team(): readonly Actor[];
  /** Un lot de Baies acheté : versées au Repaire. */
  earnBaies(n: number): void;
  /** Un objet tenu acheté : versé à la réserve du Repaire ; false s'il n'y a pas de Repaire (invité). */
  giveItem(api: string): boolean;
  /** Un mercenaire rejoint l'équipe, là où il se tient. */
  recruit(id: number, level: number, x: number, y: number, price: number): void;
}

/** CombatArena.gd:4770-4804 et NpcDialogue.gd:65-80. */
const LINES = {
  merchant: [
    'Ah, un rebelle affamé de provisions ! Tu es au bon endroit.',
    'Sers-toi : tout ce qui flotte sur mon comptoir est à vendre. Le prix est marqué dessus.',
    'Approche-toi de ce qui t’intéresse, on s’arrangera.',
  ],
  idler: ['Oh… bonjour… ou bonsoir… je ne sais plus trop.', 'Tu cherches quelque chose ? Moi aussi, je crois.', '…Enfin bref.', '{champion} ? C’est qui, déjà ? …Ah oui. Lui.'],
};
/** Bulles de la paire qui bavarde (CombatArena.gd:4955-4990). */
const EMOTES = ['…', '!', '♪', '?', '♥', '~'];

export class Shop {
  active = false;
  /** Les Pokémon de la place, à dessiner avec les autres. */
  readonly npcs: Actor[] = [];
  private people: Npc[] = [];
  /** Où poser les figurants, le mannequin et l'affiche (cases libres, visibles, inoccupées). */
  private place: Placer | null = null;
  /** Cadeaux faits à cette visite (un au plus) et ce qu'il faut pour remplir les répliques. */
  private gifts = 0;
  private vars = { champion: '', zone: '', lead: '' };
  private playerAt = { x: 0, y: 0 };
  private items: Item[] = [];
  private rerolls = 0;
  private ctUsed = false;
  /** Le lot de Baies de l'étal est pris (un par visite, même après une recharge). */
  private berriesBought = false;
  /** L'objet tenu de l'étal est pris (un par visite). */
  private heldBought = false;
  private hub = { x: 0, y: 0 };
  poster = { x: 0, y: 0 };
  private near: Item | null = null;
  private nearPoster = false;
  private nearNpc: Npc | null = null;
  private readonly icons = new Map<string, HTMLImageElement>();
  private readonly layer: HTMLElement;
  private readonly prompt: HTMLElement;
  private rng: Rng | null = null;
  private run: Run | null = null;

  constructor(
    parent: HTMLElement,
    private readonly host: ShopHost,
    /** Atlas du décor : l'affiche est le grand panneau de bois du tileset. */
    private readonly atlas: CanvasImageSource,
  ) {
    this.layer = document.createElement('div');
    this.layer.className = 'room-labels';
    this.prompt = document.createElement('div');
    this.prompt.className = 'shop-prompt da-paper';
    this.prompt.hidden = true;
    parent.append(this.layer, this.prompt);
    for (const f of ['POTION', 'SUPERPOTION', 'HYPERPOTION', 'MAXPOTION', 'REVIVE', 'MAXREVIVE', 'machine_NORMAL', 'COINCASE', 'SITRUSBERRY', ...HELD_FOR_SALE.map((h) => h.icon)]) {
      void loadImage(`/game/assets/essentials/items/${f}.png`)
        .then((img) => this.icons.set(f, img))
        .catch(() => {});
    }
  }

  clear(): void {
    this.active = false;
    this.items = [];
    this.people = [];
    this.place = null;
    this.npcs.length = 0;
    this.layer.replaceChildren();
    this.prompt.hidden = true;
    this.near = null;
    this.nearNpc = null;
  }

  /**
   * Installe la boutique sur la place : le comptoir et le marchand bloquent
   * leurs cases ; l'affiche, les mercenaires et les figurants se posent
   * autour, sur des cases libres.
   */
  start(world: WorldMap, run: Run, rng: Rng): void {
    this.clear();
    this.active = true;
    this.run = run;
    this.rng = rng;
    this.rerolls = 0;
    this.ctUsed = false;
    this.berriesBought = false;
    this.heldBought = false;
    this.hub = { x: Math.floor(world.hub.x) + 0.5, y: Math.floor(world.hub.y) + 0.9 };
    const place = (this.place = new Placer(world));
    const hx = Math.floor(this.hub.x);
    const hy = Math.floor(this.hub.y);
    for (let dx = -4; dx <= 4; dx++) place.block(hx + dx, hy + 1);
    place.block(hx, hy);
    // L'affiche : le grand panneau de bois du tileset, au bord de la place.
    this.poster = place.freeSpot(hx - 5, hy + 5);
    place.block(Math.floor(this.poster.x), Math.floor(this.poster.y));

    // Le marchand derrière son comptoir ; puis les Pokémon de la place, pris dans la faune du
    // biome et répartis sur toute la clairière (CombatArena.gd:4770-4825, figurants).
    this.gifts = 0;
    this.vars = { champion: run.champions[run.act].name, zone: BIOMES[run.biome].name, lead: '' };
    this.addNpc(MERCHANT_SPECIES, 'merchant', 0, 0, 0, LINES.merchant);
    // Chacun son caractère, et ses répliques en découlent (data/chatter.ts) ;
    // une espèce qui a les siennes dans le bestiaire les dit à la place.
    const personas = [...PERSONAS];
    const persona = (id: number) => {
      const p = personas.splice(rng.int(personas.length), 1)[0] ?? PERSONAS[0];
      const lines = linesOf(id) ?? [...p.lines];
      for (let i = lines.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [lines[i], lines[j]] = [lines[j], lines[i]];
      }
      return lines;
    };
    const fauna = (FAUNA[run.biome] as readonly number[]).filter((id) => !SWIMMERS.has(id));
    const pool = [...new Set([...fauna, ...(fauna.length < 8 ? SHOP_STROLLERS : [])])];
    const pick = () => pool.splice(rng.int(pool.length), 1)[0] ?? SHOP_STROLLERS[0];
    // Pas tous à chaque visite : trois à cinq figurants, et la paire qui bavarde deux fois sur trois.
    const extras: (() => void)[] = [
      () => this.addNpc(pick(), 'sleeper', -9, -3, 0, SLEEPY),
      () => this.addNpc(pick(), 'sleeper', 9, 3, 0, SLEEPY),
      () => {
        const id = pick();
        this.addNpc(id, 'idler', 10, -1, 0, persona(id));
      },
      () => this.addNpc(SHOP_IDLER, 'stroller', 5, 6, 2.5, LINES.idler),
      () => {
        const id = pick();
        this.addNpc(id, 'stroller', -4, -6, 3, persona(id));
      },
      () => {
        const id = pick();
        this.addNpc(id, 'stroller', 7, -5, 3, persona(id));
      },
    ];
    for (let n = 3 + rng.int(3); n > 0; n--) extras.splice(rng.int(extras.length), 1)[0]();
    if (rng.chance(0.67)) {
      // La paire qui bavarde : côte à côte sur la même ligne, face à face.
      const duo = place.pairSpot(hx - 8, hy + 5, 2, 1);
      const a = this.addNpc(pick(), 'chatter', 0, 0, 0, [], duo.a);
      const b = this.addNpc(pick(), 'chatter', 0, 0, 0, [], duo.b);
      a.actor.dir = duo.b.x > duo.a.x ? 2 : 6;
      b.actor.dir = duo.b.x > duo.a.x ? 6 : 2;
    }

    // Deux mercenaires de rangs différents (CombatArena.gd:2812-2832), niveau 10 + salles franchies + rang.
    // Ils se tiennent immobiles de part et d'autre de la place ; leur fiche s'ouvre quand on s'approche.
    const ranks = [0, 1, 2];
    ranks.splice(rng.int(3), 1);
    ranks.forEach((r, i) => {
      const rank = RANKS[r];
      const id = rank.pool[rng.int(rank.pool.length)];
      const level = Math.max(1, 10 + run.room + rank.lvl);
      const price = Math.round(rank.price * (1 + 0.25 * run.act));
      // Il s'entraîne sur un mannequin posé à côté de lui, du côté de la place.
      const spot = place.pairSpot(hx + (i ? 8 : -8), hy - 1, 2, i ? -1 : 1);
      const merc = this.addNpc(id, 'merc', 0, 0, 0, MERCENARY, spot.a);
      const dummy = spot.b;
      place.block(Math.floor(dummy.x), Math.floor(dummy.y));
      merc.actor.dir = dummy.x > merc.actor.x ? 2 : 6;
      merc.merc = { rank: r, level, price, mon: null, dummy, trainT: rng.range(0.4, 1.6), hitT: 0 };
      void Pokemon.load(id, level).then((mon) => merc.merc && (merc.merc.mon = mon));
    });

    this.restock();
    this.host.message('Boutique — approche-toi du comptoir pour acheter [E]');
  }

  /** Position du marchand (derrière son comptoir, au centre de la place). */
  get merchant(): { x: number; y: number } {
    return this.hub;
  }

  /** `place` : emplacement déjà choisi (paire) ; sinon la case libre la plus proche de (hub + dx, dy). */
  private addNpc(id: number, role: Npc['role'], dx: number, dy: number, radius: number, lines: readonly string[], place?: { x: number; y: number }): Npc {
    const at = role === 'merchant' ? this.hub : (place ?? this.place!.freeSpot(Math.floor(this.hub.x + dx), Math.floor(this.hub.y + dy)));
    const actor = new Actor(id, at.x, at.y);
    actor.dir = this.rng!.int(8);
    if (role === 'merchant' || role === 'merc') actor.dir = 0;
    void loadInfo(id).then((i) => (actor.info = i));
    // Pose : le dormeur dort, le reste attend en respirant (Idle) ou mange ; la paire sautille parfois.
    void loadSheet(id, role === 'merc' ? PLAYER_ACTIONS : ['Sleep', 'Idle', 'Eat', 'Hop']).then((sh) => {
      actor.sheet = sh;
      if (role === 'sleeper') actor.setPose(['Sleep']);
      else if (role === 'idler') actor.setPose(['Eat', 'Idle']);
      else if (role !== 'stroller') actor.setPose(['Idle']);
    });
    const bubble = document.createElement('div');
    bubble.className = 'room-label shop-bubble';
    this.layer.append(bubble);
    const npc: Npc = { actor, role, lines, talk: 0, home: { ...at }, radius, goal: { ...at }, wait: this.rng!.range(0.5, 3), bubble, bubbleT: 0 };
    this.people.push(npc);
    this.npcs.push(actor);
    return npc;
  }

  /** Le premier membre K.O. qu'un Rappel peut relever (un mercenaire ne se relève jamais, TeamMember.gd:2023-2030). */
  private downed(): Actor | null {
    return this.host.team().find((m) => m.downed && !m.runAlly) ?? null;
  }

  /** ShopStock.roll_stock : la CT, deux soins distincts selon l'acte, un Rappel si un membre est K.O., puis la recharge. */
  private restock(): void {
    const run = this.run!;
    const rng = this.rng!;
    for (const it of this.items) it.tag.remove();
    const pool: HealId[] = run.act <= 1 ? ['potion', 'super_potion'] : ['super_potion', 'hyper_potion', 'max_potion'];
    const heals: HealId[] = [];
    while (heals.length < 2 && pool.length) heals.push(pool.splice(rng.int(pool.length), 1)[0]);
    const specs: Omit<Item, 'x' | 'y' | 'sold' | 'phase' | 'tag'>[] = [];
    if (!this.ctUsed) {
      specs.push({ kind: 'move', id: 'ct', name: 'CT — Capacité rare', desc: 'Apprends une attaque forte de ton répertoire, ou renforce-en une (+25 %).', icon: 'machine_NORMAL', price: CT_PRICE, heal: 0 });
    }
    for (const id of heals) {
      const h = HEALS[id];
      specs.push({ kind: 'heal', id, name: h.name, desc: h.heal < 0 ? 'Rend TOUS ses PV au Pokémon que tu joues.' : `Rend ${h.heal} PV au Pokémon que tu joues.`, icon: h.icon, price: h.price, heal: h.heal });
    }
    if (this.downed()) {
      const r = REVIVES[run.act >= 2 ? 'max_revive' : 'revive'];
      specs.push({ kind: 'revive', id: 'revive', name: r.name, desc: `Relève un membre K.O. avec ${Math.round(r.pct * 100)} % de ses PV.`, icon: r.icon, price: r.price, heal: r.pct });
    }
    if (!this.berriesBought) {
      const pack = BERRY_PACKS[rng.int(BERRY_PACKS.length)];
      specs.push({ kind: 'berries', id: 'berries', name: `${pack.amount} Baies`, desc: 'Des Baies pour le Repaire : elles survivent à la run, contrairement aux Pokédollars.', icon: 'SITRUSBERRY', price: pack.price, heal: pack.amount });
    }
    if (!this.heldBought) {
      const h = HELD_FOR_SALE[rng.int(HELD_FOR_SALE.length)];
      specs.push({ kind: 'held', id: 'held', held: h.api, name: h.name, desc: `Objet tenu : ${heldText(h)}. Il t’attendra dans la réserve du Repaire.`, icon: h.icon, price: Math.round((h.price * HELD_RATE) / 10) * 10, heal: 0 });
    }
    specs.push({
      kind: 'reroll',
      id: 'reroll',
      name: 'Recharger l’étal',
      desc: 'Le marchand ressort ses caisses : nouveaux objets, et nouvelles capacités à la CT.',
      icon: 'COINCASE',
      price: rerollPrice(this.rerolls),
      heal: 0,
    });
    // Sur le comptoir, régulièrement espacés : on les achète en se tenant devant.
    const step = Math.min(2, 8 / Math.max(1, specs.length - 1));
    this.items = specs.map((spec, i) => {
      const tag = document.createElement('div');
      tag.className = 'room-label open shop-price';
      tag.textContent = `${spec.price} ₽`;
      this.layer.append(tag);
      return { ...spec, x: this.hub.x + (i - (specs.length - 1) / 2) * step, y: this.hub.y + 1, sold: 0, phase: i * 1.1, tag };
    });
  }

  /** Ce qu'en dit la fiche, et pourquoi l'achat serait refusé (CombatArena._shop_offer_state). */
  private offerState(it: Item, player: Actor): { note: string; refuse: string } {
    const mon = player.pokemon;
    const money = this.run?.money ?? 0;
    let note = '';
    let refuse = '';
    if (it.kind === 'heal' && mon) {
      note = `Sur ${mon.name} · ${mon.hp}/${mon.maxHp} PV`;
      if (mon.hp >= mon.maxHp) refuse = `${mon.name} est déjà au maximum.`;
    } else if (it.kind === 'revive') {
      const d = this.downed();
      note = d?.pokemon ? `Ranime ${d.pokemon.name}` : '';
      if (!d) refuse = 'Personne n’est K.O.';
    } else if (it.kind === 'move') note = 'Une capacité par visite';
    else if (it.kind === 'berries') note = 'Un lot par visite';
    else if (it.kind === 'held') note = 'Un objet par visite · pour le Repaire';
    else if (it.kind === 'reroll') note = `La suivante coûtera ${rerollPrice(this.rerolls + 1)} ₽`;
    if (!refuse && money < it.price) refuse = `Pas assez de Pokédollars (${it.price} ₽ requis).`;
    return { note, refuse };
  }

  update(dt: number, input: InputSample, player: Actor, world: WorldMap): void {
    if (!this.active) return;
    for (const it of this.items) if (it.sold > 0) it.sold += dt / 0.45;
    for (const it of this.items.filter((x) => x.sold >= 1)) it.tag.remove();
    this.items = this.items.filter((x) => x.sold < 1);
    this.vars.lead = player.pokemon?.name ?? 'toi';
    this.playerAt = { x: player.x, y: player.y };
    this.updatePeople(dt, world);

    // L'article devant lequel on se tient, puis l'affiche, puis le Pokémon le plus proche.
    let best: Item | null = null;
    let bestD = ITEM_REACH;
    for (const it of this.items) {
      if (it.sold > 0) continue;
      const d = Math.hypot(player.x - it.x, player.y - (it.y + 1));
      if (d <= bestD) {
        best = it;
        bestD = d;
      }
    }
    this.near = best;
    this.nearPoster = !best && Math.hypot(player.x - this.poster.x, player.y - this.poster.y) < POSTER_REACH;
    let npc: Npc | null = null;
    let npcD = TALK_REACH;
    if (!best && !this.nearPoster) {
      for (const p of this.people) {
        // Le marchand se parle par-dessus son comptoir.
        const d = Math.hypot(player.x - p.actor.x, player.y - (p.actor.y + (p.role === 'merchant' ? 1.6 : 0)));
        if (p.role !== 'chatter' && d < npcD) {
          npc = p;
          npcD = d;
        }
      }
    }
    this.nearNpc = npc;
    this.renderPrompt(player);
    if (!input.interact) return;
    if (best) this.buy(best, player);
    else if (this.nearPoster) this.host.openPoster();
    else if (npc) this.interact(npc);
  }

  /** Figurants : le flâneur et le promeneur marchent et s'arrêtent ; la paire échange des bulles. */
  private updatePeople(dt: number, world: WorldMap): void {
    const rng = this.rng!;
    for (const p of this.people) {
      const a = p.actor;
      let mx = 0;
      let my = 0;
      if (p.radius > 0 && p.role !== 'merc') {
        if (p.wait > 0) p.wait -= dt;
        else if (Math.hypot(p.goal.x - a.x, p.goal.y - a.y) < 0.4) {
          const ang = rng.range(0, Math.PI * 2);
          const r = rng.range(0.6, p.radius);
          p.goal = { x: p.home.x + Math.cos(ang) * r, y: p.home.y + Math.sin(ang) * r };
          p.wait = rng.range(2, 5);
        } else {
          // Allure de promenade (1,7 case/s, le joueur court à 9,4) : on flâne, on ne traverse pas la place.
          const len = Math.hypot(p.goal.x - a.x, p.goal.y - a.y);
          mx = ((p.goal.x - a.x) / len) * 0.18;
          my = ((p.goal.y - a.y) / len) * 0.18;
        }
      }
      const before = a.x + a.y;
      a.updatePlayer(dt, { mx, my, dash: false, move: -1, interact: false, ult: false, swap: false }, world);
      if ((mx || my) && a.x + a.y === before) p.goal = { ...a };
      if (p.merc) {
        // Entraînement : un coup sur le mannequin toutes les 1,3 à 2,4 s ; quand on vient lui
        // parler, il s'arrête et se tourne vers nous.
        const m = p.merc;
        m.hitT = Math.max(0, m.hitT - dt);
        if (this.nearNpc === p) a.dir = this.playerAt.x > a.x ? 2 : 6;
        else {
          a.dir = m.dummy.x > a.x ? 2 : 6;
          m.trainT -= dt;
          if (m.trainT <= 0) {
            a.playAction(['Attack', 'Shoot', 'Charge'], 0);
            const lx = Math.sign(m.dummy.x - a.x) * 0.5;
            a.lunge = { dx: lx, dy: 0, t: 0 };
            m.hitT = 0.35;
            m.trainT = rng.range(1.3, 2.4);
          }
        }
      }
      if (p.role === 'chatter') {
        p.bubbleT -= dt;
        if (p.bubbleT <= -rng.range(0.6, 1.4)) {
          p.bubble.textContent = EMOTES[rng.int(EMOTES.length)];
          p.bubbleT = rng.range(1.9, 2.8);
          // Un petit bond de temps en temps, puis il reprend sa pose.
          if (rng.chance(0.35)) a.playAction(['Hop'], 0);
        }
      } else p.bubbleT -= dt;
      p.bubble.classList.toggle('open', p.bubbleT > 0);
    }
  }

  /** Parler à un Pokémon de la place, ou recruter un mercenaire. */
  private interact(p: Npc): void {
    const run = this.run!;
    if (p.merc) {
      const name = p.actor.info?.name ?? 'Ce mercenaire';
      if (this.host.team().length >= MAX_TEAM) return this.say(p, `Ton équipe est au complet (${MAX_TEAM}).`);
      if (run.money < p.merc.price) return this.say(p, `${p.merc.price} ₽, pas un de moins.`);
      run.money -= p.merc.price;
      sfx('buy');
      this.host.recruit(p.actor.speciesId, p.merc.level, p.actor.x, p.actor.y, p.merc.price);
      this.host.message(`${name} rejoint l’équipe (N.${p.merc.level}).`);
      p.bubble.remove();
      this.people = this.people.filter((x) => x !== p);
      this.npcs.splice(this.npcs.indexOf(p.actor), 1);
      return;
    }
    // Rarement, un Pokémon de la place fait un cadeau (un seul par visite, jamais le marchand).
    if (p.role !== 'merchant' && !p.gifted && this.gifts < 1 && this.rng!.chance(0.12)) {
      p.gifted = true;
      this.gifts++;
      this.gift(p);
      return;
    }
    this.say(p, p.lines[p.talk++ % p.lines.length]);
  }

  /** Un petit cadeau : quelques ₽, une Potion pour le Pokémon joué, ou une Baie Oran pour toute l'équipe. */
  private gift(p: Npc): void {
    const run = this.run!;
    const rng = this.rng!;
    const name = p.actor.info?.name ?? 'Un Pokémon';
    this.say(p, GIFT_LINES[rng.int(GIFT_LINES.length)]);
    const team = this.host.team().filter((m) => m.pokemon && !m.downed);
    const hurt = team.filter((m) => m.pokemon!.hp < m.pokemon!.maxHp);
    const roll = rng.int(3);
    if (roll === 1 && hurt.length) {
      for (const m of team) {
        const mon = m.pokemon!;
        mon.hp = Math.min(mon.maxHp, mon.hp + Math.max(1, Math.round(mon.maxHp * 0.1)));
      }
      this.host.message(`${name} partage une Baie Oran : toute l’équipe récupère 10 % de ses PV.`);
    } else if (roll === 2 && hurt.length) {
      const m = hurt[0].pokemon!;
      m.hp = Math.min(m.maxHp, m.hp + 20);
      this.host.message(`${name} te donne une Potion : ${m.name} — ${m.hp}/${m.maxHp} PV.`);
    } else {
      const n = 15 + rng.int(31);
      run.money += n;
      this.host.message(`${name} te glisse ${n} ₽.`);
    }
  }

  private say(p: Npc, text: string): void {
    p.bubble.textContent = fillLine(text, this.vars);
    p.bubbleT = 3.5;
  }

  private buy(it: Item, player: Actor): void {
    const run = this.run!;
    const { refuse } = this.offerState(it, player);
    if (refuse) {
      sfx('buzzer');
      this.host.message(refuse);
      return;
    }
    const mon = player.pokemon!;
    if (it.kind === 'move') {
      // Rien n'est débité tant qu'on n'a pas choisi : le parchemin peut se refermer sans rien prendre.
      this.host.openMoves(it.price, () => {
        run.money -= it.price;
        sfx('buy');
        this.ctUsed = true;
        it.sold = 0.01;
      });
      return;
    }
    if (it.kind === 'held' && !this.host.giveItem(it.held!)) {
      sfx('buzzer');
      this.host.message('Seul l’hôte a un Repaire où le ranger.');
      return;
    }
    run.money -= it.price;
    sfx('buy');
    if (it.kind === 'held') {
      this.heldBought = true;
      it.sold = 0.01;
    } else if (it.kind === 'heal') {
      mon.hp = it.heal < 0 ? mon.maxHp : Math.min(mon.maxHp, mon.hp + it.heal);
      it.sold = 0.01;
      this.host.message(`${mon.name} — ${mon.hp}/${mon.maxHp} PV`);
    } else if (it.kind === 'revive') {
      // TeamMember.revive : il se relève là où il est tombé.
      const m = this.downed()!;
      const pm = m.pokemon!;
      m.getUp();
      pm.status = null;
      pm.hp = Math.max(1, Math.round(pm.maxHp * it.heal));
      it.sold = 0.01;
      this.host.message(`${pm.name} est ranimé — ${pm.hp}/${pm.maxHp} PV`);
    } else if (it.kind === 'berries') {
      this.berriesBought = true;
      it.sold = 0.01;
      this.host.earnBaies(it.heal);
    } else {
      this.rerolls++;
      this.restock();
      this.host.message('Le marchand ressort ses caisses');
    }
  }

  private renderPrompt(player: Actor): void {
    const it = this.near;
    const el = (cls: string, text: string) => Object.assign(document.createElement('div'), { className: cls, textContent: text });
    if (!it && this.nearNpc?.merc?.mon) {
      this.renderMerc(this.nearNpc);
      return;
    }
    if (!it) {
      const p = this.nearNpc;
      const hint = this.nearPoster
        ? '[E] Étudier l’affiche du prochain combat'
        : p
          ? `[E] Parler à ${p.role === 'merchant' ? 'Perrserker' : (p.actor.info?.name ?? '…')}`
          : '';
      if (this.prompt.dataset.key === hint && !this.prompt.hidden === Boolean(hint)) return;
      this.prompt.dataset.key = hint;
      this.prompt.hidden = !hint;
      if (hint) this.prompt.replaceChildren(el('shop-hint', hint));
      return;
    }
    const { note, refuse } = this.offerState(it, player);
    const key = `${it.id}|${note}|${refuse}`;
    if (this.prompt.dataset.key === key && !this.prompt.hidden) return;
    this.prompt.dataset.key = key;
    const icon = document.createElement('canvas');
    icon.width = icon.height = 48;
    const img = this.icons.get(it.icon);
    if (img) icon.getContext('2d')!.drawImage(img, 0, 0);
    this.prompt.replaceChildren(icon, el('shop-name', it.name), el('da-stamp shop-cost', `${it.price} ₽`), el('shop-desc', it.desc), el('shop-note', refuse || note), el('shop-buy', refuse ? '' : '✔ Acheter [E]'));
    this.prompt.classList.toggle('refused', Boolean(refuse));
    this.prompt.hidden = false;
  }

  /**
   * Fiche d'un mercenaire, quand on s'en approche : son illustration, son
   * rang et son niveau, ses types, ses statistiques et ses attaques, puis son
   * prix — de quoi décider avant de payer.
   */
  private renderMerc(p: Npc): void {
    const m = p.merc!;
    const mon = m.mon!;
    const money = this.run?.money ?? 0;
    const refuse = this.host.team().length >= MAX_TEAM ? `Équipe au complet (${MAX_TEAM}).` : money < m.price ? `Pas assez de Pokédollars (${m.price} ₽ requis).` : '';
    const key = `merc|${p.actor.speciesId}|${refuse}|${mon.movesVersion}`;
    if (this.prompt.dataset.key === key && !this.prompt.hidden) return;
    this.prompt.dataset.key = key;
    const el = (tag: string, cls: string, parent: HTMLElement, text?: string) => {
      const e = document.createElement(tag);
      e.className = cls;
      if (text !== undefined) e.textContent = text;
      parent.append(e);
      return e;
    };
    this.prompt.replaceChildren();
    const card = el('div', 'merc-card', this.prompt);
    const art = el('img', 'merc-art', card) as HTMLImageElement;
    art.src = `/game/artwork/${mon.id}.png`;
    art.alt = '';
    const head = el('div', 'merc-head', card);
    el('div', 'shop-name', head, mon.name);
    const sub = el('div', 'merc-sub', head, `${RANKS[m.rank].name} · N.${m.level}`);
    for (const t of mon.types) typePill(t, sub);
    el('div', 'da-stamp shop-cost', card, `${m.price} ₽`);
    const stats = el('div', 'merc-stats', card);
    for (const [label, v] of [
      ['PV', mon.maxHp],
      ['ATT', mon.attack],
      ['DÉF', mon.defense],
      ['ATT.S', mon.spAttack],
      ['DÉF.S', mon.spDefense],
      ['VIT', mon.speed],
    ] as const) {
      const c = el('span', '', stats);
      el('small', '', c, label);
      c.append(String(Math.round(v)));
    }
    const moves = el('div', 'merc-moves', card);
    for (const mv of mon.moves) {
      const row = el('div', '', moves);
      el('b', '', row, mv.name);
      typePill(mv.type, row);
      el('small', '', row, mv.power > 0 ? `${mv.damageClass === 'special' ? 'Spéciale' : 'Physique'} · ${mv.power}` : 'Statut');
    }
    el('div', 'shop-note', card, refuse || `Solde de ${Math.round(m.price * MERC_RETAINER)} ₽ à chaque boutique, sinon il part. Aucun Rappel ne le relève.`);
    if (!refuse) el('div', 'shop-buy', card, '✔ Recruter [E]');
    this.prompt.classList.toggle('refused', Boolean(refuse));
    this.prompt.hidden = false;
  }

  /**
   * Éléments de la boutique, triés avec les Pokémon par leur ligne de sol :
   * le comptoir (et l'étal qu'il porte) et l'affiche.
   */
  extras(time: number): { y: number; draw(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void }[] {
    if (!this.active) return [];
    const cy = Math.floor(this.hub.y) + 1;
    return [
      {
        y: (cy + 1) * TILE - 1,
        draw: (b, camX, camY, k) => {
          this.drawCounter(b, camX, camY, k, cy);
          for (const it of this.items) this.drawItem(b, camX, camY, k, it, cy, time);
        },
      },
      { y: this.poster.y * TILE, draw: (b, camX, camY, k) => this.drawPoster(b, camX, camY, k) },
      ...this.people.flatMap((p) => (p.merc ? [{ y: p.merc.dummy.y * TILE, draw: (b: CanvasRenderingContext2D, camX: number, camY: number, k: number) => this.drawDummy(b, camX, camY, k, p.merc!) }] : [])),
    ];
  }

  private drawDummy(b: CanvasRenderingContext2D, camX: number, camY: number, k: number, m: NonNullable<Npc['merc']>): void {
    drawDummy(b, Math.round((m.dummy.x * TILE - camX) * k), Math.round((m.dummy.y * TILE - camY) * k), k, m.hitT);
  }

  /** Comptoir de bois sur 9 cases, un poteau à chaque bout. */
  private drawCounter(b: CanvasRenderingContext2D, camX: number, camY: number, k: number, cy: number): void {
    const sx = (x: number) => Math.round((x * TILE - camX) * k);
    const top = Math.round((cy * TILE - camY) * k);
    const x0 = sx(Math.floor(this.hub.x) - 4);
    const x1 = sx(Math.floor(this.hub.x) + 5);
    b.fillStyle = '#3b2414';
    b.fillRect(x0, top + 2 * k, x1 - x0, 13 * k);
    b.fillStyle = '#9a6a3a';
    b.fillRect(x0 + k, top + 3 * k, x1 - x0 - 2 * k, 5 * k);
    b.fillStyle = '#6b4424';
    b.fillRect(x0 + k, top + 8 * k, x1 - x0 - 2 * k, 6 * k);
    b.fillStyle = '#3b2414';
    for (const px of [x0 - 2 * k, x1 - k]) b.fillRect(px, top - 8 * k, 3 * k, 23 * k);
  }

  /** L'affiche du prochain combat : le grand panneau de bois du tileset (celui de l'entrée du village). */
  private drawPoster(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void {
    const [sx, sy, sw, sh] = TOWN_DECOR.townSign.rect;
    const foot = TOWN_DECOR.townSign.foot;
    const px = Math.round((this.poster.x * TILE - camX) * k);
    const py = Math.round((this.poster.y * TILE - camY) * k);
    b.drawImage(this.atlas, sx, sy, sw, sh, px - Math.round((sw / 2) * k), py - foot * k, sw * k, sh * k);
  }

  /** Un article posé sur le comptoir : il flotte doucement au-dessus, sans tourner. */
  private drawItem(b: CanvasRenderingContext2D, camX: number, camY: number, k: number, it: Item, cy: number, time: number): void {
    const img = this.icons.get(it.icon);
    if (!img) return;
    const lift = it.sold > 0 ? it.sold * 14 : 0;
    const cx = Math.round((it.x * TILE - camX) * k);
    const surface = Math.round((cy * TILE - camY) * k) + 4 * k;
    const bob = Math.round((Math.sin(time * 2.2 + it.phase) * 1.5 + 9 + lift) * k);
    b.fillStyle = 'rgba(20,12,4,0.35)';
    b.beginPath();
    b.ellipse(cx, surface, (5 - Math.sin(time * 2.2 + it.phase)) * k, 1.5 * k, 0, 0, Math.PI * 2);
    b.fill();
    b.globalAlpha = it.sold > 0 ? Math.max(0, 1 - it.sold) : 1;
    // L'article devant lequel on se tient grossit nettement : c'est lui que E achète.
    const size = (it === this.near ? 26 : 16) * k;
    b.drawImage(img, 0, 0, 48, 48, cx - size / 2, surface - bob - size / 2, size, size);
    b.globalAlpha = 1;
  }

  placeLabels(proj: Projector): void {
    if (!this.active) return;
    for (const it of this.items) {
      const p = proj.toCss(it.x, it.y + 0.55);
      it.tag.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
      it.tag.style.opacity = String(it.sold > 0 ? 1 - it.sold : 1);
      it.tag.classList.toggle('near', it === this.near);
    }
    for (const n of this.people) {
      const a = n.actor;
      const head = a.sheet ? (a.sheet.footRow + 1 - a.sheet.topRow) / 16 : 1.4;
      const p = proj.toCss(a.x, a.y - head - 0.4);
      n.bubble.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
    }
  }
}

/**
 * Mannequin d'entraînement : un poteau, une traverse et un sac de paille, qui
 * vacille sous les coups (`hitT` : temps restant de l'impact). Boutique et
 * terrain d'entraînement du Repaire. (px, py) : son pied à l'écran.
 */
export function drawDummy(b: CanvasRenderingContext2D, px: number, py: number, k: number, hitT: number): void {
  const sway = hitT > 0 ? Math.sin(hitT * 40) * hitT * 0.6 : 0;
  b.fillStyle = 'rgba(16,24,12,0.25)';
  b.beginPath();
  b.ellipse(px, py, 5 * k, 2 * k, 0, 0, Math.PI * 2);
  b.fill();
  b.save();
  b.translate(px, py);
  b.rotate(sway);
  const r = (x: number, y: number, w: number, h: number, c: string) => {
    b.fillStyle = c;
    b.fillRect(x * k, y * k, w * k, h * k);
  };
  r(-1, -20, 2, 20, '#5a3a1c');
  r(-6, -16, 12, 2, '#5a3a1c');
  r(-4, -21, 8, 11, '#3b2414');
  r(-3, -20, 6, 9, hitT > 0.2 ? '#fff3c4' : '#d8b56a');
  r(-3, -16, 6, 1, '#b08a42');
  b.restore();
}
