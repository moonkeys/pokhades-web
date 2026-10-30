# Pokhades web — ce qu'il reste à faire

Note de reprise (30 octobre 2026), tirée d'un retour de test du joueur : à
lire avant de reprendre le prototype web. Elle liste ce qu'il veut voir
ensuite, où regarder dans le code, et ce que le jeu Godot (`../pokhades`)
fait déjà et qu'on peut porter. Les points sont groupés par zone, pas classés
par priorité : demander au joueur par où commencer.

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
  sessions travaillent en parallèle). Ne committer que sur demande. Le dépôt
  web n'a encore aucun commit.
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
- `src/combat/` : `combat.ts` (attaques, orbes, XP, K.O.), `enemy.ts` (IA des
  sauvages, archétypes), `companion.ts`, `pokemon.ts`, `moves.ts`, `boons.ts`.
- `src/world/` : `generate.ts` (cartes, dont le Repaire en `camp`),
  `biomes.ts`, `tiles.ts` (sprites relevés sur la planche).
- `src/ui/` : `hud.ts`, `runhud.ts`, `rewardscreen.ts`, `campscreen.ts`
  (écrans du Repaire), `da.css`.
- `src/meta/` : `save.ts` (progression permanente), `catalog.ts` (CT,
  améliorations, objets, CS, aménagements).

---

## 1. En run

### 1.1 Évolutions
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

### 1.2 HUD plus compact
- La carte du Pokémon joué et les quatre attaques (en bas) prennent trop de
  hauteur : les réduire (`src/ui/hud.ts`, `.hud*` dans `da.css`).
- Retirer de la carte les dons reçus (inutiles là).
- La liste de l'équipe (`.hud-team`, à gauche) doit être alignée en haut, et
  **cliquer sur un membre doit le faire jouer** tout de suite (comme Tab).
- Afficher quelque part (en haut ?) le nombre de Rappels qui restent
  (Ceinture de Rappels : `revives` dans `main.ts`).
- Bug à vérifier : au Repaire, la carte affichait « #25 » au lieu de
  « Pikachu », sans image (nom de secours de `Pokemon.load` quand la fiche ne
  se charge pas — peut-être un chargement pendant un `import-assets`).

### 1.3 Statistiques à la demande
Une touche pour afficher les statistiques de l'équipe (PV, ATT, DÉF, ATT.S,
DÉF.S, VIT, objet tenu, dons), en run comme au Repaire.

### 1.4 Icônes des récompenses des portes
Les portes de sortie annoncent leur récompense par un petit losange de
couleur (`src/run/room.ts`, `REWARD_LABEL` / `REWARD_COLOR` dans `run.ts`).
Remplacer par des icônes : une pièce ₽ pour le butin, une CT
(`machine_*.png` d'Essentials) pour une nouvelle attaque, et pour un don de
légendaire un **badge à la tête du légendaire** (illustrations dans
`public/game/artwork/`). Quelque chose de soigné, dans la DA.

### 1.5 Biomes de la run
- Une run commence toujours par la Prairie ; **chaque boss vaincu mène à un
  nouveau biome** (aujourd'hui : un biome par acte, `ACT_BIOMES` dans
  `src/run/run.ts`).
- Des biomes conditionnels : la Plage peut mener à l'**Océan si l'on a Surf** ;
  sans Surf, on peut quand même continuer sur une autre variante de Plage.
  Plage et Océan existent déjà (`biomes.ts`) mais ne sont pas dans la
  séquence de run. Généraliser : un graphe de biomes, avec des embranchements
  gardés par des CS.

### 1.6 Attaques spéciales : plus de projectile
Aujourd'hui une attaque spéciale lance un orbe qui voyage jusqu'à la cible
(`orbs`, `drawOrbs` dans `src/combat/combat.ts`). Le joueur trouve ça peu
immersif : l'attaque doit **frapper directement la cible** (Éclair tombe sur
le Pokémon visé, avec son animation d'attaque), précédée d'un **télégraphe**
(zone d'impact au sol, court délai) pour qu'on puisse l'esquiver — dans les
deux sens : nos attaques comme celles des sauvages.

### 1.7 Boss plus forts
Testés avec 4 Pokémon, ils tombent trop vite. Les renforcer (PV, dégâts) et
leur donner des **attaques de zone** télégraphiées (cercles, lignes, cônes)
plutôt que de simples tirs. Repères : `bossWaves` dans `run.ts`, bonus des
champions dans `attach` (`main.ts`), IA dans `enemy.ts`.

### 1.8 Arbres à baies
- Un arbre à baies par biome (une baie par biome) ; on le frappe pour faire
  tomber des baies, qu'on ramasse en passant dessus (les Baies sont la
  monnaie du Repaire).
- Amélioration à vendre chez Alakazam : un **aimant à baies** (les baies
  viennent à nous). Le jeu en vendait un (`BERRY_MAGNET_COST`, 300).
- Jeu Godot : `scripts/combat/BerryTree.gd`, `scripts/combat/BerryPickup.gd`.

### 1.9 Coffres et objets de run, CS sur le terrain
- Deux sortes d'objets : ceux qu'on équipe avant la run (déjà là) et ceux
  qu'on trouve et équipe **pendant** la run (à créer).
- On les trouve dans des **coffres**, gardés par des obstacles qu'on lève avec
  les CS : arbuste à couper (Coupe), rocher fissuré (Éclate-Roc), gros rocher
  à pousser (Force, peut-être plus tard). Les CS sont déjà en vente à l'étude
  (`CS_LIST` dans `src/meta/catalog.ts`, `ready: false` pour les trois) :
  leur donner un effet.
- Jeu Godot : `scripts/world/Chest.gd`, `GameManager.CS_CATALOG`.

### 1.10 Grottes
Des entrées de grotte, pas à chaque fois, dans les falaises et collines
(Volcan, Rocailleux, ailleurs au hasard). Dedans : des Pokémon à libérer (ils
rejoignent le camp), des mini-boss avec récompenses, des coffres.
- Jeu Godot : `_spawn_cave_portals` (`scripts/combat/CombatArena.gd:7423`),
  scène `scenes/world/CaveArena.tscn` ; le demi-boss d'une grotte débloque son
  espèce.

### 1.11 Débloquer des Pokémon, Pokédex
- Les huit Pokémon jouables sont tous disponibles : il faut un **système de
  déblocage**. Jeu Godot : 20 victoires contre une espèce de base la
  débloquent (`UNLOCK_DEFEAT_THRESHOLD`, `defeat_counts` dans
  `autoloads/GameManager.gd:855`), plus le recrutement, les boss et les
  grottes.
- Un **Pokédex** chez Porygon : tous les Pokémon rencontrés, combien de fois
  battus, et où en est leur déblocage (jeu Godot : `PokedexScreen.gd`, onglets
  Débloqués / À débloquer / Rencontrés / Tous).
- Les libérés débloqués doivent ensuite peupler le Repaire (cf. 2.6).

---

## 2. Au Repaire

### 2.1 Feu de camp
- La flamme (Essentials, `Animations/fire5`) plaît, mais elle est posée sur
  un rondin couché, ce qui fait bizarre : trouver une autre base (cercle de
  pierres, foyer, bûches dressées) dans le tileset.
- Les Pokémon autour du feu : ceux qui n'ont pas de pose assise (Dracaufeu,
  Ronflex, Onix) restent figés ; les faire **dormir sur les rondins** à la
  place.
