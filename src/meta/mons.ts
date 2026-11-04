import type { Pokemon } from '../combat/pokemon';

// Les Pokémon de la rébellion, un par un (ajout, retour de test : « est-ce qu'on
// peut avoir plusieurs fois le même Pokémon, avec des stats un peu
// différentes ? les caractères, joyeux, triste… »). Le jeu Godot rangeait tout
// par espèce ; ici chaque libéré est un individu (`Mon`) : son espèce, sa
// nature, ses talents, son surnom et d'où il vient. Deux Rattata du Repaire ne
// se valent pas : on peut vouloir le second.
//
// - Nature : les 25 des jeux principaux, sous leurs noms français ; une stat
//   à +10 %, une autre à −10 % (cinq sont neutres).
// - Talents : de 0 à 10 par stat, +1 % chacun (l'équivalent léger des IV),
//   tirés à l'arrivée.
// Les deux s'appliquent aux multiplicateurs permanents du Pokémon (Pokemon.mult),
// qui survivent aux évolutions en run (Pokemon.inherit).

export type TraitStat = 'hp' | 'atk' | 'def' | 'spAtk' | 'spDef' | 'speed';
export const TRAIT_STATS: readonly TraitStat[] = ['hp', 'atk', 'def', 'spAtk', 'spDef', 'speed'];
export const TRAIT_LABEL: Record<TraitStat, string> = { hp: 'PV', atk: 'ATT', def: 'DÉF', spAtk: 'ATT.S', spDef: 'DÉF.S', speed: 'VIT' };

type NatureStat = Exclude<TraitStat, 'hp'>;
export const NATURES = {
  hardy: { name: 'Hardi' },
  lonely: { name: 'Solo', up: 'atk', down: 'def' },
  brave: { name: 'Brave', up: 'atk', down: 'speed' },
  adamant: { name: 'Rigide', up: 'atk', down: 'spAtk' },
  naughty: { name: 'Mauvais', up: 'atk', down: 'spDef' },
  bold: { name: 'Assuré', up: 'def', down: 'atk' },
  docile: { name: 'Docile' },
  relaxed: { name: 'Relax', up: 'def', down: 'speed' },
  impish: { name: 'Malin', up: 'def', down: 'spAtk' },
  lax: { name: 'Lâche', up: 'def', down: 'spDef' },
  timid: { name: 'Timide', up: 'speed', down: 'atk' },
  hasty: { name: 'Pressé', up: 'speed', down: 'def' },
  serious: { name: 'Sérieux' },
  jolly: { name: 'Jovial', up: 'speed', down: 'spAtk' },
  naive: { name: 'Naïf', up: 'speed', down: 'spDef' },
  modest: { name: 'Modeste', up: 'spAtk', down: 'atk' },
  mild: { name: 'Doux', up: 'spAtk', down: 'def' },
  quiet: { name: 'Discret', up: 'spAtk', down: 'speed' },
  bashful: { name: 'Pudique' },
  rash: { name: 'Foufou', up: 'spAtk', down: 'spDef' },
  calm: { name: 'Calme', up: 'spDef', down: 'atk' },
  gentle: { name: 'Gentil', up: 'spDef', down: 'def' },
  sassy: { name: 'Malpoli', up: 'spDef', down: 'speed' },
  careful: { name: 'Prudent', up: 'spDef', down: 'spAtk' },
  quirky: { name: 'Bizarre' },
} as const satisfies Record<string, { name: string; up?: NatureStat; down?: NatureStat }>;
export type NatureId = keyof typeof NATURES;
const NATURE_IDS = Object.keys(NATURES) as NatureId[];

/** Talent maximal par stat (+1 % chacun). */
export const TALENT_MAX = 10;

export interface Mon {
  uid: number;
  species: number;
  nature: NatureId;
  /** Talents par stat, 0..TALENT_MAX. */
  iv: Record<TraitStat, number>;
  /** Surnom ; absent : le nom de l'espèce. */
  name?: string;
  /** D'où il vient : 'starter', 'quest', 'nectar', 'cave:<biome>' (libéré d'une grotte), ou le biome où il a été recruté. */
  origin?: string;
}

/** Un nouvel individu : nature et talents tirés au hasard. */
export function rollMon(uid: number, species: number, origin?: string, rand: () => number = Math.random): Mon {
  const iv = Object.fromEntries(TRAIT_STATS.map((s) => [s, Math.floor(rand() * (TALENT_MAX + 1))])) as Record<TraitStat, number>;
  return { uid, species, nature: NATURE_IDS[Math.floor(rand() * NATURE_IDS.length)], iv, ...(origin ? { origin } : {}) };
}

/** Multiplicateur d'une stat : talent, puis nature. */
export function traitMult(m: Mon, stat: TraitStat): number {
  const n = (NATURES[m.nature] ?? {}) as { up?: NatureStat; down?: NatureStat };
  const nature = n.up === stat ? 1.1 : n.down === stat ? 0.9 : 1;
  return (1 + (m.iv[stat] ?? 0) / 100) * nature;
}

/** Applique nature et talents à un Pokémon tout juste chargé (avant l'objet tenu et la Vitalité). */
export function applyTraits(mon: Pokemon, m: Mon): void {
  mon.mult.atk *= traitMult(m, 'atk');
  mon.mult.def *= traitMult(m, 'def');
  mon.mult.spAtk *= traitMult(m, 'spAtk');
  mon.mult.spDef *= traitMult(m, 'spDef');
  mon.mult.speed *= traitMult(m, 'speed');
  mon.boostMaxHp(traitMult(m, 'hp'));
  mon.hp = mon.maxHp;
}

/** Le talent total, ramené sur 5 étoiles (pour lire d'un coup d'œil qui est le plus doué). */
export const talentStars = (m: Mon): number => Math.round((TRAIT_STATS.reduce((s, k) => s + (m.iv[k] ?? 0), 0) / (TALENT_MAX * TRAIT_STATS.length)) * 5);

/** « Modeste (ATT.S +, ATT −) », ou le nom seul pour une nature neutre. */
export function natureText(id: NatureId): string {
  const n = NATURES[id] as { name: string; up?: NatureStat; down?: NatureStat };
  return n.up && n.down ? `${n.name} (${TRAIT_LABEL[n.up]} +, ${TRAIT_LABEL[n.down]} −)` : n.name;
}
