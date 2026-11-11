// Fits power means of the gap (widgetModels.ts) to the "Spacing by eye"
// survey responses in proposals/optical-spacing/results/*.txt:
// `node_modules/.bin/tsx stories/proposals/stack-profile/fitRun.ts`
// prints the analysis and writes proposals/optical-spacing/fit.json, which
// the page's "Fitting one model to the responses" section reads.
//
// The perceived gap of a pair is M_p = (mean over scanlines of d^p)^(1/p).
// Three families of d:
//   hull    d between the shapes' convex hulls; one parameter, p.
//   capped  d between the shapes, clipped at c; p and c (and the band).
//   partial d between the shapes with each concavity filled a fraction k of
//           the way to the hull; p and k (k = 0 the shape, k = 1 the hull).
// A setting predicts a widget where its measures of the two compared gaps
// are equal, the same rule as every model on the page. Widget 7 (the plane
// in the pill) is left out of everything (DROPPED in widgetDefs.ts).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFS, DROPPED } from "./widgetDefs";
import { gapProfileK, powerMean } from "./widgetModels";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../proposals/optical-spacing/");
const ws = DEFS.map((_, i) => i + 1).filter((n) => !DROPPED.has(n));
const LOW = [2, 3, 6, 8];
const HIGH = ws.filter((n) => !LOW.includes(n));

// --- the responses, parsed like the page's paste box -----------------------
const people = readdirSync(OUT + "results")
  .filter((f) => f.endsWith(".txt"))
  .sort()
  .map((f) => {
    const u: Record<number, number> = {};
    readFileSync(OUT + "results/" + f, "utf8")
      .split(/\r?\n/)
      .forEach((line) => {
        const m = line.trim().match(/^w(\d+)\s+\S+\s+(-?\d+(?:\.\d+)?|unset)$/);
        if (m && m[2] !== "unset" && ws.includes(+m[1])) u[+m[1]] = +m[2];
      });
    return { name: f.slice(0, -4), u };
  });
const vals = (n: number) => people.map((p) => p.u[n]).filter((x) => x != null);
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = (xs: number[]) => Math.sqrt(xs.reduce((s, x) => s + (x - mean(xs)) ** 2, 0) / (xs.length - 1));
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const stats: Record<number, { mean: number; median: number; sd: number }> = Object.fromEntries(
  ws.map((n) => [n, { mean: mean(vals(n)), median: median(vals(n)), sd: sd(vals(n)) }])
);
const rms = (xs: number[]) => Math.sqrt(mean(xs.map((x) => x * x)));

// --- gap profiles per fill fraction k, each computed once --------------------
const t0 = Date.now();
const profCache = new Map<number, (number | null)[][][]>();
const profilesFor = (k: number) => {
  if (!profCache.has(k))
    profCache.set(
      k,
      DEFS.map((def, i) =>
        DROPPED.has(i + 1)
          ? []
          : def.grid.map((v) => {
              const [pa, pb] = def.pairs(v);
              return [gapProfileK(...pa, k), gapProfileK(...pb, k)];
            })
      )
    );
  return profCache.get(k)!;
};

/** The page's rule: of several crossings the one where the measures are largest; none gives null. */
function solve(ps: number[], a: number[], b: number[]) {
  let best: { x: number; level: number } | null = null;
  for (let i = 0; i + 1 < ps.length; i++) {
    const [d0, d1] = [a[i] - b[i], a[i + 1] - b[i + 1]];
    if (!isFinite(d0) || !isFinite(d1)) continue;
    if (d0 === 0 || Math.sign(d0) !== Math.sign(d1)) {
      const t = d0 === 0 ? 0 : d0 / (d0 - d1);
      const level = a[i] + t * (a[i + 1] - a[i]);
      if (!best || level > best.level) best = { x: ps[i] + t * (ps[i + 1] - ps[i]), level };
    }
  }
  return best ? best.x : null;
}
type Setting = { p: number; cap: number; union: boolean; k: number };
const S = (p: number, o: Partial<Setting> = {}): Setting => ({ p, cap: Infinity, union: false, k: 0, ...o });
const memo = new Map<string, (number | null)[]>();
/** One setting's prediction on every widget (index n - 1; null for a dropped widget or no crossing). */
function predict(s: Setting) {
  const key = `${s.p}|${s.cap}|${s.union}|${s.k}`;
  if (!memo.has(key)) {
    const pr = profilesFor(s.k);
    memo.set(
      key,
      DEFS.map((def, i) => {
        if (DROPPED.has(i + 1)) return null;
        // rounded to 0.01 like widgets.json, so the page's ticks match
        const m = (g: (number | null)[]) => +powerMean(g, s.p, s.cap, s.union).toFixed(2);
        return solve(
          def.grid,
          pr[i].map(([g]) => m(g)),
          pr[i].map(([, g]) => m(g))
        );
      })
    );
  }
  return memo.get(key)!;
}
const pName = (p: number) => (p === -Infinity ? "-inf" : `${p}`);
const sName = (s: Setting) =>
  `${s.k === 1 ? "hull, " : s.k > 0 ? `fill ${s.k}, ` : ""}p ${pName(s.p)}${isFinite(s.cap) ? `, cap ${s.cap}${s.union ? ", union" : ""}` : ""}`;

