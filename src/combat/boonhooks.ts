import type { Rng } from '../core/rng';
import type { Actor } from '../entities/actor';
import { typeColor, withAlpha } from '../render/combatfx';
import type { Run } from '../run/run';
import type { WorldMap } from '../world/generate';
import { TILE } from '../world/tiles';
import { RARITY_SCALE, STAT_BOONS, ULT_MAX, ULT_POWER_MULT, type Boons, type DonorId, DONORS } from './boons';
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

/** Ce dont les effets ont besoin du combat (dégâts de don, recul, recharges). */
export interface BoonHost {
  boonDamage(e: Actor, damage: number, color: string, fromX: number, fromY: number): void;
  stagger(e: Actor, fromX: number, fromY: number, force: number): void;
  resetCooldowns(): void;
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
}

/** Une nappe frappe ce qu'elle couvre toutes les 0,5 s (BoonZone.gd:23). */
const ZONE_PULSE = 0.5;
/** Le dash balaie un segment de 4,2 cases, sur 2 de part et d'autre (RB:589-592). */
const DASH_REACH = 4.2;
const DASH_HALF_WIDTH = 2;

export class BoonHooks {
  private zones: Zone[] = [];
  private regenAcc = 0;
  /** Positions et PV des 4 dernières secondes, à 10 Hz (Rembobinage). */
  private history: { x: number; y: number; hp: number }[] = [];
  private historyT = 0;
  private stillLatched = false;

  constructor(
    private readonly host: BoonHost,
    private readonly run: () => Run | null,
  ) {}

  private get boons(): Boons | null {
    return this.run()?.boons ?? null;
  }

  reset(): void {
    this.zones = [];
    this.history = [];
  }

  /** Puissance de base : celle de la 1re capacité, 40 par défaut (RB:1695). */
  private basePower(player: Actor): number {
    const p = player.pokemon?.moves[0]?.power ?? 0;
    return p > 0 ? p : 40;
  }

  private statusMult(kind: Status): number {
    const b = this.boons;
    if (!b) return 1;
    if (kind === 'burn' && b.has('feu_cauldron')) return b.v('feu_cauldron');
    if (kind === 'freeze' && b.has('duo_winter')) return b.v('duo_winter');
    return 1;
  }

  /** Inflige un statut, durée allongée par Chaudron ou Hiver Perpétuel. */
  inflict(e: Actor, kind: Status): void {
    e.pokemon?.applyStatus(kind, STATUS[kind].duration * this.statusMult(kind));
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
    if (st === 'paralysis' && b.has('elec_network')) m *= 1 + b.v('elec_network');
    if (st === 'freeze' && b.has('glace_shatter')) m *= 1 + b.v('glace_shatter');
    if (st === 'sleep' && b.has('tenb_sleep')) m *= 2;
    if (b.has('tenb_steal')) m *= 1 + b.v('tenb_steal');
    if (b.has('tenb_lastbreath') && this.low(player)) m *= 1 + b.v('tenb_lastbreath');
    return m;
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
    if (b.has('dragon_delta') && player.moving) m *= Math.max(0.25, 1 - b.v('dragon_delta'));
    return m;
  }

  /** Dash : invulnérabilité prolongée par Ombre Portée. */
  dashGrace(): number {
    return this.boons?.has('tenb_phase') ? 0.35 : 0;
  }

