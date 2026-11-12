// THROWAWAY prototypes for the stack-profile proposal
// (proposals/stack-profile/proposal.md): examples of `baseline` on `spread`.
// Each row is a spread with gaps whose own 0 is not its start, and a parent
// lines the rows up on that 0. `spread` has no `baseline` option today, so
// every story EMULATES it: the positions are computed in `derive` (a gap in
// data units), or the rows are cut into columns that a parent aligns.
// The `...Rows` stories run the proposed spelling with `baseline` left out,
// to check the rest of it runs and to show what goes wrong without it.
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import {
  chart,
  Color,
  derive,
  enclose,
  rect,
  scatter,
  spread,
  text,
} from "../../../src/lib";

const meta: Meta = { title: "Proposals/Stack Profile/Baseline Spread" };
export default meta;

const show = (fn: (c: HTMLElement) => unknown): StoryObj => ({
  render: () => {
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
  },
});

// ---------------------------------------------------------------------------
// 1. Diverging survey bars with gaps between the segments. Each row's 0 is
// the middle of its Neutral segment. EMULATED: derive lays each row out from
// the middle of Neutral, with a gap of GAP respondents between segments.
const LEVELS = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"];
const LIKERT = Color.palette({
  "Strongly disagree": "#ca0020",
  Disagree: "#f4a582",
  Neutral: "#d9d9d9",
  Agree: "#92c5de",
  "Strongly agree": "#0571b0",
});
const survey = [
  ["The docs are clear", [12, 22, 38, 86, 42]],
  ["The API is easy to learn", [26, 48, 50, 54, 22]],
  ["Error messages are helpful", [58, 64, 36, 30, 12]],
  ["Charts render fast enough", [8, 18, 44, 80, 50]],
  ["I would recommend it", [3, 9, 27, 78, 86]],
].flatMap(([question, counts]) =>
  (counts as number[]).map((count, i) => ({ question, response: LEVELS[i], count }))
);
type Answer = (typeof survey)[number];
const GAP = 3;
const fromNeutral = (rows: Answer[]) => {
  const out: (Answer & { lo: number; hi: number })[] = [];
  for (const q of new Set(rows.map((r) => r.question))) {
    const p = LEVELS.map((l) => rows.find((r) => r.question === q && r.response === l)!);
    const half = p[2].count / 2;
    const lo1 = -half - GAP - p[1].count;
    const hi3 = half + GAP + p[3].count;
    out.push(
      { ...p[0], lo: lo1 - GAP - p[0].count, hi: lo1 - GAP },
      { ...p[1], lo: lo1, hi: -half - GAP },
      { ...p[2], lo: -half, hi: half },
      { ...p[3], lo: half + GAP, hi: hi3 },
      { ...p[4], lo: hi3 + GAP, hi: hi3 + GAP + p[4].count }
    );
  }
  return out;
};
export const LikertGaps = show((c) =>
  chart(survey, { w: 480, h: 200, color: LIKERT })
    .flow(
      derive(fromNeutral),
      spread({ by: "question", dir: "y", spacing: 6 }),
      scatter({ by: "response", xMin: "lo", xMax: "hi" })
    )
    .mark(rect({ fill: "response" }))
    .render(c, { axes: { x: { title: "respondents" }, y: true } } as any)
);
// The proposed spelling without `baseline`: each row starts at 0.
export const LikertGapsRows = show((c) =>
  chart(survey, { w: 480, h: 200, color: LIKERT })
    .flow(
      spread({ by: "question", dir: "y", spacing: 6 }),
      spread({ by: "response", dir: "x", spacing: 2 })
    )
    .mark(rect({ w: "count", fill: "response" }))
    .render(c, { axes: { x: { title: "respondents" }, y: true } } as any)
);

