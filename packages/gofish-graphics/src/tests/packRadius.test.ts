/**
 * `pack` fits itself to its room when every radius comes from data (#967).
 * A node's enclosing-radius claim (`GoFishNode.enclosingRadius`) is the claim
 * form of the `enclosingCircle` geometry query: the radius of the smallest
 * circle around it as a function of σ. A circle answers `r·σ` for a data
 * radius and a constant for a pixel one; a pack of data radii with no
 * spacing answers `R(1)·σ` and claims `2·R(1)·σ` on each axis, so the scope
 * around it solves σ. Run: `tsx src/tests/packRadius.test.ts` (wired into
 * `pnpm test` as `test:pack-radius`).
 */
// The library first, so its modules initialize in their usual order.
import { chart, circle, pack, ellipse, rect, spread } from "../lib";
import * as Pwl from "../ast/solver/pwl";
import { check, report } from "./testHelpers";

/** Every ellipse in a display list, depth first. */
type Dot = { cx: number; cy: number; rx: number; ry: number };
const dotsOf = (dl: any): Dot[] => {
  const out: Dot[] = [];
  const walk = (it: any) => {
    if (it.kind === "ellipse")
      out.push({ cx: it.cx, cy: it.cy, rx: it.rx, ry: it.ry });
    (it.children ?? []).forEach(walk);
  };
  dl.items.forEach(walk);
  return out;
};

/** The bounding box of a set of dots. */
const boundsOf = (dots: Dot[]) => ({
  minX: Math.min(...dots.map((d) => d.cx - d.rx)),
  maxX: Math.max(...dots.map((d) => d.cx + d.rx)),
  minY: Math.min(...dots.map((d) => d.cy - d.ry)),
  maxY: Math.max(...dots.map((d) => d.cy + d.ry)),
});

const rows = [
  { k: "a", g: "x", v: 3 },
  { k: "b", g: "x", v: 1 },
  { k: "c", g: "y", v: 2 },
  { k: "d", g: "y", v: 4 },
  { k: "e", g: "y", v: 1.5 },
];

/** Whether `v` is the line `slope·σ` (no constant part). */
const linear = (v: Pwl.Value | undefined, slope: number) =>
  v !== undefined &&
  Pwl.isAffine(v) &&
  Math.abs(v.intercept) < 1e-12 &&
  Math.abs(v.slope - slope) < 1e-9;

console.log("# a circle's radius claim");
{
  const data = await circle({ r: "v" })([{ v: 3 }]);
  check(
    "a data r claims r·σ",
    linear(data.enclosingRadius(), 3),
    Pwl.print(data.enclosingRadius()!)
  );
  const area = await circle({ area: "v" })([{ v: 4 }]);
  check(
    "a data area claims the disc's radius √(area/π)·σ",
    linear(area.enclosingRadius(), Math.sqrt(4 / Math.PI)),
    Pwl.print(area.enclosingRadius()!)
  );
  const byH = await circle({ h: "v" })([{ v: 6 }]);
  check(
    "a data h claims h/2·σ",
    linear(byH.enclosingRadius(), 3),
    Pwl.print(byH.enclosingRadius()!)
  );
  const px = await circle({ r: 12 })([{ v: 3 }]);
  const r = px.enclosingRadius();
  check(
    "a pixel r claims a constant",
    r !== undefined && Pwl.isConstant(r) && Pwl.at(r, 7) === 12,
    r && Pwl.print(r)
  );
  const oval = await ellipse({ w: 30, h: 50 })([{ v: 3 }]);
  const o = oval.enclosingRadius();
  check(
    "a pixel ellipse claims its larger radius, as its geometry does",
    o !== undefined && Pwl.isConstant(o) && Pwl.at(o, 1) === 25,
    o && Pwl.print(o)
  );
  const free = await ellipse({ w: "v", h: "v" })([{ v: 3 }]);
  check(
    "an ellipse with two data sizes and no aspect lock has no radius claim",
    free.enclosingRadius() === undefined
  );
  const fills = await circle({})([{ v: 3 }]);
  check(
    "a circle that fills its room has no radius claim",
    fills.enclosingRadius() === undefined
  );
}

