// The data a <TreeStepper> figure takes. A chapter keeps its figure's data in
// a small file beside it (for example docs/under-the-sea/axes.figure.ts)
// and passes it as `:figure`. See apps/docs/book/README.md.
import type { BookStep, FigKind } from "./bookFigure";

/** What a line of the tree stands for: a palette kind (bookFigure.ts). From
 *  the reader's code, added by the library, a ref (dashed), a constraint
 *  (gray), and a type (gray italic with a round mark), which is a note that
 *  typing writes on a node, not a node. */
export type TreeKind = Exclude<FigKind, "generated">;

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
  /** The last step at which the item is shown, for an item that goes away
   *  (a node a rewrite replaces). After it the item is faint and struck
   *  through, and its picture pieces are hidden. */
  until?: number;
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

export type TreeStep = BookStep;

export type TreeFigure = {
  steps: TreeStep[];
  lines: TreeLine[];
  /** A name for the figure's step buttons, read by screen readers. */
  label?: string;
};
