// DFSCQ File System Log
// A four-stage pipeline diagram of the DFSCQ verified file system's write-ahead log, from an in-memory active transaction through a committed-transaction group, its on-disk block layout, and the applier that replays it to disk.

import {
  Constraint,
  arrow,
  createName,
  enclose,
  layer,
  line,
  rect,
  ref,
  spread,
  text,
} from "gofish-graphics";
const LEFT_COLUMN_WIDTH = 200;
const DISK_DATA_WIDTH = 440;
const BLUE = "#4582DE";
const BLOCK_H = 40;
const Block = (w, color = "black") =>
  rect({ w, h: BLOCK_H, fill: color, stroke: "black", strokeWidth: 3 });
const Blocks = (colors, width = 18) =>
  spread(
    { dir: "x", spacing: 0, anchor: "edge" },
    colors.map((c) => Block(width, c)),
  );
const BigBracket = (side) =>
  spread(
    { dir: "y", spacing: 0, alignment: side === "left" ? "start" : "end" },
    [
      rect({ w: 15, h: 3, fill: "black" }),
      rect({ w: 3, h: 70, fill: "black" }),
      rect({ w: 15, h: 3, fill: "black" }),
    ],
  );
const BigComma = () =>
  text({ text: ",", fontFamily: "monospace", fontSize: 30 });
const CONTENT_WIDTH = 680;
const withMinWidth = (width, content) =>
  layer([
    rect({ w: width, h: 0, fill: "transparent" }).name("filler"),
    content.name("content"),
  ]).relate(({ filler, content }) => [
    Constraint.align({ x: "start", y: "middle" }, [filler, content]),
  ]);
const TitledBackground = (title, content) =>
  enclose(
    {
      padding: 15,
      fill: "white",
      stroke: "black",
      strokeWidth: 3,
      rx: 0,
      ry: 0,
    },
    [
      spread({ dir: "y", spacing: 4, alignment: "start" }, [
        text({
          text: title,
          fontFamily: "serif",
          fontWeight: 300,
          fontSize: 20,
        }),
        withMinWidth(CONTENT_WIDTH, content),
      ]),
    ],
  );
const ActionText = (t) =>
  text({
    text: t,
    fontFamily: "monospace",
    fontWeight: 500,
    fontSize: 20,
    fill: BLUE,
  });
const ActionLabel = (boxName, slotName, labelText) =>
  layer([
    ref(boxName).name("box"),
    ref(slotName).name("slot"),
    ActionText(labelText).name("t"),
  ]).relate(({ box, slot, t }) => [
    Constraint.align({ x: "end" }, [box, t]),
    Constraint.align({ y: "middle" }, [slot, t]),
  ]);
const BoxedAlign = (width, content) =>
  layer([
    rect({ w: width, h: 0, fill: "transparent" }).name("slot"),
    content.name("content"),
  ]).relate(({ slot, content }) => [
    Constraint.align({ x: "end", y: "middle" }, [slot, content]),
  ]);
