/**
 * Extension packages: the companion packages people routinely install next
 * to an arm's library, from its own ecosystem, to draw chart forms the core
 * library has no mark or layout for (treemaps, circle packing, waffles,
 * mosaics, ridgelines, sankeys and alluvials, hexbins, beeswarms,
 * dendrograms). A run either offers them to every arm that has them
 * (`--extensions on`, the default) or to none (`--extensions off`), so a
 * baseline can be measured both with and without them. GoFish (the library
 * under test) and Recharts have no entry (see the README).
 *
 * This table is the one source of truth: the system prompt's "May use"
 * sentence (prompt.ts), the Python arms' uv pins and the runtime probes
 * (render.ts), and the static check for packages that are installed but
 * off (R and the JS arms) all read it.
 */

import type { Arm } from "./tasks";

export type Extensions = "on" | "off";
export const EXTENSION_SETTINGS: Extensions[] = ["on", "off"];

export interface ExtensionPackage {
  /** The package's name (R), its import name (Python), or its npm name,
   *  which is also its import specifier (JS). */
  name: string;
  /** What it draws, for the prompt. */
  use: string;
  /** Python: the pinned requirement uv installs. npm packages are pinned
   *  in tests/package.json; R packages are installed system-wide by hand
   *  (see the README). */
  pin?: string;
}

/** The d3 modules the d3 and plot arms share: Plot users pull d3 modules
 *  the same way they pull d3 itself. Pinned in tests/package.json. */
const D3_MODULES: ExtensionPackage[] = [
  { name: "d3-sankey", use: "sankey and alluvial layouts" },
  { name: "d3-hexbin", use: "hexagonal binning" },
];

export const EXTENSIONS: Partial<
  Record<Arm, { intro: string; packages: ExtensionPackage[] }>
> = {
  d3: {
    intro: "these D3 modules, each imported by its package name",
    packages: D3_MODULES,
  },
  plot: {
    intro: "these D3 modules, each imported by its package name",
    packages: D3_MODULES,
  },
  ggplot2: {
    intro: "these popular ggplot2 extensions",
    packages: [
      { name: "ggmosaic", use: "mosaic plots" },
      { name: "ggridges", use: "ridgeline plots" },
      { name: "treemapify", use: "treemaps" },
      { name: "packcircles", use: "circle packing" },
      { name: "ggforce", use: "arcs, circles and more geoms" },
      { name: "waffle", use: "waffle charts" },
      { name: "ggalluvial", use: "alluvial diagrams" },
      { name: "ggbeeswarm", use: "beeswarm plots" },
      { name: "ggraph", use: "dendrograms, trees and networks" },
      { name: "tidygraph", use: "graph data for ggraph" },
      { name: "igraph", use: "graph data for ggraph" },
      { name: "hexbin", use: "hexagonal binning, for geom_hex" },
    ],
  },
  matplotlib: {
    intro: "these layout helpers",
    packages: [
      { name: "squarify", use: "treemaps", pin: "squarify==0.4.5" },
      { name: "circlify", use: "circle packing", pin: "circlify==0.15.1" },
      { name: "pywaffle", use: "waffle charts", pin: "pywaffle==1.2.0" },
      {
        name: "scipy",
        use: "dendrograms, with scipy.cluster.hierarchy",
        pin: "scipy==1.15.3",
      },
    ],
  },
  altair: {
    intro: "these layout helpers",
    packages: [
      { name: "squarify", use: "treemaps", pin: "squarify==0.4.5" },
      { name: "circlify", use: "circle packing", pin: "circlify==0.15.1" },
    ],
  },
};

export const hasExtensions = (arm: Arm): boolean => arm in EXTENSIONS;

/** The extension packages `arm` may use under `setting` (none when off). */
export function extensionPackages(
  arm: Arm,
  setting: Extensions
): ExtensionPackage[] {
  return setting === "on" ? (EXTENSIONS[arm]?.packages ?? []) : [];
}

/** "a, b and c" */
const list = (xs: string[]) =>
  xs.length <= 1
    ? xs.join("")
    : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;

/** The clause the prompt's "May use" line gets for the extensions: ", and
 *  these ...: x (what), y (what)" when on, "" when off (so the line reads
 *  as it did before extensions existed). */
export function extensionsClause(arm: Arm, setting: Extensions): string {
  const pkgs = extensionPackages(arm, setting);
  if (pkgs.length === 0) return "";
  return `, and ${EXTENSIONS[arm]!.intro}: ${list(pkgs.map((p) => `${p.name} (${p.use})`))}`;
}

/** The field a job result records: the run's setting, on arms that have
 *  extensions only. */
export function extensionsField(
  arm: Arm,
  setting: Extensions
): { extensions?: Extensions } {
  return hasExtensions(arm) ? { extensions: setting } : {};
}

/** A job's setting: results from before extensions existed ran without
 *  them. Undefined for an arm that has no extensions. */
export function extensionsOf(r: {
  arm: Arm;
  extensions?: Extensions;
}): Extensions | undefined {
  return hasExtensions(r.arm) ? (r.extensions ?? "off") : undefined;
}

/**
 * Extensions off, where the packages are installed anyway: the R packages
 * (system-wide) and the JS arms' npm modules (in tests/). This static check
 * rejects a program that loads one, as the environment error an import of
 * a missing package would be:
 *
 *   - ggplot2: `library()`, `require()`, `requireNamespace()`,
 *     `loadNamespace()` and `pkg::` uses (outside comments). It cannot see
 *     a package loaded through a variable (`library(p, character.only =
 *     TRUE)`).
 *   - d3 and plot: a static or dynamic import of the package (or of a path
 *     inside it).
 *
 * The Python arms need no check: uv does not install their packages. Null
 * when the program uses none, or when extensions are on.
 */
export function unavailablePackage(
  arm: Arm,
  code: string,
  setting: Extensions
): string | null {
  if (setting === "on") return null;
  const pkgs = EXTENSIONS[arm]?.packages ?? [];
  if (arm === "ggplot2") {
    const src = code.replace(/#[^\n]*/g, "");
    for (const { name } of pkgs) {
      const q = `["']?${name}["']?`;
      const load = new RegExp(
        `\\b(library|require|requireNamespace|loadNamespace)\\s*\\(\\s*(package\\s*=\\s*)?${q}\\s*[,)]`
      );
      const ns = new RegExp(`(^|[^\\w.])${name}:::?`, "m");
      if (load.test(src) || ns.test(src))
        return `The R package ${name} is not available in this run.`;
    }
  } else if (arm === "d3" || arm === "plot") {
    const specs = [
      ...code.matchAll(/\b(?:from|import)\s*\(?\s*["']([^"']+)["']/g),
    ].map((m) => m[1]);
    for (const { name } of pkgs)
      if (specs.some((s) => s === name || s.startsWith(name + "/")))
        return `The package ${name} is not available in this run.`;
  }
  return null;
}
