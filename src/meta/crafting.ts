import { hash2 } from '../core/rng';
import type { BiomeId } from '../data/species';
import { heldItem } from './catalog';
import type { Save } from './save';

// L'artisanat du Repaire (ajout, retour de test : le jeu Godot n'en a pas).
// Trois maillons :
// - le Potager : au Champ de cultures, Héliatronc plante l'herbe qu'on lui
//   demande ; chaque parcelle pousse d'un cran par salle franchie en run
//   (comme les missions de Démolosse) et donne des plantes ;
// - les matériaux de biome : chaque biome a le sien, qu'on ne trouve que dans
//   ses coffres (des champignons en forêt, du charbon au volcan…) ;
// - l'Atelier : Queulorior y façonne, avec plantes et matériaux, des objets
//   tenus introuvables à l'étal (catalog.ts, `crafted`) et des nectars. Posé
//   devant l'atelier, un nectar attire au bout de quelques salles un Pokémon
//   pas encore débloqué, des types qu'il aime : on lui parle, il reste.
//
// Écarts voulus (retour de test) : plus de sachets de graines à ramasser dans
// les coffres (« ça fait beaucoup de trucs à ramasser en run ») — on choisit
// au Potager ce qu'Héliatronc plante, sans rien payer ; seule l'attente
// compte. Les plantes reprennent les herbes des jeux. Les nectars ont l'icône
// des Encens (Essentials n'a pas les Nectars de la 7ᵉ génération) : un petit
// pot parfumé.

export interface Material {
  name: string;
  /** Icône d'objet d'Essentials (assets/essentials/items). */
  icon: string;
  kind: 'plant' | 'biome';
  desc: string;
}

/** Ce qui se plante au Potager : en combien de salles la plante mûrit, et combien on en récolte. */
export const GARDEN: Record<string, { rooms: number; yield: number }> = {
  'energy-root': { rooms: 3, yield: 3 },
  'white-herb': { rooms: 4, yield: 2 },
  'mental-herb': { rooms: 4, yield: 2 },
  'power-herb': { rooms: 5, yield: 2 },
  'revival-herb': { rooms: 8, yield: 1 },
};
/** Les anciens sachets (sauvegardes d'avant) et la plante qu'ils donnaient. */
export const OLD_SEEDS: Record<string, string> = {
  'seed-root': 'energy-root',
  'seed-white': 'white-herb',
  'seed-mental': 'mental-herb',
  'seed-power': 'power-herb',
  'miracle-seed': 'revival-herb',
};

/** Matériau propre à chaque biome, dans ses coffres seulement. */
export const BIOME_MATERIAL: Record<BiomeId, string> = {
  prairie: 'pretty-wing',
  foret: 'tiny-mushroom',
  automne: 'balm-mushroom',
  lac: 'heart-scale',
  marais: 'black-sludge',
  volcan: 'charcoal',
  rocailleux: 'smooth-rock',
  village: 'relic-copper',
  plage: 'shoal-shell',
  ocean: 'pearl',
  glace: 'never-melt-ice',
};

export const MATERIALS: Record<string, Material> = {
  'energy-root': { name: 'Racine Énergie', icon: 'ENERGYROOT', kind: 'plant', desc: 'Une racine amère et nourrissante.' },
  'white-herb': { name: 'Herbe Blanche', icon: 'WHITEHERB', kind: 'plant', desc: 'Une herbe pâle au parfum de fleur.' },
  'mental-herb': { name: 'Herbe Mental', icon: 'MENTALHERB', kind: 'plant', desc: 'Une herbe fraîche qui éclaircit les idées.' },
  'power-herb': { name: 'Herbe Pouvoir', icon: 'POWERHERB', kind: 'plant', desc: 'Une herbe rouge qui pique la langue.' },
  'revival-herb': { name: 'Herbe Rappel', icon: 'REVIVALHERB', kind: 'plant', desc: 'Une herbe rare, qui ranimerait presque un K.O.' },
  'pretty-wing': { name: 'Jolie Plume', icon: 'PRETTYWING', kind: 'biome', desc: 'Prairie.' },
  'tiny-mushroom': { name: 'Petit Champi', icon: 'TINYMUSHROOM', kind: 'biome', desc: 'Forêt.' },
  'balm-mushroom': { name: 'Champi Suave', icon: 'BALMMUSHROOM', kind: 'biome', desc: 'Automne.' },
  'heart-scale': { name: 'Écaille Cœur', icon: 'HEARTSCALE', kind: 'biome', desc: 'Lac.' },
  'black-sludge': { name: 'Boue Noire', icon: 'BLACKSLUDGE', kind: 'biome', desc: 'Marais.' },
  charcoal: { name: 'Charbon', icon: 'CHARCOAL', kind: 'biome', desc: 'Volcan.' },
  'smooth-rock': { name: 'Roche Lisse', icon: 'SMOOTHROCK', kind: 'biome', desc: 'Rocailleux.' },
  'relic-copper': { name: 'Vieux Sou', icon: 'RELICCOPPER', kind: 'biome', desc: 'Village.' },
  'shoal-shell': { name: 'Coquillage', icon: 'SHOALSHELL', kind: 'biome', desc: 'Plage.' },
  pearl: { name: 'Perle', icon: 'PEARL', kind: 'biome', desc: 'Océan.' },
  'never-melt-ice': { name: 'Glace Éternelle', icon: 'NEVERMELTICE', kind: 'biome', desc: 'Montagne glacée.' },
};