/** Weighted squared error against the people's mean, weights 1 / sd^2; a missing prediction is infinite. */
function loss(s: Setting, wset: number[]) {
  const pr = predict(s);
  return wset.reduce((sum, n) => {
    const x = pr[n - 1];
    return sum + (x == null ? Infinity : (x - stats[n].mean) ** 2 / stats[n].sd ** 2);
  }, 0);
}
const fitOn = (wset: number[], pool: Setting[]) => pool.map((s) => ({ s, loss: loss(s, wset) })).sort((a, b) => a.loss - b.loss)[0];
const z = (s: Setting, n: number) => {
  const x = predict(s)[n - 1];
  return x == null ? null : (x - stats[n].mean) / stats[n].sd;
};
const rows = (s: Setting) =>
  ws.map((n) => {
    const x = predict(s)[n - 1];
    return { n, x, err: x == null ? null : x - stats[n].mean, z: z(s, n) };
  });
const within = (s: Setting, wset: number[]) => wset.filter((n) => z(s, n) != null && Math.abs(z(s, n)!) <= 1).length;

// --- the families --------------------------------------------------------------
const PFINE = [-Infinity, -16, -12, -8, -6, -5, -4, -3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 3, 4];
const CAPS = [Infinity, 4, 8, 12, 16, 20, 24, 28, 32, 34, 36, 38, 40, 42, 44, 46, 48, 52, 56, 60, 70, 80];
const KS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
const FAMILIES: Record<string, Setting[]> = {
  hull: PFINE.map((p) => S(p, { k: 1 })),
  shape: PFINE.map((p) => S(p)),
  capped: PFINE.flatMap((p) => CAPS.flatMap((cap) => (isFinite(cap) ? [S(p, { cap }), S(p, { cap, union: true })] : [S(p)]))),
  partial: PFINE.flatMap((p) => KS.map((k) => S(p, { k }))),
};

/**
 * A loss curve is smooth when it has one valley: count its interior local
 * minima, and the largest jump between neighbors relative to its own range.
 */
function shape(curve: { loss: number }[]) {
  const ls = curve.map((r) => r.loss).filter(isFinite);
  let minima = 0;
  for (let i = 1; i + 1 < ls.length; i++) if (ls[i] < ls[i - 1] && ls[i] < ls[i + 1]) minima++;
  const range = Math.max(...ls) - Math.min(...ls);
  let jump = 0;
  for (let i = 1; i < ls.length; i++) jump = Math.max(jump, Math.abs(ls[i] - ls[i - 1]));
  return { minima, jump: +(jump / range).toFixed(2) };
}
const r2 = (x: number) => +x.toFixed(2);
const pCurve = (o: Partial<Setting>, wset: number[]) => PFINE.map((p) => ({ x: pName(p), loss: r2(loss(S(p, o), wset)) }));

const fam: Record<string, unknown> = {};
for (const [name, pool] of Object.entries(FAMILIES)) {
  const pooled = fitOn(ws, pool);
  const low = fitOn(LOW, pool);
  const lowo = ws.map((n) => {
    const f = fitOn(
      ws.filter((m) => m !== n),
      pool
    ).s;
    return { n, name: sName(f), x: predict(f)[n - 1], z: z(f, n) };
  });
  fam[name] = {
    size: pool.length,
    pooled: { name: sName(pooled.s), loss: r2(pooled.loss), rows: rows(pooled.s), within: within(pooled.s, LOW), rms: r2(rms(ws.map((n) => z(pooled.s, n) ?? 99))) },
    low: {
      name: sName(low.s),
      loss: r2(low.loss),
      rows: rows(low.s),
      within: within(low.s, LOW),
      heldRms: r2(rms(HIGH.map((n) => z(low.s, n) ?? 99))),
    },
    lowo,
    lowoRms: r2(rms(lowo.map((r) => r.z ?? 99))),
    lowoMax: r2(Math.max(...lowo.map((r) => Math.abs(r.z ?? 99)))),
    _pooled: pooled.s,
    _low: low.s,
  };
  const f = fam[name] as { pooled: { name: string; loss: number }; low: { name: string; loss: number; within: number; heldRms: number }; lowoRms: number; lowoMax: number; lowo: { n: number; name: string; z: number | null }[] };
  console.log(`\n== ${name} (${pool.length} settings)`);
  console.log(`  pooled on ${ws.length}: ${f.pooled.name}, loss ${f.pooled.loss}`);
  console.log(`  low-spread: ${f.low.name}, loss ${f.low.loss}, within 1 sd on ${f.low.within} of 4, held-out RMS ${f.low.heldRms} sd`);
  console.log(`  leave one out: RMS ${f.lowoRms} sd, max ${f.lowoMax}; ` + f.lowo.map((r) => `w${r.n} ${r.name} (${r.z?.toFixed(1)})`).join("; "));
}
const hullBest = (fam.hull as { _pooled: Setting })._pooled;
const capBest = (fam.capped as { _pooled: Setting })._pooled;
const partBest = (fam.partial as { _pooled: Setting })._pooled;
const OLD = S(-3, { cap: 40 }); // round 13's capped setting, fit with w7 in

