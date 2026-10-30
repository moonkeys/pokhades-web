// Page de config du bestiaire (config.html) : le serveur de dev lui donne le
// catalogue des espèces — celles que le jeu embarque, et toutes celles du
// Pokédex qu'on peut encore ajouter (dépôt Godot, ou SpriteCollab et PokéAPI
// via scripts/remote.ts) —, leurs fiches PokéAPI, leurs planches PMD, et
// enregistre ses changements dans src/data/bestiary.json. Rien de tout ça
// n'existe au build : c'est un outil de dev.
//
// Ce module ne doit pas importer src/data : Vite redémarre le serveur quand
// une dépendance de vite.config.ts change, et bestiary.json change à chaque
// enregistrement.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { cacheDir, COLLAB, fetchRemote, speciesIndex } from './remote';

const API = '/__bestiary';
const ARTWORK = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork';
/** Événement HMR envoyé quand bestiary.json change : le jeu se recharge, la page de config se resynchronise. */
export const BESTIARY_EVENT = 'bestiary:changed';

const pad4 = (id: number) => String(id).padStart(4, '0');

interface AnimEntry {
  fw: number;
  fh: number;
  durations: number[];
  copyOf: string | null;
}

/** AnimData.xml lu par expressions régulières, comme import-assets.ts et PMDSprites.gd. */
function parseAnimData(xml: string): Map<string, AnimEntry> {
  const anims = new Map<string, AnimEntry>();
  for (const [, block] of xml.matchAll(/<Anim>([\s\S]*?)<\/Anim>/g)) {
    const tag = (t: string) => block.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1] ?? null;
    const name = tag('Name');
    if (!name) continue;
    anims.set(name, {
      fw: Number(tag('FrameWidth') ?? 0),
      fh: Number(tag('FrameHeight') ?? 0),
      durations: [...block.matchAll(/<Duration>(\d+)<\/Duration>/g)].map((m) => Number(m[1])),
      copyOf: tag('CopyOf'),
    });
  }
  return anims;
}

/** Suit les <CopyOf> jusqu'à l'animation qui a sa propre planche. */
function resolveAnim(anims: Map<string, AnimEntry>, name: string): [string, AnimEntry] | null {
  for (let hop = 0; hop < 4; hop++) {
    const a = anims.get(name);
    if (!a) return null;
    if (!a.copyOf) return [name, a];
    name = a.copyOf;
  }
  return null;
}

