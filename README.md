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
- Tab (clic du stick droit à la manette) pour passer au Pokémon suivant de l'équipe ;
- Échap pour fermer un écran du Repaire ;
- Page↑ / Page↓ pour forcer le biome de la run, N pour une nouvelle run, H pour
  masquer le panneau de réglages.

Le Pokémon monte sur la monture Surf dès qu'il entre dans l'eau.

Run (portée de `RunManager.gd` et `CombatArena.gd`) : 4 actes de 7 salles
(5 combats, une boutique, un boss), un biome par acte (Prairie, puis
Forêt/Automne/Lac, Marais/Lac/Automne/Village, Éboulis/Marais/Volcan). Chaque
salle lance ses vagues, se libère (+₽), pose une récompense au centre et
ouvre ses portes : chacune annonce la récompense de la salle suivante. Une
barrière ferme les sorties tant que la salle n'est pas libérée. Le Pokémon
joué tombe : le suivant encore debout prend le relais ; toute l'équipe K.O.,
la run est perdue et l'on rentre au Repaire.

Le Repaire (portée de `HubWorld.gd`, redessinée) : le camp des rebelles, où
le jeu s'ouvre et où l'on revient après chaque run. Une grande clairière de
nuit (carte de 88 × 66 cases), un feu de camp (la flamme d'Essentials,
`Animations/fire5`) cerclé de huit torches, sous les lucioles ; seul le
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
tournés vers les flammes (la pose « Sit » de PMD est vue de dos) ; au nord,
ils restent au repos, de face. Ces poses (Sit, Laying, Idle, Hop) ne sont pas
dans le dépôt Godot : `npm run import-assets` les tire de SpriteCollab et
écarte celles dont les dimensions ne collent pas à l'`AnimData.xml`.

Au début, le camp est presque vide : Dracolosse sous l'arche du **départ**,
Porygon devant la hutte de l'**équipe**, Roucarnage au relais du jeu **en
ligne** (l'écran est là, le jeu en ligne pas encore) et Ossatueur, le
**bâtisseur**, qui vend les aménagements (en Baies) :

- **Étude d'Alakazam** (100) : améliorations (places dans l'équipe, Partage
  d'XP, Bourse de départ, charges de dash, Ceinture de Rappels, Vitalité), CS
  (Surf ; Coupe, Éclate-Roc et Force annoncées) et objets (douze objets tenus,
  Super Bonbon) ;
- **Marché du tuteur** (150) : M. Mime et ses deux étals, 20 CT ;
- **Dortoir** (80) : deux tipis et des paillasses de paille ;
- **Terrain d'entraînement** (120) : terre battue et deux mannequins ;
- **Ponton** (120) : sur la rive, à l'écart du feu ; on marche sur son
  plancher jusqu'au-dessus de l'eau.

À la hutte de l'équipe, on glisse les Pokémon dans l'équipe, hors d'elle ou à
une autre place (le premier mène), et les attaques dans leurs quatre
emplacements — une zone ne s'allume que pour ce qu'elle accepte ; au clavier
ou au double-clic, un Pokémon déjà choisi entre dans l'équipe ou en sort. La
fiche montre les statistiques de tout Pokémon cliqué, même resté au camp.

Les Baies sont la monnaie permanente (200 au départ) : un champion vaincu en
rapporte 120 + 80 par acte, le Dresseur final 300 de plus et la victoire
500 + 30 par salle ; une défaite en laisse 15 par salle traversée. La
progression est gardée dans le navigateur (`pokhades-save`) ; le panneau a
deux boutons de test, « +1000 Baies » et « Tout remettre à zéro ». Pas encore
de Pokémon à débloquer, de poids d'équipe, de bâtiments ni d'expéditions : les
huit Pokémon jouables sont tous au camp.

Équipe (portée de `CombatArena._cycle_active` et `TeamMember._companion_process`) :
1 à 6 Pokémon, composée au Repaire (le panneau la change aussi, sans compter
les places, pour tester) ; le premier part devant, Tab passe la
main au suivant encore debout, là où il se trouve. Les autres sont sur le
terrain, menés par l'IA : ils attaquent l'ennemi visible le plus proche
(18,75 cases) avec leur première capacité prête, à sa portée, et rejoignent
le Pokémon joué au-delà de 5,6 cases. Chacun garde ses recharges et son
combo. L'XP (niveau de l'ennemi × 12) va à chaque membre qui l'a touché,
montant plein, et chaque espèce monte à son rythme (groupes de croissance des
jeux : rapide, moyenne, parabolique, lente). Un membre K.O. reste couché là
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
visite au plus. On les contourne, ils ne se laissent pas pousser. Pas de lots de
Baies, de solde des mercenaires ni de rachat : ils supposent le camp.

Boss (porté de `CombatArena.gd`, `PokePools.gd`, `TrainerNPC.gd`,
`PokeballFX.gd`, `ChampionDialogueScreen.gd`) : chaque acte a son champion,
assorti au biome (Blanche, Erika, Ondine, Koga, Pierre, Giovanni, Auguste,
Morgane, Major Bob), jamais deux fois le même dans une run ; celui du dernier
acte est le Dresseur Final. Son équipe est celle des jeux (Rouge Feu / Vert
Feuille, HeartGold / SoulSilver pour Blanche) : de 2 Pokémon pour Pierre à 5
pour Giovanni. Ils sortent de Poké Balls une vague à la fois, escortés de
sbires de leur forme de base ; ils ont 2 barres de PV, son as en a 5, et une barre de boss en haut de l'écran les
montre (le jeu n'en a pas). Le dresseur attend devant la sortie et s'enfuit
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
forte du répertoire de l'espèce ou d'en renforcer une (+25 %).

Combat (porté de `TeamMember.gd`, `EnemyAI.gd` et `CombatVFX.gd`) : niveau 10,
capacités par défaut du jeu, portée et recharge propres à chaque attaque,
combo de 3 coups, orbes à tête chercheuse pour les attaques spéciales,
statuts, hitstop et secousse. Chaque coup joue une planche d'Essentials
choisie par capacité quand elle existe, sinon par type (src/data/attackanims.ts).
Les sauvages touchés et les Pokémon de champion portent une barre de vie
au-dessus de la tête.

Les sauvages (porté d'`EnemyAI.gd`, niveau 4 à 8) se réveillent quand on
approche à 9 cases ou qu'on les frappe, puis suivent leur archétype :
poursuivant, tireur (s'il a une attaque spéciale), chargeur, harceleur ou
soutien qui renforce ses voisins. Chaque attaque est annoncée (le Pokémon
s'écrase et blanchit, un anneau rouge grandit sous lui) et rate si l'on s'est
éloigné à temps. Leurs orbes infléchissent leur course sans suivre à coup
sûr : courir de côté les évite, et le dash rend invulnérable. Dans l'herbe
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
