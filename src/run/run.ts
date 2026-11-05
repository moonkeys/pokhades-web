import { Boons, DONORS, type DonorId } from '../combat/boons';
import { Rng, hash2 } from '../core/rng';
import { BIOME_CHAMPIONS, CHAMPIONS, type Champion } from '../data/champions';
import type { BiomeId } from '../data/species';
import type { CsId } from '../meta/catalog';
import { BIOMES } from '../world/biomes';
import { OPPOSITE, type Side } from '../world/generate';
import { VICTORY_ROAD, WORLD, WORLD_LINKS, type BiomeLink } from '../world/worldmap';
import { preEvolutionOf } from '../data/evolutions';
import { typeMates } from '../data/trainers';

// Structure d'une run, reprise de RunManager.gd : 4 actes de 7 salles (5
// combats, une boutique, un boss), un biome par acte. Les portes de sortie
// annoncent la récompense de la salle suivante, tirée sans remise (deux
// portes ne proposent jamais la même).
//
// Écart voulu : le jeu tirait les quatre biomes au départ, dans une liste par
// acte (RunManager._pool_for_act). Ici, chaque boss vaincu ouvre une porte
// par biome voisin sur la carte du monde (world/worldmap.ts), percée du côté
// où il se trouve, et c'est le joueur qui trace sa route ; certaines branches
// sont gardées par une CS. Une fois tous les champions vaincus, un cinquième
// acte s'ouvre au bout : la Route Victoire.
//
// Difficulté (retour de test : « au début, on galère ; une fois à six, on les
// éclate tous ; les boss deviennent trop faciles ») : le premier acte est
// doux et peu varié (cinq espèces de base en Prairie, pas d'itinérants ni de
// top dresseurs), puis chaque acte monte plus vite qu'avant — niveaux,
// effectifs, Pokémon venus d'ailleurs, sbires des champions — et les salles
// comptent la taille de l'équipe : six Pokémon affrontent plus de monde.

export const COMBATS_PER_ACT = 5;
export const ROOMS_PER_ACT = 7;
/** Actes d'une run ordinaire ; la Route Victoire en ajoute un. */
export const ACTS = 4;
export type { BiomeLink };
/** Les champions qu'il faut avoir vaincus pour ouvrir la Route Victoire : tous ceux des biomes. */
export const LEAGUE_GATE: readonly string[] = ['Blanche', 'Ondine', 'Major Bob', 'Erika', 'Pierre', 'Koga', 'Morgane', 'Auguste', 'Giovanni', 'Olga'];
/** Le Maître de la Ligue, au bout de la Route Victoire. */
export const LEAGUE_MASTER = 'Régis';
/** Le Conseil, qui rejoint les champions du dernier étage une fois la Route Victoire ouverte. */
const ELITE_BY_BIOME: Partial<Record<BiomeId, string>> = { rocailleux: 'Aldo', marais: 'Agatha', volcan: 'Peter', glace: 'Olga' };
/** Taille minimale de l'équipe d'un champion selon l'acte : on complète par des Pokémon de son type. */
const MIN_CHAMPION_TEAM = [2, 3, 4, 5, 6];
/** Repli si l'on dépasse le graphe (salle forcée au panneau) : un biome de fin. */
const LAST_BIOMES: BiomeId[] = ['marais', 'rocailleux', 'volcan', 'glace'];

/** RunManager : SKILL, BOON, LOOT (STAT n'est plus tiré). */
export type Reward = 'skill' | 'boon' | 'loot';
/** Sans symbole : l'icône de la récompense le précède (src/ui/rewardicons.ts). */
export const REWARD_LABEL: Record<Reward, string> = {
  skill: 'Nouvelle attaque',
  boon: "Don d'un légendaire",
  loot: 'Butin',
};
/** « Don d'Électhor », « Don de Mew » : l'étiquette d'un don dont on connaît le donateur. */
export const donorLabel = (donor: DonorId) => `Don ${/^[AEIOUÉÈÊ]/.test(DONORS[donor].name) ? "d'" : 'de '}${DONORS[donor].name}`;
/** Couleurs des récompenses (CombatArena.gd:5954-5958). */
export const REWARD_COLOR: Record<Reward, string> = { skill: '#b88ceb', boon: '#59d9f2', loot: '#8cd973' };
/** Poids de tirage des portes (RunManager.gd:53-57). */
const REWARD_WEIGHTS: [Reward, number][] = [
  ['boon', 6],
  ['skill', 3],
  ['loot', 2],
];

