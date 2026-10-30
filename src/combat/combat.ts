import { dirFromVector, type Actor } from '../entities/actor';
import type { InputSample } from '../input/input';
import { CombatFx, kindFromMultiplier, typeColor, type NumberKind } from '../render/combatfx';
import type { WorldMap } from '../world/generate';
import { calculateDamage } from './damage';
import type { Run } from '../run/run';
import { AttackState } from './attackstate';
import { BoonHooks } from './boonhooks';
import { forcedStatus } from './boons';
import { ENEMY_ORB_SPEED } from './enemy';
import { BUFF_TIME, type Move, type MoveEffect } from './moves';
import { BUFF_LABEL, XP_MULTIPLIER } from './pokemon';
import type { Status } from './pokemon';

// Combat de l'équipe, porté de TeamMember.gd (_attack, _ranged_attack, combo,
// recharges) et de la réception des coups d'EnemyAI.gd (recul, ténacité,
// mort). Distances en cases : 1 case = 1 unité du jeu Godot.
//
// Chaque Pokémon garde ses recharges et son combo (Actor.atk) ; Combat
// travaille sur celui de l'attaquant. Les compagnons (companion.ts) frappent
// avec les mêmes attaques ; seuls les coups du Pokémon joué déclenchent les
// dons, le gel d'impact et la secousse — sinon l'écran tremblerait sans cesse.
//
// Pas de hitbox, comme le jeu : une attaque physique touche tout ce qui est
// dans le disque de sa portée, autour du Pokémon ; une attaque spéciale tire
// un orbe à guidage total sur l'ennemi le plus proche à portée.

/** TeamMember.GLOBAL_LOCK : délai minimal entre deux capacités. */
const GLOBAL_LOCK = 0.34;
/** Combo : 3 coups enchaînés en moins de 1,5 s chacun, le troisième est le finisher. */
const COMBO_WINDOW = 1.5;
const COMBO_DMG = [1, 1.18, 1.55];
const COMBO_ANIM_LOCK = 0.16;
/** Portée par défaut sans capacité (TeamMember.ATTACK_RANGE). */
const ATTACK_RANGE = 4;
/** Recul (EnemyAI) : vitesse et durée ; le finisher pousse 1,7 × plus fort, plus longtemps. */
const KNOCKBACK = 9;
const KNOCKBACK_TIME = 0.15;
const STAGGER = KNOCKBACK * 1.7;
const STAGGER_TIME = 0.22;
const POISE_TIME = 1.1;
/** Projectile.gd : vitesse, distance de touche, durée de vie, hauteurs de départ et d'arrivée. */
const ORB_SPEED = 14;
const ORB_HIT = 0.55;
const ORB_LIFE = 3;
const ORB_FROM_H = 0.9;
const ORB_TO_H = 0.8;
/**
 * Virage maximal d'un orbe ennemi (rad/s). Le jeu les guide à 100 % : une
 * fois tiré, le coup était inévitable. Bridé, l'orbe ne fait qu'infléchir sa
 * course (une quarantaine de degrés sur une demi-seconde de vol) : il
 * punit qui reste planté, mais courir de côté ou dasher au bon moment l'évite.
 */
const ENEMY_ORB_TURN = 0.8;
/** Un orbe ennemi qui a frôlé sa cible puis s'en éloigne ne la poursuit plus. */
const ENEMY_ORB_COMMIT = 1.6;
/** Portée des capacités de statut qui visent un sauvage (TeamMember.STATUS_MOVE_RANGE). */
const STATUS_MOVE_RANGE = 9;
/**
 * Le dash rend invulnérable pendant sa durée et un court instant après.
 * Écart voulu avec le jeu, qui n'en donne aucune : sans elle, un tir déjà
 * parti ne s'évitait pas, et un groupe de sauvages devenait impossible.
 */
const DASH_IFRAMES_AFTER = 0.08;
/** Durée du fondu de K.O. avant retrait (EnemyAI.gd:1351-1373). */
export const DEATH_TIME = 0.5;

/** StatusFx.gd:23-31 : statut tiré à chaque coup selon le type. */
const STATUS_ROLL: Record<string, [Status, number]> = {
  fire: ['burn', 0.25],
  poison: ['poison', 0.3],
  electric: ['paralysis', 0.25],
  ice: ['freeze', 0.15],
  psychic: ['sleep', 0.12],
  grass: ['poison', 0.1],
  ghost: ['sleep', 0.1],
};

