// Ohm Parse Tree
// A parse-derivation diagram for the arithmetic expression "3 + (4 * 5)", with each matched grammar rule drawn as a colored bar spanning exactly the characters it covers, nested rules stacking downward toward the deepest match.

import {
  Constraint,
  createMark,
  createName,
  layer,
  rect,
  text,
} from "gofish-graphics";
const CHAR_W = 60;
const END_W = 30;
const CHAR_H = 34;
const CHAR_GAP = 4;
const LABEL_H = 25;
const DEPTH_GAP = 4;
const RULE_COLOR = {
  Exp: "#b148d2",
  AddExp: "#FFBD27",
  MulExp: "#5cc593",
  PriExp: "#FF6302",
  number: "#00B4D8",
  end: "#EE092D",
};
const BIG_FONT = { fontFamily: "monospace", fontWeight: 500, fontSize: 25 };
const LABEL_FONT = { fontFamily: "monospace", fontWeight: 300, fontSize: 14 };
const NOTE_FONT = { ...LABEL_FONT, fontStyle: "italic", fill: "#777" };
const SPECIAL_FONT = { ...LABEL_FONT, fill: "green" };
const R = (rule, from, to, children = [], case_) => ({
  kind: "rule",
  rule,
  case: case_,
  from,
  to,
  children,
});
const L = (text, at) => ({
  kind: "terminal",
  text,
  from: at,
});
const number3 = R("number", 0, 0);
const priExp3 = R("PriExp", 0, 0, [number3]);
const mulExp3 = R("MulExp", 0, 0, [priExp3]);
const addExp3 = R("AddExp", 0, 0, [mulExp3]);
const number4 = R("number", 5, 5);
const priExp4 = R("PriExp", 5, 5, [number4]);
const mulExp4 = R("MulExp", 5, 5, [priExp4]);
const number5 = R("number", 9, 9);
const priExp5 = R("PriExp", 9, 9, [number5]);
const mulExpTimes = R("MulExp", 5, 9, [mulExp4, L("*", 7), priExp5], "times");
const mulExpInner = R("MulExp", 5, 9, [mulExpTimes]);
const addExpInner = R("AddExp", 5, 9, [mulExpInner]);
const expInner = R("Exp", 5, 9, [addExpInner]);
const priExpParen = R(
  "PriExp",
  4,
  10,
  [L("(", 4), expInner, L(")", 10)],
  "paren",
);
const priExpParenOuter = R("PriExp", 4, 10, [priExpParen]);
const mulExpParen = R("MulExp", 4, 10, [priExpParenOuter]);
const addExpPlus = R(
  "AddExp",
  0,
  10,
  [addExp3, L("+", 2), mulExpParen],
  "plus",
);
const addExpOuter = R("AddExp", 0, 10, [addExpPlus]);
const TRACE = R("Exp", 0, 10, [addExpOuter]);
const CharBox = createMark(({ ch }) =>
  layer([
    rect({ w: CHAR_W, h: CHAR_H, fill: "transparent" }).name("box"),
    text({ text: ch, ...BIG_FONT }).name("glyph"),
  ]).relate(({ box, glyph }) => [
    Constraint.align({ x: "middle", y: "middle" }, [box, glyph]),
  ]),
);
const LabelText = ({ main, note }) =>
  note
    ? layer([
        text({ text: main, ...LABEL_FONT }).name("main"),
        text({ text: `- ${note}`, ...NOTE_FONT }).name("note"),
      ]).relate(({ main: m, note: n }) => [
        Constraint.align({ y: "middle" }, [m, n]),
        Constraint.distribute({ dir: "x", spacing: 4 }, [m, n]),
      ])
    : text({ text: main, ...LABEL_FONT });
