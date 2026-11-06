import { isTouch } from '../input/touch';

/**
 * Le rappel de commandes qui convient à l'appareil (retour de test : « les touches adaptées au mobile, on n'a
 * pas de clavier »). Au doigt, on dit de toucher ; au clavier, on dit la touche.
 */
export const hint = (keyboard: string, touch: string): string => (isTouch() ? touch : keyboard);
