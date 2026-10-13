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

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nall family checks passed");
