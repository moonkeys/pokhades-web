// Les leçons de Bouldeneu, le savant du Repaire (run/camp.ts, poste
// « Leçons » ; écran : ui/campscreen.ts, renderLore). Toutes les mécaniques
// du jeu, par chapitre, une fiche par notion. Ajout : le jeu Godot n'a pas
// d'encyclopédie.
//
// Les chiffres sont ceux du code au moment de l'écriture (fichier cité en
// commentaire) : qui change une règle doit changer sa fiche. Les types, eux,
// se lisent dans TYPE_CHART (combat/damage.ts) au moment d'ouvrir l'écran.

export interface LoreCard {
  title: string;
  text: string;
  /** Pastille de type à côté du titre. */
  type?: string;
  /** Liseré de la fiche (sinon la couleur du poste). */
  color?: string;
}

export interface LoreChapter {
  id: string;
  title: string;
  /** La phrase du savant en tête du chapitre. */
  intro: string;
  cards: LoreCard[];
}

/** Chapitre des types : ses fiches se construisent à partir de TYPE_CHART (campscreen.ts, typeCards). */
export const TYPES_CHAPTER: LoreChapter = {
  id: 'types',
  title: 'Types',
  intro: 'Le feu brûle la plante, l’eau noie le feu : tout le monde sait ça. Mais sais-tu ce que le Spectre fait au Normal ? Rien du tout. Pas de bonus de même type ici (pas de STAB) : seule compte la cible.',
  cards: [],
};

