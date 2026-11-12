import type { Rng } from '../core/rng';
import type { Status } from './pokemon';

// Dons de légendaires, repris de RunBoons.gd : 10 donateurs, 83 dons (75 de
// donateur dont 10 de statistique, et 8 duos), 4 raretés. La valeur d'un don
// est sa base × l'échelle de sa rareté ; reprendre un don déjà possédé le fait
// monter d'une rareté.
//
// Le prototype ne joue qu'un Pokémon : les 9 dons qui reposent sur une équipe,
// un allié recruté, l'évolution ou les ressources du camp sont au catalogue
// mais jamais proposés (`solo: false`). « Pour toute l'équipe » et « pour le
// Pokémon piloté » reviennent donc au même ici.
//
// Ce fichier décrit les dons et tient l'état de la run ; leurs effets sont
// appliqués par combat.ts, aux mêmes points d'accroche que le jeu.

export type DonorId = 'electhor' | 'sulfura' | 'artikodin' | 'mew' | 'darkrai' | 'groudon' | 'celebi' | 'hooh' | 'rayquaza' | 'jirachi';

export interface Donor {
  name: string;
  dex: number;
  type: string;
  sym: string;
  line: string;
  ult: string;
}

/** RunBoons.GODS (RB:97-108) et ULTIMATES (RB:390-401). */
export const DONORS: Record<DonorId, Donor> = {
  electhor: { name: 'Électhor', dex: 145, type: 'electric', sym: '⚡', line: "Prends ma foudre. Qu'elle ne frappe plus jamais une seule cible.", ult: 'Tonnerre' },
  sulfura: { name: 'Sulfura', dex: 146, type: 'fire', sym: '🔥', line: "Ce que j'allume ne s'éteint pas. Laisse le sol brûler derrière toi.", ult: 'Déflagration' },
  artikodin: { name: 'Artikodin', dex: 144, type: 'ice', sym: '❄', line: "Un ennemi immobile n'a jamais touché personne. Fige-les.", ult: 'Blizzard' },
  mew: { name: 'Mew', dex: 151, type: 'psychic', sym: '✧', line: "Tu n'es pas seul sur ce terrain. Je te donne les autres.", ult: 'Psycho-Boost' },
  darkrai: { name: 'Darkrai', dex: 491, type: 'dark', sym: '☾', line: 'Je peux te rendre terrible. Tu paieras — mais plus tard.', ult: 'Trou Noir' },
  groudon: { name: 'Groudon', dex: 383, type: 'ground', sym: '◆', line: "On ne t'esquivera plus. Deviens ce qu'on subit.", ult: 'Fin du Monde' },
  celebi: { name: 'Célébi', dex: 251, type: 'grass', sym: '❃', line: "Recommence autant qu'il faudra. Je te rends le temps.", ult: 'Distorsion' },
  hooh: { name: 'Ho-Oh', dex: 250, type: 'fire', sym: '✹', line: 'Tombe si tu veux. Tu te relèveras plus grand.', ult: 'Rapace Sacré' },
  rayquaza: { name: 'Rayquaza', dex: 384, type: 'dragon', sym: '➤', line: "Trop haut pour qu'on te suive. Va vite, ne t'arrête jamais.", ult: 'Draco-Ascension' },
  jirachi: { name: 'Jirachi', dex: 385, type: 'steel', sym: '★', line: 'Fais un vœu. Je te rembourserai au centuple.', ult: 'Météore' },
};
export const DONOR_IDS = Object.keys(DONORS) as DonorId[];

/** Ce que montre l'écran sous la description : comment lire la valeur. */
type Fmt = 'pct' | 'radius' | 'sec' | 'mult' | 'count' | 'money' | 'flag' | 'stat';

export interface BoonDef {
  id: string;
  /** Donateur ; pour un duo, les deux. */
  god: DonorId | 'duo';
  duo?: [DonorId, DonorId];
  name: string;
  /** T : toute l'équipe ; S : le Pokémon qui le porte. */
  scope: 'S' | 'T';
  base: number;
  fmt: Fmt;
  desc: string;
  /** Faux : repose sur un système absent du prototype, jamais proposé. */
  solo: boolean;
}