export const materialName = (id: string): string => MATERIALS[id]?.name ?? id;

/** Les nectars de l'atelier : les types qu'ils attirent (au moins un en commun suffit). */
export const NECTARS: Record<string, { name: string; icon: string; types: readonly string[]; desc: string }> = {
  'nectar-flower': { name: 'Nectar Fleuri', icon: 'ROSEINCENSE', types: ['grass', 'bug', 'fairy', 'flying', 'normal'], desc: 'Attire les Pokémon Plante, Insecte, Fée, Vol et Normal.' },
  'nectar-sea': { name: 'Nectar Marin', icon: 'SEAINCENSE', types: ['water', 'ice', 'dragon'], desc: 'Attire les Pokémon Eau, Glace et Dragon.' },
  'nectar-fire': { name: 'Nectar Ardent', icon: 'FULLINCENSE', types: ['fire', 'fighting', 'rock', 'ground', 'steel', 'electric'], desc: 'Attire les Pokémon Feu, Combat, Roche, Sol, Acier et Électrik.' },
  'nectar-odd': { name: 'Nectar Étrange', icon: 'ODDINCENSE', types: ['psychic', 'ghost', 'poison', 'dark'], desc: 'Attire les Pokémon Psy, Spectre, Poison et Ténèbres.' },
};

/** Salles à franchir en run après avoir posé un nectar, avant que le visiteur arrive. */
export const NECTAR_ROOMS = 5;

export type Recipe = { out: string; kind: 'held' | 'nectar'; needs: Record<string, number> };

/**
 * Recettes de Queulorior. Chaque objet demande le matériau d'un ou deux
 * biomes précis : on y retourne pour lui. Les nectars, d'abord des plantes.
 */
export const RECIPES: readonly Recipe[] = [
  { out: 'nectar-flower', kind: 'nectar', needs: { 'white-herb': 2, 'pretty-wing': 1 } },
  { out: 'nectar-sea', kind: 'nectar', needs: { 'energy-root': 2, 'heart-scale': 1 } },
  { out: 'nectar-fire', kind: 'nectar', needs: { 'power-herb': 2, charcoal: 1 } },
  { out: 'nectar-odd', kind: 'nectar', needs: { 'mental-herb': 2, 'black-sludge': 1 } },
  { out: 'expert-belt', kind: 'held', needs: { 'power-herb': 2, 'relic-copper': 2 } },
  { out: 'shell-bell', kind: 'held', needs: { 'shoal-shell': 3, 'white-herb': 1 } },
  { out: 'rocky-helmet', kind: 'held', needs: { 'smooth-rock': 3, 'energy-root': 2 } },
  { out: 'focus-band', kind: 'held', needs: { 'balm-mushroom': 3, 'white-herb': 1 } },
  { out: 'eviolite', kind: 'held', needs: { 'heart-scale': 2, 'tiny-mushroom': 2, 'energy-root': 1 } },
  { out: 'choice-scarf', kind: 'held', needs: { 'pretty-wing': 3, 'mental-herb': 1 } },
  { out: 'choice-specs', kind: 'held', needs: { pearl: 2, 'mental-herb': 2 } },
  { out: 'zoom-lens', kind: 'held', needs: { 'never-melt-ice': 3, 'mental-herb': 1 } },
  { out: 'life-orb', kind: 'held', needs: { charcoal: 2, 'black-sludge': 1, 'revival-herb': 1 } },
];

