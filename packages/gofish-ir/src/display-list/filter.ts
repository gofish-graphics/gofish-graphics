// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Rendering — /internals/core/rendering
// </gofish-wiki>

import type { DisplayFilter } from "./schema.js";

/** A def of a {@link FilterPlan}: a `colorMatrix` display filter, less its
 *  `kind`, under its id. */
export type FilterDef = { id: string } & (
  | { type: "matrix"; values: string }
  | { type: "luminanceToAlpha" }
);

/**
 * The filters of a render as SVG draws them: the one plan both SVG backends
 * (`render.ts` here and `paintSVG.tsx` in gofish-graphics) write out, so
 * they cannot drift.
 *
 * `attr` is the `filter` attribute of a group drawn under `filter`: a `css`
 * value as it is, a `colorMatrix` as a `url(#id)` of its def. The plan
 * registers a `colorMatrix` the first time `attr` sees it: two filters with
 * the same `type` and `values` share one def, under an id made from
 * `prefix`. `defs` are the filters registered so far, in the order first
 * seen, so a backend writes them after it has drawn every item, and each
 * `url(#id)` it wrote names a def. A backend writes each def as a
 * `<filter>` of one `feColorMatrix`, in sRGB as CSS filters are, and draws
 * `prefix` from the counter its composite ids come from, so two
 * visualizations on one page do not share ids.
 */
export interface FilterPlan {
  readonly defs: readonly FilterDef[];
  attr(filter: DisplayFilter | undefined): string | undefined;
}

/** A new, empty {@link FilterPlan}, its ids prefixed by `prefix`. */
export function filterPlan(prefix: string): FilterPlan {
  const defs: FilterDef[] = [];
  const idByKey = new Map<string, string>();
  return {
    defs,
    attr(filter) {
      if (filter === undefined) return undefined;
      if (filter.kind === "css") return filter.value;
      const key =
        filter.type === "matrix" ? `matrix ${filter.values}` : filter.type;
      let id = idByKey.get(key);
      if (id === undefined) {
        id = `${prefix}-${defs.length}`;
        idByKey.set(key, id);
        defs.push(
          filter.type === "matrix"
            ? { id, type: filter.type, values: filter.values }
            : { id, type: filter.type }
        );
      }
      return `url(#${id})`;
    },
  };
}
