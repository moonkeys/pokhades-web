# Pokhades — prototype web 2D

Prototype de direction artistique 2D (Vite + TypeScript, Canvas 2D, sans
moteur) pour le portage web de Pokhades.

Le projet est autonome : `public/game/` contient les **seuls** assets du jeu
Godot qu'il utilise (tileset, monture Surf, effet de pas, planches de marche
PMD et fiches PokéAPI des espèces jouées ou rencontrées, pavés extraits
d'Essentials). Pour les resynchroniser avec la base Godot (dossier frère
`../pokhades`, ou le chemin donné dans `POKHADES_GODOT`) :

```bash
npm install
npm run import-assets   # recopie depuis le dépôt Godot, complète depuis SpriteCollab et PokéAPI
npm run dev             # http://localhost:5173 (?debug pour l'objet de debug)
npm run build           # dist/
```

Bestiaire (`config.html`, servi par `npm run dev` seulement, sur
http://localhost:5173/config.html) : la page de config des espèces. À gauche,
toutes les espèces du Pokédex national, celles que le jeu embarque et celles
qu'on peut ajouter ; au
centre, les biomes, où l'on glisse les espèces (l'ordre compte : les 9
premières peuplent le début de chaque acte). Un clic ouvre la fiche : biomes,
stats et rôles, attaques (jeu de départ, ou 4 imposées parmi celles qu'elle
peut apprendre), caractère et répliques avec aperçu, histoire, et toutes les
animations PMD et les portraits (celles que le jeu n'a pas sont lues en ligne
sur SpriteCollab). « Enregistrer » (⌘S) écrit `src/data/bestiary.json`, que
le jeu lit (faune des biomes, attaques imposées, répliques à la boutique et
au Repaire) ; le jeu ouvert se recharge. « Importer les assets » lance
`import-assets` pour copier ce qu'il manque aux espèces ajoutées.

`import-assets` prend d'abord dans le dépôt Godot ; ce qu'il n'y trouve pas
(espèce ajoutée depuis la page, action PMD que le dépôt n'a pas copiée, fiche
d'attaque) est tiré des planches PMD de SpriteCollab et des fiches de PokéAPI,
construites comme `PokemonAPI.gd`, et gardé dans `.cache/remote/`
(`scripts/remote.ts`). Supprimer `.cache/remote/index.json` rafraîchit la liste
des espèces de la page.

Commandes en jeu :

- flèches pour se déplacer, Maj ou Espace pour le dash (une charge, il faut bouger) :
  comme dans Hades, il traverse les arbres, les rochers, les décors et les ennemis,
  mais pas les bords de la zone, les parois de falaise ni les constructions
  (maisons, huttes, ruines) ; l'eau arrête qui ne sait pas nager. Stoppé net par
  l'un d'eux, le Pokémon encaisse le choc et rebondit d'une demi-case (poussière,
  écran qui tressaille, sans perte de PV) ; en biais, il glisse le long. S'il
  finit dans un obstacle, il file jusqu'à la première place libre, sinon on recule ;
- 1 à 4, ou Q Z S D (position AZERTY), pour les quatre capacités ;
- E (A à la manette) pour ramasser la récompense d'une salle, parler, acheter ;
- R, ou W en AZERTY (gâchette droite à la manette), pour l'ultime ;
- Tab (clic du stick droit à la manette) pour passer au Pokémon suivant de
  l'équipe, ou un clic sur un membre de la liste en haut à gauche ;
- C pour la fiche des statistiques de l'équipe (stats, objet tenu, attaques,
  et en run les dons reçus), en run comme au Repaire ;
- Échap pour fermer un écran du Repaire ;
- Page↑ / Page↓ pour forcer le biome de la run, N pour une nouvelle run, H pour
  masquer le panneau de réglages (ces deux raccourcis de test sont coupés dans le
  jeu publié).

Le Pokémon monte sur la monture Surf dès qu'il entre dans l'eau — en run comme au
Repaire, seulement avec la CS Surf (retour de test : on nageait partout en run).
Sans elle, la récompense d'une salle se pose là où l'on va à pied, jamais sur
l'îlot du Lac (`landReachable`, `src/world/generate.ts`) ; une salle dont une
porte ne s'atteint pas à pied (rare, une Plage sur vingt-cinq) laisse nager.

Panneau de test (H) : dans le jeu publié (GitHub Pages, build de production), il
ne garde que « Repaire (tests) » — retour au camp, +1000 Baies, tout remettre à
zéro — et les réglages de test gardés dans le navigateur (biome forcé, forme des
salles, météo) reviennent à ceux du jeu. Le serveur de dev garde tout.

Run (portée de `RunManager.gd` et `CombatArena.gd`) : 4 actes de 7 salles
(5 combats, une boutique, un boss). La run part toujours de la Prairie, et
chaque boss vaincu ouvre une porte par biome voisin sur la **carte du monde**
(ajout, `src/world/worldmap.ts`, retour de test : « on passe du lac à la
montagne en deux secondes, ce n'est pas logique ») : une carte fixe, quatre
étages qui montent du sud au nord et du clair au sombre. Prairie → Plage
(ouest), Village (nord) ou Forêt (est) ; puis Océan, Marais, Lac ou Automne ;
enfin Volcan, Rocailleux ou Montagne glacée. Les routes suivent le paysage :
la Forêt jaunit en Automne qui monte en Montagne, la Plage longe la mer
(Océan, avec Surf) ou s'enlise au Marais, le Lac s'adosse aux Rocailleux,
l'Océan finit sur une île volcanique. Chaque porte de route est percée sur le
bord de la salle qui regarde son biome (`Run.pickExits`) et annonce son biome
en grand, au-dessus de la récompense de la salle d'après. La Plage mène à
l'Océan seulement si l'on est parti avec la CS Surf : sans elle, la porte
reste visible mais fermée (« CS Surf requise »), et le Marais reste ouvert.

Sens des salles (ajout, retour de test : « je sors par la droite et j'arrive
par le haut ») : on entre dans une salle par le bord d'en face de la porte
prise (`Run.entrySide`) — sorti à l'est, on arrive à l'ouest. Les formes à
chemins pivotent d'un quart de tour pour mettre leur entrée de ce côté
(`orientShape`, `src/world/layouts.ts`, la carte échange largeur et hauteur ;
rien de dessiné ne tourne, les tuiles se choisissent après) ; la clairière,
la Plage (la mer se met en face) et l'Océan placent leur entrée eux-mêmes.
Restent entrés par le bas : le Village (ses rues), la boutique, et le Lac
quand on arrive du nord (le lac occuperait l'entrée). Une porte unique (vers
la boutique ou le boss) est celle d'en face, tout droit.

**Route Victoire** (ajout, la zone ultime) : une fois les dix champions des
biomes vaincus au moins une fois, la run compte un cinquième acte. Au
quatrième étage, le Conseil (Aldo aux Rocailleux, Agatha au Marais, Peter
au Volcan, Olga en Montagne) peut garder le biome à la place du champion ; sa
sortie mène à la Route Victoire (décor des Rocailleux, faune des quatre
biomes du dernier étage, +6 niveaux), au bout de laquelle attend Régis, le
Maître de la Ligue, et ses six Pokémon. Le
champion de l'acte est tiré quand on choisit son biome, rangé par étage
(`BIOME_CHAMPIONS` : Giovanni garde les Rocailleux, plus le Village). Chaque
salle lance ses vagues (plus ou moins fournies selon sa surface libre :
×0,75 pour une petite Arène, jusqu'à ×1,3 pour une grande Clairière,
`crowdOf` dans room.ts), se libère (+₽), pose une récompense au centre et
ouvre ses portes : chacune annonce la récompense de la salle suivante. Une
barrière ferme les sorties tant que la salle n'est pas libérée. Le Pokémon
joué tombe : le suivant encore debout prend le relais ; toute l'équipe K.O.,
la run est perdue et l'on rentre au Repaire.

Formes des salles (écart voulu, `src/world/layouts.ts`) : le jeu Godot
ouvrait toujours la même grande clairière ; ici chaque salle de combat tire
une forme et une taille dans la liste de son biome. Il y a huit formes :
- **Clairière** : la clairière d'origine, en 46 × 30, 52 × 34 ou 58 × 38
  (plus petite que celle du jeu, 64 × 40, que seul le Village garde) ;
- **Arène** : une place ronde et serrée ;
- **Couloir** : un long passage sinueux, renflé de petites clairières, de
  gauche à droite ou de bas en haut ;
- **Ligne de front** : un couloir droit et large, une place à chaque bout.
  On entre par un bout ; chaque vague surgit à l'autre bout, celui qui est
  le plus loin du joueur, et charge en masse. Les vagues sont une de moins,
  plus fournies (deux au moins, même nombre d'ennemis au total). Avant
  chaque vague, le sol gronde et tremble, et une flèche magenta montre le
  bout d'où elle vient (au bord de l'écran s'il est hors champ) ; les
  anneaux d'apparition suivent 1,3 s plus tard. Si le joueur a traversé,
  la vague le prend à revers, côté entrée. Elle prend l'allure de son
  biome :
  - en Forêt (une salle sur quatre), un sentier étroit qui serpente entre
    deux murs d'arbres ;
  - en Prairie (une sur quatre), un chemin de terre au milieu des champs :
    l'herbe haute couvre tout sauf le chemin et la place d'entrée, et les
    sauvages s'y cachent en chargeant ;
  - au Volcan et au Rocailleux, plus rarement en Automne et au Marais, le
    couloir large et nu ;
- **Deux clairières** : deux clairières reliées par un goulet ;
- **Carrefour** : une place et quatre bras vers les bords ;
- **Boucle** : un anneau autour d'un cœur infranchissable ;
- **Lacets** : un sentier en U.

Le cœur de la Boucle dépend du biome : un lac avec son îlot à coffre au Lac,
de la lave au Volcan, un marécage au Marais, la montagne au Rocailleux, un
bosquet ailleurs. Chaque biome a ses préférences : la Forêt prend surtout
les clairières reliées et les lacets, le Rocailleux ses canyons, le Volcan
ses arènes, le Lac sa clairière ou sa boucle. Le Village garde ses rues. La
Plage et l'Océan gardent leur littoral, mais pas sa taille (une anse courte
ou une longue grève). La forme se tire avec la graine de la salle ; le
panneau peut l'imposer (« Forme des salles »). La boutique ne change pas.

Salles spéciales (ajout, `src/run/run.ts` et `room.ts`) : une porte sur
plusieurs peut en annoncer une (35 %, deux par acte au plus, jamais vers la
boutique ou le boss). **Défi** ⏱ : les vagues sous chrono (30 s + 10 s par
vague) ; réussi, ₽ ×3 et un don garanti, raté, les sauvages s'enfuient sans
récompense. **Piège** : sa porte ne le dit pas (retour de test), elle promet
sa récompense comme une autre ; la récompense attend au centre d'une salle
vide, et en approchant, trois vagues serrées à +3 niveaux surgissent (₽ ×2).
Le **Marchand ambulant** (`src/run/merchant.ts`, Miaouss, son Pari et son
Échange) n'est plus tiré (retour de test : « le marchand, j'en veux pas ») ;
son code reste. **Source** ✚ (`run/spring.ts`) : un bassin qui soigne l'équipe.
**Autel maudit** ☠ (`run/altar.ts`) : sans ennemis, Feuforêve veille sur une
dalle aux flammes violettes ; [E], une fois, signe un pacte : un don d'un
cran plus rare (`Boons.bonus`), contre une malédiction tirée à l'arrivée et
lisible sur la fiche, qui pèse jusqu'à la fin de l'acte (`Run.curse`, écrite
sous le lieu en haut à gauche) : **Sauvages enragés** (+2 niveaux, champion
compris), **Bourse percée** (₽ des salles divisés par deux) ou **Sans repos**
(les K.O. ne se relèvent plus en fin de salle). On peut passer son chemin.

