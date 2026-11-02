// SCRATCH round 4: concave curvature and runtime of ChartAccent / Munkres /
// penguin spines at neck 1 and 0.6, raw (exact closing) and smoothed.
import { loadDump, measure } from "./round3";
import { unifiedOutline, UNIFIED_STATS } from "../src/ast/graphicalOperators/enclose/unified";

for (const name of ["chart-accent", "munkres-figure", "penguin-spines", "cusp-r40"]) {
  for (const call of loadDump(name)) {
    if (call.shape.kind !== "blob" && call.shape.kind !== "arcs") continue;
    for (const neck of (process.argv[2] ? [+process.argv[2]] : [1, 0.6]))
      for (const smooth of [null, undefined]) {
        const rings = unifiedOutline(call.members, {
          padding: call.padding,
          convexity: call.shape.convexity ?? 0.5,
          avoiding: call.avoiding,
          clearance: call.shape.clearance,
          connected: call.shape.kind === "blob",
          radius: call.shape.kind === "arcs" ? (call.shape.radius ?? 12) : undefined,
          neck,
          smooth,
        } as any);
        const m = measure(rings);
        console.log(
          `${name.padEnd(15)} neck ${neck} ${smooth === null ? "exact   " : "smoothed"}` +
            ` loops ${rings.length} minConcaveR ${m.minConcave.toFixed(2)} minConvexR ${m.minConvex.toFixed(2)}` +
            ` maxTurn ${m.maxTurn.toFixed(1)}deg corners ${m.corners.length}` +
            ` r ${UNIFIED_STATS.radius?.toFixed(1)} iters ${UNIFIED_STATS.iterations} ${UNIFIED_STATS.ms?.toFixed(0)} ms`
        );
      }
    break;
  }
}
