/** How a filmstrip holds an example still. A sequence takes these in its own
 *  options, with `at` in child-index units; a `.relate()` timeline takes them
 *  as render options, with `at` in ms. */
export type SequenceClock = { playing?: boolean; at?: number };
export type TimelineClock = { playing?: boolean; at?: number; loop?: boolean };
