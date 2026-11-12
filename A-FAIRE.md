# Pokhades web — ce qu'il reste à faire

Note de reprise (30 octobre 2026), tirée d'un retour de test du joueur : à
lire avant de reprendre le prototype web. Elle liste ce qu'il veut voir
ensuite, où regarder dans le code, et ce que le jeu Godot (`../pokhades`)
fait déjà et qu'on peut porter. Les points sont groupés par zone, pas classés
par priorité : demander au joueur par où commencer.

Déjà fait depuis (lot 1, 30 octobre 2026, détail dans `README.md`) : HUD
compact et équipe cliquable, Rappels en haut, fiche des statistiques (C),
icônes des récompenses, bug « #25 », ponton à garde-corps, nénuphars
traversables, attaques spéciales qui frappent directement après une marque
au sol. Lot 2 : évolutions en run (1.1), Super Bonbon compris ; biomes
enchaînés (1.2) : graphe de biomes, portes de route au choix après chaque
boss, Océan gardé par Surf (ces deux points restent ci-dessous pour mémoire).

Lot 3 (5 novembre 2026, retour de test après la mise en ligne, détail dans
`README.md`) : panneau H réduit au Repaire dans le jeu publié ; première zone
peu variée et recrutement guidé ; difficulté qui monte d'acte en acte (boss
complétés, sbires, effectifs selon l'équipe) ; dresseurs qui mènent leurs
Pokémon ; Piège caché, marchand retiré ; carte du monde fixe, portes du côté
de leur biome et entrée par le bord d'en face ; carnet (J) avec la carte et les
exploits ; Route Victoire (Conseil et Maître) ; Baies divisées par trois ;
Pokédex des formes de base ; plus de nage sans Surf ; recrues visibles au
Repaire, « Plus tard », jauge des places, arbres dégagés. À regarder au
prochain test : l'équilibre réel des niveaux (non joué de bout en bout).

Lot 4 bis (11 novembre 2026) : places au Repaire 8 au départ (au lieu de 6),
Dortoir +4, Maisons +6, Bourg +8, et des **Lits superposés** rachetables chez
le bâtisseur (+2 places, 60 à 400 Baies, six fois, `BUNKS`, `Save.bunks`) ;
chantiers moins chers ; chaque salle libérée rapporte 1 Bois et 1 Pierre, un
champion 4 de chaque plus 4 Nourriture (`ROOM_RES`, annoncés au retour) ; les
coffres donnent aussi l'autre ressource ; missions de bois et de pierre plus
courtes et mieux payées. Les champions alignent autant de Pokémon que
l'équipe, moins un, plus l'acte (4 au plus au premier acte, `reinforce`).
Compagnons plus malins (`companion.ts`) : ils sortent des marques et des
zones avant l'impact (`Combat.threatAt`), restent à moins de 9 cases du
Pokémon joué, protègent d'abord celui-ci et achèvent les affaiblis, prennent
l'attaque la plus efficace contre leur cible, gardent leurs distances avec
une attaque à distance et se replient sous 30 % de PV.
À juger en jeu : le rythme des ressources et des places.

Lot 4 (11 novembre 2026, retour de test). Fait : « Pour qui ? » cliquable
sur l'écran de récompense (la colonne était sous `.rw-boon`) ; les attaques
spéciales visent l'arbre à baies le plus proche (`Combat.breakableNear`) ;
notifications refaites (étiquette d'encre, pastille colorée, « ×n » pour les
doublons) ; exploits de Xatu réclamés au cliquetis des jetons (`claim`), plus
la fanfare, et la fanfare du déblocage espacée de 8 s. En attente, dans
l'ordre proposé au joueur (les animations par attaque et l'évolution des
attaques au renforcement sont faites, voir README ; reste à les juger en jeu ;
l'invité en ligne les reçoit, non testé à deux machines) :
- sons des Poké Balls à revoir ;
- dons rééquilibrés (12 novembre 2026, voir `RARITY_SCALE` de
  combat/boons.ts) : à juger en jeu ;
- méga-évolutions et formes régionales faites (voir README) : à juger en
  jeu (aura, taille, fréquence des formes régionales) ; choix X / Y et
  Méga de l'as des champions faits ; reste : Canarticho de Galar sans évolution
  (pas de planche de Palarticho) ;

---

## 0. Pour reprendre

**Le projet.** Prototype web 2D (Vite + TypeScript + Canvas 2D) du jeu Godot
Pokhades : `README.md` décrit tout ce qui existe (run, combat, boutique,
Repaire). Le jeu Godot de référence est dans `../pokhades`.

**Conventions (non négociables).**
- Tout en français : interface, commentaires, échanges, commits.
- Commentaires denses qui expliquent le *pourquoi*, au ton de ceux du dépôt ;
  les tenir à jour. Un écart voulu avec le jeu Godot se signale en commentaire
  (« Écart voulu : … »).
- Jamais `git add -A` ni `git add .` : pathspecs explicites (d'autres
  sessions travaillent en parallèle). Ne committer que sur demande.
- DA « Tag sacré » : `src/ui/da.css` (encre, papier, Bebas Neue, Permanent
  Marker, Bangers ; pas de rouge sang, pas de police qui bave).
