// Rien ne se sélectionne, ne se copie ni ne se glisse hors du jeu (retour de test : « je peux souligner un
// truc et copier l'image, je ne veux rien pouvoir faire »). Les règles CSS (style.css) retirent déjà la
// sélection et le glisser des images ; ici, les événements qui passent quand même : sélection par
// double-clic ou Ctrl+A, copie, couper, menu contextuel (clic droit, appui long sur téléphone) et glisser
// d'une image ou d'un lien. Restent permis : les champs de saisie (surnoms, code de partie) et le
// glisser-déposer du jeu lui-même (équipe, attaques), qui passe par des éléments `draggable`.

const inField = (t: EventTarget | null): boolean => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;

export function lockPage(): void {
  const stop = (e: Event) => e.preventDefault();
  document.addEventListener('selectstart', (e) => {
    if (!inField(e.target)) e.preventDefault();
  });
  document.addEventListener('copy', (e) => {
    if (!inField(e.target)) e.preventDefault();
  });
  document.addEventListener('cut', (e) => {
    if (!inField(e.target)) e.preventDefault();
  });
  document.addEventListener('dragstart', (e) => {
    // Un élément que le jeu a lui-même rendu glissable (équipe, attaques) garde son glisser-déposer.
    if (e.target instanceof Element && e.target.closest('[draggable="true"]')) return;
    e.preventDefault();
  });
  // Le menu contextuel (« Enregistrer l'image », « Copier ») : coupé dans le jeu publié ; le serveur de
  // dev le garde, pour inspecter la page.
  if (import.meta.env.PROD) document.addEventListener('contextmenu', stop);
}
