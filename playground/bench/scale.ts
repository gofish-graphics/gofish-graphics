// SCRATCH: candidate length scales s for the "radius" convexity mode, beside the radius the area
// share picks at c = 0.5 (less padding).   BENCH=scale node playground/bench.mjs
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  UNIFIED_STATS,
  nearLinks,
  paddedHull,
  ringsArea,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
for (const d of DATA as any[]) {
  d.sets.forEach((s: any, si: number) => {
    if (si > 2) return;
    const pad = d.padding;
    const all = [...s.members, ...nearLinks(s.members, pad, Infinity, 1)];
    const H = paddedHull(all, pad);
    const A = ringsArea([H]);
    // min width (rotating calipers, brute force over edges)
    let wmin = Infinity,
      diam = 0;
    for (let i = 0; i < H.length; i++) {
      const a = H[i],
        b = H[(i + 1) % H.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1e-9) continue;
      let far = 0;
      for (const p of H) {
        far = Math.max(
          far,
          Math.abs(
            (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
          ) / L
        );
        diam = Math.max(diam, Math.hypot(p[0] - a[0], p[1] - a[1]));
      }
      wmin = Math.min(wmin, far);
    }
    let perim = 0;
    for (let i = 0; i < H.length; i++) {
      const a = H[i],
        b = H[(i + 1) % H.length];
      perim += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    const rs = [0.25, 0.5, 0.75].map((c) => {
      unifiedOutline(s.members, { padding: pad, convexity: c, neck: 1 });
      return (UNIFIED_STATS.radius ?? NaN) - pad;
    });
    console.log(
      `${d.id}#${si} r-pad @.25/.5/.75 ${rs.map((x) => x.toFixed(0)).join("/")} | sqrtA ${Math.sqrt(A).toFixed(0)} sqrt(A/pi) ${Math.sqrt(A / Math.PI).toFixed(0)} minW ${wmin.toFixed(0)} minW/2 ${(wmin / 2).toFixed(0)} diam ${diam.toFixed(0)} 2A/P ${((2 * A) / perim).toFixed(0)}`
    );
  });
}