// ---------------------------------------------------------------------------
// 2. Population pyramid with the age labels in the gap between the sides.
// Each row is [male bar, age label, female bar] with its 0 at the middle of
// the label. Approximate US 2020 census counts in millions, rounded and
// entered by hand. EMULATED: derive puts the bars LABEL millions apart and the
// label in the gap (the gap is in data units, not pixels).
const AGES = ["0-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80+"];
const MALE = [20.2, 21.6, 22.4, 22.0, 20.0, 20.8, 18.0, 10.6, 5.2];
const FEMALE = [19.3, 20.7, 21.4, 21.8, 20.1, 21.6, 19.8, 12.5, 7.6];
const people = AGES.flatMap((age, i) => [
  { age, part: "Male", millions: MALE[i] },
  { age, part: "Age", millions: 0 },
  { age, part: "Female", millions: FEMALE[i] },
]);
type Person = (typeof people)[number];
const LABEL = 6;
const aroundLabel = (rows: Person[]) =>
  rows.map((r) =>
    r.part === "Age"
      ? { ...r, lo: -LABEL / 2, hi: LABEL / 2 }
      : r.part === "Male"
        ? { ...r, lo: -LABEL / 2 - r.millions, hi: -LABEL / 2 }
        : { ...r, lo: LABEL / 2, hi: LABEL / 2 + r.millions }
  );
const SEX = Color.palette({ Male: "#5b8db8", Female: "#d9776b", Age: "white" });
export const PyramidLabels = show((c) =>
  chart(people, { w: 480, h: 260, color: SEX })
    .flow(
      derive(aroundLabel),
      spread({ by: "age", dir: "y", spacing: 3, reverse: true }),
      scatter({ by: "part", xMin: "lo", xMax: "hi" })
    )
    .mark((d: Person[]) =>
      d[0].part === "Age"
        ? // a box as wide as the gap, the label centered in it
          spread({ dir: "y", spacing: 0, alignment: "middle" }, [
            rect({ h: 0, fill: "none" }),
            text({ text: d[0].age, fontSize: 11 }),
          ])
        : rect({ fill: d[0].part === "Male" ? "#5b8db8" : "#d9776b" })
    )
    .render(c, { legend: false, axes: { x: { title: "people (millions)" }, y: false } } as any)
);
// The proposed spelling without `baseline`.
export const PyramidLabelsRows = show((c) =>
  chart(people, { w: 480, h: 260, color: SEX })
    .flow(
      spread({ by: "age", dir: "y", spacing: 3, reverse: true }),
      spread({ by: "part", dir: "x", spacing: 6 })
    )
    .mark((d: Person[]) =>
      d[0].part === "Age"
        ? text({ text: d[0].age, fontSize: 11 })
        : rect({ w: "millions", fill: "part" })(d)
    )
    .render(c, { legend: false } as any)
);

// ---------------------------------------------------------------------------
// 3. Keyword in context (a concordance): every line that holds the keyword,
// lined up on it. Each line is a spread of words with its 0 at the middle of
// the keyword. Hand-made sentences. EMULATED by the columns a concordance
// tool prints: a parent spread of [left context, keyword, right context],
// each a column of rows, aligned end / middle / start.
const LINES = [
  "a spread places its children with a gap between them",
  "each row of the table is a spread of words",
  "the parent lines up every spread on its own zero",
  "we wanted a spread that keeps its gaps",
  "inside a spread the order of the parts is the data order",
  "unlike a stack a spread does not glue",
];
const KEYWORD = "spread";
const words = LINES.flatMap((line, l) => {
  const ws = line.split(" ");
  const k = ws.indexOf(KEYWORD);
  return ws.map((word, i) => ({ line: l, at: i - k, word }));
});
type Word = (typeof words)[number];
const wordText = (w: Word) =>
  text({
    text: w.word,
    fontSize: 13,
    fill: w.at === 0 ? "#c0392b" : "#333",
    fontWeight: w.at === 0 ? 700 : 400,
  });
const side = (keep: (w: Word) => boolean, alignment: "start" | "end") =>
  spread(
    { dir: "y", spacing: 6, alignment },
    LINES.map((_, l) => {
      const ws = words.filter((w) => w.line === l && keep(w));
      return ws.length
        ? spread({ dir: "x", spacing: 4 }, ws.map(wordText))
        : text({ text: " ", fontSize: 13 });
    })
  );
