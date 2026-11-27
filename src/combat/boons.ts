import type { Rng } from '../core/rng';
import type { Status } from './pokemon';

// Dons de légendaires, repris de RunBoons.gd : 10 donateurs, 84 dons (76 de
// donateur dont 10 de statistique, et 8 duos), 4 raretés. La valeur d'un don
// est sa base × l'échelle de sa rareté ; reprendre un don déjà possédé le fait
// monter d'une rareté.
//
// Le prototype ne jouait qu'un Pokémon : les 9 dons qui reposent sur une équipe,
// un allié recruté, l'évolution ou les ressources du camp restaient au catalogue
// sans être proposés (`solo: false`). L'équipe et ses compagnons sont arrivés
// depuis : à la revue du 27 novembre 2026 (« j'ai l'impression que plein de dons
// ne marchent pas, à vérifier tous »), sept d'entre eux sont branchés. Ceux qui
// demandent des compagnons (`TEAM_BOONS`) ne sont proposés qu'à une équipe d'au
// moins deux. Restent hors jeu Invocation et Conscience Collective.
//
// Ce fichier décrit les dons et tient l'état de la run ; leurs effets sont
// appliqués par combat.ts, aux mêmes points d'accroche que le jeu.

export type DonorId = 'electhor' | 'sulfura' | 'artikodin' | 'mew' | 'darkrai' | 'groudon' | 'celebi' | 'hooh' | 'rayquaza' | 'jirachi';

export interface Donor {
  name: string;
  dex: number;
  type: string;
  line: string;
  ult: string;
}

/** RunBoons.GODS (RB:97-108) et ULTIMATES (RB:390-401). */
export const DONORS: Record<DonorId, Donor> = {
  electhor: { name: 'Électhor', dex: 145, type: 'electric', line: "Prends ma foudre. Qu'elle ne frappe plus jamais une seule cible.", ult: 'Tonnerre' },
  sulfura: { name: 'Sulfura', dex: 146, type: 'fire', line: "Ce que j'allume ne s'éteint pas. Laisse le sol brûler derrière toi.", ult: 'Déflagration' },
  artikodin: { name: 'Artikodin', dex: 144, type: 'ice', line: "Un ennemi immobile n'a jamais touché personne. Fige-les.", ult: 'Blizzard' },
  mew: { name: 'Mew', dex: 151, type: 'psychic', line: "Tu n'es pas seul sur ce terrain. Je te donne les autres.", ult: 'Psycho-Boost' },
  darkrai: { name: 'Darkrai', dex: 491, type: 'dark', line: 'Je peux te rendre terrible. Tu paieras — mais plus tard.', ult: 'Trou Noir' },
  groudon: { name: 'Groudon', dex: 383, type: 'ground', line: "On ne t'esquivera plus. Deviens ce qu'on subit.", ult: 'Fin du Monde' },
  celebi: { name: 'Célébi', dex: 251, type: 'grass', line: "Recommence autant qu'il faudra. Je te rends le temps.", ult: 'Distorsion' },
  hooh: { name: 'Ho-Oh', dex: 250, type: 'fire', line: 'Tombe si tu veux. Tu te relèveras plus grand.', ult: 'Rapace Sacré' },
  rayquaza: { name: 'Rayquaza', dex: 384, type: 'dragon', line: "Trop haut pour qu'on te suive. Va vite, ne t'arrête jamais.", ult: 'Draco-Ascension' },
  jirachi: { name: 'Jirachi', dex: 385, type: 'steel', line: 'Fais un vœu. Je te rembourserai au centuple.', ult: 'Météore' },
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
  base: number;
  fmt: Fmt;
  desc: string;
  /** Faux : repose sur un système absent du prototype, jamais proposé. */
  solo: boolean;
}

// Plus de portée « Ton Pokémon » / « Toute l'équipe » (le jeu Godot les distinguait) : depuis le
// 27 novembre 2026, tout don vaut pour chaque Pokémon de l'équipe, compagnons et invités en ligne
// compris (« on ne fait plus de dons que pour un Pokémon, sinon c'est compliqué en multi »).
const b = (id: string, god: BoonDef['god'], name: string, base: number, fmt: Fmt, desc: string, solo = true, duo?: [DonorId, DonorId]): BoonDef => ({
  id,
  god,
  duo,
  name,
  base,
  fmt,
  desc,
  solo,
});

