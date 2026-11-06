// Constantes injectées au build par vite.config.ts (`define`).

/** Version du jeu, « 0.1.42 » en prod (42e mise en ligne), « 0.1.0-dev » en local. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Adresse du Worker qui fabrique les identifiants du relais TURN (worker/turn-worker.js), cf. net/net.ts. */
  readonly VITE_TURN_ENDPOINT?: string;
}
