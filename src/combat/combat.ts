import { cry, sfx } from '../audio/audio';
import { dirFromVector, type Actor } from '../entities/actor';
import type { InputSample } from '../input/input';
import { CombatFx, kindFromMultiplier, typeColor, type NumberKind } from '../render/combatfx';
import type { WorldMap } from '../world/generate';
import { calculateDamage, currentWeather } from './damage';
import { CHIP, chips } from '../world/weather';
import type { Run } from '../run/run';
import { AttackState } from './attackstate';
import { BoonHooks } from './boonhooks';
import { forcedStatus } from './boons';
import { BUFF_TIME, type Move, type MoveEffect } from './moves';
import { BUFF_LABEL, XP_MULTIPLIER } from './pokemon';
import { PowerUps } from '../render/powerup';
import type { Status } from './pokemon';
import type { StrikeSnap } from '../net/net';

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
// dans le disque de sa portée, autour du Pokémon ; une attaque spéciale frappe
// l'ennemi le plus proche à portée, directement sur lui (voir Strike).

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
/**
 * Attaques spéciales : plus d'orbe qui traverse l'écran (Projectile.gd), le
 * coup tombe sur la cible elle-même, avec l'animation de la capacité. Une
 * marque au sol, à la couleur du type, l'annonce juste avant.
 * Écart voulu avec le jeu (retour de test : « Éclair doit frapper
 * instantanément ») :
 *   - coup de l'équipe : la marque suit sa cible et frappe après STRIKE_DELAY,
 *     à peine perceptible, le temps de lire qui va être touché ;
 *   - coup d'un sauvage : la marque se pose là où était sa cible au tir et
 *     frappe après ENEMY_STRIKE_DELAY ; qui en sort à temps (ou la traverse en
 *     dash) l'évite. C'est l'esquive que permettait l'orbe bridé, en lisible.
 */
const STRIKE_DELAY = 0.12;
const ENEMY_STRIKE_DELAY = 0.45;
/** Rayon de la marque d'un sauvage (cases) : touché si l'on est encore dedans quand elle frappe. */
const ENEMY_STRIKE_RADIUS = 0.8;
/** Rayon dessiné de la marque d'un coup de l'équipe, simple repère sous la cible. */
const STRIKE_RADIUS = 0.55;
/** Portée des capacités de statut qui visent un sauvage (TeamMember.STATUS_MOVE_RANGE). */
const STATUS_MOVE_RANGE = 9;
/**
 * Le dash rend invulnérable pendant sa durée et un court instant après.
 * Écart voulu avec le jeu, qui n'en donne aucune : sans elle, un tir déjà
 * parti ne s'évitait pas, et un groupe de sauvages devenait impossible.
 */
const DASH_IFRAMES_AFTER = 0.08;
/**
 * Entrée en puissance d'un Pokémon de champion (render/powerup.ts) :
 * concentration jusqu'à `burst`, libération, motif du type jusqu'à `dur` (s).
 * Il n'agit pas et ne prend aucun coup pendant ce temps.
 */
const INTRO = { champion: { burst: 0.45, dur: 1.2 }, boss: { burst: 0.7, dur: 1.9 } };
/**
 * Évolution d'un membre (Combat.evolve) : la silhouette blanchit en pulsant
 * jusqu'à l'échange de forme, puis la nouvelle reprend ses couleurs (s).
 * Écart voulu : le jeu Godot change d'espèce sur place, sans mise en scène.
 */
export const EVOLVE = { dur: 1.6, swapAt: 0.85 };
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

/**
 * Attaques de zone des champions et de leur as (EnemyBrain), posées au sol
 * puis résolues contre toute l'équipe : un disque, une bande qui part du
 * lanceur (rayon), ou un cône devant lui (souffle). Directions unitaires.
 * Écart voulu avec le jeu, qui n'en a aucune : un boss ne faisait que tirer ou
 * frapper une cible, et une équipe de quatre l'encerclait sans jamais bouger
 * (retour de test). Ici chaque zone s'annonce assez tôt pour qu'on en sorte.
 */
export type AreaShape =
  | { kind: 'circle'; r: number }
  | { kind: 'line'; len: number; halfW: number; dx: number; dy: number }
  | { kind: 'cone'; r: number; half: number; dx: number; dy: number }
  /** Couronne entre r0 et r autour du centre : les ondes de Séisme, l'anneau de feu d'Auguste (signatures, enemy.ts). */
  | { kind: 'ring'; r0: number; r: number };
