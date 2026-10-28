// Throwaway data for the #1221 bubble treemap proposal: countries grouped by
// continent, then by region, with a rough 2023 population in millions. The
// `uncertainty` column is made up: a per-region spread (in percent) that the
// proposal uses to drive contour width, as the paper does with standard
// deviation.
export type Country = {
  continent: string;
  region: string;
  country: string;
  pop: number;
  uncertainty: number;
};

const rows: [string, string, string, number][] = [
  // Asia
  ["Asia", "East Asia", "China", 1410],
  ["Asia", "East Asia", "Japan", 124],
  ["Asia", "East Asia", "South Korea", 52],
  ["Asia", "East Asia", "Taiwan", 24],
  ["Asia", "East Asia", "North Korea", 26],
  ["Asia", "East Asia", "Mongolia", 3.4],
  ["Asia", "South Asia", "India", 1428],
  ["Asia", "South Asia", "Pakistan", 240],
  ["Asia", "South Asia", "Bangladesh", 173],
  ["Asia", "South Asia", "Nepal", 31],
  ["Asia", "South Asia", "Sri Lanka", 22],
  ["Asia", "South Asia", "Afghanistan", 42],
  ["Asia", "Southeast Asia", "Indonesia", 277],
  ["Asia", "Southeast Asia", "Philippines", 117],
  ["Asia", "Southeast Asia", "Vietnam", 99],
  ["Asia", "Southeast Asia", "Thailand", 72],
  ["Asia", "Southeast Asia", "Myanmar", 54],
  ["Asia", "Southeast Asia", "Malaysia", 34],
  ["Asia", "Southeast Asia", "Cambodia", 17],
  ["Asia", "Western Asia", "Turkey", 85],
  ["Asia", "Western Asia", "Iran", 89],
  ["Asia", "Western Asia", "Iraq", 45],
  ["Asia", "Western Asia", "Saudi Arabia", 37],
  ["Asia", "Western Asia", "Yemen", 34],
  ["Asia", "Western Asia", "Syria", 23],
  // Africa
  ["Africa", "West Africa", "Nigeria", 223],
  ["Africa", "West Africa", "Ghana", 34],
  ["Africa", "West Africa", "Ivory Coast", 29],
  ["Africa", "West Africa", "Niger", 27],
  ["Africa", "West Africa", "Mali", 23],
  ["Africa", "West Africa", "Senegal", 18],
  ["Africa", "East Africa", "Ethiopia", 126],
  ["Africa", "East Africa", "Tanzania", 67],
  ["Africa", "East Africa", "Kenya", 55],
  ["Africa", "East Africa", "Uganda", 48],
  ["Africa", "East Africa", "Mozambique", 34],
  ["Africa", "East Africa", "Madagascar", 30],
  ["Africa", "North Africa", "Egypt", 112],
  ["Africa", "North Africa", "Algeria", 45],
  ["Africa", "North Africa", "Sudan", 48],
  ["Africa", "North Africa", "Morocco", 37],
  ["Africa", "North Africa", "Tunisia", 12],
  ["Africa", "Central & South", "DR Congo", 102],
  ["Africa", "Central & South", "South Africa", 60],
  ["Africa", "Central & South", "Angola", 36],
  ["Africa", "Central & South", "Cameroon", 28],
  // Europe
  ["Europe", "Western Europe", "Germany", 84],
  ["Europe", "Western Europe", "France", 68],
  ["Europe", "Western Europe", "United Kingdom", 68],
  ["Europe", "Western Europe", "Netherlands", 18],
  ["Europe", "Western Europe", "Belgium", 12],
  ["Europe", "Southern Europe", "Italy", 59],
  ["Europe", "Southern Europe", "Spain", 48],
  ["Europe", "Southern Europe", "Portugal", 10],
  ["Europe", "Southern Europe", "Greece", 10],
  ["Europe", "Eastern Europe", "Russia", 144],
  ["Europe", "Eastern Europe", "Ukraine", 37],
  ["Europe", "Eastern Europe", "Poland", 37],
  ["Europe", "Eastern Europe", "Romania", 19],
  ["Europe", "Eastern Europe", "Czechia", 11],
  // Americas
  ["Americas", "North America", "United States", 335],
  ["Americas", "North America", "Mexico", 128],
  ["Americas", "North America", "Canada", 39],
  ["Americas", "North America", "Guatemala", 18],
  ["Americas", "South America", "Brazil", 216],
  ["Americas", "South America", "Colombia", 52],
  ["Americas", "South America", "Argentina", 46],
  ["Americas", "South America", "Peru", 34],
  ["Americas", "South America", "Venezuela", 28],
  ["Americas", "South America", "Chile", 20],
];

// A made-up spread per region, in percent of population.
const regionUncertainty: Record<string, number> = {
  "East Asia": 1,
  "South Asia": 4,
  "Southeast Asia": 3,
  "Western Asia": 6,
  "West Africa": 10,
  "East Africa": 8,
  "North Africa": 5,
  "Central & South": 12,
  "Western Europe": 1,
  "Southern Europe": 1.5,
  "Eastern Europe": 3,
  "North America": 1.5,
  "South America": 4,
};

export const countries: Country[] = rows.map(
  ([continent, region, country, pop]) => ({
    continent,
    region,
    country,
    pop,
    uncertainty: regionUncertainty[region],
  })
);
