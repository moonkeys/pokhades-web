// Données pures (sans DOM) : importées par le jeu et par scripts/import-assets.ts.

/**
 * Table d'évolution du jeu, reprise telle quelle de
 * ../pokhades/autoloads/GameManager.gd (EVOLUTIONS) : espèce → [niveau
 * requis, forme suivante]. Le jeu donne un NIVEAU aux évolutions par pierre,
 * échange ou bonheur des jeux officiels (convention rogue-lite : le niveau
 * est la seule monnaie de progression d'un Pokémon).
 */
const EVOLUTIONS: Record<number, readonly [level: number, next: number]> = {
  // ── Starters de la Rébellion ─────────────────────────────────────
  25: [20, 26], // Pikachu → Raichu
  570: [20, 571], // Zorua → Zoroark
  725: [17, 726], // Flamiaou → Matoufeu
  726: [34, 727], // → Félinferno
  656: [16, 657], // Grenousse → Croâporal
  657: [36, 658], // → Amphinobi
  390: [14, 391], // Ouisticram → Chimpenfeu
  391: [36, 392], // → Simiabraz
  674: [32, 675], // Pandespiègle → Pandarbare
  559: [39, 560], // Baggiguane → Baggaïd
  447: [24, 448], // Riolu → Lucario (bonheur → niveau)
  // ── Lignées classiques (Pokédex, roster de test) ─────────────────
  1: [16, 2], // Bulbizarre → Herbizarre
  2: [32, 3], // → Florizarre
  4: [16, 5], // Salamèche → Reptincel
  5: [36, 6], // → Dracaufeu
  7: [16, 8], // Carapuce → Carabaffe
  8: [36, 9], // → Tortank
  32: [16, 33], // Nidoran♂ → Nidorino
  33: [36, 34], // → Nidoking (pierre)
  37: [20, 38], // Goupix → Feunard (pierre)
  63: [16, 64], // Abra → Kadabra
  64: [40, 65], // → Alakazam (échange)
  92: [25, 93], // Fantominus → Spectrum
  93: [40, 94], // → Ectoplasma (échange)
  123: [40, 212], // Insécateur → Cizayox (échange)
  133: [20, 134], // Évoli → Aquali (pierre)
  175: [20, 176], // Togepi → Togetic (bonheur)
  176: [45, 468], // → Togekiss (pierre)
  215: [45, 461], // Farfuret → Dimoret (objet)
  280: [20, 281], // Tarsal → Kirlia
  281: [30, 282], // → Gardevoir
  258: [16, 259], // Gobou → Flobio
  259: [36, 260], // → Laggron
  // ── Rongeurs / insectes / oiseaux (pools de base) ────────────────
  399: [15, 400], // Keunotor → Castorno
  19: [20, 20], // Rattata → Rattatac
  263: [20, 264], // Zigzaton → Linéon
  161: [15, 162], // Fouinette → Fouinar
  819: [24, 820], // Rongourmand → Rongrigou
  10: [7, 11], // Chenipan → Chrysacier
  11: [10, 12], // → Papilusion
  13: [7, 14], // Aspicot → Coconfort
  14: [10, 15], // → Dardargnan
  265: [7, 266], // Chenipotte → Armulys
  266: [10, 267], // → Charmillon
  824: [10, 825], // Larvadar → Coléodôme
  825: [30, 826], // → Astronelle
  850: [28, 851], // Grillepattes → Scolocendre
  16: [18, 17], // Roucool → Roucoups
  17: [36, 18], // → Roucarnage
  396: [14, 397], // Étourmi → Étourvol
  397: [34, 398], // → Étouraptor
  661: [17, 662], // Passerouge → Braisillon
  662: [35, 663], // → Flambusard
  519: [21, 520], // Poichigeon → Colombeau
  520: [32, 521], // → Déflaisan
  403: [15, 404], // Lixy → Luxio
  404: [30, 405], // → Luxray
  261: [18, 262], // Medhyèna → Grahyèna
  191: [25, 192], // Tournegrin → Héliatronc (pierre)
  43: [21, 44], // Mystherbe → Ortide
  44: [36, 45], // → Rafflesia (pierre)
  // ── Faunes de biome ──────────────────────────────────────────────
  46: [24, 47], // Paras → Parasect
  69: [21, 70], // Chétiflor → Boustiflor
  70: [40, 71], // → Empiflor (pierre)
  273: [14, 274], // Grainipiot → Pifeuil
  274: [36, 275], // → Tengalice (pierre)
  285: [23, 286], // Balignon → Chapignon
  204: [31, 205], // Pomdepik → Foretress
  540: [20, 541], // Larveyette → Couverdure
  541: [30, 542], // → Manternel
  194: [20, 195], // Axoloto → Maraiste
  88: [38, 89], // Tadmorv → Grotadmorv
  23: [22, 24], // Abo → Arbok
  41: [22, 42], // Nosferapti → Nosferalto
  42: [40, 169], // → Nostenfer (bonheur)
  270: [14, 271], // Nénupiot → Lombre
  271: [36, 272], // → Ludicolo (pierre)
  283: [22, 284], // Arakdo → Maskadra
  187: [18, 188], // Granivol → Floravol
  188: [27, 189], // → Cotovol
  415: [21, 416], // Apitrini → Apireine
  669: [19, 670], // Flabébé → Floette
  670: [38, 671], // → Florges (pierre)
  179: [15, 180], // Wattouat → Lainergie
  180: [30, 181], // → Pharamp
  659: [20, 660], // Sapereau → Excavarenne
  74: [25, 75], // Racaillou → Gravalanch
  75: [40, 76], // → Grolem (échange)
  66: [28, 67], // Machoc → Machopeur
  67: [44, 68], // → Mackogneur (échange)
  296: [24, 297], // Makuhita → Hariyama
  304: [32, 305], // Galekid → Galegon
  305: [42, 306], // → Galeking
  524: [25, 525], // Nodulithe → Géolithe
  525: [40, 526], // → Gigalithe (échange)
  744: [25, 745], // Rocabot → Lougaroc
  585: [34, 586], // Vivaldaim → Haydaim
  216: [30, 217], // Teddiursa → Ursaring
  163: [20, 164], // Hoothoot → Noarfang
  118: [33, 119], // Poissirène → Poissoroy
  129: [20, 130], // Magicarpe → Léviator
  54: [33, 55], // Psykokwak → Akwakwak
  60: [25, 61], // Ptitard → Têtarte
  61: [40, 62], // → Tartard (pierre)
  79: [37, 80], // Ramoloss → Flagadoss
  // ── Recrues de grotte (pseudo-légendaires & lignées rares) ───────
  147: [30, 148], // Minidraco → Draco
  148: [55, 149], // → Dracolosse
  246: [30, 247], // Embrylex → Ymphect
  247: [55, 248], // → Tyranocif
  371: [30, 372], // Draby → Drackhaus
  372: [50, 373], // → Drattak
  443: [24, 444], // Griknot → Carmache
  444: [48, 445], // → Carchacrok
  610: [38, 611], // Coupenotte → Incisache
  611: [48, 612], // → Tranchodon
  633: [50, 634], // Solochi → Diamat
  634: [64, 635], // → Trioxhydre
  704: [40, 705], // Mucuscule → Colimucus
  705: [50, 706], // → Muplodocus
  374: [20, 375], // Terhal → Métang
  375: [45, 376], // → Métalosse
  328: [35, 329], // Kraknoix → Vibraninf
  329: [45, 330], // → Libégon
  782: [35, 783], // Bébécaille → Écaïd
  783: [45, 784], // → Ékaïser
  885: [50, 886], // Fantyrm → Dispareptil
  886: [60, 887], // → Lanssorien
  996: [35, 997], // Frigodo → Cryodo
  997: [54, 998], // → Glaivodo
  // ── Lignées des CHAMPIONS D'ACTE (cf. PokePools.CHAMPION_TEAMS) —
  // manquaient pour que chaque vague de boss ait une paire évolué/sbire
  // de base cohérente (cf. CombatArena._spawn_room_enemies).
  95: [30, 208], // Onix → Steelix
  111: [42, 112], // Rhinocorne → Rhinoféros
  100: [30, 101], // Voltorbe → Électrode
  81: [30, 82], // Magnéti → Magnéton
  120: [20, 121], // Stari → Staross (pierre)
  116: [32, 117], // Hypotrempe → Tacle
  102: [20, 103], // Noeunoeuf → Noadkoko (pierre)
  109: [35, 110], // Smogo → Smogogo
  48: [31, 49], // Mimitoss → Aéromite
  96: [26, 97], // Soporifik → Hypnomade
  77: [40, 78], // Ponyta → Galopa
  58: [20, 59], // Caninos → Arcanin (pierre)
  50: [26, 51], // Taupiqueur → Triopikeur
  29: [16, 30], // Nidoran♀ → Nidorina
  30: [36, 31], // → Nidoqueen (pierre)
  104: [28, 105], // Osselait → Ossatueur
  // ── Élargissement des viviers de biome (cf. PokePools.BIOME) ─────
  // Indispensable : à partir de l'acte 2, _pool_for_room remplace chaque
  // espèce par sa forme finale (final_evolution_of). Une espèce absente
  // d'ici reste à sa forme de base et sort largement sous-dimensionnée en
  // fin de run. Les espèces sans lignée (Tauros, Lokhlass, Séviper,
  // Scarabrute, Écrémeuh, Insolourdo, Bargantua, Limonde, Qwilfish,
  // Boumata) sont volontairement absentes : elles n'évoluent pas.
  203: [32, 981], // Girafarig → Farigiraf
  664: [9, 665], // Lépidonille → Papilonette
  665: [12, 666], // → Prismillon
  590: [39, 591], // Trompignon → Gaulet
  742: [21, 743], // Bombydou → Rubombelle
  114: [30, 465], // Saquedeneu → Vortente
  21: [20, 22], // Piafabec → Rapasdepic
  546: [28, 547], // Doudouvet → Farfaduvet (pierre)
  710: [33, 711], // Pitrouille → Banshitrouye
  708: [33, 709], // Brocélôme → Desséliande
  183: [18, 184], // Marill → Azumarill
  98: [28, 99], // Krabby → Krabboss
  72: [30, 73], // Tentacool → Tentacruel
  592: [40, 593], // Viskuse → Moyade
  339: [30, 340], // Barloche → Barbicha
  434: [34, 435], // Moufouette → Moufflair
  568: [36, 569], // Miamiasme → Miasmax
  438: [24, 185], // Manzaï → Simularbre
  557: [34, 558], // Crabicoque → Crabaraque
  837: [18, 838], // Charbi → Wagomine
  838: [34, 839], // → Monthracite
  622: [43, 623], // Gringolem → Golemastoc
  236: [20, 237], // Debugant → Kapoera
  155: [14, 156], // Héricendre → Feurisson
  156: [36, 157], // → Typhlosion
};

