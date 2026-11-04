// Boucle à pas fixe (60 Hz, comme le tick physique par défaut de Godot) :
// la simulation avance par pas réguliers quel que soit l'écran (60, 120,
// 144 Hz), le rendu interpole entre les deux derniers états.
export const STEP = 1 / 60;

/**
 * `keepAlive` : vrai quand la simulation doit continuer onglet caché (jeu en
 * ligne : l'hôte fait tourner la run de tous ; s'il change d'onglet, le
 * navigateur suspend requestAnimationFrame et tout se figeait chez les
 * invités). Un petit worker prend alors le relais pour cadencer les pas —
 * les minuteries d'un worker ne sont pas bridées comme celles de la page.
 */
export function startLoop(
  update: (dt: number) => void,
  render: (alpha: number, frameDt: number) => void,
  keepAlive: () => boolean = () => false,
): void {
  let acc = 0;
  let last = performance.now();
  const advance = (now: number): number => {
    // Plafond : un onglet resté en arrière-plan ne doit pas rejouer 10 s de simulation.
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    acc += dt;
    while (acc >= STEP) {
      update(STEP);
      acc -= STEP;
    }
    return dt;
  };
  /** Dernière image dessinée : au-delà de STALL ms sans image, le navigateur a suspendu l'affichage. */
  let lastFrame = performance.now();
  const STALL = 60;
  const frame = (now: number) => {
    lastFrame = performance.now();
    const dt = advance(now);
    render(acc / STEP, dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  try {
    const src = URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 16);'], { type: 'text/javascript' }));
    const ticker = new Worker(src);
    ticker.onmessage = () => {
      const now = performance.now();
      // Onglet caché, fenêtre recouverte ou panneau inactif : document.hidden ne le dit pas
      // toujours, mais plus aucune image ne vient. Le worker cadence alors la simulation seul.
      if (now - lastFrame < STALL) return;
      if (keepAlive()) advance(now);
      // Hors ligne, la simulation reste figée ; elle reprend sans rattraper le temps perdu.
      else last = now;
    };
  } catch {
    // Pas de worker (navigateur très ancien) : la simulation s'arrête onglet caché, comme avant.
  }
}
