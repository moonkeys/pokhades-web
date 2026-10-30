// Polices de l'interface (DA « Tag sacré », src/ui/da.css), embarquées : aucun appel réseau en jeu.
import '@fontsource/rubik/500.css';
import '@fontsource/rubik/500-italic.css';
import '@fontsource/rubik/700.css';
import '@fontsource/rubik/900.css';
import '@fontsource/bebas-neue';
import '@fontsource/permanent-marker';
import '@fontsource/bangers';
import { buildAtlas } from './assets/atlas';
import { PLAYER_ACTIONS, WILD_ACTIONS, loadImage, loadInfo, loadSheet } from './assets/pmd';
import { FINAL_BOSS_DEFEAT, FINAL_BOSS_INTRO, type Champion } from './data/champions';
import { Trainer } from './entities/trainer';
import { Shop } from './run/shop';
import { Camp, CAMP_SEED, STATIONS, type Station } from './run/camp';
import { CampScreen, movePool, type CampCtx } from './ui/campscreen';
import { BAIES, heldItem } from './meta/catalog';
import { level, loadSave, resetSave, startLevel, writeSave } from './meta/save';
import { BossPreview } from './ui/bosspreview';
import { Dialogue, type Speaker } from './ui/dialogue';
import { Combat, DEATH_TIME } from './combat/combat';
import { CompanionBrain } from './combat/companion';
import { EnemyBrain } from './combat/enemy';
import { BOONS, DONORS, RARITY_COLOR, RARITY_NAME, STAT_BOONS, type BoonOffer } from './combat/boons';
import { tune, type Move } from './combat/moves';
import { BASE_TEAM_LEVEL, Pokemon } from './combat/pokemon';
import { STEP, startLoop } from './core/loop';
import { Rng } from './core/rng';
import { SWIMMERS } from './data/species';
import { Actor } from './entities/actor';
import { Input } from './input/input';
import { CombatFx, typeColor } from './render/combatfx';
import { FieldFx } from './render/fieldfx';
import { Footprints } from './render/footprints';
import { Particles } from './render/particles';
import { Renderer } from './render/renderer';
import { RoomDirector } from './run/room';
import { rollSkillOffer, upgradeMove, type SkillOffer } from './run/rewards';
import { COMBATS_PER_ACT, ROOMS_PER_ACT, Run } from './run/run';
import { Hud } from './ui/hud';
import { loadOptions, saveOptions, type Options } from './ui/options';
import { Panel } from './ui/panel';
import { RewardScreen } from './ui/rewardscreen';
import { RunHud } from './ui/runhud';
import { BIOME_COLOR, BIOME_ORDER, BIOMES, REPAIRE } from './world/biomes';
import { generate, type WorldMap } from './world/generate';
import { FIELD_FX, SURF, TILE } from './world/tiles';

// Prototype 2D : le Repaire entre deux runs (HubWorld.gd), et une run de
// Pokhades (RunManager.gd). Au Repaire, on compose l'équipe, on achète CT,
// améliorations et objets tenus en Baies, puis Dracolosse nous envoie en run :
// 4 actes de 5 combats, une boutique et un boss ; dans chaque salle, des
// vagues de sauvages qui attaquent selon leur archétype (EnemyAI.gd), puis des
// portes qui annoncent la récompense de la salle suivante. Défaite ou
// victoire, on rentre au Repaire avec les Baies gagnées. Le panneau garde les
// réglages de rendu, et peut forcer le biome de toute la run.

// La page de config (config.html) a enregistré le bestiaire : on recharge pour prendre la nouvelle faune.
import.meta.hot?.on('bestiary:changed', () => location.reload());

/** Rayon de la capsule au sol : deux Pokémon plus proches que 2 × ce rayon s'écartent. */
const BODY_RADIUS = 0.45;
/** Défaite : « DÉFAITE... » puis nouvelle run (CombatArena._game_over attend 2,5 s). */
const DEFEAT_TIME = 2.5;
/** Un membre tombé : sa chute se joue avant que le suivant entre (s). */
const KO_RELAY = 0.8;
/** Un membre tombé qui porte un Rappel se relève une fois sa chute amorcée (s), avant que le suivant n'entre. */
const REVIVE_AT = 0.45;
/** Victoire sur le dresseur final : 4 s avant de repartir (CombatArena._run_victory). */
const VICTORY_TIME = 4;

