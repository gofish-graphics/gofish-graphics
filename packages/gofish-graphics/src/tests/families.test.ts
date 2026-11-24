/**
 * Strategy families (#1013): each module in `src/families/` is one family,
 * bound in `lib.ts` under its capitalized name and published as the subpath
 * `gofish-graphics/<name>`. This checks that the three lists agree: the
 * modules, the `export * as` lines in `lib.ts`, and `package.json`'s
 * `exports` (the Vite entries are read from the directory, so they cannot
 * drift). It also checks that the namespace and the module are one object, so
 * `Curve.monotone` and `import { monotone } from "gofish-graphics/curve"` are
 * the same function in the built bundle.
 *
 *   pnpm test:families
 */
import { readdirSync, readFileSync } from "node:fs";
import { Frontend } from "gofish-ir";
// The built bundle, as a user imports it: `dist/index.js` is the package
// root and `dist/<name>.js` the subpath (run after `pnpm build`).
import * as GoFish from "../../dist/index.js";

declare const process: { exit(code: number): never };

const SRC = new URL("../", import.meta.url);
const PKG = new URL("../../package.json", import.meta.url);

let failed = 0;
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) console.log(`  ✓ ${name}`);
  else {
    failed++;
    console.error(`  ✗ ${name}${detail ? `: ${detail}` : ""}`);
  }
}

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);

const families = readdirSync(new URL("families/", SRC))
  .filter((f) => f.endsWith(".ts"))
  .map((f) => f.replace(/\.ts$/, ""))
  .sort();

const libSrc = readFileSync(new URL("lib.ts", SRC), "utf-8");
const bound = [
  ...libSrc.matchAll(/^export \* as (\w+) from "\.\/families\/(\w+)";$/gm),
].map(([, ns, file]) => ({ ns, file }));

check(
  "lib.ts binds every family module, under its capitalized name",
  JSON.stringify(bound.map((b) => b.file).sort()) ===
    JSON.stringify(families) &&
    bound.every((b) => b.ns === capitalize(b.file)),
  `modules ${families.join(", ")}; lib.ts binds ${bound
    .map((b) => `${b.ns} = ${b.file}`)
    .join(", ")}`
);

const exportsMap = JSON.parse(readFileSync(PKG, "utf-8")).exports as Record<
  string,
  { types: string; import: string }
