// Ce que le dépôt Godot n'a pas, tiré d'Internet et gardé dans .cache/remote/
// (même arborescence que le dépôt : data/pmd, data/pokeapi) : les planches
// PMD de SpriteCollab, et les fiches d'espèce et d'attaque de PokéAPI,
// construites comme le jeu (autoloads/PokemonAPI.gd : _build_data, get_move).
// Utilisé par import-assets.ts et par la page de config (bestiary-server.ts).
// Un échec n'est pas mis en cache : on retentera au prochain import.
//
// Ce module n'importe que Node : import-assets.ts le charge sans bundler.
import fs from 'node:fs';
import path from 'node:path';
import { megaById } from '../src/data/megas.ts';

export const COLLAB = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master';
const POKEAPI = 'https://pokeapi.co/api/v2';
const GRAPHQL = 'https://beta.pokeapi.co/graphql/v1beta';
/** Dernière espèce du Pokédex national : au-delà, PokéAPI liste des formes. */
const LAST_DEX = 1025;

export const cacheDir = (web: string) => path.join(web, '.cache', 'remote');

// Réponses de PokéAPI, réduites à ce qu'on en lit.
interface Named {
  name: string;
}
interface Localized {
  name: string;
  language: Named;
}
interface ApiPokemon {
  id: number;
  name: string;
  height: number;
  weight: number;
  types: { type: Named }[];
  stats: { base_stat: number; stat: Named }[];
  moves: { move: Named; version_group_details: { level_learned_at: number; move_learn_method: Named }[] }[];
  sprites: { front_default: string | null };
  species: { url: string };
}
interface ApiMove {
  type?: Named;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  damage_class?: Named;
  names: Localized[];
  flavor_text_entries: { flavor_text: string; language: Named }[];
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, init);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Fiche d'espèce au format du dépôt Godot (PokemonAPI._build_data). */
async function buildPokemon(id: number) {
  // Une forme (Méga : 10034…) n'a pas de fiche d'espèce à son numéro : on suit le lien de la forme.
  const p = await getJson<ApiPokemon>(`${POKEAPI}/pokemon/${id}`);
  if (!p) return null;
  const species = await getJson<{ names: Localized[]; evolves_from_species: unknown }>(p.species?.url ?? `${POKEAPI}/pokemon-species/${id}`);
  const mega = megaById(id);
  const levelUp: { level: number; name: string }[] = [];
  for (const m of p.moves) {
    const lv = m.version_group_details.find((v) => v.move_learn_method.name === 'level-up');
    if (lv) levelUp.push({ level: lv.level_learned_at, name: m.move.name });
  }
  levelUp.sort((a, b) => a.level - b.level);
  return {
    id: p.id,
    name_en: p.name,
    name_fr: mega?.name ?? species?.names.find((n) => n.language.name === 'fr')?.name ?? p.name,
    types: p.types.map((t) => t.type.name),
    stats: Object.fromEntries(p.stats.map((s) => [s.stat.name, s.base_stat])),
    sprite_url: p.sprites.front_default ?? '',
    level_up_moves: levelUp.slice(0, 20),
    learnable_moves: p.moves.map((m) => m.move.name),
    is_base_form: !mega && !species?.evolves_from_species,
    height_m: p.height / 10,
    weight_kg: p.weight / 10,
  };
}

/** Fiche d'attaque au format du dépôt Godot (PokemonAPI.get_move) : la description est le dernier texte français. */
async function buildMove(name: string) {
  const d = await getJson<ApiMove>(`${POKEAPI}/move/${name}`);
  if (!d) return null;
  const fr = d.flavor_text_entries.filter((f) => f.language.name === 'fr');
  return {
    name,
    name_fr: d.names.find((n) => n.language.name === 'fr')?.name ?? '',
    type: d.type?.name ?? 'normal',
    power: d.power,
    accuracy: d.accuracy,
    pp: d.pp,
    damage_class: d.damage_class?.name ?? 'physical',
    desc_fr: (fr.at(-1)?.flavor_text ?? '').replace(/\s+/g, ' '),
  };
}