// the loss curves
const curves = {
  hullAll: pCurve({ k: 1 }, ws),
  hullLow: pCurve({ k: 1 }, LOW),
  shapeAll: pCurve({}, ws),
  capAll: CAPS.filter(isFinite).map((cap) => ({ x: `${cap}`, loss: r2(loss(S(-3, { cap }), ws)) })),
  kAll: KS.map((k) => ({ x: `${k}`, loss: r2(loss(S(partBest.p, { k }), ws)) })),
};
console.log("\nLoss curves (all 7 widgets unless noted):");
for (const [k, c] of Object.entries(curves)) console.log(`  ${k} ${JSON.stringify(shape(c))}: ` + c.map((r) => `${r.x} ${r.loss}`).join(", "));

// round 13's capped p -3, cap 40, without w7
const old = { name: sName(OLD), rows: rows(OLD), loss: r2(loss(OLD, ws)), lowLoss: r2(loss(OLD, LOW)), within: within(OLD, LOW), rms: r2(rms(ws.map((n) => z(OLD, n) ?? 99))) };
console.log(`\nRound 13's ${old.name} on 7 widgets: loss ${old.loss}, RMS ${old.rms} sd, within 1 sd on ${old.within} of 4 low; ` + old.rows.map((r) => `w${r.n} ${r.x?.toFixed(1)} (${r.z?.toFixed(1)})`).join(", "));

// how p moves each widget, on the shape and on the hull
const PCOARSE = [-Infinity, -8, -4, -2, -1, -0.5, 0, 0.5, 1, 2];
const byP = (k: number) => PCOARSE.map((p) => ({ p: pName(p), xs: predict(S(p, { k })).map((x) => (x == null ? null : r2(x))) }));
const range = (k: number, n: number) => {
  const xs = PCOARSE.map((p) => predict(S(p, { k }))[n - 1]).filter((x) => x != null) as number[];
  return r2(Math.max(...xs) - Math.min(...xs));
};
console.log("\nPrediction by p, hull:");
for (const r of byP(1)) console.log(`  p ${r.p.padEnd(5)} ` + ws.map((n) => `${r.xs[n - 1] ?? "none"}`.padStart(7)).join(""));
console.log("  people  " + ws.map((n) => stats[n].mean.toFixed(1).padStart(7)).join(""));
console.log("  range shape " + ws.map((n) => `w${n} ${range(0, n)}`).join(", "));
console.log("  range hull  " + ws.map((n) => `w${n} ${range(1, n)}`).join(", "));

// each person's best p on the hull
const perCell = people.map((pe) =>
  ws.map((n) => {
    if (pe.u[n] == null) return null;
    let best = { p: "", err: Infinity };
    for (const p of PCOARSE) {
      const x = predict(S(p, { k: 1 }))[n - 1];
      if (x != null && Math.abs(x - pe.u[n]) < best.err) best = { p: pName(p), err: r2(Math.abs(x - pe.u[n])) };
    }
    return best;
  })
);
const personRms = (who: typeof people, p: number) =>
  rms(who.flatMap((pe) => ws.filter((n) => pe.u[n] != null && predict(S(p, { k: 1 }))[n - 1] != null).map((n) => predict(S(p, { k: 1 }))[n - 1]! - pe.u[n])));