function readText(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function readJson<T>(file: string): T | null {
  const text = readText(file);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * JSON lisible à la main : les listes courtes (biomes, attaques) tiennent sur
 * une ligne, les répliques et les histoires s'empilent.
 */
function format(value: unknown, indent = ''): string {
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    const flat = `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
    if (value.every((v) => typeof v === 'number') || flat.length + indent.length <= 100) return flat;
    return `[\n${value.map((v) => inner + format(v, inner)).join(',\n')}\n${indent}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return '{}';
    return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${format(v, inner)}`).join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value);
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

/** Ne garde que ce que le jeu sait lire ; les fiches vides disparaissent. */
function clean(input: unknown): { biomes: Record<string, number[]>; species: Record<string, Record<string, unknown>> } | null {
  if (!input || typeof input !== 'object') return null;
  const { biomes, species } = input as { biomes?: unknown; species?: unknown };
  if (!biomes || typeof biomes !== 'object') return null;
  const outBiomes: Record<string, number[]> = {};
  for (const [k, list] of Object.entries(biomes)) {
    if (!Array.isArray(list)) return null;
    outBiomes[k] = [...new Set(list.filter((n): n is number => Number.isInteger(n) && n > 0))];
  }
  const outSpecies: Record<string, Record<string, unknown>> = {};
  for (const [k, raw] of Object.entries(species && typeof species === 'object' ? species : {})) {
    if (!/^\d+$/.test(k) || !raw || typeof raw !== 'object') continue;
    const s = raw as Record<string, unknown>;
    const sheet: Record<string, unknown> = {};
    if (typeof s.persona === 'string' && s.persona) sheet.persona = s.persona;
    const lines = strings(s.lines).map((l) => l.trim()).filter(Boolean);
    if (lines.length) sheet.lines = lines;
    if (typeof s.story === 'string' && s.story.trim()) sheet.story = s.story.trim();
    const moves = [...new Set(strings(s.moves))].slice(0, 4);
    if (moves.length) sheet.moves = moves;
    if (Object.keys(sheet).length) outSpecies[k] = sheet;
  }
  return { biomes: outBiomes, species: outSpecies };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown, type = 'application/json; charset=utf-8') {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-store');
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const MIME: Record<string, string> = { '.png': 'image/png', '.xml': 'text/xml; charset=utf-8', '.json': 'application/json; charset=utf-8' };

interface PokemonJson {
  name_fr?: string;
  name_en?: string;
  types?: string[];
  stats?: Record<string, number>;
  height_m?: number;
  weight_kg?: number;
  learnable_moves?: string[];
  level_up_moves?: { level: number; name: string }[];
}

export function bestiaryServer(): Plugin {
  let root = '';
  let file = '';
  let web = '';
  let godot: string | null = null;
  let cache = '';
  const collabXml = new Map<number, Promise<string | null>>();

  /** URL d'un fichier PMD : la copie du jeu, sinon celle du dépôt Godot, sinon SpriteCollab. */
  const pmdUrl = (id: number, name: string): { url: string; src: 'jeu' | 'godot' | 'collab' } => {
    const rel = `pmd/${pad4(id)}/${name}`;
    if (fs.existsSync(path.join(web, 'data', rel))) return { url: `/game/data/${rel}`, src: 'jeu' };
    if (godot && fs.existsSync(path.join(godot, 'data', rel))) return { url: `${API}/godot/${rel}`, src: 'godot' };
    return { url: `${COLLAB}/sprite/${pad4(id)}/${name}`, src: 'collab' };
  };
  /** Un fichier de data/ : la copie du jeu, sinon le dépôt Godot, sinon le cache de remote.ts. */
  const dataFile = (rel: string) => [path.join(web, 'data', rel), ...(godot ? [path.join(godot, 'data', rel)] : []), path.join(cache, 'data', rel)].find((f) => fs.existsSync(f)) ?? null;
  const localXml = (id: number) => {
    const f = dataFile(`pmd/${pad4(id)}/AnimData.xml`);
    return f ? readText(f) : null;
  };
  const pokemonJson = (id: number) => {
    const f = dataFile(`pokeapi/pokemon/${id}.json`);
    return f ? readJson<PokemonJson>(f) : null;
  };

  /**
   * Toutes les espèces qui ont une planche PMD (jeu ou dépôt Godot) ou une
   * fiche PokéAPI, plus tout le Pokédex national (index de remote.ts ; sans
   * réseau au premier lancement, on s'en passe).
   */
  async function catalog() {
    const index = (await speciesIndex(cache)) ?? {};
    const ids = new Set<number>(Object.keys(index).map(Number));
    const scan = (dir: string, needsPmd: boolean) => {
      if (!fs.existsSync(dir)) return;
      for (const f of fs.readdirSync(dir)) {
        const id = parseInt(f, 10);
        // Les fiches PokéAPI au-delà de 9000 sont des Fakemon de test, sans planche.
        if (id > 0 && (needsPmd || id < 9000)) ids.add(id);
      }
    };
    for (const base of [path.join(web, 'data'), ...(godot ? [path.join(godot, 'data')] : [])]) {
      scan(path.join(base, 'pmd'), true);
      scan(path.join(base, 'pokeapi/pokemon'), false);
    }
    const species = [...ids]
      .sort((a, b) => a - b)
      .map((id) => {
        const d = pokemonJson(id);
        const xml = localXml(id);
        const walk = xml ? parseAnimData(xml).get('Walk') : undefined;
        const known = index[id];
        // Sans planche à portée de main, la vignette est le portrait SpriteCollab.
        const icon = walk ? { url: pmdUrl(id, 'Walk-Anim.png').url, fw: walk.fw, fh: walk.fh } : known ? { url: `${COLLAB}/portrait/${pad4(id)}/Normal.png`, fw: 40, fh: 40 } : null;
        return {
          id,
          name: d?.name_fr ?? known?.name ?? `#${id}`,
          en: d?.name_en ?? known?.en ?? '',
          types: d?.types ?? known?.types ?? [],
          stats: d?.stats ?? {},
          heightM: d?.height_m,
          weightKg: d?.weight_kg,
          imported: fs.existsSync(path.join(web, 'data/pmd', pad4(id), 'AnimData.xml')),
          godot: !!godot && fs.existsSync(path.join(godot, 'data/pmd', pad4(id), 'AnimData.xml')),
          collab: !!known?.sprites,
          walk: icon,
        };
      });
    const moveDir = path.join(web, 'data/pokeapi/move');
    const webMoves = fs.existsSync(moveDir) ? fs.readdirSync(moveDir).map((f) => f.replace(/\.json$/, '')) : [];
    return { godot, species, webMoves };
  }

  /** Fiche complète : PokéAPI, toutes les animations PMD et les fiches de toutes les attaques apprenables. */
  async function detail(id: number) {
    // Espèce que ni le jeu ni le dépôt Godot ne connaissent : sa fiche vient de PokéAPI (en cache ensuite).
    if (!pokemonJson(id)) await fetchRemote(cache, `data/pokeapi/pokemon/${id}.json`);
    const d = pokemonJson(id);
    let xml = localXml(id);
    if (!xml) {
      let pending = collabXml.get(id);
      if (!pending) {
        pending = fetch(`${COLLAB}/sprite/${pad4(id)}/AnimData.xml`)
          .then((r) => (r.ok ? r.text() : null))
          .catch(() => null);
        collabXml.set(id, pending);
      }
      xml = await pending;
    }
    const parsed = xml ? parseAnimData(xml) : new Map<string, AnimEntry>();
    const anims = [...parsed.keys()].flatMap((name) => {
      const hit = resolveAnim(parsed, name);
      if (!hit) return [];
      const [sheet, a] = hit;
      return [{ name, file: sheet, fw: a.fw, fh: a.fh, durations: a.durations, ...pmdUrl(id, `${sheet}-Anim.png`) }];
    });
    // Les attaques apprises par niveau doivent s'afficher : celles qui manquent sont tirées de PokéAPI.
    // Les autres (une centaine parfois) restent sans fiche ici ; l'import les tirera si on les impose.
    await Promise.all((d?.level_up_moves ?? []).filter((m) => !dataFile(`pokeapi/move/${m.name}.json`)).map((m) => fetchRemote(cache, `data/pokeapi/move/${m.name}.json`)));
    const names = new Set([...(d?.learnable_moves ?? []), ...(d?.level_up_moves ?? []).map((m) => m.name)]);
    const moves: Record<string, unknown> = {};
    for (const name of names) {
      const f = dataFile(`pokeapi/move/${name}.json`);
      const fiche = f ? readJson<Record<string, unknown>>(f) : null;
      if (fiche) moves[name] = { ...fiche, inGame: f === path.join(web, 'data/pokeapi/move', `${name}.json`) };
    }
    const art = fs.existsSync(path.join(web, 'artwork', `${id}.png`))
      ? `/game/artwork/${id}.png`
      : godot && fs.existsSync(path.join(godot, 'data/artwork', `${id}.png`))
        ? `${API}/godot/artwork/${id}.png`
        : `${ARTWORK}/${id}.png`;
    return { id, pokemon: d, anims, moves, artwork: art, portraits: `${COLLAB}/portrait/${pad4(id)}` };
  }

  function importAssets(): Promise<{ ok: boolean; log: string }> {
    return new Promise((resolve) => {
      execFile(process.execPath, [path.join('scripts', 'import-assets.ts')], { cwd: root, timeout: 10 * 60_000, maxBuffer: 16 << 20 }, (err, stdout, stderr) => {
        resolve({ ok: !err, log: `${stdout}${stderr}${err && !stderr ? String(err) : ''}`.trim() });
      });
    });
  }

  async function route(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://x');
    const route = url.pathname;
    if (route === '/data' && req.method === 'GET') return send(res, 200, readText(file) ?? '{"biomes":{},"species":{}}');
    if (route === '/data' && req.method === 'PUT') {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await readBody(req));
      } catch {
        return send(res, 400, { error: 'JSON invalide' });
      }
      const data = clean(parsed);
      if (!data) return send(res, 400, { error: 'Bestiaire invalide' });
      const text = `${format(data)}\n`;
      fs.writeFileSync(file, text);
      return send(res, 200, text);
    }
    if (route === '/catalog') return send(res, 200, await catalog());
    const sp = route.match(/^\/species\/(\d+)$/);
    if (sp) return send(res, 200, await detail(Number(sp[1])));
    if (route === '/import' && req.method === 'POST') return send(res, 200, await importAssets());
    const g = route.match(/^\/godot\/((?:pmd|artwork)\/[\w./-]+)$/);
    if (g && godot && !g[1].includes('..')) {
      const target = path.join(godot, 'data', g[1]);
      if (!fs.existsSync(target)) return send(res, 404, 'Introuvable', 'text/plain');
      res.setHeader('Content-Type', MIME[path.extname(target)] ?? 'application/octet-stream');
      return fs.createReadStream(target).pipe(res);
    }
    return send(res, 404, { error: `Route inconnue : ${route}` });
  }

  return {
    name: 'pokhades-bestiary',
    apply: 'serve',
    configResolved(config) {
      root = config.root;
      file = path.join(root, 'src/data/bestiary.json');
      web = path.join(root, 'public/game');
      const dir = path.resolve(process.env.POKHADES_GODOT ?? path.join(root, '..', 'pokhades'));
      godot = fs.existsSync(path.join(dir, 'project.godot')) ? dir : null;
      cache = cacheDir(root);
    },
    configureServer(server) {
      server.middlewares.use(API, (req, res) => {
        route(req, res).catch((err: unknown) => send(res, 500, { error: String(err) }));
      });
    },
    // Pas de rechargement général quand bestiary.json change : le jeu se
    // recharge sur l'événement (main.ts), la page de config relit le fichier
    // sans perdre ce qu'on y fait.
    hotUpdate({ file: changed }) {
      if (path.resolve(changed) !== file) return;
      if (this.environment.name === 'client') this.environment.hot.send({ type: 'custom', event: BESTIARY_EVENT });
      return [];
    },
  };
}
