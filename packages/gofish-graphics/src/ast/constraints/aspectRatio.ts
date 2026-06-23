/** Equal-aspect coupling for the scale-factor (σ) solve — issue #582.
 *
 * The σ solve normally inverts each axis independently against its own pixel
 * budget (`σ_x = W/rangeX`, `σ_y = H/rangeY`), so one data unit is not
 * guaranteed to render the same size on both axes. `aspectRatio` couples the
 * two factors so a single data unit renders as a chosen pixel shape `w:h`
 * (`"square"` ≡ `1:1`). This is the scale-level coupling of
 * `apps/docs/docs/internals/design/size-claims.md` § "Aspect ratio: three
 * candidate homes" (option 3).
 *
 * The value is always written **w:h** (no forgettable bare ratio): a string
 * `"square"`, a generic `"<w>:<h>"`, or an explicit `{ w, h }` object.
 */

export type AspectRatio =
  | "square"
  | string /* "w:h" */
  | { w: number; h: number };

/** Normalized w:h shape of one data unit, both > 0. */
export type AspectShape = { w: number; h: number };

/** Parse the polymorphic `aspectRatio` value into a `{ w, h }` shape.
 *
 *  "square" → {w:1,h:1}; "3:2" (any "<w>:<h>") → {w:3,h:2}; {w,h} → validated.
 *  Throws a named error on a malformed string or non-positive dimension. */
export function parseAspectRatio(a: AspectRatio): AspectShape {
  if (typeof a === "string") {
    if (a === "square") return { w: 1, h: 1 };
    const m = a.split(":");
    const w = Number(m[0]);
    const h = Number(m[1]);
    if (
      m.length !== 2 ||
      !Number.isFinite(w) ||
      !Number.isFinite(h) ||
      w <= 0 ||
      h <= 0
    ) {
      throw new Error(
        `aspectRatio: expected "square" or a "<w>:<h>" ratio of positive numbers (e.g. "3:2"), got ${JSON.stringify(
          a
        )}`
      );
    }
    return { w, h };
  }
  if (
    a == null ||
    !Number.isFinite(a.w) ||
    !Number.isFinite(a.h) ||
    a.w <= 0 ||
    a.h <= 0
  ) {
    throw new Error(
      `aspectRatio: expected { w, h } with positive numbers, got ${JSON.stringify(
        a
      )}`
    );
  }
  return { w: a.w, h: a.h };
}

/** Couple two independently-solved scale factors so `σ_x / σ_y == w / h`, with
 *  both staying within their original budget — scale the looser axis down:
 *
 *    σ_y' = min(σ_y, σ_x · h/w);  σ_x' = σ_y' · w/h
 *
 *  The square case (w == h) reduces to σ_x' = σ_y' = min(σ_x, σ_y) — the
 *  formula in #582. If either factor is undefined (an axis with no data-driven
 *  SIZE scale) there is nothing to balance, so the pair is returned unchanged;
 *  callers warn in that case so the no-op isn't silent. */
export function coupleScaleFactors(
  factors: [number | undefined, number | undefined],
  a: AspectShape
): [number | undefined, number | undefined] {
  const [sx, sy] = factors;
  if (sx === undefined || sy === undefined) return factors;
  const syCoupled = Math.min(sy, (sx * a.h) / a.w);
  const sxCoupled = (syCoupled * a.w) / a.h;
  return [sxCoupled, syCoupled];
}
