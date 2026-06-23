# Embedding annotations — GoTree polar corpus

**Purpose.** Ground-truth annotation of every GoTree _polar_ gallery example with its
per-axis embed/warp status, so we can **work backwards to the rule** that reproduces
the whole table (cf. `polar-coordinate-spaces.md` Phase 3). This file is both the spec
and the test oracle for the embedding-resolution pass.

**Status:** verified pass. First-pass classification from the gofish specs, then
cross-referenced against the GoTree reference (BIT-VIS/gotree dsl specs) and re-read of
each story by 4 agents. The `render` + `why` columns are settled; **the reference-intent
and discrepancy columns are where the design pressure lives — correct in place.**

## Converged model (agreed)

Embedding is not its own concept and not a mark flag — it's a question about where a
mark's **edges** live:

> **An axis embeds iff its _edges_ are positions in the manifold's coordinate space
> (the preimage), rather than screen-space offsets around a mapped center.**

There are **two independent routes** by which edges get into coordinate space; an axis
embeds if _either_ applies (they are OR'd):

- **Route A — relational (geometric, measure-free).** A surrounding relation pins the
  edges _as coordinate positions_: edge-metric `distribute`/`stack`/`nest` places edges
  in the preimage and the transform carries them. This works with **no data and no
  measure** — two constant-size rects distributed edge-to-edge under polar still warp
  their edges to stay touching. A **center-metric** relation pins only the center (one
  coordinate position), leaving the box's extent as screen ink → point.
- **Route B — intrinsic (measure-gated).** The mark's _own_ size on the axis becomes a
  coordinate extent because it is denominated in that axis's **spatial-scale measure**
  (a bar's height is quantitative-on-y). A **foreign-measure** size (a scatter bubble's
  area ≠ the position measure) or a **pixel aesthetic** (a circle's radius) never
  becomes a coordinate extent → stays ink, drawn flat at the mapped center.

Measure discriminates **Route B only** (the mark's own size); it says nothing about
Route A. The two are orthogonal.

> **point / line / area = the number of axes whose edges are coordinate-space positions
> (via Route A or Route B).**

**Mechanism:** a **recursive pass**. Route A propagates pinned edges _down_ from
relations (so it can't be read locally on a mark); Route B is read locally per mark from
**measure provenance** (open as #534 — provenance doesn't yet reach mark channels). That
missing provenance is exactly why the gotree wedges hand-set `emX`/`emY`: their computed
sizes carry no measure, so nothing can infer Route B. So **`emX`/`emY` is a stand-in for
missing measure provenance** — once #534 lands it shrinks to a rare, renamed escape
hatch (mark-level) rather than the primary API.

**Untested oracle case to add:** a scatter with a size channel under `polar()` — bubbles
must stay flat circles (Route B fails: size measure ≠ position measure) while their x/y
positions warp. Not in the all-tree gotree corpus; the cleanest test of the measure
discriminator.

This resolves #618's "embedded vs non-embedded dimensions on θ/r" + "single-axis nest
with point nodes" and is the same axis as the edge/center-mode question (#8/#56).

## The mechanism today (so the annotations are precise)

A mark's render switches on which of its two dims are `embedded` (rect.tsx:300, 318/362/456):

- **0 embedded → point.** Transform the _center_; draw the shape at literal pixel size.
- **1 embedded → line.** The embedded axis sweeps _through_ the transform (a straight
  edge becomes an arc); the other axis is pixel thickness.
- **2 embedded → area.** Both axes sweep (a wedge / annular sector).

`embedded` is set:

1. **Explicit** — `emX`/`emY` on a `rect` (`dims.ts:81,88` → `embedded`).
2. **By nest-growth** — an _unsized_ dim (no `w` / no `h`) on an `emX`/`emY` rect that
   `nest` grows to contain its subtree. This is the "embedded angular/radial
   containment" case — the grown extent is in coord units and sweeps.
3. **Inferred** — `inferEmbedded` (data.ts:293) when a dim's _extent_ is a data value.
4. **By `connect`** — toggles `embed(direction)` on link paths (links).

A `circle` is inherently a **point**: its `r` is a pixel SIZE, not a coord-space extent
(verified — FlowerTree's data-driven `r` is still a point).

## Verified annotation table (24 polar examples)

`θ`=x, `r`=y. **warp**=extent in coord units, swept. **pt**=no warped extent (pixel
size at transformed center). **n/a**=zero extent. The **combine (impl)** column is what
the _code_ does — which often differs from GALLERY.md's dsl-intent columns (see ⚠).

|   # | Example                  | mark                                                     |  θ   |  r   | render     | combine (impl)                      | reference intent → discrepancy                                                                                                                                                           |
| --: | ------------------------ | -------------------------------------------------------- | :--: | :--: | ---------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | RadialTree               | circle                                                   |  pt  |  pt  | **point**  | distr / distr+align                 | ref `Node:circle` dots ✓. gaps: no auto-fit, polar opts                                                                                                                                  |
|   2 | RadialTreeIncline        | circle                                                   |  pt  |  pt  | **point**  | distr / distr+align                 | ✓ incline (margin-as-fraction) approximated                                                                                                                                              |
|   3 | MultilevelSilhouetteTree | circle                                                   |  pt  |  pt  | **point**  | distr / distr+align                 | ⚠ ref **headline = SliceLayout AREA silhouette** (value-sized wedge bands); port chose the node-link circle reading. Area IS expressible (emX/emY rect) — porting choice, not model gap |
|   4 | SideTree                 | circle                                                   |  pt  |  pt  | **point**  | distr / align+distr                 | ✓ `StartAngle 0.17` not expressible                                                                                                                                                      |
|   5 | SpiralLayout             | circle                                                   |  pt  |  pt  | **point**  | distr / distr                       | ✓ pitch via indep θ/r consts, not true Archimedean                                                                                                                                       |
|   6 | DeepTree                 | circle                                                   |  pt  |  pt  | **point**  | **nest-θ** / distr+align            | ⚠ code keeps nest-θ but it **degenerates to re-centering** (point can't grow a wedge). links curve→linear                                                                               |
|   7 | RadialDeep               | circle                                                   |  pt  |  pt  | **point**  | align / distr+align                 | ✓ no nest; θ hand-tapered (perDepth). links curve→linear                                                                                                                                 |
|   8 | OutsideInTree            | circle                                                   |  pt  |  pt  | **point**  | align-θ / distr+align               | ⚠ ref intends **nest-θ** (nested wedge enclosure); port **substitutes align** — a point can't enclose. links curve→linear                                                               |
|   9 | OrthogonalGridEmbedding  | circle                                                   |  pt  |  pt  | **point**  | align / distr+align                 | ✓ ref relation is `within→align` (no nest). only gap = orthogonal links→linear                                                                                                           |
|  10 | RotationTree             | circle                                                   |  pt  |  pt  | **point**  | distr+align / distr+align           | ✓ node fine; gaps: arccurve→linear, r-align-on-both can't do root-center-vs-ring (2/5)                                                                                                   |
|  11 | OakTreeVis               | circle                                                   |  pt  |  pt  | **point**  | align + **distr-r** / distr         | ⚠ ref intends **nest-r** radial containment; port **drops to distribute-r** (align-r _collapses_ the tree). curveStepBefore→linear                                                      |
|  12 | FlowerTree               | circle (r=√width)                                        |  pt  |  pt  | **point**  | **nest-θ** / distr+align            | ⚠ genuine nest-θ but **enclosure faked by hand-sizing the radius**; uniform nodes wouldn't read as petals. r is a pixel size → still a point                                            |
|  13 | RadialPhylogeneticTree   | rect 0×0 (hidden)                                        | n/a  | n/a  | **point°** | nest-θ / distr+align                | ° faked hidden node (links-only anchor; color migrates to links). nest-θ accumulates with no auto-fit → spokes confined/overflow                                                         |
|  14 | ClockTree                | rect emX,emY                                             | warp | warp | **area**   | distr+align / distr+align           | ⚠ ref `InnerRadius:0.72` **hollow rim**; port fills disc from r=0 (2/5)                                                                                                                 |
|  15 | ClockTreeWithLink        | rect emX,emY                                             | warp | warp | **area**   | distr+align / distr+align           | ⚠ ref `InnerRadius:0.79` hole used FOR the step/arc links; port fills disc + links→straight chords (3/5)                                                                                |
|  16 | SectorTree               | rect emX,emY                                             | warp | warp | **area**   | **align-θ + distr-r** / align       | ⚠ GALLERY row `(distribute,align)` is **stale** — code diverges to align-θ+distr-r for concentric rings. ref ~270° partial sweep, center-right; port = full centered disc               |
|  17 | SectorTree2              | rect emX,emY (internal unsized-θ → nest)                 | warp | warp | **area**   | **nest-θ** / distr+align            | genuine nest-θ (internal θ from nest). ⚠ port gets a **hollow center it doesn't want** (distr-r starts root at r=band); ref half-disc center-right                                      |
|  18 | HierarchicalSectorChart  | rect emX,emY (internal unsized-θ → nest)                 | warp | warp | **area**   | **nest-θ** / distr+align            | genuine nest-θ. ⚠ ref `InnerRadius:0` **solid center**; port renders a hollow center → **strictly wrong**, not just lossy                                                               |
|  19 | Sunburst                 | rect emX,emY (internal unsized-θ → nest)                 | warp | warp | **area**   | **nest-θ** / distr+align            | the ONLY sunburst-family story that literally runs nest-θ ✓. hole appears (InnerRadius:0 not expressible)                                                                                |
|  20 | IciclePlotPolar          | rect emX,emY (w=width·θ)                                 | warp | warp | **area**   | **align-θ** / distr+align           | ⚠ my draft said nest-θ — WRONG. code uses **align-θ + embedded leaf-count width**; GALLERY `(nest,distribute)` = dsl intent only                                                        |
|  21 | TyreTree                 | rect emX,emY (h=(depth+1)·band)                          | warp | warp | **area**   | **align-θ + align-r** / distr+align | ⚠ my draft said nest-θ — WRONG. **no nest**; value-driven width **approximated by leaf-count**; `InnerRadius:0.25` hole not expressible                                                 |
|  22 | TornadoTree              | rect emX,emY (internal unsized-r → nest)                 | warp | warp | **area**   | distr + **nest-r** / distr          | genuine **nest-r** radial containment (load-bearing). no auto-fit → spiral overflow (on-theme). PolarCenter not expressible                                                              |
|  23 | TornadoTree2             | rect emX,emY (internal unsized-r → nest)                 | warp | warp | **area**   | distr + **nest-r** / distr          | genuine nest-r. ⚠ ref `Margin -0.46` **negative overlap not expressible**                                                                                                               |
|  24 | ViolinTree               | rect emX,emY (leaf h=value·R, internal unsized-r → nest) | warp | warp | **area**   | distr + **nest-r** / distr          | genuine nest-r + **value-driven radial thickness IS expressed** (leaves). angular twist not faithful without allocation                                                                  |

°RadialPhylogeneticTree fakes a `hidden`/point primitive (#618).

### Links / edges (the "line" case)

Node-link stories draw edges via `connect`, which `embed(direction)`s the path
(connect.tsx:121) → a **1-embedded = line**: a straight segment in (θ,r) warped to a
radial curve. The "curve/arc/step→linear" gaps are that the spoke is authored as a
_straight_ segment in coord space (then bent by polar), not given its intended curve
_in coord space first_.

## Induced rules (verified against the corpus)

1. **Render = count of embedded (coord-extent) axes:** point(0) / line(1) / area(2).
   Holds across all 24 + links.
2. **Embedding has two independent sources (see Converged model): relational (Route A)
   and measure-gated intrinsic (Route B).** Rows 1–5 render as **points** not because
   "layout never embeds," but because their relations are **center-metric** (Route A
   pins only centers) _and_ the mark size is a pixel radius (Route B fails). An
   **edge-metric** relation would embed even these dataless circles' edges. (Correction:
   an earlier draft said "embedding is a property of the mark, not the layout" — false;
   edge-metric layout embeds dataless marks.)
3. **A mark gets a coord-extent on an axis in exactly two ways:** (a) an explicit size
   in domain units (`w = width·leafTheta`, `h = value·R`), or (b) an **unsized dim
   grown by `nest`** (angular: Sunburst/SectorTree2/HSC; radial: Tornado×2/Violin). The
   embedding-resolution pass must account for both — (b) means a node's embed status
   depends on its _children_ (nest growth), which is exactly why this wants a
   **recursive pass like underlying-space resolution.**
4. **`nest` on axis A requires the participating marks be embeddable/growable on A.**
   When the mark can't grow (a circle point), the port is forced to one of:
   - **keep nest, degenerate** to re-centering (DeepTree),
   - **fake it** by hand-sizing a pixel channel (FlowerTree's radius),
   - **substitute** align/distribute (OutsideInTree nest-θ→align; OakTreeVis nest-r→distr),
     and the substitute can _degrade_ (OakTreeVis: align-r collapses the tree).
     → **point marks cannot honor nest on an axis.** This is the central point-vs-area
     tension, and the single clearest rule the corpus yields.
5. **A circle's data-driven `r` is a size, not an embeddable extent** (FlowerTree). Size
   ≠ coord-extent — a point with a data radius is still a point.
6. **GALLERY.md combine columns are dsl _intent_, not the implemented constraint.**
   IciclePlot, TyreTree, SectorTree (and the dropped-nest circle rows) implement
   something different from their dsl row. Trust the code. (Fix: footnote the diverging
   rows in GALLERY.md.)

## Cross-cutting gaps the annotation surfaced (feed the coord work)

- **Inner-radius is the dominant fidelity gap, and it cuts both ways.** `polar()` always
  starts at r=0 with no inner-radius knob: ClockTree/ClockTreeWithLink/TyreTree _can't
  make the hollow rim they need_, while SectorTree2/HSC _get a hollow center they don't
  want_ (the first `distribute-r` starts the root band at `r=band`). HSC's reference is
  `InnerRadius:0` (solid) → the port is **strictly wrong** there. One inner-radius/origin
  parameter fixes all of these. (Phase 1.)
- **Partial sweep + center placement** (`CentralAngle`, `PolarCenter`) — SectorTree
  (~270°, right), both SectorTrees (half-disc) need sub-2π + off-center; port always
  fills a centered 2π disc. (Phase 0c/1 — this is the 2π hardcode.)
- **Angular auto-fit** is the structural weakness behind every wedge/spiral story (θ
  budget hand-set as `2π/Nleaves`; unbalanced trees overflow/wrap). (Phase 4.)
- **Value-driven radial thickness** truly expressed only in ViolinTree; TyreTree
  approximates `RootWidth=value` by leaf count. (Sizing, #475.)
- **Hidden/point node primitive** (RadialPhylogeneticTree fakes 0×0). (#618.)

## Open questions (for the co-design)

- **Should warp be explicit (emX/emY, generalized) or inferred-then-overridable?** The
  corpus is all-explicit; cartesian bars rely on inference. Coexist or unify?
- **Rect default under a coord** when dims are data vs px (rect.tsx:56 TODO).
- **Does the embed flag belong on the mark, or is it resolved at the coord boundary**
  by a recursive pass (rule 3/4)? The nest-growth case means embed status isn't purely
  local to the mark — it propagates up a containment chain.
- **Map onto #542 ink-vs-logical:** "embedded extent" ≈ logical extent the coord warps;
  "pixel size at center" ≈ ink. Is point/line/area just _which logical extents exist_?
  </content>
