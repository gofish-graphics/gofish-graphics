// Hard reference visualizations: stress tests for the two candidate
// spellings (Proposal 1 "ends are rows", Proposal 2 "syntax follows the
// data"). Every story renders the closest spelling that WORKS today.
// See proposals/stacked-ribbons/NOTES-hard.md.
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import {
  chart,
  spread,
  stack,
  rect,
  ribbon,
  line,
  selectAll,
  group,
  layer,
  field,
  filter,
  derive,
  project,
  Curve,
  Color,
  Shape,
  enclose,
} from "../../../src/lib";
import { clock } from "../../../src/ast/coordinateTransforms/clock";
// THROWAWAY prototype (see the file header); not part of the public API.
import { chordRibbon } from "../../../src/ast/graphicalOperators/_proposalChordRibbon";

const meta: Meta = { title: "Proposals/Stacked Ribbons/Hard Refs" };
export default meta;

/** Render, and print a thrown error above the (empty) picture. */
const show = (fn: (c: HTMLElement) => unknown) => {
  const container = initializeContainer();
  Promise.resolve()
    .then(() => fn(container))
    .catch((e) => {
      const pre = document.createElement("pre");
      pre.textContent = "ERROR: " + (e?.message ?? String(e));
      container.prepend(pre);
      console.error(e);
    });
  return container;
};

/** Sort refs by a projected field before grouping (selectAll order is
 *  registration order, and a ribbon runs in ref order). */
const sortRefs = (key: (r: any) => number | string) =>
  derive((refs: any[]) =>
    [...refs].sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    })
  );

// ===========================================================================
// 1. FrankenSankey (FT, "Final asylum appeals often fail")
// ===========================================================================
// ESTIMATED data. Country totals and % positive are printed in the image;
// accepted = round(total * pct). The 2008-2016 yearly totals are read off
// the area chart by eye (thousands).

const DECISIONS = ["Accepted", "Rejected"] as const;
export const asylumCountries = [
  { country: "Germany", total: 158210, pct: 0.4 },
  { country: "France", total: 47745, pct: 0.17 },
  { country: "Sweden", total: 19015, pct: 0.24 },
  { country: "Italy", total: 12590, pct: 0.26 },
  { country: "UK", total: 12500, pct: 0.57 },
  { country: "Greece", total: 9550, pct: 0.16 },
  { country: "Austria", total: 6960, pct: 0.56 },
  { country: "Belgium", total: 5070, pct: 0.06 },
  { country: "All 20 others", total: 10190, pct: 0.39 },
];
// One row per (country, decision) link, in thousands.
export const asylumLinks = asylumCountries.flatMap((c, ci) =>
  DECISIONS.map((decision, di) => ({
    country: c.country,
    ci,
    decision,
    di,
    value: (decision === "Accepted" ? c.total * c.pct : c.total * (1 - c.pct)) / 1000,
  }))
);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const acc2017 = sum(asylumLinks.filter((l) => l.di === 0).map((l) => l.value));
const rej2017 = sum(asylumLinks.filter((l) => l.di === 1).map((l) => l.value));
// Estimated from the picture (thousands): [year, accepted, rejected].
export const asylumYears: [number, number, number][] = [
  [2008, 18, 65],
  [2009, 14, 74],
  [2010, 13, 95],
  [2011, 14, 103],
  [2012, 12, 108],
  [2013, 18, 108],
  [2014, 26, 108],
  [2015, 40, 146],
  [2016, 89, 188],
  [2017, Math.round(acc2017), Math.round(rej2017)],
];

