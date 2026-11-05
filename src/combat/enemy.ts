import { dirFromVector, type Actor } from '../entities/actor';
import type { WorldMap } from '../world/generate';
import type { AreaShape, Combat } from './combat';
import { typeMultiplier } from './damage';
import type { Move } from './moves';
import { NavAgent } from './nav';
import type { BuffStat } from './pokemon';
import { SIGNATURES } from './signatures';
import { sfx } from '../audio/audio';

// IA d'un sauvage, reprise d'EnemyAI.gd. Distances en cases (= unités Godot).
//
// Un sauvage dort tant qu'on ne l'a pas approché à 9 cases ou frappé, puis
// suit son archétype : il fonce, garde ses distances pour tirer, charge, harcèle
// ou soutient ses voisins. Chaque attaque est annoncée : le Pokémon s'écrase
// et blanchit, un anneau rouge grandit sous lui, puis le coup part — et rate
// si la cible s'est éloignée au-delà de 1,35 × la portée entre-temps.
//
// Écarts voulus avec le jeu (bugs de la version Godot, cf. PORTAGE.md D7) :
// - le finisher qui interrompt une anticipation remet tout à zéro (le jeu
//   laissait la ruée du chargeur armée et le sprite écrasé) ;
// - un recul interrompt la ruée au lieu de la mettre en pause ;
// - un sauvage pas encore provoqué flâne (le prototype en avait besoin pour
//   la DA) au lieu de rester planté ; dans l'herbe haute il reste immobile,
//   pour que l'embuscade tienne.

export type Behavior = 'chaser' | 'kiter' | 'charger' | 'skirmisher' | 'support';

/** EnemyAI.gd:8-10 et constantes d'archétypes. */
const SPEED = 3.4;
const ATTACK_RANGE = 2.8;
const RANGED_RANGE = 6.5;
const ATTACK_COOLDOWN = 1.8;
/** Le coup part si la cible est encore à moins de portée × 1,35 à la fin de l'anticipation. */
const RANGE_SLACK = 1.35;
const WINDUP = 0.32;
const AGGRO_RANGE = 9;
const KITE_MIN = 5;
const CHARGE_RANGE = 11;
const CHARGE_WINDUP = 2.2;
const CHARGE_SPEED = 15;
const CHARGE_TIME = 0.35;
const SKIRMISH_RETREAT = 0.9;
const SKIRMISH_RETREAT_DIST = 4.5;
const SUPPORT_RADIUS = 9;
const SUPPORT_KEEPAWAY = 6;
const CHANT_EVERY = 5;
const BUFF_MULT = 1.25;
const BUFF_TIME = 7;
/**
 * Champions et as : ils attaquent plus souvent (recharge ×0,75) et lancent
 * des attaques de zone (Combat.enemyArea). Écart voulu avec le jeu : à quatre
 * Pokémon, un boss qui ne faisait que viser une cible toutes les 1,8 s
 * tombait sans jamais inquiéter l'équipe (retour de test).
 */
const BOSS_COOLDOWN_MULT = 0.75;
/** Première zone peu après l'entrée en scène, puis une toutes les AREA_COOLDOWN s. */
const AREA_FIRST = 3.5;
const AREA_COOLDOWN = { champion: 6, boss: 4.5 };
/** Temps entre la pose de la zone et l'impact : plus long qu'un tir (0,45 s), la zone étant bien plus grande. */
const AREA_DELAY = { champion: 0.85, boss: 0.75 };
/** Puissance d'une zone (× celle de la capacité), et de chaque disque de la pluie. */
const AREA_POWER = 1.25;
const RAIN_POWER = 0.6;
/** Disque autour du lanceur : il faut quelqu'un à moins de SHOCK_TRIGGER pour qu'il le lance. */
const SHOCK_RADIUS = 2.6;
const SHOCK_TRIGGER = 3.2;
const BEAM_LEN = 9;
const BEAM_HALF_WIDTH = 0.6;
const CONE_RADIUS = 5;
const CONE_HALF = (35 * Math.PI) / 180;
const RAIN_RADIUS = 1.1;
/**
 * Forme de zone selon le type de la capacité : le sol et la roche font
 * trembler autour du lanceur, le feu, le poison, les ténèbres… soufflent
 * devant lui ; le reste (électrik, glace, psy, eau, dragon…) part en rayon.
 */
