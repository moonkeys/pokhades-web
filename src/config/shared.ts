import type { Bestiary, SpeciesSheet } from '../data/bestiary';
import { CHAMPIONS } from '../data/champions';
import {
  allSpecies,
  BIOME_IDS,
  CAMP_NPCS,
  DONOR_SPECIES,
  FAUNA,
  ISLAND_NPCS,
  MERC_POOLS,
  MERCHANT_SPECIES,
  PLAYER_SPECIES,
  SHOP_IDLER,
  SHOP_SLEEPER,
  SHOP_STROLLERS,
  type BiomeId,
} from '../data/species';

// L'état de la page de config : le bestiaire en cours d'édition, ce qui est
// enregistré sur le disque, et le catalogue des espèces que donne le serveur
// de dev (scripts/bestiary-server.ts).

export const API = '/__bestiary';

export interface CatalogEntry {
  id: number;
  name: string;
  en: string;
  types: string[];
  stats: Record<string, number>;
  heightM?: number;
  weightKg?: number;
  /** Planches copiées dans public/game : le jeu peut s'en servir tel quel. */
  imported: boolean;
  /** Planches présentes dans le dépôt Godot : `npm run import-assets` peut les copier. */
  godot: boolean;
  /** Planches sur SpriteCollab : `import-assets` peut les télécharger. */
  collab: boolean;
  walk: { url: string; fw: number; fh: number } | null;
}

export interface AnimInfo {
  name: string;
  /** Planche réellement lue (une animation peut reprendre celle d'une autre, <CopyOf>). */
  file: string;
  fw: number;
  fh: number;
  /** Durées des frames, en 1/60 s. */
  durations: number[];
  src: 'jeu' | 'godot' | 'collab';
  url: string;
}

export interface MoveInfo {
  name: string;
  name_fr?: string;
  type?: string;
  power?: number | null;
  accuracy?: number | null;
  pp?: number | null;
  damage_class?: string;
  desc_fr?: string;
  /** Fiche copiée dans public/game (sinon dans le dépôt Godot ou le cache de PokéAPI : à importer). */
  inGame: boolean;
}

export interface Detail {
  id: number;
  pokemon: { learnable_moves?: string[]; level_up_moves?: { level: number; name: string }[] } | null;
  anims: AnimInfo[];
  moves: Record<string, MoveInfo>;
  artwork: string;
  /** Dossier des portraits SpriteCollab (<url>/<Émotion>.png). */
  portraits: string;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: Element | null, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

/** Comme hud.ts. */
export const TYPE_FR: Record<string, string> = {
  normal: 'Normal', fire: 'Feu', water: 'Eau', electric: 'Électrik', grass: 'Plante', ice: 'Glace',
  fighting: 'Combat', poison: 'Poison', ground: 'Sol', flying: 'Vol', psychic: 'Psy', bug: 'Insecte',
  rock: 'Roche', ghost: 'Spectre', dragon: 'Dragon', dark: 'Ténèbres', steel: 'Acier', fairy: 'Fée',
};
export const STAT_FR: [string, string][] = [
  ['hp', 'PV'], ['attack', 'Attaque'], ['defense', 'Défense'], ['special-attack', 'Atq. Spé'], ['special-defense', 'Déf. Spé'], ['speed', 'Vitesse'],
];
export const CLASS_FR: Record<string, string> = { physical: 'Physique', special: 'Spéciale', status: 'Statut' };

export const store = {
  data: { biomes: {}, species: {} } as Bestiary,
  /** Le fichier tel qu'il est sur le disque. */
  saved: '',
  catalog: new Map<number, CatalogEntry>(),
  webMoves: new Set<string>(),
  godot: null as string | null,
};

const listeners = new Set<() => void>();
export const onChange = (fn: () => void) => listeners.add(fn);

const DRAFT_KEY = 'pokhades-bestiary-draft';

/** Une modification : on la garde en brouillon (la page peut être rechargée par Vite) et tout se redessine. */
export function commit() {
  try {
    if (isDirty()) localStorage.setItem(DRAFT_KEY, JSON.stringify({ base: store.saved, draft: snapshot() }));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Stockage indisponible : le brouillon ne survivra pas à un rechargement.
  }
  for (const fn of listeners) fn();
}

/** Le brouillon laissé par la session précédente, s'il part du fichier tel qu'il est encore. */
export function takeDraft(): Bestiary | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const { base, draft } = JSON.parse(raw) as { base: string; draft: string };
    if (base !== store.saved) {
      localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return JSON.parse(draft) as Bestiary;
  } catch {
    return null;
  }
}

export function dropDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Rien à effacer.
  }
}