interface Orb {
  /** Tiré par un sauvage : il vise le joueur, à sa propre vitesse et en virant moins sec. */
  hostile: boolean;
  /** Direction de vol au sol (orbes ennemis), et plus courte distance atteinte à la cible. */
  vx: number;
  vy: number;
  closest: number;
  speed: number;
  x: number;
  y: number;
  h: number;
  /** Cible suivie (guidage total) ; null pour un tir dans le vide vers (tx, ty). */
  target: Actor | null;
  tx: number;
  ty: number;
  life: number;
  /** Case de départ : un obstacle qui la touche n'arrête pas le tir (on ne se tire pas dans le rocher d'à côté). */
  startCell: number;
  type: string;
  /** Capacité tirée, pour sa planche d'animation à l'impact. */
  move?: string;
  /** Membre de l'équipe qui a tiré (ses dons, son XP). */
  owner?: Actor;
  color: string;
  damage: number;
  kind: NumberKind;
}

export class Combat {
  /** État d'attaque de l'attaquant courant : le Pokémon joué, ou un compagnon le temps de son coup. */
  private st = new AttackState();
  /** Éclat de l'anneau de portée au lancer, décroît de 4/s. */
  ringFlash = 0;
  /** Gel de toute la simulation (s), en temps réel. */
  hitstop = 0;
  /** Secousse de caméra (cases), plafonnée à 0,45 et décroissant de 2,2/s. */
  shake = 0;
  /** Temps depuis la dernière attaque du joueur : dans l'herbe, il reste repérable 2,5 s. */
  sinceAttack = Infinity;
  private orbs: Orb[] = [];
  /** Run en cours : ses dons modifient le combat. */
  run: Run | null = null;
  /** Message d'état (ultime, Phénix…), branché sur le HUD de run. */
  notify: (text: string) => void = () => {};
  /** Un membre de l'équipe vient de monter de niveau. */
  levelUp: (member: Actor) => void = () => {};
  readonly hooks: BoonHooks;
  private player: Actor | null = null;
  private enemies: readonly Actor[] = [];
  private wasDashing = false;
  /** Psycho-Boost : vagues d'attaque restantes (délais en s). */
  private psyWaves: number[] = [];

  /** Recharges, combo et emplacement choisi du Pokémon joué (HUD, anneau de portée). */
  get moveCd(): readonly number[] {
    return this.st.moveCd;
  }
  get moveCdMax(): readonly number[] {
    return this.st.moveCdMax;
  }
  get selected(): number {
    return this.st.selected;
  }
  get comboStep(): number {
    return this.st.comboStep;
  }

  constructor(
    readonly fx: CombatFx,
    private readonly random: () => number = Math.random,
  ) {
    this.hooks = new BoonHooks(this, () => this.run);
  }

  reset(): void {
    this.st.reset();
    this.hitstop = this.shake = 0;
    this.sinceAttack = Infinity;
    this.orbs = [];
    this.psyWaves = [];
    this.fx.reset();
    this.hooks.reset();
  }

  /** Recharges et verrous à zéro (Vrille, Voyage, Racines). */
  resetCooldowns(): void {
    this.st.moveCd.fill(0);
    this.st.globalLock = this.st.actionLock = 0;
  }

  /**
   * Retire des PV. Au coup qui devrait être fatal, s'il reste une barre
   * (champion, as), le Pokémon remonte au maximum dans un éclat doré :
   * c'est le changement de phase d'EnemyAI.take_damage. Rend vrai si le coup achève.
   */
  private dealt(e: Actor, damage: number): boolean {
    const mon = e.pokemon!;
    mon.hp = Math.max(0, mon.hp - damage);
    if (mon.hp > 0) return false;
    if (e.barsLeft > 1) {
      e.barsLeft--;
      mon.hp = mon.maxHp;
      e.flash = { color: '#fff0b3', t: 0.2, dur: 0.2, alpha: 0.85 };
      this.fx.impact(e.x, e.y, '#ffe666');
      this.addShake(0.12);
      return false;
    }
    return true;
  }

  /** Recul réduit d'un champion (×0,5) et de son as (×0,15). */
  private knockbackMult(e: Actor): number {
    return e.role === 'boss' ? 0.15 : e.role === 'champion' ? 0.5 : 1;
  }

  /** Dégâts d'un don (ricochet, zone, épines…) : ils ne redéclenchent pas on_hit. */
  boonDamage(e: Actor, damage: number, color: string, fromX: number, fromY: number): void {
    const mon = e.pokemon;
    if (!mon || mon.fainted || e.deathT >= 0) return;
    const fatal = this.dealt(e, damage);
    e.flash = { color: '#ff4d4d', t: 0.12, dur: 0.12, alpha: 0.6 };
    e.brain?.provoke();
    const len = Math.hypot(e.x - fromX, e.y - fromY) || 1;
    this.fx.impact(e.x, e.y, color, (e.x - fromX) / len, (e.y - fromY) / len);
    this.fx.number('normal', e.x, e.y, damage);
    if (fatal) this.kill(e);
  }

