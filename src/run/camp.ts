import { loadImage, loadInfo, loadSheet, PLAYER_ACTIONS } from '../assets/pmd';
import { hash2, Rng } from '../core/rng';
import { linesOf } from '../data/bestiary';
import { fillLine, PERSONAS, SLEEPY } from '../data/chatter';
import { builderId, CAMP_NPCS, ISLAND_NPCS, SWIMMERS } from '../data/species';
import { Actor, dirFromVector } from '../entities/actor';
import type { InputSample } from '../input/input';
import type { BuildingId } from '../meta/catalog';
import { GARDEN, GARDEN_PLOTS, MATERIALS, NECTARS } from '../meta/crafting';
import type { Save } from '../meta/save';
import type { Projector } from '../render/combatfx';
import { CAMP_ATELIER_GLADE, CAMP_EAST_GLADE, CAMP_GLADE, CAMP_W, cleanThin, clearAreas, useGrid, type Pocket, type WorldMap } from '../world/generate';
import { BAR, CAMP_PROPS, CAMPFIRE, EXTRA, FENCES, LAMP, LANE, PLAZA_TILES, PROPS, TILE, TOWN_DECOR, type SpriteDef, type Tile } from '../world/tiles';
import { Placer, type Spot } from './placement';
import { drawDummy } from './shop';

// Le Repaire, le camp des rebelles entre deux runs (HubWorld.gd, redessiné) :
// une clairière de nuit autour d'un grand feu cerclé de torches, un lac au
// sud. Au début, il n'y a presque personne : Dracolosse sous l'arche de
// lierre du départ (au nord), Porygon devant la hutte de l'équipe (à l'est),
// le bâtisseur devant son atelier de bois (au sud-ouest, près de la berge ;
// Charpenti, qui évolue à mesure que le camp grandit), Roucarnage à son
// relais, à côté de Dracolosse (le jeu en ligne, dès la première partie),
// Bouldeneu, le savant, au sud du feu entre l'atelier et la buvette, qui
// explique toutes les mécaniques (ajout : le jeu n'a pas d'encyclopédie). Un
// « ! » flotte au-dessus d'un gardien qui a du neuf (meta/news.ts). Chaque
// aménagement bâti fait venir du monde :
// - le poste d'expédition (à l'est, sous le terrain d'entraînement) : une
//   petite place de briques, la carte des expéditions, et Démolosse, qui
//   envoie des libérés en mission ;
// - la buvette (au sud-est de la place) : Kangourex, la doyenne, derrière son
//   comptoir, le tableau des quêtes dans le dos (ajout : le jeu n'a pas de
//   quêtes) ; une table ronde attend les clients. Écart voulu (retour de
//   test) : tous deux étaient là dès le départ, on les gagne désormais ;
// - l'étude d'Alakazam (sud-ouest) : améliorations, CS ;
// - le marché du tuteur (ouest) : M. Mime et ses deux étals de CT, et Miaouss
//   à un troisième, qui vend les objets tenus et les Super Bonbons ;
// - le dortoir (nord-ouest) : des tipis, et des paillasses où l'on dort ;
// - le terrain d'entraînement (nord-est) : des mannequins qu'on frappe ;
// - le ponton (sur la rive, à l'écart du feu) : on y marche au-dessus de l'eau ;
// - le défrichage (à l'ouest) : une clairière gagnée sur la forêt, où des
//   libérés viennent se promener ; on y bâtit ensuite le champ (des libérés
//   le cultivent) et deux maisons (des paillasses, plus de libérés au camp) ;
// - les jardins (autour de la place) : massifs, bacs de fleurs, et deux bancs
//   où des libérés s'assoient ;
// - les lampadaires (le long des allées, éteints : le Repaire n'a pas de
//   nuit qui tombe) : des libérés veillent dessous ;
// - le défrichage de l'est (derrière la hutte de l'équipe) : une seconde
//   clairière, où l'on bâtit le bourg (deux maisons, une place pavée et son
//   puits, l'allée pavée de briques : le coin « ville » du camp, et bien plus
//   de libérés au camp) ;
// - l'atelier de l'artisan (ajout, sur la rive du lac à l'est du ponton,
//   dans sa propre clairière) : Queulorior et ses recettes, la coupelle à
//   nectar et le visiteur qu'il attire ; le potager d'Héliatronc, ses trois
//   trois parcelles en fleurs, vient avec le champ (meta/crafting.ts).
// Ajout : des allées de sols variés (galets, planches, gravier, briques,
// sable) mènent du chemin de terre aux bâtiments qui n'en avaient pas.
// En dehors des gardiens des postes, le camp ne compte que des libérés — ceux
// qu'on a débloqués, qu'on n'emmène pas et qui ne sont pas en mission : endormis sur les rondins du feu ou au
// dortoir, à l'entraînement, à la nage dans le lac (ceux d'eau), ou à flâner.
// Sur l'île, loin au sud du lac, un temple dont on gravit l'escalier, Lugia et
// deux ermites : on n'y va qu'à la nage, avec la CS Surf. Un repère tressaute
// au-dessus du gardien dont on s'approche ; E ouvre son écran (main.ts), après
// sa présentation la première fois.
//
// Écarts voulus avec le jeu : un camp resserré (le jeu étalait ses quartiers
// sur 116 × 96 cases), des aménagements payés en Baies en plus du bois, de la
// pierre et des vivres, et un camp qui s'agrandit sur la forêt.

export type Station = 'start' | 'team' | 'builder' | 'missions' | 'quests' | 'lore' | 'moves' | 'upgrades' | 'items' | 'online' | 'garden' | 'craft' | 'visitor' | 'recruit';

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
  missions: {
    id: CAMP_NPCS.missions,
    type: 'dark',
    title: 'Missions',
    kicker: 'le pisteur',
    intro: 'Je connais chaque sentier à trois jours d’ici. Confie-moi des libérés : ils rapporteront du bois, de la pierre, des vivres. Ils avancent pendant que tu te bats, salle après salle.',
  },
  quests: {
    id: CAMP_NPCS.quests,
    type: 'normal',
    title: 'Quêtes',
    kicker: 'la doyenne',
    intro: 'J’ai vu passer bien des rebelles, petit. Les plus forts ne sont pas ceux qui frappent le plus fort, mais ceux qui relèvent les défis. Relève les miens, et des amis rares te rejoindront.',
  },
  lore: {
    id: CAMP_NPCS.lore,
    type: 'grass',
    title: 'Leçons',
    kicker: 'le savant',
    intro: 'Ah, un rebelle curieux ! J’ai tout noté : les types, les états, les dons des légendaires, les pièges des salles… Assieds-toi, et demande-moi ce que tu veux. On se bat mieux quand on sait pourquoi on gagne.',
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
  // Ajout (retour de test) : les objets tenus et les Super Bonbons quittent l'étude d'Alakazam
  // pour l'étal de Miaouss, au marché.
  items: {
    id: CAMP_NPCS.items,
    type: 'normal',
    title: 'Objets',
    kicker: 'le marchand',
    intro: 'Tout ce qui brille finit sur mon étal, nya. Un objet bien tenu change un Pokémon… et un Super Bonbon, ça se reprend si tu changes d’avis. Tant que tu paies en Baies !',
  },
  online: {
    id: CAMP_NPCS.online,
    type: 'flying',
    title: 'En ligne',
    kicker: 'le messager',
    intro: 'Je porte les messages d’un camp à l’autre. D’autres rebelles se battent ailleurs : un jour, je te mènerai jusqu’à eux.',
  },
  // Ajout (retour de test : « on sème des graines… un artisan… le nectar ») : le potager du
  // champ, l'atelier de l'artisan, et le Pokémon qu'un nectar a attiré (meta/crafting.ts).
  garden: {
    id: CAMP_NPCS.garden,
    type: 'grass',
    title: 'Potager',
    kicker: 'la jardinière',
    intro: 'Le soleil, l’eau, un peu de patience… Dis-moi ce que tu veux voir pousser : je le plante dans mes parcelles, et pendant que tu te bats, ça fleurit.',
  },
  craft: {
    id: CAMP_NPCS.craft,
    type: 'normal',
    title: 'Atelier',
    kicker: 'l’artisan',
    intro: 'Une plume, une écaille, une poignée d’herbes… Pour moi, tout ça, c’est de la peinture. Apporte-moi ce que tu trouves dans les coffres, et je t’en fais un objet que personne ne vend.',
  },
  visitor: {
    // (Son espèce change à chaque nectar : stationId la lit dans la sauvegarde.)
    id: 0,
    type: 'normal',
    title: 'Visiteur',
    kicker: 'attiré par le nectar',
    intro: '',
  },
  recruit: {
    // (La première recrue de la file d'attente, Save.candidates : stationId la lit dans la sauvegarde.)
    id: 0,
    type: 'normal',
    title: 'Recrue',
    kicker: 'veut rejoindre la rébellion',
    intro: '',
  },
};