/** Nom et icône de ce qu'une recette produit. */
export function recipeOutput(r: Recipe): { name: string; icon: string } {
  if (r.kind === 'nectar') return NECTARS[r.out];
  const it = heldItem(r.out);
  return { name: it?.name ?? r.out, icon: it?.icon ?? 'POKEBALL' };
}

export const canCraft = (save: Save, r: Recipe): boolean => Object.entries(r.needs).every(([m, n]) => (save.materials[m] ?? 0) >= n);

/** Façonne : prélève les ingrédients et range le produit (objets tenus avec les autres, nectars à part). */
export function craft(save: Save, r: Recipe): boolean {
  if (!canCraft(save, r)) return false;
  for (const [m, n] of Object.entries(r.needs)) save.materials[m] -= n;
  if (r.kind === 'held') save.items[r.out] = (save.items[r.out] ?? 0) + 1;
  else save.materials[r.out] = (save.materials[r.out] ?? 0) + 1;
  return true;
}

/** Parcelles du Potager (Save.garden). */
export const GARDEN_PLOTS = 3;

export const plots = (save: Save): Save['garden'] => Array.from({ length: GARDEN_PLOTS }, (_, i) => save.garden[i] ?? null);

/** Plante `plant` dans la parcelle `plot` (libre) : gratuit, il n'y a qu'à attendre. */
export function sow(save: Save, plot: number, plant: string): boolean {
  if (!GARDEN[plant] || save.garden[plot]) return false;
  save.garden = plots(save);
  save.garden[plot] = { plant, left: GARDEN[plant].rooms };
  return true;
}

/** Récolte une parcelle mûre : rend la plante et sa quantité, ou null. */
export function harvest(save: Save, plot: number): { plant: string; n: number } | null {
  const p = save.garden[plot];
  if (!p || p.left > 0) return null;
  const n = GARDEN[p.plant].yield;
  save.materials[p.plant] = (save.materials[p.plant] ?? 0) + n;
  save.garden[plot] = null;
  return { plant: p.plant, n };
}

/**
 * Une salle franchie en run : le potager pousse (s'il est bâti), le nectar
 * posé attend son visiteur. Rend ce qui vient d'arriver, pour l'annoncer.
 */
export function tickCraft(save: Save): { ripe: number; visitor: boolean } {
  let ripe = 0;
  if (save.built.includes('field')) {
    for (const p of save.garden) {
      if (!p || p.left <= 0) continue;
      if (--p.left === 0) ripe++;
    }
  }
  const n = save.nectar;
  const visitor = Boolean(n && n.left > 0 && --n.left === 0);
  return { ripe, visitor };
}

/**
 * Ce qu'un coffre de run rapporte à l'artisanat : le matériau de son biome
 * (davantage s'il était gardé). Tirage déterministe, comme le reste du
 * coffre (chests.ts).
 */
export function rollMaterials(seed: number, x: number, y: number, biome: BiomeId, guarded: boolean): Record<string, number> {
  let k = 0;
  const r = () => hash2(x, y, seed + 7919 * ++k);
  const out: Record<string, number> = {};
  const mat = BIOME_MATERIAL[biome];
  if (mat) out[mat] = (guarded ? 2 : 1) + Math.floor(r() * 2);
  return out;
}

/**
 * Le visiteur d'un nectar, choisi quand on le pose : une forme de base pas
 * encore débloquée, d'un type que le nectar attire. Les espèces déjà
 * rencontrées passent d'abord (on sait où on les a vues) ; tirage selon la
 * run, pour qu'un même nectar ne ramène pas toujours le même.
 * `candidates` : (n°, types) des espèces possibles, déjà filtrées (pas de
 * légendaire, pas de forme évoluée, pas de débloqué).
 */
export function pickVisitor(save: Save, nectar: string, candidates: readonly { id: number; types: readonly string[] }[]): number | null {
  const likes = NECTARS[nectar]?.types ?? [];
  const pool = candidates.filter((c) => c.types.some((t) => likes.includes(t)));
  const seen = pool.filter((c) => save.seen.includes(c.id));
  const from = seen.length ? seen : pool;
  if (!from.length) return null;
  return from[Math.floor(hash2(save.runs, from.length, 4241) * from.length)].id;
}