/** Marge pour le corps du Pokémon : touché si le bord de la zone l'effleure. */
const AREA_BODY = 0.3;

/** Une zone en attente : qui la lance, avec quoi ; dégâts calculés par cible à l'impact. */
interface Area {
  shape: AreaShape;
  source: Actor;
  power: number;
  cls: string;
}

interface Strike {
  /** Tiré par un sauvage : marque fixe, qu'on peut quitter avant qu'elle frappe. */
  hostile: boolean;
  /** Attaque de zone d'un champion : (x, y) est son centre (disque) ou son origine (rayon, cône). */
  area?: Area;
  /** Cible visée ; null pour un tir dans le vide en (x, y). */
  target: Actor | null;
  /** Centre de la marque au sol (suit la cible pour un coup de l'équipe). */
  x: number;
  y: number;
  /** D'où part le coup : sens du recul, et ligne de vue vers la marque. */
  fromX: number;
  fromY: number;
  /** Case du tireur : un obstacle qui la touche n'arrête pas le coup (on ne se tire pas dans le rocher d'à côté). */
  startCell: number;
  t: number;
  dur: number;
  type: string;
  /** Capacité lancée, pour sa planche d'animation à l'impact. */
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
  private strikes: Strike[] = [];
  /** Entrées en puissance des Pokémon de champion (dessinées par le renderer). */
  readonly powerUps = new PowerUps();
  /** Run en cours : ses dons modifient le combat. */
  run: Run | null = null;
  /** Message d'état (ultime, Phénix…), branché sur le HUD de run. */
  notify: (text: string) => void = () => {};
  /** Un membre de l'équipe vient de monter de niveau. */
  levelUp: (member: Actor) => void = () => {};
  /** Un ennemi tombe, quel que soit l'auteur du coup : le décompte des victoires (déblocage, main.ts). */
  defeated: (e: Actor) => void = () => {};
  /** Le Pokémon mené vient d'encaisser un coup (quête « Sans une égratignure », main.ts). */
  hurt: () => void = () => {};
  /** Bilan de run (meta/runstats.ts) : PV ôtés à un ennemi par `by` (null : on ne sait pas qui), et PV perdus par un membre. */
  dealtBy: (by: Actor | null, amount: number) => void = () => {};
  taken: (member: Actor, amount: number) => void = () => {};
  /**
   * Ce qui se casse sans être un ennemi (arbres à baies, run/berries.ts) :
   * un coup porté en (x, y) avec une allonge en cases ; rend le point touché,
   * ou null s'il n'y a rien.
   */
  breakables: (x: number, y: number, reach: number) => { x: number; y: number } | null = () => null;
  /** L'arbre à baies encore chargé le plus proche, sans le frapper (visée des tirs). */
  breakableNear: (x: number, y: number, reach: number) => { x: number; y: number } | null = () => null;
  readonly hooks: BoonHooks;
  private player: Actor | null = null;
  private enemies: readonly Actor[] = [];
  private wasDashing = false;
  /** Temps depuis la dernière usure de la météo (sable, grêle). */
  private weatherT = 0;
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
    this.strikes = [];
    this.psyWaves = [];
    this.weatherT = 0;
    this.powerUps.reset();
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

  /**
   * Un Pokémon de champion ne recule pas sous les coups.
   * Écart voulu avec le jeu (recul ×0,5, ×0,15 pour l'as, et animation de
   * douleur) : un boss qui bronche à chaque coup paraît fragile (retour de
   * test). Le flash rouge et les chiffres disent qu'il est touché.
   */
  private knockbackMult(e: Actor): number {
    return e.role === 'wild' ? 1 : 0;
  }

  /**
   * Un Pokémon de champion vient d'apparaître : il se concentre, se ramasse,
   * pulse à la couleur de son type, puis libère son énergie (onde, secousse,
   * animation du type) avant d'agir.
   */
  bossIntro(e: Actor): void {
    const mon = e.pokemon;
    if (!mon || e.role === 'wild') return;
    const big = e.role === 'boss';
    const { burst, dur } = INTRO[big ? 'boss' : 'champion'];
    e.intro = { t: 0, burst, dur };
    e.brain?.cancelWindup();
    e.playAction(['Charge', 'Rotate', 'Attack'], burst);
    sfx('ballDrop');
    this.powerUps.start(e.x, e.y, mon.types[0], big, burst, dur);
  }

