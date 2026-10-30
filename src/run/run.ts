import { Boons } from '../combat/boons';
import { Rng } from '../core/rng';
import { BIOME_CHAMPIONS, CHAMPIONS, type Champion } from '../data/champions';
import type { BiomeId } from '../data/species';
import { BIOMES } from '../world/biomes';

// Structure d'une run, reprise de RunManager.gd : 4 actes de 7 salles (5
// combats, une boutique, un boss), un biome par acte tiré au début de la run,
// jamais deux actes de suite dans le même. Les portes de sortie annoncent la
// récompense de la salle suivante, tirée sans remise (deux portes ne
// proposent jamais la même).

export const COMBATS_PER_ACT = 5;
export const ROOMS_PER_ACT = 7;
export const ACTS = 4;

/** RunManager.gd:211-216 : biomes possibles par acte. Plage et Océan n'existent pas dans le jeu, ils n'y sont pas. */
const ACT_BIOMES: BiomeId[][] = [['prairie'], ['foret', 'automne', 'lac'], ['marais', 'lac', 'automne', 'village'], ['rocailleux', 'marais', 'volcan']];

/** RunManager : SKILL, BOON, LOOT (STAT n'est plus tiré). */
export type Reward = 'skill' | 'boon' | 'loot';
export const REWARD_LABEL: Record<Reward, string> = {
  skill: '✦ Nouvelle attaque',
  boon: "★ Don d'un légendaire",
  loot: '₽ Butin',
};
/** Couleurs des récompenses (CombatArena.gd:5954-5958). */
export const REWARD_COLOR: Record<Reward, string> = { skill: '#b88ceb', boon: '#59d9f2', loot: '#8cd973' };
/** Poids de tirage des portes (RunManager.gd:53-57). */
const REWARD_WEIGHTS: [Reward, number][] = [
  ['boon', 6],
  ['skill', 3],
  ['loot', 2],
];

/** Ce qu'annonce une porte : la récompense de la salle suivante, ou le boss. */
export interface ExitOffer {
  reward: Reward;
  label: string;
}

export class Run {
  /** Index de la salle courante, de 0 à 27 (RunManager.rooms_cleared). */
  room = 0;
  /** ₽ de la run : gagnés en fin de salle, perdus à la fin de la run. */
  money = 0;
  /** Récompense promise par la porte qu'on a prise. */
  reward: Reward = 'boon';
  readonly biomes: BiomeId[];
  /** Champion de chaque acte, assorti au biome ; le dernier est le Dresseur Final. */
  readonly champions: Champion[];
  /** Dons de légendaires et ultime de la run. */
  readonly boons = new Boons();
  /** Tirages de la run (biomes, portes, vagues, dons). */
  readonly rng: Rng;

  constructor(readonly seed: number, biomeOverride: BiomeId | null = null) {
    this.rng = new Rng(seed * 7919 + 17);
    const biomes: BiomeId[] = [];
    for (let act = 0; act < ACTS; act++) {
      const pool = ACT_BIOMES[act].filter((b) => b !== biomes[act - 1]);
      biomes.push(biomeOverride ?? this.rng.pick(pool));
    }
    this.biomes = biomes;
    // RunManager._build_biome_sequence : un champion du biome pas encore affronté dans la run.
    // Écart voulu : sinon un autre champion pas encore affronté, jamais le même deux fois
    // (le jeu reprenait n'importe lequel du biome : toute une run au Lac, c'était Ondine ×4).
    const faced = new Set<string>();
    this.champions = biomes.map((biome) => {
      const pool = BIOME_CHAMPIONS[biome] ?? ['Blanche'];
      const fresh = pool.filter((n) => !faced.has(n));
      const others = Object.keys(CHAMPIONS).filter((n) => !faced.has(n));
      const name = this.rng.pick(fresh.length ? fresh : others.length ? others : pool);
      faced.add(name);
      return CHAMPIONS[name];
    });
  }

  get champion(): Champion {
    return this.champions[this.act];
  }

  /**
   * Vagues d'une salle de boss (CombatArena.gd:1557-1620) : une par Pokémon
   * du champion, dans l'ordre, l'as en dernier ; chacun escorté de 3 + acte
   * sbires de sa forme de base, 6 niveaux en dessous.
   */
  bossWaves(): { id: number; level: number; role: 'wild' | 'champion' | 'boss' }[][] {
    const team = this.champion.team;
    return team.map(([final, base], w) => {
      // RunManager.boss_wave_level
      const level = 18 + Math.floor(this.room * 0.7) + Math.floor(w * 1.4);
      const wave: { id: number; level: number; role: 'wild' | 'champion' | 'boss' }[] = [{ id: final, level, role: w === team.length - 1 ? 'boss' : 'champion' }];
      if (base !== final) for (let i = 0; i < 3 + this.act; i++) wave.push({ id: base, level: Math.max(1, level - 6), role: 'wild' });
      return wave;
    });
  }

