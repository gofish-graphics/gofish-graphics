// Internal-wiki diagram: the three traditions GoFish blends — PL & Compilers,
// UI Component Frameworks, Graphic Design — drawn as a three-circle Venn.
// gf.position places by CENTER, in a y-up coordinate space.
//
// GoFish's ellipse doesn't expose fillOpacity, so semi-transparency is set
// directly on the fill string via rgba(...).

const W = 360;
const H = 320;
const R = 88;

// Triangle of circle centers (top, bottom-left, bottom-right). The circles
// have to be pulled in enough that all three pairwise lobes have meat.
const cx = W / 2;
const cyMid = H / 2 + 8;
const D = 52;
// y is up: A.y > cyMid puts A near the TOP of the rendered SVG.
const A = { x: cx, y: cyMid + D };
const B = { x: cx - (D * Math.sqrt(3)) / 2, y: cyMid - D / 2 };
const C = { x: cx + (D * Math.sqrt(3)) / 2, y: cyMid - D / 2 };

const lobe = (rgba, strokeRgb) =>
  gf.ellipse({
    rx: R,
    ry: R,
    fill: rgba,
    stroke: strokeRgb,
    strokeWidth: 1.5,
  });

const lbl = (text, size, fill, weight) =>
  gf.text({
    text,
    fontSize: size,
    fill: fill || "#222",
    fontWeight: weight || "normal",
    textAnchor: "middle",
  });

const stackedLabel = (lines, size, fill, weight) =>
  gf.stackY(
    { spacing: 1, alignment: "middle" },
    lines
      .slice()
      .reverse()
      .map((line) => lbl(line, size, fill, weight))
  );

gf.layer([
  // Three lobes. rgba so overlaps blend.
  gf.position(A, lobe("rgba(214,90,74,0.40)", "rgba(162,58,42,0.85)")),
  gf.position(B, lobe("rgba(58,123,181,0.40)", "rgba(31,90,140,0.85)")),
  gf.position(C, lobe("rgba(58,164,85,0.40)", "rgba(31,112,56,0.85)")),

  // Outer labels — kept inside the SVG box, placed in the part of each lobe
  // that does NOT overlap with the others.
  gf.position(
    { x: cx, y: cyMid + D + R - 18 },
    stackedLabel(["PL &", "Compilers"], 12, "#7d2818", "700")
  ),
  gf.position(
    { x: cx - (D * Math.sqrt(3)) / 2 - R + 24, y: cyMid - D / 2 - 4 },
    stackedLabel(["UI Component", "Frameworks"], 12, "#1f5a8c", "700")
  ),
  gf.position(
    { x: cx + (D * Math.sqrt(3)) / 2 + R - 24, y: cyMid - D / 2 - 4 },
    stackedLabel(["Graphic", "Design"], 12, "#1f7038", "700")
  ),

  // Center triple-overlap caption.
  gf.position({ x: cx, y: cyMid - 4 }, lbl("GoFish", 16, "#111", "800")),
]).render(root, { w: W, h: H });
