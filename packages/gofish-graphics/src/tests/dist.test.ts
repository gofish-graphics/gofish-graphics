/**
 * Distributions: the run-time record (ast/dist.ts), the families and the
 * kernel density, the data form a column holds and `kde`, the derive helper
 * that makes one, a distribution expression (ast/distExpr.ts) and the field
 * members that read a column's distribution (`field(x).density()`), their
 * units, and their wire form.
 *
 * Run: `tsx src/tests/dist.test.ts` (wired as `pnpm test:dist`).
 */
import {
  familyDist,
  normalCdf,
  normalQuantile,
  distOf,
  restrictDist,
  type Dist,
  type DistData,
} from "../ast/dist";
import { kde } from "../ast/marks/chart";
import { evalGroup, FieldExpr, medianOf, meanOf } from "../ast/fieldExpr";
import { integrate } from "../ast/fun";
import { hasNoWireForm } from "../ast/groupExpr";
import * as DistNS from "../families/dist";
import * as BinNS from "../families/bin";
import { splitEntries } from "../ast/datumProjection";
import { resolveColumn } from "../ast/channels";
import { applySchema, getColumnTypes } from "../ast/schema";
import { penguins } from "../data/penguins";
import { silvermanBandwidth } from "../ast/graphicalOperators/overlap";
import { Unit as UnitNS } from "../lib";
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
      near(d.cdf.at(d.quantile(p)), p, 1e-9)
    );
  check(
    `${name}: median is quantile(0.5)`,
    near(d.median, d.quantile(0.5), 1e-9)
  );
  check(`${name}: mass is 1`, d.mass === 1);
  check(
    `${name}: domain is t over the density's interval`,
    d.domain.domain.min === d.density.domain.min &&
      d.domain.domain.max === d.density.domain.max &&
      d.domain.at(d.density.domain.min) === d.density.domain.min
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

console.log("\n# a kernel density");
const masses = penguins
  .map((p) => p["Body Mass (g)"])
  .filter((v): v is number => v !== null);
const kdeData = (values: unknown[], bandwidth?: number): DistData => ({
  type: "dist",
  family: "kde",
  params: { values, ...(bandwidth !== undefined ? { bandwidth } : {}) },
});
{
  const d = distOf(kdeData(masses));
  const n = masses.length;
  // Past 3 bandwidths a kernel has Φ(−3) of its mass on that side, so the
  // area over the drawn interval is short of the count by less than that
  // share of the values at each end: at most 2 Φ(−3) n.
  const tail = normalCdf(-3);
  const area = integrate(d.density);
  check(
    "its density's area is the number of values, less the tails",
    area <= n && area >= n * (1 - 2 * tail),
    `${area} vs ${n}`
  );
  check("its mass is the number of values", d.mass === n);
  const bw = silvermanBandwidth([...masses].sort((a, b) => a - b));
  check(
    "it is drawn 3 bandwidths past the values",
    near(d.density.domain.min, Math.min(...masses) - 3 * bw, 1e-9) &&
      near(d.density.domain.max, Math.max(...masses) + 3 * bw, 1e-9) &&
      d.domain.domain.min === d.density.domain.min &&
      d.cdf.domain.max === d.density.domain.max
  );
  check(
    "it tapers to near zero at both ends",
    d.density.at(d.density.domain.min) < 0.02 * d.density.at(d.median) &&
      d.density.at(d.density.domain.max) < 0.02 * d.density.at(d.median)
  );
  const { min } = d.density.domain;
  for (const t of [3000, 3500, 4200, 5000, 6000]) {
    const below = integrate(restrictDist(d, { min, max: t }).density);
    check(
      `its cdf is its density's integral over its mass, at ${t}`,
      near(d.cdf.at(t) - d.cdf.at(min), below / n, 1e-6),
      `${d.cdf.at(t) - d.cdf.at(min)} vs ${below / n}`
    );
  }
  for (const p of [0.001, 0.1, 0.25, 0.5, 0.9, 0.999])
    check(
      `its quantile inverts its cdf at ${p}`,
      near(d.cdf.at(d.quantile(p)), p, 1e-9)
    );
  check(
    "its quantile at 0 and 1 is the ends of the line",
    d.quantile(0) === -Infinity && d.quantile(1) === Infinity
  );
  check("its median is quantile(0.5)", d.median === d.quantile(0.5));
  // The density's own mean, over the drawn interval: the kernels' tails
  // past it are short by the same share on each side, nearly.
  const steps = 4000;
  const h = (d.density.domain.max - min) / steps;
  let m0 = 0;
  let m1 = 0;
  for (let i = 0; i <= steps; i++) {
    const t = min + i * h;
    const w = i === 0 || i === steps ? 0.5 : 1;
    m0 += w * d.density.at(t);
    m1 += w * t * d.density.at(t);
  }
  check(
    "its mean is its density's mean, the values' mean",
    near(d.mean, meanOf(masses)!, 1e-9) && near(m1 / m0, d.mean, 1),
    `${m1 / m0} vs ${d.mean}`
  );
  check(
    "its data form is built once",
    distOf(kdeData(masses)) !== d &&
      (() => {
        const data = kdeData(masses);
        return distOf(data) === distOf(data);
      })()
  );
  const wire = JSON.parse(JSON.stringify(kdeData(masses)));
  check(
    "its data form round-trips as JSON to the same distribution",
    distOf(wire).density.at(4000) === d.density.at(4000) &&
      distOf(wire).median === d.median
  );
  check(
    "missing values are left out",
    distOf(kdeData([1, null, 3, undefined, 2])).mass === 3
  );
  check(
    "one value has no bandwidth by Silverman's rule: give one",
    /Silverman's rule gives no bandwidth.*kde\(column, \{ bandwidth \}\)/.test(
      throws(() => distOf(kdeData([4, 4])))
    ) && distOf(kdeData([4, 4], 1)).median === 4
  );
  check(
    "a bandwidth must be positive",
    /bandwidth must be a positive number/.test(
      throws(() => distOf(kdeData(masses, 0)))
    )
  );
  check(
    "its values are numbers",
    /finite numbers/.test(throws(() => distOf(kdeData([1, "2", 3]))))
  );
  const normal = distOf({
    type: "dist",
    family: "normal",
    params: { mean: 3, sd: 2 },
  });
  check(
    "a family's data form is the family",
    normal.median === 3 &&
      normal.density.at(4) ===
        familyDist("normal", { mean: 3, sd: 2 }).density.at(4)
  );
}

