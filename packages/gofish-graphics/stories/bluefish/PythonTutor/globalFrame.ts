import {
  Constraint,
  createMark,
  createName,
  Layer,
  rect,
  Spread,
  text,
} from "../../../src/lib";
import { stackSlot } from "./stackSlot";
import { Binding, formatValue, isPointer } from "./types";

export interface GlobalFrameProps {
  stack: Binding[];
}

export const globalFrame = createMark(({ stack }: GlobalFrameProps) => {
  const variablesTag = createName("variables");
  return Layer([
    rect({ h: 300, w: 200, fill: "#e2ebf6" }).name("frame"),
    rect({ h: 300, w: 5, fill: "#a6b3b6" }).name("frameBorder"),
    text({
      fontSize: 24,
      fontFamily: "Andale Mono, monospace",
      fill: "black",
      text: "Global Frame",
    }).name("label"),
    Spread(
      { dir: "y", alignment: "end", spacing: 10, reverse: true },
      stack.map((slot) =>
        stackSlot({
          variable: slot.variable,
          value: isPointer(slot.value) ? undefined : formatValue(slot.value),
        })
      )
    ).name(variablesTag),
  ]).constrain(({ label, frame, frameBorder, variables }) => [
    Constraint.align({ x: "middle", y: "end" }, [label, frame]),
    Constraint.align({ x: "start", y: "middle" }, [frameBorder, frame]),
    Constraint.align({ x: "end" }, [variables, label]),
    Constraint.distribute({ dir: "y", spacing: 10 }, [variables, label]),
  ]);
});
