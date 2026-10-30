// Planches d'attaque d'Essentials (Graphics/Animations, cases de 192 px) :
// quelle planche jouer pour un type, ou pour une capacité précise.
//
// Données pures (sans DOM) : lues par le jeu (render/combatfx.ts) et par
// scripts/import-assets.ts, qui ne copie que les planches listées ici.
//
// Le jeu associe une planche par type (AttackAnim.gd:17-41), mais plusieurs
// choix n'avaient rien à voir avec le type : Combat, Plante, Dragon et Poison
// rejouaient une même explosion de rayures arc-en-ciel, Spectre un vortex
// violet, Roche des cailloux minuscules. Ils sont remplacés par la planche
// d'Essentials qui montre vraiment le type. Beaucoup de planches en
// regroupent plusieurs (voire une case de crédits) : `frames` garde la plage
// de cases utile, comptée parmi les cases non vides, bornes comprises.

export interface AttackSheet {
  file: string;
  frames?: [number, number];
  /** Teinte multipliée (le jeu en donnait à Plante, Insecte, Poison, Dragon). */
  tint?: string;
}

/** Une planche par type. */
export const TYPE_SHEETS: Record<string, AttackSheet> = {
  normal: { file: '003-Attack01', frames: [0, 4] },
  fighting: { file: '011-Weapon06', frames: [1, 6] },
  fire: { file: 'fire5', frames: [0, 8] },
  water: { file: '018-Water01' },
  electric: { file: 'Thunder2' },
  ice: { file: 'Ice1' },
  grass: { file: 'grass2', frames: [0, 8] },
  ground: { file: 'Earth1' },
  rock: { file: 'rockice', frames: [0, 4] },
  flying: { file: 'Wind1', frames: [0, 7] },
  psychic: { file: 'Psycho Cut', frames: [0, 6] },
  bug: { file: 'Sword6', frames: [6, 15], tint: '#bfff8c' },
  ghost: { file: 'ghost1', frames: [0, 7] },
  dark: { file: 'Crunch', frames: [0, 11] },
  steel: { file: 'Iron Head', frames: [0, 3] },
  poison: { file: 'poison', frames: [0, 8] },
  dragon: { file: 'dragon claw', frames: [0, 11] },
  fairy: { file: 'Light1', tint: '#ffb3e0' },
  // Effets de dons : hausse de stats, soin (AttackAnim.gd).
  fx_boost: { file: '028-State01' },
  fx_heal: { file: 'Heal5' },
};

/** Capacités qui ont leur propre planche (sinon : celle de leur type). */
export const MOVE_SHEETS: Record<string, AttackSheet> = {
  // Électrik : petits éclairs pour les petites attaques, déflagration pour les grosses.
  'thunder-shock': { file: 'electric2', frames: [0, 7] },
  spark: { file: 'electric2', frames: [0, 7] },
  thunderbolt: { file: 'electric1', frames: [0, 8] },
  thunder: { file: 'electric1', frames: [0, 8] },
  // Normal
  scratch: { file: '004-Attack02' },
  'fury-swipes': { file: '004-Attack02' },
  slash: { file: '004-Attack02' },
  'fake-out': { file: 'Fakeout' },
  'aerial-ace': { file: 'Aerial Ace', frames: [0, 3] },
  growl: { file: 'Growl' },
  // Ténèbres : les crocs
  bite: { file: 'Crunch', frames: [0, 11] },
  crunch: { file: 'Crunch', frames: [0, 11] },
  // Feu
  ember: { file: 'fire5', frames: [0, 8] },
  flamethrower: { file: 'fire5', frames: [0, 8] },
  'fire-blast': { file: 'fire blast', frames: [0, 9] },
  // Eau
  surf: { file: 'water3', frames: [1, 9] },
  'water-pulse': { file: 'Water pulse' },
  // Glace
  'ice-beam': { file: 'icewater', frames: [7, 14] },
  'powder-snow': { file: 'icewater', frames: [0, 6] },
  // Plante
  'leech-seed': { file: 'leech-seed' },
  'vine-whip': { file: 'grass2', frames: [0, 8] },
  // Psy
  psychic: { file: 'estranho' },
  'psycho-cut': { file: 'Psycho Cut', frames: [0, 6] },
  // Roche, Sol
  'rock-slide': { file: 'rockice', frames: [0, 4] },
  'rock-tomb': { file: 'Rock Tomb' },
  'ancient-power': { file: 'Ancient-PowerFilesheet', frames: [0, 8] },
  'sand-attack': { file: 'Sand-Attack' },
  earthquake: { file: 'Earth1' },
  // Dragon, Insecte, Acier, Spectre
  'dragon-claw': { file: 'dragon claw', frames: [0, 11] },
  'x-scissor': { file: 'X-Scizzor' },
  'iron-head': { file: 'Iron Head', frames: [0, 3] },
  'shadow-claw': { file: 'Scratch + Shadow Claw', frames: [5, 9] },
  'shadow-ball': { file: 'estranho', tint: '#9a7ad9' },
};

/** Toutes les planches à embarquer. */
export function attackSheetFiles(): string[] {
  return [...new Set([...Object.values(TYPE_SHEETS), ...Object.values(MOVE_SHEETS)].map((s) => s.file))];
}
