import { loadMove, type Move } from './moves';
import type { Fighter } from './damage';
import { growthOf, xpAt } from '../data/growth';
import { sheetOf } from '../data/bestiary';

// Un Pokémon en combat : stats, PV et capacités équipées, comme
// PokemonInstance.gd. Les stats d'attaque et de défense sont les stats de
// base de l'espèce, sans effet du niveau (get_effective_* : base × bonus) ;
// seuls les PV en dépendent.

export type Status = 'burn' | 'poison' | 'paralysis' | 'freeze' | 'sleep';

/** StatusFx.gd:12-20 : durée (s) et part des PV max perdue à chaque tic. */
export const STATUS: Record<Status, { duration: number; dot: number; label: string; color: string }> = {
  burn: { duration: 7, dot: 0.045, label: 'BRÛ', color: '#ff8a3a' },
  poison: { duration: 8, dot: 0.06, label: 'PSN', color: '#b56ae0' },
  paralysis: { duration: 5, dot: 0, label: 'PAR', color: '#f5d63a' },
  freeze: { duration: 3, dot: 0, label: 'GEL', color: '#8fe3ff' },
  sleep: { duration: 3, dot: 0, label: 'DOR', color: '#9aa6c8' },
};
/** PokemonInstance._DOT_INTERVAL */
const DOT_INTERVAL = 0.9;

/**
 * Stats modifiables en combat. `acc` (précision) et `eva` (esquive) jouent
 * sur les chances de toucher ; `crit` ajoute (mult − 1) aux chances de
 * critique. Un multiplicateur < 1 est une baisse (Rugissement, Grimace…).
 */
export type BuffStat = 'atk' | 'def' | 'spd' | 'acc' | 'eva' | 'crit';
export const BUFF_LABEL: Record<BuffStat, string> = { atk: 'ATT', def: 'DÉF', spd: 'VIT', acc: 'PRÉC', eva: 'ESQ', crit: 'CRIT' };

/**
 * XP cumulée pour atteindre le niveau n : selon le groupe de croissance de
 * l'espèce (data/growth.ts) ; le jeu n'avait que la courbe cubique, n³.
 */
export const xpForLevel = (n: number, id = 0) => xpAt(growthOf(id), n);
/** GameManager.XP_MULTIPLIER : un K.O. rapporte niveau × 12 points. */
export const XP_MULTIPLIER = 12;

/** GameManager.BASE_TEAM_LEVEL : niveau de l'équipe en début de run. */
export const BASE_TEAM_LEVEL = 10;
const MOVE_SLOTS = 4;

interface PokemonJson {
  name_fr?: string;
  types?: string[];
  stats?: Record<string, number>;
  level_up_moves?: { level: number; name: string }[];
  learnable_moves?: string[];
}

export class Pokemon implements Fighter {
  hp: number;
  private baseCrit = 0;
  status: Status | null = null;
  statusTime = 0;
  private dotTimer = 0;
  /**
   * Bonus temporaires (chant d'un soutien, EnemyAI.apply_buff) : un nouveau
   * bonus sur la même stat rafraîchit la durée sans s'empiler.
   * Écarts voulus avec le jeu, où ATT et DÉF ne touchaient que la paire
   * physique et VIT rien du tout : ici ATT renforce aussi l'Atq. Spé, DÉF la
   * Déf. Spé, et VIT accélère le déplacement.
   */
  readonly buffs = new Map<BuffStat, { mult: number; t: number }>();
  /**
   * Multiplicateurs permanents de la run (dons de statistique, PokemonInstance.*_mult) :
   * Attaque, Défense, Atq. Spé, Déf. Spé, Vitesse, portée, cadence ; et points
   * de critique et d'esquive ajoutés.
   */
  readonly mult = { atk: 1, def: 1, spAtk: 1, spDef: 1, speed: 1, range: 1, cooldown: 1, crit: 0, dodge: 0 };
  /** Augmente à chaque capacité apprise, remplacée ou renforcée : le HUD se reconstruit. */
  movesVersion = 0;

