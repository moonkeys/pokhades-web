import { sfx } from '../audio/audio';
import type { Rng } from '../core/rng';
import type { Actor } from '../entities/actor';
import { typeColor, withAlpha } from '../render/combatfx';
import type { Run } from '../run/run';
import type { WorldMap } from '../world/generate';
import { TILE } from '../world/tiles';
import { RARITY_SCALE, STAT_BOONS, statGain, ULT_MAX, ULT_POWER_MULT, type Boons, type DonorId, DONORS } from './boons';
import { TYPE_CHART, typeMultiplier } from './damage';
import { STATUS, type Status } from './pokemon';

// Effets des dons, branchés aux points d'accroche de RunBoons.gd :
// dmg_mult_out / dmg_mult_in, cooldown_mult, reach_mult, on_hit (et sa branche
// finisher), on_dash, on_kill, on_take_damage, tick, on_room_enter,
// on_room_clear, plus les nappes au sol (BoonZone.gd) et les ultimes.
//
// Écarts voulus avec le jeu (bugs relevés, PORTAGE.md D7) :
// - Orage et Racines : une rareté plus haute raccourcit la période ou
//   l'immobilité requise, au lieu de l'allonger ;
// - Chaudron et Hiver Perpétuel allongent aussi les statuts infligés par les
//   coups normaux (le jeu ne les appliquait qu'aux effets de dons) ;
// - Ascendant cumule réellement un kill après l'autre ;
// - Dette double les dégâts avant que l'Armure de Givre n'absorbe ;
// - Phénix ne rend jamais plus que les PV max, l'Armure n'absorbe pas plus que tout.
//
// Écart voulu, retour du 27 novembre 2026 (« les dons, je préfère que ça aille pour toute l'équipe ;
// sinon c'est compliqué quand on joue en multi ») : le jeu Godot, puis ce portage, ne faisaient
// agir les dons qu'aux coups du Pokémon mené, et les dons de statistique sur lui seul. Maintenant
// chaque membre de l'équipe les porte : ses coups, ses finishers, ses K.O. et les coups qu'il encaisse
// déclenchent les dons, compagnons de l'IA comme invités en ligne. Ce qui se compte « une fois par
// salle » ou « tous les N coups » se compte par Pokémon (Guard) : le Phénix de l'un ne manque pas
// à l'autre. Restent communs la jauge d'ultime, l'Orage et les compteurs de la salle (Boons).

/** Ce dont les effets ont besoin du combat (dégâts de don, recul, recharges). */
export interface BoonHost {
  boonDamage(e: Actor, damage: number, color: string, fromX: number, fromY: number): void;
  stagger(e: Actor, fromX: number, fromY: number, force: number): void;
  /** Recharges et verrous de ce membre à zéro (Vrille, Voyage, Racines). */
  resetCooldowns(a: Actor): void;
  /** Toute l'équipe sur le terrain, Pokémon mené en tête (Lien Psychique). */
  team(): readonly Actor[];
  addShake(amount: number): void;
  notify(text: string): void;
  fx: {
    impact(x: number, y: number, color: string): void;
    attackAnim(type: string, x: number, y: number): void;
    number(kind: 'heal' | 'buff' | 'dodge', x: number, y: number, amount?: number, text?: string): void;
  };
}

interface Zone {
  x: number;
  y: number;
  r: number;
  t: number;
  dur: number;
  pulse: number;
  kind: 'damage' | 'slow';
  value: number;
  color: string;
  /** Le don qui l'a posée (compteur du banc). */
  id: string;
}

/** Ce qui se compte pour chaque Pokémon de l'équipe, remis à neuf à chaque salle. */
interface Guard {
  /** Temps depuis le dernier coup encaissé : Sève, Armure de Givre. */
  sinceHurt: number;
  shieldReady: boolean;
  phoenix: boolean;
  wish: boolean;
  /** Coups portés dans la salle : Décharge Statique (tous les 10), Continent (tous les 5). */
  hits: number;
  regenAcc: number;
  stillT: number;
  stillLatched: boolean;
  /** Positions et PV des 4 dernières secondes, à 10 Hz (Rembobinage). */
  history: { x: number; y: number; hp: number }[];
  historyT: number;
  rewindCd: number;
}

/** Une nappe frappe ce qu'elle couvre toutes les 0,5 s (BoonZone.gd:23). */
const ZONE_PULSE = 0.5;
/** Le dash balaie un segment de 4,2 cases, sur 2 de part et d'autre (RB:589-592). */
const DASH_REACH = 4.2;
const DASH_HALF_WIDTH = 2;

export class BoonHooks {
  private zones: Zone[] = [];
  private guards = new Map<Actor, Guard>();

  constructor(
    private readonly host: BoonHost,
    private readonly run: () => Run | null,
  ) {}

  private get boons(): Boons | null {
    return this.run()?.boons ?? null;
  }

