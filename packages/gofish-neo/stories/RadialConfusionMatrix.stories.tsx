import type { Meta, StoryObj } from "@storybook/html";
import {
  Frame,
  Layer,
  rect,
  text,
  polar,
  assignGradientColor,
} from "gofish-graphics";
import {
  buildMatrix,
  frontier,
  frequency,
  buildNormalizer,
  applyDefaults,
} from "../src";
import { initializeContainer } from "./helper";
import { animalsHierarchical } from "./data";

// A radial (polar) hierarchical confusion matrix — the showpiece from issue
// #639: observed classes (columns) map to ANGLE, actual classes (rows) map to
// RADIUS as concentric rings, and the label tree's internal groups render as
// sunburst-style arc headers around the outer rim. This is deliberately NOT
// built on `confusionMatrix.tsx` (the Cartesian renderer, which lays its grid
// out with `table()`): a polar grid has no ordinal x/y axes to hang a `table`
// off, so this composes the SAME algebra (buildMatrix/frontier/frequency/
// buildNormalizer) directly into hand-placed polar wedges instead, following
// gofish-gotree's MultilevelSilhouetteTree idiom (issue #627) — bypass the
// tree()/combine() DSL, compute each mark's angular/radial slice directly,
// and emit it into a `Frame({ coord: polar() })`.

const meta: Meta = {
  title: "Neo/Radial Confusion Matrix",
};
export default meta;

const CONTAINER_SIZE = { w: 900, h: 900 };

// ─── palette (matches the Cartesian ConfusionMatrix stories' sequential ramp) ──
const COLORS: [string, string] = ["#e6f5f8", "#0b5394"];
const ZERO_FILL = "#f2f2f3";
const HEADER_FILL = "#1d3557"; // same navy as the flat version's root tree-box

// ─── geometry ───────────────────────────────────────────────────────────────
// A full 2π sweep degenerates (a rect spanning exactly 2π collapses to a
// zero-width sliver — see gofish-gotree's Sunburst/MultilevelSilhouetteTree
// notes), so leave a real angular gap. 300° sweep / 60° gap doubles as the
// spot for the ring (actual-class) legend.
const SWEEP_DEG = 300;
const SWEEP = (SWEEP_DEG / 180) * Math.PI;
// `polar()`'s screen angle is `startAngle - theta` (default direction -1), so
// the untouched arc [SWEEP, 2π) sits immediately counter-clockwise of theta=0.
// Offsetting startAngle by half the swept angle rotates that leftover gap to
// point straight down, regardless of how wide the sweep is:
//   screenAngle(gapMid) = startAngle - (SWEEP + (2π−SWEEP)/2) := −π/2 (down)
//   ⇒ startAngle = π/2 + SWEEP/2
const START_ANGLE = Math.PI / 2 + SWEEP / 2;

const HEADER_R_OUTER = 280; // outer edge of the rim's group-header arcs
const HEADER_THICKNESS = 26;
const BODY_R_OUTER = HEADER_R_OUTER - HEADER_THICKNESS; // outer edge of the body rings
const DONUT_FRACTION = 0.3; // hole radius as a fraction of BODY_R_OUTER (~28% of the full disc)
const BODY_R_INNER = BODY_R_OUTER * DONUT_FRACTION;

