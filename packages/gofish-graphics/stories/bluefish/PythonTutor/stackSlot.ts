import {
  Constraint,
  createMark,
  createName,
  Layer,
  rect,
  Spread,
  text,
} from "../../../src/lib";

const fontFamily = "verdana, arial, helvetica, sans-serif";

export interface StackSlotProps {
  variable: string;
  value?: string;
}

export const stackSlot = createMark(
  ({ variable, value }: StackSlotProps) => {
    const boxTag = createName("box");
    const valueTag = createName("value");
    return Spread({ dir: "x", alignment: "middle", spacing: 5 }, [
      text({
        fontSize: 24,
        fontFamily,
        text: variable,
      }).name("variable"),
      Layer([
        rect({ h: 40, w: 40, fill: "#e2ebf6" }).name(boxTag),
        rect({ h: 2, w: 40, fill: "#a6b3b6" }).name("boxBorderBottom"),
        rect({ h: 40, w: 2, fill: "#a6b3b6" }).name("boxBorderLeft"),
        typeof value === "string"
          ? text({
              fontSize: 24,
              fontFamily,
              text: value,
            }).name(valueTag)
          : text({ fontSize: 24, fontFamily, fill: "none", text: "" }).name(
              valueTag
            ),
      ]).constrain(({ box, boxBorderBottom, boxBorderLeft, value }) => [
        Constraint.align({ x: "middle", y: "middle" }, [box, value]),
        Constraint.align({ x: "middle", y: "start" }, [box, boxBorderBottom]),
        Constraint.align({ x: "start", y: "middle" }, [box, boxBorderLeft]),
      ]),
    ]);
  }
);
