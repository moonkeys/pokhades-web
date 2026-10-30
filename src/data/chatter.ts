// Ce que disent les Pokémon de la boutique. Chacun reçoit un caractère, et
// ses répliques en découlent ; {champion}, {zone} et {lead} (le Pokémon que
// l'on joue) sont remplacés à l'affichage. Tout tourne autour de la même
// histoire : des Pokémon sauvages qui refusent les Poké Balls, une Ligue qui
// veut les y remettre, et une rébellion dont on commence à parler.

export interface Persona {
  name: string;
  lines: readonly string[];
}

export const PERSONAS: readonly Persona[] = [
  {
    name: 'commère',
    lines: [
      'Tu as entendu ? {champion} ne dort plus depuis qu’on parle de toi.',
      'Il paraît qu’un Roucool a vu un Dresseur relâcher son Pokémon. Relâcher ! De lui-même !',
      'Ne le répète pas, mais le marchand fait crédit aux rebelles. Enfin… presque.',
      'Ici, tout le monde sait tout. Sauf la Ligue, et c’est très bien comme ça.',
    ],
  },
  {
    name: 'ronchon',
    lines: [
      'Encore un héros. On en a eu trois cette saison, ils ont tous fini en Poké Ball.',
      'Tu bloques le passage. Les révolutions, ça se fait sans marcher sur les pieds des gens.',
      'Hmpf. Prouve-moi que {champion} peut tomber, et on en reparlera.',
      'Les prix ont encore augmenté. Ça, c’est une injustice qui mérite une rébellion.',
    ],
  },
  {
    name: 'militant',
    lines: [
      'Pas de maître, pas de Ball ! Répète après moi : pas de maître, pas de Ball !',
      'Chaque champion qui tombe, c’est une région qui respire. Va, {lead} !',
      'J’ai peint « LIBÉREZ-LES » sur le mur de l’arène. Deux fois. Ils l’ont effacé trois fois.',
      'Quand tout ça sera fini, on fera une fête ici même. Tu seras l’invité d’honneur.',
    ],
  },
  {
    name: 'froussard',
    lines: [
      'Tu… tu vas vraiment affronter {champion} ? Moi je reste ici. Très loin. Derrière ce tonneau.',
      'Si quelqu’un demande, je ne t’ai jamais vu. C’est pour ton bien. Et surtout pour le mien.',
      'J’ai vu une Poké Ball rouler toute seule hier. J’en tremble encore.',
      'Bon courage… et si tu croises un Dresseur, ne lui dis pas où je me cache.',
    ],
  },
  {
    name: 'gourmand',
    lines: [
      'La meilleure baie de {zone} pousse juste derrière la place. Chut, c’est un secret.',
      'On se bat mieux le ventre plein. C’est scientifique.',
      'Le jour où les Pokémon seront libres, je mangerai des Baies Oran à tous les repas.',
      'Tu as faim ? Moi j’ai toujours faim. C’est mon combat à moi.',
    ],
  },
  {
    name: 'rêveur',
    lines: [
      'Je rêve d’un monde où le mot « capturer » n’existe plus que dans les vieux livres.',
      'Le ciel de {zone} est plus beau depuis qu’on espère. Tu ne trouves pas ?',
      'Et si un jour, les Dresseurs et nous, on voyageait côte à côte, sans Ball entre nous ?',
      'Parfois je ferme les yeux et j’entends toutes les Poké Balls s’ouvrir en même temps.',
    ],
  },
  {
    name: 'sage',
    lines: [
      'J’ai connu le temps d’avant les Balls. On n’était pas plus heureux… mais on était libres de ne pas l’être.',
      'La force ne fait pas le champion, petit. C’est la peur des autres qui le fait.',
      '{champion} a été un enfant curieux, autrefois. Ne l’oublie pas quand tu le battras.',
      'Une chaîne ne se brise jamais d’un coup. Maillon après maillon.',
    ],
  },
  {
    name: 'farceur',
    lines: [
      'J’ai caché une Poké Ball vide dans la poche du marchand. Il ne s’en est pas encore rendu compte.',
      'Tu sais ce qui fait peur à un champion ? Un Pokémon sauvage qui sait compter les ₽.',
      'Si tu bats {champion}, je danse sur la place. Si tu perds, je danse aussi, mais plus triste.',
      'Psst… le panneau, là-bas. Je lui ai dessiné une moustache.',
    ],
  },
];

/** Répliques d'un Pokémon qui dort : on ne tire pas grand-chose de lui. */
export const SLEEPY = [
  'Zzz… encore cinq minutes…',
  'Zzz… les Poké Balls… n’existent plus… zzz…',
  'Mmh… {champion}… pas aujourd’hui… zzz…',
  'Zzz… une baie… encore une…',
];

/** Répliques d'un mercenaire : il s'entraîne, il a un prix, il ne s'en cache pas. */
export const MERCENARY = [
  'Tu vois ce mannequin ? Imagine que c’est {champion}.',
  'Paie, et je me bats à tes côtés jusqu’au bout de la run.',
  'Je ne crois pas à ta révolution. Je crois aux ₽. Mais je frappe fort.',
  'Encore une série, et je suis à toi. Si tu as de quoi payer.',
];

/** Ce que dit un Pokémon de la place quand, rarement, il donne quelque chose. */
export const GIFT_LINES = [
  'Tiens, prends ça. Tu en auras plus besoin que moi.',
  'J’ai trouvé ça par terre ce matin. C’est pour la cause !',
  'Pour la rébellion. Ne dis à personne que ça vient de moi.',
];

/** Remplace {champion}, {zone} et {lead} dans une réplique. */
export function fillLine(line: string, vars: { champion: string; zone: string; lead: string }): string {
  return line.replace(/\{(champion|zone|lead)\}/g, (_, k: 'champion' | 'zone' | 'lead') => vars[k]);
}