  /** Nouvelle salle : nappes éteintes, compteurs de chaque Pokémon remis à neuf (bouclier, Phénix, Souhait…). */
  reset(): void {
    this.zones = [];
    this.guards.clear();
  }

  private guard(a: Actor): Guard {
    let g = this.guards.get(a);
    if (!g) this.guards.set(a, (g = { sinceHurt: 0, shieldReady: true, phoenix: false, wish: false, hits: 0, regenAcc: 0, stillT: 0, stillLatched: false, history: [], historyT: 0, rewindCd: 0 }));
    return g;
  }

  /** Puissance de base : celle de la 1re capacité, 40 par défaut (RB:1695). */
  private basePower(player: Actor): number {
    const p = player.pokemon?.moves[0]?.power ?? 0;
    return p > 0 ? p : 40;
  }

  private statusMult(kind: Status): number {
    const b = this.boons;
    if (!b) return 1;
    if (kind === 'burn' && b.has('feu_cauldron')) return (b.fire('feu_cauldron'), b.v('feu_cauldron'));
    if (kind === 'freeze' && b.has('duo_winter')) return (b.fire('duo_winter'), b.v('duo_winter'));
    return 1;
  }

  /**
   * Inflige un statut, durée allongée par Chaudron ou Hiver Perpétuel. `force` (le gel et le
   * sommeil d'un don) remplace un statut moins fort déjà posé, brûlure, poison ou paralysie :
   * sans ça, la brûlure d'une attaque Feu rendait Souffle Gelé muet. Un Pokémon de champion
   * reste gelé ou endormi deux fois moins longtemps : un don ne doit pas figer un boss.
   */
  inflict(e: Actor, kind: Status, force = false): boolean {
    const mon = e.pokemon;
    if (!mon || mon.fainted) return false;
    const hard = kind === 'freeze' || kind === 'sleep';
    if (force && hard && mon.status && mon.status !== 'freeze' && mon.status !== 'sleep') mon.status = null;
    const boss = e.role !== 'wild' && hard ? 0.5 : 1;
    return mon.applyStatus(kind, STATUS[kind].duration * this.statusMult(kind) * boss);
  }

  /** Inflige un statut au nom d'un don, et le note s'il a pris. */
  private inflictBy(id: string, e: Actor, kind: Status): void {
    if (this.inflict(e, kind)) this.boons?.fire(id);
  }

  /** Dégâts d'un don, notés pour lui. */
  private hitBy(id: string, e: Actor, damage: number, color: string, fromX: number, fromY: number): void {
    this.boons?.fire(id);
    this.host.boonDamage(e, Math.max(1, Math.round(damage)), color, fromX, fromY);
  }

  private around(enemies: readonly Actor[], x: number, y: number, r: number, except?: Actor): Actor[] {
    return enemies.filter((e) => e !== except && e.pokemon && !e.pokemon.fainted && e.deathT < 0 && Math.hypot(e.x - x, e.y - y) <= r);
  }

  private nearest(enemies: readonly Actor[], x: number, y: number, r: number, except?: Actor): Actor | null {
    let best: Actor | null = null;
    let bestD = r;
    for (const e of this.around(enemies, x, y, r, except)) {
      const d = Math.hypot(e.x - x, e.y - y);
      if (d <= bestD) {
        best = e;
        bestD = d;
      }
    }
    return best;
  }

  /** Morphing : une attaque Normal prend le type le plus efficace contre la cible. */
  morph(type: string, target: Actor): string {
    if (type !== 'normal' || !this.boons?.has('psy_morph') || !target.pokemon) return type;
    this.boons.fire('psy_morph');
    let best = type;
    let bestMult = typeMultiplier(type, target.pokemon.types);
    for (const t of Object.keys(TYPE_CHART)) {
      const m = typeMultiplier(t, target.pokemon.types);
      if (m > bestMult) {
        best = t;
        bestMult = m;
      }
    }
    return best;
  }

  /** dmg_mult_out : multiplicateur des dégâts du joueur contre cette cible. */
  dmgOut(player: Actor, target: Actor): number {
    const b = this.boons;
    if (!b) return 1;
    let m = 1;
    const st = target.pokemon?.status;
    if (st === 'paralysis' && b.has('elec_network')) (m *= 1 + b.v('elec_network'), b.fire('elec_network'));
    if (st === 'freeze' && b.has('glace_shatter')) (m *= 1 + b.v('glace_shatter'), b.fire('glace_shatter'));
    if (st === 'sleep' && b.has('tenb_sleep')) m *= 1.5;
    if (b.has('tenb_steal')) (m *= 1 + b.v('tenb_steal'), b.fire('tenb_steal'));
    if (b.has('tenb_lastbreath') && this.low(player)) (m *= 1 + b.v('tenb_lastbreath'), b.fire('tenb_lastbreath'));
    if (b.sacrifice > 0) (m *= 1 + b.v('duo_sacrifice') * b.sacrifice, b.fire('duo_sacrifice'));
    return m;
  }