/** RunBoons.CATALOG (RB:124-347). Descriptions du jeu, ajustées là où le prototype diffère. */
const LIST: BoonDef[] = [
  b('elec_ricochet', 'electhor', 'Arc Vagabond', 0.4, 'pct', 'Tes attaques de mêlée ricochent sur un 2ᵉ ennemi proche.'),
  b('elec_static', 'electhor', 'Décharge Statique', 3.5, 'mult', 'Tous les 10 coups, tu te décharges en zone autour de toi.'),
  b('elec_dash', 'electhor', 'Nerf à Vif', 1, 'flag', 'Ton dash laisse un sillage qui paralyse.'),
  b('elec_finisher', 'electhor', 'Fusible', 4, 'radius', 'Ton finisher paralyse tout autour de la cible.'),
  b('elec_network', 'electhor', 'Réseau', 0.25, 'pct', 'Les ennemis paralysés subissent plus de dégâts.'),
  // Surtension : un vrai rebond d'ennemi en ennemi, avec l'attaque elle-même (une Flammèche rebondit
  // en Flammèche), et plus de rebonds à chaque rareté. Elle ne frappait qu'un second ennemi, d'un
  // chiffre électrique sans animation : retour du 27 novembre 2026, « des flammèches qui rebondissent
  // de Pokémon en Pokémon adverse, comme dans Hades ».
  b('elec_split', 'electhor', 'Surtension', 1, 'count', 'Tes tirs rebondissent d’ennemi en ennemi, à 60 % du coup précédent à chaque rebond.'),
  b('elec_storm', 'electhor', 'Orage', 8, 'sec', "La foudre frappe régulièrement l'ennemi le plus coriace de la salle."),
  b('elec_range', 'electhor', 'Portée', 1, 'stat', 'Tes attaques portent plus loin.'),
  // Braises : une chance de brûler qui monte avec la rareté (elle brûlait à coup sûr dès le Commun,
  // si bien qu'une reprise ne changeait rien ; revue du 27 novembre 2026).
  b('feu_burn', 'sulfura', 'Braises', 0.5, 'pct', 'Tes coups ont une chance de brûler.'),
  b('feu_finisher', 'sulfura', 'Terre Brûlée', 4.5, 'radius', 'Ton finisher embrase tout autour de la cible.'),
  b('feu_dash', 'sulfura', 'Traînée', 1, 'flag', 'Ton dash laisse un chemin de flammes.'),
  b('feu_poise', 'sulfura', 'Attisement', 1, 'flag', 'Frapper un ennemi qui brûle le fait reculer, ténacité ignorée.'),
  b('feu_phoenix', 'sulfura', 'Phénix', 0.3, 'pct', 'Une fois par salle, chaque Pokémon se relève au lieu de tomber K.O.'),
  b('feu_kill', 'sulfura', 'Colère du Volcan', 4, 'radius', 'Chaque ennemi tué embrase ses voisins.'),
  b('feu_cauldron', 'sulfura', 'Chaudron', 2, 'mult', 'Tes brûlures durent bien plus longtemps.'),
  b('feu_fury', 'sulfura', 'Fureur', 1, 'stat', 'Attaque nettement augmentée.'),
  // Souffle Gelé : 20 % au Commun (12 % avant la revue du 27 novembre 2026 : « je gèle à chaque
  // attaque, j'ai l'impression qu'il ne marche pas » ; il était aussi masqué par Braises).
  b('glace_freeze', 'artikodin', 'Souffle Gelé', 0.2, 'pct', 'Chaque coup a une chance de geler.'),
  b('glace_dash', 'artikodin', 'Verglas', 1, 'flag', "Ton dash gèle ce qu'il traverse."),
  b('glace_shatter', 'artikodin', 'Éclat', 0.7, 'pct', 'Frapper un ennemi gelé le brise — dégâts majorés, le gel saute au voisin.'),
  b('glace_finisher', 'artikodin', 'Blizzard de Poche', 0.5, 'pct', 'Ton finisher ralentit toute la salle.'),
  b('glace_shield', 'artikodin', 'Armure de Givre', 0.6, 'pct', 'Un bouclier absorbe une partie du premier coup encaissé.'),
  b('glace_execute', 'artikodin', 'Zéro Absolu', 0.15, 'pct', 'Un sauvage affaibli gèle net dès que tu le touches.'),
  b('glace_ward', 'artikodin', 'Rempart de Givre', 1, 'stat', 'Défense Spéciale nettement augmentée.'),
  b('glace_hail', 'artikodin', 'Grêle', 0.4, 'pct', 'Tes tirs laissent une nappe de froid qui ralentit ce qui la traverse.'),
  b('psy_empathy', 'mew', 'Empathie', 0.3, 'pct', 'Les compagnons menés par l’IA infligent plus de dégâts.'),
  // Les soins (revue du 27 novembre 2026) : au banc des dons, Transfert, Flamme Sacrée et Plumage
  // finissaient une salle presque sans PV perdus, dès le Rare. Bases divisées par deux environ.
  b('psy_transfer', 'mew', 'Transfert', 0.04, 'pct', 'Une part de tes dégâts te soigne.'),
  b('psy_morph', 'mew', 'Morphing', 1, 'flag', 'Tes attaques de type Normal prennent le type le plus efficace contre la cible.'),
  b('psy_finisher', 'mew', 'Lien Psychique', 1, 'flag', 'Un finisher recharge sur-le-champ les capacités des autres membres de l’équipe.'),
  b('psy_summon', 'mew', 'Invocation', 1, 'flag', 'Un allié rejoint ton équipe sur-le-champ, pour toute la run.', false),
  b('psy_focus', 'mew', 'Concentration', 1, 'stat', 'Attaque Spéciale nettement augmentée.'),
  b('psy_premonition', 'mew', 'Prémonition', 1, 'flag', 'Un coup évité par ton dash est renvoyé en entier au plus proche.'),
  // Écho, même retour : « certaines attaques ne font qu'un projectile ; un don pour en avoir
  // plusieurs, deux Flammèches au lieu d'une ». Les tirs en plus vont chacun à un autre ennemi : sur
  // une cible seule (un as), le don ne double pas les dégâts.
  b('psy_echo', 'mew', 'Écho', 1, 'count', 'Tes tirs se dédoublent : des projectiles de plus partent vers d’autres ennemis, à 45 % des dégâts.'),
  b('psy_hivemind', 'mew', 'Conscience Collective', 1, 'flag', 'Tes compagnons copient la capacité que tu as sélectionnée.', false),
  // Cauchemar : 10 % (15 % avant) et +50 % sur un endormi (le double avant). Retour du 27 novembre
  // 2026, « le don qui endort, c'est trop abusé » : au Prismatique, plus d'un coup sur trois
  // endormait, et chaque coup suivant comptait double pendant 3 s.
  b('tenb_sleep', 'darkrai', 'Cauchemar', 0.1, 'pct', 'Tes coups ont une chance d’endormir ; les endormis encaissent 50 % de plus.'),
  b('tenb_steal', 'darkrai', 'Vol d’Ombre', 0.25, 'pct', 'Tu frappes plus fort, mais tu perds des PV max à chaque salle.'),
  b('tenb_execute', 'darkrai', 'Exécution', 0.15, 'pct', 'Ton finisher achève net un sauvage déjà bas (pas un Pokémon de champion).'),
  // Le dash rend déjà invulnérable dans le prototype : Ombre Portée prolonge cette invulnérabilité.
  b('tenb_phase', 'darkrai', 'Ombre Portée', 0.3, 'sec', 'Tu restes intangible un instant de plus après ton dash.'),
  b('tenb_lastbreath', 'darkrai', 'Dernier Souffle', 0.5, 'pct', 'Sous 30 % de PV, tu cognes plus fort et plus vite.'),
  b('tenb_debt', 'darkrai', 'Dette', 1, 'flag', 'Tu encaisses le double, mais tous les dons trouvés montent d’une rareté.'),
  b('tenb_precision', 'darkrai', 'Point Faible', 1, 'stat', 'Tes coups critiques deviennent fréquents.'),
  b('tenb_void', 'darkrai', 'Vide', 8, 'sec', 'Chaque ennemi tué laisse une ombre qui ronge ce qui la traverse.'),
  b('sol_reach', 'groudon', 'Séisme', 0.5, 'pct', 'Tes attaques portent plus loin.'),
  b('sol_finisher', 'groudon', 'Impact', 0.6, 'pct', 'Ton finisher frappe en zone et étourdit.'),
  b('sol_dash', 'groudon', 'Charge', 0.55, 'pct', 'Ton dash inflige des dégâts et repousse.'),
  b('sol_steady', 'groudon', 'Inébranlable', 1, 'flag', 'Rien ne t’immobilise : gel, sommeil et paralysie se dissipent aussitôt.'),
  b('sol_shell', 'groudon', 'Carapace', 0.08, 'pct', 'Chaque salle libérée sans encaisser de coup augmente tes PV max.'),
  b('sol_thorns', 'groudon', 'Épines', 0.3, 'pct', 'Une part des dégâts encaissés est renvoyée à l’agresseur.'),
  b('sol_bulk', 'groudon', 'Masse', 1, 'stat', 'PV maximum nettement augmentés.'),
  b('sol_guard', 'groudon', 'Rempart', 1, 'stat', 'Défense nettement augmentée.'),
  b('sol_continent', 'groudon', 'Continent', 0.55, 'pct', 'Tous les cinq coups, une faille s’ouvre sous ta cible.'),
  b('temps_cooldown', 'celebi', 'Feuillage', 0.15, 'pct', 'Toutes tes cadences sont raccourcies.'),
  b('temps_regen', 'celebi', 'Sève', 0.008, 'pct', 'Tu régénères après 3 s sans prendre de coup.'),
  b('temps_finisher', 'celebi', 'Vrille', 1, 'flag', 'Ton finisher recharge instantanément tes capacités.'),
  b('temps_speed', 'celebi', 'Printemps', 0.2, 'pct', 'Tu te déplaces et tu frappes plus vite à chaque nouvelle salle.'),
  b('temps_journey', 'celebi', 'Voyage', 0.08, 'pct', 'Tu entres dans chaque salle cadences pleines, dash rechargé et soigné d’une part de tes PV.'),
  b('temps_haste', 'celebi', 'Hâte', 1, 'stat', 'Tes capacités reviennent plus vite.'),
  b('temps_rewind', 'celebi', 'Rembobinage', 1, 'flag', 'Ton dash te ramène à la position et aux PV d’il y a trois secondes.'),
  b('sacre_lifesteal', 'hooh', 'Flamme Sacrée', 0.03, 'pct', 'Tes coups brûlent et te soignent.'),
  b('sacre_xp', 'hooh', 'Cendres', 0.25, 'pct', 'Tu gagnes plus d’XP sur chaque ennemi vaincu.'),
  b('sacre_revive', 'hooh', 'Résurrection', 0.3, 'pct', 'À la fin de chaque salle, tes compagnons K.O. se relèvent avec une part de leurs PV, et non plus 1 PV.'),
  b('sacre_level', 'hooh', 'Ascension', 0.25, 'pct', 'Chaque salle libérée donne à toute l’équipe une part d’un niveau, en XP.'),
  b('sacre_finisher', 'hooh', 'Plumage', 0.05, 'pct', 'Ton finisher te soigne.'),
  b('sacre_rebirth', 'hooh', 'Renaissance', 1, 'flag', 'Une fois par run, chaque Pokémon se relève à moitié de ses PV au lieu de tomber.'),
  b('dragon_dash_charge', 'rayquaza', 'Ozone', 1, 'count', 'Des charges de dash supplémentaires.'),
  b('dragon_dash_hit', 'rayquaza', 'Piqué', 0.7, 'pct', 'Dasher dans un ennemi le frappe.'),
  b('dragon_momentum', 'rayquaza', 'Ascendant', 0.08, 'pct', 'Chaque ennemi tué dans la salle te rend plus rapide (jusqu’à +60 %).'),
  b('dragon_finisher', 'rayquaza', 'Turbulence', 1, 'flag', 'Ton finisher te rend une charge de dash.'),
  b('dragon_delta', 'rayquaza', 'Delta', 0.3, 'pct', 'Tes cadences fondent tant que tu restes en mouvement.'),
  b('dragon_swift', 'rayquaza', 'Célérité', 1, 'stat', 'Vitesse de déplacement et de frappe augmentée.'),
  b('dragon_evade', 'rayquaza', 'Insaisissable', 1, 'stat', 'Tu esquives une partie des coups.'),
  b('astre_coin', 'jirachi', 'Étoile Filante', 0.1, 'pct', 'Tes coups font parfois tomber des Pokédollars.'),
  b('astre_bounty', 'jirachi', 'Aubaine', 0.8, 'money', 'Les salles libérées rapportent davantage.'),
  b('astre_wish', 'jirachi', 'Souhait', 1, 'flag', 'Une fois par salle, un coup fatal laisse chaque Pokémon à 1 PV.'),
  // Fortune soignait comme Plumage, de Ho-Oh, en plus fort : deux fois le même don (revue du 27
  // novembre 2026, « il y en a qui sont trop basiques »). Elle remplit maintenant l'ultime.
  b('astre_finisher', 'jirachi', 'Fortune', 0.08, 'pct', 'Ton finisher remplit une part de ta jauge d’ultime.'),
  b('astre_resource', 'jirachi', 'Pluie d’Étoiles', 2, 'count', 'Chaque salle libérée livre du Bois et de la Pierre en plus, pour le Repaire.'),
  b('astre_wish_granted', 'jirachi', 'Vœu Exaucé', 1, 'flag', 'À chaque nouvel acte, un don que tu possèdes déjà monte d’une rareté.'),
  b('duo_firestorm', 'duo', 'Tempête de Feu', 1, 'flag', 'Tes ricochets enflamment tout ce qu’ils touchent.', true, ['electhor', 'sulfura']),
  b('duo_whitebolt', 'duo', 'Foudre Blanche', 0.8, 'pct', 'Frapper un ennemi gelé le fait exploser en arcs électriques.', true, ['electhor', 'artikodin']),
  b('duo_eruption', 'duo', 'Éruption', 6, 'radius', 'Ton finisher embrase ET projette tout un rayon.', true, ['sulfura', 'groudon']),
  b('duo_winter', 'duo', 'Hiver Perpétuel', 4, 'mult', 'Le gel dure bien plus longtemps.', true, ['artikodin', 'celebi']),
  b('duo_sacrifice', 'duo', 'Sacrifice', 0.35, 'pct', 'Quand un membre tombe, l’équipe absorbe sa force : plus de dégâts jusqu’à la fin de la salle.', true, ['mew', 'darkrai']),
  b('duo_roots', 'duo', 'Racines', 2, 'sec', 'Rester immobile quelques secondes recharge tout : capacités, dash, bouclier.', true, ['groudon', 'celebi']),
  b('duo_shortcircuit', 'duo', 'Court-Circuit', 7, 'radius', 'Chaque ennemi tué paralyse ses voisins.', true, ['darkrai', 'electhor']),
  b('duo_goldphoenix', 'duo', 'Phénix Doré', 1, 'flag', 'Chaque évolution en run remplit ta jauge d’ultime.', true, ['hooh', 'jirachi']),
];
export const BOONS: Record<string, BoonDef> = Object.fromEntries(LIST.map((d) => [d.id, d]));