/**
 * Salles spéciales (ajout, absent du jeu Godot), proposées au choix des
 * portes, deux fois au plus par acte :
 * - Défi : les vagues d'une salle, contre la montre ; réussi, ₽ ×3 et un don ;
 *   raté, les sauvages s'enfuient avec le don (la salle paie ses ₽, sans plus) ;
 * - Piège : la récompense attend, seule, au centre ; s'en approcher déclenche
 *   une embuscade plus forte, et elle ne se prend qu'une fois la salle libérée ;
 * - Marchand : Miaouss propose un pari sur les ₽ et un don contre des PV.
 */
export type SpecialId = 'challenge' | 'trap' | 'merchant';
export const SPECIALS: Record<SpecialId, { name: string; glyph: string; color: string }> = {
  challenge: { name: 'Défi', glyph: '⏱', color: '#f2c14e' },
  trap: { name: 'Piège', glyph: '⚠', color: '#e8604c' },
  merchant: { name: 'Marchand ambulant', glyph: '¤', color: '#e0b25a' },
};
/** Chance qu'une porte devienne une salle spéciale, et plafond par acte. */
const SPECIAL_CHANCE = 0.35;
const SPECIALS_PER_ACT = 2;

/** Ce qu'annonce une porte : la récompense de la salle suivante, ou le boss. */
export interface ExitOffer {
  reward: Reward;
  label: string;
  /** Don d'un légendaire : le donateur, dont la porte montre le badge (src/ui/rewardicons.ts). */
  donor?: DonorId;
  /** Sortie de boss : le biome de l'acte suivant. */
  biome?: BiomeId;
  /** CS qui manque pour la prendre : la porte reste fermée. */
  locked?: CsId;
  /** Salle spéciale derrière la porte. */
  special?: SpecialId;
  /** La sortie de la carte où la porte est percée (rang dans WorldMap.exits). */
  exit?: number;
  /** Sortie de boss vers la Route Victoire. */
  victory?: boolean;
}

/** Ce que la run doit savoir du Repaire en partant. */
export interface RunSetup {
  /** Les CS apprises au départ, qui ouvrent les branches gardées. */
  cs?: readonly CsId[];
  /** Tous les champions vaincus : la Route Victoire s'ouvre (cinquième acte). */
  league?: boolean;
  /** Taille de l'équipe au départ : les salles et les boss en tiennent compte. */
  teamSize?: number;
}

export class Run {
  /** Index de la salle courante, de 0 à 27 (RunManager.rooms_cleared). */
  room = 0;
  /** ₽ de la run : gagnés en fin de salle, perdus à la fin de la run. */
  money = 0;
  /** Récompense promise par la porte qu'on a prise. */
  reward: Reward = 'boon';
  /** Donateur annoncé par cette porte, quand la récompense est un don. */
  donor: DonorId | undefined;
  /** Biome de chaque acte déjà décidé : le premier au départ, les suivants à la sortie de chaque boss. */
  readonly biomes: BiomeId[] = [];
  /** Champion de chaque acte décidé, assorti au biome ; celui du dernier acte est le Dresseur Final. */
  readonly champions: Champion[] = [];
  /** Champions déjà tirés dans la run. */
  private readonly faced = new Set<string>();
  /** Salle spéciale en cours (la porte prise l'annonçait), sinon null. */
  special: SpecialId | null = null;
  /** Salles spéciales prises à chaque acte, et la dernière (jamais deux pareilles de suite). */
  private readonly specialsTaken = [0, 0, 0, 0];
  private lastSpecial: SpecialId | null = null;
  /** Dons de légendaires et ultime de la run. */
  readonly boons = new Boons();
  /** Tirages de la run (biomes, portes, vagues, dons). */
  readonly rng: Rng;
  readonly cs: readonly CsId[];
  /** Actes de la run : 4, ou 5 quand la Route Victoire est ouverte. */
  readonly acts: number;
  readonly league: boolean;
  readonly teamSize: number;
  /** Bord par lequel on entre dans la salle courante : en face de la porte prise. */
  entrySide: Side = 'S';
  /** Rang de l'acte de la Route Victoire, -1 sans elle. */
  readonly victoryAct: number;

