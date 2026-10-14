/**
 * Bare strategy kinds (#1133). A kind of a strategy family with no required
 * options is a value as it is, and calling it sets options:
 * `Curve.monotone` is `Curve.monotone()`, `Calendar.month` is
 * `Calendar.month()`, and `Calendar.month({ every: 3 })` sets its step. A
 * kind with a required option stays a call only (`Bin.step(0.5)`). d3 does
 * the same (`d3.timeMonth`, `d3.curveMonotoneX`), and so do SwiftUI's
 * leading-dot values.
 *
 * {@link bareKind} makes such a kind from its factory. The bare kind is the
 * value the factory makes with no arguments, made callable: a function with
 * that value's own keys and prototype, so it reads, spreads, compares and
 * serializes as that value. JSON has no functions, so it also carries the
 * value as `toJSON()` (a Calendar value has its own), which is how the IR
 * emitter and `Frontend.checkStrategy` tell it from a callback
 * (`Frontend.isCallableValue`). Nothing that reads a strategy needs to know
 * which spelling it was given.
 */

/** A strategy kind used bare: the value its factory makes with no
 *  arguments, which can also be called like the factory. */
export type BareKind<F extends (opts?: never) => object> = F & ReturnType<F>;

/**
 * The bare kind of a factory whose options are all optional. `label` names
 * the kind in errors (`"Curve.arc"`). A call takes one options object, or
 * nothing.
 */
export function bareKind<F extends (opts?: never) => object>(
  label: string,
  make: F
): BareKind<F> {
  const value = make();
  const kind = ((opts?: unknown) => {
    if (
      opts !== undefined &&
      (opts === null || typeof opts !== "object" || Array.isArray(opts))
    ) {
      throw new Error(
        `[gofish] ${label}(${typeof opts === "string" ? JSON.stringify(opts) : String(opts)}): ` +
          `expected an options object, as in ${label}({ ... }), or no ` +
          `arguments. ${label} alone is the kind with its defaults.`
      );
    }
    return (make as (opts?: unknown) => object)(opts);
  }) as unknown as BareKind<F>;
  // Its own keys are the value's, and nothing else: a function's own `name`
  // and `length` go.
  delete (kind as { name?: unknown }).name;
  delete (kind as { length?: unknown }).length;
  Object.setPrototypeOf(kind, Object.getPrototypeOf(value));
  Object.defineProperties(kind, Object.getOwnPropertyDescriptors(value));
  if (typeof (kind as { toJSON?: unknown }).toJSON !== "function") {
    Object.defineProperty(kind, "toJSON", { value: () => make() });
  }
  return kind;
}
