/** How a filmstrip holds an example still, with `at` in ms. A sequence
 *  takes these in its own options; a `.relate()` timeline takes them as
 *  render options. */
export type SequenceClock = { playing?: boolean; at?: number };
export type TimelineClock = { playing?: boolean; at?: number; loop?: boolean };