  /** Avance les entrées en puissance ; la libération secoue l'écran et joue l'animation du type. */
  private updateIntros(dt: number, enemies: readonly Actor[]): void {
    for (const e of enemies) {
      const it = e.intro;
      if (!it) continue;
      const before = it.t;
      it.t += dt;
      if (before < it.burst && it.t >= it.burst && e.pokemon) {
        const big = e.role === 'boss';
        const type = e.pokemon.types[0];
        this.addShake(big ? 0.35 : 0.2);
        this.fx.impact(e.x, e.y, typeColor(type));
        this.fx.attackAnim(type, e.x, e.y);
        if (big) for (let i = 0; i < 4; i++) this.fx.attackAnim(type, e.x + Math.cos(i * 1.57 + 0.78) * 1.6, e.y + Math.sin(i * 1.57 + 0.78) * 1.1);
        e.playAction(['Shoot', 'Attack'], 0.5);
        // Le cri à la sortie de la Ball, comme l'envoi d'un Pokémon adverse.
        cry(e.speciesId, big ? 0 : -3);
        e.flash = { color: '#ffffff', t: 0.18, dur: 0.18, alpha: 0.8 };
      }
      if (it.t >= it.dur) e.intro = null;
    }
    this.powerUps.update(dt);
  }

  /**
   * Un membre évolue : `swap` échange sa forme au pic de blanc. D'ici là, et
   * jusqu'à la fin, il n'attaque pas et ne prend aucun coup.
   */
  evolve(a: Actor, swap: () => void): void {
    a.evolve = { t: 0, dur: EVOLVE.dur, swapAt: EVOLVE.swapAt, swap };
    sfx('evoStart');
    a.playAction(['Charge'], EVOLVE.swapAt);
  }

  private updateEvolutions(dt: number, team: readonly Actor[]): void {
    for (const a of team) {
      const ev = a.evolve;
      if (!ev) continue;
      ev.t += dt;
      if (ev.swap && ev.t >= ev.swapAt) {
        ev.swap();
        ev.swap = null;
        sfx('evoSuccess');
        this.fx.attackAnim('fx_boost', a.x, a.y);
        this.fx.impact(a.x, a.y, '#ffffff');
        this.addShake(0.1);
      }
      if (ev.t >= ev.dur) a.evolve = null;
    }
  }

  /** Dégâts d'un don (ricochet, zone, épines…) : ils ne redéclenchent pas on_hit. */
  boonDamage(e: Actor, damage: number, color: string, fromX: number, fromY: number): void {
    const mon = e.pokemon;
    if (!mon || mon.fainted || e.deathT >= 0 || e.intro) return;
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
    // Un Pokémon de champion perd son anticipation mais ne recule pas (voir knockbackMult).
    if (e.role !== 'wild') return;
    e.kbVx = ((e.x - fromX) / len) * KNOCKBACK * force * this.knockbackMult(e);
    e.kbVy = ((e.y - fromY) / len) * KNOCKBACK * force * this.knockbackMult(e);
    e.kbT = STAGGER_TIME;
    e.poiseT = POISE_TIME;
  }

  /** 0 : secousses coupées dans le menu des réglages (options.shake). */
  shakeMult = 1;

  /** CombatArena.add_camera_shake */
  addShake(amount: number): void {
    this.shake = Math.min(0.45, this.shake + amount * this.shakeMult);
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
    if (!a.pokemon?.canAct || a.deathT >= 0 || a.evolve || !this.canLaunch(a, enemies, slot)) return;
    const prev = this.st;
    this.st = a.atk;
    a.atk.selected = slot;
    const len = Math.hypot(target.x - a.x, target.y - a.y) || 1;
    this.attack(a, { mx: (target.x - a.x) / len, my: (target.y - a.y) / len, dash: false, move: slot, interact: false, ult: false, swap: false }, enemies, slot);
    this.st = prev;
  }

  /**
   * Coup d'un joueur en ligne (net/net.ts) : l'invité a pressé l'emplacement
   * chez lui, l'hôte le lance ici, vers où il visait, avec ses propres recharges.
   */
  remoteAttack(a: Actor, slot: number, mx: number, my: number, enemies: readonly Actor[]): void {
    if (!a.pokemon?.canAct || a.deathT >= 0 || a.evolve || a.trapped || !a.pokemon.moves[slot]) return;
    a.atk.selected = slot;
    if (!a.atk.ready(slot) || !this.minRangeOk(a, enemies, slot)) return;
    const prev = this.st;
    this.st = a.atk;
    this.attack(a, { mx, my, dash: false, move: slot, interact: false, ult: false, swap: false }, enemies, slot);
    this.st = prev;
  }

