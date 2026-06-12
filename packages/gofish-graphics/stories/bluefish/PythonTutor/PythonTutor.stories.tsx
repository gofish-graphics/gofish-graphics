import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import {
  Arrow,
  createName,
  Layer,
  ref,
  Spread,
} from "../../../src/lib";
import { globalFrame } from "./globalFrame";
import { heap } from "./heap";
import { binding, isPointer, pointer, tuple } from "./types";

const meta: Meta = {
  title: "Bluefish/Python Tutor/Python Tutor",
  argTypes: {
    w: {
      control: { type: "number", min: 400, max: 2000, step: 20 },
    },
    h: {
      control: { type: "number", min: 200, max: 1200, step: 20 },
    },
  },
};
export default meta;

type Args = { w: number; h: number };

export const PythonTutor: StoryObj<Args> = {
  args: { w: 1250, h: 600 },
  render: (args: Args) => {
    const container = initializeContainer();
    const data = {
      stack: [
        binding("c", pointer(0)),
        binding("d", pointer(1)),
        binding("x", "5"),
      ],
      heap: [
        tuple(["12", pointer(1), "1", "0", pointer(2), pointer(3)]),
        tuple(["1", "4"]),
        tuple(["3", "10", "7", "8", pointer(4)]),
        tuple(["2", pointer(4)]),
        tuple(["3"]),
      ],
      heapArrangement: [
        [0, 3, null, null],
        [null, 1, 2, 4],
      ],
    };

    const globalFrameName = createName("globalFrame");
    const heapName = createName("heap");

    // Address -> (row, col) in the arrangement grid
    const addrPos = new Map<number, [number, number]>();
    data.heapArrangement.forEach((row, r) =>
      row.forEach((addr, c) => {
        if (addr !== null) addrPos.set(addr, [r, c]);
      })
    );

    const stackArrows = data.stack.flatMap((slot, i) =>
      isPointer(slot.value)
        ? [
            Arrow(
              {
                bow: 0,
                stretch: 0,
                flip: true,
                padStart: 0,
                stroke: "#1A5683",
                start: true,
              },
              [
                ref(globalFrameName).variables[i].value,
                ref(heapName)
                  .path(...addrPos.get(slot.value.value)!)
                  .elmTuples[0],
              ]
            ),
          ]
        : []
    );

    const heapArrows = data.heap.flatMap((obj, a) =>
      obj.values.flatMap((v, j) =>
        isPointer(v)
          ? [
              Arrow(
                {
                  bow: 0,
                  padEnd: 25,
                  padStart: 0,
                  stroke: "#1A5683",
                  start: true,
                },
                [
                  ref(heapName).path(...addrPos.get(a)!).elmTuples[j].val,
                  ref(heapName).path(...addrPos.get(v.value)!).elmTuples[0],
                ]
              ),
            ]
          : []
      )
    );

    Layer([
      Spread({ dir: "x", alignment: "start", spacing: 100 }, [
        globalFrame({ stack: data.stack }).name(globalFrameName),
        heap({
          heap: data.heap,
          heapArrangement: data.heapArrangement,
        }).name(heapName),
      ]),
      ...stackArrows,
      ...heapArrows,
    ]).render(container, { w: args.w, h: args.h });

    return container;
  },
};
