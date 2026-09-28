/**
 * Extension packages: popular packages from an arm's own ecosystem that
 * draw chart forms its core library has no mark for (treemaps, circle
 * packing, waffles, mosaics, ridgelines). A run either offers them to every
 * arm that has them (`--extensions on`, the default) or to none
 * (`--extensions off`), so a baseline can be measured both with and without
 * them. GoFish, Recharts and D3 have no entry (D3's hierarchy layouts are
 * part of d3 itself).
 *
 * This table is the one source of truth: the system prompt's "May use"
 * sentence (prompt.ts), the Python arms' uv pins and the runtime probes
 * (render.ts), and the ggplot2 arm's static check all read it.
 */

import type { Arm } from "./tasks";

export type Extensions = "on" | "off";
export const EXTENSION_SETTINGS: Extensions[] = ["on", "off"];

export interface ExtensionPackage {
  /** The package's name (R) or its import name (Python). */
  name: string;
  /** What it draws, for the prompt. */
  use: string;
  /** Python: the pinned requirement uv installs. R packages are installed
   *  system-wide by hand (see the README). */
  pin?: string;
}

export const EXTENSIONS: Partial<
  Record<Arm, { intro: string; packages: ExtensionPackage[] }>
> = {
  ggplot2: {
    intro: "these popular ggplot2 extensions",
    packages: [
      { name: "ggmosaic", use: "mosaic plots" },
      { name: "ggridges", use: "ridgeline plots" },
      { name: "treemapify", use: "treemaps" },
      { name: "packcircles", use: "circle packing" },
      { name: "ggforce", use: "arcs, circles and more geoms" },
      { name: "waffle", use: "waffle charts" },
    ],
  },
  matplotlib: {
    intro: "these layout helpers",
    packages: [
      { name: "squarify", use: "treemaps", pin: "squarify==0.4.5" },
      { name: "circlify", use: "circle packing", pin: "circlify==0.15.1" },
      { name: "pywaffle", use: "waffle charts", pin: "pywaffle==1.2.0" },
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
 * ggplot2 with extensions off: the R packages are installed system-wide,
 * so nothing stops a script from loading them. This static check rejects
 * `library()`, `require()`, `requireNamespace()` and `pkg::` uses of the
 * extension packages (outside comments), as the environment error an
 * import of a missing package would be. It cannot see a package loaded
 * through a variable (`library(p, character.only = TRUE)`). Null when the
 * script uses none, or when extensions are on.
 */
export function unavailablePackage(
  arm: Arm,
  code: string,
  setting: Extensions
): string | null {
  if (arm !== "ggplot2" || setting === "on") return null;
  const src = code.replace(/#[^\n]*/g, "");
  for (const { name } of EXTENSIONS.ggplot2!.packages) {
    const q = `["']?${name}["']?`;
    const load = new RegExp(
      `\\b(library|require|requireNamespace|loadNamespace)\\s*\\(\\s*(package\\s*=\\s*)?${q}\\s*[,)]`
    );
    const ns = new RegExp(`(^|[^\\w.])${name}:::?`, "m");
    if (load.test(src) || ns.test(src))
      return `The R package ${name} is not available in this run.`;
  }
  return null;
}