  /** EnemyAI.stagger_from : recul forcé (ténacité ignorée), anticipation brisée. */
  stagger(e: Actor, fromX: number, fromY: number, force: number): void {
    if (!e.pokemon || e.deathT >= 0) return;
    const len = Math.hypot(e.x - fromX, e.y - fromY) || 1;
    e.brain?.cancelWindup();
    e.brain?.interrupt();
    e.kbVx = ((e.x - fromX) / len) * KNOCKBACK * force * this.knockbackMult(e);
    e.kbVy = ((e.y - fromY) / len) * KNOCKBACK * force * this.knockbackMult(e);
    e.kbT = STAGGER_TIME;
    e.poiseT = POISE_TIME;
  }

  /** CombatArena.add_camera_shake */
  addShake(amount: number): void {
    this.shake = Math.min(0.45, this.shake + amount);
  }

  /** Le gel le plus long l'emporte : une demande plus courte ne raccourcit jamais celui en cours. */
  private freeze(seconds: number): void {
    this.hitstop = Math.max(this.hitstop, seconds);
  }

  /** Prêt si les trois verrous sont levés (TeamMember._move_ready). */
  ready(slot: number): boolean {
    return this.st.ready(slot);
  }

  /** Un membre peut lancer cet emplacement : prêt, et aucun ennemi sous sa portée minimale. */
  canLaunch(a: Actor, enemies: readonly Actor[], slot: number): boolean {
    if (!a.pokemon?.moves[slot] || !a.atk.ready(slot)) return false;
    const rmin = this.minReach(a, slot);
    return rmin <= 0 || !this.alive(enemies).some((e) => Math.hypot(e.x - a.x, e.y - a.y) < rmin);
  }

  /**
   * Coup d'un compagnon (TeamMember._attack depuis _companion_process) : il
   * lance l'emplacement choisi vers sa cible, avec ses propres recharges.
   */
  companionAttack(a: Actor, slot: number, target: Actor, enemies: readonly Actor[]): void {
    if (!a.pokemon?.canAct || a.deathT >= 0 || !this.canLaunch(a, enemies, slot)) return;
    const prev = this.st;
    this.st = a.atk;
    a.atk.selected = slot;
    const len = Math.hypot(target.x - a.x, target.y - a.y) || 1;
    this.attack(a, { mx: (target.x - a.x) / len, my: (target.y - a.y) / len, dash: false, move: slot, interact: false, ult: false, swap: false }, enemies, slot);
    this.st = prev;
  }

  /** Portée effective de l'emplacement, allongée par Séisme et Portée. */
  reach(player: Actor, slot: number): number {
    return (player.pokemon?.moves[slot]?.rangeMax ?? ATTACK_RANGE) * this.hooks.reachMult(player);
  }

  minReach(player: Actor, slot: number): number {
    return player.pokemon?.moves[slot]?.rangeMin ?? 0;
  }

  /**
   * Un pas de combat. `allies` : les compagnons sur le terrain, encore debout
   * (leurs recharges tournent, leurs statuts aussi, et les sauvages les visent).
   */
  update(dt: number, input: InputSample, player: Actor, enemies: readonly Actor[], world: WorldMap, allies: readonly Actor[] = []): void {
    this.st = player.atk;
    player.atk.tick(dt);
    for (const c of allies) c.atk.tick(dt);
    this.ringFlash = Math.max(0, this.ringFlash - dt * 4);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.sinceAttack += dt;

    this.player = player;
    this.enemies = enemies;
    const mon = player.pokemon;
    // Début de dash : les dons de dash frappent le segment balayé.
    const dashing = player.dashT > 0;
    if (dashing && !this.wasDashing) this.hooks.onDashStart(player, player.dashDx, player.dashDy, enemies);
    this.wasDashing = dashing;
    if (input.ult && mon && player.deathT < 0) {
      this.hooks.ultimate(player, enemies, world, () => this.psyWaves.push(0.35 * this.psyWaves.length));
    }
    if (this.psyWaves.length) {
      this.psyWaves = this.psyWaves.map((t) => t - dt);
      while (this.psyWaves.length && this.psyWaves[0] <= 0) {
        this.psyWaves.shift();
        if (mon?.moves[this.st.selected]) this.attack(player, input, enemies, this.st.selected);
      }
    }
    if (input.move >= 0 && mon?.moves[input.move] && mon.canAct && player.deathT < 0) {
      // Une touche sélectionne l'emplacement, puis le lance s'il est prêt et que rien n'est trop près.
      this.st.selected = input.move;
      if (this.ready(input.move) && this.minRangeOk(player, enemies, input.move)) this.attack(player, input, enemies, input.move);
    }

    // Les sauvages choisissent leur cible dans toute l'équipe sur le terrain (EnemyAI._find_target).
    const team = [player, ...allies];
    for (const e of enemies) e.brain?.update(dt, team, enemies, world, this);
    this.updateOrbs(dt, world);
    for (const e of enemies) this.updateEnemy(dt, e);
    this.hooks.tick(dt, player, enemies);
    for (const m of team) {
      const pm = m.pokemon;
      if (!pm || m.deathT >= 0) continue;
      pm.tickBuffs(dt);
      const dot = pm.tickStatus(dt);
      if (dot > 0) {
        this.fx.number('player', m.x, m.y, dot);
        if (pm.fainted) m.deathT = 0;
      }
    }
    this.fx.update(dt);
  }

