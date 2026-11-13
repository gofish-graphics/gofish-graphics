// Shared types for the figures of "Under the Surface": the palette kinds a
// legend can list, and the steps a <BookStepper> takes. See
// apps/docs/book/README.md, "Figures".

/** What a mark in a figure stands for. Each kind has one color and one look
 *  in every chapter (theme/book.css sets the colors, theme/book-stepper.css
 *  the legend swatches), and a figure's legend lists only the kinds it uses. */
export type FigKind =
  | "user"
  | "added"
  | "ref"
  | "constraint"
  | "type"
  | "generated";

/** The legend text of each kind, the same in every figure. */
export const KIND_LABEL: Record<FigKind, string> = {
  user: "a node from your code",
  added: "a node the library adds",
  ref: "a ref",
  constraint: "a constraint",
  type: "a type (a note, not a node)",
  generated: "from the descriptor table (generated from it, or named in it)",
};

/** The legend's order. */
export const KINDS = Object.keys(KIND_LABEL) as FigKind[];

export type BookStep = {
  /** A short button label. */
  label: string;
  /** One sentence shown under the buttons for this step. A picker whose
   *  choices explain themselves in the figure may leave it out. */
  note?: string;
};
