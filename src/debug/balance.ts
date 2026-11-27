// Banc d'équilibrage : le pilote automatique des runs d'équilibrage du 20 novembre 2026,
// rangé dans le projet plutôt que recollé à la main dans la console à chaque séance.
// Chargé seulement derrière ?debug, sur le serveur de dev (main.ts) : `pokhades.balance`.
//
// Il joue un combat de champion avec une équipe donnée, au niveau donné, ses quatre
// meilleures attaques apprises (Pokemon.strongestMoves : en run, une attaque apprise ne
// prend qu'un emplacement libre, et la fin de run se jugeait sur ce que l'équipe sait),
// puis rend la durée de chaque vague, l'issue et les dégâts portés aux Pokémon du
// champion par source (le Pokémon joué, les compagnons).
//
// Pourquoi en pas à pas (`step`) : le panneau du navigateur masqué fige la boucle de
// rendu (requestAnimationFrame), et un setTimeout d'onglet caché ne passe qu'une fois
// par seconde. On avance donc la simulation à la main, 0,1 s à la fois, en rendant la
// main entre deux pas (MessageChannel, que le navigateur ne ralentit pas) pour que les
// fiches et les attaques des Pokémon qui entrent finissent de charger : sans ça, un
// Pokémon de champion reste « sans fiche » et ne se bat pas.
//
// Ce que le pilote ne sait pas faire : changer de Pokémon, viser, prendre des dons. Il
// marche vers le sauvage le plus proche, enchaîne ses quatre attaques et esquive au dash
// les zones marquées (Combat.threatAt). Il joue moins bien qu'un joueur : un combat
// perdu par lui n'est pas un combat injouable, mais deux séries se comparent entre elles.
//
// Exemples, dans la console de `?debug` :
//   await pokhades.balance.fight({ room: 35, team: [3, 6, 9, 65, 68], level: 54 })
//   await pokhades.balance.series({ room: 44, team: [6, 9], level: 70, league: true, champion: 'Peter' }, 4)

import type { Actor } from '../entities/actor';
import type { Run, SpecialId } from '../run/run';
import type { Save } from '../meta/save';

/** Ce que le banc lit et pilote de l'objet de debug (main.ts). */
export interface BalanceHost {
  readonly player: Actor;
  readonly team: Actor[];
  readonly wild: Actor[];
  readonly run: Run;
  readonly director: { phase: string; wave: number };
  readonly combat: { threatAt(x: number, y: number): { x: number; y: number } | null };
  readonly world: { hub?: { x: number; y: number } };
  readonly save: Save;
  readonly mode: string;
  /** Les écrans qui figent le jeu (évolution, récompense) : le banc les valide. */
  readonly ui?: { evolutionScreen?: { open: boolean }; rewardScreen?: { open: boolean } };
  newRun(): void;
  goto(room: number, special?: SpecialId | null): void;
  step(n: number): void;
}

export interface FightSetup {
  /** Salle du combat (8, 17, 26, 35 ; 44 sur la Route Victoire). */
  room: number;
  /** Espèces de l'équipe, la première jouée. */
  team: number[];
  level: number;
  /** Route Victoire ouverte (les champions de la Ligue comptés comme battus). */
  league?: boolean;
  /** Une salle spéciale à la place (Défi, Piège, Horde…) ; `room` hors boss, alors. */
  special?: SpecialId;
  /** Forcer le champion de l'acte (sinon celui que la graine tire). */
  champion?: string;
  /** Durée de jeu au plus, en secondes. */
  secs?: number;
  /** Dons accordés au départ, [id, rareté] (le banc des dons, debug/boonbench.ts). */
  boons?: [string, number][];
}

export interface FightResult {
  champion: string;
  /** Pokémon du champion : forme affrontée < forme de son escorte. */
  lineup: string;
  won: boolean;
  /** Secondes de jeu. */
  secs: number;
  /** Seconde où chaque vague a commencé. */
  waves: number[];
  /** Ce qui reste du champion à la fin (espèce, barres, % de la barre). */
  left: string;
  /** PV restants de l'équipe, en %. */
  team: string;
  damage: { played: number; companions: number };
  /** PV perdus par le Pokémon joué à la fin, en % de ses PV max. */
  taken: number;
  /** Dégâts encaissés par coups (hitPlayer). */
  hits: number;
  /** Combien de fois chaque don a agi (Boons.fired). */
  fired: Record<string, number>;
}

/** Pas de la simulation (s), et pas de jeu par pas (1/60 s chacun). */
const TICK = 0.1;
const FRAMES = 6;
/** Uid des Pokémon de test dans la sauvegarde : loin des vrais. */
const UID0 = 900;

