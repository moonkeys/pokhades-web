// Méga-évolutions (retour de test du 11 novembre 2026 : « améliorer les
// méga-évolutions disponibles, ça peut être un truc vraiment stylé »).
//
// Une forme Méga par espèce (la première quand il y en a deux, X avant Y),
// identifiée par son numéro de forme PokéAPI (10034 pour Méga-Dracaufeu X…) :
// c'est sous ce numéro que vivent sa fiche (data/pokeapi/pokemon/<id>.json :
// types, stats, nom) et son illustration (artwork/<id>.png). `collab` : le
// dossier de ses planches PMD chez SpriteCollab (« 0006/0001 »), quand elles
// y sont complètes (Idle, Walk, Attack) ; sinon null, et la Méga garde les
// planches de sa forme de base, grandie et cerclée de son aura en combat.
//
// Table tirée de PokéAPI (/pokemon?limit=2000, noms en « -mega ») et du
// tracker de SpriteCollab le 12 novembre 2026. Données pures (sans DOM) :
// lues par le jeu et par scripts/import-assets.ts.

export interface MegaForm {
  /** Numéro de la forme chez PokéAPI. */
  id: number;
  name: string;
  /** Dossier SpriteCollab des planches (« 0006/0001 »), ou null : celles de la forme de base. */
  collab: string | null;
}

/** Forme Méga par espèce de base (numéro du Pokédex). */
export const MEGA_FORMS: Readonly<Record<number, MegaForm>> = {
  3: { id: 10033, name: "Méga-Florizarre", collab: null },
  6: { id: 10034, name: "Méga-Dracaufeu X", collab: "0006/0001" },
  9: { id: 10036, name: "Méga-Tortank", collab: null },
  65: { id: 10037, name: "Méga-Alakazam", collab: "0065/0001" },
  94: { id: 10038, name: "Méga-Ectoplasma", collab: "0094/0001" },
  115: { id: 10039, name: "Méga-Kangourex", collab: "0115/0001" },
  127: { id: 10040, name: "Méga-Scarabrute", collab: null },
  130: { id: 10041, name: "Méga-Léviator", collab: null },
  142: { id: 10042, name: "Méga-Ptéra", collab: "0142/0001" },
  150: { id: 10043, name: "Méga-Mewtwo X", collab: null },
  181: { id: 10045, name: "Méga-Pharamp", collab: null },
  212: { id: 10046, name: "Méga-Cizayox", collab: null },
  214: { id: 10047, name: "Méga-Scarhino", collab: null },
  229: { id: 10048, name: "Méga-Démolosse", collab: "0229/0001" },
  248: { id: 10049, name: "Méga-Tyranocif", collab: "0248/0001" },
  257: { id: 10050, name: "Méga-Braségali", collab: null },
  282: { id: 10051, name: "Méga-Gardevoir", collab: "0282/0001" },
  303: { id: 10052, name: "Méga-Mysdibule", collab: "0303/0001" },
  306: { id: 10053, name: "Méga-Galeking", collab: null },
  308: { id: 10054, name: "Méga-Charmina", collab: "0308/0001" },
  310: { id: 10055, name: "Méga-Élecsprint", collab: "0310/0001" },
  354: { id: 10056, name: "Méga-Branette", collab: "0354/0001" },
  359: { id: 10057, name: "Méga-Absol", collab: "0359/0001" },
  445: { id: 10058, name: "Méga-Carchacrok", collab: null },
  448: { id: 10059, name: "Méga-Lucario", collab: "0448/0001" },
  460: { id: 10060, name: "Méga-Blizzaroi", collab: null },
  380: { id: 10062, name: "Méga-Latias", collab: "0380/0001" },
  381: { id: 10063, name: "Méga-Latios", collab: "0381/0001" },
  260: { id: 10064, name: "Méga-Laggron", collab: null },
  254: { id: 10065, name: "Méga-Jungko", collab: null },
  302: { id: 10066, name: "Méga-Ténéfix", collab: "0302/0001" },
  334: { id: 10067, name: "Méga-Altaria", collab: "0334/0001" },
  475: { id: 10068, name: "Méga-Gallame", collab: "0475/0001" },
  531: { id: 10069, name: "Méga-Nanméouïe", collab: null },
  319: { id: 10070, name: "Méga-Sharpedo", collab: "0319/0001" },
  80: { id: 10071, name: "Méga-Flagadoss", collab: "0080/0002" },
  208: { id: 10072, name: "Méga-Steelix", collab: "0208/0001" },
  18: { id: 10073, name: "Méga-Roucarnage", collab: null },
  362: { id: 10074, name: "Méga-Oniglali", collab: "0362/0001" },
  719: { id: 10075, name: "Méga-Diancie", collab: "0719/0001" },
  376: { id: 10076, name: "Méga-Métalosse", collab: null },
  384: { id: 10079, name: "Méga-Rayquaza", collab: "0384/0001" },
  323: { id: 10087, name: "Méga-Camérupt", collab: "0323/0001" },
  428: { id: 10088, name: "Méga-Lockpin", collab: "0428/0001" },
  373: { id: 10089, name: "Méga-Drattak", collab: null },
  15: { id: 10090, name: "Méga-Dardargnan", collab: null },
  36: { id: 10278, name: "Méga-Mélodelfe", collab: null },
  71: { id: 10279, name: "Méga-Empiflor", collab: null },
  121: { id: 10280, name: "Méga-Staross", collab: null },
  149: { id: 10281, name: "Méga-Dracolosse", collab: null },
  154: { id: 10282, name: "Méga-Méganium", collab: null },
  160: { id: 10283, name: "Méga-Aligatueur", collab: null },
  227: { id: 10284, name: "Méga-Airmure", collab: "0227/0001" },
  478: { id: 10285, name: "Méga-Momartik", collab: null },
  500: { id: 10286, name: "Méga-Roitiflam", collab: null },
  530: { id: 10287, name: "Méga-Minotaupe", collab: "0530/0001" },
  545: { id: 10288, name: "Méga-Brutapode", collab: null },
  560: { id: 10289, name: "Méga-Baggaïd", collab: "0560/0001" },
  604: { id: 10290, name: "Méga-Ohmassacre", collab: "0604/0001" },
  609: { id: 10291, name: "Méga-Lugulabre", collab: null },
  652: { id: 10292, name: "Méga-Blindépique", collab: null },
  655: { id: 10293, name: "Méga-Goupelin", collab: null },
  658: { id: 10294, name: "Méga-Amphinobi", collab: null },
  668: { id: 10295, name: "Méga-Némélios", collab: null },
  670: { id: 10296, name: "Méga-Floette", collab: "0670/0006" },
  687: { id: 10297, name: "Méga-Sepiatroce", collab: null },
  689: { id: 10298, name: "Méga-Golgopathe", collab: null },
  691: { id: 10299, name: "Méga-Kravarech", collab: "0691/0001" },
  701: { id: 10300, name: "Méga-Brutalibré", collab: null },
  718: { id: 10301, name: "Méga-Zygarde", collab: "0718/0005" },
  780: { id: 10302, name: "Méga-Draïeul", collab: "0780/0001" },
  870: { id: 10303, name: "Méga-Hexadron", collab: null },
  26: { id: 10304, name: "Méga-Raichu X", collab: null },
  358: { id: 10306, name: "Méga-Éoko", collab: null },
  398: { id: 10308, name: "Méga-Étouraptor", collab: null },
  485: { id: 10311, name: "Méga-Heatran", collab: null },
  491: { id: 10312, name: "Méga-Darkrai", collab: "0491/0002" },
  623: { id: 10313, name: "Méga-Golemastoc", collab: null },
  678: { id: 10314, name: "Méga-Mistigrix", collab: null },
  740: { id: 10315, name: "Méga-Crabominable", collab: null },
  768: { id: 10316, name: "Méga-Sarmuraï", collab: null },
  801: { id: 10317, name: "Méga-Magearna", collab: null },
  807: { id: 10319, name: "Méga-Zeraora", collab: "0807/0001" },
  952: { id: 10320, name: "Méga-Scovilain", collab: null },
  970: { id: 10321, name: "Méga-Floréclat", collab: null },
  978: { id: 10322, name: "Méga-Nigirigon", collab: "0978/0003" },
  998: { id: 10325, name: "Méga-Glaivodo", collab: null },
};