/** Les dons qui ne servent qu'avec des compagnons : jamais proposés à un Pokémon seul. */
export const TEAM_BOONS: ReadonlySet<string> = new Set(['psy_empathy', 'psy_finisher', 'sacre_revive', 'duo_sacrifice']);

/**
 * Dons de statistique (RB.STAT_EFFECTS). Rééquilibrage du 12 novembre 2026 : +25 % au lieu de
 * +20 %. Puis retour du 27 novembre 2026 (« il y en a qui sont trop basiques ») : ils étaient les
 * seuls dons que la rareté ne touchait pas (un Prismatique valait un Commun) ; leur gain suit
 * maintenant l'échelle des raretés, `step` × RARITY_SCALE : +20 / +28 / +37 / +48 % pour une
 * statistique, et la reprise ajoute seulement l'écart avec la rareté d'avant (applyStat).
 */
export const STAT_BOONS: Record<string, { name: string; apply: 'atk' | 'def' | 'spAtk' | 'spDef' | 'speed' | 'range' | 'cooldown' | 'crit' | 'dodge' | 'hp'; step: number }> = {
  sol_bulk: { name: 'PV max', apply: 'hp', step: 0.2 },
  sol_guard: { name: 'Défense', apply: 'def', step: 0.2 },
  glace_ward: { name: 'Défense Spé', apply: 'spDef', step: 0.2 },
  dragon_swift: { name: 'Vitesse', apply: 'speed', step: 0.15 },
  // Esquive et critiques s'ajoutent en points de chance : plus bas, ils plafonnent vite.
  dragon_evade: { name: 'Esquive', apply: 'dodge', step: 0.07 },
  feu_fury: { name: 'Attaque', apply: 'atk', step: 0.2 },
  psy_focus: { name: 'Attaque Spé', apply: 'spAtk', step: 0.2 },
  tenb_precision: { name: 'Critique', apply: 'crit', step: 0.08 },
  temps_haste: { name: 'Cadence', apply: 'cooldown', step: 0.15 },
  elec_range: { name: 'Portée', apply: 'range', step: 0.2 },
};

