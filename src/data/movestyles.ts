// Familles d'effet des attaques (retour de test du 11 novembre 2026 : « si
// je dis Ultralaser, il faut voir un rayon laser »). Avant, toute attaque
// jouait seulement une planche d'Essentials sur la cible : rien ne partait du
// lanceur, et Morsure, Charge ou Psyko se lisaient pareil. Chaque capacité a
// maintenant une famille, dessinée par render/movefx.ts en plus de la planche
// (qui reste, à l'impact) :
//
// - à distance, du lanceur vers la cible : rayon (`beam`), projectile
//   (`orb`), salve de petits projectiles (`volley`), souffle en cône
//   (`stream`), ondes (`wave`), coup venu du ciel (`sky`), pouvoir autour de
//   la cible (`mind`), tourbillon (`vortex`), sol qui se fend (`quake`),
//   absorption qui revient au lanceur (`drain`), explosion sur le lanceur
//   (`blast`) ;
// - au contact, sur la cible : morsure (`bite`), griffes (`claw`), lame
//   (`slash`), croix (`cross`), poing (`punch`), pied (`kick`), estoc
//   (`stab`), fouet (`whip`), ruée (`charge`), coup de masse (`smash`).
//
// Données pures (sans DOM). Une capacité absente des listes prend la famille
// par défaut de sa classe et de son type (`styleOf`).

export type MoveStyle =
  | 'beam'
  | 'orb'
  | 'volley'
  | 'stream'
  | 'wave'
  | 'sky'
  | 'mind'
  | 'vortex'
  | 'quake'
  | 'drain'
  | 'blast'
  | 'bite'
  | 'claw'
  | 'slash'
  | 'cross'
  | 'punch'
  | 'kick'
  | 'stab'
  | 'whip'
  | 'charge'
  | 'smash';

/** Familles qui partent du lanceur (dessinées pendant le vol du coup), les autres frappent au contact. */
export const RANGED_STYLES: ReadonlySet<MoveStyle> = new Set(['beam', 'orb', 'volley', 'stream', 'wave', 'sky', 'mind', 'vortex', 'quake', 'drain', 'blast']);

const LISTS: Record<MoveStyle, string> = {
  beam: 'hyper-beam ice-beam aurora-beam solar-beam psybeam signal-beam charge-beam zap-cannon flash-cannon dragon-pulse hydro-pump twin-beam aeroblast power-gem mirror-shot bubble-beam',
  orb: 'shadow-ball energy-ball aura-sphere sludge sludge-bomb mud-bomb ember fire-blast weather-ball hidden-power vacuum-wave volt-switch ice-ball seed-bomb gunk-shot egg-bomb water-pulse acid venoshock belch pollen-puff moonblast draining-kiss mud-slap shock-wave brine smack-down ancient-power tri-attack magnet-bomb flame-burst electro-ball focus-blast',
  volley: 'razor-leaf magical-leaf swift pin-missile bullet-seed rock-blast icicle-spear water-shuriken air-cutter air-slash dragon-darts rock-throw ice-shard mud-shot barrage bubble water-gun razor-wind leafage',
  stream: 'flamethrower inferno heat-wave overheat incinerate burn-up dragon-breath icy-wind powder-snow frost-breath freeze-dry smog acid-spray clear-smog leaf-storm petal-dance petal-blizzard silver-wind ominous-wind fairy-wind gust lava-plume eruption',
  wave: 'hyper-voice echoed-voice round uproar snore disarming-voice bug-buzz struggle-bug snarl dark-pulse clanging-scales night-daze synchronoise surf muddy-water sludge-wave discharge dazzling-gleam',
  sky: 'thunder thunderbolt thunder-shock blizzard rock-slide avalanche icicle-crash future-sight doom-desire stone-edge sky-attack',
  mind: 'psychic confusion extrasensory psyshock stored-power hex night-shade dream-eater',
  vortex: 'whirlpool fire-spin sand-tomb infestation twister leaf-tornado hurricane',
  quake: 'earthquake magnitude bulldoze earth-power stomping-tantrum precipice-blades rock-tomb dig fissure high-horsepower',
  drain: 'absorb mega-drain giga-drain',
  blast: 'explosion self-destruct',
  bite: 'bite crunch hyper-fang super-fang fire-fang ice-fang thunder-fang poison-fang psychic-fangs bug-bite leech-life pluck jaw-lock',
  claw: 'scratch fury-swipes crush-claw metal-claw shadow-claw dragon-claw false-swipe fury-cutter breaking-swipe',
  slash: 'slash night-slash cut leaf-blade psycho-cut razor-shell sacred-sword aerial-ace dual-chop glaive-rush steel-wing wing-attack dual-wingbeat',
  cross: 'x-scissor cross-poison cross-chop',
  punch: 'pound mega-punch comet-punch dizzy-punch dynamic-punch focus-punch hammer-arm brick-break karate-chop arm-thrust force-palm wake-up-slap rock-smash power-up-punch sky-uppercut drain-punch rage-fist sucker-punch smelling-salts crabhammer double-slap darkest-lariat fire-punch ice-punch thunder-punch shadow-punch mach-punch bullet-punch meteor-mash throat-chop',
  kick: 'double-kick triple-kick rolling-kick jump-kick high-jump-kick blaze-kick low-sweep low-kick mega-kick stomp heart-stamp',
  stab: 'peck drill-peck poison-sting poison-jab horn-attack fury-attack megahorn smart-strike drill-run hyper-drill twineedle fell-stinger branch-poke horn-leech icicle-spear',
  whip: 'vine-whip power-whip slam tail-slap aqua-tail iron-tail poison-tail dragon-tail fire-lash wrap bind constrict lick',
  charge: 'tackle take-down double-edge body-slam headbutt head-smash giga-impact skull-bash zen-headbutt iron-head quick-attack extreme-speed accelerock aqua-jet flame-charge flame-wheel wild-charge spark volt-tackle flare-blitz brave-bird wave-crash dragon-rush rollout rapid-spin steamroller u-turn lunge feint-attack shadow-sneak phantom-force fly bounce dive sky-drop acrobatics play-rough thrash outrage raging-bull last-resort facade retaliate revenge payback assurance comeuppance foul-play knock-off thief covet pursuit chip-away rage rock-climb nuzzle astonish psyshield-bash fake-out feint quick-guard waterfall liquidation dragon-ascent sacred-fire population-bomb double-hit',
  smash: 'wood-hammer gigaton-hammer dragon-hammer strength brutal-swing superpower close-combat submission circle-throw storm-throw vital-throw rock-wrecker heavy-slam',
};

