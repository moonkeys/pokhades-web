// Constantes injectées au build par vite.config.ts (`define`).

/** Version du jeu, « 0.1.42 » en prod (42e mise en ligne), « 0.1.0-dev » en local. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Relais TURN du projet pour le multijoueur (adresses séparées par des virgules), cf. net/net.ts. */
  readonly VITE_TURN_URLS?: string;
  readonly VITE_TURN_USERNAME?: string;
  readonly VITE_TURN_CREDENTIAL?: string;
}