// The ends table. Tiers: part (left = area + 2017 bar, right = countries),
// col (year), side (area total vs bar ends), g1 (country, right only), key
// (the end order inside the column).
//  - area rows: one per (year, decision); 2017 too, as the bar's "total".
//  - bar rows: one per link, DECISION-major (all accepted, then rejected).
//  - country rows: one per link, COUNTRY-major (g1 = country, key = decision).
const pad = (n: number) => String(n).padStart(2, "0");
export const frankenEnds = [
  ...asylumYears.flatMap(([year, a, r]) =>
    DECISIONS.map((decision, di) => ({
      kind: "area",
      part: 0,
      col: year,
      side: 0,
      g1: "",
      key: pad(di),
      decision,
      value: [a, r][di],
      link: "",
    }))
  ),
  ...asylumLinks.map((l) => ({
    kind: "bar",
    part: 0,
    col: 2017,
    side: 1,
    g1: "",
    key: `${pad(l.di)}|${pad(l.ci)}`,
    decision: l.decision,
    value: l.value,
    link: `${l.country}/${l.decision}`,
  })),
  ...asylumLinks.map((l) => ({
    kind: "country",
    part: 1,
    col: 0,
    side: 0,
    g1: pad(l.ci),
    key: pad(l.di),
    decision: l.decision,
    value: l.value,
    link: `${l.country}/${l.decision}`,
  })),
];
const FT = Color.palette({ Accepted: "#f27fae", Rejected: "#1f4f87" });

export const FrankenSankey: StoryObj = {
  render: () =>
    show((c) =>
      layer([
        chart(frankenEnds, { color: FT })
          .flow(
            spread({ by: field("part").sort(), dir: "x", spacing: 150, alignment: "end", axes: false }),
            spread({ by: field("col").sort(), dir: "x", spacing: 22, alignment: "end", axes: false }),
            spread({ by: field("side").sort(), dir: "x", spacing: 0, alignment: "end", axes: false }),
            spread({ by: field("g1").sort(), dir: "y", spacing: 6, axes: false }),
            spread({ by: field("key").sort(), dir: "y", spacing: 0, axes: false })
          )
          .mark(
            rect({
              w: (d: any) => (d.kind === "area" ? 0 : 14),
              h: "value",
              fill: "decision",
            } as any).name("ends")
          ),
        // the stacked area: one band per decision through the yearly totals
        chart(selectAll("ends"))
          .flow(
            filter((r: any) => project(r, "kind") === "area"),
            sortRefs((r) => project(r, "col") as number),
            group({ by: "decision" })
          )
          .mark(ribbon({ fill: "decision", opacity: 1 })),
        // the sankey half: bar end -> country end, one ribbon per link
        chart(selectAll("ends"))
          .flow(
            filter((r: any) => project(r, "kind") !== "area"),
            sortRefs((r) => (project(r, "kind") === "bar" ? 0 : 1)),
            group({ by: "link" })
          )
          .mark(ribbon({ fill: "decision", opacity: 0.55, curve: Curve.bezier() })),
      ]).render(c, { w: 420, h: 320, axes: false } as any)
    ),
};

// The Proposal 2 shape: a record of three parts (area, bar, countries), each
// its own chart with its own data and flow, in nested `spread` combinators.
// The bar and the countries read the SAME link objects in two orders.
const areaRows = frankenEnds.filter((e) => e.kind === "area");
const barRows = [...asylumLinks].sort((a, b) => a.di - b.di || a.ci - b.ci);
export const FrankenSankeyParts: StoryObj = {
  render: () =>
    show((c) =>
      layer([
        spread({ dir: "x", spacing: 150, alignment: "end" }, [
          spread({ dir: "x", spacing: 0, alignment: "end" }, [
            chart(areaRows, { color: FT, axes: false })
              .flow(
                spread({ by: field("col").sort(), dir: "x", spacing: 22, alignment: "end" }),
                spread({ by: field("key").sort(), dir: "y", spacing: 0, axes: false })
              )
              .mark(rect({ w: 0, h: "value", fill: "decision" }).name("area")),
            chart(barRows, { axes: false })
              .flow(spread({ dir: "y", spacing: 0 }))
              .mark(rect({ w: 14, h: "value", fill: "decision" }).name("ends")),
          ]),
          chart(asylumLinks)
            .flow(
              spread({ by: field("country").sort(asylumCountries.map((c) => c.country)), dir: "y", spacing: 6 }),
              spread({ by: field("decision").sort([...DECISIONS]), dir: "y", spacing: 0, axes: false })
            )
            .mark(rect({ w: 14, h: "value", fill: "decision" }).name("ends")),
        ]),
        chart(selectAll("area"))
          .flow(sortRefs((r) => project(r, "col") as number), group({ by: "decision" }))
          .mark(ribbon({ fill: "decision", opacity: 1 })),
        chart(selectAll("ends"))
          .flow(group({ by: (r: any) => r.datum[0] }))
          .mark(ribbon({ fill: "decision", opacity: 0.55, curve: Curve.bezier() })),
      ]).render(c, { w: 420, h: 320, axes: false } as any)
    ),
};