Météo (ajout, `src/world/weather.ts`) : chaque salle de combat tire son ciel
selon le biome — souvent clair, parfois Pluie, Soleil ardent, Tempête de
sable, Grêle ou Brouillard (jamais à la boutique ni en grotte). Comme dans les
jeux, la Pluie renforce l'Eau (×1,5) et affaiblit le Feu (×0,5), le Soleil
l'inverse ; le Sable et la Grêle usent de 3 % des PV max toutes les 3 s ceux
qui n'y résistent pas (Roche, Sol, Acier ; Glace), sans jamais mettre K.O. ;
le Brouillard voile la vue. Particules, teinte et notification à l'entrée ;
le panneau peut la forcer.

Grottes (portée de `_spawn_cave_portals` et `CaveArena.gd`) : passé les deux
premières salles de la run, une bouche peut s'ouvrir au pied d'une falaise —
plus d'une fois sur deux au Rocailleux et au Volcan, une fois sur cinq dans
les biomes à collines, jamais à la boutique ni chez le boss. Elle s'ouvre
avec les portes, salle libérée (« ⛰ Grotte »). Dedans, une carte à part :
un réseau de salles taillées dans la roche (entrée, arène, cachot, salle au
coffre), dans le noir, éclairé par des torches et des cristaux qui luisent.
Un **sbire** de la Ligue attend au milieu de l'arène (`src/data/grunts.ts`) :
son métier et sa planche Essentials suivent le type de son équipe, tiré du
biome (Montagnard en Rocailleux, Cambrioleur au Volcan, Pêcheur ou Marin au
bord de l'eau, Scout en forêt, Sbire Rocket ailleurs…). On l'approche, il
parle (son portrait, une réplique), puis envoie d'un jet de Poké Ball son
Pokémon fort, le gardien (trois barres de PV), et une escorte de sauvages
du biome. Pendant le combat, il lance des **Poké Balls** sur le Pokémon joué
(`src/run/capture.ts`) : un anneau rouge marque le point de chute, on en sort
ou on dashe. Touché, on est aspiré dans la Ball ; ← et → en alternance
remplissent une jauge, qui se vide d'autant plus vite qu'il reste peu de PV.
Pleine, la Ball éclate ; vide, elle se referme : notification « Capturé ! »,
le Pokémon quitte l'équipe (le suivant debout prend la main ; le dernier
capturé, c'est la défaite). Toute son équipe à terre, le sbire s'enfuit par
la bouche et rend ses prises ; si l'on fuit avant, elles sont perdues pour la
run. Vaincu : des ₽ et l'équipe soignée ; son Pokémon fort repart avec lui
(il ne se recrute pas). Le prisonnier, enfermé dans une
cellule creusée au fond du cachot (il en secoue la grille, la palissade à
claire-voie du tileset), voit alors la grille se relever comme une herse et
saute de joie. E sur lui ouvre la fiche de
recrutement : ses statistiques et ses attaques, un surnom à lui donner, et
s'il rejoint l'équipe tout de suite (allié de run). Libéré, il débloque son
espèce et part au Repaire dans tous les cas : il s'y promène parmi les
libérés, et Porygon peut le mettre dans l'équipe (sous son surnom,
`Save.names`, qu'on change sur place dans sa fiche). Le coffre donne un
Bandeau Choix la première fois, des Baies ensuite. On ressort par le trou de
lumière, même en pleine bataille, au pied de la falaise ; la bouche est
alors refermée et la salle n'a pas bougé.

Écarts voulus : plusieurs salles reliées plutôt que l'arène unique du jeu ;
un sbire dresseur et ses captures plutôt qu'un demi-boss sauvage ; une carte
agrandie (54 × 36) pour esquiver ses Balls ; prisonniers à libérer (absents
du jeu) ; grottes aussi hors du Rocailleux ; escorte tirée de la faune faute
de planches `CAVE_ELITE` ; trois barres au gardien au lieu de quatre.

Départ : on part en passant l'arche au nord du Repaire, sans parler à Dracolosse ni
passer par un écran (retour de test) ; une équipe trop lourde est refusée sur place,
et chez un hôte en ligne, c'est lui qui lance la run. Dracolosse le rappelle si on lui
parle.

Le Repaire (portée de `HubWorld.gd`, redessinée) : le camp des rebelles, où
le jeu s'ouvre et où l'on revient après chaque run. Une grande clairière de
nuit (carte de 88 × 66 cases), un feu de camp (la flamme d'Essentials,
`Animations/fire5`, dans un cercle de cailloux du tileset) cerclé de huit torches, sous les lucioles ; seul le
Pokémon qui mène s'y promène, l'équipe ne le suit pas. Au sud, un grand lac ;
loin au milieu, une île qu'on n'atteint qu'à la nage, avec la CS Surf : un
temple dont on gravit l'escalier (on y ralentit et l'on grandit en montant),
Lugia et deux ermites qui vont et viennent. Un chevron tressaute au-dessus du
gardien dont on s'approche ; E ouvre son écran, après sa présentation la
première fois. Dans les écrans, les flèches choisissent et Entrée valide.

Hors des gardiens des postes, le camp ne compte que des libérés — les
Pokémon débloqués qu'on n'emmène pas : ceux d'eau nagent dans le lac, les
autres se répartissent entre les rondins du feu, le terrain d'entraînement et
le dortoir, ou flânent sur la place. Au sud du feu, ils s'assoient de dos,
tournés vers les flammes (la pose « Sit » de PMD est vue de dos) — ou, sans
pose assise (Dracaufeu, Ronflex, Onix…), couchés endormis sur leur rondin ;
au nord, ils restent au repos, de face. Un Pokémon couché n'a pas d'ombre au
sol. Ces poses (Sit, Laying, Idle, Hop) ne sont pas
dans le dépôt Godot : `npm run import-assets` les tire de SpriteCollab et
écarte celles dont les dimensions ne collent pas à l'`AnimData.xml`.

