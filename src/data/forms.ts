// Extension explicite : scripts/import-assets.ts (Node) charge ce fichier via remote.ts.
import { MEGA_FORMS } from './megas.ts';

// Formes régionales (retour de test du 11 novembre 2026 : « est-ce qu'on peut
// avoir les formes alternatives des Pokémon, avec toutes les évolutions qui
// vont avec ? ») : Alola, Galar, Hisui et Paldéa.
//
// Comme les Méga (data/megas.ts), une forme est identifiée par son numéro de
// forme PokéAPI (10103 pour Goupix d'Alola) : fiche, illustration et
// planches PMD vivent sous ce numéro ; SpriteCollab range les planches dans
// un sous-dossier de l'espèce (`collab`, « 0037/0001 »). Pour le reste du jeu,
// c'est une espèce à part : elle a sa place dans la faune d'un biome
// (bestiary.json), ses victoires, son déblocage et sa ligne au Pokédex, et
// ses évolutions (data/evolutions.ts). Certaines naissent aussi d'une
// évolution ordinaire faite dans le bon biome (REGIONAL_EVOLUTIONS de
// data/evolutions.ts) : un Pikachu qui évolue à la Plage devient Raichu d'Alola.
//
// Table tirée de PokéAPI (noms en « -alola », « -galar », « -hisui »,
// « -paldea ») et du tracker de SpriteCollab le 12 novembre 2026 ; seules les
// formes aux planches complètes (Idle, Walk, Attack, Hurt) sont gardées.
// Données pures (sans DOM) : lues par le jeu et par scripts/import-assets.ts.

export interface RegionalForm {
  /** Numéro de Pokédex de l'espèce (son cri, sa courbe d'XP). */
  base: number;
  name: string;
  region: 'alola' | 'galar' | 'hisui' | 'paldea';
  /** Dossier SpriteCollab des planches. */
  collab: string;
}

export const REGIONAL_FORMS: Readonly<Record<number, RegionalForm>> = {
  10091: { base: 19, name: "Rattata d'Alola", region: 'alola', collab: '0019/0001' },
  10092: { base: 20, name: "Rattatac d'Alola", region: 'alola', collab: '0020/0001' },
  10100: { base: 26, name: "Raichu d'Alola", region: 'alola', collab: '0026/0001' },
  10101: { base: 27, name: "Sabelette d'Alola", region: 'alola', collab: '0027/0001' },
  10102: { base: 28, name: "Sablaireau d'Alola", region: 'alola', collab: '0028/0001' },
  10103: { base: 37, name: "Goupix d'Alola", region: 'alola', collab: '0037/0001' },
  10104: { base: 38, name: "Feunard d'Alola", region: 'alola', collab: '0038/0001' },
  10105: { base: 50, name: "Taupiqueur d'Alola", region: 'alola', collab: '0050/0001' },
  10106: { base: 51, name: "Triopikeur d'Alola", region: 'alola', collab: '0051/0001' },
  10107: { base: 52, name: "Miaouss d'Alola", region: 'alola', collab: '0052/0001' },
  10108: { base: 53, name: "Persian d'Alola", region: 'alola', collab: '0053/0001' },
  10109: { base: 74, name: "Racaillou d'Alola", region: 'alola', collab: '0074/0001' },
  10110: { base: 75, name: "Gravalanch d'Alola", region: 'alola', collab: '0075/0001' },
  10111: { base: 76, name: "Grolem d'Alola", region: 'alola', collab: '0076/0001' },
  10112: { base: 88, name: "Tadmorv d'Alola", region: 'alola', collab: '0088/0001' },
  10113: { base: 89, name: "Grotadmorv d'Alola", region: 'alola', collab: '0089/0001' },
  10114: { base: 103, name: "Noadkoko d'Alola", region: 'alola', collab: '0103/0001' },
  10115: { base: 105, name: "Ossatueur d'Alola", region: 'alola', collab: '0105/0001' },
  10161: { base: 52, name: "Miaouss de Galar", region: 'galar', collab: '0052/0002' },
  10162: { base: 77, name: "Ponyta de Galar", region: 'galar', collab: '0077/0001' },
  10163: { base: 78, name: "Galopa de Galar", region: 'galar', collab: '0078/0001' },
  10164: { base: 79, name: "Ramoloss de Galar", region: 'galar', collab: '0079/0001' },
  10165: { base: 80, name: "Flagadoss de Galar", region: 'galar', collab: '0080/0001' },
  10166: { base: 83, name: "Canarticho de Galar", region: 'galar', collab: '0083/0001' },
  10167: { base: 110, name: "Smogogo de Galar", region: 'galar', collab: '0110/0001' },
  10173: { base: 222, name: "Corayon de Galar", region: 'galar', collab: '0222/0001' },
  10174: { base: 263, name: "Zigzaton de Galar", region: 'galar', collab: '0263/0001' },
  10175: { base: 264, name: "Linéon de Galar", region: 'galar', collab: '0264/0001' },
  10176: { base: 554, name: "Darumarond de Galar", region: 'galar', collab: '0554/0001' },
  10179: { base: 562, name: "Tutafeh de Galar", region: 'galar', collab: '0562/0001' },
  10229: { base: 58, name: "Caninos de Hisui", region: 'hisui', collab: '0058/0001' },
  10230: { base: 59, name: "Arcanin de Hisui", region: 'hisui', collab: '0059/0001' },
  10231: { base: 100, name: "Voltorbe de Hisui", region: 'hisui', collab: '0100/0001' },
  10232: { base: 101, name: "Électrode de Hisui", region: 'hisui', collab: '0101/0001' },
  10233: { base: 157, name: "Typhlosion de Hisui", region: 'hisui', collab: '0157/0001' },
  10234: { base: 211, name: "Qwilfish de Hisui", region: 'hisui', collab: '0211/0001' },
  10235: { base: 215, name: "Farfuret de Hisui", region: 'hisui', collab: '0215/0001' },
  10238: { base: 570, name: "Zorua de Hisui", region: 'hisui', collab: '0570/0001' },
  10239: { base: 571, name: "Zoroark de Hisui", region: 'hisui', collab: '0571/0001' },
  10241: { base: 705, name: "Colimucus de Hisui", region: 'hisui', collab: '0705/0001' },
  10242: { base: 706, name: "Muplodocus de Hisui", region: 'hisui', collab: '0706/0001' },
  10253: { base: 194, name: "Axoloto de Paldéa", region: 'paldea', collab: '0194/0002' },
};

/** Une forme (Méga ou régionale) : son espèce de base, son nom, le dossier de ses planches (null : celles de la base). */
export function formById(id: number): { base: number; name: string; collab: string | null; mega: boolean } | undefined {
  const r = REGIONAL_FORMS[id];
  if (r) return { ...r, mega: false };
  for (const [base, m] of Object.entries(MEGA_FORMS)) if (m.id === id) return { base: Number(base), name: m.name, collab: m.collab, mega: true };
  return undefined;
}

/** Numéro de Pokédex d'une espèce ou d'une forme (cris, courbe d'XP). */
export const dexOf = (id: number): number => formById(id)?.base ?? id;

/** Planches à charger : celles de la forme si elle en a, sinon celles de sa base (Méga sans planche). */
export const sheetIdOf = (id: number): number => {
  const f = formById(id);
  return f && !f.collab ? f.base : id;
};
