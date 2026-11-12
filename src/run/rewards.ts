import { loadMove, tune, type Move } from '../combat/moves';
import type { Pokemon } from '../combat/pokemon';
import type { Rng } from '../core/rng';

// Récompense « ✦ Nouvelle attaque » (CombatArena._roll_move_offers) : jusqu'à
// 3 attaques fortes que l'espèce peut apprendre et n'a pas déjà, plus jusqu'à
// 2 attaques équipées à renforcer (+25 % de puissance, 4 fois au plus).
// Le jeu retirait l'offre à chaque ouverture de l'écran ; ici elle est tirée
// une fois, quand la récompense apparaît, comme celle des dons.

/** CombatArena.STRONG_MOVES */
const STRONG_MOVES = ['flamethrower', 'thunderbolt', 'ice-beam', 'surf', 'earthquake', 'psychic', 'shadow-ball', 'energy-ball', 'brick-break', 'rock-slide'];
/** MoveData.MAX_UPGRADES et UPGRADE_PCT */
export const MAX_UPGRADES = 4;
export const UPGRADE_PCT = 0.25;
/** Emplacements de capacités (GameManager.move_slot_count). */
export const MOVE_SLOTS = 4;

export interface SkillOffer {
  learn: Move[];
  /** Index des capacités équipées à renforcer. */
  upgrade: number[];
  /** Pour les renforcements qui font évoluer la capacité : ce qu'elle devient, par index. */
  evolve?: Record<number, Move>;
}

/**
 * Évolution des attaques (retour de test du 11 novembre 2026 : « tu passes
 * de Pistolet à O à Hydrocanon »). Au deuxième renforcement, une capacité de
 * ces lignées devient la suivante, du même type et de la même classe (le
 * tir reste un tir, le contact un contact) ; sa puissance ne baisse jamais,
 * et ses renforcements repartent de zéro. Ajout par rapport au jeu Godot, qui
 * ne faisait que monter la puissance.
 */
export const MOVE_EVOLUTIONS: Readonly<Record<string, string>> = {
  'water-gun': 'water-pulse',
  'water-pulse': 'hydro-pump',
  bubble: 'bubble-beam',
  'bubble-beam': 'hydro-pump',
  ember: 'flame-burst',
  'flame-burst': 'flamethrower',
  flamethrower: 'fire-blast',
  'thunder-shock': 'thunderbolt',
  thunderbolt: 'thunder',
  spark: 'wild-charge',
  'vine-whip': 'power-whip',
  absorb: 'mega-drain',
  'mega-drain': 'giga-drain',
  leafage: 'razor-leaf',
  'razor-leaf': 'leaf-blade',
  'bullet-seed': 'seed-bomb',
  'magical-leaf': 'energy-ball',
  'energy-ball': 'solar-beam',
  'powder-snow': 'ice-beam',
  'ice-beam': 'blizzard',
  'ice-shard': 'icicle-crash',
  tackle: 'body-slam',
  'body-slam': 'double-edge',
  'take-down': 'double-edge',
  'double-edge': 'giga-impact',
  scratch: 'slash',
  'fury-swipes': 'slash',
  'quick-attack': 'extreme-speed',
  pound: 'mega-punch',
  swift: 'hyper-voice',
  'hyper-voice': 'hyper-beam',
  'karate-chop': 'brick-break',
  'brick-break': 'close-combat',
  'vacuum-wave': 'aura-sphere',
  confusion: 'psybeam',
  psybeam: 'psychic',
  astonish: 'shadow-claw',
  lick: 'shadow-claw',
  bite: 'crunch',
  snarl: 'dark-pulse',
  'poison-sting': 'poison-jab',
  'poison-jab': 'gunk-shot',
  acid: 'sludge',
  sludge: 'sludge-bomb',
  'rock-throw': 'rock-slide',
  'rock-slide': 'stone-edge',
  'mud-slap': 'mud-shot',
  'mud-shot': 'earth-power',
  magnitude: 'earthquake',
  gust: 'air-slash',
  'air-slash': 'hurricane',
  peck: 'drill-peck',
  'wing-attack': 'brave-bird',
  'bug-bite': 'x-scissor',
  'x-scissor': 'megahorn',
  'struggle-bug': 'bug-buzz',
  twister: 'dragon-breath',
  'dragon-breath': 'dragon-pulse',
  'dragon-claw': 'outrage',
  'metal-claw': 'iron-head',
  'mirror-shot': 'flash-cannon',
  'fairy-wind': 'draining-kiss',
  'draining-kiss': 'moonblast',
  'fire-fang': 'fire-punch',
  'fire-punch': 'flare-blitz',
  'ice-fang': 'ice-punch',
  'thunder-fang': 'thunder-punch',
};
/** Le renforcement qui fait évoluer (le deuxième). */
export const EVOLVE_AT = 2;

/** Ce que devient la capacité à son prochain renforcement, ou null. */
export function evolvesInto(m: Move): string | null {
  const next = MOVE_EVOLUTIONS[m.api];
  return next && (m.upgrades ?? 0) + 1 >= EVOLVE_AT ? next : null;
}

/** La capacité évoluée (puissance au moins celle qu'aurait donnée le renforcement), ou null. */
export async function evolveMove(m: Move): Promise<Move | null> {
  const next = evolvesInto(m);
  if (!next) return null;
  const n = await loadMove(next, m.levelLearned);
  if (!n || n.damageClass !== m.damageClass) return null;
  return tune({ ...n, power: Math.max(n.power, Math.ceil(m.power * (1 + UPGRADE_PCT))), upgrades: 0 });
}

export function canUpgrade(m: Move): boolean {
  return m.power > 0 && (m.upgrades ?? 0) < MAX_UPGRADES;
}

/** MoveData.apply_upgrade : la puissance seule, la portée et la cadence ne bougent pas. */
export function upgradeMove(m: Move): void {
  m.power = Math.ceil(m.power * (1 + UPGRADE_PCT));
  m.upgrades = (m.upgrades ?? 0) + 1;
}

export async function rollSkillOffer(mon: Pokemon, rng: Rng): Promise<SkillOffer> {
  const shuffle = <T>(a: T[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const equipped = new Set(mon.moves.map((m) => m.api));
  const apis = shuffle(STRONG_MOVES.filter((api) => !equipped.has(api) && mon.learnable.has(api))).slice(0, 3);
  const learn = (await Promise.all(apis.map((api) => loadMove(api, 0)))).filter((m): m is Move => !!m);
  const upgrade = shuffle(mon.moves.map((m, i) => (canUpgrade(m) ? i : -1)).filter((i) => i >= 0)).slice(0, 2);
  const evolve: Record<number, Move> = {};
  await Promise.all(
    upgrade.map(async (i) => {
      const evo = await evolveMove(mon.moves[i]);
      if (evo) evolve[i] = evo;
    }),
  );
  return { learn, upgrade, evolve };
}