const AREA_OF: Record<string, AreaShape['kind']> = {
  ground: 'circle', rock: 'circle', fighting: 'circle', steel: 'circle',
  fire: 'cone', poison: 'cone', dark: 'cone', flying: 'cone', grass: 'cone', bug: 'cone', ghost: 'cone',
};

/** Herbe : un Pokémon y est invisible à plus de 3,6 cases de l'autre camp. */
export const GRASS_REVEAL_DIST = 3.6;
/** Le joueur reste repérable 2,5 s après avoir attaqué, même dans l'herbe. */
export const GRASS_REVEAL_TIME = 2.5;

/** EnemyAI.setup : une attaque spéciale fait un tireur ; sinon l'espèce décide. */
function pickBehavior(id: number, ranged: Move | null): Behavior {
  if (ranged) return 'kiter';
  // Le jeu prend abs(hash(id)) % 6 ; on prend l'identifiant lui-même, tout aussi fixe par espèce.
  return (['charger', 'skirmisher', 'support', 'chaser', 'chaser', 'chaser'] as const)[id % 6];
}

/** Sur une case d'herbe haute ? */
export function onTallGrass(world: WorldMap, a: Actor): boolean {
  if (!world.biome.tallGrass) return false;
  const cx = Math.floor(a.x);
  const cy = Math.floor(a.y - 0.05);
  // (Les vraies hautes herbes, `hide` : les petites herbes ne cachent plus personne.)
  return cx >= 0 && cy >= 0 && cx < world.w && cy < world.h && world.hide[cy * world.w + cx] === 1;
}

export class EnemyBrain {
  readonly behavior: Behavior;
  /** Attaque spéciale du tireur (sinon il frappe au contact avec sa première capacité). */
  readonly ranged: Move | null;
  aggro = false;
  private wakeDelay = Math.random() * 1.2;
  private attackT = 0;
  /** Prochaine attaque de zone (champions et as). */
  private areaT = AREA_FIRST;
  /** L'anticipation en cours est la pose d'une zone (déjà au sol) : rien à lancer à la fin. */
  private areaCasting = false;
  /** La prochaine zone sera la signature du champion (la première l'est : on la reconnaît d'entrée). */
  private signatureNext = true;
  /** Suites d'une signature (salves de Prémonition, Roulades…), en s restantes. */
  private pending: { t: number; fn: () => void }[] = [];
  /** Anticipation en cours (s restantes), et cible verrouillée pendant ce temps. */
  private windup = 0;
  private windupTarget: Actor | null = null;
  private chargePending = false;
  private chargeT = 0;
  private chargeDx = 0;
  private chargeDy = 0;
  private retreatT = 0;
  private chantCd = 0;
  /** A déjà attaqué : il ne se cache plus dans l'herbe. */
  private revealed = false;
  private readonly nav = new NavAgent();
  /** Vitesse de fuite demandée au pas en cours, et celle du pas précédent (détection d'acculement). */
  private fleeing = 0;
  private fled = 0;

  constructor(readonly actor: Actor) {
    const moves = actor.pokemon?.moves ?? [];
    this.ranged = moves.find((m) => m.damageClass === 'special' && m.power > 0) ?? null;
    // Champions et as : poursuivants, sauf tireurs (testé avant, comme EnemyAI.setup). Provoqués d'emblée.
    this.behavior = actor.role !== 'wild' && !this.ranged ? 'chaser' : pickBehavior(actor.speciesId, this.ranged);
    if (actor.role !== 'wild') {
      this.aggro = true;
      this.revealed = true;
    }
  }

  /** Anticipation plus longue pour un champion (×1,25) et son as (×1,6). */
  private get windupMult(): number {
    return this.actor.role === 'boss' ? 1.6 : this.actor.role === 'champion' ? 1.25 : 1;
  }

  /** Recharge entre deux attaques, raccourcie pour un champion et son as. */
  private get cooldown(): number {
    return this.actor.role === 'wild' ? ATTACK_COOLDOWN : ATTACK_COOLDOWN * BOSS_COOLDOWN_MULT;
  }

  get attackRange(): number {
    return this.ranged ? RANGED_RANGE : ATTACK_RANGE;
  }

  /** Durée totale de l'anticipation en cours (pour le rendu). */
  windupLeft(): number {
    return this.windup;
  }

  /** Repos : plus de provocation (le joueur s'est relevé au départ). */
  calm(): void {
    this.aggro = false;
    this.wakeDelay = Math.random() * 1.2;
    this.cancelWindup();
    this.pending = [];
    this.chargeT = 0;
    this.attackT = 0;
    this.retreatT = 0;
    this.chantCd = 0;
    // Pas de zone ni de signature dès le réveil : le délai d'ouverture repart.
    this.areaT = AREA_FIRST;
    this.signatureNext = true;
    this.nav.reset();
  }

