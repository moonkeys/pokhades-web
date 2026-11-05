import type { BiomeId } from '../data/species';
import { LEAGUE_GATE, LEAGUE_MASTER } from '../run/run';
import { BIOMES } from '../world/biomes';
import { WORLD, WORLD_LINKS } from '../world/worldmap';
import { BIOME_CHAMPIONS } from '../data/champions';
import { roster, type Save } from './save';

// Le carnet des exploits (ajout, retour de test : « le but du jeu, c'est de
// combattre tous les grands dresseurs… une liste de toutes les missions à
// accomplir, un peu comme dans Hades, qui tu dois battre une fois, et après
// t'as une récompense en fonction de qui tu bats »). C'est la liste des
// prophéties de Hades : tout est visible d'emblée, chaque ligne se coche
// d'elle-même quand l'exploit est fait (en run ou au Repaire), et sa
// récompense se réclame au Repaire, auprès de Xatu, le chroniqueur, près de l’arche.
//
// Contrairement aux quêtes de Kangourex (meta/quests.ts), rien ne s'accepte
// ni ne se compte « depuis » : l'état se lit dans la sauvegarde (champions
// vaincus, biomes atteints, runs gagnées, Pokémon de la rébellion). Le module
// est pur : main.ts l'écrit, ui/journal.ts l'affiche.

export type FeatGroup = 'champions' | 'conseil' | 'monde' | 'rebellion';

export interface Feat {
  id: string;
  group: FeatGroup;
  name: string;
  desc: string;
  /** Où en est-on : [fait, objectif]. */
  progress(save: Save): [number, number];
  reward: { baies?: number; shards?: number };
  /**
   * L'exploit n'apparaît au carnet qu'une fois ceci vrai (retour de test : « faire
   * apparaître les quêtes au fur et à mesure de l'avancement » — celles d'une zone une fois
   * la zone atteinte, celles de la Route Victoire une fois elle ouverte). Absent : toujours.
   */
  unlocked?(save: Save): boolean;
}

export const FEAT_GROUPS: Record<FeatGroup, string> = {
  champions: 'Les champions',
  conseil: 'La Route Victoire',
  monde: 'La carte du monde',
  rebellion: 'La rébellion',
};

/** Où l'on croise chaque champion des biomes (data/champions.ts, BIOME_CHAMPIONS), pour le carnet. */
const CHAMPION_HOME: Record<string, string> = {
  Blanche: 'de la Prairie',
  Ondine: 'de la Plage et du Lac',
  'Major Bob': 'du Village',
  Erika: 'de la Forêt et de l’Automne',
  Pierre: 'de l’Automne et des Rocailleux',
  Koga: 'du Marais',
  Morgane: 'de l’Océan et du Lac',
  Auguste: 'du Volcan',
  Giovanni: 'des Rocailleux',
  Olga: 'de la Montagne glacée',
};

/** Le Conseil : les champions de la Route Victoire. */
const ELITE = ['Aldo', 'Agatha', 'Peter'];

const beat = (name: string) => (save: Save): [number, number] => [save.beaten.includes(name) ? 1 : 0, 1];

/** Un biome atteint (la Prairie, d'où part chaque run, l'est d'office). */
const reached = (save: Save, b: BiomeId) => b === 'prairie' || save.visited.includes(b);
/** Les biomes où l'on croise chaque champion (data/champions.ts, BIOME_CHAMPIONS). */
const homesOf = (name: string) => (Object.keys(BIOME_CHAMPIONS) as BiomeId[]).filter((b) => BIOME_CHAMPIONS[b]?.includes(name));

/**
 * Économie (retour de test : « on se fait de l'argent beaucoup trop facilement ») : les
 * récompenses sont modestes en Baies et paient surtout en Éclats de Champion, qui ne
 * s'obtiennent qu'aux boss.
 */
