import { defineConfig, type Plugin } from 'vite';
import { bestiaryServer } from './scripts/bestiary-server';

// Les assets du jeu vivent dans public/game/ (importés depuis le dépôt Godot
// par `npm run import-assets`) : Vite les sert tels quels et les copie au build.
// La page de config du bestiaire (config.html) ne vit qu'en dev : le build
// ne prend que index.html.
//
// BASE_PATH : le chemin où le jeu est servi. Une page GitHub de projet vit
// sous /<dépôt>/ (le workflow .github/workflows/pages.yml le passe) ; par
// défaut, la racine.
const base = process.env.BASE_PATH ?? '/';

/**
 * Le code demande ses fichiers en chemins absolus ('/game/…', `/game/…`).
 * Servi sous un sous-chemin, ils pointeraient hors du site : au build, on les
 * préfixe de la base. Le CSS, lui, est déjà réécrit par Vite.
 */
function gameBase(): Plugin {
  return {
    name: 'pokhades-game-base',
    apply: 'build',
    transform(code, id) {
      if (base === '/' || !/\.[jt]s$/.test(id) || !code.includes('/game/')) return null;
      return { code: code.replace(/(['"`])\/game\//g, `$1${base}game/`), map: null };
    },
  };
}

export default defineConfig({
  base,
  server: { port: 5173 },
  plugins: [bestiaryServer(), gameBase()],
});
