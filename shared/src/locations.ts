import locationData from './data/india-locations.json';

export type StateWithCities = {
  name: string;
  cities: string[];
};

const states = locationData.states as StateWithCities[];

export const INDIA_STATES_WITH_CITIES: StateWithCities[] = states;
export const INDIA_STATES: string[] = states.map((state) => state.name);
export const INDIA_STATE_SET = new Set(INDIA_STATES);

const citiesByState = new Map(
  states.map((state) => [state.name, state.cities] as const),
);

const citySetsByState = new Map(
  states.map((state) => [state.name, new Set(state.cities)] as const),
);

export function citiesForState(state: string): string[] {
  return citiesByState.get(state) ?? [];
}

export function isValidCityForState(state: string, city: string): boolean {
  return citySetsByState.get(state)?.has(city) ?? false;
}

export function isKnownState(state: string): boolean {
  return INDIA_STATE_SET.has(state);
}
