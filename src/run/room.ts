import { sfx } from '../audio/audio';
import { Rng } from '../core/rng';
import type { Actor } from '../entities/actor';
import type { InputSample } from '../input/input';
import type { CombatFx, Projector } from '../render/combatfx';
import { withAlpha } from '../render/combatfx';
import { landReachable, type Exit, type WorldMap } from '../world/generate';
import { TILE } from '../world/tiles';
import { REWARD_COLOR, SHOP_COLOR, SPECIALS, type ExitOffer, type Reward, type Run, type SpecialId } from './run';
import { SWIMMERS, type BiomeId } from '../data/species';
import type { DonorId } from '../combat/boons';
import { donorBadge, drawRewardIcon, itemIcon, rewardIcon, shopIcon } from '../ui/rewardicons';
import { BIOMES, BIOME_COLOR } from '../world/biomes';
import { CS_LIST } from '../meta/catalog';
import { VICTORY_ROAD } from '../world/worldmap';
import { Trainer } from '../entities/trainer';
import { CaptureThreat } from './capture';
import { ACES, TRAINER_CLASSES, pickClass, pickMember, type TrainerClassId } from '../data/trainers';

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
//
// Sortie de boss : une porte par biome voisin (Run.offers), qui annonce le
// biome en grand au-dessus de sa récompense et luit à sa couleur. Une porte
// gardée par une CS qu'on n'a pas garde sa barrière : on la voit, on ne la
// prend pas.
//
// Salles spéciales (Run.special, ajout) : le Défi chronomètre les vagues (raté,
// les sauvages s'enfuient et la récompense est perdue) ; le Piège pose la
// récompense au centre d'une salle vide, et s'en approcher déclenche une
// embuscade de trois vagues serrées, 3 niveaux plus haut ; le Marchand n'a
// pas d'ennemis (merchant.ts), ses portes s'ouvrent d'emblée.

/** Pause avant la première vague : 1,2 s en début de run, 0,8 s après une porte (CombatArena.gd:908, 7415). */
const FIRST_DELAY = 1.2;
const NEXT_DELAY = 0.8;
/** Salle de boss : 1,8 s de mise en scène (dialogue, annonce) avant la première vague (CombatArena.gd:1616). */
const BOSS_DELAY = 1.8;
/** Anneau d'annonce avant qu'un Pokémon ne se matérialise (CombatArena.gd:2281-2299). */
const SPAWN_ANNOUNCE = 0.55;
/**
 * Ligne de front : préavis avant les anneaux (s). La vague gronde, une
 * flèche montre le bout du couloir d'où elle vient ; le temps de se placer.
 * (Écart voulu : le jeu n'a pas de telles salles, donc pas d'annonce.)
 */
const FRONT_WARN = 1.3;
/** Entre deux vagues, après le dernier K.O. d'une salle, puis avant l'ouverture des portes. */
const WAVE_GAP = 1.4;
const CLEAR_DELAY = 1;
const OPEN_DELAY = 0.8;
/** Fondu au noir et retour (CombatArena._transition_to_next_zone). */
const FADE = 0.5;
/** Délai entre deux rappels « CS requise » quand on bute contre une porte fermée. */
const LOCKED_NAG = 2.5;
/** Rayon de ramassage de la récompense au centre (Area3D de rayon 1,2). */
const PICKUP_RADIUS = 1.2;
/**
 * Distance minimale au joueur d'un point d'apparition. Le jeu n'en a pas ;
 * sans elle, un Pokémon pouvait se matérialiser au contact et frapper aussitôt.
 */
const SPAWN_MIN_DIST = 5;
/** Défi : secondes accordées, au départ et par vague. */
const CHALLENGE_BASE = 30;
const CHALLENGE_PER_WAVE = 10;
/** Piège : rayon qui déclenche l'embuscade, renfort de niveau, vagues et effectif. */
const TRAP_RADIUS = 3;
const TRAP_LEVELS = 3;
const TRAP_WAVES = 3;
const TRAP_CROWD = 1.5;
/**
 * Surface libre (cases où l'on marche) d'une salle de taille moyenne. Les effectifs
 * des vagues suivent la racine du rapport, entre CROWD_MIN et CROWD_MAX : une Arène
 * étroite reçoit moins de sauvages qu'une grande Clairière (A-FAIRE 1.12).
 */
// Mesuré sur 120 salles de combat (6 graines) : 260 à 1 730 cases libres, médiane ≈ 650,
// troisième quartile ≈ 1 100.
export const AREA_REF = 800;
const CROWD_MIN = 0.75;
const CROWD_MAX = 1.3;
/** Facteur d'effectif d'une carte, selon ses cases libres. */
export const crowdOf = (open: number): number => Math.min(CROWD_MAX, Math.max(CROWD_MIN, Math.sqrt(open / AREA_REF)));
export function openCells(world: WorldMap): number {
  let open = 0;
  for (let i = 0; i < world.blocked.length; i++) if (!world.blocked[i]) open++;
  return open;
}

/** `armed` : salle piège, avant l'embuscade. */
type Phase = 'armed' | 'intro' | 'waves' | 'cleared' | 'open' | 'fadeOut' | 'over';

type Role = 'wild' | 'champion' | 'boss';

interface PendingSpawn {
  id: number;
  level: number;
  role: Role;
  x: number;
  y: number;
  t: number;
  /** Le dresseur qui l'envoie (rang dans RoomDirector.groups). */
  group?: number;
}

/** Un Pokémon d'une vague ; `group` : le dresseur à qui il appartient. */
type WaveMon = { id: number; level: number; role: Role; group?: number };