const container = document.getElementById("app");
// ── Cross-tier names: funnels/arrows (tier 2) read these placed nodes
// (tier 1), however deep they sit in the nested `spread` tree. ─────────
const activeTxnBlock = createName("activeTxnBlock");
const committedTxnsBlock = createName("committedTxnsBlock");
const bigleftbracket = createName("bigleftbracket");
const bigrightbracket = createName("bigrightbracket");
const mem = createName("mem");
const rect1 = createName("rect1");
const rect2 = createName("rect2");
const rect4 = createName("rect4");
const blocks1 = createName("blocks1");
const blocks2 = createName("blocks2");
const disklogleft = createName("disklogleft");
const applierleft = createName("applierleft");
const diskdata = createName("diskdata");
const diskdataStack = createName("diskdataStack");
const diskdata1 = createName("diskdata1");
const diskdata2 = createName("diskdata2");
const diskdata3 = createName("diskdata3");
const diskdata4 = createName("diskdata4");
const diskdata5 = createName("diskdata5");
const fanoutAnchorName = createName("fanoutAnchor");
const blocks1ArrowAnchorName = createName("blocks1ArrowAnchor");
const rect3 = createName("rect3");
const logDataAnchor = createName("logDataAnchor");
// The two tick DIVIDERS beneath the disk-log row (between "Log header"/
// "Log data" and between "Log data"/"Available log space") — Funnel 2's
// start anchors (Bluefish's `disklogtick2`/`disklogtick3`).
const disklogtick2 = createName("disklogtick2");
const disklogtick3 = createName("disklogtick3");
// Stage-box names (for right-aligning the "commit"/"flush"/"apply"
// labels against a box's right edge) + the vertical gap slots reserved
// for those labels in the main vertical stack.
const logAPIBox = createName("logAPIBox");
const groupLogBox = createName("groupLogBox");
const diskLogBox = createName("diskLogBox");
const applierBox = createName("applierBox");
const commitSlot = createName("commitSlot");
const flushSlot = createName("flushSlot");
const applySlot = createName("applySlot");
// ── Stage 1: LogAPI ──────────────────────────────────────────────────
const logAPIRow = spread({ dir: "x", spacing: 12, alignment: "middle" }, [
  BoxedAlign(
    LEFT_COLUMN_WIDTH,
    text({
      text: "activeTxn:",
      fontFamily: "monospace",
      fontWeight: 300,
      fontSize: 18,
    }),
  ),
  Blocks([BLUE, BLUE, BLUE], 18).name(activeTxnBlock),
]);
// ── Stage 2: GroupLog ────────────────────────────────────────────────
const groupLogRow = spread({ dir: "x", spacing: 8, alignment: "middle" }, [
  BoxedAlign(
    LEFT_COLUMN_WIDTH,
    text({
      text: "committedTxns:",
      fontFamily: "monospace",
      fontWeight: 300,
      fontSize: 18,
    }),
  ),
  BigBracket("left").name(bigleftbracket),
  spread({ dir: "x", spacing: 0, alignment: "end" }, [
    Blocks(Array(2).fill("gray"), 18),
    BigComma(),
  ]),
  spread({ dir: "x", spacing: 0, alignment: "end" }, [
    Blocks(Array(7).fill("gray"), 18),
    BigComma(),
  ]),
  spread({ dir: "x", spacing: 0, alignment: "end" }, [
    Blocks(Array(4).fill("gray"), 18),
    BigComma(),
  ]),
  spread({ dir: "x", spacing: 0, alignment: "end" }, [
    Blocks(Array(3).fill(BLUE), 18).name(committedTxnsBlock),
    BigComma(),
  ]),
  BigBracket("right").name(bigrightbracket),
]);
// ── Stage 3: DiskLog ─────────────────────────────────────────────────
// `mem` gets an explicit literal x/y (via spread's own FancyDims) so it
// is PINNED from construction — required for it to serve as the SPAN
// SITE's already-placed source (Constraint.align "span"/"size" throw
// unless their source is already placed when the constraint lowers).
const memRow = spread({ dir: "x", spacing: 0, anchor: "edge", x: 0, y: 0 }, [
  Block(80, "black").name(rect1),
  Block(80, "LightGray").name(rect2),
  Block(80, "LightGray").name(rect3),
  Blocks(Array(7).fill("gray"), 10).name(blocks1),
  Blocks(Array(3).fill(BLUE), 10).name(blocks2),
  Block(100, "white").name(rect4),
]).name(mem);
// Divider: the SPAN SITE (see file header). `mem` is a direct (one-level)
// named child of `diskLogInner`. (At the time of the port, only this
// depth resolved from an outer `.relate()`; see FRICTION LOG #4
// below. Constraint operands now resolve at any depth inside the layer.)
// `labelSpace`: an invisible spacer that stretches `diskLogInner`'s own
// bbox down far enough to include the tick marks AND the "Log header" /
// "Log data" / "Available log / space" label row beneath them (those are
// placed by tier-2 `Tick`/`Label`/`LabelLines` layers below, anchored via
// `ref()` — see FRICTION LOG #4 — so they aren't structurally nested
// under this node and wouldn't otherwise contribute to its bbox). Ground
// truth's DiskLog box border sits below that label row, not above it.
const diskLogInner = layer([
  memRow,
  rect({ h: 3, fill: "black" }).name("line"),
  rect({ w: 1, h: 1, fill: "transparent" }).name("labelSpace"),
]).relate((c) => [
  // ── SPAN SITE: the divider line adopts `mem`'s exact horizontal
  // extent — the one Bluefish `LayoutFunction` call this port replaces.
  Constraint.distribute({ dir: "y", spacing: 20 }, [c.mem, c.line]),
  Constraint.align({ x: "span" }, [c.mem, c.line]),
  Constraint.distribute({ dir: "y", spacing: 80 }, [c.mem, c.labelSpace]),
  Constraint.align({ x: "start" }, [c.mem, c.labelSpace]),
]);
// Ticks/labels anchor to rect1/rect2/rect4, which sit TWO levels below
// this point (diskLogInner > memRow > rectN) — deep enough that the
// descent above stopped resolving them correctly (FRICTION LOG #4: a
// `.relate()` destructure picked the same — wrong — target for every
// one of these once nesting went past one level, all four ticks and all
// three labels collapsing onto rect1's position; diagnosed by inspecting
// the captured SVG's raw coordinates). The fix, and the more robust
// pattern generally (this is exactly what Pulley/QuantumCircuit's tier-2
// elements do): a small self-contained `Layer` per tick/label built from
// an explicit global `ref(token)` anchor + a fresh shape, its own
// `.relate()` positioning the fresh shape relative to that ref — `ref`
// resolves by global name registration, not tree descent, so nesting
// depth is irrelevant.
// `tickName` (optional): when given, the tick rect is named with this
// global token instead of a local-only "t" so a funnel side can `ref()`
// it later (used for the two tick DIVIDERS beneath rect2/rect4 that
// Funnel 2 anchors to — see FRICTION LOG note above `Tick`/`Label`).
const Tick = (anchor, side, tickName) => {
  const key = tickName ? tickName.__tag : "t";
  return layer([
    ref(anchor).name("a"),
    rect({ w: 3, h: 13, fill: "black" }).name(tickName ?? "t"),
  ]).relate((c) => [
    Constraint.distribute({ dir: "y", spacing: 15 }, [c.a, c[key]]),
    Constraint.align({ x: side }, [c.a, c[key]]),
  ]);
};
const Label = (anchor, labelText) =>
  layer([
    ref(anchor).name("a"),
    text({
      text: labelText,
      fontFamily: "serif",
      fontWeight: 300,
      fontSize: 18,
    }).name("t"),
  ]).relate(({ a, t }) => [
    Constraint.distribute({ dir: "y", spacing: 30 }, [a, t]),
    Constraint.align({ x: "middle" }, [a, t]),
  ]);