/** Le gain d'un don de statistique à une rareté (0 : pas de don) ; en points pour l'esquive et le critique. */
export function statGain(id: string, rarity: number | undefined): number {
  const s = STAT_BOONS[id];
  return s && rarity !== undefined ? s.step * RARITY_SCALE[rarity] : 0;
}

/** « Attaque +28 % », « Critique +11 pts », « Cadence −23 % ». */
export function statLabel(id: string, rarity: number): string {
  const s = STAT_BOONS[id];
  if (!s) return '';
  const g = statGain(id, rarity);
  if (s.apply === 'crit' || s.apply === 'dodge') return `${s.name} +${Math.round(g * 100)} pts`;
  if (s.apply === 'cooldown') return `${s.name} −${Math.round((1 - 1 / (1 + g)) * 100)} %`;
  return `${s.name} +${Math.round(g * 100)} %`;
}

/** RB:63-84 : échelle de valeur, noms, couleurs (fond nuit). */
// Rééquilibrage (retour de test du 11 novembre 2026, « rééquilibrer les dons ») :
// ×1,4 / ×1,85 / ×2,4 au lieu de ×1,5 / ×2,2 / ×3. Au Prismatique, plusieurs
// dons devenaient écrasants (Éclat +450 % sur un gelé, Décharge Statique ×18,
// Transfert et Flamme Sacrée cumulés rendaient ~70 % des dégâts en PV) ; leurs
// bases ont aussi baissé, et les dons trop faibles ont été relevés (Voyage
// soigne, Prémonition renvoie tout, Inébranlable lève aussi la paralysie,
// Aubaine rapporte plus, dons de statistique à +25 %).
export const RARITY_SCALE = [1, 1.4, 1.85, 2.4];

