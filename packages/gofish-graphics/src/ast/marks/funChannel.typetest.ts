/**
 * Type-level tests for function-valued channels (stack profiles S9).
 * Nothing here runs: the package typecheck (`tsc --noEmit`) compiles this
 * file, and a wrong type is a compile error. The run-time half is
 * `tests/funChannel.test.ts`.
 */
import { fun, line, ribbon, rect, circle, text } from "../../lib";

export function functionChannels() {
  const f = fun((t) => Math.sin(t), { domain: [0, 1] });
  // The shape form of ribbon and line reads a function at its parameter.
  ribbon({ x: f.support(), h: f });
  ribbon({ y: f.support(), w: f });
  line({ x: f.support(), y: f });
  // A constant beside a function is a constant over t.
  ribbon({ x: f.support(), h: 2 });
  // A bare JS function stays a row accessor.
  ribbon({ x: (d: { u: number }) => d.u, h: "v" });

  // Any other mark takes one value per group, not a function.
  // @ts-expect-error a function value in a rect channel
  rect({ h: f });
  // @ts-expect-error a function value in a rect channel
  rect({ x: f.support(), w: 3 });
  // @ts-expect-error a function value in a circle channel
  circle({ r: f });
  // @ts-expect-error a function value in a text channel
  text({ x: f });
}
