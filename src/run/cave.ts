import { sfx } from '../audio/audio';
import { loadInfo, loadSheet } from '../assets/pmd';
import { Rng } from '../core/rng';
import { BIOME_GRUNTS, GRUNT_INTROS, GRUNT_THEMES, type GruntTheme } from '../data/grunts';
import { SWIMMERS } from '../data/species';
import { Actor } from '../entities/actor';
import { Trainer } from '../entities/trainer';
import type { InputSample } from '../input/input';
import type { CombatFx } from '../render/combatfx';
import type { Speaker } from '../ui/dialogue';
import type { CaveLayout } from '../world/cave';
import type { WorldMap } from '../world/generate';
import { CAVE, CHEST, CHEST_OPEN, TILE } from '../world/tiles';
import { CaptureThreat } from './capture';
import type { Run } from './run';

// Déroulé d'une grotte (CaveArena.gd, simplifié) : on entre par la bouche
// d'une paroi, dans le noir. Un sbire attend au cœur de l'arène (data/grunts.ts,
// son métier suit le type de son équipe, tiré du biome) ; quand on approche,
// il parle, puis envoie son Pokémon fort (le « gardien ») et son escorte
// d'un jet de Poké Ball, et la sortie reste ouverte (on peut fuir, mais la
// grotte est alors perdue). Pendant le combat, il lance des Poké Balls sur
// le Pokémon joué (run/capture.ts) : touché, on s'en débat ; capturé, le
// Pokémon quitte l'équipe, et ne revient que si l'on bat le sbire (fuir le
// laisse entre ses mains pour le reste de la run). Toute son équipe à terre,
// il s'enfuit par la bouche (rappelant son Pokémon fort) et lâche ses prises.
// Puis ₽ et équipe soignée, comme dans le jeu, le coffre de l'alcôve, et le
// prisonnier.
//
// Écart voulu : le jeu débloquait l'espèce du demi-boss vaincu et l'offrait
// en allié ; le Pokémon d'un sbire n'est pas à prendre, seul le prisonnier
// se recrute.
//
// Recruter passe par une fiche (RecruitScreen, via CaveHost.recruit) : ses
// statistiques, ses attaques, un surnom, et s'il rejoint l'équipe tout de suite.
//
// Écarts voulus :
// - les prisonniers n'existent pas dans le jeu : un Pokémon du biome,
//   enfermé derrière une grille au fond d'une alcôve (il en secoue les
//   barreaux) ; le gardien tombé, la grille se relève comme une herse et on
//   le libère ; il rejoint le Repaire pour de bon (Save.freed), son espèce
//   débloquée ; on tire de préférence une espèce pas encore débloquée ;
// - un sbire dresseur plutôt qu'un demi-boss sauvage (data/grunts.ts) ;
// - l'escorte vient de la faune du biome, pas de CAVE_ELITE (Scarhino,
//   Branette… n'ont pas de planche dans le dépôt) ;
// - le gardien a 3 barres au lieu de 4 : la grotte se joue en une salle,
//   sans le boss de l'acte derrière pour l'équilibrer ;
// - le coffre donne le Bandeau Choix la première fois (comme le jeu), puis des Baies.

/** Distance à laquelle le sbire nous interpelle (cases). */
const WAKE_RADIUS = 7;
/** Entre deux Poké Balls du sbire (s) : THROW_EVERY - THROW_PER_ACT × acte, jamais sous THROW_MIN. */
const THROW_EVERY = 4.2;
const THROW_PER_ACT = 0.35;
const THROW_MIN = 3;
/** Première Ball, après l'envoi de son équipe (s). */
const FIRST_THROW = 2.4;
/** Il s'arrête et vise ce temps-là avant de lancer (s). */
const THROW_WINDUP = 0.45;
/** Fondu au noir, à l'entrée comme à la sortie. */
const FADE = 0.5;
const TALK_REACH = 1.4;
/** Le prisonnier encore enfermé : on lui parle à travers la grille, d'un rang plus loin. */
const BARS_REACH = 2.4;
const CLEAR_DELAY = 1;
/** Le prisonnier se débat toutes les STRUGGLE_EVERY s environ, pendant STRUGGLE_TIME s. */
const STRUGGLE_EVERY = 2.4;
const STRUGGLE_TIME = 0.5;
/** Saut de joie du prisonnier libéré (s). */
const JOY_TIME = 0.9;
/** La grille se relève en LIFT_TIME s ; il en reste LIFT_KEEP px en haut, les pointes de la herse. */
const LIFT_TIME = 1.1;
const LIFT_KEEP = 6;

