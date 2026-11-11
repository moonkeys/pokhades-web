// Polices de l'interface (DA « Tag sacré », src/ui/da.css), embarquées : aucun appel réseau en jeu.
import '@fontsource/rubik/500.css';
import '@fontsource/rubik/500-italic.css';
import '@fontsource/rubik/700.css';
import '@fontsource/rubik/900.css';
import '@fontsource/bebas-neue';
import '@fontsource/permanent-marker';
import '@fontsource/bangers';
import { audio, cry, sfx } from './audio/audio';
import { MUSIC, type MusicId } from './audio/sounds';
import { buildAtlas } from './assets/atlas';
import { PLAYER_ACTIONS, WILD_ACTIONS, loadImage, loadInfo, loadSheet } from './assets/pmd';
import { FINAL_BOSS_DEFEAT, FINAL_BOSS_INTRO, MASTER_DEFEAT, type Champion } from './data/champions';
import { Trainer } from './entities/trainer';
import { Shop } from './run/shop';
import { Camp, CAMP_SEED, campPockets, STATIONS, stationId, type Station } from './run/camp';
import { CampScreen, movePool, teamWeight, type CampCtx } from './ui/campscreen';
import { NetBadge } from './ui/netbadge';
import { BAIES, FIELD_FOOD, RESOURCES, RESOURCE_IDS, SHARDS, UPGRADES, applyHeld, heldItem, teamSlots } from './meta/catalog';
import { addMon, capacity, exile, grantAlly, isFull, level, loadSave, markSeen, monName, ownedSpecies, ownsSpecies, recordDefeat, resetSave, roster, speciesOf, startLevel, welcomeMon, writeSave } from './meta/save';
import { applyTraits, natureText } from './meta/mons';
import { quest, questEvent, type QuestEvent } from './meta/quests';
import { leagueOpen, readyFeats } from './meta/feats';
import { busy, mission, rewardText, tick as tickMissions } from './meta/missions';
import { MATERIALS, NECTARS, materialName, tickCraft } from './meta/crafting';
import { campNews, fresh as freshNews, markSeen as markNewsSeen } from './meta/news';
import { BossPreview } from './ui/bosspreview';
import { RunSummary } from './ui/runsummary';
import { SettingsMenu, type LeaveOffer } from './ui/settingsmenu';
import { RunStats } from './meta/runstats';
import { Dialogue, type Speaker } from './ui/dialogue';
import { Combat, DEATH_TIME } from './combat/combat';
import { CompanionBrain } from './combat/companion';
import { EnemyBrain } from './combat/enemy';
import { BOONS, DONORS, RARITY_COLOR, RARITY_NAME, STAT_BOONS, type BoonOffer } from './combat/boons';
import { tune, type Move } from './combat/moves';
import { BASE_TEAM_LEVEL, Pokemon } from './combat/pokemon';
import { STEP, startLoop } from './core/loop';
import { Rng } from './core/rng';
import { CAMP_NPCS, SWIMMERS } from './data/species';
import { evolutionChoices, evolutionOf, evolutionsOf, evolvedStart } from './data/evolutions';
import { Actor, dirFromVector } from './entities/actor';
import { Input } from './input/input';
import { CombatFx, typeColor } from './render/combatfx';
import { FieldFx } from './render/fieldfx';
import { Footprints } from './render/footprints';
import { Particles } from './render/particles';
import { WEATHERS, rollWeather, type WeatherId } from './world/weather';
import { setWeather } from './combat/damage';
import { Renderer } from './render/renderer';
import { isTouch, TouchControls } from './input/touch';
import { RoomDirector } from './run/room';
import { BerryGrove } from './run/berries';
import { Hazards } from './run/hazards';
import { CaveDirector } from './run/cave';
import { ChestSite } from './run/chests';
import { Merchant } from './run/merchant';
import { evolveMove, rollSkillOffer, upgradeMove, type SkillOffer } from './run/rewards';
import { COMBATS_PER_ACT, LEAGUE_MASTER, ROOMS_PER_ACT, Run } from './run/run';
import { Hud } from './ui/hud';
import { loadOptions, saveOptions, type Options } from './ui/options';
import { Panel } from './ui/panel';
import { Journal } from './ui/journal';
import { readInvite } from './net/invite';
import { lockPage } from './ui/lockdown';
import { EvolutionScreen } from './ui/evolutionscreen';
import { RewardScreen } from './ui/rewardscreen';
import { RunHud } from './ui/runhud';
import { RecruitScreen } from './ui/recruitscreen';
import { StarterScreen } from './ui/starterscreen';
import { QuizScreen, STARTER_NATURE } from './ui/quizscreen';
import { TitleScreen } from './ui/titlescreen';
import { StatSheet, type SheetEntry } from './ui/statsheet';
import { BIOME_COLOR, BIOME_ORDER, BIOMES, REPAIRE } from './world/biomes';
import { generate, landReachable, type WorldMap } from './world/generate';
import type { LayoutId } from './world/layouts';
import { generateCave } from './world/cave';
import { decorateArena } from './world/arena';
import { FIELD_FX, SURF, TILE } from './world/tiles';
import { net, type HostMsg, type Loadout, type WorldKey } from './net/net';
import { ClientField, NetIds, snapActor } from './net/sync';
import { DrawRecorder, ImageBank, replay, type Cmd } from './net/drawrec';

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
/**
 * Champion et as : multiplicateurs d'attaque (physique et spéciale), de
 * défense (idem) et de PV par barre. Écarts voulus avec le jeu, qui ne
 * relevait ni les PV ni les stats spéciales — un as tireur ne profitait pas de
 * son bonus — et qui pensait le boss pour un Pokémon seul : à quatre, il
 * tombait trop vite (retour de test). D'où aussi BOSS_HP_PER_MEMBER, +30 % de
 * PV par membre de l'équipe au-delà du premier.
 */