Au début, le camp est presque vide : Dracolosse sous l'arche du **départ**,
Porygon devant la hutte de l'**équipe**, Roucarnage au relais du jeu **en
ligne** (voir « Jeu en ligne » plus bas), Démolosse au départ
des **missions** (voir plus bas) et Charpenti, le
**bâtisseur**, devant son atelier de bois sur pilotis (au sud-ouest, sur la
rive), qui vend les aménagements (en Baies, et pour la plupart en ressources
des coffres de run). Il évolue avec le camp : Ouvrifier à 3 bâtiments,
Bétochef à 6.

- **Étude d'Alakazam** (100) : améliorations (places dans l'équipe, Partage
  d'XP, Bourse de départ, charges de dash, Ceinture de Rappels (une réserve commune à l'équipe), Vitalité,
  Aimant à Baies) et CS (Surf, Coupe, Éclate-Roc ; Force annoncée) ;
- **Marché du tuteur** (150, Bois 20, Pierre 10, Nourriture 10) : trois étals
  sous auvent, M. Mime aux deux premiers (20 CT), Miaouss au troisième (ajout :
  douze objets tenus et le Super Bonbon, qui s'y donne et s'y reprend) ;
- **Dortoir** (80, Bois 15, Nourriture 5) : deux tipis et des paillasses de
  paille, et une place de mission de plus ;
- **Terrain d'entraînement** (120, Bois 20, Pierre 15) : terre battue et deux
  mannequins, et la mission Entraînement ;
- **Ponton** (120, Bois 30) : sur la rive, à l'écart du feu ; on marche sur son
  plancher jusqu'au-dessus de l'eau.
- **Défrichage** (150, Nourriture 15) : abat la forêt à l'ouest de la place et
  ouvre une clairière, reliée par une allée, où des libérés se promènent ;
- **Champ de cultures** (120, Bois 10, Pierre 5 ; après le Défrichage) : terre
  labourée et rangées de légumes, où travaillent deux libérés, et un champ de
  tournesols qui ondulent au vent juste au sud (ajout) ; +1 Nourriture par
  salle nettoyée en run ;
- **Maisons** (200, Bois 30, Pierre 20, Nourriture 10 ; après le Défrichage) :
  deux maisons de Pokémon, deux paillasses de plus près du champ, et dix
  libérés de plus au camp ;
- **Jardins fleuris** (140, Bois 10, Nourriture 10) : massifs, hortensias,
  bacs de fleurs, tournesols et deux bancs face au feu, où deux libérés
  s'assoient ;
- **Lampadaires** (160, Pierre 20, Bois 5 ; après l'Étude) : quelques-uns le
  long des allées (départ, clairières), éteints (le Repaire n'a pas de nuit
  qui tombe), jamais devant un gardien ; deux libérés veillent dessous ;
- **Défrichage de l'est** (220, Bois 10, Nourriture 20 ; après les Maisons) :
  une seconde clairière derrière la hutte de l'équipe (`CAMP_EAST_GLADE`),
  reliée par son allée ; les flâneurs s'y répartissent aussi ;
- **Bourg** (300, Bois 40, Pierre 30, Nourriture 15 ; après le Défrichage de
  l'est) : le coin « ville » du camp, une grande chaumière et un cottage
  autour d'une place pavée de chevrons, son puits au milieu ; on y entre par
  deux piliers de pierre, puis une rue de briques qui ondule jusqu'à la place
  (seuil gris, puis briques beiges : le chemin de terre ne bute plus sur le
  pavé) ; douze libérés de plus au camp (ils flânent sur la place).

Ce qui attend un autre chantier n'apparaît chez le bâtisseur qu'une run après
que celui-ci est bâti (`buildingsShown`, `Save.builtAt`) ; le bâti passe en bas
de la liste. Un « ! » flotte au-dessus d'un gardien qui a du neuf
(`meta/news.ts`) : plans nouveaux du bâtisseur, Pokémon de plus à la hutte,
mission rentrée, quête à réclamer ; dans l'écran du poste, un « ! » marque
ce qui est neuf. Chaque débloqué dit d'où il vient (biome du recrutement ou
de la grotte, quête, partenaire : `Save.origins`), et le Pokédex donne les
biomes et grottes d'un Pokémon déjà croisé.

Au Repaire, plus aucun sauvage de passage : seuls les Pokémon libérés y vivent
(les seize derniers débloqués, plus la place que fait chaque aménagement).

Démolosse, le pisteur (les expéditions de Godot), envoie des libérés en
**mission** : deux places, trois avec le Dortoir. Cueillette (Nourriture 6,
2 salles), Coupe de bois (Bois 6, 3), Ramassage de pierres (Pierre 5, 4),
Récolte de baies (40 Baies, 4), Entraînement (+2 niveaux de départ, 5 ;
terrain bâti, plafond du Super Bonbon), Grande chasse (Nourriture 21, 6),
Grande coupe (Bois 20, 8), Ouvrir une carrière (Pierre 14, 9). Une mission
avance d'un cran à chaque salle nettoyée en run, ne rate jamais, et se
récolte chez lui au retour ; « Rappeler » fait rentrer le Pokémon les mains
vides. Parti, il n'est plus au camp et ne peut pas entrer dans l'équipe
(envoyé depuis l'équipe, il en sort ; le dernier membre reste).

Kangourex, la doyenne (ajout), au camp dès le départ derrière le comptoir de
sa buvette, le tableau des quêtes dans le dos (à l'est, entre la hutte et le
relais), donne des **quêtes** (`src/meta/quests.ts`) :
trois actives au plus, et seule compte la progression d'après l'acceptation.
50 K.O. (Togepi), 60 Baies ramassées (Tropius), 5 salles sans encaisser un
coup (Ptiravi), 3 Défis réussis (Élekid), 3 Pièges (Ténéfix), 30 K.O. sous la
pluie (Tarpaud), l'acte 3 (Goinfrex), 20 K.O. dans le sable ou la grêle
(Hippopotas), 5 champions (Raikou), une run gagnée (Mewtwo). Remplie, une
quête se réclame chez elle : le Pokémon promis — introuvable ailleurs —
rejoint la rébellion. Le Pokédex les montre en silhouette, « Quête ».

Bouldeneu, le savant (ajout), au camp dès le départ au sud du feu, devant son
tableau, donne des **leçons** (`src/data/lore.ts`) : toutes les règles du jeu
par chapitre — Combat (commandes, recharges, combo, dash, dégâts, K.O.),
États (les cinq états, leurs chances par type, la météo), Types (tableau
construit depuis `TYPE_CHART`), Capacités (renforcements, affaiblissements,
soins, CT, ultime), Dons, La run, Salles (formes, Ligne de front, Défi, Piège,
marchand, grottes), Ennemis (comportements, champions, as, signatures) et le
Repaire. Les chiffres y sont recopiés à la main : changer une règle, c'est
changer sa fiche.

À la hutte de l'équipe, on glisse les Pokémon dans l'équipe, hors d'elle ou à
une autre place (le premier mène), et les attaques dans leurs quatre
emplacements — une zone ne s'allume que pour ce qu'elle accepte ; au clavier
ou au double-clic, un Pokémon déjà choisi entre dans l'équipe ou en sort. La
fiche montre les statistiques de tout Pokémon cliqué, même resté au camp.
Son second onglet, le **Pokédex**, montre chaque forme de base de la faune,
des starters et des gardiens de grotte (retour de test : on ne recrute pas
d'évolution, elles n'y ont plus de case) : débloquée, rencontrée (dès qu'elle
apparaît) ou silhouette d'encre, avec les victoires qui lui manquent ; sa
fiche montre sa **lignée** (chaque évolution et son niveau, `evolutionsOf`).

Au premier lancement, on choisit son **starter** parmi les neuf du jeu
(Pikachu, Zorua, Absol, Flamiaou, Grenousse, Ouisticram, Pandespiègle,
Baggiguane, Riolu) : c'est le seul Pokémon débloqué. Les autres se gagnent
en run — 10 victoires contre une espèce de base la première fois (une évolution ne se
débloque pas : elle se gagne en faisant évoluer sa lignée), le prisonnier
d'une grotte libéré — et rejoignent le Repaire (« ★ X
rejoint la rébellion ! »). Le premier acte n'aligne que trois espèces de
base dans ses deux premières salles, cinq ensuite, sans itinérants ni top
dresseurs (`Run.fauna`, `Run.variety`) : de quoi en vaincre dix d'une même
espèce dès la première run. La toute première recrue explique, en parlant,
comment entrer dans l'équipe (bâtir l'Étude chez Charpenti, y acheter une
place à Alakazam, puis Porygon) ; ce conseil revient sur sa fiche.