/**
 * Courbe de rareté d'une carte (Boons.rollRarity), `room` étant la salle de la run (0 à 35). Rare et
 * Épique partent bas et montent par salle jusqu'à leur plafond ; le reste est Commun. Réglée au banc
 * (debug/boonsim.ts) : environ 60 % de dons Communs pris au premier acte, la moitié Rares ou mieux au
 * dernier.
 */
export const RARITY_CURVE = {
  epic0: 0.01,
  epicPerRoom: 0.006,
  epicMax: 0.2,
  rare0: 0.12,
  rarePerRoom: 0.009,
  rareMax: 0.42,
  /** Chance qu'une salle sans coup encaissé monte une carte Commune ou Rare d'un cran. */
  flawlessBump: 0.2,
} as const;

/** Au plus quatre légendaires par run (Boons.pickDonor), comme les dieux de Hades. */
export const MAX_DONORS = 4;
/** Un légendaire déjà rencontré revient ce nombre de fois plus souvent qu'un inconnu. */
export const MET_WEIGHT = 3;
export const RARITY_NAME = ['Commun', 'Rare', 'Épique', 'Prismatique'];
export const RARITY_COLOR = ['#e3c287', '#57b04a', '#f2c24f', '#40e0d1'];

/** Rebonds de Surtension, tirs en plus d'Écho : un par rareté, de 1 (Commun) à 4 (Prismatique). */
export function extraShots(rarity: number | undefined): number {
  return rarity === undefined ? 0 : rarity + 1;
}
/** Part des dégâts d'un rebond (du coup précédent) et d'un tir d'Écho (du tir principal). */
export const CHAIN_RATIO = 0.6;
export const ECHO_RATIO = 0.45;