  /** Empathie : facteur des coups des compagnons. */
  companionMult(): number {
    const b = this.boons;
    if (!b?.has('psy_empathy')) return 1;
    b.fire('psy_empathy');
    return 1 + b.v('psy_empathy');
  }

  /** Sacrifice : un compagnon vient de tomber. */
  onCompanionDown(): void {
    const b = this.boons;
    if (!b?.has('duo_sacrifice')) return;
    b.sacrifice++;
    this.host.notify('Sacrifice : tu absorbes sa force.');
  }

  private low(player: Actor): boolean {
    const mon = player.pokemon;
    return !!mon && mon.hp / mon.maxHp < 0.3;
  }

  /** Partage d'XP acheté au Repaire (+20 % par niveau), posé par main.ts au départ de la run. */
  metaXp = 1;
  /** Charges de dash achetées au Repaire, en plus de la première. */
  metaDash = 0;

  /** Cendres : plus d'XP par ennemi vaincu. */
  xpMult(): number {
    if (this.boons?.has('sacre_xp')) this.boons.fire('sacre_xp');
    return (1 + (this.boons?.v('sacre_xp') ?? 0)) * this.metaXp;
  }

  reachMult(player: Actor): number {
    return (1 + (this.boons?.v('sol_reach') ?? 0)) * (player.pokemon?.mult.range ?? 1);
  }

  cooldownMult(player: Actor): number {
    const b = this.boons;
    let m = player.pokemon?.mult.cooldown ?? 1;
    if (!b) return m;
    if (b.has('temps_cooldown')) m *= Math.max(0.25, 1 - b.v('temps_cooldown'));
    if (b.has('tenb_lastbreath') && this.low(player)) m *= 0.7;
    if (b.has('dragon_delta') && player.moving) (m *= Math.max(0.25, 1 - b.v('dragon_delta')), b.fire('dragon_delta'));
    return m;
  }

  /** Dash : invulnérabilité prolongée par Ombre Portée (0,3 s au Commun, 0,72 s au Prismatique). */
  dashGrace(): number {
    return this.boons?.v('tenb_phase') ?? 0;
  }

  /**
   * on_hit : un coup d'un membre de l'équipe a porté (`ranged` : tir). Les rebonds de Surtension et
   * les tirs d'Écho n'y passent pas (Combat les résout comme des tirs, sans redéclencher on_hit).
   */
  onHit(player: Actor, target: Actor, damage: number, ranged: boolean, enemies: readonly Actor[]): void {
    const b = this.boons;
    const run = this.run();
    if (!b || !run || !player.pokemon) return;
    b.ultGauge = Math.min(ULT_MAX, b.ultGauge + damage);
    const g = this.guard(player);
    g.hits++;
    const ricochet = ranged ? 0 : b.v('elec_ricochet');
    if (ricochet > 0) {
      const other = this.nearest(enemies, target.x, target.y, 5.5, target);
      if (other) {
        this.hitBy('elec_ricochet', other, damage * ricochet, typeColor('electric'), target.x, target.y);
        if (b.has('duo_firestorm')) this.inflictBy('duo_firestorm', other, 'burn');
      }
    }
    if (b.has('elec_static') && g.hits % 10 === 0) {
      for (const e of this.around(enemies, player.x, player.y, 6)) {
        this.hitBy('elec_static', e, damage * b.v('elec_static'), typeColor('electric'), player.x, player.y);
        this.inflict(e, 'paralysis');
      }
      this.host.fx.attackAnim('electric', player.x, player.y);
    }
    const st = target.pokemon?.status;
    if (st === 'burn' && b.has('feu_poise')) (this.host.stagger(target, player.x, player.y, 1.7), b.fire('feu_poise'));
    if (st === 'freeze' && b.has('glace_shatter')) {
      const n = this.nearest(enemies, target.x, target.y, 4, target);
      if (n) this.inflict(n, 'freeze', true);
    }
    if (st === 'freeze' && b.has('duo_whitebolt')) {
      for (const e of this.around(enemies, target.x, target.y, 5)) {
        this.hitBy('duo_whitebolt', e, damage * b.v('duo_whitebolt'), typeColor('electric'), target.x, target.y);
        this.inflict(e, 'paralysis');
      }
    }
    const tmon = target.pokemon;
    // Ni Zéro Absolu ni Exécution sur un Pokémon de champion : ils bloquaient ou achevaient un boss à mi-vie.
    if (tmon && target.role === 'wild' && b.has('glace_execute') && tmon.hp / tmon.maxHp < b.v('glace_execute') && this.inflict(target, 'freeze', true)) b.fire('glace_execute');
    if (ranged && b.has('glace_hail')) (this.zone(target.x, target.y, 3.4, 5, 'slow', Math.min(0.85, b.v('glace_hail')), typeColor('ice'), 'glace_hail'), b.fire('glace_hail'));
    // Continent : une faille qui frappe trois fois en 1,5 s (elle durait 4 s, huit pulsations : la
    // revue du 27 novembre 2026 la mesurait au double des dégâts du Pokémon à elle seule).
    if (b.has('sol_continent') && g.hits % 5 === 0) this.zone(target.x, target.y, 3, 1.5, 'damage', Math.max(1, Math.round(damage * b.v('sol_continent'))), typeColor('ground'), 'sol_continent');
    const heal = damage * (b.v('psy_transfer') + b.v('sacre_lifesteal'));
    if (heal > 0) {
      if (b.has('psy_transfer')) b.fire('psy_transfer');
      if (b.has('sacre_lifesteal')) b.fire('sacre_lifesteal');
      this.heal(player, heal);
    }
    if (b.has('astre_coin') && Math.random() < b.v('astre_coin')) {
      b.fire('astre_coin');
      const gold = Math.max(1, Math.round(damage * 0.5));
      run.money += gold;
      this.host.fx.number('buff', target.x, target.y, 0, `+${gold} ₽`);
    }
  }