  /** L'emplacement et les recharges que lisent le HUD et l'anneau de portée (invité en ligne : son propre Pokémon). */
  focus(a: Actor): void {
    this.st = a.atk;
  }

  /** Marques au sol en cours, pour les invités en ligne (seul ce qui sert à les dessiner). */
  exportStrikes(): StrikeSnap[] {
    return this.strikes.map((o) => ({ x: +o.x.toFixed(2), y: +o.y.toFixed(2), t: +o.t.toFixed(2), dur: o.dur, color: o.color, hostile: o.hostile, shape: o.area?.shape }));
  }

  /** Invité en ligne : les marques de l'hôte, dessinées telles quelles (jamais résolues ici). */
  importStrikes(list: readonly StrikeSnap[]): void {
    this.strikes = list.map((s) => ({ x: s.x, y: s.y, t: s.t, dur: s.dur, color: s.color, hostile: s.hostile, area: s.shape ? { shape: s.shape as AreaShape } : undefined }) as unknown as Strike);
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
    if (input.ult && mon && player.deathT < 0 && !player.evolve && !player.trapped) {
      this.hooks.ultimate(player, enemies, world, () => this.psyWaves.push(0.35 * this.psyWaves.length));
    }
    if (this.psyWaves.length) {
      this.psyWaves = this.psyWaves.map((t) => t - dt);
      while (this.psyWaves.length && this.psyWaves[0] <= 0) {
        this.psyWaves.shift();
        if (mon?.moves[this.st.selected]) this.attack(player, input, enemies, this.st.selected);
      }
    }
    if (input.move >= 0 && mon?.moves[input.move] && mon.canAct && player.deathT < 0 && !player.evolve && !player.trapped) {
      // Une touche sélectionne l'emplacement, puis le lance s'il est prêt et que rien n'est trop près.
      this.st.selected = input.move;
      if (this.ready(input.move) && this.minRangeOk(player, enemies, input.move)) this.attack(player, input, enemies, input.move);
    }

    // Les sauvages choisissent leur cible dans toute l'équipe sur le terrain (EnemyAI._find_target).
    const team = [player, ...allies];
    for (const e of enemies) e.brain?.update(dt, team, enemies, world, this);
    this.updateIntros(dt, enemies);
    this.updateEvolutions(dt, team);
    this.updateStrikes(dt, world, team);
    for (const e of enemies) this.updateEnemy(dt, e);
    this.hooks.tick(dt, player, enemies);
    for (const m of team) {
      const pm = m.pokemon;
      // En pleine évolution, l'ancienne forme ne s'use plus : la nouvelle repart PV pleins.
      if (!pm || m.deathT >= 0 || m.evolve) continue;
      pm.tickBuffs(dt);
      const dot = pm.tickStatus(dt);
      if (dot > 0) {
        this.fx.number('player', m.x, m.y, dot);
        if (pm.fainted) m.deathT = 0;
      }
    }
    this.weatherTick(dt, team, enemies);
    this.fx.update(dt);
  }

  /**
   * Usure de la tempête de sable et de la grêle (world/weather.ts) : toutes
   * les CHIP.every secondes, une part des PV max pour chaque Pokémon qui n'y
   * résiste pas, des deux côtés. Écart voulu : jamais sous 1 PV.
   */
  private weatherTick(dt: number, team: readonly Actor[], enemies: readonly Actor[]): void {
    const w = currentWeather();
    if (w !== 'sand' && w !== 'hail') return;
    this.weatherT += dt;
    if (this.weatherT < CHIP.every) return;
    this.weatherT = 0;
    for (const a of [...team, ...this.alive(enemies)]) {
      const mon = a.pokemon;
      if (!mon || mon.fainted || a.deathT >= 0 || a.evolve || !chips(w, mon.types) || mon.hp <= 1) continue;
      const dmg = Math.min(mon.hp - 1, Math.max(1, Math.round(mon.maxHp * CHIP.share)));
      mon.hp -= dmg;
      this.fx.number(team.includes(a) ? 'player' : 'normal', a.x, a.y, dmg);
    }
  }

  private alive(enemies: readonly Actor[]): Actor[] {
    return enemies.filter((e) => e.pokemon && !e.pokemon.fainted && e.deathT < 0 && !e.intro);
  }

