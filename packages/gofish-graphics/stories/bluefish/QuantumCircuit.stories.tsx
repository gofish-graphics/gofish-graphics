import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Layer,
  Constraint,
  line,
  createMark,
  createName,
  rect,
  circle,
  text,
  ref,
  spread,
  enclose,
} from "../../src/lib";

// Ported from Bluefish's example-gallery qc-text.tsx. A quantum-circuit
// equivalence diagram: a controlled-Z gate (left) is shown equivalent (≡) to
// an H-CNOT-H sequence (right), with control dots connected by vertical
// lines to the gates they control, and two yellow-highlighted callouts (the
// CNOT's ⊕ symbol and a description label).
//
// Structured like Pulley.stories.tsx: an inner Layer that fully places the
// two wire-groups + "≡" + description (tier 1, including the two highlight
// enclosures, built inline around their own content — see the friction log
// on why "wrap a ref elsewhere" didn't work), then the vertical
// control-to-gate connector lines read those placed refs (tier 2).

const meta: Meta = {
  title: "Bluefish/Quantum Circuit Equivalence",
};
export default meta;

type Args = { w: number; h: number };

const SLOT = 60; // pitch between gate slots on a wire — matches Bluefish's
// `depth * 60` sizing (a hardcoded literal there too; see friction log).
const GATE = 50; // gate box / wire-symbol side length

// A single gate/dot centered in a fixed 50x50 slot, so that dots and boxes
// of different intrinsic sizes still land on the same column across two
// independently-built wires (mirrors Bluefish's <WireSymbol>).
const WireSlot = createMark(({ content }: { content: any }) =>
  Layer([
    rect({ w: GATE, h: GATE, fill: "transparent" }).name("slot"),
    content.name("content"),
  ]).constrain(({ slot, content }) => [
    Constraint.align({ x: "middle", y: "middle" }, [slot, content]),
  ])
);

// An empty 50x50 slot — a placeholder gap on a wire (Bluefish's <EmptySpot>).
// Plain function, not createMark: createMark's shapeFn must return an
// already-resolved GoFishNode, but a bare rect()/circle() call is itself a
// still-deferred Mark (see ControlDot below and the friction log) — wrapping
// one directly in createMark crashes at render time ("node.scope is not a
// function"). A plain function that just returns the mark call sidesteps it.
const EmptySlot = () => rect({ w: GATE, h: GATE, fill: "transparent" });

// A labeled square gate (Bluefish's <BoxedSymbol>).
const BoxedSymbol = createMark(({ label }: { label: string }) =>
  Layer([
    rect({
      w: GATE,
      h: GATE,
      fill: "white",
      stroke: "black",
      strokeWidth: 3,
    }).name("box"),
    // Upstream is `font-family="serif" font-style="italic"`. ("italic serif"
    // as a single font-family string is invalid CSS — the browser silently
    // falls back to the default font, upright.)
    text({
      text: label,
      fontSize: 30,
      fontFamily: "serif",
      fontStyle: "italic",
      fill: "black",
    }).name("label"),
  ]).constrain(({ box, label }) => [
    Constraint.align({ x: "middle", y: "middle" }, [box, label]),
  ])
);

// The ⊕ (circled-plus) CNOT target symbol (Bluefish's <OPlus>).
const OPlus = createMark(() =>
  Layer([
    circle({ r: 15, fill: "transparent", stroke: "black", strokeWidth: 3 }).name(
      "ring"
    ),
    rect({ w: 30, h: 3, fill: "black" }).name("hbar"),
    rect({ w: 3, h: 30, fill: "black" }).name("vbar"),
  ]).constrain(({ ring, hbar, vbar }) => [
    Constraint.align({ x: "middle", y: "middle" }, [ring, hbar, vbar]),
  ])
);

// A filled control dot (Bluefish's <ControlDot>). Plain function — see
// EmptySlot's comment above.
const ControlDot = () => circle({ r: 5, fill: "black" });