// ===========================================================================
// 2. PiCCL "7 emotional school days"
// ===========================================================================
// Counts read off the drop rows under each glass (one drop = 1).
const DAYS = ["TUE", "WED", "THU", "FRI", "SAT", "SUN", "MON"];
const EMOTIONS = ["peaceful", "stressed", "funny", "diffident", "trusted"];
export const schoolCounts: Record<string, Record<string, number>> = {
  peaceful: { SUN: 13, SAT: 7, FRI: 6, THU: 2, WED: 10, TUE: 14 },
  stressed: { MON: 1, SUN: 1, SAT: 1, FRI: 3, THU: 5, WED: 4, TUE: 7 },
  funny: { MON: 3, SUN: 8, SAT: 2, FRI: 4, THU: 2, WED: 7, TUE: 11 },
  diffident: { WED: 2, TUE: 3 },
  trusted: { MON: 3, SUN: 3, SAT: 3, FRI: 3, THU: 4, WED: 1 },
};
export const schoolLinks = EMOTIONS.flatMap((emotion) =>
  Object.entries(schoolCounts[emotion]).map(([day, count]) => ({
    day,
    emotion,
    count,
    link: `${day}/${emotion}`,
  }))
);
// Ends: the day end is ordered by emotion (left to right), the emotion end
// by day. `side` 0 = day (top row), 1 = emotion (bottom row).
export const schoolEnds = schoolLinks.flatMap((l) => [
  { ...l, side: 0, node: DAYS.indexOf(l.day), key: EMOTIONS.indexOf(l.emotion) },
  { ...l, side: 1, node: EMOTIONS.indexOf(l.emotion), key: DAYS.indexOf(l.day) },
]);
const SCHOOL = Color.palette({
  peaceful: "#e9c95b",
  stressed: "#b98bc9",
  funny: "#ee9f85",
  diffident: "#8fcf86",
  trusted: "#9fcbd8",
});

export const SchoolDays: StoryObj = {
  render: () =>
    show((c) =>
      layer([
        chart(schoolEnds, { color: SCHOOL })
          .flow(
            spread({ by: field("side").sort(), dir: "y", spacing: 220, alignment: "middle", axes: false }),
            spread({ by: field("node").sort(), dir: "x", spacing: 36, alignment: "start", axes: false }),
            spread({ by: field("key").sort(), dir: "x", spacing: 0, alignment: "start", axes: false })
          )
          .mark(
            rect({
              w: "count",
              h: (d: any) => (d.side === 0 ? 4 : 90),
              fill: "emotion",
            } as any).name("ends")
          ),
        chart(selectAll("ends"))
          .flow(sortRefs((r) => project(r, "side") as number), group({ by: "link" }))
          .mark(ribbon({ fill: "emotion", opacity: 0.6, dir: "y", curve: Curve.bezier() } as any)),
      ]).render(c, { w: 700, h: 420, axes: false } as any)
    ),
};