async function radialConfusionMatrix() {
  const resolved = applyDefaults({ classes: ["animal"] });
  const { tree: labelTree, matrix } = buildMatrix(
    animalsHierarchical,
    resolved
  );
  const rows = frontier(labelTree); // 6 leaves; the shared tree serves both axes
  const cols = rows;
  const n = rows.length;
  const normalizer = buildNormalizer(labelTree, matrix, resolved.normalization);

  const perLeafAngle = SWEEP / n;
  const ringThickness = (BODY_R_OUTER - BODY_R_INNER) / n;

  const polarCoord = polar({
    centralAngle: SWEEP,
    startAngle: START_ANGLE,
    direction: -1,
  });

  const marks: any[] = [];

  // ─── body cells: annular sectors. Row → ring (row 0, the first actual class,
  // is the OUTERMOST ring — more area for the earlier/larger classes), col → angle.
  rows.forEach((rowNode, ri) => {
    const ringPos = n - 1 - ri;
    const rInner = BODY_R_INNER + ringPos * ringThickness;
    cols.forEach((colNode) => {
      const count = frequency(matrix, rowNode, colNode);
      const norm = normalizer(rowNode, colNode);
      const isZero = count === 0;
      const fill = isZero
        ? ZERO_FILL
        : assignGradientColor({ _tag: "gradient", stops: COLORS } as any, norm);
      marks.push(
        rect({
          x: colNode.start * perLeafAngle,
          w: (colNode.end - colNode.start) * perLeafAngle,
          y: rInner,
          h: ringThickness,
          emX: true,
          emY: true,
          fill,
          stroke: "white",
          strokeWidth: 1,
        } as any)
      );
      if (!isZero) {
        const midTheta = ((colNode.start + colNode.end) / 2) * perLeafAngle;
        const midR = rInner + ringThickness / 2;
        const [tx, ty] = polarCoord.transform([midTheta, midR]);
        marks.push(
          text({
            x: tx,
            y: ty,
            text: String(count),
            fontSize: 9,
            fill: norm > 0.55 ? "#ffffff" : "#0f1f30",
            textAnchor: "middle",
          } as any)
        );
      }
    });
  });

  // ─── outer-rim header arcs: one per top-level group under the primary class
  // dimension (e.g. mammal/bird/reptile:lizard) — a sunburst-style parent arc
  // spanning exactly its children's angular extent (the same leaf-index range
  // the body rings use, read straight off the shared label tree).
  const dimRoot = labelTree.children[0] ?? labelTree;
  for (const group of dimRoot.children) {
    marks.push(
      rect({
        x: group.start * perLeafAngle,
        w: (group.end - group.start) * perLeafAngle,
        y: BODY_R_OUTER,
        h: HEADER_THICKNESS,
        emX: true,
        emY: true,
        fill: HEADER_FILL,
        stroke: "white",
        strokeWidth: 1.5,
      } as any)
    );
  }

  // Header + ring labels: `text()`'s plain x/y bypass the coord's warp (only
  // EMBEDDED dims get warped — see ellipse.tsx's `space.transform(center)`
  // special-case, which text has no equivalent of), so the point itself must
  // be pre-transformed by hand — the same recipe `coord.tsx` uses for its own
  // polar-axis tick labels (`effectiveTransform.transform([theta, r])`, then
  // plain x/y).
  for (const group of dimRoot.children) {
    const mid = ((group.start + group.end) / 2) * perLeafAngle;
    // Clear of the rim, on the plain background: placing the anchor just
    // past HEADER_R_OUTER is not enough on its own — for a group whose mid-
    // angle points nearly straight left/right (its "outward" direction is
    // almost horizontal), a wide CENTERED label's other half reaches back
    // toward the origin and re-overlaps the dark arc (dark-on-dark). Anchor
    // the text so it only grows AWAY from center — the same rule coord.tsx
    // uses for its own polar axis-tick labels (sign/magnitude of the
    // transformed screen x) — so growth always increases radius, never
    // dips back into the ring, regardless of the group's angle.
    const r = HEADER_R_OUTER + 22;
    const [tx, ty] = polarCoord.transform([mid, r]);
    const label =
      group.children.length > 0 ? group.name : group.name.replace(/:/g, " / ");
    marks.push(
      text({
        x: tx,
        y: ty,
        text: label,
        fontSize: 11,
        fontWeight: 600,
        fill: "#0f1f30",
        textAnchor: tx < -6 ? "end" : tx > 6 ? "start" : "middle",
      } as any)
    );
  }

  // Ring (actual-class) labels: stacked along the single radial spoke at the
  // gap's center angle (straight down), one per ring at that ring's mid-radius
  // — "along a radius", as the gap widens outward the labels never crowd.
  const gapMidTheta = SWEEP + (2 * Math.PI - SWEEP) / 2;
  rows.forEach((rowNode, ri) => {
    const ringPos = n - 1 - ri;
    const rMid = BODY_R_INNER + (ringPos + 0.5) * ringThickness;
    const [tx, ty] = polarCoord.transform([gapMidTheta, rMid]);
    marks.push(
      text({
        x: tx,
        y: ty,
        text: rowNode.name.replace(/:/g, " / "),
        fontSize: 10,
        fill: "#0f1f30",
        textAnchor: "middle",
      } as any)
    );
  });

  // Invisible margin markers: `fitToContent` (the story harness's viewBox
  // auto-fit) crops tightly to the content bbox with only a fixed 10px pad,
  // which puts the header labels — the widest things in the piece, since they
  // sit right at the rim — flush against the crop edge. A ring of small,
  // unembedded (position-only) points at a larger radius pads the bbox on
  // every side without drawing anything visible. Unlike `text`, a shape's
  // (x, y) here IS still routed through the coord transform when neither
  // dimension is embedded (see ellipse.tsx's `space.transform(center)`), so
  // these are genuine (θ, r) pairs, not pre-transformed pixels.
  const MARGIN_R = HEADER_R_OUTER + 150;
  for (let i = 0; i < 8; i++) {
    const theta = (i * 2 * Math.PI) / 8;
    marks.push(
      rect({
        x: theta,
        y: MARGIN_R,
        w: 2,
        h: 2,
        fill: "none",
        stroke: "none",
      } as any)
    );
  }

  return Frame(
    {
      w: CONTAINER_SIZE.w,
      h: CONTAINER_SIZE.h,
      coord: polarCoord as any,
      // A truthy `axes` (even with both rings suppressed) centers the polar
      // content at the Frame's own (w/2, h/2) instead of tight-fitting its
      // bbox — see coord.tsx's `useAllocated` branch — with no ticks drawn.
      axes: { x: false, y: false },
    },
    [Layer(marks)]
  );
}

export const Radial: StoryObj = {
  name: "Radial Confusion Matrix",
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Radial Confusion Matrix",
      description:
        "A hierarchical confusion matrix bent into a polar donut — actual classes as concentric rings, observed classes as angular sectors, and sunburst-style arcs marking each animal group around the rim.",
    },
  },
  render: () => {
    const container = initializeContainer(CONTAINER_SIZE);
    (async () => {
      const node = await radialConfusionMatrix();
      node.render(container, CONTAINER_SIZE);
    })();
    return container;
  },
};