  get act(): number {
    return Math.min(ACTS - 1, Math.floor(this.room / ROOMS_PER_ACT));
  }
  get biome(): BiomeId {
    return this.biomes[this.act];
  }
  isShop(room = this.room): boolean {
    return room % ROOMS_PER_ACT === COMBATS_PER_ACT;
  }
  isBoss(room = this.room): boolean {
    return room % ROOMS_PER_ACT === ROOMS_PER_ACT - 1;
  }
  get isFinal(): boolean {
    return this.isBoss() && this.act >= ACTS - 1;
  }
  /** Première salle d'un acte dont le biome change : on l'annonce en grand. */
  get isBiomeEntry(): boolean {
    return this.room % ROOMS_PER_ACT === 0 && (this.room === 0 || this.biomes[this.act - 1] !== this.biome);
  }
  /** Graine de la carte de la salle courante. */
  get mapSeed(): number {
    return this.seed * 101 + this.room;
  }

  /** « Prairie — Acte 1 · Salle 3/5 », « … · Boutique », « … · Boss » (CombatArena._zone_label). */
  get zoneLabel(): string {
    const name = BIOMES[this.biome].name;
    const act = `Acte ${this.act + 1}`;
    if (this.isShop()) return `${name} — ${act} · Boutique`;
    if (this.isBoss()) return `${name} — ${act} · ${this.isFinal ? 'DRESSEUR FINAL' : 'Boss'}`;
    return `${name} — ${act} · Salle ${(this.room % ROOMS_PER_ACT) + 1}/${COMBATS_PER_ACT}`;
  }

  /** CombatArena.room_reward : ₽ gagnés en libérant la salle. */
  get roomGold(): number {
    return 35 + this.room * 6;
  }

  /**
   * Nombre de portes : une seule en sortie de boss, vers la boutique ou en
   * sortie de boutique (RunManager.exit_count) ; sinon celles de la carte.
   */
  exitCount(available: number): number {
    const next = this.room + 1;
    if (this.isBoss() || this.isShop() || this.isShop(next)) return Math.min(1, available);
    return Math.min(3, available);
  }

  /** RunManager.get_exits : une récompense par porte, sans remise. */
  offers(count: number): ExitOffer[] {
    const pool = REWARD_WEIGHTS.flatMap(([r, w]) => Array<Reward>(w).fill(r));
    const out: ExitOffer[] = [];
    for (let i = 0; i < count && pool.length; i++) {
      const reward = this.rng.pick(pool);
      for (let j = pool.length - 1; j >= 0; j--) if (pool[j] === reward) pool.splice(j, 1);
      // Devant le boss, la porte l'annonce ; la récompense, tirée quand même, tombe après lui.
      const label = this.isBoss(this.room + 1) ? `${this.act >= ACTS - 1 ? '☠ DRESSEUR FINAL' : '☠ BOSS'} · ${this.champion.name}` : REWARD_LABEL[reward];
      out.push({ reward, label });
    }
    return out;
  }

  /** On a franchi une porte (RunManager.advance). */
  advance(offer: ExitOffer): void {
    this.room += 1;
    this.reward = offer.reward;
  }

  /**
   * Vagues de la salle (CombatArena.gd:1507-1658) : effectif par vague, nombre
   * de vagues, niveau. Les deux premières salles tirent un niveau de 4 à 8
   * par individu et alignent au moins 3 Pokémon par vague.
   */
  waves(): { perWave: number; count: number; level: number; early: boolean } {
    const combatIdx = this.act * COMBATS_PER_ACT + (this.room % ROOMS_PER_ACT);
    const early = this.room < 2;
    let perWave = Math.min(5, Math.max(1, 1 + Math.floor(combatIdx * 0.75)));
    if (early) perWave = Math.max(3, perWave);
    const count = Math.min(5, Math.max(2, 2 + Math.floor(combatIdx / 5))) + this.rng.int(2);
    const level = 10 + Math.floor(this.room * 1.1) + this.act * 2;
    return { perWave, count, level, early };
  }

  /** Vivier de la salle : les 9 premières espèces du biome en début d'acte, les 18 ensuite. */
  fauna(): number[] {
    const all = BIOMES[this.biome].fauna;
    return this.room % ROOMS_PER_ACT < 2 ? all.slice(0, 9) : [...all];
  }
}
