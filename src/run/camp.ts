import { loadImage, loadInfo, loadSheet, PLAYER_ACTIONS } from '../assets/pmd';
import { Rng } from '../core/rng';
import { linesOf } from '../data/bestiary';
import { fillLine, PERSONAS, SLEEPY } from '../data/chatter';
import { CAMP_NPCS, ISLAND_NPCS, PLAYER_SPECIES, SWIMMERS } from '../data/species';
import { Actor, dirFromVector } from '../entities/actor';
import type { InputSample } from '../input/input';
import type { BuildingId } from '../meta/catalog';
import type { Projector } from '../render/combatfx';
import { clearAreas, type WorldMap } from '../world/generate';
import { CAMP_PROPS, CAMPFIRE, PROPS, TILE, type SpriteDef } from '../world/tiles';
import { Placer, type Spot } from './placement';
import { drawDummy } from './shop';

// Le Repaire, le camp des rebelles entre deux runs (HubWorld.gd, redessiné) :
// une clairière de nuit autour d'un grand feu cerclé de torches, un lac au
// sud. Au début, il n'y a presque personne : Dracolosse sous l'arche de
// lierre du départ (au nord), Porygon devant la hutte de l'équipe (à l'est),
// Ossatueur le bâtisseur près de ses rondins, Roucarnage à son relais (le jeu
// en ligne, dès la première partie). Chaque aménagement qu'Ossatueur bâtit
// fait venir du monde :
// - l'étude d'Alakazam (sud-ouest) : améliorations, objets tenus, CS ;
// - le marché du tuteur (ouest) : M. Mime et ses deux étals de CT ;
// - le dortoir (nord-ouest) : des tipis, et des paillasses où l'on dort ;
// - le terrain d'entraînement (nord-est) : des mannequins qu'on frappe ;
// - le ponton (sur la rive, à l'écart du feu) : on y marche au-dessus de l'eau.
// En dehors des gardiens des postes, le camp ne compte que des libérés — ceux
// qu'on a débloqués et qu'on n'emmène pas : assis autour du feu, endormis au
// dortoir, à l'entraînement, à la nage dans le lac (ceux d'eau), ou à flâner.
// Sur l'île, loin au sud du lac, un temple dont on gravit l'escalier, Lugia et
// deux ermites : on n'y va qu'à la nage, avec la CS Surf. Un repère tressaute
// au-dessus du gardien dont on s'approche ; E ouvre son écran (main.ts), après
// sa présentation la première fois.
//
// Écarts voulus avec le jeu : un camp resserré (le jeu étalait ses quartiers
// sur 116 × 96 cases), des aménagements payés en Baies (le jeu voulait du
// bois, de la pierre et des vivres), pas d'expéditions.

export type Station = 'start' | 'team' | 'builder' | 'moves' | 'upgrades' | 'online';

export const STATIONS: Record<Station, { id: number; type: string; title: string; kicker: string; intro: string }> = {
  start: {
    id: CAMP_NPCS.start,
    type: 'dragon',
    title: 'Départ',
    kicker: 'en route',
    intro: 'Prêt à repartir ? Chaque salle nettoyée est un pas de plus pour la rébellion. Là-bas, les dresseurs ne nous feront pas de cadeaux. Mais nous non plus.',
  },
  team: {
    id: CAMP_NPCS.team,
    type: 'normal',
    title: 'Équipe',
    kicker: 'la hutte',
    intro: 'Je garde la trace de chaque Pokémon libéré. Choisis qui part avec toi, ce qu’ils savent faire et ce qu’ils emportent.',
  },
  builder: {
    id: CAMP_NPCS.builder,
    type: 'ground',
    title: 'Aménagements',
    kicker: 'le bâtisseur',
    intro: 'Regarde autour de toi : de la terre battue et un feu. On peut faire mieux. Chaque construction fait venir du monde — un camp qui grandit, c’est une rébellion qui tient.',
  },
  moves: {
    id: CAMP_NPCS.moves,
    type: 'psychic',
    title: 'CT',
    kicker: 'le tuteur',
    intro: 'Une bonne capacité bien choisie vaut mieux qu’une armée mal préparée. Je peux t’enseigner tout un éventail de techniques, contre quelques Baies.',
  },
  upgrades: {
    id: CAMP_NPCS.upgrades,
    type: 'psychic',
    title: 'Améliorations',
    kicker: 'l’étude',
    intro: 'La force seule ne suffit pas contre la Ligue. Il faut aussi la stratégie. Investis dans tes capacités, et chaque combat te coûtera moins cher.',
  },
  online: {
    id: CAMP_NPCS.online,
    type: 'flying',
    title: 'En ligne',
    kicker: 'le messager',
    intro: 'Je porte les messages d’un camp à l’autre. D’autres rebelles se battent ailleurs : un jour, je te mènerai jusqu’à eux.',
  },
};

