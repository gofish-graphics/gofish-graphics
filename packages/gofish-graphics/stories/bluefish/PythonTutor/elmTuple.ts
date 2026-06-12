import {
  Constraint,
  createMark,
  createName,
  Layer,
  rect,
  text,
} from "../../../src/lib";

const fontFamily = "verdana, arial, helvetica, sans-serif";

export interface ElmTupleProps {
  tupleIndex: string;
  tupleData?: string;
}

export const elmTuple = createMark(
  ({ tupleIndex, tupleData }: ElmTupleProps) => {
    const valTag = createName("val");
    return Layer([
      rect({
        h: 60,
        w: 70,
        fill: "#ffffc6",
        stroke: "gray",
        strokeWidth: 1,
      }).name("box"),
      text({
        fontSize: 16,
        fontFamily,
        fill: "gray",
        text: tupleIndex,
      }).name("label"),
      typeof tupleData === "string"
        ? text({
            fontSize: 24,
            fontFamily,
            fill: "black",
            text: tupleData,
          }).name(valTag)
        : text({ fontSize: 24, fontFamily, fill: "none", text: "" }).name(
            valTag
          ),
    ]).constrain(({ box, label, val }) => [
      Constraint.align({ x: "middle", y: "middle" }, [val, box]),
      Constraint.align({ x: "start", y: "end" }, [label, box]),
    ]);
  }
);
