/**
 * The shape form of `ribbon` and `line` (ast/shapes/band.tsx): the edges a
 * mark builds from its rows, the space it reports, and the errors for rows
 * it cannot draw.
 * Run: `tsx src/tests/band.test.ts` (wired into `pnpm test` as `test:band`).
 */
import { Band, bandOfRows, edgePath } from "../ast/shapes/band";
import { setGroupCell } from "../ast/groupCell";
import { GoFishNode } from "../ast/_node";
import {
  chart,
  group,
  line,
  ribbon,
  partition,
  field,
  Calendar,
  Unit,
  Domain,
  Trait,
} from "../lib";
import { linear, monotone } from "../families/curve";
import { add, constant, reparameterize, scale } from "../ast/fun";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;
const throws = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return (e as Error).message;
  }
  return "";
};

const x = { name: "x", accessor: "x" };
const h = { name: "h", accessor: "h", kind: "amount" as const };
const y = { name: "y", accessor: "h", kind: "position" as const };

console.log("# edges: one knot per row, sorted by the parameter");
{
  const rows = [
    { x: 2, h: 5 },
    { x: 0, h: 1 },
    { x: 1, h: -3 },
  ];
  const { edges } = bandOfRows("ribbon", rows, x, h, linear(), undefined);
  ok(
    "the upper edge runs through the rows in x order",
    close(edges.upper.at(0), 1) &&
      close(edges.upper.at(1), -3) &&
      close(edges.upper.at(2), 5),
    JSON.stringify([0, 1, 2].map((t) => edges.upper.at(t)))
  );
  ok(
    "a straight curve is read linearly between rows",
    close(edges.upper.at(0.5), -1) && close(edges.upper.at(1.5), 1)
  );
  ok(
    "its knots are the rows' x values",
    JSON.stringify(edges.upper.knots) === JSON.stringify([0, 1, 2]),
    JSON.stringify(edges.upper.knots)
  );
  ok(
    "an amount's lower edge is its baseline, 0",
    edges.lower.at(0) === 0 && edges.lower.at(1.5) === 0
  );
  ok(
    "its domain is the parameter's extent",
    edges.upper.domain.min === 0 && edges.upper.domain.max === 2
  );
  const pos = bandOfRows("line", rows, x, y, linear(), undefined).edges;
  ok(
    "a position's two edges are the one curve",
    pos.lower === pos.upper && close(pos.lower.at(2), 5)
  );
  const smooth = bandOfRows("ribbon", rows, x, h, monotone(), undefined)
    .edges.upper;
  ok(
    "a monotone curve passes through every row and stays between neighbors",
    close(smooth.at(1), -3) &&
      [0.25, 0.5, 0.75].every((t) => {
        const v = smooth.at(t);
        return v <= 1 + 1e-9 && v >= -3 - 1e-9;
      })
  );
  ok(
    "missing values are left out",
    bandOfRows(
      "ribbon",
      [...rows, { x: 3, h: undefined }, { x: undefined, h: 2 }],
      x,
      h,
      linear(),
      undefined
    ).edges.upper.domain.max === 2
  );
}

console.log("# errors");
{
  const dup = throws(() =>
    bandOfRows(
      "ribbon",
      [
        { x: 0, h: 1 },
        { x: 0, h: 2 },
      ],
      x,
      h,
      linear(),
      "north"
    )
  );
  ok(
    "two rows at one x are an error naming the group and the fix",
    dup.includes('"north"') && dup.includes("x = 0") && dup.includes("group"),
    dup
  );
  const ordinal = throws(() =>
    bandOfRows(
      "ribbon",
      [
        { x: "a", h: 1 },
        { x: "b", h: 2 },
      ],
      x,
      h,
      linear(),
      undefined
    )
  );
  ok(
    "a text parameter is an error naming the fix",
    ordinal.includes("connector form") && ordinal.includes("Unit.time()"),
    ordinal
  );
  ok(
    "a text value is an error",
    throws(() =>
      bandOfRows("line", [{ x: 0, h: "a" }], x, y, linear(), undefined)
    ).includes("must be numbers")
  );
  ok(
    "no drawable rows is an error",
    throws(() =>
      bandOfRows("line", [{ x: 0 }], x, y, linear(), undefined)
    ).includes("nothing to draw")
  );
}