  /** Mêlée d'un sauvage : dégâts calculés au moment du coup (EnemyAI._do_attack). */
  enemyMelee(e: Actor, target: Actor, power: number, type: string, cls: string, api?: string): void {
    if (!e.pokemon || !target.pokemon) return;
    // L'effet joue même si le coup rate : on voit les crocs claquer dans le vide.
    this.fx.moveCast(api, type, cls === 'special', () => e, () => target, 0, power);
    if (this.random() < e.pokemon.missChance) {
      this.fx.number('dodge', target.x, target.y);
      return;
    }
    const res = calculateDamage(e.pokemon, target.pokemon, power, type, cls, this.random);
    this.hitPlayer(target, res.damage, e.x, e.y, type, res.crit ? 'crit' : 'player');
  }

  /** Tir d'un sauvage : une marque fixe sous sa cible, dégâts figés au tir. */
  enemyShot(e: Actor, target: Actor, move: Move): void {
    if (!e.pokemon || !target.pokemon) return;
    const res = calculateDamage(e.pokemon, target.pokemon, move.power, move.type, 'special', this.random);
    // Précision baissée (Jet de Sable…) : le coup part quand même, mais il est voué à rater.
    const miss = this.random() < e.pokemon.missChance;
    const strike: Strike = {
      hostile: true,
      target,
      x: target.x,
      y: target.y,
      fromX: e.x,
      fromY: e.y,
      startCell: Math.floor(e.y) * 4096 + Math.floor(e.x),
      t: 0,
      dur: ENEMY_STRIKE_DELAY,
      type: move.type,
      color: typeColor(move.type),
      damage: res.damage,
      kind: miss ? 'dodge' : res.crit ? 'crit' : 'player',
      move: move.power > 0 ? move.api : undefined,
    };
    this.strikes.push(strike);
    // Le tir part du sauvage et arrive sur la marque quand elle frappe : on le voit venir.
    this.fx.moveCast(strike.move, move.type, true, () => e, () => strike, ENEMY_STRIKE_DELAY, move.power);
  }


  /**
   * Attaque de zone d'un champion ou de son as : posée tout de suite, elle
   * frappe après `delay` tous les membres encore dedans (dash et Abri
   * l'évitent, via hitPlayer). `x, y` : centre du disque, ou origine du rayon
   * et du cône. Une fois posée, elle part même si le lanceur est repoussé —
   * seul son K.O. l'annule.
   */
  enemyArea(e: Actor, shape: AreaShape, x: number, y: number, move: Move | null, power: number, delay: number): void {
    if (!e.pokemon) return;
    const type = move?.type ?? e.pokemon.types[0];
    this.strikes.push({
      hostile: true,
      area: { shape, source: e, power, cls: move?.damageClass === 'special' ? 'special' : 'physical' },
      target: null,
      x,
      y,
      fromX: e.x,
      fromY: e.y,
      startCell: -1,
      t: 0,
      dur: delay,
      type,
      move: move && move.power > 0 ? move.api : undefined,
      color: typeColor(type),
      damage: 0,
      kind: 'player',
    });
  }

  /** Nom de l'attaque signature d'un champion, au-dessus du lanceur, au moment où il la pose. */
  callout(e: Actor, text: string): void {
    this.fx.number('super', e.x, e.y - 0.4, 0, text);
  }

  /**
   * Une marque de sauvage ou une zone de champion qui va frapper en (x, y) :
   * le point d'où fuir (son centre, ou pour un rayon et un cône le point de
   * l'axe le plus proche), ou null si l'endroit est sûr. Les compagnons s'en
   * écartent (companion.ts).
   */
  threatAt(x: number, y: number): { x: number; y: number } | null {
    for (const o of this.strikes) {
      if (!o.hostile || o.t >= o.dur) continue;
      if (o.area) {
        if (!o.area.source?.pokemon || !this.inArea(o, o.area.shape, x, y)) continue;
        const sh = o.area.shape;
        if (sh.kind === 'line' || sh.kind === 'cone') {
          const along = Math.max(0, (x - o.x) * sh.dx + (y - o.y) * sh.dy);
          return { x: o.x + sh.dx * along, y: o.y + sh.dy * along };
        }
        return { x: o.x, y: o.y };
      }
      if (Math.hypot(x - o.x, y - o.y) <= ENEMY_STRIKE_RADIUS + 0.35) return { x: o.x, y: o.y };
    }
    return null;
  }

