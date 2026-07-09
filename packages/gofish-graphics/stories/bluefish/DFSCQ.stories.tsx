import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Layer,
  Constraint,
  line,
  arrow,
  createName,
  rect,
  text,
  ref,
  spread,
  enclose,
} from "../../src/lib";

// Ported from Bluefish's example-gallery DFSCQ-log-figure.tsx (#436): a
// 4-stage vertical pipeline diagram of the DFSCQ verified file system's
// write-ahead log — LogAPI (an active-transaction buffer of 3 blue blocks),
// GroupLog (a big bracketed array of committed-transaction block groups),
// DiskLog (the on-disk block layout: header / data / available-space, with
// a divider spanning the block row and tick-bracket labels beneath), and
// Applier (the disk-data row above a 5-cell table), connected by "commit" /
// "flush" / "apply" action labels and dashed funnels (Bluefish's
// `DashedFunnel`, `stroke-dasharray="5"` — now a real dashed `line()` via the
// `strokeDasharray` option added in the fidelity pass that also inset each
// stage's title into its box and right-aligned the action labels).
//
// Structured like Pulley/QuantumCircuit: tier 1 (`pipelineHead`) fully places
// every row via nested `spread`s and `.constrain()`; tier 2 (funnels, the
// commit arrow, the fan-out arrows, the tick marks/labels beneath DiskLog,
// and the "disk log:"/"disk data:" side labels) reads those placed nodes via
// `createName` tokens + `ref()`. A `.constrain()` callback's own destructure
// (`c.someName`) only reliably reaches ONE level of nested plain `Layer`s
// deep (confirmed working for the SPAN SITE below, and matching what
// Pulley/QuantumCircuit rely on) — past that, explicit `ref(token)` (global
// name resolution, depth-independent) is the reliable tool. See FRICTION LOG
// #4 for where this bit and how tier 2 here uses `ref()` throughout instead.
//
// THE NEW PRIMITIVE THIS PORT VALIDATES: `Constraint.align({x:"span"})`
// stands in for Bluefish's `LayoutFunction` — the DiskLog divider line (a
// bare, w-less rect) adopts the `mem` block row's exact horizontal extent
// without `mem` itself moving. See the one call site below, tagged
// "SPAN SITE".
//
// SECOND FIDELITY PASS (6 maintainer-flagged defects, all fixed): (1) the
// Applier row now centers over `diskDataTable` (was start-aligned) so it
// sits directly above the fan-out arrows' shared, centered origin; (2) the
// `BigComma()` groups now bottom-align (`alignment: "end"`) against their
// block row instead of middle-aligning, matching ground truth's
// baseline-set commas; (3) the two `DashedFunnel` `line()`s dropped
// `.zOrder(-1)` so sibling paint order (declared after the stage boxes) puts
// them on top, and they now pin `source`/`target` to bbox edges (not the
// default center) so they visibly land at a block's top/bottom edge instead
// of piercing into it — a defect the paint-order fix would otherwise have
// newly exposed; (4) `diskLogInner` grew an invisible `labelSpace` spacer so
// its bbox (and thus the DiskLog card's border) extends down far enough to
// contain the tick-mark labels; "Available log space" also became a
// `LabelLines` two-line stack (mirroring Bluefish's own two-line `<StackV>`)
// since the single-line text was wider than `rect4` and overflowed into the
// "apply" label; (5) `TitledBackground`'s border `strokeWidth` went 1 → 3 to
// match the blocks/arrows; (6) the 5 disk-data cells dropped their
// `stroke`/`strokeWidth` (a GoFish `rect()` defaults `strokeWidth` to 0, so
// an unset stroke is invisible, matching Bluefish's un-stroked originals),
// and `diskDataTable`'s enclosing border went from a faint `#ccc` hairline to
// the same solid black/strokeWidth-3 style as the stage cards.

const meta: Meta = {
  title: "Bluefish/DFSCQ File System",
};
export default meta;

type Args = { w: number; h: number };

