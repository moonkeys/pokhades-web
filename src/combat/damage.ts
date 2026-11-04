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
  const effectiveness = typeMultiplier(type, defender.types);
  let modifier = effectiveness * weatherMultiplier(weather, type);
  const roll = 0.85 + random() * 0.15;
  const crit = random() < attacker.critChance;
  if (crit) modifier *= 1.5;
  return { damage: Math.max(1, Math.floor(base * modifier * roll)), crit, effectiveness };
}
