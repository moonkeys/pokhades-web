// Catalogue des sons (Sfx.gd du jeu Godot). Module pur, sans DOM : le moteur
// (audio.ts) le lit en jeu, et scripts/import-assets.ts y prend la liste des
// fichiers à copier dans public/game/audio/.
//
// Écart voulu : le jeu Godot bruitait le combat avec des sons génériques
// Kenney (« hit », « hurt », « death »…) qui ne sonnaient pas Pokémon. Ici
// presque tout vient d'Essentials, comme dans les jeux de la série :
// - SE/ : les bruits du combat (dégâts selon l'efficacité, K.O., montée de
//   niveau, envoi d'une Ball), des menus, des portes, des CS ;
// - SE/Anim/ : les sons des animations d'attaque, un jeu par type et
//   quelques capacités à elles (Tranche, Force Poigne, Damoclès…) ;
// - SE/Cries/ : le cri de chaque espèce (générations 1 à 5 seulement :
//   les plus récentes restent muettes, voir CRY_FALLBACK) ;
// - ME/ : les jingles (objet trouvé, Pokémon obtenu, badge, évolution).
// Tous les sons viennent d'Essentials : plus aucun son Kenney.
//
// Volumes en dB, relatifs ; `jitter` : écart de hauteur tiré à chaque
// lecture, pour qu'une rafale de coups ne « mitraille » pas le même
// échantillon ; `gap` : délai mini entre deux lectures (les dégâts d'Essentials
// durent plus d'une seconde, une combo à 0,04 s les empilerait en bouillie).

import { listedStyle, type MoveStyle } from '../data/movestyles.ts';

/** Dossier audio d'Essentials dans le dépôt Godot. */
export const ESSENTIALS_AUDIO = 'Pokemon Essentials v21.1 2023-07-30/Audio';

export interface SoundDef {
  /** Fichiers source (relatifs au dépôt Godot) ; plusieurs : une variante tirée au hasard. */
  files: readonly string[];
  db: number;
  jitter: number;
  /** Délai mini entre deux lectures (s), 0,04 par défaut. */
  gap?: number;
}

const se = (...names: string[]) => names.map((n) => `${ESSENTIALS_AUDIO}/SE/${n}.ogg`);
const anim = (...names: string[]) => names.map((n) => `${ESSENTIALS_AUDIO}/SE/Anim/${n}.ogg`);
const me = (name: string) => [`${ESSENTIALS_AUDIO}/ME/${name}.ogg`];

