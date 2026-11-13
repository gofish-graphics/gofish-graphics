// Data for the figure of "How do names and refs find their targets?"
// (names.walk.vue). The rows are the real tree of the chapter's example, as
// `pnpm --filter docs book:tree tests/tmp/book/names-spec/cards.mts --full`
// prints it before layout, simplified: the spread is labeled `spread`
// (it is a `layer` node in the tree) and token names are shown by their tag.
// Each lookup was run against the example; the result texts are the real
// messages.

export type Row = {
  /** Node type as the tree prints it. */
  type: string;
  /** The name, if any. */
  name?: string;
  /** The name is a createName token. */
  token?: boolean;
  depth: number;
  /** A ref stand-in (drawn dashed). */
  ref?: boolean;
  /** A note shown to the right of the row. */
  note?: string;
};

export const rows: Row[] = [
  { type: "layer", depth: 0, note: "the diagram" },
  { type: "spread", depth: 1 },
  { type: "layer", name: "left", token: true, depth: 2, note: "card A" },
  { type: "rect", name: "box", token: true, depth: 3 },
  { type: "text", name: "title", depth: 3 },
  { type: "layer", name: "right", token: true, depth: 2, note: "card B" },
  { type: "rect", name: "box", token: true, depth: 3 },
  { type: "text", name: "title", depth: 3 },
  { type: "text", name: "note", depth: 1 },
  { type: "arrow", depth: 1, note: "a clause" },
  { type: "ref", name: "left › box", depth: 2, ref: true },
  { type: "ref", name: "right › box", depth: 2, ref: true },
];

/** Rows 2 to 4 and 5 to 7 are the two card components. */
export const components = [
  { from: 2, to: 4, label: "createMark" },
  { from: 5, to: 7, label: "createMark" },
];

export type Visit = {
  row: number;
  /** The order of the visit; equal numbers are one depth of the search. */
  step: number;
  /** hit: the name matches. seen: checked, no match. closed: a component,
   *  checked but not entered. */
  mark: "hit" | "seen" | "closed";
};

export type Lookup = {
  id: string;
  /** Button text. */
  label: string;
  /** What the reader wrote. */
  code: string;
  /** When it runs. */
  when: string;
  start: number;
  visits: Visit[];
  /** Indices into `components` whose edge stops the search. */
  walls?: number[];
  /** A jump that is not a tree walk (a token), from row to row. */
  jumps?: [number, number][];
  ok: boolean;
  result: string;
  steps: string[];
};

export const lookups: Lookup[] = [
  {
    id: "near",
    label: "title, in the card",
    code: "card: .relate(({ box, title }) => [...])",
    when: "build time, when .relate() runs",
    start: 2,
    visits: [
      { row: 3, step: 1, mark: "seen" },
      { row: 4, step: 1, mark: "hit" },
    ],
    ok: true,
    result: "title means card A's own text. Card B's title is never seen.",
    steps: [
      "Start at card A's layer, the layer .relate() is called on.",
      "Depth 1: box (a token whose tag is box) and title. title matches.",
      "Stop at the first depth with a match.",
    ],
  },
  {
    id: "widen",
    label: "left, in the diagram",
    code: "diagram: .relate(({ left, note }) => [...])",
    when: "build time, when .relate() runs",
    start: 0,
    visits: [
      { row: 1, step: 1, mark: "seen" },
      { row: 8, step: 1, mark: "seen" },
      { row: 2, step: 2, mark: "hit" },
      { row: 5, step: 2, mark: "closed" },
    ],
    ok: true,
    result: "left means card A. The callback gets note, left and right.",
    steps: [
      "Start at the diagram's layer.",
      "Depth 1: the spread and note. No left. The arrow is a clause, so it is not searched.",
      "Depth 2: the two cards. Card A answers to left. Their insides are not entered.",
    ],
  },
  {
    id: "wall-down",
    label: "box, in the diagram",
    code: "diagram: .relate(({ box, note }) => [...])",
    when: "build time, when .relate() runs",
    start: 0,
    visits: [
      { row: 1, step: 1, mark: "seen" },
      { row: 8, step: 1, mark: "seen" },
      { row: 2, step: 2, mark: "closed" },
      { row: 5, step: 2, mark: "closed" },
    ],
    walls: [0, 1],
    ok: false,
    result:
      "Constraint.align: operand 2 is undefined, not an operand. … Names inside this layer: note, left, right.",
    steps: [
      "Start at the diagram's layer.",
      "Depth 1: the spread and note. No box.",
      "Depth 2: the two cards. Neither is named box, and both are components, so the search does not go inside.",
      "Nothing is left to search. box is undefined, and the constraint throws.",
    ],
  },
  {
    id: "wall-up",
    label: 'ref("note"), in the card',
    code: 'card: .relate(() => [arrow({}, [ref("title"), ref("note")])])',
    when: "layout time, when refs are resolved",
    start: 2,
    visits: [
      { row: 3, step: 1, mark: "seen" },
      { row: 4, step: 1, mark: "seen" },
    ],
    walls: [0],
    ok: false,
    result:
      'ref("note"): no node named "note" in the enclosing createMark component. …',
    steps: [
      "A variant of the card whose .relate() also draws an arrow to note.",
      "Start at the card's layer, the layer whose clause holds the ref.",
      "Depth 1: box and title. No note.",
      "The card's layer is the component, so the walk may not go up to the diagram. It stops and throws.",
    ],
  },
  {
    id: "token",
    label: "ref(a).box, a token path",
    code: "arrow({}, [ref(a).box, ref(b).box])",
    when: "layout time, when refs are resolved",
    start: 10,
    visits: [
      { row: 2, step: 1, mark: "hit" },
      { row: 3, step: 2, mark: "hit" },
    ],
    jumps: [
      [10, 2],
      [2, 3],
    ],
    ok: true,
    result: "The ref stands for card A's box, across the card's boundary.",
    steps: [
      "The token in ref(a) is looked up in the render's token table, which maps it to the one node that carries it: card A.",
      "box is a path segment. Card A's scope map files its tokens by tag, and box is there.",
      "No string search runs, so the component boundary does not apply.",
    ],
  },
];
