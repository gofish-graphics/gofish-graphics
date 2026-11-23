// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

/**
 * The row-points query: the points of the data rows a mark is drawn
 * through (a line's), each with its row. A mark drawn through no rows (a
 * bar, a line whose channels hold functions, a connector) answers with
 * none, so a reader reads the mark as a whole.
 */

/** One row's point, in the frame of its geometry's box. */
export type RowPoint = { row: unknown; at: readonly [number, number] };

export interface HasRowPoints {
  /** The points of the rows the mark is drawn through, in the order it
   *  draws them. */
  rowPoints?: () => RowPoint[];
}