  private alive(enemies: readonly Actor[]): Actor[] {
    return enemies.filter((e) => e.pokemon && !e.pokemon.fainted && e.deathT < 0);
  }

  /** Mêlée d'un sauvage : dégâts calculés au moment du coup (EnemyAI._do_attack). */
  enemyMelee(e: Actor, target: Actor, power: number, type: string, cls: string): void {
    if (!e.pokemon || !target.pokemon) return;
    if (this.random() < e.pokemon.missChance) {
      this.fx.number('dodge', target.x, target.y);
      return;
    }
    const res = calculateDamage(e.pokemon, target.pokemon, power, type, cls, this.random);
    this.hitPlayer(target, res.damage, e.x, e.y, type, res.crit ? 'crit' : 'player');
  }

  /** Tir d'un sauvage : orbe à guidage total, à 10 cases/s, dégâts figés au tir. */
  enemyShot(e: Actor, target: Actor, move: Move): void {
    if (!e.pokemon || !target.pokemon) return;
    const res = calculateDamage(e.pokemon, target.pokemon, move.power, move.type, 'special', this.random);
    // Précision baissée (Jet de Sable…) : le tir part quand même, mais il est voué à rater.
    const miss = this.random() < e.pokemon.missChance;
    const len = Math.hypot(target.x - e.x, target.y - e.y) || 1;
    this.orbs.push({
      hostile: true,
      vx: (target.x - e.x) / len,
      vy: (target.y - e.y) / len,
      closest: Infinity,
      speed: ENEMY_ORB_SPEED,
      x: e.x,
      y: e.y,
      h: ORB_FROM_H,
      target,
      tx: 0,
      ty: 0,
      life: ORB_LIFE,
      startCell: Math.floor(e.y) * 4096 + Math.floor(e.x),
      type: move.type,
      color: typeColor(move.type),
      damage: res.damage,
      kind: miss ? 'dodge' : res.crit ? 'crit' : 'player',
    });
  }

  private minRangeOk(player: Actor, enemies: readonly Actor[], slot: number): boolean {
    const rmin = this.minReach(player, slot);
    if (rmin <= 0) return true;
    return !this.alive(enemies).some((e) => Math.hypot(e.x - player.x, e.y - player.y) < rmin);
  }

  /** Point visé quand rien n'est à portée : devant le Pokémon, dans le sens de la marche ou du regard. */
  private swingPoint(player: Actor, input: InputSample, dist: number): { x: number; y: number } {
    let dx = input.mx;
    let dy = input.my;
    if (Math.hypot(dx, dy) < 0.5) {
      const a = (player.dir * Math.PI) / 4;
      dx = Math.sin(a);
      dy = Math.cos(a);
    }
    const len = Math.hypot(dx, dy) || 1;
    return { x: player.x + (dx / len) * dist, y: player.y + (dy / len) * dist };
  }

  /** TeamMember._attack */
  private attack(player: Actor, input: InputSample, enemies: readonly Actor[], slot: number): void {
    const mon = player.pokemon!;
    const move = mon.moves[slot];
    const own = player === this.player;
    if (own) this.sinceAttack = 0;
    if (move.effect) {
      this.useStatusMove(player, enemies, slot, move.effect);
      return;
    }
    // Capacité sans puissance (Rugissement, Charme…) : comme le jeu, elle
    // frappe au contact avec le type et la puissance de la première capacité.
    let { type, power } = move;
    let cls: Move['damageClass'] = move.damageClass;
    if (power <= 0) {
      const first = mon.moves[0];
      type = first?.type ?? mon.types[0];
      power = first && first.power > 0 ? first.power : 40;
      cls = 'physical';
    }

    // Combo : il avance à chaque lancer, même dans le vide.
    this.st.comboStep = this.st.comboStep >= 3 ? 1 : this.st.comboStep + 1;
    this.st.comboT = COMBO_WINDOW;
    const finisher = this.st.comboStep === 3;
    const dmgPower = power * COMBO_DMG[this.st.comboStep - 1];
    const reach = this.reach(player, slot);
    const color = typeColor(type);
    const targets = this.alive(enemies);

    let lock: number;
    if (cls === 'special') {
      lock = this.rangedAttack(player, input, targets, reach, dmgPower, type, color, move.power > 0 ? move.api : undefined);
    } else {
      lock = this.meleeAttack(player, input, targets, reach, dmgPower, type, cls, color, finisher, move.power > 0 ? move.api : undefined);
    }

    // Recharge, mise à l'échelle par la Vitesse : de ×0,6 (très rapide) à ×1,3 (très lent).
    const speedScale = Math.min(1.3, Math.max(0.6, 1 - (mon.speed - 60) / 300));
    const comboScale = finisher ? 1.15 : 0.42;
    const cd = move.cooldown * speedScale * comboScale * this.hooks.cooldownMult(player);
    this.st.moveCd[slot] = cd;
    this.st.moveCdMax[slot] = cd;
    this.st.globalLock = GLOBAL_LOCK * comboScale;
    // Coups 1-2 en mêlée : l'animation ne bride pas la chaîne (le tir, lui, garde son verrou, comme le jeu).
    this.st.actionLock = !finisher && cls !== 'special' ? Math.min(lock, COMBO_ANIM_LOCK) : lock;
    if (own) this.ringFlash = 1;
  }

