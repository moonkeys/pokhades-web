import { cleanCode } from './net';

// Le lien d'invitation d'une partie (retour de test : « un QR code, comme ça les gens n'ont
// qu'à scanner »). L'hôte donne `…/?join=ABCDE` : le jeu s'ouvre, et propose de rejoindre.

/** L'adresse du jeu qui rejoint cette partie, depuis le site où l'on joue (GitHub Pages ou local). */
export function inviteUrl(code: string): string {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('join', code);
  return url.toString();
}

/**
 * Le code du lien qui a ouvert la page (`?join=ABCDE`), s'il y en a un valide. On le retire de
 * la barre d'adresse : un rechargement ne doit pas rejoindre une partie fermée depuis.
 */
export function readInvite(): string {
  const url = new URL(location.href);
  const raw = url.searchParams.get('join');
  if (raw === null) return '';
  url.searchParams.delete('join');
  history.replaceState(null, '', url.toString());
  const code = cleanCode(raw);
  return code.length === 5 ? code : '';
}
