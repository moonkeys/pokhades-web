import type { BiomeId } from '../data/species';
import type { CsId } from '../meta/catalog';

// La carte du monde (ajout, retour de test : « il faudrait une carte du monde
// pour savoir l'enchaînement des salles… on garde toujours la même, mais avec
// plein de chemins différents » ; « tu passes du lac à la montagne en deux
// secondes, c'est pas logique »).
//
// Elle est fixe : chaque biome a sa place, et ne mène qu'à ses voisins de
// paysage. La run part toujours de la Prairie, au sud, et monte vers le nord
// en assombrissant (DA_bible §4) : quatre étages, un par acte.
//
//               Volcan        Rocailleux        Montagne glacée
//                  │        ╱     │      ╲          │
//               Océan    Marais   Lac     ╲      Automne
//                  │    ╱      ╲  │        ╲    ╱   │
//                Plage         Village        Forêt
//                     ╲           │          ╱
//                              Prairie
//
// Les liens suivent la géographie : la Forêt jaunit en Automne, qui monte en
// Montagne ; la Plage longe la mer (Océan, avec Surf) ou s'enlise en Marais
// (une mangrove) ; le Lac se déverse au Marais ou s'adosse aux Rocailleux ;
// l'Océan finit sur une île volcanique. Aucun saut du Lac à la neige.
//
// Les positions donnent aussi le sens des portes : en sortie de boss, la porte
// d'un biome est percée sur le bord de la salle qui regarde vers lui (une
// route vers l'ouest part à l'ouest), et l'on entre dans la salle suivante par
// le bord d'en face (generate.ts, `entry`).
//
// Au-dessus des quatre étages, la Route Victoire (la zone ultime) : elle ne
// s'ouvre qu'une fois tous les champions vaincus au moins une fois
// (meta/feats.ts, leagueOpen). Elle ajoute un cinquième acte, au bout duquel
// attend le Maître de la Ligue.

/** Une branche : le biome où elle mène, et la CS qu'il faut pour la prendre. */
export interface BiomeLink {
  to: BiomeId;
  cs?: CsId;
}

/** Place d'un biome sur la carte (x vers l'est, y vers le sud, en cases de carte) et son étage (l'acte où on l'atteint). */
export const WORLD: Record<BiomeId, { x: number; y: number; tier: number }> = {
  prairie: { x: 2, y: 3, tier: 0 },
  plage: { x: 0.7, y: 2, tier: 1 },
  village: { x: 2, y: 2, tier: 1 },
  foret: { x: 3.3, y: 2, tier: 1 },
  ocean: { x: 0, y: 1, tier: 2 },
  marais: { x: 1.2, y: 1, tier: 2 },
  lac: { x: 2.3, y: 1, tier: 2 },
  automne: { x: 3.7, y: 1, tier: 2 },
  volcan: { x: 0.3, y: 0, tier: 3 },
  rocailleux: { x: 2, y: 0, tier: 3 },
  glace: { x: 3.6, y: 0, tier: 3 },
};

/** Les routes, de l'étage n à l'étage n + 1. L'Océan ne se prend qu'avec Surf. */
export const WORLD_LINKS: Record<BiomeId, readonly BiomeLink[]> = {
  prairie: [{ to: 'plage' }, { to: 'village' }, { to: 'foret' }],
  plage: [{ to: 'ocean', cs: 'surf' }, { to: 'marais' }],
  village: [{ to: 'marais' }, { to: 'lac' }],
  foret: [{ to: 'lac' }, { to: 'automne' }],
  ocean: [{ to: 'volcan' }],
  marais: [{ to: 'volcan' }, { to: 'rocailleux' }],
  lac: [{ to: 'rocailleux' }],
  automne: [{ to: 'rocailleux' }, { to: 'glace' }],
  volcan: [],
  rocailleux: [],
  glace: [],
};

/** La Route Victoire : son nom, sa place (au nord de tout) et le biome dont elle prend le décor (une route de roche). */
export const VICTORY_ROAD = { name: 'Route Victoire', x: 2, y: -1, look: 'rocailleux' as BiomeId, color: '#e8c25a' };