  /**
   * TeamMember._use_status_move : hors combo, animation de concentration
   * (Charge) plutôt qu'une frappe, éclat vert, recharge propre à la capacité.
   */
  private useStatusMove(player: Actor, enemies: readonly Actor[], slot: number, effect: MoveEffect): void {
    const mon = player.pokemon!;
    const move = mon.moves[slot];
    switch (effect.kind) {
      case 'buff':
        for (const [stat, mult] of effect.stats) mon.applyBuff(stat, mult, BUFF_TIME);
        this.fx.attackAnim('fx_boost', player.x, player.y);
        this.fx.number('buff', player.x, player.y, 0, effect.stats.map(([st, m]) => `${BUFF_LABEL[st]} ${m >= 1 ? '↑' : '↓'}`).join(' '));
        break;
      case 'debuff': {
        // Tous les sauvages à portée de la capacité, cachés compris (c'est un cri, pas un tir).
        const reach = this.reach(player, slot);
        for (const e of this.alive(enemies)) {
          if (Math.hypot(e.x - player.x, e.y - player.y) > reach) continue;
          e.pokemon!.applyBuff(effect.stat, effect.mult, BUFF_TIME);
          e.brain?.provoke();
          this.fx.attackAnim(move.type, e.x, e.y, move.api);
          this.fx.number('debuff', e.x, e.y, 0, `${BUFF_LABEL[effect.stat]} ↓`);
        }
        break;
      }
      case 'status': {
        let best: Actor | null = null;
        let bestD = STATUS_MOVE_RANGE;
        for (const e of this.alive(enemies)) {
          const d = Math.hypot(e.x - player.x, e.y - player.y);
          if (!e.hidden && d <= bestD) {
            best = e;
            bestD = d;
          }
        }
        if (best) {
          best.pokemon!.applyStatus(effect.status);
          best.brain?.provoke();
          this.fx.attackAnim(move.type, best.x, best.y, move.api);
          this.face(player, best.x, best.y);
        }
        break;
      }
      case 'heal': {
        const gained = mon.heal(effect.pct);
        this.fx.attackAnim('fx_heal', player.x, player.y);
        this.fx.number('heal', player.x, player.y, 0, `+${gained} PV`);
        break;
      }
      case 'protect':
        player.protectT = Math.max(player.protectT, effect.dur);
        this.fx.impact(player.x, player.y, '#8cd9ff');
        break;
      case 'cleanse':
        mon.status = null;
        this.fx.attackAnim('fx_heal', player.x, player.y);
        break;
    }
    const speedScale = Math.min(1.3, Math.max(0.6, 1 - (mon.speed - 60) / 300));
    const cd = move.cooldown * speedScale * this.hooks.cooldownMult(player);
    this.st.moveCd[slot] = cd;
    this.st.moveCdMax[slot] = cd;
    this.st.globalLock = GLOBAL_LOCK;
    this.st.actionLock = player.playAction(['Charge', 'Attack'], 0.5);
    player.flash = { color: '#8cff8c', t: 0.12, dur: 0.12, alpha: 0.5 };
    if (player === this.player) this.ringFlash = 1;
  }