  /** Branche finisher d'on_hit : appelée une fois par finisher qui porte, sur la cible principale. */
  onFinisher(player: Actor, target: Actor, damage: number, enemies: readonly Actor[]): void {
    const b = this.boons;
    const mon = player.pokemon;
    if (!b || !mon) return;
    if (b.has('elec_finisher')) for (const e of this.around(enemies, target.x, target.y, b.v('elec_finisher'))) this.inflictBy('elec_finisher', e, 'paralysis');
    if (b.has('feu_finisher')) for (const e of this.around(enemies, target.x, target.y, b.v('feu_finisher'))) this.inflictBy('feu_finisher', e, 'burn');
    if (b.has('glace_finisher')) {
      const slow = Math.max(0.25, 1 - b.v('glace_finisher'));
      for (const e of this.around(enemies, target.x, target.y, Infinity)) e.pokemon!.applyBuff('spd', slow, 4);
      this.host.fx.attackAnim('ice', target.x, target.y);
      b.fire('glace_finisher');
    }
    const tmon = target.pokemon;
    if (tmon && !tmon.fainted && target.role === 'wild' && b.has('tenb_execute') && tmon.hp / tmon.maxHp < b.v('tenb_execute')) {
      this.hitBy('tenb_execute', target, tmon.hp, typeColor('dark'), player.x, player.y);
    }
    if (b.has('sol_finisher')) {
      for (const e of this.around(enemies, target.x, target.y, 5)) {
        this.hitBy('sol_finisher', e, damage * b.v('sol_finisher'), typeColor('ground'), target.x, target.y);
        this.host.stagger(e, target.x, target.y, 1.7);
      }
    }
    if (b.has('duo_eruption')) {
      for (const e of this.around(enemies, target.x, target.y, b.v('duo_eruption'))) {
        this.inflictBy('duo_eruption', e, 'burn');
        this.host.stagger(e, target.x, target.y, 2.6);
      }
    }
    if (b.has('temps_finisher')) (this.host.resetCooldowns(player), b.fire('temps_finisher'));
    // Lien Psychique : les autres membres relancent tout de suite (le jeu faisait attaquer les
    // compagnons d'un coup ; recharger leurs capacités laisse leur IA choisir la cible et l'attaque).
    // Le finisher d'un compagnon recharge aussi le Pokémon mené.
    if (b.has('psy_finisher')) {
      for (const c of this.host.team()) {
        if (c === player || c.deathT >= 0) continue;
        this.host.resetCooldowns(c);
        this.host.fx.attackAnim('psychic', c.x, c.y);
      }
      b.fire('psy_finisher');
    }
    if (b.has('sacre_finisher')) (this.heal(player, mon.maxHp * b.v('sacre_finisher')), b.fire('sacre_finisher'));
    // Fortune : une part de la jauge d'ultime (même sans ultime équipée : elle sera prête).
    if (b.has('astre_finisher')) (b.ultGauge = Math.min(ULT_MAX, b.ultGauge + ULT_MAX * b.v('astre_finisher')), b.fire('astre_finisher'));
    if (b.has('dragon_finisher')) (player.dashCharges = Math.min(player.dashMax, player.dashCharges + 1), b.fire('dragon_finisher'));
  }

