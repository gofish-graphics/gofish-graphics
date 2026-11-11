// Fits the power-mean family (widgetModels.ts, model (k)) to the "Spacing by
// eye" survey responses in proposals/optical-spacing/results/*.txt:
// `node_modules/.bin/tsx stories/proposals/stack-profile/fitRun.ts`
// prints the analysis and writes proposals/optical-spacing/fit.json, which
// the page's "Fitting one model to the responses" section reads.
//
// The perceived gap of a pair is M_p = (mean over scanlines of d^p)^(1/p),
// d capped at c; the band is the intersection of the two shapes' extents or
// their union (absent lines count c). A setting predicts a widget where its
// measures of the two compared gaps are equal (the same rule as every model).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFS } from "./widgetDefs";
import { gapProfile, powerMean } from "./widgetModels";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../proposals/optical-spacing/");
const N = DEFS.length;

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
        if (m && m[2] !== "unset") u[+m[1]] = +m[2];
      });
    return { name: f.slice(0, -4), u };
  });
const ws = Array.from({ length: N }, (_, i) => i + 1);
const vals = (n: number) => people.map((p) => p.u[n]).filter((x) => x != null);
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = (xs: number[]) => Math.sqrt(xs.reduce((s, x) => s + (x - mean(xs)) ** 2, 0) / (xs.length - 1));
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const stats = Object.fromEntries(ws.map((n) => [n, { mean: mean(vals(n)), median: median(vals(n)), sd: sd(vals(n)) }]));

// --- every gap profile, once -------------------------------------------------
const t0 = Date.now();
const profiles = DEFS.map((def) =>
  def.grid.map((v) => {
    const [pa, pb] = def.pairs(v);
    return [gapProfile(...pa), gapProfile(...pb)];
  })
);
console.log(`profiles ${Date.now() - t0} ms`);

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
type Setting = { p: number; cap: number; union: boolean };
const memo = new Map<string, (number | null)[]>();
/** One setting's prediction on every widget (index 0 = widget 1). */
function predict(s: Setting) {
  const k = `${s.p}|${s.cap}|${s.union}`;
  if (!memo.has(k))
    memo.set(
      k,
      DEFS.map((def, w) => {
        const pr = profiles[w];
        return solve(
          def.grid,
          // rounded to 0.01 like widgets.json, so the page's ticks match
          pr.map(([g]) => +powerMean(g, s.p, s.cap, s.union).toFixed(2)),
          pr.map(([, g]) => +powerMean(g, s.p, s.cap, s.union).toFixed(2))
        );
      })
    );
  return memo.get(k)!;
}
const pName = (p: number) => (p === -Infinity ? "-inf" : `${p}`);
const sName = (s: Setting) => `p ${pName(s.p)}${isFinite(s.cap) ? `, cap ${s.cap}${s.union ? ", union" : ""}` : ""}`;

// --- 1. each person's best p on each widget ----------------------------------
const PCOARSE = [-Infinity, -8, -4, -2, -1, -0.5, 0, 0.5, 1, 2];
const plain = (p: number): Setting => ({ p, cap: Infinity, union: false });
const perCell = people.map((pe) =>
  ws.map((n) => {
    if (pe.u[n] == null) return null;
    let best = { p: NaN, err: Infinity };
    for (const p of PCOARSE) {
      const x = predict(plain(p))[n - 1];
      if (x != null && Math.abs(x - pe.u[n]) < best.err) best = { p, err: Math.abs(x - pe.u[n]) };
    }
    return best;
  })
);
const sensitivity = ws.map((n) => {
  const xs = PCOARSE.map((p) => predict(plain(p))[n - 1]).filter((x) => x != null) as number[];
  return { min: Math.min(...xs), max: Math.max(...xs), contact: predict(plain(-Infinity))[n - 1], mean1: predict(plain(1))[n - 1] };
});
console.log("\nBest p per person and widget (error px); widget sensitivity = range of predictions over p");
console.log("person   " + ws.map((n) => `w${n}`.padEnd(13)).join(""));
people.forEach((pe, i) =>
  console.log(pe.name.padEnd(9) + perCell[i].map((c) => (c ? `${pName(c.p)} (${c.err.toFixed(1)})`.padEnd(13) : "-".padEnd(13))).join(""))
);
console.log("range    " + sensitivity.map((s) => `${s.min.toFixed(1)}..${s.max.toFixed(1)}`.padEnd(13)).join(""));
console.log("sd       " + ws.map((n) => stats[n].sd.toFixed(1).padEnd(13)).join(""));

