// Captures d'écran du jeu pour les notes de version (src/data/patchnotes.ts, PatchImage).
//
//   npm run dev                                  (dans un autre terminal)
//   node scripts/shoot.mjs                       (toutes les scènes)
//   node scripts/shoot.mjs pokedex-mega          (une seule, par son nom)
//   node scripts/shoot.mjs --url http://localhost:5175
//
// Pilote un Chrome sans fenêtre par son protocole de débogage (CDP, WebSocket de Node), avec un
// profil neuf à chaque fois : la vraie sauvegarde du navigateur n'est jamais touchée. Chaque scène
// pose sa sauvegarde, ouvre une page (souvent ?debug, pour `window.pokhades`), met le jeu en
// scène, attend, et écrit public/game/patchnotes/<nom>.webp (1280 × 720, WebP qualité 82 : une
// centaine de Ko).
//
// Pour une nouveauté : ajouter une scène ci-dessous, la lancer, puis la citer dans la note
// (`{ src: '/game/patchnotes/<nom>.webp', caption: '…', kind: 'shot' }`).

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let OUT = new URL('../public/game/patchnotes/', import.meta.url).pathname;
const W = 1280;
const H = 720;

const args = process.argv.slice(2);
const urlAt = args.indexOf('--url');
const BASE = (urlAt >= 0 ? args.splice(urlAt, 2)[1] : 'http://localhost:5173').replace(/\/$/, '');
// --out DOSSIER : écrire ailleurs (captures de contrôle, qui n'ont pas à partir dans le jeu).
const outAt = args.indexOf('--out');
if (outAt >= 0) OUT = args.splice(outAt, 2)[1];
const only = new Set(args);

/** Une partie commencée, de quoi montrer un Repaire vivant. */
const SAVE = {
  version: 3,
  started: true,
  prologue: 'done',
  baies: 2480,
  wins: 6,
  beaten: ['Pierre', 'Ondine'],
  // Tout le Pokédex rencontré : des fiches et des illustrations plutôt que des silhouettes.
  seen: Array.from({ length: 1025 }, (_, i) => i + 1),
  // Les écrans s'ouvrent sans la présentation du gardien.
  intros: ['team', 'lore', 'moves', 'upgrades', 'items', 'online', 'missions', 'quests', 'builder', 'garden', 'craft', 'feats'],
};

/**
 * Les scènes. `path` : la page ; `save` : la sauvegarde posée avant (null : partie neuve) ;
 * `run` : le code joué dans la page pour la mise en scène (async) ; `css` : des règles en plus (masquer
 * un bandeau) ; `wait` : ms avant la capture.
 */