  /** Le point (px, py) est-il dans la zone ? */
  private inArea(o: Strike, shape: AreaShape, px: number, py: number): boolean {
    const rx = px - o.x;
    const ry = py - o.y;
    const d = Math.hypot(rx, ry);
    switch (shape.kind) {
      case 'circle':
        return d <= shape.r + AREA_BODY;
      case 'line': {
        // Projection sur l'axe du rayon (comme le dash des dons, boonhooks.onDashStart).
        const along = rx * shape.dx + ry * shape.dy;
        const side = Math.abs(rx * shape.dy - ry * shape.dx);
        return along >= -AREA_BODY && along <= shape.len + AREA_BODY && side <= shape.halfW + AREA_BODY;
      }
      case 'cone': {
        if (d > shape.r + AREA_BODY) return false;
        if (d < 0.6) return true;
        const cos = (rx * shape.dx + ry * shape.dy) / d;
        // Le corps élargit un peu l'angle, d'autant plus qu'on est près du lanceur.
        return Math.acos(Math.max(-1, Math.min(1, cos))) <= shape.half + Math.atan2(AREA_BODY, d);
      }
      case 'ring':
        return d >= shape.r0 - AREA_BODY && d <= shape.r + AREA_BODY;
    }
  }

  /** Une zone frappe : chaque membre dedans, dégâts selon sa propre défense ; l'animation couvre la forme. */
  private resolveArea(o: Strike, area: Area, team: readonly Actor[]): void {
    const src = area.source.pokemon!;
    for (const m of team) {
      if (!m.pokemon || m.pokemon.fainted || m.deathT >= 0 || !this.inArea(o, area.shape, m.x, m.y)) continue;
      if (this.random() < src.missChance) {
        this.fx.number('dodge', m.x, m.y);
        continue;
      }
      const res = calculateDamage(src, m.pokemon, area.power, o.type, area.cls, this.random);
      // Le recul part du centre du disque, ou du lanceur pour un rayon et un cône.
      this.hitPlayer(m, res.damage, o.x, o.y, o.type, res.crit ? 'crit' : 'player');
    }
    for (const [x, y] of areaPoints(o.x, o.y, area.shape)) this.fx.attackAnim(o.type, x, y, o.move);
    this.fx.impact(o.x, o.y, o.color);
    this.addShake(0.14);
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
        sfx(effect.stats.some(([, m]) => m >= 1) ? 'statUp' : 'statDown');
        this.fx.number('buff', player.x, player.y, 0, effect.stats.map(([st, m]) => `${BUFF_LABEL[st]} ${m >= 1 ? '↑' : '↓'}`).join(' '));
        break;
      case 'debuff': {
        // Tous les sauvages à portée de la capacité, cachés compris (c'est un cri, pas un tir).
        const reach = this.reach(player, slot);
        sfx('statDown');
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
        sfx('protect');
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
        // L'effet de la capacité sur chaque cible : crocs, griffes, poing…
        this.fx.moveCast(t === type ? moveApi : undefined, t, false, () => player, () => e, 0, power);
      }
      if (player === this.player) {
        this.addShake(finisher ? 0.22 : 0.05);
        if (finisher) {
          this.freeze(0.075);
          this.hooks.onFinisher(player, hit[0], first, this.enemies);
        }
      }
    } else {
      // Pas d'ennemi à portée : un arbre à baies tout près prend le coup (sa
      // case est bloquée, on se tient au moins à une case de son centre).
      const p = this.breakables(player.x, player.y, Math.max(reach, 1.4)) ?? this.swingPoint(player, input, Math.min(reach, 2));
      aimX = p.x;
      aimY = p.y;
      this.fx.attackAnim(type, aimX, aimY, moveApi);
      this.fx.moveCast(moveApi, type, false, () => player, () => p, 0, power);
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
    const strike: Strike = { hostile: false, target: best, x: 0, y: 0, fromX: player.x, fromY: player.y, startCell, t: 0, dur: STRIKE_DELAY, type, color, damage: 0, kind: 'normal', owner: player };
    if (best) {
      // Dégâts, critique et sorte de chiffre sont figés au tir (TeamMember.gd:1785-1794).
      strike.type = this.hooks.morph(type, best);
      strike.color = typeColor(strike.type);
      const res = calculateDamage(player.pokemon!, best.pokemon!, power, strike.type, 'special', this.random);
      strike.damage = Math.max(1, Math.round(res.damage * this.hooks.dmgOut(player, best)));
      strike.kind = res.crit ? 'crit' : kindFromMultiplier(res.effectiveness);
      strike.x = best.x;
      strike.y = best.y;
      this.face(player, best.x, best.y);
    } else {
      // Pas d'ennemi : le tir vise l'arbre à baies le plus proche, comme le
      // corps à corps (sinon il part droit devant, dans l'une des huit
      // directions, et passe à côté du tronc d'une case). Il bute sur sa case
      // bloquée (lineBlocked) et le frappe.
      const p = this.breakableNear(player.x, player.y, Math.min(reach, 7)) ?? this.swingPoint(player, input, Math.min(reach, 7));
      strike.x = p.x;
      strike.y = p.y;
      this.face(player, p.x, p.y);
    }
    // Morphing a pu changer le type : la planche propre à la capacité ne vaut que pour son type d'origine.
    if (strike.type === type) strike.move = moveApi;
    this.strikes.push(strike);
    // Le rayon, le projectile ou le souffle part du tireur et suit la marque (qui suit la cible).
    this.fx.moveCast(strike.move, strike.type, true, () => player, () => strike, STRIKE_DELAY, power);
    return player.playAction(['Shoot', 'Charge', 'Attack'], 0.4);
  }