console.log("# path: exact segments");
{
  const { edges } = bandOfRows(
    "ribbon",
    [
      { x: 0, h: 0 },
      { x: 1, h: 1 },
      { x: 2, h: 0 },
    ],
    x,
    h,
    monotone(),
    undefined
  );
  const path = edgePath(edges.upper, (t, v) => [t, v]);
  ok(
    "a cubic curve is drawn as one Bézier per piece",
    path.length === 2 && path.every((s) => s.type === "bezier"),
    JSON.stringify(path.map((s) => s.type))
  );
  const straight = edgePath(edges.lower, (t, v) => [t, v]);
  ok(
    "a straight edge is drawn as lines",
    straight.every((s) => s.type === "line")
  );
}
{
  // Hourly readings in epoch milliseconds, read in pixels: each piece's end,
  // summed from its own polynomial, meets the next piece's start only up to
  // rounding, and a continuous curve draws no jump there.
  const start = Date.UTC(2024, 1, 28);
  const rows = Array.from({ length: 85 }, (_, i) => ({
    x: start + i * 36e5,
    h:
      Math.round(
        (4 -
          5 * Math.cos(((i - 3) / 24) * 2 * Math.PI) +
          0.4 * Math.sin(i * 1.7)) *
          10
      ) / 10,
  }));
  const { edges } = bandOfRows("line", rows, x, y, monotone(), undefined);
  // As layout reads it: the parameter in local pixels, then the values
  // through the scale.
  const sigma = 480 / (84 * 36e5);
  const along = reparameterize(edges.upper, sigma, -sigma * start);
  const px = add(scale(along, -20), constant(122.6667, along.domain));
  const path = edgePath(px, (u, v) => [u, v]);
  ok(
    "a continuous curve in large units draws no jump at its knots",
    path.length === 84 && path.every((s) => s.type === "bezier"),
    JSON.stringify(path.filter((s) => s.type === "line"))
  );
}

/** Every node of a resolved tree, depth first. */
function* walk(node: GoFishNode): Generator<GoFishNode> {
  yield node;
  for (const c of node.children) if (c instanceof GoFishNode) yield* walk(c);
}

console.log("# space: the type the shape form reports");
{
  const rows = [
    { x: 0, h: 2, s: "a" },
    { x: 1, h: -3, s: "a" },
    { x: 2, h: 4, s: "a" },
  ];
  const root = (await chart(rows)
    .mark(ribbon({ x: "x", h: "h", curve: linear() }))
    .resolve()) as GoFishNode;
  await root.toDisplayList({ w: 200, h: 100, axes: false });
  const band = [...walk(root)].find((n) => n.type === "ribbon")!;
  const [px, py] = band._underlyingSpace! as any[];
  ok(
    "the parameter axis is pinned over the rows' extent",
    px.kind === "continuous" &&
      px.origin === "pinned" &&
      px.dataInterval.min === 0 &&
      px.dataInterval.max === 2,
    JSON.stringify(px)
  );
  ok(
    "a signed h: the value axis is free over [min(0, h), max(0, h)]",
    py.kind === "continuous" &&
      py.origin === "free" &&
      py.dataInterval.min === -3 &&
      py.dataInterval.max === 4,
    JSON.stringify(py)
  );
  ok(
    "and carries its cross-section as the profile",
    py.profile !== undefined &&
      close(py.profile.at(1).min, -3) &&
      close(py.profile.at(1).max, 0) &&
      close(py.profile.at(0.5).min, -0.5) &&
      close(py.profile.at(0.5).max, 0),
    JSON.stringify(py.profile?.at(1))
  );

  const lineRoot = (await chart(rows)
    .mark(line({ x: "x", y: "h" }))
    .resolve()) as GoFishNode;
  await lineRoot.toDisplayList({ w: 200, h: 100, axes: false });
  const path = [...walk(lineRoot)].find((n) => n.type === "line")!;
  const [, ly] = path._underlyingSpace! as any[];
  ok(
    "a line's value axis is pinned over its values",
    ly.origin === "pinned" &&
      ly.dataInterval.min === -3 &&
      ly.dataInterval.max === 4,
    JSON.stringify(ly)
  );
}