// A horizontal wire: a full-span black rail with the gates spread evenly
// along it and vertically centered on it (the rail paints first, so the
// gates sit on top of it). `span` is the number of slot COLUMNS the rail
// covers, independent of how many slots this wire actually carries — the
// analogue of Bluefish's `depth` prop: both wires of a circuit get the
// circuit's max slot count so they read as two parallel rails of identical
// extent (Bluefish's right circuit passes depth={3} to the 2-symbol control
// wire too). Rail width = span*SLOT + 30, matching Bluefish's
// `depth * 60 + 30`.
//
// The leader is a 10px transparent rect PREPENDED to the gates spread,
// exactly as in Bluefish's StackH — and Bluefish's Stack ALSO defaults
// spacing to 10, so the first gate starts 10 (rect) + 10 (gap) = 20px in.
// With rail = 60n + 30 and gates ending at 60n + 10, that leaves 20px of
// rail on BOTH sides: every gate row is horizontally centered on its rail.
// (An earlier version of this port used a zero-width leader on the theory
// that the spread's spacing replaced Bluefish's rect; that lost 10px on the
// left and produced lopsided 10/30 stubs.) Tried first: a
// `Constraint.distribute({dir:"x", spacing:10, anchor: "edge"})` between `line`
// and `gates`. `distribute` SEQUENCES its participants — edge mode places
// the next one after the previous one's far edge, like a flow layout — it
// does not overlap them with an offset, so `gates` landed after the rail's
// right edge instead of 10px past its left edge (and wires with different
// slot counts shifted by different amounts, bending the vertical connector
// lines). A plain `align x:"start"` + in-flow leader rect expresses it.
const Wire = createMark(({ slots, span }: { slots: any[]; span?: number }) =>
  Layer([
    rect({
      w: (span ?? slots.length) * SLOT + 30,
      h: 3,
      fill: "black",
    }).name("line"),
    spread({ dir: "x", spacing: SLOT - GATE, alignment: "middle" }, [
      rect({ w: 10, h: GATE, fill: "transparent" }),
      ...slots,
    ]).name("gates"),
  ]).constrain(({ line, gates }) => [
    Constraint.align({ x: "start", y: "middle" }, [line, gates]),
  ])
);

export const QuantumCircuit: StoryObj<Args> = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Quantum Circuit Equivalence",
      description:
        "A quantum-circuit diagram showing a controlled-Z gate is equivalent to an H-CNOT-H sequence, with control dots wired to their gates and the CNOT called out in a highlighted box.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    // Cross-tier names: the connector lines (tier 2) reference marks placed
    // deep inside the wire-group layers (tier 1).
    const c1 = createName("c1");
    const z = createName("z");
    const c2 = createName("c2");
    const oplus = createName("oplus");

    // The two highlight callouts (Bluefish's yellow <Background> boxes) are
    // built with `enclose` wrapping its OWNED content at the point that
    // content is constructed, not wrapping a `ref()` to something placed
    // elsewhere — see the friction log: `enclose` bbox-fits around children
    // it lays out itself, but a ref's already-resolved absolute position
    // does not carry over when re-wrapped by enclose from outside its
    // subtree (confirmed by trying it: the enclosure rendered at the tree's
    // local origin, nowhere near the ref'd content). `enclose` takes
    // fill/stroke/etc. and paints its rect BEHIND its children, so this
    // matches Bluefish's `<Background background={() => <Rect
    // fill="rgba(255,200,0,0.333)" rx="10" />}>` exactly — same translucent
    // yellow, same corner rounding, and Background's default padding of 10.
    const highlight = {
      padding: 10,
      rx: 10,
      ry: 10,
      fill: "rgba(255,200,0,0.333)",
      stroke: "none",
    } as const;
    const highlightedOPlus = enclose({ ...highlight }, [OPlus({})]);
    // Known 2-3px optical offset: the text ink sits slightly high in this
    // pill. enclose centers geometry children exactly (see the ⊕ pill), but
    // a text child's baseline-anchored bbox lands ~2.5px above the pill
    // center — an enclose+text interaction in the library, not fixable from
    // the story.
    const highlightedDescription = enclose({ ...highlight }, [
      text({ text: "This is a controlled-NOT." }),
    ]);

    Layer({ x: 20, y: 20 }, [
      // ── tier 1: the two wire-groups + "≡" + description — fully placed ──
      spread({ dir: "x", spacing: 25, alignment: "middle" }, [
        // Left circuit: controlled-Z.
        spread({ dir: "y", spacing: 30, alignment: "start" }, [
          Wire({ slots: [WireSlot({ content: ControlDot() }).name(c1)] }),
          Wire({ slots: [BoxedSymbol({ label: "Z" }).name(z)] }),
        ]),
        text({ text: "≡", fontSize: 40, fontWeight: 300 }),
        // Right circuit: H-CNOT-H. Both wires span 3 columns (Bluefish
        // passes depth={3} to both), so the two rails have equal extent
        // even though the control wire only carries 2 slots.
        spread({ dir: "y", spacing: 30, alignment: "start" }, [
          Wire({
            span: 3,
            slots: [
              EmptySlot(),
              WireSlot({ content: ControlDot() }).name(c2),
            ],
          }),
          Wire({
            span: 3,
            slots: [
              BoxedSymbol({ label: "H" }),
              WireSlot({ content: highlightedOPlus }).name(oplus),
              BoxedSymbol({ label: "H" }),
            ],
          }),
        ]),
        highlightedDescription,
      ]),

      // ── tier 2: control-to-gate connector lines — read the placed refs ──
      // Same stroke as the horizontal wire rails (black, 3px). zOrder(-1)
      // paints them behind tier 1, so the gate boxes (e.g. the Z box) occlude
      // the portion of the line that would otherwise run across their face.
      line({ stroke: "black", strokeWidth: 3 }, [ref(c1), ref(z)]).zOrder(-1),
      line({ stroke: "black", strokeWidth: 3 }, [ref(c2), ref(oplus)]).zOrder(
        -1
      ),
    ]).render(container, { w: args.w, h: args.h });

    return container;
  },
};
