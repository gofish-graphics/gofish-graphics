/**
 * Type-level tests for `field(...).map` and `field(...).reduce` (stack
 * profiles S10): the lift by the result's shape. Nothing here runs: the
 * package typecheck (`tsc --noEmit`) compiles this file, and a wrong type is
 * a compile error. The run-time half is `tests/groupExpr.test.ts`.
 */
import { field, fun, line, rect, ribbon } from "../../lib";

export function lifts() {
  // A number is a value, for any value channel.
  const n = field("v").reduce((xs) => xs.length);
  rect({ h: n });
  rect({ h: field("v").sum() });
  rect({ h: field("v").map((x) => x * 2) });

  // A record is an object with one method per member.
  const s = field("v").reduce(
    (xs: number[]) => ({
      lo: Math.min(...xs),
      at: (i: number) => xs[i],
      nested: { hi: Math.max(...xs) },
    }),
    { unit: { lo: "g", nested: { hi: "g" } } }
  );
  rect({ y: s.lo(), y2: s.nested().hi() });
  // A method member keeps its arguments.
  rect({ h: s.at(2) });
  // @ts-expect-error at takes a number
  s.at("two");
  // @ts-expect-error a record is not a channel value; read a member
  rect({ h: s });
  // @ts-expect-error the record has no member mid
  s.mid();

  // A Fun is a function expression, for ribbon and line only.
  const f = field("v").reduce((xs) =>
    fun((t) => t * xs.length, { domain: [0, 1] })
  );
  ribbon({ x: f.support(), h: f });
  line({ x: f.support(), y: f });
  // @ts-expect-error a function expression in a rect channel
  rect({ h: f });

  // An array is never: the reduce call is a type error where it is used.
  const arr = field("v").reduce((xs) => [...xs]);
  // @ts-expect-error an array result has no lift
  rect({ h: arr });

  // Nothing chains after a value.
  // @ts-expect-error a value has no sum
  field("v").sum().sum();
  // @ts-expect-error a value has no map
  n.map((x: number) => x);

  // The unit option mirrors the result's shape.
  const g = field("v").reduce((xs) => ({ lo: xs[0] as number }), {
    unit: { lo: "g" },
  });
  rect({ h: g.lo() });
  // A unit that does not mirror the result makes the expression a
  // LiftError, so its use is the type error.
  const bad = field("v").reduce((xs) => ({ lo: xs[0] as number }), {
    unit: { mid: "g" },
  });
  // @ts-expect-error the result has no member mid
  bad.lo();
}