export const SOUNDS = {
  // ── Coups ──────────────────────────────────────────────────────────────
  /** Un sauvage touché, selon l'efficacité : le « pac » des jeux (normal, super efficace, pas très efficace). */
  hit: { files: se('Battle damage normal'), db: -9, jitter: 0.05, gap: 0.09 },
  hitSuper: { files: se('Battle damage super'), db: -7, jitter: 0.04, gap: 0.12 },
  hitWeak: { files: se('Battle damage weak'), db: -10, jitter: 0.05, gap: 0.09 },
  /** Un membre de l'équipe touché : le même bruit, plus grave (on l'entend comme le sien). */
  hurt: { files: se('Battle damage normal'), db: -4, jitter: 0.03, gap: 0.1 },
  /** Un Pokémon K.O. (le sien, ou un Pokémon de champion) ; un sauvage n'a que son cri. */
  faint: { files: se('Pkmn faint'), db: -5, jitter: 0, gap: 0.2 },
  /** Statuts infligés (StatusFx) : chacun le son de son animation dans les jeux. */
  burn: { files: anim('Fire3'), db: -9, jitter: 0.05, gap: 0.15 },
  poison: { files: anim('Poison'), db: -9, jitter: 0.05, gap: 0.15 },
  paralysis: { files: anim('Paralyze1'), db: -6, jitter: 0.05, gap: 0.15 },
  freeze: { files: anim('Ice5'), db: -8, jitter: 0.05, gap: 0.15 },
  sleep: { files: anim('Sleep'), db: -6, jitter: 0, gap: 0.15 },
  /** Hausse et baisse de stats (Rugissement, Danse-Lames, Grondement…). */
  statUp: { files: anim('increase'), db: -10, jitter: 0, gap: 0.3 },
  statDown: { files: anim('decrease'), db: -10, jitter: 0, gap: 0.3 },
  /** Soin (Repos, Soin, dons) et Abri. */
  heal: { files: anim('Recovery'), db: -6, jitter: 0, gap: 0.2 },
  protect: { files: anim('Harden'), db: -6, jitter: 0, gap: 0.2 },
  /** Dash : un souffle bref (Kenney dans le jeu Godot). */
  dash: { files: anim('Wind7'), db: -6, jitter: 0.1 },

  // ── Combat ─────────────────────────────────────────────────────────────
  levelup: { files: se('Pkmn level up'), db: -4, jitter: 0, gap: 0.3 },
  /** Un sauvage repère l'équipe : le « ! » des dresseurs qui vous voient. */
  alert: { files: se('Exclaim'), db: -12, jitter: 0.06, gap: 0.5 },
  /** Envoi d'un Pokémon de champion (PokeballFX.gd : SE_THROW / SE_DROP). */
  ballThrow: { files: se('Battle throw'), db: -4, jitter: 0 },
  ballDrop: { files: se('Battle ball drop'), db: -4, jitter: 0 },
  /** Poké Ball du sbire des grottes (run/capture.ts) : elle touche, secoue le Pokémon enfermé, puis se referme ou éclate. */
  ballHit: { files: se('Battle ball hit'), db: -4, jitter: 0 },
  ballShake: { files: se('Battle ball shake'), db: -6, jitter: 0.04, gap: 0.25 },
  catchClick: { files: se('Battle catch click'), db: -2, jitter: 0, gap: 0.5 },
  ballEnter: { files: se('Battle jump to ball'), db: -4, jitter: 0, gap: 0.3 },
  /** Changement de Pokémon (Tab) : le rappel dans la Ball, avant le cri de l'arrivant. */
  swap: { files: se('Battle recall'), db: -8, jitter: 0, gap: 0.15 },
  /** Un champion annonce son attaque signature, ou l'équipe lance son ultime : le bruit des talents. */
  ability: { files: se('Battle ability'), db: -4, jitter: 0, gap: 0.3 },
  /** Onde d'une attaque de zone de champion, à l'impact. */
  quake: { files: anim('Earth4'), db: -6, jitter: 0.1, gap: 0.1 },
  /** Le champion et son affiche (l'éclair du « VS » des combats de dresseur). */
  vs: { files: se('Vs flash'), db: -4, jitter: 0 },

  // ── Exploration ────────────────────────────────────────────────────────
  // Les sons qui accompagnent une notification (baie, butin, coffre, nouveau Pokémon) sont très discrets : retour de
  // test, « on n'entend que ça, ça fait trop de notifs ».
  /** Baie ramassée : le tintement des jetons du Voltorbataille. */
  coin: { files: se('Voltorb Flip point'), db: -20, jitter: 0.12, gap: 0.06 },
  /** Butin en ₽ pris au centre de la salle. */
  loot: { files: se('Voltorb Flip gain coins'), db: -18, jitter: 0, gap: 0.5 },
  /** Coffre ouvert : le jingle de l'objet trouvé. */
  chest: { files: me('Item get'), db: -22, jitter: 0, gap: 1 },
  /** On choisit une porte, on entre dans une grotte, on en ressort. */
  doorEnter: { files: se('Door enter'), db: -4, jitter: 0, gap: 0.3 },
  doorExit: { files: se('Door exit'), db: -4, jitter: 0, gap: 0.3 },
  /** On fuit une grotte en plein combat. */
  flee: { files: se('Battle flee'), db: -4, jitter: 0, gap: 0.5 },
  /** Les portes s'ouvrent (salle nettoyée), la grille de la grotte se lève. */
  doorOpen: { files: se('Door slide'), db: -6, jitter: 0, gap: 0.5 },
  /** Obstacles de CS : arbuste coupé, rocher brisé. */
  cut: { files: se('Cut'), db: -4, jitter: 0.05 },
  rockSmash: { files: se('Rock Smash'), db: -4, jitter: 0.05 },

  // ── Méta ───────────────────────────────────────────────────────────────
  /** Run gagnée (CombatArena.gd:1855) et champion vaincu : le jingle du badge. */
  victory: { files: me('Badge get'), db: -4, jitter: 0, gap: 2 },
  defeat: { files: me('Voltorb Flip game over'), db: -4, jitter: 0, gap: 2 },
  /**
   * Nouveau Pokémon débloqué. Écart de 8 s : plusieurs déblocages d'affilée
   * (alliés du jeu en ligne, K.O. en rafale) ne rejouent pas la fanfare à
   * chaque notification.
   */
  pkmnGet: { files: me('Pkmn get'), db: -12, jitter: 0, gap: 8 },
  /**
   * Récompense réclamée (exploits de Xatu) : le cliquetis des jetons, pas une
   * fanfare (retour de test : cinq exploits réclamés, cinq fois la musique de
   * victoire).
   */
  claim: { files: se('Voltorb Flip gain coins'), db: -16, jitter: 0.04, gap: 0.6 },
  moveLearnt: { files: se('Pkmn move learnt'), db: -2, jitter: 0 },
  evoStart: { files: me('Evolution start'), db: -2, jitter: 0 },
  evoSuccess: { files: me('Evolution success'), db: -2, jitter: 0 },

  // ── Interface ──────────────────────────────────────────────────────────
  menuOpen: { files: se('GUI menu open'), db: -6, jitter: 0 },
  menuClose: { files: se('GUI menu close'), db: -6, jitter: 0 },
  /** Curseur qui bouge, choix validé. */
  click: { files: se('GUI sel cursor'), db: -6, jitter: 0 },
  confirm: { files: se('GUI sel decision'), db: -6, jitter: 0 },
  buy: { files: se('Mart buy item'), db: -2, jitter: 0 },
  /** Refus (pas assez de Baies, de ₽…) : le jeu n'en avait pas. */
  buzzer: { files: se('GUI sel buzzer'), db: -8, jitter: 0 },
} satisfies Record<string, SoundDef>;