const b = (id: string, god: BoonDef['god'], name: string, scope: 'S' | 'T', base: number, fmt: Fmt, desc: string, solo = true, duo?: [DonorId, DonorId]): BoonDef => ({
  id,
  god,
  duo,
  name,
  scope,
  base,
  fmt,
  desc,
  solo,
});

/** RunBoons.CATALOG (RB:124-347). Descriptions du jeu, ajustées là où le prototype diffère. */
const LIST: BoonDef[] = [
  b('elec_ricochet', 'electhor', 'Arc Vagabond', 'S', 0.4, 'pct', 'Tes attaques de mêlée ricochent sur un 2ᵉ ennemi proche.'),
  b('elec_static', 'electhor', 'Décharge Statique', 'S', 3.5, 'mult', 'Tous les 10 coups, tu te décharges en zone autour de toi.'),
  b('elec_dash', 'electhor', 'Nerf à Vif', 'S', 1, 'flag', 'Ton dash laisse un sillage qui paralyse.'),
  b('elec_finisher', 'electhor', 'Fusible', 'S', 4, 'radius', 'Ton finisher paralyse tout autour de la cible.'),
  b('elec_network', 'electhor', 'Réseau', 'T', 0.25, 'pct', 'Les ennemis paralysés subissent plus de dégâts.'),
  b('elec_split', 'electhor', 'Surtension', 'S', 0.45, 'pct', "Tes tirs frappent aussi un second ennemi à l'impact."),
  b('elec_storm', 'electhor', 'Orage', 'T', 8, 'sec', "La foudre frappe régulièrement l'ennemi le plus coriace de la salle."),
  b('elec_range', 'electhor', 'Portée', 'S', 1, 'stat', 'Tes attaques portent plus loin.'),
  b('feu_burn', 'sulfura', 'Braises', 'S', 1, 'flag', 'Tes coups brûlent à coup sûr.'),
  b('feu_finisher', 'sulfura', 'Terre Brûlée', 'S', 4.5, 'radius', 'Ton finisher embrase tout autour de la cible.'),
  b('feu_dash', 'sulfura', 'Traînée', 'S', 1, 'flag', 'Ton dash laisse un chemin de flammes.'),
  b('feu_poise', 'sulfura', 'Attisement', 'T', 1, 'flag', 'Frapper un ennemi qui brûle le fait reculer, ténacité ignorée.'),
  b('feu_phoenix', 'sulfura', 'Phénix', 'T', 0.3, 'pct', 'Une fois par salle, tu te relèves au lieu de tomber K.O.'),
  b('feu_kill', 'sulfura', 'Colère du Volcan', 'T', 4, 'radius', 'Chaque ennemi tué embrase ses voisins.'),
  b('feu_cauldron', 'sulfura', 'Chaudron', 'T', 2, 'mult', 'Tes brûlures durent bien plus longtemps.'),
  b('feu_fury', 'sulfura', 'Fureur', 'S', 1, 'stat', 'Attaque nettement augmentée.'),
  b('glace_freeze', 'artikodin', 'Souffle Gelé', 'S', 0.12, 'pct', 'Chaque coup peut geler.'),
  b('glace_dash', 'artikodin', 'Verglas', 'S', 1, 'flag', "Ton dash gèle ce qu'il traverse."),
  b('glace_shatter', 'artikodin', 'Éclat', 'T', 0.7, 'pct', 'Frapper un ennemi gelé le brise — dégâts majorés, le gel saute au voisin.'),
  b('glace_finisher', 'artikodin', 'Blizzard de Poche', 'S', 0.5, 'pct', 'Ton finisher ralentit toute la salle.'),
  b('glace_shield', 'artikodin', 'Armure de Givre', 'T', 0.6, 'pct', 'Un bouclier absorbe une partie du premier coup encaissé.'),
  b('glace_execute', 'artikodin', 'Zéro Absolu', 'T', 0.15, 'pct', 'Un sauvage affaibli gèle net dès que tu le touches.'),
  b('glace_ward', 'artikodin', 'Rempart de Givre', 'S', 1, 'stat', 'Défense Spéciale nettement augmentée.'),
  b('glace_hail', 'artikodin', 'Grêle', 'S', 0.4, 'pct', 'Tes tirs laissent une nappe de froid qui ralentit ce qui la traverse.'),
  b('psy_empathy', 'mew', 'Empathie', 'T', 0.3, 'pct', 'Tes compagnons IA infligent plus de dégâts.', false),
  b('psy_transfer', 'mew', 'Transfert', 'T', 0.08, 'pct', 'Une part de tes dégâts te soigne.'),
  b('psy_morph', 'mew', 'Morphing', 'S', 1, 'flag', 'Tes attaques de type Normal prennent le type le plus efficace contre la cible.'),
  b('psy_finisher', 'mew', 'Lien Psychique', 'S', 1, 'flag', "Ton finisher déclenche l'attaque de tous tes compagnons.", false),
  b('psy_summon', 'mew', 'Invocation', 'T', 1, 'flag', 'Un allié rejoint ton équipe sur-le-champ, pour toute la run.', false),
  b('psy_focus', 'mew', 'Concentration', 'S', 1, 'stat', 'Attaque Spéciale nettement augmentée.'),
  b('psy_premonition', 'mew', 'Prémonition', 'S', 1, 'flag', 'Un coup évité par ton dash est renvoyé en entier au plus proche.'),
  b('psy_hivemind', 'mew', 'Conscience Collective', 'T', 1, 'flag', 'Tes compagnons copient la capacité que tu as sélectionnée.', false),
  b('tenb_sleep', 'darkrai', 'Cauchemar', 'S', 0.15, 'pct', 'Tes coups endorment ; les endormis encaissent double.'),
  b('tenb_steal', 'darkrai', 'Vol d’Ombre', 'S', 0.25, 'pct', 'Tu frappes plus fort, mais tu perds des PV max à chaque salle.'),
  b('tenb_execute', 'darkrai', 'Exécution', 'S', 0.15, 'pct', 'Ton finisher achève net un sauvage déjà bas (pas un Pokémon de champion).'),
  // Le dash rend déjà invulnérable dans le prototype : Ombre Portée prolonge cette invulnérabilité.
  b('tenb_phase', 'darkrai', 'Ombre Portée', 'S', 1, 'flag', 'Tu restes intangible un instant de plus après ton dash.'),
  b('tenb_lastbreath', 'darkrai', 'Dernier Souffle', 'T', 0.5, 'pct', 'Sous 30 % de PV, tu cognes plus fort et plus vite.'),
  b('tenb_debt', 'darkrai', 'Dette', 'T', 1, 'flag', 'Tu encaisses le double, mais tous les dons trouvés montent d’une rareté.'),
  b('tenb_precision', 'darkrai', 'Point Faible', 'S', 1, 'stat', 'Tes coups critiques deviennent fréquents.'),
  b('tenb_void', 'darkrai', 'Vide', 'T', 8, 'sec', 'Chaque ennemi tué laisse une ombre qui ronge ce qui la traverse.'),
  b('sol_reach', 'groudon', 'Séisme', 'S', 0.5, 'pct', 'Tes attaques portent plus loin.'),
  b('sol_finisher', 'groudon', 'Impact', 'S', 0.6, 'pct', 'Ton finisher frappe en zone et étourdit.'),
  b('sol_dash', 'groudon', 'Charge', 'S', 0.55, 'pct', 'Ton dash inflige des dégâts et repousse.'),
  b('sol_steady', 'groudon', 'Inébranlable', 'T', 1, 'flag', 'Rien ne t’immobilise : gel, sommeil et paralysie se dissipent aussitôt.'),
  b('sol_shell', 'groudon', 'Carapace', 'T', 0.08, 'pct', 'Chaque salle libérée sans encaisser de coup augmente tes PV max.'),
  b('sol_thorns', 'groudon', 'Épines', 'T', 0.3, 'pct', 'Une part des dégâts encaissés est renvoyée à l’agresseur.'),
  b('sol_bulk', 'groudon', 'Masse', 'S', 1, 'stat', 'PV maximum nettement augmentés.'),
  b('sol_guard', 'groudon', 'Rempart', 'S', 1, 'stat', 'Défense nettement augmentée.'),
  b('sol_continent', 'groudon', 'Continent', 'S', 0.55, 'pct', 'Tous les cinq coups, une faille s’ouvre sous ta cible.'),
  b('temps_cooldown', 'celebi', 'Feuillage', 'T', 0.15, 'pct', 'Toutes tes cadences sont raccourcies.'),
  b('temps_regen', 'celebi', 'Sève', 'T', 0.015, 'pct', 'Tu régénères tant que tu ne prends pas de coup.'),
  b('temps_finisher', 'celebi', 'Vrille', 'S', 1, 'flag', 'Ton finisher recharge instantanément tes capacités.'),
  b('temps_speed', 'celebi', 'Printemps', 'T', 0.2, 'pct', 'Tu te déplaces et tu frappes plus vite à chaque nouvelle salle.'),
  b('temps_journey', 'celebi', 'Voyage', 'T', 0.08, 'pct', 'Tu entres dans chaque salle cadences pleines, dash rechargé et soigné d’une part de tes PV.'),
  b('temps_haste', 'celebi', 'Hâte', 'S', 1, 'stat', 'Tes capacités reviennent plus vite.'),
  b('temps_rewind', 'celebi', 'Rembobinage', 'S', 1, 'flag', 'Ton dash te ramène à la position et aux PV d’il y a trois secondes.'),
  b('sacre_lifesteal', 'hooh', 'Flamme Sacrée', 'S', 0.05, 'pct', 'Tes coups brûlent et te soignent.'),
  b('sacre_xp', 'hooh', 'Cendres', 'T', 0.25, 'pct', 'Tu gagnes plus d’XP sur chaque ennemi vaincu.'),
  b('sacre_revive', 'hooh', 'Résurrection', 'T', 0.3, 'pct', 'Un compagnon K.O. se relève à la fin de chaque salle.', false),
  b('sacre_level', 'hooh', 'Ascension', 'T', 2, 'count', 'Toute l’équipe monte d’un niveau toutes les deux salles.', false),
  b('sacre_finisher', 'hooh', 'Plumage', 'S', 0.1, 'pct', 'Ton finisher te soigne.'),
  b('sacre_rebirth', 'hooh', 'Renaissance', 'T', 1, 'flag', 'Une fois par run, tu te relèves à moitié de tes PV au lieu de tomber.'),
  b('dragon_dash_charge', 'rayquaza', 'Ozone', 'T', 1, 'count', 'Des charges de dash supplémentaires.'),
  b('dragon_dash_hit', 'rayquaza', 'Piqué', 'S', 0.7, 'pct', 'Dasher dans un ennemi le frappe.'),
  b('dragon_momentum', 'rayquaza', 'Ascendant', 'S', 0.08, 'pct', 'Chaque ennemi tué dans la salle te rend plus rapide.'),
  b('dragon_finisher', 'rayquaza', 'Turbulence', 'S', 1, 'flag', 'Ton finisher te rend une charge de dash.'),
  b('dragon_delta', 'rayquaza', 'Delta', 'S', 0.3, 'pct', 'Tes cadences fondent tant que tu restes en mouvement.'),
  b('dragon_swift', 'rayquaza', 'Célérité', 'S', 1, 'stat', 'Vitesse de déplacement et de frappe augmentée.'),
  b('dragon_evade', 'rayquaza', 'Insaisissable', 'S', 1, 'stat', 'Tu esquives une partie des coups.'),
  b('astre_coin', 'jirachi', 'Étoile Filante', 'S', 0.1, 'pct', 'Tes coups font parfois tomber des Pokédollars.'),
  b('astre_bounty', 'jirachi', 'Aubaine', 'T', 0.8, 'money', 'Les salles libérées rapportent davantage.'),
  b('astre_wish', 'jirachi', 'Souhait', 'T', 1, 'flag', 'Une fois par salle, un coup fatal te laisse à 1 PV.'),
  b('astre_finisher', 'jirachi', 'Fortune', 'S', 0.12, 'pct', 'Ton finisher te soigne.'),
  b('astre_resource', 'jirachi', 'Pluie d’Étoiles', 'T', 2, 'count', 'Les salles libérées livrent aussi des ressources de camp.', false),
  b('astre_wish_granted', 'jirachi', 'Vœu Exaucé', 'T', 1, 'flag', 'À chaque nouvel acte, un don que tu possèdes déjà monte d’une rareté.'),
  b('duo_firestorm', 'duo', 'Tempête de Feu', 'S', 1, 'flag', 'Tes ricochets enflamment tout ce qu’ils touchent.', true, ['electhor', 'sulfura']),
  b('duo_whitebolt', 'duo', 'Foudre Blanche', 'S', 0.8, 'pct', 'Frapper un ennemi gelé le fait exploser en arcs électriques.', true, ['electhor', 'artikodin']),
  b('duo_eruption', 'duo', 'Éruption', 'S', 6, 'radius', 'Ton finisher embrase ET projette tout un rayon.', true, ['sulfura', 'groudon']),
  b('duo_winter', 'duo', 'Hiver Perpétuel', 'T', 4, 'mult', 'Le gel dure bien plus longtemps.', true, ['artikodin', 'celebi']),
  b('duo_sacrifice', 'duo', 'Sacrifice', 'T', 0.35, 'pct', 'Quand un compagnon tombe, tu absorbes sa force jusqu’à la fin de la salle.', false, ['mew', 'darkrai']),
  b('duo_roots', 'duo', 'Racines', 'S', 2, 'sec', 'Rester immobile quelques secondes recharge tout : capacités, dash, bouclier.', true, ['groudon', 'celebi']),
  b('duo_shortcircuit', 'duo', 'Court-Circuit', 'T', 7, 'radius', 'Chaque ennemi tué paralyse ses voisins.', true, ['darkrai', 'electhor']),
  b('duo_goldphoenix', 'duo', 'Phénix Doré', 'T', 1, 'flag', 'Chaque évolution déclenchée en run remplit ta jauge d’ultime.', false, ['hooh', 'jirachi']),
];
export const BOONS: Record<string, BoonDef> = Object.fromEntries(LIST.map((d) => [d.id, d]));