/**
 * Le gardien d'un poste : le bâtisseur évolue avec le nombre d'aménagements
 * bâtis ; le visiteur est l'espèce que le nectar a attirée (`visitor`), la recrue
 * celle qui attend la première (`recruit`).
 */
export const stationId = (station: Station, built: readonly BuildingId[], visitor = 0, recruit = 0): number =>
  station === 'builder' ? builderId(built.length) : station === 'visitor' ? visitor : station === 'recruit' ? recruit : STATIONS[station].id;

/** Ce que disent ceux qui n'ont pas de poste (NpcDialogue.gd : « sage », « ermite », et le camp). */
const LINES = {
  sage: ['Peu franchissent l’eau. Encore moins reviennent en parler.', 'Ces pierres tenaient debout bien avant les Poké Balls. Elles verront leur fin.', 'Ta rébellion n’invente rien, petit. Elle se souvient.'],
  hermit: ['On vit ici sans chaînes depuis toujours. On ne savait pas que c’était rare.', 'Le lac nous protège mieux qu’aucune palissade.', 'Reste si tu veux. Repars si tu dois. Personne ne te retiendra.'],
  farmer: ['La terre d’ici est bonne. Personne ne l’avait jamais retournée.', 'Ce qui pousse là nourrira le camp tout l’hiver.', 'Des racines, des choux, des baies… et pas un dresseur à l’horizon.'],
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
/** CT exposées sur les étals du tuteur, puis l'étal de Miaouss (objets tenus, Super Bonbon). */
const STALL_CTS = [
  ['machine_FIRE', 'machine_ELECTRIC', 'machine_WATER'],
  ['machine_PSYCHIC', 'machine_GROUND', 'machine_ICE'],
  ['CHOICEBAND', 'RARECANDY', 'LEFTOVERS'],
];
/** Taille de la flamme d'Essentials à l'écran (sa case de 192 px ramenée à ~31 px de décor). */
const FLAME_SCALE = 0.16;
/** Cercle de pierres du feu : nombre de cailloux, demi-axes en cases (aplati, comme vu de trois quarts). */
const HEARTH_STONES = 8;
const HEARTH_RX = 1.35;
const HEARTH_RY = 0.75;
/** Hauteur (px) du dessus d'un rondin : qui s'y couche se dessine d'autant plus haut. */
const LOG_TOP = 7;
/** Hauteur (px) de l'assise d'un banc des jardins. */
const BENCH_TOP = 6;
/** Hauteur (px) de l'assise d'un siège de la buvette. */
const SEAT_TOP = 5;
/** La teinte de chaque nectar dans sa coupelle (et de ses volutes). */
const NECTAR_TINT: Record<string, string> = { 'nectar-flower': '#ff8fc8', 'nectar-sea': '#5fc8ff', 'nectar-fire': '#ff9a3c', 'nectar-odd': '#b48cff' };
/** Ce que devient chaque plante du potager : ses boutons, puis sa fleur (planche du tileset). */
const PLANT_LOOK: Record<string, { bud: SpriteDef; bloom: SpriteDef }> = {
  'energy-root': { bud: CAMP_PROPS.garden.buds[2], bloom: CAMP_PROPS.garden.blooms[1] },
  'white-herb': { bud: CAMP_PROPS.garden.buds[0], bloom: CAMP_PROPS.garden.blooms[0] },
  'mental-herb': { bud: CAMP_PROPS.garden.buds[1], bloom: CAMP_PROPS.garden.blooms[2] },
  'power-herb': { bud: CAMP_PROPS.garden.buds[2], bloom: CAMP_PROPS.garden.pink },
  'revival-herb': { bud: CAMP_PROPS.garden.buds[1], bloom: CAMP_PROPS.garden.blue },
};
/** Une parcelle mûre du potager : la plante à récolter flotte au-dessus. */
type Bed = { x: number; y: number; icon: string };
/** Demi-largeur (en cases) d'une allée du Repaire. */
const LANE_R = 1.7;

/** Le tracé d'une allée, lissé (spline de Catmull-Rom passant par ses points), un point par quart de case. */
function smoothLane(pts: readonly (readonly [number, number])[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [pts[Math.max(0, i - 1)], pts[i], pts[i + 1], pts[Math.min(pts.length - 1, i + 2)]];
    const steps = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * 4));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push([...pts[pts.length - 1]] as [number, number]);
  return out;
}

/**
 * Où se tient chaque poste, par rapport au feu (en cases) : build les pose là, et
 * campPockets ouvre leur poche dans la forêt du Repaire compact.
 */
const POSTS = {
  hut: [16, -0.6],
  yard: [-8.5, 12],
  study: [-17, 7.4],
  market: [-17, -2.4],
  dorm: [-12, -9.4],
  training: [11, -8],
  scout: [19, -5.4],
  elder: [12, 9],
  lab: [-15, 19.5],
  relay: [8, -12.4],
  gate: [0.5, -14],
} as const satisfies Record<string, readonly [number, number]>;

/**
 * Les poches du Repaire compact (generate.ts, `pockets`) : autour de chaque poste d'office
 * (l'arche de Dracolosse, le relais, la hutte de l'équipe, l'atelier du bâtisseur, le coin
 * du savant), et de chaque aménagement bâti. Le reste est forêt : bâtir agrandit le camp.
 * Les clairières défrichées et l'atelier de l'artisan ont déjà les leurs (generate.ts).
 */
export function campPockets(built: readonly BuildingId[], hub: { x: number; y: number } = { x: CAMP_W / 2, y: 19 }): Pocket[] {
  const p = (k: keyof typeof POSTS, rx: number, ry: number): Pocket => ({ x: hub.x + POSTS[k][0], y: hub.y + POSTS[k][1], rx, ry });
  const has = (b: BuildingId) => built.includes(b);
  return [
    p('gate', 6, 3.5),
    p('relay', 5, 3.5),
    p('hut', 6, 4.5),
    p('yard', 6.5, 4.5),
    p('lab', 6.5, 4.5),
    ...(has('study') ? [p('study', 6, 4.5)] : []),
    ...(has('market') ? [p('market', 9, 4.5)] : []),
    ...(has('dorm') ? [p('dorm', 8.5, 4.5)] : []),
    ...(has('training') ? [p('training', 6.5, 4)] : []),
    ...(has('outpost') ? [p('scout', 5.5, 3.5)] : []),
    ...(has('tavern') ? [p('elder', 7, 4)] : []),
  ];
}

/**
 * Combien de libérés vivent au camp (les derniers débloqués) : seize, plus
 * la place que fait chaque aménagement. Au-delà, le camp deviendrait illisible.
 */
const DWELLERS = 16;
const DWELLERS_PER: Partial<Record<BuildingId, number>> = { houses: 10, hamlet: 12, gardens: 2, lamps: 2 };
/**
 * Lampadaire éteint : le Repaire n'a pas de cycle jour et nuit, et un
 * lampadaire allumé sous un ciel clair se voyait (retour de test). Les torches
 * et le feu suffisent à éclairer la place.
 */
const LAMP_OFF: SpriteDef = { ...LAMP, light: false };
/** Écart minimal entre deux lampadaires (cases), et entre un lampadaire et un gardien. */
const LAMP_GAP = 7;
const LAMP_CLEAR = 3;

interface Post {
  station: Station;
  actor: Actor;
  /** Où il regarde quand personne ne lui parle. */
  rest: number;
  /** Repère « ! » : du neuf à son poste (meta/news.ts) ; caché sinon. */
  news: HTMLElement;
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
  /** La coupelle devant l'atelier (pied du socle), et le nectar qui y est posé (icône, teinte ; vides sinon). */
  private lure: { x: number; y: number; icon: string; color: string } | null = null;
  /** Les parcelles mûres du potager : la plante à récolter, qui flotte au-dessus. */
  private beds: Bed[] = [];
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
    for (const f of [...STALL_CTS.flat(), ...Object.values(NECTARS).map((n) => n.icon), ...Object.values(MATERIALS).map((m) => m.icon)]) {
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
    this.lure = null;
    this.beds = [];
    this.npcs.length = 0;
    this.layer.replaceChildren();
    this.prompt.hidden = true;
    this.near = null;
  }