export type SoundId = keyof typeof SOUNDS;

// ── Sons d'attaque ───────────────────────────────────────────────────────
//
// Joués avec l'animation d'attaque (CombatFx.attackAnim) : on entend la
// capacité là où on la voit, coups au corps, tirs, zones et dons compris.
// D'abord le son propre à la capacité s'il existe dans SE/Anim, sinon un
// des sons de son type.

/** Sons par type (fichiers de SE/Anim/), une variante tirée au hasard. */
export const TYPE_SOUNDS: Record<string, readonly string[]> = {
  normal: ['Blow1', 'Blow3', 'Blow5'],
  fighting: ['Mega Punch', 'Comet Punch', 'Blow4'],
  fire: ['Fire1', 'Fire3'],
  water: ['Water1', 'Water2'],
  grass: ['Absorb2', 'Slash2'],
  electric: ['Thunder1', 'Thunder3'],
  ice: ['Ice2', 'Ice8'],
  poison: ['Poison'],
  ground: ['Earth1', 'Earth3'],
  rock: ['Earth3', 'Slam'],
  flying: ['gust', 'Wind1'],
  psychic: ['Psycho Cut', 'Saint3'],
  bug: ['Fury Swipes', 'Slash10'],
  ghost: ['Darkness2'],
  dark: ['Darkness6', 'Slash1'],
  dragon: ['Explosion4', 'Wind5'],
  steel: ['metal', 'Sword1'],
  fairy: ['Saint1', 'Shiny sparkle'],
};

/**
 * Capacités (nom pokeapi) qui ont leur propre son. Celles dont le nom anglais
 * est celui du fichier (Slash, Vice Grip, Take Down…) s'y ajoutent seules :
 * voir moveSoundFile.
 */
