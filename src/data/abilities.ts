import type { WeatherId } from '../world/weather';

// Talents météo (A-FAIRE 1.8 : « Reste : des talents »). Les données PokéAPI
// copiées n'ont pas les talents : la table est tenue à la main, et ne garde
// que ceux qui changent le temps en entrant en jeu. Écart voulu : un talent
// caché compte comme un talent normal (Feunard, Gigalithe), et chacun de ces
// Pokémon l'a toujours.

export interface WeatherAbility {
  name: string;
  weather: Exclude<WeatherId, 'clear' | 'fog'>;
}

const DRIZZLE: WeatherAbility = { name: 'Crachin', weather: 'rain' };
const DROUGHT: WeatherAbility = { name: 'Sécheresse', weather: 'sun' };
const SAND_STREAM: WeatherAbility = { name: 'Sable Volant', weather: 'sand' };
const SNOW_WARNING: WeatherAbility = { name: 'Alerte Neige', weather: 'hail' };

/** Espèce (n° national) → talent qui change le temps de la salle à son arrivée. */
export const WEATHER_ABILITIES: Readonly<Record<number, WeatherAbility>> = {
  186: DRIZZLE, // Tarpaud
  279: DRIZZLE, // Bekipan
  382: DRIZZLE, // Kyogre
  38: DROUGHT, // Feunard (talent caché)
  324: DROUGHT, // Chartor
  383: DROUGHT, // Groudon
  248: SAND_STREAM, // Tyranocif
  449: SAND_STREAM, // Hippopotas
  450: SAND_STREAM, // Hippodocus
  526: SAND_STREAM, // Gigalithe (talent caché)
  459: SNOW_WARNING, // Blizzi
  460: SNOW_WARNING, // Blizzaroi
};
