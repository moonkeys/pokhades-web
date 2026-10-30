import { defineConfig } from 'vite';
import { bestiaryServer } from './scripts/bestiary-server';

// Les assets du jeu vivent dans public/game/ (importés depuis le dépôt Godot
// par `npm run import-assets`) : Vite les sert tels quels et les copie au build.
// La page de config du bestiaire (config.html) ne vit qu'en dev : le build
// ne prend que index.html.
export default defineConfig({
  server: { port: 5173 },
  plugins: [bestiaryServer()],
});