// Two rows, two charts (the Proposal 2 shape): the day row and the glass
// row get their own spacing, and the node tiers draw their names.
export const SchoolDaysTwoRows: StoryObj = {
  render: () =>
    show((c) =>
      layer([
        spread({ dir: "y", spacing: 200, alignment: "middle" }, [
          chart(schoolLinks.map((l) => ({ ...l, side: 0 })), { color: SCHOOL })
            .flow(
              spread({ by: field("day").sort(DAYS), dir: "x", spacing: 60, alignment: "start" }),
              spread({ by: field("emotion").sort(EMOTIONS), dir: "x", spacing: 0, axes: false })
            )
            .mark(rect({ w: "count", h: 4, fill: "emotion" }).name("ends")),
          chart(schoolLinks.map((l) => ({ ...l, side: 1 })))
            .flow(
              spread({ by: field("emotion").sort(EMOTIONS), dir: "x", spacing: 50, alignment: "start" }),
              spread({ by: field("day").sort(DAYS), dir: "x", spacing: 0, axes: false })
            )
            .mark(rect({ w: "count", h: 90, fill: "emotion", opacity: 0.85 } as any).name("ends")),
        ]),
        chart(selectAll("ends"))
          .flow(sortRefs((r) => project(r, "side") as number), group({ by: "link" }))
          .mark(ribbon({ fill: "emotion", opacity: 0.6, dir: "y", curve: Curve.bezier() } as any)),
      ]).render(c, { w: 760, h: 420, axes: false } as any)
    ),
};

// ===========================================================================
// 3. PiCCL Beatles: songs -> writers, one LINE per (song, writer)
// ===========================================================================
// SYNTHETIC: real song titles, writer sets approximated and NOT checked.
const WRITERS = ["Lennon", "McCartney", "Harrison", "Starr"];
const L = "Lennon", M = "McCartney", H = "Harrison", S = "Starr";
export const beatlesSongs: { song: string; writers: string[] }[] = [
  ["Help!", [L]], ["Strawberry Fields Forever", [L]], ["Across the Universe", [L]],
  ["Come Together", [L]], ["Revolution", [L]], ["Julia", [L]], ["Girl", [L]],
  ["Nowhere Man", [L]], ["I Am the Walrus", [L]], ["Don't Let Me Down", [L]],
  ["In My Life", [L, M]], ["A Day in the Life", [L, M]], ["She Loves You", [L, M]],
  ["I Want to Hold Your Hand", [L, M]], ["From Me to You", [L, M]],
  ["Baby's in Black", [L, M]], ["We Can Work It Out", [M, L]],
  ["With a Little Help from My Friends", [M, L]], ["Drive My Car", [M, L]],
  ["Yesterday", [M]], ["Hey Jude", [M]], ["Let It Be", [M]], ["Blackbird", [M]],
  ["Penny Lane", [M]], ["Eleanor Rigby", [M]], ["Michelle", [M]],
  ["Lady Madonna", [M]], ["Get Back", [M]], ["Helter Skelter", [M]],
  ["Something", [H]], ["Here Comes the Sun", [H]],
  ["While My Guitar Gently Weeps", [H]], ["Taxman", [H]], ["If I Needed Someone", [H]],
  ["Within You Without You", [H]], ["Flying", [L, M, H, S]],
  ["What Goes On", [L, M, S]], ["Dig It", [L, M, H, S]],
  ["Don't Pass Me By", [S]], ["Octopus's Garden", [S]],
].map(([song, writers]) => ({ song: song as string, writers: writers as string[] }));
export const beatlesLinks = beatlesSongs.flatMap((s, si) =>
  s.writers.map((writer) => ({ song: s.song, si, writer, link: `${s.song}/${writer}` }))
);
const BEATLES = Color.palette({
  Lennon: "#ff7f0e",
  McCartney: "#2ca02c",
  Harrison: "#1f77b4",
  Starr: "#d62728",
});

