import { sfx } from '../audio/audio';
import type { ActionAnim, PmdSheet, SpeciesInfo } from '../assets/pmd';
import { AttackState } from '../combat/attackstate';
import type { CompanionBrain } from '../combat/companion';
import type { EnemyBrain } from '../combat/enemy';
import type { Pokemon } from '../combat/pokemon';
import type { InputSample } from '../input/input';
import { Rng } from '../core/rng';
import { heightAt, type WorldMap } from '../world/generate';

// Un Pokémon dans le monde (membre de l'équipe ou sauvage). Positions en cases (1 case =
// 16 px = 1 unité du jeu Godot) : les vitesses du jeu s'appliquent telles quelles.

/** Valeurs du jeu : TeamMember.SPEED, TeamMember.DASH_* (vitesse, durée, recharge d'une charge). */
export const PLAYER_SPEED = 9.4;
export const DASH_SPEED = 26;
export const DASH_TIME = 0.16;
export const DASH_RECHARGE = 1.6;
/**
 * Un dash qui finit dans un obstacle se prolonge jusqu'à la première place
 * libre, pendant au plus ce temps (s) ; au-delà, on revient sur ses pas.
 */
const DASH_OVERRUN = 0.15;
/** Dash contre un obstacle infranchissable : rebond en arrière (cases/s, amorti) et sa durée (s), ~½ case. */
const BONK_SPEED = 8;
const BONK_TIME = 0.18;
/**
 * Glace (Montagne glacée) : on y file un peu plus vite qu'à pied, sans pouvoir
 * tourner. Ajout : absent du jeu Godot.
 */
const ICE_SPEED = 11;
/**
 * La boue du Marais (retour de test : « chaque biome doit avoir son gameplay ») : on y avance
 * à cette part de sa vitesse. Le dash, lui, la traverse d'un bond ; les Pokémon de type Vol
 * (ils la survolent) et Spectre (ils flottent) n'y sont pas pris.
 */
export const MUD_SLOW = 0.55;
/** Dans un escalier, on monte marche à marche : vitesse réduite. */
const STAIRS_SPEED = 0.55;
/** Durée du fondu à pied ↔ sur la monture, en secondes. */
const SWIM_FADE = 0.28;
/**
 * Deux touches ne se relâchent jamais dans la même image : sans délai de
 * grâce, une diagonale finissait sur l'axe de la dernière touche lâchée.
 */
const DIAG_GRACE = 0.09;
/** Demi-largeur et hauteur de la boîte de collision au sol (capsule r 0,45 du jeu). */
const HALF_W = 0.4;
const BODY_H = 0.5;

/** Direction PMD (ligne de la planche) depuis un vecteur écran : 0 = bas, puis sens horaire vu de dessus. */
export function dirFromVector(dx: number, dy: number): number {
  return (((Math.round(Math.atan2(dx, dy) / (Math.PI / 4)) % 8) + 8) % 8);
}