/**
 * Formes sans planche PMD, ni dans le dépôt Godot ni sur SpriteCollab : la
 * lignée les saute (Poichigeon reste lui-même jusqu'au seuil de Colombeau,
 * puis devient directement Déflaisan). Écart voulu : le jeu Godot les montre.
 * Une forme finale sans planche coupe la lignée là : Crabicoque, Ferrimodo et
 * Charbi n'évoluent pas.
 */
const SKIPPED_FORMS = new Set<number>([520, 558, 591, 838, 839]);

/** Forme suivante si `level` atteint le seuil (une seule marche), sinon null. */
export function evolutionOf(id: number, level: number): number | null {
  const evo = EVOLUTIONS[id];
  if (!evo || level < evo[0]) return null;
  return SKIPPED_FORMS.has(evo[1]) ? evolutionOf(evo[1], level) : evo[1];
}

/**
 * Forme atteinte en partant directement à `level` (Super Bonbon) : on suit
 * la lignée tant que le niveau dépasse chaque seuil (Bulbizarre au niveau 33
 * part en Florizarre).
 */
export function evolvedStart(id: number, level: number): number {
  for (let next = evolutionOf(id, level); next !== null && next !== id; next = evolutionOf(id, level)) id = next;
  return id;
}

/** Toutes les formes que `id` peut encore prendre, dans l'ordre (pour importer leurs planches). */
export function laterForms(id: number): number[] {
  const out: number[] = [];
  for (let evo = EVOLUTIONS[id]; evo && !out.includes(evo[1]); evo = EVOLUTIONS[evo[1]]) if (!SKIPPED_FORMS.has(evo[1])) out.push(evo[1]);
  return out;
}

/** Forme précédente de chaque évolution (table inverse ; Rattata → Rattatac compte une fois). */
const PREVIOUS = new Map<number, number>(Object.entries(EVOLUTIONS).flatMap(([from, [, to]]) => (to === Number(from) ? [] : [[to, Number(from)] as const])));

/** Forme précédente de `id`, ou null pour une forme de base (ou absente de la table). */
export const preEvolutionOf = (id: number): number | null => PREVIOUS.get(id) ?? null;