/** Root mean square error of one setting against chosen people and widgets (a missing prediction counts the widget's whole range). */
function rms(s: Setting, who: typeof people, wset: number[]) {
  const pr = predict(s);
  let [sum, k] = [0, 0];
  for (const pe of who)
    for (const n of wset)
      if (pe.u[n] != null) {
        const x = pr[n - 1];
        const def = DEFS[n - 1];
        sum += (x == null ? def.grid[def.grid.length - 1] - def.grid[0] : x - pe.u[n]) ** 2;
        k++;
      }
  return Math.sqrt(sum / k);
}
const pooled = PCOARSE.map((p) => ({ p, rms: rms(plain(p), people, ws) })).sort((a, b) => a.rms - b.rms);
const perPerson = people.map((pe) => PCOARSE.map((p) => ({ p, rms: rms(plain(p), [pe], ws) })).sort((a, b) => a.rms - b.rms)[0]);
const rmsPer = Math.sqrt(mean(perPerson.map((r) => r.rms ** 2)));
const between = Math.sqrt(mean(people.flatMap((pe) => ws.filter((n) => pe.u[n] != null).map((n) => (pe.u[n] - stats[n].mean) ** 2))));
console.log(`\nOne pooled p: best p ${pName(pooled[0].p)}, RMS ${pooled[0].rms.toFixed(2)} px`);
people.forEach((pe, i) => console.log(`  ${pe.name}: own p ${pName(perPerson[i].p)}, RMS ${perPerson[i].rms.toFixed(2)}`));
console.log(`One p per person: RMS ${rmsPer.toFixed(2)} px. People around the per-widget mean: RMS ${between.toFixed(2)} px.`);

// --- 2. fit on the low-spread widgets ----------------------------------------
const LOW = [2, 3, 6, 8];
const HIGH = [1, 4, 5, 7];
const PFINE = [-Infinity, -16, -8, -6, -4, -3, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 3, 4];
const CAPS = [Infinity, 4, 8, 12, 16, 20, 24, 28, 32, 34, 36, 38, 40, 42, 44, 46, 48, 52, 56, 60, 70, 80];
const SETTINGS: Setting[] = PFINE.flatMap((p) =>
  CAPS.flatMap((cap) => (isFinite(cap) ? [{ p, cap, union: false }, { p, cap, union: true }] : [{ p, cap, union: false }]))
);
/** Weighted squared error against the people's mean, weights 1 / sd^2; a missing prediction is infinite. */
function loss(s: Setting, wset: number[]) {
  const pr = predict(s);
  return wset.reduce((sum, n) => {
    const x = pr[n - 1];
    return sum + (x == null ? Infinity : (x - stats[n].mean) ** 2 / stats[n].sd ** 2);
  }, 0);
}
const fitOn = (wset: number[], pool = SETTINGS) => pool.map((s) => ({ s, loss: loss(s, wset) })).sort((a, b) => a.loss - b.loss);
const lowAll = fitOn(LOW);
const lowPlain = fitOn(
  LOW,
  PFINE.map((p) => plain(p))
);
const best = lowAll[0].s;
const report = (s: Setting) =>
  ws.map((n) => {
    const x = predict(s)[n - 1];
    return { n, x, err: x == null ? null : x - stats[n].mean, errMedian: x == null ? null : x - stats[n].median, z: x == null ? null : (x - stats[n].mean) / stats[n].sd };
  });