const LEFT_COLUMN_WIDTH = 200;
const DISK_DATA_WIDTH = 440;
const BLUE = "#4582DE";
const BLOCK_H = 40;

// ── Small helpers (mirror Bluefish's withBluefish-wrapped components) ──────

// A single 3px-black-stroked block (Bluefish's <Block>). Default fill black
// (Bluefish's <Rect fill={props.color}/> with no color ⇒ SVG's default
// black fill — used for the LogAPI/DiskLog header blocks).
const Block = (w: number, color: string = "black") =>
  rect({ w, h: BLOCK_H, fill: color, stroke: "black", strokeWidth: 3 });

// A flush row of same-colored-or-mixed blocks (Bluefish's <Blocks>).
const Blocks = (colors: string[], width: number = 18) =>
  spread({ dir: "x", spacing: 0, mode: "edge" }, colors.map((c) => Block(width, c)));

// Hand-drawn "[" / "]" brackets built from 3 thin black rects (Bluefish's
// <BigLeftBracket>/<BigRightBracket>).
const BigBracket = (side: "left" | "right") =>
  spread({ dir: "y", spacing: 0, alignment: side === "left" ? "start" : "end" }, [
    rect({ w: 15, h: 3, fill: "black" }),
    rect({ w: 3, h: 70, fill: "black" }),
    rect({ w: 15, h: 3, fill: "black" }),
  ]);

const BigComma = () => text({ text: ",", fontFamily: "monospace", fontSize: 30 });

// A fixed CONTENT width every stage row is padded up to (Bluefish's
// `TitledBackground`'s `<Rect width={680} fill="transparent">` inside its
// `Align alignment="centerLeft"`) — this is what gives all four stage boxes
// the same right edge in the original, which in turn is what lets the
// "commit"/"flush"/"apply" action labels right-align consistently against
// any one of them.
const CONTENT_WIDTH = 680;
const withMinWidth = (width: number, content: ReturnType<typeof spread>) =>
  Layer([
    rect({ w: width, h: 0, fill: "transparent" }).name("filler"),
    content.name("content"),
  ]).constrain(({ filler, content }) => [
    Constraint.align({ x: "start", y: "middle" }, [filler, content]),
  ]);

// Section title inside a padded card (Bluefish's <TitledBackground>): the
// title sits INSIDE the box's top-left corner (Bluefish overlaps it there
// via `Align alignment="topLeft"`; here the title is simply the first row of
// the vertical stack that `enclose` wraps, which lands it in the same
// top-left corner within the shared 15px padding). Sharp corners, thin black
// stroke, white fill — matching the ground-truth diagram's plain box style.
const TitledBackground = (title: string, content: ReturnType<typeof spread>) =>
  enclose({ padding: 15, fill: "white", stroke: "black", strokeWidth: 3, rx: 0, ry: 0 }, [
    spread({ dir: "y", spacing: 4, alignment: "start" }, [
      text({ text: title, fontFamily: "serif", fontWeight: 300, fontSize: 20 }),
      withMinWidth(CONTENT_WIDTH, content),
    ]),
  ]);

const ActionText = (t: string) =>
  text({ text: t, fontFamily: "monospace", fontWeight: 500, fontSize: 20, fill: BLUE });

// Right-aligns an action label ("commit"/"flush"/"apply") against a stage
// box's right edge, vertically centered in the gap slot reserved for it in
// the main vertical stack (mirrors ground truth: the label sits tucked into
// the thin gap between two boxes, flush with their shared right edge).
const ActionLabel = (
  boxName: ReturnType<typeof createName>,
  slotName: ReturnType<typeof createName>,
  labelText: string
) =>
  Layer([
    ref(boxName).name("box"),
    ref(slotName).name("slot"),
    ActionText(labelText).name("t"),
  ]).constrain(({ box, slot, t }) => [
    Constraint.align({ x: "end" }, [box, t]),
    Constraint.align({ y: "middle" }, [slot, t]),
  ]);