/** Valeur d'un don à une rareté. */
export function boonValue(id: string, rarity: number): number {
  return (BOONS[id]?.base ?? 0) * RARITY_SCALE[rarity];
}

/** Ce que vaut le don, en clair, pour la carte de l'écran de choix. */
export function valueText(id: string, rarity: number): string {
  const def = BOONS[id];
  if (!def) return '';
  const v = boonValue(id, rarity);
  // Sous 5 %, une décimale : Sève (0,8 % par seconde) ne s'affichait qu'en « 1 % » à toutes les raretés.
  const pct = (x: number) => (x < 0.05 ? `${String(Math.round(x * 1000) / 10).replace('.', ',')} %` : `${Math.round(x * 100)} %`);
  // Surtension et Écho : un rebond ou un tir de plus à chaque rareté (1 au Commun, 4 au Prismatique).
  if (id === 'elec_split' || id === 'psy_echo') {
    const n = extraShots(rarity);
    return id === 'elec_split' ? `${n} rebond${n > 1 ? 's' : ''}` : `+${n} tir${n > 1 ? 's' : ''}`;
  }
  switch (def.fmt) {
    case 'pct':
      return pct(id === 'feu_burn' ? Math.min(1, v) : id === 'glace_finisher' || id === 'glace_hail' ? Math.min(id === 'glace_hail' ? 0.85 : 0.75, v) : id === 'temps_cooldown' || id === 'dragon_delta' ? Math.min(0.75, v) : id === 'glace_shield' ? Math.min(1, v) : v) + (id === 'temps_regen' ? ' des PV par seconde' : '');
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
      return statLabel(id, rarity);
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
  // Compteurs communs à l'équipe (RunBoons : _storm_t…). Ceux qui valent pour un Pokémon (bouclier,
  // Phénix, Souhait, coups comptés, régénération, Rembobinage) sont tenus par Pokémon dans
  // BoonHooks : depuis le 27 novembre 2026, chaque don sert à toute l'équipe (« sinon c'est
  // compliqué quand on joue en multi »), et un Phénix pris par l'un ne doit pas manquer à l'autre.
  /** Coups encaissés dans la salle par un Pokémon mené (le joueur, un invité) : Carapace, rareté. */
  roomHurts = 0;
  roomKills = 0;
  stormT = 0;
  /** Sacrifice : compagnons tombés dans la salle. */
  sacrifice = 0;
  /** Renaissance : les Pokémon (leur acteur) qui l'ont déjà usée dans la run. */
  readonly rebirth = new Set<object>();
  /** Crans de rareté ajoutés à la prochaine offre (pacte de l'Autel maudit), remis à 0 après elle. */
  bonus = 0;
  /**
   * Membres de l'équipe au départ de la run (main.ts) : seul, les dons qui reposent sur des
   * compagnons (`TEAM_BOONS`) ne sont pas proposés.
   */
  teamSize = 1;
  /** Combien de fois chaque don a agi dans la run : le banc des dons (debug/boonbench.ts) le lit. */
  readonly fired = new Map<string, number>();

  /** Note qu'un don vient d'agir. */
  fire(id: string): void {
    this.fired.set(id, (this.fired.get(id) ?? 0) + 1);
  }

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

  /**
   * Le don peut servir dans cette run : branché (`solo`), avec des compagnons s'il en demande, et
   * pas déjà pris s'il n'a pas de valeur (`flag`) : un tel don ne gagne rien à monter de rareté, le
   * reprendre gâchait un choix (revue du 27 novembre 2026).
   */
  private usable(d: BoonDef): boolean {
    return d.solo && (this.teamSize > 1 || !TEAM_BOONS.has(d.id)) && !(d.fmt === 'flag' && this.owned.has(d.id));
  }

  /** Dons encore proposables d'un donateur : jouables seuls et pas encore prismatiques. */
  private offerableFrom(god: DonorId): string[] {
    return LIST.filter((d) => d.god === god && this.usable(d) && (this.owned.get(d.id) ?? -1) < 3).map((d) => d.id);
  }

  /** Duo débloqué : au moins un don de chacun des deux donateurs. */
  private duosFor(god: DonorId): string[] {
    const hasFrom = (g: DonorId) => [...this.owned.keys()].some((id) => BOONS[id]?.god === g);
    return LIST.filter((d) => d.duo && this.usable(d) && d.duo.includes(god) && hasFrom(d.duo[0]) && hasFrom(d.duo[1]) && (this.owned.get(d.id) ?? -1) < 3).map((d) => d.id);
  }

  /**
   * La rareté d'une carte. Écart voulu avec CombatArena._roll_boon_rarity (Épique sous 0,10 + 0,02 ×
   * salle, Rare sous 0,35 + 0,03 × salle, +1 cran à chaque salle sans coup encaissé) : retour du 27
   * novembre 2026, « on a des dons épiques et rares très vite ; il faudrait plus de communs et une
   * suite logique ». Le banc des dons (debug/boonsim.ts, un joueur qui prend toujours la carte la
   * plus rare) mesurait 62 % de dons Épiques ou Prismatiques dès le premier acte.
   *
   * Maintenant (`RARITY_CURVE`) : 78 % de Communs en début de run, les Rares et les Épiques gagnent
   * un peu à chaque salle (plafonnés) ; une salle sans coup encaissé ne fait monter la carte que
   * parfois, et jamais jusqu'au Prismatique. Le Prismatique se mérite en reprenant un don qu'on a
   * déjà (grant : un cran au-dessus) : c'est la montée logique. Dette et le pacte de l'Autel
   * (`bonus`) gardent leur cran.
   */
  rollRarity(rng: Rng, room: number): number {
    const c = RARITY_CURVE;
    const epic = Math.min(c.epicMax, c.epic0 + c.epicPerRoom * room);
    const rare = Math.min(c.rareMax, c.rare0 + c.rarePerRoom * room);
    const roll = rng.next();
    let r = roll < epic ? 2 : roll < epic + rare ? 1 : 0;
    if (this.roomHurts === 0 && r < 2 && rng.next() < c.flawlessBump) r++;
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

  /** Les légendaires qui ont déjà donné un don pendant cette run. */
  met(): Set<DonorId> {
    const out = new Set<DonorId>();
    for (const id of this.owned.keys()) {
      const g = BOONS[id]?.god;
      if (g && g !== 'duo') out.add(g);
    }
    return out;
  }

  /**
   * Le donateur d'une porte, parmi ceux qui ont encore au moins 3 dons à offrir (null : aucun).
   *
   * Écart voulu (retour du 27 novembre 2026 : « comme dans Hades, quand tu commences sur Poséidon, tu
   * retrouves facilement Poséidon plus tard pour combiner et améliorer tes dons ») : un légendaire
   * qui a déjà donné revient `MET_WEIGHT` fois plus souvent qu'un inconnu, et une run n'en réunit pas
   * plus de `MAX_DONORS` (la règle des quatre dieux de Hades) : passé ce nombre, seuls eux
   * reviennent. Les dons duo, qui demandent deux légendaires d'une même run, en deviennent
   * atteignables, et les dons déjà pris reviennent pour monter de rareté. Le banc mesurait 7,3
   * légendaires différents par run, le premier ne donnant que 17 % des dons.
   */
  pickDonor(rng: Rng): DonorId | null {
    const met = this.met();
    let pool = DONOR_IDS.filter((g) => this.offerableFrom(g).length >= 3);
    if (met.size >= MAX_DONORS && pool.some((g) => met.has(g))) pool = pool.filter((g) => met.has(g));
    if (!pool.length) return null;
    const weight = (g: DonorId) => (met.has(g) ? MET_WEIGHT : 1);
    let roll = rng.next() * pool.reduce((t, g) => t + weight(g), 0);
    for (const g of pool) {
      roll -= weight(g);
      if (roll < 0) return g;
    }
    return pool[pool.length - 1];
  }

  /** Vœu Exaucé : un don possédé au hasard (non prismatique) monte d'un cran. */
  wishGranted(rng: Rng): string | null {
    const ids = [...this.owned].filter(([id, r]) => r < 3 && !STAT_BOONS[id] && BOONS[id]?.fmt !== 'flag').map(([id]) => id);
    if (!ids.length) return null;
    const id = rng.pick(ids);
    this.owned.set(id, this.owned.get(id)! + 1);
    return id;
  }

  /** Nouvelle salle : les effets « une fois par salle » se réarment. */
  enterRoom(): void {
    this.roomHurts = 0;
    this.roomKills = 0;
    this.sacrifice = 0;
  }
}

/** Ultime : jauge de 1 000 (RB.ULT_MAX), +1 par dégât infligé, +4 par dégât encaissé. */
export const ULT_MAX = 1000;
/** Puissance d'une ultime : puissance de la 1re capacité × 6, en dégâts bruts (CA.ULT_POWER_MULT). */
export const ULT_POWER_MULT = 6;

/**
 * Statut forcé à chaque coup par un don (RunBoons.forced_status), sinon null : le type décide.
 *
 * Revue du 27 novembre 2026 (« le don où tu gèles à chaque attaque, j'ai l'impression qu'il ne
 * marche pas ») : Braises et Flamme Sacrée, testées en premier, brûlaient à coup sûr et
 * masquaient donc toujours Souffle Gelé et Cauchemar ; et une cible déjà brûlée ou paralysée
 * (par le type de l'attaque) ne pouvait plus geler. Le gel et le sommeil se tirent maintenant
 * d'abord, et Combat les impose par-dessus un statut moins fort (BoonHooks.inflict, `force`).
 */
export function forcedStatus(boons: Boons, random: () => number): Status | null {
  if (boons.has('glace_freeze') && random() < boons.v('glace_freeze')) return (boons.fire('glace_freeze'), 'freeze');
  if (boons.has('tenb_sleep') && random() < boons.v('tenb_sleep')) return (boons.fire('tenb_sleep'), 'sleep');
  if (boons.has('sacre_lifesteal')) return 'burn';
  if (boons.has('feu_burn') && random() < boons.v('feu_burn')) return (boons.fire('feu_burn'), 'burn');
  return null;
}