export const FEATS: readonly Feat[] = [
  ...LEAGUE_GATE.map((name, i): Feat => ({
    id: `champ:${name}`,
    group: 'champions',
    name: `Vaincre ${name}`,
    desc: `Champion ${CHAMPION_HOME[name]} : à battre une fois.`,
    progress: beat(name),
    reward: { baies: 30 + 10 * i, shards: 1 },
    // Le champion d'une zone apparaît une fois la zone atteinte.
    unlocked: (save) => homesOf(name).some((b) => reached(save, b)),
  })),
  {
    // (Le but qui ouvre la Route Victoire reste avec les champions, visible d'emblée : c'est lui
    // qui donne envie d'y aller ; ce qui se trouve là-bas n'apparaît qu'une fois la route ouverte.)
    id: 'league',
    group: 'champions',
    name: 'Ouvrir la Route Victoire',
    desc: 'Vaincs les dix champions : au bout de la carte, la route du Conseil s’ouvre.',
    progress: (save) => [LEAGUE_GATE.filter((n) => save.beaten.includes(n)).length, LEAGUE_GATE.length],
    reward: { shards: 3 },
  },
  ...ELITE.map((name): Feat => ({
    id: `champ:${name}`,
    group: 'conseil',
    name: `Vaincre ${name}`,
    desc: `Un membre du Conseil : il garde le dernier étage une fois la Route Victoire ouverte.`,
    progress: beat(name),
    reward: { baies: 120, shards: 2 },
    unlocked: (save) => leagueOpen(save),
  })),
  {
    id: `champ:${LEAGUE_MASTER}`,
    group: 'conseil',
    name: 'Renverser le Maître',
    desc: `Bats ${LEAGUE_MASTER}, le Maître de la Ligue, au bout de la Route Victoire.`,
    progress: beat(LEAGUE_MASTER),
    reward: { baies: 300, shards: 6 },
    unlocked: (save) => leagueOpen(save),
  },
  ...(Object.keys(WORLD) as BiomeId[])
    .filter((b) => b !== 'prairie')
    .map((b): Feat => ({
      id: `visit:${b}`,
      group: 'monde',
      name: `Atteindre : ${BIOMES[b].name}`,
      desc: `Passe une porte de route jusqu’à ${BIOMES[b].name}.`,
      progress: (save) => [save.visited.includes(b) ? 1 : 0, 1],
      reward: { baies: 15 + 10 * WORLD[b].tier },
      // Un biome apparaît quand on a atteint un de ceux qui y mènent : la prochaine étape.
      unlocked: (save) => (Object.keys(WORLD_LINKS) as BiomeId[]).some((from) => reached(save, from) && WORLD_LINKS[from].some((l) => l.to === b)),
    })),
  {
    id: 'visit:all',
    group: 'monde',
    name: 'Cartographe',
    desc: 'Atteins chaque biome de la carte du monde.',
    progress: (save) => [Object.keys(WORLD).filter((b) => b === 'prairie' || save.visited.includes(b)).length, Object.keys(WORLD).length],
    reward: { shards: 2 },
  },
  { id: 'win:1', group: 'rebellion', name: 'Première victoire', desc: 'Gagne une run : bats le Dresseur final.', progress: (s) => [Math.min(1, s.wins), 1], reward: { baies: 100, shards: 1 } },
  { id: 'win:5', group: 'rebellion', name: 'La rébellion gronde', desc: 'Gagne cinq runs.', progress: (s) => [Math.min(5, s.wins), 5], reward: { baies: 200, shards: 3 }, unlocked: (s) => s.wins >= 1 },
  { id: 'mons:4', group: 'rebellion', name: 'Une petite bande', desc: 'Compte 4 Pokémon dans la rébellion.', progress: (s) => [Math.min(4, roster(s).length), 4], reward: { baies: 40 } },
  { id: 'mons:10', group: 'rebellion', name: 'Un vrai camp', desc: 'Compte 10 Pokémon dans la rébellion.', progress: (s) => [Math.min(10, roster(s).length), 10], reward: { baies: 100 }, unlocked: (s) => roster(s).length >= 4 },
  { id: 'mons:20', group: 'rebellion', name: 'Une armée de libres', desc: 'Compte 20 Pokémon dans la rébellion.', progress: (s) => [Math.min(20, roster(s).length), 20], reward: { baies: 200, shards: 2 }, unlocked: (s) => roster(s).length >= 10 },
];

export type FeatState = 'todo' | 'ready' | 'done';

/** L'exploit se montre au carnet : débloqué par l'avancée, ou déjà fait. */
export const featShown = (save: Save, f: Feat): boolean => featState(save, f) !== 'todo' || !f.unlocked || f.unlocked(save);

export function featState(save: Save, f: Feat): FeatState {
  if (save.feats.includes(f.id)) return 'done';
  const [n, goal] = f.progress(save);
  return n >= goal ? 'ready' : 'todo';
}

/** Les exploits faits mais pas réclamés (le « ! » du carnet). */
export const readyFeats = (save: Save): Feat[] => FEATS.filter((f) => featState(save, f) === 'ready');

/** Réclame un exploit fait : la récompense entre dans la sauvegarde. Rend false s'il n'est pas prêt. */
export function claimFeat(save: Save, id: string): boolean {
  const f = FEATS.find((x) => x.id === id);
  if (!f || featState(save, f) !== 'ready') return false;
  save.feats.push(id);
  save.baies += f.reward.baies ?? 0;
  save.shards += f.reward.shards ?? 0;
  return true;
}

/** Tous les champions des biomes vaincus : la Route Victoire est ouverte. */
export const leagueOpen = (save: Save): boolean => LEAGUE_GATE.every((n) => save.beaten.includes(n));

/** Texte d'une récompense : « 40 Baies · 1 Éclat ». */
export function rewardText(r: Feat['reward']): string {
  const parts: string[] = [];
  if (r.baies) parts.push(`${r.baies} Baies`);
  if (r.shards) parts.push(`${r.shards} Éclat${r.shards > 1 ? 's' : ''}`);
  return parts.join(' · ');
}
