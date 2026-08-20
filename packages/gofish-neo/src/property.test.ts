import { describe, expect, it } from "vitest";
import { buildMatrix, total } from "./matrix";
import type { Confusion } from "./pipeline";
import type { NeoSpec } from "./spec";

// Fixed (not Math.random) synthetic dataset across 3 dimensions with small
// 0/1 counts, so the test is deterministic while still exercising the full
// pipeline shape.
const CLASSES = ["species", "habitat", "diet"];
const SPECIES = ["cat", "dog", "bird"];
const HABITATS = ["indoor", "outdoor"];
const DIETS = ["carnivore", "omnivore"];

// A fixed pseudo-random 0/1 sequence (not Math.random) driving which
// combinations get a count, so the fixture is reproducible.
const BITS = [
  1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1,
];

function buildRecords(): Confusion[] {
  const records: Confusion[] = [];
  let i = 0;
  for (const s of SPECIES) {
    for (const h of HABITATS) {
      for (const d of DIETS) {
        const count = BITS[i % BITS.length]!;
        i++;
        if (count === 0) continue;
        // actual and observed diverge for some combos, sharing habitat/diet.
        const observedSpecies =
          SPECIES[
            (SPECIES.indexOf(s) + (count % 2 === 0 ? 1 : 0)) % SPECIES.length
          ];
        records.push({
          actual: [`species:${s}`, `habitat:${h}`, `diet:${d}`],
          observed: [`species:${observedSpecies}`, `habitat:${h}`, `diet:${d}`],
          count,
        });
      }
    }
  }
  return records;
}

describe("property: pipeline never throws and preserves total count", () => {
  const specs: NeoSpec[] = [
    { classes: CLASSES },
    { classes: ["species", "habitat"] },
    { classes: ["species", "habitat", "diet"], filter: ["habitat:indoor"] },
    {
      classes: ["species", "diet"],
      where: { qualifier: "actual", label: "habitat", is: "habitat:indoor" },
    },
  ];

  for (const [i, spec] of specs.entries()) {
    it(`spec #${i} runs without throwing and has non-negative, count-conserving matrix entries`, () => {
      const records = buildRecords();
      const inputTotal = records.reduce((sum, r) => sum + r.count, 0);

      let built: ReturnType<typeof buildMatrix>;
      expect(() => {
        built = buildMatrix(records, spec);
      }).not.toThrow();

      const { matrix } = built!;
      for (const row of matrix) {
        for (const v of row) {
          expect(v).toBeGreaterThanOrEqual(0);
        }
      }

      // Filters/conditions can drop records, so the grand total is at most
      // the input total; for the unfiltered specs it must equal it exactly.
      const grandTotal = total(matrix);
      expect(grandTotal).toBeLessThanOrEqual(inputTotal);
      if (!spec.filter && !spec.where) {
        expect(grandTotal).toBe(inputTotal);
      }
    });
  }
});