export class Actor {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  dir = 0;
  moving = false;
  animT = 0;
  sheet: PmdSheet | null = null;
  info: SpeciesInfo | null = null;
  dashT = 0;
  /**
   * Charges de dash. Le jeu part de 0 (elles s'achètent au camp, cf.
   * GameManager.dash_charges_bought) : le prototype en donne une pour
   * qu'on puisse esquiver dès la première partie.
   */
  dashMax = 1;
  dashCharges = 1;
  /** Temps écoulé sur la charge en cours de recharge (une à la fois). */
  dashRecharge = 0;
  /** Fiche de combat (stats, PV, capacités), chargée en différé. */
  pokemon: Pokemon | null = null;
  /** Action PMD en cours (attaque, tir, coup encaissé), jouée une fois. */
  action: { anim: ActionAnim; t: number } | null = null;
  /** Flash de couleur (coup porté ou reçu) : couleur CSS, temps restant, durée. */
  flash = { color: '#fff', t: 0, dur: 1, alpha: 0.8 };
  /** Recul : vitesse en cases/s, amortie, et temps restant pendant lequel l'IA ne pilote plus. */
  kbVx = 0;
  kbVy = 0;
  kbT = 0;
  /** Fenêtre de ténacité : un seul recul par POISE_TIME. */
  poiseT = 0;
  /** Fente vers la cible : direction × distance (cases) et temps écoulé (cf. TeamMember._lunge). */
  lunge = { dx: 0, dy: 0, t: Infinity };
  /** Mort : temps écoulé depuis le K.O. (fondu puis retrait), -1 tant qu'il est debout. */
  deathT = -1;
  /**
   * Rôle en salle de boss (EnemyAI.setup) : les 5 premiers Pokémon d'un
   * champion sont « champion », le 6ᵉ, son as, est « boss » ; les sbires et
   * les sauvages restent « wild ».
   */
  role: 'wild' | 'champion' | 'boss' = 'wild';
  /** Champion qui l'envoie (clé de CHAMPIONS) : ses Pokémon lancent son attaque signature (combat/signatures.ts). */
  signature: string | null = null;
  /** Barres de PV : à 0 PV, s'il en reste, le Pokémon remonte au maximum (changement de phase). */
  bars = 1;
  barsLeft = 1;
  /** Barre de vie affichée : elle rattrape les PV réels (la part perdue s'efface en clair). */
  hpShown = 1;
  /** IA de combat d'un sauvage (null : simple flânerie, ou un membre de l'équipe). */
  brain: EnemyBrain | null = null;
  /** Membres de l'équipe qui ont touché ce sauvage : tous prennent l'XP à sa mort. */
  readonly hitBy = new Set<Actor>();
  /** IA d'un membre de l'équipe quand on ne le joue pas (compagnon). */
  ally: CompanionBrain | null = null;
  /** Recharges, verrous et combo de ce Pokémon (les membres de l'équipe attaquent). */
  readonly atk = new AttackState();
  /** Vitesse voulue par l'IA (cases/s), appliquée au pas suivant. */
  steerVx = 0;
  steerVy = 0;
  /** Pas encore provoqué : il flâne au lieu de suivre `steer`. */
  wander = true;
  /** Anticipation d'une attaque (écrasement et blanchiment du sprite) : temps écoulé, durée, taille finale de l'anneau. */
  windup = { t: 0, dur: 0, ring: 1.4 };
  /**
   * Entrée en puissance d'un Pokémon de champion (Combat.bossIntro) : temps
   * écoulé, instant de la libération, durée. Tant qu'elle dure, il n'agit pas
   * et ne prend aucun coup. null : aucune en cours.
   */
  intro: { t: number; burst: number; dur: number } | null = null;
  /**
   * Évolution en cours (Combat.evolve) : temps écoulé, durée, instant de
   * l'échange de forme (le sprite est alors tout blanc) et l'échange
   * lui-même, appelé une fois. Il n'attaque pas et ne prend aucun coup
   * pendant ce temps. null : aucune en cours.
   */
  evolve: { t: number; dur: number; swapAt: number; swap: (() => void) | null } | null = null;
  /**
   * Méga-évolué pour la salle (main.ts, data/megas.ts) : 0 sinon, ou le
   * grossissement du sprite (1,2 quand la Méga reprend la planche de sa base,
   * 1 avec la sienne). Le rendu l'entoure aussi de son aura.
   */
  mega = 0;
  /** Caché dans l'herbe haute : ni dessiné, ni visé par les tirs. */
  hidden = false;
  /**
   * Enfermé dans la Poké Ball d'un sbire (run/capture.ts) : ni dessiné (la
   * Ball l'est à sa place), ni visé, ni frappé, et il ne commande plus rien
   * le temps de s'en débattre.
   */
  trapped = false;
  /** Abri : tout coup reçu est annulé tant qu'il dure (s). */
  protectT = 0;
  /** Temps écoulé depuis la fin du dernier dash (invulnérabilité juste après). */
  sinceDash = Infinity;
  /** Sait nager (le joueur) ; les sauvages restent sur la terre ferme. */
  canSwim = false;
  /**
   * La lave du Volcan se traverse avec la CS Surf (retour de test) : on y « nage », et elle
   * brûle (run/hazards.ts). Sans elle, la lave reste un mur.
   */
  lavaOk = false;
  /** Sur l'eau, porté par la monture Surf. */
  swimming = false;
  /** Pokémon aquatique : nage sans monture (rendu à moitié immergé). */
  nativeSwimmer = false;
  /**
   * 0 = à pied, 1 = sur la monture. Suit `swimming` en SWIM_FADE secondes :
   * le rendu fond le Pokémon dans la monture (et l'inverse) au lieu de
   * permuter les deux sprites d'une image à l'autre.
   */
  swimBlend = 0;
  /** Gerbe d'eau de la dernière mise à l'eau ou sortie : âge (s) et point d'impact. */
  splashAge = Infinity;
  splashX = 0;
  splashY = 0;
  /**
   * Orientation de la monture Surf, qui n'a que 4 lignes : 0 bas, 1 droite,
   * 2 haut, 3 gauche. En diagonale, elle garde l'axe qu'elle avait déjà
   * (on descend puis on appuie à droite : elle reste de face) ; sinon elle
   * prend le profil, plus lisible qu'une vue de face qui glisse en biais.
   */
  surfFacing = 0;
  /** Retient une diagonale le temps de relâcher ses deux touches (cf. updatePlayer). */
  private diagHold = 0;
  /** Hauteur du sol sous les pieds, en étages, lissée (sert à l'effet de hauteur). */
  height = 0;
  onStairs = false;
  /**
   * Glissade sur la glace : direction (un axe pur, ±1) ; 0, 0 si l'on ne
   * glisse pas. Seul le Pokémon joué glisse : les compagnons, qui le suivent
   * pas à pas, traversent la glace à pied (écart voulu : sinon ils se
   * perdaient sur la patinoire au lieu de le rejoindre).
   */
  slideDx = 0;
  slideDy = 0;
  /**
   * Depuis combien de temps il glisse (s), 0 s'il ne glisse pas : le rendu
   * l'accroupit et le fait tanguer, FieldFx sème des éclats de glace et deux
   * traces de patin. Ajout (retour de test : « une animation sur la glissade »).
   */
  slideT = 0;
  /** 0..1 : à l'ombre d'un bâtiment ou d'un arbre (lissé par le rendu). */
  shade = 0;
  /** Couché sur un décor (un rondin du Repaire) : le sprite monte d'autant (px du monde), sans ombre au sol. */
  perch = 0;
  /** Point de départ du dash et prolongement déjà consommé (fin de dash dans un obstacle). */
  private dashFromX = 0;
  private dashFromY = 0;
  private dashOver = 0;
  /** Point d'impact d'un dash stoppé net (main.ts y soulève la poussière et secoue l'écran), puis null. */
  bonked: { x: number; y: number } | null = null;
  /** Direction du dash en cours (unitaire) : les dons de dash frappent le long de cet axe. */
  dashDx = 0;
  dashDy = 1;
  // IA de flânerie des sauvages.
  private wanderT = 0;
  private wanderDx = 0;
  private wanderDy = 0;

