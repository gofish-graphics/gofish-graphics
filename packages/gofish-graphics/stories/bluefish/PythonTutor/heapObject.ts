import { createMark, createName, spread, text } from "../../../src/lib";
import { elmTuple } from "./elmTuple";

const fontFamily = "verdana, arial, helvetica, sans-serif";

export interface HeapObjectProps {
  objectType: string;
  objectValues: { type: string; value: string }[];
}

export const heapObject = createMark(
  ({ objectType, objectValues }: HeapObjectProps) => {
    const elmTuplesTag = createName("elmTuples");
    return spread(
      { dir: "y", alignment: "start", spacing: 10 },
      [
        text({
          fontFamily,
          fontSize: 16,
          fill: "grey",
          text: objectType,
        }),
        spread(
          { dir: "x", spacing: 0 },
          objectValues.map((elementData, index) =>
            elmTuple({
              tupleIndex: String(index),
              tupleData:
                elementData.type === "string" ? elementData.value : undefined,
            })
          )
        ).name(elmTuplesTag),
      ]
    );
  }
);
