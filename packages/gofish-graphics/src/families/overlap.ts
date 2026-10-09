/**
 * The `Overlap` family: the strategies of `scatter`'s `overlap` option.
 *
 * `lib.ts` binds this module as `Overlap` (`Overlap.separate({ padding: 1 })`),
 * and `gofish-graphics/overlap` exports the same module, so
 * `import { separate } from "gofish-graphics/overlap"` reaches the same
 * function. A strategy is a plain object made by a function call, so it
 * crosses the Python bridge as IR. `kind` names the strategy. `sina()` and
 * `jitter()` are `noise()` with other defaults filled in, so their objects
 * have kind `"noise"`. The placement itself is in
 * `ast/graphicalOperators/overlap.ts`.
 */

/** `separate()`: dots kept apart. See {@link separate}. */
export type SeparateStrategy = { kind: "separate"; padding?: number };

/** How `noise()` draws each dot's offset inside the outline. */
export type NoiseRandomness = "blue" | "quasi" | "uniform";

/**
 * `noise()`'s `smoothing`: the bandwidth of each dot's bell, in data units of
 * the data axis (0 or more; 0, the default, is no smoothing beyond the dots'
 * own size); `Infinity` for a flat band; or `"silverman"` to compute it from
 * the data (Silverman's rule of thumb, as `sina()` does).
 */
export type NoiseSmoothing = number | "silverman";

/** The options `noise()`, `sina()` and `jitter()` share. */
export type NoiseOptions = {
  randomness?: NoiseRandomness;
  smoothing?: NoiseSmoothing;
  padding?: number;
  seed?: number;
};

/** `noise()`: dots spread inside a density outline. See {@link noise}.
 *  `sina()` and `jitter()` make this same object with other defaults. */
export type NoiseStrategy = { kind: "noise" } & NoiseOptions;

/** Every built-in overlap strategy: the value of `scatter`'s `overlap`. */
export type Overlap = SeparateStrategy | NoiseStrategy;

const checkPadding = (name: string, padding: number | undefined) => {
  if (padding !== undefined && !(Number.isFinite(padding) && padding >= 0))
    throw new Error(
      `[gofish] ${name}: padding must be a non-negative number, got ${padding}`
    );
};

/**
 * Keep dots apart: each dot keeps its position on the data axis and moves
 * along the free axis to the free spot nearest the alignment line, in data
 * order, so no two dots overlap. The result is a beeswarm. Shapes other than
 * circles are placed by their enclosing circle.
 *
 * The placement is Observable Plot's `dodge`. It is not named `dodge` because
 * ggplot2's `position_dodge` means grouped bars (`spread` here), and not
 * `beeswarm` because that names a family of layouts (greedy, force-directed,
 * packed). The name follows the separation constraints of constraint layout
 * (WebCoLa, VPSC).
 *
 * @param padding Pixels kept between neighboring dots. Default 0.
 */
export function separate(opts: { padding?: number } = {}): SeparateStrategy {
  const { padding } = opts;
  checkPadding("separate", padding);
  return padding === undefined
    ? { kind: "separate" }
    : { kind: "separate", padding };
}

const RANDOMNESS: readonly NoiseRandomness[] = ["blue", "quasi", "uniform"];

/** Check the options and build the strategy object; `name` is the factory
 *  the user called, for the error messages. */
function makeNoise(name: string, opts: NoiseOptions): NoiseStrategy {
  const { randomness, smoothing, padding, seed } = opts;
  if (randomness !== undefined && !RANDOMNESS.includes(randomness))
    throw new Error(
      `[gofish] ${name}: randomness must be one of ${RANDOMNESS.map((r) => `"${r}"`).join(", ")}, got ${JSON.stringify(randomness)}`
    );
  if (
    smoothing !== undefined &&
    smoothing !== "silverman" &&
    !(typeof smoothing === "number" && smoothing >= 0)
  )
    throw new Error(
      `[gofish] ${name}: smoothing must be a non-negative number of data units, ` +
        `Infinity, or "silverman", got ${JSON.stringify(smoothing)}`
    );
  checkPadding(name, padding);
  if (seed !== undefined && !Number.isFinite(seed))
    throw new Error(`[gofish] ${name}: seed must be a number, got ${seed}`);
  const out: NoiseStrategy = { kind: "noise" };
  if (randomness !== undefined) out.randomness = randomness;
  if (smoothing !== undefined) out.smoothing = smoothing;
  if (padding !== undefined) out.padding = padding;
  if (seed !== undefined) out.seed = seed;
  return out;
}

/**
 * Noise. Each dot keeps its position on the data axis and gets an offset on
 * the free axis inside an outline that follows how many dots share that part
 * of the data axis (see {@link noiseOutline}). Each dot adds a small
 * bell-shaped bump to the outline, and the outline is the sum of the bumps.
 * Unlike `separate()`, the outline, not the collisions, sets how far the dots
 * spread, so dots may still touch.
 *
 * `sina()` and `jitter()` are this strategy with other defaults.
 *
 * @param randomness How offsets are drawn inside the outline:
 *   `"blue"` (default) keeps each dot as far from its placed neighbors as it
 *   can (best of a few seeded candidates), so the cloud is even, with no
 *   clumps; `"quasi"` spreads the dots by rank with a van der Corput sequence
 *   (ggbeeswarm's quasirandom), the fastest; `"uniform"` draws seeded uniform
 *   offsets, classic jitter.
 * @param smoothing The bandwidth of each dot's bell (its standard deviation),
 *   in data units of the data axis. Default 0: no smoothing beyond the dots'
 *   own size (see {@link noiseOutline}).
 *   `Infinity`: a flat outline, the fixed band of classic jitter.
 *   `"silverman"`: computed from the dots, as `sina()` does.
 * @param padding Pixels added to each dot's width when the outline is sized
 *   and, for `"blue"`, when distances are compared. Default 0.
 * @param seed Seed for `"blue"` and `"uniform"`. Default 0, so a render is the
 *   same every time.
 */
export function noise(opts: NoiseOptions = {}): NoiseStrategy {
  return makeNoise("noise", opts);
}

/**
 * A sina plot: `noise()` with a bandwidth computed from the data by
 * Silverman's rule of thumb, as ggforce's `geom_sina` does (R's `bw.nrd0`).
 * The outline is the smooth curve a violin plot draws, filled with dots.
 * The bandwidth is computed per scatter, so each group of a `spread` gets its
 * own. Any option overrides the default.
 */
export function sina(opts: NoiseOptions = {}): NoiseStrategy {
  return makeNoise("sina", {
    ...opts,
    smoothing: opts.smoothing ?? "silverman",
  });
}

/**
 * Classic jitter: `noise()` with uniform random offsets in a flat band
 * (`randomness: "uniform"`, `smoothing: Infinity`). Any option overrides the
 * default.
 */
export function jitter(opts: NoiseOptions = {}): NoiseStrategy {
  return makeNoise("jitter", {
    ...opts,
    randomness: opts.randomness ?? "uniform",
    smoothing: opts.smoothing ?? Infinity,
  });
}