export function installBalance(P: BalanceHost): {
  fight(setup: FightSetup): Promise<FightResult>;
  series(setup: FightSetup, n: number): Promise<string>;
} {
  const held = new Set<string>();
  const key = (code: string, down: boolean) => {
    if (down === held.has(code)) return;
    if (down) held.add(code);
    else held.delete(code);
    dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
  };
  const tap = (code: string, k?: string) => {
    dispatchEvent(new KeyboardEvent('keydown', { code, key: k }));
    dispatchEvent(new KeyboardEvent('keyup', { code, key: k }));
  };
  const mc = new MessageChannel();
  let wake: (() => void) | null = null;
  mc.port1.onmessage = () => {
    const w = wake;
    wake = null;
    w?.();
  };
  const yieldNow = () => new Promise<void>((r) => ((wake = r), mc.port2.postMessage(0)));

  let gt = 0;
  let lastDash = -1;
  let slot = 0;
  /** Un pas du pilote : fuir une zone marquée (au dash, une fois par 0,9 s), sinon aller frapper. */
  const pilot = () => {
    const p = P.player;
    if (!p || P.mode !== 'run') return;
    let mx = 0;
    let my = 0;
    const th = P.combat.threatAt(p.x, p.y);
    if (th) {
      mx = p.x - th.x;
      my = p.y - th.y;
      if (Math.hypot(mx, my) < 0.1) [mx, my] = [1, 0.3];
      if (gt - lastDash > 0.9) {
        lastDash = gt;
        key('ArrowRight', mx > 0.2);
        key('ArrowLeft', mx < -0.2);
        key('ArrowDown', my > 0.2);
        key('ArrowUp', my < -0.2);
        tap('Space');
        return;
      }
    } else {
      const foes = P.wild.filter((w) => w.deathT < 0 && w.pokemon);
      foes.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
      const f = foes[0];
      const tx = f?.x ?? P.world.hub?.x ?? p.x;
      const ty = f?.y ?? P.world.hub?.y ?? p.y;
      const d = Math.hypot(tx - p.x, ty - p.y);
      if (d > (f ? 2.2 : 0.8)) [mx, my] = [tx - p.x, ty - p.y];
      if (f && d < 5) tap(`Digit${1 + (slot++ % 4)}`);
    }
    const n = Math.hypot(mx, my) || 1;
    key('ArrowRight', mx / n > 0.38);
    key('ArrowLeft', mx / n < -0.38);
    key('ArrowDown', my / n > 0.38);
    key('ArrowUp', my / n < -0.38);
  };

  const fight = async (setup: FightSetup): Promise<FightResult> => {
    const { xpForLevel } = await import('../combat/pokemon');
    const { LEAGUE_GATE } = await import('../run/run');
    const { CHAMPIONS } = await import('../data/champions');
    // L'équipe de test : des individus neutres (nature docile, IV moyens), rangés sous UID0+.
    P.save.beaten = setup.league ? [...LEAGUE_GATE] : [];
    P.save.team = setup.team.map((species, i) => {
      const uid = UID0 + i;
      P.save.mons[uid] = { uid, species, nature: 'hardy', iv: { hp: 15, atk: 15, def: 15, spAtk: 15, spDef: 15, speed: 15 } };
      return uid;
    });
    // Lancée depuis le Repaire ou un écran de fin, la première run part parfois avec l'équipe
    // d'avant : on relance tant que l'équipe en jeu n'est pas celle du test.
    for (let tries = 0; tries < 3; tries++) {
      // Le bilan d'une run finie (« DÉFAITE », « VICTOIRE ») fige le jeu tant qu'il est ouvert : on le ferme.
      for (let k = 0; k < 2 && [...document.querySelectorAll<HTMLElement>('.reward')].some((e) => !e.hidden && /DÉFAITE|VICTOIRE/.test(e.innerText)); k++) {
        tap('Escape', 'Escape');
        await new Promise((r) => setTimeout(r, 400));
      }
      P.newRun();
      await new Promise((r) => setTimeout(r, 2500));
      if (P.mode === 'run' && P.team.map((m) => m.speciesId).join() === setup.team.join()) break;
    }
    P.run.room = setup.room - 1;
    if (setup.champion) {
      const run = P.run as unknown as { ensureAct(a: number): void; champions: unknown[]; reinforce(c: unknown, a: number): unknown };
      const act = Math.floor(setup.room / 9);
      run.ensureAct(act);
      run.champions[act] = run.reinforce(CHAMPIONS[setup.champion], act);
    }
    for (const m of P.team) {
      const mon = m.pokemon;
      if (!mon) continue;
      await mon.addXp(Math.max(0, xpForLevel(setup.level, mon.id) - mon.xp));
      mon.hp = mon.maxHp;
      const best = await mon.strongestMoves(4);
      mon.moves.splice(0, mon.moves.length, ...best);
      mon.movesVersion++;
    }
    // Les dons du test, comme pris à un autel : un don de statistique s'applique au Pokémon joué.
    if (setup.boons?.length) {
      const { STAT_BOONS } = await import('../combat/boons');
      const hooks = (P.combat as unknown as { hooks: { applyStat(a: Actor, id: string, from: number | undefined, to: number): void } }).hooks;
      P.run.boons.teamSize = P.team.length;
      for (const [id, r] of setup.boons) {
        const got = P.run.boons.grant(id, r);
        if (STAT_BOONS[id]) hooks.applyStat(P.player, id, undefined, got);
      }
      P.run.boons.fired.clear();
    }
    // Une Horde forcée prend la première espèce possible, comme le panneau.
    P.run.hordeSpecies = setup.special === 'horde' ? (P.run.hordePool(setup.room)[0] ?? null) : null;
    P.goto(setup.room, setup.special ?? null);

    // Les dégâts portés aux Pokémon du champion (pas aux sbires), par source ; hors boss, à tous.
    const combat = P.combat as unknown as { hitEnemy: (...a: unknown[]) => void; hitPlayer: (...a: unknown[]) => void };
    const hit = combat.hitEnemy;
    const hurt = combat.hitPlayer;
    let taken = 0;
    combat.hitPlayer = function (this: unknown, ...a: unknown[]) {
      const target = a[0] as Actor;
      const before = target.pokemon?.hp ?? 0;
      const r = hurt.apply(this, a);
      if (target === P.player) taken += Math.max(0, before - (target.pokemon?.hp ?? 0));
      return r;
    };
    const damage = { played: 0, companions: 0 };
    combat.hitEnemy = function (this: unknown, ...a: unknown[]) {
      const [e, dmg] = a as [Actor, number];
      const by = a[10] as Actor | null | undefined;
      if (e.role !== 'wild' || !P.run.isBoss()) damage[by && by !== P.player ? 'companions' : 'played'] += dmg;
      return hit.apply(this, a);
    };

    gt = 0;
    lastDash = -1;
    const waves: number[] = [];
    let wave = -1;
    try {
      while (gt < (setup.secs ?? 240)) {
        // Les répliques du champion (« Entrée pour passer ») figent le combat : on les passe.
        if (document.body.innerText.includes('Entrée pour passer')) tap('Enter', 'Enter');
        // Une évolution en route (l'équipe de test monte de niveau) ouvre son écran, qui fige le jeu.
        if (P.ui?.evolutionScreen?.open || P.ui?.rewardScreen?.open) tap('Enter', 'Enter');
        for (let k = 0; k < 400 && P.wild.some((w) => w.deathT < 0 && !w.pokemon); k++) await new Promise((r) => setTimeout(r, 0));
        pilot();
        P.step(FRAMES);
        gt += TICK;
        await yieldNow();
        if (P.director.wave !== wave) {
          wave = P.director.wave;
          waves.push(Math.round(gt));
        }
        const phase = P.director.phase;
        if (phase === 'open' || phase === 'over' || P.team.every((m) => !m.pokemon || m.pokemon.hp <= 0)) break;
      }
    } finally {
      combat.hitEnemy = hit;
      combat.hitPlayer = hurt;
      for (const k of [...held]) key(k, false);
    }
    const won = P.director.phase === 'open' || P.director.phase === 'over';
    return {
      champion: P.run.champion.name,
      lineup: P.run.champion.team.map(([f, b]) => `${f}<${b}`).join(' '),
      won,
      secs: Math.round(gt),
      waves,
      left: P.wild
        .filter((w) => w.deathT < 0 && w.role !== 'wild' && w.pokemon)
        .map((w) => `${w.speciesId}:${w.barsLeft}b:${Math.round((100 * w.pokemon!.hp) / w.pokemon!.maxHp)}%`)
        .join(' '),
      team: P.team.map((m) => `${m.speciesId}:${m.pokemon ? Math.round((100 * m.pokemon.hp) / m.pokemon.maxHp) : 0}%`).join(' '),
      damage: { played: Math.round(damage.played), companions: Math.round(damage.companions) },
      // Les PV perdus du Pokémon joué en fin de combat, en % (100 : K.O.) : comprend aussi la
      // brûlure et le poison, qui ne passent pas par hitPlayer, et ce que les dons ont soigné.
      taken: P.player?.pokemon ? Math.round(100 * (1 - P.player.pokemon.hp / P.player.pokemon.maxHp)) : 100,
      hits: Math.round(taken),
      fired: Object.fromEntries(P.run.boons.fired),
    };
  };

  /** `n` combats de suite : le compte des victoires, puis une ligne par combat. */
  const series = async (setup: FightSetup, n: number): Promise<string> => {
    const rows: string[] = [];
    let wins = 0;
    for (let i = 0; i < n; i++) {
      const r = await fight(setup);
      wins += Number(r.won);
      rows.push(`${r.won ? 'V' : 'D'} ${r.champion} ${r.secs}s vagues@${r.waves.join(',')} [${r.left}] ${r.team} dégâts joué ${r.damage.played} / compagnons ${r.damage.companions}`);
    }
    return `${setup.team.length} membres, niv. ${setup.level}, salle ${setup.room} : ${wins}/${n}\n${rows.join('\n')}`;
  };

  return { fight, series };
}