export const Concordance = show((c) =>
  spread({ dir: "x", spacing: 4 }, [
    side((w) => w.at < 0, "end"),
    side((w) => w.at === 0, "start"),
    side((w) => w.at > 0, "start"),
  ]).render(c, { w: 480, h: 150 })
);
// The proposed spelling without `baseline`.
export const ConcordanceRows = show((c) =>
  chart(words, { w: 480, h: 150 })
    .flow(
      spread({ by: "line", dir: "y", spacing: 6 }),
      spread({ by: "at", dir: "x", spacing: 4 })
    )
    .mark(text({ text: "word", fontSize: 13 }))
    .render(c, { axes: false } as any)
);

// ---------------------------------------------------------------------------
// 4. Click paths lined up on one event (a path exploration, as in web
// analytics): each session is a spread of page chips with its 0 at the start
// of the Cart chip. Hand-made sessions. EMULATED with columns, as above.
const SESSIONS = [
  ["Home", "Search", "Product", "Cart", "Checkout", "Paid"],
  ["Product", "Cart", "Exit"],
  ["Home", "Sale", "Product", "Product", "Cart", "Checkout"],
  ["Search", "Product", "Cart", "Shipping", "Exit"],
  ["Email", "Cart", "Checkout", "Paid"],
  ["Home", "Product", "Reviews", "Product", "Cart", "Checkout", "Paid"],
];
const steps = SESSIONS.flatMap((pages, s) => {
  const k = pages.indexOf("Cart");
  return pages.map((page, i) => ({ session: s, at: i - k, page }));
});
type Step = (typeof steps)[number];
const PAGE_FILL: Record<string, string> = {
  Cart: "#f2c14e",
  Checkout: "#9ccf8a",
  Paid: "#5aa35a",
  Exit: "#e58f84",
};
const pageColor = (page: string) => PAGE_FILL[page] ?? "#dde3ea";
const chip = (s: Step) =>
  enclose({ padding: 3, fill: pageColor(s.page), stroke: "none" }, [
    text({ text: s.page, fontSize: 11 }),
  ]);
const pathSide = (keep: (s: Step) => boolean, alignment: "start" | "end") =>
  spread(
    { dir: "y", spacing: 6, alignment },
    SESSIONS.map((_, n) => {
      const ss = steps.filter((s) => s.session === n && keep(s));
      return ss.length
        ? spread({ dir: "x", spacing: 4 }, ss.map(chip))
        : enclose({ padding: 3, fill: "none", stroke: "none" }, [
            text({ text: " ", fontSize: 11 }),
          ]);
    })
  );
export const ClickPaths = show((c) =>
  spread({ dir: "x", spacing: 4 }, [
    pathSide((s) => s.at < 0, "end"),
    pathSide((s) => s.at === 0, "start"),
    pathSide((s) => s.at > 0, "start"),
  ]).render(c, { w: 480, h: 170 })
);
// The proposed spelling without `baseline`.
export const ClickPathsRows = show((c) =>
  chart(steps, { w: 480, h: 170 })
    .flow(
      spread({ by: "session", dir: "y", spacing: 6 }),
      spread({ by: "at", dir: "x", spacing: 4 })
    )
    .mark((d: Step[]) =>
      enclose({ padding: 3, fill: pageColor(d[0].page) }, [
        text({ text: d[0].page, fontSize: 11 }),
      ])
    )
    .render(c, { axes: false } as any)
);

// ---------------------------------------------------------------------------
// The alignment claim: is a parent's `alignment: "middle"` the same as each
// child having its 0 at its middle and the parent using "baseline"? Rows of
// gapped bars of different total length, lined up by the parent (a spread
// along y) with each alignment, and by the middle emulated in derive.
const bars = [
  ["a", [30, 10, 20]],
  ["b", [10, 50]],
  ["c", [25, 25, 25, 5]],
].flatMap(([row, ws]) => (ws as number[]).map((w, i) => ({ row, part: `p${i}`, w })));
const claim = (alignment: "start" | "middle" | "end" | "baseline") =>
  show((c) =>
    chart(bars, { w: 300, h: 110 })
      .flow(
        spread({ by: "row", dir: "y", spacing: 6, alignment }),
        spread({ by: "part", dir: "x", spacing: 4 })
      )
      .mark(rect({ w: "w", fill: "part" }))
      .render(c, { legend: false } as any)
  );
export const ClaimStart = claim("start");
export const ClaimMiddle = claim("middle");
export const ClaimEnd = claim("end");
export const ClaimBaseline = claim("baseline");