const MOVE_SOUNDS: Record<string, string> = {
  ember: 'Fire1',
  flamethrower: 'Fire2',
  'fire-blast': 'Fire6',
  'flame-wheel': 'Fire4',
  'water-gun': 'Water1',
  bubble: 'Water2',
  'bubble-beam': 'Water2',
  surf: 'Water5',
  'hydro-pump': 'Water3',
  'thunder-shock': 'Thunder3',
  thunderbolt: 'Thunder1',
  thunder: 'Thunder9',
  'thunder-wave': 'Paralyze3',
  'ice-beam': 'Ice8',
  'powder-snow': 'Ice2',
  earthquake: 'Earth4',
  magnitude: 'Earth4',
  dig: 'Earth5',
  'rock-slide': 'Collapse1',
  'rock-throw': 'Earth3',
  'poison-powder': 'Poison',
  'sleep-powder': 'Sleep',
  'stun-spore': 'Paralyze1',
  absorb: 'Absorb2',
  'mega-drain': 'Absorb2',
  'giga-drain': 'Absorb2',
  'leech-life': 'Absorb2',
  'razor-leaf': 'Slash2',
  'confuse-ray': 'Confuse',
  supersonic: 'Confuse',
  'self-destruct': 'Explosion1',
  'sand-attack': 'Sand',
  gust: 'gust',
  'wing-attack': 'Wind1',
  'air-slash': 'Wind7',
  'brick-break': 'Blow6',
  scratch: 'Slash1',
  'quick-attack': 'Blow7',
  tackle: 'Blow1',
  pound: 'Blow3',
  bite: 'Super Fang',
  crunch: 'Super Fang',
  growl: 'Uproar',
  roar: 'Uproar',
  leer: 'Stare',
  'tail-whip': 'decrease',
  'string-shot': 'Twine',
  'shadow-ball': 'Darkness2',
  psychic: 'Psycho Cut',
  'energy-ball': 'Absorb2',
  recover: 'Recovery',
  rest: 'Snore',
  'sweet-kiss': 'Lovely Kiss',
  attract: 'infatuated',
  'cotton-spore': 'Pollen',
  'sunny-day': 'Saint9',
  'rain-dance': 'Water5',
  sandstorm: 'Sand',
};

/** Fichiers de SE/Anim/ dont le nom est celui d'une capacité (« Swords Dance » = swords-dance). */
const NAMED_MOVE_FILES = [
  'Acupressure', 'Comet Punch', 'Defense Curl', 'Dizzy Punch', 'Explosion', 'Flail', 'Follow Me', 'Fury Swipes', 'Harden', 'Lock On',
  'Lovely Kiss', 'Lucky Chant', 'Mega Punch', 'Metronome', 'Natural Gift', 'Psych Up', 'Psycho Cut', 'Refresh', 'Scary Face', 'Shell Smash',
  'Sing', 'Slam', 'Slash', 'Smokescreen', 'Snore', 'Substitute', 'Super Fang', 'Swagger', 'Sweet Scent', 'Swords Dance', 'Take Down',
  'Trump Card', 'Uproar', 'Vice Grip', 'Whirlwind', 'Work Up', 'Wring Out', 'Yawn',
];
const NAMED_MOVES = new Map(NAMED_MOVE_FILES.map((f) => [f.toLowerCase().replace(/ /g, '-'), f]));
NAMED_MOVES.set('weather-ball', 'Weatherball');

/**
 * Son d'une famille d'animation (data/movestyles.ts) : un coup de poing claque,
 * une morsure croque, un séisme gronde, quel que soit le type. Les familles
 * élémentaires (rayon, sphère, salve, jet, onde) gardent le son de leur type,
 * sauf un rayon, plus appuyé. A-FAIRE 1.10 : « étendre MOVE_SOUNDS aux
 * capacités qui tombent encore sur le son de leur type ».
 */