/**
 * Un dresseur de la salle (data/trainers.ts) : il attend son tour en faisant les cent pas,
 * lance ses Poké Balls quand sa vague commence, et s'enfuit quand ses Pokémon sont libérés.
 */
interface TrainerGroup {
  trainer: Trainer;
  cls: TrainerClassId;
  wave: number;
  actors: Actor[];
  thrown: boolean;
  done: boolean;
  ace: boolean;
}

/** Un top dresseur (demi-boss) dans une salle de combat sur cinq, à partir de la troisième. */
const ACE_CHANCE = 0.2;
/** Ses Pokémon : trois, quatre niveaux au-dessus de la salle, deux barres de PV chacun. */
const ACE_TEAM = 3;
const ACE_LEVELS = 4;
const ACE_BARS = 2;
/** Au-delà de ce nombre de Pokémon, une vague vient de deux dresseurs. */
const SOLO_MAX = 3;
/** Les Pokémon d'un dresseur sortent à moins de tant de cases de lui. */
const THROW_RANGE = 3.5;

interface Door {
  exit: Exit;
  offer: ExitOffer;
  label: HTMLElement;
}

export interface RoomHost {
  /** `bars` : barres de PV (les Pokémon d'un top dresseur en ont deux). */
  spawnEnemy(id: number, level: number, x: number, y: number, role: Role, bars?: number): Actor;
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
  /** On s'engage dans la bouche d'une grotte, pendant que l'écran est noir (cf. CaveDirector). */
  enterCave(): void;
  /** Chrono du Défi, en secondes (null : on le masque). */
  setTimer(seconds: number | null): void;
  /** Défi raté : les sauvages encore debout s'enfuient. */
  dismissEnemies(): void;
  /** Une salle spéciale se termine (réussie ou non). */
  specialDone(special: SpecialId, success: boolean): void;
  /** Ligne de front : une vague arrive, le sol tremble (secousse d'écran). */
  rumble(): void;
  /** Village : un dresseur a capturé ce membre (il quitte l'équipe jusqu'à sa défaite). */
  capture(a: Actor, by: string): void;
  /** Ses Pokémon battus, le dresseur rend ses prises. */
  release(captives: Actor[], x: number, y: number): void;
  /** Le Pokémon joué peut-il être visé par une Ball ? (Toujours, aujourd'hui : un point d'accroche pour l'équilibrage.) */
  canBeCaptured(): boolean;
}

/**
 * Le Village (retour de test : « chaque biome a son gameplay ; dans les villages, les
 * dresseurs peuvent te capturer ») : ses dresseurs lancent des Poké Balls sur le Pokémon joué,
 * comme le sbire des grottes (run/capture.ts) ; on en sort, ou l'on se débat. Une prise revient
 * quand l'équipe de son dresseur est battue. Une Ball toutes les tant de secondes (moins aux
 * actes suivants), après un temps de visée.
 */
const VILLAGE_THROW_EVERY = 6;
const VILLAGE_THROW_PER_ACT = 0.7;
const VILLAGE_THROW_MIN = 3;
const VILLAGE_WINDUP = 0.6;

export class RoomDirector {
  phase: Phase = 'over';
  private t = 0;
  private waves: WaveMon[][] = [];
  /** Cases libres de la salle : l'effectif des vagues en dépend (crowdOf). */
  open = 0;
  /** Les dresseurs de la salle de combat (aucun en salle de boss : le champion a le sien). */
  private groups: TrainerGroup[] = [];
  private wave = 0;
  private pending: PendingSpawn[] = [];
  /** Sauvages déjà comptés comme K.O. */
  private readonly counted = new Set<Actor>();
  killed = 0;
  total = 0;
  level = 0;
  private doors: Door[] = [];
  private chosen: ExitOffer | null = null;
  /** Temps avant de pouvoir redire qu'une porte demande une CS. */
  private nag = 0;
  /** `badge` : le badge HTML d'un don, qui flotte au-dessus de la récompense (net, contrairement au canvas). */
  private pedestal: { x: number; y: number; color: string; reward: Reward; donor?: DonorId; label: HTMLElement; badge: HTMLElement | null } | null = null;
  /** Le gain de la salle a été versé (la salle est libérée). */
  private paid = false;
  /** Salle de boss : les Pokémon sortent de Poké Balls. */
  private boss = false;
  /** Opacité du voile noir (0 → 1) ; il s'éclaircit tout seul en arrivant dans une salle. */
  fade = 0;
  /** L'équipe nage dans cette salle (CS Surf, ou salle sans chemin à pied) : main.ts le règle avant start(). */
  swim = true;
  private rng = new Rng(1);
  private readonly layer: HTMLElement;
  /** Étiquette « ⛰ Grotte » au-dessus de la bouche, et fondu en cours vers la grotte. */
  private caveLabel: HTMLElement | null = null;
  private caveAt: { x: number; y: number } | null = null;
  private toCave = false;
  /** Salle spéciale en cours, temps restant du Défi, Défi raté. */
  private special: SpecialId | null = null;
  /** Salle sans ennemis, portes ouvertes d'emblée : le marchand, la Source. */
  private get peaceful(): boolean {
    return this.special === 'merchant' || this.special === 'spring';
  }
  private clock = 0;
  private failed = false;
  /** Ligne de front : d'où vient la vague annoncée, la flèche qui la montre, temps restant. */
  private incoming: { x: number; y: number; t: number; el: HTMLElement } | null = null;
  /** Village : les Balls des dresseurs, leurs prises (et de qui), le prochain lancer. */
  private readonly capture: CaptureThreat;
  private captives: { a: Actor; group: TrainerGroup }[] = [];
  private throwT = VILLAGE_THROW_EVERY;
  private aim: { g: TrainerGroup; t: number } | null = null;
  private catcher: TrainerGroup | null = null;
  private village = false;