/**
 * Tire dans le cache un fichier du dépôt Godot qui lui manque (chemin
 * relatif au dépôt, comme `data/pmd/0837/Walk-Anim.png`) ; renvoie son
 * chemin, ou null s'il n'existe nulle part ou que le réseau manque.
 */
export async function fetchRemote(cache: string, rel: string): Promise<string | null> {
  const dst = path.join(cache, rel);
  if (fs.existsSync(dst)) return dst;
  let body: Buffer | null = null;
  const pmd = rel.match(/^data\/pmd\/(\d{4,5})\/([\w-]+\.(?:png|xml))$/);
  const mon = rel.match(/^data\/pokeapi\/pokemon\/(\d+)\.json$/);
  const move = rel.match(/^data\/pokeapi\/move\/([\w-]+)\.json$/);
  if (pmd) {
    try {
      // Une Méga range ses planches dans un sous-dossier de son espèce (« 0006/0001 »).
      const dir = megaById(Number(pmd[1]))?.collab ?? pmd[1];
      const res = await fetch(`${COLLAB}/sprite/${dir}/${pmd[2]}`);
      if (res.ok) body = Buffer.from(await res.arrayBuffer());
    } catch {
      // Hors ligne : rien à copier.
    }
  } else if (mon && (Number(mon[1]) <= LAST_DEX || megaById(Number(mon[1])))) {
    const d = await buildPokemon(Number(mon[1]));
    if (d) body = Buffer.from(JSON.stringify(d));
  } else if (move) {
    const d = await buildMove(move[1]);
    if (d) body = Buffer.from(JSON.stringify(d));
  }
  if (!body) return null;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, body);
  return dst;
}

export interface IndexEntry {
  /** Nom français (anglais à défaut). */
  name: string;
  en: string;
  types: string[];
  /** SpriteCollab a des planches PMD pour cette espèce. */
  sprites: boolean;
}

/**
 * Toutes les espèces du Pokédex national : noms français et types (une
 * requête GraphQL à PokéAPI), planches disponibles (tracker de SpriteCollab,
 * 10 Mo, dont on ne garde que l'essentiel). Gardé en cache : effacer
 * .cache/remote/index.json pour le rafraîchir.
 */
export async function speciesIndex(cache: string): Promise<Record<string, IndexEntry> | null> {
  const file = path.join(cache, 'index.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, IndexEntry>;
  const [tracker, gql] = await Promise.all([
    getJson<Record<string, { name: string; sprite_files?: Record<string, unknown> }>>(`${COLLAB}/tracker.json`),
    getJson<{ data?: { names: { name: string; pokemon_species_id: number }[]; types: { pokemon_id: number; slot: number; pokemon_v2_type: Named }[] } }>(GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `{ names: pokemon_v2_pokemonspeciesname(where: {language_id: {_eq: 5}}) { name pokemon_species_id }
          types: pokemon_v2_pokemontype(where: {pokemon_id: {_lte: ${LAST_DEX}}}, order_by: {slot: asc}) { pokemon_id slot pokemon_v2_type { name } } }`,
      }),
    }),
  ]);
  if (!tracker) return null;
  const fr = new Map(gql?.data?.names.map((n) => [n.pokemon_species_id, n.name]) ?? []);
  const types = new Map<number, string[]>();
  for (const t of gql?.data?.types ?? []) types.set(t.pokemon_id, [...(types.get(t.pokemon_id) ?? []), t.pokemon_v2_type.name]);
  const index: Record<string, IndexEntry> = {};
  for (const [key, e] of Object.entries(tracker)) {
    const id = Number(key);
    if (!(id >= 1 && id <= LAST_DEX)) continue;
    index[id] = { name: fr.get(id) ?? e.name, en: e.name.toLowerCase(), types: types.get(id) ?? [], sprites: Object.keys(e.sprite_files ?? {}).length > 0 };
  }
  // Sans les noms français, on ne garde pas l'index : on retentera la prochaine fois.
  if (gql?.data) {
    fs.mkdirSync(cache, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(index));
  }
  return index;
}