const STYLE_SOUNDS: Partial<Record<MoveStyle, readonly string[]>> = {
  punch: ['Mega Punch', 'Comet Punch', 'punch5'],
  kick: ['Blow4', 'Blow5'],
  bite: ['Super Fang'],
  claw: ['Fury Swipes', 'Slash10'],
  slash: ['Slash', 'Slash3', 'Slash6'],
  cross: ['Slash8', 'Slash9'],
  stab: ['Sword2', 'Slash11'],
  whip: ['Slam', 'Wring Out'],
  charge: ['Take Down', 'Blow6'],
  smash: ['Crash', 'Collapse1'],
  quake: ['Earth4', 'Earth5'],
  blast: ['Explosion3', 'Explosion6'],
  vortex: ['Whirlwind', 'Wind5'],
  mind: ['Psych Up', 'Teleport'],
  drain: ['Absorb2', 'Wring Out'],
};
/** Rayons : le son le plus ample du type. */
const BEAM_SOUNDS: Record<string, string> = {
  fire: 'Fire5',
  water: 'Water3',
  electric: 'Thunder4',
  ice: 'Ice5',
  grass: 'Absorb2',
  psychic: 'Saint7',
  fairy: 'Saint6',
  dragon: 'Explosion4',
  dark: 'Darkness6',
  ghost: 'Darkness2',
  normal: 'Flash2',
  steel: 'Flash2',
};
/** Chute du ciel (météores, foudre) : la foudre pour l'Électrik, une déflagration sinon. */
const SKY_SOUNDS: Record<string, string> = { electric: 'Thunder9', ice: 'Ice8', water: 'Water5' };

