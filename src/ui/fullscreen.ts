import { isTouch } from '../input/touch';

// Le plein écran sur téléphone (retour de test : « une partie de l'onglet me gêne, je ne vois pas
// les Pokémon » : la barre d'adresse du navigateur, Ecosia par exemple, mange l'écran).
// - Android (Chrome, Edge, Firefox, Ecosia…) : l'API plein écran, déclenchée par un geste (le tap
//   sur un bouton du menu), puis on verrouille l'écran à l'horizontale quand le navigateur le laisse.
// - iPhone : Safari ne l'offre pas pour une page web. Reste « Partager → Sur l'écran d'accueil » : le jeu
//   s'ouvre alors sans barre (manifest.webmanifest et la balise apple-mobile-web-app-capable).

/** Déjà ouvert sans barre de navigateur (installé sur l'écran d'accueil). */
export function isStandalone(): boolean {
  return matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isFullscreen(): boolean {
  return !!document.fullscreenElement;
}

/** Le navigateur sait passer en plein écran (faux sur iPhone). */
export function canFullscreen(): boolean {
  return document.fullscreenEnabled === true && typeof document.documentElement.requestFullscreen === 'function';
}

/** Faut-il proposer « Plein écran » : sur un écran tactile, pas déjà plein, pas déjà installé. */
export function wantsFullscreenButton(): boolean {
  return isTouch() && !isStandalone() && !isFullscreen();
}

/**
 * Bascule le plein écran (à appeler depuis un geste). Renvoie ce qu'on a pu faire : `ios` quand
 * il n'y a pas d'API, pour que l'appelant explique l'écran d'accueil.
 */
export async function toggleFullscreen(): Promise<'on' | 'off' | 'ios' | 'refused'> {
  if (!canFullscreen()) return 'ios';
  try {
    if (isFullscreen()) {
      await document.exitFullscreen();
      return 'off';
    }
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    // À l'horizontale : le jeu n'a pas d'autre disposition (non géré partout, d'où le try).
    try {
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
    } catch {
      /* verrouillage refusé : tant pis, la page demande déjà de tourner l'appareil */
    }
    return 'on';
  } catch {
    return 'refused';
  }
}

/** Au premier geste de « Jouer » sur téléphone : on passe en plein écran sans rien demander de plus. */
export function autoFullscreen(): void {
  if (wantsFullscreenButton() && canFullscreen()) void toggleFullscreen();
}
