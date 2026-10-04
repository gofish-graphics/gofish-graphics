/**
 * About 1000 synthetic masses (grams, on a 25 g grid) in three groups, from a
 * seeded generator, for the dense noise, sina and jitter stories: a normal group "A", a
 * bimodal group "B (bimodal)", and a skewed group "C (skewed)" with a pile of
 * tied values near 4500 g. The Python parity ports read the same rows from
 * `tests/python-stories/_lowlevel_data/dense_masses.json`, dumped from this
 * module.
 */
import { lcg } from "../util/lcg";

export type DenseMass = { group: string; mass: number };

export const denseMasses: DenseMass[] = (() => {
  const rand = lcg(12345);
  const normal = (mu: number, sd: number) =>
    mu +
    sd * Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const rows: DenseMass[] = [];
  for (let i = 0; i < 340; i++)
    rows.push({ group: "A", mass: Math.round(normal(3700, 420) / 25) * 25 });
  for (let i = 0; i < 330; i++)
    rows.push({
      group: "B (bimodal)",
      mass:
        Math.round(
          (rand() < 0.5 ? normal(3400, 250) : normal(4600, 300)) / 25
        ) * 25,
    });
  for (let i = 0; i < 330; i++)
    rows.push({
      group: "C (skewed)",
      mass: Math.round((3000 + 900 * -Math.log(1 - rand())) / 25) * 25,
    });
  return rows;
})();