  /** Finisher ou mort : l'anticipation s'arrête net, ruée comprise. */
  cancelWindup(): void {
    this.windup = 0;
    this.windupTarget = null;
    this.chargePending = false;
    this.areaCasting = false;
    this.actor.windup = { t: 0, dur: 0, ring: 1.4 };
  }

  /** Recul : une ruée en cours s'arrête. */
  interrupt(): void {
    this.chargeT = 0;
  }

  provoke(): void {
    this.aggro = true;
  }

  /** `team` : les membres de l'équipe sur le terrain, le Pokémon joué en premier. */
  update(dt: number, team: readonly Actor[], enemies: readonly Actor[], world: WorldMap, combat: Combat): void {
    const a = this.actor;
    const mon = a.pokemon;
    if (!mon || a.deathT >= 0) return;
    mon.tickBuffs(dt);
    this.attackT -= dt;
    this.areaT -= dt;
    // Les suites d'une signature partent même endormi ou repoussé : la figure est lancée.
    if (this.pending.length) {
      for (const p of this.pending) p.t -= dt;
      const due = this.pending.filter((p) => p.t <= 0);
      this.pending = this.pending.filter((p) => p.t > 0);
      for (const p of due) p.fn();
    }
    this.chantCd -= dt;
    this.retreatT -= dt;
    this.fled = this.fleeing * dt;
    this.fleeing = 0;
    this.stop();
    // Entrée en puissance (Combat.bossIntro) : il ne fait rien d'autre.
    if (a.intro) return;

    // Caché dans l'herbe tant qu'il n'a pas attaqué et que personne n'est tout près.
    const dPlayer = Math.min(...team.map((m) => Math.hypot(m.x - a.x, m.y - a.y)));
    a.hidden = !this.revealed && onTallGrass(world, a) && dPlayer >= GRASS_REVEAL_DIST;

    // Endormi ou gelé : tout s'arrête, anticipation comprise (elle reprendra).
    if (!mon.canAct || a.kbT > 0) return;

    if (this.windup > 0) {
      this.windup -= dt;
      a.windup.t += dt;
      if (this.windup <= 0) this.finishWindup(combat);
      return;
    }

    if (this.chargeT > 0) {
      this.chargeT -= dt;
      a.steerVx = this.chargeDx * CHARGE_SPEED * mon.speedMult;
      a.steerVy = this.chargeDy * CHARGE_SPEED * mon.speedMult;
      const t = this.findTarget(team, combat, world);
      // Arrivé au contact : la ruée s'arrête et le coup part sans nouvelle anticipation.
      if (t && Math.hypot(t.x - a.x, t.y - a.y) <= ATTACK_RANGE * 0.9) {
        this.chargeT = 0;
        this.stop();
        this.doAttack(t, combat);
      }
      return;
    }

    const target = this.findTarget(team, combat, world);
    if (!this.aggro) {
      this.wakeDelay -= dt;
      if (this.wakeDelay <= 0 && target && Math.hypot(target.x - a.x, target.y - a.y) <= AGGRO_RANGE) {
        this.aggro = true;
        // Écart voulu : le « ! » des dresseurs qui vous repèrent (limité à un toutes les 0,5 s).
        sfx('alert');
      }
      else {
        a.wander = !onTallGrass(world, a);
        return;
      }
    }
    a.wander = false;
    if (!target) return;

    if (a.role !== 'wild' && this.areaT <= 0 && this.tryArea(target, team, combat)) return;
    const d = Math.hypot(target.x - a.x, target.y - a.y);
    switch (this.supportFallback(enemies)) {
      case 'chaser':
        if (d > this.attackRange) this.approach(target, 1, dt, world);
        else this.holdAndAttack(target);
        break;
      case 'kiter':
        // Acculé (sa fuite ne l'éloigne plus) : il tient sa position et tire. Le jeu
        // le laissait fuir contre le mur sans jamais riposter.
        if (d < KITE_MIN && !this.cornered()) this.flee(target, 0.95);
        else if (d < KITE_MIN) this.holdAndAttack(target);
        else if (d > RANGED_RANGE) this.approach(target, 1, dt, world);
        else this.holdAndAttack(target);
        break;
      case 'charger':
        if (d <= ATTACK_RANGE) this.holdAndAttack(target);
        else if (d < CHARGE_RANGE && this.attackT <= 0) {
          this.chargePending = true;
          this.startWindup(target, CHARGE_WINDUP);
        } else this.approach(target, 0.85, dt, world);
        break;
      case 'skirmisher':
        if (this.retreatT > 0) {
          if (d < SKIRMISH_RETREAT_DIST) this.flee(target, 1.1);
        } else if (d > ATTACK_RANGE) this.approach(target, 1.15, dt, world);
        else this.holdAndAttack(target);
        break;
      case 'support':
        this.support(target, enemies, combat);
        break;
    }
  }

