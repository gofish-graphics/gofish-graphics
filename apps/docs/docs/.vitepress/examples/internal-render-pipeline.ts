// Internal-wiki diagram: the three-pass render pipeline, drawn in GoFish.
const box = (label, fill, w) =>
  gf
    .layer([
      gf
        .rect({ w, h: 46, fill, rx: 6, stroke: "white", strokeWidth: 1.5 })
        .name("r"),
      gf.text({ text: label, fill: "white", fontSize: 13 }).name("t"),
    ])
    .constrain(({ r, t }) => [
      gf.Constraint.align({ x: "middle", y: "middle" }, [r, t]),
    ]);

const W = 256;

const steps = [
  ["chart().flow().mark()", "#9aa0a6"],
  ["GoFishNode tree", "#9aa0a6"],
  ["Pass 1 · Domain inference", "#51931b"],
  ["Pass 2 · Layout", "#57b342"],
  ["Pass 3 · Placement & render", "#51931b"],
  ["SVG  (via SolidJS)", "#9aa0a6"],
];

// Interleave boxes with downward-arrow glyphs.
const items = [];
steps.forEach(([label, fill], i) => {
  items.push(box(label, fill, W));
  if (i < steps.length - 1) {
    items.push(gf.text({ text: "↓", fontSize: 18, fill: "#aaa" }));
  }
});

// GoFish's y axis points up, so reverse for a top-to-bottom reading order.
gf.stackY({ spacing: 9, alignment: "middle" }, items.slice().reverse()).render(
  root,
  { w: W + 60, h: 386 }
);
