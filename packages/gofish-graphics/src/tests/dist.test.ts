/**
 * Distributions (stack profiles S11): the run-time record (ast/dist.ts),
 * the families and `Dist.sample`, a distribution expression
 * (ast/distExpr.ts) and the field members (`field(x).density()`), their
 * units, and their wire form.
 *
 * Run: `tsx src/tests/dist.test.ts` (wired as `pnpm test:dist`).
 */
import {
  familyDist,
  normalCdf,
  normalQuantile,
  restrictDist,
  sample,
  sampleIn,
  type Dist,
} from "../ast/dist";
import { evalGroup, FieldExpr, medianOf, meanOf } from "../ast/fieldExpr";
import { integrate } from "../ast/fun";
import * as DistNS from "../families/dist";
import { penguins } from "../data/penguins";
import { Frontend } from "gofish-ir";

declare const process: { exit(code: number): never };

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}
const throws = (f: () => unknown): string => {
  try {
    f();
    return "";
  } catch (e) {
    return (e as Error).message;
  }
};
const near = (a: number | undefined, b: number, tol: number) =>
  a !== undefined && Math.abs(a - b) <= tol;

const field = (name: string) => new FieldExpr(name);

console.log("\n# the standard normal");
check("cdf(0) is 1/2", near(normalCdf(0), 0.5, 1e-15));
check("cdf(1.96)", near(normalCdf(1.96), 0.9750021048517795, 1e-12));
check("cdf(-3)", near(normalCdf(-3), 0.0013498980316301, 1e-13));
for (const p of [1e-6, 0.001, 0.02, 0.3, 0.5, 0.9, 0.999])
  check(
    `quantile inverts cdf at ${p}`,
    near(normalCdf(normalQuantile(p)), p, 1e-12 + p * 1e-10)
  );

console.log("\n# the families");
const families: [string, Dist, number][] = [
  ["normal", familyDist("normal", { mean: 10, sd: 2 }), 0.998],
  ["lognormal", familyDist("lognormal", { meanlog: 0.5, sdlog: 0.4 }), 0.999],
  ["uniform", familyDist("uniform", { min: -1, max: 3 }), 1],
  ["exponential", familyDist("exponential", { rate: 0.5 }), 0.999],
];
for (const [name, d, inside] of families) {
  check(
    `${name}: the density over its interval holds the share drawn`,
    near(integrate(d.density), inside, 1e-6),
    String(integrate(d.density))
  );
  check(
    `${name}: the cdf over its interval adds the same share`,
    near(
      d.cdf.at(d.density.domain.max) - d.cdf.at(d.density.domain.min),
      inside,
      1e-9
    )
  );
  for (const p of [0.1, 0.5, 0.9])
    check(
      `${name}: quantile(${p}) inverts the cdf`,
      near(d.cdf.at(d.quantile(p)!), p, 1e-9)
    );
  check(`${name}: median is quantile(0.5)`, near(d.median, d.quantile(0.5)!, 1e-9));
  check(`${name}: mass is 1`, d.mass === 1);
  check(
    `${name}: support is t over the density's interval`,
    d.support.domain.min === d.density.domain.min &&
      d.support.domain.max === d.density.domain.max &&
      d.support.at(d.density.domain.min) === d.density.domain.min
  );
}
check(
  "normal is drawn between its 0.001 and 0.999 quantiles",
  near(families[0][1].density.domain.min, 10 + 2 * normalQuantile(0.001), 1e-9)
);
check(
  "a family checks its parameters",
  /sd must be a positive number/.test(
    throws(() => familyDist("normal", { mean: 0, sd: -1 }))
  )
);

console.log("\n# a sample");
const masses = penguins
  .map((p) => p["Body Mass (g)"])
  .filter((v): v is number => v !== null);
{
  const d = sample(masses);
  check(
    "its density's area is the number of values",
    near(integrate(d.density), masses.length, masses.length * 2e-3),
    `${integrate(d.density)} vs ${masses.length}`
  );
  check("its mass is the number of values", d.mass === masses.length);
  check("its median is the values' median", d.median === medianOf(masses));
  check("its mean is the values' mean", near(d.mean, meanOf(masses)!, 1e-9));
  check(
    "it is drawn over the values' range",
    d.density.domain.min === Math.min(...masses) &&
      d.density.domain.max === Math.max(...masses)
  );
  // Tied values hold the mass of all their copies, so at a tie the cdf
  // passes p; between different values it inverts the quantile exactly.
  for (const p of [0, 0.1, 0.25, 0.5, 0.9, 1])
    check(
      `its cdf at its quantile ${p} is at least ${p}`,
      d.cdf.at(d.quantile(p)!) >= p - 1e-12
    );
  const distinct = sample([1, 2, 4, 7, 11, 16]);
  for (const p of [0, 0.1, 0.33, 0.5, 0.9, 1])
    check(
      `with no ties its cdf inverts its quantile at ${p}`,
      near(distinct.cdf.at(distinct.quantile(p)!), p, 1e-12)
    );
  check(
    "missing values are left out",
    sample([1, null, 3, undefined, 2]).mass === 3
  );
  check(
    "one value has quantiles but no density",
    sample([4, 4]).median === 4 &&
      /at least two different values/.test(
        throws(() => sample([4, 4]).density.at(4))
      )
  );
  check(
    "a bandwidth must be positive",
    /bandwidth must be a positive number/.test(
      throws(() => sample(masses, { bandwidth: 0 }))
    )
  );
}

