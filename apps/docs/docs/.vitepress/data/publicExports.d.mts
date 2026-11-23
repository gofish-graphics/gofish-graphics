/**
 * Types of publicExports.mjs, which plain Node scripts import as well as the
 * TypeScript gallery loader (storyExamples.ts). See that file for what each
 * member does.
 */
import type * as TS from "typescript";

/** A public name: the package specifier and the name it exports. */
export interface PublicName {
  specifier: string;
  name: string;
}

export interface PublicSurface {
  /** Package specifier → its source file. */
  entries: Map<string, string>;
  /** The names a specifier exports, or undefined for an unknown one. */
  names(specifier: string): Set<string> | undefined;
  /** The public name of the export `name` of the source file `file`. */
  resolveName(
    file: string,
    name: string,
    opts?: { value?: boolean }
  ): PublicName | undefined;
  /** How a namespace import of `file` is public: as the entry `specifier`
   *  itself, or as the namespace `name` that entry exports. */
  resolveNamespace(
    file: string,
    local: string
  ): { specifier: string; name?: undefined } | PublicName | undefined;
  /** The packages' compiler options. */
  options: TS.CompilerOptions;
}

/** gofish-graphics' own `typescript`. */
export const ts: typeof TS;

export function publicSurface(): PublicSurface;