  /**
   * Installe le camp : le feu, l'arche, les décors des postes et des
   * aménagements bâtis, les torches et les ruines de l'île entrent dans les
   * objets de la carte (à faire avant Renderer.bake), puis les Pokémon s'y
   * posent. `built` : les aménagements du bâtisseur ; `unlocked` : les espèces des
   * libérés qui restent au camp (ni dans l'équipe, qui ne traîne pas au camp, ni en
   * mission), une par individu ;
   * `craft` : les parcelles du potager et le nectar posé devant l'atelier.
   */
  build(world: WorldMap, built: readonly BuildingId[], unlocked: readonly number[] = [], craft: Pick<Save, 'garden' | 'nectar' | 'candidates'> = { garden: [], nectar: null, candidates: [] }): void {
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
    /** La terre labourée du champ sur w × h cases : le carré 3 × 3 du tileset étiré par ses bords. */
    const soil = (x: number, y: number, w: number, h: number) => {
      const { col, row } = CAMP_PROPS.soil;
      const edge = (d: number, n: number) => (d === 0 ? 0 : d === n - 1 ? 2 : 1);
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) world.flat.push({ tile: [col + edge(dx, w), row + edge(dy, h)], x: x + dx, y: y + dy });
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
    const at0 = (k: keyof typeof POSTS) => ({ x: hx + POSTS[k][0], y: hy + POSTS[k][1] });
    const hut = at0('hut');
    // L'atelier du bâtisseur, au sud-ouest près de la berge : assez bas pour que son toit
    // passe sous la torche du sud-ouest, à l'écart de l'étude.
    const yard = at0('yard');
    const study = at0('study');
    const market = at0('market');
    const dorm = at0('dorm');
    // Le terrain d'entraînement, au nord-est, sous le relais : il empiétait sur son banc et ses
    // pots, et son allée de sable passait sur la terre battue (retour de test). Il est à quatre
    // pas du chemin du nord : plus d'allée.
    const training = at0('training');
    // Le relais de Roucarnage, à côté de Dracolosse, à l'est de l'arche : le courrier part
    // avec ceux qui partent (retour de test : il était perdu au sud-est, près du puits).
    const relay = { x: gx + 7.5, y: gy + 2.6 };
    const scout = at0('scout');
    // La stèle de la doyenne, au sud-est de la place, là où était le relais : un coin dégagé
    // face au feu (elle était coincée entre la hutte et l'allée de l'est).
    const elder = at0('elder');
    // Le coin du savant : au fond de la rive ouest du lac, un cul-de-sac au calme (retours de
    // test : coincé entre l'atelier du bâtisseur et la buvette, puis en plein passage sur la rive
    // nord). Son tableau au nord, et, une fois les jardins bâtis, deux bancs au sud où des
    // libérés suivent la leçon.
    const lab = at0('lab');
    // L'atelier de l'artisan, sur la rive du lac à l'est du ponton, dans sa clairière
    // (CAMP_ATELIER_GLADE, que generate.ts ouvre quand il est bâti) ; une allée y descend
    // depuis le chemin de l'est. Le nectar se pose à l'ouest de l'allée, sur sa coupelle.
    // Écart voulu (retour de test : « plus à droite du ponton… un espace un peu plus grand ») :
    // il était serré entre le savant et le ponton.
    const atelier = { x: hx + CAMP_ATELIER_GLADE.dx + 1, y: hy + CAMP_ATELIER_GLADE.dy };
    // Le nectar, contre la façade, à gauche de la porte (il était au milieu de l'allée).
    const lure = { x: atelier.x - 2.6, y: atelier.y + 0.7 };
    // La clairière défrichée (generate.ts, CAMP_GLADE) : les maisons au nord, au bout de
    // l'allée ; le champ au sud-ouest ; deux paillasses à côté du champ.
    const glade = { x: hx + CAMP_GLADE.dx, y: hy + CAMP_GLADE.dy };
    const cottages = [
      { x: glade.x - 4.5, y: glade.y - 1.5 },
      { x: glade.x + 3.5, y: glade.y - 1.5 },
    ];
    const field = { x: Math.floor(glade.x) - 7, y: Math.floor(glade.y) + 1, w: 8, h: 4 };
    // La clairière de l'est (CAMP_EAST_GLADE) : les deux maisons au nord, l'allée arrive par
    // l'ouest, les paillasses au sud-est, le puits au sud.
    const east = { x: hx + CAMP_EAST_GLADE.dx, y: hy + CAMP_EAST_GLADE.dy };
    const hamlet = [
      { x: east.x - 2.5, y: east.y - 2 },
      { x: east.x + 4.5, y: east.y - 2 },
    ];
    // Le bourg (retour de test : « une partie qui fasse plus ville ») : une place pavée de
    // chevrons devant les maisons, le puits au milieu, et l'allée pavée de briques à l'entrée.
    const square = { x: Math.floor(east.x) - 3, y: Math.floor(east.y) - 1, w: 9, h: 6 };
    const eastWell = { x: square.x + 4.5, y: square.y + 3.9 };
    // Les jardins : deux bancs face au tableau du savant (retour de test : au sud de la place, ils
    // se serraient contre les torches et les allées), des massifs entre les torches.
    const benches = [
      { x: lab.x - 2, y: lab.y + 3.1 },
      { x: lab.x + 2.2, y: lab.y + 3.1 },
    ];
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
    // Ajout (retour de test : « plein de bâtiments où il n'y a pas de chemin qui mène… varier les
    // types de sol… un truc assez smooth ») : une allée part du chemin de terre jusqu'à la porte
    // de chaque bâtiment qui en manquait, chacune de son sol, bordée d'herbe déchiquetée
    // (renderer.ts, WorldMap.lanes). Le tracé passe par des points (en cases), lissé en courbe.
    const lanes: { pts: readonly (readonly [number, number])[]; fill: readonly Tile[] }[] = [
      // L'atelier : il descend du chemin de l'est par la clairière, et tourne devant la porte.
      // (Du même pavé que le bourg, à l'entrée duquel elle part : retour de test, trop de sols.)
      ...(has('atelier') ? [{ pts: [[62, 22.5], [62.6, 27], [62.8, 31.5], [63.6, 35.2], [65.6, 37.6], [atelier.x, atelier.y + 1.4]] as const, fill: [PLAZA_TILES.herringGold] }] : []),
      // Le bâtisseur : des planches, du sud de la place au pas de sa porte, entre deux torches,
      // et par devant (retours de test : elle passait sur une torche, puis sous le bâtiment).
      { pts: [[43.6, 25.4], [42.8, 29.6], [40.4, 32.4], [yard.x + 2, yard.y + 1.8]] as const, fill: LANE.planks },
      // L'étude : elle longe la hutte par l'est et arrive devant sa porte (elle finissait sur la statue).
      ...(has('study') ? [{ pts: [[31.2, 21.8], [31.4, 25], [30.2, 27.8], [study.x, study.y + 1.3]] as const, fill: LANE.gravel }] : []),
      // (Plus d'allée pour le savant, au bord du lac, ni pour la buvette, posée sur son plancher, ni
      // pour le terrain d'entraînement, tout près du chemin, ni pour le dortoir : ses briques
      // passaient sous un tipi et s'arrêtaient net, retour de test.)
    ].map((l) => ({ ...l, pts: smoothLane(l.pts) }));

    // On arrive près du feu ; chaque poste a sa place nette (ni arbre, ni rocher, ni herbe haute), chaque torche aussi.
    world.spawn = { x: hx + 0.5, y: hy + 3.6 };
    clearAreas(world, [
      { x: gx, y: gy, rx: 6, ry: 3 },
      { x: hut.x, y: hut.y, rx: 5, ry: 4 },
      { x: yard.x, y: yard.y - 1, rx: 6, ry: 3 },
      { x: study.x, y: study.y, rx: 5.5, ry: 4 },
      { x: market.x, y: market.y, rx: 6.5, ry: 3.6 },
      { x: dorm.x, y: dorm.y, rx: 7, ry: 4 },
      { x: training.x, y: training.y, rx: 6, ry: 4 },
      { x: relay.x + 0.5, y: relay.y - 0.5, rx: 3, ry: 2.2 },
      // Devant le relais aussi : un sapin masquait Roucarnage (retour de test).
      { x: relay.x + 1, y: relay.y + 2.6, rx: 5, ry: 2.4 },
      ...(has('outpost') ? [{ x: scout.x + 0.5, y: scout.y + 0.5, rx: 5, ry: 2.8 }] : []),
      ...(has('tavern') ? [{ x: elder.x, y: elder.y + 0.6, rx: 5.5, ry: 3 }] : []),
      // L'atelier, sa cour et la coupelle ; derrière lui aussi, que les sapins ne mordent pas sur son toit.
      ...(has('atelier') ? [{ x: atelier.x - 2.5, y: atelier.y + 1, rx: 8, ry: 3 }, { x: atelier.x, y: atelier.y - 3, rx: 5, ry: 4 }, { x: lure.x, y: lure.y - 1, rx: 3, ry: 2.5 }] : []),
      { x: lab.x, y: lab.y + 1.5, rx: 6.5, ry: 3.4 },
      { x: jx + 0.5, y: shore, rx: 4.5, ry: 4 },
      { x: island.x, y: island.y - 2, rx: 11, ry: 6 },
      ...torches.map((t) => ({ x: t.x, y: t.y - 0.5, rx: 1.6, ry: 1.6 })),
      // (Seulement une fois défrichée : ailleurs, ce serait mordre sur la forêt.)
      ...(has('clearing') ? [{ x: glade.x, y: glade.y + 1, rx: 8.5, ry: 7.5 }] : []),
      ...(has('eastglade') ? [{ x: east.x, y: east.y + 1, rx: 7.5, ry: 7 }] : []),
      ...(has('gardens') ? benches.map((b) => ({ x: b.x, y: b.y, rx: 2.5, ry: 1.5 })) : []),
      // Le long des allées (un point sur six suffit : ils sont à un quart de case).
      ...lanes.flatMap((l) => l.pts.filter((_, i) => i % 6 === 0).map(([x, y]) => ({ x, y, rx: 1.9, ry: 1.9 }))),
    ]);
    // Le sol des allées : les cases proches du tracé, dans le camp, hors de l'eau et du chemin de terre.
    world.lanes = lanes.map((l) => {
      const mask = new Uint8Array(W * world.h);
      for (const [px, py] of l.pts) {
        for (let y = Math.floor(py - LANE_R); y <= Math.floor(py + LANE_R); y++) {
          for (let x = Math.floor(px - LANE_R); x <= Math.floor(px + LANE_R); x++) {
            const i = y * W + x;
            if (x < 0 || y < 0 || x >= W || y >= world.h || !world.inside[i] || world.water[i] || world.path[i]) continue;
            if (Math.hypot(x + 0.5 - px, y + 0.5 - py) < LANE_R) mask[i] = 1;
          }
        }
      }
      return { mask, fill: l.fill };
    });
    /**
     * Un sol posé en tache (buvette, poste d'expédition, terrain d'entraînement) : une ellipse
     * au bord un peu irrégulier, rendue comme les allées (liseré d'herbe déchiquetée), libérée
     * de ses herbes et de ses décors au ras du sol. Écart voulu (retour de test : les carrés de
     * briques et de planches étaient « trop rectilignes »).
     */
    const ground = (cx: number, cy: number, rx: number, ry: number, fill: readonly Tile[], salt: number): Uint8Array => {
      const mask = new Uint8Array(W * world.h);
      for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
        for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
          const i = y * W + x;
          if (x < 0 || y < 0 || x >= W || y >= world.h || !world.inside[i] || world.water[i] || world.path[i]) continue;
          const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
          if (d >= 1 + (hash2(x, y, salt) - 0.5) * 0.4) continue;
          mask[i] = 1;
          world.tall[i] = 0;
        }
      }
      world.lanes!.push({ mask, fill });
      world.objects = world.objects.filter((o) => !(o.sprite.trunk === 0 && mask[at(o.x / TILE, (o.y - 1) / TILE)]));
      world.flat = world.flat.filter((f) => !mask[f.y * W + f.x]);
      return mask;
    };

    // Le feu, au cœur de la place, dans son cercle de pierres ; quatre rondins tout près, pour s'asseoir.
    // (Posée sur une bûche couchée, la flamme faisait bizarre : le tileset n'a pas de foyer, on
    // l'entoure de cailloux. Ceux du fond passent derrière elle, ceux de devant cachent sa base.)
    this.fire = { x: hx, y: hy + 0.6 };
    world.fires = [this.fire];
    for (let i = 0; i < HEARTH_STONES; i++) {
      // Décalé d'un demi-pas : pas de caillou pile devant la flamme, qui la cacherait.
      const a = ((i + 0.5) / HEARTH_STONES) * Math.PI * 2;
      put(CAMP_PROPS.hearth[i % CAMP_PROPS.hearth.length], this.fire.x + Math.cos(a) * HEARTH_RX, this.fire.y + Math.sin(a) * HEARTH_RY, false);
    }
    // Rien ne se pose dans le cercle ni sur ses pierres.
    for (let cx = hx - 2; cx <= hx + 1; cx++) for (let cy = hy; cy <= hy + 1; cy++) place.block(cx, cy);
    const seats: Spot[] = [];
    /** Les sièges du comptoir de la buvette. */
    const barSeats: Spot[] = [];
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
    // La recrue qui attend (Save.candidates) : près du feu, là où l'on arrive, un « ! » au-dessus.
    if (craft.candidates.length) posts.push(['recruit', place.freeSpot(hx + 3, hy + 4, 2), 0]);

    // La hutte de l'équipe, à l'est : le registre des libérés est épinglé au panneau d'à côté.
    put(CAMP_PROPS.thatchHut, hut.x, hut.y);
    put(CAMP_PROPS.board, hut.x - 3.2, hut.y + 0.2);
    posts.push(['team', place.freeSpot(Math.floor(hut.x), Math.floor(hut.y) + 1, 3), 0]);

    // L'atelier du bâtisseur : sa maison de bois. (Ses rondins et sa souche encombraient
    // l'abord du bâtisseur : retirés, retour de test.)
    put(CAMP_PROPS.workshop, yard.x, yard.y);
    posts.push(['builder', place.freeSpot(Math.floor(yard.x) + 2, Math.floor(yard.y) + 1, 3), 0]);

    // Le relais de Roucarnage, là dès le début : on peut jouer à plusieurs dès la première
    // partie. Sa boîte aux lettres, le panneau où s'épinglent les nouvelles des autres camps,
    // et deux pots ; il se tient devant, à côté de Dracolosse.
    // Écart voulu (retour de test) : un coin plus douillet, un banc et des hortensias contre
    // la lisière ; et Roucarnage juste devant sa boîte (posé à la main : freeSpot l'écartait
    // de deux cases, la boîte et le panneau réservant leurs abords).
    put(CAMP_PROPS.mailbox, relay.x, relay.y);
    put(TOWN_DECOR.board, relay.x + 1.6, relay.y - 0.1);
    put(TOWN_DECOR.pots[0], relay.x - 1.2, relay.y + 0.1);
    put(TOWN_DECOR.pots[1], relay.x + 2.8, relay.y + 0.1);
    put(TOWN_DECOR.hydrangeas[1], relay.x + 4.6, relay.y + 0.2);
    put(TOWN_DECOR.bench, relay.x + 3.9, relay.y + 2.1);
    put(TOWN_DECOR.pots[2], relay.x + 6.1, relay.y + 2.2);
    posts.push(['online', { x: relay.x + 0.7, y: relay.y + 1.5 }, 0]);

    if (has('outpost')) {
      // Le poste d'expédition de Démolosse. Écart voulu (retour de test : « un truc plus
      // urbain », son panneau et ses tonneaux faisaient pauvre) : une petite place de briques
      // grises, la grande carte des expéditions dans son dos, un lampadaire, des caisses et
      // des tonneaux de provisions — on part d'ici comme d'une gare.
      const sq = { x: Math.floor(scout.x) - 2, y: Math.floor(scout.y), w: 6, h: 3 };
      // (Rien ne bloque sur la place : les sapins et rochers qui s'y trouvaient s'en vont.)
      const stones = ground(scout.x + 0.5, scout.y + 1.4, 3.8, 2.2, [EXTRA.brickGrey.to], 401);
      for (let i = 0; i < stones.length; i++) if (stones[i]) world.blocked[i] = world.solid[i] = 0;
      world.objects = world.objects.filter((o) => !stones[at(o.x / TILE, (o.y - 1) / TILE)]);
      put(TOWN_DECOR.mapBoard, scout.x + 0.5, scout.y + 0.2);
      put(LAMP_OFF, sq.x + 0.5, sq.y + 0.95);
      put(TOWN_DECOR.crates, scout.x + 2.6, scout.y + 0.3);
      put(CAMP_PROPS.barrels[0], scout.x + 3.5, scout.y + 0.4);
      put(CAMP_PROPS.barrels[1], scout.x + 3.1, scout.y + 1.5, false);
      posts.push(['missions', { x: scout.x + 0.5, y: scout.y + 1.5 }, 0]);
    }

    if (has('tavern')) {
      // La buvette de Kangourex. Écart voulu (retour de test) : la stèle gravée, seule, se
      // lisait comme un pylône (« au bar, un tableau de quêtes derrière elle ») ; puis l'étal
      // rayé et ses boissons « ne faisaient pas très bar », ni les écriteaux pris pour des
      // tabourets. Le comptoir est une rangée de meubles bas, des bols de soupe et un plateau
      // de fioles dessus ; Kangourex se tient derrière (il lui cache les pieds), les deux
      // tableaux de quêtes dans son dos, un buffet et des tonneaux aux deux bouts. Devant,
      // deux sièges au comptoir ; au nord-est, une table ronde et ses sièges jaunes assortis
      // (au sud, la lisière la cachait).
      const bar = { x: elder.x - 1.6, y: elder.y + 1.35 };
      // Écart voulu (retours de test : l'allée de briques rouges faisait une flaque informe sous
      // le comptoir ; puis le plancher carré était « trop rectiligne ») : un plancher en tache
      // sous le comptoir, les sièges et la table ronde, qui se fond dans l'herbe.
      ground(bar.x + 1.2, elder.y + 0.4, 5.6, 2.9, LANE.planks, 402);
      put(CAMP_PROPS.board, bar.x - 1, elder.y - 0.6);
      put(CAMP_PROPS.board, bar.x + 1, elder.y - 0.6);
      for (let k = 0; k < 5; k++) put(BAR.cabinets[k % 2], bar.x + (k - 2) * 0.75, bar.y);
      // Posé sur le comptoir : dessiné plus haut que son pied (le dessus des meubles), juste
      // après eux dans l'ordre d'affichage.
      const onTop = (sp: SpriteDef, k: number) =>
        world.objects.push({ sprite: { ...sp, foot: sp.foot + 10, trunk: 0 }, x: Math.round((bar.x + (k - 2) * 0.75) * TILE), y: Math.round(bar.y * TILE) + 1, fades: false });
      onTop(BAR.tray, 0.6);
      onTop(BAR.bowls[0], 2.2);
      onTop(BAR.bowls[1], 3.4);
      put(BAR.dresser, bar.x - 2.3, elder.y + 0.4);
      // Deux sièges au comptoir, où des libérés viennent s'asseoir (groupe « bar »).
      for (const dx of [-0.8, 0.8]) {
        const s = { x: bar.x + dx, y: bar.y + 0.9 };
        put(TOWN_DECOR.seat, s.x, s.y);
        barSeats.push(s);
      }
      const table = { x: elder.x + 2, y: elder.y - 1 };
      put(TOWN_DECOR.cafeTable, table.x, table.y);
      put(TOWN_DECOR.seat, table.x - 1.5, table.y + 0.1);
      put(TOWN_DECOR.seat, table.x + 1.5, table.y + 0.1);
      posts.push(['quests', { x: bar.x, y: bar.y - 0.4 }, 0]);
    }

    // Le savant : son tableau couvert de notes, au bord du lac ; il se tient à sa droite, face aux bancs.
    put(CAMP_PROPS.board, lab.x, lab.y);
    put(TOWN_DECOR.pots[0], lab.x - 1.7, lab.y + 0.1);
    posts.push(['lore', { x: lab.x + 2, y: lab.y + 0.8 }, 0]);

    if (has('atelier')) {
      // L'atelier de Queulorior : la maison de briques, des caisses et des tonneaux de matériaux
      // le long du mur, l'artisan à côté de sa porte. À l'ouest, une coupelle sur un pot : le
      // nectar qu'on y pose (son icône s'y dessine, extras) ; le Pokémon qu'il attire attend à
      // côté qu'on vienne lui parler.
      // Écart voulu (troisième retour : « améliorer le décor autour de l'atelier ») : plus de
      // tonneaux ; des pots de part et d'autre de la porte, un massif d'hortensias le long de la
      // façade, les caisses et le bois empilé du côté est, un tournesol au coin.
      put(CAMP_PROPS.atelier, atelier.x, atelier.y);
      put(TOWN_DECOR.pots[2], atelier.x + 0.9, atelier.y + 0.4);
      put(TOWN_DECOR.hydrangeas[1], atelier.x - 4.6, atelier.y + 0.3);
      put(TOWN_DECOR.crates, atelier.x + 3.9, atelier.y - 0.2);
      put(CAMP_PROPS.logs, atelier.x + 5.2, atelier.y + 1.3);
      put(TOWN_DECOR.sunflower, atelier.x + 3.3, atelier.y + 1.1);
      posts.push(['craft', { x: atelier.x + 2.2, y: atelier.y + 1 }, 0]);
      // Le nectar posé : son flacon au pied de la façade, et son parfum en volutes (extras,
      // drawLure). Écart voulu (retours de test : le socle dessiné à la main « ne va pas avec
      // le style », puis la colonne de pierre « je comprends pas l'intérêt ») : plus de support,
      // rien n'est posé tant qu'on n'a pas de nectar.
      const n = craft.nectar;
      this.lure = { x: lure.x, y: lure.y, icon: n ? NECTARS[n.id]?.icon ?? '' : '', color: n ? NECTAR_TINT[n.id] ?? '#ff9ac8' : '' };
      if (n && n.left <= 0) posts.push(['visitor', { x: lure.x - 0.6, y: lure.y + 1.5 }, 0]);
    }

    if (has('study')) {
      // L'étude : la hutte de mousse, gardée par une statue ailée.
      // La statue à gauche de la porte (à droite, l'allée arrive : elle finissait dessus).
      put(CAMP_PROPS.mossHut, study.x, study.y);
      put(CAMP_PROPS.statue, study.x - 3.2, study.y + 0.6);
      posts.push(['upgrades', place.freeSpot(Math.floor(study.x), Math.floor(study.y) + 1, 3), 0]);
    }
    if (has('market')) {
      // Le marché : deux étals sous auvent, des CT posées sur leurs tables ; à l'est, l'étal de
      // Miaouss, ses objets tenus et un Super Bonbon (ajout, retour de test).
      const stalls = STALL_CTS.map((icons, i) => ({ x: market.x + (i - 1) * 4.4, y: market.y, icons }));
      this.stalls.push(...stalls);
      for (const st of stalls) put(CAMP_PROPS.awning, st.x, st.y);
      posts.push(['moves', place.freeSpot(Math.floor(stalls[0].x + 2.2), Math.floor(market.y) + 1, 3), 0]);
      posts.push(['items', place.freeSpot(Math.floor(stalls[2].x), Math.floor(market.y) + 1, 3), 0]);
    }
    if (has('training')) {
      // Le terrain d'entraînement. Écart voulu (retour de test : « un truc plus sympa, avec plus
      // de dégâts ») : plus deux carrés de terre battue, mais une arène de sable piétiné, et
      // tout autour les traces des combats — un gros rocher, des cailloux éclatés, une souche
      // fendue, un tronc abattu.
      ground(training.x, training.y + 1.2, 4.6, 2.5, LANE.sand, 403);
      put(PROPS.boulder[0], training.x + 4.4, training.y + 0.6);
      put(PROPS.rockSmall[0], training.x - 3.7, training.y + 2.7);
      put(PROPS.rockSmall[1], training.x + 2.9, training.y + 3.2);
      put(PROPS.rockSmall[0], training.x + 3.6, training.y + 2.4, false);
      put(PROPS.stump[1], training.x - 4.3, training.y + 0.4);
      put(PROPS.log[0], training.x - 0.5, training.y - 0.4);
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
      // Le plancher rogné dans le lac peut laisser, à côté, une anse d'une case de large
      // que la berge ne sait pas border : elle redevient de la terre ferme (sans nénuphar).
      useGrid(W, world.h);
      const wet = world.water.slice();
      cleanThin(world.water, () => false);
      for (let i = 0; i < wet.length; i++) if (wet[i] && !world.water[i]) world.blocked[i] = world.solid[i] = 0;
      world.lilies = world.lilies.filter((l) => world.water[l.y * W + l.x]);
      // Garde-corps : à la nage, on ne monte sur le ponton que par son échelle.
      // Ses deux bords (colonnes jx-2 et jx+2) prennent une clôture de bois du
      // tileset au-dessus de l'eau, et la dernière rangée, où pend l'échelle
      // (pixels 24 à 40 du sprite, à cheval sur jx-1 et jx), ne s'ouvre qu'à
      // elle. Écart voulu avec le jeu : son ponton se laissait aborder de partout.
      const [fc, fr] = FENCES.wood.origin;
      const close = (x: number, y: number) => {
        const i = y * W + x;
        world.blocked[i] = world.solid[i] = 1;
      };
      for (let y = shore; y <= shore + 2; y++) {
        close(jx - 2, y);
        close(jx + 2, y);
      }
      close(jx + 1, shore + 2);
      for (let y = shore; y <= shore + 1; y++) {
        for (const [x, col] of [[jx - 2, 0], [jx + 2, 2]] as const) {
          world.objects.push({
            sprite: { rect: [(fc + col) * TILE, (fr + 1) * TILE, TILE, TILE], foot: TILE - 1, trunk: 1 },
            x: x * TILE + TILE / 2,
            y: (y + 1) * TILE - 1,
            fades: false,
          });
        }
      }
    }

    if (has('clearing')) {
      // Ce qui reste de la forêt abattue : des souches, et le bois empilé au bout de l'allée —
      // jusqu'aux maisons, qui l'emploient (leurs paillasses prennent sa place).
      if (!has('houses')) put(CAMP_PROPS.logs, glade.x + 6, glade.y + 3);
      // (Celle du fond, entre les maisons, laisse sa place aux tournesols du champ.)
      // Une fois le champ bâti, plus de souches autour du potager (retour de test : « ça sert à rien »).
      const stumps = has('field') ? [[7.5, -3]] : [[-8.5, 0.5], [7.5, -3], [-0.5, -6], [1, 5]];
      for (const [dx, dy] of stumps) put(PROPS.stump[Math.abs(dx + dy) & 1], glade.x + dx, glade.y + dy);
    }
    if (has('field')) {
      // Le potager d'Héliatronc : la terre labourée, et ce qui y pousse. Écart voulu (troisième
      // retour de test : « plus de bacs, plus les petites herbes au milieu… les fleurs qui
      // poussent, en fonction de l'avancement ») : la terre est partagée en trois parcelles de
      // deux cases sur deux, sans cadre ; chacune montre sa plante au stade où elle en est —
      // semis, pousses, boutons, puis en fleur — d'une salle franchie à l'autre. Mûre, la plante
      // à récolter flotte au-dessus (extras, drawBed). Rien n'y bloque : on marche entre les fleurs.
      soil(field.x, field.y, field.w, field.h);
      for (let i = 0; i < GARDEN_PLOTS; i++) {
        const plot = craft.garden[i] ?? null;
        const seed = plot ? GARDEN[plot.plant] : undefined;
        if (!plot || !seed) continue;
        const done = Math.max(0, Math.min(seed.rooms, seed.rooms - plot.left));
        const look = PLANT_LOOK[plot.plant] ?? PLANT_LOOK['white-herb'];
        // Le stade : semis, pousse, boutons, fleur (mûre seulement une fois toutes les salles passées).
        const stage = done >= seed.rooms ? 3 : Math.min(2, Math.floor((done / seed.rooms) * 3));
        const sp = [CAMP_PROPS.garden.seedling, CAMP_PROPS.garden.sprout, look.bud, look.bloom][stage];
        const x0 = field.x + i * 3;
        for (const [dx, dy] of [[0, 1], [1, 1], [0, 2], [1, 2]] as const) {
          world.objects.push({ sprite: { ...sp, grass: true, trunk: 0 }, x: (x0 + dx + 0.5) * TILE, y: (field.y + dy + 1) * TILE - 1, fades: false });
        }
        if (stage === 3) this.beds.push({ x: x0 + 1, y: field.y + 1.5, icon: MATERIALS[plot.plant]?.icon ?? '' });
      }
      posts.push(['garden', { x: field.x + field.w + 0.4, y: field.y + 0.6 }, 2]);
      // Ajout (retour de test : « un vrai champ de tournesols qui bouge avec le vent, à côté du
      // potager ») : entre les deux maisons, au-dessus du champ. Écart voulu (deuxième retour) :
      // au sud du champ, serrés à une demi-case, ils faisaient un mur ; ici, une case entre deux
      // tiges, en quinconce. Ce sont des herbes (grass) : ils ondulent avec les touffes (la
      // vague du vent court d'une tige à l'autre) et on les traverse.
      const patch = { x0: cottages[0].x + 2.3, x1: cottages[1].x - 2.2, y0: cottages[0].y - 3.4, y1: cottages[0].y + 0.2 };
      for (let r = 0; patch.y0 + r <= patch.y1; r++) {
        for (let c = 0; ; c++) {
          const x = patch.x0 + 0.2 + c * 1.3 + (r % 2) * 0.65;
          if (x > patch.x1) break;
          const y = patch.y0 + r;
          const i = at(x, y - 0.3);
          if (!world.inside[i] || world.blocked[i] || isWater(Math.floor(x), Math.floor(y - 0.3)) || hash2(c, r, 977) < 0.1) continue;
          world.objects.push({ sprite: TOWN_DECOR.sunflowerField, x: Math.round(x * TILE), y: Math.round(y * TILE), fades: false });
        }
      }
    }
    if (has('houses')) cottages.forEach((c, i) => put(CAMP_PROPS.cottages[i], c.x, c.y));
    if (has('eastglade')) {
      // Comme à l'ouest : des souches, et le bois empilé, jusqu'au bourg qui l'emploie.
      if (!has('hamlet')) put(CAMP_PROPS.logs, east.x + 2, east.y + 3);
      // (Plus une fois le bourg bâti : on n'y laisse pas traîner de souches.)
      if (!has('hamlet')) for (const [dx, dy] of [[7, 0.5], [-7.5, -3], [0.5, -6], [-3.5, 5.5]]) put(PROPS.stump[Math.abs(dx + dy) & 1], east.x + dx, east.y + dy);
    }
    if (has('hamlet')) {
      // Le bourg : les deux maisons, leur place pavée et son puits, l'allée de l'est pavée
      // de briques sur ses derniers pas, un panneau à l'entrée, des bacs et des pots.
      hamlet.forEach((c, i) => put(CAMP_PROPS.hamlet[i], c.x, c.y));
      const plaza = new Uint8Array(W * world.h);
      const street = new Uint8Array(W * world.h);
      const ok = (x: number, y: number) => world.inside[y * W + x] === 1 && !isWater(x, y);
      for (let y = square.y; y < square.y + square.h; y++) for (let x = square.x; x < square.x + square.w; x++) if (ok(x, y)) plaza[y * W + x] = 1;
      // La rue. Écart voulu (retour de test : la terre passait d'un coup aux pavés, en escalier,
      // « c'est pas beau ») : elle ne suit plus les bords de l'allée de terre, c'est une bande de
      // trois cases qui ondule doucement de l'entrée du bourg (`ax`) jusqu'au milieu de la place.
      // À l'entrée, deux piliers : on sait qu'on entre en ville. La terre s'arrête là ; au-delà,
      // l'allée redevient de l'herbe hors de la rue. Écart voulu (retour de test : « tous les sols
      // différents… un truc plus harmonieux ») : seuil gris, rue beige et place dorée ne font plus
      // qu'un seul pavé, le chevron doré, bordé d'herbe comme les allées (WorldMap.lanes) ; l'allée
      // de l'atelier, qui part de l'entrée, est du même pavé.
      // (Trois cases plus à l'est qu'avant : le pilier du sud se posait sur l'allée de l'atelier,
      // qui quitte le chemin de terre à cet endroit — retour de test.)
      const ax = square.x - 6;
      const rows: number[] = [];
      for (let y = hy - 6; y <= hy + 10; y++) if (isPath(ax, y)) rows.push(y);
      const y0 = rows.length ? (rows[0] + rows[rows.length - 1] + 1) / 2 : square.y + square.h - 1;
      const y1 = square.y + square.h / 2 + 0.5;
      const mid = (x: number) => {
        const u = Math.max(0, Math.min(1, (x + 0.5 - ax) / (square.x - ax)));
        return y0 + (y1 - y0) * u * u * (3 - 2 * u) - Math.sin(u * Math.PI) * 0.9;
      };
      const band = (x: number, y: number) => Math.abs(y + 0.5 - mid(x)) <= 1.3;
      const town = { x0: ax - 1, x1: square.x + square.w + 2, y0: square.y - 5, y1: square.y + square.h + 3 };
      for (let y = town.y0; y < town.y1; y++) {
        for (let x = ax - 2; x < town.x1; x++) {
          const i = y * W + x;
          if (x < square.x && band(x, y)) {
            // Les deux dernières cases de terre prennent la largeur de la rue : elles s'y raccordent.
            if (x < ax) {
              world.path[i] = 1;
              continue;
            }
            world.path[i] = 0;
            world.inside[i] = 1;
            world.blocked[i] = world.solid[i] = world.tall[i] = 0;
            street[i] = 1;
          } else if (x >= ax) world.path[i] = 0;
        }
      }
      world.lanes!.push({ mask: street.map((v, i) => v | plaza[i]), fill: [PLAZA_TILES.herringGold] });
      // Le bourg est tenu : ni herbes folles ni fleurs sauvages, et rien sur les pavés.
      const inTown = (x: number, y: number) => x >= town.x0 && x < town.x1 && y >= town.y0 && y < town.y1;
      const paved = (i: number) => plaza[i] || street[i];
      for (let y = town.y0; y < town.y1; y++) for (let x = town.x0; x < town.x1; x++) world.tall[y * W + x] = 0;
      for (let k = world.objects.length - 1; k >= 0; k--) {
        const o = world.objects[k];
        const ox = o.x / TILE, oy = (o.y - 1) / TILE;
        if ((o.sprite.grass && inTown(ox, oy)) || paved(at(ox, oy))) world.objects.splice(k, 1);
      }
      world.flat = world.flat.filter((f) => !paved(f.y * W + f.x) && !inTown(f.x, f.y));
      const top = Math.floor(mid(ax) - 1.3 + 0.5);
      const bottom = Math.floor(mid(ax) + 1.3 - 0.5);
      put(TOWN_DECOR.gatePost, ax + 0.5, top - 0.05);
      put(TOWN_DECOR.gatePost, ax + 0.5, bottom + 1.95);
      put(TOWN_DECOR.townSign, ax - 0.6, top - 0.3);
      // Des massifs fleuris le long de la rue, au ras de ses pavés, côté nord et côté sud.
      const edge = (x: number, side: -1 | 1) => {
        let y = Math.floor(mid(x));
        while (street[(y + side) * W + x]) y += side;
        return y;
      };
      put(TOWN_DECOR.hydrangeas[0], ax + 3.5, edge(ax + 3, -1) - 0.1);
      put(TOWN_DECOR.hydrangeas[1], ax + 5.5, edge(ax + 5, 1) + 2.95);
      put(CAMP_PROPS.well, eastWell.x, eastWell.y);
      put(TOWN_DECOR.planters[0], square.x + 2, square.y + square.h + 0.9);
      put(TOWN_DECOR.planters[0], square.x + square.w - 2, square.y + square.h + 0.9);
      put(TOWN_DECOR.pots[0], hamlet[0].x + 2.6, hamlet[0].y + 0.4);
      put(TOWN_DECOR.pots[2], hamlet[1].x - 2.2, hamlet[1].y + 0.4);
      put(TOWN_DECOR.bushes[0], east.x - 7, east.y - 1.5);
      put(TOWN_DECOR.bushes[1], east.x + 8, east.y - 1.5);
      put(TOWN_DECOR.bench, square.x + square.w - 1.6, square.y + 2.2);
    }
    if (has('gardens')) {
      // Deux bancs face au tableau du savant, des massifs et un bac fleuri entre les torches, des tournesols près des postes.
      for (const b of benches) put(TOWN_DECOR.bench, b.x, b.y);
      put(TOWN_DECOR.hydrangeas[0], hx - 6.5, hy - 3.4);
      put(TOWN_DECOR.hydrangeas[1], hx + 6.5, hy - 3.4);
      put(TOWN_DECOR.planters[0], hx + 0.5, hy + 7.2);
      put(TOWN_DECOR.bushes[0], hx - 8.2, hy + 4.6);
      put(TOWN_DECOR.bushes[1], hx + 9, hy + 4.6);
      put(TOWN_DECOR.sunflower, hut.x - 4.6, hut.y + 0.3);
    }
    const lamps: Spot[] = [];
    if (has('lamps')) {
      // Le long des allées : à leur bord nord (allées de l'ouest et de l'est), à leur bord est (allée du départ),
      // jamais sur une case prise ni hors du camp.
      // Écart voulu (retour de test) : moins nombreux, éteints (LAMP_OFF), et jamais devant
      // un gardien (l'un cachait M. Mime).
      const free = (x: number, y: number) =>
        x > 0 && y > 0 && x < W - 1 && y < world.h - 1 && world.inside[y * W + x] === 1 && !world.blocked[y * W + x] && !isPath(x, y) && !isWater(x, y) && !place.occupied({ x: x + 0.5, y: y + 0.9 }) &&
        !posts.some(([, s]) => Math.hypot(s.x - x - 0.5, s.y - y - 0.9) < LAMP_CLEAR);
      const lamp = (x: number, y: number) => {
        if (!free(x, y) || lamps.some((l) => Math.hypot(l.x - x, l.y - y) < LAMP_GAP)) return;
        put(LAMP_OFF, x + 0.5, y + 0.95);
        lamps.push({ x: x + 0.5, y: y + 1.6 });
      };
      for (let y = gy + 3; y <= hy - 4; y += 6) {
        let edge = -1;
        for (let x = hx - 6; x <= hx + 6; x++) if (isPath(x, y)) edge = x;
        if (edge >= 0) lamp(edge + 1, y);
      }
      const across = (x: number) => {
        for (let y = hy - 8; y <= hy + 8; y++) {
          if (!isPath(x, y)) continue;
          lamp(x, y - 1);
          return;
        }
      };
      for (const dx of [14, 24]) {
        if (has('clearing')) across(hx - dx);
        if (has('eastglade')) across(hx + dx);
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

    for (const [station, spot, rest] of posts) {
      const news = document.createElement('div');
      news.className = 'room-label camp-news';
      news.hidden = true;
      this.layer.append(news);
      this.posts.push({ station, actor: this.spawn(stationId(station, built, craft.nectar?.visitor, craft.candidates[0]?.species), spot, rest, ['Idle']), rest, news });
    }

    // Les libérés qu'on n'emmène pas, et eux seuls : ceux d'eau nagent dans le lac ; les autres
    // se répartissent entre le feu (assis sur les rondins), le terrain d'entraînement, les
    // paillasses (dortoir et maisons) et le champ, à tour de rôle ; s'il en reste, ils flânent
    // sur la place, ou dans la clairière une fois les maisons bâties.
    // Chacun son caractère ; une espèce qui a ses propres répliques au bestiaire les dit à la place.
    const personas = [...PERSONAS];
    const persona = (id: number) => {
      const p = personas.splice(rng.int(personas.length), 1)[0] ?? PERSONAS[0];
      return linesOf(id) ?? [...p.lines];
    };
    // Les derniers débloqués seulement (DWELLERS, plus la place des aménagements) : le camp reste lisible.
    const cap = DWELLERS + built.reduce((n, b) => n + (DWELLERS_PER[b] ?? 0), 0);
    // (`unlocked` ne compte déjà ni l'équipe ni ceux en mission : main.ts, campDwellers. Une
    // espèce peut y figurer plusieurs fois, un individu chacun.)
    const free = unlocked.slice(-cap);
    const swimmers = free.filter((id) => AQUATIC.has(id));
    const walkers = free.filter((id) => !AQUATIC.has(id));
    // Les paillasses : trois au dortoir, deux à côté du champ avec les maisons (coin haut-gauche, 3 × 3 cases).
    // (Pas au bourg : de la paille sur des pavés ; ses habitants flânent sur la place.)
    const beds: Spot[] = [
      ...(has('dorm') ? [0, 1, 2].map((i) => ({ x: Math.floor(dorm.x) - 4 + i * 3, y: Math.floor(dorm.y) + 1 })) : []),
      ...(has('houses') ? [0, 1].map((i) => ({ x: field.x + field.w + 1 + i * 3, y: field.y + 1 })) : []),

    ];
    const room = {
      fire: seats.length,
      training: has('training') ? 2 : 0,
      dorm: beds.length,
      field: has('field') ? 2 : 0,
      bench: has('gardens') ? benches.length : 0,
      lamp: Math.min(2, lamps.length),
      bar: barSeats.length,
    };
    const groups: Record<keyof typeof room, number[]> = { fire: [], training: [], dorm: [], field: [], bench: [], lamp: [], bar: [] };
    const strollers: number[] = [];
    const order = (['fire', 'bar', 'training', 'dorm', 'field', 'bench', 'lamp'] as const).filter((g) => room[g] > 0);
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
      // Juste devant le rondin : il se dessine par-dessus, comme couché dessus. Tous dorment au
      // chaud, tournés vers les flammes. Écart voulu (retour de test) : au sud, on s'asseyait, ou
      // l'on dormait faute de pose assise, et au nord on restait debout — d'un rondin à l'autre,
      // ça ne se tenait pas. Le sommeil, toutes les planches l'ont.
      const s = { x: seats[i].x, y: seats[i].y + 0.05 };
      this.talk(id, s, dirFromVector(this.fire.x - s.x, this.fire.y - s.y), ['Sleep', 'Laying', 'Idle'], SLEEPY, false, LOG_TOP);
    });
    groups.bench.forEach((id, i) => {
      // Sur l'assise, tourné vers le tableau du savant : il suit la leçon (assis de dos).
      const s = { x: benches[i].x, y: benches[i].y + 0.05 };
      this.talk(id, s, dirFromVector(lab.x - s.x, lab.y - s.y), ['Sit', 'Idle'], persona(id), false, BENCH_TOP);
    });
    groups.bar.forEach((id, i) => {
      // Au comptoir de la buvette, assis face à Kangourex (de dos, comme aux bancs).
      const s = { x: barSeats[i].x, y: barSeats[i].y + 0.05 };
      this.talk(id, s, 4, ['Sit', 'Idle'], persona(id), false, SEAT_TOP);
    });
    groups.lamp.forEach((id, i) => {
      // Sous le lampadaire, il veille, face au sud.
      this.talk(id, place.freeSpot(Math.floor(lamps[i].x), Math.floor(lamps[i].y), 2), 0, ['Idle'], persona(id));
    });
    groups.dorm.forEach((id, i) => {
      // Une paillasse chacun ; un lit, ça ne se traverse pas (et rien ne s'y pose).
      const { x: bx, y: by } = beds[i];
      floor(CAMP_PROPS.hay.col, CAMP_PROPS.hay.row, 3, 3, bx, by);
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) place.block(bx + dx, by + dy);
      this.talk(id, { x: bx + 1.5, y: by + 2.1 }, rng.int(8), ['Sleep', 'Laying'], SLEEPY);
    });
    groups.training.forEach((id, i) => {
      // Chacun son mannequin, de part et d'autre du terrain, et il frappe vers le centre.
      const side = i ? 1 : -1;
      const dummy = { x: training.x + side * 1.1, y: training.y + 1.4, hitT: 0, trainT: rng.range(0.4, 1.6) };
      place.block(Math.floor(dummy.x), Math.floor(dummy.y));
      const t = this.talk(id, { x: dummy.x + side * 1.5, y: dummy.y }, side > 0 ? 6 : 2, ['Idle'], LINES.trainer, true);
      t.dummy = dummy;
    });
    groups.field.forEach((id, i) => {
      // Aux champs : ils vont et viennent entre les rangs.
      const s = place.freeSpot(field.x + 2 + i * 4, field.y + 2, 2);
      this.talk(id, s, rng.int(8), ['Idle'], LINES.farmer).wander = { home: { x: field.x + field.w / 2, y: field.y + field.h / 2 }, radius: 3, goal: { ...s }, wait: rng.range(1, 4) };
    });
    // Les flâneurs se partagent la place et les clairières défrichées, à tour de rôle.
    // Écart voulu : plus aucun sauvage de passage (ils venaient avec le défrichage et les
    // maisons) — au Repaire, ne vivent que les Pokémon qu'on a libérés.
    const yards: Spot[] = [
      { x: hx, y: hy + 4 },
      ...(has('clearing') ? [{ x: glade.x, y: glade.y + 1 }] : []),
      ...(has('eastglade') ? [{ x: east.x, y: east.y + 2 }] : []),
      ...(has('hamlet') ? [{ x: square.x + square.w / 2, y: square.y + square.h - 1 }] : []),
    ];
    strollers.forEach((id, i) => {
      const home = yards[i % yards.length];
      const s = place.freeSpot(Math.floor(home.x) + rng.int(9) - 4, Math.floor(home.y) + rng.int(3), 3);
      this.talk(id, s, rng.int(8), ['Idle'], persona(id)).wander = { home: { ...s }, radius: 3, goal: { ...s }, wait: rng.range(1, 4) };
    });
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

  /**
   * Un Pokémon à qui parler, dans sa pose ; `fighter` : il lui faut ses attaques (planche complète) ;
   * `perch` : hauteur du décor sur lequel il se couche, s'il finit endormi (cf. spawn).
   */
  private talk(id: number, at: Spot, dir: number, pose: string[], lines: readonly string[], fighter = false, perch = 0): Talker {
    const bubble = document.createElement('div');
    bubble.className = 'room-label shop-bubble';
    this.layer.append(bubble);
    const t: Talker = { actor: this.spawn(id, at, dir, pose, fighter, perch), lines: [...lines], talk: 0, bubble, bubbleT: 0 };
    this.talkers.push(t);
    return t;
  }

  /** La pose se choisit planche chargée (la première qu'elle a) ; couché, il monte sur son décor de `perch` px. */
  private spawn(id: number, at: Spot, dir: number, pose: string[], fighter = false, perch = 0): Actor {
    const actor = new Actor(id, at.x, at.y);
    actor.dir = dir;
    void loadInfo(id).then((i) => (actor.info = i));
    void loadSheet(id, fighter ? PLAYER_ACTIONS : ['Sleep', 'Idle', 'Hop', 'Sit', 'Laying']).then((sh) => {
      actor.sheet = sh;
      actor.setPose(pose);
      if (actor.pose === 'Sleep' || actor.pose === 'Laying') actor.perch = perch;
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
      { y: this.fire.y * TILE + 4, draw: (b, camX, camY, k) => this.drawFlame(b, camX, camY, k, time) },
      // Le temple se trie sur le haut de son escalier : qui le gravit passe devant lui.
      { y: this.temple.top * TILE, draw: (b, camX, camY, k) => this.drawSprite(b, camX, camY, k, CAMP_PROPS.ruins, this.temple.x, this.temple.y) },
    ];
    // Le ponton, au ras du sol : on marche sur son plancher.
    const jetty = this.jetty;
    if (jetty) out.push({ y: -Infinity, draw: (b, camX, camY, k) => this.drawSprite(b, camX, camY, k, CAMP_PROPS.jetty, jetty.x, jetty.y) });
    const lure = this.lure;
    if (lure) out.push({ y: lure.y * TILE + 1, draw: (b, camX, camY, k) => this.drawLure(b, camX, camY, k, lure, time) });
    for (const bed of this.beds) out.push({ y: bed.y * TILE, draw: (b, camX, camY, k) => this.drawBed(b, camX, camY, k, bed, time) });
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

  /** La flamme d'Essentials (Animations/fire5), en boucle au milieu de son cercle de pierres. */
  private drawFlame(b: CanvasRenderingContext2D, camX: number, camY: number, k: number, time: number): void {
    const img = this.flame;
    if (!img) return;
    const frame = CAMPFIRE.frames[Math.floor(time * 8) % CAMPFIRE.frames.length];
    const size = CAMPFIRE.cell * FLAME_SCALE * k;
    const px = Math.round((this.fire.x * TILE - camX) * k);
    const py = Math.round((this.fire.y * TILE + 3 - camY) * k);
    b.drawImage(img, frame * CAMPFIRE.cell, 0, CAMPFIRE.cell, CAMPFIRE.cell, px - size / 2, py - CAMPFIRE.base * FLAME_SCALE * k, size, size);
  }

  /** Une parcelle mûre : la plante à récolter flotte au-dessus de ses fleurs et tressaute doucement. */
  private drawBed(b: CanvasRenderingContext2D, camX: number, camY: number, k: number, bed: Bed, time: number): void {
    const img = this.icons.get(bed.icon);
    if (!img) return;
    const size = 12 * k;
    const px = Math.round((bed.x * TILE - camX) * k);
    const py = Math.round((bed.y * TILE - camY) * k);
    b.drawImage(img, 0, 0, 48, 48, px - size / 2, py - (22 + Math.sin(time * 3 + bed.x) * 2) * k - size / 2, size, size);
  }

  /**
   * Le nectar posé devant l'atelier : son flacon au sol, et son parfum qui
   * monte en volutes à sa teinte.
   */
  private drawLure(b: CanvasRenderingContext2D, camX: number, camY: number, k: number, n: { x: number; y: number; icon: string; color: string }, time: number): void {
    if (!n.color) return;
    const px = Math.round((n.x * TILE - camX) * k);
    const top = Math.round((n.y * TILE - camY) * k);
    const img = this.icons.get(n.icon);
    const size = 16 * k;
    // Une petite ombre, puis le flacon posé au sol.
    b.fillStyle = 'rgba(30,30,40,0.35)';
    b.fillRect(px - 5 * k, top - 1 * k, 10 * k, 2 * k);
    if (img) b.drawImage(img, 0, 0, 48, 48, px - size / 2, top - size + 2 * k, size, size);
    for (let i = 0; i < 3; i++) {
      const t = (time * 0.5 + i / 3) % 1;
      b.globalAlpha = 0.75 * (1 - t);
      b.fillStyle = n.color;
      const rad = (1 + t * 1.5) * k;
      b.beginPath();
      b.arc(px + Math.sin((t + i) * 6) * 5 * k, top - (14 + t * 20) * k, rad, 0, Math.PI * 2);
      b.fill();
    }
    b.globalAlpha = 1;
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

  /** Les postes du camp (pour meta/news.ts). */
  get stations(): Station[] {
    return this.posts.map((p) => p.station);
  }

  /** Allume le repère « ! » des postes qui ont du neuf, éteint les autres. */
  setNews(news: ReadonlySet<string>): void {
    for (const p of this.posts) p.news.hidden = !news.has(p.station);
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
    // Le « ! » du gardien dont on s'approche reste, et se détache (liseré blanc, sautille) ; c'est
    // la flèche qui s'efface. Écart voulu (retour de test) : il disparaissait à l'approche.
    this.mark.classList.toggle('news', Boolean(n && 'station' in n && !n.news.hidden));
    for (const p of this.posts) {
      p.news.classList.toggle('sel', p === n);
      if (p.news.hidden) continue;
      over(p.actor, p.news);
      // Un pixel de la bulle = un pixel du décor (proj.perTile : une case de 16 px).
      p.news.style.setProperty('--px', `${proj.perTile / TILE}px`);
    }
  }
}
