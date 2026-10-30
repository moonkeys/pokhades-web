import { Rng } from '../core/rng';
import type { Actor } from '../entities/actor';
import type { InputSample } from '../input/input';
import type { CombatFx, Projector } from '../render/combatfx';
import { withAlpha } from '../render/combatfx';
import type { Exit, WorldMap } from '../world/generate';
import { TILE } from '../world/tiles';
import { REWARD_COLOR, REWARD_LABEL, type ExitOffer, type Reward, type Run } from './run';
import { SWIMMERS } from '../data/species';

// Déroulé d'une salle, repris de CombatArena.gd (_start_zone, vagues,
// _on_room_cleared, portes, _do_advance) :
//   arrivée (fondu depuis le noir) → courte pause → vagues annoncées par un
//   anneau magenta au sol → salle libérée (+₽) → récompense au centre et
//   portes ouvertes, chacune annonçant ce qu'elle promet → on passe une porte
//   (fondu au noir, nouvelle carte).
//
// Salle de boss : 6 vagues, une par Pokémon du champion (l'as en dernier),
// chacun escorté de sbires ; ils sortent de Poké Balls au lieu de l'anneau
// magenta. La boutique (shop.ts) n'a pas d'ennemis : sa porte unique, vers
// le boss, est ouverte dès l'arrivée.

/** Pause avant la première vague : 1,2 s en début de run, 0,8 s après une porte (CombatArena.gd:908, 7415). */
const FIRST_DELAY = 1.2;
const NEXT_DELAY = 0.8;
/** Salle de boss : 1,8 s de mise en scène (dialogue, annonce) avant la première vague (CombatArena.gd:1616). */
const BOSS_DELAY = 1.8;
/** Anneau d'annonce avant qu'un Pokémon ne se matérialise (CombatArena.gd:2281-2299). */
const SPAWN_ANNOUNCE = 0.55;
/** Entre deux vagues, après le dernier K.O. d'une salle, puis avant l'ouverture des portes. */
const WAVE_GAP = 1.4;
const CLEAR_DELAY = 1;
const OPEN_DELAY = 0.8;
/** Fondu au noir et retour (CombatArena._transition_to_next_zone). */
const FADE = 0.5;
/** Rayon de ramassage de la récompense au centre (Area3D de rayon 1,2). */
const PICKUP_RADIUS = 1.2;
/**
 * Distance minimale au joueur d'un point d'apparition. Le jeu n'en a pas ;
 * sans elle, un Pokémon pouvait se matérialiser au contact et frapper aussitôt.
 */
const SPAWN_MIN_DIST = 5;

type Phase = 'intro' | 'waves' | 'cleared' | 'open' | 'fadeOut' | 'over';

type Role = 'wild' | 'champion' | 'boss';

interface PendingSpawn {
  id: number;
  level: number;
  role: Role;
  x: number;
  y: number;
  t: number;
}

interface Door {
  exit: Exit;
  offer: ExitOffer;
  label: HTMLElement;
}

export interface RoomHost {
  spawnEnemy(id: number, level: number, x: number, y: number, role: Role): void;
  /** Salle de boss : le champion entre en scène (dresseur, dialogue, annonce). */
  bossIntro(exit: Exit | null): void;
  /** Notification à droite du HUD. */
  message(text: string): void;
  /** Message central sur bande de papier (« Salle libérée ! », avec son gain). */
  toast(text: string, stamp?: string): void;
  /** Change de salle, pendant que l'écran est noir. */
  nextRoom(offer: ExitOffer): void;
  /** Le boss final est tombé. */
  victory(): void;
  /** La salle vient d'être libérée (dons de fin de salle). */
  roomCleared(): void;
  /** La récompense apparaît au centre : on tire son offre maintenant, elle ne changera plus. */
  prepareReward(reward: Reward): void;
  /** Ouvre l'écran de choix ; `consume` retire la récompense une fois prise. */
  openReward(reward: Reward, consume: () => void): void;
}

