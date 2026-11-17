/**
 * publicExports.mjs — the public surface of the GoFish packages, read from
 * their source with the TypeScript checker.
 *
 * The docs publish code that imports from the packages by name
 * ("gofish-graphics", "gofish-graphics/coord", "gofish-gotree"), and the
 * stories that code comes from import from the source tree instead
 * (`../../src/lib`, `../../src/families/coord`). This module answers both
 * questions the docs tooling asks about that:
 *
 *   - which names a package specifier exports (`names`), for the check of
 *     the handwritten docs' code blocks (scripts/check-doc-snippets.mjs);
 *   - which public name, if any, a name exported by a source file is
 *     (`resolveName`, `resolveNamespace`), for the gallery loader
 *     (storyExamples.ts), which rewrites a story's source imports into
 *     package imports.
 *
 * A name is matched by the symbol it resolves to, not by its spelling, so a
 * renamed export (`export { value as v }`) is found under its public name,
 * and an internal export that shares a public name is not public.
 *
 * The entries are the packages' `exports` maps read back to their source
 * files: a subpath's `types` file `./dist/<path>.d.ts` is built from
 * `src/<path>.ts`, and the root entry of gofish-graphics is `src/lib.ts`
 * (its vite `lib.entry.index`). Source parsing needs no build step, so the
 * checks can run with nothing compiled.
 *
 * The checker is gofish-graphics' own `typescript`, the compiler its
 * tsconfig is written for (the docs package has a newer one, which rejects
 * that config's options). `ts` is exported for a caller that builds a
 * program on `options`.
 *
 * Synchronous and dependency-free beyond `typescript`, since the VitePress
 * data loader imports it at build time.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../.."
);

export const ts = createRequire(
  join(REPO_ROOT, "packages/gofish-graphics/package.json")
)("typescript");

/** Each package: its directory, and the source file of its root entry. */
const PACKAGES = [
  {
    name: "gofish-graphics",
    dir: "packages/gofish-graphics",
    root: "src/lib.ts",
  },
  {
    name: "gofish-gotree",
    dir: "packages/gofish-gotree",
    root: "src/index.ts",
  },
];

/** Package specifier → absolute source file, root entries first. */
function entryFiles() {
  const entries = new Map();
  for (const pkg of PACKAGES) {
    const dir = join(REPO_ROOT, pkg.dir);
    entries.set(pkg.name, join(dir, pkg.root));
    const json = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8"));
    for (const [subpath, target] of Object.entries(json.exports ?? {})) {
      if (subpath === "." || typeof target?.types !== "string") continue;
      const m = /^\.\/dist\/(.+)\.d\.ts$/.exec(target.types);
      if (!m) throw new Error(`${pkg.name}: no source for ${target.types}`);
      entries.set(
        `${pkg.name}/${subpath.replace(/^\.\//, "")}`,
        join(dir, "src", `${m[1]}.ts`)
      );
    }
  }
  return entries;
}

/** The compiler options of gofish-graphics' tsconfig. They keep the
 *  config's path, so its `types` (`vite/client`) resolve from the package
 *  that installs them, not from the working directory. A config that does
 *  not read or parse cleanly is an error, never a silent default. */
function compilerOptions() {
  const path = join(REPO_ROOT, "packages/gofish-graphics/tsconfig.json");
  const read = ts.readConfigFile(path, ts.sys.readFile);
  if (read.error) throw new Error(diagnosticText(read.error));
  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    dirname(path),
    undefined,
    path
  );
  if (parsed.errors.length)
    throw new Error(parsed.errors.map(diagnosticText).join("\n"));
  return { ...parsed.options, noEmit: true };
}

const diagnosticText = (d) =>
  ts.flattenDiagnosticMessageText(d.messageText, "\n");

let cached;

/**
 * The public surface, built once per process:
 *
 * - `entries`: package specifier → its source file.
 * - `names(specifier)`: the names it exports (undefined for an unknown one).
 * - `resolveName(file, name, { value })`: the `{ specifier, name }` under
 *   which the export `name` of the source file `file` is public (under
 *   `name` itself when it is one of its public names), or undefined. With
 *   `value: true` only a value public as a value counts (not one an entry
 *   exports with `export type`), since a value import of a type does not run.
 * - `resolveNamespace(file, local)`: how a namespace import of `file` is
 *   public: `{ specifier }` when `file` is an entry, `{ specifier, name }`
 *   when an entry exports it as a namespace (`export * as Coord`), under
 *   `local` when that is one of its names, else undefined.
 * - `options`: the packages' compiler options, for a caller that type
 *   checks code against the packages. The program itself leaves out their
 *   ambient types, which what a module exports does not depend on.
 */
export function publicSurface() {
  if (cached) return cached;
  const entries = entryFiles();
  const options = compilerOptions();
  const program = ts.createProgram([...entries.values()], {
    ...options,
    types: [],
  });
  const problems = program.getOptionsDiagnostics();
  if (problems.length) throw new Error(problems.map(diagnosticText).join("\n"));
  const checker = program.getTypeChecker();

  const target = (sym) =>
    sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
  // An export a type-only declaration (`export type { X }`) makes or passes
  // on is public as a type only, whatever the symbol it names.
  const typeOnly = (sym) => {
    for (let s = sym; s && s.flags & ts.SymbolFlags.Alias; ) {
      if (s.declarations?.some(ts.isTypeOnlyImportOrExportDeclaration))
        return true;
      s = checker.getImmediateAliasedSymbol(s);
    }
    return false;
  };
  const moduleOf = (file) => {
    const sf = program.getSourceFile(file);
    return sf && checker.getSymbolAtLocation(sf);
  };

  const exported = new Map(); // specifier -> Set of names
  const bySymbol = new Map(); // target symbol -> [{ specifier, name, typeOnly }]
  const entryOf = new Map(); // module symbol -> specifier
  for (const [specifier, file] of entries) {
    const mod = moduleOf(file);
    if (!mod) throw new Error(`${specifier}: ${file} is not a module`);
    entryOf.set(mod, specifier);
    const names = new Set();
    for (const sym of checker.getExportsOfModule(mod)) {
      names.add(sym.name);
      const t = target(sym);
      if (!bySymbol.has(t)) bySymbol.set(t, []);
      bySymbol
        .get(t)
        .push({ specifier, name: sym.name, typeOnly: typeOnly(sym) });
    }
    exported.set(specifier, names);
  }

  const resolveName = (file, name, { value = false } = {}) => {
    const mod = moduleOf(file);
    const sym = mod && checker.tryGetMemberInModuleExports(name, mod);
    if (!sym) return undefined;
    const t = target(sym);
    if (value && !(t.flags & ts.SymbolFlags.Value)) return undefined;
    // A symbol public under several names (`value`, and `v` for it) keeps
    // the name it was imported by when that is one of them. A value import
    // needs a name that is public as a value.
    const all = (bySymbol.get(t) ?? []).filter((p) => !(value && p.typeOnly));
    const p = all.find((p) => p.name === name) ?? all[0];
    return p && { specifier: p.specifier, name: p.name };
  };

  const resolveNamespace = (file, local) => {
    const mod = moduleOf(file);
    if (!mod) return undefined;
    if (entryOf.has(mod)) return { specifier: entryOf.get(mod) };
    const all = (bySymbol.get(mod) ?? []).filter((p) => !p.typeOnly);
    const p = all.find((p) => p.name === local) ?? all[0];
    return p && { specifier: p.specifier, name: p.name };
  };

  cached = {
    entries,
    names: (specifier) => exported.get(specifier),
    resolveName,
    resolveNamespace,
    options,
  };
  return cached;
}