  private face(a: Actor, x: number, y: number): void {
    if (Math.hypot(x - a.x, y - a.y) > 0.05) a.dir = dirFromVector(x - a.x, y - a.y);
  }

  private updateStrikes(dt: number, world: WorldMap, team: readonly Actor[]): void {
    this.strikes = this.strikes.filter((o) => {
      if (o.area) {
        // Le lanceur est tombé : sa zone s'éteint sans frapper.
        if (o.area.source.deathT >= 0 || !o.area.source.pokemon) return false;
        o.t += dt;
        if (o.t < o.dur) return true;
        this.resolveArea(o, o.area, team);
        return false;
      }
      const t = o.target;
      const alive = !!t && !!t.pokemon && !t.pokemon.fainted && t.deathT < 0;
      // Un coup de l'équipe suit sa cible ; si elle tombe entre-temps, il finit dans le vide.
      if (!o.hostile && t && alive) {
        o.x = t.x;
        o.y = t.y;
      }
      o.t += dt;
      if (o.t < o.dur) return true;
      const wall = this.lineBlocked(o, world);
      if (wall) {
        this.fx.impact(wall.x, wall.y, o.color);
        // Un tir de l'équipe qui bute sur un arbre à baies le frappe.
        if (!o.hostile) this.breakables(wall.x, wall.y, 0.9);
        return false;
      }
      if (o.hostile && t && alive && Math.hypot(t.x - o.x, t.y - o.y) <= ENEMY_STRIKE_RADIUS) {
        if (o.kind === 'dodge') this.fx.number('dodge', t.x, t.y);
        else this.hitPlayer(t, o.damage, o.fromX, o.fromY, o.type, o.kind);
        this.fx.attackAnim(o.type, t.x, t.y, o.move);
      } else if (!o.hostile && t && alive) {
        this.hitEnemy(t, o.damage, o.fromX, o.fromY, o.type, o.color, false, o.kind, true, o.move, o.owner ?? null);
      } else {
        this.fx.impact(o.x, o.y, o.color);
        this.fx.attackAnim(o.type, o.x, o.y, o.move);
        if (!o.hostile) this.breakables(o.x, o.y, 0.9);
      }
      return false;
    });
  }

  /**
   * Un tronc, un rocher ou un mur entre le tireur et la marque arrête le coup
   * (Projectile.gd:119-123, que l'orbe vérifiait en vol) : on renvoie le point
   * d'arrêt, ou null si la voie est libre.
   */
  private lineBlocked(o: Strike, world: WorldMap): { x: number; y: number } | null {
    const len = Math.hypot(o.x - o.fromX, o.y - o.fromY);
    const steps = Math.ceil(len / 0.25);
    for (let i = 1; i <= steps; i++) {
      const x = o.fromX + ((o.x - o.fromX) * i) / steps;
      const y = o.fromY + ((o.y - o.fromY) * i) / steps;
      const cx = Math.floor(x);
      const cy = Math.floor(y);
      if (cy * 4096 + cx === o.startCell || cx < 0 || cy < 0 || cx >= world.w || cy >= world.h) continue;
      const c = cy * world.w + cx;
      if (world.blocked[c] && !world.water[c]) return { x, y };
    }
    return null;
  }