/** Ce que disent ceux qui n'ont pas de poste (NpcDialogue.gd : « sage », « ermite », et le camp). */
const LINES = {
  sage: ['Peu franchissent l’eau. Encore moins reviennent en parler.', 'Ces pierres tenaient debout bien avant les Poké Balls. Elles verront leur fin.', 'Ta rébellion n’invente rien, petit. Elle se souvient.'],
  hermit: ['On vit ici sans chaînes depuis toujours. On ne savait pas que c’était rare.', 'Le lac nous protège mieux qu’aucune palissade.', 'Reste si tu veux. Repars si tu dois. Personne ne te retiendra.'],
  trainer: ['Encore une série. Le champion, lui, ne se repose pas.', 'Ce mannequin a la tête de {champion}. Enfin, je l’imagine.', 'Frappe, esquive, recommence. C’est tout.'],
};

/** Portée d'un poste (on parle à son gardien ou on s'approche de l'arche) et d'un Pokémon à qui parler. */
const POST_REACH = 2.4;
const TALK_REACH = 2;
/** Libérés qui nagent dans le lac du Repaire : les jouables de type Eau, et ceux qui nagent d'eux-mêmes. */
const AQUATIC = new Set([7, ...SWIMMERS]);
/** Marge (cases) avant de lâcher celui à qui l'on parle au profit d'un voisin. */
const STICKY = 0.5;
/** Graine fixe : le Repaire est toujours le même. */
export const CAMP_SEED = 9001;
/** CT exposées sur les étals du tuteur. */
const STALL_CTS = [
  ['machine_FIRE', 'machine_ELECTRIC', 'machine_WATER'],
  ['machine_PSYCHIC', 'machine_GROUND', 'machine_ICE'],
];
/** Taille de la flamme d'Essentials à l'écran (sa case de 192 px ramenée à ~31 px de décor). */
const FLAME_SCALE = 0.16;

interface Post {
  station: Station;
  actor: Actor;
  /** Où il regarde quand personne ne lui parle. */
  rest: number;
}

interface Talker {
  actor: Actor;
  lines: string[];
  talk: number;
  bubble: HTMLElement;
  bubbleT: number;
  /** S'entraîne sur ce mannequin. */
  dummy?: { x: number; y: number; hitT: number; trainT: number };
  /** Va et vient autour de `home` (au pas), en restant dans l'eau si `water`. */
  wander?: { home: Spot; radius: number; goal: Spot; wait: number; water?: boolean };
}

