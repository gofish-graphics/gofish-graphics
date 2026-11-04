// SCRATCH: the bubble treemap's outer level. Its members are the inner enclosures' rings, read
// as segments; enclose reads a ring through its outline at members.ts's TOLERANCE (Douglas-
// Peucker). From a dump taken at TOLERANCE 0 (DUMP=…html), each outer call's rings are thinned
// at tolerance t, closed by the fillet at r, and measured against the raster closing of the
// unthinned rings (rastercheck.ts f at every segment's midpoint and vertex).
//   DUMP=… BENCH=nested node playground/bench.mjs
import { readFileSync } from "node:fs";
import { unifiedOutline } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import { rasterClosing } from "../../packages/gofish-graphics/scratch-bumps/fillet/rastercheck";
import { simplifyRing } from "../../packages/gofish-graphics/src/ast/geometry/outline";
type Pt = [number, number];
const s = readFileSync(process.env.DUMP!, "utf8");
const unesc = (x: string) =>
  x
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const calls = JSON.parse(
  unesc(s.match(/<pre class="enclose-dump">([\s\S]*?)<\/pre>/)![1])
);
const outerCalls = calls.filter((c: any) =>
  c.members.some((m: any) => m.kind === "segment")
);
const same = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-9;
// the segments back into their rings (outlineSegments emits each ring's edges in order)
function ringsOf(M: any[]): { ring: Pt[]; w: number }[] {
  const out: { ring: Pt[]; w: number }[] = [];
  let cur: Pt[] = [];
  let w = 0;
  for (const m of M) {
    if (cur.length && same(cur[cur.length - 1], m.a)) cur.push(m.b);
    else {
      if (cur.length) out.push({ ring: cur, w });
      cur = [m.a, m.b];
      w = m.w;
    }
  }
  if (cur.length) out.push({ ring: cur, w });
  // a closed ring's last point is its first again
  return out.map(({ ring, w }) => ({
    ring: same(ring[0], ring[ring.length - 1]) ? ring.slice(0, -1) : ring,
    w,
  }));
}
const segs = (R: { ring: Pt[]; w: number }[]) =>
  R.flatMap(({ ring, w }) =>
    ring.map((a, i) => ({
      kind: "segment",
      a,
      b: ring[(i + 1) % ring.length],
      w,
    }))
  );
const TS = (process.env.TS ?? "0.5,0.2,0.1,0.05,0").split(",").map(Number);
const RS = (process.env.RS ?? "12").split(",").map(Number);
for (const r of RS) {
  const truth = outerCalls.map((c: any) => {
    const R = ringsOf(c.members);
    return {
      R,
      pad: c.padding,
      raster: rasterClosing(segs(R) as any, c.padding, r, 0.05),
    };
  });
  for (const t of TS) {
    let mid = 0,
      ver = 0,
      segMax = 0,
      n = 0,
      members = 0,
      ms = 0,
      at = "";
    const errs: number[] = [];
    for (const { R, pad, raster } of truth) {
      const M = segs(
        R.map(({ ring, w }) => ({ ring: simplifyRing(ring, t), w }))
      );
      members += M.length;
      const t0 = performance.now();
      const rings = unifiedOutline(M as any, {
        padding: pad,
        shape: "fillet",
        radius: r,
        neck: 0,
      }) as Pt[][];
      ms += performance.now() - t0;
      for (const ring of rings)
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i],
            b = ring[(i + 1) % ring.length];
          n++;
          segMax = Math.max(segMax, Math.hypot(b[0] - a[0], b[1] - a[1]));
          const e = Math.abs(raster.f((a[0] + b[0]) / 2, (a[1] + b[1]) / 2));
          errs.push(e);
          if (e > mid)
            [mid, at] = [e, `(${a[0].toFixed(1)},${a[1].toFixed(1)})`];
          ver = Math.max(ver, Math.abs(raster.f(a[0], a[1])));
        }
    }
    console.log(
      `r${r} tolerance ${t}: ${members} segment members, ${n} vertices, longest seg ${segMax.toFixed(2)}, max err midpoint ${mid.toFixed(3)} at ${at} (${errs.filter((x) => x > 0.25).length} over 0.25; 99.9th pct ${errs.sort((x, y) => x - y)[Math.floor(errs.length * 0.999)].toFixed(3)}) vertex ${ver.toFixed(3)}, ${ms.toFixed(0)} ms`
    );
  }
}