  private meleeAttack(
    player: Actor,
    input: InputSample,
    targets: Actor[],
    reach: number,
    power: number,
    type: string,
    cls: string,
    color: string,
    finisher: boolean,
    /** Capacité lancée : sa propre planche d'animation, s'il y en a une. */
    moveApi?: string,
  ): number {
    const hit = targets.filter((e) => Math.hypot(e.x - player.x, e.y - player.y) <= reach);
    let aimX: number;
    let aimY: number;
    if (hit.length) {
      // Fente vers le barycentre des cibles touchées.
      aimX = hit.reduce((s, e) => s + e.x, 0) / hit.length;
      aimY = hit.reduce((s, e) => s + e.y, 0) / hit.length;
      let first = 0;
      for (const e of hit) {
        // Morphing : une attaque Normal prend le type le plus efficace contre chaque cible.
        const t = this.hooks.morph(type, e);
        const res = calculateDamage(player.pokemon!, e.pokemon!, power, t, cls, this.random);
        const dmg = Math.max(1, Math.round(res.damage * this.hooks.dmgOut(player, e)));
        if (!first) first = dmg;
        this.hitEnemy(e, dmg, player.x, player.y, t, t === type ? color : typeColor(t), finisher, res.crit ? 'crit' : kindFromMultiplier(res.effectiveness), false, t === type ? moveApi : undefined, player);
      }
      if (player === this.player) {
        this.addShake(finisher ? 0.22 : 0.05);
        if (finisher) {
          this.freeze(0.075);
          this.hooks.onFinisher(player, hit[0], first, this.enemies);
        }
      }
    } else {
      const p = this.swingPoint(player, input, Math.min(reach, 2));
      aimX = p.x;
      aimY = p.y;
      this.fx.attackAnim(type, aimX, aimY, moveApi);
    }
    this.face(player, aimX, aimY);
    const dx = aimX - player.x;
    const dy = aimY - player.y;
    const len = Math.hypot(dx, dy) || 1;
    player.lunge = { dx: (dx / len) * 0.9, dy: (dy / len) * 0.9, t: 0 };
    player.flash = { color: '#ffffff', t: 0.1, dur: 0.1, alpha: 0.55 };
    return player.playAction(['Attack'], 0.4);
  }