Les Baies sont la monnaie permanente (200 au départ). En run, deux ou trois
**arbres à baies** poussent dans chaque salle (une baie par biome, aucun au
Volcan, en Rocailleux ni en Océan) : deux coups, au corps à corps ou au tir,
en font tomber 2 à 4 baies d'1 Baie (3 dans le jeu), à ramasser en marchant dessus avant
qu'elles ne pourrissent (25 s) ; l'Aimant à Baies les attire. Deux salles
sur trois cachent un **coffre**, souvent au fond d'une alcôve fermée par un
arbuste (CS Coupe) ou un rocher fissuré (CS Éclate-Roc) selon le biome : [E]
le lève, puis ouvre le coffre — des Baies, et des **ressources** (Bois,
Pierre, Nourriture) qui paient avec elles les aménagements du bâtisseur. Un champion vaincu en
rapporte 40 + 25 par acte, le Dresseur final 120 de plus et la victoire
150 + 6 par salle ; une défaite en laisse 4 par salle traversée (écart voulu,
retour de test : « une run gagnée, j'avais déjà 2000 Baies » — le jeu donnait
120 + 80, 300, 500 + 30 et 15 ; les coffres donnent aussi moins). Gagnée
ou perdue, la run se termine sur son **bilan** (ajout, `src/ui/runsummary.ts`,
`src/meta/runstats.ts`) : salles, durée, K.O., dons, PV infligés et
encaissés, Baies et Éclats rapportés, champions vaincus, la part de
chaque membre et le MVP entouré à la bombe ; Entrée rentre au Repaire. La
progression est gardée dans le navigateur (`pokhades-save`) ; le panneau a
deux boutons de test, « +1000 Baies » (et 100 de chaque ressource, 20 Éclats) et « Tout remettre à zéro » (qui
rouvre le choix du starter). Une sauvegarde d'avant le déblocage garde les
huit Pokémon jouables du prototype.

**Montagne glacée** (ajout, `glace` dans `src/world/biomes.ts`) : sol de
neige, falaises enneigées, sapins et feuillus coiffés de neige (le tileset
range ces calottes à côté des arbres : `SpriteDef.cap` les dessine par-dessus),
sentiers de gravier, cristaux de glace qui luisent, et des mares de **glace**.
Le tileset n'a pas de glace : `paintIce` (`src/assets/atlas.ts`) la peint au
chargement dans des cases vides, d'après la forme de la neige, recolorée en
bleu avec des reflets. Comme dans les jeux Pokémon, un pas sur la glace lance
le Pokémon joué en glissade (11 cases/s) dans la direction du pas, sans
qu'on puisse tourner : il s'arrête contre un obstacle, en sortant de la glace
ou sur le gravier ; le dash reste permis. Pendant la glissade, il s'accroupit
et tangue comme un patineur, laisse deux traces de patin et soulève des
éclats de glace (`src/render/fieldfx.ts`). Les compagnons, eux, traversent en
marchant (écart voulu : ils perdraient le joueur). Faune de glace et de roche,
grêle fréquente, Rangers en sbires, Olga (Lorelei) en championne, la Glace
Éternelle dans les coffres.

**Artisanat** (ajout, `src/meta/crafting.ts`) : chaque coffre de run donne le
**matériau de son biome** (Jolie Plume en Prairie, Petit Champi en Forêt,
Champi Suave en Automne, Écaille Cœur au Lac, Boue Noire au Marais, Charbon au
Volcan, Roche Lisse en Rocailleux, Vieux Sou au Village, Coquillage à la
Plage, Perle en Océan, Glace Éternelle en Montagne glacée), et parfois un
**sachet de graines** — pas des Baies, qui sont la monnaie. Au Champ de
cultures, Héliatronc tient le **potager** : trois bacs de bois bien à part, où
l'on sème ces graines ; chacun pousse d'un cran par salle franchie en run (un
piquet montre la plante, les pousses grandissent de la butte de semis à la
fleur, et une rangée de crans, un par salle, s'allume) et donne des herbes (Racine Énergie, Herbes Blanche, Mental, Pouvoir, et l'Herbe Rappel de
la rare Graine Miracle). L'**Atelier de l'artisan** (180, Bois 25, Pierre 15 ;
après le Champ), une maison sur la rive du lac à l'est du ponton, dans sa propre clairière, au
bout d'une allée de galets, est tenu par Queulorior :
avec herbes et matériaux, il façonne des objets tenus introuvables à l'étal
(Ceinture Pro, Grelot Coque, Casque Brut, Bandeau, Évoluroc, Mouchoir Choix,
Lunettes Choix, Lentille Zoom, Orbe Vie) et quatre **nectars**. Posé sur la
coupelle de pierre devant l'atelier (le nectar y luit à sa couleur), un nectar attire en 5 salles un Pokémon de base pas
encore débloqué, d'un type qu'il aime (les espèces déjà croisées d'abord) : il
attend près de la coupelle, on lui parle, il rejoint la rébellion. À l'écran
de l'atelier, les matériaux en réserve sont rangés en casiers (le compte en
gros ; grisés, ceux qu'on n'a pas, avec le biome où les trouver).

**Allées du Repaire** (ajout) : du chemin de terre partent des allées de sols
variés jusqu'aux bâtiments qui n'en avaient pas (galets clairs vers l'atelier,
planches vers le bâtisseur, gravier vers l'étude, briques vers la buvette,
sable vers l'entraînement, pavés beiges vers le dortoir). Leur tracé est une
courbe lissée ; un anneau d'herbe déchiquetée les borde (`WorldMap.lanes`).

Poids d'équipe (GameManager `compute_team_weight`, `src/meta/weight.ts`) :
chaque Pokémon emmené pèse selon le stade avec lequel il part (3, 5, 8 ;
Super Bonbon compris), un légendaire 10 ; un objet tenu 2 ; une attaque
équipée 0 à 3 selon sa puissance (≤ 40, ≤ 70, ≤ 90, au-delà). Au-delà du
plafond (24), on compose librement mais « Partir » refuse. Le plafond monte
de 4 par palier, jusqu'à 40, avec le Bracelet de charge d'Alakazam, payé en
**Éclats de Champion** (2, 4, 7, 12) : un champion en lâche 1 + l'acte, le
Dresseur final 3 de plus, soit 13 par run gagnée. Écarts voulus : le jeu
compte 7 au stade final (son commentaire dit 8) et fait peser Rappels et
bourse, qui restent ici des améliorations.

Équipe (portée de `CombatArena._cycle_active` et `TeamMember._companion_process`) :
1 à 6 Pokémon, composée au Repaire (le panneau la change aussi, sans compter
les places, pour tester) ; le premier part devant, Tab passe la
main au suivant encore debout, là où il se trouve. Les autres sont sur le
terrain, menés par l'IA : ils attaquent l'ennemi visible le plus proche
(18,75 cases) avec leur première capacité prête, à sa portée, et rejoignent
le Pokémon joué au-delà de 5,6 cases. Chacun garde ses recharges et son
combo. L'XP (niveau de l'ennemi × 12) va à chaque membre qui l'a touché,
montant plein, et chaque espèce monte à son rythme (groupes de croissance des
jeux : rapide, moyenne, parabolique, lente). Au niveau prévu par la table du
jeu (`EVOLUTIONS` de `GameManager.gd`, reprise dans `src/data/evolutions.ts`),
un membre évolue : il blanchit en pulsant 0,85 s, sans attaquer ni prendre de
coup, change de forme au pic de blanc (planche, fiche, stats ; dons, objet,
bonus et attaques gardés, PV pleins) et l'évolution est annoncée. Parti du
Repaire au-delà d'un seuil (Super Bonbon), il part déjà évolué. Colombeau,
sans planche PMD, est sauté : Poichigeon devient Déflaisan au niveau 32. Un membre K.O. reste couché là
où il est tombé ; un Rappel de la boutique le relève. Les sauvages visent le membre qui craint
le plus leur attaque, à distance égale. Seuls les coups du Pokémon joué
déclenchent les dons, le gel d'impact et la secousse. Pour tester vite,
« Aller à une salle » saute au combat, à la boutique ou au boss d'un acte,
dans le biome choisi pour la run.