export class Camp {
  active = false;
  /** Les Pokémon du camp, à dessiner avec les autres. */
  readonly npcs: Actor[] = [];
  private posts: Post[] = [];
  /** Pokémon libérés, dormeurs, ceux qui s'entraînent, le passeur et les habitants de l'île. */
  private talkers: Talker[] = [];
  private fire = { x: 0, y: 0 };
  private gate = { x: 0, y: 0 };
  /** Étals du tuteur : pied de l'auvent, et les CT posées sur la table. */
  private stalls: { x: number; y: number; icons: string[] }[] = [];
  /** Ponton bâti (pied du sprite), dessiné au ras du sol pour qu'on marche dessus. */
  private jetty: Spot | null = null;
  /** Temple de l'île : son pied, et la rangée du haut de l'escalier (sa ligne de tri). */
  private temple = { x: 0, y: 0, top: 0 };
  private near: Post | Talker | null = null;
  private lead = '';
  private readonly icons = new Map<string, HTMLImageElement>();
  private flame: HTMLImageElement | null = null;
  private readonly layer: HTMLElement;
  private readonly prompt: HTMLElement;
  /** Repère au-dessus du gardien dont on s'approche (il tressaute). */
  private readonly mark: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly open: (station: Station) => void,
    /** Planche du décor : le temple et le ponton se dessinent à part (escalier, plancher praticables). */
    private readonly atlas: CanvasImageSource,
  ) {
    this.layer = document.createElement('div');
    this.layer.className = 'room-labels';
    this.prompt = document.createElement('div');
    this.prompt.className = 'shop-prompt da-paper';
    this.prompt.hidden = true;
    this.mark = document.createElement('div');
    this.mark.className = 'room-label camp-mark';
    parent.append(this.layer, this.prompt);
    for (const f of STALL_CTS.flat()) {
      void loadImage(`/game/assets/essentials/items/${f}.png`)
        .then((img) => this.icons.set(f, img))
        .catch(() => {});
    }
    void loadImage(CAMPFIRE.url)
      .then((img) => (this.flame = img))
      .catch(() => {});
  }

  clear(): void {
    this.active = false;
    this.posts = [];
    this.talkers = [];
    this.stalls = [];
    this.jetty = null;
    this.npcs.length = 0;
    this.layer.replaceChildren();
    this.prompt.hidden = true;
    this.near = null;
  }

  /**
   * Installe le camp : le feu, l'arche, les décors des postes et des
   * aménagements bâtis, les torches et les ruines de l'île entrent dans les
   * objets de la carte (à faire avant Renderer.bake), puis les Pokémon s'y
   * posent. `team` : l'équipe du moment (ses membres ne traînent pas au camp) ;
   * `built` : les aménagements d'Ossatueur.
   */
  build(world: WorldMap, team: readonly number[], built: readonly BuildingId[]): void {
    this.clear();
    this.active = true;
    this.layer.append(this.mark);
    const has = (b: BuildingId) => built.includes(b);
    const rng = new Rng(CAMP_SEED);
    const place = new Placer(world);
    const W = world.w;
    const hx = Math.floor(world.hub.x);
    const hy = Math.floor(world.hub.y);
    const at = (x: number, y: number) => Math.floor(y) * W + Math.floor(x);
    const isPath = (x: number, y: number) => world.path[y * W + x] === 1;
    const isWater = (x: number, y: number) => world.water[y * W + x] === 1;
    /** Pose un décor dont le pied est en (x, y) (en cases) ; sa base bloque `trunk` cases, sur `depth` px de haut. */
    const put = (sp: SpriteDef, x: number, y: number, blocks = true) => {
      world.objects.push({ sprite: sp, x: Math.round(x * TILE), y: Math.round(y * TILE), fades: false });
      place.take({ x, y });
      if (!blocks || sp.trunk <= 0) return;
      const rows = Math.max(1, Math.ceil((sp.depth ?? 6) / TILE));
      const row = Math.floor(y - 0.05);
      for (let ry = row - rows + 1; ry <= row; ry++) {
        for (let cx = Math.floor(x - sp.trunk / 2 + 0.1); cx <= Math.floor(x + sp.trunk / 2 - 0.1); cx++) {
          place.block(cx, ry);
          // Hutte, tipi, étal : trop gros pour qu'un dash passe au travers (generate.ts, `solid`).
          if (sp.trunk >= 3 && cx >= 0 && ry >= 0 && cx < W && ry < world.h) world.solid[ry * W + cx] = 1;
        }
      }
    };
    /** Pose au sol un carré de cases du tileset (paillasse, terre battue), cuit avec le sol. */
    const floor = (col: number, row: number, w: number, h: number, x: number, y: number) => {
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) world.flat.push({ tile: [col + dx, row + dy], x: x + dx, y: y + dy });
    };

    // L'arche du départ se pose là où l'allée du nord quitte la clairière : la
    // dernière rangée dont les bords de l'allée sont encore dans le camp.
    let gx = hx + 0.5;
    let gy = hy - 6;
    for (let y = hy - 6; y > 2; y--) {
      const xs: number[] = [];
      for (let x = hx - 14; x <= hx + 14; x++) if (isPath(x, y)) xs.push(x);
      if (!xs.length) break;
      const cx = Math.round((xs[0] + xs[xs.length - 1]) / 2);
      if (!world.inside[y * W + xs[0] - 2] && !world.inside[y * W + xs[xs.length - 1] + 2]) break;
      gx = cx + 0.5;
      gy = y;
    }
    const hut = { x: hx + 16, y: hy - 0.6 };
    const yard = { x: hx - 7.5, y: hy + 6.4 };
    const study = { x: hx - 17, y: hy + 7.4 };
    const market = { x: hx - 17, y: hy - 2.4 };
    const dorm = { x: hx - 12, y: hy - 9.4 };
    const training = { x: hx + 13, y: hy - 10.6 };
    const relay = { x: hx + 12, y: hy + 9 };
    // Le ponton descend dans le lac au sud-est, à l'écart du feu, là où la berge rejoint la clairière.
    const jx = hx + 10;
    let shore = hy + 8;
    while (shore < world.h - 2 && !isWater(jx, shore)) shore++;
    // Le temple de l'île : son pied, et l'escalier qui y monte (2 cases de large, 6 de haut).
    const island = { x: hx + 0.5, y: world.h - 8 };
    const STEPS = 6;
    // Les torches font le tour de la place, en cercle régulier (8, décalées de l'allée nord et du sud).
    const torches = Array.from({ length: 8 }, (_, i) => {
      const a = ((i + 0.5) / 8) * Math.PI * 2;
      return { x: Math.floor(hx + Math.cos(a) * 9) + 0.5, y: Math.floor(hy + 0.6 + Math.sin(a) * 7) + 0.95 };
    });
    // On arrive près du feu ; chaque poste a sa place nette (ni arbre, ni rocher, ni herbe haute), chaque torche aussi.
    world.spawn = { x: hx + 0.5, y: hy + 3.6 };
    clearAreas(world, [
      { x: gx, y: gy, rx: 6, ry: 3 },
      { x: hut.x, y: hut.y, rx: 5, ry: 4 },
      { x: yard.x, y: yard.y, rx: 4, ry: 3 },
      { x: study.x, y: study.y, rx: 5.5, ry: 4 },
      { x: market.x, y: market.y, rx: 6.5, ry: 3.6 },
      { x: dorm.x, y: dorm.y, rx: 7, ry: 4 },
      { x: training.x, y: training.y, rx: 6, ry: 4 },
      { x: relay.x + 2, y: relay.y, rx: 6, ry: 3.6 },
      { x: jx + 0.5, y: shore, rx: 4.5, ry: 4 },
      { x: island.x, y: island.y - 2, rx: 11, ry: 6 },
      ...torches.map((t) => ({ x: t.x, y: t.y - 0.5, rx: 1.6, ry: 1.6 })),
    ]);

    // Le feu, au cœur de la place, sur sa bûche ; quatre rondins tout près, pour s'asseoir.
    this.fire = { x: hx, y: hy + 0.6 };
    world.fires = [this.fire];
    put(CAMP_PROPS.fireLog, this.fire.x, this.fire.y, false);
    place.block(hx - 1, hy);
    place.block(hx, hy);
    const seats: Spot[] = [];
    for (const [dx, dy] of [
      // Ceux du sud d'abord : on les voit de dos, assis face au feu (la pose Sit de PMD est vue de dos).
      [-2.6, 2.3],
      [2.6, 2.3],
      [-2.6, -0.9],
      [2.6, -0.9],
    ]) {
      const s = { x: hx + dx, y: hy + dy };
      put(PROPS.log[0], s.x, s.y);
      seats.push(s);
    }

    // Le départ : l'arche de lierre. Au-delà, l'allée est barrée : on ne part qu'en parlant à Dracolosse.
    this.gate = { x: gx, y: gy + 0.95 };
    put(CAMP_PROPS.arch, gx, gy + 0.95, false);
    place.block(Math.floor(gx - 1.6), gy);
    place.block(Math.floor(gx + 1.4), gy);
    for (let y = 0; y < gy; y++) for (let x = 0; x < W; x++) if (isPath(x, y)) place.block(x, y);
    put(CAMP_PROPS.torch, gx - 2.6, gy + 0.95);
    put(CAMP_PROPS.torch, gx + 2.6, gy + 0.95);
    const posts: [Station, Spot, number][] = [['start', place.freeSpot(Math.floor(gx) + 3, gy + 1, 3), 6]];

    // La hutte de l'équipe, à l'est : le registre des libérés est épinglé au panneau d'à côté.
    put(CAMP_PROPS.thatchHut, hut.x, hut.y);
    put(CAMP_PROPS.board, hut.x - 3.2, hut.y + 0.2);
    posts.push(['team', place.freeSpot(Math.floor(hut.x), Math.floor(hut.y) + 1, 3), 0]);

    // Le chantier d'Ossatueur : ses rondins et une souche, au sud-ouest du feu.
    put(CAMP_PROPS.logs, yard.x, yard.y);
    put(CAMP_PROPS.stump, yard.x + 3, yard.y + 0.3);
    posts.push(['builder', place.freeSpot(Math.floor(yard.x) + 1, Math.floor(yard.y) + 1, 3), 0]);

    // Le relais de Roucarnage, là dès le début : on peut jouer à plusieurs dès la première partie.
    put(CAMP_PROPS.mailbox, relay.x, relay.y);
    put(CAMP_PROPS.well, relay.x + 4, relay.y + 0.2);
    posts.push(['online', place.freeSpot(Math.floor(relay.x) + 1, Math.floor(relay.y), 3), 6]);

    if (has('study')) {
      // L'étude : la hutte de mousse, gardée par une statue ailée.
      put(CAMP_PROPS.mossHut, study.x, study.y);
      put(CAMP_PROPS.statue, study.x + 3.4, study.y + 0.4);
      posts.push(['upgrades', place.freeSpot(Math.floor(study.x), Math.floor(study.y) + 1, 3), 0]);
    }
    if (has('market')) {
      // Le marché : deux étals sous auvent, des CT posées sur leurs tables.
      this.stalls = STALL_CTS.map((icons, i) => ({ x: market.x + (i ? 2.2 : -2.2), y: market.y, icons }));
      for (const st of this.stalls) put(CAMP_PROPS.awning, st.x, st.y);
      put(CAMP_PROPS.barrels[0], market.x - 5.1, market.y + 0.2);
      put(CAMP_PROPS.barrels[1], market.x + 5, market.y + 0.1);
      posts.push(['moves', place.freeSpot(Math.floor(market.x), Math.floor(market.y) + 1, 3), 0]);
    }
    if (has('dorm')) {
      put(CAMP_PROPS.tepee, dorm.x - 3.5, dorm.y - 0.6);
      put(CAMP_PROPS.tepee, dorm.x + 3.5, dorm.y - 0.6);
    }
    if (has('jetty')) {
      // Le ponton : son plancher avance au-dessus de l'eau, et l'on y marche jusqu'au bout.
      // Il se dessine au ras du sol (sous les Pokémon) ; ses cases deviennent praticables.
      const foot = shore + 4.4;
      this.jetty = { x: jx + 0.5, y: foot };
      for (let y = shore - 1; y <= shore + 2; y++) {
        for (let x = jx - 2; x <= jx + 2; x++) {
          const i = y * W + x;
          world.water[i] = world.blocked[i] = world.solid[i] = world.tall[i] = 0;
          world.inside[i] = 1;
        }
      }
    }

    // Des torches en cercle autour de la place (et pas sur une allée).
    for (const t of torches) if (!isPath(Math.floor(t.x), Math.floor(t.y - 0.5)) && !world.blocked[at(t.x, t.y - 0.5)]) put(CAMP_PROPS.torch, t.x, t.y);

    // L'île : le temple, et son escalier qu'on peut gravir (il ralentit, et l'on grandit en montant).
    // Le temple bloque sur 7 cases et 6 rangées, sauf les deux colonnes de l'escalier.
    const sx = Math.floor(island.x) - 1;
    for (let y = Math.floor(island.y) - STEPS; y < Math.floor(island.y); y++) {
      for (let x = Math.floor(island.x) - 3; x <= Math.floor(island.x) + 3; x++) {
        const stair = x === sx || x === sx + 1;
        const i = y * W + x;
        world.blocked[i] = world.solid[i] = stair ? 0 : 1;
      }
    }
    // Le palier du haut, devant la porte : on s'y arrête.
    for (const x of [sx, sx + 1]) world.blocked[(Math.floor(island.y) - STEPS - 1) * W + x] = 1;
    world.stairs.push({ x: sx, y: Math.floor(island.y) - STEPS, rows: STEPS, level: 2, rise: 2 });
    // (Dessiné centré sur ses deux colonnes d'escalier, pas sur l'île : les marches tombent pile sous les pieds.)
    this.temple = { x: sx + 1, y: island.y, top: Math.floor(island.y) - STEPS };

    for (const [station, spot, rest] of posts) this.posts.push({ station, actor: this.spawn(STATIONS[station].id, spot, rest, ['Idle']), rest });

    // Les libérés qu'on n'emmène pas, et eux seuls : ceux d'eau nagent dans le lac ; les autres
    // se répartissent entre le feu (assis sur les rondins), le terrain d'entraînement et le dortoir,
    // à tour de rôle ; s'il en reste, ils flânent sur la place.
    // Chacun son caractère ; une espèce qui a ses propres répliques au bestiaire les dit à la place.
    const personas = [...PERSONAS];
    const persona = (id: number) => {
      const p = personas.splice(rng.int(personas.length), 1)[0] ?? PERSONAS[0];
      return linesOf(id) ?? [...p.lines];
    };
    const free = PLAYER_SPECIES.map((s) => s.id).filter((id) => !team.includes(id));
    const swimmers = free.filter((id) => AQUATIC.has(id));
    const walkers = free.filter((id) => !AQUATIC.has(id));
    const room = { fire: seats.length, training: has('training') ? 2 : 0, dorm: has('dorm') ? 3 : 0 };
    const groups: Record<keyof typeof room, number[]> = { fire: [], training: [], dorm: [] };
    const strollers: number[] = [];
    const order = (['fire', 'training', 'dorm'] as const).filter((g) => room[g] > 0);
    let turn = 0;
    for (const id of walkers) {
      const g = order.map((_, k) => order[(turn + k) % order.length]).find((h) => groups[h].length < room[h]);
      if (!g) {
        strollers.push(id);
        continue;
      }
      groups[g].push(id);
      turn = (order.indexOf(g) + 1) % order.length;
    }
    groups.fire.forEach((id, i) => {
      // Juste devant le rondin : il se dessine par-dessus, comme assis dessus. Au sud du feu, il
      // s'assoit (de dos, tourné vers les flammes) ; au nord, il reste au repos, de face.
      const s = { x: seats[i].x, y: seats[i].y + 0.05 };
      const south = s.y > this.fire.y;
      this.talk(id, s, dirFromVector(this.fire.x - s.x, this.fire.y - s.y), south ? ['Sit', 'Idle'] : ['Idle'], persona(id));
    });
    groups.dorm.forEach((id, i) => {
      // Une paillasse chacun ; un lit, ça ne se traverse pas (et rien ne s'y pose).
      const bx = Math.floor(dorm.x) - 4 + i * 3;
      const by = Math.floor(dorm.y) + 1;
      floor(CAMP_PROPS.hay.col, CAMP_PROPS.hay.row, 3, 3, bx, by);
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) place.block(bx + dx, by + dy);
      this.talk(id, { x: bx + 1.5, y: by + 2.1 }, rng.int(8), ['Sleep', 'Laying'], SLEEPY);
    });
    if (has('training')) {
      floor(CAMP_PROPS.dirt.col, CAMP_PROPS.dirt.row, 3, 2, Math.floor(training.x) - 3, Math.floor(training.y));
      floor(CAMP_PROPS.dirt.col, CAMP_PROPS.dirt.row, 3, 2, Math.floor(training.x), Math.floor(training.y));
    }
    groups.training.forEach((id, i) => {
      // Chacun son mannequin, de part et d'autre du terrain, et il frappe vers le centre.
      const side = i ? 1 : -1;
      const dummy = { x: training.x + side * 1.1, y: training.y + 1.4, hitT: 0, trainT: rng.range(0.4, 1.6) };
      place.block(Math.floor(dummy.x), Math.floor(dummy.y));
      const t = this.talk(id, { x: dummy.x + side * 1.5, y: dummy.y }, side > 0 ? 6 : 2, ['Idle'], LINES.trainer, true);
      t.dummy = dummy;
    });
    for (const id of strollers) {
      const s = place.freeSpot(hx + rng.int(9) - 4, hy + 4 + rng.int(3));
      this.talk(id, s, rng.int(8), ['Idle'], persona(id)).wander = { home: { ...s }, radius: 3, goal: { ...s }, wait: rng.range(1, 4) };
    }
    // Les nageurs : au large du ponton, ils font des longueurs (sans monture : ils nagent d'eux-mêmes).
    swimmers.forEach((id, i) => {
      const s = { x: jx + 0.5 + (i % 2 ? 3.5 : -3.5), y: shore + 3 + i };
      const t = this.talk(id, s, rng.int(8), ['Idle'], persona(id));
      t.actor.canSwim = t.actor.nativeSwimmer = t.actor.swimming = true;
      t.actor.swimBlend = 1;
      t.wander = { home: { ...s }, radius: 5, goal: { ...s }, wait: rng.range(0.5, 2), water: true };
    });

    // Sur l'île, devant le temple : Lugia et les deux ermites, qui vont et viennent.
    const islanders: [number, number, string[]][] = [
      [ISLAND_NPCS.sage, 0, LINES.sage],
      [ISLAND_NPCS.hermits[0], -5, LINES.hermit],
      [ISLAND_NPCS.hermits[1], 5, [...LINES.hermit].reverse()],
    ];
    for (const [id, dx, lines] of islanders) {
      const s = place.freeSpot(Math.floor(island.x + dx), Math.floor(island.y) + 1, 3);
      this.talk(id, s, 0, ['Idle'], lines).wander = { home: { ...s }, radius: dx ? 2.5 : 1.5, goal: { ...s }, wait: rng.range(1, 4) };
    }
  }

  /** Un Pokémon à qui parler, dans sa pose ; `fighter` : il lui faut ses attaques (planche complète). */
  private talk(id: number, at: Spot, dir: number, pose: string[], lines: readonly string[], fighter = false): Talker {
    const bubble = document.createElement('div');
    bubble.className = 'room-label shop-bubble';
    this.layer.append(bubble);
    const t: Talker = { actor: this.spawn(id, at, dir, pose, fighter), lines: [...lines], talk: 0, bubble, bubbleT: 0 };
    this.talkers.push(t);
    return t;
  }

  private spawn(id: number, at: Spot, dir: number, pose: string[], fighter = false): Actor {
    const actor = new Actor(id, at.x, at.y);
    actor.dir = dir;
    void loadInfo(id).then((i) => (actor.info = i));
    void loadSheet(id, fighter ? PLAYER_ACTIONS : ['Sleep', 'Idle', 'Hop', 'Sit', 'Laying']).then((sh) => {
      actor.sheet = sh;
      actor.setPose(pose);
    });
    this.npcs.push(actor);
    return actor;
  }

  update(dt: number, input: InputSample, player: Actor, world: WorldMap): void {
    if (!this.active) return;
    this.lead = player.info?.name ?? 'toi';
    // Le poste le plus proche (l'arche compte pour le départ), sinon un Pokémon à qui parler.
    // Celui à qui l'on parle déjà garde la main un peu plus loin : le repère ne saute pas
    // d'un voisin à l'autre au bord de la portée.
    const dist = (n: Post | Talker) => {
      const d = Math.hypot(player.x - n.actor.x, player.y - n.actor.y);
      return 'station' in n && n.station === 'start' ? Math.min(d, Math.hypot(player.x - this.gate.x, player.y - this.gate.y)) : d;
    };
    const keep = this.near && dist(this.near) < ('station' in this.near ? POST_REACH : TALK_REACH) + STICKY ? this.near : null;
    let near: Post | Talker | null = keep;
    let best = keep ? dist(keep) - STICKY : POST_REACH;
    for (const p of this.posts) {
      const d = dist(p);
      if (d < best) {
        best = d;
        near = p;
      }
    }
    if (!near || !('station' in near)) {
      best = near ? Math.min(best, TALK_REACH) : TALK_REACH;
      for (const f of this.talkers) {
        const d = dist(f);
        if (d < best) {
          best = d;
          near = f;
        }
      }
    }
    this.near = near;
    // Les gardiens se tournent vers qui vient leur parler.
    for (const p of this.posts) {
      p.actor.dir = p === near ? dirFromVector(player.x - p.actor.x, player.y - p.actor.y) : p.rest;
      p.actor.tickTimers(dt);
    }
    for (const f of this.talkers) {
      if (f.wander) this.stroll(f, f.wander, dt, world, f === near ? player : null);
      else f.actor.tickTimers(dt);
      f.bubbleT -= dt;
      f.bubble.classList.toggle('open', f.bubbleT > 0);
      const m = f.dummy;
      if (!m) continue;
      // Entraînement : un coup sur le mannequin toutes les 1,3 à 2,4 s, comme les mercenaires de la boutique.
      f.actor.dir = f === near ? dirFromVector(player.x - f.actor.x, player.y - f.actor.y) : m.x > f.actor.x ? 2 : 6;
      m.hitT = Math.max(0, m.hitT - dt);
      m.trainT -= dt;
      if (m.trainT <= 0 && f !== near) {
        f.actor.playAction(['Attack', 'Shoot', 'Charge'], 0);
        f.actor.lunge = { dx: Math.sign(m.x - f.actor.x) * 0.5, dy: 0, t: 0 };
        m.hitT = 0.35;
        m.trainT = 1.3 + Math.random() * 1.1;
      }
    }
    this.mark.classList.toggle('open', Boolean(near && 'station' in near));
    this.renderPrompt();
    if (!input.interact || !near) return;
    if ('station' in near) this.open(near.station);
    else {
      near.bubble.textContent = fillLine(near.lines[near.talk++ % near.lines.length], { champion: 'la Ligue', zone: 'le Repaire', lead: this.lead });
      near.bubbleT = 3.5;
      if (!near.dummy) near.actor.playAction(['Hop'], 0);
    }
  }

  /**
   * Au pas (comme les flâneurs de la boutique) : un but au hasard autour de
   * son point d'attache, une pause, un autre but. Un nageur ne quitte pas
   * l'eau. On s'arrête pour écouter celui qui vient parler.
   */
  private stroll(f: Talker, w: NonNullable<Talker['wander']>, dt: number, world: WorldMap, listener: Actor | null): void {
    const a = f.actor;
    let mx = 0;
    let my = 0;
    if (listener) a.dir = dirFromVector(listener.x - a.x, listener.y - a.y);
    else if (w.wait > 0) w.wait -= dt;
    else if (Math.hypot(w.goal.x - a.x, w.goal.y - a.y) < 0.4) {
      const ang = Math.random() * Math.PI * 2;
      const r = 0.6 + Math.random() * w.radius;
      const g = { x: w.home.x + Math.cos(ang) * r, y: w.home.y + Math.sin(ang) * r };
      const i = Math.floor(g.y - 0.25) * world.w + Math.floor(g.x);
      if (!w.water || world.water[i]) w.goal = g;
      w.wait = 1.5 + Math.random() * 3;
    } else {
      const len = Math.hypot(w.goal.x - a.x, w.goal.y - a.y);
      mx = ((w.goal.x - a.x) / len) * 0.18;
      my = ((w.goal.y - a.y) / len) * 0.18;
    }
    const [x, y] = [a.x, a.y];
    a.updatePlayer(dt, { mx, my, dash: false, move: -1, interact: false, ult: false, swap: false }, world);
    // Bloqué, ou au bord de l'eau pour un nageur : il change de but.
    const i = Math.floor(a.y - 0.25) * world.w + Math.floor(a.x);
    if (w.water && !world.water[i]) {
      a.x = a.prevX = x;
      a.y = a.prevY = y;
      w.goal = { x, y };
    } else if ((mx || my) && a.x === x && a.y === y) w.goal = { x, y };
  }

  private renderPrompt(): void {
    const n = this.near;
    const hint = !n ? '' : 'station' in n ? `[E] ${n.actor.info?.name ?? '…'} — ${STATIONS[n.station].title}` : `[E] Parler à ${n.actor.info?.name ?? '…'}`;
    if (this.prompt.dataset.key === hint && this.prompt.hidden === !hint) return;
    this.prompt.dataset.key = hint;
    this.prompt.hidden = !hint;
    if (hint) this.prompt.replaceChildren(Object.assign(document.createElement('div'), { className: 'shop-hint', textContent: hint }));
  }

  /** Le feu, les tables des étals et les mannequins, triés avec les Pokémon par leur ligne de sol. */
  extras(time: number): { y: number; draw(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void }[] {
    if (!this.active) return [];
    type Extra = { y: number; draw(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void };
    const out: Extra[] = [
      { y: this.fire.y * TILE + 1, draw: (b, camX, camY, k) => this.drawFlame(b, camX, camY, k, time) },
      // Le temple se trie sur le haut de son escalier : qui le gravit passe devant lui.
      { y: this.temple.top * TILE, draw: (b, camX, camY, k) => this.drawSprite(b, camX, camY, k, CAMP_PROPS.ruins, this.temple.x, this.temple.y) },
    ];
    // Le ponton, au ras du sol : on marche sur son plancher.
    const jetty = this.jetty;
    if (jetty) out.push({ y: -Infinity, draw: (b, camX, camY, k) => this.drawSprite(b, camX, camY, k, CAMP_PROPS.jetty, jetty.x, jetty.y) });
    // Les tables juste devant l'auvent (son pied), sinon il les recouvre.
    for (const st of this.stalls) out.push({ y: st.y * TILE + 1, draw: (b, camX, camY, k) => this.drawStall(b, camX, camY, k, st, time) });
    for (const f of this.talkers) {
      const m = f.dummy;
      if (m) out.push({ y: m.y * TILE, draw: (b, camX, camY, k) => drawDummy(b, Math.round((m.x * TILE - camX) * k), Math.round((m.y * TILE - camY) * k), k, m.hitT) });
    }
    return out;
  }

  /** Un décor du tileset dessiné à la main (hors des objets de la carte), pied en (x, y). */
  private drawSprite(b: CanvasRenderingContext2D, camX: number, camY: number, k: number, sp: SpriteDef, x: number, y: number): void {
    const [sx, sy, sw, sh] = sp.rect;
    const px = Math.round((x * TILE - camX) * k);
    const py = Math.round((y * TILE - camY) * k);
    b.drawImage(this.atlas, sx, sy, sw, sh, px - Math.round((sw / 2) * k), py - sp.foot * k, sw * k, sh * k);
  }

  /** La flamme d'Essentials (Animations/fire5), en boucle sur sa bûche. */
  private drawFlame(b: CanvasRenderingContext2D, camX: number, camY: number, k: number, time: number): void {
    const img = this.flame;
    if (!img) return;
    const frame = CAMPFIRE.frames[Math.floor(time * 8) % CAMPFIRE.frames.length];
    const size = CAMPFIRE.cell * FLAME_SCALE * k;
    const px = Math.round((this.fire.x * TILE - camX) * k);
    const py = Math.round((this.fire.y * TILE - 5 - camY) * k);
    b.drawImage(img, frame * CAMPFIRE.cell, 0, CAMPFIRE.cell, CAMPFIRE.cell, px - size / 2, py - CAMPFIRE.base * FLAME_SCALE * k, size, size);
  }

  /**
   * Table d'un étal, sous son auvent : un plateau de bois sur deux pieds, et
   * les CT couchées dessus, qui accrochent la lumière de temps en temps.
   */
  private drawStall(b: CanvasRenderingContext2D, camX: number, camY: number, k: number, st: { x: number; y: number; icons: string[] }, time: number): void {
    const px = Math.round((st.x * TILE - camX) * k);
    const py = Math.round((st.y * TILE - camY) * k);
    const r = (x: number, y: number, w: number, h: number, c: string) => {
      b.fillStyle = c;
      b.fillRect(px + x * k, py + y * k, w * k, h * k);
    };
    r(-25, -13, 50, 3, '#a8763e');
    r(-25, -10, 50, 6, '#6b4424');
    r(-25, -4, 50, 1, '#3b2414');
    r(-23, -4, 3, 4, '#3b2414');
    r(20, -4, 3, 4, '#3b2414');
    st.icons.forEach((icon, i) => {
      const img = this.icons.get(icon);
      if (!img) return;
      const size = 13 * k;
      const cx = px + (i - 1) * 15 * k;
      b.drawImage(img, 0, 0, 48, 48, cx - size / 2, py - 20 * k, size, size);
      // Un reflet passe sur une CT à la fois.
      const glint = (time * 0.7 + i * 0.33) % 1;
      if (glint < 0.12) {
        b.fillStyle = `rgba(255,255,240,${0.6 * (1 - glint / 0.12)})`;
        b.fillRect(cx - 4 * k + glint * 60 * k, py - 17 * k, k, 7 * k);
      }
    });
  }

  placeLabels(proj: Projector): void {
    if (!this.active) return;
    const over = (a: Actor, el: HTMLElement) => {
      const head = a.sheet ? (a.sheet.footRow + 1 - a.sheet.topRow) / 16 : 1.4;
      const at = proj.toCss(a.x, a.y - head - 0.4);
      el.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, -100%)`;
    };
    for (const f of this.talkers) over(f.actor, f.bubble);
    const n = this.near;
    if (n && 'station' in n) over(n.actor, this.mark);
  }
}
