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
      { title: 'Les commandes', text: 'Flèches : se déplacer. Maj ou Espace : dash. 1 à 4 (ou Q, Z, S, D) : les quatre attaques. R : l’ultime. E : parler, ouvrir, ramasser, prendre une porte. Tab : changer de Pokémon. C : la fiche de l’équipe. Échap : les réglages. À la manette : B dash, X/Y/LB/RB attaques, A interagir, RT ultime.' },
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
      { title: 'L’équipe et les compagnons', text: 'Tab passe au membre suivant ; le combo repart de zéro, mais chacun garde ses recharges. Ceux que tu ne joues pas se battent seuls à tes côtés : ils foncent sur les ennemis proches et te rejoignent s’ils s’éloignent trop.' },
      // main.ts:80-86, 1138-1183
      { title: 'K.O. et relève', text: 'Ton Pokémon tombe : le suivant prend la relève presque aussitôt. La Ceinture de Rappels est une réserve commune : chaque K.O. en consomme un, et le Pokémon se relève à moitié de ses PV. Toute l’équipe K.O., la run s’arrête, et tu rentres avec quelques Baies par salle franchie. Attention : on ne se soigne pas tout seul entre deux salles.' },
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
      { title: 'Choisir un don', text: 'Une porte « don » mène à un légendaire, qui propose trois dons ; on en garde un. Ils durent jusqu’à la fin de la run. Dix légendaires, chacun son style : la foudre d’Électhor, le feu de Sulfura, la glace d’Artikodin, l’esprit de Mew, l’ombre de Darkrai, la terre de Groudon, le temps de Célébi, la flamme sacrée de Ho-Oh, le ciel de Rayquaza, la chance de Jirachi.' },
      // boons.ts:163-174
      { title: 'Dons de stats et d’effets', text: 'Certains montent une stat (+20 % de PV, d’Attaque, de Vitesse…, des critiques, de la portée, une cadence plus vive). D’autres changent ta façon de te battre : coups qui rebondissent, dash qui laisse une traînée, armure de givre, racines quand on reste immobile, retour trois secondes en arrière…' },
      // boons.ts:177-179, 256-285
      { title: 'Raretés', text: 'Commun, Rare (×1,5), Épique (×2,2), Prismatique (×3) : le même don, en plus fort. Les raretés montent au fil des salles, d’un cran si tu as fini la salle sans prendre un coup, et reprendre un don qu’on a déjà le fait monter d’un cran.' },
      { title: 'Dons duo', text: 'Garde un don de deux légendaires différents : leurs dons croisés, les duos, peuvent apparaître en première carte. Les plus puissants du jeu.' },
    ],
  },
  {
    id: 'run',
    title: 'La run',
    intro: 'Quatre actes, quatre champions, et des sauvages entre eux. Personne n’a dit que la route serait courte.',
    cards: [
      // run/run.ts:18-20, 36-47
      { title: 'Actes et salles', text: 'Un acte : cinq salles de combat, une boutique, puis le champion. On part de la Prairie ; chaque champion battu ouvre les biomes voisins (Forêt, Village, Plage, puis Lac, Marais, Rocailleux, Volcan, Montagne glacée…). L’Océan ne s’atteint que depuis la Plage, avec la CS Surf.' },
      // run.ts:52-68, 251-256
      { title: 'Les portes', text: 'Une salle vidée ouvre jusqu’à trois portes ; chacune annonce sa récompense : un don, une attaque, ou un butin de ₽. La récompense laissée au centre est perdue si on part sans la prendre.' },
      // run.ts:333-360, room.ts
      { title: 'Les vagues', text: 'Les sauvages arrivent par vagues, annoncées par un anneau magenta au sol : ne reste pas dessus. Plus on avance, plus elles sont nombreuses et fortes. Une fois provoqués, ils te foncent dessus.' },
      // run.ts:242-244
      { title: 'Les ₽', text: 'Chaque salle vidée rapporte des ₽ (de plus en plus), à dépenser en boutique ou chez le marchand. Ils ne servent que pendant la run : au Repaire, on compte en Baies.' },
      // run/shop.ts
      { title: 'La boutique', text: 'Avant chaque champion : des potions (de plus en plus fortes avec les actes), des Rappels si quelqu’un est K.O., une CT par visite, et des mercenaires à embaucher (Éclaireur, Vétéran, Champion Sauvage) pour compléter l’équipe — mais un mercenaire K.O. ne se ranime pas.' },
      // run/berries.ts, run/chests.ts
      { title: 'Baies et coffres', text: 'Frappe les arbres à baies : au deuxième coup, ils en lâchent quelques-unes, qui pourrissent en 25 s. Deux salles sur trois cachent un coffre (E pour l’ouvrir) : Baies, Bois, Pierre, Nourriture. Les plus riches sont derrière un arbuste (CS Coupe) ou un rocher fissuré (CS Éclate-Roc).' },
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
      { title: 'Formes des salles', text: 'Clairières, arènes rondes, couloirs, deux clairières reliées par un goulet, carrefours, boucles autour d’un lac ou d’un bosquet, sentiers en lacets : chaque biome a ses préférées, en plusieurs tailles.' },
      // layouts.ts (front), room.ts (announce)
      { title: 'Ligne de front', color: '#f259bf', text: 'Un long couloir : chaque vague surgit au bout le plus éloigné de toi et charge en masse. Le sol gronde et une flèche magenta montre d’où elle vient un peu avant. Moins de vagues, mais plus fournies. En Forêt, c’est un sentier étroit entre les arbres ; en Prairie, un chemin au milieu des champs d’herbe haute.' },
      // run.ts:79-87, 291-298, room.ts
      { title: 'Le Défi', text: 'Une salle chronométrée : 30 s, plus 10 s par vague. Vide-la à temps et le gain est triplé ; trop lent, les sauvages s’enfuient avec la récompense.' },
      { title: 'Le Piège', text: 'Une récompense trop belle au milieu de la salle… Approche, et l’embuscade se referme : trois vagues, plus nombreuses et plus fortes. Survis, et le gain est doublé.' },
      // run/merchant.ts
      { title: 'Le marchand', text: 'Miaouss tient boutique au bord du chemin, deux marchés, une fois chacun : parier la moitié de tes ₽ à pile ou face, ou troquer un tiers des PV de chaque membre contre un don.' },
      // run/cave.ts
      { title: 'Les grottes', text: 'Surtout en Rocailleux, au Volcan et en Montagne glacée, une bouche de grotte s’ouvre une fois la salle vidée. Dedans, un sbire de la Ligue : il parle, puis envoie son Pokémon fort et son escorte. Bats-les pour des ₽ et un soin complet de l’équipe (son Pokémon, lui, ne se recrute pas). Au fond, un coffre et un prisonnier à libérer, qui rejoindra le Repaire. Fuir, c’est perdre la grotte.' },
      // run/capture.ts
      { title: 'Les Poké Balls du sbire', text: 'Il lance des Balls sur le Pokémon que tu joues : un anneau rouge marque le point de chute, sors-en ou dashe. Touché, débats-toi avec ← et → en alternance pour remplir la jauge, qui se vide d’autant plus vite qu’il te reste peu de PV. Capturé, il quitte l’équipe : bats le sbire pour le récupérer. Si tu fuis, il est perdu pour la run.' },
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
      { title: 'Les champions', text: 'Plus forts et plus résistants, avec plusieurs barres de PV : chaque barre brisée se remplit à nouveau. Ils ne reculent pas sous les coups et lancent de grandes attaques de zone (cercle, cône ou ligne selon leur type), annoncées au sol. Plus ton équipe est grande, plus ils ont de PV.' },
      { title: 'L’as', text: 'Le dernier Pokémon du champion, et le plus coriace : cinq barres, des zones plus fréquentes, et parfois la pluie sur ses dernières barres.' },
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
      { title: 'Baies, ressources, Éclats', text: 'Les Baies paient presque tout au Repaire. Le Bois, la Pierre et la Nourriture (coffres, missions, champ) paient les constructions de Charpenti ; ses chantiers qui font venir un gardien (Poste d’expédition, Buvette, Étude, Marché, Atelier) se paient en Baies. Les Éclats de Champion, gagnés sur les champions, paient le Bracelet de charge.' },
      { title: 'Les postes', text: 'Dracolosse : le départ. Porygon : l’équipe, les attaques, les objets tenus, le Pokédex. Charpenti : les aménagements. Démolosse : les missions (une fois le Poste d’expédition bâti). Kangourex : les quêtes (une fois la Buvette bâtie). M. Mime : les CT, et Miaouss : les objets tenus et les Super Bonbons (une fois le Marché bâti). Alakazam : les améliorations et les CS (une fois l’Étude bâtie). Héliatronc : le potager (une fois le Champ bâti). Queulorior : l’atelier (une fois l’Atelier bâti). Et moi, pour les questions.' },
      // meta/weight.ts
      { title: 'Le poids d’équipe', text: 'Une équipe ne part pas trop lourde : 24 au départ. Un Pokémon pèse 3, 5 ou 8 selon son stade d’évolution (10 pour un légendaire), un objet tenu 2, une attaque de 0 à 3 selon sa puissance. Le Bracelet de charge monte le plafond.' },
      // catalog.ts:21-102
      { title: 'Améliorations', text: 'Chez Alakazam : des places dans l’équipe (on part seul, jusqu’à six), le Partage d’XP, une bourse de ₽ au départ, des charges de dash, la Ceinture de Rappels, de la Vitalité, l’Aimant à Baies, et les CS (Surf, Coupe, Éclate-Roc).' },
      // catalog.ts:151-164
      { title: 'Objets tenus', text: 'Achetés chez Miaouss, au marché, donnés à un Pokémon à la hutte de Porygon, gardés d’une run à l’autre. Chacun multiplie une stat (ceux de l’atelier, souvent deux) : Bandeau Muscle l’Attaque, Peau Métal la Défense, Vive Griffe la Vitesse, Restes les PV… sans autre effet.' },
      // catalog.ts:172-177, data/evolutions.ts
      { title: 'Évolution et Super Bonbon', text: 'On évolue en pleine run, au bon niveau, avec tous ses PV rendus. Un Super Bonbon donne +5 niveaux de départ (20 au plus) : assez haut, le Pokémon part déjà évolué.' },
      // meta/save.ts:166-194
      { title: 'Recruter des Pokémon', text: 'Chaque Pokémon que tu bats en run sort d’une Poké Ball : tu le libères. Bats dix fois une espèce, et l’un d’eux viendra t’attendre près du feu (un « ! » au-dessus de lui) : parle-lui, donne-lui un nom. La deuxième fois, il en faut vingt, puis entre vingt et quarante. Chacun a sa nature et ses talents : deux Rattata ne se valent pas. Le Repaire ne loge qu’un certain nombre de libérés — le Dortoir, les Maisons et le Bourg en logent plus ; plein, il faudra choisir qui s’en va. Les grottes, les nectars de l’atelier et les quêtes de Kangourex font venir des Pokémon rares.' },
      // catalog.ts:216-228, meta/missions.ts
      { title: 'Aménagements et missions', text: 'Charpenti bâtit le Poste d’expédition (Démolosse), la Buvette (Kangourex), l’Étude, le Marché, le Dortoir, le Terrain d’entraînement, le Ponton, des Jardins et des Lampadaires, puis défriche à l’ouest pour un champ et des maisons, et à l’est pour un bourg pavé. Ses nouveaux plans n’arrivent qu’au fil des runs. Chaque chantier fait de la place à des libérés : ce sont les seuls à vivre au Repaire. Démolosse envoie des libérés en mission : ils quittent l’équipe et reviennent, après quelques salles de ta run, avec du Bois, de la Pierre, de la Nourriture, des Baies ou de l’entraînement.' },
      // meta/crafting.ts
      { title: 'Potager et matériaux', text: 'Chaque coffre de run rapporte le matériau de son biome — Jolie Plume en prairie, Petit Champi en forêt, Charbon au volcan, Écaille Cœur au lac, Glace Éternelle en montagne… Au Potager, on dit à Héliatronc quoi planter, sans graines : chaque parcelle pousse à chaque salle franchie — semis, pousses, boutons — et, en fleur, se récolte en herbes et en racines.' },
      { title: 'L’atelier et les nectars', text: 'Queulorior mêle matériaux et herbes en objets tenus qu’on ne trouve nulle part ailleurs (souvent deux stats à la fois), et en nectars. Posé sur la coupelle devant l’atelier, un nectar attire en 5 salles un Pokémon pas encore libéré, d’un type qu’il aime : parle-lui, il reste.' },
    ],
  },
];
