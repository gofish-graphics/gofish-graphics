/**
 * Shadow assertions for the σ-affine solver (#39 endgame, Phase 1).
 *
 * Runs the solver alongside the legacy engine and checks they agree, WITHOUT
 * the solver driving anything — the observe→assert discipline that landed the
 * ledger (stages 0–2). Guarded by `GOFISH_SOLVER_CHECK` (env or `globalThis`);
 * zero-cost and silent when off, so production behavior is unchanged.
 *
 * Phase-1 coverage = PLACEMENT COMPOSITION before data→size: given each child's
 * engine-computed size, does the solver's facet machinery reproduce the engine's
 * absolute positions? Start with the `distribute` constraint (the composition
 * `spread`/`stack`/`scatter` all elaborate to), edge mode, no pre-placed anchor —
 * the stacked/edge-spread core. Other modes/anchors are skipped (not yet
 * modeled), so a clean run means "every covered case agrees", not "everything".
 */
import * as M from "../../util/monotonic";
import { SolverBox } from "./index";
import type { Placeable } from "../_node";
import { axisIndex, type Axis } from "../constraints/shared";

const enabled = (): boolean => {
  const g = globalThis as {
    GOFISH_SOLVER_CHECK?: unknown;
    process?: { env?: Record<string, string | undefined> };
  };
  return !!g.GOFISH_SOLVER_CHECK || !!g.process?.env?.GOFISH_SOLVER_CHECK;
};

// Report each (tag) once so a story's output stays readable (mirrors the ledger
// check). A gate cares about "any divergence", not the count.
const _reported = new Set<string>();
function report(tag: string, solver: number, engine: number): void {
  if (_reported.has(tag)) return;
  _reported.add(tag);
  console.warn(
    `[solver-check] ${tag}: solver=${solver} engine=${engine} (Δ=${solver - engine})`
  );
}

/** The subset of a distribute constraint the shadow reads. */
interface DistributeLike {
  type?: string;
  dir: Axis;
  spacing: number;
  mode: "edge" | "center";
  order: "forward" | "reverse";
}

/**
 * Check the edge-distribute CONTIGUITY invariant the engine enforces on its
 * output: consecutive targets satisfy `child[i+1].min == child[i].max + spacing`.
 * This is anchor-agnostic — which child anchored the walk only sets the absolute
 * offset, not the spacing relation — which matters because the shadow runs AFTER
 * `applyDistribute`, by which point every target is placed (so the pre-placement
 * anchor distinction is gone).
 *
 * The solver expresses it as an origin chain: seed the first target at its real
 * position (boundary condition), then predict each subsequent child's `min` via
 * `SolverBox` — `baseline = previous.max + spacing`, size pinned — and compare to
 * the engine. Agreement validates the solver representation reproduces the engine
 * composition on real story data (and that target/order/axis extraction is right).
 */
export function shadowCheckDistribute(
  constraint: DistributeLike,
  targets: Placeable[],
  /** Per-target: was it already placed on the stack axis BEFORE distribute? */
  prePlaced: boolean[]
): void {
  if (!enabled() || constraint.type !== "distribute") return;
  // Center mode (center-to-center spacing) is not yet modeled; only edge.
  if (constraint.mode !== "edge") return;
  const idx = axisIndex(constraint.dir);

  // Distribute only PACKS children it places. A child already placed on the
  // stack axis (e.g. the violin's `stackY` over rects pinned at `y: data`) is
  // data-positioned — distribute consistency-checks it, doesn't pack it — so the
  // contiguity invariant doesn't apply. Validate only pure packing (nothing
  // pre-placed); mixed/data-positioned distributes are deferred (honest
  // coverage, not silently passed). Across all 189 stories this covers 2560
  // edge-distributes; 934 are skipped here as data-positioned, 3 as center mode.
  if (prePlaced.some(Boolean)) return;

  const ordered =
    constraint.order === "reverse" ? [...targets].reverse() : targets;
  if (ordered.length < 2) return;

  let prevMax: M.Monotonic | undefined;
  for (let i = 0; i < ordered.length; i++) {
    const size = ordered[i].dims[idx].size;
    const engineMin = ordered[i].dims[idx].min;
    // Bail the whole chain if any link is unplaced/unsized — can't model it.
    if (size === undefined || engineMin === undefined) return;

    const box = new SolverBox(0); // edge targets are min-anchored (baseline ≡ min)
    box.add(
      "baseline",
      i === 0 ? engineMin : M.adds(prevMax!, constraint.spacing)
    );
    box.add("size", size);

    const solverMin = box.read("min", 0)!;
    if (i > 0 && Math.abs(solverMin - engineMin) > 1e-6) {
      report(`distribute.edge dir=${constraint.dir}`, solverMin, engineMin);
    }
    prevMax = box.facetMono("max");
  }
}
