/**
 * Helpers shared by the unit, space and schema tests. Not a test itself.
 */
import { Units, withUnits } from "../ast/measure";
import { quantityUnits, type UnitRecord } from "../ast/underlyingSpace";

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