const SCENES = [
  {
    name: 'compte-ecran',
    path: '/',
    save: SAVE,
    run: `
      await until(() => document.querySelector('.title-item'));
      await sleep(1200);
      [...document.querySelectorAll('.title-item')].find((b) => b.innerText.startsWith('COMPTE')).click();
      await until(() => document.querySelector('.acct-input'));
      document.activeElement?.blur();`,
    wait: 900,
  },
  {
    name: 'pokedex-mega',
    path: '/?debug',
    save: SAVE,
    run: `
      await until(() => window.pokhades);
      pokhades.talk('team');
      await until(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Pokédex'));
      [...document.querySelectorAll('button')].find((b) => b.textContent === 'Pokédex').click();
      await until(() => [...document.querySelectorAll('.cs-dex-filters button')].find((b) => b.textContent.trim() === 'Méga'));
      [...document.querySelectorAll('.cs-dex-filters button')].find((b) => b.textContent.trim() === 'Méga').click();
      // La première fiche (Salamèche) s'ouvre d'elle-même, avec sa ligne Méga-Dracaufeu.`,
    wait: 1200,
  },
  {
    // Les nouvelles lignées dans leur biome : une run au Village (dégagé : en Forêt, les arbres
    // les cachaient) par temps clair, et quatre sauvages des nouvelles lignées (Abra, Tarsal, Lixy,
    // Wattouat) posés autour du joueur, au centre de la place. Le bandeau du nom de zone est masqué.
    name: 'faune-village',
    path: '/?debug',
    save: SAVE,
    css: '.run-title { display: none !important; }',
    run: `
      await until(() => window.pokhades);
      Object.assign(pokhades.opts, { biome: 'village', weather: 'clear' });
      pokhades.newRun();
      await until(() => pokhades.mode === 'run' && pokhades.world);
      await sleep(1500);
      const p = pokhades.player, hub = pokhades.world.hub;
      p.x = p.prevX = hub.x;
      p.y = p.prevY = hub.y;
      // Les sauvages de la salle s'écartent : on ne garde que ceux qu'on veut montrer.
      pokhades.wild.length = 0;
      const mons = [pokhades.spawn(63, 14, -2.6, -1.2), pokhades.spawn(280, 14, 2.4, -1.4), pokhades.spawn(403, 14, 2.8, 1.2), pokhades.spawn(179, 14, -2.4, 1.4)];
      // Leurs planches se chargent à part : on attend qu'elles soient là.
      await until(() => mons.every((m) => m.pokemon));
      await sleep(900);`,
    wait: 200,
  },
  {
    // Contrôle : le HUD de run et ses icônes (notifications de météo, de pacte, de Nuzlocke, d'exploit,
    // de Baies et de Route Victoire ; chrono du Défi ; as du champion ; jauge d'ultime d'Électhor).
    name: 'ctl-hud',
    control: true,
    keepNotifs: true,
    path: '/?debug',
    save: SAVE,
    css: '.run-title { display: none !important; }',
    run: `
      await until(() => window.pokhades);
      Object.assign(pokhades.opts, { biome: 'prairie', weather: 'clear' });
      pokhades.newRun();
      await until(() => pokhades.mode === 'run' && pokhades.team[0]?.pokemon);
      await sleep(1500);
      const h = pokhades.ui.runHud;
      // Les notifications vont par cinq au plus : les six météos, la dernière chasse la première.
      for (const [title, icon] of [['Temps clair', 'clear'], ['Soleil ardent', 'sun'], ['Pluie', 'rain'], ['Tempête de sable', 'sand'], ['Grêle', 'hail'], ['Brouillard', 'fog']])
        h.notify({ title, text: 'Icône : ' + icon, icon });
      h.setTimer(83, '5 / 12 sauvages');
      pokhades.run.boons.ult = 'electhor';
      pokhades.run.boons.ultGauge = 9999;`,
    wait: 800,
  },
  {
    // Contrôle : l'écran des dons (icônes de menu des légendaires ; les deux légendaires d'un don duo).
    name: 'ctl-dons',
    control: true,
    path: '/?debug',
    save: SAVE,
    css: '.run-title { display: none !important; }',
    run: `
      await until(() => window.pokhades);
      Object.assign(pokhades.opts, { biome: 'prairie', weather: 'clear' });
      pokhades.newRun();
      await until(() => pokhades.mode === 'run' && pokhades.team[0]?.pokemon);
      await sleep(1200);
      // Sulfura, avec trois dons duo (deux légendaires chacun).
      const offer = { donor: 'sulfura', cards: [{ id: 'duo_firestorm', rarity: 1, result: 1 }, { id: 'duo_eruption', rarity: 2, result: 2 }, { id: 'duo_winter', rarity: 0, result: 0 }] };
      pokhades.ui.rewardScreen.showBoons(offer, () => {}, () => {}, pokhades.team.map((a) => a.pokemon));
      // Les cartes entrent l'une après l'autre.
      await until(() => document.querySelectorAll('.rw-card').length >= 2);
      await sleep(2500);`,
    wait: 300,
  },
  {
    // Contrôle : la hutte de Porygon, onglet Équipe (poids de l'équipe, de chacun, des attaques). Pas
    // dans les notes : prise seulement si on la nomme (node scripts/shoot.mjs --out /tmp equipe).
    name: 'equipe',
    control: true,
    path: '/?debug',
    save: SAVE,
    run: `
      await until(() => window.pokhades);
      pokhades.talk('team');
      await until(() => document.querySelector('.cs-weight'));`,
    wait: 1000,
  },
];