console.log("# a pack's radius claim");
{
  const radii = [3, 1, 2, 4, 1.5];
  // An accessor radius gives each circle its own data radius.
  const node = await pack(
    {},
    radii.map((v) => circle({ r: () => v }))
  )([{}]);
  const R = node.enclosingRadius();
  check(
    "an all-data pack with no spacing claims a line through 0 in σ",
    R !== undefined && Pwl.isAffine(R) && R.intercept === 0 && R.slope > 0,
    R && Pwl.print(R)
  );
  // Linear in σ: the pack of radii k·r_i is k times the pack of r_i.
  const scaled = await pack(
    {},
    radii.map((v) => circle({ r: 10 * v }))
  )([{}]);
  const R10 = scaled.enclosingRadius();
  check(
    "the pack of the same radii in pixels at σ = 10 is R(1)·10",
    R !== undefined &&
      R10 !== undefined &&
      Pwl.isConstant(R10) &&
      Math.abs(Pwl.at(R10, 0) - 10 * Pwl.at(R, 1)) < 1e-9,
    { R: R && Pwl.print(R), R10: R10 && Pwl.print(R10) }
  );
  check(
    "the pack's claim is 2·R(1)·σ on each axis",
    node
      .resolveExtent()
      .every(
        (e) =>
          e !== undefined &&
          R !== undefined &&
          Pwl.approxEqual(e.width, Pwl.scale(2, R))
      )
  );

  const spaced = await pack(
    { spacing: 4 },
    radii.map((v) => circle({ r: () => v }))
  )([{}]);
  check(
    "data radii with a pixel spacing have no radius claim (TODO #967)",
    spaced.enclosingRadius() === undefined
  );
  const mixed = await pack({}, [circle({ r: () => 3 }), circle({ r: 12 })])([
    {},
  ]);
  check(
    "data and pixel radii mixed have no radius claim (TODO #967)",
    mixed.enclosingRadius() === undefined
  );
  const pixels = await pack({ spacing: 4 }, [
    circle({ r: 3 }),
    circle({ r: 12 }),
  ])([{}]);
  const P = pixels.enclosingRadius();
  check(
    "pixel radii only claim a constant radius and no room",
    P !== undefined &&
      Pwl.isConstant(P) &&
      Math.abs(Pwl.at(P, 0) - 17) < 1e-9 &&
      pixels.resolveExtent().every((e) => e === undefined),
    P && Pwl.print(P)
  );
  const withRect = await pack({}, [
    circle({ r: () => 3 }),
    rect({ w: 4, h: 4 }),
  ])([{}]);
  check(
    "a child that does not answer leaves the pack with no radius claim",
    withRect.enclosingRadius() === undefined
  );
}

console.log("# a data-radius pack fits its room");
for (const [w, h] of [
  [300, 300],
  [500, 260],
  [240, 420],
] as const) {
  const dots = dotsOf(
    await chart(rows, { axes: false })
      .flow(pack({ by: "k" }))
      .mark(circle({ r: "v" }))
      .toDisplayList({ w, h })
  );
  const b = boundsOf(dots);
  const side = Math.min(w, h);
  const across = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  check(
    `at ${w}×${h}, the pack's circles stay inside the room`,
    b.minX >= -1e-6 &&
      b.minY >= -1e-6 &&
      b.maxX <= w + 1e-6 &&
      b.maxY <= h + 1e-6,
    b
  );
  // The enclosing circle is 2R across; the dots' bounding box is at most that
  // and touches it on the binding side's two extreme circles, so its larger
  // side is within the smallest-circle slack of 2R = the room's smaller side.
  check(
    `at ${w}×${h}, the pack fills the room's smaller side`,
    across <= side + 1e-6 && across >= 0.8 * side,
    { across, side }
  );
  check(
    `at ${w}×${h}, the radii keep their data ratio`,
    dots.every((d, i) => Math.abs(d.rx / dots[0].rx - rows[i].v / rows[0].v) < 1e-9)
  );
}

console.log("# the solved pack's enclosing circle fits the room");
{
  // At σ the pack's circle is R(1)·σ; the room's smaller side is 2·R(1)·σ.
  const node = await pack(
    {},
    rows.map((r) => circle({ r: () => r.v }))
  )([{}]);
  const R1 = Pwl.at(node.enclosingRadius()!, 1);
  for (const side of [300, 180]) {
    const dots = dotsOf(
      await chart(rows, { axes: false })
        .flow(pack({ by: "k" }))
        .mark(circle({ r: "v" }))
        .toDisplayList({ w: side, h: side })
    );
    const sigma = dots[0].rx / rows[0].v;
    check(
      `at ${side}×${side}, 2·R(1)·σ is the room within rounding`,
      Math.abs(2 * R1 * sigma - side) < 1e-6,
      { R1, sigma, side }
    );
  }
}

console.log("# nested all-data packs fit, and packs in a spread share σ");
{
  const dots = dotsOf(
    await chart(rows, { axes: false })
      .flow(pack({ by: "g" }), pack({ by: "k" }))
      .mark(circle({ r: "v" }))
      .toDisplayList({ w: 300, h: 300 })
  );
  const b = boundsOf(dots);
  check(
    "a pack of packs of data radii fits its room",
    dots.length === rows.length &&
      b.minX >= -1e-6 &&
      b.maxX <= 300 + 1e-6 &&
      b.minY >= -1e-6 &&
      b.maxY <= 300 + 1e-6 &&
      Math.max(b.maxX - b.minX, b.maxY - b.minY) >= 0.8 * 300,
    b
  );
  const row = dotsOf(
    await chart(rows, { axes: false })
      .flow(spread({ by: "g", dir: "x", spacing: 0 }), pack({ by: "k" }))
      .mark(circle({ r: "v" }))
      .toDisplayList({ w: 400, h: 300 })
  );
  const rb = boundsOf(row);
  check(
    "packs in a spread fit its width, with one σ for every radius",
    rb.maxX <= 400 + 1e-6 &&
      rb.maxY <= 300 + 1e-6 &&
      row.every(
        (d, i) => Math.abs(d.rx / row[0].rx - rows[i].v / rows[0].v) < 1e-9
      ),
    rb
  );
}

report();