console.log("\n# kde, the derive helper");
{
  const rows = [
    { g: "a", v: 1, day: 1 },
    { g: "a", v: null, day: 2 },
    { g: "a", v: 4, day: 3 },
  ];
  const [row, ...rest] = kde("v")(rows);
  check(
    "one row: the column holds the data form, with the constant columns",
    rest.length === 0 &&
      row.g === "a" &&
      !("day" in row) &&
      JSON.stringify(row.v) ===
        JSON.stringify({
          type: "dist",
          family: "kde",
          params: { values: [1, 4] },
        })
  );
  check(
    "a bandwidth is kept in the data form",
    (kde("v", { bandwidth: 2 })(rows)[0].v as any).params.bandwidth === 2
  );
  check("no rows give no row", kde("v")([]).length === 0);
  check(
    "a sample with no density is an error at the kde",
    /kde: Silverman's rule/.test(throws(() => kde("v")([{ v: 1 }])))
  );
  // In each group of a split, as derive runs after a spread.
  const col = "Body Mass (g)";
  const bySpecies = new Map<string, any[]>();
  for (const p of penguins)
    bySpecies.set(p.Species, [...(bySpecies.get(p.Species) ?? []), p]);
  const groups = [...bySpecies].map(([species, g]) => ({
    species,
    count: g.filter((p) => p[col] !== null).length,
    row: kde(col)(g)[0],
  }));
  check(
    "per group: each row keeps its group's species and holds its own sample",
    groups.every(
      ({ species, count, row }) =>
        row.Species === species && distOf(row[col] as DistData).mass === count
    )
  );
}

