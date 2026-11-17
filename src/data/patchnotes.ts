// Notes de version, montrées dans le menu (onglet « Nouveautés » des réglages,
// et « Nouveautés » au menu principal, marqué « Nouveau ! » tant que la
// dernière n'a pas été lue). La plus récente d'abord ; on en ajoute une en
// tête à chaque mise en ligne.

export interface PatchSection {
  title: string;
  items: string[];
}

export interface PatchNote {
  /** Identifiant unique (sert à savoir si le joueur l'a lue). */
  id: string;
  date: string;
  title: string;
  sections: PatchSection[];
}

export const PATCH_NOTES: readonly PatchNote[] = [
  {
    id: '2026-11-17',
    date: '17 novembre 2026',
    title: 'Champions plus épiques et nouveaux talents',
    sections: [
      {
        title: 'Champions',
        items: [
          'L’as change de phase à chaque barre : son dresseur l’encourage, il appelle des sbires de son type, méga-évolue, puis enrage à la dernière barre.',
          'Plus ton équipe est grande, plus il est coriace (PV, attaque, et une barre de plus à ses Pokémon dès quatre membres).',
          'Le champion se tient sur un rocher au bord de son arène ; vaincu, il lâche une phrase et disparaît. Sa réplique d’entrée ne se coupe plus.',
          'L’as prend parfois le centre de l’arène et frappe tout autour, selon son type : ondes de choc, croix de rayons, cônes, anneaux de feu, pluie d’éclairs…',
          'Chaque as a quatre attaques choisies pour son champion (Séisme et Lame de Roc pour l’Onix de Pierre, Surf et Psyko pour le Staross d’Ondine…). Ses figures les reprennent, nom et type compris, plus larges si elles sont puissantes. Il bondit aussi sur le Pokémon le plus éloigné, et à sa dernière barre lance sa plus forte attaque sur toute l’arène, sauf trois zones sûres cerclées de vert.',
          'Les Pokémon d’un champion ne nagent plus : au Lac, ils ne partent plus au large.',
          'Ils ne reculent plus pour tirer et attaquent plus souvent.',
          'Le champion te suit du regard sur son rocher et bondit quand il envoie un Pokémon ; chaque Pokémon ennemi arrive avec l’animation de son type.',
          'Une Poké Ball gravée dans le sol de l’arène marque son centre : ses Pokémon y sortent. À la victoire, les Éclats de Champion y flottent, puis filent vers toi.',
          'L’as riposte quand on le frappe pendant ses figures ; elles sont plus nombreuses, plus écartées et plus rapprochées dans le temps.',
          'L’arène de la Prairie n’a plus d’eau : un enclos de bois, de la paille, des petits champs, des tournesols. Celle du Lac a ses nénuphars et ses roseaux.',
        ],
      },
      {
        title: 'Combat',
        items: [
          'Talent Lévitation (Fantominus, Smogo, Séléroc, Motisma…) : les attaques Sol ne le touchent pas.',
          'Talents de contact : frapper au corps à corps un Pokémon à Statik, Corps Ardent ou Point Poison risque la paralysie, la brûlure ou le poison (3 fois sur 10). Dans les deux camps.',
          'Absorb Eau et Absorb Volt soignent au lieu de blesser ; Torche avale le Feu et renforce les attaques Feu.',
          'Engrais, Brasier, Torrent : les starters frappent 50 % plus fort de leur type sous un tiers de leurs PV.',
        ],
      },
    ],
  },
  {
    id: '2026-11-16-b',
    date: '16 novembre 2026',
    title: 'Retours de test : biomes plus longs, salles calmes refaites, échanges',
    sections: [
      {
        title: 'Run',
        items: [
          'Chaque biome compte 9 salles (7 combats ou salles spéciales, la boutique, le champion), et jusqu’à 3 salles spéciales.',
          'Un champion vaincu cède d’abord son Pokémon le plus faible ; plus tu le bats, plus tu te rapproches de son as.',
          'Pension : parle à Écrémeuh pour échanger un membre de l’équipe contre un Pokémon du Repaire.',
          'Source, Autel, Dojo, Pension : une petite salle ronde à elles, chacune son ambiance (nuit, crépuscule, couchant, matin), sans météo ; de grands décors du tileset et d’Essentials (étang, autel aux gargouilles, dojo au toit rouge, grand enclos où l’on entre).',
          'Leurs gardiens et les Pokémon de la boutique bougent et se tournent vers toi.',
          'Des habitants s’y promènent (fées, apprentis, spectres, pensionnaires) : parle-leur ; certains te confient un service, à rendre puis à faire payer en les retrouvant.',
          'Les services montrent leurs récompenses (icônes, effet des objets) ; ceux en cours sont dans la fiche de l’équipe (C).',
          'Pension : Écrémeuh propose son menu (entraîner ou échanger), et tu répartis toi-même les niveaux, plus nombreux à chaque acte ; d’autres s’achètent en ₽.',
          'Source : parle à Leveinard pour boire ; une Rosée Âme flotte au-dessus de l’étang.',
          'Défi : l’objectif s’annonce (« 12 sauvages en 70 s ») et le chrono compte les vaincus.',
          'Boutique : un lot de Bois, de Pierre ou de Nourriture à la place de l’objet tenu.',
        ],
      },
      {
        title: 'Combat',
        items: ['Intimidation se voit : le Pokémon fait son geste, avec l’animation de Rugissement.', 'Le talent d’un Pokémon est écrit sur sa fiche (C), à l’équipe et au Pokédex.', 'Les attaques Combat (Balayage…) n’affichent plus de boules de feu à l’impact.'],
      },
      {
        title: 'Confort',
        items: ['Le ruban des notifications ne cache plus leur titre.', 'Les leçons de Bouldeneu sont plus courtes.', 'Repaire : les tipis du Dortoir ne cachent plus le plan du monde.'],
      },
    ],
  },
  {
    id: '2026-11-16',
    date: '16 novembre 2026',
    title: 'Intimidation',
    sections: [
      {
        title: 'Combat',
        items: ['Talent Intimidation (Arcanin, Léviator, Luxray, Baggiguane…) : les adversaires qui s’approchent perdent un quart de leur Attaque pendant 10 s. Ça marche dans les deux sens.'],
      },
    ],
  },
  {
    id: '2026-11-15',
    date: '15 novembre 2026',
    title: 'La Carrière et les talents météo',
    sections: [
      {
        title: 'Combat',
        items: ['Talents météo : Tarpaud, Chartor, Tyranocif, Blizzaroi… changent le temps de la salle en y entrant (Crachin, Sécheresse, Sable Volant, Alerte Neige), dans ton équipe comme en face.'],
      },
      {
        title: 'Repaire',
        items: ['Nouvel aménagement, après le terrain d’entraînement : la Carrière, au nord-est. Deux libérés y taillent la pierre : +1 Pierre par salle nettoyée.'],
      },
    ],
  },
  {
    id: '2026-11-14',
    date: '14 novembre 2026',
    title: 'La Pension, la vie au bourg et des sbires plus mobiles',
    sections: [
      {
        title: 'Run',
        items: [
          'Nouvelle salle : la Pension ❀, où Écrémeuh entraîne l’équipe : un niveau chacun, deux pour le plus faible.',
          'Les sbires des grottes changent souvent de place après un lancer de Poké Ball : on ne les coince plus.',
        ],
      },
      {
        title: 'Repaire',
        items: ['Au bourg, des libérés portent l’eau du puits à leur maison, et une lavandière frotte le linge sous sa corde à linge.'],
      },
    ],
  },
  {
    id: '2026-11-13-b',
    date: '13 novembre 2026',
    title: 'Des sbires mauvais perdants',
    sections: [
      {
        title: 'Run',
        items: ['Les sbires des grottes lâchent une réplique en s’enfuyant, vaincus (une autre s’ils rendent tes Pokémon).'],
      },
    ],
  },
  {
    id: '2026-11-13',
    date: '13 novembre 2026',
    title: 'Recrues de champion et contrats mieux payés',
    sections: [
      {
        title: 'Run',
        items: [
          'Un champion vaincu cède un Pokémon de son équipe (son as d’abord, sous sa forme de base) : il rejoint le Repaire, ou attend s’il est plein.',
          'Nouvelles formes de salle : au Lac, une île reliée à la rive par deux gués ; au Rocailleux, des terrasses qu’on gravit par des escaliers.',
          'Nouvelle salle : le Dojo ✊, où Machopeur t’apprend ou te renforce deux attaques, gratuitement.',
          'Boutique : un objet tenu par visite (Bandeau Muscle, Vive Griffe…), payé en ₽ et rangé dans la réserve du Repaire.',
        ],
      },
      {
        title: 'Repaire',
        items: ['Certains contrats de Kangourex paient aussi un Super Bonbon ou un objet tenu.', 'Les leçons de Bouldeneu racontent tout ce qui est nouveau : Méga-évolution, formes régionales, Source, Autel maudit, Nuzlocke…'],
      },
    ],
  },
  {
    id: '2026-11-12',
    date: '12 novembre 2026',
    title: 'Méga-évolutions, formes régionales et salles maudites',
    sections: [
      {
        title: 'Combat',
        items: [
          'Chaque attaque a son animation : rayons, sphères, salves, morsures, griffes, séismes…, et le son de sa famille.',
          'Les attaques évoluent : renforcée deux fois, Pistolet à O devient Hydrocanon (67 évolutions).',
          'Méga-évolutions : achète le Méga-Anneau chez Alakazam, puis F (ou MÉGA) une fois par salle. Choix X / Y pour Dracaufeu, Mewtwo…',
          'Les champions méga-évoluent leur as quand il perd une barre de PV.',
          'Danse Pluie, Zénith, Tempête de Sable et Grêle changent la météo de la salle.',
          'Les compagnons esquivent les attaques annoncées, restent près de toi et choisissent l’attaque la plus efficace.',
          'Les attaques spéciales peuvent secouer les arbres à baies.',
          'Dons rééquilibrés : les raretés pèsent moins, les dons faibles sont relevés.',
        ],
      },
      {
        title: 'Run',
        items: [
          'Formes régionales d’Alola, Galar, Hisui et Paldéa dans la nature, et leurs évolutions (Raichu d’Alola à la plage…).',
          'Nouvelle salle : la Source ✚, où Leveinard soigne toute l’équipe et relève les K.O.',
          'Nouvelle salle : l’Autel maudit ☠, un don plus rare contre une malédiction jusqu’à la fin de l’acte.',
          'Les champions alignent autant de Pokémon que ton équipe (moins un, plus l’acte).',
          'Le nombre de sauvages suit la taille de la salle.',
          'CS Force : pousse les gros rochers qui gardent des coffres.',
          'Boutique : un lot de Baies par étal, pour convertir tes ₽ ; les mercenaires réclament leur solde à la boutique suivante.',
          'Mode Nuzlocke (Réglages) : un Pokémon encore K.O. en fin de run est relâché pour de bon.',
          'Records de la sauvegarde au bilan de fin de run.',
        ],
      },
      {
        title: 'Repaire',
        items: [
          '8 places au départ, des Lits superposés à acheter au bâtisseur, des chantiers moins chers.',
          'Chaque salle libérée rapporte du Bois et de la Pierre, un champion bien plus.',
          'Contrats renouvelables chez Kangourex : trois tâches à la fois, payées en Baies, et remplacées une fois réclamées.',
        ],
      },
      {
        title: 'Confort',
        items: [
          'Touches réassignables : Échap → Commandes.',
          'Notifications refaites, les doublons s’empilent en « ×n ».',
          'Récompenses de Xatu : un petit tintement au lieu de la fanfare à chaque fois.',
          'Écran de nouvelle attaque : clique sur un Pokémon pour changer de destinataire.',
          'Jeu en ligne : les invités voient les effets d’attaque.',
          'Cette page de nouveautés.',
        ],
      },
    ],
  },
];

const SEEN = 'pokhades-patch-seen';

/** La dernière note n'a pas encore été ouverte dans ce navigateur. */
export function hasUnseenNotes(): boolean {
  try {
    return localStorage.getItem(SEEN) !== PATCH_NOTES[0]?.id;
  } catch {
    return false;
  }
}

export function markNotesSeen(): void {
  try {
    localStorage.setItem(SEEN, PATCH_NOTES[0]?.id ?? '');
  } catch {
    // Sans conséquence.
  }
}
