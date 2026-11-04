import { buildingsShown } from './catalog';
import { canCraft, RECIPES } from './crafting';
import { questState, QUESTS } from './quests';
import { roster, type Save } from './save';

// Les repères « ! » au-dessus des gardiens du Repaire (run/camp.ts), et les
// mêmes « ! » dans leur écran, sur ce qui est neuf (ui/campscreen.ts). Deux
// sortes de nouveauté :
// - ce qui attend un geste (une mission rentrée à récolter, une quête remplie
//   à réclamer) : le repère reste tant qu'on ne l'a pas fait ;
// - ce qui est apparu depuis la dernière visite (des plans chez le bâtisseur,
//   des Pokémon de plus à la hutte) : la liste de ce que le poste propose est
//   notée à l'ouverture (Save.newsSeen), et le repère part. N'est neuf que ce
//   qui n'y était pas : bâtir un aménagement retire un plan de la liste, ça ne
//   rallume rien (retour de test : le bâtisseur réclamait qu'on lui parle
//   juste après un chantier).
//
// Ajout : le jeu Godot n'a pas de tels repères (retour de test).

/** Ce qu'un poste propose (identifiants) ; vide : rien à signaler. */
function offer(save: Save, station: string): string[] {
  switch (station) {
    case 'builder':
      return buildingsShown(save)
        .filter((b) => !save.built.includes(b.id))
        .map((b) => b.id);
    case 'team':
      return roster(save).map(String);
    // Les recettes qu'on peut façonner : une de plus à portée rallume le repère.
    case 'craft':
      return RECIPES.filter((r) => canCraft(save, r)).map((r) => r.out);
    default:
      return [];
  }
}

/** Ce qui attend un geste au poste (identifiants : rang de la mission, quête). */
function pending(save: Save, station: string): string[] {
  if (station === 'missions') return save.missions.flatMap((m, i) => (m !== null && m.left <= 0 ? [String(i)] : []));
  if (station === 'quests') return QUESTS.filter((q) => questState(save, q.id) === 'ready').map((q) => q.id);
  if (station === 'garden') return save.garden.flatMap((p, i) => (p && p.left <= 0 ? [`plot${i}`] : []));
  // Le visiteur du nectar n'est là que quand il est arrivé : il attend qu'on lui parle.
  if (station === 'visitor') return save.nectar && save.nectar.left <= 0 ? ['here'] : [];
  // La recrue qui attend près du feu : elle veut qu'on lui parle.
  if (station === 'recruit') return save.candidates.length ? ['here'] : [];
  return [];
}

/** Ce qui est neuf à un poste : ce qui attend un geste, et ce qui n'y était pas à la dernière visite. */
export function fresh(save: Save, station: string): Set<string> {
  const seen = new Set((save.newsSeen[station] ?? '').split(','));
  return new Set([...pending(save, station), ...offer(save, station).filter((id) => !seen.has(id))]);
}

/** Les postes qui ont du neuf. */
export function campNews(save: Save, stations: readonly string[]): Set<string> {
  return new Set(stations.filter((s) => fresh(save, s).size > 0));
}

/** On vient d'ouvrir le poste : ce qui y est apparu est vu. */
export function markSeen(save: Save, station: string): void {
  save.newsSeen[station] = offer(save, station).join();
}
