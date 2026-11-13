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
    id: '2026-11-13',
    date: '13 novembre 2026',
    title: 'Recrues de champion et contrats mieux payés',
    sections: [
      {
        title: 'Run',
        items: ['Un champion vaincu cède un Pokémon de son équipe (son as d’abord, sous sa forme de base) : il rejoint le Repaire, ou attend s’il est plein.'],
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