/**
 * Deuxième forme Méga des espèces qui en ont deux (X / Y, ou Z) : le joueur
 * choisit au moment de méga-évoluer (main.ts, écran d'évolution) ; l'as d'un
 * champion en tire une au hasard.
 */
export const MEGA_ALT_FORMS: Readonly<Record<number, MegaForm>> = {
  6: { id: 10035, name: "Méga-Dracaufeu Y", collab: null },
  26: { id: 10305, name: "Méga-Raichu Y", collab: null },
  150: { id: 10044, name: "Méga-Mewtwo Y", collab: "0150/0002" },
  359: { id: 10307, name: "Méga-Absol Z", collab: null },
  445: { id: 10309, name: "Méga-Carchacrok Z", collab: null },
  448: { id: 10310, name: "Méga-Lucario Z", collab: null },
};

/** Les formes Méga d'une espèce (aucune, une, ou deux). */
export const megaFormsOf = (base: number): MegaForm[] => [MEGA_FORMS[base], MEGA_ALT_FORMS[base]].filter((m): m is MegaForm => !!m);

const BY_ID = new Map(
  [...Object.entries(MEGA_FORMS), ...Object.entries(MEGA_ALT_FORMS)].map(([base, m]) => [m.id, { ...m, base: Number(base) }]),
);

/** La forme Méga d'un numéro de forme, avec son espèce de base, ou undefined. */
export const megaById = (id: number): (MegaForm & { base: number }) | undefined => BY_ID.get(id);