/**
 * Dons de statistique (RB.STAT_EFFECTS) : appliqués à chaque prise, sans
 * effet de rareté (le reprendre ajoute la même hausse). Rééquilibrage du
 * 12 novembre 2026 : +25 % au lieu de +20 % (ils pâlissaient à côté des
 * autres dons, qui eux montent avec la rareté).
 */
export const STAT_BOONS: Record<string, { label: string; apply: 'atk' | 'def' | 'spAtk' | 'spDef' | 'speed' | 'range' | 'cooldown' | 'crit' | 'dodge' | 'hp'; value: number }> = {
  sol_bulk: { label: 'PV max +25 %', apply: 'hp', value: 1.25 },
  sol_guard: { label: 'Défense +25 %', apply: 'def', value: 1.25 },
  glace_ward: { label: 'Défense Spé +25 %', apply: 'spDef', value: 1.25 },
  dragon_swift: { label: 'Vitesse +25 %', apply: 'speed', value: 1.25 },
  dragon_evade: { label: 'Esquive +12 pts', apply: 'dodge', value: 0.12 },
  feu_fury: { label: 'Attaque +25 %', apply: 'atk', value: 1.25 },
  psy_focus: { label: 'Attaque Spé +25 %', apply: 'spAtk', value: 1.25 },
  tenb_precision: { label: 'Critique +15 pts', apply: 'crit', value: 0.15 },
  temps_haste: { label: 'Cadence −18 %', apply: 'cooldown', value: 0.82 },
  elec_range: { label: 'Portée +25 %', apply: 'range', value: 1.25 },
};

