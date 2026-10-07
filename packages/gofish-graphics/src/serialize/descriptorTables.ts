// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Frontend IR — /internals/frontend/serialization
// </gofish-wiki>

/**
 * The gofish-ir descriptor table of each kind of construct that crosses the
 * wire through a factory. The emitter (`toJSON`) reads it to decide which
 * options reach the IR, and the deserializer (`registry.ts`) reads it to
 * decide which factory call rebuilds a wire type. Its own module, with no
 * imports from the AST, so the emitter can read it without importing the
 * factories (which import the emitter back).
 *
 * Coordinate transforms are not here: they ride as options, and fromJSON.ts's
 * `resolveCoordConfig` rebuilds them.
 */

import { Frontend } from "gofish-ir";

export type FactoryKind = "operator" | "leaf-mark" | "combinator-mark";

export const DESCRIPTOR_TABLES: Record<
  FactoryKind,
  Record<string, Frontend.ConstructDescriptor>
> = {
  operator: Frontend.OPERATORS,
  "leaf-mark": Frontend.LEAF_MARKS,
  "combinator-mark": Frontend.COMBINATOR_MARKS,
};