/** Forme canonique d'un bestiaire (sans fiches vides), pour comparer avec le disque. */
function canonical(b: Bestiary): string {
  const species: Record<string, SpeciesSheet> = {};
  for (const [k, s] of Object.entries(b.species)) {
    const c: SpeciesSheet = {};
    if (s.persona) c.persona = s.persona;
    const lines = (s.lines ?? []).map((l) => l.trim()).filter(Boolean);
    if (lines.length) c.lines = lines;
    if (s.story?.trim()) c.story = s.story.trim();
    if (s.moves?.length) c.moves = s.moves;
    if (Object.keys(c).length) species[k] = c;
  }
  return JSON.stringify({ biomes: b.biomes, species });
}

export const snapshot = () => canonical(store.data);

let savedSnapshot = '';
/** Le fichier vient d'être lu ou écrit : il devient la référence des changements non enregistrés. */
export function setSaved(text: string) {
  store.saved = text;
  savedSnapshot = canonical(JSON.parse(text) as Bestiary);
}
export const isDirty = () => snapshot() !== savedSnapshot;

export function sheet(id: number): SpeciesSheet {
  return (store.data.species[id] ??= {});
}

export const biomeList = (b: BiomeId): number[] => (store.data.biomes[b] ??= []);
export const biomesOf = (id: number): BiomeId[] => BIOME_IDS.filter((b) => biomeList(b).includes(id));

/** Ce que l'espèce fait déjà dans le jeu, hors biomes (data/species.ts, data/champions.ts). */
export const ROLES = new Map<number, string[]>();
{
  const add = (ids: Iterable<number>, role: string) => {
    for (const id of ids) {
      const r = ROLES.get(id) ?? [];
      if (!r.includes(role)) r.push(role);
      ROLES.set(id, r);
    }
  };
  add(PLAYER_SPECIES.map((s) => s.id), 'Jouable');
  add(MERC_POOLS.scout, 'Mercenaire · Éclaireur');
  add(MERC_POOLS.veteran, 'Mercenaire · Vétéran');
  add(MERC_POOLS.champion, 'Mercenaire · Champion sauvage');
  add(DONOR_SPECIES, 'Donateur légendaire');
  add([MERCHANT_SPECIES], 'Marchand de la boutique');
  add([...SHOP_STROLLERS, SHOP_SLEEPER, SHOP_IDLER], 'Figurant de la boutique');
  add(Object.values(CAMP_NPCS), 'PNJ du Repaire');
  add([ISLAND_NPCS.sage, ...ISLAND_NPCS.hermits], 'Île du Repaire');
  for (const c of Object.values(CHAMPIONS)) add(c.team.flat(), `Équipe de ${c.name}`);
  // Le reste de ce que le jeu embarque hors faune (habitants du camp…).
  const fauna = new Set(Object.values(FAUNA).flat());
  for (const id of allSpecies()) if (!ROLES.has(id) && !fauna.has(id)) add([id], 'Habitant du Repaire');
}

/** Présente dans le jeu : un biome ou un rôle. */
export const isUsed = (id: number) => ROLES.has(id) || biomesOf(id).length > 0;

/** Attaques imposées dont la fiche n'est pas encore copiée dans public/game. */
export const missingMoves = (id: number) => (store.data.species[id]?.moves ?? []).filter((m) => !store.webMoves.has(m));

/** Le jeu s'en sert, et le dépôt Godot ou SpriteCollab a les planches qui lui manquent (ou des fiches d'attaque manquent) : `import-assets` à relancer. */
export function needsImport(id: number): boolean {
  const c = store.catalog.get(id);
  return isUsed(id) && ((!!c && !c.imported && (c.godot || c.collab)) || missingMoves(id).length > 0);
}

/** Dans un biome sans planche nulle part : le jeu la fait disparaître dès qu'elle apparaît (main.ts, attach). */
export function unplayable(id: number): boolean {
  const c = store.catalog.get(id);
  return biomesOf(id).length > 0 && (!c || (!c.imported && !c.godot && !c.collab));
}

/** Ce qui cloche pour l'espèce, à afficher en pastille ; null si rien. */
export function problem(id: number): { kind: 'warn' | 'bad'; text: string } | null {
  if (unplayable(id)) return { kind: 'bad', text: 'Aucune planche PMD, ni dans le jeu, ni dans le dépôt Godot, ni sur SpriteCollab : le jeu l’ignore' };
  if (needsImport(id)) return { kind: 'warn', text: 'Assets à importer' };
  return null;
}

export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const dex = (id: number) => `#${String(id).padStart(3, '0')}`;
