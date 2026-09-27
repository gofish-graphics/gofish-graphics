// Quantum Circuit Equivalence
// A quantum-circuit diagram showing a controlled-Z gate is equivalent to an H-CNOT-H sequence, with control dots wired to their gates and the CNOT called out in a highlighted box.

import {
  Constraint,
  circle,
  createMark,
  createName,
  enclose,
  layer,
  line,
  rect,
  ref,
  spread,
  text,
} from "gofish-graphics";
const SLOT = 60;
const GATE = 50;
const WireSlot = createMark(({ content }) =>
  layer([
    rect({ w: GATE, h: GATE, fill: "transparent" }).name("slot"),
    content.name("content"),
  ]).relate(({ slot, content }) => [
    Constraint.align({ x: "middle", y: "middle" }, [slot, content]),
  ]),
);
const EmptySlot = () => rect({ w: GATE, h: GATE, fill: "transparent" });
const BoxedSymbol = createMark(({ label }) =>
  layer([
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
  ]).relate(({ box, label }) => [
    Constraint.align({ x: "middle", y: "middle" }, [box, label]),
  ]),
);
const OPlus = createMark(() =>
  layer([
    circle({
      r: 15,
      fill: "transparent",
      stroke: "black",
      strokeWidth: 3,
    }).name("ring"),
    rect({ w: 30, h: 3, fill: "black" }).name("hbar"),
    rect({ w: 3, h: 30, fill: "black" }).name("vbar"),
  ]).relate(({ ring, hbar, vbar }) => [
    Constraint.align({ x: "middle", y: "middle" }, [ring, hbar, vbar]),
  ]),
);
const ControlDot = () => circle({ r: 5, fill: "black" });
const Wire = createMark(({ slots, span }) =>
  layer([
    rect({
      w: (span ?? slots.length) * SLOT + 30,
      h: 3,
      fill: "black",
    }).name("line"),
    spread({ dir: "x", spacing: SLOT - GATE, alignment: "middle" }, [
      rect({ w: 10, h: GATE, fill: "transparent" }),
      ...slots,
    ]).name("gates"),
  ]).relate(({ line, gates }) => [
    Constraint.align({ x: "start", y: "middle" }, [line, gates]),
  ]),
);
const container = document.getElementById("app");
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
};
const highlightedOPlus = enclose({ ...highlight }, [OPlus({})]);
// Known 2-3px optical offset: the text ink sits slightly high in this
// pill. enclose centers geometry children exactly (see the ⊕ pill), but
// a text child's baseline-anchored bbox lands ~2.5px above the pill
// center — an enclose+text interaction in the library, not fixable from
// the story.
const highlightedDescription = enclose({ ...highlight }, [
  text({ text: "This is a controlled-NOT." }),
]);
layer({ x: 20, y: 20 }, [
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
        slots: [EmptySlot(), WireSlot({ content: ControlDot() }).name(c2)],
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
  line({ stroke: "black", strokeWidth: 3 }, [ref(c2), ref(oplus)]).zOrder(-1),
]).render(container, { w: args.w, h: args.h });