  /** `biomeOverride` : toute la run dans ce biome (panneau de réglages). */
  constructor(
    readonly seed: number,
    private readonly biomeOverride: BiomeId | null = null,
    setup: RunSetup = {},
  ) {
    this.rng = new Rng(seed * 7919 + 17);
    this.cs = setup.cs ?? [];
    this.league = Boolean(setup.league);
    this.acts = this.league ? ACTS + 1 : ACTS;
    this.victoryAct = this.league ? ACTS : -1;
    this.teamSize = Math.max(1, setup.teamSize ?? 1);
    this.pushAct(biomeOverride ?? 'prairie');
  }

  /** L'acte courant se joue sur la Route Victoire. */
  get onVictoryRoad(): boolean {
    return this.act === this.victoryAct;
  }

  /** Le nom du lieu de l'acte : son biome, ou la Route Victoire. */
  get placeName(): string {
    return this.onVictoryRoad ? VICTORY_ROAD.name : BIOMES[this.biome].name;
  }

  /**
   * Un acte de plus dans `biome`, avec son champion : RunManager._build_biome_sequence,
   * un champion du biome pas encore affronté dans la run. Écart voulu : sinon un
   * autre champion pas encore affronté, jamais le même deux fois (le jeu reprenait
   * n'importe lequel du biome : toute une run au Lac, c'était Ondine ×4).
   */
  private pushAct(biome: BiomeId): void {
    const pool = BIOME_CHAMPIONS[biome] ?? ['Blanche'];
    const fresh = pool.filter((n) => !this.faced.has(n));
    const others = Object.keys(CHAMPIONS).filter((n) => !this.faced.has(n));
    const name = this.rng.pick(fresh.length ? fresh : others.length ? others : pool);
    this.faced.add(name);
    this.biomes.push(biome);
    this.champions.push(CHAMPIONS[name]);
  }

  /** Branches ouvertes depuis le biome de l'acte courant (le biome forcé, s'il y en a un). */
  nextBiomes(): BiomeLink[] {
    this.ensureAct(this.act);
    return this.linksFrom(this.act);
  }

  /** La CS qui manque pour prendre cette branche, s'il en manque une. */
  missingCs(link: BiomeLink): CsId | undefined {
    return link.cs && !this.cs.includes(link.cs) ? link.cs : undefined;
  }

  /**
   * Un acte atteint sans passer par une porte de boss (salle forcée au
   * panneau) : son biome est tiré parmi les branches ouvertes.
   */
  private ensureAct(act: number): void {
    while (this.biomes.length <= act) {
      const open = this.linksFrom(this.biomes.length - 1).filter((l) => !this.missingCs(l));
      this.pushAct(this.rng.pick(open).to);
    }
  }

  private linksFrom(act: number): BiomeLink[] {
    if (this.biomeOverride) return [{ to: this.biomeOverride }];
    const from = this.biomes[act];
    const links = BIOME_LINKS[from];
    return links.length ? [...links] : LAST_BIOMES.filter((b) => b !== from).map((to) => ({ to }));
  }