- Sprites : d'abord le tileset du jeu (`public/game/assets/tilesets/tileset
  pokemon.png`, relevé dans `src/world/tiles.ts`), puis Essentials (même
  style, `../pokhades/Pokemon Essentials v21.1 2023-07-30/Graphics`). Le
  joueur n'aime pas les décors dessinés à la main quand un sprite existe.

**Lancer et tester.**
- `npm run dev` → http://localhost:5173 ; `?debug` expose `window.pokhades`
  (monde, joueur, équipe, run, camp, sauvegarde, `goto(salle)`, `step(n)`,
  `newRun()`, `enterCamp()`).
- `npx tsc --noEmit -p .` puis `npx vite build` avant de rendre la main.
- `npm run import-assets` recopie les assets du dépôt Godot ; ce qui manque
  est tiré de SpriteCollab et PokéAPI (`scripts/remote.ts`, cache
  `.cache/remote/`). Toute nouvelle espèce ou planche passe par là.
- Pièges de test : dans un onglet en arrière-plan, la boucle de rendu est en
  pause (les dialogues ne se ferment pas, les animations CSS ne jouent pas :
  avancer la simulation avec `pokhades.step(n)`) ; la sauvegarde
  (`localStorage['pokhades-save']`) est partagée par tous les onglets du même
  port — la remettre à zéro après un test (bouton « Tout remettre à zéro » du
  panneau, ou `localStorage.removeItem('pokhades-save')`).
- Une autre session développe un **bestiaire** (page `config.html`,
  `src/data/bestiary.ts/.json` : faune par biome, répliques et attaques par
  espèce) : s'appuyer dessus (`linesOf`, `sheetOf`) au lieu de le dupliquer.

**Repères du code.**
- `src/main.ts` : boucle, modes `camp` / `run`, équipe, sauvegarde, écrans.
- `src/run/` : `run.ts` (structure de la run, biomes par acte, vagues de
  boss), `room.ts` (vagues, portes, récompenses), `shop.ts` (boutique),
  `camp.ts` (Repaire), `placement.ts`.
- `src/combat/` : `combat.ts` (attaques, frappes des spéciales, XP, K.O.), `enemy.ts` (IA des
  sauvages, archétypes), `companion.ts`, `pokemon.ts`, `moves.ts`, `boons.ts`.
- `src/world/` : `generate.ts` (cartes, dont le Repaire en `camp`),
  `biomes.ts`, `tiles.ts` (sprites relevés sur la planche).
- `src/ui/` : `hud.ts`, `runhud.ts`, `rewardscreen.ts`, `campscreen.ts`
  (écrans du Repaire), `da.css`.
- `src/meta/` : `save.ts` (progression permanente), `catalog.ts` (CT,
  améliorations, objets, CS, aménagements).

---

## 1. En run

### 1.1 Évolutions (fait)
Les Pokémon n'évoluent pas en montant de niveau. Il faut qu'ils évoluent au
niveau prévu, avec une animation d'évolution (flash blanc, silhouette qui
change, nom du nouveau Pokémon annoncé).
- Jeu Godot : table `EVOLUTIONS` dans `autoloads/GameManager.gd:21` (les
  évolutions par pierre, échange ou bonheur y ont reçu un niveau) ; le Super
  Bonbon peut aussi déclencher une évolution (`use_candy`, même fichier).
- Web : la montée de niveau passe par `Combat.levelUp` (`src/combat/combat.ts`,
  appelé dans `kill`) et `main.ts` (`combat.levelUp = …`). Une évolution
  change l'espèce de l'acteur : planche PMD, fiche, stats, attaques — à
  importer (ajouter les formes évoluées à `allSpecies()` dans
  `src/data/species.ts`).
- Penser au Super Bonbon du Repaire (`save.levels`) : un Pokémon qui part au
  niveau d'évolution devrait partir évolué.

### 1.2 Biomes de la run (fait)
- Une run commence toujours par la Prairie ; **chaque boss vaincu mène à un
  nouveau biome** (aujourd'hui : un biome par acte, `ACT_BIOMES` dans
  `src/run/run.ts`).
- Des biomes conditionnels : la Plage peut mener à l'**Océan si l'on a Surf** ;
  sans Surf, on peut quand même continuer sur une autre variante de Plage.
  Plage et Océan existent déjà (`biomes.ts`) mais ne sont pas dans la
  séquence de run. Généraliser : un graphe de biomes, avec des embranchements
  gardés par des CS.

### 1.3 Boss plus forts (fait)
Champion et as : ATQ / DÉF (spéciales comprises) et PV relevés
(`BOSS_BOOST`, +30 % de PV par membre au-delà du premier, `main.ts`),
recharge ×0,75, et des **attaques de zone** posées au sol avant l'impact
(`tryArea` dans `enemy.ts`, `enemyArea` dans `combat.ts`) : disque autour
du lanceur (Sol, Roche, Combat, Acier), cône devant lui (Feu, Poison,
Ténèbres, Vol, Plante, Insecte, Spectre), rayon pour le reste ; l'as, sur
ses deux dernières barres, fait aussi pleuvoir des disques sous chaque
membre. Une zone sur deux est l'**attaque signature** du champion
(`src/combat/signatures.ts`, une figure par arène, son nom au-dessus du
lanceur ; nouvelle forme `ring` pour les couronnes). Reste à régler les
chiffres au fil des tests (puissances `pow`, délais, portées).

### 1.4 Arbres à baies (fait)
- Deux ou trois **arbres à baies** par salle de run (`WorldMap.berries`,
  étape 11 de `generate.ts`, son propre tirage), au bord du chemin, loin du
  départ, des sorties et de la grotte ; une baie par biome (`Biome.berry`) :
  Oran (Prairie), Ceriz (Forêt), Sitrus (Automne), Mago (Lac), Gowav
  (Marais), Mepo (Village), Nanab (Plage). Aucun au Volcan, en Rocailleux, en
  Océan, ni à la boutique.
- On les frappe au corps à corps ou au tir (`Combat.breakables`) : deux
  coups, puis 2 à 4 baies sautent autour ; on marche dessus, 3 Baies chacune.
  Elles pourrissent en 25 s (`src/run/berries.ts`). Écart voulu : l'arbre
  cueilli reste debout, en fleur, au lieu de disparaître.
- **Aimant à Baies** chez Alakazam (300, achat unique, `magnet` dans
  `UPGRADES`) : les baies à moins de 7 cases filent vers le joueur.
- Les baies restent une monnaie (pas d'objet de soin). Reste : pas de
  repousse (un arbre cueilli le reste pour la salle).

### 1.5 Coffres et CS sur le terrain (fait)
- Un **coffre** dans deux salles de run sur trois (`WorldMap.chest`, étape 12
  de `generate.ts`, son propre tirage ; jamais en boutique). Le plus souvent
  au fond d'une alcôve de rochers dont la seule entrée, au sud, est gardée
  selon le biome (`Biome.guard`) : un **arbuste** à couper (CS Coupe :
  Prairie, Forêt, Automne, Marais, Lac) ou un **rocher fissuré** (CS
  Éclate-Roc : Volcan, Rocailleux, Village, Plage, Océan). L'îlot du Lac
  garde son coffre sans obstacle (l'eau suffit) ; sans place pour l'alcôve,
  le coffre est à découvert (presque toujours en Océan).
- [E] devant l'obstacle le lève si l'équipe a la CS (planches Essentials
  `Object tree 1.png` / `Object rock.png`), sinon l'invite dit laquelle
  acheter ; puis [E] ouvre le coffre (`src/run/chests.ts`). Coupe et
  Éclate-Roc sont en vente à l'Étude.
- Écart voulu : **pas d'objet de run** (le Repaire vend déjà les objets
  tenus). Le coffre donne des **Baies** et des **ressources** de
  construction — Bois (derrière un arbuste), Pierre (derrière un rocher),
  Nourriture — plus dans un coffre gardé (`rollLoot`). Les ressources
  (`Save.resources`) paient, avec les Baies, les aménagements du bâtisseur
  (`BUILDINGS[].cost`) ; l'Étude reste en Baies seules, puisqu'elle vend les
  CS qui ouvrent les coffres.
- Reste : Force (gros rocher à pousser, `ready: false`), d'autres sources de
  ressources (expéditions ?).
- Jeu Godot : `scripts/world/Chest.gd`, `GameManager.CS_CATALOG`.

### 1.6 Grottes (fait)
Des entrées de grotte, pas à chaque fois, dans les falaises et collines
(Volcan, Rocailleux, ailleurs au hasard). Dedans : des Pokémon à libérer (ils
rejoignent le camp), des mini-boss avec récompenses, des coffres.
- Jeu Godot : `_spawn_cave_portals` (`scripts/combat/CombatArena.gd:7423`),
  scène `scenes/world/CaveArena.tscn` ; le demi-boss d'une grotte débloque son
  espèce.
- Web : `Run.hasCave` (tirage), étape 10 de `generate.ts` (bouche dans une
  paroi), `src/world/cave.ts` (carte), `src/run/cave.ts` (CaveDirector),
  `enterCave`/`exitCave` dans `main.ts`, `save.freed` (prisonniers).
  Pour tester : « Grotte » dans la liste des biomes du panneau (H) ; chaque
  salle de combat part alors de sa grotte (run au Rocailleux).
- Fiche de recrutement (`src/ui/recruitscreen.ts`), surnoms (`Save.names`),
  un seul prisonnier par grotte, dans une cellule fermée d'une grille (niche
  de 3 × 2 cases, `cell` de `CaveLayout`, `CAVE.bars`) qui se relève quand
  le gardien tombe ; libéré, le prisonnier est débloqué (1.7) et entre dans
  l'équipe chez Porygon, qui sait aussi le renommer. On tire de préférence
  une espèce pas encore débloquée. Toute la faune
  importe désormais les planches de combat (Attack / Shoot / Charge) en plus
  des poses de sauvage : chaque sauvage est jouable.
- Ni le tileset ni Essentials n'ont de barreaux de prison : la grille est la
  palissade à claire-voie du tileset. Un vrai sprite de herse ou de cage
  serait mieux, s'il s'en trouve un.
- Le Pokémon fort du sbire (1.6 bis) ne se recrute pas et ne débloque pas
  son espèce : il repart avec lui. Seul le prisonnier se recrute.
- Reste : pas encore de vrais sprites `CAVE_ELITE`
  (le jeu n'en a pas les planches) : l'escorte vient de la faune du biome.

### 1.6 bis Sbire des grottes et captures (fait)
- Le gardien sauvage laisse la place à un **sbire** dresseur
  (`src/data/grunts.ts`) : équipe par biome (`BIOME_GRUNTS`), métier et
  planche Essentials par type (`GRUNT_THEMES`, Characters + portrait de
  Trainers, copiés par `import-assets`), Pokémon fort tiré de sa liste
  (planches PMD importées). Il parle à l'approche (`CaveHost.challenge`,
  `GRUNT_INTROS`), envoie gardien et escorte d'un jet de Ball, s'enfuit par la
  bouche quand son équipe tombe (`Trainer.fleeTo`, `Trainer.aim`).
- **Captures** (`src/run/capture.ts`, `CaptureThreat`) : une Ball toutes les
  3 à 4 s sur le Pokémon joué (visée de 0,45 s, vol en cloche, anneau au
  sol) ; esquivée au dash ou sous Abri. Touché : `Actor.trapped` (ni coups,
  ni ciblage, ni Tab), QTE ← → (jauge `.capture-qte`) qui se vide plus vite à
  bas PV. Refermée : notification « Capturé ! », le membre quitte l'équipe
  (`CaveHost.capture`) ; rendu au sbire vaincu (`CaveHost.release`), perdu
  pour la run si l'on fuit. Le dernier debout capturé : défaite.
- Grotte agrandie à 54 × 36 (arène 12 × 7), pour avoir la place d'esquiver.
- **Mode Nuzlocke** (fait : Échap → Réglages, `Options.nuzlocke`, `nuzlockeToll`
  de main.ts) : en fin de run, un Pokémon encore K.O. ou resté capturé est
  relâché pour de bon (jamais le dernier de l'équipe). Reste : d'autres sbires (Team Aqua, Magma…) si le
  dépôt en a les planches ; un sbire qui change de place en lançant ; des
  répliques de défaite.

### 1.7 Débloquer des Pokémon, Pokédex (fait)
- **Starter** au premier lancement (`src/ui/starterscreen.ts`), parmi les
  neuf de `GameManager.STARTER_IDS` (`STARTER_IDS`, `src/data/species.ts`,
  importés avec leurs poses du Repaire) : seul lui est débloqué. Une
  sauvegarde d'avant (version 1) garde les huit jouables, ses libérés et son
  équipe (`migrate`, `src/meta/save.ts`).
- **Déblocage** (`Save.unlocked`, `defeats`, `seen` ; `recordDefeat`,
  `unlock`) : 20 victoires contre une espèce de base, toutes mains
  confondues (`Combat.defeated`, branché dans `main.ts`), le gardien de
  grotte vaincu, le prisonnier libéré. Toast « ★ X rejoint la rébellion ! ».
  Une forme évoluée compte ses victoires mais ne se débloque jamais
  (`isBaseForm`, via `preEvolutionOf` de `data/evolutions.ts`).
- **Pokédex** : second onglet du poste de Porygon (`renderDex`,
  `campscreen.ts`), filtres Débloqués / À débloquer / Rencontrés / Tous,
  silhouettes d'encre, « x / 20 » et la fiche de ce qu'il manque. Écart
  voulu : une espèce est « rencontrée » dès qu'elle apparaît, pas à sa
  première défaite.
- Les débloqués peuplent le Repaire (les seize derniers, hors équipe).
- Pour tester : panneau (H) → « Tout remettre à zéro » au Repaire.
- Reste : le recrutement en fin de combat du jeu (`RecruitScreen.gd`) et le
  déblocage par les boss de champion ne sont pas repris ; le panneau compose
  toujours l'équipe sans tenir compte du déblocage (outil de test).

### 1.8 Météo (fait)
- `src/world/weather.ts` : temps clair, Pluie, Soleil ardent, Tempête de
  sable, Grêle, Brouillard, tirés à chaque salle de combat selon le biome
  (`rollWeather`, table `ODDS`, déterministe sur la graine de la salle).
  Jamais à la boutique ni en grotte ou au Repaire.
- Effets façon Pokémon : Pluie Eau ×1,5 / Feu ×0,5, Soleil l'inverse
  (`setWeather` + `calculateDamage`, les deux camps) ; Sable et Grêle usent
  de 3 % des PV max toutes les 3 s ceux qui n'y résistent pas
  (`Combat.weatherTick`). Écart voulu : l'usure s'arrête à 1 PV.
  Brouillard : un voile, rien d'autre.
- Rendu : seconde instance de `Particles` (rideau de pluie, flocons, grains
  de sable), teinte et lumière dans l'étalonnage du `Renderer`, voile du
  brouillard. Notification en entrant dans une salle dont le ciel change ;
  l'étiquette de zone dit « Biome · Pluie ».
- Panneau (H) → « Météo » : la forcer partout.
- Danse Pluie, Zénith, Tempête de Sable et Grêle changent le temps de la
  salle jusqu'à l'éclaircie (`weather` dans `EFFECTS`, `Combat.weatherMove`) ;
  Danse Pluie et Zénith chez le tuteur (150). Reste : des talents.

### 1.9 Salles spéciales (fait)
- Une porte sur plusieurs peut mener à une salle spéciale (`Run.offers`,
  35 %, 2 par acte au plus, jamais deux pareilles de suite, jamais vers la
  boutique ou le boss, ni en ouvrant un acte) ; son étiquette dit laquelle.
- **Défi** ⏱ : les vagues sous chrono (30 s + 10 s par vague, puce du HUD) ;
  réussi, ₽ ×3 et un don garanti ; raté, les sauvages s'enfuient et la
  récompense est perdue.
- **Piège** ⚠ : la récompense attend au centre, portes closes ; en
  approchant, trois vagues serrées à +3 niveaux. ₽ ×2.
- **Marchand ambulant** ¤ (`src/run/merchant.ts`) : Miaouss, sans ennemis,
  portes ouvertes ; un Pari (la moitié de ses ₽, pile ou face) et un Échange
  (un tiers des PV de l'équipe, sans K.O., contre un don de légendaire).
- Panneau (H) → « Salle spéciale » : Défi, Piège, Marchand (2ᵉ salle de
  l'acte choisi).
- **Source** ✚ (`run/spring.ts`, ajout) : sans ennemis, un bassin veillé par
  Leveinard ; [E] une fois : chaque membre regagne 60 % de ses PV et perd son
  statut, un K.O. se relève. Proposée par les portes comme Défi et Piège.
- Reste : d'autres salles (autel à dons maudits…), un Marchand qui
  vend aussi des objets.

### 1.10 Son (fait)
- `src/audio/sounds.ts` (catalogue, repris de `Sfx.gd`) et `audio.ts`
  (Web Audio : bus musique / bruitages, fondu entre musiques, anti-rafale
  par son, hauteur un peu aléatoire). Volumes et M (couper) au menu des
  réglages (Échap, `src/ui/settingsmenu.ts` : Son, Affichage, Commandes)
  et au panneau.
- Fichiers copiés par `import-assets.ts` dans `public/game/audio`.
- Bruitages refaits sur Essentials (écart voulu, voir README) : sons
  d'attaque par capacité ou par type (`SE/Anim`, joués par
  `CombatFx.attackAnim`), dégâts selon l'efficacité, cris des Pokémon
  (`SE/Cries` → `audio/cries/<n°>.ogg`), statuts, portes, CS, jingles.
  `SoundDef.gap` espace les sons longs (les dégâts d'Essentials durent plus
  d'une seconde).
- Reste :
  - Safari ne lit peut-être pas l'Ogg (convertir en m4a si besoin) ;
  - une musique par biome ;
  - des cris pour les générations 6 et plus (absents d'Essentials) ;
  - étendre `MOVE_SOUNDS` aux capacités qui tombent encore sur le son de
    leur type ;
  - régler les volumes à l'oreille en jeu.

### 1.11 Bilan de fin de run (fait)
- `src/meta/runstats.ts` compte en run (dégâts par membre, K.O., Baies,
  Éclats, champions, durée) ; `src/ui/runsummary.ts` l'affiche quand le
  voile de fin tombe, Entrée rentre au Repaire.
- Records par sauvegarde (`Save.records` : salle la plus lointaine, K.O.,
  victoire la plus rapide) au bilan, « Record ! » sur ceux battus. Une run
  abandonnée par le menu (Échap → Abandonner) a son bilan ; seuls les
  raccourcis de test (N, panneau) n'en montrent pas.
- Menu des réglages : reste à pouvoir réassigner les touches, et une
  entrée « Abandonner la run » / « Retour au Repaire ».

### 1.12 Formes des salles (fait)
- `src/world/layouts.ts` décrit huit formes (Clairière, Arène, Couloir,
  Ligne de front, Deux clairières, Carrefour, Boucle, Lacets). Chacune a plusieurs tailles, une
  silhouette faite d'ellipses et de capsules, et des chemins qui suivent son
  squelette.
- Chaque biome tire dans sa liste pondérée (`POOLS`). `generate()` mesure
  la lisière dans la forme. Le cœur des boucles devient de l'eau (Lac,
  Marais, Volcan) ou reste hors zone (bosquet, montagne).
- Ligne de front : `WorldMap.front` donne les deux bouts du couloir.
  `RoomDirector.spawnPoint` y fait surgir chaque vague, au bout le plus
  éloigné du joueur, et les vagues sont regroupées (une de moins). Vérifié
  sur 280 cartes de cette forme.
- Ligne de front selon le biome (`build` reçoit le biome) :
  - Forêt : un sentier étroit (couloir de rayon 5,5 au lieu de 8,5, petites
    places), qui ondule un peu plus ;
  - Prairie : des champs. `Shape.fields` fait couvrir l'intérieur d'herbe
    haute (étape 6 de `generate`), sauf le chemin et une case de bas-côté, la
    place d'entrée (7 cases) et quelques trouées. Environ la moitié des cases
    jouables.
  - Poids montés à 3 dans ces deux biomes : une salle sur quatre (mesuré sur
    200 graines chacun).
- Annonce des vagues (`RoomDirector.announce`) : grondement (`quake`),
  secousse (`RoomHost.rumble`), flèche HTML `.room-incoming` au-dessus du
  bout du couloir ou plaquée au bord de l'écran. Ni texte ni notification,
  à la demande du joueur. Les anneaux attendent 1,3 s (`FRONT_WARN`). Pas de
  couverts : écartés par le joueur.
- Cartes réduites d'environ 20 % par côté (le joueur les trouvait trop
  grandes, les couloirs trop longs). Ligne de front et Couloir passent de
  ~90 à 60-66 cases de long, à largeur égale ; Clairière 46-58 × 30-38 ;
  le littoral 52-66 × 32-36. Le Village garde 64 × 40 (ses rues sont tracées
  pour elle). Lacets : le rayon des bandes suit la hauteur, sinon elles se
  touchent.
- Panneau : « Forme des salles » impose une forme (relance la run).
- Vérifié hors navigateur sur 1 750 cartes (10 biomes × 7 formes et tirage
  libre × 25 graines) : une sortie au moins, et la zone jouable atteignable.
- Reste :
  - juger les formes en jeu et ajuster les poids des listes ;
  - régler les vagues selon la taille (une Arène 38 × 30 reçoit autant
    d'ennemis qu'une Clairière 58 × 38) ;
  - d'autres formes : une île au Lac, des terrasses au Rocailleux ;
  - Ligne de front : juger en jeu le préavis (1,3 s), la largeur du sentier
    de Forêt et la densité des champs de Prairie (sauvages cachés : trop
    durs ?).

### 1.13 Montagne glacée (fait)
- Ajout (retour de test : « un biome glace montagne… un sol de glace où tu
  glisses ») : biome `glace`, troisième porte après l'Automne et le Lac, en
  dernière étape comme Marais, Rocailleux et Volcan.
- Décor : neige (`GROUND.snow`), falaises et plateaux enneigés
  (`BLOB.cliffSnow`), gravier (`BLOB.gravel`), arbres coiffés de neige
  (`SpriteDef.cap`, calotte dessinée par-dessus l'arbre vert), rochers
  enneigés et pâles, cristaux qui luisent, entrée de grotte enneigée.
- Glace : peinte au chargement (`paintIce`, `atlas.ts`) dans des cases vides
  du tileset, qui n'en a pas ; pas d'arbre dessus, pas d'empreintes.
- Glissade (`Actor.onIce`, `updatePlayer`) : le Pokémon joué seulement ;
  file à 11 cases/s selon l'axe dominant du pas, s'arrête contre un obstacle,
  hors de la glace ou sur le gravier ; dash permis. Vérifié hors navigateur.
- Faune (26 espèces de glace et de roche), Rangers (`grunts.ts`, thème
  `ice`), championne Olga (Lorelei : Lamantine, Lippoutou), grêle ou brouillard
  souvent, Glace Éternelle (recette Lentille Zoom), fiche « La glace ».
- Reste : juger en jeu la glissade (vitesse, mares assez grandes ?) et
  l'allure du biome ; des énigmes de glace (rochers à atteindre en glissant).

---

## 2. Au Repaire

### 2.1 Feu de camp (fait)
- La flamme n'est plus posée sur une bûche couchée : le tileset n'a pas de
  foyer, elle est entourée de huit cailloux gris (`CAMP_PROPS.hearth`).
- Au sud du feu, un Pokémon sans pose assise (Dracaufeu, Ronflex, Onix…)
  dort couché sur son rondin (`Actor.perch` : le sprite monte de la hauteur
  du rondin) au lieu de rester planté devant.
- Un Pokémon couché (rondin ou paillasse du dortoir) n'a plus d'ombre ronde
  au sol (`renderer.ts`).
- À vérifier en jeu : la hauteur du rondin (`LOG_TOP`, 7 px) selon les
  planches.

### 2.2 Rebords (fait)
La berge du lac avait des anses d'une case de large que le jeu blob ne sait
pas border (la lèvre de terre s'y cassait) : le lac du Repaire passe
maintenant par `cleanThin`, comme les mares des runs, et le plancher du
ponton, rogné dans l'eau, ne laisse plus d'anse fine à côté de lui. Relevé
sur un rendu hors ligne de la carte (sans et avec tous les aménagements) :
chemins, place, clairière défrichée et îlot n'avaient pas de raccord cassé.
Si d'autres se voient en jeu, noter leur emplacement.

### 2.3 Le bâtisseur (fait)
- **Charpenti** remplace Ossatueur, et évolue avec le camp (`builderId`) :
  Ouvrifier à 3 bâtiments, Bétochef à 6 (planches PMD Idle et Walk vérifiées).
  Écart voulu : Godot gardait Ossatueur.
- Son chantier devient un **atelier** de bois sur pilotis (tileset), rondins
  et souche autour, au sud-ouest de la clairière.
- Trois aménagements (`BUILDINGS`, champ `needs`) : le **Défrichage** ouvre
  une clairière à l'ouest de la place (`CAMP_GLADE`, option `glade` de
  `generate`), reliée par une allée, avec des souches et deux visiteurs
  sauvages ; le **Champ de cultures** (+1 Nourriture par salle nettoyée,
  `FIELD_FOOD`, deux libérés au travail) et les **Maisons** (deux maisons,
  deux paillasses, 26 libérés au camp au lieu de 16, trois visiteurs de plus)
  s'y bâtissent ensuite. Écart voulu : le camp grandit sur la forêt, pas de
  zone séparée.
- Reste : d'autres aménagements dans la clairière (le terrain est encore
  libre au nord-est), des visiteurs propres à chaque zone, des récoltes plus
  variées.

### 2.3 bis Agrandir le camp (fait)
- Quatre aménagements de plus (`BUILDINGS`) : **Jardins fleuris** (massifs,
  bacs, deux bancs où s'assoient des libérés), **Lampadaires** (le long des
  allées, posés en cherchant leur bord ; deux libérés dessous), **Défrichage
  de l'est** (`CAMP_EAST_GLADE`, option `eastGlade` de `generate`, allée
  partie du sud-est de la place pour ne pas passer sous la hutte) et
  **Hameau** (grande chaumière, cottage, puits, deux paillasses).
- Les visiteurs sauvages du Défrichage et des Maisons sont retirés : seuls les
  libérés vivent au Repaire. Leur nombre : 16 + la place de chaque
  aménagement (`DWELLERS_PER` : Maisons 10, Hameau 12, Jardins 2,
  Lampadaires 2) ; les flâneurs se partagent la place et les clairières.
- Réplique du bâtisseur selon l'avancée (ouest, puis est, puis hameau).
- Reste : une activité aux libérés du bourg (puits, lessive…). (Lampadaires et
  hameau revus après le test : voir 2.3 ter.)

### 2.3 ter Retours de test du Repaire (fait)
- Rondins du feu : tous les libérés y dorment (avant : assis, endormis ou
  debout selon le rondin et la planche).
- Lampadaires : moins nombreux (`LAMP_GAP` 7), éteints (`LAMP_OFF`), jamais à
  moins de 3 cases d'un gardien (l'un cachait M. Mime).
- Roucarnage et sa boîte aux lettres (plus un panneau et des pots) à côté de
  Dracolosse ; Kangourex et sa stèle à l'ancienne place du relais ; le puits
  du relais retiré (celui du bourg reste) ; le tournesol entre l'atelier et
  le savant déplacé près de l'étude ; les rondins et la souche de l'atelier
  retirés.
- Le Hameau devient le **Bourg** : place pavée, puits au centre, allée de
  briques, panneau, bacs et pots ; plus de paillasses.
- Bâtisseur : chantiers cachés tant que leur prérequis n'a pas une run
  d'ancienneté (`Save.builtAt`), carte « D'autres idées… » en attendant, le
  bâti en bas.
- Missions : récompenses en icônes, carte « Lancer une mission » à la place de
  « Place libre », tampons et « Rappeler » sous le texte (ils le
  recouvraient).
- Repères « ! » au-dessus des gardiens (`meta/news.ts`, `Save.newsSeen`).
- Rappels : une réserve commune à l'équipe (Ceinture : 3 niveaux).
- Menu des réglages : plus de taille des Pokémon, d'ombres, d'arbres
  translucides ni de couleurs par biome (forcés à leur valeur prévue).
- Reste : voir la deuxième passe ci-dessous.

### 2.3 quater Retours de test du Repaire, deuxième passe (fait)
- « ! » des gardiens : flottant, dessiné au pixel (avant : une barre noire).
  Le même « ! » dans les menus, sur ce qui est neuf.
- Fiche d'un débloqué : d'où il vient (`Save.origins` : biome, grotte, quête,
  partenaire) ; Pokédex : biomes et grottes d'un Pokémon croisé.
- Super Bonbon : se retire (`Save.candied`), il revient en réserve.
- Bourg : piliers d'entrée et panneau, rue de briques qui ondule (seuil gris
  au raccord du chemin de terre, briques beiges, puis la place à chevrons),
  herbes hautes et souches retirées autour, hortensias, banc.
- Kangourex : une buvette (auvent, comptoir et boissons, tonneaux,
  tabourets, une table) avec deux tableaux de quêtes dans son dos ; la stèle
  est partie (on la prenait pour un pylône).
- Roucarnage : contre sa boîte aux lettres, avec hortensias, banc et pots.
- Champ de tournesols (`TOWN_DECOR.sunflowerField`, herbe qui ondule et se
  couche) au sud du champ de cultures.
- Alakazam garde améliorations et CS ; les objets tenus et le Super Bonbon
  passent à **Miaouss** (52, `CAMP_NPCS.items`), au troisième étal du marché.
- Réglages : deux onglets (Réglages, Commandes) ; zoom, particules, halos et
  vignette au seul panneau de test.
- À vérifier en jeu : le vent sur les tournesols, les icônes des étals et de
  la buvette, la portée des postes déplacés (Kangourex, Roucarnage, Miaouss).
- Reste : Leçons de Bouldeneu plus courtes (pas prioritaire) ; poids des
  améliorations (à voir) ; potager et artisanat (fait, voir 2.8).

### 2.4 Terrain d'entraînement et missions (fait)
- **Démolosse**, le pisteur, au camp dès le départ (à l'est, sous le terrain
  d'entraînement), mène les **missions** (`src/meta/missions.ts`, écran
  `renderMissions` dans `campscreen.ts`) : les six expéditions de Godot
  (bois, pierre, vivres), plus une Récolte de baies et l'**Entraînement**
  (+2 niveaux de départ, une fois le terrain bâti, plafond du Super Bonbon).
- Comme Godot (`ExpeditionManager.gd`) : une mission avance à chaque salle
  nettoyée en run, ne rate jamais, se récolte au retour ; « Rappeler » rentre
  sans rien. Deux places, trois avec le Dortoir. Le Pokémon parti quitte le
  camp et l'équipe ; Porygon le montre grisé.
- Reste : d'autres places ou missions à débloquer avec de futurs aménagements
  (Godot : Grange, Palissade, Carrière du sanctuaire).

### 2.5 Quêtes de Kangourex (fait)
- **Kangourex**, la doyenne, au camp dès le départ, à l'est entre la hutte
  et le relais, devant une stèle du tileset (station `quests`).
- Dix quêtes (`src/meta/quests.ts`) : 50 K.O., 60 Baies ramassées, 5 salles
  sans encaisser un coup, 3 Défis, 3 Pièges, 30 K.O. sous la pluie, l'acte 3,
  20 K.O. dans le sable ou la grêle, 5 champions, une run gagnée. Trois
  actives au plus ; seule compte la progression après l'acceptation.
- Récompenses (`QUEST_REWARDS`, `species.ts`) : Togepi, Tropius, Ptiravi,
  Élekid, Ténéfix, Tarpaud, Goinfrex, Hippopotas, et deux légendaires,
  Raikou et Mewtwo — des espèces qu'on ne croise nulle part ailleurs.
  Réclamer débloque le Pokémon ; le Pokédex dit quelle quête le promet.
- Événements (`questEvent`) branchés dans `main.ts` : K.O., Baies des
  arbres, salle libérée (drapeau `Combat.hurt`), salle spéciale, champion,
  acte, victoire. Notification « Quête accomplie » en run.
- **Contrats** (ajout) : trois petits objectifs de run toujours renouvelés
  (K.O. d'un type, K.O., Baies, salles sans coup, Défi, champion), payés en
  Baies, ressources ou Éclat (`Save.contracts`, `contractEvent`, sous les
  quêtes chez Kangourex). Reste : des récompenses en objets.

### 2.6 Poids d'équipe (fait)
- `src/meta/weight.ts` : Pokémon 3 / 5 / 8 selon le stade de départ,
  légendaire 10, objet tenu 2, attaque 0 à 3 selon la puissance.
- Plafond 24 → 40 (+4 par palier), amélioration `weight` (Bracelet de
  charge) payée en Éclats de Champion (`save.shards`, 2 / 4 / 7 / 12) ;
  champion : 1 + acte Éclats, +3 au Dresseur final.
- Affiché à l'équipe (jauge, poids de chacun, détail dans la fiche, ⚖ des
  grosses attaques) et au départ ; « Partir » bloqué au-delà du plafond
  (`CampScreen.depart`). Le panneau de test compose sans limite.
- Reste : à équilibrer en jeu (plafond, poids des CT) ; Rappels et bourse
  pesants comme dans Godot, si on veut en faire des choix de build.

### 2.7 Leçons de Bouldeneu (fait)
- Bouldeneu (465), le savant, au camp dès le départ, au sud du feu avec un
  tableau et un tonneau (`camp.ts`, poste `lore`) ; dialogue d'accueil au
  premier passage.
- Écran « Leçons » (`CampScreen.renderLore`) : un onglet par chapitre, une
  fiche par notion (`src/data/lore.ts`) ; le chapitre Types se construit
  depuis `TYPE_CHART` (forces, faiblesses, immunités par type).
- Reste : relire les textes en jeu ; tenir les fiches à jour quand un
  chiffre change (rien ne les relie au code) ; une fiche Météo plus
  illustrée, des icônes d'états.

### 2.8 Potager, atelier et nectars (fait)
- Ajout (retour de test), `src/meta/crafting.ts` : matériaux de biome dans
  les coffres (un par biome) et sachets de graines (icônes des Paillis :
  pas des Baies, qui sont la monnaie).
- Potager d'Héliatronc (192) au Champ de cultures : 3 parcelles, poussent
  d'un cran par salle franchie, donnent des herbes.
- Atelier de Queulorior (235, bâtiment `atelier`, après le Champ) sur la rive
  du lac (à l'est du ponton depuis 2.9) : 13 recettes, objets tenus `crafted` et 4 nectars. Écart :
  Queulorior plutôt que Tritonde, un artisan qui peint de sa queue.
- Nectar sur la coupelle : en 5 salles, un Pokémon de base non débloqué,
  d'un type qu'il aime, vient attendre ; on lui parle, il reste.
- Repères « ! » : récolte mûre, recette à portée, visiteur arrivé.
- Reste : vérifier en jeu (bâtir, semer, récolter, façonner, poser un
  nectar, accueillir le visiteur) ; équilibrer les quantités ; d'autres
  recettes (baies de combat, CT ?).

### 2.9 Retours de test du potager, de l'atelier et des allées (fait)
- Potager : trois bacs de bois dessinés à la main (`drawBed`), séparés ; un
  piquet à l'image de la plante, des pousses par stade (semis, pousse,
  feuilles, touffe, fleur), un cran par salle sur le devant.
- Atelier : déplacé à l'est du ponton, dans une clairière à lui
  (`CAMP_ATELIER_GLADE`, ouverte par `generate` quand il est bâti), avec une
  allée de galets depuis le chemin de l'est.
- Coupelle à nectar : socle de pierre et vasque dessinés (`drawLure`),
  visibles même vides ; le nectar y prend sa couleur.
- Allées vers les bâtiments, sols variés, bord d'herbe doux (`WorldMap.lanes`).
- Écran de l'atelier : matériaux en casiers, compte en gros, ceux qui
  manquent grisés avec leur biome.
- Glissade sur la glace : pose accroupie qui tangue, traces de patin,
  éclats de glace.
- Reste : vérifier en jeu le tracé des allées (le dortoir, en briques
  beiges, n'a pas été vu en rendu hors ligne) et la lisibilité des bacs.

---

## 3. Déjà notés, toujours en attente

- **Jeu en ligne** (src/net/, voir README) : lobby, visite du Repaire de
  l'hôte, run partagée, salle rejouée chez l'invité et butin partagé en
  place. Reste : l'invité ne prend ni les dons ni les portes, n'achète pas à
  la boutique, n'a pas d'ultime (seul l'hôte choisit) ; un coffre ouvert et
  un obstacle coupé restent dessinés intacts chez l'invité (décor « cuit »
  dans la carte) ; pas de reconnexion en cours de run ; à tester entre deux
  machines (NAT strict : il faudrait un serveur TURN).
- **Revente** à la boutique de run (il faut d'abord un inventaire en run).
- **Solde des mercenaires** à la boutique suivante (le jeu la réclamait).
- **Surf en run** : au Repaire, on ne nage qu'avec Surf ; en run, on nage
  toujours (certaines cartes risqueraient de bloquer leurs sorties
  autrement). Le graphe de biomes (1.2) ne laisse entrer à l'Océan qu'avec
  Surf ; ailleurs, le Lac et la Plage se nagent encore sans. À trancher.
- Le graphe de biomes est un premier jet (`BIOME_LINKS`) : à rééquilibrer
  au fil des tests, et d'autres CS pourront y garder des branches (Coupe,
  Éclate-Roc). Les champions du Lac, de la Plage et de l'Océan sont tous
  Ondine : on la croise une fois, ensuite un autre champion la remplace.
- Les objets tenus n'ont pas été vraiment testés en partie par le joueur.