console.log("# time: a time column is a parameter");
{
  const rows = [
    { date: "2020-01-01", n: 1, s: "a" },
    { date: "2020-03-01", n: 3, s: "a" },
    { date: "2020-02-01", n: 2, s: "a" },
    { date: "2020-01-01", n: 5, s: "b" },
    { date: "2020-02-01", n: 4, s: "b" },
  ];
  const root = (await chart(rows, { schema: { date: Unit.time() } })
    .flow(group({ by: "s" }))
    .mark(ribbon({ x: "date", h: "n" }))
    .resolve()) as GoFishNode;
  await root.toDisplayList({ w: 200, h: 100, axes: false });
  const bands = [...walk(root)].filter((n) => n.type === "ribbon");
  ok("one band per group", bands.length === 2, `${bands.length}`);
  const [px] = bands[0]._underlyingSpace! as any[];
  ok(
    "the parameter runs over the dates in epoch milliseconds",
    px.dataInterval.min === Date.parse("2020-01-01") &&
      px.dataInterval.max === Date.parse("2020-03-01"),
    JSON.stringify(px.dataInterval)
  );
  const dup = await (async () => {
    try {
      const r = (await chart(rows, { schema: { date: Unit.time() } })
        .mark(ribbon({ x: "date", h: "n" }))
        .resolve()) as GoFishNode;
      await r.toDisplayList({ w: 200, h: 100, axes: false });
    } catch (e) {
      return (e as Error).message;
    }
    return "";
  })();
  ok(
    "ungrouped rows at one date are an error that names the date",
    dup.includes("2020-01-01") && dup.includes("group({ by })"),
    dup
  );
}

console.log("# ordinal: a column with levels is not a parameter");
{
  const rows = [
    { grade: 1, n: 1 },
    { grade: 2, n: 3 },
  ];
  let message = "";
  try {
    const r = (await chart(rows, {
      schema: {
        grade: Unit({ domain: Domain.discrete([1, 2]), traits: [Trait.ordered()] }),
      },
    })
      .mark(ribbon({ x: "grade", h: "n" }))
      .resolve()) as GoFishNode;
    await r.toDisplayList({ w: 200, h: 100, axes: false });
  } catch (e) {
    message = (e as Error).message;
  }
  ok(
    "an ordinal x is an error naming the fix",
    message.includes("has levels") && message.includes("connector form"),
    message
  );
}

console.log("# a cell of the parameter's line: the whole band, restricted");
{
  const rows = [
    { x: 0, h: 0 },
    { x: 1, h: 2 },
    { x: 2, h: 4 },
    { x: 3, h: 6 },
  ];
  const cell = setGroupCell([rows[1], rows[2]], {
    variable: { kind: "column", name: "x" },
    cell: { min: 0.5, max: 1.5 },
    whole: rows,
  });
  const { edges } = bandOfRows("ribbon", cell, x, h, linear(), undefined);
  ok(
    "the band runs over the cell, through the whole's rows",
    close(edges.upper.domain.min, 0.5) &&
      close(edges.upper.domain.max, 1.5) &&
      close(edges.upper.at(0.5), 1),
    JSON.stringify(edges.upper.domain)
  );
  const outside = setGroupCell([rows[0]], {
    variable: { kind: "column", name: "x" },
    cell: { min: 5, max: 6 },
    whole: rows,
  });
  ok(
    "a cell outside the rows is an error",
    throws(() => bandOfRows("ribbon", outside, x, h, linear(), undefined)) !== ""
  );
}

console.log("# inset");
{
  const rows = [
    { x: 0, h: 1 },
    { x: 1, h: -1 },
  ];
  const { edges } = bandOfRows("ribbon", rows, x, h, linear(), undefined);
  const band = (inset: number, closed = true, origin: "free" | "zero" = "free") =>
    Band({ axis: 0, edges, origin, closed, inset } as any);
  ok(
    "a negative inset is an error",
    /0 or more/.test(throws(() => band(-1)))
  );
  ok(
    "an inset on a band with negative values is allowed",
    throws(() => band(2)) === ""
  );
  ok(
    "an inset on a line is an error",
    /only a ribbon/.test(throws(() => band(2, false)))
  );
  ok("inset 0 is no inset", throws(() => band(0)) === "");
}

