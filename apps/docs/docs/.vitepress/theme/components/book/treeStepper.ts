// The data a <TreeStepper> figure takes. A chapter keeps its figure's data in
// a small file beside it (for example docs/under-the-surface/axes.figure.ts)
// and passes it as `:figure`. See apps/docs/book/README.md.

/** What a line of the tree stands for. Each kind has one look in every
 *  chapter (theme/book.css): from the reader's code, added by a rewrite, a
 *  ref (dashed), a constraint (gray), and a type (gray italic with a round
 *  mark), which is a note that typing writes on a node, not a node. A
 *  figure's legend lists only the kinds the figure uses. */
export type TreeKind = "user" | "added" | "ref" | "constraint" | "type";

export type TreeItem = {
  /** Unique within the figure. Picture pieces with the same `data-id` are
   *  linked to this item. */
  id: string;
  /** The text of the item. When it has two spaces, the part before them is
   *  the node's type and is set quieter: "layer  frame". */
  text: string;
  kind: TreeKind;
  /** The step (counting from 1) at which the item appears. */
  step: number;
  /** For a ref: the ids of the items it points at. Hovering the ref outlines
   *  them, dashed. */
  targets?: string[];
};

export type TreeLine = TreeItem & {
  /** Indentation, 0 for the root. */
  depth: number;
  /** Further items on the same line, such as a constraint list or the ref
   *  that sits beside a text. */
  more?: TreeItem[];
};

export type TreeStep = {
  /** A short button label. */
  label: string;
  /** One sentence shown under the buttons. */
  note: string;
};

export type TreeFigure = {
  steps: TreeStep[];
  lines: TreeLine[];
  /** A name for the figure, read by screen readers. */
  label?: string;
};