  constructor(
    parent: HTMLElement,
    private readonly fx: CombatFx,
    private readonly host: RoomHost,
  ) {
    this.layer = document.createElement('div');
    this.layer.className = 'room-labels';
    parent.append(this.layer);
    this.capture = new CaptureThreat(parent, fx, {
      captured: (a) => {
        const g = this.catcher;
        if (!g) return;
        this.captives.push({ a, group: g });
        this.host.capture(a, TRAINER_CLASSES[g.cls].name);
      },
      freed: (a) => this.host.message(`${a.pokemon?.name ?? '…'} fait éclater la Ball !`),
    });
  }

  /** Les Balls en vol et la Ball qui retient un Pokémon, à dessiner avec le reste. */
  captureExtras(): ReturnType<CaptureThreat['extras']> {
    return this.capture.extras();
  }

  /** Rend les prises d'un dresseur (ou toutes), là où il se tient. */
  private releaseCaptives(g: TrainerGroup | null, at: { x: number; y: number }): void {
    const back = this.captives.filter((c) => !g || c.group === g);
    if (!back.length) return;
    this.captives = this.captives.filter((c) => !back.includes(c));
    this.host.release(back.map((c) => c.a), at.x, at.y);
  }

  /** Village : un dresseur en jeu vise le Pokémon joué, puis lance. */
  private updateThrows(dt: number, run: Run, player: Actor): void {
    const ready = player.deathT < 0 && !player.trapped && !this.capture.busy;
    if (this.aim) {
      this.aim.t -= dt;
      if (this.aim.t > 0) return;
      const g = this.aim.g;
      this.aim = null;
      if (ready && !g.done && !g.trainer.gone) {
        this.catcher = g;
        this.capture.throwAt(g.trainer.x, g.trainer.y - 0.6, player.x, player.y);
      }
      return;
    }
    this.throwT -= dt;
    if (this.throwT > 0 || !ready || !this.host.canBeCaptured()) return;
    const live = this.groups.filter((g) => g.thrown && !g.done && !g.trainer.gone);
    if (!live.length) return;
    const g = live[Math.floor(Math.random() * live.length)];
    this.throwT = Math.max(VILLAGE_THROW_MIN, VILLAGE_THROW_EVERY - VILLAGE_THROW_PER_ACT * run.act);
    this.aim = { g, t: VILLAGE_WINDUP };
    g.trainer.aim(player.x, player.y, VILLAGE_WINDUP + 0.25);
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
    this.special = run.special;
    this.failed = false;
    this.village = world.biome.id === 'village' && !run.isBoss() && !run.isShop();
    this.capture.reset();
    this.captives = [];
    this.aim = null;
    this.throwT = VILLAGE_THROW_EVERY;
    this.host.setTimer(null);
    const plan = run.waves();
    this.level = plan.level;
    this.open = openCells(world);
    const crowd = crowdOf(this.open);
    if (run.isBoss() && enemiesOn) {
      this.waves = run.bossWaves();
    } else if (this.special === 'trap' && enemiesOn) {
      // Embuscade : trois vagues plus fournies, plus fortes, réparties de même.
      const pool = run.fauna();
      const count = Math.min(36, Math.max(TRAP_WAVES, Math.round(Math.ceil(plan.perWave * TRAP_CROWD) * TRAP_WAVES * crowd)));
      this.level = plan.level + TRAP_LEVELS;
      for (let w = 0; w < TRAP_WAVES; w++) this.waves.push([]);
      for (let n = 0; n < count; n++) this.waves[n % TRAP_WAVES].push({ id: this.rng.pick(pool), level: this.level, role: 'wild' });
    } else if (!run.isShop() && !this.peaceful && enemiesOn) {
      // Répartition égale, le reste sur les premières vagues (CombatArena.gd:1636-1654).
      // Ligne de front : autant d'ennemis, en une vague de moins (deux au moins) —
      // des groupes plus fournis, qui chargent ensemble depuis l'autre bout.
      const pool = run.fauna();
      const count = Math.min(30, Math.max(plan.count, Math.round(plan.count * plan.perWave * crowd)));
      const waves = world.front ? Math.max(2, plan.count - 1) : plan.count;
      for (let w = 0; w < waves; w++) this.waves.push([]);
      for (let n = 0; n < count; n++) {
        const level = plan.early ? 4 + this.rng.int(5) : plan.level;
        this.waves[n % waves].push({ id: this.rng.pick(pool), level, role: 'wild' });
      }
    }
    this.boss = run.isBoss();
    this.groups = [];
    if (!this.boss && this.waves.length) this.assignTrainers(world, run);
    this.total = this.waves.reduce((s, w) => s + w.length, 0);
    // Portes fermées dès l'arrivée : autant que la carte en offre, une seule autour de la boutique et du boss.
    // Chaque offre dit sur quelle sortie elle s'ouvre (Run.pickExits : les routes du côté de leur biome).
    const offers = run.offers(run.exitCount(world.exits.length), world.exits.map((e) => e.side));
    // Devant le boss, la porte n'annonce que lui : pas d'icône de récompense.
    this.doors = offers.map((offer, i) => ({
      exit: world.exits[offer.exit ?? i],
      offer,
      // Le Piège ne s'annonce pas (retour de test : « il ne faut pas savoir si on tombe dans un piège ») :
      // sa porte promet sa récompense, comme une autre. Retour de test : plus de texte sur les
      // portes ordinaires (« pas obligé de mettre Don de Jirachi ») — l'icône seule, en grand ;
      // la porte de la boutique le dit, celle du boss aussi.
      label: offer.biome
        ? this.biomeLabel(offer)
        : offer.special && offer.special !== 'trap'
          ? this.specialLabel(offer)
          : run.isShop(run.room + 1)
            ? this.label('Boutique', SHOP_COLOR, shopIcon())
            : run.isBoss(run.room + 1)
              ? this.label(offer.label, REWARD_COLOR[offer.reward])
              : this.iconLabel(rewardIcon(offer.reward, offer.donor)),
    }));
    this.clock = CHALLENGE_BASE + CHALLENGE_PER_WAVE * this.waves.length;
    // La grotte ne s'ouvre qu'une fois la salle libérée (CombatArena : le déclencheur naît au nettoyage).
    this.toCave = false;
    this.caveLabel = world.cave && !world.cave.used ? this.label('⛰ Grotte', '#9ab4ff') : null;
    this.caveAt = world.cave ? { x: world.cave.x, y: world.cave.y } : null;
    this.phase = 'intro';
    // Après une porte, la pause ne commence qu'une fois le fondu de retour terminé.
    this.t = (first ? 0 : FADE) + (run.isBoss() && this.total ? BOSS_DELAY : first ? FIRST_DELAY : NEXT_DELAY);
    if (run.isBoss() && this.total) this.host.bossIntro(this.doors[0]?.exit ?? null);
    if (run.isShop() || this.peaceful) {
      // Pas d'ennemis à la boutique ni chez le marchand : les portes sont ouvertes d'emblée.
      this.openDoors();
    } else if (this.special === 'trap' && this.total) {
      // La récompense attend au centre, seule ; les portes restent closes.
      this.placePedestal(world, run);
      this.pedestal?.label.classList.add('bait');
      this.phase = 'armed';
    } else if (!this.total) {
      // Sauvages désactivés dans le panneau : rien à combattre, rien à gagner.
      this.phase = 'cleared';
      this.paid = true;
      this.t = 0;
    }
  }