async function boot(): Promise<void> {
  const canvas = document.getElementById('screen') as HTMLCanvasElement;
  const loading = document.getElementById('loading')!;
  const [tileset, surf, fieldSheet] = await Promise.all([
    loadImage('/game/assets/tilesets/tileset%20pokemon.png'),
    loadImage(SURF.url),
    // Effet de pas : le prototype reste jouable si la planche manque.
    loadImage(FIELD_FX.url).catch(() => null),
  ]);
  const atlas = await buildAtlas(tileset);
  loading.remove();

  const opts: Options = loadOptions();
  /** Progression permanente (Baies, équipe, CT, améliorations, objets) : src/meta/save.ts. */
  const save = loadSave();
  const renderer = new Renderer(canvas, atlas, surf, fieldSheet);
  const input = new Input();
  const particles = new Particles();
  const footprints = new Footprints();
  const fieldFx = new FieldFx();
  const wildRng = new Rng(4242);
  const fx = new CombatFx(document.body);
  const combat = new Combat(fx);
  const runHud = new RunHud(document.body);
  const hud = new Hud(document.body);
  const rewardScreen = new RewardScreen(document.body);
  const dialogue = new Dialogue(document.body);
  /** Dresseur du champion, en salle de boss. */
  let trainer: Trainer | null = null;
  const bossPreview = new BossPreview(document.body);
  const shop = new Shop(
    document.body,
    {
      message: (text) => runHud.message(text),
      team: () => team,
      recruit: (id, level, x, y) => {
        // Mercenaire : un allié de run, jamais ranimé (TeamMember.run_ally), qui part de là où il se tenait.
        const m = newMember(id, x, y, level);
        m.runAlly = true;
        team.push(m);
      },
      openPoster: () => bossPreview.show(run.champions[run.act], run.act >= 3, run.room + 1, () => input.flush()),
      openMoves: (price, paid) => {
        const mons = teamMons();
        if (!mons.length) return;
        rewardScreen.showSkill(
          mons,
          Math.max(0, mons.indexOf(player.pokemon!)),
          skillOffers(null),
          (mon, move, replace) => {
            learnMove(mon, move, replace);
            paid();
            input.flush();
          },
          (mon, slot) => {
            strengthen(mon, slot);
            paid();
            input.flush();
          },
          () => input.flush(),
          price,
        );
      },
    },
    atlas,
  );
  const camp = new Camp(document.body, (station) => talkTo(station), atlas);
  const campScreen = new CampScreen(document.body);
  combat.notify = (text) => runHud.message(text);
  combat.levelUp = (m) => {
    const mon = m.pokemon!;
    runHud.notify({ title: 'Niveau supérieur', text: `${mon.name} passe au niveau ${mon.level} !`, art: mon.id, color: 'var(--yel)' });
  };
  /** Offres de la récompense de la salle : tirées quand elle apparaît, fixes ensuite. */
  let boonOffer: BoonOffer | null = null;
  let skillOffer: SkillOffer | null = null;

  const newRunState = () => new Run(opts.seed, opts.biome === 'run' ? null : opts.biome);
  let run = newRunState();
  /** Au Repaire entre deux runs, ou en run. */
  let mode: 'camp' | 'run' = 'camp';
  /** Baies gagnées pendant la run en cours : on les annonce en rentrant au Repaire. */
  let runBaies = 0;
  /** Rappels qui restent à chaque membre (Ceinture de Rappels) : utilisés seuls au K.O. */
  let revives = new Map<Actor, number>();
  // Posés par newRun(), appelé une fois tout le reste en place.
  let world!: WorldMap;
  let player!: Actor;
  /**
   * L'équipe : un acteur par membre ; `player` est celui qu'on joue
   * (team[active]). Les autres sont sur le terrain, menés par leur IA de
   * compagnon (companion.ts), comme dans le jeu.
   */
  let team: Actor[] = [];
  let active = 0;
  let wild: Actor[] = [];
  /** Fin de run en cours (défaite ou victoire) : temps écoulé, -1 sinon. */
  let endT = -1;
  let endDelay = DEFEAT_TIME;

  /** Planches, fiche d'espèce et fiche de combat, chargées en différé. */
  const attach = (a: Actor, isPlayer: boolean, level: number, outfit = false) => {
    void loadInfo(a.speciesId).then((i) => (a.info = i));
    void Promise.all([loadSheet(a.speciesId, isPlayer ? PLAYER_ACTIONS : WILD_ACTIONS), Pokemon.load(a.speciesId, level)]).then(([sheet, mon]) => {
      a.sheet = sheet;
      a.pokemon = mon;
      if (outfit) void equip(mon);
      if (isPlayer) return;
      // Espèce sans planche dans le dépôt (le jeu la télécharge à la volée) :
      // elle ne serait jamais dessinée mais attaquerait quand même. Elle
      // disparaît, et compte comme vaincue pour ne pas bloquer la salle.
      if (!sheet) {
        a.deathT = DEATH_TIME;
        return;
      }
      // Bonus innés permanents d'un champion (ATQ +15 %) et de son as (ATQ +35 %, DÉF +30 %), EnemyAI.gd:210-217.
      if (a.role === 'champion') mon.mult.atk *= 1.15;
      if (a.role === 'boss') {
        mon.mult.atk *= 1.35;
        mon.mult.def *= 1.3;
      }
      // L'archétype dépend des capacités : le cerveau naît avec la fiche.
      a.brain = new EnemyBrain(a);
      // Une vague attaque d'emblée : le sauvage est déjà provoqué.
      a.brain.provoke();
    });
  };

  /**
   * Ce que le Pokémon emporte du Repaire : ses attaques choisies au terminal,
   * son objet tenu et la Vitalité (GameManager : move_loadouts, pokemon_item).
   */
  const equip = async (mon: Pokemon) => {
    const names = save.loadouts[mon.id];
    if (names?.length) {
      const pool = await movePool(mon.id, save);
      const picked = names.flatMap((n) => pool.filter((m) => m.api === n));
      if (picked.length) {
        mon.moves.splice(0, mon.moves.length, ...picked);
        mon.movesVersion++;
      }
    }
    const item = heldItem(save.held[mon.id]);
    if (item?.stat === 'hp') mon.boostMaxHp(item.mult);
    else if (item) mon.mult[item.stat] *= item.mult;
    const vigor = level(save, 'vigor');
    if (vigor) mon.boostMaxHp(1 + 0.08 * vigor);
    mon.hp = mon.maxHp;
  };

  /** `outfit` : un membre de l'équipe du Repaire (un mercenaire n'emporte rien). */
  const newMember = (id: number, x: number, y: number, level = BASE_TEAM_LEVEL, outfit = false) => {
    const p = new Actor(id, x, y);
    p.canSwim = true;
    p.ally = new CompanionBrain(p);
    attach(p, true, level, outfit);
    return p;
  };
  /** Les compagnons se posent autour du Pokémon joué (l'écartement des corps finit le travail). */
  const gatherTeam = () => {
    team.forEach((m, i) => {
      if (m === player) return;
      const a = (i / team.length) * Math.PI * 2 + 0.6;
      m.x = m.prevX = player.x + Math.cos(a) * 0.4;
      m.y = m.prevY = player.y + Math.sin(a) * 0.4;
      m.dir = player.dir;
      m.ally?.reset();
    });
  };
  /** L'équipe composée au Repaire, PV pleins ; le premier membre part devant. */
  const buildTeam = (x: number, y: number) => {
    // Au Repaire, seul celui qui mène se promène : l'équipe ne le suit pas (un camp, pas une bataille).
    team = (mode === 'camp' ? save.team.slice(0, 1) : save.team).map((id) => {
      const m = newMember(id, x, y, startLevel(save, id, BASE_TEAM_LEVEL), true);
      // Charges de dash achetées au Repaire ; au camp, on ne nage qu'avec la CS Surf (en run, toujours).
      m.dashMax = m.dashCharges = 1 + level(save, 'dash');
      m.canSwim = mode === 'run' || save.cs.includes('surf');
      return m;
    });
    revives = new Map(mode === 'run' ? team.map((m) => [m, level(save, 'revives')]) : []);
    active = 0;
    player = team[0];
    gatherTeam();
  };
  const teamMons = () => team.flatMap((a) => (a.pokemon ? [a.pokemon] : []));
  /** Celui qui entre reprend la place, la direction et la monture de celui qui sort. */
  const takeOver = (from: Actor, to: Actor) => {
    to.x = to.prevX = from.x;
    to.y = to.prevY = from.y;
    to.dir = from.dir;
    to.swimming = from.swimming;
    to.swimBlend = from.swimBlend;
    to.surfFacing = from.surfFacing;
  };
  /** Prochain membre encore debout après celui qu'on joue, ou -1 (CombatArena._cycle_active). */
  const nextAlive = () => {
    for (let k = 1; k < team.length; k++) {
      const i = (active + k) % team.length;
      if (team[i].deathT < 0 && team[i].pokemon && !team[i].pokemon!.fainted) return i;
    }
    return -1;
  };
  /**
   * Passe la main au membre i, là où il est : celui qu'on quitte redevient
   * compagnon, et sa chaîne de combo retombe (CombatArena._set_active).
   */
  const switchTo = (i: number) => {
    player.atk.comboStep = 0;
    player.ally?.reset();
    active = i;
    player = team[i];
  };

  const spawnEnemy = (id: number, level: number, x: number, y: number, role: Actor['role'] = 'wild') => {
    const a = new Actor(id, x, y);
    // Barres de PV : 2 pour un Pokémon de champion, 5 pour son as (EnemyAI.gd:200-206).
    a.role = role;
    a.bars = a.barsLeft = role === 'boss' ? 5 : role === 'champion' ? 2 : 1;
    // Dans l'eau, seulement les espèces aquatiques, qui y nagent elles-mêmes.
    if (SWIMMERS.has(id)) a.canSwim = a.nativeSwimmer = true;
    const i = Math.floor(y - 0.05) * world.w + Math.floor(x);
    if (world.water[i]) {
      a.swimming = true;
      a.swimBlend = 1;
    }
    attach(a, false, level);
    wild.push(a);
  };

  /** Génère la salle courante de la run et y place le joueur (PV et statuts conservés). */
  const loadRoom = (first: boolean) => {
    // Boutique : toujours la même pour un biome donné (graine fixe), quelle que soit la run.
    const seed = run.isShop() ? 7001 + BIOME_ORDER.indexOf(run.biome) * 131 : run.mapSeed;
    world = generate(BIOMES[run.biome], seed, { store: run.isShop() });
    renderer.bake(world);
    player.x = player.prevX = world.spawn.x;
    player.y = player.prevY = world.spawn.y;
    gatherTeam();
    for (const m of team) m.atk.reset();
    player.dir = 0;
    player.action = null;
    player.swimming = false;
    player.swimBlend = 0;
    wild = [];
    combat.reset();
    footprints.reset();
    fieldFx.reset();
    particles.reset();
    director.start(world, run, opts.wild, first);
    document.documentElement.style.setProperty('--biome', BIOME_COLOR[run.biome]);
    if (run.isBiomeEntry) runHud.announce(BIOMES[run.biome].name, BIOME_COLOR[run.biome]);
    boonOffer = null;
    skillOffer = null;
    trainer = null;
    dialogue.close();
    // Boutique : le marchand derrière son comptoir, l'étal, l'affiche et les Pokémon de la place.
    shop.clear();
    if (run.isShop()) shop.start(world, run, run.rng);
    combat.hooks.onRoomEnter(player, run, !first && run.room % 7 === 0, run.rng);
  };

  /** Le champion qui parle : son portrait de combat d'Essentials (import-assets.ts). */
  const speaker = (champ: Champion, final: boolean): Speaker => ({
    name: champ.name,
    role: final ? 'Dresseur final' : 'Champion de la Ligue',
    type: champ.type,
    sprite: `/game/assets/essentials/trainers/battle/${champ.sprite.replace(/^trainer_/, '')}`,
  });

  /**
   * Offres de « Nouvelle attaque » par Pokémon : celle du Pokémon joué est
   * tirée à l'apparition de la récompense (`first`), les autres à la demande,
   * une fois chacune, quand on les choisit dans « Pour qui ? ».
   */
  const skillOffers = (first: SkillOffer | null) => {
    const offers = new Map<Pokemon, Promise<SkillOffer>>();
    if (first && player.pokemon) offers.set(player.pokemon, Promise.resolve(first));
    return (mon: Pokemon) => {
      let o = offers.get(mon);
      if (!o) offers.set(mon, (o = rollSkillOffer(mon, run.rng)));
      return o;
    };
  };
  const learnMove = (mon: Pokemon, move: Move, replace: number) => {
    const learned = tune({ ...move, levelLearned: 0 });
    if (replace >= 0) mon.moves[replace] = learned;
    else mon.moves.push(learned);
    mon.movesVersion++;
    runHud.notify({ title: 'Nouvelle attaque', text: `${mon.name} apprend ${learned.name}.`, art: mon.id, color: typeColor(learned.type) });
  };
  const strengthen = (mon: Pokemon, slot: number) => {
    upgradeMove(mon.moves[slot]);
    mon.movesVersion++;
    runHud.notify({ title: 'Attaque renforcée', text: `${mon.moves[slot].name} : puissance ${mon.moves[slot].power}.`, art: mon.id, color: typeColor(mon.moves[slot].type) });
  };

  /** Le don choisi : une ultime remplace la précédente ; un don de statistique s'applique tout de suite. */
  const claimBoon = (offer: BoonOffer, id: string, rarity: number) => {
    const boons = run.boons;
    if (id.startsWith('__ult__')) {
      boons.ult = offer.donor;
      boons.ultGauge = 0;
      runHud.notify({ title: 'Ultime obtenue', text: `${DONORS[offer.donor].ult} · touche R`, art: DONORS[offer.donor].dex, color: 'var(--yel)' });
      return;
    }
    const got = boons.grant(id, rarity);
    if (STAT_BOONS[id]) combat.hooks.applyStat(player, id);
    runHud.notify({ title: 'Don obtenu', text: `${BOONS[id].name} · ${RARITY_NAME[got]}`, art: DONORS[offer.donor].dex, color: RARITY_COLOR[got] });
  };

  const newRun = () => {
    mode = 'run';
    camp.clear();
    campScreen.close();
    run = newRunState();
    combat.run = run;
    // Améliorations du Repaire : Partage d'XP et Bourse de départ.
    combat.hooks.metaXp = 1 + 0.2 * level(save, 'xp');
    combat.hooks.metaDash = level(save, 'dash');
    run.money = 100 * level(save, 'purse');
    runBaies = 0;
    save.runs++;
    writeSave(save);
    rewardScreen.close();
    endT = -1;
    world = generate(BIOMES[run.biome], run.mapSeed);
    buildTeam(world.spawn.x, world.spawn.y);
    loadRoom(true);
  };

  /** Baies gagnées : versées tout de suite (une run abandonnée ne les perd pas), annoncées au retour. */
  const earn = (n: number) => {
    save.baies += n;
    runBaies += n;
    writeSave(save);
  };

  /**
   * Le Repaire : la clairière de nuit, ses postes, et l'équipe qui suit le
   * Pokémon qui mène. On y revient après chaque run.
   */
  const enterCamp = () => {
    mode = 'camp';
    endT = -1;
    rewardScreen.close();
    bossPreview.close?.();
    dialogue.close();
    trainer = null;
    wild = [];
    shop.clear();
    director.clear();
    world = generate(REPAIRE, CAMP_SEED, { camp: true });
    camp.build(world, save.team, save.built);
    renderer.bake(world);
    buildTeam(world.spawn.x, world.spawn.y);
    player.dir = 4;
    combat.reset();
    footprints.reset();
    fieldFx.reset();
    particles.reset();
    document.documentElement.style.setProperty('--biome', '#ff9a3a');
    runHud.announce('Le Repaire', '#ff9a3a', 'CAMP DES REBELLES');
    if (runBaies > 0) runHud.notify({ title: 'Retour au Repaire', text: `+${runBaies} Baies rapportées de la run.`, icon: '✦', color: 'var(--yel)' });
    runBaies = 0;
  };

  /** Ce que les écrans du Repaire peuvent faire. */
  const campCtx: CampCtx = {
    save,
    persist: () => writeSave(save),
    teamChanged: () => {
      opts.team = [...save.team];
      saveOptions(opts);
      panel.refreshTeam();
      // L'équipe qui suit change, là où on se tient ; les Pokémon libérés du feu se recomposent.
      const at = { x: player.x, y: player.y, dir: player.dir };
      enterCampKeep(at);
    },
    depart: () => {
      input.flush();
      newRun();
    },
    notify: (title, text, art) => runHud.notify({ title, text, art, color: 'var(--yel)' }),
    preview: () => {
      // La même graine que la run que Dracolosse lancera.
      const next = newRunState();
      const b = next.biomes[0];
      return { biome: BIOMES[b].name, color: BIOME_COLOR[b], champion: next.champions[0].name, champType: next.champions[0].type };
    },
  };
  /** Recompose le camp sans le rideau d'arrivée : on reste là où l'on est. */
  const enterCampKeep = (at: { x: number; y: number; dir: number }) => {
    world = generate(REPAIRE, CAMP_SEED, { camp: true });
    camp.build(world, save.team, save.built);
    renderer.bake(world);
    buildTeam(at.x, at.y);
    player.dir = at.dir;
  };

  /** Parler au gardien d'un poste : sa présentation la première fois, puis son écran. */
  const talkTo = (station: Station) => {
    if (dialogue.open || campScreen.open) return;
    const openScreen = () => campScreen.show(station, campCtx, () => input.flush());
    if (save.intros.includes(station)) return openScreen();
    save.intros.push(station);
    writeSave(save);
    const g = STATIONS[station];
    const guard = camp.npcs.find((n) => n.speciesId === g.id);
    dialogue.show({ name: guard?.info?.name ?? g.title, role: `Le Repaire · ${g.title}`, type: g.type, sprite: `/game/artwork/${g.id}.png` }, g.intro, openScreen);
  };

  const director: RoomDirector = new RoomDirector(document.body, fx, {
    spawnEnemy,
    message: (text) => runHud.message(text),
    toast: (text, stamp) => runHud.toast(text, stamp),
    nextRoom: (offer) => {
      run.advance(offer);
      loadRoom(false);
    },
    roomCleared: () => {
      combat.hooks.onRoomClear(player, run);
      // Un champion tombé rapporte des Baies (CombatArena.gd:1899) ; le Dresseur final, davantage.
      if (run.isBoss()) {
        const n = BAIES.boss(run.act) + (run.isFinal ? BAIES.finalBonus : 0);
        earn(n);
        runHud.notify({ title: 'Champion vaincu', text: `+${n} Baies pour le Repaire.`, art: run.champion.team.at(-1)?.[0], color: 'var(--yel)' });
      }
      // Son équipe vaincue, le champion quitte la salle par la sortie.
      if (run.isBoss()) trainer?.flee(world);
    },
    prepareReward: (reward) => {
      if (reward === 'boon') boonOffer = run.boons.offer(run.rng, run.room, run.act);
      if (reward === 'skill' && player.pokemon) void rollSkillOffer(player.pokemon, run.rng).then((o) => (skillOffer = o));
    },
    openReward: (reward, consume) => {
      const done = () => input.flush();
      if (reward === 'boon') {
        const offer = boonOffer;
        if (!offer) {
          // Aucun donateur n'a plus 3 dons à offrir : la récompense part en ₽.
          run.money += run.roomGold * 2;
          runHud.message(`Plus aucun don à offrir : +${run.roomGold * 2} ₽`);
          consume();
          return;
        }
        rewardScreen.showBoons(
          offer,
          (card) => {
            claimBoon(offer, card.id, card.rarity);
            consume();
            done();
          },
          done,
          teamMons(),
          Math.max(0, teamMons().indexOf(player.pokemon!)),
        );
      } else if (reward === 'skill' && player.pokemon && skillOffer) {
        const mons = teamMons();
        rewardScreen.showSkill(
          mons,
          Math.max(0, mons.indexOf(player.pokemon)),
          skillOffers(skillOffer),
          (mon, move, replace) => {
            learnMove(mon, move, replace);
            consume();
            done();
          },
          (mon, slot) => {
            strengthen(mon, slot);
            consume();
            done();
          },
          done,
        );
      }
    },
    bossIntro: (exit) => {
      const champ = run.champion;
      const final = run.isFinal;
      trainer = exit ? new Trainer(champ.sprite, exit) : null;
      runHud.announce(champ.name, typeColor(champ.type), final ? 'DRESSEUR FINAL' : "CHAMPION D'ARÈNE");
      combat.addShake(0.15);
      dialogue.show(speaker(champ, final), final ? FINAL_BOSS_INTRO : champ.intro);
    },
    victory: () => {
      endT = 0;
      earn(BAIES.victory(run.room));
      // Le jeu changeait de scène avant la fin de la réplique de défaite : on attend qu'elle soit lue.
      endDelay = Math.max(VICTORY_TIME, Dialogue.duration(FINAL_BOSS_DEFEAT) + 0.5);
      combat.addShake(0.2);
      dialogue.show(speaker(run.champion, true), FINAL_BOSS_DEFEAT);
      runHud.announce('Victoire !', '#ffd23f', 'MAÎTRE DE LA LIGUE');
    },
  });

  /**
   * Les corps ne se traversent pas (capsules de 0,45 du jeu) : deux Pokémon
   * qui se chevauchent s'écartent chacun de la moitié. Le joueur en plein
   * dash passe au travers, comme dans le jeu.
   */
  const separate = () => {
    const bodies = [...team, ...wild].filter((a) => a.deathT < 0 && !(a === player && a.dashT > 0));
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const overlap = BODY_RADIUS * 2 - d;
        if (overlap <= 0) continue;
        const nx = d > 1e-4 ? dx / d : 1;
        const ny = d > 1e-4 ? dy / d : 0;
        a.nudge(world, (-nx * overlap) / 2, (-ny * overlap) / 2);
        b.nudge(world, (nx * overlap) / 2, (ny * overlap) / 2);
      }
    }
    // Les Pokémon de la boutique ne se laissent pas pousser : l'équipe les contourne.
    for (const a of team) {
      if (a.deathT >= 0) continue;
      for (const n of [...shop.npcs, ...camp.npcs]) {
        const dx = a.x - n.x;
        const dy = a.y - n.y;
        const d = Math.hypot(dx, dy);
        const overlap = BODY_RADIUS * 2 - d;
        if (overlap > 0) a.nudge(world, (d > 1e-4 ? dx / d : 1) * overlap, (d > 1e-4 ? dy / d : 0) * overlap);
      }
    }
  };

  const panel = new Panel(opts, (changed) => {
    saveOptions(opts);
    switch (changed) {
      case 'biome':
      case 'seed':
        // Au Repaire, la graine et le biome valent pour la prochaine run.
        if (mode === 'run') newRun();
        break;
      case 'team': {
        // Le panneau compose l'équipe du Repaire sans compter les places (outil de test).
        save.team = [...opts.team];
        writeSave(save);
        if (mode === 'camp') {
          enterCampKeep({ x: player.x, y: player.y, dir: player.dir });
          break;
        }
        // Changer l'équipe en cours de run : elle reprend la place, PV pleins.
        const prev = player;
        buildTeam(prev.x, prev.y);
        takeOver(prev, player);
        break;
      }
      case 'density':
      case 'viewHeight':
        renderer.resize(opts);
        break;
      case 'wild':
        if (mode === 'run') loadRoom(false);
        break;
    }
  }, (act, kind) => {
    if (kind === 'camp') return enterCamp();
    // Outils de test du Repaire : des Baies à volonté, ou une progression remise à zéro.
    if (kind === 'baies' || kind === 'reset') {
      if (kind === 'baies') save.baies += 1000;
      else Object.assign(save, resetSave());
      writeSave(save);
      opts.team = [...save.team];
      saveOptions(opts);
      panel.refreshTeam();
      if (mode === 'camp') enterCampKeep({ x: player.x, y: player.y, dir: player.dir });
      return;
    }
    // Aller à une salle : 1ʳᵉ salle de combat, boutique ou boss de l'acte (PV et dons conservés).
    // Depuis le Repaire, une run part d'abord.
    if (mode === 'camp') newRun();
    run.room = act * ROOMS_PER_ACT + (kind === 'combat' ? 0 : kind === 'shop' ? COMBATS_PER_ACT : ROOMS_PER_ACT - 1);
    endT = -1;
    loadRoom(false);
  });

  renderer.resize(opts);
  addEventListener('resize', () => renderer.resize(opts));
  // Le panneau et la sauvegarde parlent de la même équipe.
  opts.team = [...save.team];
  panel.refreshTeam();
  enterCamp();

  let time = 0;
  let fps = 60;
  const update = (dt: number) => {
    // Écran de récompense ouvert : le jeu se fige (BoutiqueScreen met l'arbre en pause).
    if (rewardScreen.open || bossPreview.open || campScreen.open) return;
    // Hitstop : toute la simulation se fige (les touches pressées restent en attente).
    if (combat.hitstop > 0) {
      combat.hitstop = Math.max(0, combat.hitstop - dt);
      return;
    }
    time += dt;
    const sample = input.sample();
    if (sample.swap && player.deathT < 0) {
      const i = nextAlive();
      if (i >= 0) switchTo(i);
    }
    player.updatePlayer(dt, sample, world);
    // Dash stoppé net par un obstacle infranchissable : de la poussière au point d'impact, et l'écran tressaille.
    if (player.bonked) {
      fieldFx.puff(player.bonked.x, player.bonked.y);
      combat.addShake(0.06);
      player.bonked = null;
    }
    // Les compagnons décident (et frappent), puis marchent comme le joueur, un peu moins vite.
    const allies = team.filter((m) => m !== player);
    for (const c of allies) {
      const go = c.ally?.update(dt, player, wild, world, combat) ?? { mx: 0, my: 0 };
      c.updatePlayer(dt, { mx: go.mx, my: go.my, dash: false, move: -1, interact: false, ult: false, swap: false }, world);
    }
    for (const a of wild) a.updateWild(dt, world, wildRng);
    combat.update(dt, sample, player, wild, world, allies.filter((c) => c.deathT < 0));
    // Un membre K.O. reste couché là où il est tombé (TeamMember._play_faint_anim) : on peut le ranimer.
    // Ceinture de Rappels : un membre qui tombe se relève aussitôt à moitié de ses PV, tant qu'il lui en reste.
    for (const m of team) {
      const left = revives.get(m) ?? 0;
      if (m.deathT < REVIVE_AT || left <= 0 || endT >= 0 || !m.pokemon) continue;
      revives.set(m, left - 1);
      m.getUp();
      m.pokemon.status = null;
      m.pokemon.hp = Math.max(1, Math.round(m.pokemon.maxHp * 0.5));
      runHud.notify({ title: 'Rappel', text: `${m.pokemon.name} se relève — ${left - 1} Rappel${left - 1 > 1 ? 's' : ''} restant${left - 1 > 1 ? 's' : ''}.`, art: m.speciesId, color: 'var(--yel)' });
    }
    for (const m of team) if (m.deathT >= 0 && !m.downed) m.lieDown();
    separate();
    if (mode === 'run') director.update(dt, sample, world, run, player, wild);
    trainer?.update(dt, world, Math.random);
    shop.update(dt, sample, player, world);
    camp.update(dt, dialogue.open ? { ...sample, interact: false } : sample, player, world);
    if (trainer?.gone) trainer = null;
    // K.O. : retirés après leur fondu.
    wild = wild.filter((a) => a.deathT < DEATH_TIME);

    // Le Pokémon joué tombe : le suivant encore debout prend le relais une fois la chute jouée ;
    // toute l'équipe à terre, la run est perdue.
    const relay = player.deathT >= 0 && endT < 0 ? nextAlive() : -1;
    if (relay >= 0 && player.deathT >= KO_RELAY) {
      const fallen = player;
      switchTo(relay);
      runHud.notify({ title: 'K.O.', text: `${fallen.pokemon?.name ?? '?'} est K.O. — ${player.pokemon?.name ?? '?'} prend le relais.`, art: fallen.speciesId, ko: true, color: 'var(--ink)' });
    } else if (player.deathT >= 0 && endT < 0 && relay < 0 && !(revives.get(player) ?? 0)) {
      endT = 0;
      endDelay = DEFEAT_TIME;
      runHud.toast('Défaite…', `${run.room} salle${run.room > 1 ? 's' : ''} traversée${run.room > 1 ? 's' : ''}`);
      earn(BAIES.defeat(run.room));
    }
    if (endT >= 0) {
      endT += dt;
      // Le voile tombe pendant la dernière demi-seconde, la nouvelle run le relève.
      director.fade = Math.max(director.fade, Math.min(1, (endT - (endDelay - 0.5)) / 0.5));
      if (endT >= endDelay) {
        opts.seed += 1;
        saveOptions(opts);
        enterCamp();
      }
    }

    footprints.update(dt, [...team, ...wild], world);
    fieldFx.update(dt, [...team, ...wild], world);
    if (opts.particles) {
      particles.update(dt, world.biome.ambiance.particles, { x: renderer.camX, y: renderer.camY, w: renderer.viewW, h: renderer.viewH });
    }
  };

  startLoop(update, (alpha, frameDt) => {
    const extras = [...(trainer ? [{ y: trainer.y * TILE, draw: trainer.draw.bind(trainer) }] : []), ...shop.extras(time), ...camp.extras(time)];
    renderer.draw(world, player, [...team, ...wild, ...shop.npcs, ...camp.npcs], particles, footprints, fieldFx, combat, director, extras, opts, alpha, time);
    dialogue.update(frameDt);
    document.body.classList.toggle('talking', dialogue.open);
    document.body.classList.toggle('modal', rewardScreen.open || bossPreview.open || campScreen.open);
    // Barre du Pokémon de champion en jeu (un à la fois : un par vague).
    const champ = wild.find((a) => a.role !== 'wild' && a.pokemon && a.deathT < 0);
    runHud.setBoss(
      champ?.pokemon
        ? {
            name: champ.pokemon.name,
            sub: `${champ.role === 'boss' ? 'As' : 'Équipe'} de ${run.champion.name}`,
            ace: champ.role === 'boss',
            bars: champ.bars,
            barsLeft: champ.barsLeft,
            ratio: champ.pokemon.hp / champ.pokemon.maxHp,
          }
        : null,
      frameDt,
    );
    const proj = renderer.projector();
    fx.placeNumbers(proj);
    director.placeLabels(proj);
    shop.placeLabels(proj);
    camp.placeLabels(proj);
    hud.update(frameDt, player, combat, wild, proj, time, team);
    if (mode === 'camp') runHud.update(frameDt, REPAIRE.name, save.baies, 0, 'Baies');
    else runHud.update(frameDt, run.isShop() ? 'Boutique' : BIOMES[run.biome].name, run.money, director.fade);
    if (frameDt > 0) fps += (1 / frameDt - fps) * 0.05;
    const name = player.info?.name ?? '…';
    panel.setStatus(
      `${mode === 'camp' ? `Repaire · ${save.baies} Baies · prochaine run ${opts.seed} · ` : ''}Run ${run.seed} · salle ${run.room + 1}/28 · ${BIOMES[run.biome].name}${world.townStyle ? ` « ${world.townStyle} »` : ''} · ${name} · vue ${renderer.viewW}×${renderer.viewH} px (${(renderer.viewW / TILE).toFixed(1)}×${(renderer.viewH / TILE).toFixed(1)} cases) · ×${renderer.scale} · ${Math.round(fps)} i/s`,
    );
  });

  // Objet de debug, uniquement derrière ?debug (pas de globale sinon).
  if (new URLSearchParams(location.search).has('debug')) {
    Object.assign(window, {
      pokhades: {
        get world() {
          return world;
        },
        get player() {
          return player;
        },
        get team() {
          return team;
        },
        get wild() {
          return wild;
        },
        get run() {
          return run;
        },
        director,
        shop,
        camp,
        campScreen,
        save,
        enterCamp,
        newRun,
        get mode() {
          return mode;
        },
        renderer,
        combat,
        opts,
        /** Les écrans, pour les ouvrir à la main (vérifier la DA sans jouer une salle entière). */
        ui: { hud, runHud, rewardScreen, dialogue, bossPreview, speaker },
        /** Saute à une salle de la run (0 à 27), PV et dons conservés. */
        goto: (room: number) => {
          run.room = room;
          loadRoom(false);
        },
        /** Avance la simulation de n pas de 1/60 s, même onglet masqué (tests automatisés). */
        step: (n: number) => {
          for (let i = 0; i < n; i++) update(STEP);
        },
      },
    });
  }
}

boot().catch((err) => {
  console.error(err);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `Erreur : ${err instanceof Error ? err.message : String(err)}`;
});