  /** on_dash : le segment balayé par le dash frappe, paralyse, brûle ou gèle. */
  onDashStart(player: Actor, dx: number, dy: number, enemies: readonly Actor[]): void {
    const b = this.boons;
    if (!b) return;
    if (b.has('temps_rewind')) this.rewind(player, b, this.guard(player));
    const hitters = ['elec_dash', 'feu_dash', 'glace_dash', 'sol_dash', 'dragon_dash_hit'].filter((id) => b.has(id));
    if (!hitters.length) return;
    for (const e of this.around(enemies, player.x, player.y, DASH_REACH + DASH_HALF_WIDTH)) {
      // Projection sur l'axe du dash : devant, et pas trop sur le côté.
      const rx = e.x - player.x;
      const ry = e.y - player.y;
      const along = rx * dx + ry * dy;
      const side = Math.abs(rx * dy - ry * dx);
      if (along < -0.5 || along > DASH_REACH || side > DASH_HALF_WIDTH) continue;
      if (b.has('elec_dash')) this.inflictBy('elec_dash', e, 'paralysis');
      if (b.has('feu_dash')) this.inflictBy('feu_dash', e, 'burn');
      if (b.has('glace_dash') && this.inflict(e, 'freeze', true)) b.fire('glace_dash');
      const dmg = this.basePower(player) * (b.v('sol_dash') + b.v('dragon_dash_hit'));
      if (dmg > 0) {
        if (b.has('dragon_dash_hit')) b.fire('dragon_dash_hit');
        this.hitBy(b.has('sol_dash') ? 'sol_dash' : 'dragon_dash_hit', e, dmg, typeColor(b.has('sol_dash') ? 'ground' : 'dragon'), player.x, player.y);
      }
      if (b.has('sol_dash')) this.host.stagger(e, player.x, player.y, 1.7);
    }
  }

  /**
   * Rembobinage : position et PV d'il y a 3 s. Revue du 27 novembre 2026 : il jouait à chaque
   * dash, donc plus aucun dash n'avançait (on revenait en arrière à chaque fois), et il pouvait
   * faire perdre des PV soignés depuis. Il ne joue plus que si on avait plus de PV il y a 3 s,
   * une fois toutes les 8 s : un vrai « retour en arrière » après un coup encaissé.
   * Un invité en ligne mène sa position chez lui : il ne retrouve que ses PV.
   */
  private rewind(player: Actor, b: Boons, g: Guard): void {
    const past = g.history[Math.max(0, g.history.length - 30)];
    const mon = player.pokemon;
    if (!past || !mon || g.rewindCd > 0 || past.hp <= mon.hp) return;
    g.rewindCd = 8;
    if (!player.remote) {
      player.x = player.prevX = past.x;
      player.y = player.prevY = past.y;
    }
    mon.hp = Math.min(mon.maxHp, past.hp);
    this.host.fx.attackAnim('grass', player.x, player.y);
    b.fire('temps_rewind');
  }

  onKill(player: Actor, e: Actor, enemies: readonly Actor[]): void {
    const b = this.boons;
    if (!b) return;
    b.roomKills++;
    if (b.has('feu_kill')) for (const n of this.around(enemies, e.x, e.y, b.v('feu_kill'), e)) this.inflictBy('feu_kill', n, 'burn');
    if (b.has('duo_shortcircuit')) for (const n of this.around(enemies, e.x, e.y, b.v('duo_shortcircuit'), e)) this.inflictBy('duo_shortcircuit', n, 'paralysis');
    // Vide : l'ombre ronge 0,2 × la puissance à chaque pulsation (0,3 avant la revue du 27
    // novembre 2026 : une Horde fondait dans les ombres sans qu'on frappe).
    if (b.has('tenb_void')) this.zone(e.x, e.y, 3.2, b.v('tenb_void'), 'damage', Math.max(1, Math.round(this.basePower(player) * 0.2)), typeColor('dark'), 'tenb_void');
    // Ascendant plafonne à +60 % : sans plafond, une Horde menait à des vitesses impossibles à diriger.
    if (b.has('dragon_momentum')) (player.pokemon?.applyBuff('spd', 1 + Math.min(0.6, b.v('dragon_momentum') * b.roomKills), 99), b.fire('dragon_momentum'));
  }

  /** dmg_mult_in, puis l'Armure de Givre (de ce Pokémon) qui absorbe une part du premier coup. */
  dmgIn(a: Actor, damage: number): number {
    const b = this.boons;
    if (!b) return damage;
    let d = damage;
    if (b.has('tenb_debt')) d *= 2;
    const g = this.guard(a);
    if (b.has('glace_shield') && g.shieldReady) {
      g.shieldReady = false;
      b.fire('glace_shield');
      d *= 1 - Math.min(1, b.v('glace_shield'));
    }
    return Math.round(d);
  }

  /** Prémonition : un coup évité grâce au dash est renvoyé en entier au plus proche (la moitié avant le rééquilibrage). */
  onDodgedByDash(player: Actor, damage: number, enemies: readonly Actor[]): void {
    if (!this.boons?.has('psy_premonition')) return;
    const e = this.nearest(enemies, player.x, player.y, 6);
    if (e) this.hitBy('psy_premonition', e, damage, typeColor('psychic'), player.x, player.y);
  }

