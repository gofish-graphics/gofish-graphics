/**
 * Type-level tests for function-valued channels.
 * Nothing here runs: the package typecheck (`tsc --noEmit`) compiles this
 * file, and a wrong type is a compile error. The run-time half is
 * `tests/funChannel.test.ts`.
 */
import { fun, line, ribbon, rect, circle, text } from "../../lib";

export function functionChannels() {
  const f = fun((t) => Math.sin(t), { domain: [0, 1] });
  // The shape form of ribbon and line reads a function at its parameter.
  ribbon({ x: f.domain(), h: f });
  ribbon({ y: f.domain(), w: f });
  line({ x: f.domain(), y: f });
  // A constant beside a function is a constant over t.
  ribbon({ x: f.domain(), h: 2 });
  // A function value is an expression: it holds its function and is not one.
  // @ts-expect-error a function value has no `at`
  f.at(0);
  // @ts-expect-error `domain` is a method, not the interval
  const min: number = f.domain.min;
  void min;
  // A bare JS function stays a row accessor.
  ribbon({ x: (d: { u: number }) => d.u, h: "v" });

  // Any other mark takes one value per group, not a function.
  // @ts-expect-error a function value in a rect channel
  rect({ h: f });
  // @ts-expect-error a function value in a rect channel
  rect({ x: f.domain(), w: 3 });
  // @ts-expect-error a function value in a circle channel
  circle({ r: f });
  // @ts-expect-error a function value in a text channel
  text({ x: f });
}