const BOSS_BOOST = {
  champion: { atk: 1.15, def: 1.1, hp: 1.4 },
  boss: { atk: 1.45, def: 1.3, hp: 1.8 },
};
const BOSS_HP_PER_MEMBER = 0.3;

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
  audio.setVolumes(opts);
  audio.preload();
  /** Progression permanente (Baies, équipe, CT, améliorations, objets) : src/meta/save.ts. */
  const save = loadSave();
  const renderer = new Renderer(canvas, atlas, surf, fieldSheet);
  // ?debug : le menu principal sauté et l'objet `window.pokhades` exposé, pour les tests automatisés. Réservé au
  // serveur de dev : dans le jeu publié, le paramètre ne fait rien (retour de test : « les gens vont faire n'importe quoi »).
  const DEBUG = import.meta.env.DEV && new URLSearchParams(location.search).has('debug');
  lockPage();
  const input = new Input();
  // Téléphone ou tablette : stick et boutons à l'écran, et le panneau de test replié.
  if (isTouch()) {
    new TouchControls(input);
    document.getElementById('panel')!.classList.add('hidden');
  }
  const particles = new Particles();
  // Météo de la salle (world/weather.ts) : ses particules ont leur couche, par-dessus celles du biome.
  const skyParticles = new Particles();
  let roomWeather: WeatherId = 'clear';
  /** Le ciel de la dernière salle à ciel libre, même éclairci depuis : le suivant en découle (rollWeather). */
  let lastSky: WeatherId = 'clear';
  /** La météo qui règne là où l'on est : celle de la salle, sauf à la boutique, en grotte et au Repaire. */
  const weatherNow = (): WeatherId => (mode === 'run' && !cave.active ? roomWeather : 'clear');
  const footprints = new Footprints();
  const fieldFx = new FieldFx();
  const wildRng = new Rng(4242);
  const fx = new CombatFx(document.body);
  const combat = new Combat(fx);
  combat.shakeMult = opts.shake ? 1 : 0;
  const runHud = new RunHud(document.body);
  // Un clic sur un membre de l'équipe le fait jouer (pickMember, posé plus bas).
  const hud = new Hud(document.body, (i) => pickMember(i));
  const rewardScreen = new RewardScreen(document.body);
  const evolutionScreen = new EvolutionScreen(document.body);
  const statSheet = new StatSheet(document.body);
  /** Le plan du monde (panneau de l’arche) et le carnet des exploits (Xatu) : ui/journal.ts, meta/feats.ts. */
  const journal = new Journal(document.body, atlas);
  const recruitScreen = new RecruitScreen(document.body);
  const starterScreen = new StarterScreen(document.body);
  const quizScreen = new QuizScreen(document.body);
  /** Le menu principal, au lancement (ui/titlescreen.ts) : montré plus bas, juste avant le premier enterCamp. */
  const titleScreen = new TitleScreen(document.body);
  const dialogue = new Dialogue(document.body);
  /** Dresseur du champion, en salle de boss. */
  let trainer: Trainer | null = null;
  const bossPreview = new BossPreview(document.body);
  const runSummary = new RunSummary(document.body);
  /** Bilan de la run en cours (dégâts, K.O., Baies…), montré à sa fin. */
  const stats = new RunStats();
  /** La run qui s'achève est gagnée (le bilan le dit). */
  let runWon = false;
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
      openPoster: () => bossPreview.show(run.champion, run.isFinal || run.act === run.acts - 1, run.champion.team.map((_, w) => run.bossLevel(w, run.room + 1)), () => input.flush()),
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
  const camp = new Camp(document.body, (station, arg) => talkTo(station, arg), atlas);
  // On part en passant l'arche du nord (retour de test : plus d'écran de départ). Comme cet
  // écran le faisait, une équipe trop lourde ne part pas, et chez un hôte, c'est lui qui part.
  camp.onLeave = () => {
    if (mode !== 'camp' || paused() || dialogue.open || !save.started) return;
    if (hostCamp) {
      runHud.notify({ title: 'Repaire de l’hôte', text: 'C’est l’hôte qui lance la run.', art: CAMP_NPCS.online, color: '#7ac0e8' });
      return;
    }
    void teamWeight(save).then((w) => {
      if (mode !== 'camp') return;
      if (w.total > w.cap) {
        sfx('buzzer');
        runHud.notify({ title: 'Trop lourd', text: `Poids d’équipe ${w.total} / ${w.cap} : allège l’équipe chez Porygon, ou monte le plafond chez Alakazam.`, art: CAMP_NPCS.start, color: 'var(--yel)' });
        player.y = player.prevY = player.y + 1;
        return;
      }
      sfx('doorEnter');
      startDeparture();
    });
  };
  /**
   * Le départ en run : sous l'arche, le temps ralentit, le halo de l'arche (toujours là, camp.ts) s'embrase,
   * l'écran s'éteint, et la run commence. (Retour de test : le halo doit être « toujours présent sous
   * l'arche », pas apparaître autour du Pokémon au moment de partir.)
   */
  let departing: { t: number; x: number; y: number } | null = null;
  const DEPART_TIME = 1.5;
  /** Le temps file à cette allure pendant le départ. */
  const DEPART_SLOW = 0.3;
  const startDeparture = () => {
    if (departing) return;
    departing = { t: 0, x: player.x, y: player.y };
  };
  /** Le halo de l'arche suit le départ : de 0 à 1 sur toute sa durée (remis à 0 sitôt la run lancée). */
  const departGlow = () => (departing ? Math.min(1, departing.t / DEPART_TIME) : 0);
  const campScreen = new CampScreen(document.body);
  const netBadge = new NetBadge(document.body);
  combat.notify = (text) => runHud.message(text);
  /** Une espèce vient d'être débloquée : on la salue (CombatArena, « ★ X rejoint la rébellion ! »). */
  const welcome = (id: number) => {
    sfx('pkmnGet', -4);
    void loadInfo(id).then((i) => runHud.notify({ title: 'Débloqué', text: `★ ${i.name} rejoint la rébellion !`, art: id, color: 'var(--yel)' }));
  };
  // Chaque ennemi tombé en run compte pour son espèce, qui l'achève importe peu
  // (GameManager.record_defeat) ; le dixième d'une forme de base la débloque.
  combat.defeated = (e) => {
    if (mode !== 'run') return;
    stats.kos++;
    if (recordDefeat(save, e.speciesId, run.biome)) {
      // Assez de fois libéré de sa Poké Ball : il veut rejoindre la rébellion, et attend au Repaire.
      sfx('pkmnGet', -4);
      void loadInfo(e.speciesId).then((i) => runHud.notify({ title: 'Une recrue !', text: `${i.name} veut rejoindre la rébellion : il t’attend au Repaire.`, art: e.speciesId, color: 'var(--yel)' }));
    }
    questProgress({ kind: 'kill', types: e.pokemon?.types ?? [], weather: weatherNow() });
  };
  /**
   * Quêtes de Kangourex (meta/quests.ts) : un exploit de run de plus. Celles
   * qu'il vient de remplir sont annoncées ; on les réclame au Repaire.
   */
  const questProgress = (ev: QuestEvent) => {
    if (mode !== 'run') return;
    for (const id of questEvent(save, ev)) runHud.notify({ title: 'Quête accomplie', text: `${quest(id).name} — retourne voir Kangourex au Repaire.`, art: CAMP_NPCS.quests, color: 'var(--yel)' });
    writeSave(save);
  };
  /** Le meneur a-t-il encaissé un coup dans cette salle (quête « Sans une égratignure ») ? */
  let roomHurt = false;
  combat.hurt = () => (roomHurt = true);
  combat.dealtBy = (by, n) => mode === 'run' && stats.dealtBy(by, n);
  combat.taken = (m, n) => mode === 'run' && stats.takenBy(m, n);
  // Arbres à baies de la salle (A-FAIRE 1.4) : seulement dehors, en run — en
  // grotte, la salle du dehors (et ses baies au sol) attend, figée.
  const berries = new BerryGrove({
    fx,
    earn: (n) => {
      earn(n);
      questProgress({ kind: 'berry', n });
    },
  });
  const outside = () => mode === 'run' && !outdoor;
  /** Les dangers du terrain : la lave du Volcan (avec Surf), les tourbillons des Rocailleux (run/hazards.ts). */
  const hazards = new Hazards(fx);
  combat.breakables = (x, y, reach) => (outside() ? berries.hit(x, y, reach) : null);
  combat.breakableNear = (x, y, reach) => (outside() ? berries.near(x, y, reach) : null);
  // Coffre de la salle (A-FAIRE 1.5) : des Baies et des ressources de
  // construction, versées tout de suite à la sauvegarde comme les Baies.
  const chests = new ChestSite(document.body, fx, {
    loot: ({ baies, res, mats }) => {
      shareLoot({ res, mats, text: [...RESOURCE_IDS.filter((r) => res[r]).map((r) => `+${res[r]} ${RESOURCES[r].name}`), ...Object.entries(mats).map(([m, n]) => `+${n} ${materialName(m)}`)].join(' · ') });
      for (const r of RESOURCE_IDS) save.resources[r] += res[r] ?? 0;
      // Les matériaux d'artisan (meta/crafting.ts) : avant `earn`, qui sauvegarde.
      for (const [m, n] of Object.entries(mats)) save.materials[m] = (save.materials[m] ?? 0) + n;
      earn(baies);
      // Une notification par gain, son icône et sa quantité, à la suite (retour de test : un seul
      // bandeau « +12 Baies · +5 Bois · … » se lisait mal).
      runHud.notifyAll([
        ...(baies ? [{ title: 'Baies', text: 'Pour le Repaire', item: 'ORANBERRY', qty: `+${baies}`, color: 'var(--yel)' }] : []),
        ...RESOURCE_IDS.filter((r) => res[r]).map((r) => ({ title: RESOURCES[r].name, text: 'Ressource de construction', res: r, qty: `+${res[r]}`, color: 'var(--yel)' })),
        ...Object.entries(mats).map(([m, n]) => ({ title: materialName(m), text: 'Matériau d’artisan', item: MATERIALS[m]?.icon ?? NECTARS[m]?.icon, qty: `+${n}`, color: 'var(--yel)' })),
      ]);
    },
  });
  // Marchand ambulant (salle spéciale) : Miaouss, son pari et son échange.
  const merchant = new Merchant(document.body, fx, {
    message: (text) => runHud.message(text),
    team: () => team,
    grantBoon: () => {
      run.donor = run.boons.pickDonor(run.rng) ?? undefined;
      director.grant('boon');
    },
  });
  /** Membres dont la forme suivante se charge : un second niveau gagné entre-temps ne relance rien. */
  const evolving = new Set<Actor>();
  combat.levelUp = (m) => {
    const mon = m.pokemon!;
    runHud.notify({ title: 'Niveau supérieur', text: `${mon.name} passe au niveau ${mon.level} !`, art: mon.id, color: 'var(--yel)' });
    if (m.evolve || evolving.has(m)) return;
    // Une évolution à choix (Évoli) : le joueur choisit la forme, pour ses propres membres. « Plus tard » : on retentera
    // au niveau suivant. Les invités et les mercenaires prennent la forme par défaut.
    const choices = m.remote || m.runAlly ? [] : evolutionChoices(mon.id, mon.level);
    if (choices.length) {
      evolving.add(m);
      evolutionScreen.show({ id: mon.id, name: mon.name, level: mon.level }, choices, (picked) => {
        evolving.delete(m);
        if (picked !== null && m.pokemon === mon) beginEvolution(m, mon, picked);
      });
      return;
    }
    const next = evolutionOf(mon.id, mon.level);
    if (next === null || next === mon.id) return;
    beginEvolution(m, mon, next);
  };
  /** Charge la forme `next` puis joue l'évolution de `m` (combat.evolve). */
  const beginEvolution = (m: Actor, mon: Pokemon, next: number) => {
    evolving.add(m);
    // Planche, fiche et stats de la forme suivante d'abord : l'échange, au pic
    // de blanc, doit être instantané.
    void Promise.all([loadSheet(next, PLAYER_ACTIONS), Pokemon.load(next, mon.level), loadInfo(next)]).then(([sheet, evo, info]) => {
      evolving.delete(m);
      // Planche absente, membre tombé ou run finie pendant le chargement : il
      // retentera au prochain niveau.
      const prev = m.pokemon;
      if (!sheet || !prev || prev.id !== mon.id || prev.fainted || m.deathT >= 0 || !team.includes(m)) return;
      combat.evolve(m, () => {
        const old = m.pokemon!;
        // Le nom de l'espèce avant que le surnom ne passe à la forme évoluée.
        const species = evo.name;
        evo.inherit(old);
        m.speciesId = next;
        m.sheet = sheet;
        m.info = info;
        m.pokemon = evo;
        runHud.notify({ title: 'Évolution', text: `${old.name} évolue en ${species} !`, art: next, color: 'var(--yel)' });
        // Prime de lignée (retour de test : « une prime quand on complète une évolution ») : la
        // première fois qu'une lignée atteint sa forme finale, un Éclat et quelques Baies.
        if (!save.evolved.includes(next)) {
          save.evolved.push(next);
          if (!evolutionsOf(next).length) {
            save.shards += 1;
            runHud.notifyAll([{ title: 'Lignée complète', text: `${species} : forme finale atteinte`, art: next, qty: '+1 Éclat', color: 'var(--yel)' }]);
            earn(40);
          } else writeSave(save);
        }
      });
    });
  };
  /** Offres de la récompense de la salle : tirées quand elle apparaît, fixes ensuite. */
  let boonOffer: BoonOffer | null = null;
  let skillOffer: SkillOffer | null = null;

  // Les CS apprises au départ ouvrent les branches gardées du graphe des biomes (Surf : l'Océan).
  // Test de la grotte (panneau) : une run au Rocailleux, dont le biome GROTTE hérite (faune, falaises du dehors).
  // La Route Victoire s'ouvre une fois tous les champions vaincus (meta/feats.ts) ; la taille de l'équipe règle les effectifs.
  const newRunState = () =>
    new Run(opts.seed, opts.biome === 'run' ? null : opts.biome === 'grotte' ? 'rocailleux' : opts.biome, { cs: [...save.cs], league: leagueOpen(save), teamSize: save.team.length });
  let run = newRunState();
  /** Au Repaire entre deux runs, ou en run. */
  let mode: 'camp' | 'run' = 'camp';
  /** Baies gagnées pendant la run en cours : on les annonce en rentrant au Repaire. */
  let runBaies = 0;
  /**
   * Rappels qui restent à l'équipe (Ceinture de Rappels) : une réserve
   * commune, utilisée seule au K.O. de n'importe quel membre.
   * Écart voulu : un compte par Pokémon (retour de test : « sinon ça devient
   * trop facile ») ; deux Rappels, c'est deux relevés pour toute la run.
   */
  let revives = 0;
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
  const attach = (a: Actor, isPlayer: boolean, level: number, outfit = false, nick?: string) => {
    void loadInfo(a.speciesId).then((i) => (a.info = i));
    void Promise.all([loadSheet(a.speciesId, isPlayer ? PLAYER_ACTIONS : WILD_ACTIONS), Pokemon.load(a.speciesId, level)]).then(([sheet, mon]) => {
      a.sheet = sheet;
      a.pokemon = mon;
      // Surnom : celui de la sauvegarde pour l'équipe du Repaire, celui choisi à la libération pour une recrue de grotte.
      mon.rename(nick ?? (outfit ? save.mons[a.baseId]?.name : undefined));
      if (outfit) void equip(mon, a.baseId);
      if (isPlayer) return;
      // Espèce sans planche dans le dépôt (le jeu la télécharge à la volée) :
      // elle ne serait jamais dessinée mais attaquerait quand même. Elle
      // disparaît, et compte comme vaincue pour ne pas bloquer la salle.
      if (!sheet) {
        a.deathT = DEATH_TIME;
        return;
      }
      // Bonus innés permanents d'un champion et de son as (EnemyAI.gd:210-217 : ATQ +15 % ; ATQ +35 %, DÉF +30 %).
      if (a.role !== 'wild') {
        const boost = BOSS_BOOST[a.role];
        mon.mult.atk *= boost.atk;
        mon.mult.spAtk *= boost.atk;
        mon.mult.def *= boost.def;
        mon.mult.spDef *= boost.def;
        // PV de chaque barre, selon la taille de l'équipe sur le terrain (mercenaires compris).
        mon.boostMaxHp(boost.hp * (1 + BOSS_HP_PER_MEMBER * Math.max(0, team.length - 1)));
        mon.hp = mon.maxHp;
      }
      // L'archétype dépend des capacités : le cerveau naît avec la fiche.
      a.brain = new EnemyBrain(a);
      // Une vague attaque d'emblée : le sauvage est déjà provoqué.
      a.brain.provoke();
      // Un Pokémon de champion entre en puissance avant d'agir.
      if (a.role !== 'wild') combat.bossIntro(a);
    });
  };

  /**
   * Ce que le Pokémon emporte du Repaire : ses attaques choisies au terminal,
   * son objet tenu et la Vitalité (GameManager : move_loadouts, pokemon_item).
   */
  const equip = async (mon: Pokemon, uid: number) => {
    // Nature et talents de l'individu (meta/mons.ts), avant l'objet et la Vitalité.
    const indiv = save.mons[uid];
    if (indiv) applyTraits(mon, indiv);
    const names = save.loadouts[uid];
    if (names?.length) {
      const pool = await movePool(uid, save);
      const picked = names.flatMap((n) => pool.filter((m) => m.api === n));
      if (picked.length) {
        mon.moves.splice(0, mon.moves.length, ...picked);
        mon.movesVersion++;
      }
    }
    const item = heldItem(save.held[uid]);
    applyHeld(mon, item);
    const vigor = level(save, 'vigor');
    if (vigor) mon.boostMaxHp(1 + 0.08 * vigor);
    mon.hp = mon.maxHp;
  };

  /**
   * `outfit` : un membre de l'équipe du Repaire, `id` est alors son uid (un mercenaire, une
   * recrue de grotte n'emportent rien : `id` est leur espèce).
   */
  const newMember = (id: number, x: number, y: number, level = BASE_TEAM_LEVEL, outfit = false, nick?: string) => {
    // Parti au-delà d'un seuil (Super Bonbon) : il part sous sa forme évoluée,
    // mais reste rangé dans la sauvegarde sous son uid.
    const p = new Actor(evolvedStart(outfit ? speciesOf(save, id) : id, level), x, y, id);
    // Comme le reste de l'équipe dans cette salle (loadRoom) ; au Repaire, buildTeam décide.
    p.canSwim = mode === 'run' ? director.swim : true;
    // La lave du Volcan, seulement avec la CS Surf (run/hazards.ts : elle brûle).
    p.lavaOk = mode === 'run' && save.cs.includes('surf');
    p.ally = new CompanionBrain(p);
    attach(p, true, level, outfit, nick);
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
      m.canSwim = mode === 'run' ? director.swim : save.cs.includes('surf');
      return m;
    });
    revives = mode === 'run' ? level(save, 'revives') : 0;
    // En ligne (Roucarnage) : un Pokémon par joueur, l'hôte ne garde que son meneur ; les invités le rejoignent.
    if (mode === 'run' && net.role === 'host' && net.inRun) {
      team = team.slice(0, 1);
      for (const p of net.guests) if (p.loadout) team.push(remoteMember(p.id, p.loadout, x, y));
    }
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
      if (!team[i].remote && team[i].deathT < 0 && team[i].pokemon && !team[i].pokemon!.fainted) return i;
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
    // Écart voulu : le rappel dans la Ball, puis le cri de celui qui entre, comme un changement en combat.
    sfx('swap');
    cry(player.speciesId, -4);
  };
  /** Un écran ouvert par-dessus le jeu : la simulation se fige. */
  const paused = () => rewardScreen.open || evolutionScreen.open || bossPreview.open || runSummary.open || settingsMenu.open || campScreen.open || statSheet.open || recruitScreen.open || starterScreen.open || quizScreen.open || journal.open || titleScreen.open;
  /** Clic sur un membre du HUD : comme Tab, mais vers celui-là, s'il est debout et qu'on l'est aussi. */
  const pickMember = (i: number) => {
    const m = team[i];
    if (paused() || i === active || !m || m.remote || player.deathT >= 0 || player.trapped || m.deathT >= 0 || !m.pokemon || m.pokemon.fainted) return;
    switchTo(i);
  };
  /** Rappels de la réserve qui peuvent relever ce membre : jamais un mercenaire (il repart à sa mort). */
  const revivesFor = (a: Actor) => (mode === 'run' && !a.runAlly ? revives : 0);

  /**
   * Fiche des statistiques (touche C) : en run, l'équipe telle qu'elle est
   * (PV du moment, dons) ; au Repaire, où seul celui qui mène se promène,
   * l'équipe composée telle qu'elle partira (attaques, objet, Vitalité).
   */
  const openStats = async () => {
    let entries: SheetEntry[];
    if (mode === 'run') {
      entries = team.flatMap((a) =>
        a.pokemon
          ? [{ mon: a.pokemon, item: a.runAlly ? undefined : heldItem(save.held[a.baseId]), ko: a.deathT >= 0 || a.pokemon.fainted, ally: a.runAlly }]
          : [],
      );
    } else {
      entries = await Promise.all(
        save.team.map(async (id) => {
          const lvl = startLevel(save, id, BASE_TEAM_LEVEL);
          const mon = await Pokemon.load(evolvedStart(speciesOf(save, id), lvl), lvl);
          mon.rename(save.mons[id]?.name);
          await equip(mon, id);
          return { mon, item: heldItem(save.held[id]) };
        }),
      );
    }
    // Un écran a pu s'ouvrir pendant le chargement (Repaire) : on n'empile pas.
    if (paused() || dialogue.open) return;
    statSheet.show(entries, mode === 'run' ? run.boons : null, () => input.flush());
  };
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyC' || e.repeat || e.metaKey || e.ctrlKey || paused() || dialogue.open) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
    void openStats();
  });
  /** Le plan du monde (panneau de l'arche) ou le carnet des exploits (Xatu) : au Repaire seulement. */
  const openJournal = (page: 'map' | 'feats', fromDialogue = false) => {
    if (paused() || (dialogue.open && !fromDialogue)) return;
    journal.show(
      page,
      save,
      (text) => {
        writeSave(save);
        refreshNews();
        runHud.notify({ title: 'Exploit', text, icon: '✦', color: 'var(--yel)' });
      },
      () => input.flush(),
    );
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
    // Le Pokédex note l'espèce dès qu'on la croise.
    if (markSeen(save, id)) writeSave(save);
    return a;
  };

  /** Génère la salle courante de la run et y place le joueur (PV et statuts conservés). */
  const loadRoom = (first: boolean) => {
    // Boutique et arène du champion : toujours les mêmes pour un biome donné (graine fixe), quelle que soit la run.
    const arena = run.isBoss();
    const seed = run.isShop() ? 7001 + BIOME_ORDER.indexOf(run.biome) * 131 : arena ? 9001 + BIOME_ORDER.indexOf(run.biome) * 137 : run.mapSeed;
    // Une grotte s'ouvre parfois dans une falaise (Run.hasCave) ; jamais à la boutique.
    // On entre par le bord d'en face de la porte prise (Run.entrySide) : la boutique et l'arène gardent leur allée du sud.
    const layout = opts.layout === 'auto' ? undefined : opts.layout;
    roomKey = { kind: 'room', biome: run.biome, seed, store: run.isShop(), cave: run.hasCave(), layout, mouthUsed: false, entry: arena ? 'S' : run.entrySide, arena };
    world = roomWorld(roomKey);
    outdoor = null;
    cave.clear();
    berries.build(world, BIOMES[run.biome].berry);
    hazards.build(world, run.mapSeed, run.isBoss());
    chests.build(world);
    roomHurt = false;
    questProgress({ kind: 'act', act: run.act });
    director.setHidden(false);
    renderer.bake(world);
    // Nager : seulement avec la CS Surf (retour de test : « je pouvais déjà aller dans l'eau
    // à la plage et au lac, alors que non »). Repli : une salle dont une porte ne s'atteint
    // pas à pied laisse nager, pour qu'on n'y reste jamais coincé.
    director.swim = swimRoom(world);
    for (const m of team) m.canSwim = director.swim;
    player.x = player.prevX = world.spawn.x;
    player.y = player.prevY = world.spawn.y;
    gatherTeam();
    for (const m of team) {
      m.atk.reset();
      m.slideDx = m.slideDy = 0;
    }
    player.dir = 0;
    player.action = null;
    player.swimming = false;
    player.swimBlend = 0;
    wild = [];
    combat.reset();
    footprints.reset();
    fieldFx.reset();
    particles.reset();
    skyParticles.reset();
    const before = first ? 'clear' : roomWeather;
    // L'arène du Village est une salle d'intérieur : ni pluie, ni pollen.
    const indoor = run.isBoss() && run.biome === 'village';
    // Le ciel découle de celui de la salle d'avant (world/weather.ts) ; une boutique ou un intérieur le laisse en pause.
    roomWeather = run.isShop() || indoor ? 'clear' : opts.weather !== 'run' ? opts.weather : rollWeather(run.biome, run.mapSeed, first ? undefined : lastSky);
    if (!run.isShop() && !indoor) lastSky = roomWeather;
    setWeather(weatherNow());
    // Le ciel change : on dit ce que ça change au combat.
    if (roomWeather !== before && roomWeather !== 'clear') runHud.notify({ title: WEATHERS[roomWeather].name, text: WEATHERS[roomWeather].hint, icon: WEATHERS[roomWeather].icon });
    director.start(world, run, opts.wild, first);
    // Le boss a sa musique (CombatArena.gd:1610) ; les autres salles, boutique comprise, la leur (écart voulu, sounds.ts).
    audio.playMusic(roomMusic());
    document.documentElement.style.setProperty('--biome', BIOME_COLOR[run.biome]);
    // Record de la salle la plus loin atteinte (affiché chez Xatu).
    if (run.room + 1 > save.bestRoom) {
      save.bestRoom = run.room + 1;
      writeSave(save);
    }
    if (run.isBiomeEntry) {
      runHud.announce(run.placeName, BIOME_COLOR[run.biome]);
      // Le carnet note les biomes atteints (la Prairie, d'où l'on part, compte d'office).
      const where = run.onVictoryRoad ? 'victoire' : run.biome;
      if (!save.visited.includes(where)) {
        save.visited.push(where);
        writeSave(save);
      }
    }
    boonOffer = null;
    skillOffer = null;
    trainer = null;
    dialogue.close();
    // Boutique : le marchand derrière son comptoir, l'étal, l'affiche et les Pokémon de la place.
    shop.clear();
    if (run.isShop()) shop.start(world, run, run.rng);
    merchant.clear();
    // Son propre tirage, tiré de la graine de la salle : parier ou non ne change pas les portes suivantes.
    if (run.special === 'merchant') merchant.start(world, run, new Rng(run.mapSeed ^ 0x4d656f77));
    combat.hooks.onRoomEnter(player, run, !first && run.room % 7 === 0, run.rng);
    // Test de la grotte (panneau) : chaque salle de combat part de sa grotte ; la salle attend dehors, figée.
    if (opts.biome === 'grotte' && !run.isShop() && !run.isBoss()) enterCave();
    else netRoom(roomKey, BIOME_COLOR[run.biome], roomMusic());
  };

  /**
   * La musique d'une salle de run : celle de son biome (sounds.ts, BIOME_TRACKS), celle de la
   * boutique, de la Route Victoire ; le combat seulement chez le champion.
   */
  function roomMusic(): MusicId {
    // Le combat change selon l'adversaire (retour de test : « d'autres musiques vraiment plus d'ambiance ») :
    // le Maître de la Ligue, le Conseil, le dresseur final, l'arène du Village, les champions.
    if (run.isBoss()) {
      if (run.onVictoryRoad) return run.champion.name === LEAGUE_MASTER ? 'bosschamp' : 'bosselite';
      if (run.isFinal) return 'bosschamp';
      return run.biome === 'village' ? 'gym' : 'bossgym';
    }
    if (run.isShop()) return 'shop';
    if (run.onVictoryRoad) return 'victoire';
    return run.biome;
  }

  /** La carte d'une salle de run, la même chez l'hôte et chez ses invités (arène décorée comprise). */
  function roomWorld(k: Extract<WorldKey, { kind: 'room' }>): WorldMap {
    const biome = k.biome as keyof typeof BIOMES;
    const w = generate(BIOMES[biome], k.seed, { store: k.store, arena: k.arena, cave: k.cave, layout: k.layout as LayoutId | undefined, entry: k.entry });
    if (k.arena) decorateArena(w, biome);
    return w;
  }

  /** L'arène d'intérieur du Village (world/arena.ts, buildGym) : pas de particules d'ambiance. */
  function indoorRoom(): boolean {
    return mode === 'run' && !cave.active && run.isBoss() && run.biome === 'village';
  }

  /** L'équipe peut-elle nager dans cette salle ? Avec Surf, toujours ; sans, seulement si une porte l'exige. */
  function swimRoom(w: WorldMap): boolean {
    if (save.cs.includes('surf') || net.inRun) return true;
    const land = landReachable(w);
    return w.exits.some((e) => !land[Math.floor(e.y - 0.05) * w.w + Math.floor(e.x)]);
  }

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
    sfx('moveLearnt');
    if (replace >= 0) mon.moves[replace] = learned;
    else mon.moves.push(learned);
    mon.movesVersion++;
    runHud.notify({ title: 'Nouvelle attaque', text: `${mon.name} apprend ${learned.name}.`, art: mon.id, color: typeColor(learned.type) });
  };
  const strengthen = (mon: Pokemon, slot: number) => {
    const old = mon.moves[slot];
    // Deuxième renforcement d'une lignée (Pistolet à O → Vibraqua → Hydrocanon) : la capacité évolue.
    void evolveMove(old).then((evo) => {
      if (mon.moves[slot] !== old) return;
      if (evo) {
        mon.moves[slot] = evo;
        sfx('moveLearnt');
        mon.movesVersion++;
        runHud.notify({ title: 'Attaque évoluée', text: `${old.name} devient ${evo.name} (puissance ${evo.power}).`, art: mon.id, color: typeColor(evo.type) });
        return;
      }
      upgradeMove(old);
      sfx('moveLearnt');
      mon.movesVersion++;
      runHud.notify({ title: 'Attaque renforcée', text: `${old.name} : puissance ${old.power}.`, art: mon.id, color: typeColor(old.type) });
    });
  };

  /** Le don choisi : une ultime remplace la précédente ; un don de statistique s'applique tout de suite. */
  const claimBoon = (offer: BoonOffer, id: string, rarity: number) => {
    const boons = run.boons;
    sfx('moveLearnt');
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
    cave.clear();
    outdoor = null;
    run = newRunState();
    combat.run = run;
    // Améliorations du Repaire : Partage d'XP et Bourse de départ.
    combat.hooks.metaXp = 1 + 0.2 * level(save, 'xp');
    combat.hooks.metaDash = level(save, 'dash');
    run.money = 100 * level(save, 'purse');
    runBaies = 0;
    stats.reset();
    runWon = false;
    save.runs++;
    writeSave(save);
    rewardScreen.close();
    endT = -1;
    world = generate(BIOMES[run.biome], run.mapSeed, { layout: opts.layout === 'auto' ? undefined : opts.layout });
    buildTeam(world.spawn.x, world.spawn.y);
    loadRoom(true);
  };

  /** Baies gagnées : versées tout de suite (une run abandonnée ne les perd pas), annoncées au retour. */
  const earn = (n: number) => {
    // En ligne : les Baies gagnées le sont aussi par chaque invité, dans sa propre sauvegarde.
    if (n > 0) shareLoot({ baies: n });
    save.baies += n;
    runBaies += n;
    stats.baies += n;
    writeSave(save);
  };

  /**
   * Le Repaire : la clairière de nuit, ses postes, et l'équipe qui suit le
   * Pokémon qui mène. On y revient après chaque run.
   */

  const enterCamp = () => {
    netEnd();
    clearNetScene();
    me = null;
    field.clear();
    clientEndT = -1;
    clientHud = null;
    mode = 'camp';
    endT = -1;
    rewardScreen.close();
    bossPreview.close?.();
    dialogue.close();
    trainer = null;
    wild = [];
    shop.clear();
    merchant.clear();
    director.clear();
    cave.clear();
    berries.clear();
    chests.clear();
    hazards.clear();
    outdoor = null;
    buildCampWorld();
    refreshNews();
    renderer.bake(world);
    const at = hostCamp && campSpawn ? campSpawn : world.spawn;
    // Revenu avant que l'hôte ait quitté son bilan : on prendra sa place à côté de lui dès qu'il rentre.
    awaitSpawn = !!hostCamp && !campSpawn;
    campSpawn = null;
    buildTeam(at.x, at.y);
    player.dir = 4;
    combat.reset();
    footprints.reset();
    fieldFx.reset();
    particles.reset();
    document.documentElement.style.setProperty('--biome', '#ff9a3a');
    audio.playMusic('camp');
    runHud.announce('Le Repaire', '#ff9a3a', hostCamp ? 'CHEZ TON HÔTE' : 'CAMP DES REBELLES');
    // Hôte : au retour de run, les invités réapparaissent à côté de lui.
    for (const v of visitors) v.remoteIn = null;
    netCamp();
    if (runBaies > 0) runHud.notify({ title: 'Retour au Repaire', text: `+${runBaies} Baies rapportées de la run.`, icon: '✦', color: 'var(--yel)' });
    runBaies = 0;
    const back = save.missions.filter((m) => m && m.left <= 0).length;
    if (back) runHud.notify({ title: 'Missions', text: `${back > 1 ? `${back} Pokémon sont rentrés` : 'Un Pokémon est rentré'} de mission : récolte chez Démolosse.`, art: CAMP_NPCS.missions, color: 'var(--yel)' });
    const ripe = save.built.includes('field') ? save.garden.filter((p) => p && p.left <= 0).length : 0;
    if (ripe) runHud.notify({ title: 'Potager', text: `${ripe > 1 ? `${ripe} parcelles sont mûres` : 'Une parcelle est mûre'} : récolte chez Héliatronc.`, art: CAMP_NPCS.garden, color: 'var(--yel)' });
    if (save.nectar && save.nectar.left <= 0) runHud.notify({ title: 'Nectar', text: 'Un visiteur attend devant l’atelier.', art: save.nectar.visitor, color: 'var(--yel)' });
    // Une fois : où trouver la carte du monde (retour de test : « je ne sais pas si tu as fait la carte »).
    if (save.started && !save.intros.includes('journal-hint')) {
      save.intros.push('journal-hint');
      writeSave(save);
      runHud.notify({ title: 'Plan du monde', text: 'Le panneau près de l’arche montre la carte du monde ; Xatu, à côté, tient le carnet des exploits.', icon: '✦', color: 'var(--yel)' });
    }
    const feats = readyFeats(save).length;
    if (feats) runHud.notify({ title: 'Exploits', text: `${feats > 1 ? `${feats} exploits sont` : 'Un exploit est'} à réclamer auprès de Xatu, près de l’arche.`, art: CAMP_NPCS.feats, color: 'var(--yel)' });
    welcomeStory();
    askStarter();
    // Invité par un lien avant d'avoir son premier Pokémon : le voilà prêt, la partie l'attend.
    if (invite && save.started && !titleScreen.open && !net.active) {
      const code = invite;
      invite = '';
      campScreen.joinCode = code; // déjà saisi quand il ouvrira l'écran de Roucarnage
      runHud.notify({ title: 'Invitation', text: `La partie ${code} t'attend : parle à Roucarnage, le code est déjà saisi.`, art: CAMP_NPCS.online, color: '#7ac0e8' });
    }
  };

  /** « Le Repaire · 5/6 Pokémon · 2 en attente » : la jauge des places, en haut à gauche. */
  const campPlaces = () => {
    const waiting = save.candidates.length;
    return `${REPAIRE.name} · ${roster(save).length}/${capacity(save)} Pokémon${waiting ? ` · ${waiting} en attente` : ''}`;
  };
  /** Les espèces de l'équipe, et celles des libérés qui restent au camp (ni dans l'équipe, ni en mission). */
  const campTeam = () => save.team.map((uid) => speciesOf(save, uid));
  const campDwellers = () => roster(save).filter((uid) => !save.team.includes(uid) && !busy(save, uid)).map((uid) => speciesOf(save, uid));
  /** Le panneau de test compose l'équipe par espèce. */
  const syncPanelTeam = () => {
    opts.team = campTeam();
    saveOptions(opts);
    panel.refreshTeam();
  };
  /** Ce que les écrans du Repaire peuvent faire. */
  const campCtx: CampCtx = {
    save,
    persist: () => writeSave(save),
    teamChanged: () => {
      syncPanelTeam();
      // L'équipe qui suit change, là où on se tient ; les Pokémon libérés du feu se recomposent.
      const at = { x: player.x, y: player.y, dir: player.dir };
      enterCampKeep(at);
      // En ligne : le meneur est le Pokémon qu'on emmène ; les autres le voient changer.
      if (net.active) void myLoadout().then((lo) => net.setLoadout(lo));
    },
    depart: () => {
      input.flush();
      // Des invités dans le Repaire : Dracolosse les emmène aussi.
      if (net.role === 'host' && net.guests.length) campCtx.online.start();
      else newRun();
    },
    notify: (title, text, art) => runHud.notify({ title, text, art, color: 'var(--yel)' }),
    online: {
      loadout: () => myLoadout(),
      start: () => {
        // L'hôte lance la run en ligne : les invités quittent leur Repaire et attendent la première salle.
        input.flush();
        net.inRun = true;
        // Nouveau film pour la nouvelle run : les icônes fabriquées seront retransmises.
        recorder = new DrawRecorder();
        lastScene = '';
        net.broadcast({ t: 'start' });
        newRun();
      },
    },
    preview: () => {
      // La même graine que la run que Dracolosse lancera.
      const next = newRunState();
      const b = next.biomes[0];
      return { biome: BIOMES[b].name, color: BIOME_COLOR[b], champion: next.champions[0].name, champType: next.champions[0].type };
    },
  };
  /** Recompose le camp sans le rideau d'arrivée : on reste là où l'on est. */
  const enterCampKeep = (at: { x: number; y: number; dir: number }) => {
    buildCampWorld();
    refreshNews();
    renderer.bake(world);
    buildTeam(at.x, at.y);
    player.dir = at.dir;
    netCamp();
  };

  /** Au Repaire : les cartes de l'équipe (portrait, nom, niveau de départ), refaites quand elle change. */
  let campTeamKey = '';
  const refreshCampTeam = () => {
    const key = save.team.map((u) => `${u}:${speciesOf(save, u)}:${startLevel(save, u, BASE_TEAM_LEVEL)}:${save.mons[u]?.name ?? ''}`).join('|');
    if (key === campTeamKey) return;
    campTeamKey = key;
    void Promise.all(
      save.team.map(async (u) => {
        const id = speciesOf(save, u);
        const info = await loadInfo(id);
        return { id, name: monName(save, u, info.name), level: startLevel(save, u, BASE_TEAM_LEVEL) };
      }),
    ).then((list) => {
      if (key === campTeamKey) hud.setCampTeam(list);
    });
  };

  /**
   * Le Repaire où l'on se tient : le sien, ou celui de l'hôte quand on le
   * visite en ligne (Roucarnage) — ses aménagements, ses libérés et ses recrues en
   * attente (qu'on voit sans leur parler), sans les récoltes, qui sont les siennes.
   */
  function buildCampWorld(): void {
    const built = (hostCamp?.built ?? save.built) as typeof save.built;
    world = generate(REPAIRE, CAMP_SEED, { camp: true, glade: built.includes('clearing'), eastGlade: built.includes('eastglade'), atelier: built.includes('atelier'), pockets: campPockets(built) });
    // Les recrues de l'hôte se voient autour du feu (retour de test : « je ne vois pas tous les Pokémon en attente »), mais restent les siennes.
    if (hostCamp) camp.build(world, built, hostCamp.dwellers, { garden: [], nectar: null, candidates: hostCamp.recruits.map((species) => ({ species })) });
    else camp.build(world, save.built, campDwellers(), save);
  }

  /** Les repères « ! » des gardiens qui ont du neuf (meta/news.ts). */
  function refreshNews(): void {
    camp.setNews(campNews(save, camp.stations));
  }

  /**
   * La recrue qui attend près du feu (Save.candidates) : un Pokémon vaincu assez de fois, ou
   * arrivé quand le Repaire était plein. Sa fiche, un surnom, et l'équipe ou le camp. Ajout
   * (retour de test : « on lui parle, il nous demande de nous rejoindre, on lui donne un
   * nom »). Repaire plein : on choisit d'abord qui s'en va — l'exil —, ou on la renvoie.
   * Échap : elle attend encore.
   */
  const meetCandidate = async (idx = 0) => {
    const c = save.candidates[idx];
    if (!c || recruitScreen.open || starterScreen.open || dialogue.open) return;
    const mon = await Pokemon.load(c.species, BASE_TEAM_LEVEL);
    if (c.name) mon.rename(c.name);
    /** Retire cette recrue de la file (elle a pu bouger si une autre est partie entre-temps). */
    const dequeue = () => {
      const k = save.candidates.indexOf(c);
      if (k >= 0) save.candidates.splice(k, 1);
    };
    const welcomeIt = () => {
      const full = save.team.length >= teamSlots(level(save, 'slots'));
      recruitScreen.show(
        {
          mon,
          teamFull: full,
          text: {
            tape: 'Une recrue',
            quote: '« Tu m’as battu… et tu m’as sorti de ma Poké Ball. Personne ne m’avait jamais laissé choisir. Je veux me battre avec la rébellion. »',
            ask: 'L’accueillez-vous ?',
            yes: 'Oui, dans l’équipe',
            no: 'Oui, au Repaire',
            hint: `Il s’installe au Repaire, avec sa nature et ses talents à lui. ${teamRoomHint()} Échap : il attend encore.`,
          },
        },
        (choice, nick) => {
          input.flush();
          if (!choice) return;
          const named = nick && nick !== mon.name ? nick : c.name;
          const fresh = !ownsSpecies(save, c.species);
          dequeue();
          const m = addMon(save, c.species, c.origin, named);
          if (choice === 'team' && !full) save.team.push(m.uid);
          writeSave(save);
          if (fresh) welcome(c.species);
          // Le camp se recompose : les autres recrues, s'il y en a, restent autour du feu.
          if (choice === 'team') campCtx.teamChanged();
          else enterCampKeep({ x: player.x, y: player.y, dir: player.dir });
        },
      );
    };
    const proceed = async () => {
      if (!isFull(save)) return welcomeIt();
      const uids = roster(save).filter((u) => !busy(save, u) && !(save.team.length === 1 && save.team[0] === u));
      const infos = await Promise.all(uids.map((u) => loadInfo(speciesOf(save, u))));
      const names = uids.map((u, k) => monName(save, u, infos[k].name));
      starterScreen.show(
        (_, k) => {
          input.flush();
          // « Plus tard » (ou Échap) : rien ne change, la recrue attend encore au feu.
          if (k === -2) return;
          if (k < 0) {
            dequeue();
            writeSave(save);
            runHud.notify({ title: 'Au revoir', text: `${mon.name} repart, le cœur gros. Il reviendra peut-être.`, art: c.species, color: 'var(--ink)' });
            enterCampKeep({ x: player.x, y: player.y, dir: player.dir });
            return;
          }
          const uid = uids[k];
          const sp = speciesOf(save, uid);
          if (!exile(save, uid)) return;
          writeSave(save);
          runHud.notify({ title: 'Adieu', text: `${names[k]} quitte la rébellion. Il laisse sa place à ${mon.name}.`, art: sp, color: 'var(--ink)' });
          welcomeIt();
        },
        {
          ids: uids.map((u) => speciesOf(save, u)),
          names,
          subs: uids.map((u) => natureText(save.mons[u].nature)),
          tape: 'Le Repaire est plein',
          quote: `« ${mon.name} veut nous rejoindre, mais le Repaire ne loge que ${capacity(save)} libérés. Bâtissez de quoi en loger plus chez le bâtisseur, ou choisissez qui doit partir. »`,
          go: 'Il s’en va…',
          cancel: `Renvoyer ${mon.name}`,
          later: 'Plus tard',
        },
      );
    };
    // La toute première recrue se présente et explique le chemin jusqu'à l'équipe (retour de
    // test : « j'ai galéré au tout début pour avoir un premier Pokémon dans mon équipe »).
    if (!save.intros.includes('first-recruit')) {
      save.intros.push('first-recruit');
      writeSave(save);
      dialogue.show(
        { name: mon.name, role: 'Le Repaire · Recrue', type: mon.types[0] ?? 'normal', sprite: `/game/artwork/${c.species}.png` },
        `J’aimerais rejoindre ton camp ! Je peux m’installer au Repaire dès maintenant. ${teamRoomHint()}`,
        () => void proceed(),
      );
      return;
    }
    await proceed();
  };

  /**
   * Comment une recrue entre dans l'équipe, selon où l'on en est : une place libre, la
   * place à acheter chez Alakazam, ou l'Étude à faire bâtir d'abord.
   */
  function teamRoomHint(): string {
    const slots = teamSlots(level(save, 'slots'));
    if (save.team.length < slots) return 'Il te reste une place dans l’équipe : je peux partir avec toi dès la prochaine run. Porygon, à la hutte de l’équipe, change l’équipe quand tu veux.';
    const next = UPGRADES.find((u) => u.id === 'slots')!;
    const lvl = level(save, 'slots');
    if (lvl >= next.max) return 'L’équipe est complète : Porygon, à la hutte de l’équipe, peut m’y faire entrer à la place d’un autre.';
    const price = `${next.price(lvl)} Baies`;
    if (!save.built.includes('study')) return `Pour que je rejoigne ton équipe, il faut une place de plus : va voir Charpenti, le bâtisseur, pour construire l’Étude d’Alakazam. Alakazam y vend une Place dans l’équipe (${price}), puis Porygon, à la hutte de l’équipe, m’y fera entrer.`;
    return `Pour que je rejoigne ton équipe, il faut une place de plus : Alakazam en vend une à son étude (${price}). Ensuite, Porygon, à la hutte de l’équipe, m’y fera entrer.`;
  }

  /**
   * Le Pokémon qu'un nectar a attiré devant l'atelier (meta/crafting.ts) : la
   * fiche du prisonnier de grotte, avec ses mots à lui. Son espèce est
   * débloquée quoi qu'on choisisse ; « dans l'équipe » l'y met pour la
   * prochaine run s'il reste une place. Échap : il attend encore.
   */
  const meetVisitor = async () => {
    const n = save.nectar;
    if (!n || n.left > 0 || recruitScreen.open) return;
    const id = n.visitor;
    const mon = await Pokemon.load(id, BASE_TEAM_LEVEL);
    const full = save.team.length >= teamSlots(level(save, 'slots'));
    recruitScreen.show(
      {
        mon,
        teamFull: full,
        text: {
          tape: 'Visiteur du Repaire',
          quote: `« Quelle odeur… Je l’ai suivie de très loin. C’est donc ici, le camp des rebelles ? On y est libre, paraît-il. »`,
          ask: 'Reste-t-il avec vous ?',
          yes: 'Oui, dans l’équipe',
          no: 'Il reste au Repaire',
          hint: 'Il reste quoi qu’il arrive : son espèce est débloquée et il vit désormais au Repaire. Dans l’équipe, il part avec vous dès la prochaine run (s’il reste une place).',
        },
      },
      (choice, nick) => {
        input.flush();
        if (!choice) return;
        const named = nick && nick !== mon.name ? nick : undefined;
        const fresh = !ownsSpecies(save, id);
        // Repaire plein : il rejoint la file d'attente, près du feu.
        const m = welcomeMon(save, id, 'nectar', named);
        if (m && choice === 'team' && !full) save.team.push(m.uid);
        save.nectar = null;
        writeSave(save);
        if (fresh) welcome(id);
        if (choice === 'team') campCtx.teamChanged();
        else enterCampKeep({ x: player.x, y: player.y, dir: player.dir });
      },
    );
  };

  /** Parler au gardien d'un poste : sa présentation la première fois, puis son écran. */
  const talkTo = (station: Station, arg?: number) => {
    if (dialogue.open || campScreen.open) return;
    const openScreen = () => {
      // Xatu : le carnet des exploits, pas un écran de poste.
      if (station === 'feats') return openJournal('feats', true);
      // Ce qui y est apparu est vu (l'écran le marque d'un « ! » cette fois-ci encore) ; ce qui
      // attend un geste (récolter, réclamer) se revérifie à la fermeture.
      const news = freshNews(save, station);
      markNewsSeen(save, station);
      writeSave(save);
      refreshNews();
      campScreen.show(
        station,
        campCtx,
        () => {
          input.flush();
          refreshNews();
        },
        news,
      );
    };
    // Chez l'hôte, ses gardiens le servent lui : seuls Roucarnage (la partie), Porygon (sa propre équipe) et les
    // boutiques répondent à l'invité (retour de test : « si je n'ai pas toutes les améliorations, je ne peux pas
    // les acheter une fois dans la session »). Monsieur Mime (attaques), Alakazam (améliorations) et Miaouss
    // (objets) lui vendent avec SA sauvegarde ; Démolosse (missions) et le Charpentier restent ceux de l'hôte.
    if (hostCamp && !HOST_CAMP_OPEN.has(station)) {
      runHud.notify({ title: 'Repaire de l’hôte', text: station === 'start' ? 'C’est l’hôte qui lance la run, chez Dracolosse.' : 'Ce gardien sert l’hôte : ici, tu peux parler à Roucarnage, Porygon et aux boutiques.', art: CAMP_NPCS.online, color: '#7ac0e8' });
      return;
    }
    if (station === 'map') return openJournal('map');
    // Dracolosse ne lance plus la run (on part en passant l'arche) : il le rappelle.
    if (station === 'start' && !(net.role === 'host' && net.guests.length)) {
      const g = STATIONS.start;
      dialogue.show({ name: camp.npcs.find((n) => n.speciesId === g.id)?.info?.name ?? g.title, role: `Le Repaire · ${g.title}`, type: g.type, sprite: `/game/artwork/${g.id}.png` }, 'Quand tu es prêt, passe l’arche, au nord. Ton équipe te suit : compose-la chez Porygon avant de partir.');
      return;
    }
    if (station === 'feats' && hostCamp) return;
    if (station === 'visitor') return meetVisitor();
    if (station === 'recruit') return void meetCandidate(arg);
    if (save.intros.includes(station)) return openScreen();
    save.intros.push(station);
    writeSave(save);
    const g = STATIONS[station];
    const id = stationId(station, save.built);
    const guard = camp.npcs.find((n) => n.speciesId === id);
    dialogue.show({ name: guard?.info?.name ?? g.title, role: `Le Repaire · ${g.title}`, type: g.type, sprite: `/game/artwork/${id}.png` }, g.intro, openScreen);
  };

  const director: RoomDirector = new RoomDirector(document.body, fx, {
    spawnEnemy: (id, level, x, y, role, bars) => {
      const a = spawnEnemy(id, level, x, y, role);
      // Pokémon du champion de l'acte : ils lancent sa signature (combat/signatures.ts). Pas les gardiens de grotte.
      if (role !== 'wild') a.signature = run.champion.name;
      // Pokémon d'un top dresseur : plusieurs barres de PV (combat.ts les recharge une à une).
      if (bars) a.bars = a.barsLeft = bars;
      return a;
    },
    message: (text) => runHud.message(text),
    toast: (text, stamp) => runHud.toast(text, stamp),
    nextRoom: (offer) => {
      // Le bord de la porte prise : la salle suivante s'ouvre du bord d'en face (Run.entrySide).
      run.advance(offer, offer.exit !== undefined ? world.exits[offer.exit]?.side : undefined);
      loadRoom(false);
    },
    roomCleared: () => {
      combat.hooks.onRoomClear(player, run);
      // Le ciel se dégage une fois la salle libérée (retour de test : sous la grêle, on ne pouvait
      // ni fouiller ni prendre son don sans perdre trop de PV).
      if (roomWeather !== 'clear') {
        roomWeather = 'clear';
        setWeather(weatherNow());
        runHud.notify({ title: 'Éclaircie', text: 'Le ciel se dégage.', icon: '☀' });
      }
      // La salle libérée, les membres à terre se relèvent avec 1 PV pour la suivante (retour de
      // test : « quand un Pokémon meurt et qu'on finit la zone, il revient avec un seul point de
      // vie » — en ligne, celui qui est tombé ne fait plus rien jusqu'à la fin de la salle, puis
      // repart). Les mercenaires, eux, ne reviennent jamais.
      for (const m of team) {
        if (m.deathT < 0 || !m.pokemon || m.runAlly) continue;
        m.getUp();
        m.pokemon.status = null;
        m.pokemon.hp = 1;
        fx.ballSend(m.x, m.y);
      }
      questProgress({ kind: 'room', hurt: roomHurt });
      if (run.isBoss()) questProgress({ kind: 'champion' });
      // Les missions de Démolosse avancent d'une salle (RunManager.advance → ExpeditionManager.tick_room).
      const back = tickMissions(save);
      // Le champ de la clairière rapporte un peu de Nourriture à chaque salle (sans annonce : c'est le fond du camp).
      if (save.built.includes('field')) save.resources.food += FIELD_FOOD;
      // Le potager pousse, le nectar attend son visiteur (meta/crafting.ts).
      const grown = tickCraft(save);
      if (back.length || save.built.includes('field') || save.nectar) writeSave(save);
      if (grown.ripe) runHud.notify({ title: 'Potager', text: `${grown.ripe > 1 ? `${grown.ripe} parcelles sont mûres` : 'Une parcelle est mûre'} : récolte chez Héliatronc.`, art: CAMP_NPCS.garden, color: 'var(--yel)' });
      if (grown.visitor && save.nectar) {
        const id = save.nectar.visitor;
        void loadInfo(id).then((info) => runHud.notify({ title: 'Nectar', text: `${info.name}, attiré par le nectar, t’attend devant l’atelier.`, art: id, color: 'var(--yel)' }));
      }
      for (const i of back) {
        const slot = save.missions[i]!;
        const m = mission(slot.type);
        const sp = speciesOf(save, slot.pid);
        void loadInfo(sp).then((info) => runHud.notify({ title: 'Mission', text: `${monName(save, slot.pid, info.name)} est rentré : ${rewardText(m)} à récolter au Repaire.`, art: sp, color: 'var(--yel)' }));
      }
      // Un champion tombé rapporte des Baies et des Éclats de Champion (CombatArena.gd:1899) ; le Dresseur final, davantage.
      if (run.isBoss()) {
        const n = BAIES.boss(run.act) + (run.isFinal ? BAIES.finalBonus : 0);
        const k = SHARDS.boss(run.act) + (run.isFinal ? SHARDS.finalBonus : 0);
        save.shards += k;
        shareLoot({ shards: k, text: `Champion vaincu : +${k} Éclat${k > 1 ? 's' : ''} de Champion` });
        stats.shards += k;
        stats.champions.push(run.champion.name);
        // Le carnet des exploits (meta/feats.ts) : un champion de plus vaincu au moins une fois.
        beatChampion(run.champion.name);
        earn(n);
        // Jusqu'au changement de salle (CombatArena.gd:1796).
        audio.playMusic('victory');
        runHud.notify({ title: 'Champion vaincu', text: `${run.champion.name} est tombé.`, art: run.champion.team.at(-1)?.[0], color: 'var(--yel)' });
        runHud.notifyAll([
          { title: 'Baies', text: 'Pour le Repaire', item: 'ORANBERRY', qty: `+${n}`, color: 'var(--yel)' },
          { title: `Éclat${k > 1 ? 's' : ''} de Champion`, text: 'Pour le Repaire', item: SHARDS.icon, qty: `+${k}`, color: 'var(--yel)' },
        ]);
      }
      // Son équipe vaincue, le champion quitte la salle par la sortie.
      if (run.isBoss()) trainer?.flee(world);
    },
    prepareReward: (reward) => {
      if (reward === 'boon') boonOffer = run.boons.offer(run.rng, run.room, run.act, run.donor);
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
    enterCave: () => enterCave(),
    setTimer: (seconds) => runHud.setTimer(seconds),
    // Défi raté : les sauvages encore debout s'enfuient dans un nuage.
    dismissEnemies: () => {
      for (const e of wild) if (e.deathT < 0) fx.poof(e.x, e.y);
      wild = wild.filter((e) => e.deathT >= 0);
    },
    specialDone: (special, success) => {
      if (special !== 'merchant') questProgress({ kind: 'special', special, success });
    },
    // Ligne de front : la vague qui arrive fait trembler le sol (coupé avec les secousses, comme les autres).
    rumble: () => combat.addShake(0.25),
    capture: (a, by) => captureMember(a, by),
    release: (captives, x, y) => releaseMembers(captives, x, y),
    // Retour de test : même seul, on peut être capturé — « il n'a qu'à faire le QTE pour s'en sortir ».
    canBeCaptured: () => true,
    bossIntro: (exit) => {
      const champ = run.champion;
      const final = run.isFinal;
      // Dans son arène, le champion se tient au bord nord du terrain, face à l'entrée ; il fuira par la sortie.
      trainer = exit ? (roomKey.kind === 'room' && roomKey.arena ? new Trainer(champ.sprite, { x: world.hub.x, y: world.hub.y - 7.5 }, exit) : Trainer.atExit(champ.sprite, exit)) : null;
      runHud.announce(champ.name, typeColor(champ.type), run.onVictoryRoad ? 'MAÎTRE DE LA LIGUE' : final ? 'DRESSEUR FINAL' : "CHAMPION D'ARÈNE");
      // L'éclair du « VS » des combats de dresseur.
      sfx('vs');
      combat.addShake(0.15);
      const line = final ? finalLines().intro : champ.intro;
      dialogue.show(speaker(champ, final), line);
      if (net.role === 'host' && net.inRun) net.broadcast({ t: 'dialogue', speaker: speaker(champ, final), text: line });
    },
    victory: () => {
      questProgress({ kind: 'victory' });
      beatChampion(run.champion.name);
      save.wins++;
      endT = 0;
      runWon = true;
      // Le jingle du badge attend le bilan : joué ici, il couvrirait la musique de victoire.
      audio.playMusic('victory');
      earn(BAIES.victory(run.room));
      // Le jeu changeait de scène avant la fin de la réplique de défaite : on attend qu'elle soit lue.
      endDelay = Math.max(VICTORY_TIME, Dialogue.duration(FINAL_BOSS_DEFEAT) + 0.5);
      combat.addShake(0.2);
      dialogue.show(speaker(run.champion, true), finalLines().defeat);
      runHud.announce('Victoire !', '#ffd23f', run.onVictoryRoad ? 'NOUVEAU MAÎTRE' : 'LA CHAÎNE EST BRISÉE');
    },
  });

  /**
   * Un champion vaincu, noté au carnet (une fois par nom). La dixième victoire de la
   * liste ouvre la Route Victoire : on le dit tout de suite.
   */
  function beatChampion(name: string): void {
    if (save.beaten.includes(name)) return;
    const was = leagueOpen(save);
    save.beaten.push(name);
    writeSave(save);
    runHud.notify({ title: 'Exploit', text: `${name} vaincu pour la première fois : réclame l’exploit à Xatu, au Repaire.`, icon: '✦', color: 'var(--yel)' });
    if (!was && leagueOpen(save)) runHud.notify({ title: 'Route Victoire', text: 'Tous les champions sont tombés. La Route Victoire s’ouvre au bout de la carte du monde.', icon: '★', color: 'var(--yel)' });
  }

  /** Les répliques du dernier boss : le Dresseur final, ou le Maître au bout de la Route Victoire. */
  function finalLines(): { intro: string; defeat: string } {
    if (run.onVictoryRoad) return { intro: run.champion.intro, defeat: MASTER_DEFEAT };
    return { intro: FINAL_BOSS_INTRO, defeat: FINAL_BOSS_DEFEAT };
  }

  /**
   * La grotte (A-FAIRE 1.6) : une carte à part, générée à la volée depuis la
   * graine de la salle, où l'on entre par la bouche ouverte dans une falaise.
   * La salle du dehors est mise de côté telle quelle (`outdoor`) et restaurée
   * au retour, bouche consommée : on ressort au pied de la falaise, là où l'on
   * était entré, et les portes attendent toujours.
   */
  let outdoor: { world: WorldMap; x: number; y: number } | null = null;
  const resetField = () => {
    for (const m of team) {
      m.atk.reset();
      m.trapped = false;
      // Une glissade sur la glace ne passe pas d'une carte à l'autre.
      m.slideDx = m.slideDy = 0;
    }
    player.action = null;
    player.swimming = false;
    player.swimBlend = 0;
    wild = [];
    combat.reset();
    footprints.reset();
    fieldFx.reset();
    particles.reset();
  };
  /** Toute l'équipe à terre (ou le dernier debout capturé) : la run est perdue. */
  const defeat = () => {
    endT = 0;
    endDelay = DEFEAT_TIME;
    // Le jingle de défaite seul, sans musique dessous (CombatArena.gd:7029).
    audio.playMusic(null);
    sfx('defeat');
    runHud.toast('Défaite…', `${run.room} salle${run.room > 1 ? 's' : ''} traversée${run.room > 1 ? 's' : ''}`);
    earn(BAIES.defeat(run.room));
  };
  const cave: CaveDirector = new CaveDirector(document.body, fx, atlas, {
    spawnEnemy: (id, level, x, y, role) => {
      const a = spawnEnemy(id, level, x, y, role);
      // Écart voulu : 3 barres au gardien (4 dans le jeu, CaveArena) ; la run web est plus courte.
      if (role === 'champion') a.bars = a.barsLeft = 3;
      return a;
    },
    message: (text) => runHud.message(text),
    toast: (text, stamp) => runHud.toast(text, stamp),
    announce: (name, kicker) => runHud.announce(name, '#8fa8ff', kicker),
    notify: (title, text, art) => runHud.notify({ title, text, art, icon: art ? undefined : '✦', color: '#8fa8ff' }),
    heal: () => {
      for (const m of team) if (m.pokemon && m.deathT < 0 && !m.pokemon.fainted) m.pokemon.hp = m.pokemon.maxHp;
    },
    openChest: () => {
      sfx('chest');
      // Le premier coffre : un Bandeau Choix pour le Repaire ; ensuite, des Baies.
      if (!save.items['choice-band']) {
        save.items['choice-band'] = 1;
        shareLoot({ items: { 'choice-band': 1 }, text: 'Bandeau Choix · envoyé au Repaire' });
        writeSave(save);
        return 'Bandeau Choix · envoyé au Repaire';
      }
      const n = 60 + run.act * 30;
      earn(n);
      return `+${n} Baies pour le Repaire`;
    },
    recruit: async (id, level, x, y) => {
      const mon = await Pokemon.load(id, level);
      return new Promise<boolean>((resolve) =>
        recruitScreen.show({ mon, teamFull: team.length >= 6 }, (choice, nick) => {
          input.flush();
          if (!choice) return resolve(false);
          const named = nick && nick !== mon.name ? nick : undefined;
          const who = named ?? mon.name;
          // Le prisonnier est libéré quoi qu'on choisisse : il vit au Repaire, sous son surnom.
          const fresh = !ownsSpecies(save, id);
          const room = !!welcomeMon(save, id, `cave:${run.biome}`, named);
          writeSave(save);
          if (choice === 'team') {
            // Comme un mercenaire de la boutique : allié de run, jamais ranimé.
            const m = newMember(id, x, y, level, false, named);
            m.runAlly = true;
            team.push(m);
          }
          const home = room ? 'rejoindra le Repaire' : 'attendra au Repaire qu’une place se libère';
          const text = choice === 'team' ? `${who} se bat avec vous, puis ${home}.` : room ? `${who} part attendre au Repaire.` : `${who} ${home}.`;
          runHud.notify({ title: 'Libéré', text, art: id, color: '#8fa8ff' });
          if (fresh && room) welcome(id);
          resolve(true);
        }),
      );
    },
    leave: () => exitCave(),
    challenge: (who, text, done) => dialogue.show(who, text, done),
    capture: (a, by) => captureMember(a, by),
    release: (captives, x, y) => releaseMembers(captives, x, y),
  });
  /** Un membre capturé (sbire des grottes, dresseurs du Village) : il quitte l'équipe jusqu'à la défaite du ravisseur. */
  function captureMember(a: Actor, by: string): void {
    const name = a.pokemon?.name ?? '?';
    // En ligne : capturé, on est simplement K.O. ; on se relève à 1 PV si la salle est libérée
    // (retour de test : sinon un joueur se retrouvait sans Pokémon).
    if (net.inRun && a.pokemon) {
      a.trapped = false;
      a.pokemon.hp = 0;
      if (a.deathT < 0) a.deathT = 0;
      runHud.notify({ title: 'Capturé !', text: `${name} est K.O. jusqu’à la fin de la salle.`, art: a.speciesId, ko: true, color: '#e84040' });
      return;
    }
    runHud.notify({ title: 'Capturé !', text: `${name} a été capturé par ${/^[AEIOUÉ]/.test(by) ? 'l’' : 'le '}${by} — bats son équipe pour le libérer.`, art: a.speciesId, ko: true, color: '#e84040' });
    if (a === player) {
      const next = nextAlive();
      // Le dernier debout : la run s'arrête là (il reste dans la Ball, invisible).
      if (next < 0) {
        if (endT < 0) defeat();
        return;
      }
      switchTo(next);
    }
    // Il quitte l'équipe (HUD compris) jusqu'à ce qu'on batte son ravisseur.
    a.ally?.reset();
    team.splice(team.indexOf(a), 1);
    active = team.indexOf(player);
  }

  /** Le ravisseur battu rend ses prises : elles ressortent de leur Ball autour de lui. */
  function releaseMembers(captives: readonly Actor[], x: number, y: number): void {
    captives.forEach((c, k) => {
      c.trapped = false;
      const ang = (k / Math.max(1, captives.length)) * Math.PI * 2;
      c.x = c.prevX = x + Math.cos(ang) * 0.8;
      c.y = c.prevY = y + Math.sin(ang) * 0.5;
      fx.ballSend(c.x, c.y);
      if (!team.includes(c)) team.push(c);
    });
    const names = captives.map((c) => c.pokemon?.name ?? '?').join(', ');
    runHud.notify({ title: 'Libérés', text: `${names} ${captives.length > 1 ? 'reviennent' : 'revient'} dans l’équipe !`, art: captives[0].speciesId, color: '#8fa8ff' });
  }

  const enterCave = () => {
    outdoor = { world, x: player.x, y: player.y };
    const layout = generateCave(run.mapSeed);
    world = layout.world;
    renderer.bake(world);
    player.x = player.prevX = world.spawn.x;
    player.y = player.prevY = world.spawn.y;
    player.dir = 0;
    gatherTeam();
    resetField();
    // En grotte, seul cave.update tourne : le voile noir de la salle, qui a servi
    // à y entrer, ne redescendrait jamais et masquerait toute la grotte.
    director.fade = 0;
    director.setHidden(true);
    cave.start(layout, run, ownedSpecies(save));
    runHud.announce(cave.title, '#8fa8ff', BIOMES[run.biome].name.toUpperCase());
    audio.playMusic('grotte');
    netRoom({ kind: 'cave', seed: run.mapSeed }, '#8fa8ff', 'grotte');
  };
  const exitCave = () => {
    if (!outdoor) return;
    world = outdoor.world;
    outdoor = null;
    renderer.bake(world);
    const mouth = world.cave;
    if (mouth) mouth.used = true;
    // Au pied de la falaise, sous la bouche, face au sud.
    player.x = player.prevX = mouth ? mouth.x + 0.5 : world.spawn.x;
    player.y = player.prevY = mouth ? mouth.y + 2.6 : world.spawn.y;
    player.dir = 0;
    gatherTeam();
    resetField();
    cave.clear();
    director.caveDone();
    director.setHidden(false);
    director.fade = 1;
    roomKey = { ...roomKey, mouthUsed: true } as WorldKey;
    audio.playMusic(roomMusic());
    netRoom(roomKey, BIOME_COLOR[run.biome], roomMusic());
  };

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
      for (const n of [...shop.npcs, ...merchant.npcs, ...camp.npcs, ...cave.npcs]) {
        const dx = a.x - n.x;
        const dy = a.y - n.y;
        const d = Math.hypot(dx, dy);
        const overlap = BODY_RADIUS * 2 - d;
        if (overlap > 0) a.nudge(world, (d > 1e-4 ? dx / d : 1) * overlap, (d > 1e-4 ? dy / d : 0) * overlap);
      }
    }
  };

  /** L'écran de Roucarnage (héberger ou rejoindre), ouvert depuis le menu principal. */
  const openOnline = () => {
    if (campScreen.open) return;
    campScreen.show('online', campCtx, () => {
      input.flush();
      refreshNews();
    });
  };

  /**
   * Rejoint la partie d'un lien d'invitation : l'écran de Roucarnage s'ouvre pour montrer la
   * connexion (et l'échec s'il y en a un), puis on y entre avec le meneur de son équipe.
   */
  const joinInvite = (code: string) => {
    invite = '';
    if (net.active) return;
    openOnline();
    void myLoadout().then((lo) => net.join(code, lo));
  };

  /**
   * Rien de débloqué (première visite, ou progression remise à zéro) : on
   * choisit son starter, qui devient l'équipe (GameManager.STARTER_IDS).
   */
  const askStarter = () => {
    // Menu principal encore ouvert : « Jouer » rappellera askStarter (le questionnaire vient après lui).
    if (save.started || quizScreen.open || starterScreen.open || titleScreen.open) return;
    // Le questionnaire d'abord (ui/quizscreen.ts) ; « Choisir un autre » ouvre les neuf starters.
    const pick = (id: number, nick: string) => {
      input.flush();
      // Le Pikachu de passage s'en va : le starter est le premier libéré, sous le nom qu'on lui donne,
      // avec la nature de son starter (celle que le questionnaire a révélée).
      save.mons = {};
      save.started = true;
      const m = addMon(save, id, 'starter', nick || undefined);
      m.nature = STARTER_NATURE[id] ?? m.nature;
      save.team = [m.uid];
      save.prologue = 'run';
      writeSave(save);
      syncPanelTeam();
      startPrologue();
    };
    quizScreen.show(pick, (back) => starterScreen.show((sid) => back(sid)));
  };

  /**
   * Le prologue (ajout, retour de test : « tu commences endormi, tu te réveilles dans une
   * prairie, des dresseurs essaient de te capturer… la première fois que tu meurs, tu te
   * réveilles dans le hub, un Pokémon te raconte »). Une run ordinaire, dont la première
   * salle s'ouvre sur le starter endormi : il se réveille, se demande où il est, et un
   * dresseur l'a déjà repéré. Au retour au Repaire (welcomeStory), Dracolosse raconte.
   */
  const startPrologue = () => {
    newRun();
    scene = { t: 0, wake: 2.4, lines: () => prologueLines() };
  };
  const meSpeaker = (): Speaker => ({ name: player.pokemon?.name ?? '???', role: 'Toi', type: player.pokemon?.types[0] ?? 'normal', sprite: `/game/artwork/${player.speciesId}.png` });
  const prologueLines = (): [Speaker, string][] => [
    [meSpeaker(), '… Mmh… Où suis-je ? Je ne me souviens de rien.'],
    [{ name: 'Dresseur', role: 'Prairie', type: 'normal', sprite: '/game/assets/essentials/trainers/battle/BLACKBELT.png' }, `Hé, là-bas ! Un ${player.info?.name ?? 'Pokémon'} sauvage ! Sortez vos Poké Balls, il ne doit pas filer !`],
  ];
  /** Au premier retour au Repaire après le prologue : on s'y réveille, et Dracolosse raconte. */
  const welcomeStory = () => {
    if (save.prologue !== 'run') return;
    save.prologue = 'done';
    writeSave(save);
    const chief = (): Speaker => ({ name: 'Dracolosse', role: 'Le Repaire · chef des rebelles', type: 'dragon', sprite: `/game/artwork/${CAMP_NPCS.start}.png` });
    // Il est déjà là quand on ouvre les yeux, à côté de nous (retour de test : « qu'il vienne me
    // parler tout de suite, que je le voie à l'écran ») ; la scène finie, il regagne l'arche.
    let home: { x: number; y: number; dir: number } | null = null;
    const dragonite = () => camp.npcs.find((n) => n.speciesId === CAMP_NPCS.start);
    scene = {
      t: 0,
      wake: 2,
      start: () => {
        const d = dragonite();
        if (!d) return;
        home = { x: d.x, y: d.y, dir: d.dir };
        d.x = d.prevX = player.x + 1.6;
        d.y = d.prevY = player.y + 0.2;
        d.dir = dirFromVector(player.x - d.x, player.y - d.y);
      },
      end: () => {
        const d = dragonite();
        if (!d || !home) return;
        d.x = d.prevX = home.x;
        d.y = d.prevY = home.y;
        d.dir = home.dir;
      },
      lines: () => [
        [chief(), 'Doucement, petit. On t’a ramassé dans la prairie, à moitié assommé.'],
        [chief(), 'Ici, c’est le Repaire : des Pokémon qui refusent les Poké Balls. Bats-en dehors, certains nous rejoindront.'],
        [chief(), 'Reprends des forces. Quand tu es prêt, viens me voir sous l’arche.'],
      ],
    };
  };
  /**
   * Une petite scène qui fige le jeu (ni vagues, ni commandes) : le meneur dort `wake`
   * secondes, se relève, puis les répliques défilent, une boîte de dialogue après l'autre.
   */
  let scene: { t: number; wake: number; lines: () => [Speaker, string][]; talking?: boolean; started?: boolean; start?: () => void; end?: () => void } | null = null;
  const playScene = (dt: number): boolean => {
    const s = scene;
    if (!s) return false;
    if (!s.started) {
      s.started = true;
      s.start?.();
    }
    s.t += dt;
    if (s.t < s.wake) {
      if (player.sheet && !player.downed) player.lieDown();
      return true;
    }
    if (s.talking) return true;
    s.talking = true;
    player.getUp();
    const lines = s.lines();
    const next = (i: number) => {
      if (i >= lines.length) {
        scene = null;
        s.end?.();
        input.flush();
        // Le prologue : en garde, les touches qui comptent avant la première vague.
        if (mode === 'run')
          runHud.tutorial(
            isTouch()
              ? [
                  [['Stick'], 'Se déplacer (à gauche)'],
                  [['Cartes'], 'Toucher une attaque (en bas de l’écran)'],
                  [['DASH'], 'Esquiver d’un bond'],
                ]
              : [
                  [['←', '↑', '→', '↓'], 'Se déplacer'],
                  [['1·Q', '2·Z', '3·S', '4·D'], 'Lancer tes attaques (en bas de l’écran)'],
                  [['Espace'], 'Esquiver d’un bond'],
                ],
          );
        return;
      }
      // L'histoire se lit à son rythme : chaque réplique attend Entrée.
      dialogue.show(lines[i][0], lines[i][1], () => next(i + 1), false);
    };
    next(0);
    return true;
  };

  /** Une option a changé, depuis le panneau de test ou le menu des réglages : on l'applique. */
  const applyOption = (changed: keyof Options) => {
    saveOptions(opts);
    switch (changed) {
      case 'weather':
        if (mode === 'run' && !run.isShop()) roomWeather = opts.weather !== 'run' ? opts.weather : rollWeather(run.biome, run.mapSeed);
        break;
      case 'biome':
      case 'seed':
      case 'layout':
        // Au Repaire, la graine et le biome valent pour la prochaine run.
        if (mode === 'run') newRun();
        break;
      case 'team': {
        // Le panneau compose l'équipe du Repaire par espèce, sans compter les places (outil de
        // test) : chaque espèce prend un libéré de cette espèce (pas un parti en mission), ou en
        // fait venir un, marqué « test ».
        const used = new Set<number>();
        const team = opts.team.map((sp) => {
          const uid = roster(save).find((u) => speciesOf(save, u) === sp && !used.has(u) && !busy(save, u)) ?? addMon(save, sp, 'test').uid;
          used.add(uid);
          return uid;
        });
        if (team.length) save.team = team;
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
      case 'music':
      case 'sfx':
      case 'muted':
        audio.setVolumes(opts);
        break;
      case 'density':
      case 'viewHeight':
        renderer.resize(opts);
        break;
      case 'wild':
        if (mode === 'run') loadRoom(false);
        break;
      case 'shake':
        combat.shakeMult = opts.shake ? 1 : 0;
        if (!opts.shake) combat.shake = 0;
        break;
    }
  };
  /**
   * Quitter la run depuis le menu (retour de test : « des fois on veut juste se barrer »). Seul, ou chez
   * l'hôte : la run s'arrête comme une défaite (même consolation en Baies, bilan, retour au Repaire), sans
   * attendre le temps de la chute ; en ligne, les invités reçoivent la fin et reviennent aussi. Un invité,
   * lui, quitte seulement la partie et retrouve son Repaire.
   */
  const runExit = (): LeaveOffer | undefined => {
    if (mode !== 'run' || endT >= 0 || titleScreen.open) return undefined;
    if (net.role === 'client') return { label: 'Quitter la partie', hint: 'Retour à ton Repaire ; les autres continuent.', run: () => net.leave() };
    const together = net.role === 'host' && net.guests.length > 0;
    return {
      label: 'Abandonner la run',
      hint: together ? 'Retour au Repaire pour tout le monde.' : 'Retour au Repaire, avec la consolation d’une défaite.',
      run: () => {
        if (mode !== 'run' || endT >= 0) return;
        runWon = false;
        defeat();
        // Pas d'attente : le bilan s'ouvre tout de suite.
        endT = endDelay;
      },
    };
  };
  // Le menu des réglages (Échap) : le panneau, qui montre les mêmes options, se remet à jour derrière.
  const settingsMenu = new SettingsMenu(document.body, opts, (changed) => {
    applyOption(changed);
    panel.sync();
  });
  addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || e.repeat || paused() || dialogue.open) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
    settingsMenu.show(() => input.flush(), undefined, runExit());
  });
  const panel = new Panel(opts, applyOption, (act, kind) => {
    if (kind === 'camp') return enterCamp();
    // Outils de test du Repaire : des Baies à volonté, ou une progression remise à zéro.
    if (kind === 'baies' || kind === 'reset') {
      if (kind === 'baies') {
        save.baies += 1000;
        for (const r of RESOURCE_IDS) save.resources[r] += 100;
        save.shards += 20;
      }
      else Object.assign(save, resetSave());
      writeSave(save);
      syncPanelTeam();
      if (mode === 'camp') {
        enterCampKeep({ x: player.x, y: player.y, dir: player.dir });
        askStarter();
      }
      return;
    }
    // Aller à une salle : 1ʳᵉ salle de combat, boutique ou boss de l'acte (PV et dons conservés).
    // Depuis le Repaire, une run part d'abord.
    if (mode === 'camp') newRun();
    const special = kind === 'challenge' || kind === 'trap' || kind === 'merchant' ? kind : null;
    run.room = act * ROOMS_PER_ACT + (special ? 1 : kind === 'combat' ? 0 : kind === 'shop' ? COMBATS_PER_ACT : ROOMS_PER_ACT - 1);
    run.special = special;
    endT = -1;
    loadRoom(false);
  });

  // ── Jeu en ligne (Roucarnage, net/net.ts) ──────────────────────────────
  // L'hôte simule toute la run ; chaque invité y a un Pokémon (Actor.remote),
  // qu'il pilote chez lui. L'hôte lui renvoie le terrain SNAP_EVERY pas sur
  // trois (≈ 20 fois par seconde) ; l'invité ne simule que son propre Pokémon.
  const SNAP_EVERY = 3;
  const netIds = new NetIds();
  let netStep = 0;
  /** N° de la carte en cours : une position d'invité d'avant le changement de salle est ignorée. */
  let netEpoch = 0;
  /** Hôte : de quoi régénérer la salle du dehors chez les invités. */
  let roomKey: WorldKey = { kind: 'room', biome: 'prairie', seed: 0, store: false, cave: false, mouthUsed: false };
  /** Hôte : effets visuels joués depuis le dernier instantané, rejoués chez les invités. */
  let fxQueue: [string, unknown[]][] = [];
  /** Hôte : attaques reçues des invités, lancées au pas suivant. */
  const remoteMoves: { a: Actor; slot: number; mx: number; my: number }[] = [];
  /** Invité : les Pokémon de l'hôte, mon Pokémon, le HUD reçu, et le voile de fin de run. */
  const field = new ClientField();
  let me: Actor | null = null;
  let clientHud: Extract<HostMsg, { t: 'snap' }>['hud'] | null = null;
  let clientEndT = -1;
  /** Invité : le bilan reçu de l'hôte, montré une fois le fondu fini (comme l'hôte voit le sien). */
  let clientEnd: Extract<HostMsg, { t: 'end' }> | null = null;
  let pendingMove = -1;
  /** Hôte : les Pokémon des invités dans son Repaire. */
  const visitors: Actor[] = [];
  /** Hôte : les invités qui ont pressé E depuis le dernier pas (ouvrir un coffre). */
  const remoteInteract = new Set<Actor>();
  /** Invité : E pressé, à envoyer avec la prochaine position. */
  let pendingInteract = false;
  /** Hôte : enregistre ce qu'il dessine de la salle, rejoué chez les invités (net/drawrec.ts). */
  let recorder = new DrawRecorder();
  let lastScene = '';
  /** Invité : la dernière scène reçue, les images qu'elle cite, et les étiquettes HTML de l'hôte. */
  let hostScene: Extract<HostMsg, { t: 'scene' }> | null = null;
  const bank = new ImageBank();
  const netLabels = document.createElement('div');
  netLabels.className = 'room-labels net-labels';
  document.body.append(netLabels);
  let netLabelsHtml = '';

  /** Ce que la salle dessine en plus des Pokémon, trié avec eux (dresseurs, boutique, marchand, grotte, arbres, coffre). */
  const runExtras = () => [
    ...[...(trainer ? [trainer] : []), ...(mode === 'run' && outside() ? director.trainers : [])].map((t) => ({ y: t.y * TILE, draw: t.draw.bind(t) })),
    ...shop.extras(time),
    ...merchant.extras(time),
    ...cave.extras(),
    ...(outside() ? [...berries.extras(), ...chests.extras(), ...hazards.extras(time), ...director.captureExtras()] : []),
  ];

  /** Hôte : un gain de la run, versé aussi dans la sauvegarde de chaque invité. */
  const shareLoot = (loot: Omit<Extract<HostMsg, { t: 'loot' }>, 't'>) => {
    if (net.role !== 'host' || !net.inRun || mode !== 'run') return;
    net.broadcast({ t: 'loot', ...loot });
  };

  /**
   * Hôte : les étiquettes HTML de la salle (portes, récompense, grotte), avec
   * leur point dans le monde. On les place avec un projecteur factice (une case
   * = 1000 px) et on relit leur position ; le rendu suivant les replace.
   */
  const captureLabels = () => {
    const S = 1000;
    const fake = { toCss: (x: number, y: number) => ({ x: x * S, y: y * S }), perTile: S };
    director.placeLabels(fake);
    shop.placeLabels(fake);
    merchant.placeLabels(fake);
    const out: { h: string; x: number; y: number; s?: number }[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('.room-labels:not(.net-labels) > *')) {
      if (el.offsetParent === null) continue;
      const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(el.style.transform);
      if (!m) continue;
      const size = el.style.getPropertyValue('--s');
      const clone = el.cloneNode(true) as HTMLElement;
      clone.style.removeProperty('transform');
      clone.style.removeProperty('--s');
      out.push({ h: clone.outerHTML, x: Math.round((+m[1] / S) * 100) / 100, y: Math.round((+m[2] / S) * 100) / 100, s: size ? parseFloat(size) / S : undefined });
    }
    return out;
  };

  /** Hôte : la scène de la salle, à chaque invité, seulement quand elle a changé. */
  const sendScene = () => {
    const extras = runExtras()
      .map((e): [number, Cmd[]] => [Math.round(e.y * 10) / 10, recorder.record((b) => e.draw(b, 0, 0, 1))])
      .filter(([, c]) => c.length);
    const ground = recorder.record((b) => {
      combat.hooks.drawZones(b, 0, 0, 1, time);
      director.drawGround(b, 0, 0, 1);
    });
    const overlay = recorder.record((b) => director.drawOverlay(b, 0, 0, 1, time));
    const labels = captureLabels();
    const defs = recorder.takeDefs();
    const body = JSON.stringify([extras, ground, overlay, labels]);
    if (body === lastScene && !Object.keys(defs).length) return;
    lastScene = body;
    net.broadcast({ t: 'scene', epoch: netEpoch, extras, ground, overlay, labels, defs });
  };

  /** Invité : les étiquettes de l'hôte, replacées sous ma caméra. */
  const placeNetLabels = (proj: { toCss(x: number, y: number): { x: number; y: number }; perTile: number }) => {
    const labels = hostScene?.labels ?? [];
    const html = labels.map((l) => l.h).join('');
    if (html !== netLabelsHtml) {
      netLabelsHtml = html;
      netLabels.innerHTML = html;
    }
    labels.forEach((l, i) => {
      const el = netLabels.children[i] as HTMLElement | undefined;
      if (!el) return;
      const p = proj.toCss(l.x, l.y);
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
      if (l.s) el.style.setProperty('--s', `${Math.round(l.s * proj.perTile)}px`);
    });
  };
  const clearNetScene = () => {
    hostScene = null;
    netLabelsHtml = '';
    netLabels.replaceChildren();
  };

  // Invité : le sol et le voile de la salle sont ceux que l'hôte a dessinés (le directeur, ici, ne joue pas).
  {
    const ground = director.drawGround.bind(director);
    const overlay = director.drawOverlay.bind(director);
    const zones = combat.hooks.drawZones.bind(combat.hooks);
    const remote = () => net.role === 'client' && mode === 'run';
    director.drawGround = (b, camX, camY, k) => (remote() ? hostScene && replay(b, hostScene.ground, camX, camY, k, bank) : ground(b, camX, camY, k));
    director.drawOverlay = (b, camX, camY, k, t) => (remote() ? hostScene && replay(b, hostScene.overlay, camX, camY, k, bank) : overlay(b, camX, camY, k, t));
    combat.hooks.drawZones = (b, camX, camY, k, t) => (remote() ? undefined : zones(b, camX, camY, k, t));
  }
  /** Invité : le Repaire de l'hôte, où l'on se promène (null : chez soi). */
  let hostCamp: { built: string[]; dwellers: number[]; recruits: number[] } | null = null;
  /** Les gardiens du Repaire d'un hôte qui répondent à ses invités (et vendent avec leur propre sauvegarde). */
  const HOST_CAMP_OPEN: ReadonlySet<string> = new Set(['online', 'team', 'moves', 'upgrades', 'items']);
  /** Invité : où l'hôte nous attend dans son Repaire (à côté de lui, pas sur lui). */
  let campSpawn: { x: number; y: number } | null = null;
  let awaitSpawn = false;

  /** Le meneur de l'équipe, tel qu'il partirait : ce qu'on emmène dans une run en ligne. */
  const myLoadout = async (): Promise<Loadout> => {
    const id = save.team[0];
    const lvl = startLevel(save, id, BASE_TEAM_LEVEL);
    const mon = await Pokemon.load(evolvedStart(speciesOf(save, id), lvl), lvl);
    mon.rename(save.mons[id]?.name);
    await equip(mon, id);
    return { species: mon.id, level: lvl, name: mon.name, moves: mon.moves.map((m) => ({ ...m })), maxHp: mon.maxHp };
  };

  /** Hôte : le Pokémon d'un invité, avec les attaques et les PV qu'il a composés chez lui. */
  const remoteMember = (id: string, lo: Loadout, x: number, y: number) => {
    const a = new Actor(lo.species, x, y);
    a.remote = id;
    a.canSwim = true;
    void loadInfo(lo.species).then((i) => (a.info = i));
    void Promise.all([loadSheet(lo.species, PLAYER_ACTIONS), Pokemon.load(lo.species, lo.level, false)]).then(([sheet, mon]) => {
      a.sheet = sheet;
      mon.moves.splice(0, mon.moves.length, ...lo.moves.map((m) => ({ ...m })));
      mon.movesVersion++;
      if (lo.name !== mon.name) mon.rename(lo.name);
      mon.fitMaxHp(lo.maxHp);
      mon.hp = mon.maxHp;
      a.pokemon = mon;
    });
    return a;
  };

  /** Hôte : le Pokémon d'un invité prend la position que son navigateur annonce. */
  const driveRemote = (a: Actor, dt: number) => {
    a.prevX = a.x;
    a.prevY = a.y;
    a.tickTimers(dt);
    if (a.deathT >= 0) {
      a.deathT += dt;
      a.moving = false;
      return;
    }
    const r = a.remoteIn;
    if (r && !a.trapped) {
      a.x = r.x;
      a.y = r.y;
      a.dir = r.dir;
      a.moving = r.moving;
      a.dashT = r.dashT;
      a.swimming = r.swimming;
      a.swimBlend = r.swimming ? 1 : 0;
    }
    a.sinceDash = a.dashT > 0 ? 0 : a.sinceDash + dt;
    a.animT += dt;
  };

  net.onClient = (from, msg) => {
    if (msg.t !== 'in') return;
    const a = (mode === 'run' ? team : visitors).find((m) => m.remote === from);
    if (!a) return;
    if (msg.epoch === netEpoch) a.remoteIn = { x: msg.x, y: msg.y, dir: msg.dir, moving: msg.moving, dashT: msg.dashT, swimming: msg.swimming };
    if (msg.interact && mode === 'run') remoteInteract.add(a);
    if (msg.move >= 0 && mode === 'run') remoteMoves.push({ a, slot: msg.move, mx: msg.mx, my: msg.my });
  };
  /**
   * En ligne, chacun reçoit le Pokémon de tête des autres joueurs, sous sa forme de base, s'il ne l'a pas (retour de
   * test : « chez un joueur qui n'a pas Évoli, ça le débloque dans le Pokédex, et vice versa »). Une fois par espèce.
   */
  const shareAllies = () => {
    if (!net.active) return;
    let got = false;
    for (const pl of net.players) {
      if (pl.id === net.id || !pl.loadout) continue;
      const r = grantAlly(save, pl.loadout.species);
      if (!r) continue;
      got = true;
      sfx('pkmnGet', -4);
      void loadInfo(r.id).then((i) =>
        runHud.notify({ title: 'Allié rencontré', text: r.waiting ? `${i.name} veut te rejoindre : il t’attend au Repaire.` : `★ ${i.name} rejoint la rébellion !`, art: r.id, color: '#7ac0e8' }),
      );
    }
    if (got) writeSave(save);
  };
  net.onChange(shareAllies);
  net.onJoin = (id) => {
    netCamp();
    // L'hôte voit arriver ses alliés, même loin de Roucarnage.
    const lo = net.players.find((p) => p.id === id)?.loadout;
    if (lo) runHud.notify({ title: 'En ligne', text: `${lo.name} arrive dans ton Repaire !`, art: lo.species, color: '#7ac0e8' });
  };

  /** Hôte : les Pokémon des invités qui se promènent dans le Repaire, un par invité, tenus à jour du lobby. */
  const syncVisitors = () => {
    for (let i = visitors.length - 1; i >= 0; i--) {
      const g = net.guests.find((p) => p.id === visitors[i].remote);
      if (!g?.loadout || g.loadout.species !== visitors[i].speciesId) visitors.splice(i, 1);
    }
    for (const g of net.guests) if (g.loadout && !visitors.some((v) => v.remote === g.id)) visitors.push(remoteMember(g.id, g.loadout, player.x, player.y));
  };

  /** Hôte : le Repaire à décrire aux invités (à leur arrivée, et quand il change). */
  const netCamp = () => {
    if (net.role !== 'host' || mode !== 'camp' || !net.guests.length) return;
    netEpoch++;
    syncVisitors();
    const spawn: Record<string, { x: number; y: number }> = {};
    visitors.forEach((v, i) => {
      // Les nouveaux arrivent à côté de l'hôte ; les autres restent où ils sont.
      if (!v.remoteIn) {
        const ang = (i / visitors.length) * Math.PI * 2 + 0.6;
        v.x = v.prevX = player.x + Math.cos(ang) * 1.2;
        v.y = v.prevY = player.y + Math.sin(ang) * 0.8;
      }
      spawn[v.remote!] = { x: v.x, y: v.y };
    });
    net.broadcast({ t: 'camp', epoch: netEpoch, built: [...save.built], dwellers: campDwellers(), recruits: save.candidates.map((c) => c.species), spawn });
  };

  /** Hôte : où en sont l'hôte et ses invités dans le Repaire. */
  const sendCampSnap = () => {
    const own: Record<string, number> = {};
    const actors = [player, ...visitors].map((a) => {
      const n = netIds.of(a);
      if (a.remote) own[a.remote] = n;
      return snapActor(a, n, true);
    });
    net.broadcast({ t: 'snap', epoch: netEpoch, actors, own, cd: {}, strikes: [], fx: [], shake: 0, hud: { place: REPAIRE.name, money: 0, fade: 0, boss: null } });
  };

  /** Hôte : une nouvelle carte (salle, grotte, retour au dehors) ; chaque invité y apparaît près de l'hôte. */
  const netRoom = (key: WorldKey, color: string, music: string) => {
    if (net.role !== 'host' || !net.inRun) return;
    netEpoch++;
    const spawn: Record<string, { x: number; y: number }> = {};
    for (const m of team) {
      if (!m.remote) continue;
      m.remoteIn = null;
      spawn[m.remote] = { x: m.x, y: m.y };
    }
    fxQueue = [];
    const bits = (a: ArrayLike<number>) => Array.from(a, (v) => (v ? '1' : '0')).join('');
    net.broadcast({ t: 'room', epoch: netEpoch, key, spawn, blocked: bits(world.blocked), solid: bits(world.solid), weather: weatherNow(), music, color });
  };

  /** La barre du Pokémon de champion en jeu (un à la fois : un par vague). */
  const bossBar = () => {
    const champ = wild.find((a) => a.role !== 'wild' && a.pokemon && a.deathT < 0);
    return champ?.pokemon
      ? {
          name: champ.pokemon.name,
          sub: cave.active ? cave.guardianTitle : `${champ.role === 'boss' ? 'As' : 'Équipe'} de ${run.champion.name}`,
          ace: champ.role === 'boss',
          bars: champ.bars,
          barsLeft: champ.barsLeft,
          ratio: champ.pokemon.hp / champ.pokemon.maxHp,
        }
      : null;
  };
  const placeName = () => (cave.active ? cave.title : run.isShop() ? 'Boutique' : `${run.placeName}${weatherNow() !== 'clear' ? ` · ${WEATHERS[weatherNow()].name}` : ''}`);

  /** Hôte : l'instantané du terrain, à tous les invités. */
  const sendSnap = () => {
    const own: Record<string, number> = {};
    const cd: Record<string, [number[], number[]]> = {};
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const actors = [
      ...team.map((a) => {
        const n = netIds.of(a);
        if (a.remote) {
          own[a.remote] = n;
          cd[a.remote] = [a.atk.moveCd.map(r2), a.atk.moveCdMax.map(r2)];
        }
        return snapActor(a, n, true);
      }),
      ...wild.map((a) => snapActor(a, netIds.of(a), false)),
      // Les figurants : le vendeur et les mercenaires de la boutique, Miaouss, les prisonniers de grotte.
      ...[...shop.npcs, ...merchant.npcs, ...cave.npcs].map((a) => snapActor(a, netIds.of(a), false, true)),
    ];
    net.broadcast({
      t: 'snap',
      epoch: netEpoch,
      actors,
      own,
      cd,
      strikes: combat.exportStrikes(),
      fx: fxQueue,
      shake: r2(combat.shake),
      hud: { place: placeName(), money: run.money, fade: r2(Math.max(director.fade, cave.fade)), boss: bossBar() },
    });
    fxQueue = [];
  };

  /** Hôte : la run en ligne s'achève ; chaque invité rentre dans son Repaire avec ses Baies. */
  const netEnd = () => {
    if (net.role !== 'host' || !net.inRun) return;
    net.inRun = false;
    const mem: Record<string, [number, number]> = {};
    for (const m of team) if (m.remote) mem[m.remote] = [stats.members.get(m)?.dealt ?? 0, stats.members.get(m)?.taken ?? 0];
    net.broadcast({
      t: 'end',
      won: runWon,
      rooms: runWon ? run.room + 1 : run.room,
      baies: runBaies,
      sum: { act: run.act, biome: BIOMES[run.biome].name, color: BIOME_COLOR[run.biome], champion: run.champion.name, boons: run.boons.owned.size, time: stats.time, kos: stats.kos, dealt: stats.dealt, taken: stats.taken, shards: stats.shards, champions: [...stats.champions], mem },
    });
  };

  // Hôte : les effets et les annonces de la run partent aussi chez les invités.
  for (const k of ['impact', 'poof', 'ballSend', 'attackAnim', 'number'] as const) {
    const orig = fx[k].bind(fx) as (...args: unknown[]) => void;
    (fx as unknown as Record<string, (...args: unknown[]) => void>)[k] = (...args: unknown[]) => {
      if (net.role === 'host' && net.inRun && mode === 'run') fxQueue.push([k, args]);
      orig(...args);
    };
  }
  for (const k of ['message', 'toast', 'announce'] as const) {
    const orig = runHud[k].bind(runHud) as (...args: unknown[]) => void;
    (runHud as unknown as Record<string, (...args: unknown[]) => void>)[k] = (...args: unknown[]) => {
      if (net.role === 'host' && net.inRun && mode === 'run') net.broadcast({ t: 'hud', k, args });
      orig(...args);
    };
  }

  net.onLeave = (from) => {
    if (net.role === 'host' || from) {
      // Un invité part en pleine run : son Pokémon quitte le terrain.
      const a = team.find((m) => m.remote === from);
      if (!a) return;
      fx.poof(a.x, a.y);
      team.splice(team.indexOf(a), 1);
      active = team.indexOf(player);
      runHud.notify({ title: 'En ligne', text: `${a.pokemon?.name ?? 'Un allié'} a quitté la partie.`, art: a.speciesId, color: '#7ac0e8' });
      return;
    }
    // Partie quittée, ou l'hôte a coupé : retour dans son propre Repaire.
    const visiting = !!hostCamp;
    hostCamp = null;
    field.clear();
    if (mode === 'run' || visiting) {
      enterCamp();
      runHud.notify({ title: 'En ligne', text: net.status || 'De retour dans ton Repaire.', art: CAMP_NPCS.online, color: '#7ac0e8' });
    }
  };

  /** Invité : la carte que l'hôte vient d'ouvrir, régénérée ici depuis sa graine. */
  const clientRoom = (msg: Extract<HostMsg, { t: 'room' }>) => {
    const k = msg.key;
    if (k.kind === 'cave') world = generateCave(k.seed).world;
    else {
      world = roomWorld(k);
      if (k.mouthUsed && world.cave) world.cave.used = true;
    }
    if (msg.blocked.length === world.blocked.length) for (let i = 0; i < msg.blocked.length; i++) world.blocked[i] = msg.blocked.charCodeAt(i) - 48;
    if (msg.solid.length === world.solid.length) for (let i = 0; i < msg.solid.length; i++) world.solid[i] = msg.solid.charCodeAt(i) - 48;
    renderer.bake(world);
    netEpoch = msg.epoch;
    const at = msg.spawn[net.id];
    if (me) {
      me.x = me.prevX = at?.x ?? world.spawn.x;
      me.y = me.prevY = at?.y ?? world.spawn.y;
      me.dir = 0;
      me.action = null;
      me.atk.reset();
      me.slideDx = me.slideDy = 0;
      me.swimming = false;
      me.swimBlend = 0;
    }
    field.clear();
    combat.reset();
    footprints.reset();
    fieldFx.reset();
    particles.reset();
    skyParticles.reset();
    roomWeather = msg.weather as WeatherId;
    setWeather(weatherNow());
    audio.playMusic((msg.music in MUSIC ? msg.music : 'prairie') as MusicId);
    document.documentElement.style.setProperty('--biome', msg.color);
  };

  /** Invité : l'hôte lance la run ; on quitte le Repaire avec son meneur. */
  const clientStart = () => {
    mode = 'run';
    net.inRun = true;
    camp.clear();
    campScreen.close();
    dialogue.close();
    rewardScreen.close();
    statSheet.close?.();
    shop.clear();
    merchant.clear();
    director.clear();
    cave.clear();
    berries.clear();
    chests.clear();
    outdoor = null;
    wild = [];
    trainer = null;
    endT = -1;
    clientEndT = -1;
    clientHud = null;
    runBaies = 0;
    field.clear();
    const id = save.team[0];
    me = newMember(id, player.x, player.y, startLevel(save, id, BASE_TEAM_LEVEL), true);
    me.ally = null;
    me.dashMax = me.dashCharges = 1 + level(save, 'dash');
    me.canSwim = true;
    team = [me];
    active = 0;
    player = me;
    director.fade = 1;
    runHud.announce('En ligne', '#7ac0e8', 'RUN À PLUSIEURS');
  };

  net.onHost = (msg) => {
    if (msg.t === 'start') return clientStart();
    if (msg.t === 'camp') {
      // Le Repaire de l'hôte : on y arrive (première fois), ou il change autour de nous.
      const first = !hostCamp;
      hostCamp = { built: msg.built, dwellers: msg.dwellers, recruits: msg.recruits ?? [] };
      netEpoch = msg.epoch;
      // En fin de run, le Repaire de l'hôte arrive avant qu'on y rentre : la place est gardée pour enterCamp.
      campSpawn = msg.spawn[net.id] ?? null;
      if (mode !== 'camp') return;
      if (!first) {
        const at = awaitSpawn && campSpawn ? campSpawn : player;
        awaitSpawn = false;
        campSpawn = null;
        return enterCampKeep({ x: at.x, y: at.y, dir: player.dir });
      }
      campScreen.close();
      enterCamp();
      const at = msg.spawn[net.id];
      if (at) {
        player.x = player.prevX = at.x;
        player.y = player.prevY = at.y;
      }
      return;
    }
    if (msg.t === 'snap' && mode === 'camp') {
      if (!hostCamp || msg.epoch !== netEpoch) return;
      field.own = msg.own[net.id] ?? -1;
      field.apply(msg.actors, null);
      return;
    }
    if (mode !== 'run' || !me) return;
    if (msg.t === 'room') {
      clearNetScene();
      return clientRoom(msg);
    }
    if (msg.t === 'scene') {
      if (msg.epoch !== netEpoch) return;
      bank.define(msg.defs);
      hostScene = msg;
      return;
    }
    if (msg.t === 'dialogue') {
      dialogue.show(msg.speaker as Speaker, msg.text);
      return;
    }
    if (msg.t === 'loot') {
      // Le butin de la run, dans ma sauvegarde : je le retrouve en rejouant seul.
      for (const [r, n] of Object.entries(msg.res ?? {})) if (r in save.resources) save.resources[r as keyof typeof save.resources] += n;
      for (const [m, n] of Object.entries(msg.mats ?? {})) save.materials[m] = (save.materials[m] ?? 0) + n;
      for (const [it, n] of Object.entries(msg.items ?? {})) save.items[it] = Math.max(save.items[it] ?? 0, n);
      if (msg.shards) {
        save.shards += msg.shards;
        stats.shards += msg.shards;
      }
      if (msg.baies) earn(msg.baies);
      else writeSave(save);
      if (msg.text) runHud.notify({ title: 'Butin partagé', text: `${msg.text} pour ton Repaire`, color: 'var(--yel)' });
      return;
    }
    if (msg.t === 'hud') {
      (runHud as unknown as Record<string, (...args: unknown[]) => void>)[msg.k](...msg.args);
      return;
    }
    if (msg.t === 'end') {
      // Les Baies de la run, versées au Repaire de l'invité comme à l'hôte.
      net.inRun = false;
      clientEndT = 0;
      clientEnd = msg;
      if (msg.won) runHud.announce('Victoire !', '#ffd23f', 'MAÎTRE DE LA LIGUE');
      else runHud.toast('Fin de la run', `${msg.rooms} salle${msg.rooms > 1 ? 's' : ''} traversée${msg.rooms > 1 ? 's' : ''}`);
      return;
    }
    if (msg.t !== 'snap' || msg.epoch !== netEpoch) return;
    field.own = msg.own[net.id] ?? -1;
    // Mon Pokémon a évolué chez l'hôte : sa nouvelle planche.
    const mine = msg.actors.find((a) => a.n === field.own);
    if (mine && mine.s !== me.speciesId) {
      const self = me;
      self.speciesId = mine.s;
      void loadSheet(mine.s, PLAYER_ACTIONS).then((sh) => (self.sheet = sh));
      void loadInfo(mine.s).then((i) => (self.info = i));
    }
    if (mine && me.pokemon) me.pokemon.level = mine.lv;
    field.apply(msg.actors, me);
    combat.importStrikes(msg.strikes);
    for (const [k, args] of msg.fx) (fx as unknown as Record<string, (...a: unknown[]) => void>)[k]?.(...args);
    combat.shake = Math.max(combat.shake, msg.shake);
    const cd = msg.cd[net.id];
    if (cd) {
      cd[0].forEach((v, i) => (me!.atk.moveCd[i] = v));
      cd[1].forEach((v, i) => (me!.atk.moveCdMax[i] = v));
    }
    clientHud = msg.hud;
  };

  /** Invité : un pas. Je pilote mon Pokémon ; les autres suivent l'hôte. */
  const clientUpdate = (dt: number) => {
    time += dt;
    const sample = input.sample();
    if (me) {
      me.updatePlayer(dt, sample, world);
      if (sample.interact) pendingInteract = true;
      if (me.bonked) {
        fieldFx.puff(me.bonked.x, me.bonked.y);
        combat.addShake(0.06);
        me.bonked = null;
      }
      if (sample.move >= 0) pendingMove = sample.move;
      me.atk.tick(dt);
      combat.focus(me);
      if (++netStep % 2 === 0 || pendingMove >= 0 || pendingInteract) {
        let mx = sample.mx;
        let my = sample.my;
        if (Math.hypot(mx, my) < 0.5) {
          const a = (me.dir * Math.PI) / 4;
          mx = Math.sin(a);
          my = Math.cos(a);
        }
        net.send({ t: 'in', epoch: netEpoch, x: me.x, y: me.y, dir: me.dir, moving: me.moving, dashT: me.dashT, swimming: me.swimming, move: pendingMove, mx, my, interact: pendingInteract });
        pendingMove = -1;
        pendingInteract = false;
      }
    }
    field.update(dt);
    fx.update(dt);
    combat.shake = Math.max(0, combat.shake - dt * 2.2);
    combat.ringFlash = Math.max(0, combat.ringFlash - dt * 4);
    director.fade = clientHud?.fade ?? director.fade;
    if (clientEndT >= 0) {
      clientEndT += dt;
      director.fade = Math.min(1, clientEndT / 1.5);
      if (clientEndT >= 2.5 && !runSummary.open) {
        const end = clientEnd;
        clientEnd = null;
        const back = () => {
          input.flush();
          enterCamp();
        };
        if (!end?.sum) return back();
        // Le bilan de l'hôte, lu avec mon Pokémon (le seul que je connaisse ici), puis le Repaire.
        const sum = end.sum;
        const st = new RunStats();
        st.time = sum.time;
        st.kos = sum.kos;
        st.dealt = sum.dealt;
        st.taken = sum.taken;
        st.baies = end.baies;
        st.shards = sum.shards;
        st.champions.push(...sum.champions);
        const mine = me ?? player;
        const [dealt, taken] = sum.mem[net.id] ?? [0, 0];
        st.members.set(mine, { dealt, taken });
        clientEndT = -1;
        if (end.won) setTimeout(() => runSummary.open && audio.playMusic('halloffame'), 2300);
        else audio.playMusic('defeat');
        runSummary.show({ victory: end.won, rooms: end.rooms, act: sum.act, biome: sum.biome, color: sum.color, champion: { name: sum.champion } as Champion, boons: sum.boons, team: [mine], stats: st }, back);
      }
      return;
    }
    const all = me ? [me, ...field.list()] : field.list();
    footprints.update(dt, all, world);
    fieldFx.update(dt, all, world);
    if (opts.particles) {
      particles.update(dt, indoorRoom() ? null : world.biome.ambiance.particles, { x: renderer.camX, y: renderer.camY, w: renderer.viewW, h: renderer.viewH });
      skyParticles.update(dt, WEATHERS[weatherNow()].particles, { x: renderer.camX, y: renderer.camY, w: renderer.viewW, h: renderer.viewH });
    }
  };

  renderer.resize(opts);
  addEventListener('resize', () => renderer.resize(opts));
  // iOS annonce la rotation avant d'avoir les nouvelles dimensions : on recadre une seconde fois.
  addEventListener('orientationchange', () => setTimeout(() => renderer.resize(opts), 250));
  // Le panneau et la sauvegarde parlent de la même équipe.
  syncPanelTeam();
  // Le menu principal d'abord, par-dessus le Repaire qui se charge derrière (figé : paused()).
  // enterCamp n'ouvre pas le questionnaire tant qu'il est là : « Jouer » le fait. Sauté sous
  // ?debug, pour les tests automatisés.
  // Un lien d'invitation (QR code d'un ami, net/invite.ts) : on garde son code ; il se rejoint depuis
  // le menu, ou une fois le premier Pokémon libéré pour qui n'a encore rien (enterCamp).
  let invite = readInvite();
  if (!DEBUG)
    titleScreen.show(
      {
        play: () => {
          input.flush();
          audio.playMusic('camp');
          askStarter();
        },
        online: () => {
          input.flush();
          audio.playMusic('camp');
          openOnline();
        },
        join: (code) => {
          input.flush();
          audio.playMusic('camp');
          joinInvite(code);
        },
        settings: (tab, back) =>
          settingsMenu.show(() => {
            input.flush();
            back();
          }, tab),
      },
      save.started,
      invite,
    );
  enterCamp();
  // L'écran-titre a sa musique (Title.ogg) ; quitter le menu lance celle du Repaire.
  if (titleScreen.open) audio.playMusic('title');

  let time = 0;
  let fps = 60;
  const update = (dt: number) => {
    // Départ sous l'arche : le temps ralentit, puis la run commence.
    if (departing) {
      departing.t += dt;
      if (departing.t >= DEPART_TIME) {
        departing = null;
        camp.departGlow = 0;
        campCtx.depart();
        return;
      }
      camp.departGlow = departGlow();
      dt *= DEPART_SLOW;
    }
    // Grotte, boutique, Repaire : temps clair ; la salle retrouve son ciel en ressortant.
    setWeather(weatherNow());
    // En ligne : l'hôte décrit le terrain aux invités, même figé derrière un écran.
    if (net.role === 'host' && net.inRun && mode === 'run' && ++netStep % SNAP_EVERY === 0) {
      sendSnap();
      // La scène (décor, portes, récompense) change moins vite : deux fois moins souvent.
      if (netStep % (SNAP_EVERY * 2) === 0) sendScene();
    }
    // Au Repaire, en ligne : chacun se promène chez l'hôte, même derrière un écran ouvert.
    if (net.role === 'host' && mode === 'camp' && net.guests.length) {
      syncVisitors();
      for (const v of visitors) driveRemote(v, dt);
      if (++netStep % SNAP_EVERY === 0) sendCampSnap();
    }
    if (net.role === 'client' && mode === 'camp' && hostCamp) {
      field.update(dt);
      if (++netStep % 2 === 0) net.send({ t: 'in', epoch: netEpoch, x: player.x, y: player.y, dir: player.dir, moving: player.moving, dashT: player.dashT, swimming: player.swimming, move: -1, mx: 0, my: 0 });
    }
    if (net.role === 'client' && mode === 'run') {
      if (!settingsMenu.open && !statSheet.open) clientUpdate(dt);
      return;
    }
    // Écran de récompense ouvert : le jeu se fige (BoutiqueScreen met l'arbre en pause).
    if (paused()) return;
    // Hitstop : toute la simulation se fige (les touches pressées restent en attente).
    if (combat.hitstop > 0) {
      combat.hitstop = Math.max(0, combat.hitstop - dt);
      return;
    }
    time += dt;
    // Scène du prologue en cours : tout attend qu'elle finisse.
    if (playScene(dt)) return;
    if (mode === 'run' && endT < 0 && !dialogue.open) stats.time += dt;
    const sample = input.sample();
    if (sample.swap && player.deathT < 0 && !player.trapped) {
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
      if (c.remote) {
        driveRemote(c, dt);
        continue;
      }
      const go = c.ally?.update(dt, player, wild, world, combat) ?? { mx: 0, my: 0 };
      c.updatePlayer(dt, { mx: go.mx, my: go.my, dash: false, move: -1, interact: false, ult: false, swap: false }, world);
    }
    for (const a of wild) a.updateWild(dt, world, wildRng);
    combat.update(dt, sample, player, wild, world, allies.filter((c) => c.deathT < 0));
    // Les attaques des invités, reçues depuis le dernier pas.
    for (const r of remoteMoves.splice(0)) if (team.includes(r.a)) combat.remoteAttack(r.a, r.slot, r.mx, r.my, wild);
    // Un membre K.O. reste couché là où il est tombé (TeamMember._play_faint_anim) : on peut le ranimer.
    // Ceinture de Rappels : un membre qui tombe se relève aussitôt à moitié de ses PV, tant qu'il en reste dans la réserve.
    for (const m of team) {
      if (m.deathT < REVIVE_AT || revivesFor(m) <= 0 || endT >= 0 || !m.pokemon) continue;
      const left = --revives;
      m.getUp();
      m.pokemon.status = null;
      m.pokemon.hp = Math.max(1, Math.round(m.pokemon.maxHp * 0.5));
      runHud.notify({ title: 'Rappel', text: `${m.pokemon.name} se relève — ${left} Rappel${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''} pour l'équipe.`, art: m.speciesId, color: 'var(--yel)' });
    }
    for (const m of team) if (m.deathT >= 0 && !m.downed) m.lieDown();
    separate();
    // En grotte, c'est elle qui mène ; la salle du dehors attend, figée.
    // En ligne, les invités debout (et ceux qui viennent d'appuyer sur E) comptent aussi pour les portes et la récompense.
    const guests = net.inRun ? team.filter((m) => m.remote && m.deathT < 0) : [];
    const claimers = guests.filter((m) => remoteInteract.has(m));
    if (mode === 'run') {
      if (cave.active) cave.update(dt, sample, world, run, player, wild);
      else director.update(dt, sample, world, run, player, wild, guests, claimers);
    }
    trainer?.update(dt, world, Math.random);
    // L'Aimant à Baies d'Alakazam attire les baies tombées.
    // En ligne : les invités ramassent aussi les baies tombées et ouvrent les coffres (avant l'hôte,
    // dont l'invite « [E] » doit rester la sienne). Le gain revient à tous (shareLoot).
    if (outside() && net.inRun) {
      for (const m of team) {
        if (!m.remote || m.deathT >= 0) continue;
        berries.update(0, m, false);
        chests.update(0, { mx: 0, my: 0, dash: false, move: -1, interact: remoteInteract.delete(m), ult: false, swap: false }, m, run);
      }
    }
    if (outside()) berries.update(dt, player, level(save, 'magnet') > 0);
    if (outside()) hazards.update(dt, world, team);
    if (outside()) chests.update(dt, sample, player, run);
    else chests.hide();
    shop.update(dt, sample, player, world);
    if (outside()) merchant.update(dt, sample, player);
    else merchant.hide();
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
    } else if (player.deathT >= 0 && endT < 0 && relay < 0 && revivesFor(player) <= 0 && !team.some((m) => m.remote && m.deathT < 0)) defeat();
    if (endT >= 0) {
      endT += dt;
      // Le voile tombe pendant la dernière demi-seconde, la nouvelle run le relève.
      director.fade = Math.max(director.fade, Math.min(1, (endT - (endDelay - 0.5)) / 0.5));
      // Voile tombé : le bilan de la run, puis le Repaire quand on le ferme.
      if (endT >= endDelay && !runSummary.open) {
        // Victoire : la musique se tait sous le jingle du badge, comme à la remise d'un badge.
        if (runWon) {
          audio.playMusic(null);
          sfx('victory');
          // Le jingle d'abord, puis le Panthéon sous le bilan ; une défaite s'accompagne d'une berceuse.
          setTimeout(() => runSummary.open && audio.playMusic('halloffame'), 2300);
        } else audio.playMusic('defeat');
        netEnd();
        runSummary.show(
          {
            victory: runWon,
            rooms: runWon ? run.room + 1 : run.room,
            act: run.act,
            biome: BIOMES[run.biome].name,
            color: BIOME_COLOR[run.biome],
            champion: run.champion,
            boons: run.boons.owned.size,
            team,
            stats,
          },
          () => {
            input.flush();
            opts.seed += 1;
            saveOptions(opts);
            enterCamp();
          },
        );
      }
    }

    footprints.update(dt, [...team, ...wild], world);
    fieldFx.update(dt, [...team, ...wild], world);
    if (opts.particles) {
      particles.update(dt, indoorRoom() ? null : world.biome.ambiance.particles, { x: renderer.camX, y: renderer.camY, w: renderer.viewW, h: renderer.viewH });
      skyParticles.update(dt, WEATHERS[weatherNow()].particles, { x: renderer.camX, y: renderer.camY, w: renderer.viewW, h: renderer.viewH });
    }
  };

  /** Invité en ligne : le terrain de l'hôte, vu depuis mon Pokémon. */
  const drawClient = (alpha: number, frameDt: number, self: Actor) => {
    const extras = (hostScene?.extras ?? []).map(([y, cmds]) => ({ y, draw: (b: CanvasRenderingContext2D, camX: number, camY: number, k: number) => replay(b, cmds, camX, camY, k, bank) }));
    renderer.draw(world, self, [self, ...field.list()], particles, footprints, fieldFx, combat, director, extras, opts, alpha, time, { weather: weatherNow(), particles: skyParticles });
    dialogue.update(frameDt);
    document.body.classList.toggle('talking', dialogue.open);
    document.body.classList.toggle('modal', paused());
    runHud.setBoss(clientHud?.boss ?? null, frameDt);
    const proj = renderer.projector();
    netBadge.setCamp(false);
    placeNetLabels(proj);
    fx.placeNumbers(proj);
    combat.focus(self);
    // L'équipe du HUD : moi et les autres joueurs (retour de test : « je ne vois pas mon équipe » en tant qu'invité).
    hud.update(frameDt, self, combat, field.enemies(), proj, time, [self, ...field.list().filter((a) => a.remote === 'net')]);
    runHud.setStock(null);
    runHud.setRevives(null);
    runHud.update(frameDt, clientHud?.place ?? 'En ligne', clientHud?.money ?? 0, director.fade);
  };

  startLoop(update, (alpha, frameDt) => {
    if (net.role === 'client' && mode === 'run' && me) return drawClient(alpha, frameDt, me);
    const extras = [...runExtras(), ...camp.extras(time)];
    // Au Repaire, en ligne : les autres joueurs qui s'y promènent.
    const others = mode !== 'camp' ? [] : net.role === 'host' ? visitors : net.role === 'client' && hostCamp ? field.list() : [];
    renderer.draw(world, player, [...team, ...others, ...wild, ...shop.npcs, ...merchant.npcs, ...camp.npcs, ...cave.npcs], particles, footprints, fieldFx, combat, director, extras, opts, alpha, time, { weather: weatherNow(), particles: skyParticles });
    dialogue.update(frameDt);
    document.body.classList.toggle('talking', dialogue.open);
    document.body.classList.toggle('modal', paused());
    // Barre du Pokémon de champion en jeu (un à la fois : un par vague).
    runHud.setBoss(bossBar(), frameDt);
    const proj = renderer.projector();
    netBadge.setCamp(mode === 'camp');
    fx.placeNumbers(proj);
    director.placeLabels(proj);
    shop.placeLabels(proj);
    merchant.placeLabels(proj);
    camp.placeLabels(proj);
    hud.update(frameDt, player, combat, wild, proj, time, team);
    // L'équipe à gauche, au Repaire aussi (retour de test) : les cartes de ceux qui partiront, tenues à jour.
    if (mode === 'camp') refreshCampTeam();
    else hud.setCampTeam(null);
    document.body.classList.toggle('net-on', mode === 'camp' && net.active);
    // Au Repaire, le stock (ressources, Éclats) à côté des Baies ; en run, les Rappels de toute l'équipe à côté des ₽.
    runHud.setStock(mode === 'camp' ? save : null);
    runHud.setRevives(mode === 'run' && level(save, 'revives') > 0 ? revives : null);
    // Au Repaire, les places : combien de Pokémon il loge sur combien, et ceux qui attendent qu'on
    // leur parle (retour de test : « avoir un moyen de voir combien t'as de place dans ton hub »).
    if (mode === 'camp') runHud.update(frameDt, hostCamp ? REPAIRE.name : campPlaces(), save.baies, departing ? Math.max(0, Math.min(1, (departing.t - 0.55 * DEPART_TIME) / (0.45 * DEPART_TIME))) : 0, 'Baies');
    else runHud.update(frameDt, placeName(), run.money, Math.max(director.fade, cave.fade));
    if (frameDt > 0) fps += (1 / frameDt - fps) * 0.05;
    const name = player.info?.name ?? '…';
    panel.setStatus(
      `${mode === 'camp' ? `Repaire · ${save.baies} Baies · prochaine run ${opts.seed} · ` : ''}Run ${run.seed} · salle ${run.room + 1}/28 · ${BIOMES[run.biome].name}${world.townStyle ? ` « ${world.townStyle} »` : ''} · ${name} · vue ${renderer.viewW}×${renderer.viewH} px (${(renderer.viewW / TILE).toFixed(1)}×${(renderer.viewH / TILE).toFixed(1)} cases) · ×${renderer.scale} · ${Math.round(fps)} i/s`,
    );
  }, () => net.active);

  // Objet de debug, uniquement derrière ?debug (pas de globale sinon).
  if (DEBUG) {
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
        /** Jeu en ligne : la scène reçue (invité), le décor de la salle (hôte), la session. */
        netDebug: () => ({ scene: hostScene, extras: runExtras().length, net, field }),
        campScreen,
        save,
        enterCamp,
        newRun,
        get mode() {
          return mode;
        },
        renderer,
        combat,
        hazards,
        opts,
        /** Lance le départ en run (ralenti et halo), comme en passant l'arche. */
        startDeparture,
        /** Les écrans, pour les ouvrir à la main (vérifier la DA sans jouer une salle entière). */
        ui: { hud, runHud, rewardScreen, evolutionScreen, dialogue, bossPreview, speaker },
        /** Saute à une salle de la run (0 à 27), PV et dons conservés. */
        goto: (room: number) => {
          run.room = room;
          run.special = null;
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