  /**
   * `speciesId` : l'espèce dessinée, qui change quand le Pokémon évolue en
   * cours de run. `baseId` : pour un membre de l'équipe du Repaire, son uid
   * (meta/mons.ts), clé de tout ce que la sauvegarde lui attache (nature,
   * objet tenu, attaques choisies, Super Bonbon) ; sinon, son espèce.
   */
  constructor(
    public speciesId: number,
    x: number,
    y: number,
    readonly baseId = speciesId,
  ) {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
  }

  /**
   * Vrai si la boîte au sol, posée en (x, y), chevauche une case bloquée.
   * `dash` : seules comptent les cases que même un dash ne traverse pas
   * (WorldMap.solid) — comme dans Hades, on passe à travers arbres, rochers
   * et décors. L'eau, elle, arrête qui ne sait pas nager : sinon un dash
   * franchirait le lac du Repaire sans la CS Surf.
   */
  private collides(world: WorldMap, x: number, y: number, dash = false): boolean {
    const x0 = Math.floor(x - HALF_W);
    const x1 = Math.floor(x + HALF_W - 1e-6);
    const y0 = Math.floor(y - BODY_H);
    const y1 = Math.floor(y - 1e-6);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (cx < 0 || cy < 0 || cx >= world.w || cy >= world.h) return true;
        const i = cy * world.w + cx;
        // La lave (l'eau d'un biome où l'on ne nage pas) : bloquée au génération, ouverte à Surf.
        if (world.water[i] && world.biome.water?.swim === false) {
          if (!this.lavaOk) return true;
          continue;
        }
        if ((dash ? world.solid[i] : world.blocked[i]) || (world.water[i] && !this.canSwim)) return true;
      }
    }
    return false;
  }

  /**
   * Les pieds sont sur une plaque de glace (biome à plaques `ice`). Le sentier
   * de gravier, dessiné par-dessus, donne prise : on s'y arrête.
   */
  private onIce(world: WorldMap): boolean {
    if (!world.biome.patch?.ice) return false;
    const cx = Math.floor(this.x);
    const cy = Math.floor(this.y - BODY_H / 2);
    if (cx < 0 || cy < 0 || cx >= world.w || cy >= world.h) return false;
    const i = cy * world.w + cx;
    return world.patch[i] === 1 && !world.path[i];
  }

  /** Les pieds dans la boue du Marais (ses plaques, hors chemin) : MUD_SLOW, sinon 1. */
  terrainMult(world: WorldMap): number {
    if (world.biome.id !== 'marais' || this.swimming) return 1;
    const cx = Math.floor(this.x);
    const cy = Math.floor(this.y - 0.2);
    if (cx < 0 || cy < 0 || cx >= world.w || cy >= world.h) return 1;
    const i = cy * world.w + cx;
    if (!world.patch[i] || world.path[i]) return 1;
    const types = this.pokemon?.types ?? [];
    return types.includes('flying') || types.includes('ghost') ? 1 : MUD_SLOW;
  }

  /** Poussée externe (deux Pokémon qui se chevauchent s'écartent), avec les mêmes collisions. */
  nudge(world: WorldMap, dx: number, dy: number): void {
    this.move(world, dx, dy);
  }

  /**
   * Déplacement axe par axe : on glisse le long des obstacles au lieu de s'y
   * coller. Un acteur déjà pris dans un obstacle (apparition ratée) peut en
   * sortir librement, sinon il resterait figé pour toujours.
   */
  private move(world: WorldMap, dx: number, dy: number, dash = false): void {
    const stuck = this.collides(world, this.x, this.y, dash);
    if (dx && (stuck || !this.collides(world, this.x + dx, this.y, dash))) this.x += dx;
    if (dy && (stuck || !this.collides(world, this.x, this.y + dy, dash))) this.y += dy;
  }

  /**
   * Dash stoppé net : il s'arrête (hors de tout obstacle traversé juste avant),
   * encaisse le choc (Hurt) et rebondit d'une demi-case, sans perdre de PV.
   */
  private bonk(world: WorldMap): void {
    this.dashT = 0;
    if (this.collides(world, this.x, this.y)) this.backOff(world);
    this.kbVx = -this.dashDx * BONK_SPEED;
    this.kbVy = -this.dashDy * BONK_SPEED;
    this.kbT = BONK_TIME;
    this.playAction(['Hurt'], 0);
    this.bonked = { x: this.x + this.dashDx * 0.45, y: this.y + this.dashDy * 0.45 };
  }

  /**
   * Fin d'un dash coincée dans un obstacle, prolongement épuisé : on revient
   * sur ses pas jusqu'à la première place libre, au pire au point de départ.
   */
  private backOff(world: WorldMap): void {
    const ex = this.x;
    const ey = this.y;
    for (let t = 0.05; t < 1; t += 0.05) {
      const x = ex + (this.dashFromX - ex) * t;
      const y = ey + (this.dashFromY - ey) * t;
      if (!this.collides(world, x, y)) {
        this.x = x;
        this.y = y;
        return;
      }
    }
    this.x = this.dashFromX;
    this.y = this.dashFromY;
  }

  /**
   * Joue la première action disponible parmi `names` (repli comme
   * TeamMember._play_action_anim) et rend la durée de verrou : le plancher,
   * ou la vraie longueur de l'animation si elle dure plus.
   */
  playAction(names: readonly string[], floor: number): number {
    for (const n of names) {
      const anim = this.sheet?.actions.get(n);
      if (anim) {
        this.action = { anim, t: 0 };
        return Math.max(floor, anim.total);
      }
    }
    return floor;
  }

  /**
   * Membre de l'équipe K.O. : il reste couché là où il est tombé, grisé, en
   * attendant d'être ranimé (TeamMember._play_faint_anim : anim Sleep de PMD,
   * repli sur Hurt figée). Un sauvage, lui, s'efface.
   */
  downed = false;

  lieDown(): void {
    this.downed = true;
    this.moving = false;
    this.lunge.t = Infinity;
    this.playAction(['Sleep', 'Hurt'], 0);
  }

  /** Recruté en run (mercenaire) : aucun Rappel ne le relève (TeamMember.run_ally). */
  runAlly = false;

  /**
   * Partie en ligne (net/net.ts), chez l'hôte : le Pokémon d'un invité, piloté
   * depuis son navigateur (identifiant de pair). null : un Pokémon d'ici.
   */
  remote: string | null = null;
  /** Commande reçue de l'invité, appliquée au pas suivant (main.ts). */
  remoteIn: { x: number; y: number; dir: number; moving: boolean; dashT: number; swimming: boolean } | null = null;

  /**
   * Pose d'un figurant (boutique) : une animation PMD qui boucle — Sleep,
   * Idle, Eat… — sans grisaille ; une action ponctuelle (Hop) y revient.
   */
  pose: string | null = null;

  setPose(names: readonly string[]): void {
    const name = names.find((n) => this.sheet?.actions.has(n)) ?? null;
    this.pose = name;
    if (name) this.playAction([name], 0);
  }

  /** Ranimé : debout, l'animation de marche reprend. */
  getUp(): void {
    this.downed = false;
    this.deathT = -1;
    this.action = null;
  }

  /** Avance les minuteurs communs au joueur et aux sauvages (action, flash, fente, ténacité). */
  tickTimers(dt: number): void {
    if (this.action) {
      this.action.t += dt;
      const total = this.action.anim.total;
      // Couché : le sommeil boucle ; à défaut (Hurt), la dernière case reste affichée.
      if (this.downed && this.action.t >= total) this.action.t = this.action.anim.name === 'Sleep' ? this.action.t % total : total - 1e-3;
      else if (this.action.t >= total) {
        // Un figurant revient à sa pose.
        const pose = this.pose ? this.sheet?.actions.get(this.pose) : undefined;
        this.action = pose ? { anim: pose, t: this.action.anim === pose ? this.action.t % total : 0 } : null;
      }
    }
    this.flash.t = Math.max(0, this.flash.t - dt);
    this.lunge.t += dt;
    this.poiseT = Math.max(0, this.poiseT - dt);
    this.protectT = Math.max(0, this.protectT - dt);
  }

  /** Recul en cours : on glisse, la vitesse s'amortit (lerp vers 0 à 12/s, EnemyAI.gd:428-434). */
  private updateKnockback(dt: number, world: WorldMap): boolean {
    if (this.kbT <= 0) return false;
    this.kbT -= dt;
    this.move(world, this.kbVx * dt, this.kbVy * dt);
    const damp = Math.min(1, dt * 12);
    this.kbVx -= this.kbVx * damp;
    this.kbVy -= this.kbVy * damp;
    return true;
  }

  updatePlayer(dt: number, input: InputSample, world: WorldMap): void {
    this.prevX = this.x;
    this.prevY = this.y;
    this.tickTimers(dt);
    // K.O. : plus de commande, le fondu suit son cours (main.ts le relève ensuite).
    if (this.deathT >= 0) {
      this.deathT += dt;
      this.moving = false;
      this.dashT = 0;
      this.slideT = 0;
      return;
    }
    // Gelé ou endormi : il ne bouge plus, mais ses charges de dash reviennent.
    const frozen = this.trapped || (this.pokemon ? !this.pokemon.canAct : false);
    if (frozen) input = { ...input, mx: 0, my: 0, dash: false };
    // Les charges reviennent une par une (TeamMember.gd:677-683).
    if (this.dashCharges < this.dashMax) {
      this.dashRecharge += dt;
      if (this.dashRecharge >= DASH_RECHARGE) {
        this.dashRecharge = 0;
        this.dashCharges++;
      }
    }
    // Rebond après un dash stoppé net : on ne pilote plus le temps qu'il retombe.
    if (this.updateKnockback(dt, world)) {
      this.moving = false;
      this.animT += dt;
      this.updateSwim(world, dt);
      this.updateHeight(world, dt);
      return;
    }
    const wantsMove = Math.hypot(input.mx, input.my) > 0.01;
    // Comme le jeu : pas de dash à l'arrêt, ni pendant un dash en cours.
    if (input.dash && wantsMove && this.dashCharges > 0 && this.dashT <= 0) {
      const len = Math.hypot(input.mx, input.my);
      this.dashDx = input.mx / len;
      this.dashDy = input.my / len;
      this.dashT = DASH_TIME;
      this.dashCharges--;
      sfx('dash');
      this.sinceDash = 0;
      this.dashOver = 0;
      this.dashFromX = this.x;
      this.dashFromY = this.y;
    }
    if (this.dashT <= 0) this.sinceDash += dt;
    if (this.dashT > 0) {
      this.dashT -= dt;
      const sx = this.dashDx * DASH_SPEED * dt;
      const sy = this.dashDy * DASH_SPEED * dt;
      const bx = this.x;
      const by = this.y;
      this.move(world, sx, sy, true);
      // Arrêté net par ce que même un dash ne traverse pas (un mur, une maison, l'eau) : il rebondit.
      // En biais contre un mur, il glisse le long et ne rebondit pas.
      if (Math.hypot(this.x - bx, this.y - by) < Math.hypot(sx, sy) * 0.4) {
        this.bonk(world);
        return;
      }
      // Jamais d'arrêt dans un obstacle : le dash file jusqu'à la première place libre, sinon on recule.
      if (this.dashT <= 0 && this.collides(world, this.x, this.y)) {
        if (this.dashOver < DASH_OVERRUN) {
          this.dashOver += dt;
          this.dashT = 1e-6;
        } else this.backOff(world);
      }
      this.moving = true;
      this.slideT = 0;
    } else if ((this.slideDx || this.slideDy) && this.onIce(world)) {
      // Comme dans les jeux Pokémon : tout droit, sans commande, jusqu'au
      // premier obstacle ou au bout de la glace. Pas d'animation de marche :
      // il glisse, figé dans sa pose (le dash, lui, reste possible pour s'en sortir).
      const step = ICE_SPEED * dt;
      const bx = this.x;
      const by = this.y;
      this.move(world, this.slideDx * step, this.slideDy * step);
      this.moving = false;
      this.slideT += dt;
      if (Math.hypot(this.x - bx, this.y - by) < step * 0.4) this.slideDx = this.slideDy = this.slideT = 0;
    } else {
      this.slideDx = this.slideDy = this.slideT = 0;
      this.moving = wantsMove;
      if (wantsMove) {
        this.face(dirFromVector(input.mx, input.my), dt);
        const speed = PLAYER_SPEED * (this.onStairs ? STAIRS_SPEED : 1) * (this.pokemon?.speedMult ?? 1) * this.terrainMult(world);
        this.move(world, input.mx * speed * dt, input.my * speed * dt);
        // Un pas sur la glace lance la glissade, selon l'axe dominant de la commande.
        if (this.onIce(world)) {
          const horiz = Math.abs(input.mx) >= Math.abs(input.my);
          this.slideDx = horiz ? Math.sign(input.mx) : 0;
          this.slideDy = horiz ? 0 : Math.sign(input.my);
          this.dir = dirFromVector(this.slideDx, this.slideDy);
        }
      }
    }
    this.animT += dt;
    this.updateSwim(world, dt);
    this.updateHeight(world, dt);
  }

  /** Change d'orientation, sauf diagonale → axe voisin pendant DIAG_GRACE (touches en cours de relâche). */
  private face(next: number, dt: number): void {
    const adjacent = (((next - this.dir) % 8) + 8) % 8;
    if (this.dir % 2 === 1 && next % 2 === 0 && (adjacent === 1 || adjacent === 7) && this.diagHold < DIAG_GRACE) {
      this.diagHold += dt;
      return;
    }
    this.diagHold = 0;
    this.dir = next;
  }

  /** Ligne Surf : un axe pur s'applique tel quel ; une diagonale garde l'axe courant s'il en fait partie. */
  private updateSurfFacing(): void {
    if (this.dir % 2 === 0) {
      this.surfFacing = this.dir / 2;
      return;
    }
    const a = (this.dir - 1) / 2;
    const b = ((this.dir + 1) / 2) % 4;
    if (this.surfFacing !== a && this.surfFacing !== b) this.surfFacing = a % 2 === 1 ? a : b;
  }

  /** Suit la hauteur du sol sans à-coup : on la rattrape en ~0,15 s. */
  private updateHeight(world: WorldMap, dt: number): void {
    const h = heightAt(world, this.x, this.y);
    this.onStairs = h.onStairs;
    this.height += (h.height - this.height) * Math.min(1, dt * 7);
  }

  /** Monte sur la monture dès que les pieds sont dans l'eau, en descend au sec (comme le jeu, sans touche à presser). */
  private updateSwim(world: WorldMap, dt: number): void {
    const cx = Math.floor(this.x);
    const cy = Math.floor(this.y - 0.25);
    const was = this.swimming;
    this.swimming = cx >= 0 && cy >= 0 && cx < world.w && cy < world.h && world.water[cy * world.w + cx] === 1;
    if (was !== this.swimming) {
      this.splashAge = 0;
      this.splashX = this.x;
      this.splashY = this.y;
    }
    this.splashAge += dt;
    const target = this.swimming ? 1 : 0;
    const step = dt / SWIM_FADE;
    this.swimBlend = target > this.swimBlend ? Math.min(target, this.swimBlend + step) : Math.max(target, this.swimBlend - step);
    this.updateSurfFacing();
  }

  updateWild(dt: number, world: WorldMap, rng: Rng): void {
    this.prevX = this.x;
    this.prevY = this.y;
    this.tickTimers(dt);
    if (this.deathT >= 0) {
      this.deathT += dt;
      this.moving = false;
      return;
    }
    if (this.updateKnockback(dt, world)) {
      this.moving = false;
      this.updateHeight(world, dt);
      this.updateSwim(world, dt);
      return;
    }
    // Gelé ou endormi : il ne bouge plus (PokemonInstance.status_can_act).
    if (this.pokemon && !this.pokemon.canAct) {
      this.moving = false;
      return;
    }
    if (this.brain && !this.wander) {
      // Provoqué : l'IA décide de la vitesse.
      const v = Math.hypot(this.steerVx, this.steerVy);
      this.moving = v > 0.6;
      if (this.moving) {
        this.dir = dirFromVector(this.steerVx, this.steerVy);
        const mud = this.terrainMult(world);
        this.move(world, this.steerVx * mud * dt, this.steerVy * mud * dt);
      }
      this.animT += dt;
      this.updateHeight(world, dt);
      this.updateSwim(world, dt);
      return;
    }
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      if (rng.chance(0.45)) {
        this.wanderDx = this.wanderDy = 0;
        this.wanderT = rng.range(0.8, 2.5);
      } else {
        const a = rng.range(0, Math.PI * 2);
        this.wanderDx = Math.cos(a);
        this.wanderDy = Math.sin(a);
        this.wanderT = rng.range(0.6, 1.8);
      }
    }
    this.moving = this.wanderDx !== 0 || this.wanderDy !== 0;
    if (this.moving) {
      this.dir = dirFromVector(this.wanderDx, this.wanderDy);
      const before = this.x + this.y;
      const speed = 2.4 * (this.onStairs ? STAIRS_SPEED : 1) * (this.pokemon?.speedMult ?? 1) * this.terrainMult(world);
      this.move(world, this.wanderDx * speed * dt, this.wanderDy * speed * dt);
      if (this.x + this.y === before) this.wanderT = 0;
    }
    this.animT += dt;
    this.updateHeight(world, dt);
    this.updateSwim(world, dt);
  }

  /** Frame courante : marche à la cadence PMD, sinon idle = 4 premières frames à 4,5 i/s (PMDSprites.gd:362-391). */
  frame(): number {
    if (!this.sheet) return 0;
    if (this.moving) return Math.floor(this.animT * this.sheet.fps) % this.sheet.frames;
    return Math.floor(this.animT * 4.5) % Math.min(4, this.sheet.frames);
  }

  /** Frame de l'action en cours, selon ses durées PMD propres (non uniformes). */
  actionFrame(): number {
    if (!this.action) return 0;
    let t = this.action.t;
    const d = this.action.anim.durations;
    for (let i = 0; i < d.length; i++) {
      if (t < d[i]) return i;
      t -= d[i];
    }
    return d.length - 1;
  }
}
