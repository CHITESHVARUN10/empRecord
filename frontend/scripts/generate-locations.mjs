import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { City, State } from 'country-state-city';

const here = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(here, '../../shared/src/data/india-locations.json');

const states = State.getStatesOfCountry('IN')
  .map((state) => {
    const cities = City.getCitiesOfState('IN', state.isoCode)
      .map((city) => city.name.trim())
      .filter(Boolean);
    return {
      name: state.name,
      cities: [...new Set(cities)].sort((a, b) => a.localeCompare(b)),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify({ states }, null, 2)}\n`);

const cityCount = states.reduce((total, state) => total + state.cities.length, 0);
console.log(`Wrote ${states.length} states/UTs and ${cityCount} cities to ${outputPath}`);
