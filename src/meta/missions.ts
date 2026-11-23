import { CANDY, RESOURCES, type ResourceId } from './catalog';
import { BIOME_MATERIAL } from './crafting';
import type { BiomeId } from '../data/species';
import { roster, type Save } from './save';

// Missions du Repaire (A-FAIRE 2.4 ; ExpeditionManager.gd et
// ExpeditionBoardScreen.gd du jeu Godot). Démolosse, le pisteur, envoie des
// libérés chercher du bois, de la pierre, des vivres ou des Baies. Une
// mission avance d'un cran à chaque salle franchie en run (rien ne bouge au
// camp) ; elle ne rate jamais, et au retour on récolte chez lui. Le Pokémon
// parti n'est plus au camp, et ne peut pas entrer dans l'équipe ; envoyé
// depuis l'équipe, il en sort. « Rappeler » le fait rentrer tout de suite,
// les mains vides.
//
// Deux emplacements (BASE_SLOTS), un de plus avec le Dortoir (Godot : la
// Grange et la Palissade, qui n'existent pas ici).
//
// Écarts voulus :
// - La Récolte de baies (40 Baies) : A-FAIRE voulait qu'on puisse envoyer
//   chercher des Baies ; Godot n'avait que des ressources.
// - L'Entraînement, une fois le terrain bâti : +2 niveaux de départ, comme un
//   Super Bonbon, sous le même plafond (CANDY.max). Godot n'avait pas
//   d'entraînement.
// - Les Fouilles (23 novembre 2026), une fois la Carrière bâtie : des matériaux de
//   biome, ceux des coffres, tirés parmi les biomes déjà atteints. Ils mènent aux
//   objets, nectars et CT de l'atelier sans refaire une run dans le bon biome. La
//   Carrière du sanctuaire de Godot donnait de la pierre : ici, la Carrière en donne
//   déjà à chaque salle.
// - Il faut garder un Pokémon dans l'équipe (Godot : un au camp) — c'est lui
//   qui mène, au Repaire comme en run.

export type MissionId = 'wood_short' | 'wood_long' | 'stone_short' | 'stone_long' | 'food_short' | 'food_long' | 'berries' | 'training' | 'dig';

export interface Mission {
  id: MissionId;
  name: string;
  desc: string;
  /** Salles à franchir en run avant le retour (Godot : « zones »). */
  rooms: number;
  /** Ressources rapportées ; ou des Baies ; ou des niveaux de départ (pour le Pokémon envoyé). */
  res?: Partial<Record<ResourceId, number>>;
  baies?: number;
  levels?: number;
  /** Matériaux de biome rapportés (Fouilles), tirés parmi les biomes atteints. */
  materials?: number;
  /** Bâtiment exigé (BUILDINGS) : la mission est grisée tant qu'il n'est pas bâti. */
  needs?: 'training' | 'quarry';
}

/** ExpeditionManager.TYPES (sans island_stone), plus nos deux missions. */
// Pierre et bois plus vite (retour de test du 11 novembre 2026 : « je ne vois
// pas comment gagner des pierres ») : missions courtes plus courtes, longues
// mieux payées.
export const MISSIONS: readonly Mission[] = [
  { id: 'food_short', name: 'Cueillette', desc: 'Des fruits et des racines, juste à l’orée du bois.', rooms: 2, res: { food: 6 } },
  { id: 'wood_short', name: 'Coupe de bois', desc: 'Quelques fagots de branches mortes.', rooms: 2, res: { wood: 7 } },
  { id: 'stone_short', name: 'Ramassage de pierres', desc: 'Les galets du torrent, un sac après l’autre.', rooms: 3, res: { stone: 7 } },
  { id: 'berries', name: 'Récolte de baies', desc: 'Les arbres à baies des clairières voisines.', rooms: 4, baies: 40 },
  { id: 'training', name: 'Entraînement', desc: 'Du matin au soir sur le terrain : il repartira plus fort.', rooms: 5, levels: 2, needs: 'training' },
  { id: 'dig', name: 'Fouilles', desc: 'Au fond de la carrière, des trouvailles venues des biomes déjà parcourus.', rooms: 6, materials: 3, needs: 'quarry' },
  { id: 'food_long', name: 'Grande chasse', desc: 'Une longue traque : de quoi nourrir le camp.', rooms: 6, res: { food: 21 } },
  { id: 'wood_long', name: 'Grande coupe', desc: 'Des troncs entiers, débités et traînés jusqu’ici.', rooms: 7, res: { wood: 22 } },
  { id: 'stone_long', name: 'Ouvrir une carrière', desc: 'Tailler la falaise, bloc par bloc.', rooms: 7, res: { stone: 18 } },
];