console.log(`\nSettings searched: ${SETTINGS.length} (17 p x caps x band) on 4 widgets.`);
console.log(`Best on w2 w3 w6 w8: ${sName(best)}, weighted loss ${lowAll[0].loss.toFixed(2)}; best with no cap: ${sName(lowPlain[0].s)}, loss ${lowPlain[0].loss.toFixed(2)}`);
console.log("  top 8: " + lowAll.slice(0, 8).map((r) => `${sName(r.s)} ${r.loss.toFixed(2)}`).join("; "));
for (const s of [best, lowPlain[0].s])
  console.log(`  ${sName(s)}: ` + report(s).map((r) => `w${r.n} ${r.x == null ? "none" : `${r.x.toFixed(1)} (${r.err! >= 0 ? "+" : ""}${r.err!.toFixed(1)}, ${r.z!.toFixed(1)} sd)`}`).join(", "));

// the loss along p, with no cap and with the best cap: is p pinned down?
const curve = (cap: number, wset: number[]) => PFINE.map((p) => ({ p: pName(p), loss: +loss({ p, cap, union: false }, wset).toFixed(2) }));
console.log("\nLoss on w2 w3 w6 w8 along p:");
console.log("  no cap: " + curve(Infinity, LOW).map((r) => `${r.p} ${r.loss}`).join(", "));
console.log(`  cap ${best.cap}: ` + curve(best.cap, LOW).map((r) => `${r.p} ${r.loss}`).join(", "));
const allFit = fitOn(ws);
const all8 = allFit[0].s;
console.log(`\nBest on all 8: ${sName(all8)}, loss ${allFit[0].loss.toFixed(2)}; top 5: ` + allFit.slice(0, 5).map((r) => `${sName(r.s)} ${r.loss.toFixed(2)}`).join("; "));
console.log("  " + report(all8).map((r) => `w${r.n} ${r.x == null ? "none" : `${r.x.toFixed(1)} (${r.z!.toFixed(1)} sd)`}`).join(", "));
console.log(`  cap ${all8.cap} along p on all 8: ` + curve(all8.cap, ws).map((r) => `${r.p} ${r.loss}`).join(", "));
// the loss along the cap at the best p
const capCurve = (p: number, wset: number[]) => CAPS.filter(isFinite).map((cap) => ({ cap, loss: +loss({ p, cap, union: false }, wset).toFixed(2) }));
console.log(`  cap at p ${pName(all8.p)} on all 8: ` + capCurve(all8.p, ws).map((r) => `${r.cap} ${r.loss}`).join(", "));
console.log(`  cap at p ${pName(best.p)} on w2 w3 w6 w8: ` + capCurve(best.p, LOW).map((r) => `${r.cap} ${r.loss}`).join(", "));
// every coarse p's prediction on every widget
console.log("\nPrediction by p:");
for (const p of PCOARSE) console.log(`  p ${pName(p).padEnd(5)} ` + predict(plain(p)).map((x) => (x == null ? "none" : x.toFixed(1)).padStart(6)).join(""));
console.log(`  people  ` + ws.map((n) => stats[n].mean.toFixed(1).padStart(6)).join(""));

// leave one widget out over all 8
const lowo = ws.map((n) => {
  const f = fitOn(ws.filter((m) => m !== n))[0].s;
  const x = predict(f)[n - 1];
  return { n, s: f, x, err: x == null ? null : x - stats[n].mean, z: x == null ? null : (x - stats[n].mean) / stats[n].sd };
});
console.log("\nLeave one widget out (fit on the other 7, weights 1/sd^2):");
lowo.forEach((r) => console.log(`  w${r.n}: ${sName(r.s)} -> ${r.x == null ? "none" : r.x.toFixed(1)}, people ${stats[r.n].mean.toFixed(1)} (${r.err == null ? "-" : r.err.toFixed(1)}, ${r.z == null ? "-" : r.z.toFixed(1)} sd)`));