  private constructor(
    readonly id: number,
    readonly name: string,
    public level: number,
    readonly types: readonly string[],
    private readonly baseAttack: number,
    private readonly baseDefense: number,
    private readonly baseSpAttack: number,
    private readonly baseSpDefense: number,
    private readonly baseSpeed: number,
    private readonly baseHp: number,
    readonly moves: Move[],
    /** Toutes les capacités que l'espèce peut apprendre (PokemonData.learnable_moves). */
    readonly learnable: ReadonlySet<string>,
    /** Capacités apprises en montant de niveau (PokemonData.level_up_moves), pour les niveaux suivants. */
    private readonly levelUpMoves: readonly { level: number; name: string }[],
  ) {
    this.hp = this.maxHp;
    this.xp = xpForLevel(level, id);
  }

  /** Expérience cumulée (PokemonInstance.current_xp). */
  xp: number;
  /** Multiplicateur de PV max de la run (Masse, Carapace, Vol d'Ombre) : il survit aux montées de niveau. */
  private hpMult = 1;

  /** PokemonInstance._calc_max_hp, × le multiplicateur de la run. */
  get maxHp(): number {
    return Math.max(10, Math.floor(Math.floor((2 * this.baseHp * this.level) / 100 + this.level + 10) * this.hpMult));
  }

  /** Part de la barre d'XP vers le niveau suivant (0..1). */
  get xpRatio(): number {
    const from = xpForLevel(this.level, this.id);
    const to = xpForLevel(this.level + 1, this.id);
    return Math.max(0, Math.min(1, (this.xp - from) / Math.max(1, to - from)));
  }

  /**
   * PokemonInstance.add_xp : monte de niveau tant que l'XP dépasse le seuil du niveau suivant. Les PV
   * gardent leur proportion, et les capacités du nouveau niveau rejoignent les
   * emplacements libres (check_new_moves). Rend les niveaux gagnés.
   */
  async addXp(amount: number): Promise<number> {
    this.xp += amount;
    let gained = 0;
    while (this.xp >= xpForLevel(this.level + 1, this.id)) {
      const ratio = this.hp / this.maxHp;
      this.level++;
      this.hp = Math.max(1, Math.round(ratio * this.maxHp));
      gained++;
      for (const m of this.levelUpMoves.filter((x) => x.level === this.level)) {
        if (this.moves.length >= MOVE_SLOTS || this.moves.some((x) => x.api === m.name)) continue;
        const move = await loadMove(m.name, m.level);
        if (move && this.moves.length < MOVE_SLOTS) this.moves.push(move);
      }
    }
    if (gained) this.movesVersion++;
    return gained;
  }

  buff(stat: BuffStat): number {
    return this.buffs.get(stat)?.mult ?? 1;
  }

  get critChance(): number {
    return Math.min(0.6, this.baseCrit + this.mult.crit + this.buff('crit') - 1);
  }

  /** Chance d'esquiver un coup (Reflet…), plafonnée à 50 % comme PokemonInstance._DODGE_CAP. */
  get dodgeChance(): number {
    return Math.min(0.5, this.mult.dodge + this.buff('eva') - 1);
  }

  /** Stat de Vitesse (elle règle la cadence des capacités). */
  get speed(): number {
    return Math.floor(this.baseSpeed * this.mult.speed);
  }

  /** PokemonInstance.apply_hp_boost : les PV gagnés en max le sont aussi en PV courants. */
  boostMaxHp(factor: number): void {
    const before = this.maxHp;
    this.hpMult *= factor;
    this.hp = Math.min(this.maxHp, this.hp + Math.max(0, this.maxHp - before));
  }

  /** Chance qu'un coup de ce Pokémon rate (Jet de Sable, Brouillard…). */
  get missChance(): number {
    return 1 - this.buff('acc');
  }