type Phase = 'waiting' | 'talk' | 'fight' | 'cleared' | 'open' | 'fadeOut' | 'over';

export interface CaveHost {
  /** Fait apparaître un sauvage et le rend (le gardien reçoit ses barres ici). */
  spawnEnemy(id: number, level: number, x: number, y: number, role: Actor['role']): Actor;
  message(text: string): void;
  toast(text: string, stamp?: string): void;
  announce(name: string, kicker: string): void;
  notify(title: string, text: string, art?: number): void;
  /** Le sbire nous interpelle (dialogue) ; `done` quand on a fini de le lire. */
  challenge(who: Speaker, text: string, done: () => void): void;
  /** Un membre capturé par le sbire : il quitte l'équipe (relève, ou défaite s'il était le dernier debout). */
  capture(a: Actor, by: string): void;
  /** Le sbire vaincu lâche ses prises : elles reviennent dans l'équipe, autour de (x, y). */
  release(captives: readonly Actor[], x: number, y: number): void;
  /** Gardien vaincu : l'équipe debout reprend tous ses PV. */
  heal(): void;
  /** Le coffre : rend ce qu'il contenait, en texte (déjà versé). */
  openChest(): string;
  /**
   * La fiche de recrutement du prisonnier (libéré, il part au Repaire, et
   * peut aussi rejoindre l'équipe tout de suite). Rend true quand un choix a
   * été fait — il quitte alors la grotte —, false si l'on a refermé la fiche
   * sans choisir.
   */
  recruit(id: number, level: number, x: number, y: number): Promise<boolean>;
  /** Écran noir : on ressort de la grotte. */
  leave(): void;
}

interface Npc {
  actor: Actor;
  name: () => string;
  /** Où il se tient : le prisonnier qui se débat oscille autour. */
  home: { x: number; y: number };
  /** Prisonnier : décalage de sa lutte contre la grille, et minuteur de sa joie une fois libre. */
  phaseT: number;
  joyT: number;
  struggling: boolean;
}