// A fixed-width slot with its content right/middle-anchored inside it
// (Bluefish's <BoxedAlign alignment="centerRight">) — used for the
// "activeTxn:" / "committedTxns:" left-column labels so every stage's
// content column starts at the same x regardless of label length.
const BoxedAlign = (width: number, content: ReturnType<typeof text>) =>
  Layer([
    rect({ w: width, h: 0, fill: "transparent" }).name("slot"),
    content.name("content"),
  ]).constrain(({ slot, content }) => [
    Constraint.align({ x: "end", y: "middle" }, [slot, content]),
  ]);

export const DFSCQ: StoryObj<Args> = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "DFSCQ File System Log",
      description:
        "A four-stage pipeline diagram of the DFSCQ verified file system's write-ahead log, from an in-memory active transaction through a committed-transaction group, its on-disk block layout, and the applier that replays it to disk.",
    },
  },
  render: () => {
    const container = initializeContainer();

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
        text({ text: "activeTxn:", fontFamily: "monospace", fontWeight: 300, fontSize: 18 })
      ),
      Blocks([BLUE, BLUE, BLUE], 18).name(activeTxnBlock),
    ]);

    // ── Stage 2: GroupLog ────────────────────────────────────────────────
    const groupLogRow = spread({ dir: "x", spacing: 8, alignment: "middle" }, [
      BoxedAlign(
        LEFT_COLUMN_WIDTH,
        text({ text: "committedTxns:", fontFamily: "monospace", fontWeight: 300, fontSize: 18 })
      ),
      BigBracket("left").name(bigleftbracket),
      spread({ dir: "x", spacing: 0, alignment: "end" }, [Blocks(Array(2).fill("gray"), 18), BigComma()]),
      spread({ dir: "x", spacing: 0, alignment: "end" }, [Blocks(Array(7).fill("gray"), 18), BigComma()]),
      spread({ dir: "x", spacing: 0, alignment: "end" }, [Blocks(Array(4).fill("gray"), 18), BigComma()]),
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
    const memRow = spread({ dir: "x", spacing: 0, mode: "edge", x: 0, y: 0 }, [
      Block(80, "black").name(rect1),
      Block(80, "LightGray").name(rect2),
      Block(80, "LightGray").name(rect3),
      Blocks(Array(7).fill("gray"), 10).name(blocks1),
      Blocks(Array(3).fill(BLUE), 10).name(blocks2),
      Block(100, "white").name(rect4),
    ]).name(mem);

    // Divider: the SPAN SITE (see file header). `mem` is a direct (one-level)
    // named child of `diskLogInner`, which is the depth this port confirmed
    // `collectConstraintRefs`-based cross-tier lookup (`src/ast/constraints/
    // index.ts`) resolves correctly — see FRICTION LOG #4 below for the
    // depth-2 case that did NOT resolve correctly and the workaround.
    // `labelSpace`: an invisible spacer that stretches `diskLogInner`'s own
    // bbox down far enough to include the tick marks AND the "Log header" /
    // "Log data" / "Available log / space" label row beneath them (those are
    // placed by tier-2 `Tick`/`Label`/`LabelLines` layers below, anchored via
    // `ref()` — see FRICTION LOG #4 — so they aren't structurally nested
    // under this node and wouldn't otherwise contribute to its bbox). Ground
    // truth's DiskLog box border sits below that label row, not above it.
    const diskLogInner = Layer([
      memRow,
      rect({ h: 3, fill: "black" }).name("line"),
      rect({ w: 1, h: 1, fill: "transparent" }).name("labelSpace"),
    ]).constrain((c) => [
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
    // `.constrain()` destructure picked the same — wrong — target for every
    // one of these once nesting went past one level, all four ticks and all
    // three labels collapsing onto rect1's position; diagnosed by inspecting
    // the captured SVG's raw coordinates). The fix, and the more robust
    // pattern generally (this is exactly what Pulley/QuantumCircuit's tier-2
    // elements do): a small self-contained `Layer` per tick/label built from
    // an explicit global `ref(token)` anchor + a fresh shape, its own
    // `.constrain()` positioning the fresh shape relative to that ref — `ref`
    // resolves by global name registration, not tree descent, so nesting
    // depth is irrelevant.
    const Tick = (anchor: ReturnType<typeof createName>, side: "start" | "end") =>
      Layer([ref(anchor).name("a"), rect({ w: 3, h: 13, fill: "black" }).name("t")]).constrain(
        ({ a, t }) => [
          Constraint.distribute({ dir: "y", spacing: 15 }, [a, t]),
          Constraint.align({ x: side }, [a, t]),
        ]
      );
    const Label = (anchor: ReturnType<typeof createName>, labelText: string) =>
      Layer([
        ref(anchor).name("a"),
        text({ text: labelText, fontFamily: "serif", fontWeight: 300, fontSize: 18 }).name(
          "t"
        ),
      ]).constrain(({ a, t }) => [
        Constraint.distribute({ dir: "y", spacing: 30 }, [a, t]),
        Constraint.align({ x: "middle" }, [a, t]),
      ]);
    // Two-line variant (Bluefish wraps "Available log" / "space" onto two
    // rows via a nested StackV — the single-line text is wider than rect4
    // (100px), so it overflows into the "apply" action label below).
    const LabelLines = (anchor: ReturnType<typeof createName>, lines: string[]) =>
      Layer([
        ref(anchor).name("a"),
        spread(
          { dir: "y", spacing: 0, alignment: "middle" },
          lines.map((l) => text({ text: l, fontFamily: "serif", fontWeight: 300, fontSize: 18 }))
        ).name("t"),
      ]).constrain(({ a, t }) => [
        Constraint.distribute({ dir: "y", spacing: 30 }, [a, t]),
        Constraint.align({ x: "middle" }, [a, t]),
      ]);

    const diskLogRow = spread({ dir: "x", spacing: 0, alignment: "start" }, [
      rect({ w: LEFT_COLUMN_WIDTH, h: 0, fill: "transparent" }).name(disklogleft),
      diskLogInner,
    ]);

    // ── Stage 4: Applier ─────────────────────────────────────────────────
    const diskDataRow = spread({ dir: "x", spacing: 0, mode: "edge", x: 0, y: 0 }, [
      Block(50, "LightGray"),
      Blocks(Array(7).fill("gray"), 10),
      Blocks(Array(3).fill(BLUE), 10),
    ]).name(diskdata);

    // The 5 cells are borderless (Bluefish's originals pass no `stroke` — a
    // GoFish `rect()` defaults `strokeWidth` to 0, so an unset stroke is
    // invisible) — only the enclosing table gets a border, so the arrows
    // appear to land inside one plain white box, not 5 bordered cells.
    const diskDataCells = spread({ dir: "x", spacing: 0, mode: "edge" }, [
      rect({ w: DISK_DATA_WIDTH / 5, h: 40, fill: "white" }).name(diskdata1),
      rect({ w: DISK_DATA_WIDTH / 5, h: 40, fill: "white" }).name(diskdata2),
      rect({ w: DISK_DATA_WIDTH / 5, h: 40, fill: "white" }).name(diskdata3),
      rect({ w: DISK_DATA_WIDTH / 5, h: 40, fill: "white" }).name(diskdata4),
      rect({ w: DISK_DATA_WIDTH / 5, h: 40, fill: "white" }).name(diskdata5),
    ]).name(diskdataStack);

    const diskDataTable = enclose({ padding: 5, fill: "white", stroke: "black", strokeWidth: 3 }, [
      diskDataCells,
    ]);

    const applierInner = Layer([
      diskDataRow,
      diskDataTable.name("diskDataTable"),
    ]).constrain((c) => [
      Constraint.distribute({ dir: "y", spacing: 50 }, [c.diskdata, c.diskDataTable]),
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
    // trailing "flush" callout arrow. Each layer's OWN `.constrain()` reads
    // only its own direct children (never a deep cross-tier destructure), so
    // it isn't subject to FRICTION LOG #4.
    const fanoutAnchorLayer = Layer([
      rect({ w: 80, h: 1, fill: "transparent" }).name(fanoutAnchorName),
      ref(diskdataStack).name("target"),
    ]).constrain((c) => [
      Constraint.distribute({ dir: "y", spacing: 50 }, [c.fanoutAnchor, c.target]),
      Constraint.align({ x: "middle" }, [c.target, c.fanoutAnchor]),
    ]);
    const blocks1ArrowLayer = Layer([
      rect({ w: 10, h: 10, fill: "transparent" }).name(blocks1ArrowAnchorName),
      ref(blocks1).name("target"),
    ]).constrain((c) => [
      Constraint.distribute({ dir: "y", spacing: 70 }, [c.blocks1ArrowAnchor, c.target]),
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
    // the way a `.constrain()`-driven node does, so that more literal port
    // of the original doesn't work either.)
    const LOG_DATA_WIDTH = 80 /* rect2 */ + 80 /* rect3 */ + 7 * 10 /* blocks1 */ + 3 * 10; /* blocks2 */
    const logDataAnchorLayer = Layer([
      ref(rect2).name("a"),
      rect({ w: LOG_DATA_WIDTH, h: BLOCK_H, fill: "transparent" }).name(logDataAnchor),
    ]).constrain((c) => [
      Constraint.align({ x: "start", y: "start" }, [c.a, c.logDataAnchor]),
    ]);

    Layer({ x: 20, y: 20 }, [
      pipelineHead,
      Tick(rect1, "start"),
      Tick(rect2, "start"),
      Tick(rect4, "start"),
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
      Layer([ref(disklogleft).name("a"), ref(mem).name("m"), diskLogLabel]).constrain(
        (c) => [
          Constraint.align({ y: "middle" }, [c.m, c.diskLogLabel]),
          Constraint.align({ x: "end" }, [c.a, c.diskLogLabel]),
        ]
      ),
      Layer([
        ref(applierleft).name("a"),
        ref(diskdataStack).name("s"),
        diskDataLabel,
      ]).constrain((c) => [
        Constraint.align({ y: "middle" }, [c.s, c.diskDataLabel]),
        Constraint.align({ x: "end" }, [c.a, c.diskDataLabel]),
      ]),

      // Funnel 1: GroupLog's big brackets converge onto DiskLog's blocks1/2.
      // Dashed (Bluefish's `DashedFunnel`, `stroke-dasharray="5"`) — the new
      // `strokeDasharray` option on `line()` (Task 1) is what makes this
      // possible; previously the funnels had to render solid.
      // `source`/`target` pin each end to a normalized bbox point instead of
      // the default center (empirically here `"end"` on y lands at the
      // rendered-bottom of the upper element and `"start"` at the
      // rendered-top of the lower one) — so each funnel visibly converges at
      // the bottom edge of the upper element and the top edge of the lower
      // one, matching ground truth's tick-to-tick funnels, rather than
      // piercing into the lower block's middle (only hidden before by the
      // paint-order bug).
      line(
        { stroke: "black", strokeWidth: 2, strokeDasharray: "5", source: { y: "end" }, target: { y: "start" } },
        [ref(bigleftbracket), ref(blocks1)]
      ),
      line(
        { stroke: "black", strokeWidth: 2, strokeDasharray: "5", source: { y: "end" }, target: { y: "start" } },
        [ref(bigrightbracket), ref(blocks2)]
      ),
      // Funnel 2: DiskLog's middle ticks converge onto Applier's disk-data row.
      line(
        { stroke: "black", strokeWidth: 2, strokeDasharray: "5", source: { y: "end" }, target: { y: "start" } },
        [ref(rect2), ref(diskdata)]
      ),
      line(
        { stroke: "black", strokeWidth: 2, strokeDasharray: "5", source: { y: "end" }, target: { y: "start" } },
        [ref(rect4), ref(diskdata)]
      ),

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

    return container;
  },
};