  /**
   * Un soutien sans allié qui se bat à portée se bat comme un poursuivant.
   * Écart voulu avec le jeu : un autre soutien ne compte pas — deux soutiens
   * restés seuls se renforçaient l'un l'autre à l'écart, sans jamais venir, et
   * la salle ne se libérait plus.
   */
  private supportFallback(enemies: readonly Actor[]): Behavior {
    if (this.behavior !== 'support') return this.behavior;
    return this.allies(enemies).some((e) => e.brain?.behavior !== 'support') ? 'support' : 'chaser';
  }

  private allies(enemies: readonly Actor[]): Actor[] {
    const a = this.actor;
    return enemies.filter((e) => e !== a && e.pokemon && e.deathT < 0 && Math.hypot(e.x - a.x, e.y - a.y) <= SUPPORT_RADIUS);
  }

  /**
   * EnemyAI._find_target : le membre de l'équipe qui craint le plus son
   * attaque, à distance égale (efficacité × 44 − distance) ; les immunisés ne
   * sont visés qu'à défaut, au plus près. Jamais un K.O., ni le Pokémon joué
   * caché dans l'herbe (loin, et sans avoir attaqué depuis 2,5 s).
   */
  private findTarget(team: readonly Actor[], combat: Combat, world: WorldMap): Actor | null {
    const a = this.actor;
    const mon = a.pokemon!;
    const type = (this.ranged ?? mon.moves[0])?.type ?? mon.types[0];
    let best: Actor | null = null;
    let bestScore = -Infinity;
    let nearest: Actor | null = null;
    let nearestD = Infinity;
    team.forEach((m, i) => {
      if (!m.pokemon || m.pokemon.fainted || m.deathT >= 0 || m.trapped) return;
      const d = Math.hypot(m.x - a.x, m.y - a.y);
      if (i === 0 && d >= GRASS_REVEAL_DIST && onTallGrass(world, m) && combat.sinceAttack >= GRASS_REVEAL_TIME) return;
      if (d < nearestD) {
        nearest = m;
        nearestD = d;
      }
      const mult = typeMultiplier(type, m.pokemon.types);
      if (mult <= 0) return;
      const score = mult * 44 - d;
      if (score > bestScore) {
        best = m;
        bestScore = score;
      }
    });
    return best ?? nearest;
  }

  private stop(): void {
    this.actor.steerVx = 0;
    this.actor.steerVy = 0;
  }

  private approach(target: Actor, mult: number, dt: number, world: WorldMap): void {
    const a = this.actor;
    const dir = this.nav.direction(dt, world, a.x, a.y, target.x, target.y, a.canSwim);
    const v = SPEED * mult * a.pokemon!.speedMult;
    a.steerVx = dir.x * v;
    a.steerVy = dir.y * v;
  }

  /** A fui au pas précédent sans presque bouger : un obstacle l'en empêche. */
  private cornered(): boolean {
    const a = this.actor;
    if (!this.fled) return false;
    return Math.hypot(a.x - a.prevX, a.y - a.prevY) < this.fled * 0.2;
  }

  /** Fuite en ligne droite (pas d'A*, comme le jeu) ; l'eau l'arrête s'il ne nage pas. */
  private flee(target: Actor, mult: number): void {
    const a = this.actor;
    const len = Math.hypot(a.x - target.x, a.y - target.y) || 1;
    const v = SPEED * mult * a.pokemon!.speedMult;
    this.fleeing = v;
    a.steerVx = ((a.x - target.x) / len) * v;
    a.steerVy = ((a.y - target.y) / len) * v;
  }

  private holdAndAttack(target: Actor): void {
    if (this.attackT <= 0) this.startWindup(target, 1);
  }

