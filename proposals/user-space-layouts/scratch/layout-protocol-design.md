# One layout protocol for GoFish

This note proposes one public way to define a layout operator, and shows that the built-in `spread`, `stack` and `tile` can be written with it. The prototype is in the throwaway copy at `/Users/jmp/.claude/jobs/a4ed3dcc/tmp/layout-protocol` (detached at `fac08ebd7`). The patch is `layout-protocol.patch` next to this file, and the pictures and numbers are in `examples.md`.

## The answer in brief

Partly yes. The protocol is one call, `defineLayout`, and a definition gives one of two bodies:

- **`relate`.** It returns constraints among the children. The operator is a `layer`, and the constraints join the layer's one solve. `spread` and `stack` are now written this way.
- **`arrange`.** It returns one room per child once its own room is known, in pixels. `tile` is now written this way, and so is a user squarified treemap that matches the built-in exactly.

Measured child lengths (a child's size as a value in the scale, read when the claim walk asks for it) let a `relate` body use child sizes without pixels. That is the second stage of the maintainer's frame.

The two bodies are not one mechanism yet. `arrange` is a declared shortcut. The right fix is a room constraint at the bottom, and the section "The wall at stage 3" says what that needs. Everything else in this note follows from the frame below.

## Evidence

- A full `pnpm capture-diff fac08ebd7` in the copy found all 751 existing stories identical in normalized DOM and warnings. It also found the 8 new stories, and no story failed to render. capture-diff's fixed ports were moved for that run only, because another process on port 3001 broke an earlier run, and they were moved back afterwards.
- The full `pnpm --filter gofish-graphics test` passed with exit code 0.
- The line counts are as follows. `tile.tsx` went from 466 to 273 lines, because its engine code moved to `layoutProtocol.ts`. `spread.tsx` went from 371 to 413 lines, because its body is now a definition with its own option type and doc comment. `layoutProtocol.ts` is 391 lines.
- An earlier full capture-diff caught a bug of mine, which is described under walls, item 3, and is fixed.

## The frame: constraints at the bottom, expansions on top

The maintainer's frame is that constraints among the children of a layer are the lowest level, that `Constraint.position` is the escape hatch, and that a layout operator is an expansion that ends in constraints. I checked the frame against the passes the engine runs. It holds, with one refinement and one wall.

### The stages, named against the passes

The pipeline in `gofish.tsx` runs these passes in order:

1. `resolveAliases`, which runs each node's `_elaborateInAxisScope` hook, top down. Axis names such as `theta` get their meaning here, because a coordinate space is known by then.
2. The type walk (`resolveUnderlyingSpace`).
3. `resolveEmbedding`, which decides which children are embedded in a coordinate space and where a rigid child is pinned (`relationsOfChildren`, main commit `ab3e18444`).
4. The claim walk (`resolveExtent`), which gives each node a size request as a piecewise linear function of the scale σ.
5. The scope solve, which finds σ for each scope.
6. The layout pass (`layout`), where each layer runs its placement solve in pixels.
7. `lower`, which draws.

The three stages of the frame fall on these passes as follows.

| Stage | What it knows                              | When it runs                                                | What it returns                                 | Built-in examples                                                  |
| ----- | ------------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| 1     | The children as handles, the axis names    | Pass 1                                                      | Constraints                                     | `spread`, `stack`, `scatter`, `partition`, `table`                 |
| 2     | Also the children's sizes, as lengths in σ | Pass 1 states the constraints, and pass 4 reads the lengths | Constraints whose numbers are measured lengths  | `Spacing.pitch` by the widest child, a box tidy tree, a dendrogram |
| 3     | Also its own room, in pixels               | Pass 6                                                      | Rooms, which are position constraints in pixels | `tile` with every tiling, Voronoi, force                           |

The refinement is about stage 2. Stage 2 is not a separate pass. A stage 2 expansion decides the structure of its constraints in pass 1, and only the numbers in them wait. A number is a measured length, and the claim walk reads it in pass 4 through `gapOf`, the one place that reads spacing as a function of σ. Lengths compose with `add`, `sub`, `times` and `maxLength`. A decision that compares lengths needs pixels, and a length has pixels only when the scale does not change it (`.pixels` throws otherwise). So a stage 2 expansion may make decisions on literal sizes, e.g., text widths, but not on data sizes. A decision on data sizes belongs to `choose`, which the section on `choose` covers.

### One worked example per stage

**Stage 1, `spread({ dir: "x", spacing: 8, alignment: "start" }, [a, b, c])`.** The body is in `spread.tsx`, and the expansion is these two constraints:

```js
Constraint.align({ y: "start" }, [a, b, c]);
Constraint.distribute({ dir: "x", spacing: 8 }, [a, b, c]);
```

**Stage 2, a row pitched by its widest child.** Each child starts the same distance after the one before it. The distance is the widest child's width plus a gap. The story is `PitchedBarsFit`, with bars of data widths 3, 1, 4, 1, 5, 9, 2, 6 in a 400 px room.

```js
const pitched = defineLayout({
  name: "pitched",
  options: ["gap"],
  relate: (children, { gap = 8 }, { measure }) => {
    const pitch = maxLength(...children.map((c) => measure(c).w)).add(gap);
    return {
      relations: [
        Constraint.align({ y: "start" }, children),
        Constraint.distribute(
          { dir: "x", spacing: Spacing.pitch(pitch, { at: "start" }) },
          children
        ),
      ],
      orientation: 0,
    };
  },
});
```

Its expansion is the two constraints in the body, where `pitch` is the length `max(3σ, σ, 4σ, σ, 5σ, 9σ, 2σ, 6σ) + 6`, which is `9σ + 6`. The claim of the row is `7(9σ + 6) + 6σ`, and the solver finds σ = 5.1884 for 400 px. The rendered pitch is 52.6957 px, which is 9 × 5.1884 + 6, and the last bar ends at 368.8696 + 31.1304 = 400. One pipeline run did this, with no pixels in the definition.

**Stage 3, a squarified treemap.** The story is `UserSquarify`. Its body runs the squarify rule on its room and returns one rectangle per child:

```js
const squarified = defineLayout({
  name: "squarified",
  options: ["weights"],
  arrange: ({ w, h }, _children, { weights }) => ({
    rooms: squarify(weights, [w, h]).map(ring),
  }),
});
```

Written as constraints, its expansion for the room 360 × 300 is one position per child:

```js
Constraint.position({ x: [0, 183.4656], y: [0, 151.4514] }, [china]);
Constraint.position({ x: [0, 183.4656], y: [151.4514, 300] }, [india]);
// ... 18 more
```

The prototype does not emit these constraints. It hands each child its room directly. The next section says why.

### The wall at stage 3

A layer reads its constraints three times before its room exists:

- `planSharing` reads them to decide which children share a scale.
- `resolveEmbedding` reads them to decide pins (`relationsOfChildren`).
- `buildPlan` in the claim walk reads them to derive the layer's size request.

A stage 3 expansion cannot exist before the room, so its constraints cannot be in the layer when those three readers run. Emitting them late and running a second solve is possible, but then the second solve cannot share a scale with anything outside, cannot fit, and a ref from outside sees nothing at claim time. That is a nested solve, and it is what the first prototype did.

The fix that keeps one mechanism is a constraint whose kind is known early and whose numbers are bound late. A room constraint, `Constraint.room(ringOf, [child])`, would tell the three early readers what they need to know:

- the child is in a scope of its own (sharing),
- it is not pinned (embedding),
- and it asks for nothing outward (claim).

The placement solve would call `ringOf(room)` in pass 6. The `arrange` node does exactly this today, but as a node kind of its own rather than as a constraint in a layer. That is the shortcut. With a room constraint, `defineLayout` would have one body that returns constraints, and some of the constraints would be room constraints. I did not build it because it changes how `layer` reads `PositionRegion`, which is shared with `partition` and `scatter`, and that needs the maintainer's decision on what a position interval means (today it sets the size, and a room would center the child in it).

### The reconciliation questions

These answer the coordinator's first message, read through the frame.

- **(a) Does layer's solve fit behind the interface, or is layer the substrate?** Layer is the substrate. 24 lines outside `layer.tsx` (in `solver/plan.ts`, `_node.ts`, `gofish.tsx` and `layoutWarnings.ts`) read a layer's `claimWalk`, its plan, to place refs at claim time. A `relate` definition is a layer, so it gets all of this. An `arrange` node is not a layer, so `planPlacement` sees it as opaque.
- **(b) Can late relations join the enclosing solve?** Relations stated in pass 1 join it, even when their numbers are lengths read in pass 4. Relations that need the room cannot join it, and a nested solve costs fitting, scale sharing and early refs, as above.
- **(c) Which built-ins are neither?** The table in the next section lists them. Coordinate spaces, connections (`connect`, `line`, `ribbon`, `arrow`), `enclose`, `cut`, the porter-duff region operators and the chrome (axes, legends, titles) are not layouts of children at all. They draw from other nodes' geometry after placement. Marks are leaves with a size request and no children.
- **(d) How does this relate to "decisions, relations and a solver per scope"?** Stage 1 and stage 2 bodies are the relations. `choose` is the decisions. The layer's solve is the solver per scope. Stage 3 is a decision made inside the solve, after σ, which is the only place a decision on pixels can go.

And these answer the coordinator's second message.

- **(a) Does tile reduce to `position` with nest-each rooms?** Not today. `Constraint.position` with a pixel interval pins both edges, so it sets the child's size, and a tiling wants the child laid out in the room and centered there. It would need the room constraint above.
- **(b) What does `measure` return?** A length per axis, `{ w, h }`, whose value in σ is read when the claim walk asks for it.
- **(c) Which built-ins are not macros?** The ones listed under (c) above.
- **(d) How does the frame read packing and force layouts?** Circle packing is a stage 2 procedure. Its positions are a fixed multiple of σ when there is no padding, so its expansion is `position` constraints with lengths. Padding breaks that, which is why d3 packs twice. Force layout needs its room, so it is stage 3, or it runs on data in `derive` and lands with `scatter`.
- **(e) How do embedding and rigid pins read emitted constraints?** `relationsOfChildren` walks `node.constraints` by kind. A `distribute` pins the start and end of a box chain and fixes the extent, a pitch pins its `at` point, an `align` pins its anchor, and a `position` with a point pins its anchor. A `relate` body's constraints are installed in pass 1, before embedding, so they are read like hand-written ones. The spread port renders identically under every coordinate space for this reason. An `arrange` node has no constraints, so its children are unpinned and land at their middles.

## What each built-in implements, pass by pass

The hooks are on `GoFishNode`. "Layer" means the node is built as a `layer` with constraints and gets the layer's hooks.

| Construct                                                      | Built as                                 | Pass 1 hook                               | Sharing          | Claim                 | Layout                             | Frame stage             |
| -------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------- | ---------------- | --------------------- | ---------------------------------- | ----------------------- |
| `spread`, `stack`                                              | layer (now `defineLayout` with `relate`) | installs `align` and `distribute`         | from constraints | layer plan            | layer solve                        | 1                       |
| `scatter`                                                      | layer                                    | installs `position` by data               | from constraints | layer plan            | layer solve                        | 1                       |
| `partition`, `group`                                           | layer                                    | installs positions or a chain             | from constraints | layer plan            | layer solve                        | 1                       |
| `table`                                                        | layer                                    | installs a grid of aligns and distributes | from constraints | layer plan            | layer solve                        | 1                       |
| `layer`                                                        | the substrate                            | user relations (`.relate`)                | from constraints | `buildPlan`           | `solveLayerScales`, then placement | bottom                  |
| `tile`                                                         | `defineLayout` with `arrange`            | own `dims`                                | nest each        | none, or its own size | rooms from the tiling              | 3                       |
| `pack`                                                         | own node                                 | none                                      | share all        | none                  | front chain in pixels              | 2 procedure (wall #967) |
| `position`, `offset`                                           | own node                                 | own `dims`                                | pass through     | child's               | translate                          | escape hatch            |
| `coord`                                                        | own node                                 | gives axis names their meaning            | scope            | in its space          | warps children                     | not a layout            |
| `porterDuff` region ops                                        | own node                                 | none                                      | pass through     | union of children     | none                               | not a layout            |
| `enclose`, `connect`, `arrow`, `line`, `ribbon`                | relational marks                         | none                                      | none             | none                  | from targets after placement       | not a layout            |
| `cut`                                                          | own node                                 | none                                      | pass through     | child's               | clip                               | not a layout            |
| axes, legends, titles                                          | elaborated layers                        | chrome hooks                              | from constraints | layer plan            | layer solve                        | 1, by elaboration       |
| `rect`, `ellipse`, `text`, `image`, `polygon`, `petal`, `band` | marks                                    | own `dims`                                | none             | literal or data size  | own box                            | leaf                    |

The line between a mark and a layout is that a mark has no children to place. A mark has a size request and draws itself in its box. A layout has children and states how they relate. A mark could be written as a `relate` definition with no children, but that adds nothing, so marks stay outside the protocol. Text is the one mark whose size request comes from measurement (font metrics), and that is a pixel request, which `measure` reads as a constant length.

## The protocol as types

The types are in `src/ast/layoutProtocol.ts` in the copy. These are the public ones.

```ts
/** Define a layout operator. The result is a combinator over a child
 *  list, as `spread(opts, children)` is. */
function defineLayout<O>(
  def: RelateDefinition<O> | ArrangeDefinition<O>
): (opts: O & BoxOptions, children?: unknown) => PromiseWithRender<GoFishNode>;

type Common<O> = {
  name: string; // for messages
  options: readonly (keyof O & string)[]; // its own keys; the rest are box options
  check?: (opts: O, children: readonly GoFishAST[]) => void;
};

/** Stages 1 and 2: the arrangement does not depend on the room. */
type RelateDefinition<O> = Common<O> & {
  relate: (children: ConstraintRef[], opts: O, axes: Axes) => Relations;
};
type Axes = {
  axis(name: AxisName | Direction, what: string): 0 | 1;
  measure(child: ConstraintRef): { w: LengthValue; h: LengthValue };
};
type Relations = { relations: ConstraintSpec[]; orientation?: 0 | 1 };

/** Stage 3 (the declared shortcut): the arrangement depends on the room. */
type ArrangeDefinition<O> = Common<O> & {
  request?: (
    children: Child[],
    opts: O
  ) => [number | undefined, number | undefined];
  arrange: (room: Room, children: Child[], opts: O) => Arrangement;
};
type Child = {
  readonly index: number;
  request(axis: 0 | 1): number | undefined; // pixels, or undefined if it fills
  fillsRoom(axis: 0 | 1): boolean;
  readonly by?: string;
};
type Room = { w: number; h: number; shape?: Ring };
type Arrangement = { rooms: Ring[] };
```

These are the reasons for each part.

- **The two halves.** SwiftUI splits a layout into a size request and a placement. In GoFish the solver derives the size request from the relations, so a `relate` body is both halves at once. Only a stage 3 body has a separate request, because its placement is not known until the room is.
- **What the body returns.** It returns data, either constraints or rooms, and never nodes. So the body cannot create or drop children, and `arrangeNode` checks that there is one room per child.
- **Children as handles.** A `relate` body gets `ConstraintRef` handles, the same handles `Constraint.*` takes everywhere else. An `arrange` body gets `Child` records with read-only queries.
- **Scopes and scales.** A `relate` body is in its parent's scope, so its children share the scale with their cousins. Each child of an `arrange` body is a scope of its own (`nestEach`).
- **Embedding and coordinate spaces.** A `relate` body names axes through `axes.axis`, so `dir: "theta"` works under `Coord.polar()`. Its constraints reach embedding as described in (e) above. An `arrange` body works in its own flat frame, and the coordinate space warps the result. The polar treemap stories show that this matches the built-in.
- **Purity and errors.** A body runs once per node (`relate`) or once per layout (`arrange`). It must not keep state or create marks. A thrown error names the operator by `def.name`.
- **Async.** The protocol has one `await`, around `INTERNAL_relate`, because drawing clauses in `.relate` are marks that are built asynchronously today (#1334). Relations alone need nothing asynchronous. When #1334 lands, that `await` goes away and no definition changes.
- **Python.** A `relate` body returns constraint specs, which already cross the bridge as IR. A Python `defineLayout` would send its `relate` as a callback through the callback runner, as `derive` lambdas do, or as a list of constraint specs when the body does not read sizes. A measured length has no wire form yet (`toJSON` throws), so stage 2 from Python needs a `Length` IR node for "the width of child i". An `arrange` body would cross as a callback that takes a room and returns rings. I did not build any of this.

## How this differs from SwiftUI

SwiftUI's custom layout is the `Layout` protocol (iOS 16, [Apple's documentation](https://developer.apple.com/documentation/swiftui/layout), and the WWDC22 session [Compose custom layouts with SwiftUI](https://developer.apple.com/videos/play/wwdc2022/10056/)). A layout implements two methods:

- [`sizeThatFits(proposal:subviews:cache:)`](<https://developer.apple.com/documentation/swiftui/layout/sizethatfits(proposal:subviews:cache:)>) returns its size for a proposed size.
- `placeSubviews(in:proposal:subviews:cache:)` places each subview by calling `place(at:anchor:proposal:)` on its proxy.

A subview proxy ([`LayoutSubview`](https://developer.apple.com/documentation/swiftui/layoutsubview)) answers `sizeThatFits` for any proposal. Apple's documentation says the parent "might call this method more than once during a layout pass with different proposed sizes to test the flexibility of the container", with the zero, infinity and unspecified proposals. Layout values (`LayoutValueKey`) pass data from a child to its parent's layout. `layoutProperties.stackOrientation` declares a stack's axis. `ViewThatFits` and `AnyLayout` choose between layouts.

| Point                | SwiftUI                                                          | GoFish protocol                                                                         |
| -------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Size request         | A function you write, called with several proposals              | Derived by the solver from the relations (stages 1 and 2), or a pixel request (stage 3) |
| Child size query     | `subview.sizeThatFits(proposal)`, in points, any number of times | `measure(child)`, a length in σ, read once                                              |
| Placement            | Imperative `place(at:)` calls                                    | Constraints returned as data                                                            |
| Scale                | None. Every size is in points                                    | Shared σ per scope. A child's data size is a function of σ                              |
| Choosing a layout    | `ViewThatFits`, `AnyLayout`                                      | `choose` (proposed, `choice/choose.ts` has the whole-chart form)                        |
| Stack axis           | `layoutProperties.stackOrientation`                              | `orientation`                                                                           |
| Child data to parent | `LayoutValueKey`                                                 | Child's own options, and `by`                                                           |

GoFish differs for one reason. A SwiftUI size is a number, so asking a child its size for a proposal is cheap and exact. A GoFish size depends on σ, which is solved for the whole scope at once, so a body cannot ask a child for pixels before the solve. Returning relations lets the solver see the whole scope, and lengths let a body use sizes without pixels.

### On the SwiftUI architects' remark

I searched for a public statement by a SwiftUI engineer or architect wishing for a more declarative custom layout. I found none. The search found Apple's documentation, the WWDC22 session and community write-ups, and none of them say this. So this note does not attribute that view to anyone.

### A small layout both ways

A row or a column, whichever fits. In SwiftUI this is a `ViewThatFits` over two stack layouts, or a custom `Layout` that measures every subview at its ideal size:

```swift
struct RowOrColumn: Layout {
  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
    let rowWidth = sizes.map(\.width).reduce(0, +)
    if rowWidth <= (proposal.width ?? .infinity) {
      return CGSize(width: rowWidth, height: sizes.map(\.height).max() ?? 0)
    }
    return CGSize(width: sizes.map(\.width).max() ?? 0, height: sizes.map(\.height).reduce(0, +))
  }
  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
    let asRow = sizes.map(\.width).reduce(0, +) <= bounds.width
    var p = bounds.origin
    for (s, size) in zip(subviews, sizes) {
      s.place(at: p, proposal: .unspecified)
      if asRow { p.x += size.width } else { p.y += size.height }
    }
  }
}
```

In GoFish, with the expansion and `choose` (proposed syntax, not built), it is one choice between two stage 1 expansions:

```js
choose([
  spread({ dir: "x", spacing: 0 }, children),
  spread({ dir: "y", spacing: 0 }, children),
]);
```

`choose` takes the first alternative whose claim fits the room at the solved σ. The engine already has each alternative's claim from the claim walk, so the test is a comparison of two functions of σ, done in the scope solve. Nothing is measured twice and nothing is placed by hand. The SwiftUI version must state the test, the size and the placement separately and keep them consistent. The GoFish version states only the alternatives.

## `choose` as the declarative form of decisions

Each studied layout makes some decisions. The table classifies the decisions that depend on the room or on sizes:

- (a) none,
- (b) a small fixed set, which `choose` covers,
- (c) a large family with a cost,
- (d) procedural.

| Layout                          | Class                             | Reason                                                                                                     |
| ------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| spread, stack                   | (a)                               | The order and gaps are fixed, and σ is solved                                                              |
| pie, sunburst, icicle           | (a)                               | Stacks and partitions under a coordinate space                                                             |
| treemap slice, dice, slice-dice | (a)                               | A stack of `fr` shares along one axis, alternating by depth                                                |
| treemap binary                  | (b) per split                     | Each split chooses x or y by the room's aspect, a guard on the room                                        |
| treemap squarify, strip         | (c)                               | Where each row ends and which way it runs, scored by aspect ratio                                          |
| tidy tree                       | (a)                               | Separations are maxima of contour lengths, which compose with `maxLength` when `measure` returns contours  |
| dendrogram                      | (a)                               | Leaves are a spread and each parent sits at the middle of its children                                     |
| sankey columns                  | (a) for layout, (d) for order     | Columns come from data. The order heuristic is iterative but reads only data, so it runs in `derive`       |
| layered graph ranks             | (a) for layout, (d) for crossings | Ranks and crossing reduction read only the graph. Coordinates are a linear program, which is constraints   |
| wrap, flow                      | (c), or (b) per seam              | Each seam chooses to break or not. First fit per seam is the greedy flow, and a cost gives the optimal one |
| row or column                   | (b)                               | Two alternatives                                                                                           |
| circle pack                     | (d), room independent             | A front chain over radii. It is a multiple of σ without padding, so it expands to positions in lengths     |
| Voronoi                         | (d), stage 3                      | Cells come from sites and the room's shape                                                                 |
| force                           | (d), stage 3                      | Iterates in a fixed box                                                                                    |

For (c), the engine must do this:

- It must list the alternatives for each seam or row, not for the whole layout, so the count grows with the number of seams and not exponentially.
- It must compare costs that depend on σ. A cost such as aspect ratio is a ratio of two lengths, and it is the same at every σ only when both lengths scale with σ. A treemap's cells do, so squarify can decide after the solve with no loss. A flow row's widths do not when the room is fixed and the content is text, so its choice must be made in the scope solve, where each alternative's claim is a `Pwl` and the test is `min` over them (#630).
- It must decide before placement and after the claim walk, which is the scope solve. That replaces `chooseFirstFit`, which runs the whole pipeline once per candidate.

### Squarify both ways

Today, as a stage 3 expansion that reads its room (built, in the story):

```js
const squarified = defineLayout({
  name: "squarified",
  options: ["weights"],
  arrange: ({ w, h }, _children, { weights }) => ({
    rooms: squarify(weights, [w, h]).map(ring),
  }),
});
```

As `choose` with a cost (proposed, not built). Each row is a `stack` of `fr` shares, and each seam chooses whether the next item joins the current row:

```js
// A sketch: rows(items) is a stack of rows along the long side,
// and each row is a stack of fr shares along the short side.
const squarifiedByChoice = (items) =>
  choose.seams(items, {
    row: (run) =>
      stack(
        { dir: "short", spacing: 0 },
        run.map((d) => cell(d).w(fr(d.w)))
      ),
    rest: (row, rest) => stack({ dir: "long", spacing: 0 }, [row, rest]),
    cost: Cost.worstAspect(), // the d3 rule, read at the solved room
    ranking: "first fit per seam", // greedy: add while the cost does not get worse
  });
```

The `choose` form needs three things the engine does not have:

- `dir: "short"`, an axis named by the room's aspect,
- `Cost.worstAspect`, a cost read from placed cells,
- and per seam choice.

All three read the room, so the decision still happens after σ. The `choose` form gains nothing for squarify over the stage 3 expansion, because a treemap fills its room and asks for nothing. The `choose` form gains a lot for flow and row or column, because there the choice changes the size request.

## What `measure` is for

The coordinator's question separates three jobs.

1. **Reading a child's request.** This is a query, and the protocol keeps it as `measure(child)` in `relate` and `child.request(axis)` in `arrange`. It is needed by every stage 2 body.
2. **Declaring your own request as a closed form.** This would be a shortcut that lets the solver skip deriving the request from the relations. It carries an obligation, which is that the closed form must equal what the relations give. The obligation can be checked, because both are `Pwl` values and `Pwl` equality is exact, so a debug build could derive both and compare. The cost numbers below show that the shortcut buys little today.
3. **Declaring a request that cannot be derived.** This is `request` in `arrange`. It exists because a stage 3 body has no relations to derive from. If `choose` covers the room dependent cases (flow, row or column), the only layouts left that need it are procedural ones with a size, e.g., circle pack. Circle pack's positions are multiples of σ, so they can be stated as positions in lengths and derived. So job 3 does not survive once there is a room constraint and `choose`.

### The cost of unfolding today

I measured the claim walk with a scratch script, `src/tests/unfoldCost.scratch.ts` in the copy, run with `npx tsx`. It counts calls to `claimOnce` and reads the engine's own perf labels. Each chart ran 5 times, and the table averages the last 3. The "claim" column is the engine's `claims` label, which includes the scope solve.

| Chart                         | Nodes | Claims | Claim ms | Placement solve ms | Whole layout ms |
| ----------------------------- | ----- | ------ | -------- | ------------------ | --------------- |
| stacked bars, 10 x 5          | 62    | 62     | 5.9      | 1.6                | 13.8            |
| stacked bars, 40 x 25         | 1042  | 1042   | 39.0     | 11.3               | 107.7           |
| stacked bars, 100 x 50        | 5102  | 5102   | 184.2    | 54.7               | 516.9           |
| nested spreads, 4 deep, fan 4 | 342   | 342    | 9.5      | 5.0                | 24.1            |
| nested spreads, 6 deep, fan 3 | 1094  | 1094   | 48.7     | 25.2               | 113.5           |
| tile, 1000 cells              | 1002  | 1002   | 2.9      | 8.5                | 37.1            |

Every node is claimed exactly once, because claims are memoized. So unfolding is linear in the number of nodes, about 0.04 ms per node, and it is 36 to 43 percent of the layout for spreads and stacks. A closed form request for an operator would not remove its children's claims, because placement reads them anyway. It would save only the operator's own plan building, which is a part of that 0.04 ms. A tile's claim is cheap because each child is a scope of its own and claims nothing outward.

### Recommendation

Keep one function, the body (`relate`), and one query, `measure`. Do not add a function that declares the operator's own request. Add a checked hint later only if a profile shows the claim walk is the bottleneck.

The name `measure` collides with GoFish's word for a unit of measure (`Measure`, axis measures), with `measureText`, and with the old `ref.measure()`. The memory note on silhouettes already rejected it for this reason. I recommend `size(child)`, which returns `{ w, h }` and reads as what it is. `request` is a second choice, and it matches the `arrange` half. `sizeThatFits` is SwiftUI's name for the operator's own request, not for a query, so it would mislead.

## Names

The call is `defineLayout`. #692 plans `defineMark` and `defineOperator`, which pair a gofish-ir descriptor with an implementation. A layout is one kind of operator, so the choice is between these:

- **`defineOperator` with a `relate` body.** It fits #692, and one registration path covers layouts and other operators. It also gives a user layout a descriptor, so it can cross to Python. This is my recommendation.
- **`defineLayout`.** It says what the body does, but it adds a second definition call beside #692's.

The api-design rules (#1279) say a capital letter is a namespace and a lowercase name is a function, so the call is lowercase in either case. The body names `relate` and `arrange` match `.relate()` on a layer and the "arrangement" trait in `createOperator`.

## Walls

These are the places where the design did not fit, in order of how much they change.

1. **Stage 3 cannot be constraints today.** A layer reads its constraints before the room exists. The fix is a room constraint whose kind is known early and whose ring is a function of the room. `arrange` is the declared shortcut until then.
2. **Rooms see child requests only in pixels.** Each child of an `arrange` node is a scope of its own, so a child with a data size claims nothing outward. A stage 3 body that wants sizes in σ cannot have them. This is #967's wall for `pack`, and it is the same wall.
3. **A measured length has no wire form.** Its `toJSON` throws, and the IR `Length` type has no way to say "the width of child i". `spacingOf` in `distribute.ts` checks a strategy as wire data, so the prototype checks a measured amount as 0 pixels. That is a declared shortcut, marked in the code, and the fix is an IR `Length` member for a measured length. The read function is stored as a hidden property of `LengthValue` for the same reason: as an own field it made every percent and `fr` fail the IR check, which the first full capture-diff caught in 8 stories.
4. **A flow row needs `h(w)`.** Its height depends on the width it is given, and a claim is one function of σ per axis. `request` in `arrange` returns pixels per axis, so a flow row inside a layout that fits to it cannot be written. This is the same wall the `choose` proposal found for solved width wrap.
5. **Two type checks by name.** `requireLayer` lets `.relate` run only on a layer or box, and `type === "coord"` appears in four generic passes. #1279 accepts both as domain special cases.
6. **Dispatch on the definition's shape.** `defineLayout` picks `relateNode` or `arrangeNode` by whether the definition has `relate`. This is a second path. It goes away with the room constraint.

## Looking ahead

**One sequential tiling with settings (bullet 4).** With a room constraint, every tiling is a stage 3 body that returns rooms. The built-in tilings would be presets over one user space function, e.g., `Tiling.squarify` as `squarified` with a ratio. Slice, dice and slice-dice are stage 1 (stacks of `fr` shares), so they could leave the tile family and be written as stacks. What remains to design is whether a preset is a strategy object, as today, or a call to a defined layout.

**Custom family members (bullet 5, #1101).** A custom `Tiling` member is an `arrange` body. #1101 asks what a family function receives and returns. For tilings the protocol answers it: it receives the room, its shape and the weights, and it returns one ring per child. What remains is how a function member crosses to Python, which is the callback runner question #1101 already names.

**The size request half in lengths (bullet 6).** Stage 2 is this. A `relate` body states its request through relations whose numbers are lengths, and the solver derives the request. What remains is a vector claim for contours (tidy tree), `h(w)` for flow, and the IR form of a measured length.