/** RB:63-84 : échelle de valeur, noms, couleurs (fond nuit). */
// Rééquilibrage (retour de test du 11 novembre 2026, « rééquilibrer les dons ») :
// ×1,4 / ×1,85 / ×2,4 au lieu de ×1,5 / ×2,2 / ×3. Au Prismatique, plusieurs
// dons devenaient écrasants (Éclat +450 % sur un gelé, Décharge Statique ×18,
// Transfert et Flamme Sacrée cumulés rendaient ~70 % des dégâts en PV) ; leurs
// bases ont aussi baissé, et les dons trop faibles ont été relevés (Voyage
// soigne, Prémonition renvoie tout, Inébranlable lève aussi la paralysie,
// Aubaine rapporte plus, dons de statistique à +25 %).
export const RARITY_SCALE = [1, 1.4, 1.85, 2.4];
export const RARITY_NAME = ['Commun', 'Rare', 'Épique', 'Prismatique'];
export const RARITY_COLOR = ['#e3c287', '#57b04a', '#f2c24f', '#40e0d1'];

/** Valeur d'un don à une rareté. */
export function boonValue(id: string, rarity: number): number {
  return (BOONS[id]?.base ?? 0) * RARITY_SCALE[rarity];
}

/** Ce que vaut le don, en clair, pour la carte de l'écran de choix. */
export function valueText(id: string, rarity: number): string {
  const def = BOONS[id];
  if (!def) return '';
  const v = boonValue(id, rarity);
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  switch (def.fmt) {
    case 'pct':
      return pct(id === 'glace_finisher' || id === 'glace_hail' ? Math.min(id === 'glace_hail' ? 0.85 : 0.75, v) : id === 'temps_cooldown' || id === 'dragon_delta' ? Math.min(0.75, v) : id === 'glace_shield' ? Math.min(1, v) : v) + (id === 'temps_regen' ? ' des PV par seconde' : '');
    case 'radius':
      return `rayon ${Math.round(v * 10) / 10} cases`;
    case 'sec':
      return `${Math.round(v * 10) / 10} s`;
    case 'mult':
      return `×${Math.round(v * 10) / 10}`;
    case 'count':
      return `+${Math.round(v)}`;
    case 'money':
      return `+${Math.round(60 * v)} ₽ par salle`;
    case 'stat':
      return STAT_BOONS[id]?.label ?? '';
    case 'flag':
      return '';
  }
}

