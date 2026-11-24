/**
 * Type-level tests for the strategy presets: a preset takes only the options
 * it does not fix (`PresetOptions`, from the values gofish-ir's `STRATEGIES`
 * table declares). Nothing here runs: the package typecheck
 * (`tsc --noEmit`) compiles this file, and a wrong type is a compile error.
 * The run-time half is in `tests/families.test.ts` and
 * `tests/overlap.test.ts`.
 */
import { Coord, Overlap, Shape, Slack } from "../lib";

export function presets() {
  // The options a preset does not fix.
  Overlap.sina({ randomness: "quasi", padding: 1, seed: 2 });
  Overlap.jitter({ padding: 1, seed: 2 });
  Shape.hull({ connection: 0.5, holes: true, separate: true });
  Shape.spine({ connection: 0.5, neck: 0.5, holes: true, separate: true });
  Slack.end();

  // @ts-expect-error sina fixes smoothing
  Overlap.sina({ smoothing: 3 });
  // @ts-expect-error jitter fixes randomness
  Overlap.jitter({ randomness: "blue" });
  // @ts-expect-error jitter fixes smoothing
  Overlap.jitter({ smoothing: 0 });
  // @ts-expect-error hull fixes convexity
  Shape.hull({ convexity: 0.9 });
  // @ts-expect-error hull fixes neck
  Shape.hull({ neck: 0.5 });
  // @ts-expect-error spine fixes convexity
  Shape.spine({ convexity: 0.2 });
  // @ts-expect-error start fixes t
  Slack.start({ t: 0.3 });
  // @ts-expect-error center fixes t
  Slack.center({ t: 0.3 });
  // @ts-expect-error end fixes t
  Slack.end({ t: 0.3 });

  // A coord preset (gofish-ir's `COORD_PRESETS`): clock fixes polar's
  // baselineAngle and direction.
  Coord.clock({ innerRadius: 0.5, centralAngle: Math.PI, center: [1, 2] });
  // @ts-expect-error clock fixes baselineAngle
  Coord.clock({ baselineAngle: 0 });
  // @ts-expect-error clock fixes direction
  Coord.clock({ direction: 1 });
}