export class RoomDirector {
  phase: Phase = 'over';
  private t = 0;
  private waves: { id: number; level: number; role: Role }[][] = [];
  private wave = 0;
  private pending: PendingSpawn[] = [];
  /** Sauvages déjà comptés comme K.O. */
  private readonly counted = new Set<Actor>();
  killed = 0;
  total = 0;
  level = 0;
  private doors: Door[] = [];
  private chosen: ExitOffer | null = null;
  private pedestal: { x: number; y: number; color: string; label: HTMLElement } | null = null;
  /** Le gain de la salle a été versé (la salle est libérée). */
  private paid = false;
  /** Salle de boss : les Pokémon sortent de Poké Balls. */
  private boss = false;
  /** Opacité du voile noir (0 → 1) ; il s'éclaircit tout seul en arrivant dans une salle. */
  fade = 0;
  private rng = new Rng(1);
  private readonly layer: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly fx: CombatFx,
    private readonly host: RoomHost,
  ) {
    this.layer = document.createElement('div');
    this.layer.className = 'room-labels';
    parent.append(this.layer);
  }

  /** Nouvelle salle (carte déjà générée, joueur déjà placé). */
  start(world: WorldMap, run: Run, enemiesOn: boolean, first: boolean): void {
    this.clearLabels();
    this.rng = new Rng(run.mapSeed * 13 + 5);
    this.counted.clear();
    this.pending = [];
    this.killed = 0;
    this.wave = 0;
    this.chosen = null;
    this.paid = false;
    this.waves = [];
    const plan = run.waves();
    this.level = plan.level;
    if (run.isBoss() && enemiesOn) {
      this.waves = run.bossWaves();
    } else if (!run.isShop() && enemiesOn) {
      // Répartition égale, le reste sur les premières vagues (CombatArena.gd:1636-1654).
      const pool = run.fauna();
      const count = Math.min(30, plan.count * plan.perWave);
      for (let w = 0; w < plan.count; w++) this.waves.push([]);
      for (let n = 0; n < count; n++) {
        const level = plan.early ? 4 + this.rng.int(5) : plan.level;
        this.waves[n % plan.count].push({ id: this.rng.pick(pool), level, role: 'wild' });
      }
    }
    this.total = this.waves.reduce((s, w) => s + w.length, 0);
    this.boss = run.isBoss();
    // Portes fermées dès l'arrivée : autant que la carte en offre, une seule autour de la boutique et du boss.
    const exits = world.exits.slice(0, run.exitCount(world.exits.length));
    const offers = run.offers(exits.length);
    this.doors = exits.map((exit, i) => ({ exit, offer: offers[i], label: this.label(offers[i].label, REWARD_COLOR[offers[i].reward]) }));
    this.phase = 'intro';
    // Après une porte, la pause ne commence qu'une fois le fondu de retour terminé.
    this.t = (first ? 0 : FADE) + (run.isBoss() && this.total ? BOSS_DELAY : first ? FIRST_DELAY : NEXT_DELAY);
    if (run.isBoss() && this.total) this.host.bossIntro(this.doors[0]?.exit ?? null);
    if (run.isShop()) {
      // Pas d'ennemis à la boutique : la porte vers le boss est ouverte d'emblée.
      this.openDoors();
    } else if (!this.total) {
      // Sauvages désactivés dans le panneau : rien à combattre, rien à gagner.
      this.phase = 'cleared';
      this.paid = true;
      this.t = 0;
    }
  }

  update(dt: number, input: InputSample, world: WorldMap, run: Run, player: Actor, enemies: readonly Actor[]): void {
    for (const e of enemies) {
      if (e.deathT >= 0 && !this.counted.has(e)) {
        this.counted.add(e);
        this.killed++;
      }
    }
    for (const p of this.pending) p.t += dt;
    for (const p of this.pending.filter((q) => q.t >= SPAWN_ANNOUNCE)) {
      // Sortie de Poké Ball : pas de nuage, la gerbe de la ball suffit.
      if (!this.boss) this.fx.poof(p.x, p.y);
      this.host.spawnEnemy(p.id, p.level, p.x, p.y, p.role);
    }
    this.pending = this.pending.filter((q) => q.t < SPAWN_ANNOUNCE);
    this.t -= dt;
    if (this.phase !== 'fadeOut') this.fade = Math.max(0, this.fade - dt / FADE);

    switch (this.phase) {
      case 'intro':
        if (this.t <= 0) this.startWave(world, player);
        break;
      case 'waves': {
        const alive = enemies.some((e) => e.deathT < 0) || this.pending.length > 0;
        if (alive) {
          this.t = this.wave + 1 < this.waves.length ? WAVE_GAP : CLEAR_DELAY;
          break;
        }
        if (this.t > 0) break;
        if (this.wave + 1 < this.waves.length) {
          this.wave++;
          this.startWave(world, player);
        } else {
          this.phase = 'cleared';
          this.t = 0;
        }
        break;
      }
      case 'cleared':
        if (this.t > 0) break;
        if (!this.paid) {
          // La salle est libérée : ₽ (×3 après un boss), puis 0,8 s avant d'ouvrir.
          this.paid = true;
          if (run.isFinal) {
            this.phase = 'over';
            this.host.victory();
            return;
          }
          const gold = run.isBoss() ? run.roomGold * 3 : run.roomGold;
          run.money += gold;
          this.host.roomCleared();
          this.host.toast('Salle libérée !', `+${gold} ₽`);
          this.t = OPEN_DELAY;
          break;
        }
        this.placePedestal(world, run);
        this.openDoors();
        break;
      case 'open':
        this.updateOpen(input, world, run, player);
        break;
      case 'fadeOut':
        this.fade = Math.min(1, this.fade + dt / FADE);
        // Écran noir : on change de salle (nextRoom rappelle start(), qui repasse en 'intro').
        if (this.fade >= 1 && this.chosen) {
          const offer = this.chosen;
          this.chosen = null;
          this.host.nextRoom(offer);
        }
        break;
      case 'over':
        break;
    }
  }

  private startWave(world: WorldMap, player: Actor): void {
    this.phase = 'waves';
    // En salle de boss, chaque vague monte d'un cran : le niveau affiché est celui du Pokémon de tête.
    if (this.boss && this.waves[this.wave]?.[0]) this.level = this.waves[this.wave][0].level;
    this.t = WAVE_GAP;
    for (const mon of this.waves[this.wave] ?? []) {
      const at = this.spawnPoint(world, player, SWIMMERS.has(mon.id));
      if (!at) continue;
      this.pending.push({ ...mon, ...at, t: 0 });
      // Toutes les balls d'une vague partent ensemble ; elles s'ouvrent quand le Pokémon apparaît (0,55 s).
      if (this.boss) this.fx.ballSend(at.x, at.y);
    }
  }

  /** Case libre et atteignable, loin des bords (6 cases, comme le jeu) et du joueur. */
  private spawnPoint(world: WorldMap, player: Actor, swims: boolean): { x: number; y: number } | null {
    const margin = 6;
    for (let tries = 0; tries < 200; tries++) {
      const x = margin + this.rng.int(Math.max(1, world.w - margin * 2));
      const y = margin + this.rng.int(Math.max(1, world.h - margin * 2));
      const i = y * world.w + x;
      if (!world.reachable[i] || world.blocked[i] || (world.water[i] && !swims)) continue;
      if (Math.hypot(x + 0.5 - player.x, y + 0.95 - player.y) < SPAWN_MIN_DIST) continue;
      return { x: x + 0.5, y: y + 0.95 };
    }
    return null;
  }

  private openDoors(): void {
    this.phase = 'open';
    for (const d of this.doors) d.label.classList.add('open');
    if (this.doors.length) this.host.message(this.doors.length > 1 ? 'Choisissez une sortie' : 'La sortie est ouverte');
  }

  /** Récompense au centre de la carte (CombatArena._spawn_boon), sur la case libre la plus proche. */
  private placePedestal(world: WorldMap, run: Run): void {
    const cx = world.w / 2;
    const cy = world.h / 2;
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let y = 2; y < world.h - 2; y++) {
      for (let x = 2; x < world.w - 2; x++) {
        const i = y * world.w + x;
        if (!world.reachable[i] || world.blocked[i] || world.water[i]) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d < bestD) {
          bestD = d;
          best = { x: x + 0.5, y: y + 0.8 };
        }
      }
    }
    if (!best) return;
    const color = REWARD_COLOR[run.reward];
    this.pedestal = { ...best, color, label: this.label(`${REWARD_LABEL[run.reward]}  [E]`, color) };
    this.pedestal.label.classList.add('open');
    this.host.prepareReward(run.reward);
  }

  private updateOpen(input: InputSample, world: WorldMap, run: Run, player: Actor): void {
    const p = this.pedestal;
    if (p) {
      const near = Math.hypot(player.x - p.x, player.y - p.y) < PICKUP_RADIUS + 0.6;
      p.label.classList.toggle('near', near);
      if (near && input.interact) this.claim(run);
    }
    for (const d of this.doors) {
      if (this.atExit(world, player, d.exit)) {
        // Une récompense laissée au centre est perdue en passant la porte, comme dans le jeu.
        this.chosen = d.offer;
        this.phase = 'fadeOut';
        return;
      }
    }
  }

  private claim(run: Run): void {
    const p = this.pedestal;
    if (!p) return;
    if (run.reward !== 'loot') {
      // Dons ou nouvelle attaque : l'écran de choix ; la récompense ne part qu'une fois prise.
      this.host.openReward(run.reward, () => this.consume());
      return;
    }
    // CombatArena._grant_loot(room, 2.0) : le double du gain de la salle.
    const gold = run.roomGold * 2;
    run.money += gold;
    this.host.message(`₽ Butin : +${gold} ₽`);
    this.consume();
  }

  /** La récompense est prise : elle disparaît du centre. */
  private consume(): void {
    const p = this.pedestal;
    if (!p) return;
    this.fx.attackAnim('fx_boost', p.x, p.y);
    p.label.remove();
    this.pedestal = null;
  }

  /** Le joueur s'engage dans l'ouverture : il touche le bord, en face de la sortie. */
  private atExit(world: WorldMap, a: Actor, e: Exit): boolean {
    const half = e.width / 2 + 0.6;
    switch (e.side) {
      case 'N':
        return a.y < 1.9 && Math.abs(a.x - e.x) < half;
      case 'S':
        return a.y > world.h - 0.3 && Math.abs(a.x - e.x) < half;
      case 'W':
        return a.x < 1.0 && Math.abs(a.y - e.y) < half;
      case 'E':
        return a.x > world.w - 1.0 && Math.abs(a.y - e.y) < half;
    }
  }

  private label(text: string, color: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'room-label';
    el.textContent = text;
    el.style.setProperty('--c', color);
    this.layer.append(el);
    return el;
  }

  /** Hors run (le Repaire) : ni vagues, ni portes, ni voile. */
  clear(): void {
    this.clearLabels();
    this.pending = [];
    this.waves = [];
    this.total = 0;
    this.phase = 'over';
    this.fade = 0;
  }

  private clearLabels(): void {
    this.layer.replaceChildren();
    this.pedestal = null;
    this.doors = [];
  }

  /** Au sol, sous les Pokémon : anneaux d'annonce des apparitions. */
  drawGround(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void {
    const sx = (x: number) => Math.round((x * TILE - camX) * k);
    const sy = (y: number) => Math.round((y * TILE - camY) * k);

    // Anneau magenta qui grandit puis se resserre (0,15 → 1 sur 85 %, puis → 0,05).
    for (const p of this.boss ? [] : this.pending) {
      const u = p.t / SPAWN_ANNOUNCE;
      const scale = u < 0.85 ? 0.15 + 0.85 * (u / 0.85) : 1 - 0.95 * ((u - 0.85) / 0.15);
      const r = 0.9 * scale * TILE * k;
      b.strokeStyle = 'rgba(242,89,191,0.7)';
      b.lineWidth = Math.max(1, Math.round(0.14 * TILE * k * scale));
      b.beginPath();
      b.ellipse(sx(p.x), sy(p.y), r, r * 0.55, 0, 0, Math.PI * 2);
      b.stroke();
    }
  }

  /**
   * Par-dessus le décor : portes (barrière fermée, lueur ouverte) et
   * récompense. Au ras du bord de carte, la frondaison des arbres de lisière
   * les aurait cachées.
   */
  drawOverlay(b: CanvasRenderingContext2D, camX: number, camY: number, k: number, time: number): void {
    const sx = (x: number) => Math.round((x * TILE - camX) * k);
    const sy = (y: number) => Math.round((y * TILE - camY) * k);

    for (const d of this.doors) {
      const e = d.exit;
      const horiz = e.side === 'N' || e.side === 'S';
      const half = e.width / 2;
      if (this.phase !== 'open' && this.phase !== 'fadeOut') {
        // Barrière de bois en travers de l'ouverture : deux poteaux, deux lisses.
        const pts = horiz
          ? [
              [e.x - half, e.y],
              [e.x + half, e.y],
            ]
          : [
              [e.x, e.y - half],
              [e.x, e.y + half],
            ];
        const [[x0, y0], [x1, y1]] = pts;
        b.fillStyle = '#3b2414';
        if (horiz) {
          b.fillRect(sx(x0), sy(y0) - 9 * k, sx(x1) - sx(x0), 4 * k);
          b.fillRect(sx(x0), sy(y0) - 4 * k, sx(x1) - sx(x0), 3 * k);
          b.fillStyle = '#8a5a32';
          b.fillRect(sx(x0), sy(y0) - 8 * k, sx(x1) - sx(x0), 2 * k);
          b.fillRect(sx(x0), sy(y0) - 3 * k, sx(x1) - sx(x0), 1 * k);
        } else {
          b.fillRect(sx(x0) - 2 * k, sy(y0), 4 * k, sy(y1) - sy(y0));
          b.fillStyle = '#8a5a32';
          b.fillRect(sx(x0) - 1 * k, sy(y0), 2 * k, sy(y1) - sy(y0));
        }
        b.fillStyle = '#3b2414';
        for (const [px, py] of pts) b.fillRect(sx(px) - 2 * k, sy(py) - 12 * k, 4 * k, 12 * k);
      } else {
        // Ouverte : lueur au sol à la couleur de la récompense, et particules qui montent.
        const color = REWARD_COLOR[d.offer.reward];
        const cx = sx(e.x);
        const cy = sy(e.y);
        const rx = (horiz ? half + 0.5 : 1.2) * TILE * k;
        const ry = (horiz ? 1.2 : half + 0.5) * TILE * k * 0.6;
        b.globalCompositeOperation = 'lighter';
        const g = b.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
        g.addColorStop(0, withAlpha(color, 0.6 + 0.15 * Math.sin(time * 3)));
        g.addColorStop(1, withAlpha(color, 0));
        b.fillStyle = g;
        b.beginPath();
        b.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        b.fill();
        for (let i = 0; i < 22; i++) {
          const ph = (time * 0.3 + i * 0.137) % 1;
          const ox = (((i * 0.618) % 1) - 0.5) * 2 * (horiz ? half : 0.8);
          const oy = (((i * 0.382) % 1) - 0.5) * 2 * (horiz ? 0.8 : half);
          b.fillStyle = withAlpha(color, 1 - ph);
          b.fillRect(sx(e.x + ox), sy(e.y + oy) - Math.round(ph * 24 * k), 2 * k, 2 * k);
        }
        b.globalCompositeOperation = 'source-over';
      }
    }

    const p = this.pedestal;
    if (p) {
      // Cristal de récompense qui flotte au-dessus de son ombre.
      const color = p.color;
      const cx = sx(p.x);
      const base = sy(p.y);
      const bob = Math.round(Math.sin(time * 2.4) * 2 * k);
      b.fillStyle = 'rgba(16,24,12,0.3)';
      b.beginPath();
      b.ellipse(cx, base, 5 * k, 2 * k, 0, 0, Math.PI * 2);
      b.fill();
      const top = base - 22 * k + bob;
      b.fillStyle = '#1a1008';
      b.beginPath();
      b.moveTo(cx, top - 1 * k);
      b.lineTo(cx + 6 * k, top + 7 * k);
      b.lineTo(cx, top + 15 * k);
      b.lineTo(cx - 6 * k, top + 7 * k);
      b.closePath();
      b.fill();
      b.fillStyle = color;
      b.beginPath();
      b.moveTo(cx, top + 1 * k);
      b.lineTo(cx + 4 * k, top + 7 * k);
      b.lineTo(cx, top + 13 * k);
      b.lineTo(cx - 4 * k, top + 7 * k);
      b.closePath();
      b.fill();
      b.fillStyle = 'rgba(255,255,255,0.8)';
      b.fillRect(cx - 1 * k, top + 4 * k, k, 3 * k);
    }
  }

  /** Étiquettes HTML des portes ouvertes et de la récompense, recalées sur la caméra. */
  placeLabels(proj: Projector): void {
    for (const d of this.doors) {
      const e = d.exit;
      // Étiquette vers l'intérieur de la carte, pour qu'elle ne sorte pas de l'écran.
      const ox = e.side === 'W' ? 2.2 : e.side === 'E' ? -2.2 : 0;
      const oy = e.side === 'N' ? 1.6 : e.side === 'S' ? -1.6 : -1;
      const p = proj.toCss(e.x + ox, e.y + oy);
      d.label.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
    }
    if (this.pedestal) {
      const p = proj.toCss(this.pedestal.x, this.pedestal.y - 2.2);
      this.pedestal.label.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
    }
  }

}
