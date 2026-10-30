import type { BuffStat, Status } from './pokemon';

// Capacités : fiches PokéAPI embarquées (data/pokeapi/move/<nom>.json), plus
// la portée et la cadence propres à chaque attaque, dérivées de sa classe et
// de sa puissance comme MoveData.tune() (scripts/pokemon/MoveData.gd:56-80).

/**
 * Effet réel d'une capacité de statut. Le jeu n'en donne qu'aux CT du tuteur
 * (MoveShopScreen.MOVE_LIST) : celles apprises en montant de niveau
 * (Rugissement, Machination…) y frappent au contact comme une attaque. Ici,
 * elles font ce que dit leur nom ; `buff` vise le lanceur, `debuff` tous les
 * sauvages à portée, `status` le plus proche (statut garanti).
 */
export type MoveEffect =
  | { kind: 'buff'; stats: [BuffStat, number][] }
  | { kind: 'debuff'; stat: BuffStat; mult: number }
  | { kind: 'status'; status: Status }
  | { kind: 'heal'; pct: number }
  | { kind: 'protect'; dur: number }
  | { kind: 'cleanse' };

/** Durée des hausses et des baisses de stats (celle des CT de buff du jeu). */
export const BUFF_TIME = 8;

const EFFECTS: Record<string, MoveEffect> = {
  // Hausses du lanceur
  'nasty-plot': { kind: 'buff', stats: [['atk', 1.5]] },
  'swords-dance': { kind: 'buff', stats: [['atk', 1.5]] },
  growth: { kind: 'buff', stats: [['atk', 1.4]] },
  'calm-mind': { kind: 'buff', stats: [['atk', 1.4]] },
  'belly-drum': { kind: 'buff', stats: [['atk', 2]] },
  'shell-smash': { kind: 'buff', stats: [['atk', 1.8], ['spd', 1.4], ['def', 0.75]] },
  curse: { kind: 'buff', stats: [['atk', 1.3], ['def', 1.3], ['spd', 0.8]] },
  withdraw: { kind: 'buff', stats: [['def', 1.5]] },
  'defense-curl': { kind: 'buff', stats: [['def', 1.3]] },
  'iron-defense': { kind: 'buff', stats: [['def', 2]] },
  amnesia: { kind: 'buff', stats: [['def', 1.6]] },
  stockpile: { kind: 'buff', stats: [['def', 1.3]] },
  agility: { kind: 'buff', stats: [['spd', 1.5]] },
  'rock-polish': { kind: 'buff', stats: [['spd', 1.5]] },
  'double-team': { kind: 'buff', stats: [['eva', 1.3]] },
  'focus-energy': { kind: 'buff', stats: [['crit', 1.25]] },
  // Baisses des sauvages à portée
  growl: { kind: 'debuff', stat: 'atk', mult: 0.75 },
  'play-nice': { kind: 'debuff', stat: 'atk', mult: 0.75 },
  'baby-doll-eyes': { kind: 'debuff', stat: 'atk', mult: 0.75 },
  charm: { kind: 'debuff', stat: 'atk', mult: 0.6 },
  'tail-whip': { kind: 'debuff', stat: 'def', mult: 0.75 },
  leer: { kind: 'debuff', stat: 'def', mult: 0.75 },
  'sweet-scent': { kind: 'debuff', stat: 'def', mult: 0.75 },
  screech: { kind: 'debuff', stat: 'def', mult: 0.6 },
  'scary-face': { kind: 'debuff', stat: 'spd', mult: 0.5 },
  'sand-attack': { kind: 'debuff', stat: 'acc', mult: 0.7 },
  smokescreen: { kind: 'debuff', stat: 'acc', mult: 0.7 },
  'sweet-kiss': { kind: 'debuff', stat: 'acc', mult: 0.7 },
  // Statuts garantis (CT du jeu : Toxik, Cage-Éclair, Feu Follet, Berceuse)
  'thunder-wave': { kind: 'status', status: 'paralysis' },
  toxic: { kind: 'status', status: 'poison' },
  'poison-powder': { kind: 'status', status: 'poison' },
  'leech-seed': { kind: 'status', status: 'poison' },
  'will-o-wisp': { kind: 'status', status: 'burn' },
  'sleep-powder': { kind: 'status', status: 'sleep' },
  sing: { kind: 'status', status: 'sleep' },
  yawn: { kind: 'status', status: 'sleep' },
  // Soins et protection
  recover: { kind: 'heal', pct: 0.5 },
  synthesis: { kind: 'heal', pct: 0.5 },
  swallow: { kind: 'heal', pct: 0.25 },
  rest: { kind: 'heal', pct: 1 },
  protect: { kind: 'protect', dur: 1.5 },
  refresh: { kind: 'cleanse' },
};

export interface Move {
  api: string;
  name: string;
  type: string;
  /** 0 = capacité de statut. */
  power: number;
  damageClass: 'physical' | 'special' | 'status';
  levelLearned: number;
  /** > 0 : ne peut pas être lancée de plus près. */
  rangeMin: number;
  rangeMax: number;
  /** Secondes, avant mise à l'échelle par la Vitesse. */
  cooldown: number;
  /** Capacité de statut à effet réel ; sans effet, elle frappe au contact comme dans le jeu. */
  effect?: MoveEffect;
  /** Renforcements reçus (+25 % de puissance chacun, 4 au plus). */
  upgrades?: number;
}

interface MoveJson {
  name_fr?: string;
  type?: string;
  power?: number | null;
  damage_class?: string;
}

/** MoveData.tune() : physique = contact rapide, spécial = tir qui porte loin, statut = lent. */
export function tune(move: Move): Move {
  const p = Math.min(120, Math.max(0, move.power)) / 120;
  if (move.damageClass === 'special') {
    move.rangeMax = 7 + p * 4;
    move.rangeMin = move.power >= 90 ? 3 : 0;
    move.cooldown = 1.05 + p * 0.85;
  } else if (move.damageClass === 'status') {
    move.rangeMax = 8;
    move.rangeMin = 0;
    move.cooldown = 3.2;
  } else {
    move.rangeMax = 3.4 + p * 1.2;
    move.rangeMin = 0;
    move.cooldown = 0.68 + p * 0.82;
  }
  return move;
}

const cache = new Map<string, Promise<Move | null>>();

export function loadMove(api: string, levelLearned = 1): Promise<Move | null> {
  let pending = cache.get(api);
  if (!pending) {
    pending = fetch(`/game/data/pokeapi/move/${api}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<MoveJson>) : null))
      .catch(() => null)
      .then((d) => {
        if (!d) return null;
        const cls = d.damage_class === 'special' || d.damage_class === 'status' ? d.damage_class : 'physical';
        return tune({
          api,
          name: d.name_fr || api,
          type: d.type ?? 'normal',
          power: Math.round(d.power ?? 0),
          damageClass: cls,
          levelLearned,
          rangeMin: 0,
          rangeMax: 4,
          cooldown: 0.7,
          effect: cls === 'status' ? EFFECTS[api] : undefined,
        });
      });
    cache.set(api, pending);
  }
  // Copie : le niveau d'apprentissage dépend de l'espèce, la fiche est partagée.
  return pending.then((m) => (m ? { ...m, levelLearned } : null));
}