  /** EnemyAI.take_damage (+ stagger_from pour le finisher). */
  /**
   * `ranged` : attaque spéciale (null pour un coup qui ne vient pas d'une attaque) ;
   * `by` : le membre qui frappe — seuls les coups du Pokémon joué figent l'écran
   * et déclenchent ses dons.
   */
  private hitEnemy(e: Actor, damage: number, fromX: number, fromY: number, type: string, color: string, finisher: boolean, kind: NumberKind, ranged: boolean | null, moveApi?: string, by: Actor | null = null): void {
    // En pleine entrée en puissance : le coup (déjà parti) se perd.
    if (e.intro) return;
    this.dealtBy(by, Math.min(damage, e.pokemon?.hp ?? 0));
    const fatal = this.dealt(e, damage);
    if (by) e.hitBy.add(by);
    // Un Pokémon de champion ne joue pas la douleur (voir knockbackMult).
    const boss = e.role !== 'wild';
    if (!boss) e.playAction(['Hurt'], 0.3);
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
    if (!boss && (finisher || (!fatal && e.poiseT <= 0 && !windingUp))) {
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
    // Le « pac » des jeux selon l'efficacité, coup fatal compris (le cri du K.O. suit, dans kill).
    sfx(kind === 'super' || kind === 'crit' ? 'hitSuper' : kind === 'weak' || kind === 'immune' ? 'hitWeak' : 'hit');
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
    // Écart voulu : le cri du Pokémon qui tombe, plus grave (les jeux) ; un
    // Pokémon de champion y ajoute le bruit du K.O., comme en combat de dresseur.
    if (e.role !== 'wild') sfx('faint');
    cry(e.speciesId, e.role === 'wild' ? -5 : 0, 0.85);
    this.defeated(e);
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
        sfx('levelup');
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
    if (!mon || mon.fainted || player.deathT >= 0 || player.evolve || player.trapped) return;
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
    this.taken(player, Math.min(damage, mon.hp));
    mon.hp = Math.max(0, mon.hp - damage);
    // Un compagnon touché sonne plus bas que le Pokémon joué (TeamMember.gd:1966) ;
    // les deux un peu plus graves que les coups portés, pour les distinguer à l'oreille.
    sfx('hurt', own ? 0 : -6, own ? 0.9 : 0.85);
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
      this.hurt();
    }
    const roll = STATUS_ROLL[type];
    if (!mon.fainted && roll && this.random() < roll[1]) mon.applyStatus(roll[0]);
    if (mon.fainted) {
      sfx('faint', own ? 0 : -4);
      cry(player.speciesId, own ? 0 : -4, 0.85);
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

  /** Marques au sol des attaques spéciales sur le point de frapper, sous les Pokémon. */
  drawStrikes(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void {
    this.powerUps.drawGround(b, camX, camY, k);
    for (const o of this.strikes) {
      if (o.area) this.fx.drawArea(b, camX, camY, k, o.x, o.y, o.area.shape, o.t / o.dur, o.color);
      else this.fx.drawMark(b, camX, camY, k, o.x, o.y, o.hostile ? ENEMY_STRIKE_RADIUS : STRIKE_RADIUS, o.t / o.dur, o.color, o.hostile);
    }
  }
}

/** Où jouer l'animation de la capacité quand une zone frappe : le centre, puis de quoi couvrir la forme. */
function areaPoints(x: number, y: number, shape: AreaShape): [number, number][] {
  switch (shape.kind) {
    case 'circle': {
      const pts: [number, number][] = [[x, y]];
      if (shape.r < 1.5) return pts;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        pts.push([x + Math.cos(a) * shape.r * 0.6, y + Math.sin(a) * shape.r * 0.6]);
      }
      return pts;
    }
    case 'line': {
      const pts: [number, number][] = [];
      for (let d = 1; d <= shape.len; d += 1.6) pts.push([x + shape.dx * d, y + shape.dy * d]);
      return pts;
    }
    case 'ring': {
      // Une animation tous les ~1,8 case sur le cercle médian, 12 au plus.
      const mid = (shape.r0 + shape.r) / 2;
      const n = Math.min(12, Math.max(4, Math.round((2 * Math.PI * mid) / 1.8)));
      const pts: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push([x + Math.cos(a) * mid, y + Math.sin(a) * mid]);
      }
      return pts;
    }
    case 'cone': {
      const pts: [number, number][] = [];
      const base = Math.atan2(shape.dy, shape.dx);
      for (const f of [0.45, 0.8]) {
        for (const s of [-0.6, 0, 0.6]) {
          const a = base + s * shape.half;
          pts.push([x + Math.cos(a) * shape.r * f, y + Math.sin(a) * shape.r * f]);
        }
      }
      return pts;
    }
  }
}