// Flat "ends are rows" version: the song row and the writer row share ONE
// node tier, so they share its spacing (12 px) and the heads overlap.
export const ProbeBeatlesFlat: StoryObj = {
  render: () =>
    show((c) =>
      layer([
        chart(
          beatlesLinks.map((l) => ({ ...l, side: 0, node: l.si, key: WRITERS.indexOf(l.writer) })).concat(
            beatlesLinks.map((l) => ({ ...l, side: 1, node: WRITERS.indexOf(l.writer), key: l.si }))
          ),
          { color: BEATLES }
        )
          .flow(
            spread({ by: field("side").sort(), dir: "y", spacing: 260, alignment: "middle", axes: false }),
            spread({ by: field("node").sort(), dir: "x", spacing: 12, alignment: "start", axes: false }),
            // EQUAL-size ends, spread evenly: fixed pixel width per end
            spread({ by: field("key").sort(), dir: "x", spacing: 2, alignment: "start", axes: false })
          )
          .mark(
            rect({
              w: (d: any) => (d.side === 0 ? 0 : 1),
              h: 3,
              fill: "writer",
            } as any).name("ends")
          ),
        // the writer "heads": an oval around each writer's ends (image nodes
        // are out of scope; see NOTES-hard.md)
        chart(selectAll("ends"))
          .flow(filter((r: any) => project(r, "side") === 1), group({ by: "writer" }))
          .mark(enclose({ shape: Shape.oval(), padding: 14, fill: "writer", stroke: "writer", fillOpacity: 0.35 } as any)),
        chart(selectAll("ends"))
          .flow(sortRefs((r) => project(r, "side") as number), group({ by: "link" }))
          .mark(line({ stroke: "writer", strokeWidth: 1.5, dir: "y", curve: Curve.bezier() } as any)),
      ]).render(c, { w: 820, h: 420, axes: false } as any)
    ),
};

// Two rows, two charts (the Proposal 2 shape): each row has its own flow and
// spacing. A song's ends sit on one point (w 0); a writer's ends are EQUAL
// size (w 1, not the value) and evenly spaced. Lines join the ends that are
// the same link object.
const songEnds = beatlesLinks.map((l) => ({ ...l, key: WRITERS.indexOf(l.writer) }));
export const Beatles: StoryObj = {
  render: () =>
    show((c) =>
      layer([
        spread({ dir: "y", spacing: 260, alignment: "middle" }, [
          chart(songEnds, { color: BEATLES, axes: false })
            .flow(
              spread({ by: field("si").sort(), dir: "x", spacing: 18, alignment: "start", axes: false }),
              spread({ by: field("key").sort(), dir: "x", spacing: 0, axes: false })
            )
            .mark(rect({ w: 0, h: 3, fill: "writer" }).name("ends")),
          chart(beatlesLinks)
            .flow(
              spread({ by: field("writer").sort(WRITERS), dir: "x", spacing: 90, alignment: "start", axes: false }),
              spread({ by: field("si").sort(), dir: "x", spacing: 3, axes: false })
            )
            .mark(rect({ w: 1, h: 3, fill: "writer" }).name("ends")),
        ]),
        chart(selectAll("ends"))
          .flow(sortRefs((r) => (project(r, "key") === undefined ? 1 : 0)), group({ by: "link" }))
          .mark(line({ stroke: "writer", strokeWidth: 1.5, dir: "y", curve: Curve.bezier() } as any)),
        chart(selectAll("ends"))
          .flow(filter((r: any) => project(r, "key") === undefined), group({ by: "writer" }))
          .mark(enclose({ shape: Shape.oval(), padding: 16, fill: "writer", stroke: "writer", fillOpacity: 0.35 } as any)),
      ]).render(c, { w: 820, h: 420, axes: false } as any)
    ),
};