Boutique (portée de `CombatArena.gd` et `ShopStock.gd`), 6ᵉ salle de chaque
acte : une petite clairière autour d'une place, toujours la même pour un
biome donné (graine fixe), jamais dans l'eau (à la Plage et à l'Océan, une île
de sable, et l'on nage autour jusqu'à un récif), toujours de plain-pied. Le
biome se lit dans la bordure : un anneau d'eau au Lac (on y nage), de lave au
Volcan, et au Rocailleux comme au Volcan une montagne
à deux étages, au sommet presque nu, qu'on ne peut pas gravir. Perrserker tient le comptoir, où flottent les articles : une CT
(110 ₽ : apprendre ou renforcer une attaque, une par visite), deux soins
selon l'acte (Potion, Super Potion, Hyper Potion, Potion Max), un Rappel
(150 ₽, 50 % des PV) ou Rappel Max (280 ₽, dès l'acte 3) si un membre est
K.O., et « Recharger l'étal » (60 ₽, puis ×1,6 à chaque fois). On se tient
devant un article, il grossit, sa fiche s'affiche, E l'achète. Sur la place : l'affiche
du prochain champion (le grand panneau de bois du tileset), deux mercenaires
de rangs différents (Éclaireur, Vétéran, Champion Sauvage) qui s'entraînent
sur un mannequin et dont la fiche — stats, types, attaques, prix — s'ouvre
quand on s'approche ; recrutés contre des ₽, ils rejoignent l'équipe mais
aucun Rappel ne les relève. Et des Pokémon de passage, pris dans la faune du
biome et répartis sur toute la clairière, jamais cachés par un arbre, à qui
parler (bulles de bande dessinée) : trois à cinq figurants tirés parmi des
dormeurs, un gourmand, Ramoloss et des promeneurs qui flânent, et souvent une
paire qui bavarde face à face. Chacun a un
caractère (commère, ronchon, militant, froussard, gourmand, rêveur, sage,
farceur, src/data/chatter.ts) et ses répliques ; rarement, l'un d'eux fait
un cadeau (quelques ₽, une Potion, une Baie Oran pour l'équipe), un par
visite au plus. On les contourne, ils ne se laissent pas pousser. Sur l'étal,
un **lot de Baies** par visite (7, 17 ou 40 Baies pour 100, 220 ou 480 ₽,
`BERRY_PACKS`, les quantités du jeu divisées par trois) : convertir sa bourse
en monnaie du Repaire, à un taux exprès ingrat. Pas encore de rachat (il
faudrait un inventaire en run).

**Solde des mercenaires** (`CombatArena._collect_merc_retainers`) : à
l'entrée de chaque boutique suivante, un mercenaire encore debout réclame la
moitié de son prix (`MERC_RETAINER`, annoncé sur sa fiche) ; sans l'argent,
il quitte l'équipe (sauf s'il est le dernier debout), avant que la place ne
se remplisse, pour que sa place puisse resservir tout de suite. Un
mercenaire tombé ne réclame plus rien.

Boss (porté de `CombatArena.gd`, `PokePools.gd`, `TrainerNPC.gd`,
`PokeballFX.gd`, `ChampionDialogueScreen.gd`) : chaque acte a son champion,
assorti au biome (Blanche, Erika, Ondine, Koga, Pierre, Giovanni, Auguste,
Morgane, Major Bob), jamais deux fois le même dans une run ; celui du dernier
acte est le Dresseur Final. Son équipe est celle des jeux (Rouge Feu / Vert
Feuille, HeartGold / SoulSilver pour Blanche) : de 2 Pokémon pour Pierre à 5
pour Giovanni. Ils sortent de Poké Balls une vague à la fois, escortés de
sbires de leur forme de base ; ils ont 2 barres de PV, son as en a 5, et une barre de boss en haut de l'écran les
montre (le jeu n'en a pas). Plus robustes que dans le jeu (pensé pour un
Pokémon seul), ils attaquent plus souvent et posent au sol des zones
annoncées avant l'impact — disque, cône ou rayon selon le type de leur
attaque ; l'as aux abois fait pleuvoir des disques sur toute l'équipe. Une
fois sur deux, c'est l'**attaque signature** du champion (ajout,
`src/combat/signatures.ts`), son nom affiché au-dessus du lanceur :
Éboulement de Pierre (une cage de rochers ouverte d'un côté), Surf d'Ondine
(une vague qui avance), Cage-Éclair de Major Bob (deux croix d'éclairs),
Danse-Fleur d'Erika (deux spirales de pétales), Toxik de Koga (des flaques
qui piquent quatre fois), Prémonition de Morgane (trois salves qui suivent
l'équipe), Déflagration d'Auguste (un anneau de feu puis une explosion au
centre), Séisme de Giovanni (des ondes qui s'éloignent) et Roulade de
Blanche (trois charges visées). Le dresseur attend devant la sortie et s'enfuit
par elle à la fin. Les K.O. rapportent de l'XP (niveau³ par niveau, comme
le jeu) : sans elle, le boss était hors de portée d'un Pokémon resté niveau 10.

Récompenses (portées de `RunBoons.gd` et `BoutiqueScreen.gd`) : « ★ Don d'un
légendaire » propose 3 dons d'un des 10 donateurs (Électhor, Sulfura,
Artikodin, Mew, Darkrai, Groudon, Célébi, Ho-Oh, Rayquaza, Jirachi), en 4
raretés ; reprendre un don le fait monter d'une rareté, deux donateurs
débloquent un duo, et dès l'acte 2 la 3ᵉ carte peut être une ultime (jauge
qui se charge en frappant et en encaissant, touche R). Sur les 83 dons, les
9 qui supposent une équipe, un allié, l'évolution ou les ressources du camp
ne sont pas proposés. « ✦ Nouvelle attaque » propose d'apprendre une attaque
forte du répertoire de l'espèce ou d'en renforcer une (+25 %). Au deuxième
renforcement, une capacité d'une lignée évolue (Pistolet à O → Vibraqua →
Hydrocanon, Flammèche → Rebondifeu → Lance-Flammes → Déflagration…,
`MOVE_EVOLUTIONS` de src/run/rewards.ts) : même type, même classe, puissance
jamais en baisse, renforcements remis à zéro ; la carte le montre.

