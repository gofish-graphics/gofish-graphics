/**
 * A seeded generator on [0, 1): a linear congruential generator with d3's
 * `randomLcg` constants. The same seed gives the same sequence everywhere, so
 * anything drawn from it (jitter offsets, synthetic datasets) renders the same
 * every time.
 */
export function lcg(seed: number): () => number {
  const m = 4294967296;
  let s = ((Math.floor(seed) % m) + m) % m;
  return () => (s = (1664525 * s + 1013904223) % m) / m;
}