// ===========================================================================
// 4. PiCCL trade chord
// ===========================================================================
// SYNTHETIC: 24 countries in 6 regions, a gravity-like value
// size_i * size_j * affinity(region) with a seeded jitter; asymmetric.
const REGIONS: Record<string, string[]> = {
  "North America": ["United States", "Canada", "Mexico"],
  Europe: ["Germany", "France", "United Kingdom", "Netherlands", "Italy", "Belgium", "Switzerland"],
  "East Asia": ["China", "Japan", "Korea", "Hong Kong"],
  "South/SE Asia": ["India", "Singapore", "Thailand", "Indonesia"],
  "Middle East": ["Saudi Arabia", "UAE", "Qatar"],
  "Latin America": ["Brazil", "Chile", "Argentina"],
};
const REGION_ORDER = ["East Asia", "Europe", "Middle East", "North America", "Latin America", "South/SE Asia"];
const SIZE: Record<string, number> = {
  "United States": 10, Canada: 4, Mexico: 4, Germany: 7, France: 4,
  "United Kingdom": 4, Netherlands: 4, Italy: 3, Belgium: 3, Switzerland: 2.5,
  China: 10, Japan: 5, Korea: 4, "Hong Kong": 3, India: 3, Singapore: 2.5,
  Thailand: 2, Indonesia: 2, "Saudi Arabia": 3, UAE: 2.5, Qatar: 1.5,
  Brazil: 3, Chile: 1.5, Argentina: 1,
};
const countries = REGION_ORDER.flatMap((r) => REGIONS[r].map((c) => ({ country: c, region: r })));
const regionOf = Object.fromEntries(countries.map((c) => [c.country, c.region]));
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
export const tradeMatrix = countries.map((a) =>
  countries.map((b) => {
    const same = a.region === b.region;
    const v = SIZE[a.country] * SIZE[b.country] * (same ? 3 : 1) * (0.4 + rand());
    // sparse: drop small flows, keep a few self flows (re-exports)
    if (a.country === b.country) return a.country === "United States" || a.country === "China" ? 30 : 0;
    return v > 6 ? v : 0;
  })
);
const N = countries.length;
// Ends rows (the same shape as Chord.stories.tsx): cell (i, j) is the end of
// chord {i, j} at country i. Gap rows: one per country (small) and one per
// region (larger), inside the polar stacks, hidden with h 0.
const tradeTotal = sum(tradeMatrix.flat());
export const tradeEnds = [
  ...countries.flatMap((a, i) =>
    countries.map((b, j) => ({
      region: a.region,
      country: a.country,
      ci: i,
      // order the sub-arcs by the partner's position, starting just after i
      // (d3 sorts by j; this rotation keeps neighbor chords short)
      sub: (j - i + N) % N,
      value: tradeMatrix[i][j],
      chord: `${Math.min(i, j)}-${Math.max(i, j)}`,
      color: tradeMatrix[i][j] >= tradeMatrix[j][i] ? a.region : b.region,
      gap: false,
    }))
  ).filter((e) => e.value > 0),
  ...countries.map((a, i) => ({
    region: a.region, country: a.country, ci: i, sub: 999, value: tradeTotal * 0.002,
    chord: "gap-" + i, color: a.region, gap: true,
  })),
  ...REGION_ORDER.map((r) => ({
    region: r, country: "~gap", ci: 999, sub: 0, value: tradeTotal * 0.012,
    chord: "rgap-" + r, color: r, gap: true,
  })),
];
const TRADE = Color.palette({
  "North America": "#ff7f0e",
  Europe: "#e31a1c",
  "East Asia": "#33a02c",
  "South/SE Asia": "#b15928",
  "Middle East": "#fdbf6f",
  "Latin America": "#6a3d9a",
});

export const TradeChord: StoryObj = {
  render: () =>
    show((c) =>
      layer({ coord: clock() }, [
        chart(tradeEnds, { color: TRADE })
          .flow(
            stack({ by: field("region").sort(REGION_ORDER), dir: "x", y: 200, h: 12, axes: false }),
            stack({ by: field("ci").sort(), dir: "x", axes: false }),
            stack({ by: field("sub").sort(), dir: "x", axes: false })
          )
          .mark(rect({ w: "value", h: (d: any) => (d.gap ? 0 : 12), fill: "region" } as any).name("ends")),
        chart(selectAll("ends"))
          .flow(filter((r: any) => project(r, "gap") === false), group({ by: "chord" }))
          .mark(chordRibbon({ fill: "color", opacity: 0.55 } as any)),
      ]).render(c, { w: 520, h: 520, axes: false } as any)
    ),
};