// ── Chrome et son protocole ─────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Chrome choisit lui-même un port libre (--remote-debugging-port=0) et l'écrit dans son profil
 * (DevToolsActivePort) une fois prêt : jusqu'à une demi-minute sur macOS.
 */
async function cdp() {
  const file = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 600; i++) {
    if (existsSync(file)) {
      const [port] = readFileSync(file, 'utf8').split('\n');
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        const page = list.find((t) => t.type === 'page');
        if (page) return page.webSocketDebuggerUrl;
      } catch {
        // Le port est écrit, le serveur pas encore tout à fait prêt.
      }
    }
    await sleep(200);
  }
  throw new Error('Chrome ne répond pas');
}

function client(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const waiters = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { ok, ko } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? ko(new Error(m.error.message)) : ok(m.result);
    } else if (m.method) {
      for (const w of waiters.splice(0)) (w.method === m.method ? w.ok : () => waiters.push(w))(m.params);
    }
  };
  const ready = new Promise((r) => (ws.onopen = r));
  return {
    ready,
    send: (method, params = {}) =>
      new Promise((ok, ko) => {
        pending.set(++id, { ok, ko });
        ws.send(JSON.stringify({ id, method, params }));
      }),
    once: (method) => new Promise((ok) => waiters.push({ method, ok })),
    close: () => ws.close(),
  };
}

/** Joue du code dans la page, avec `sleep` et `until(test)` sous la main. */
async function evaluate(c, code) {
  const expression = `(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const until = async (f, ms = 15000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('attente trop longue : ' + f); await sleep(100); } };
    ${code}
  })()`;
  const r = await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}

async function go(c, path) {
  const loaded = c.once('Page.loadEventFired');
  await c.send('Page.navigate', { url: BASE + path });
  await loaded;
}

// ── Les captures ────────────────────────────────────────────────────────

const profile = mkdtempSync(join(tmpdir(), 'pokhades-shoot-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`,
  '--hide-scrollbars',
  '--mute-audio',
  '--no-first-run',
  '--no-default-browser-check',
  // Sans ces réglages, Chrome sans fenêtre restait parfois bloqué au démarrage sur macOS (accès au
  // trousseau, mises à jour de composants) et n'ouvrait jamais son port de débogage.
  '--use-mock-keychain',
  '--password-store=basic',
  '--disable-gpu',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-component-update',
  'about:blank',
  // Chrome sans écran se plaint en boucle sur sa sortie d'erreur : non lue, elle remplit le tuyau et
  // le bloque au démarrage.
], { stdio: 'ignore' });
let failed = 0;
try {
  const c = client(await cdp());
  await c.ready;
  await c.send('Page.enable');
  await c.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  mkdirSync(OUT, { recursive: true });
  for (const s of SCENES) {
    if (only.size ? !only.has(s.name) : s.control) continue;
    try {
      // La sauvegarde se pose sur l'origine du jeu, avant d'ouvrir la page de la scène.
      await go(c, '/');
      await evaluate(c, `localStorage.clear(); ${s.save ? `localStorage.setItem('pokhades-save', ${JSON.stringify(JSON.stringify(s.save))});` : ''}`);
      await go(c, s.path);
      // Ni le panneau de test (outil de DA du serveur de dev) ni les notifications par-dessus la scène.
      const css = `#panel${s.keepNotifs ? '' : ', .notif'} { display: none !important; } ${s.css ?? ''}`;
      await evaluate(c, `const st = document.createElement('style'); st.textContent = ${JSON.stringify(css)}; document.head.append(st); await document.fonts.ready;` + s.run);
      await sleep(s.wait ?? 800);
      const shot = await c.send('Page.captureScreenshot', { format: 'webp', quality: 82 });
      const file = join(OUT, `${s.name}.webp`);
      writeFileSync(file, Buffer.from(shot.data, 'base64'));
      console.log(`✓ ${s.name} (${Math.round((shot.data.length * 3) / 4 / 1024)} Ko)`);
    } catch (err) {
      failed++;
      console.error(`✗ ${s.name} : ${err.message}`);
    }
  }
  c.close();
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
