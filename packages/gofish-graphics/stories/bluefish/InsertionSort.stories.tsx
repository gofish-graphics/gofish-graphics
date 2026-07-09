import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  arrow,
  Constraint,
  createMark,
  createName,
  ellipse,
  enclose,
  Layer,
  rect,
  ref,
  spreadX,
  spreadY,
  text,
} from "../../src/lib";

// Ported from Bluefish's example-gallery insertion-sort.tsx (#435). Bluefish's
// `<Group>` (a plain overlay, like GoFish's `Layer`) contains a `StackV` of
// stages; each stage is a `Group` with an `ArrayOutline` (solid-border row of
// cells), a `DashedBorder` around the sorted prefix, and a conditional
// `Arrow` from the moving cell's old slot to its insertion point. Stage
// labels sit to the left of each row, referencing the row by its `createName`
// token — mirrored here with GoFish's cross-tier `Layer` + `ref` pattern (see
// Pulley.stories.tsx).

const meta: Meta = {
  title: "Bluefish/Insertion Sort",
};
export default meta;

// so that colors in this diagram match the colors of the original Bluefish
// gallery example
const stageColor = (t: number) => {
  const T = 0.1 + 0.8 * (1 - t);
  const s = Math.max(0, Math.min(1, T));
  const r = Math.max(0.05, Math.min(1, 3 * T - 2));
  const g = 3 * s * s - 2 * s * s * s;
  const b = 1 - Math.sqrt(1 - Math.max(0, Math.min(1, 3 * T)));
  return `rgba(${r * 255}, ${g * 255}, ${b * 255}, 0.75)`;
};

function findPosToInsert(sorted: number[], item: number): number {
  const i = sorted.findIndex((v) => v >= item);
  return i === -1 ? sorted.length : i;
}
function insertAtPos<T>(array: T[], pos: number, item: T): T[] {
  const result = [...array];
  result.splice(pos, 0, item);
  return result;
}

type Move = { ar: number[]; move: [number, number] };

// Insertion sort implemented as a generator: at each stage it yields the
// array as currently laid out and the [from, to] move the algorithm is about
// to perform (from === to signals the terminal, fully-sorted stage).
function* insertionSort(
  unsorted: number[],
  sorted: number[] = []
): Generator<Move> {
  if (unsorted.length === 0) {
    yield { ar: sorted, move: [sorted.length, sorted.length] };
    return;
  }
  const entryToSort = unsorted[0];
  const posToInsert = findPosToInsert(sorted, entryToSort);
  if (sorted.length > 0) {
    yield { ar: [...sorted, ...unsorted], move: [sorted.length, posToInsert] };
  }
  const newSorted = insertAtPos(sorted, posToInsert, entryToSort);
  yield* insertionSort(unsorted.slice(1), newSorted);
}

const stageLabel = (stage: number, length: number) => {
  if (stage === 0) return "Unsorted";
  if (stage === length - 1) return "Sorted";
  return `Stage ${stage}`;
};

// A single array-entry cell: a rounded, colored square background, a
// translucent white circle, and the value centered on top.
const CELL_SIZE = 34;
const CELL_SPACING = 3;
// Sorted-prefix (teal) border padding — matches Bluefish's DashedBorder
// padding={4}. Kept smaller than the row outline's `enclose` padding (8) so
// the teal stroke (outer edge at padding + strokeWidth/2 = 5.5px) stays
// clear of the outer light-gray outline instead of crossing it.
const BORDER_PADDING = 4;
const OUTLINE_PADDING = 8;

const ArrayEntry = createMark(
  ({
    value,
    color,
    highlight,
  }: {
    value: number;
    color: string;
    highlight: boolean;
  }) =>
    Layer([
      rect({ w: CELL_SIZE, h: CELL_SIZE, fill: color, rx: 8, ry: 8 }).name(
        "body"
      ),
      ellipse({ w: 26, h: 26, fill: "rgba(255,255,255,0.6)" }).name("circle"),
      text({
        text: String(value),
        fontFamily: "serif",
        fontSize: 14,
        fill: highlight ? "orangered" : "black",
      }).name("label"),
    ]).constrain(({ body, circle, label }) => [
      Constraint.align({ x: "middle", y: "middle" }, [body, circle, label]),
    ])
);