>;
const subpaths = Object.keys(exportsMap)
  .filter((k) => k !== ".")
  .map((k) => k.replace(/^\.\//, ""))
  .sort();
check(
  "package.json exports one subpath per family",
  JSON.stringify(subpaths) === JSON.stringify(families),
  `families ${families.join(", ")}; exports ${subpaths.join(", ")}`
);
for (const f of families) {
  const entry = exportsMap[`./${f}`];
  check(
    `exports["./${f}"] points at the built family module`,
    entry?.import === `./dist/${f}.js` &&
      entry?.types === `./dist/families/${f}.d.ts` &&
      Object.keys(entry)[0] === "types",
    JSON.stringify(entry)
  );
}

for (const f of families) {
  const mod = await import(`../../dist/${f}.js`);
  const ns = (GoFish as Record<string, any>)[capitalize(f)];
  const names = Object.keys(mod);
  check(
    `${capitalize(f)} is the ${f} module`,
    names.length > 0 &&
      names.every((n) => ns?.[n] === mod[n]) &&
      Object.keys(ns ?? {}).length === names.length,
    `module ${names.join(", ")}; namespace ${Object.keys(ns ?? {}).join(", ")}`
  );
  const flat = names.filter((n) => n in GoFish);
  check(
    `${capitalize(f)}'s members are not also top-level exports`,
    flat.length === 0,
    flat.join(", ")
  );
}

// Bare kinds (#1133): every kind (and preset) of a STRATEGIES family with no
// required option is a value as it is, and calling it sets options. The bare
// kind is indistinguishable from its call with no arguments: same keys, same
// JSON. Where it enters an option, it is read as that call (`withKindValues`),
// so a reader checks the call. A kind with a required option is a call only.
console.log("\n# bare strategy kinds");
for (const [family, spec] of Object.entries(Frontend.STRATEGIES) as Array<
  [string, Frontend.StrategyFamily]
>) {
  const ns = (GoFish as Record<string, any>)[family];
  const members = [
    ...Object.entries(spec.kinds).map(([name, k]) => ({
      name,
      params: k.params,
    })),
    ...Object.keys(spec.presets ?? {}).map((name) => ({
      name,
      params: Frontend.presetParams(family, name),
    })),
  ];
  for (const { name, params } of members) {
    const member = ns?.[name];
    const required = Object.values(params).some((p) => p.required);
    if (required) {
      check(
        `${family}.${name} has a required option, so it is a call only`,
        typeof member === "function" && !("kind" in member)
      );
      continue;
    }
    const called = typeof member === "function" ? member() : undefined;
    let why = "";
    try {
      Frontend.checkStrategy(
        family as Frontend.StrategyFamilyName,
        Frontend.encodeIR({ v: called }).v,
        name
      );
    } catch (e) {
      why = (e as Error).message;
    }
    check(
      `${family}.${name} bare is ${family}.${name}()`,
      typeof member === "function" &&
        member.kind === called?.kind &&
        JSON.stringify(Object.keys(member)) ===
          JSON.stringify(Object.keys(called)) &&
        JSON.stringify(member) === JSON.stringify(called) &&
        why === "",
      why ||
        `bare ${JSON.stringify(member)}, called ${JSON.stringify(called)}`
    );
  }
}
// A preset is an exact point of its kind: it fixes the values `STRATEGIES`
// declares and takes only its kind's other params. A fixed one is an error
// that names the kind call with the same values; an open one sets that param.
console.log("\n# a preset takes only the options it does not fix");
for (const [family, spec] of Object.entries(Frontend.STRATEGIES) as Array<
  [string, Frontend.StrategyFamily]
>) {
  const ns = (GoFish as Record<string, any>)[family];
  for (const [name, preset] of Object.entries(spec.presets ?? {})) {
    const kindParams = spec.kinds[preset.kind].params;
    const open = Frontend.presetParams(family, name);
    check(
      `${family}.${name} fixes at least one param, and its options are ` +
        `${family}.${preset.kind}'s others`,
      Object.keys(preset.values).length > 0 &&
        JSON.stringify(Object.keys(open)) ===
          JSON.stringify(
            Object.keys(kindParams).filter((k) => !(k in preset.values))
          ),
      JSON.stringify(Object.keys(open))
    );
    for (const [field, value] of Object.entries(preset.values)) {
      let message = "";
      try {
        ns[name]({ [field]: value });
      } catch (e) {
        message = (e as Error).message;
      }
      check(
        `${family}.${name}({ ${field} }) is an error naming ${family}.${preset.kind}`,
        message.includes(`${family}.${name}({ ${field} })`) &&
          message.includes(`${family}.${preset.kind}(`),
        message
      );
    }
    // An open param, set to its declared default, reaches the object, and
    // the fixed values stay.
    for (const [field, p] of Object.entries(open)) {
      if (p.default === undefined) continue;
      const made = ns[name]({ [field]: p.default });
      check(
        `${family}.${name}({ ${field} }) sets ${field}`,
        made.kind === preset.kind &&
          JSON.stringify(made[field]) === JSON.stringify(p.default) &&
          Object.entries(preset.values).every(
            ([k, v]) => JSON.stringify(made[k]) === JSON.stringify(v)
          ),
        JSON.stringify(made)
      );
    }
  }
}
// The Coord family's presets (`COORD_PRESETS`) follow the same rule: a
// preset of a transform of `COORDS` takes only that transform's other
// options, and is that transform on the wire and in layout.
console.log("\n# a coord preset takes only the options it does not fix");
{
  const { Coord, Serialize, chart, rect } = GoFish as Record<string, any>;
  const pie = (coord: unknown) =>
    chart(
      [
        { k: "a", v: 3 },
        { k: "b", v: 5 },
      ],
      { coord, w: 200, h: 200 }
    )
      .flow(GoFish.stack({ by: "k", dir: "x" }))
      .mark(rect({ w: "v", fill: "k" }));
  for (const [name, preset] of Object.entries(Frontend.COORD_PRESETS)) {
    const kindParams = Frontend.resolveFields(Frontend.COORDS[preset.kind]);
    const open = Frontend.presetParams("Coord", name);
    check(
      `Coord.${name}'s options are Coord.${preset.kind}'s others`,
      JSON.stringify(Object.keys(open)) ===
        JSON.stringify(
          Object.keys(kindParams).filter((k) => !(k in preset.values))
        ),
      JSON.stringify(Object.keys(open))
    );
    for (const [field, value] of Object.entries(preset.values)) {
      let message = "";
      try {
        Coord[name]({ [field]: value });
      } catch (e) {
        message = (e as Error).message;
      }
      check(
        `Coord.${name}({ ${field} }) is an error naming Coord.${preset.kind}`,
        message.includes(`Coord.${name}({ ${field} })`) &&
          message.includes(`Coord.${preset.kind}({ `),
        message
      );
    }
    // The preset is its kind with the values it fixes: the same IR and the
    // same drawing, with and without an open option.
    for (const opts of [{}, { innerRadius: 0.4 }]) {
      const viaPreset = pie(Coord[name](opts));
      const viaKind = pie(Coord[preset.kind]({ ...preset.values, ...opts }));
      const [a, b] = await Promise.all(
        [viaPreset, viaKind].map(async (c) =>
          JSON.stringify(await Serialize.toJSON(c))
        )
      );
      check(
        `Coord.${name}(${JSON.stringify(opts)}) has the IR of Coord.${preset.kind} with its values`,
        a === b && a.includes(`"type":"${preset.kind}"`),
        `${a}\n${b}`
      );
      // Each node's id counts the nodes made before it, so it is left out.
      const [da, db] = await Promise.all(
        [viaPreset, viaKind].map(async (c) =>
          JSON.stringify(await c.toDisplayList({ w: 200, h: 200 }), (k, v) =>
            k === "id" ? undefined : v
          )
        )
      );
      check(
        `Coord.${name}(${JSON.stringify(opts)}) lays out as Coord.${preset.kind} with its values`,
        da === db
      );
    }
  }
  // The rebuilt coord is the same transform: a round trip keeps the values.
  const doc = await Serialize.toJSON(pie(Coord.clock()));
  const back = await Serialize.toJSON(Serialize.buildIR(doc));
  check(
    "Coord.clock() round-trips through the wire as polar with its values",
    JSON.stringify(back) === JSON.stringify(doc),
    JSON.stringify(back)
  );
}
{
  const { Calendar, Curve } = GoFish as Record<string, any>;
  check(
    "Calendar.month bare is a CalendarPartition, and sameCells as its call",
    Calendar.month instanceof GoFish.CalendarPartition &&
      Calendar.month.sameCells(Calendar.month()) &&
      Calendar.month({ every: 3 }).sameCells(Calendar.month({ every: 3 })) &&
      !Calendar.month.sameCells(Calendar.month({ every: 3 }))
  );
  check(
    "a bare Calendar kind has .format(fn), as its call does",
    Calendar.quarter.format(() => "q").formatCell !== undefined &&
      Calendar.quarter().format(() => "q").formatCell !== undefined
  );
  const errorOf = (f: () => unknown): string => {
    try {
      f();
      return "";
    } catch (e) {
      return (e as Error).message;
    }
  };
  const every = errorOf(() => Calendar.month.every(3));
  check(
    "Calendar.month.every(3) is a loud error naming ({ every: 3 })",
    every.includes("Calendar.month({ every: 3 })"),
    every
  );
  const step = errorOf(() => Calendar.month({ step: 3 }));
  check(
    "Calendar.month({ step: 3 }) is a loud error naming every",
    step.includes('unknown field "step"') && step.includes('"every"'),
    step
  );
  // A bare kind is read as its value where options enter, at any depth, so
  // the IR holds only values: a chart's options (`axes.x.levels`), and an
  // operator's or a mark's.
  const { chart, scatter, circle, Serialize, Overlap } = GoFish as Record<
    string,
    any
  >;
  const ir = await Serialize.toJSON(
    chart([{ d: 0, y: 1 }], {
      axes: { x: { levels: [Calendar.year, true] } },
    })
      .flow(scatter({ x: "d", y: "y", overlap: Overlap.separate }))
      .mark(circle({ r: 2 }))
  );
  const level = ir.root.options?.axes?.x?.levels?.[0];
  const overlap = ir.root.operators?.[0]?.overlap;
  const valid = Frontend.validate(ir);
  check(
    "a bare kind in a chart's nested options, or an operator's, is its " +
      "value in the IR",
    typeof level === "object" &&
      level.kind === "year" &&
      typeof overlap === "object" &&
      overlap.kind === "separate" &&
      valid.valid,
    `${typeof level} ${JSON.stringify(level)} / ${typeof overlap} / ` +
      JSON.stringify(valid.valid ? [] : valid.errors)
  );
  const positional = errorOf(() => Curve.arc("down"));
  check(
    "a bare kind's call takes an options object",
    positional.includes("Curve.arc") && positional.includes("options object"),
    positional
  );
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nall family checks passed");