export const LORE: LoreChapter[] = [
  {
    id: 'combat',
    title: 'Combat',
    intro: 'Un combat se gagne avec les pieds autant qu’avec les crocs. Bouge, frappe, esquive : dans cet ordre, et sans t’arrêter.',
    cards: [
      // input/input.ts, ui/settingsmenu.ts
      { title: 'Les commandes', text: 'Flèches : bouger. Espace : dash. 1 à 4 : attaques, R : ultime, F : Méga-évolution. E : parler, ouvrir, prendre une porte. Tab : changer de Pokémon. C : la fiche de l’équipe. Échap : les réglages, où l’on change les touches.' },
      // combat/attackstate.ts, combat.ts:31
      { title: 'Quatre attaques, quatre recharges', text: 'Chaque emplacement a sa propre recharge, et toutes tournent en même temps : enchaîne-les plutôt que d’en marteler une. Un court verrou (0,34 s) sépare deux attaques. Plus ton Pokémon est rapide, plus ses recharges raccourcissent.' },
      // combat.ts:33-43
      { title: 'Le combo', text: 'Trois coups enchaînés en moins de 1,5 s : le 2ᵉ frappe à ×1,18, le 3ᵉ, le coup final, à ×1,55 et fait vaciller la cible. Pendant un combo, les recharges fondent (×0,42) ; le coup final, lui, recharge un peu plus lentement.' },
      // moves.ts:111-128, combat.ts:736-888
      { title: 'Physique ou spécial', text: 'Une attaque physique frappe tout ce qui est autour de toi, à courte portée (3 à 5 cases). Une attaque spéciale part de loin (7 à 11 cases) vers l’ennemi visible le plus proche, mais les murs et les rochers l’arrêtent. Plus une attaque est puissante, plus elle porte loin… et plus elle recharge lentement.' },
      // actor.ts:15-18, combat.ts:69
      { title: 'Le dash', text: 'Un bond rapide pendant lequel rien ne te touche : on traverse les coups et les ennemis. Il faut être en mouvement. Une charge au départ (1,6 s pour revenir), d’autres s’achètent chez Alakazam, et certains dons en ajoutent ou y greffent des effets.' },
      // combat.ts:56-59
      { title: 'Lire les coups ennemis', text: 'Un sauvage prépare son coup une demi-seconde avant de frapper, sur une petite zone : sors-en à pied ou d’un dash. Les champions préparent plus longtemps, mais frappent plus large.' },
      // damage.ts:71-85, pokemon.ts:175-199
      { title: 'Les dégâts', text: 'Ils dépendent du niveau, de la puissance de l’attaque et du rapport Attaque / Défense (Attaque Spé. / Défense Spé. pour le spécial), puis du type, de la météo et d’un peu de hasard. Un critique frappe à ×1,5 (60 % de chances au plus). L’Esquive fait rater un coup sur deux au mieux.' },
      // pokemon.ts:8-11, 115-117
      { title: 'Les niveaux', text: 'Monter de niveau donne des PV et frappe plus fort, mais l’Attaque, la Défense ou la Vitesse sont celles de l’espèce : ce sont les objets, les dons et les capacités de statut qui les font grimper. L’XP va à chaque membre qui a frappé l’ennemi.' },
      // main.ts:405-436, companion.ts
      { title: 'L’équipe et les compagnons', text: 'Tab passe au membre suivant. Ceux que tu ne joues pas se battent seuls à tes côtés : ils te protègent, visent les ennemis affaiblis et esquivent les attaques annoncées au sol.' },
      // main.ts (megaEvolve), data/megas.ts, catalog.ts (mega)
      { title: 'La Méga-évolution', color: '#e85aa8', text: 'Avec le Méga-Anneau (6 Éclats de Champion, chez Alakazam), F fait méga-évoluer le Pokémon que tu joues, s’il a une forme Méga : une fois par salle, jusqu’à la fin de la salle. Il prend les stats et les types de sa forme Méga, grandit et s’entoure d’une aura. Dracaufeu, Mewtwo et quelques autres choisissent entre X et Y.' },
      // main.ts:80-86, 1138-1183
      { title: 'K.O. et relève', text: 'Ton Pokémon tombe : le suivant prend la relève. Un Rappel le relève à moitié de ses PV. Toute l’équipe K.O. : la run s’arrête. Entre deux salles, on ne se soigne pas tout seul.' },
    ],
  },
  {
    id: 'etats',
    title: 'États',
    intro: 'Un coup bien placé fait mal une fois. Un état bien placé fait mal pendant des secondes. Note bien : un Pokémon déjà atteint ne change pas d’état tant que le premier n’est pas passé.',
    cards: [
      // pokemon.ts:13-24, combat.ts:86-94
      { title: 'Brûlure', type: 'fire', text: '7 s. Fait perdre 4,5 % des PV max toutes les 0,9 s. Une attaque Feu brûle une fois sur quatre ; Feu Follet brûle à coup sûr.' },
      { title: 'Poison', type: 'poison', text: '8 s. Fait perdre 6 % des PV max toutes les 0,9 s : le plus cruel. Une attaque Poison empoisonne trois fois sur dix, une attaque Plante une fois sur dix ; Toxik, Poudre Toxik et Vampigraine à coup sûr.' },
      { title: 'Paralysie', type: 'electric', text: '5 s. Divise la vitesse par deux : la cible se traîne. Une attaque Électrik paralyse une fois sur quatre ; Cage-Éclair à coup sûr.' },
      { title: 'Gel', type: 'ice', text: '3 s. La cible ne bouge plus et n’attaque plus. Une attaque Glace gèle une fois sur sept environ.' },
      { title: 'Sommeil', type: 'psychic', text: '3 s. Comme le gel : plus un geste. Une attaque Psy endort une fois sur huit, une attaque Spectre une fois sur dix ; Poudre Dodo, Berceuse et Bâillement à coup sûr.' },
      { title: 'Ça marche dans les deux sens', text: 'Les sauvages t’infligent les mêmes états, aux mêmes chances. Aucun type n’y est immunisé. Seule Régénération (refresh) les soigne.' },
      // world/weather.ts, combat.ts:465-478
      { title: 'Pluie et soleil', color: '#5aa0e8', text: 'Sous la pluie, l’Eau frappe à ×1,5 et le Feu à ×0,5 ; sous le soleil, c’est l’inverse. Choisis tes attaques selon le ciel.' },
      { title: 'Sable et grêle', color: '#c8a060', text: 'Toutes les 3 s, 3 % des PV max pour tout le monde, sans jamais descendre sous 1 PV. Le sable épargne Roche, Sol et Acier ; la grêle épargne la Glace. Le brouillard, lui, ne fait que gêner la vue. Pas de météo au Repaire, en boutique ni en grotte.' },
    ],
  },
  {
    id: 'capacites',
    title: 'Capacités',
    intro: 'Une attaque sans puissance n’est pas une attaque inutile. Un bon Danse-Lames vaut trois Charge.',
    cards: [
      // moves.ts:25-75, pokemon.ts:60-67, 207-218
      { title: 'Renforcements', text: 'Sur toi, pendant 8 s : Danse-Lames et Machination (Attaque ×1,5), Cognobidon (×2), Croissance et Plénitude (×1,4), Repli (Défense ×1,5), Mur de Fer (×2), Amnésie (Défense Spé. ×1,6), Hâte et Poliroche (Vitesse ×1,5), Reflet (Esquive), Puissance (critiques)… Relancé, un renforcement repart pour 8 s mais ne se cumule pas.' },
      { title: 'Affaiblissements', text: 'Sur les ennemis à portée, pendant 8 s : Rugissement et Charme baissent leur Attaque, Mimi-Queue, Groz’Yeux et Grincement leur Défense, Grimace leur Vitesse, Jet de Sable et Brouillard leur précision (ils ratent plus souvent).' },
      { title: 'Soins et protection', text: 'Soin et Synthèse rendent la moitié des PV, Repos tout, Avale un quart. Abri rend intouchable pendant 1,5 s.' },
      { title: 'États garantis', text: 'Cage-Éclair, Toxik, Feu Follet, Poudre Dodo et leurs cousines frappent l’ennemi le plus proche d’un état à coup sûr (voir le chapitre États).' },
      // run/rewards.ts
      { title: 'Apprendre en run', text: 'Une porte « attaque » propose trois grandes attaques que ton Pokémon peut apprendre (Lance-Flammes, Tonnerre, Surf, Séisme, Psyko…), ou d’améliorer une attaque équipée : +25 % de puissance, quatre fois au plus.' },
      // run/rewards.ts (MOVE_EVOLUTIONS, EVOLVE_AT)
      { title: 'Les attaques qui évoluent', text: 'Renforcée deux fois, une attaque peut évoluer en sa grande sœur, du même type : Pistolet à O devient Hydrocanon, Flammèche Lance-Flammes, Éclair Tonnerre… La carte de renforcement l’annonce.' },
      // combat/combat.ts (weatherMove)
      { title: 'Les attaques de météo', text: 'Danse Pluie, Zénith, Tempête de Sable et Grêle changent le temps de la salle jusqu’à son éclaircie (voir le chapitre États). Danse Pluie et Zénith se vendent chez M. Mime.' },
      // data/abilities.ts
      { title: 'Les talents météo', text: 'Certains Pokémon changent le temps rien qu’en arrivant : Tarpaud et Kyogre font pleuvoir (Crachin), Chartor et Groudon allument le soleil (Sécheresse), Tyranocif et Hippodocus lèvent le sable (Sable Volant), Blizzaroi fait tomber la grêle (Alerte Neige). Dans ton équipe comme en face : le dernier arrivé l’emporte. La fiche du Pokémon (C, ou Porygon au Repaire) dit s’il a un talent.' },
      { title: 'Lévitation et contact', text: 'Les Pokémon à Lévitation (Fantominus, Smogo…) flottent : les attaques Sol ne les touchent pas. Frappe au corps à corps un Pokémon à Statik, Corps Ardent ou Point Poison, et tu risques la paralysie, la brûlure ou le poison. La fiche (C) dit qui a quoi.' },
      { title: 'Absorber et se surpasser', text: 'Absorb Eau et Absorb Volt soignent au lieu de blesser ; Torche avale le Feu et renforce ses propres flammes. Les starters (Engrais, Brasier, Torrent) frappent plus fort quand ils sont à bout de forces.' },
      { title: 'Intimidation', text: 'Arcanin, Léviator, Luxray, Crocorible, et même Baggiguane font peur : tout adversaire qui s’en approche perd un quart de son Attaque pendant dix secondes, une fois par salle. Méfie-toi des Grahyèna : ça marche aussi contre toi.' },
      // catalog.ts:111-135, meta/weight.ts
      { title: 'CT du tuteur', text: 'M. Mime vend des CT au Repaire, une fois pour toutes : l’attaque s’équipe ensuite à la hutte de Porygon. Gare au poids : une attaque de plus de 40 de puissance pèse dans l’équipe.' },
      // boons.ts:345-348, boonhooks.ts:501-576
      { title: 'L’ultime', text: 'Une attaque dévastatrice, offerte par un légendaire (à partir de l’acte 2, en 3ᵉ carte de ses dons). Sa jauge se remplit quand tu frappes, et quatre fois plus vite quand tu es frappé. Pleine : R. Chaque légendaire a la sienne : foudre paralysante, déflagration, blizzard qui gèle, trou noir qui attire et endort, ralenti du temps…' },
    ],
  },
  {
    id: 'dons',
    title: 'Dons',
    intro: 'Les légendaires ne se montrent pas, mais ils regardent. Ceux qui leur plaisent repartent avec un peu de leur pouvoir… pour une run seulement.',
    cards: [
      // boons.ts:294-313
      { title: 'Choisir un don', text: 'Une porte « don » mène à un légendaire : il propose trois dons, tu en gardes un jusqu’à la fin de la run. Chaque légendaire a son style : foudre, feu, glace, ombre, chance…' },
      // boons.ts:163-174
      { title: 'Dons de stats et d’effets', text: 'Certains montent une stat (+25 % de PV, d’Attaque, de Vitesse…, des critiques, de la portée, une cadence plus vive). D’autres changent ta façon de te battre : coups qui rebondissent, dash qui laisse une traînée, armure de givre, racines quand on reste immobile, retour trois secondes en arrière…' },
      // boons.ts:177-179, 256-285
      { title: 'Raretés', text: 'Commun, Rare (×1,4), Épique (×1,85), Prismatique (×2,4) : le même don, en plus fort. Les raretés montent au fil des salles, d’un cran si tu as fini la salle sans prendre un coup, et reprendre un don qu’on a déjà le fait monter d’un cran.' },
      { title: 'Dons duo', text: 'Garde un don de deux légendaires différents : leurs dons croisés, les duos, peuvent apparaître en première carte. Les plus puissants du jeu.' },
    ],
  },
  {
    id: 'run',
    title: 'La run',
    intro: 'Quatre actes, quatre champions, et des sauvages entre eux. Personne n’a dit que la route serait courte.',
    cards: [
      // run/run.ts:18-20, 36-47
      { title: 'Actes et salles', text: 'Un acte : sept salles de combat ou spéciales, une boutique, puis le champion. On part de la Prairie, au sud de la carte du monde, et chaque champion battu ouvre les biomes voisins.' },
      // world/worldmap.ts, meta/feats.ts
      { title: 'La Route Victoire', text: 'Bats les dix champions des biomes, une fois chacun : au bout de la carte s’ouvre la Route Victoire, un cinquième acte plus dur encore. Le Conseil garde alors le dernier étage, et le Maître de la Ligue attend au bout.' },
      { title: 'Le carnet', text: 'Xatu, près de l’arche, tient la liste de tous les exploits — chaque champion à battre, chaque biome à atteindre, les victoires, la taille de la rébellion. Un exploit fait se réclame au Repaire, dans le carnet : des Baies et des Éclats de Champion.' },
      // run.ts:52-68, 251-256
      { title: 'Les portes', text: 'Une salle vidée ouvre jusqu’à trois portes ; chacune annonce sa récompense : un don, une attaque, ou un butin de ₽. La récompense laissée au centre est perdue si on part sans la prendre.' },
      // run.ts:333-360, room.ts
      { title: 'Les vagues', text: 'Les sauvages arrivent par vagues, annoncées par un anneau magenta au sol : ne reste pas dessus. Plus tu avances et plus ton équipe est grande, plus ils sont nombreux.' },
      // run.ts:242-244
      { title: 'Les ₽', text: 'Chaque salle vidée rapporte des ₽ (de plus en plus), à dépenser en boutique. Ils ne servent que pendant la run : au Repaire, on compte en Baies.' },
      // run/shop.ts
      { title: 'La boutique', text: 'Avant chaque champion : des potions, une CT, un lot de Baies, un lot de ressources pour le Repaire et des mercenaires. Un mercenaire réclame sa solde à la boutique suivante.' },
      // run/berries.ts, run/chests.ts
      { title: 'Baies et coffres', text: 'Frappe deux fois un arbre à baies pour en faire tomber. Beaucoup de salles cachent un coffre (E) : Baies, Bois, Pierre, Nourriture. Les plus riches demandent une CS : Coupe, Éclate-Roc ou Force.' },
      // data/forms.ts, data/evolutions.ts (REGIONAL_EVOLUTIONS)
      { title: 'Les formes régionales', text: 'Certains sauvages portent la forme d’une autre région : Rattata d’Alola, Miaouss de Galar, Caninos de Hisui… avec leurs propres types. Et certains Pokémon évoluent autrement selon le biome : Pikachu devient Raichu d’Alola à la Plage, Noeunoeuf Noadkoko d’Alola, Osselait Ossatueur d’Alola au Volcan.' },
      // main.ts (nuzlockeToll), ui/options.ts
      { title: 'Le mode Nuzlocke', text: 'À cocher dans Échap → Réglages, pour la run suivante : en fin de run, un Pokémon encore K.O. ou resté capturé est relâché pour de bon. Un Rappel ou la Source le sauvent ; le dernier de l’équipe n’est jamais relâché. Pas en ligne.' },
      // enemy.ts:84-86, 218-220
      { title: 'Herbe haute', color: '#5cae4e', text: 'En Prairie, Forêt, au Lac et à la Plage, les sauvages s’y cachent : invisibles au-delà de 3,6 cases, ils ne se montrent qu’en approchant ou en attaquant. On les devine à l’herbe qui bouge.' },
      // entities/actor.ts (onIce, glissade)
      { title: 'La glace', color: '#8fd0f0', text: 'Sur la Montagne glacée, les plaques de glace ne pardonnent pas : un pas dessus, et l’on file tout droit jusqu’au premier obstacle ou au bout de la plaque, sans pouvoir tourner. Le gravier du sentier donne prise ; un dash, lui, permet de s’en échapper en plein combat.' },
      // main.ts (victoire, défaite)
      { title: 'Fin de run', text: 'Gagnée ou perdue, une run rapporte des Baies : un peu par salle franchie, beaucoup par champion battu, et une belle somme pour une victoire. Les Éclats de Champion, eux, ne tombent que des champions.' },
    ],
  },
  {
    id: 'salles',
    title: 'Salles',
    intro: 'Toutes les clairières ne se ressemblent pas. Certaines cachent un piège, d’autres un trésor, et quelques-unes les deux.',
    cards: [
      // world/layouts.ts
      { title: 'Formes des salles', text: 'Clairières, arènes rondes, couloirs, deux clairières reliées par un goulet, carrefours, boucles autour d’un lac ou d’un bosquet, sentiers en lacets, au Lac une île reliée à la rive par deux gués, au Rocailleux des terrasses : chaque biome a ses préférées, en plusieurs tailles.' },
      // layouts.ts (front), room.ts (announce)
      { title: 'Ligne de front', color: '#f259bf', text: 'Un long couloir : chaque vague surgit au bout le plus éloigné de toi et charge en masse. Le sol gronde et une flèche magenta montre d’où elle vient un peu avant. Moins de vagues, mais plus fournies. En Forêt, c’est un sentier étroit entre les arbres ; en Prairie, un chemin au milieu des champs d’herbe haute.' },
      // run.ts:79-87, 291-298, room.ts
      { title: 'Le Défi', text: 'Bats tous les sauvages avant la fin du chrono : il annonce combien, et compte les vaincus. Réussi, le gain est triplé et un don t’attend ; trop lent, ils s’enfuient avec la récompense.' },
      { title: 'Le Piège', text: 'Aucune porte ne l’annonce. Une récompense trop belle au milieu d’une salle vide… Approche, et l’embuscade se referme : trois vagues, plus nombreuses et plus fortes. Survis, et le gain est doublé.' },
      // run/spring.ts
      { title: 'La Source', color: '#6fd3e0', text: 'Pas d’ennemis : Leveinard veille sur un étang magique, au crépuscule, avec des fées. Parle-lui (E) pour boire. Bois-y une fois (E) : chaque membre regagne 60 % de ses PV, perd son statut, et les K.O. se relèvent.' },
      // run/altar.ts, run/run.ts (CURSES)
      { title: 'L’Autel maudit', color: '#b48ce8', text: 'De nuit, Feuforêve garde un cercle magique entre deux torches. Signe le pacte (E) : un don plus rare, contre une malédiction jusqu’à la fin de l’acte, lisible avant de signer.' },
      // run/residents.ts, meta/errands.ts
      { title: 'Les habitants', text: 'Des Pokémon vivent dans les salles calmes : parle-leur (E). Certains te demandent un service ; une fois rendu, retrouve-les dans une salle du même genre pour être payé. Ils y reviennent souvent. Tes services en cours sont dans la fiche de l’équipe (C).' },
      // run/dojo.ts
      { title: 'Le Dojo', color: '#e08a4c', text: 'Machopeur tient un dojo au toit rouge. Monte sur son tatami (E) : une leçon gratuite, apprendre une attaque forte ou en renforcer une, pour le Pokémon de ton choix. Deux leçons par dojo ; refermer le parchemin sans rien prendre ne compte pas.' },
      // run/pension.ts
      { title: 'La Pension', color: '#e8a8c8', text: 'Écrémeuh garde un grand enclos. Parle-lui (E) : elle entraîne l’équipe (des niveaux que tu répartis comme tu veux, plus nombreux à chaque acte, et d’autres contre des ₽) ou échange un membre contre un Pokémon du Repaire, chacun une fois.' },
      // entities/actor.ts (terrainMult), run/hazards.ts, run/room.ts (Village), world/generate.ts (hide)
      { title: 'Le terrain', text: 'Chaque biome a son piège : hautes herbes qui cachent les sauvages, boue qui ralentit, lave qui brûle, tourbillons de sable, glace qui fait glisser, dresseurs qui lancent des Poké Balls au Village.' },
      // run/cave.ts
      { title: 'Les grottes', text: 'Une bouche de grotte s’ouvre parfois une fois la salle vidée, surtout en montagne et au volcan. Dedans, un sbire et son escorte : bats-les, puis libère le prisonnier au fond.' },
      // run/capture.ts
      { title: 'Les Poké Balls du sbire', text: 'Le sbire lance des Balls : un anneau rouge marque la chute, sors-en. Touché, alterne ← et → pour te débattre. Capturé, ton Pokémon quitte l’équipe : bats le sbire pour le récupérer.' },
    ],
  },
  {
    id: 'ennemis',
    title: 'Ennemis',
    intro: 'Un sauvage n’est pas un idiot. Il sait ce qui te fait mal, et il ira le chercher.',
    cards: [
      // enemy.ts:27, 89-93, 30-49
      { title: 'Les comportements', text: 'Les poursuivants foncent au contact. Les tireurs (ceux qui ont une attaque spéciale) gardent leurs distances. Les chargeurs préparent une longue ruée en ligne droite : écarte-toi. Les escarmoucheurs frappent et reculent. Les soutiens chantent pour renforcer leurs alliés : abats-les d’abord.' },
      // enemy.ts:318-343
      { title: 'Ils visent ta faiblesse', text: 'Un sauvage choisit sa cible selon l’efficacité de son type : un Pokémon Feu dans une équipe attirera tous les sauvages Eau de la salle.' },
      // enemy.ts:56-81, main.ts
      { title: 'Les champions', text: 'Plusieurs barres de PV et de grandes attaques annoncées au sol. Battu, un champion te cède un Pokémon de son équipe : le plus faible d’abord, puis, victoire après victoire, jusqu’à son as.' },
      { title: 'L’as', text: 'Le dernier Pokémon du champion, et le plus coriace : cinq barres, des zones plus fréquentes, et parfois la pluie sur ses dernières barres. S’il a une forme Méga, il méga-évolue en perdant une barre.' },
      // combat/signatures.ts
      { title: 'Les signatures', text: 'Chaque champion a son attaque fétiche, qui ouvre le bal : la cage de rochers de Pierre, les vagues d’Ondine, la croix électrique de Major Bob, la spirale de fleurs d’Erika, les flaques de Koga, les salves de Morgane, l’anneau de feu d’Auguste, le séisme de Giovanni, les roulades de Blanche. Apprends-les.' },
    ],
  },
  {
    id: 'repaire',
    title: 'Le Repaire',
    intro: 'Ce camp, c’est ce qui reste quand une run tourne mal. Fais-le grandir, et la prochaine tournera mieux.',
    cards: [
      // meta/save.ts, catalog.ts
      { title: 'Baies, ressources, Éclats', text: 'Les Baies paient presque tout au Repaire. Bois, Pierre et Nourriture paient les chantiers de Charpenti. Les Éclats de Champion paient le Bracelet de charge.' },
      { title: 'Les postes', text: 'Dracolosse : le départ. Porygon : l’équipe et le Pokédex. Charpenti : les chantiers. Les autres gardiens arrivent avec leurs bâtiments : missions, quêtes, CT, objets, améliorations, potager, atelier.' },
      // meta/weight.ts
      { title: 'Le poids d’équipe', text: 'Une équipe ne part pas trop lourde : 24 au départ. Un Pokémon pèse 3, 5 ou 8 selon son stade d’évolution (10 pour un légendaire), un objet tenu 2, une attaque de 0 à 3 selon sa puissance. Le Bracelet de charge monte le plafond.' },
      // catalog.ts:21-102
      { title: 'Améliorations', text: 'Chez Alakazam : des places dans l’équipe (on part seul, jusqu’à six), le Partage d’XP, une bourse de ₽ au départ, des charges de dash, la Ceinture de Rappels, de la Vitalité, l’Aimant à Baies, le Méga-Anneau, et les CS (Surf, Coupe, Éclate-Roc, Force).' },
      // catalog.ts:151-164
      { title: 'Objets tenus', text: 'Achetés chez Miaouss, au marché, donnés à un Pokémon à la hutte de Porygon, gardés d’une run à l’autre. Chacun multiplie une stat (ceux de l’atelier, souvent deux) : Bandeau Muscle l’Attaque, Peau Métal la Défense, Vive Griffe la Vitesse, Restes les PV… sans autre effet.' },
      // catalog.ts:172-177, data/evolutions.ts
      { title: 'Évolution et Super Bonbon', text: 'On évolue en pleine run, au bon niveau, avec tous ses PV rendus. Un Super Bonbon donne +5 niveaux de départ (20 au plus) : assez haut, le Pokémon part déjà évolué.' },
      // meta/save.ts:166-194
      { title: 'Recruter des Pokémon', text: 'Bats dix fois une espèce : l’un d’eux t’attendra près du feu, parle-lui. Les suivants en demandent plus. Le Repaire a des places limitées : bâtis pour en loger davantage.' },
      // meta/quests.ts (contrats)
      { title: 'Quêtes et contrats', text: 'Kangourex propose des quêtes au long cours, chacune promettant un Pokémon introuvable ailleurs, et trois contrats toujours renouvelés : de petits objectifs de run payés en Baies, en ressources ou en Éclat, parfois avec un Super Bonbon ou un objet tenu en prime.' },
      // catalog.ts:216-228, meta/missions.ts
      { title: 'Aménagements et missions', text: 'Charpenti bâtit, au fil des runs : bâtiments des gardiens, dortoir, terrain d’entraînement, champ, maisons, bourg, carrière… Chaque chantier fait de la place aux libérés. Démolosse envoie des libérés en mission chercher des ressources.' },
      // meta/crafting.ts
      { title: 'Potager et matériaux', text: 'Chaque coffre rapporte le matériau de son biome. Au Potager, Héliatronc plante ce que tu veux : ça pousse à chaque salle franchie, et se récolte en herbes et en racines.' },
      { title: 'L’atelier et les nectars', text: 'Queulorior mêle matériaux et herbes en objets tenus qu’on ne trouve nulle part ailleurs (souvent deux stats à la fois), et en nectars. Posé sur la coupelle devant l’atelier, un nectar attire en 5 salles un Pokémon pas encore libéré, d’un type qu’il aime : parle-lui, il reste.' },
    ],
  },
];
