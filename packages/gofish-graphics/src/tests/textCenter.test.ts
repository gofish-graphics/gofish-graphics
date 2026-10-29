/**
 * A text placed by its center (`cx`) has the middle of its box there, exactly
 * as a rect of the same size does, whether the center is a pixel literal, a
 * numeric field through a data scale, or an aggregate of a time field inside
 * a partition cell. Run via `tsx` (`pnpm test:text-center`).
 *
 * Without a DOM, text is measured by the fallback (0.6 em per character), so
 * "WWWW" at 20px is 48px wide.
 */
import {
  Calendar,
  chart,
  field,
  layer,
  partition,
  rect,
  group,
  text,
} from "../lib";
import { check, items, report } from "./testHelpers";

const WIDTH = 48; // "WWWW" at 20px, by the fallback measure

/** The pixel center of every "WWWW" text's box, in paint order (the axes'
 *  labels are left out). */
const textCenters = (dl: any): number[] =>
  items(dl)
    .filter((it) => it.kind === "text" && it.text === "WWWW")
    .map((it) => {
      const start =
        it.textAnchor === "middle"
          ? it.x - WIDTH / 2
          : it.textAnchor === "end"
            ? it.x - WIDTH
            : it.x;
      return start + WIDTH / 2;
    });
/** The pixel center of every 48 by 10 rect, in paint order. */
const rectCenters = (dl: any): number[] =>
  items(dl)
    .filter((it) => it.kind === "rect" && it.w === WIDTH && it.h === 10)
    .map((it) => it.x + it.w / 2);
const near = (a: number[], b: number[]) =>
  a.length > 0 &&
  a.length === b.length &&
  a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

console.log("# literal cx");
for (const textAnchor of ["start", "middle", "end"] as const) {
  const dl = await layer([
    text({ cx: 100, y: 0, text: "WWWW", fontSize: 20, textAnchor }),
    rect({ cx: 100, y: 30, w: WIDTH, h: 10 }),
  ]).toDisplayList({ w: 200, h: 100 });
  check(
    `text({ cx: 100, textAnchor: "${textAnchor}" }) is centered like a rect`,
    near(textCenters(dl), rectCenters(dl)),
    { text: textCenters(dl), rect: rectCenters(dl) }
  );
}

const rows = [
  { k: "a", v: 0 },
  { k: "b", v: 10 },
  { k: "c", v: 40 },
];

console.log("# numeric field cx");
{
  const dl = await chart(rows)
    .flow(group({ by: "k" }))
    .mark(
      layer([
        text({ cx: "v", y: 0, text: "WWWW", fontSize: 20 }),
        rect({ cx: "v", y: 30, w: WIDTH, h: 10 }),
      ])
    )
    .toDisplayList({ w: 400, h: 100 });
  check(
    `text({ cx: "v" }) is centered like rect({ cx: "v" })`,
    near(textCenters(dl), rectCenters(dl)),
    { text: textCenters(dl), rect: rectCenters(dl) }
  );
}

console.log("# median of a time field in a partition cell");
{
  const days = Array.from({ length: 90 }, (_, i) => ({
    date: new Date(Date.UTC(2012, 0, 1 + i)),
    t: i,
  }));
  const dl = await chart(days)
    .flow(
      partition({
        by: field("date").bin([Calendar.year, Calendar.month]),
        dir: "x",
      })
    )
    .mark(
      layer([
        text({ cx: field("date").median(), y: 0, text: "WWWW", fontSize: 20 }),
        rect({ cx: field("date").median(), y: 30, w: WIDTH, h: 10 }),
      ])
    )
    .toDisplayList({ w: 600, h: 100 });
  check(
    "text({ cx: median(date) }) is centered like rect({ cx: median(date) })",
    near(textCenters(dl), rectCenters(dl)),
    { text: textCenters(dl), rect: rectCenters(dl) }
  );
}

report();
