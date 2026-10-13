/**
 * A column's unit must reach MARK channels, not only operator channels (#534).
 *
 * `bin()` tags its output array with column types whose `HasUnit` says the
 * `start`/`end`/`size` columns are still in the SOURCE field's units. An
 * operator splits that array into fresh per-leaf sub-arrays (groupBy/filter/
 * slice) that don't inherit them; the operator re-tags each leaf
 * (createOperator, `copyColumnTypes`) so a mark
 * channel applied per leaf resolves the source measure instead of the literal
 * field name. These pin that contract at the channels boundary so a regression
 * (dropping the re-tag) fails here, not as a downstream false `mergeMeasures`
 * conflict. Run via `tsx`.
 */
import { getMeasure } from "../ast/data";
import { columnType, copyColumnTypes, setColumnTypes } from "../ast/schema";
import { inferSize, resolveMeasure } from "../ast/channels";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// A bin()-shaped array: `size` is denominated in the source field's units.
const mm = { HasUnit: { unit: "Beak Length (mm)" } };
const binned = setColumnTypes(
  [
    { start: 0, end: 10, size: 10, count: 3 },
    { start: 10, end: 20, size: 10, count: 7 },
  ],
  { start: mm, end: mm, size: mm }
);

console.log("# measure: units on the source array");
{
  ok(
    "inferSize on the whole binned array tags the source measure",
    getMeasure(inferSize("size", binned)) === "Beak Length (mm)"
  );
}

console.log("# measure: a fresh split leaf loses its units without re-tagging");
{
  // Simulate an operator split: a fresh sub-array (one bin) — the no-op baseline
  // that #534 fixes. Without the column types the field-name fallback wins.
  const rawLeaf = [...binned].slice(0, 1);
  ok("untagged leaf has no unit", columnType(rawLeaf, "size") === undefined);
  ok(
    "untagged leaf falls back to the literal field name (the bug)",
    getMeasure(inferSize("size", rawLeaf)) === "size"
  );
}

console.log("# measure: copyColumnTypes restores the source measure (#534)");
{
  const leaf = copyColumnTypes([...binned].slice(0, 1), binned);
  ok(
    "re-tagged leaf carries the unit",
    columnType(leaf, "size")?.HasUnit?.unit === "Beak Length (mm)"
  );
  ok(
    "inferSize on the re-tagged leaf tags the source measure",
    getMeasure(inferSize("size", leaf)) === "Beak Length (mm)"
  );
  ok(
    "resolveMeasure on the re-tagged leaf returns the source measure",
    resolveMeasure(leaf, "size") === "Beak Length (mm)"
  );
}

console.log("# measure: copy is a no-op when the source has no column types");
{
  const plain = [{ size: 1 }];
  const leaf = copyColumnTypes([...plain], plain);
  ok(
    "untyped source leaves the leaf untagged",
    columnType(leaf, "size") === undefined
  );
  ok(
    "inferSize then uses the field-name default",
    getMeasure(inferSize("size", leaf)) === "size"
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
