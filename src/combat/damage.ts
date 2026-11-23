import { ABSORB, FLASH_FIRE, LEVITATE, PINCH, SNIPER, SNIPER_CRIT, TECHNICIAN, TECHNICIAN_CAP, THICK_FAT } from '../data/abilities';
// Table des types Gen 6 et formule de dégâts Gen 5+, reprises telles quelles
// de scripts/combat/DamageCalculator.gd (sans STAB, comme le jeu). Seule
// différence : le tirage aléatoire est injecté, pour des combats rejouables.
// Ajout : la météo de la salle (world/weather.ts) pèse sur les attaques Eau et
// Feu, des deux côtés ; elle est posée ici une fois par salle (setWeather).

import { weatherMultiplier, type WeatherId } from '../world/weather';

let weather: WeatherId = 'clear';
/** Météo de la salle courante (temps clair hors run). */
export const setWeather = (w: WeatherId): void => {
  weather = w;
};
export const currentWeather = (): WeatherId => weather;

/** Attaquant → { défenseur: multiplicateur }. Seules les valeurs ≠ 1 figurent. */
export const TYPE_CHART: Record<string, Record<string, number>> = {
  normal: { rock: 0.5, steel: 0.5, ghost: 0 },
  fire: { fire: 0.5, water: 0.5, rock: 0.5, dragon: 0.5, grass: 2, ice: 2, bug: 2, steel: 2 },
  water: { water: 0.5, grass: 0.5, dragon: 0.5, fire: 2, ground: 2, rock: 2 },
  electric: { electric: 0.5, grass: 0.5, dragon: 0.5, ground: 0, water: 2, flying: 2 },
  grass: { fire: 0.5, grass: 0.5, poison: 0.5, flying: 0.5, bug: 0.5, dragon: 0.5, steel: 0.5, water: 2, ground: 2, rock: 2 },
  ice: { water: 0.5, ice: 0.5, steel: 0.5, grass: 2, ground: 2, flying: 2, dragon: 2 },
  fighting: { poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, fairy: 0.5, ghost: 0, normal: 2, ice: 2, rock: 2, dark: 2, steel: 2 },
  poison: { poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, grass: 2, fairy: 2 },
  ground: { grass: 0.5, bug: 0.5, flying: 0, fire: 2, electric: 2, poison: 2, rock: 2, steel: 2 },
  flying: { electric: 0.5, rock: 0.5, steel: 0.5, grass: 2, fighting: 2, bug: 2 },
  psychic: { psychic: 0.5, steel: 0.5, dark: 0, fighting: 2, poison: 2 },
  bug: { fire: 0.5, fighting: 0.5, flying: 0.5, ghost: 0.5, steel: 0.5, fairy: 0.5, grass: 2, psychic: 2, dark: 2 },
  rock: { fighting: 0.5, ground: 0.5, steel: 0.5, fire: 2, ice: 2, flying: 2, bug: 2 },
  ghost: { normal: 0, dark: 0.5, psychic: 2, ghost: 2 },
  dragon: { steel: 0.5, fairy: 0, dragon: 2 },
  dark: { fighting: 0.5, dark: 0.5, fairy: 0.5, psychic: 2, ghost: 2 },
  steel: { fire: 0.5, water: 0.5, electric: 0.5, steel: 0.5, ice: 2, rock: 2, fairy: 2 },
  fairy: { fire: 0.5, poison: 0.5, steel: 0.5, fighting: 2, dragon: 2, dark: 2 },
};

export function typeMultiplier(attackType: string, defenderTypes: readonly string[]): number {
  const chart = TYPE_CHART[attackType] ?? {};
  let mult = 1;
  for (const t of defenderTypes) mult *= chart[t] ?? 1;
  return mult;
}

/** Ce que la formule lit d'un combattant (cf. PokemonInstance.get_effective_*). */
export interface Fighter {
  /** Espèce (n° national) : ses talents (data/abilities.ts). */
  id?: number;
  /** PV (Engrais, Brasier, Torrent ; Absorb soigne). */
  hp?: number;
  maxHp?: number;
  level: number;
  types: readonly string[];
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  critChance: number;
}

export interface DamageResult {
  damage: number;
  crit: boolean;
  /** Multiplicateur de type seul (sert au chiffre de dégâts : super efficace, peu efficace…). */
  effectiveness: number;
}

/**
 * Formule Gen 5+. Une attaque spéciale oppose Atq. Spé à Déf. Spé, toute
 * autre classe Attaque à Défense (DamageCalculator.gd:58-71).
 */
/** Les Pokémon dont la Torche s'est embrasée (un Feu reçu) : leurs attaques Feu sont renforcées. */
const flashed = new WeakSet<Fighter>();

export function calculateDamage(
  attacker: Fighter,
  defender: Fighter,
  power: number,
  type: string,
  damageClass: string,
  random: () => number,
): DamageResult {
  const special = damageClass === 'special';
  const atk = special ? attacker.spAttack : attacker.attack;
  const def = Math.max(1, special ? defender.spDefense : defender.defense);
  const base = (((2 * attacker.level) / 5 + 2) * power * atk) / def / 50 + 2;
  const did = defender.id ?? -1;
  const aid = attacker.id ?? -1;
  // Absorb Eau / Volt : il boit le coup (un quart de ses PV). Torche : le Feu l'embrase.
  const absorb = ABSORB[did]?.type === type;
  const flash = type === 'fire' && FLASH_FIRE.has(did);
  if (absorb && defender.hp !== undefined && defender.maxHp) defender.hp = Math.min(defender.maxHp, defender.hp + Math.round(defender.maxHp / 4));
  if (flash) flashed.add(defender);
  // Lévitation : les attaques Sol passent sous lui, comme une immunité de type.
  const immune = absorb || flash || (type === 'ground' && LEVITATE.has(did));
  const effectiveness = immune ? 0 : typeMultiplier(type, defender.types);
  let modifier = effectiveness * weatherMultiplier(weather, type);
  // Isograisse : sa graisse amortit le Feu et la Glace.
  if ((type === 'fire' || type === 'ice') && THICK_FAT.has(did)) modifier *= 0.5;
  // Torche embrasée, et Engrais / Brasier / Torrent sous un tiers des PV.
  if (type === 'fire' && flashed.has(attacker)) modifier *= 1.5;
  const pinch = PINCH[aid];
  if (pinch?.type === type && attacker.hp !== undefined && attacker.maxHp && attacker.hp <= attacker.maxHp / 3) modifier *= 1.5;
  const roll = 0.85 + random() * 0.15;
  // Technicien : les petites attaques, bien placées (puissance du coup telle qu'elle arrive ici).
  if (TECHNICIAN.has(aid) && power <= TECHNICIAN_CAP) modifier *= 1.5;
  const crit = random() < attacker.critChance;
  if (crit) modifier *= SNIPER.has(aid) ? SNIPER_CRIT : 1.5;
  return { damage: Math.max(1, Math.floor(base * modifier * roll)), crit, effectiveness };
}