console.log("\n# restriction");
{
  const d = familyDist("normal", { mean: 0, sd: 1 });
  const cell = { min: -1, max: 0.5 };
  const r = restrictDist(d, cell);
  const share = normalCdf(0.5) - normalCdf(-1);
  check("its mass is the cell's share", near(r.mass, share, 1e-12));
  check("its density is the same inside", near(r.density.at(0), d.density.at(0), 1e-15));
  check(
    "its density's area is its mass",
    near(integrate(r.density), share, 1e-6)
  );
  check(
    "its median halves the cell's mass",
    near(d.cdf.at(r.median!) - normalCdf(-1), share / 2, 1e-9)
  );
  check("its cdf runs 0 to 1", near(r.cdf.at(-1), 0, 1e-12) && near(r.cdf.at(0.5), 1, 1e-12));
  const lo = restrictDist(d, { min: -10, max: 0 });
  const hi = restrictDist(d, { min: 0, max: 10 });
  check(
    "two cells meet exactly",
    lo.density.domain.max === hi.density.domain.min &&
      lo.density.at(0) === hi.density.at(0)
  );
  const s = sample(masses);
  const inCell = masses.filter((m) => m >= 4000 && m <= 5000);
  const c = sampleIn(inCell, s, { min: 4000, max: 5000 });
  check("a sample's cell: its median is the cell's values'", c.median === medianOf(inCell));
  check("a sample's cell: its mass is the cell's count", c.mass === inCell.length);
  check(
    "a sample's cell: the whole sample's density inside",
    c.density.at(4500) === s.density.at(4500) &&
      c.density.domain.min === 4000 &&
      c.density.domain.max === 5000
  );
}

console.log("\n# field members are the sample's");
{
  const rows = penguins.filter((p) => p["Body Mass (g)"] !== null);
  const col = "Body Mass (g)";
  const d = sample(rows.map((r) => r[col]));
  const read = (e: unknown) => evalGroup(e as any, rows, { name: col });
  const med = read(field(col).quantile(0.5));
  check(
    "quantile(0.5) is median()",
    med.kind === "value" &&
      med.value === (read(field(col).median()) as any).value
  );
  const dens = read(field(col).density());
  check(
    "density() is the sample's density",
    dens.kind === "function" && dens.fun.at(4000) === d.density.at(4000)
  );
  check(
    "density() is a count per unit, named for the variable",
    dens.quantity?.name === `${col} density`
  );
  const sup = read(field(col).support());
  check(
    "support() is t over the values' range, in the variable",
    sup.kind === "function" &&
      sup.fun.domain.min === d.support.domain.min &&
      sup.quantity?.name === col
  );
  const cdf = read(field(col).cdf());
  check("cdf() is a ratio", cdf.quantity?.unit?.unit === "ratio");
  const kde = read(field(col).reduce((xs) => DistNS.sample(xs)).density());
  check(
    "a reduce that returns a sample lifts the same density",
    kde.kind === "function" && kde.fun.at(4200) === d.density.at(4200)
  );
  check(
    "a reduce's Dist: its support() member is its density's support()",
    (() => {
      const a = read(field(col).reduce((xs) => DistNS.sample(xs)).support());
      const b = read(
        field(col)
          .reduce((xs) => DistNS.sample(xs))
          .density()
          .support()
      );
      return (
        a.kind === "function" &&
        b.kind === "function" &&
        a.fun.domain.min === b.fun.domain.min &&
        a.fun.domain.max === b.fun.domain.max
      );
    })()
  );
}