console.log("# inset: the ends are drawn in, the baseline stays");
{
  const rows = [
    { x: 0, h: 1 },
    { x: 1, h: 2 },
    { x: 2, h: 1 },
  ];
  /** The x and y extents of the points of the band's drawn path. */
  const drawn = async (inset?: number) => {
    const dl: any = await chart(rows)
      .mark(ribbon({ x: "x", h: "h", curve: linear(), inset }))
      .toDisplayList({ w: 200, h: 100, axes: false });
    const path = dl.items.find((i: any) => i.kind === "path");
    const nums = (path.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    const xs = nums.filter((_: number, i: number) => i % 2 === 0);
    const ys = nums.filter((_: number, i: number) => i % 2 === 1);
    return {
      x: [Math.min(...xs), Math.max(...xs)],
      y: [Math.min(...ys), Math.max(...ys)],
    };
  };
  const plain = await drawn();
  const inset = await drawn(5);
  ok(
    "each end is drawn in by the inset",
    close(inset.x[0], plain.x[0] + 5) && close(inset.x[1], plain.x[1] - 5),
    JSON.stringify({ plain, inset })
  );
  ok(
    "the baseline is where the data puts it",
    close(inset.y[1], plain.y[1]),
    JSON.stringify({ plain, inset })
  );
}

console.log("# cells: a partition's last cell is held whole past the last row");
{
  // Three months of days: the last row is Mar 31, the last cell ends Apr 1.
  const days: { date: string; v: number }[] = [];
  for (let t = Date.UTC(2012, 0, 1); t <= Date.UTC(2012, 2, 31); t += 864e5)
    days.push({ date: new Date(t).toISOString().slice(0, 10), v: 5 });
  const w = 300;
  const drawn = async (axes: any) => {
    const warnings: string[] = [];
    const warn = console.warn;
    console.warn = (...a: unknown[]) => void warnings.push(a.join(" "));
    let dl: any;
    try {
      dl = await chart(days, { schema: { date: Unit.time() } })
        .flow(
          partition({
            by: field("date").bin([Calendar.year, Calendar.month]),
            dir: "x",
          })
        )
        .mark(ribbon({ x: "date", h: "v" }))
        .toDisplayList({ w, h: 100, axes });
    } finally {
      console.warn = warn;
    }
    const xs = dl.items
      .filter((i: any) => i.kind === "path" && i.role !== "axis")
      .flatMap((p: any) =>
        [...String(p.d).matchAll(/[ML]\s*(-?[0-9.]+)[ ,]/g)].map((m) => +m[1])
      );
    return { lo: Math.min(...xs), hi: Math.max(...xs), warnings };
  };
  for (const [name, axes] of [
    ["no axes", false],
    ["a y axis", { x: false, y: true }],
  ] as const) {
    const { lo, hi, warnings } = await drawn(axes);
    // The bands run Jan 1 to Mar 31; the cells, one day more, to the edge.
    const day = (hi - lo) / (days.length - 1);
    ok(
      `with ${name}, the last cell ends at the canvas's edge`,
      close(w - hi, day, 1e-6),
      JSON.stringify({ lo, hi, day })
    );
    ok(
      `with ${name}, nothing draws past the canvas`,
      !warnings.some((m) => m.includes("[gofish:layout]")),
      warnings.join("\n")
    );
  }
}

console.log("# dispatch: the form follows the options");
{
  ok(
    "a ribbon given both x and y is an error",
    throws(() => ribbon({ x: "a", y: "b", h: "c" } as any)) !== ""
  );
  ok(
    "a line given y alone is an error",
    throws(() => line({ y: "b" } as any)) !== ""
  );
  ok(
    "a connector option in the shape form is an error",
    throws(() => ribbon({ x: "a", h: "c", dir: "x" } as any)) !== ""
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
