/**
 * Function-valued channels (stack profiles S9): `fun(at, { domain })` in a
 * channel of the shape form of `ribbon` and `line`. Covers the extent of a
 * function-valued band, a stack of two function ribbons keeping each
 * thickness, the equal-domains error, a column beside a function, and a
 * function in a `rect` channel. The type-level half (a function in a rect
 * channel is a type error) is `marks/funChannel.typetest.ts`.
 *
 * Run: `pnpm build && tsx src/tests/funChannel.test.ts` (wired as
 * `pnpm test:fun-channel`). It imports from `dist` for the same lodash-ESM
 * reason as `axisDims.test.ts`.
 */

// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";

const { chart, stack, ribbon, line, rect, scatter, circle, layer, fun, Baseline } =
  GoFish as any;

declare const process: { exit(code: number): never };

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) < tol;
const errorOf = async (f: () => Promise<unknown>): Promise<string> => {
  try {
    await f();
  } catch (e) {
    return (e as Error).message;
  }
  return "";
};

/** Each drawn band's upper and lower edge, as the vertices of its path. */
const pathsOf = (dl: any): { upper: number[][]; lower: number[][] }[] => {
  const out: { upper: number[][]; lower: number[][] }[] = [];
  const walk = (it: any) => {
    if (it.kind === "path") {
      const cmds = it.d.match(/[MCL][^MCLZ]*/g) as string[];
      const ends = cmds.map((c) => {
        const n = c.slice(1).trim().split(/[ ,]+/).map(Number);
        return [n[n.length - 2], n[n.length - 1]];
      });
      const right = Math.max(...ends.map((p) => p[0]));
      const turn = ends.findIndex((p) => p[0] === right);
      out.push({
        upper: ends.slice(0, turn + 1),
        lower: ends.slice(turn + 1, ends.length - 1),
      });
    }
    for (const c of it.children ?? []) walk(c);
  };
  dl.items.forEach(walk);
  return out;
};
/** A polyline's y at `x`, between its vertices. */
const yAt = (pts: number[][], x: number): number => {
  const sorted = [...pts].sort((a, b) => a[0] - b[0]);
  for (let i = 0; i + 1 < sorted.length; i++) {
    const [ax, ay] = sorted[i];
    const [bx, by] = sorted[i + 1];
    if (x >= ax - 1e-9 && x <= bx + 1e-9)
      return bx === ax ? ay : ay + ((by - ay) * (x - ax)) / (bx - ax);
  }
  return NaN;
};

const bump = fun((t: number) => 1 + Math.exp(-((t - 2) ** 2)), {
  domain: [0, 4],
});
const wave = fun((t: number) => 1 + 0.5 * Math.sin(2 * t), {
  domain: [0, 4],
});