/** Une carte de l'écran de dons. */
export interface BoonCard {
  /** Id du don, ou `__ult__<donateur>` pour une ultime. */
  id: string;
  rarity: number;
  /** Rareté qu'aura le don une fois pris (montée d'un cran s'il est déjà possédé). */
  result: number;
}

export interface BoonOffer {
  donor: DonorId;
  cards: BoonCard[];
}

/** État de la run : dons possédés et compteurs des effets. */
export class Boons {
  /** Id → rareté (0 à 3). */
  readonly owned = new Map<string, number>();
  ult: DonorId | null = null;
  ultGauge = 0;
  // Compteurs (RunBoons : _static_count, _shield_ready, _phoenix_used…).
  hits = 0;
  shieldReady = true;
  shieldT = 0;
  phoenixUsed = false;
  wishUsed = false;
  rebirthUsed = false;
  roomHurts = 0;
  roomKills = 0;
  sinceHurt = 0;
  stormT = 0;
  stillT = 0;
  /** Crans de rareté ajoutés à la prochaine offre (pacte de l'Autel maudit), remis à 0 après elle. */
  bonus = 0;

  has(id: string): boolean {
    return this.owned.has(id);
  }

  /** Valeur du don possédé (0 s'il ne l'est pas). */
  v(id: string): number {
    const r = this.owned.get(id);
    return r === undefined ? 0 : boonValue(id, r);
  }