  /**
   * on_take_damage, après le retrait des PV : Phénix, Souhait et Renaissance
   * empêchent le K.O. ; Épines renvoie une part du coup. `led` : un Pokémon mené (le joueur, un
   * invité) ; seuls ses coups encaissés comptent pour la salle (Carapace, rareté des dons) et
   * chargent l'ultime, comme avant : un compagnon de l'IA s'expose sans qu'on y puisse rien.
   */
  onHurt(player: Actor, damage: number, enemies: readonly Actor[], led = true): void {
    const b = this.boons;
    const mon = player.pokemon;
    if (!b || !mon) return;
    const g = this.guard(player);
    g.sinceHurt = 0;
    if (led) {
      b.roomHurts++;
      b.ultGauge = Math.min(ULT_MAX, b.ultGauge + damage * 4);
    }
    const who = player.remote || !led ? `${mon.name} se relève` : 'Tu te relèves';
    if (mon.fainted) {
      if (b.has('feu_phoenix') && !g.phoenix) {
        g.phoenix = true;
        b.fire('feu_phoenix');
        mon.hp = Math.max(1, Math.floor(mon.maxHp * Math.min(1, b.v('feu_phoenix'))));
        for (const e of this.around(enemies, player.x, player.y, 6)) this.inflict(e, 'burn');
        this.host.fx.attackAnim('fire', player.x, player.y);
        this.host.notify(`Phénix ! ${who}.`);
      } else if (b.has('astre_wish') && !g.wish) {
        g.wish = true;
        b.fire('astre_wish');
        mon.hp = 1;
        this.host.notify(`Souhait : ${player.remote || !led ? `${mon.name} tient` : 'tu tiens'} à 1 PV.`);
      } else if (b.has('sacre_rebirth') && !b.rebirth.has(player)) {
        b.rebirth.add(player);
        b.fire('sacre_rebirth');
        mon.hp = Math.floor(mon.maxHp / 2);
        this.host.fx.attackAnim('fx_heal', player.x, player.y);
        this.host.notify(`Renaissance ! ${who}.`);
      }
    }
    if (b.has('sol_thorns')) {
      const e = this.nearest(enemies, player.x, player.y, 4);
      if (e) this.hitBy('sol_thorns', e, damage * b.v('sol_thorns'), typeColor('ground'), player.x, player.y);
    }
  }

  private heal(player: Actor, amount: number): void {
    const mon = player.pokemon!;
    const before = mon.hp;
    mon.hp = Math.min(mon.maxHp, mon.hp + Math.max(1, Math.round(amount)));
    if (mon.hp > before) this.host.fx.number('heal', player.x, player.y, 0, `+${mon.hp - before}`);
  }

  /** Un pas : l'Orage (commun, depuis le Pokémon mené), puis ce que chaque membre porte. */
  tick(dt: number, team: readonly Actor[], enemies: readonly Actor[]): void {
    const b = this.boons;
    if (!b) return;
    const lead = team[0];
    for (const a of team) this.tickMember(dt, a, b);
    if (b.has('elec_storm') && lead) {
      b.stormT += dt;
      // Période : 8 s ÷ l'échelle de rareté (une meilleure rareté frappe plus souvent).
      const period = 8 / RARITY_SCALE[b.owned.get('elec_storm')!];
      if (b.stormT >= period) {
        b.stormT = 0;
        const targets = this.around(enemies, lead.x, lead.y, Infinity).sort((a, c) => c.pokemon!.hp - a.pokemon!.hp);
        const t = targets[0];
        if (t) {
          this.hitBy('elec_storm', t, this.basePower(lead) * 1.6, typeColor('electric'), t.x, t.y - 3);
          this.inflict(t, 'paralysis');
          this.host.fx.attackAnim('electric', t.x, t.y);
        }
      }
    }
    this.updateZones(dt, enemies);
  }

  /** Sève, Armure de Givre, Inébranlable, Racines, charges de dash et historique (Rembobinage) d'un membre. */
  private tickMember(dt: number, player: Actor, b: Boons): void {
    const mon = player.pokemon;
    if (!mon || player.deathT >= 0 || mon.fainted) return;
    const g = this.guard(player);
    g.sinceHurt += dt;
    g.rewindCd = Math.max(0, g.rewindCd - dt);
    player.dashMax = 1 + this.metaDash + Math.round(b.v('dragon_dash_charge'));
    if (b.has('glace_shield') && !g.shieldReady && g.sinceHurt >= 6) g.shieldReady = true;
    if (b.has('temps_regen') && g.sinceHurt >= 3 && mon.hp < mon.maxHp) {
      g.regenAcc += mon.maxHp * b.v('temps_regen') * dt;
      if (g.regenAcc >= 1) {
        const n = Math.floor(g.regenAcc);
        g.regenAcc -= n;
        mon.hp = Math.min(mon.maxHp, mon.hp + n);
        b.fire('temps_regen');
      }
    }
    if (b.has('sol_steady') && (mon.status === 'freeze' || mon.status === 'sleep' || mon.status === 'paralysis')) (mon.status = null, b.fire('sol_steady'));
    if (b.has('duo_roots')) {
      if (player.moving) {
        g.stillT = 0;
        g.stillLatched = false;
      } else if (!g.stillLatched) {
        g.stillT += dt;
        if (g.stillT >= 2 / RARITY_SCALE[b.owned.get('duo_roots')!]) {
          g.stillLatched = true;
          this.host.resetCooldowns(player);
          player.dashCharges = player.dashMax;
          g.shieldReady = true;
          this.host.fx.attackAnim('grass', player.x, player.y);
          b.fire('duo_roots');
        }
      }
    }
    // Historique pour Rembobinage : 10 Hz sur 4 s.
    g.historyT += dt;
    if (g.historyT >= 0.1) {
      g.historyT = 0;
      g.history.push({ x: player.x, y: player.y, hp: mon.hp });
      if (g.history.length > 40) g.history.shift();
    }
  }