// Two-line variant (Bluefish wraps "Available log" / "space" onto two
// rows via a nested StackV — the single-line text is wider than rect4
// (100px), so it overflows into the "apply" action label below).
const LabelLines = (anchor, lines) =>
  layer([
    ref(anchor).name("a"),
    spread(
      { dir: "y", spacing: 0, alignment: "middle" },
      lines.map((l) =>
        text({ text: l, fontFamily: "serif", fontWeight: 300, fontSize: 18 }),
      ),
    ).name("t"),
  ]).relate(({ a, t }) => [
    Constraint.distribute({ dir: "y", spacing: 30 }, [a, t]),
    Constraint.align({ x: "middle" }, [a, t]),
  ]);
const diskLogRow = spread({ dir: "x", spacing: 0, alignment: "start" }, [
  rect({ w: LEFT_COLUMN_WIDTH, h: 0, fill: "transparent" }).name(disklogleft),
  diskLogInner,
]);
// ── Stage 4: Applier ─────────────────────────────────────────────────
const diskDataRow = spread(
  { dir: "x", spacing: 0, anchor: "edge", x: 0, y: 0 },
  [
    Block(50, "LightGray"),
    Blocks(Array(7).fill("gray"), 10),
    Blocks(Array(3).fill(BLUE), 10),
  ],
).name(diskdata);
// The 5 cells are borderless (Bluefish's originals pass no `stroke` — a
// GoFish `rect()` defaults `strokeWidth` to 0, so an unset stroke is
// invisible) — only the enclosing table gets a border, so the arrows
// appear to land inside one plain white box, not 5 bordered cells.
const diskDataCells = spread({ dir: "x", spacing: 0, anchor: "edge" }, [
  rect({ w: DISK_DATA_WIDTH / 5, h: 40, fill: "white" }).name(diskdata1),
  rect({ w: DISK_DATA_WIDTH / 5, h: 40, fill: "white" }).name(diskdata2),
  rect({ w: DISK_DATA_WIDTH / 5, h: 40, fill: "white" }).name(diskdata3),
  rect({ w: DISK_DATA_WIDTH / 5, h: 40, fill: "white" }).name(diskdata4),
  rect({ w: DISK_DATA_WIDTH / 5, h: 40, fill: "white" }).name(diskdata5),
]).name(diskdataStack);
const diskDataTable = enclose(
  { padding: 5, fill: "white", stroke: "black", strokeWidth: 3 },
  [diskDataCells],
);
const applierInner = layer([
  diskDataRow,
  diskDataTable.name("diskDataTable"),
]).relate((c) => [
  Constraint.distribute({ dir: "y", spacing: 50 }, [
    c.diskdata,
    c.diskDataTable,
  ]),
  // Centered (not start-aligned) so the disk-data row sits directly
  // above the fan-out arrows' shared origin, which is itself centered
  // over `diskDataTable` (see `fanoutAnchorLayer` below) — matching
  // ground truth's converging fan under the row.
  Constraint.align({ x: "middle" }, [c.diskdata, c.diskDataTable]),
]);
const applierRow = spread({ dir: "x", spacing: 0, alignment: "start" }, [
  rect({ w: LEFT_COLUMN_WIDTH, h: 0, fill: "transparent" }).name(applierleft),
  applierInner,
]);
// The action labels themselves are placed in tier 2 (`ActionLabel`,
// right-aligned against a stage box) — the vertical stack here only
// reserves a same-height blank slot for each, so the overall rhythm
// matches the original while the label's horizontal position is free to
// track the box's right edge.
const pipelineHead = spread({ dir: "y", spacing: 10, alignment: "start" }, [
  TitledBackground("LogAPI", logAPIRow).name(logAPIBox),
  rect({ w: 1, h: 24, fill: "transparent" }).name(commitSlot),
  TitledBackground("GroupLog", groupLogRow).name(groupLogBox),
  rect({ w: 1, h: 24, fill: "transparent" }).name(flushSlot),
  TitledBackground("DiskLog", diskLogRow).name(diskLogBox),
  rect({ w: 1, h: 24, fill: "transparent" }).name(applySlot),
  TitledBackground("Applier", applierRow).name(applierBox),
]);
// Side labels (Bluefish's "disk log:"/"disk data:" monospace captions,
// right-aligned against each stage's left spacer and vertically centered
// on that stage's content row) + the fan-out arrow anchor above the
// 5-cell table.
const diskLogLabel = text({
  text: "disk log:",
  fontFamily: "monospace",
  fontWeight: 300,
  fontSize: 18,
}).name("diskLogLabel");
const diskDataLabel = text({
  text: "disk data:",
  fontFamily: "monospace",
  fontWeight: 300,
  fontSize: 18,
}).name("diskDataLabel");
// Two more small self-contained ref-anchored layers (same pattern as
// Tick/Label): a placeholder point above the 5-cell table for the
// fan-out arrows, and one above DiskLog's blocks1 group for Bluefish's
// trailing "flush" callout arrow. Each layer's OWN `.relate()` reads
// only its own direct children (never a deep cross-tier destructure), so
// it isn't subject to FRICTION LOG #4.
const fanoutAnchorLayer = layer([
  rect({ w: 80, h: 1, fill: "transparent" }).name(fanoutAnchorName),
  ref(diskdataStack).name("target"),
]).relate((c) => [
  Constraint.distribute({ dir: "y", spacing: 50 }, [c.fanoutAnchor, c.target]),
  Constraint.align({ x: "middle" }, [c.target, c.fanoutAnchor]),
]);
const blocks1ArrowLayer = layer([
  rect({ w: 10, h: 10, fill: "transparent" }).name(blocks1ArrowAnchorName),
  ref(blocks1).name("target"),
]).relate((c) => [
  Constraint.distribute({ dir: "y", spacing: 70 }, [
    c.blocks1ArrowAnchor,
    c.target,
  ]),
  Constraint.align({ x: "middle" }, [c.target, c.blocks1ArrowAnchor]),
]);
// The "Log data" tick label centers under the actual log-data SPAN
// (rect2 through blocks2 — the contiguous gray/blue run), not under
// rect2 alone. `mem`'s row is a fixed, deterministic pixel layout (edge
// mode, 0 spacing, known child widths), so the span's width is a known
// constant; a fresh same-height rect of that width, left-aligned to
// rect2, stands in as the anchor `Label` centers under — exactly like
// `Label` does for the single-node anchors (rect1/rect4), just with a
// wider anchor. (`Constraint.align({x:"span"})` — the SPAN SITE above —
// only supports one already-placed source adopting into one target, not
// a union of several already-placed sources, so it isn't the right tool
// here; and a bare `Layer` of only `ref()` children — Bluefish's
// `<Group>` — doesn't pick up their absolute position as its own bbox
// the way a `.relate()`-driven node does, so that more literal port
// of the original doesn't work either.)
const LOG_DATA_WIDTH =
  80 /* rect2 */ + 80 /* rect3 */ + 7 * 10 /* blocks1 */ + 3 * 10; /* blocks2 */
