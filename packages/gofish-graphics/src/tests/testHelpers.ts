/**
 * Helpers shared by the unit, space and schema tests. Not a test itself.
 */
import { Units, withUnits } from "../ast/measure";
import { quantityUnits, type UnitRecord } from "../ast/underlyingSpace";

declare const process: { exit(code: number): never };

/** A drawn item of a display list: every item but a group. */
export type Item = {
  kind: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  text?: string;
  [key: string]: any;
};

/** Every drawn item of a display list, flattened out of its groups, in
 *  paint order. */
export const items = (dl: any): Item[] => {
  const out: Item[] = [];
  const walk = (it: any) => {
    if (it.kind !== "group") out.push(it);
    for (const c of it.children ?? []) walk(c);
  };
  dl.items.forEach(walk);
  return out;
};

let passed = 0;
let failed = 0;

/** Count and log one assertion of a test file. */
export function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}`, detail ?? "");
  }
}

/** Print the tally of {@link check}, and exit non-zero after a failure. */
export function report(): void {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

/** Every text item's string in a display list, in paint order. */
export const textsOf = (dl: any): string[] => {
  const out: string[] = [];
  const walk = (it: any) => {
    if (it.kind === "text") out.push(String(it.text));
    for (const c of it.children ?? []) walk(c);
  };
  dl.items.forEach(walk);
  return out;
};

/** Run `f` in a union-find of units of its own, for a unit-level test that
 *  reads unknown units outside any walk. */
export const fresh = <T>(f: () => T): T => withUnits(new Units(), f);

/** The units of a column `name` declared in unit `unit` (named by it unless
 *  given), with `unit` as its symbol. A declared unit is a concrete term, so
 *  this needs no union-find. */
export const declared = (name: string, unit = name): UnitRecord =>
  quantityUnits({ name, column: name, unit: { unit, symbol: unit } })!;

/** The units of a column `name` with no declared unit (inside `fresh`). */
export const unknown = (name: string): UnitRecord =>
  quantityUnits({ name, column: name })!;