  /**
   * `others` : les invités debout (en ligne) ; `claimers` : ceux qui ont pressé E depuis le dernier pas.
   * N'importe quel joueur peut passer une porte ou prendre la récompense (retour de test : « n'importe qui
   * pourrait lancer la zone suivante, pas forcément l'hôte : ça peut foutre la merde, c'est marrant »).
   */
  update(dt: number, input: InputSample, world: WorldMap, run: Run, player: Actor, enemies: readonly Actor[], others: readonly Actor[] = [], claimers: readonly Actor[] = []): void {
    this.capture.update(dt, input, player);
    if (this.village && this.phase === 'waves') this.updateThrows(dt, run, player);
    for (const e of enemies) {
      if (e.deathT >= 0 && !this.counted.has(e)) {
        this.counted.add(e);
        this.killed++;
      }
    }
    for (const p of this.pending) p.t += dt;
    if (this.incoming && (this.incoming.t -= dt) <= 0) this.dropIncoming();
    for (const p of this.pending.filter((q) => q.t >= SPAWN_ANNOUNCE)) {
      // Sortie de Poké Ball : pas de nuage, la gerbe de la ball suffit.
      const g = p.group !== undefined ? this.groups[p.group] : undefined;
      const a = this.host.spawnEnemy(p.id, p.level, p.x, p.y, p.role, g?.ace ? ACE_BARS : undefined);
      g?.actors.push(a);
    }
    this.pending = this.pending.filter((q) => q.t < SPAWN_ANNOUNCE);
    // Les dresseurs mènent leurs Pokémon (Trainer.direct) ; tous libérés, ils s'enfuient.
    this.groups.forEach((g, k) => {
      if (g.done) g.trainer.update(dt, world, Math.random);
      else g.trainer.direct(dt, world, player, g.actors.filter((a) => a.deathT < 0), Math.random);
      if (g.thrown && !g.done && g.actors.length && g.actors.every((a) => a.deathT >= 0) && !this.pending.some((p) => p.group === k)) this.flee(g, world);
    });
    this.t -= dt;
    this.nag -= dt;
    if (this.phase !== 'fadeOut') this.fade = Math.max(0, this.fade - dt / FADE);

    switch (this.phase) {
      case 'armed': {
        const p = this.pedestal;
        if (p && Math.hypot(player.x - p.x, player.y - p.y) < TRAP_RADIUS) {
          p.label.classList.remove('bait');
          this.host.toast('Embuscade !');
          this.phase = 'intro';
          this.t = 0.4;
        }
        break;
      }
      case 'intro':
        if (this.t <= 0) this.startWave(world, player);
        break;
      case 'waves': {
        if (this.special === 'challenge') {
          this.clock -= dt;
          this.host.setTimer(Math.max(0, this.clock));
          if (this.clock <= 0) {
            // Temps écoulé : ceux qui restent s'enfuient, et la récompense avec eux.
            this.failed = true;
            this.pending = [];
            this.host.dismissEnemies();
            for (const g of this.groups) if (!g.done) this.flee(g, world);
            this.host.setTimer(null);
            this.host.message('Temps écoulé : les sauvages s’enfuient');
            this.phase = 'cleared';
            this.t = CLEAR_DELAY;
            break;
          }
        }
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
        // (Une prise dont le dresseur a filé sans être battu revient quand même : la salle est libérée.)
        if (this.captives.length) this.releaseCaptives(null, player);
        this.capture.reset();
        if (this.t > 0) break;
        if (!this.paid) {
          // La salle est libérée : ₽ (×3 après un boss), puis 0,8 s avant d'ouvrir.
          this.paid = true;
          if (run.isFinal) {
            this.phase = 'over';
            this.host.victory();
            return;
          }
          // Défi réussi ₽ ×3, piège ₽ ×2 ; un défi raté paie la salle, sans plus.
          const won = this.special === 'challenge' && !this.failed;
          const gold = run.roomGold * (run.isBoss() || won ? 3 : this.special === 'trap' ? 2 : 1);
          run.money += gold;
          this.host.setTimer(null);
          this.host.roomCleared();
          this.host.toast(won ? 'Défi réussi !' : this.failed ? 'Défi raté…' : 'Salle libérée !', `+${gold} ₽`);
          if (this.special === 'challenge' || this.special === 'trap') this.host.specialDone(this.special, !this.failed);
          this.t = OPEN_DELAY;
          break;
        }
        // Le piège a déjà posé sa récompense ; le défi raté n'en a plus.
        if (!this.pedestal && !this.failed) this.placePedestal(world, run);
        this.openDoors();
        break;
      case 'open':
        this.updateOpen(input, world, run, player, others, claimers);
        break;
      case 'fadeOut':
        this.fade = Math.min(1, this.fade + dt / FADE);
        // Écran noir : on entre dans la grotte ; la salle reste ouverte, figée, jusqu'au retour.
        if (this.fade >= 1 && this.toCave) {
          this.toCave = false;
          this.phase = 'open';
          this.host.enterCave();
          break;
        }
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
    // Ligne de front : les anneaux attendent le préavis (t négatif), le temps du grondement et de la flèche.
    const warn = world.front && !this.boss ? this.announce(world, player) : 0;
    // Les dresseurs de cette vague se tournent vers le joueur et lancent leurs Poké Balls.
    for (const g of this.groups) {
      if (g.wave !== this.wave) continue;
      g.thrown = true;
      g.trainer.aim(player.x, player.y, 1.2);
      if (g.ace) {
        this.host.message(`${TRAINER_CLASSES[g.cls].name} te défie !`);
        sfx('vs');
      }
    }
    for (const mon of this.waves[this.wave] ?? []) {
      const g = mon.group !== undefined ? this.groups[mon.group] : undefined;
      const swims = SWIMMERS.has(mon.id);
      const at = (g && this.spawnNear(world, g.trainer, player, swims)) ?? this.spawnPoint(world, player, swims);
      if (!at) continue;
      this.pending.push({ ...mon, ...at, t: -warn });
      // Toutes les balls d'une vague partent ensemble ; elles s'ouvrent quand le Pokémon apparaît (0,55 s).
      this.fx.ballSend(at.x, at.y);
    }
  }

  /**
   * Case libre et atteignable, loin des bords (6 cases, comme le jeu) et du
   * joueur. Ligne de front : dans la place au bout du couloir le plus
   * éloigné du joueur — l'autre bout au départ, derrière lui s'il a déjà
   * traversé.
   */
  private spawnPoint(world: WorldMap, player: { x: number; y: number }, swims: boolean): { x: number; y: number } | null {
    const free = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= world.w || y >= world.h) return false;
      const i = y * world.w + x;
      return !!world.reachable[i] && !world.blocked[i] && (!world.water[i] || swims);
    };
    const end = this.frontEnd(world, player);
    if (end) {
      for (let tries = 0; tries < 200; tries++) {
        const x = Math.floor(end.x + this.rng.range(-8, 8));
        const y = Math.floor(end.y + this.rng.range(-8, 8));
        if (free(x, y) && Math.hypot(x + 0.5 - player.x, y + 0.95 - player.y) >= SPAWN_MIN_DIST * 2) return { x: x + 0.5, y: y + 0.95 };
      }
    }
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

  /** Une case libre près du dresseur, à distance du joueur : là où tombe sa Poké Ball. */
  private spawnNear(world: WorldMap, from: { x: number; y: number }, player: Actor, swims: boolean): { x: number; y: number } | null {
    for (let tries = 0; tries < 60; tries++) {
      const a = this.rng.range(0, Math.PI * 2);
      const d = this.rng.range(1.2, THROW_RANGE);
      const x = Math.floor(from.x + Math.cos(a) * d);
      const y = Math.floor(from.y + Math.sin(a) * d);
      if (x < 1 || y < 1 || x >= world.w - 1 || y >= world.h - 1) continue;
      const i = y * world.w + x;
      if (!world.reachable[i] || world.blocked[i] || (world.water[i] && !swims)) continue;
      if (Math.hypot(x + 0.5 - player.x, y + 0.95 - player.y) < SPAWN_MIN_DIST * 0.7) continue;
      return { x: x + 0.5, y: y + 0.95 };
    }
    return null;
  }

  /**
   * Les dresseurs de la salle (data/trainers.ts) : un par vague, deux pour une vague de plus de
   * trois Pokémon ; leurs Pokémon prennent les couleurs de leur classe. Ils attendent chacun à
   * sa place, loin de l'entrée, qu'on les voie faire les cent pas. Parfois, un top dresseur
   * ajoute sa propre vague, la dernière : un demi-boss.
   */
  private assignTrainers(world: WorldMap, run: Run): void {
    const pool = run.fauna();
    const level = Math.max(...this.waves.flat().map((m) => m.level));
    // Pas de top dresseur au premier acte (retour de test : « tout ce qui est top dresseur arrive un peu plus tard »).
    if (!this.special && run.act >= 1 && this.rng.chance(ACE_CHANCE + 0.05 * run.act)) {
      this.waves.push(Array.from({ length: ACE_TEAM }, () => ({ id: 0, level: level + ACE_LEVELS, role: 'wild' as const })));
    }
    const last = this.waves.length - 1;
    this.waves.forEach((wave, w) => {
      const ace = last === w && wave.length === ACE_TEAM && wave[0].id === 0;
      const n = ace ? 1 : wave.length > SOLO_MAX ? 2 : 1;
      const first = this.groups.length;
      for (let k = 0; k < n; k++) {
        const cls = ace ? this.rng.pick(ACES) : pickClass(this.rng, run.biome, run.act === 0 ? 0 : 0.35);
        const at = this.spawnPoint(world, world.spawn, false) ?? world.spawn;
        this.groups.push({ trainer: new Trainer(TRAINER_CLASSES[cls].sprite, at, null, 2.5), cls, wave: w, actors: [], thrown: false, done: false, ace });
      }
      wave.forEach((m, i) => {
        m.group = first + (i % n);
        m.id = pickMember(this.rng, this.groups[m.group].cls, pool, run.variety);
      });
    });
  }

  /** Les dresseurs encore dans la salle, pour le rendu. */
  get trainers(): Trainer[] {
    return this.groups.filter((g) => !g.trainer.gone).map((g) => g.trainer);
  }

  /** Il s'enfuit par la sortie la plus proche, au-delà du bord de la carte. */
  private flee(g: TrainerGroup, world: WorldMap): void {
    g.done = true;
    const t = g.trainer;
    // Ses Pokémon battus, il rend ce qu'il a pris.
    this.releaseCaptives(g, t);
    if (this.catcher === g) this.capture.reset();
    const e = [...world.exits].sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y))[0];
    if (!e) return t.fleeTo(t.x, -2);
    t.fleeTo(e.side === 'W' ? -2 : e.side === 'E' ? world.w + 2 : e.x, e.side === 'N' ? -2 : e.side === 'S' ? world.h + 2 : e.y);
  }

  /** Ligne de front : le bout du couloir le plus éloigné du joueur, d'où surgit la vague (null : salle ordinaire). */
  private frontEnd(world: WorldMap, player: { x: number; y: number }): { x: number; y: number } | null {
    if (!world.front) return null;
    const { near, far } = world.front;
    return Math.hypot(player.x - near.x, player.y - near.y) > Math.hypot(player.x - far.x, player.y - far.y) ? near : far;
  }

  /**
   * Ligne de front : annonce la vague avant ses anneaux : grondement et sol qui
   * tremble, sans flèche ni texte.
   * Rend le préavis, en secondes.
   */
  private announce(world: WorldMap, player: Actor): number {
    const end = this.frontEnd(world, player);
    if (!end) return 0;
    // Plus de flèche rose vers le bout d'où vient la vague (retour de test : « c'est un peu chiant ») :
    // le grondement et la secousse suffisent à prévenir.
    this.dropIncoming();
    sfx('quake');
    this.host.rumble();
    return FRONT_WARN;
  }

  private dropIncoming(): void {
    this.incoming?.el.remove();
    this.incoming = null;
  }

  private openDoors(): void {
    this.phase = 'open';
    sfx('doorOpen');
    for (const d of this.doors) d.label.classList.add('open');
    this.caveLabel?.classList.add('open');
    if (this.doors.some((d) => d.offer.biome)) this.host.message(this.doors.length > 1 ? 'Choisissez votre route' : 'La route est ouverte');
    else if (this.doors.length) this.host.message(this.doors.length > 1 ? 'Choisissez une sortie' : 'La sortie est ouverte');
  }

  /** Récompense au centre de la carte (CombatArena._spawn_boon), sur la case libre la plus proche. */
  private placePedestal(world: WorldMap, run: Run): void {
    const cx = world.w / 2;
    const cy = world.h / 2;
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    // Sans Surf, jamais sur l'îlot du Lac (retour de test : « si le mec n'a pas Surf, il ne
    // pourra jamais prendre la récompense ») : la case la plus centrale qu'on atteint à pied.
    const reach = this.swim ? world.reachable : landReachable(world);
    for (let y = 2; y < world.h - 2; y++) {
      for (let x = 2; x < world.w - 2; x++) {
        const i = y * world.w + x;
        if (!reach[i] || world.blocked[i] || world.water[i]) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d < bestD) {
          bestD = d;
          best = { x: x + 0.5, y: y + 0.8 };
        }
      }
    }
    if (!best) return;
    // Un don sans donateur annoncé (première salle, sortie de boss, salle forcée) : on le tire
    // maintenant, pour que le badge posé et l'écran des dons montrent le même légendaire (retour
    // de test : le badge de Mew s'affichait par défaut, puis l'écran proposait Électhor).
    if (run.reward === 'boon' && !run.donor) run.donor = run.boons.pickDonor(run.rng) ?? undefined;
    const color = REWARD_COLOR[run.reward];
    let badge: HTMLElement | null = null;
    if (run.reward === 'boon' && run.donor) {
      badge = document.createElement('div');
      badge.className = 'rw-pedestal';
      badge.append(donorBadge(run.donor));
      this.layer.append(badge);
    }
    // Pas de texte au-dessus de la récompense : seulement [E], quand on s'en approche.
    this.pedestal = { ...best, color, reward: run.reward, donor: run.donor, label: this.label('[E]', '#efe6d2'), badge };
    this.host.prepareReward(run.reward);
  }

  private updateOpen(input: InputSample, world: WorldMap, run: Run, player: Actor, others: readonly Actor[], claimers: readonly Actor[]): void {
    const everyone = [player, ...others];
    // Bouche de grotte : on s'avance dans le trou, contre la paroi (la case de paroi bloque, le pied s'arrête au ras).
    const cave = world.cave;
    if (cave && !cave.used && everyone.some((a) => Math.abs(a.x - (cave.x + 0.5)) < 0.9 && a.y < cave.y + 1.75)) {
      this.toCave = true;
      this.phase = 'fadeOut';
      sfx('doorEnter');
      return;
    }
    const p = this.pedestal;
    if (p) {
      const nearTo = (a: Actor) => Math.hypot(a.x - p.x, a.y - p.y) < PICKUP_RADIUS + 0.6;
      p.label.classList.toggle('open', everyone.some(nearTo));
      // L'écran de choix s'ouvre chez l'hôte, qu'il soit le preneur ou un invité (le don est pour toute l'équipe).
      if ((nearTo(player) && input.interact) || claimers.some(nearTo)) this.claim(run);
    }
    for (const d of this.doors) {
      const who = everyone.find((a) => this.atExit(world, a, d.exit));
      if (who) {
        if (d.offer.locked) {
          if (this.nag <= 0) this.host.message(`Il faut la CS ${csName(d.offer.locked)} pour aller ${toBiome(d.offer.biome!)}`);
          this.nag = LOCKED_NAG;
          continue;
        }
        // Une récompense laissée au centre est perdue en passant la porte, comme dans le jeu.
        this.chosen = d.offer;
        this.phase = 'fadeOut';
        sfx('doorEnter');
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
    sfx('loot');
    this.host.message(`₽ Butin : +${gold} ₽`);
    this.consume();
  }

  /** La récompense est prise : elle disparaît du centre. */
  private consume(): void {
    const p = this.pedestal;
    if (!p) return;
    this.fx.attackAnim('fx_boost', p.x, p.y);
    p.label.remove();
    p.badge?.remove();
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

  /**
   * Porte d'une salle spéciale : son nom en grand, à sa couleur, et dessous
   * ce qu'elle promet (le marchand : ses deux offres).
   */
  private specialLabel(offer: ExitOffer): HTMLElement {
    const sp = SPECIALS[offer.special!];
    const el =
      offer.special === 'merchant'
        ? this.label('Pari · Don contre des PV', sp.color)
        : this.label('', REWARD_COLOR[offer.reward], rewardIcon(offer.reward, offer.donor));
    el.classList.add('route');
    const name = document.createElement('span');
    name.className = 'room-biome';
    name.textContent = `${sp.glyph} ${sp.name}`;
    name.style.setProperty('--b', sp.color);
    el.prepend(name);
    return el;
  }

  /** Une récompense hors porte (le marchand) : on la tire et on ouvre son écran. */
  grant(reward: Reward, done: () => void = () => {}): void {
    this.host.prepareReward(reward);
    this.host.openReward(reward, done);
  }

  /**
   * Porte de sortie de boss : le biome en grand, à sa couleur, et dessous la
   * récompense de la première salle (ou la CS qui manque, porte grisée).
   */
  private biomeLabel(offer: ExitOffer): HTMLElement {
    const biome = offer.biome!;
    const cs = offer.locked && CS_LIST.find((c) => c.id === offer.locked);
    const place = offer.victory ? { name: VICTORY_ROAD.name, color: VICTORY_ROAD.color } : { name: BIOMES[biome].name, color: BIOME_COLOR[biome] };
    // Sous le nom du biome, l'icône de la récompense seule (retour de test : moins de texte).
    const el = cs ? this.label(`CS ${cs.name} requise`, '#b9b2a4', itemIcon(cs.icon)) : this.label('', REWARD_COLOR[offer.reward], rewardIcon(offer.reward, offer.donor));
    el.classList.add('route');
    el.classList.toggle('locked', !!cs);
    const name = document.createElement('span');
    name.className = 'room-biome';
    name.textContent = `→ ${place.name}`;
    name.style.setProperty('--b', place.color);
    el.prepend(name);
    return el;
  }

  /** Une étiquette sans texte : l'icône de la récompense seule, en grand. */
  private iconLabel(icon: HTMLElement): HTMLElement {
    const el = this.label('', '#efe6d2', icon);
    el.classList.add('icon-only');
    return el;
  }

  private label(text: string, color: string, icon: HTMLElement | null = null): HTMLElement {
    const el = document.createElement('div');
    el.className = 'room-label';
    if (icon) el.append(icon);
    el.append(text);
    el.style.setProperty('--c', color);
    this.layer.append(el);
    return el;
  }

  /** En grotte : les étiquettes de la salle s'effacent, elle reste en l'état pour le retour. */
  setHidden(hidden: boolean): void {
    this.layer.hidden = hidden;
  }

  /** Retour de grotte : la bouche est consommée, son étiquette part. */
  caveDone(): void {
    this.caveLabel?.remove();
    this.caveLabel = null;
  }

  /** Hors run (le Repaire) : ni vagues, ni portes, ni voile. */
  clear(): void {
    this.clearLabels();
    this.pending = [];
    this.waves = [];
    this.groups = [];
    this.total = 0;
    this.phase = 'over';
    this.fade = 0;
    this.special = null;
    this.host.setTimer(null);
  }

  private clearLabels(): void {
    this.layer.replaceChildren();
    this.layer.hidden = false;
    this.caveLabel = null;
    this.pedestal = null;
    this.doors = [];
    this.incoming = null;
  }

  /** Au sol, sous les Pokémon : anneaux d'annonce des apparitions. */
  drawGround(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void {
    const sx = (x: number) => Math.round((x * TILE - camX) * k);
    const sy = (y: number) => Math.round((y * TILE - camY) * k);

    // Anneau magenta qui grandit puis se resserre (0,15 → 1 sur 85 %, puis → 0,05).
    for (const p of this.boss ? [] : this.pending) {
      // Préavis de la Ligne de front : pas encore d'anneau.
      if (p.t < 0) continue;
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
      if ((this.phase !== 'open' && this.phase !== 'fadeOut') || d.offer.locked) {
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
        // Ouverte : lueur au sol à la couleur de la récompense (du biome, en sortie de boss), et particules qui montent.
        const color = d.offer.biome ? BIOME_COLOR[d.offer.biome] : REWARD_COLOR[d.offer.reward];
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
      // L'icône de la récompense flotte au-dessus de son ombre (src/ui/rewardicons.ts).
      const cx = sx(p.x);
      const base = sy(p.y);
      const bob = Math.round(Math.sin(time * 2.4) * 2 * k);
      b.fillStyle = 'rgba(16,24,12,0.3)';
      b.beginPath();
      b.ellipse(cx, base, 6 * k, 2.2 * k, 0, 0, Math.PI * 2);
      b.fill();
      // Halo à la couleur de la récompense : elle se repère de loin, même sur une herbe chargée.
      const glowY = base - 14 * k + bob;
      b.globalCompositeOperation = 'lighter';
      const g = b.createRadialGradient(cx, glowY, 0, cx, glowY, 16 * k);
      g.addColorStop(0, withAlpha(p.color, 0.45 + 0.1 * Math.sin(time * 3)));
      g.addColorStop(1, withAlpha(p.color, 0));
      b.fillStyle = g;
      b.fillRect(cx - 16 * k, glowY - 16 * k, 32 * k, 32 * k);
      b.globalCompositeOperation = 'source-over';
      if (p.reward !== 'boon') drawRewardIcon(b, p.reward, cx, glowY, 20 * k);
    }
  }

  /** Étiquettes HTML des portes ouvertes et de la récompense, recalées sur la caméra. */
  placeLabels(proj: Projector): void {
    for (const d of this.doors) {
      const e = d.exit;
      // Étiquette vers l'intérieur de la carte, pour qu'elle ne sorte pas de l'écran.
      // Une porte de route porte deux lignes (biome et récompense) : un peu plus loin du bord.
      const far = d.offer.biome ? 1.25 : 1;
      // Une porte ordinaire : son icône flotte juste au-dessus de la sortie elle-même (retour de
      // test), un peu en retrait du bord pour rester à l'écran.
      const onDoor = d.label.classList.contains('icon-only');
      // Sur une porte ordinaire, l'icône se centre sur le halo de la sortie (retour de test : « il est un peu sur la
      // gauche du halo flottant ») : à peine rentrée vers la carte, pour que le bord de l'écran ne la coupe pas.
      const ox = e.side === 'W' ? (onDoor ? 0.3 : 2.2 * far) : e.side === 'E' ? (onDoor ? -0.3 : -2.2 * far) : 0;
      const oy = e.side === 'N' ? (onDoor ? 0.5 : 1.6 * far) : e.side === 'S' ? (onDoor ? -0.6 : -1.6 * far) : onDoor ? -0.4 : -1;
      const p = proj.toCss(e.x + ox, e.y + oy);
      d.label.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
    }
    if (this.caveLabel && this.caveAt) {
      const c = this.caveAt;
      const p = proj.toCss(c.x + 0.5, c.y - 1.4);
      this.caveLabel.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
    }
    if (this.pedestal) {
      const p = proj.toCss(this.pedestal.x, this.pedestal.y - 2.2);
      this.pedestal.label.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
      const badge = this.pedestal.badge;
      if (badge) {
        // Là où le canvas dessinait l'icône : 14 px du tampon au-dessus du sol, 1,4 case de large.
        const q = proj.toCss(this.pedestal.x, this.pedestal.y - 14 / TILE);
        badge.style.setProperty('--s', `${Math.round(1.4 * proj.perTile)}px`);
        badge.style.transform = `translate(${q.x}px, ${q.y}px) translate(-50%, -50%)`;
      }
    }
    if (this.incoming) this.placeIncoming(this.incoming, proj);
  }

  /**
   * Flèche de la vague : au-dessus du bout du couloir s'il est à l'écran,
   * pointée vers le bas ; sinon plaquée au bord, sur la droite qui joint le
   * centre de l'écran à ce bout, et pointée vers lui.
   */
  private placeIncoming(inc: { x: number; y: number; el: HTMLElement }, proj: Projector): void {
    const p = proj.toCss(inc.x, inc.y - 2);
    const w = this.layer.clientWidth;
    const h = this.layer.clientHeight;
    const margin = 70;
    const cx = w / 2;
    const cy = h / 2;
    const dx = p.x - cx;
    const dy = p.y - cy;
    // Facteur qui ramène le point sur le cadre intérieur (marge) : ≥ 1, il est déjà dedans.
    const k = Math.min(dx ? (cx - margin) / Math.abs(dx) : Infinity, dy ? (cy - margin) / Math.abs(dy) : Infinity);
    const edge = k < 1;
    const x = edge ? cx + dx * k : p.x;
    const y = edge ? cy + dy * k : p.y;
    inc.el.classList.toggle('edge', edge);
    inc.el.style.setProperty('--a', `${edge ? Math.atan2(dy, dx) : Math.PI / 2}rad`);
    inc.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  }

}

const csName = (id: string) => CS_LIST.find((c) => c.id === id)?.name ?? id;
/** « à l'Océan », « au Lac », « aux … » : la préposition qui va devant le nom du biome. */
const toBiome = (b: BiomeId) => {
  const name = BIOMES[b].name;
  return /^[AEIOUÉÈÊ]/.test(name) ? `à l'${name}` : FEMININE.has(b) ? `à la ${name}` : `au ${name}`;
};
const FEMININE = new Set<BiomeId>(['prairie', 'foret', 'plage']);