  /** Nouvelle salle : effets « une fois par salle », Printemps et Voyage pour chaque membre, Vœu Exaucé au début d'un acte. */
  onRoomEnter(team: readonly Actor[], run: Run, newAct: boolean, rng: Rng): void {
    const b = run.boons;
    b.enterRoom();
    this.reset();
    for (const player of team) {
      const mon = player.pokemon;
      if (!mon) continue;
      if (b.has('temps_speed')) (mon.applyBuff('spd', 1 + b.v('temps_speed'), 12), b.fire('temps_speed'));
      if (b.has('temps_journey')) {
        b.fire('temps_journey');
        this.host.resetCooldowns(player);
        player.dashCharges = Math.min(player.dashMax, player.dashCharges + 1);
        // Rééquilibrage : il soigne aussi (cadences et dash pleins ne servaient presque à rien entre deux salles).
        if (!mon.fainted) mon.hp = Math.min(mon.maxHp, mon.hp + Math.round(mon.maxHp * b.v('temps_journey')));
      }
    }
    if (newAct && b.has('astre_wish_granted')) {
      if (b.wishGranted(rng)) (this.host.notify(`Vœu Exaucé : un don monte d'une rareté.`), b.fire('astre_wish_granted'));
    }
  }

  /** Salle libérée : Vol d'Ombre ronge les PV max de chaque membre, Carapace les augmente, Aubaine rapporte. */
  onRoomClear(team: readonly Actor[], run: Run): void {
    const b = run.boons;
    for (const player of team) {
      const mon = player.pokemon;
      if (!mon) continue;
      if (b.has('tenb_steal')) {
        mon.boostMaxHp(0.98);
        mon.hp = Math.min(mon.hp, mon.maxHp);
      }
      if (b.has('sol_shell') && b.roomHurts === 0) (mon.boostMaxHp(1 + b.v('sol_shell')), b.fire('sol_shell'));
    }
    if (b.has('astre_bounty')) (run.money += Math.round(60 * b.v('astre_bounty')), b.fire('astre_bounty'));
  }

  /**
   * Dons de statistique d'un membre : chacun au gain de sa rareté actuelle. Appelé pour toute
   * l'équipe à la prise d'un don et à chaque salle (un membre arrivé entre-temps, recrue ou invité
   * revenu, reçoit tout). Le Pokémon garde la rareté déjà appliquée (Pokemon.boonRanks) : une
   * reprise n'ajoute que l'écart, pour qu'un Prismatique vaille son gain et pas la somme des reprises.
   */
  syncStats(player: Actor): void {
    const b = this.boons;
    const mon = player.pokemon;
    if (!b || !mon) return;
    for (const [id, to] of b.owned) {
      const s = STAT_BOONS[id];
      if (!s) continue;
      const from = mon.boonRanks.get(id);
      const was = statGain(id, from);
      const now = statGain(id, to);
      if (now <= was) continue;
      mon.boonRanks.set(id, to);
      // Les multiplicateurs : (1 + nouveau) / (1 + ancien) ; la cadence, son inverse (plus court).
      const ratio = (1 + now) / (1 + was);
      if (s.apply === 'hp') mon.boostMaxHp(ratio);
      else if (s.apply === 'crit' || s.apply === 'dodge') mon.mult[s.apply] += now - was;
      else if (s.apply === 'cooldown') mon.mult.cooldown /= ratio;
      else mon.mult[s.apply] *= ratio;
      mon.movesVersion++;
      b.fire(id);
    }
  }

  private zone(x: number, y: number, r: number, dur: number, kind: Zone['kind'], value: number, color: string, id: string): void {
    this.zones.push({ x, y, r, t: 0, dur, pulse: 0, kind, value, color, id });
  }