  private rangedAttack(player: Actor, input: InputSample, targets: Actor[], reach: number, power: number, type: string, color: string, moveApi?: string): number {
    let best: Actor | null = null;
    let bestD = reach;
    for (const e of targets) {
      // Un sauvage caché dans l'herbe n'est pas visé (TeamMember.gd:1398-1399).
      if (e.hidden) continue;
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d <= bestD) {
        best = e;
        bestD = d;
      }
    }
    const startCell = Math.floor(player.y) * 4096 + Math.floor(player.x);
    const orb: Orb = { hostile: false, vx: 0, vy: 0, closest: Infinity, speed: ORB_SPEED, x: player.x, y: player.y, h: ORB_FROM_H, target: best, tx: 0, ty: 0, life: ORB_LIFE, startCell, type, color, damage: 0, kind: 'normal', owner: player };
    if (best) {
      // Dégâts, critique et sorte de chiffre sont figés au tir (TeamMember.gd:1785-1794).
      orb.type = this.hooks.morph(type, best);
      orb.color = typeColor(orb.type);
      const res = calculateDamage(player.pokemon!, best.pokemon!, power, orb.type, 'special', this.random);
      orb.damage = Math.max(1, Math.round(res.damage * this.hooks.dmgOut(player, best)));
      orb.kind = res.crit ? 'crit' : kindFromMultiplier(res.effectiveness);
      this.face(player, best.x, best.y);
    } else {
      const p = this.swingPoint(player, input, Math.min(reach, 7));
      orb.tx = p.x;
      orb.ty = p.y;
      this.face(player, p.x, p.y);
    }
    // Morphing a pu changer le type : la planche propre à la capacité ne vaut que pour son type d'origine.
    if (orb.type === type) orb.move = moveApi;
    this.orbs.push(orb);
    return player.playAction(['Shoot', 'Charge', 'Attack'], 0.4);
  }

  private face(a: Actor, x: number, y: number): void {
    if (Math.hypot(x - a.x, y - a.y) > 0.05) a.dir = dirFromVector(x - a.x, y - a.y);
  }

  /** Orbe ennemi : il vire vers le joueur sans dépasser ENEMY_ORB_TURN, puis file tout droit s'il l'a manqué. */
  private steerHostile(o: Orb, t: Actor, dt: number): boolean {
    const d = Math.hypot(t.x - o.x, t.y - o.y);
    o.closest = Math.min(o.closest, d);
    if (d <= ORB_HIT + 0.15) {
      if (o.kind === 'dodge') this.fx.number('dodge', t.x, t.y);
      else this.hitPlayer(t, o.damage, o.x, o.y, o.type, o.kind);
      return false;
    }
    const committed = o.closest < ENEMY_ORB_COMMIT && d > o.closest + 0.2;
    if (!committed) {
      const want = Math.atan2(t.y - o.y, t.x - o.x);
      const cur = Math.atan2(o.vy, o.vx);
      let turn = want - cur;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      const a = cur + Math.max(-ENEMY_ORB_TURN * dt, Math.min(ENEMY_ORB_TURN * dt, turn));
      o.vx = Math.cos(a);
      o.vy = Math.sin(a);
    }
    o.x += o.vx * o.speed * dt;
    o.y += o.vy * o.speed * dt;
    o.h += (ORB_TO_H - o.h) * Math.min(1, dt * 3);
    return true;
  }

  private updateOrbs(dt: number, world: WorldMap): void {
    this.orbs = this.orbs.filter((o) => {
      o.life -= dt;
      const t = o.target;
      if (t && (!t.pokemon || t.pokemon.fainted || t.deathT >= 0)) return false; // cible disparue : l'orbe s'éteint
      if (o.life <= 0) return false;
      if (o.hostile && t) return this.steerHostile(o, t, dt) && !this.absorbed(o, world);
      const tx = t ? t.x : o.tx;
      const ty = t ? t.y : o.ty;
      const dx = tx - o.x;
      const dy = ty - o.y;
      const dh = ORB_TO_H - o.h;
      const dist = Math.hypot(dx, dy, dh);
      const step = o.speed * dt;
      if (dist <= Math.max(ORB_HIT, step)) {
        if (t && o.hostile) this.hitPlayer(t, o.damage, o.x, o.y, o.type, o.kind);
        else if (t) this.hitEnemy(t, o.damage, o.x, o.y, o.type, o.color, false, o.kind, true, o.move, o.owner ?? null);
        else {
          this.fx.impact(tx, ty, o.color);
          this.fx.attackAnim(o.type, tx, ty, o.move);
        }
        return false;
      }
      o.x += (dx / dist) * step;
      o.y += (dy / dist) * step;
      o.h += (dh / dist) * step;
      return !this.absorbed(o, world);
    });
  }

  /** Un tronc, un rocher ou un mur absorbe le tir (Projectile.gd:119-123). */
  private absorbed(o: Orb, world: WorldMap): boolean {
    const cx = Math.floor(o.x);
    const cy = Math.floor(o.y);
    const own = cy * 4096 + cx === o.startCell;
    if (!own && cx >= 0 && cy >= 0 && cx < world.w && cy < world.h && world.blocked[cy * world.w + cx] && !world.water[cy * world.w + cx]) {
      this.fx.impact(o.x, o.y, o.color);
      return true;
    }
    return false;
  }

  /** EnemyAI.take_damage (+ stagger_from pour le finisher). */
  /**
   * `ranged` : orbe (null pour un coup qui ne vient pas d'une attaque) ;
   * `by` : le membre qui frappe — seuls les coups du Pokémon joué figent l'écran
   * et déclenchent ses dons.
   */
  private hitEnemy(e: Actor, damage: number, fromX: number, fromY: number, type: string, color: string, finisher: boolean, kind: NumberKind, ranged: boolean | null, moveApi?: string, by: Actor | null = null): void {
    const fatal = this.dealt(e, damage);
    if (by) e.hitBy.add(by);
    e.playAction(['Hurt'], 0.3);
    e.flash = { color: '#ff4d4d', t: 0.12, dur: 0.12, alpha: 0.65 };
    let dx = e.x - fromX;
    let dy = e.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    e.brain?.provoke();
    // Le finisher brise l'anticipation en cours ; un coup normal ne repousse pas un sauvage qui prépare son attaque.
    if (finisher) e.brain?.cancelWindup();
    const windingUp = (e.brain?.windupLeft() ?? 0) > 0;
    if (finisher || (!fatal && e.poiseT <= 0 && !windingUp)) {
      e.brain?.interrupt();
      const v = (finisher ? STAGGER : KNOCKBACK) * this.knockbackMult(e);
      e.kbVx = dx * v;
      e.kbVy = dy * v;
      e.kbT = finisher ? STAGGER_TIME : KNOCKBACK_TIME;
      e.poiseT = POISE_TIME;
    }
    this.fx.impact(e.x - dx * 0.35, e.y - dy * 0.35, color, dx, dy);
    this.fx.attackAnim(type, e.x, e.y, moveApi);
    this.fx.number(kind, e.x, e.y, damage);
    const own = by === this.player;
    if (own) this.freeze(fatal ? 0.09 : 0.045);
    if (!fatal) {
      // Un don peut imposer le statut (Braises, Souffle Gelé, Cauchemar) ; sinon le type le tire.
      const forced = this.run ? forcedStatus(this.run.boons, this.random) : null;
      const roll = STATUS_ROLL[type];
      if (forced) this.hooks.inflict(e, forced);
      else if (roll && this.random() < roll[1]) this.hooks.inflict(e, roll[0]);
    }
    if (ranged !== null && own && this.player) this.hooks.onHit(this.player, e, damage, ranged, this.enemies);
    if (fatal) this.kill(e, by);
  }

  /**
   * `by` : le membre qui achève ; null pour un statut ou un don. L'XP va à
   * chaque membre encore debout qui a touché le sauvage, montant plein (la
   * règle du multijoueur du jeu, CombatArena.gd:2396-2408 : « si un Pokémon
   * attaque un ennemi et que le partenaire l'achève, les deux doivent recevoir
   * de l'XP ») ; personne ne l'a touché : au Pokémon joué.
   */
  private kill(e: Actor, by: Actor | null = null): void {
    if (e.deathT >= 0) return;
    e.brain?.cancelWindup();
    e.hidden = false;
    e.deathT = 0;
    e.kbT = 0;
    this.fx.poof(e.x, e.y);
    this.addShake(0.05);
    if (!this.player) return;
    if (!by || by === this.player) this.hooks.onKill(this.player, e, this.enemies);
    // XP : niveau de l'ennemi × 12 (EnemyAI.gd:1365), augmentée par Cendres.
    if (!e.pokemon) return;
    const xp = Math.max(1, Math.floor(e.pokemon.level * XP_MULTIPLIER * this.hooks.xpMult()));
    const earners = new Set(e.hitBy);
    if (by) earners.add(by);
    if (!earners.size) earners.add(this.player);
    for (const m of earners) {
      const mon = m.pokemon;
      if (!mon || mon.fainted || m.deathT >= 0) continue;
      void mon.addXp(xp).then((n) => {
        if (!n) return;
        this.fx.attackAnim('fx_boost', m.x, m.y);
        this.fx.number('buff', m.x, m.y, 0, `Niv. ${mon.level} !`);
        this.levelUp(m);
      });
    }
  }

  /**
   * TeamMember.take_damage : pas d'i-frames, chaque coup porte. Le Pokémon
   * joue « Hurt », flashe en rouge, et toute la scène se fige 0,05 s ; la
   * secousse de 0,12 est celle que l'attaquant demande (EnemyAI.gd:1150-1151).
   */
  hitPlayer(player: Actor, damage: number, fromX: number, fromY: number, type: string, kind: NumberKind = 'player'): void {
    const mon = player.pokemon;
    if (!mon || mon.fainted || player.deathT >= 0) return;
    const own = player === this.player;
    // Esquivé : en plein dash (et juste après), sous Abri, ou par chance (Reflet).
    const dashing = player.dashT > 0 || (own && player.sinceDash < DASH_IFRAMES_AFTER + this.hooks.dashGrace());
    if (dashing || player.protectT > 0 || this.random() < mon.dodgeChance) {
      this.fx.number('dodge', player.x, player.y);
      if (dashing && own) this.hooks.onDodgedByDash(player, damage, this.enemies);
      return;
    }
    // Dette double le coup, l'Armure de Givre en absorbe une part.
    damage = this.hooks.dmgIn(damage);
    if (damage <= 0) {
      this.fx.number('dodge', player.x, player.y, 0, 'ABSORBÉ');
      return;
    }
    mon.hp = Math.max(0, mon.hp - damage);
    player.playAction(['Hurt'], 0.3);
    player.flash = { color: '#ff4d4d', t: 0.15, dur: 0.15, alpha: 0.65 };
    const len = Math.hypot(player.x - fromX, player.y - fromY) || 1;
    this.fx.impact(player.x, player.y, '#ff6b59', (player.x - fromX) / len, (player.y - fromY) / len);
    this.fx.number(kind, player.x, player.y, damage);
    if (own) {
      this.freeze(0.05);
      this.addShake(0.12);
      // Phénix, Souhait, Renaissance peuvent encore empêcher le K.O. ; Épines renvoie.
      this.hooks.onHurt(player, damage, this.enemies);
    }
    const roll = STATUS_ROLL[type];
    if (!mon.fainted && roll && this.random() < roll[1]) mon.applyStatus(roll[0]);
    if (mon.fainted) {
      player.deathT = 0;
      player.atk.comboStep = 0;
      if (own) this.addShake(0.2);
    }
  }

  /** Statuts des sauvages : tics de brûlure et de poison. */
  private updateEnemy(dt: number, e: Actor): void {
    const mon = e.pokemon;
    if (!mon || e.deathT >= 0) return;
    const dmg = mon.tickStatus(dt);
    if (dmg > 0) {
      this.fx.number('normal', e.x, e.y, dmg);
      if (mon.fainted) this.kill(e);
    }
  }

  /** Orbes en vol, pour le rendu. */
  drawOrbs(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void {
    for (const o of this.orbs) this.fx.drawOrb(b, camX, camY, k, o.x, o.y, o.h, o.color);
  }
}

