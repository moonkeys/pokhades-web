import { dexOf } from './forms';
// Courbes d'expérience des jeux Pokémon : chaque espèce appartient à un groupe
// de croissance, qui donne l'XP cumulée pour atteindre le niveau n. Le jeu
// Godot n'en avait qu'une (n³, PokemonInstance._xp_for_level) : un Ronflex
// montait aussi vite qu'un Pikachu.
//
// Seules les espèces qu'on peut avoir dans l'équipe sont listées ; les autres
// suivent « moyenne » (n³), la courbe du jeu.

export type Growth = 'fast' | 'medium-fast' | 'medium-slow' | 'slow';

/** XP cumulée pour atteindre le niveau n, par groupe (formules des jeux principaux). */
export function xpAt(group: Growth, n: number): number {
  switch (group) {
    case 'fast':
      return Math.floor((4 * n ** 3) / 5);
    case 'medium-fast':
      return n ** 3;
    case 'medium-slow':
      // Négative sous le niveau 2 dans les jeux : on la borne à 0.
      return Math.max(0, Math.floor((6 * n ** 3) / 5 - 15 * n ** 2 + 100 * n - 140));
    case 'slow':
      return Math.floor((5 * n ** 3) / 4);
  }
}

export const GROWTH: Record<number, Growth> = {
  1: 'medium-slow', // Bulbizarre
  4: 'medium-slow', // Salamèche
  6: 'medium-slow', // Dracaufeu
  7: 'medium-slow', // Carapuce
  25: 'medium-fast', // Pikachu
  95: 'medium-fast', // Onix
  133: 'medium-fast', // Évoli
  143: 'slow', // Ronflex
  // Mercenaires de la boutique.
  16: 'medium-slow', // Roucool
  17: 'medium-slow', // Roucoups
  19: 'medium-fast', // Rattata
  20: 'medium-fast', // Rattatac
  43: 'medium-slow', // Mystherbe
  55: 'medium-fast', // Akwakwak
  147: 'slow', // Minidraco
  161: 'medium-fast', // Fouinette
  162: 'medium-fast', // Fouinar
  191: 'medium-slow', // Tournegrin
  246: 'slow', // Embrylex
  261: 'medium-fast', // Medhyèna
  262: 'medium-fast', // Grahyèna
  263: 'medium-fast', // Zigzaton
  328: 'medium-slow', // Kraknoix
  371: 'slow', // Draby
  374: 'slow', // Terhal
  396: 'medium-slow', // Étourmi
  399: 'medium-fast', // Keunotor
  400: 'medium-fast', // Castorno
  402: 'medium-slow', // Mélokrik
  403: 'medium-slow', // Lixy
  404: 'medium-slow', // Luxio
  443: 'slow', // Griknot
  519: 'medium-slow', // Poichigeon
  610: 'slow', // Coupenotte
  633: 'slow', // Solochi
  661: 'medium-slow', // Passerouge
  704: 'slow', // Mucuscule
  782: 'slow', // Bébécaille
  819: 'medium-fast', // Rongourmand
  885: 'slow', // Fantyrm
  996: 'slow', // Frigodo
};

export const GROWTH_FR: Record<Growth, string> = {
  fast: 'rapide',
  'medium-fast': 'moyenne',
  'medium-slow': 'parabolique',
  slow: 'lente',
};

/** Une Méga (data/megas.ts) suit la courbe de son espèce de base. */
export const growthOf = (id: number): Growth => GROWTH[dexOf(id)] ?? 'medium-fast';