  get champion(): Champion {
    this.ensureAct(this.act);
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
    this.ensureAct(this.act);
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
   * Nombre de portes : une seule vers la boutique ou en sortie de boutique
   * (RunManager.exit_count) ; en sortie de boss, une par biome voisin ;
   * sinon celles de la carte.
   */
  exitCount(available: number): number {
    const next = this.room + 1;
    if (this.isBoss() && !this.isFinal) return Math.min(this.nextBiomes().length, 3, available);
    if (this.isBoss() || this.isShop() || this.isShop(next)) return Math.min(1, available);
    return Math.min(3, available);
  }

  /**
   * RunManager.get_exits : une récompense par porte, sans remise. En sortie
   * de boss, chaque porte mène en plus à un biome voisin (dans le désordre) ;
   * si la carte a moins de portes que de branches, l'une au moins reste
   * ouverte (jamais rien que des portes gardées par une CS qu'on n'a pas).
   */
  offers(count: number, sides: readonly Side[] = []): ExitOffer[] {
    const pool = REWARD_WEIGHTS.flatMap(([r, w]) => Array<Reward>(w).fill(r));
    let links: BiomeLink[] = [];
    if (this.isBoss() && !this.isFinal) {
      const all = this.nextBiomes();
      for (let i = all.length - 1; i > 0; i--) {
        const j = this.rng.int(i + 1);
        [all[i], all[j]] = [all[j], all[i]];
      }
      links = all.slice(0, count);
      const open = all.find((l) => !this.missingCs(l));
      if (links.length && open && links.every((l) => this.missingCs(l))) links[links.length - 1] = open;
    }
    const exits = this.pickExits(count, sides, links);
    const out: ExitOffer[] = [];
    for (let i = 0; i < count && pool.length; i++) {
      const reward = this.rng.pick(pool);
      for (let j = pool.length - 1; j >= 0; j--) if (pool[j] === reward) pool.splice(j, 1);
      // Devant le boss, la porte l'annonce ; la récompense, tirée quand même, tombe après lui.
      const boss = this.isBoss(this.room + 1);
      // Le donateur est tiré dès la porte, pour qu'elle porte son badge (aucun : la récompense part en ₽).
      const donor = reward === 'boon' && !boss ? (this.boons.pickDonor(this.rng) ?? undefined) : undefined;
      const label = boss ? `${this.act >= ACTS - 1 ? '☠ DRESSEUR FINAL' : '☠ BOSS'} · ${this.champion.name}` : donor ? donorLabel(donor) : REWARD_LABEL[reward];
      const link = links[i];
      out.push({ reward, label, donor, biome: link?.to, locked: link && this.missingCs(link) });
    }
    // Une porte sur plusieurs peut mener à une salle spéciale : jamais vers la boutique ou le boss,
    // ni en ouvrant un acte, ni dans les deux premières salles (sauvages de niveau 4 à 8 : un Piège
    // y tirerait plan.level + TRAP_LEVELS), ni sans autre porte à côté (on doit pouvoir l'éviter).
    const next = this.room + 1;
    const fits = out.length >= 2 && next >= 2 && !this.isBoss() && !this.isShop(next) && !this.isBoss(next) && next % ROOMS_PER_ACT !== 0;
    if (fits && this.specialsTaken[this.act] < SPECIALS_PER_ACT && this.rng.chance(SPECIAL_CHANCE)) {
      const kinds = (Object.keys(SPECIALS) as SpecialId[]).filter((k) => k !== this.lastSpecial);
      const special = this.rng.pick(kinds);
      const i = out.length - 1;
      out[i] = this.specialOffer(special, out[i]);
    }
    return out;
  }

  /**
   * La porte d'une salle spéciale : le Défi promet un don, le Piège garde la
   * récompense que la porte promettait, le Marchand n'en a pas (ses offres la
   * remplacent).
   */
  specialOffer(special: SpecialId, base: ExitOffer): ExitOffer {
    const reward: Reward = special === 'challenge' ? 'boon' : special === 'merchant' ? 'loot' : base.reward;
    const donor = reward === 'boon' ? (base.donor ?? this.boons.pickDonor(this.rng) ?? undefined) : undefined;
    const prize = special === 'merchant' ? '' : ` · ${donor ? donorLabel(donor) : REWARD_LABEL[reward]}`;
    // Le Piège garde l'étiquette de la porte qu'il remplace : rien ne le trahit.
    if (special === 'trap') return { ...base, special };
    return { reward, donor, special, label: `${SPECIALS[special].name}${prize}` };
  }

  /**
   * Quelle sortie de la carte porte chaque offre (rang dans `sides`). En sortie de boss,
   * chaque route part du bord qui regarde son biome sur la carte du monde ; une porte
   * unique (vers la boutique, le boss) est celle d'en face de l'entrée, tout droit ;
   * sinon, dans l'ordre de la carte.
   */
  private pickExits(count: number, sides: readonly Side[], links: readonly BiomeLink[]): number[] {
    const order = sides.map((_, i) => i);
    if (!sides.length) return order.slice(0, count);
    if (links.length) {
      // Chaque route sur la sortie dont le bord regarde le mieux son biome : on essaie toutes
      // les répartitions (trois portes au plus, six façons) et l'on garde la moins tordue.
      const from = this.onVictoryRoad ? VICTORY_ROAD : WORLD[this.biome];
      const dirs = links.map((l) => (this.act + 1 === this.victoryAct ? { x: 0, y: -1 } : { x: WORLD[l.to].x - from.x, y: WORLD[l.to].y - from.y }));
      let best: number[] = order.slice(0, links.length);
      let bestCost = Infinity;
      for (const perm of permutations(order, links.length)) {
        const cost = perm.reduce((c, k, i) => c + sideCost(sides[k], dirs[i]), 0);
        if (cost < bestCost) [best, bestCost] = [perm, cost];
      }
      return best;
    }
    if (count === 1) {
      const ahead = sides.indexOf(OPPOSITE[this.entrySide]);
      return [ahead >= 0 ? ahead : 0];
    }
    return order.slice(0, count);
  }

  /** On a franchi une porte (RunManager.advance) ; en sortie de boss, elle décide du biome de l'acte suivant. */
  advance(offer: ExitOffer, side?: Side): void {
    this.room += 1;
    // On entre dans la salle suivante par le bord d'en face : sorti à l'est, on arrive à l'ouest.
    this.entrySide = side ? OPPOSITE[side] : 'S';
    if (offer.biome && this.biomes.length === this.act) this.pushAct(offer.biome);
    this.reward = offer.reward;
    this.donor = offer.donor;
    this.special = offer.special ?? null;
    if (this.special) {
      this.specialsTaken[this.act]++;
      this.lastSpecial = this.special;
    }
  }

  /**
   * Vagues de la salle (CombatArena.gd:1507-1658) : effectif par vague, nombre
   * de vagues, niveau. Les deux premières salles tirent un niveau de 4 à 8
   * par individu et alignent au moins 3 Pokémon par vague.
   */
  /** Niveau des sauvages d'une salle de combat (sans toucher au tirage, contrairement à waves()). */
  get roomLevel(): number {
    return 10 + Math.floor(this.room * 1.1) + this.act * 2;
  }

  /**
   * La salle cache-t-elle une grotte ? Jamais à la boutique, au boss ni dans
   * les deux premières salles (on n'a pas l'équipe pour un gardien) ; souvent
   * là où la roche domine (Rocailleux, Volcan), parfois dans les biomes à
   * plateaux. Tirage figé par la graine de la carte : la même salle a
   * toujours, ou jamais, sa grotte. generate() cherche ensuite une paroi où
   * creuser la bouche ; s'il n'en trouve pas, pas de grotte.
   * Écart voulu : le jeu n'en mettait qu'au Rocailleux.
   */
  hasCave(): boolean {
    if (this.isShop() || this.isBoss() || this.special || this.room < 2) return false;
    const biome = BIOMES[this.biome];
    const chance = this.biome === 'rocailleux' || this.biome === 'volcan' ? 0.55 : biome.mesas ? 0.2 : 0;
    return hash2(this.mapSeed, 0, 9137) < chance;
  }

  waves(): { perWave: number; count: number; level: number; early: boolean } {
    const combatIdx = this.act * COMBATS_PER_ACT + (this.room % ROOMS_PER_ACT);
    const early = this.room < 2;
    let perWave = Math.min(5, Math.max(1, 1 + Math.floor(combatIdx * 0.75)));
    if (early) perWave = Math.max(3, perWave);
    const count = Math.min(5, Math.max(2, 2 + Math.floor(combatIdx / 5))) + this.rng.int(2);
    return { perWave, count, level: this.roomLevel, early };
  }

  /** Vivier de la salle : les 9 premières espèces du biome en début d'acte, les 18 ensuite. */
  fauna(): number[] {
    const all = BIOMES[this.biome].fauna;
    return this.room % ROOMS_PER_ACT < 2 ? all.slice(0, 9) : [...all];
  }
}