const logDataAnchorLayer = layer([
  ref(rect2).name("a"),
  rect({ w: LOG_DATA_WIDTH, h: BLOCK_H, fill: "transparent" }).name(
    logDataAnchor,
  ),
]).relate((c) => [
  Constraint.align({ x: "start", y: "start" }, [c.a, c.logDataAnchor]),
]);
// ── Dashed funnels (Bluefish's `DashedFunnel`) ──────────────────────
// The original builds each side as a 3-segment dashed polyline: a short
// vertical drop below the top anchor, a diagonal, then a short vertical
// entry into the bottom anchor (see `DashedFunnel` in the ported
// source — `topTick1`/`bottomTick1` etc. are those short vertical stub
// Paths, stacked `spacing`-px off each anchor; the two `<Line>`s then
// run tick-to-tick, i.e. stub-end to stub-end, not anchor-to-anchor).
// Reproduced here as: two tiny invisible "stub" markers placed a fixed
// offset off each anchor's edge (via `distribute` + `align`, the same
// pattern as `Tick` above), then three dashed `line()` segments —
// anchor→stub, stub→stub (the diagonal), stub→anchor.
const FUNNEL_STUB = 18;
const FunnelSide = (topAnchor, topEdge, bottomAnchor, bottomEdge, idPrefix) => {
  const topStub = createName(`${idPrefix}TopStub`);
  const bottomStub = createName(`${idPrefix}BottomStub`);
  const topKey = topStub.__tag;
  const bottomKey = bottomStub.__tag;
  return [
    // Short vertical drop below the top anchor's edge.
    layer([
      ref(topAnchor).name("a"),
      rect({ w: 1, h: 1, fill: "transparent" }).name(topStub),
    ]).relate((c) => [
      Constraint.distribute({ dir: "y", spacing: FUNNEL_STUB }, [
        c.a,
        c[topKey],
      ]),
      Constraint.align({ x: topEdge }, [c.a, c[topKey]]),
    ]),
    // Short vertical entry above the bottom anchor's edge.
    layer([
      rect({ w: 1, h: 1, fill: "transparent" }).name(bottomStub),
      ref(bottomAnchor).name("b"),
    ]).relate((c) => [
      Constraint.distribute({ dir: "y", spacing: FUNNEL_STUB }, [
        c[bottomKey],
        c.b,
      ]),
      Constraint.align({ x: bottomEdge }, [c.b, c[bottomKey]]),
    ]),
    // Segment 1: vertical, anchor edge → top stub.
    line(
      {
        stroke: "black",
        strokeWidth: 2,
        strokeDasharray: "5",
        source: { x: topEdge, y: "end" },
      },
      [ref(topAnchor), ref(topStub)],
    ),
    // Segment 2: diagonal, top stub → bottom stub.
    line({ stroke: "black", strokeWidth: 2, strokeDasharray: "5" }, [
      ref(topStub),
      ref(bottomStub),
    ]),
    // Segment 3: vertical, bottom stub → anchor edge.
    line(
      {
        stroke: "black",
        strokeWidth: 2,
        strokeDasharray: "5",
        target: { x: bottomEdge, y: "start" },
      },
      [ref(bottomStub), ref(bottomAnchor)],
    ),
  ];
};
layer({ x: 20, y: 20 }, [
  pipelineHead,
  Tick(rect1, "start"),
  Tick(rect2, "start", disklogtick2),
  Tick(rect4, "start", disklogtick3),
  Tick(rect4, "end"),
  Label(rect1, "Log header"),
  logDataAnchorLayer,
  Label(logDataAnchor, "Log data"),
  LabelLines(rect4, ["Available log", "space"]),
  // "commit"/"flush"/"apply" action labels — right-aligned against the
  // stage box that follows them (see `ActionLabel`).
  ActionLabel(groupLogBox, commitSlot, "commit"),
  ActionLabel(diskLogBox, flushSlot, "flush"),
  ActionLabel(applierBox, applySlot, "apply"),
  // "disk log:" / "disk data:" side labels — small, self-contained,
  // ref-anchored (same reasoning as Tick/Label above).
  layer([ref(disklogleft).name("a"), ref(mem).name("m"), diskLogLabel]).relate(
    (c) => [
      Constraint.align({ y: "middle" }, [c.m, c.diskLogLabel]),
      Constraint.align({ x: "end" }, [c.a, c.diskLogLabel]),
    ],
  ),
  layer([
    ref(applierleft).name("a"),
    ref(diskdataStack).name("s"),
    diskDataLabel,
  ]).relate((c) => [
    Constraint.align({ y: "middle" }, [c.s, c.diskDataLabel]),
    Constraint.align({ x: "end" }, [c.a, c.diskDataLabel]),
  ]),
  // Funnel 1: GroupLog's committedTxns ARRAY (the full bracketed
  // extent — bigleftbracket/bigrightbracket) converges onto DiskLog's
  // gray+blue run (blocks1's first block through blocks2's last block).
  // Each side is the 3-segment vertical/diagonal/vertical polyline built
  // by `FunnelSide` above (Bluefish's `DashedFunnel`, `stroke-dasharray
  // ="5"`).
  ...FunnelSide(bigleftbracket, "start", blocks1, "start", "funnel1L"),
  ...FunnelSide(bigrightbracket, "end", blocks2, "end", "funnel1R"),
  // Funnel 2: the two tick DIVIDERS beneath the disk-log row (between
  // "Log header"/"Log data", and between "Log data"/"Available log
  // space") converge onto Applier's gray+blue disk-data row.
  ...FunnelSide(disklogtick2, "middle", diskdata, "start", "funnel2L"),
  ...FunnelSide(disklogtick3, "middle", diskdata, "end", "funnel2R"),
  // commit arrow: LogAPI's active txn → GroupLog's tracked committed txn.
  arrow({ stretch: 0 }, [ref(activeTxnBlock), ref(committedTxnsBlock)]),
  // 5-cell fan-out + the blocks1 callout arrow.
  fanoutAnchorLayer,
  blocks1ArrowLayer,
  arrow({ stretch: 0, bow: 0 }, [ref(fanoutAnchorName), ref(diskdata1)]),
  arrow({ stretch: 0, bow: 0 }, [ref(fanoutAnchorName), ref(diskdata2)]),
  arrow({ stretch: 0, bow: 0 }, [ref(fanoutAnchorName), ref(diskdata3)]),
  arrow({ stretch: 0, bow: 0 }, [ref(fanoutAnchorName), ref(diskdata4)]),
  arrow({ stretch: 0, bow: 0 }, [ref(fanoutAnchorName), ref(diskdata5)]),
  arrow({ stretch: 0, bow: 0 }, [ref(blocks1ArrowAnchorName), ref(blocks1)]),
]).render(container, { w: 900, h: 900 });