const pooledP = PCOARSE.map((p) => ({ p, r: personRms(people, p) })).sort((a, b) => a.r - b.r)[0];
const perPerson = people.map((pe) => {
  const b = PCOARSE.map((p) => ({ p, r: personRms([pe], p) })).sort((a, c) => a.r - c.r)[0];
  return { name: pe.name, p: pName(b.p), rms: r2(b.r) };
});
const between = rms(people.flatMap((pe) => ws.filter((n) => pe.u[n] != null).map((n) => pe.u[n] - stats[n].mean)));
console.log(`\nHull, one p for everyone: p ${pName(pooledP.p)}, ${pooledP.r.toFixed(2)} px; own p each: ${rms(perPerson.map((r) => r.rms)).toFixed(2)} px; people around the mean ${between.toFixed(2)} px`);
people.forEach((pe, i) => console.log(`  ${pe.name}: ` + perCell[i].map((c, j) => `w${ws[j]} ${c ? c.p : "-"}`).join(" ") + `  own ${perPerson[i].p}`));

// the existing models (widgets.json) on every widget, plus the hull fit
const W = JSON.parse(readFileSync(OUT + "widgets.json", "utf8"));
const existing = W.models.map((m: { key: string; label: string }) => {
  const xs: (number | null)[] = DEFS.map(() => null);
  for (const w of W.widgets) xs[w.n - 1] = solve(w.p, w.a[m.key], w.b[m.key]);
  return { key: m.key, label: m.label, xs, zs: xs.map((x, i) => (x == null || !stats[i + 1] ? null : (x - stats[i + 1].mean) / stats[i + 1].sd)) };
});
console.log("\nModels, error in px (sd) on " + ws.map((n) => `w${n}`).join(" "));
for (const m of existing)
  console.log(`  ${m.label.padEnd(30)} ` + ws.map((n) => (m.xs[n - 1] == null ? "none" : `${(m.xs[n - 1] - stats[n].mean).toFixed(1)} (${m.zs[n - 1].toFixed(1)})`).padStart(12)).join(""));

// which widgets test anything: box against the profile models
const tests = ws.map((n) => {
  const at = (key: string) => existing.find((m: { key: string }) => m.key === key);
  const pick = ["box", "contact", "areaSum", "pairArea", "hull"].map((key) => {
    const m = at(key);
    const x = m?.xs[n - 1];
    return { key, label: m?.label, x: x == null ? null : r2(x), err: x == null ? null : r2(x - stats[n].mean), z: x == null ? null : r2((x - stats[n].mean) / stats[n].sd) };
  });
  const xs = existing.filter((m: { key: string }) => ["box", "contact", "euclid", "areaSum", "pairArea", "hull", "pm3c"].includes(m.key)).map((m: { xs: (number | null)[] }) => m.xs[n - 1]).filter((x: number | null) => x != null);
  return { n, sd: r2(stats[n].sd), mean: r2(stats[n].mean), pick, spread: r2(Math.max(...xs) - Math.min(...xs)), rangeShape: range(0, n), rangeHull: range(1, n) };
});
for (const t of tests.filter((t) => [6, 8].includes(t.n))) console.log(`\nw${t.n}: people ${t.mean} ± ${t.sd}; box/profile models span ${t.spread} px; p moves it ${t.rangeShape} (shape), ${t.rangeHull} (hull); ` + t.pick.map((r) => `${r.key} ${r.x} (${r.err}, ${r.z} sd)`).join(", "));

const strip = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith("_")));
writeFileSync(
  OUT + "fit.json",
  JSON.stringify(
    {
      widgets: ws,
      low: LOW,
      high: HIGH,
      people: people.map((p) => p.name),
      values: people.map((p) => p.u),
      stats,
      families: Object.fromEntries(Object.entries(fam).map(([k, v]) => [k, strip(v as Record<string, unknown>)])),
      best: { hull: sName(hullBest), capped: sName(capBest), partial: sName(partBest), hullP: pName(hullBest.p) },
      curves,
      curveShape: Object.fromEntries(Object.entries(curves).map(([k, c]) => [k, shape(c)])),
      old,
      byP: { shape: byP(0), hull: byP(1) },
      range: Object.fromEntries(ws.map((n) => [n, { shape: range(0, n), hull: range(1, n) }])),
      perCell,
      perPerson,
      pooledP: { p: pName(pooledP.p), rms: r2(pooledP.r) },
      rmsPer: r2(rms(perPerson.map((r) => r.rms))),
      between: r2(between),
      existing: existing.map((m: { key: string; label: string; xs: (number | null)[] }) => ({ key: m.key, label: m.label, xs: m.xs, within: LOW.filter((n) => m.xs[n - 1] != null && Math.abs(m.xs[n - 1]! - stats[n].mean) <= stats[n].sd).length, rms: r2(rms(ws.map((n) => (m.xs[n - 1] == null ? 99 : (m.xs[n - 1]! - stats[n].mean) / stats[n].sd)))) })),
      tests,
    },
    null,
    1
  )
);
console.log(`\nwrote fit.json in ${Date.now() - t0} ms`);
