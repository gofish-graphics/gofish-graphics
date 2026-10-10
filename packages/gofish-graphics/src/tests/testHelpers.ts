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

/** Run `f` in a fresh render's union-find of units. */
export const fresh = <T>(f: () => T): T => withUnits(new Units(), f);

/** The units of a column `name` declared in unit `unit` (named by it unless
 *  given), with `unit` as its symbol. */
export const declared = (name: string, unit = name): UnitRecord =>
  quantityUnits({ name, unit: { unit, symbol: unit } })!;

/** The units of a column `name` with no declared unit. */
export const unknown = (name: string): UnitRecord => quantityUnits({ name })!;
