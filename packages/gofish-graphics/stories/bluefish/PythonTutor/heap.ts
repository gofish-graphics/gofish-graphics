import { createMark, rect, Spread } from "../../../src/lib";
import { heapObject } from "./heapObject";
import { Address, formatValue, HeapObject } from "./types";

export interface HeapProps {
  heap: HeapObject[];
  heapArrangement: (Address | null)[][];
}

export const heap = createMark(
  ({ heap: heapObjects, heapArrangement }: HeapProps) =>
    Spread(
      { dir: "y", alignment: "start", spacing: 75, reverse: true },
      heapArrangement.map((row) =>
        Spread(
          { dir: "x", alignment: "end", spacing: 75 },
          row.map((address) =>
            address === null
              ? rect({ h: 60, w: 140, fill: "none", stroke: "none" })
              : heapObject({
                  objectType: heapObjects[address].type,
                  objectValues: heapObjects[address].values.map((value) => ({
                    type:
                      typeof value === "string" || typeof value === "number"
                        ? "string"
                        : "pointer",
                    value: formatValue(value),
                  })),
                })
          )
        )
      )
    )
);
