// Lecture des fiches JSON embarquées (public/game/data), avec reprise.
//
// `npm run import-assets` vide puis recopie public/game/data : pendant ces
// quelques secondes, une fiche manque, et Vite répond 404 ou la page HTML de
// secours (que `json()` refuse). Le jeu ouvert se recharge au même moment
// quand on enregistre le bestiaire. Sans reprise, Pokemon.load retombait sur
// son nom de secours et la carte du Repaire affichait « #25 » au lieu de
// « Pikachu » jusqu'au rechargement suivant, la fiche ratée restant en cache.

/** Essais, et attente avant le suivant (doublée à chaque fois) : environ 3 s en tout. */
const TRIES = 5;
const FIRST_WAIT = 200;

/** La fiche lue, ou null si elle manque toujours après les reprises (vraie absence). */
export async function fetchJson<T>(url: string): Promise<T | null> {
  for (let i = 0, wait = FIRST_WAIT; i < TRIES; i++, wait *= 2) {
    try {
      const r = await fetch(url);
      // 404 franc : le fichier peut revenir (copie en cours), on réessaie comme pour le reste.
      if (r.ok) return (await r.json()) as T;
    } catch {
      // Réseau coupé ou page HTML de secours de Vite : on réessaie.
    }
    if (i < TRIES - 1) await new Promise((res) => setTimeout(res, wait));
  }
  return null;
}