// the existing models on the same widgets, from widgets.json
const W = JSON.parse(readFileSync(OUT + "widgets.json", "utf8"));
const existing = W.models.map((m: { key: string; label: string }) => ({
  key: m.key,
  label: m.label,
  xs: W.widgets.map((w: { p: number[]; a: Record<string, number[]>; b: Record<string, number[]> }) => solve(w.p, w.a[m.key], w.b[m.key])),
}));
console.log("\nExisting models, error in sd on w2 w3 w6 w8 | w1 w4 w5 w7:");
for (const m of existing)
  console.log(
    `  ${m.label.padEnd(20)} ` +
      [...LOW, ...HIGH].map((n) => (m.xs[n - 1] == null ? " none" : ((m.xs[n - 1] - stats[n].mean) / stats[n].sd).toFixed(1).padStart(5))).join(" ")
  );
const withinSd = (xs: (number | null)[]) => LOW.filter((n) => xs[n - 1] != null && Math.abs(xs[n - 1]! - stats[n].mean) <= stats[n].sd).length;

// --- 3. groups on the high-spread widgets -------------------------------------
console.log("\nHigh-spread widgets: people, and the p each matches");
for (const n of HIGH)
  console.log(
    `  w${n} (contact ${sensitivity[n - 1].contact?.toFixed(1)}, mean p1 ${sensitivity[n - 1].mean1?.toFixed(1)}): ` +
      people.map((pe, i) => `${pe.name} ${pe.u[n]} -> p ${pName(perCell[i][n - 1]!.p)}`).join(", ")
  );

writeFileSync(
  OUT + "fit.json",
  JSON.stringify(
    {
      people: people.map((p) => p.name),
      stats,
      pcoarse: PCOARSE.map(pName),
      perCell: perCell.map((row) => row.map((c) => c && { p: pName(c.p), err: +c.err.toFixed(1) })),
      sensitivity: sensitivity.map((s) => ({ lo: +s.min.toFixed(1), hi: +s.max.toFixed(1), contact: s.contact && +s.contact.toFixed(1), mean1: s.mean1 && +s.mean1.toFixed(1) })),
      pooled: { p: pName(pooled[0].p), rms: +pooled[0].rms.toFixed(2) },
      perPerson: perPerson.map((r, i) => ({ name: people[i].name, p: pName(r.p), rms: +r.rms.toFixed(2) })),
      rmsPer: +rmsPer.toFixed(2),
      between: +between.toFixed(2),
      searched: SETTINGS.length,
      best: { ...best, p: pName(best.p), cap: isFinite(best.cap) ? best.cap : null, name: sName(best), loss: +lowAll[0].loss.toFixed(2), rows: report(best) },
      bestPlain: { p: pName(lowPlain[0].s.p), name: sName(lowPlain[0].s), loss: +lowPlain[0].loss.toFixed(2), rows: report(lowPlain[0].s), within: withinSd(predict(lowPlain[0].s)) },
      top: lowAll.slice(0, 8).map((r) => ({ name: sName(r.s), loss: +r.loss.toFixed(2) })),
      curves: { low: curve(Infinity, LOW), lowCap: curve(best.cap, LOW), allCap: curve(all8.cap, ws), capAll: capCurve(all8.p, ws), capLow: capCurve(best.p, LOW) },
      all8: { name: sName(all8), loss: +allFit[0].loss.toFixed(2), rows: report(all8), within: withinSd(predict(all8)) },
      byP: PCOARSE.map((p) => ({ p: pName(p), xs: predict(plain(p)).map((x) => x && +x.toFixed(1)) })),
      lowo: lowo.map((r) => ({ n: r.n, name: sName(r.s), x: r.x, err: r.err, z: r.z })),
      existing: existing.map((m: { label: string; xs: (number | null)[] }) => ({ label: m.label, xs: m.xs, within: withinSd(m.xs) })),
      bestWithin: withinSd(predict(best)),
    },
    null,
    1
  )
);
console.log(`\nwrote fit.json in ${Date.now() - t0} ms`);