  private startWindup(target: Actor, mult: number): void {
    // Il sort de l'herbe dès qu'il prépare son coup : une anticipation invisible ne s'esquive pas.
    this.revealed = true;
    this.actor.hidden = false;
    this.windup = WINDUP * mult * this.windupMult;
    this.windupTarget = target;
    this.actor.windup = { t: 0, dur: this.windup, ring: this.actor.role === 'boss' ? 2.2 : 1.4 };
    this.face(target.x, target.y);
  }

  private finishWindup(combat: Combat): void {
    const a = this.actor;
    const t = this.windupTarget;
    a.windup = { t: 0, dur: 0, ring: 1.4 };
    this.windupTarget = null;
    if (this.areaCasting) {
      // La zone frappe d'elle-même : le lanceur se détend, l'animation part avec elle.
      this.areaCasting = false;
      a.playAction(['Shoot', 'Attack'], 0.4);
      a.flash = { color: '#ffffff', t: 0.1, dur: 0.1, alpha: 0.55 };
      return;
    }
    if (this.chargePending) {
      // Ruée vers la position de la cible à cet instant, sans test de portée.
      this.chargePending = false;
      const tx = t ? t.x : a.x;
      const ty = t ? t.y : a.y + 1;
      const len = Math.hypot(tx - a.x, ty - a.y) || 1;
      this.chargeDx = (tx - a.x) / len;
      this.chargeDy = (ty - a.y) / len;
      this.chargeT = CHARGE_TIME;
      this.attackT = this.cooldown;
      return;
    }
    const alive = t && t.pokemon && !t.pokemon.fainted && t.deathT < 0 && !t.trapped;
    if (!t || !alive || Math.hypot(t.x - a.x, t.y - a.y) > this.attackRange * RANGE_SLACK) {
      // Raté : la cible est sortie de portée. Recharge raccourcie, fente dans le vide.
      this.attackT = this.cooldown * 0.6;
      if (t) this.lunge(t.x, t.y);
      return;
    }
    this.doAttack(t, combat);
  }

  /**
   * Attaque de zone d'un champion ou de son as, selon le type de sa capacité
   * (AREA_OF) ; l'as sur ses deux dernières barres fait aussi pleuvoir des
   * disques sous chaque membre. Rend faux si la forme n'atteindrait personne
   * (on réessaiera au pas suivant).
   */
  private tryArea(target: Actor, team: readonly Actor[], combat: Combat): boolean {
    const a = this.actor;
    const mon = a.pokemon!;
    const role = a.role === 'boss' ? 'boss' : 'champion';
    const move = this.ranged ?? mon.moves.find((m) => m.power > 0) ?? null;
    const type = move?.type ?? mon.types[0];
    const power = Math.max(40, move?.power ?? 40);
    const delay = AREA_DELAY[role];
    const alive = team.filter((m) => m.pokemon && !m.pokemon.fainted && m.deathT < 0);
    const sig = a.signature ? SIGNATURES[a.signature] : undefined;
    if (sig && this.signatureNext) {
      const dur = sig.cast({
        caster: a,
        target,
        alive,
        delay,
        area: (shape, x, y, pow, t) => combat.enemyArea(a, shape, x, y, move, power * pow, t),
        later: (t, fn) => this.pending.push({ t, fn }),
        quake: (t) => this.pending.push({ t, fn: () => sfx('quake') }),
      });
      if (dur !== null) {
        this.castArea(target, dur);
        this.signatureNext = false;
        combat.callout(a, sig.name);
        sfx('ability');
        return true;
      }
      // Hors de portée de sa figure : la zone de son type à la place, la signature attendra.
    }
    if (role === 'boss' && a.barsLeft <= 2 && Math.random() < 0.5) {
      // Pluie : un disque sur chaque membre, deux autour, en cascade.
      let n = 0;
      for (const m of alive) {
        for (let j = 0; j < 3; j++) {
          const ang = Math.random() * Math.PI * 2;
          const off = j === 0 ? 0 : 0.8 + Math.random() * 1.2;
          combat.enemyArea(a, { kind: 'circle', r: RAIN_RADIUS }, m.x + Math.cos(ang) * off, m.y + Math.sin(ang) * off, move, power * RAIN_POWER, delay + n++ * 0.12);
        }
      }
      this.castArea(target, delay);
      return true;
    }
    const d = Math.hypot(target.x - a.x, target.y - a.y);
    const dx = (target.x - a.x) / (d || 1);
    const dy = (target.y - a.y) / (d || 1);
    switch (AREA_OF[type] ?? 'line') {
      case 'circle':
        if (!alive.some((m) => Math.hypot(m.x - a.x, m.y - a.y) <= SHOCK_TRIGGER)) return false;
        combat.enemyArea(a, { kind: 'circle', r: SHOCK_RADIUS }, a.x, a.y, move, power * AREA_POWER, delay);
        break;
      case 'cone':
        if (d > CONE_RADIUS + 0.5) return false;
        combat.enemyArea(a, { kind: 'cone', r: CONE_RADIUS, half: CONE_HALF, dx, dy }, a.x, a.y, move, power * AREA_POWER, delay);
        break;
      case 'line':
        if (d > BEAM_LEN) return false;
        combat.enemyArea(a, { kind: 'line', len: BEAM_LEN, halfW: BEAM_HALF_WIDTH, dx, dy }, a.x, a.y, move, power * AREA_POWER, delay);
        break;
    }
    this.castArea(target, delay);
    return true;
  }