export class CaveDirector {
  phase: Phase = 'over';
  /** Opacité du voile noir : il s'éclaircit tout seul en arrivant. */
  fade = 0;
  /** Les prisonniers : à dessiner avec les autres. */
  readonly npcs: Actor[] = [];
  private people: Npc[] = [];
  private layout: CaveLayout | null = null;
  private guardianId = 0;
  private guardianLevel = 0;
  private prisonerLevel = 0;
  private escort: Actor[] = [];
  /** Le sbire : son équipe, son allure, sa réplique. */
  private grunt: Trainer | null = null;
  private theme: GruntTheme = GRUNT_THEMES.normal;
  private look = GRUNT_THEMES.normal.looks[0];
  private intro = '';
  /** Prochaine Ball (s), et celle qu'il vise (lancée à la fin de THROW_WINDUP). */
  private throwT = 0;
  private aimT = -1;
  /** Membres capturés : rendus si l'on bat le sbire. */
  private captives: Actor[] = [];
  private readonly capture: CaptureThreat;
  private chestOpen = false;
  private t = 0;
  private near: Npc | 'chest' | null = null;
  /** Fiche de recrutement ouverte : [E] n'en rouvre pas une seconde. */
  private asking = false;
  /** Course de la grille : -1 fermée, puis de 0 à 1 pendant qu'elle se relève. */
  private lift = -1;
  private readonly prompt: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly fx: CombatFx,
    /** L'atlas du tileset (assets/atlas.ts) : la grille en vient. */
    private readonly tileset: CanvasImageSource,
    private readonly host: CaveHost,
  ) {
    this.prompt = document.createElement('div');
    this.prompt.className = 'shop-prompt da-paper';
    this.prompt.hidden = true;
    parent.append(this.prompt);
    this.capture = new CaptureThreat(parent, fx, {
      captured: (a) => {
        this.captives.push(a);
        this.host.capture(a, this.look.title);
      },
      freed: (a) => this.host.message(`${a.pokemon?.name ?? '…'} fait éclater la Ball !`),
    });
  }

  get active(): boolean {
    return this.phase !== 'over';
  }

  /** Nom de la zone pour le HUD. */
  readonly title = 'Grotte';
  /** Sous-titre de la barre du gardien. */
  get guardianTitle(): string {
    return `Pokémon du ${this.look.title}`;
  }

  /**
   * Nouvelle grotte (carte cuite, équipe posée sous la sortie). Le sbire :
   * une équipe du biome (BIOME_GRUNTS), son allure, son Pokémon fort
   * 4 niveaux au-dessus des sauvages de la salle ; prisonnier : une espèce
   * de la faune du biome pas encore libérée, au niveau de la salle.
   */
  /** `unlocked` : les espèces qu'on a déjà (le prisonnier est tiré de préférence ailleurs). */
  start(layout: CaveLayout, run: Run, unlocked: readonly number[]): void {
    this.clear();
    this.layout = layout;
    const rng = new Rng(run.mapSeed * 53 + 7);
    this.theme = GRUNT_THEMES[rng.pick(BIOME_GRUNTS[run.biome] ?? ['normal'])] ?? GRUNT_THEMES.normal;
    this.look = rng.pick(this.theme.looks);
    this.intro = rng.pick(GRUNT_INTROS);
    this.guardianId = rng.pick(this.theme.guardians);
    this.guardianLevel = run.roomLevel + 4;
    this.prisonerLevel = run.roomLevel;
    this.grunt = new Trainer(this.look.sprite, layout.guardian, null, 3);
    const pool = run.fauna().filter((id) => !SWIMMERS.has(id));
    const fresh = pool.filter((id) => !unlocked.includes(id));
    const picks = [...new Set(fresh.length ? fresh : pool)];
    for (const at of layout.prisoners) {
      if (!picks.length) break;
      const id = picks.splice(rng.int(picks.length), 1)[0];
      this.addNpc(id, at, ['Idle']).phaseT = rng.range(0, STRUGGLE_EVERY);
    }
    this.phase = 'waiting';
    this.fade = 1;
    this.chestOpen = false;
    this.lift = -1;
  }

  clear(): void {
    this.phase = 'over';
    this.layout = null;
    this.people = [];
    this.npcs.length = 0;
    this.escort = [];
    this.grunt = null;
    this.captives = [];
    this.aimT = -1;
    this.capture.reset();
    this.near = null;
    this.asking = false;
    this.prompt.hidden = true;
    this.fade = 0;
  }

  private addNpc(id: number, at: { x: number; y: number }, pose: readonly string[]): Npc {
    const actor = new Actor(id, at.x, at.y);
    actor.dir = new Rng(id).int(8);
    void loadInfo(id).then((i) => (actor.info = i));
    void loadSheet(id, ['Idle', 'Hurt', 'Hop']).then((sh) => {
      actor.sheet = sh;
      actor.setPose(pose);
    });
    const npc: Npc = { actor, name: () => actor.info?.name ?? '…', home: { ...at }, phaseT: 0, joyT: 0, struggling: false };
    this.people.push(npc);
    this.npcs.push(actor);
    return npc;
  }

  private remove(n: Npc): void {
    this.people = this.people.filter((p) => p !== n);
    this.npcs.splice(this.npcs.indexOf(n.actor), 1);
  }

  update(dt: number, input: InputSample, world: WorldMap, run: Run, player: Actor, enemies: readonly Actor[]): void {
    const L = this.layout;
    if (!L) return;
    this.t -= dt;
    this.animatePrisoners(dt);
    if (this.lift >= 0 && this.lift < 1) {
      const was = this.lift;
      this.lift = Math.min(1, this.lift + dt / LIFT_TIME);
      // À mi-course, on passe dessous : les cases de la cellule se libèrent.
      if (was < 0.5 && this.lift >= 0.5) for (const i of L.cell.tiles) world.blocked[i] = world.solid[i] = 0;
    }
    if (this.phase !== 'fadeOut') this.fade = Math.max(0, this.fade - dt / FADE);
    this.grunt?.update(dt, world, Math.random);
    if (this.grunt?.gone) this.grunt = null;
    this.capture.update(dt, input, player);

    switch (this.phase) {
      case 'waiting': {
        // Il nous interpelle quand on entre dans l'arène, puis envoie son équipe.
        const g = this.grunt;
        if (!g || Math.hypot(player.x - g.x, player.y - g.y) >= WAKE_RADIUS) break;
        this.phase = 'talk';
        g.aim(player.x, player.y, 60);
        sfx('vs');
        this.host.challenge(this.speaker(), this.intro, () => {
          if (this.phase === 'talk') this.send(world, run, player);
        });
        break;
      }
      case 'fight': {
        this.updateThrows(dt, player);
        const alive = enemies.some((e) => e.deathT < 0);
        if (alive) {
          this.t = CLEAR_DELAY;
          break;
        }
        if (this.t > 0) break;
        // Son équipe à terre : il s'enfuit par la bouche et lâche ses prises.
        this.aimT = -1;
        this.capture.reset();
        if (this.grunt) {
          this.grunt.fleeTo(L.exit.x + 0.5, L.exit.y + 0.5);
          this.host.message(`Le ${this.look.title} s’enfuit !`);
          sfx('flee');
          if (this.captives.length) this.host.release(this.captives, this.grunt.x, this.grunt.y);
        }
        this.captives = [];
        // ₽ (CaveArena : 100 + 12 par salle) et l'équipe soignée. Son Pokémon fort, K.O., rentre dans sa Ball.
        const gold = 100 + run.room * 12;
        run.money += gold;
        this.host.heal();
        this.host.toast('Grotte libérée !', `+${gold} ₽`);
        this.phase = 'cleared';
        this.t = 1.2;
        break;
      }
      case 'cleared':
        if (this.t > 0) break;
        // La grille se relève dans un nuage de poussière, et il saute de joie.
        this.lift = 0;
        sfx('doorOpen');
        for (const dx of [-1, 0, 1]) this.fx.poof(L.cell.x + dx, L.cell.y);
        for (const p of this.people) {
          this.host.message(`La grille se lève : ${p.name()} est libre !`);
          p.actor.x = p.actor.prevX = p.home.x;
          p.joyT = JOY_TIME;
          p.actor.setPose(['Hop', 'Idle']);
        }
        this.phase = 'open';
        break;
      case 'fadeOut':
        this.fade = Math.min(1, this.fade + dt / FADE);
        if (this.fade >= 1) {
          this.phase = 'over';
          this.host.leave();
        }
        return;
      case 'open':
      case 'over':
        break;
    }

    // La sortie : on s'engage dans le trou de lumière, contre la paroi.
    if (Math.abs(player.x - (L.exit.x + 0.5)) < 0.9 && player.y < L.exit.y + 1.75 && !player.trapped) {
      if (this.phase === 'fight') {
        const lost = this.captives.map((c) => c.pokemon?.name ?? '…');
        this.host.message(lost.length ? `Vous fuyez… ${lost.join(', ')} reste${lost.length > 1 ? 'nt' : ''} aux mains du ${this.look.title}.` : 'Vous fuyez la grotte…');
      }
      sfx(this.phase === 'fight' ? 'flee' : 'doorExit');
      this.phase = 'fadeOut';
      this.prompt.hidden = true;
      return;
    }
    this.updateNear(input, player);
  }

  private speaker(): Speaker {
    return {
      name: this.look.title,
      role: 'Chasseur de rebelles',
      type: this.theme.type,
      sprite: `/game/assets/essentials/trainers/battle/${this.look.sprite.replace(/^trainer_/, '')}`,
    };
  }

  /**
   * Il lance une Ball toutes les quelques secondes sur le Pokémon joué :
   * il s'arrête et se tourne vers lui (THROW_WINDUP), puis la Ball part
   * vers l'endroit où il se tient à cet instant.
   */
  private updateThrows(dt: number, player: Actor): void {
    const g = this.grunt;
    if (!g) return;
    const ready = player.deathT < 0 && !player.trapped && !this.capture.busy;
    if (this.aimT >= 0) {
      this.aimT -= dt;
      if (this.aimT < 0 && ready) this.capture.throwAt(g.x, g.y - 0.6, player.x, player.y);
      return;
    }
    this.throwT -= dt;
    if (this.throwT > 0 || !ready || this.run === null) return;
    this.throwT = Math.max(THROW_MIN, THROW_EVERY - THROW_PER_ACT * this.run.act);
    this.aimT = THROW_WINDUP;
    g.aim(player.x, player.y, THROW_WINDUP + 0.25);
  }

  private run: Run | null = null;

  /** Fin du dialogue : il envoie son Pokémon fort entre lui et nous, et l'escorte dans l'arène, d'un jet de Ball chacun. */
  private send(world: WorldMap, run: Run, player: Actor): void {
    const L = this.layout!;
    const g = this.grunt;
    this.run = run;
    const from = g ? { x: g.x, y: g.y } : L.guardian;
    const dx = player.x - from.x;
    const dy = player.y - from.y;
    const d = Math.hypot(dx, dy) || 1;
    let at = { x: from.x, y: from.y };
    for (const step of [2.2, 1.6, 1]) {
      const x = from.x + (dx / d) * step;
      const y = from.y + (dy / d) * step;
      const i = Math.floor(y - 0.1) * world.w + Math.floor(x);
      if (world.blocked[i] || !world.reachable[i]) continue;
      at = { x, y };
      break;
    }
    g?.aim(at.x, at.y, 0.8);
    sfx('ballThrow');
    this.fx.ballSend(at.x, at.y);
    this.host.spawnEnemy(this.guardianId, this.guardianLevel, at.x, at.y, 'champion');
    void loadInfo(this.guardianId).then((i) => this.phase === 'fight' && this.host.announce(i.name, `POKÉMON DU ${this.look.title.toUpperCase()}`));
    // Escorte : 2 + acte sauvages du biome, au niveau de la salle, sur des cases libres de l'arène.
    const rng = new Rng(run.mapSeed * 59 + 11);
    const pool = run.fauna();
    const count = 2 + run.act;
    for (let n = 0, tries = 0; n < count && tries < 200; tries++) {
      const x = Math.floor(L.arena.x + rng.range(-L.arena.rx, L.arena.rx));
      const y = Math.floor(L.arena.y + rng.range(-L.arena.ry, L.arena.ry));
      const i = y * world.w + x;
      if (x < 0 || y < 0 || x >= world.w || y >= world.h || !world.reachable[i] || world.blocked[i]) continue;
      if (Math.hypot(x + 0.5 - player.x, y + 0.9 - player.y) < 3.5) continue;
      this.fx.ballSend(x + 0.5, y + 0.9);
      this.escort.push(this.host.spawnEnemy(rng.pick(pool), run.roomLevel, x + 0.5, y + 0.9, 'wild'));
      n++;
    }
    this.phase = 'fight';
    this.t = CLEAR_DELAY;
    this.throwT = FIRST_THROW;
  }

  /** Vrai tant que le sbire tient le prisonnier : grille fermée, et il se débat. */
  private get held(): boolean {
    return this.phase === 'waiting' || this.phase === 'talk' || this.phase === 'fight' || this.phase === 'cleared';
  }

  /**
   * Le prisonnier retenu se débat par à-coups (planche Hurt, secoué de
   * gauche à droite, tourné d'un côté puis de l'autre — la grille en
   * tremble) ; libéré, il saute (Hop) puis se calme.
   */
  private animatePrisoners(dt: number): void {
    for (const p of this.people) {
      const a = p.actor;
      if (p.joyT > 0) {
        p.joyT -= dt;
        if (p.joyT <= 0) a.setPose(['Idle']);
        continue;
      }
      if (!this.held) continue;
      p.phaseT = (p.phaseT + dt) % STRUGGLE_EVERY;
      const struggling = p.phaseT < STRUGGLE_TIME;
      // (Sans planche Idle, setPose retombe sur la pose par défaut.)
      if (struggling !== p.struggling && a.sheet) {
        p.struggling = struggling;
        a.setPose(struggling ? ['Hurt', 'Idle'] : ['Idle']);
      }
      a.x = a.prevX = p.home.x + (struggling ? Math.sin(p.phaseT * 46) * 0.06 : 0);
      if (struggling && p.phaseT < dt) a.dir = (a.dir + (Math.random() < 0.5 ? 1 : 7)) % 8;
    }
  }

  /**
   * La grille de la cellule, triée avec les Pokémon : son pied est sur le
   * bord avant de la cellule, elle passe donc devant le prisonnier. Elle
   * tremble quand il la secoue ; puis elle se relève comme une herse,
   * rognée par le haut (elle rentre dans la paroi), et ses pointes restent
   * en vue.
   */
  extras(): { y: number; draw(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void }[] {
    const L = this.layout;
    if (!L) return [];
    const g = this.grunt;
    const extra = [...(g ? [{ y: g.y * TILE, draw: g.draw.bind(g) }] : []), ...this.capture.extras()];
    const [sx, sy, sw, sh] = CAVE.bars.rect;
    const x = L.cell.x * TILE - sw / 2;
    const y = L.cell.y * TILE - CAVE.bars.foot;
    return [
      ...extra,
      {
        y: L.cell.y * TILE,
        draw: (b, camX, camY, k) => {
          const shaken = this.held && this.people.some((p) => p.struggling);
          const rattle = shaken ? Math.round(Math.sin(performance.now() / 22)) : 0;
          // La herse monte d'un pas puis accélère ; un léger tremblement tant qu'elle grince.
          const e = this.lift < 0 ? 0 : this.lift * this.lift;
          const cut = Math.round(e * (sh - LIFT_KEEP));
          const grind = this.lift >= 0 && this.lift < 1 ? Math.round(Math.sin(this.lift * 60)) * 0.5 : 0;
          b.drawImage(this.tileset, sx, sy + cut, sw, sh - cut, Math.round((x + rattle + grind - camX) * k), Math.round((y - camY) * k), sw * k, (sh - cut) * k);
        },
      },
    ];
  }

  /** Ce devant quoi l'on se tient (coffre, prisonnier), et [E]. */
  private updateNear(input: InputSample, player: Actor): void {
    const L = this.layout!;
    let near: Npc | 'chest' | null = null;
    if (!this.chestOpen && Math.hypot(player.x - L.chest.x, player.y - (L.chest.y + 0.9)) < TALK_REACH) near = 'chest';
    let best = TALK_REACH;
    for (const p of this.people) {
      const d = Math.hypot(player.x - p.actor.x, player.y - p.actor.y) - (this.lift < 0.5 ? BARS_REACH - TALK_REACH : 0);
      if (d < best) {
        best = d;
        near = p;
      }
    }
    this.near = near;
    this.renderPrompt();
    if (!input.interact || !near || this.asking) return;
    if (near === 'chest') {
      if (this.phase !== 'open') return this.host.message(`Le ${this.look.title} garde ce coffre`);
      this.chestOpen = true;
      // Le coffre reste là, ouvert.
      const obj = this.layout!.world.objects.find((o) => o.sprite === CHEST);
      if (obj) obj.sprite = CHEST_OPEN;
      this.fx.attackAnim('fx_boost', L.chest.x, L.chest.y);
      this.host.notify('Coffre', this.host.openChest());
      return;
    }
    if (this.phase !== 'open') return this.host.message(`Le ${this.look.title} rôde encore…`);
    const n = near;
    this.asking = true;
    void this.host.recruit(n.actor.speciesId, this.prisonerLevel, n.actor.x, n.actor.y).then((done) => {
      this.asking = false;
      // Refermée sans choisir, ou grotte quittée entre-temps : il reste là.
      if (!done || !this.people.includes(n)) return;
      this.fx.poof(n.actor.x, n.actor.y);
      this.remove(n);
    });
  }

  private renderPrompt(): void {
    const n = this.near;
    const asleep = this.phase !== 'open';
    const hint = !n
      ? ''
      : n === 'chest'
        ? asleep ? `Un coffre… le ${this.look.title} d’abord` : '[E] Ouvrir le coffre'
        : asleep ? `${n.name()} est enfermé derrière la grille… le ${this.look.title} d’abord` : `[E] Libérer ${n.name()}`;
    if (this.prompt.dataset.key === hint && this.prompt.hidden === !hint) return;
    this.prompt.dataset.key = hint;
    this.prompt.hidden = !hint;
    if (hint) this.prompt.replaceChildren(Object.assign(document.createElement('div'), { className: 'shop-hint', textContent: hint }));
  }
}