- Les dormeurs gardent leur ombre au sol, ce qui fait étrange : voir s'il
  faut la retirer pour un Pokémon couché.

### 2.2 Ponton
On y monte par le côté, sans passer par l'échelle. Deux options : un ponton
sans échelle qui prolonge la terre, ou garder l'échelle et poser des
barrières sur les côtés. (`camp.ts`, bloc `jetty`.)

### 2.3 Nénuphars traversables
À la nage, les nénuphars bloquent : on doit pouvoir passer au travers, comme
de l'herbe (`lilies` dans `generate.ts`, qui bloque leurs cases). Au Repaire
comme en run.

### 2.4 Rebords
Quelques raccords de bordure sont mal faits au Repaire (rebords de la
clairière, de la berge) : à repérer et corriger.

### 2.5 Le bâtisseur
- Remplacer Ossatueur par un Pokémon bâtisseur, plus dans le thème (la lignée
  Charpenti / Ouvrifier / Bétochef par exemple ; vérifier ses planches PMD).
- Son chantier (des rondins et une souche) fait « éclaté » : lui donner une
  vraie bâtisse.
- Plus d'aménagements : **défricher la forêt** pour ouvrir une nouvelle zone
  (un champ de cultures, des maisons de Pokémon, d'autres paillasses, des
  Pokémon qui s'y promènent). Les zones aménagées font venir d'autres
  Pokémon.
- Le jeu Godot payait les bâtiments en bois, pierre et vivres
  (`autoloads/BaseManager.gd`) : à envisager avec les missions (2.6).

### 2.6 Terrain d'entraînement et missions
- Une fois bâti, on doit pouvoir **y envoyer des Pokémon s'entraîner** (gain à
  définir : niveaux de départ, XP…).
- **Missions** : envoyer des Pokémon chercher des Baies, ou des ressources
  (bois, pierre…) qui débloquent d'autres aménagements chez le bâtisseur.
  Jeu Godot : `autoloads/ExpeditionManager.gd` (une expédition avance au fil
  des salles franchies en run, le Pokémon parti n'est pas dans l'équipe).

---

## 3. Déjà notés, toujours en attente

- **Jeu en ligne** : l'écran de Roucarnage est là (héberger, rejoindre avec un
  code), le jeu en ligne non. Jeu Godot : `autoloads/Net.gd` (ENet, hôte
  autoritaire), `MultiplayerLobbyScreen.gd` (jusqu'à 6 joueurs, un Pokémon
  chacun).
- **Revente** à la boutique de run (il faut d'abord un inventaire en run).
- **Solde des mercenaires** à la boutique suivante (le jeu la réclamait).
- **Surf en run** : au Repaire, on ne nage qu'avec Surf ; en run, on nage
  toujours (certaines cartes risqueraient de bloquer leurs sorties
  autrement). À trancher avec le graphe de biomes (1.5).
- Les objets tenus n'ont pas été vraiment testés en partie par le joueur.