  /** on_hit : un coup du joueur a porté (`ranged` : orbe). */
  onHit(player: Actor, target: Actor, damage: number, ranged: boolean, enemies: readonly Actor[]): void {
    const b = this.boons;
    const run = this.run();
    if (!b || !run || !player.pokemon) return;
    b.ultGauge = Math.min(ULT_MAX, b.ultGauge + damage);
    b.hits++;
    const ricochet = ranged ? b.v('elec_split') : b.v('elec_ricochet');
    if (ricochet > 0) {
      const other = this.nearest(enemies, target.x, target.y, 5.5, target);
      if (other) {
        this.host.boonDamage(other, Math.max(1, Math.round(damage * ricochet)), typeColor('electric'), target.x, target.y);
        if (b.has('duo_firestorm')) this.inflict(other, 'burn');
      }
    }
    if (b.has('elec_static') && b.hits % 10 === 0) {
      for (const e of this.around(enemies, player.x, player.y, 6)) {
        this.host.boonDamage(e, Math.max(1, Math.round(damage * b.v('elec_static'))), typeColor('electric'), player.x, player.y);
        this.inflict(e, 'paralysis');
      }
      this.host.fx.attackAnim('electric', player.x, player.y);
    }
    const st = target.pokemon?.status;
    if (st === 'burn' && b.has('feu_poise')) this.host.stagger(target, player.x, player.y, 1.7);
    if (st === 'freeze' && b.has('glace_shatter')) {
      const n = this.nearest(enemies, target.x, target.y, 4, target);
      if (n) this.inflict(n, 'freeze');
    }
    if (st === 'freeze' && b.has('duo_whitebolt')) {
      for (const e of this.around(enemies, target.x, target.y, 5)) {
        this.host.boonDamage(e, Math.max(1, Math.round(damage * b.v('duo_whitebolt'))), typeColor('electric'), target.x, target.y);
        this.inflict(e, 'paralysis');
      }
    }
    const tmon = target.pokemon;
    if (tmon && b.has('glace_execute') && tmon.hp / tmon.maxHp < b.v('glace_execute')) this.inflict(target, 'freeze');
    if (ranged && b.has('glace_hail')) this.zone(target.x, target.y, 3.4, 5, 'slow', Math.min(0.85, b.v('glace_hail')), typeColor('ice'));
    if (b.has('sol_continent') && b.hits % 5 === 0) this.zone(target.x, target.y, 3, 4, 'damage', Math.max(1, Math.round(damage * b.v('sol_continent'))), typeColor('ground'));
    const heal = damage * (b.v('psy_transfer') + b.v('sacre_lifesteal'));
    if (heal > 0) this.healPlayer(player, heal);
    if (b.has('astre_coin') && Math.random() < b.v('astre_coin')) {
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
    if (b.has('elec_finisher')) for (const e of this.around(enemies, target.x, target.y, b.v('elec_finisher'))) this.inflict(e, 'paralysis');
    if (b.has('feu_finisher')) for (const e of this.around(enemies, target.x, target.y, b.v('feu_finisher'))) this.inflict(e, 'burn');
    if (b.has('glace_finisher')) {
      const slow = Math.max(0.25, 1 - b.v('glace_finisher'));
      for (const e of this.around(enemies, target.x, target.y, Infinity)) e.pokemon!.applyBuff('spd', slow, 4);
      this.host.fx.attackAnim('ice', target.x, target.y);
    }
    const tmon = target.pokemon;
    if (tmon && !tmon.fainted && b.has('tenb_execute') && tmon.hp / tmon.maxHp < b.v('tenb_execute')) {
      this.host.boonDamage(target, tmon.hp, typeColor('dark'), player.x, player.y);
    }
    if (b.has('sol_finisher')) {
      for (const e of this.around(enemies, target.x, target.y, 5)) {
        this.host.boonDamage(e, Math.max(1, Math.round(damage * b.v('sol_finisher'))), typeColor('ground'), target.x, target.y);
        this.host.stagger(e, target.x, target.y, 1.7);
      }
    }
    if (b.has('duo_eruption')) {
      for (const e of this.around(enemies, target.x, target.y, b.v('duo_eruption'))) {
        this.inflict(e, 'burn');
        this.host.stagger(e, target.x, target.y, 2.6);
      }
    }
    if (b.has('temps_finisher')) this.host.resetCooldowns();
    const heal = mon.maxHp * (b.v('sacre_finisher') + b.v('astre_finisher'));
    if (heal > 0) this.healPlayer(player, heal);
    if (b.has('dragon_finisher')) player.dashCharges = Math.min(player.dashMax, player.dashCharges + 1);
  }

  /** on_dash : le segment balayé par le dash frappe, paralyse, brûle ou gèle. */
  onDashStart(player: Actor, dx: number, dy: number, enemies: readonly Actor[]): void {
    const b = this.boons;
    if (!b) return;
    if (b.has('temps_rewind')) this.rewind(player);
    const hitters = ['elec_dash', 'feu_dash', 'glace_dash', 'sol_dash', 'dragon_dash_hit'].filter((id) => b.has(id));
    if (!hitters.length) return;
    for (const e of this.around(enemies, player.x, player.y, DASH_REACH + DASH_HALF_WIDTH)) {
      // Projection sur l'axe du dash : devant, et pas trop sur le côté.
      const rx = e.x - player.x;
      const ry = e.y - player.y;
      const along = rx * dx + ry * dy;
      const side = Math.abs(rx * dy - ry * dx);
      if (along < -0.5 || along > DASH_REACH || side > DASH_HALF_WIDTH) continue;
      if (b.has('elec_dash')) this.inflict(e, 'paralysis');
      if (b.has('feu_dash')) this.inflict(e, 'burn');
      if (b.has('glace_dash')) this.inflict(e, 'freeze');
      const dmg = this.basePower(player) * (b.v('sol_dash') + b.v('dragon_dash_hit'));
      if (dmg > 0) this.host.boonDamage(e, Math.max(1, Math.round(dmg)), typeColor(b.has('sol_dash') ? 'ground' : 'dragon'), player.x, player.y);
      if (b.has('sol_dash')) this.host.stagger(e, player.x, player.y, 1.7);
    }
  }

  /** Rembobinage : position et PV d'il y a 3 s (si on était encore debout). */
  private rewind(player: Actor): void {
    const past = this.history[Math.max(0, this.history.length - 30)];
    if (!past || !player.pokemon) return;
    player.x = player.prevX = past.x;
    player.y = player.prevY = past.y;
    if (past.hp > 0) player.pokemon.hp = Math.min(player.pokemon.maxHp, past.hp);
    this.host.fx.attackAnim('grass', player.x, player.y);
  }

  onKill(player: Actor, e: Actor, enemies: readonly Actor[]): void {
    const b = this.boons;
    if (!b) return;
    b.roomKills++;
    if (b.has('feu_kill')) for (const n of this.around(enemies, e.x, e.y, b.v('feu_kill'), e)) this.inflict(n, 'burn');
    if (b.has('duo_shortcircuit')) for (const n of this.around(enemies, e.x, e.y, b.v('duo_shortcircuit'), e)) this.inflict(n, 'paralysis');
    if (b.has('tenb_void')) this.zone(e.x, e.y, 3.2, b.v('tenb_void'), 'damage', Math.max(1, Math.round(this.basePower(player) * 0.3)), typeColor('dark'));
    if (b.has('dragon_momentum')) player.pokemon?.applyBuff('spd', 1 + b.v('dragon_momentum') * b.roomKills, 99);
  }

  /** dmg_mult_in, puis l'Armure de Givre qui absorbe une part du premier coup. */
  dmgIn(damage: number): number {
    const b = this.boons;
    if (!b) return damage;
    let d = damage;
    if (b.has('tenb_debt')) d *= 2;
    if (b.has('glace_shield') && b.shieldReady) {
      b.shieldReady = false;
      d *= 1 - Math.min(1, b.v('glace_shield'));
    }
    return Math.round(d);
  }

  /** Prémonition : un coup évité grâce au dash est renvoyé à moitié au plus proche. */
  onDodgedByDash(player: Actor, damage: number, enemies: readonly Actor[]): void {
    if (!this.boons?.has('psy_premonition')) return;
    const e = this.nearest(enemies, player.x, player.y, 6);
    if (e) this.host.boonDamage(e, Math.max(1, Math.round(damage * 0.5)), typeColor('psychic'), player.x, player.y);
  }

  /**
   * on_take_damage, après le retrait des PV : Phénix, Souhait et Renaissance
   * empêchent le K.O. ; Épines renvoie une part du coup.
   */
  onHurt(player: Actor, damage: number, enemies: readonly Actor[]): void {
    const b = this.boons;
    const mon = player.pokemon;
    if (!b || !mon) return;
    b.roomHurts++;
    b.sinceHurt = 0;
    b.ultGauge = Math.min(ULT_MAX, b.ultGauge + damage * 4);
    if (mon.fainted) {
      if (b.has('feu_phoenix') && !b.phoenixUsed) {
        b.phoenixUsed = true;
        mon.hp = Math.max(1, Math.floor(mon.maxHp * Math.min(1, b.v('feu_phoenix'))));
        for (const e of this.around(enemies, player.x, player.y, 6)) this.inflict(e, 'burn');
        this.host.fx.attackAnim('fire', player.x, player.y);
        this.host.notify('🔥 Phénix ! Tu te relèves.');
      } else if (b.has('astre_wish') && !b.wishUsed) {
        b.wishUsed = true;
        mon.hp = 1;
        this.host.notify('★ Souhait : tu tiens à 1 PV.');
      } else if (b.has('sacre_rebirth') && !b.rebirthUsed) {
        b.rebirthUsed = true;
        mon.hp = Math.floor(mon.maxHp / 2);
        this.host.fx.attackAnim('fx_heal', player.x, player.y);
        this.host.notify('✹ Renaissance !');
      }
    }
    if (b.has('sol_thorns')) {
      const e = this.nearest(enemies, player.x, player.y, 4);
      if (e) this.host.boonDamage(e, Math.max(1, Math.round(damage * b.v('sol_thorns'))), typeColor('ground'), player.x, player.y);
    }
  }

  private healPlayer(player: Actor, amount: number): void {
    const mon = player.pokemon!;
    const before = mon.hp;
    mon.hp = Math.min(mon.maxHp, mon.hp + Math.max(1, Math.round(amount)));
    if (mon.hp > before) this.host.fx.number('heal', player.x, player.y, 0, `+${mon.hp - before}`);
  }

  tick(dt: number, player: Actor, enemies: readonly Actor[]): void {
    const b = this.boons;
    const mon = player.pokemon;
    if (!b || !mon || player.deathT >= 0) return;
    b.sinceHurt += dt;
    player.dashMax = 1 + this.metaDash + Math.round(b.v('dragon_dash_charge'));
    if (b.has('glace_shield') && !b.shieldReady && b.sinceHurt >= 6) b.shieldReady = true;
    if (b.has('temps_regen') && b.sinceHurt >= 2 && mon.hp < mon.maxHp) {
      this.regenAcc += mon.maxHp * b.v('temps_regen') * dt;
      if (this.regenAcc >= 1) {
        const n = Math.floor(this.regenAcc);
        this.regenAcc -= n;
        mon.hp = Math.min(mon.maxHp, mon.hp + n);
      }
    }
    if (b.has('sol_steady') && (mon.status === 'freeze' || mon.status === 'sleep')) mon.status = null;
    if (b.has('elec_storm')) {
      b.stormT += dt;
      // Période : 8 s ÷ l'échelle de rareté (une meilleure rareté frappe plus souvent).
      const period = 8 / RARITY_SCALE[b.owned.get('elec_storm')!];
      if (b.stormT >= period) {
        b.stormT = 0;
        const targets = this.around(enemies, player.x, player.y, Infinity).sort((a, c) => c.pokemon!.hp - a.pokemon!.hp);
        const t = targets[0];
        if (t) {
          this.host.boonDamage(t, Math.round(this.basePower(player) * 1.6), typeColor('electric'), t.x, t.y - 3);
          this.inflict(t, 'paralysis');
          this.host.fx.attackAnim('electric', t.x, t.y);
        }
      }
    }
    if (b.has('duo_roots')) {
      if (player.moving) {
        b.stillT = 0;
        this.stillLatched = false;
      } else if (!this.stillLatched) {
        b.stillT += dt;
        if (b.stillT >= 2 / RARITY_SCALE[b.owned.get('duo_roots')!]) {
          this.stillLatched = true;
          this.host.resetCooldowns();
          player.dashCharges = player.dashMax;
          b.shieldReady = true;
          this.host.fx.attackAnim('grass', player.x, player.y);
        }
      }
    }
    // Historique pour Rembobinage : 10 Hz sur 4 s.
    this.historyT += dt;
    if (this.historyT >= 0.1) {
      this.historyT = 0;
      this.history.push({ x: player.x, y: player.y, hp: mon.hp });
      if (this.history.length > 40) this.history.shift();
    }
    this.updateZones(dt, enemies);
  }

  /** Nouvelle salle : effets « une fois par salle », Printemps, Voyage, et Vœu Exaucé au début d'un acte. */
  onRoomEnter(player: Actor, run: Run, newAct: boolean, rng: Rng): void {
    const b = run.boons;
    b.enterRoom();
    this.reset();
    const mon = player.pokemon;
    if (b.has('temps_speed')) mon?.applyBuff('spd', 1 + b.v('temps_speed'), 12);
    if (b.has('temps_journey')) {
      this.host.resetCooldowns();
      player.dashCharges = Math.min(player.dashMax, player.dashCharges + 1);
    }
    if (newAct && b.has('astre_wish_granted')) {
      if (b.wishGranted(rng)) this.host.notify(`★ Vœu Exaucé : un don monte d'une rareté.`);
    }
  }

  /** Salle libérée : Vol d'Ombre ronge les PV max, Carapace les augmente, Aubaine rapporte. */
  onRoomClear(player: Actor, run: Run): void {
    const b = run.boons;
    const mon = player.pokemon;
    if (!mon) return;
    if (b.has('tenb_steal')) {
      mon.boostMaxHp(0.98);
      mon.hp = Math.min(mon.hp, mon.maxHp);
    }
    if (b.has('sol_shell') && b.roomHurts === 0) mon.boostMaxHp(1 + b.v('sol_shell'));
    if (b.has('astre_bounty')) run.money += Math.round(60 * b.v('astre_bounty'));
  }

  /** Don de statistique : appliqué une fois, à la prise. */
  applyStat(player: Actor, id: string): void {
    const s = STAT_BOONS[id];
    const mon = player.pokemon;
    if (!s || !mon) return;
    if (s.apply === 'hp') mon.boostMaxHp(s.value);
    else if (s.apply === 'crit' || s.apply === 'dodge') mon.mult[s.apply] += s.value;
    else mon.mult[s.apply] *= s.value;
    mon.movesVersion++;
  }

  private zone(x: number, y: number, r: number, dur: number, kind: Zone['kind'], value: number, color: string): void {
    this.zones.push({ x, y, r, t: 0, dur, pulse: 0, kind, value, color });
  }

  private updateZones(dt: number, enemies: readonly Actor[]): void {
    for (const z of this.zones) {
      z.t += dt;
      z.pulse -= dt;
      if (z.pulse > 0) continue;
      z.pulse = ZONE_PULSE;
      for (const e of this.around(enemies, z.x, z.y, z.r)) {
        if (z.kind === 'damage') this.host.boonDamage(e, z.value, z.color, z.x, z.y);
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
    const donor: DonorId = b.ult;
    const d = DONORS[donor];
    this.host.notify(`⚡ ${d.ult} !`);
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