  private updateZones(dt: number, enemies: readonly Actor[]): void {
    for (const z of this.zones) {
      z.t += dt;
      z.pulse -= dt;
      if (z.pulse > 0) continue;
      z.pulse = ZONE_PULSE;
      for (const e of this.around(enemies, z.x, z.y, z.r)) {
        if (z.kind === 'damage') this.hitBy(z.id, e, z.value, z.color, z.x, z.y);
        else e.pokemon!.applyBuff('spd', Math.max(0.15, 1 - z.value), 0.6);
      }
    }
    this.zones = this.zones.filter((z) => z.t < z.dur);
  }

  /** Nappes au sol : disque translucide qui pulse, s'éteint sur la dernière seconde. */
  drawZones(g: CanvasRenderingContext2D, camX: number, camY: number, k: number, time: number): void {
    for (const z of this.zones) {
      const fade = Math.min(1, (z.dur - z.t) / 1);
      const cx = Math.round((z.x * TILE - camX) * k);
      const cy = Math.round((z.y * TILE - camY) * k);
      const r = z.r * TILE * k;
      g.fillStyle = withAlpha(z.color, (0.18 + 0.06 * Math.sin(time * 6)) * fade);
      g.beginPath();
      g.ellipse(cx, cy, r, r * 0.6, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = withAlpha(z.color, 0.55 * fade);
      g.lineWidth = k;
      g.stroke();
    }
  }

  /**
   * Ultime (CombatArena.request_ultimate / _play_ultimate) : jauge pleine,
   * touche R. P = puissance de la 1re capacité × 6, en dégâts bruts.
   * Psycho-Boost relance trois fois l'attaque sélectionnée (`attackAgain`).
   */
  ultimate(player: Actor, enemies: readonly Actor[], world: WorldMap, attackAgain: (wave: number) => void): void {
    const b = this.boons;
    const run = this.run();
    if (!b || !run || !player.pokemon) return;
    if (!b.ult) {
      this.host.notify('Aucune ultime équipée.');
      return;
    }
    if (b.ultGauge < ULT_MAX) {
      this.host.notify(`Ultime en charge — ${Math.floor((b.ultGauge / ULT_MAX) * 100)} %`);
      return;
    }
    b.ultGauge = 0;
    // Écart voulu : le jeu saluait l'ultime du jingle de victoire
    // (CombatArena.gd:2959) ; ici le bruit des talents des combats Pokémon,
    // puis le son du type sur chaque cible (attackAnim).
    sfx('ability');
    const donor: DonorId = b.ult;
    const d = DONORS[donor];
    this.host.notify(`${d.ult} !`);
    this.host.addShake(0.45);
    const P = this.basePower(player) * ULT_POWER_MULT;
    const all = this.around(enemies, player.x, player.y, Infinity);
    const color = typeColor(d.type);
    const hit = (e: Actor, dmg: number) => this.host.boonDamage(e, Math.max(1, Math.round(dmg)), color, player.x, player.y);
    switch (donor) {
      case 'electhor':
        for (const e of all) (hit(e, P), this.inflict(e, 'paralysis'));
        break;
      case 'sulfura':
        for (const e of all) (hit(e, P), this.inflict(e, 'burn'));
        break;
      case 'artikodin':
        for (const e of all) (hit(e, 0.35 * P), this.inflict(e, 'freeze'));
        break;
      case 'mew':
        for (let w = 0; w < 3; w++) attackAgain(w);
        break;
      case 'darkrai':
        for (const e of all) {
          const dist = Math.hypot(e.x - player.x, e.y - player.y) || 1;
          const pull = Math.min(6, 0.7 * dist);
          e.nudge(world, ((player.x - e.x) / dist) * pull, ((player.y - e.y) / dist) * pull);
          hit(e, 0.5 * P);
          this.inflict(e, 'sleep');
        }
        break;
      case 'groudon':
        for (const e of all) (hit(e, 1.3 * P), this.host.stagger(e, player.x, player.y, 3));
        break;
      case 'celebi':
        for (const e of all) e.pokemon!.applyBuff('spd', 0.05, 4);
        break;
      case 'hooh':
        for (const e of all) (hit(e, P), this.inflict(e, 'burn'));
        player.pokemon.hp = player.pokemon.maxHp;
        break;
      case 'rayquaza': {
        // Couloir devant le Pokémon (sens du regard), 4 cases de part et d'autre.
        const a = (player.dir * Math.PI) / 4;
        const dx = Math.sin(a);
        const dy = Math.cos(a);
        for (const e of all) {
          const rx = e.x - player.x;
          const ry = e.y - player.y;
          if (rx * dx + ry * dy > -0.5 && Math.abs(rx * dy - ry * dx) <= 4) hit(e, 2 * P);
        }
        break;
      }
      case 'jirachi':
        for (const e of all) hit(e, P);
        run.money += run.roomGold;
        break;
    }
    for (const e of all) this.host.fx.attackAnim(d.type, e.x, e.y);
  }
}