console.log("\n# field reads the distribution its column holds");
{
  const col = "Body Mass (g)";
  const rows = kde(col)(penguins);
  const d = distOf(rows[0][col] as DistData);
  const read = (e: unknown, rs: unknown[] = rows) =>
    evalGroup(e as any, rs, { name: col });
  const med = read(field(col).quantile(0.5));
  check(
    "quantile(0.5) is median() is the distribution's median",
    med.kind === "value" &&
      med.value === (read(field(col).median()) as any).value &&
      med.value === d.median
  );
  check(
    "mean() is the distribution's mean",
    (read(field(col).mean()) as any).value === d.mean
  );
  const dens = read(field(col).density());
  check(
    "density() is the distribution's density",
    dens.kind === "function" && dens.fun.at(4000) === d.density.at(4000)
  );
  check(
    "density() is a count per unit, named for the variable",
    dens.quantity?.name === `${col} density`
  );
  const sup = read(field(col).domain());
  check(
    "domain() is t over the density's interval, in the variable",
    sup.kind === "function" &&
      sup.fun.domain.min === d.domain.domain.min &&
      sup.quantity?.name === col
  );
  const cdf = read(field(col).cdf());
  check(
    "cdf() is a ratio, the distribution's cdf",
    cdf.quantity?.unit?.unit === "ratio" &&
      cdf.kind === "function" &&
      cdf.fun.at(4000) === d.cdf.at(4000)
  );
  check(
    "a bare read of the column is an error that names its members",
    /density/.test(throws(() => read(field(col))))
  );
  check(
    "a data summary that is not a member is an error that names the members",
    /field\("Body Mass \(g\)"\)\.sum\(\).*density\(\), domain\(\)/.test(
      throws(() => read(field(col).sum()))
    )
  );
  check(
    "the same distribution in every row of a group reads as one",
    (read(field(col).median(), [rows[0], { ...rows[0] }]) as any).value ===
      d.median
  );
  const two = [...kde(col)(penguins.slice(0, 50)), ...rows];
  check(
    "different distributions in one group are an error that names the fix",
    /Split the rows so each group holds one/.test(
      throws(() => read(field(col).density(), two))
    )
  );
  const raw = penguins.filter((p) => p[col] !== null);
  for (const member of ["density", "domain", "cdf"] as const)
    check(
      `${member}() on a column of numbers names derive(kde(...))`,
      /holds numbers.*derive\(kde\("Body Mass \(g\)"\)\)/s.test(
        throws(() => read((field(col) as any)[member](), raw))
      )
    );
  check(
    "quantile(p) on a column of numbers names derive(kde(...))",
    /derive\(kde\(/.test(throws(() => read(field(col).quantile(0.9), raw)))
  );
  check(
    "median() on a column of numbers is the data's median",
    (read(field(col).median(), raw) as any).value ===
      medianOf(raw.map((p) => p[col] as number))
  );
}

console.log("\n# units");
{
  const usd = { unit: "USD", symbol: "$", traits: { CanSum: {} } };
  const rows = kde("v")([{ v: 1 }, { v: 2 }, { v: 4 }]);
  const col = { name: "v", unit: usd };
  const dens = evalGroup(field("v").density() as any, rows, col);
  check(
    "a kernel density is the count per the variable's unit, which adds up",
    dens.quantity?.unit?.unit === "count per USD" &&
      dens.quantity?.unit?.traits?.CanSum !== undefined
  );
  const t = {
    unit: "instant",
    traits: {},
    difference: { unit: "duration", traits: { CanSum: {} } },
  };
  const tdens = evalGroup(field("v").density() as any, rows, {
    name: "t",
    unit: t,
  });
  check(
    "a density over times is per duration",
    tdens.quantity?.unit?.unit === "count per duration"
  );
  const sup = evalGroup(field("v").domain() as any, rows, col);
  check("a domain is in the variable", sup.quantity === col);
  const typedIn = await applySchema([{ v: 1 }, { v: 2 }, { v: 4 }], {
    v: { unit: UnitNS("USD") },
  } as any);
  // As derive types its result: the input's column types, inherited.
  const typed = await applySchema(
    kde("v")(typedIn),
    {},
    getColumnTypes(typedIn)
  );
  const fromSchema = evalGroup(
    field("v").density() as any,
    typed,
    resolveColumn(typed, field("v")).quantity
  );
  check(
    "a column that holds a distribution keeps its unit",
    fromSchema.quantity?.unit?.unit === "count per USD",
    String(fromSchema.quantity?.unit?.unit)
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
    "its density, like its variable, has no name",
    dens.quantity !== undefined && dens.quantity.name === undefined
  );
  const sup = evalGroup(d.domain() as any, [params[1]], undefined);
  check(
    "its variable is not the location column: no name",
    sup.quantity !== undefined && sup.quantity.name === undefined
  );
  const usd = await applySchema([{ mean: 5, sd: 2 }], {
    mean: { unit: UnitNS("USD") },
  } as any);
  const supUsd = evalGroup(d.domain() as any, usd, undefined);
  check(
    "its variable is in the location column's unit",
    supUsd.quantity?.unit?.unit === "USD" && supUsd.quantity.name === undefined
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
    (evalGroup(fixed.quantile(0.975) as any, [], undefined) as any).value > 1.95
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
    /Read a member/.test(
      throws(() => evalGroup(d as any, [params[0]], undefined))
    )
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
    fromWire.kind === "function" &&
      fromWire.fun.at(5) === (dens as any).fun.at(5)
  );
  const nested = JSON.parse(
    JSON.stringify(
      DistNS.normal({ mean: field("mean").mean(), sd: 1 }).median()
    )
  );
  check(
    "a value expression parameter is written in its wire form",
    nested.params.mean.type === "field" &&
      nested.params.mean.ops[0].op === "mean"
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
  check(
    "a distribution expression validates",
    r1.ok,
    JSON.stringify((r1 as any).errors)
  );
  const r2 = ok(JSON.parse(JSON.stringify(field("x").density())));
  check(
    "a field's density validates",
    r2.ok,
    JSON.stringify((r2 as any).errors)
  );
  const r3 = ok({ type: "dist", family: "gamma", params: {} });
  check("an unknown family does not", !r3.ok);
  const r4 = ok({ type: "dist", family: "normal", params: { mean: 0 } });
  check("a missing parameter does not", !r4.ok);
}

console.log("\n# a distribution's cells");
{
  const d = DistNS.normal({ mean: "mean", sd: "sd" });
  const rows = [{ mean: 0, sd: 1 }];
  const groups = [...splitEntries(d.bin(BinNS.quantiles(5)) as any, rows)];
  check("Bin.quantiles(5) makes five cells", groups.length === 5);
  check(
    "each cell's group holds every row",
    groups.every(([, g]) => g.length === 1 && g[0] === rows[0])
  );
  const [, second] = groups[1];
  const med = (evalGroup(d.median() as any, second, undefined) as any).value;
  check(
    "the median in a cell is the whole's quantile at the cell's middle probability",
    near(med, normalQuantile(0.3), 1e-3),
    String(med)
  );
  const mass = (evalGroup(d.mass() as any, second, undefined) as any).value;
  check("the mass in a quintile is 0.2", near(mass, 0.2, 1e-3), String(mass));
  const sup = evalGroup(d.domain() as any, second, undefined) as any;
  check(
    "the domain in a cell is the cell",
    near(sup.fun.domain.min, normalQuantile(0.2), 1e-3) &&
      near(sup.fun.domain.max, normalQuantile(0.4), 1e-3),
    JSON.stringify(sup.fun.domain)
  );
  check(
    "a member of a distribution is not binned",
    throws(() => (d.median() as any).bin(BinNS.quantiles(5))) !== ""
  );
}

console.log("\n# the cells of a field that holds a distribution");
{
  const mass = field("Body Mass (g)");
  const rows = await applySchema(kde("Body Mass (g)")(penguins), {});
  const groups = [...splitEntries(mass.bin(BinNS.quantiles(4)) as any, rows)];
  check("Bin.quantiles(4) makes four cells", groups.length === 4);
  check(
    "each cell's group holds the row",
    groups.every(([, g]) => g.length === 1 && g[0] === rows[0])
  );
  const [, first] = groups[0];
  const whole = evalGroup(mass.density() as any, rows, undefined) as any;
  const cell = evalGroup(mass.density() as any, first, undefined) as any;
  const t = (cell.fun.domain.min + cell.fun.domain.max) / 2;
  check(
    "the density in a cell is the whole's, restricted",
    near(cell.fun.at(t), whole.fun.at(t), 1e-9),
    `${cell.fun.at(t)} vs ${whole.fun.at(t)}`
  );
  check(
    "its domain ends at the cell's edge",
    cell.fun.domain.max < whole.fun.domain.max
  );
  check(
    "the first cell holds the tail below the drawn interval",
    cell.fun.domain.min === whole.fun.domain.min
  );
  const [, last] = groups[groups.length - 1];
  const lastCell = evalGroup(mass.density() as any, last, undefined) as any;
  check(
    "the last cell holds the tail above it",
    lastCell.fun.domain.max === whole.fun.domain.max
  );
  const domains = groups.map(
    ([, g]) => (evalGroup(mass.domain() as any, g, undefined) as any).fun.domain
  );
  check(
    "the cells partition the domain",
    domains.every((dom: any, i: number) =>
      i === 0 ? true : dom.min === domains[i - 1].max
    )
  );
  const d = distOf(rows[0]["Body Mass (g)"] as DistData);
  check(
    "the cells are at the distribution's own quartiles",
    near(domains[1].min, d.quantile(0.25), 1e-6) &&
      near(domains[2].min, d.median, 1e-6) &&
      near(domains[3].min, d.quantile(0.75), 1e-6)
  );
  check(
    "a cell's median is the whole's quantile at the middle of its share",
    near(
      (evalGroup(mass.median() as any, groups[1][1], undefined) as any).value,
      d.quantile(0.375),
      1e-6
    )
  );
  check(
    "a field's bin of a distribution takes no other op",
    /bin/.test(
      throws(() => [
        ...splitEntries(
          (mass.bin(BinNS.quantiles(4)) as any).bin(BinNS.step(10)),
          rows
        ),
      ])
    )
  );
}

{
  // A family is drawn from its 0.001 to its 0.999 quantile; the cells at
  // the ends of that interval hold the tails past it, so the quintiles of
  // a normal hold a fifth of its mass each.
  const d = familyDist("normal", { mean: 0, sd: 1 });
  const { min, max } = d.domain.domain;
  const edges = [min, ...[0.2, 0.4, 0.6, 0.8].map(d.quantile), max];
  const cells = edges
    .slice(0, -1)
    .map((lo, i) => restrictDist(d, { min: lo, max: edges[i + 1] }));
  check(
    "a family's quantile cells each hold their share, the tails included",
    cells.every((c) => near(c.mass, 0.2, 1e-9)),
    JSON.stringify(cells.map((c) => c.mass))
  );
  check(
    "an end cell's median is the family's quantile at the middle of its share",
    near(cells[0].median, d.quantile(0.1), 1e-9) && cells[0].quantile(0) === min
  );
}
{
  // A distribution whose parameter is a JS reduce has no wire form, as the
  // reduce alone has none: the emitter drops it rather than write the
  // reduce without its function.
  const closure = DistNS.normal({
    mean: new FieldExpr("t").reduce((xs: number[]) => xs[0]),
    sd: 1,
  });
  const named = DistNS.normal({ mean: new FieldExpr("t").mean(), sd: 1 });
  check(
    "a distribution with a JS reduce parameter has no wire form",
    hasNoWireForm(closure.density()) && !hasNoWireForm(named.density())
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