/** Son d'attaque (nom de fichier de SE/Anim/, sans extension) : la capacité, sinon sa famille, sinon son type, sinon Normal. */
export function moveSoundFile(type: string, move?: string): string {
  const own = move && (MOVE_SOUNDS[move] ?? NAMED_MOVES.get(move));
  if (own) return own;
  const style = move ? listedStyle(move) : undefined;
  if (style) {
    const pool = STYLE_SOUNDS[style];
    if (pool) return pool[Math.floor(Math.random() * pool.length)];
    if (style === 'beam' && BEAM_SOUNDS[type]) return BEAM_SOUNDS[type];
    if (style === 'sky') return SKY_SOUNDS[type] ?? 'Explosion2';
  }
  const pool = TYPE_SOUNDS[type] ?? TYPE_SOUNDS.normal;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Chemin source (dépôt Godot) d'un son d'attaque. */
export const animFile = (name: string): string => anim(name)[0];

/** Tous les sons d'attaque possibles, pour l'import. */
export const ANIM_FILES: readonly string[] = [...new Set([...Object.values(TYPE_SOUNDS).flat(), ...Object.values(MOVE_SOUNDS), ...NAMED_MOVES.values(), ...Object.values(STYLE_SOUNDS).flat(), ...Object.values(BEAM_SOUNDS), ...Object.values(SKY_SOUNDS), 'Explosion2', 'Sound2'])].map(animFile);

// ── Cris ─────────────────────────────────────────────────────────────────

/** Dossier des cris dans le dépôt Godot (un fichier par espèce, nom interne d'Essentials). */
export const CRIES_DIR = `${ESSENTIALS_AUDIO}/SE/Cries`;

/** Nom interne d'Essentials (« NIDORANfE », « MRMIME ») d'une espèce, depuis son nom pokeapi. */
export function essentialsName(nameEn: string): string {
  if (nameEn === 'nidoran-f') return 'NIDORANfE';
  if (nameEn === 'nidoran-m') return 'NIDORANmA';
  return nameEn.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Cri servi d'une espèce (copié par l'import sous son numéro de Pokédex). */
export const cryPath = (speciesId: number): string => `audio/cries/${speciesId}.ogg`;

/**
 * Espèce sans cri dans Essentials (générations 6 et suivantes) : on joue à la
 * place ce son neutre (SE/Anim/), plus grave — un bruit qui vient de lui
 * plutôt qu'un silence.
 */
export const CRY_FALLBACK = 'Sound2';

/**
 * Musiques. Le jeu n'en jouait qu'au boss (Battle trainer) et après sa
 * défaite (Battle victory), silence ailleurs. Écarts voulus : une musique au
 * Repaire (Surfing, la plus calme des pistes ogg d'Essentials) et une, plus
 * basse, dans les salles de combat (Battle wild) — sans elle, une run entière
 * se jouait dans le silence entre deux boss.
 */
const ESSENTIALS_MUSIC = {
  camp: { file: `${ESSENTIALS_AUDIO}/BGM/Surfing.ogg`, db: -10 },
  boss: { file: `${ESSENTIALS_AUDIO}/BGM/Battle trainer.ogg`, db: -8 },
  victory: { file: `${ESSENTIALS_AUDIO}/BGM/Battle victory leader.ogg`, db: -8 },
  /** L'écran-titre (Title.ogg, en .ogg dans Essentials). */
  title: { file: `${ESSENTIALS_AUDIO}/BGM/Title.ogg`, db: -10 },
} as const;

/**
 * Musique de chaque lieu de run (retour de test : « pas de musique de combat, à part pour
 * les boss ; des musiques qui vont avec le biome »), à la place de Battle wild. Ce sont des
 * pistes .mid d'Essentials, rendues en .mp3 par scripts/midi-to-mp3.ts dans
 * public/game/music/ (`slug`). L'Océan garde Surfing, déjà en .ogg.
 */
export const BIOME_TRACKS = {
  prairie: { mid: 'Route 1.mid', slug: 'route1' },
  foret: { mid: 'Natural Park.mid', slug: 'natural-park' },
  automne: { mid: 'Route 3.mid', slug: 'route3' },
  village: { mid: 'Lappet Town.mid', slug: 'lappet-town' },
  plage: { mid: 'Islands.mid', slug: 'islands' },
  lac: { mid: 'Route 2.mid', slug: 'route2' },
  marais: { mid: 'Safari Zone exterior.mid', slug: 'safari-exterior' },
  volcan: { mid: 'Cedolan City.mid', slug: 'cedolan' },
  rocailleux: { mid: 'Cave.mid', slug: 'cave' },
  glace: { mid: 'Tiall.mid', slug: 'tiall' },
  grotte: { mid: 'Cave.mid', slug: 'cave' },
  victoire: { mid: 'Ingido Plateau.mid', slug: 'indigo-plateau' },
  shop: { mid: 'Poke Mart.mid', slug: 'poke-mart' },
  // Plus d'ambiance selon les lieux (retour de test : « d'autres musiques vraiment plus d'ambiance en fonction
  // des lieux ») : l'Océan sous l'eau, le Repaire en ville tranquille, une berceuse à la défaite, le Panthéon à la
  // victoire, et des combats de boss qui changent selon l'adversaire (arène, Conseil, Maître). (Underwater.mid et
  // Battle Elite.mid sont des copies exactes de Cave.mid et Battle Gym Leader.mid : l'Océan garde Surfing, le Conseil
  // prend Battle Frontier.)
  camp: { mid: 'Lerucean Town.mid', slug: 'lerucean' },
  defeat: { mid: 'Radio - Lullaby.mid', slug: 'lullaby' },
  halloffame: { mid: 'Hall of Fame.mid', slug: 'hall-of-fame' },
  gym: { mid: 'Gym.mid', slug: 'gym' },
  bossgym: { mid: 'Battle Gym Leader.mid', slug: 'battle-gym' },
  bosselite: { mid: 'Battle Frontier.mid', slug: 'battle-frontier' },
  bosschamp: { mid: 'Battle Champion.mid', slug: 'battle-champion' },
} as const;

/** Une musique : le fichier source (Essentials) et, pour les pistes rendues, leur chemin servi. */
export interface MusicDef {
  file: string;
  db: number;
  served?: string;
}

export const MUSIC: Record<string, MusicDef> = {
  ...ESSENTIALS_MUSIC,
  ocean: ESSENTIALS_MUSIC.camp,
  ...Object.fromEntries(Object.entries(BIOME_TRACKS).map(([id, t]) => [id, { file: `music/${t.slug}.mp3`, served: `music/${t.slug}.mp3`, db: -12 }])),
};

export type MusicId = keyof typeof ESSENTIALS_MUSIC | keyof typeof BIOME_TRACKS | 'ocean';

/**
 * Chemin servi par le jeu (public/game/audio/…) d'un fichier source : son
 * seul nom suffit, sauf pour les sons d'attaque, rangés à part dans anim/
 * (SE/Anim/Sweet Scent.ogg et SE/Sweet Scent.ogg portent le même nom).
 */
export const servedPath = (file: string): string => `audio/${file.includes('/SE/Anim/') ? 'anim/' : ''}${file.split('/').pop()!}`;