export const InsertionSort: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Insertion Sort",
      description:
        "An insertion sort trace rendered as a stack of array stages, each with a dashed border around its sorted prefix and an arrow showing the element being moved into place.",
    },
  },
  render: () => {
    const container = initializeContainer();

    const unsortedArray = [4, 2, 7, 1, 3];
    const stages = [...insertionSort(unsortedArray)];

    // Per-cell name tokens, keyed by [stage][index] — a fresh token per cell
    // per stage, since the same value can appear in many stages/positions.
    const entryNames = stages.map((stage, s) =>
      stage.ar.map((_, i) => createName(`entry-${s}-${i}`))
    );
    const rowNames = stages.map((_, s) => createName(`row-${s}`));

    const rows = stages.map(({ ar, move: [from, to] }, stage) => {
      const cells = ar.map((value, i) =>
        ArrayEntry({
          value,
          color: stageColor(stage / (stages.length - 1 || 1)),
          highlight: i === stage + 1,
        }).name(entryNames[stage][i])
      );

      // Tier 1: the solid-bordered row of cells — a finished, fully-placed
      // unit (enclose wraps a real stack of fresh children here, not refs).
      // Tier 2: the dashed sorted-prefix border and the move arrow, both
      // declared after the row so their ref()s resolve against placed cells.
      // NB: `spreadX`, not `stackX` — `stack` is spacing-less by design
      // (StackOptions omits `spacing`; the option is silently dropped and
      // children touch), so the inter-cell gap needs spread.
      return Layer([
        enclose(
          { padding: OUTLINE_PADDING, rx: 8, ry: 8 },
          [spreadX({ spacing: CELL_SPACING, alignment: "middle" }, cells)]
        ).name(rowNames[stage]),
        // Sorted-prefix border: tried `enclose({padding}, [ref(first),
        // ref(last)])` first (the direct port of Bluefish's `<DashedBorder>
        // <Ref .../><Ref .../></DashedBorder>`, which unions just the first
        // and last cell's boxes). It renders, but always at a fixed
        // ~cell-sized box regardless of `from` — enclose's layout body calls
        // `child.layout(...)` and then unconditionally
        // `place("x"/"y", 0, "baseline")` on every child (see enclose.tsx),
        // collapsing every ref to the same local origin before measuring, so
        // the two refs' *relative* offset (which is exactly what should
        // determine the box's width) is discarded — enclose was written to
        // lay out fresh children at a shared origin, not to wrap a already-
        // placed range. See the friction log for the capability that would
        // fix this (a size-only/no-reposition enclose mode).
        //
        // Workaround: the row's own geometry (ArrayOutline padding, cell
        // size, inter-cell spacing) is fully known at authoring time, so the
        // sorted-prefix box is placed directly via `rect`'s own `x`/`y`
        // (local-origin coordinates, relative to the row's first cell,
        // which — like ArrayOutline's padding above — sits at the row's
        // local (0, 0)) instead of going through enclose/refs at all.
        ...(from > 0
          ? [
              rect({
                x: -BORDER_PADDING,
                y: -BORDER_PADDING,
                w:
                  from * CELL_SIZE +
                  (from - 1) * CELL_SPACING +
                  2 * BORDER_PADDING,
                h: CELL_SIZE + 2 * BORDER_PADDING,
                fill: "none",
                stroke: "teal",
                strokeWidth: 3,
                rx: 12,
                ry: 12,
              }),
            ]
          : []),
        ...(from !== to
          ? [
              arrow({ padStart: 0, padEnd: 4, straights: false, flip: true }, [
                ref(entryNames[stage][from]),
                ref(entryNames[stage][to]),
              ]),
            ]
          : []),
      ]);
    });

    // Outer diagram: stages spread vertically (left edges aligned so cells
    // line up in columns), with a label to the left of each row (cross-tier
    // ref into the spread, à la Planets' label pattern). The x/y offset
    // shifts the whole diagram right/down so the leftward-placed labels
    // don't land at negative coordinates (the root render does not auto-fit
    // — same trick as Pulley).
    Layer({ x: 90, y: 20 }, [
      spreadY({ spacing: 15, alignment: "start" }, rows),
      ...stages.map((_, stage) =>
        spreadX({ spacing: 20, alignment: "middle" }, [
          text({
            text: stageLabel(stage, stages.length),
            fontFamily: "serif",
            fontStyle: "italic",
            fill: "gray",
          }),
          ref(rowNames[stage]),
        ])
      ),
    ]).render(container, {});

    return container;
  },
};