async function main() {
  console.log("\n# fun: a function value");
  {
    check(
      "support() is the identity over the domain",
      near(bump.support().at(0), 0) &&
        near(bump.support().at(3), 3) &&
        bump.support().domain.min === 0 &&
        bump.support().domain.max === 4
    );
    check(
      "a domain that is not [min, max] is an error",
      (await errorOf(async () => fun((t: number) => t, { domain: [2, 1] })))
        .includes("domain is [min, max]")
    );
  }

  console.log("\n# the extent of a function-valued band");
  {
    // h is 1 + e^{-(t-2)^2}: its maximum is 2 at t = 2, inside the domain,
    // between any samples a resampler would take.
    const root = await chart([{}])
      .mark(ribbon({ x: bump.support(), h: bump }))
      .resolve();
    await root.toDisplayList({ w: 400, h: 200, axes: false });
    const find = (n: any): any =>
      n.type === "ribbon"
        ? n
        : (n.children ?? []).map(find).find((c: any) => c !== undefined);
    const [px, py] = find(root)._underlyingSpace as any[];
    check(
      "the parameter axis is pinned over the domain",
      px.kind === "continuous" &&
        px.origin === "pinned" &&
        px.dataInterval.min === 0 &&
        px.dataInterval.max === 4,
      JSON.stringify(px)
    );
    check(
      "the value axis is free over [0, max h], the maximum found between knots",
      py.kind === "continuous" &&
        py.origin === "free" &&
        py.dataInterval.min === 0 &&
        near(py.dataInterval.max, 2, 1e-6),
      JSON.stringify(py)
    );
    const [band] = pathsOf(
      await ribbon({ x: bump.support(), h: bump }).toDisplayList({
        w: 400,
        h: 200,
        axes: false,
      })
    );
    const top = Math.min(...band.upper.map((p) => p[1]));
    check(
      "the drawn edge reaches the maximum, to half a pixel",
      band !== undefined && Math.abs(top - 0) <= 0.5,
      String(top)
    );
  }

  console.log("\n# a stack of two function ribbons");
  for (const baseline of [undefined, Baseline?.middle?.()]) {
    const name = baseline === undefined ? "start" : "middle";
    const dl = await stack(
      { dir: "y", ...(baseline ? { baseline } : {}) },
      [
        ribbon({ x: bump.support(), h: bump }),
        ribbon({ x: wave.support(), h: wave, fill: "red" }),
      ]
    ).toDisplayList({ w: 400, h: 200, axes: false });
    const bands = pathsOf(dl);
    const xs = bands.flatMap((b) => b.upper.map((p) => p[0]));
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const fs = [bump, wave];
    const ts = [0.1, 0.7, 1.3, 2, 2.6, 3.4, 3.9];
    const thickness = (i: number, t: number) => {
      const x = x0 + ((x1 - x0) * t) / 4;
      return yAt(bands[i].lower, x) - yAt(bands[i].upper, x);
    };
    // Pixels per unit, from the first band at t = 2.
    const k = thickness(0, 2) / bump.at(2);
    check(
      `${name}: each band keeps its thickness, to a pixel`,
      bands.length === 2 &&
        bands.every((_, i) =>
          ts.every((t) => Math.abs(thickness(i, t) - k * fs[i].at(t)) < 1)
        ),
      JSON.stringify(bands.map((_, i) => ts.map((t) => thickness(i, t))))
    );
    check(
      `${name}: the second band lies on the first`,
      bands.length === 2 &&
        ts.every((t) => {
          const x = x0 + ((x1 - x0) * t) / 4;
          return Math.abs(yAt(bands[1].lower, x) - yAt(bands[0].upper, x)) < 1;
        })
    );
  }

  console.log("\n# a trend line over a scatter");
  {
    const rows = [
      { x: 1, y: 2 },
      { x: 2, y: 3 },
      { x: 3, y: 5 },
    ];
    const trend = fun((t: number) => 1.5 * t + 0.3, { domain: [1, 3] });
    const err = await errorOf(() =>
      layer([
        chart(rows).flow(scatter({ x: "x", y: "y" })).mark(circle({ r: 3 })),
        line({ x: trend.support(), y: trend }),
      ]).toDisplayList({ w: 300, h: 200 })
    );
    check("line({ x: f.support(), y: f }) draws beside a scatter", err === "", err);
  }

  console.log("\n# serialization");
  {
    const doc = await chart([{ a: 1 }])
      .mark(ribbon({ x: bump.support(), h: bump, fill: "red" }))
      .toJSON();
    const text = JSON.stringify(doc);
    check(
      "a function value is dropped from the IR, as an accessor is",
      text.includes('"type":"ribbon"') &&
        !text.includes('"h":') &&
        text.includes('"fill":"red"'),
      text
    );
  }

  console.log("\n# errors");
  {
    const narrow = fun((t: number) => t, { domain: [1, 3] });
    const domains = await errorOf(() =>
      ribbon({ x: narrow.support(), h: bump }).toDisplayList({ w: 100, h: 100 })
    );
    check(
      "unequal domains are an error that names both",
      domains.includes("domains must be equal") &&
        domains.includes("x is over [1, 3]") &&
        domains.includes("h over [0, 4]"),
      domains
    );
    const column = await errorOf(() =>
      chart([{ u: 0 }, { u: 1 }])
        .mark(ribbon({ x: "u", h: bump }))
        .toDisplayList({ w: 100, h: 100 })
    );
    check(
      "a column beside a function is an error",
      column.includes("rows are not read at t"),
      column
    );
    const constant = await errorOf(() =>
      ribbon({ x: bump.support(), h: 2 }).toDisplayList({ w: 100, h: 100 })
    );
    check("a constant beside a function is allowed", constant === "", constant);
    const inRect = await errorOf(() =>
      chart([{ a: 1 }])
        .mark(rect({ w: 10, h: bump }))
        .toDisplayList({ w: 100, h: 100 })
    );
    check(
      "a function in a rect channel is an error that names the mark and the fix",
      inRect.includes("rect({ h })") && inRect.includes("f.support()"),
      inRect
    );
    const curve = await errorOf(() =>
      ribbon({
        x: bump.support(),
        h: bump,
        curve: GoFish.Curve.linear(),
      }).toDisplayList({ w: 100, h: 100 })
    );
    check("a curve with function channels is an error", curve.includes("Remove curve"), curve);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