Formes régionales (ajout, src/data/forms.ts) : 42 formes d'Alola, de Galar,
de Hisui et de Paldéa, chacune une espèce à part sous son numéro de forme
PokéAPI (Goupix d'Alola : 10103), avec ses planches SpriteCollab. Vingt formes
de base vivent dans la faune des biomes (Goupix et Sabelette d'Alola en
Glace, Caninos de Hisui au Volcan, Axoloto de Paldéa au Marais…) : on les
bat, on les débloque, elles ont leur ligne au Pokédex, rangée après leur
espèce. Elles évoluent en leurs formes régionales (ou en Ixon, Berserkatt,
Terraiste…, data/evolutions.ts). Certaines évolutions ordinaires prennent la
forme régionale selon le biome où elles ont lieu en run
(`REGIONAL_EVOLUTIONS`) : Pikachu à la Plage → Raichu d'Alola, Feurisson en
Automne → Typhlosion de Hisui, Smogo au Village → Smogogo de Galar.

Méga-évolutions (ajout, src/data/megas.ts) : le **Méga-Anneau** (6 Éclats de
Champion, chez Alakazam) permet, en run, de faire méga-évoluer le Pokémon joué
avec **F** (bouton MÉGA au doigt), une fois par salle, s'il a une forme Méga
et qu'il reste des ennemis. Même mise en scène que l'évolution ; la Méga prend
types et stats de sa forme (fiche PokéAPI à son numéro de forme, 10034 pour
Méga-Dracaufeu X…), garde attaques, niveau et part de PV, et reprend sa forme
quand la salle est libérée, à la salle suivante ou au retour au Repaire. Une
aura violette et rose l'entoure ; quand SpriteCollab n'a pas ses planches
(Florizarre, Tortank…), elle garde celles de sa base, grandies de 20 %. Le HUD
dit « Méga-évolution — F » quand elle est prête. Une espèce à deux formes
(Dracaufeu, Mewtwo, Raichu X / Y ; Absol, Carchacrok, Lucario et leur forme Z)
fait choisir, jeu en pause, à l'écran d'évolution (`MEGA_ALT_FORMS`). L'as
d'un champion méga-évolue aussi, s'il en a une forme, en entamant ses deux
dernières barres (`combat.phase`) : bonus de boss gardés, nom annoncé.

Combat (porté de `TeamMember.gd`, `EnemyAI.gd` et `CombatVFX.gd`) : niveau 10,
capacités par défaut du jeu, portée et recharge propres à chaque attaque,
combo de 3 coups, attaques spéciales qui frappent directement leur cible
(plus d'orbe ; une marque au sol à la couleur du type les annonce 0,12 s),
statuts, hitstop et secousse. Chaque coup joue une planche d'Essentials
choisie par capacité quand elle existe, sinon par type (src/data/attackanims.ts),
et un effet dessiné selon la famille de la capacité (src/data/movestyles.ts,
src/render/movefx.ts) : rayon qui part du lanceur (Ultralaser, Laser Glace),
projectile avec traînée (Ball'Ombre, Flammèche), salve (Tranch'Herbe,
Météores), souffle en cône (Lance-Flammes), ondes (Surf, Mégaphone), foudre
ou rochers venus du ciel (Tonnerre, Éboulement), anneaux psychiques,
tourbillon, sol qui se fend (Séisme), absorption qui revient au lanceur ; au
contact, mâchoires qui se referment (Morsure, Crocs Feu), griffes, lame,
croix, poing, pied, estoc, fouet (Fouet Lianes), ruée et coup de masse. Les
sauvages jouent les mêmes ; un tir de sauvage arrive sur sa marque au moment
où elle frappe. En ligne, l'hôte envoie aux invités chaque effet avec les
points du lancer (`moveCastAt`).
Les sauvages touchés et les Pokémon de champion portent une barre de vie
au-dessus de la tête.

Les sauvages (porté d'`EnemyAI.gd`, niveau 4 à 8) se réveillent quand on
approche à 9 cases ou qu'on les frappe, puis suivent leur archétype :
poursuivant, tireur (s'il a une attaque spéciale), chargeur, harceleur ou
soutien qui renforce ses voisins. Chaque attaque est annoncée (le Pokémon
s'écrase et blanchit, un anneau rouge grandit sous lui) et rate si l'on s'est
éloigné à temps. Leurs attaques spéciales posent une marque au sol, liserée
de rouge, là où était leur cible : elle frappe 0,45 s plus tard, et qui en
est sorti (ou la traverse en dash, qui rend invulnérable) est épargné. Dans l'herbe
haute, on se cache, eux aussi.

Les capacités de statut ont un vrai effet (le jeu ne le donne qu'aux CT) :
hausse de stat du lanceur (Machination, Hâte, Mur de Fer…), baisse chez les
sauvages à portée (Rugissement, Charme, Groz'Yeux…), statut garanti
(Cage Éclair, Poudre Dodo…), soin ou Abri. Les capacités sans effet connu
frappent au contact, comme dans le jeu.

Interface (DA « Tag sacré », `src/ui/da.css`) : la Ligue parle sur des écrans
sombres, la rébellion les tague à la bombe, et ce qui est au joueur tient sur
des bandes de papier. En bas à gauche, la carte du Pokémon (PV, XP, dashs,
ultime, dons) et ses 4 attaques en 2 × 2, chacune avec son type et ce
qu'elle fait (catégorie et puissance, ou effet chiffré) ; en haut le lieu et
les ₽ ; à droite les notifications ; le nom de la zone tagué à la couleur du
biome (« Nouvelle zone » à la première visite seulement) ; le champion parle
en bas de l'écran ; dons et récompenses ont une moitié peinte, « Pour qui ? »,
et le sceau du dieu ou l'aura de particules du type du Pokémon. Les
maquettes de travail sont dans `ui-r4.html` (planche validée) et `ui-lab.html`
(pistes explorées), servies par `npm run dev`.

Polices embarquées via `@fontsource` (Rubik, Bebas Neue, Permanent Marker,
Bangers). Illustrations officielles de toutes les espèces dans
`public/game/artwork/` : celles des légendaires viennent du dépôt Godot, les
autres sont téléchargées une fois depuis PokéAPI par `import-assets` et
réduites à 256 px (ce dossier sert de cache, il n'est pas vidé).

Le plan de portage complet est dans `PORTAGE.md`, à la racine du dépôt Godot.

## Son

`src/audio/` : bruitages et musiques, joués en Web Audio. Le son part au
premier geste (règle des navigateurs). Volumes musique et bruitages au menu
des réglages et au panneau (H) ; **M** coupe tout.

Écart voulu : le jeu Godot (`Sfx.gd`) bruitait le combat avec des sons
génériques Kenney. Ici tout vient d'Essentials, comme dans les jeux :
- **attaques** : chaque animation d'attaque joue le son de sa capacité
  (`SE/Anim` : Tranche, Force Poigne, Lance-Flammes, Séisme…), sinon celui
  de sa famille d'animation (`STYLE_SOUNDS` : un poing claque, une morsure
  croque, un rayon a le son ample de son type), sinon un son de son type ; les zones, tirs, dons et l'ultime compris ;
- **coups** : le « pac » des jeux selon l'efficacité (normal, super
  efficace ou critique, pas très efficace), plus grave quand l'équipe
  encaisse ;
- **cris** (`SE/Cries`, copiés par numéro de Pokédex) : un Pokémon qui tombe
  crie plus grave (plus le bruit du K.O. pour l'équipe et les champions), un
  Pokémon de champion crie à sa sortie, le Pokémon qui entre crie au Tab.
  Les générations 6 et suivantes n'ont pas de cri dans Essentials : un son
  neutre plus grave les remplace ;
- **statuts** (brûlure, poison, paralysie, gel, sommeil), hausses et baisses
  de stats, soin, Abri, montée de niveau, évolution ;
- **combat** : « ! » d'un sauvage qui vous repère, éclair du VS à l'annonce
  du champion, bruit des talents pour sa signature et pour l'ultime ;
- **exploration** : portes (choisie, ouverte, grotte), Coupe et Éclate-Roc,
  coffre (jingle de l'objet trouvé), Baies, butin, fuite ;
- **méta** : Pokémon débloqué, jingle du badge sur le bilan d'une victoire,
  défaite, menus (curseur, validation, refus).

Le dash aussi : un souffle bref de `SE/Anim`. Musiques : Surfing au Repaire et Battle wild
en salle (écarts voulus, le jeu Godot n'en avait pas), Battle trainer au
boss, Battle victory leader ensuite. Les fichiers sont copiés dans
`public/game/audio` par `scripts/import-assets.ts`.

## Menu des réglages

**Échap**, au Repaire comme en run, fige le jeu et ouvre le menu du joueur
(`src/ui/settingsmenu.ts`, dans la DA de l'affiche) : onglet **Réglages**
(musique, bruitages, couper le son, secousses de l'écran) et **Commandes**
(toutes les touches). Zoom, particules, halos et vignette ne se règlent
plus qu'au panneau de test (H).
↑↓ choisit, ←→ règle, Échap reprend ; tout se clique aussi. Les réglages
sont gardés avec ceux du panneau de test, qui se met à jour derrière.

Onglet **Nouveautés** (aussi au menu principal, marqué « Nouveau ! » tant
que la dernière note n'a pas été lue) : les notes de version,
`src/data/patchnotes.ts` — en ajouter une en tête à chaque mise en ligne.

Les touches se **réassignent** dans l'onglet Commandes (`src/input/bindings.ts`) :
Entrée (ou un clic) sur une action, puis la nouvelle touche ; Échap annule.
On change la touche principale de l'action, ses autres touches restent tant
qu'elles ne servent pas ailleurs ; prendre la touche principale d'une autre
action les échange. Échap, M, Entrée (et H, N en test) ne se prennent pas.
« Rétablir » remet les touches d'origine. Les noms affichés suivent la
disposition du clavier quand le navigateur la donne (AZERTY sinon), et les
invites « [E] » prennent la nouvelle touche d'interaction. Mémorisé à part,
dans le navigateur (`pokhades-keys`). Au tactile, rien à réassigner.

## Jeu en ligne (Roucarnage)

Portage web de `Net.gd`, en WebRTC pair-à-pair (PeerJS, `src/net/`) : seule la
mise en relation passe par le serveur de signalisation public de PeerJS.

- Chez Roucarnage, « Ouvrir la partie » ouvre le relais et rend la main : le
  code de 5 lettres reste affiché en haut à droite (un clic le copie), et la
  liste des joueurs présents à gauche, au Repaire. Les autres entrent le code
  chez leur Roucarnage (jusqu'à six joueurs) ; l'hôte est prévenu de chaque
  arrivée.
- L'invité arrive dans le **Repaire de l'hôte** et s'y promène avec lui
  (chacun voit les autres). Il y garde **ses propres Pokémon** : il emmène le
  meneur de sa propre équipe, qu'il change chez Porygon. Chez l'hôte, seuls
  Roucarnage et Porygon lui répondent ; les autres gardiens servent l'hôte.
- L'hôte lance la run chez Dracolosse (ou chez Roucarnage) : un Pokémon par
  joueur. L'hôte simule tout (salles, ennemis, dégâts, récompenses) ;
  l'invité déplace son Pokémon chez lui et envoie ses attaques, l'hôte lui
  renvoie le terrain ~20 fois par seconde. Une salle libérée relève les
  joueurs à terre ; la run est perdue quand tous sont à terre.
- L'invité voit toute la salle : l'hôte enregistre ce qu'il dessine (arbres
  à baies, coffre et son obstacle, portes et récompense, boutique, marchand,
  dresseurs, grotte, zones des dons) en coordonnées du monde, et l'invité le
  rejoue sous sa propre caméra (`src/net/drawrec.ts`), étiquettes HTML
  comprises. Il frappe les arbres, ramasse les baies et ouvre les coffres
  (E).
- Butin partagé : l'argent de la run (₽) est commun, et tout ce que la run
  rapporte (Baies, Éclats, ressources, matériaux, objets) est versé dans la
  sauvegarde de chaque joueur, quel que soit celui qui l'a ramassé : on le
  retrouve en rejouant seul. En fin de run, l'invité revient dans le Repaire
  de l'hôte. « Quitter la partie » le ramène chez lui.

## Publier sur GitHub Pages

Le jeu est un site statique : `.github/workflows/pages.yml` le construit et le
publie à chaque push sur `main`. Une page de projet est servie sous
`/<dépôt>/` : le workflow passe ce chemin à Vite (`BASE_PATH`), et
`vite.config.ts` préfixe les chemins `/game/…` du code. Pour l'activer :
dans le dépôt GitHub, Settings → Pages → Source : « GitHub Actions ».

Pour vérifier le build servi sous un sous-chemin, en local :

```bash
BASE_PATH=/pokhades-web/ npm run build && BASE_PATH=/pokhades-web/ npx vite preview
```

Le jeu en ligne y fonctionne tel quel (HTTPS, signalisation PeerJS publique).
Limite : entre deux réseaux très fermés (réseau d'entreprise, NAT
symétrique), la connexion directe WebRTC peut échouer ; il faudrait alors un
serveur relais TURN.

## Plan du monde et exploits

Ajout (`src/ui/journal.ts`, `src/meta/feats.ts`). Pas de touche (retour de test :
« je ne vais pas ajouter encore une touche ») : tout se passe au Repaire, dans le
coin du départ, à gauche de l'arche de Dracolosse.

- **Le panneau du plan** (`Camp.board`) : E ouvre le plan du monde, peint avec
  les tuiles du jeu (`src/ui/worldplan.ts`) d'après une image de référence du
  joueur : au nord, des falaises en terrasses sur toute la largeur — le Volcan et
  sa lave à l'ouest, les Rocailleux et leur mesa au centre, la Montagne glacée,
  ses sapins enneigés et ses mares de glace à l'est, et la Route Victoire en
  sommet enneigé au milieu ; les escaliers sont taillés dans des faces droites,
  là où arrivent les chemins, et la lave et la glace restent au milieu des plateaux ; à l'ouest, la plage et ses
  palmiers, et la mer de l'Océan ; au centre, le Village, ses maisons, sa rue de briques et sa fontaine, le Marais
  et ses géants moussus, le Lac cerné d'arbres, et son îlot boisé ; à l'est, les bois d'Automne puis
  la Forêt ; en bas, la Prairie et ses herbes hautes. Les positions des noms
  (`PLACES`) ne valent que pour le plan : le sens des portes en run suit
  `world/worldmap.ts`. Les routes sont de petits chemins de terre peints, tracés
  à la main (`TRAILS`) : ils partent de la Prairie, se rejoignent comme des
  sentiers et finissent au pied des escaliers des falaises ; seuls ceux qui
  partent d'un biome déjà atteint apparaissent (la traversée vers l'Océan, en
  pointillés d'écume). Chaque zone a son ambiance (`ZONES`) : le Volcan rougeoie
  et crache des braises, une brume traîne sur le Marais, la neige et la grêle
  tombent sur la Montagne, des feuilles en Automne, des reflets sur le Lac, et sur la
  côte de l'Océan le même ressac qu'en run (`ShoreWaves`). Un
  biome atteint porte son nom et ses champions (✓ une fois vaincus), les autres
  un « ? ».
- **Xatu, le chroniqueur** (poste `feats`) : le carnet des exploits, « à la
  Hades » — chaque champion à battre une fois, le Conseil et le Maître, chaque
  biome à atteindre, les runs gagnées, la taille de la rébellion. Une ligne par
  exploit (nom, avancée, récompense) ; ceux qui sont faits se réclament d'un clic
  ou tous ensemble (Entrée), les réclamés ne restent qu'au compte. Les exploits
  se dévoilent au fil de l'avancée (`Feat.unlocked`) : le champion d'une zone et
  les biomes voisins une fois la zone atteinte, le Conseil et le Maître une fois
  la Route Victoire ouverte, les objectifs suivants de la rébellion une fois le
  précédent atteint. Un « ! »
  flotte au-dessus de Xatu quand il y a de quoi réclamer.

## Difficulté

Retour de test : la première run est dure, puis une équipe de six au niveau
écrase tout, boss compris. Désormais (`src/run/run.ts`) :

- **premier acte doux** : faune réduite (voir plus haut), sauvages de 4 à 8 dans
  les deux premières salles, pas de top dresseur avant le deuxième acte, et un
  champion sans sbires de renfort ;
- **pente qui se raidit** : niveau des salles 10 + salle × 1,2 + acte × 3 (+6 sur
  la Route Victoire) ;
- **boss à la hauteur** : le champion part du niveau de son acte +3 (le jeu :
  18 + salle × 0,7, plus faible que les sauvages du quatrième acte) ; son équipe
  est complétée par des Pokémon de son type jusqu'à 2, 3, 4, 5 puis 6 selon
  l'acte (`reinforce`) ; ses sbires passent de 2 au premier acte à 3 + 2 × acte,
  plus un par paire de membres de l'équipe ; l'affiche de la boutique montre
  les vrais niveaux (`Run.bossLevel`) ;
- **l'équipe compte** : dès le deuxième acte, un sauvage de plus par vague par
  paire de membres (7 au plus), et la part de Pokémon venus d'ailleurs dans les
  équipes de dresseurs monte d'acte en acte (0, 20 %, 40 %).

Les dresseurs des salles (`Trainer.direct`, `src/entities/trainer.ts`) ne font
plus les cent pas au hasard : avant leur tour ils gardent leur place, tournés
vers le joueur ; leurs Pokémon sortis, ils se postent derrière eux, à l'opposé
du joueur, et reculent s'il fonce sur eux.

## Repaire : places et recrues

- La jauge des places est en haut à gauche : « Le Repaire · 5/6 Pokémon · 2 en
  attente ».
- Toutes les recrues en attente (dix au plus) flânent autour du feu, chacune
  avec son « ! » ; on parle à celle qu'on veut. Repaire plein : « Plus tard » (ou
  Échap) referme sans renvoyer personne.
- Les poches de l'atelier du bâtisseur et de l'Étude d'Alakazam sont plus larges,
  et une trouée sur leur allée les relie à la place (`yardWay`, `studyWay` dans
  `src/run/camp.ts`).

## Arènes des champions

Ajout (`src/world/arena.ts`, option `arena` de `generate`) : chaque biome a son
arène, toujours la même (graine fixe, comme la boutique). La clairière ronde
garde la bordure du biome (anneau d'eau au Lac, de lave au Volcan, montagnes
aux Rocailleux, île de sable à la Plage) et son sol ; un anneau de décor du lieu
la cerne (palmiers à la Plage, rochers aux Rocailleux, sapins enneigés et
cristaux en Montagne, arbres morts au Marais, lampadaires au Village…), ouvert
seulement aux quatre sorties, que deux torches encadrent. On entre par le sud ;
les routes de la carte partent au nord, à l'ouest et à l'est. Le champion attend
au bord nord. (Le terrain pavé d'une première version est retiré : « le sol
d'arène, c'est pas top ».)

## Son

- Volumes de départ plus bas (musique 30 %, bruitages 50 %), au premier lancement.
- Plus de musique de combat dans les salles : chaque lieu a la sienne
  (`BIOME_TRACKS`, `src/audio/sounds.ts`) — Route 1 en Prairie, Parc naturel en
  Forêt, Route 2 au Lac, Grotte aux Rocailleux et dans les grottes, Plateau Indigo
  sur la Route Victoire, Poké Mart à la boutique, Surfing à l'Océan… Le combat
  (Battle trainer) ne joue plus que chez le champion. Ce sont des pistes .mid
  d'Essentials, rendues en .mp3 une fois pour toutes par `node
  scripts/midi-to-mp3.ts` (petit synthé façon console portable, ffmpeg requis)
  dans `public/game/music/`.
- La météo (grêle, sable…) se lève quand la salle est libérée : on peut fouiller
  et prendre sa récompense sans perdre de PV.

## Récompenses

- Portes ordinaires : plus de texte, l'icône seule, en grand. La porte vers la
  boutique le dit (« Boutique », Perrserker en vignette), celle du boss aussi.
- Dons : chaque légendaire est sa silhouette en pixels (planche PMD) dans une
  vignette carrée à la couleur de son type, au lieu de l'illustration officielle.
  Au-dessus de la récompense posée, rien d'écrit : « [E] » apparaît quand on
  s'approche.
- Le donateur d'un don se tire dès que la récompense apparaît, même sans porte
  qui l'annonce : le badge posé et l'écran des dons montrent le même légendaire
  (avant, le badge de Mew s'affichait par défaut).
- Couleurs : l'or pour les dons, l'orange pour les attaques, le papier pour le
  butin (au lieu du cyan, du violet et du vert).

## Tailles des salles

Retour de test : « les zones sont beaucoup trop grandes… les couloirs beaucoup
trop longs ; la montagne, un peu trop longue ». Les tailles de `layouts.ts`
baissent : couloirs de 66 × 28 à 46 × 26 au plus, lignes de front de 66 × 26 à
48 × 24, clairières reliées, carrefours, lacets et littoral d'environ 15 %. La
Montagne glacée tire surtout des arènes et des carrefours, plus guère de
couloirs. Le Lac (clairière et boucle) garde à peu près sa taille.

## Butin

Un coffre (ou un champion) annonce chaque gain à part, à la suite : l'icône de
l'objet (Baies, ressource, matériau, Éclats) et la quantité en gros sur une
étiquette jaune (`RunHud.notifyAll`).

## Le terrain de chaque biome

Ajout (retour de test : « le but, c'est que chaque biome ait vraiment son gameplay ») :

- **Prairie (et biomes à herbe haute)** : les vraies hautes herbes, les touffes de deux
  cases (`PROPS.bunches`), poussent en bosquets serrés dans les champs (`WorldMap.hide`,
  `generate.ts` étape 12). Les sauvages ne se cachent plus que là (`onTallGrass`), et la
  touffe s'agite quand l'un d'eux y bouge (`renderer.ts`, `rustled`). Les petites herbes
  restent pour le décor et l'effet sous les pas.
- **Marais** : la boue (ses plaques, hors chemin) ralentit à 55 % (`Actor.terrainMult`) —
  sauvages compris ; les Vol et les Spectre n'y sont pas pris, le dash la traverse.
- **Volcan** : avec la CS Surf, la lave se traverse (`Actor.lavaOk`), mais elle brûle :
  6 % des PV toutes les 0,6 s, une chance de Brûlure, des flammèches autour du nageur ;
  jamais de K.O., les Feu y sont insensibles (`run/hazards.ts`).
- **Rocailleux** : une salle sur deux, deux ou trois tourbillons de sable errent au
  hasard ; pris dedans, on encaisse 7 % des PV et l'on est éjecté (Roche, Sol, Acier y
  résistent). Jamais dans l'arène.
- **Village** : les dresseurs lancent des Poké Balls sur le Pokémon joué, comme le sbire
  des grottes (`run/capture.ts`), même s'il est seul (le QTE suffit pour s'en sortir) ; la
  prise revient quand l'équipe de son dresseur est battue. En ligne, être capturé met
  simplement K.O. jusqu'à la fin de la salle.
- **Automne** : de temps en temps, une rafale se lève dans une direction, emporte des
  feuilles et pousse l'équipe (sans dégâts).
- **Océan** : deux à quatre tourbillons dérivent sur la pleine eau (les ondes de *Water
  pulse* d'Essentials jouées à l'envers, un œil sombre, une spirale d'écume) ; un nageur
  pris dedans perd 5 % de ses PV et est recraché au hasard.
- **Montagne glacée** : la grêle et la glissade, déjà là.

Les Pokémon cachés dans les hautes herbes laissent dépasser le haut de leur tête. La lave
ne rallume pas la Brûlure plus d'une fois toutes les 10 s (les statuts s'éteignent seuls).
Une salle libérée relève les membres K.O. avec 1 PV (hors mercenaires).

## Nage

Plus de monture Surf : chaque Pokémon nage avec sa propre planche (attaques comprises),
en pagayant sans cesse (sa marche en boucle, plus lente sur place), enfoncé de 10 pixels, une collerette d'écume qui respire, des vaguelettes et
un sillage quand il avance (`Renderer.drawWake`) ; dans la lave, des flammèches.

## Menu principal et logo

`src/ui/titlescreen.ts` et `src/ui/logo.ts` : au lancement, le logo « POKHADES —
Libérez-les tous ! » (l'illustration du jeu, `public/game/brand/logo.webp`) sur le Repaire
flouté, et « Jouer », « Réglages », « Commandes ». Sauté sous `?debug`. Favicon et icône
d'écran d'accueil : la Poké Ball enchaînée du logo (`public/favicon-32.png`,
`favicon-64.png`, `apple-touch-icon.png` ; source détourée : `public/game/brand/ball.webp`).

## Récompenses, records

- Le don d'un légendaire se montre par son illustration, en grand, détourée d'encre sur un
  halo de son type ; l'icône d'une porte ordinaire flotte au-dessus de la sortie.
- Chez Xatu, les records : runs, victoires, salle la plus loin atteinte, champions battus.
- Prime de lignée : la première fois qu'un membre atteint la forme finale de sa lignée en
  run, +1 Éclat et 40 Baies (`Save.evolved`).

## Arène du Village, fontaine

- L'arène du champion du Village est une salle d'intérieur façon arène Pokémon
  (`buildGym`, `src/world/arena.ts`, tuiles de `Gyms interior.png` d'Essentials, relevées
  dans `GYM`, `tiles.ts`) : murs, sol d'arène, terrain tracé avec la Poké Ball au centre,
  statues et paillasson à l'entrée, plantes ; trois couloirs de sortie. Ni météo ni
  particules d'ambiance dedans.
- La fontaine des villages (et du plan) est celle d'Essentials : le bassin d'`Outside.png`
  et le jet animé de l'autotile `Fountain1.png`.


## Jouer en ligne : menu, lien et QR code

Une fois le premier Pokémon libéré, le menu principal propose **Jouer en ligne** (ouvre l'écran de
Roucarnage : héberger ou rejoindre). L'hôte qui ouvre sa partie voit son code et, dessous, un
**QR code** (`ui/qr.ts`), affiché en haut sous le bandeau du code (`ui/netbadge.ts`) : l'écran de
Roucarnage se referme, on peut se promener et préparer la run. Le QR code ne se montre qu'au Repaire
de l'hôte, et disparaît au départ de la run ; un clic dessus copie le lien d'invitation, l'adresse du
jeu suivie de `?join=CODE` (`net/invite.ts`). Qui ouvre ce lien arrive sur le menu avec « Rejoindre CODE » en premier choix ;
le paramètre est retiré de la barre d'adresse (un rechargement ne rejoint pas une partie fermée).
Sans premier Pokémon, rien à emmener en ligne : le code est gardé, et une notification le rappelle
au Repaire une fois le starter choisi.

## Jouer en ligne : ce que fait un invité

- **Au Repaire de l'hôte**, il voit les recrues qui attendent (sans pouvoir leur parler) et peut
  acheter chez Monsieur Mime (attaques), Alakazam (améliorations) et Miaouss (objets), avec **sa**
  sauvegarde. Démolosse (missions) et le Charpentier restent ceux de l'hôte.
- **En run**, n'importe quel joueur debout qui franchit une porte (ou une bouche de grotte) lance
  la salle suivante pour tous ; un invité qui appuie sur E près de la récompense ouvre l'écran de
  choix **chez l'hôte** (c'est l'hôte qui choisit le don). Les invités ramassent aussi les baies et
  ouvrent les coffres. Son HUD liste tous les joueurs.
- **Chacun reçoit le Pokémon de tête des autres** (`grantAlly`, `meta/save.ts`) : en ligne, le Pokémon de
  tête de chaque joueur, ramené à sa forme de base, rejoint le Repaire de ceux qui ne l'ont pas (ou attend avec
  les recrues si le Repaire est plein), une seule fois par espèce (`Save.shared`). Ça permet de débloquer vite
  des Pokémon de départ.
- **À la fin de la run**, il voit le même bilan que l'hôte (`end` dans `net/net.ts` porte le bilan).

## Mobile : plein écran et départ en run

Le menu propose « Plein écran » sur téléphone (`ui/fullscreen.ts` : API plein écran et verrouillage
horizontal ; sur iPhone, « Partager → Sur l'écran d'accueil », avec `manifest.webmanifest`). Le
départ par l'arche ralentit le temps (30 %), fait monter un halo doré puis éteint l'écran
(`startDeparture`, `main.ts`). Les dons des légendaires sont des médaillons (`.rw-badge.art`).

## Multijoueur : relais TURN (ExpressTURN, gratuit)

La connexion entre joueurs est directe (WebRTC via PeerJS). Entre un téléphone et un ordinateur,
même sur un seul Wi-Fi, elle échoue souvent (adresses locales masquées par le navigateur, box qui
ne les relaie pas, 4G/5G) : l'invité voit « en attente, l'hôte ne répond pas ». Il faut un
**relais TURN**. Le TURN public de PeerJS (`*.turn.peerjs.com`) n'existe plus (nom de domaine
disparu, vérifié le 6 novembre 2026).

On prend l'offre gratuite d'ExpressTURN (1 000 Go par mois d'après leur site ; la carte bancaire
n'y est pas mentionnée : ne pas en saisir). Mise en place, une fois :

1. Créer un compte sur <https://www.expressturn.com>, puis ouvrir le tableau de bord : il donne
   l'adresse du serveur (`host:3478`), un **Username** et un **Password**.
2. Sur GitHub : *Settings → Secrets and variables → Actions*.
   - Variables : `TURN_URLS` = `turn:HOTE:3478,turn:HOTE:3478?transport=tcp` (l'hôte du tableau de
     bord) ; `TURN_USERNAME` = le Username.
   - Secret : `TURN_CREDENTIAL` = le Password.
3. Relancer le déploiement (merge, ou *Actions → Pages → Run workflow*). En local, mettre
   `VITE_TURN_URLS`, `VITE_TURN_USERNAME` et `VITE_TURN_CREDENTIAL` dans `.env.local`.

Ces identifiants sont lisibles dans le jeu publié : c'est un compte gratuit à quota. Si quelqu'un
en abuse, « Refresh Username, Password » dans le tableau de bord les change (puis mettre à jour
les variables GitHub). Sans ces variables, le jeu marche seulement entre deux appareils qui se
joignent directement.