  /** RunBoons.grant : la rareté tirée, ou un cran au-dessus de celle qu'on a déjà. */
  grant(id: string, rarity: number): number {
    const cur = this.owned.get(id);
    const r = Math.min(3, cur === undefined ? rarity : Math.max(rarity, cur + 1));
    this.owned.set(id, r);
    return r;
  }

  /** Dons encore proposables d'un donateur : jouables seuls et pas encore prismatiques. */
  private offerableFrom(god: DonorId): string[] {
    return LIST.filter((d) => d.god === god && d.solo && (this.owned.get(d.id) ?? -1) < 3).map((d) => d.id);
  }

  /** Duo débloqué : au moins un don de chacun des deux donateurs. */
  private duosFor(god: DonorId): string[] {
    const hasFrom = (g: DonorId) => [...this.owned.keys()].some((id) => BOONS[id]?.god === g);
    return LIST.filter((d) => d.duo && d.solo && d.duo.includes(god) && hasFrom(d.duo[0]) && hasFrom(d.duo[1]) && (this.owned.get(d.id) ?? -1) < 3).map((d) => d.id);
  }

  /**
   * CombatArena._roll_boon_rarity : Épique sous 0,10 + 0,02 × salle, Rare sous
   * 0,35 + 0,03 × salle, Commun sinon ; +1 cran si la salle s'est passée sans
   * encaisser un coup, +1 avec Dette.
   */
  rollRarity(rng: Rng, room: number): number {
    const roll = rng.next();
    let r = roll < 0.1 + 0.02 * room ? 2 : roll < 0.35 + 0.03 * room ? 1 : 0;
    if (this.roomHurts === 0) r++;
    if (this.has('tenb_debt')) r++;
    return Math.min(3, r + this.bonus);
  }