  /** Le lanceur tient la pose (sans anneau : la zone au sol suffit) jusqu'à l'impact. */
  private castArea(target: Actor, delay: number): void {
    const a = this.actor;
    this.areaT = AREA_COOLDOWN[a.role === 'boss' ? 'boss' : 'champion'];
    // Une zone de type posée : la suivante sera la signature (tryArea la remet à faux après la sienne).
    this.signatureNext = true;
    this.attackT = Math.max(this.attackT, delay + 0.35);
    this.revealed = true;
    a.hidden = false;
    this.windup = delay;
    this.windupTarget = null;
    this.areaCasting = true;
    a.windup = { t: 0, dur: delay, ring: 0.4 };
    this.face(target.x, target.y);
    a.playAction(['Charge', 'Attack'], 0.4);
  }

  /** EnemyAI._do_attack */
  private doAttack(target: Actor, combat: Combat): void {
    const a = this.actor;
    const mon = a.pokemon!;
    this.attackT = this.cooldown;
    this.revealed = true;
    a.hidden = false;
    this.face(target.x, target.y);
    if (this.ranged) {
      combat.enemyShot(a, target, this.ranged);
      a.playAction(['Shoot', 'Charge', 'Attack'], 0.4);
      return;
    }
    // Mêlée : la première capacité ; sans puissance, 40 ; une capacité de statut frappe en physique.
    const first = mon.moves[0];
    const type = first?.type ?? mon.types[0];
    const power = first && first.power > 0 ? first.power : 40;
    const cls = first?.damageClass === 'special' ? 'special' : 'physical';
    combat.enemyMelee(a, target, power, type, cls);
    this.lunge(target.x, target.y);
    a.playAction(['Attack'], 0.4);
    if (this.behavior === 'skirmisher') this.retreatT = SKIRMISH_RETREAT;
  }

  /** Chant du soutien : +25 % sur une stat (fixe par espèce) pour les 3 premiers alliés, 7 s. */
  private support(target: Actor, enemies: readonly Actor[], combat: Combat): void {
    const a = this.actor;
    if (this.chantCd <= 0) {
      this.chantCd = CHANT_EVERY;
      const stat = (['atk', 'spd', 'def'] as BuffStat[])[a.speciesId % 3];
      for (const ally of this.allies(enemies).slice(0, 3)) {
        ally.pokemon!.applyBuff(stat, BUFF_MULT, BUFF_TIME);
        combat.fx.attackAnim('fx_boost', ally.x, ally.y);
      }
      a.playAction(['Charge', 'Attack'], 0.5);
      sfx('statUp', -4);
      a.flash = { color: '#ffe0a0', t: 0.25, dur: 0.25, alpha: 0.6 };
    }
    // Il ne frappe pas tant qu'il a des alliés : il garde ses distances.
    if (Math.hypot(target.x - a.x, target.y - a.y) < SUPPORT_KEEPAWAY) this.flee(target, 0.9);
  }

  /** Fente de 0,6 case et flash blanc (EnemyAI._play_attack_lunge). */
  private lunge(tx: number, ty: number): void {
    const a = this.actor;
    const len = Math.hypot(tx - a.x, ty - a.y) || 1;
    a.lunge = { dx: ((tx - a.x) / len) * 0.6, dy: ((ty - a.y) / len) * 0.6, t: 0 };
    a.flash = { color: '#ffffff', t: 0.1, dur: 0.1, alpha: 0.55 };
  }

  private face(x: number, y: number): void {
    const a = this.actor;
    if (Math.hypot(x - a.x, y - a.y) > 0.05) a.dir = dirFromVector(x - a.x, y - a.y);
  }
}