const STYLE_OF = new Map<string, MoveStyle>();
for (const [style, list] of Object.entries(LISTS) as [MoveStyle, string][]) {
  // Le premier classement gagne (une capacité citée deux fois garde sa première famille).
  for (const api of list.split(/\s+/)) if (api && !STYLE_OF.has(api)) STYLE_OF.set(api, style);
}

/** Famille par défaut d'une attaque à distance absente des listes, selon son type. */
const SPECIAL_DEFAULT: Record<string, MoveStyle> = {
  electric: 'sky',
  psychic: 'mind',
  ghost: 'mind',
  ground: 'quake',
  fire: 'stream',
  flying: 'volley',
  normal: 'wave',
};
/** Et d'une attaque au contact. */
const PHYSICAL_DEFAULT: Record<string, MoveStyle> = {
  fighting: 'punch',
  dark: 'bite',
  bug: 'stab',
  poison: 'stab',
  grass: 'whip',
  flying: 'slash',
  dragon: 'claw',
  ghost: 'claw',
  ground: 'quake',
  rock: 'smash',
  steel: 'smash',
};

/**
 * Famille d'une capacité. `special` : vraie pour un tir (classe spéciale),
 * fausse pour un coup au contact ; elle ne sert qu'aux capacités absentes des
 * listes. Une capacité listée garde sa famille quelle que soit sa classe :
 * Éboulement (physique) fait tomber ses rochers du ciel, Jet-Pierres lance
 * ses cailloux — le corps à corps porte jusqu'à 4 ou 5 cases, l'effet part
 * alors du lanceur, sans délai.
 */
export function styleOf(api: string | undefined, type: string, special: boolean): MoveStyle {
  const listed = api ? STYLE_OF.get(api) : undefined;
  if (listed) return listed;
  if (special) return SPECIAL_DEFAULT[type] ?? 'orb';
  return PHYSICAL_DEFAULT[type] ?? 'charge';
}

/** Trois teintes par type pour les effets : cœur clair, couleur, ombre. */
export const TYPE_PALETTE: Record<string, readonly [string, string, string]> = {
  fire: ['#fff3b0', '#ffa040', '#e8461a'],
  water: ['#e6f6ff', '#7cc4ff', '#2f7fe0'],
  electric: ['#ffffff', '#fff275', '#ffc400'],
  ice: ['#ffffff', '#c8f2ff', '#6fcbec'],
  grass: ['#eaffc8', '#8fdc5a', '#3f9a32'],
  poison: ['#f0c8ff', '#b86bd9', '#6f2d8f'],
  psychic: ['#ffe0f0', '#ff73b8', '#c2408a'],
  ghost: ['#e6d8ff', '#9a7ee0', '#3d2a66'],
  dark: ['#d8c8e6', '#6a5480', '#1c1424'],
  dragon: ['#e0e6ff', '#7a8cf6', '#4a2fc2'],
  fairy: ['#fff0fa', '#ffb3e0', '#ff7ac8'],
  fighting: ['#fff0d0', '#ffa060', '#c0402a'],
  ground: ['#f2dcb0', '#d9ad66', '#8a6a3a'],
  rock: ['#efe0c0', '#c7ad73', '#7a6440'],
  steel: ['#ffffff', '#d0dae8', '#8a98ad'],
  flying: ['#ffffff', '#d8e4fa', '#9db4e0'],
  bug: ['#f0ffc0', '#b3d14d', '#6f8a20'],
  normal: ['#ffffff', '#fff2c7', '#d8c890'],
};

export const paletteOf = (type: string): readonly [string, string, string] => TYPE_PALETTE[type] ?? TYPE_PALETTE.normal;

/** Quelques capacités qui ont leur couleur à elles dans les jeux, plutôt que celle de leur type. */
export const PALETTE_OF_MOVE: Record<string, readonly [string, string, string]> = {
  'hyper-beam': ['#fff8e0', '#ffc94a', '#ff7a1f'],
  'giga-impact': ['#fff8e0', '#ffc94a', '#ff7a1f'],
  'solar-beam': ['#ffffff', '#fff3a0', '#ffd23f'],
  'aurora-beam': ['#ffffff', '#ffb3e0', '#7fd6f2'],
  'signal-beam': ['#ffffff', '#ff9ad0', '#8fdc5a'],
  'zap-cannon': ['#ffffff', '#fff275', '#5a8cff'],
  'dragon-pulse': ['#e0e6ff', '#6a8cff', '#7a2fc2'],
  'aura-sphere': ['#e8f4ff', '#6fb0ff', '#2f5fd0'],
  'moonblast': ['#ffffff', '#ffd6f0', '#ff7ac8'],
  'dark-pulse': ['#e0c8ff', '#8a5ab8', '#2a1440'],
};