console.log("\n# units");
{
  const usd = { unit: "USD", symbol: "$", traits: { CanSum: {} } };
  const rows = [{ v: 1 }, { v: 2 }, { v: 4 }];
  const col = { name: "v", unit: usd };
  const dens = evalGroup(field("v").density() as any, rows, col);
  check(
    "a density is the count per the variable's unit, which adds up",
    dens.quantity?.unit?.unit === "count per USD" &&
      dens.quantity?.unit?.traits?.CanSum !== undefined
  );
  const t = { unit: "instant", traits: {}, difference: { unit: "duration", traits: { CanSum: {} } } };
  const tdens = evalGroup(field("v").density() as any, rows, { name: "t", unit: t });
  check(
    "a density over times is per duration",
    tdens.quantity?.unit?.unit === "count per duration"
  );
  const sup = evalGroup(field("v").support() as any, rows, col);
  check("a support is in the variable", sup.quantity === col);
  const u = DistNS.units("USD", "count");
  check(
    "Dist.units mirrors the record",
    u.density.HasUnit.unit === "count per USD" &&
      u.support.HasUnit.unit === "USD" &&
      u.cdf.HasUnit.unit === "ratio"
  );
}

console.log("\n# a distribution expression");
{
  const params = [
    { g: "a", mean: 0, sd: 1 },
    { g: "b", mean: 5, sd: 2 },
  ];
  const d = DistNS.normal({ mean: "mean", sd: "sd" });
  const med = evalGroup(d.median() as any, [params[1]], undefined);
  check("its median per group", med.kind === "value" && med.value === 5);
  const dens = evalGroup(d.density() as any, [params[1]], undefined);
  check(
    "its density per group",
    dens.kind === "function" &&
      near(dens.fun.at(5), 1 / (2 * Math.sqrt(2 * Math.PI)), 1e-12)
  );
  check(
    "its density is probability per the variable",
    dens.quantity?.name === "mean density"
  );
  const sup = evalGroup(d.support() as any, [params[1]], undefined);
  check(
    "its support is in the location column's quantity",
    sup.quantity?.name === "mean"
  );
  check(
    "a column with several values in a group is an error",
    /one number per group/.test(
      throws(() => evalGroup(d.median() as any, params, undefined))
    )
  );
  const fixed = DistNS.normal({ mean: 0, sd: 1 });
  check(
    "numbers as parameters",
    (evalGroup(fixed.quantile(0.975) as any, [], undefined) as any).value >
      1.95
  );
  check(
    "a value expression as a parameter",
    (
      evalGroup(
        DistNS.normal({ mean: field("mean").mean(), sd: 1 }).median() as any,
        params,
        undefined
      ) as any
    ).value === 2.5
  );
  check(
    "an unknown parameter is an error",
    /no parameter "mu"/.test(
      throws(() => DistNS.normal({ mu: 0, sd: 1 } as any))
    )
  );
  check(
    "the expression with no member is an error in a channel",
    /Read a member/.test(throws(() => evalGroup(d as any, [params[0]], undefined)))
  );
  const wire = JSON.parse(JSON.stringify(d.density()));
  check(
    "its wire form is data",
    wire.type === "dist" &&
      wire.family === "normal" &&
      wire.params.mean === "mean" &&
      wire.ops[0].op === "member"
  );
  const fromWire = evalGroup(wire, [params[1]], undefined);
  check(
    "its wire form evaluates the same",
    fromWire.kind === "function" && fromWire.fun.at(5) === (dens as any).fun.at(5)
  );
  const nested = JSON.parse(
    JSON.stringify(DistNS.normal({ mean: field("mean").mean(), sd: 1 }).median())
  );
  check(
    "a value expression parameter is written in its wire form",
    nested.params.mean.type === "field" && nested.params.mean.ops[0].op === "mean"
  );
}

console.log("\n# the IR");
{
  const spec = (value: unknown) => ({
    irVersion: 0,
    ir: "gofish-frontend",
    root: {
      type: "chart",
      data: { type: "table", id: "t0" },
      mark: { type: "ribbon", x: value, h: value },
    },
    tables: { t0: [{ mean: 0, sd: 1 }] },
  });
  const ok = (value: unknown) => {
    const r = Frontend.validate(spec(value));
    return { ok: r.valid, errors: r.errors };
  };
  const d = DistNS.normal({ mean: "mean", sd: "sd" });
  const r1 = ok(JSON.parse(JSON.stringify(d.density())));
  check("a distribution expression validates", r1.ok, JSON.stringify((r1 as any).errors));
  const r2 = ok(JSON.parse(JSON.stringify(field("x").density())));
  check("a field's density validates", r2.ok, JSON.stringify((r2 as any).errors));
  const r3 = ok({ type: "dist", family: "gamma", params: {} });
  check("an unknown family does not", !r3.ok);
  const r4 = ok({ type: "dist", family: "normal", params: { mean: 0 } });
  check("a missing parameter does not", !r4.ok);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