  heal(pct: number): number {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + Math.max(1, Math.floor(this.maxHp * pct)));
    return this.hp - before;
  }

  get attack(): number {
    return Math.floor(this.baseAttack * this.mult.atk * this.buff('atk'));
  }
  get spAttack(): number {
    return Math.floor(this.baseSpAttack * this.mult.spAtk * this.buff('atk'));
  }
  get defense(): number {
    return Math.floor(this.baseDefense * this.mult.def * this.buff('def'));
  }
  get spDefense(): number {
    return Math.floor(this.baseSpDefense * this.mult.spDef * this.buff('def'));
  }

  applyBuff(stat: BuffStat, mult: number, duration: number): void {
    this.buffs.set(stat, { mult, t: duration });
  }

  tickBuffs(dt: number): void {
    for (const [stat, b] of this.buffs) {
      b.t -= dt;
      if (b.t <= 0) this.buffs.delete(stat);
    }
  }

  get fainted(): boolean {
    return this.hp <= 0;
  }

  /** Gelé ou endormi : ni déplacement ni attaque. */
  get canAct(): boolean {
    return this.status !== 'freeze' && this.status !== 'sleep';
  }

  /** Paralysie : vitesse de moitié ; bonus de VIT (soutien, Célérité). */
  get speedMult(): number {
    return (this.status === 'paralysis' ? 0.5 : 1) * this.buff('spd') * this.mult.speed;
  }

  /** Un statut actif n'est jamais écrasé (PokemonInstance.apply_status). `duration` : allongée par un don. */
  applyStatus(kind: Status, duration: number = STATUS[kind].duration): boolean {
    if (this.status || this.fainted) return false;
    this.status = kind;
    this.statusTime = duration;
    this.dotTimer = 0;
    return true;
  }

  /** Avance le statut ; rend les dégâts du tic (brûlure, poison), 0 sinon. */
  tickStatus(dt: number): number {
    if (!this.status) return 0;
    this.statusTime -= dt;
    if (this.statusTime <= 0) {
      this.status = null;
      return 0;
    }
    const dot = STATUS[this.status].dot;
    if (!dot) return 0;
    this.dotTimer += dt;
    if (this.dotTimer < DOT_INTERVAL) return 0;
    this.dotTimer -= DOT_INTERVAL;
    const dmg = Math.max(1, Math.floor(this.maxHp * dot));
    this.hp = Math.max(0, this.hp - dmg);
    return dmg;
  }

  /**
   * Charge la fiche de l'espèce et équipe le jeu de capacités par défaut.
   * `withMoves` : faux pour les sauvages, dont les fiches de capacités ne sont pas embarquées.
   */
  static async load(id: number, level: number = BASE_TEAM_LEVEL, withMoves = true): Promise<Pokemon> {
    const d: PokemonJson = await fetch(`/game/data/pokeapi/pokemon/${id}.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
    const s = d.stats ?? {};
    // Attaques imposées par le bestiaire (page de config), sinon celles apprises jusqu'au niveau.
    const imposed = withMoves ? sheetOf(id)?.moves : undefined;
    const learned = imposed?.length
      ? imposed.map((name) => ({ name, level: d.level_up_moves?.find((m) => m.name === name)?.level ?? 1 }))
      : withMoves
        ? (d.level_up_moves ?? []).filter((m) => m.level <= level)
        : [];
    const moves = (await Promise.all(learned.map((m) => loadMove(m.name, m.level)))).filter((m): m is Move => !!m);
    return new Pokemon(
      id,
      d.name_fr ?? `#${id}`,
      level,
      d.types?.length ? d.types : ['normal'],
      s.attack ?? 50,
      s.defense ?? 50,
      s['special-attack'] ?? 50,
      s['special-defense'] ?? 50,
      s.speed ?? 50,
      s.hp ?? 50,
      imposed?.length ? moves.slice(0, MOVE_SLOTS) : defaultLoadout(moves),
      new Set(d.learnable_moves ?? []),
      withMoves ? (d.level_up_moves ?? []) : [],
    );
  }
}

/**
 * GameManager.default_loadout : les attaques offensives d'abord, les plus
 * faibles en tête, puis le statut. Sans ça, un kit de départ fait de
 * Rugissement et de Charme laissait le Pokémon incapable d'attaquer.
 */
function defaultLoadout(moves: Move[]): Move[] {
  const unique = [...new Map(moves.map((m) => [m.api, m])).values()];
  unique.sort((a, b) => {
    if (a.power > 0 !== b.power > 0) return a.power > 0 ? -1 : 1;
    if (a.power === b.power) return a.api < b.api ? -1 : 1;
    return a.power - b.power;
  });
  return unique.slice(0, MOVE_SLOTS);
}