  /**
   * CombatArena._roll_god_boons : un seul donateur (le premier, dans un ordre
   * mélangé, qui a au moins 3 dons à offrir), 3 cartes. La 1re est un duo s'il y
   * en a un de débloqué avec lui, la 3e son ultime à partir de l'acte 2.
   * `prefer` : le donateur annoncé par la porte (pickDonor), s'il a encore
   * 3 dons à offrir ; sinon (des dons pris entre-temps l'ont épuisé), un autre.
   */
  offer(rng: Rng, room: number, act: number, prefer?: DonorId): BoonOffer | null {
    const god = prefer && this.offerableFrom(prefer).length >= 3 ? prefer : this.pickDonor(rng);
    if (!god) return null;
    const pool = this.offerableFrom(god);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const card = (id: string): BoonCard => {
      const rarity = this.rollRarity(rng, room);
      const cur = this.owned.get(id);
      return { id, rarity, result: Math.min(3, cur === undefined ? rarity : Math.max(rarity, cur + 1)) };
    };
    const cards: BoonCard[] = [];
    const duo = this.duosFor(god)[0];
    if (duo) cards.push(card(duo));
    while (cards.length < 3 && pool.length) cards.push(card(pool.shift()!));
    if (act >= 1 && this.ult !== god) cards[2] = { id: `__ult__${god}`, rarity: 3, result: 3 };
    return { donor: god, cards };
  }

  /** Un donateur au hasard parmi ceux qui ont encore au moins 3 dons à offrir (null : aucun). */
  pickDonor(rng: Rng): DonorId | null {
    const gods = [...DONOR_IDS];
    for (let i = gods.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [gods[i], gods[j]] = [gods[j], gods[i]];
    }
    return gods.find((g) => this.offerableFrom(g).length >= 3) ?? null;
  }

  /** Vœu Exaucé : un don possédé au hasard (non prismatique) monte d'un cran. */
  wishGranted(rng: Rng): string | null {
    const ids = [...this.owned].filter(([id, r]) => r < 3 && !STAT_BOONS[id]).map(([id]) => id);
    if (!ids.length) return null;
    const id = rng.pick(ids);
    this.owned.set(id, this.owned.get(id)! + 1);
    return id;
  }

  /** Nouvelle salle : les effets « une fois par salle » se réarment. */
  enterRoom(): void {
    this.phoenixUsed = false;
    this.wishUsed = false;
    this.shieldReady = true;
    this.roomHurts = 0;
    this.roomKills = 0;
    this.hits = 0;
  }
}

/** Ultime : jauge de 1 000 (RB.ULT_MAX), +1 par dégât infligé, +4 par dégât encaissé. */
export const ULT_MAX = 1000;
/** Puissance d'une ultime : puissance de la 1re capacité × 6, en dégâts bruts (CA.ULT_POWER_MULT). */
export const ULT_POWER_MULT = 6;

/** Statut forcé à chaque coup par un don (RunBoons.forced_status), sinon null : le type décide. */
export function forcedStatus(boons: Boons, random: () => number): Status | null {
  if (boons.has('feu_burn') || boons.has('sacre_lifesteal')) return 'burn';
  if (boons.has('glace_freeze') && random() < boons.v('glace_freeze')) return 'freeze';
  if (boons.has('tenb_sleep') && random() < boons.v('tenb_sleep')) return 'sleep';
  return null;
}