const asRef = (t) => ({ name: t.__tag });
const container = document.getElementById("app");
let uid = 0;
const children = [];
const constraints = [];
// ── Tier 1: the character row — a self-contained sub-layer with its own
// `.relate()` call, exactly the two-tier pattern house style uses for
// "inner Layer fully places a unit, later tiers build off it." The
// character glyphs' pixel geometry is ALSO reproduced analytically below
// (`charLeft`/`charRight`) for the span markers — see the comment at
// `marker` for why a `ref()` back into this tier didn't end up being the
// mechanism that sources those spans.
const text_ = "3 + (4 * 5)";
const chars = text_.split("");
const charTokens = chars.map((_, i) => createName(`char-${i}`));
const endTok = createName("end-box");
const rowRefs = [...charTokens, endTok].map(asRef);
const charRowTok = createName("char-row");
children.push(
  layer({ x: 0, y: 0 }, [
    ...chars.map((ch, i) => CharBox({ ch }).name(charTokens[i])),
    rect({ w: END_W, h: CHAR_H, fill: "transparent" }).name(endTok),
  ])
    .relate(() => [
      Constraint.align({ y: "start" }, rowRefs),
      Constraint.distribute({ dir: "x", spacing: CHAR_GAP }, rowRefs),
    ])
    .name(charRowTok),
);
// ── Span sources for `Constraint.align({x:"span"})` ───────────────────
// The natural way to source a span is a `Layer` unioning `ref()`s into
// the two (already-placed) character boxes at the ends of the range —
// that's what was tried first here, and it's exactly the shape the task
// brief suggested. It didn't work, and the reason is worth recording:
//
//   `layer({x:0,y:0}, [ref(a), ref(b)])` — an explicit anchor is
//   required for the WRAPPER itself to read as "already placed" (see
//   the `AlignSpan`/`AlignSize` stories in Constraints.stories.tsx,
//   where the span *source* always carries a literal `{x,y}`). But
//   `layer.tsx`'s layout derives the wrapper's OWN translate as
//   `explicitMin - foldedMinOfChildren`, so that
//   `translate + intrinsicDims.min` — the wrapper's reported ABSOLUTE
//   position, which is exactly what a consuming `align` reads — collapses
//   to the explicit value again, REGARDLESS of where the ref children
//   actually are. The folded WIDTH (`max − min`) survives (it cancels
//   the same shift on both ends), so a span sourced this way silently
//   gets the right size at the wrong position — invisible for any range
//   starting at character 0 (whose true position coincides with the
//   wrapper's own local origin, e.g. "Exp", "AddExp - plus", the row
//   underline — all correct below), but wrong for every other range
//   (confirmed by tracing distinct char tokens all the way into a
//   `rangeRef`-style wrapper and back out at the wrong x). This appears
//   to be a genuine gap: nothing currently lets a `Layer` wrapping refs
//   report ITS OWN absolute position honestly while also being
//   recognized as an `align` source.
//
// Workaround: since the character row's geometry is a fixed, known
// pitch (`CHAR_W` + `CHAR_GAP`, laid out left-to-right from the layer's
// own origin), the span source can instead be a small FRESH, literally
// `{x, w}`-positioned invisible rect — no refs, no fold, so no
// wrapper-position bug — standing in for "the pixel extent character i
// through character j occupy." `Constraint.align({x:"span"})` itself is
// still doing the real work below (every bar's width and position are
// written by that constraint, not hand-copied onto the bar directly);
// only ITS SOURCE is synthesized rather than ref-derived.
const CHAR_PITCH = CHAR_W + CHAR_GAP;
const charLeft = (i) => i * CHAR_PITCH;
const charRight = (i) => charLeft(i) + CHAR_W;
const endLeft = charRight(chars.length - 1) + CHAR_GAP;
const endRight = endLeft + END_W;
const marker = (left, right) => {
  const tok = createName(`marker-${uid++}`);
  children.push(
    rect({ x: left, w: right - left, h: 1, fill: "transparent" }).name(tok),
  );
  return asRef(tok);
};
// Per-index range lookup used by the recursive trace walk.
const spanOf = (from, to) => marker(charLeft(from), charRight(to));
const underlineRowTok = createName("row-underline");
children.push(rect({ h: 1, y: CHAR_H, fill: "gray" }).name(underlineRowTok));
constraints.push(
  Constraint.align({ x: "span" }, [
    marker(charLeft(0), endRight),
    asRef(underlineRowTok),
  ]),
);
// Depth (nesting level below the character row) → y. `Constraint.align`
// is what this story is validating, not `Constraint.distribute` — and
// distribute turned out not to compose the way a *tree* of independent
// parent→child "below" pairs needs: every `distribute(dir:"y")` pair in
// this file shares the same axis, and the solver folds ALL of them
// (across every call in the flat `constraints` list) into ONE global
// order rather than keeping each branch's own chain separate — the two
// subtrees under "AddExp - plus" (the "3" branch and the "(4 * 5)"
// branch) ended up interleaved into a single stack instead of each
// counting its own depth. Since depth is fully known at authoring time
// (it's just the node's distance from the character row in TRACE), y is
// set directly as a literal instead — every row is a uniform
// `ROW_PITCH` apart, matching the original's uniform `Distribute
// direction="vertical" spacing={4}` rhythm.
const ROW_TOP = CHAR_H + 1 + DEPTH_GAP; // below the row + its 1px underline
const ROW_PITCH = LABEL_H + DEPTH_GAP;
const rowY = (depth) => ROW_TOP + (depth - 1) * ROW_PITCH;
// ── The recursive trace walk (mirrors RenderTrace/RenderNode) ────────
const walk = (node, depth) => {
  const y = rowY(depth);
  if (node.kind === "terminal") {
    const labelTok = createName(`lit-${uid++}`);
    children.push(
      text({ text: `"${node.text}"`, y: y + 6, ...SPECIAL_FONT }).name(
        labelTok,
      ),
    );
    const labelRef = asRef(labelTok);
    constraints.push(
      Constraint.align({ x: "middle" }, [
        spanOf(node.from, node.from),
        labelRef,
      ]),
    );
    return labelRef;
  }
  const barTok = createName(`bar-${uid++}`);
  const labelTok = createName(`label-${uid++}`);
  const underlined = node.children.length === 0;
  children.push(
    rect({ h: LABEL_H, y, fill: RULE_COLOR[node.rule], opacity: 0.5 }).name(
      barTok,
    ),
  );
  children.push(LabelText({ main: node.rule, note: node.case }).name(labelTok));
  const barRef = asRef(barTok);
  const labelRef = asRef(labelTok);
  const src = spanOf(node.from, node.to);
  constraints.push(
    Constraint.align({ x: "span" }, [src, barRef]),
    Constraint.align({ x: "middle", y: "middle" }, [barRef, labelRef]),
  );
  if (underlined) {
    const underlineTok = createName(`underline-${uid++}`);
    children.push(
      rect({ h: 2, y: y + LABEL_H - 2, fill: "LightGray" }).name(underlineTok),
    );
    constraints.push(
      Constraint.align({ x: "span" }, [src, asRef(underlineTok)]),
    );
  }
  for (const child of node.children) walk(child, depth + 1);
  return barRef;
};
// Root Exp bar, below the character row.
walk(TRACE, 1);
// Root-level "end" label, below the character row too (a sibling of
// Exp, not nested under it — matches the original's separate
// `<Label from={endName} below="top" .../>` call outside RenderTrace).
const endBarTok = createName("end-bar");
const endLabelTok = createName("end-label");
children.push(
  rect({ h: LABEL_H, y: rowY(1), fill: RULE_COLOR.end, opacity: 0.5 }).name(
    endBarTok,
  ),
);
children.push(LabelText({ main: "end" }).name(endLabelTok));
constraints.push(
  Constraint.align({ x: "span" }, [
    marker(endLeft, endRight),
    asRef(endBarTok),
  ]),
  Constraint.align({ x: "middle", y: "middle" }, [
    asRef(endBarTok),
    asRef(endLabelTok),
  ]),
);
layer({ x: 20, y: 20 }, children)
  .relate(() => constraints)
  .render(container, { w: 820, h: 480 });