export const mission = (id: MissionId): Mission => MISSIONS.find((m) => m.id === id)!;

/** ExpeditionManager.BASE_SLOTS */
const BASE_SLOTS = 2;

/** Emplacements de mission : deux, un de plus avec le Dortoir. */
export const missionSlots = (save: Save): number => BASE_SLOTS + (save.built.includes('dorm') ? 1 : 0);

/** Le Pokémon est-il en mission (rentré compris, tant qu'on n'a pas récolté) ? */
export const busy = (save: Save, pid: number): boolean => save.missions.some((m) => m?.pid === pid);

/** La mission est-elle ouverte (son bâtiment bâti) ? */
export const open = (save: Save, m: Mission): boolean => !m.needs || save.built.includes(m.needs);

/** Qui peut partir (uid) : les libérés libres, sauf le dernier de l'équipe. */
export function available(save: Save): number[] {
  return roster(save).filter((pid) => !busy(save, pid) && !(save.team.length === 1 && save.team[0] === pid));
}

/** Envoie `pid` sur l'emplacement `i` ; il sort de l'équipe. Rend false si c'est impossible. */
export function send(save: Save, i: number, id: MissionId, pid: number): boolean {
  const m = MISSIONS.find((x) => x.id === id);
  if (!m || !open(save, m) || i < 0 || i >= missionSlots(save) || save.missions[i] || !available(save).includes(pid)) return false;
  while (save.missions.length <= i) save.missions.push(null);
  save.missions[i] = { type: id, pid, left: m.rooms };
  save.team = save.team.filter((t) => t !== pid);
  return true;
}

/** Une salle franchie (RunManager.advance → tick_room) : rend les emplacements des missions qui viennent de finir. */
export function tick(save: Save): number[] {
  const done: number[] = [];
  save.missions.forEach((m, i) => {
    if (!m || m.left <= 0) return;
    m.left--;
    if (m.left === 0) done.push(i);
  });
  return done;
}

/**
 * Récolte une mission rentrée : verse la récompense et libère le Pokémon. Rend la mission et,
 * pour des Fouilles, les matériaux trouvés ; ou null. `random` : le tirage des Fouilles.
 */
export function collect(save: Save, i: number, random: () => number = Math.random): { m: Mission; found?: Record<string, number> } | null {
  const slot = save.missions[i];
  if (!slot || slot.left > 0) return null;
  const m = mission(slot.type);
  let found: Record<string, number> | undefined;
  if (m.materials) {
    // Les biomes atteints (la Prairie, puis ceux que le plan du monde connaît) : on ne déterre
    // que ce qu'on a déjà vu.
    const biomes = [...new Set(['prairie', ...save.visited])].filter((b): b is BiomeId => b in BIOME_MATERIAL);
    found = {};
    for (let k = 0; k < m.materials; k++) {
      const mat = BIOME_MATERIAL[biomes[Math.floor(random() * biomes.length)]];
      found[mat] = (found[mat] ?? 0) + 1;
      save.materials[mat] = (save.materials[mat] ?? 0) + 1;
    }
  }
  for (const [r, n] of Object.entries(m.res ?? {}) as [ResourceId, number][]) save.resources[r] += n;
  save.baies += m.baies ?? 0;
  if (m.levels) save.levels[slot.pid] = Math.min(CANDY.max, (save.levels[slot.pid] ?? 0) + m.levels);
  save.missions[i] = null;
  return { m, found };
}

/** Rappelle le Pokémon (ExpeditionManager.cancel) : il rentre tout de suite, sans rien. */
export function recall(save: Save, i: number): void {
  if (save.missions[i]) save.missions[i] = null;
}

/** Ce que rapporte une mission, en texte (« Bois 6 », « 40 Baies », « +2 niveaux »). */
export function rewardText(m: Mission): string {
  if (m.levels) return `+${m.levels} niveaux de départ`;
  if (m.materials) return `${m.materials} matériaux de biome`;
  if (m.baies) return `${m.baies} Baies`;
  return Object.entries(m.res ?? {})
    .map(([r, n]) => `${RESOURCES[r as ResourceId].name} ${n}`)
    .join(' · ');
}
