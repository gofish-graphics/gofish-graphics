# Default grouping for relational marks in a flow

Status: approved design for issue #752, including the `along` option (single field key, `dir` kept, `by` removed from relational marks). This note refines the rule sketched in the issue comments and checks it against every relational-mark example in the repo.

## The problem

A relational mark (`line`, `ribbon`) fused into a flow receives every anchor in the chart as one flat bag of refs. Today the mark connects the whole bag as one path unless the user restates the grouping with `by`. The flow one line up already declares that grouping, so the restatement is redundant at best. At worst the user cannot name the grouping with a single field at all. The barley slope chart needs one line per combination of `site` and `variety`, and today that takes a hand-written key function that reaches into render-node internals.

Three observed failures, all from the same gap:

- The ridgeline story must write `by: "month"` on the ribbon even though `spread({ by: month })` sits one line above it.
- The barley slope chart draws each variety as one zigzag across all six site panels, because `by: "variety"` groups over the whole chart and the enclosing spreads are invisible to the connector.
- A field-valued `fill` without `by` leaks the field name into CSS as a literal color, because `resolveGroupFill` only runs on the `by`-split branch of `createRelationalMark`.

## The rule

A fused relational mark needs two decisions: which axis the path travels along, and how the bag splits into separate paths.

### Travel axis

Resolve in this order, first match wins:

1. An explicit `dir` on the mark names the travel axis directly.
2. A data-driven `h` or `w` on the mark, or on the anchor tier it fuses over, names the value axis. `h` puts the value in y, so the path travels x. `w` puts the value in x, so the path travels y. If both `h` and `w` are data-driven, skip to step 3.
3. Look at the innermost flow tier that positions anchors. A `scatter` that sets both axes is itself the path tier, and the path follows flow order through it. A `scatter` that sets one axis is setting a value coordinate, the same role `h` and `w` play, so the path travels the other axis. A `spread` or `stack` lays its groups out along its `dir`, an arrangement rather than a value, so the path travels that same axis.

### Path tier and split

The path tier is the innermost flow tier that positions anchors along the travel axis. If no tier positions along the travel axis, the innermost positioning tier is the path tier. Then:

- The path tier's `by`, if it has one, orders the path. It never splits.
- Every other flow tier with a `by` splits the mark. The default split key is the combination of all of their fields, one connector per combination.

The one-sentence version: one tier lays the path, and every other grouping splits it.

The connector's internal direction should also be set to the travel axis. Today `line` and `ribbon` pass `dir ?? "x"` to `Connect` unconditionally, so the ridgeline only works because its path happens to run along x.

### Overrides

- The explicit override is `along`, described in its own section below. It names the path tier directly and replaces `by` on relational marks. `dir` stays as the axis-level control. An earlier draft of this note kept `by` as the override and added `by: null` for the no-split case. The `along` section supersedes both.
- Charts over an explicit refs bag (`chart(selectAll(...))`) and the pairwise `line({ from, to })` form are untouched. The rule only applies where the mark fuses over the current chart's own flow, in `.mark()` position or in `.layer()` over the previous tier's marks.

## Where this diverges from the proposal in the issue

The issue comment proposed the same path-tier idea but a different split clause and a different fallback. Two examples in the repo break that version, so this note changes both parts.

1. The proposed split clause was "every grouping across the travel direction, plus every grouping above the path tier." The layered area story (`Area.stories.tsx` `Layered`) has `spread({ by: "x", dir: "x" })` then `group({ by: "c" })`. The `group` tier has no direction and sits below the path tier, so the proposed clause never splits it, and the chart draws one path through all series. The clause in this note, every tier except the path tier splits, handles it because it does not need to classify tiers by direction at all. The two clauses agree everywhere else, since no along-axis grouping can sit below the path tier by construction.
2. The proposed fallback for a bare `line()` with no clear direction was "every grouping splits." The barley slope chart is exactly this case, and that fallback shatters it: `spread(site, x)`, `spread(year, x)`, `scatter({ by: variety, y: yield })`, then `line()`. Splitting by everything, including `year`, leaves one point per group and no lines. Step 3 of the travel-axis rule resolves it instead. The innermost positioning tier is the scatter, it positions only y, so the path travels x, the path tier is the year spread, and the split is `site` by `variety`. That is the intended chart.

## Checked against the corpus

Every distinct flow shape found in stories, docs, and Python parity examples, plus the two cases from the issue. "Split" is what the rule computes with no `by` on the mark.

| Example                            | Flow                                                                                      | Travel              | Path tier    | Default split            | Intended?                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------- | ------------------- | ------------ | ------------------------ | ------------------------------------------- |
| Ridgeline                          | `spread(month, y)` then `scatter(x)`, ribbon with `h`                                     | x (step 2)          | scatter      | month                    | yes, drops `by: "month"`                    |
| Stacked area, streamgraph          | `spread(lake, x)` then `stack(species, y)`, ribbon                                        | x                   | spread(lake) | species                  | yes, drops `by: "species"`                  |
| Layered area                       | `spread(x, x)` then `group(c)`, ribbon                                                    | x (step 3 fallback) | spread(x)    | c                        | yes, drops `by: "c"`                        |
| Single area                        | `spread(lake, x)`, ribbon with `h`                                                        | x                   | spread(lake) | none                     | yes, stays one path                         |
| Binned histogram ribbon            | `spread(bin(age), x)`, ribbon with `h` and literal `w`                                    | x                   | spread       | none                     | yes, stays one path                         |
| Connected scatterplot              | `scatter(by: year, x, y)`, line                                                           | flow order (step 3) | scatter      | none                     | yes, stays one thread                       |
| Line chart                         | `scatter(by: lake, x, y)`, line                                                           | flow order          | scatter      | none                     | yes, stays one path                         |
| Barley slope (issue)               | `spread(site, x)`, `spread(year, x)`, `scatter(by: variety, y)`, line                     | x (step 3)          | spread(year) | site and variety         | yes, replaces the hand-written key          |
| Barley area (`LayeredBarsAndArea`) | `spread(variety, x)`, `spread(year, x)`, `stack(site, y)`, ribbon                         | x                   | spread(year) | variety and site         | yes, replaces the double `group` idiom      |
| Facet grid (issue comment)         | `spread(region, x)`, `spread(quarter, y)`, `spread(year, x)`, `stack(species, y)`, ribbon | x                   | spread(year) | region, quarter, species | yes, nothing crosses a facet                |
| Polar ribbon                       | `scatter(lake, x)` then `stack(species, y)`, ribbon                                       | x                   | scatter      | species                  | yes, matches the nested idiom it uses today |
| Benchmarks lines                   | nested `chart().flow(group(family)).mark(line())` over refs                               | n/a                 | n/a          | unchanged                | yes, refs bags are out of scope             |
| Node-link                          | `line({ from, to })` over an edge table                                                   | n/a                 | n/a          | unchanged                | yes, pairwise form is out of scope          |

The seven load-bearing "no `by` and one connected path is correct" examples (single area, both line charts, connected scatterplot, binned histogram, and the two docs `selectAll` examples) all keep their behavior. In each one the only grouped tier is the path tier itself, so nothing splits.

Ordering needs no extra work. The anchor bag arrives in depth-first flow order, and `splitEntries` preserves bag order within each group, so both the contiguous case (ridgeline) and the transverse case (streamgraph, where the species split regroups refs across the outer spread) see their points in path order.

## Precedent

ggplot2 defaults the group of `geom_line` to the interaction of every discrete aesthetic, which is the same "everything discrete splits" idea, and its known failure (`aes(group = 1)` whenever x is a factor) is the case where the along-axis variable is wrongly included. GoFish flows record direction on positioning tiers, so the path tier is excluded automatically and that failure cannot appear. Vega-Lite splits line and area marks on the discrete `color` and `detail` channels and never on the x channel that orders the path. Observable Plot's `z` channel plays the same role as `detail`.

All three of those precedents spell the override as the complement: the user names the split (`group`, `detail`, `z`), never the path. That is the spelling the default rule makes redundant. None of them offer the positive spelling, naming the dimension the path consumes, because none of them reify the nesting the way a flow does. The positive spelling does have precedent outside visualization: NumPy reductions take `axis=`, xarray reductions take `dim=`, and einsum names the contracted index. A relational mark is the same shape of operation, a reduction over the flow's partition product, which is what the next section builds on.

## The `along` option

The rule above has a useful decomposition. Given the flow's groupings, once one dimension is chosen as the path, the split is forced: everything else must split, the same way a quotient is determined by what is quotiented out. The only free choice a relational mark ever makes is which dimension the path runs along. So the honest option surface names that one choice, not its complement.

The proposal: relational marks drop `by` and gain a single option, `along`, whose value is one field name.

- `along: "year"` names a flow tier by its `by` field. That tier becomes the path tier, the path threads its groups in order, and every other grouping splits. Naming a field that is not any tier's key is a loud error.
- Omitted, the default rule infers the path tier: an explicit value channel first, then the flow shape.
- `dir` stays as it is, the axis-level override (step 1 of the inference). An earlier draft folded it into `along` as `along: "x"`, but an axis name is not a field name, and overloading the two invites collisions with a dataset whose column is literally named "x". The two options answer different questions. `dir` says which axis the path travels, and `along` says which tier lays the path.
- An earlier draft also had an array form, `along: ["lake", "species"]`, consuming several dimensions, mainly so `by: null` (one path through everything) would stay expressible. Dropped: no example in the corpus wants more than one path dimension, and the one-path-through-a-grouped-flow case has no real chart behind it either. If it ever appears, the refs idiom (`chart(selectAll(...))` with no grouping) already spells it.

Why `by` can go entirely rather than staying as a second override: with the default in place, every `by` on a relational mark in the repo is a restatement of a flow grouping, and the complement spelling is the one that scales with flow depth (the barley slope needed the product of every enclosing grouping, by hand). The remaining genuine use, splitting by a field that appears in no flow tier, already has a canonical structural spelling, `chart(selectAll(...)).flow(group({ by })).mark(...)`, and the corpus shows every exotic case using exactly that idiom. One mark option that names one dimension is a smaller surface than two options where one must be computed from the other.

This also changes the character of the inference. Today the inference must be clever because the explicit fallback is expensive. With `along` costing one word, the inference can stay exactly as designed for the cases with real evidence, and the genuinely ambiguous corner (a bare `line()` over a flow that positions nothing) can fail loudly asking for `along` instead of guessing.

Respelled examples, explicit forms only (the defaults need nothing):

- Barley slope: `line({ along: "year" })` instead of the hand-built composite key.
- Connected scatterplot, stated explicitly: `line({ along: "year" })`, the same word whether the consumed tier is a spread or a scatter.
- Transposed streamgraph, one band per lake threading species: `ribbon({ along: "species" })` instead of `by: "lake"`.
- A y-traveling ribbon keeps `dir`: `ribbon({ w: "count", dir: "y" })`.

## Enclose

Issue #717 is turning `enclose` into a genuine relation over refs, contain this set and avoid that set. Once enclose can fuse into a flow the way line and ribbon do, the rule applies verbatim with one degeneracy: enclose consumes its dimension as a set rather than a sequence, so the path-order half of the rule is vacuous and only the split half acts. `spread(lake, x)` then `stack(species, y)` with a fused enclose gives one outline per species, each containing that species' rects across every lake, exactly where ribbon gives one band per species.

The word is the one part that does not carry over. "Line along year" reads because a path has a direction of travel. "Enclose along year" does not, because a set has none. Two observations before picking a replacement word:

- Enclose rarely needs the option at all. An unordered mark only feels its consumed dimension through the complement, the split, and the split is usually better said structurally. `group(cluster)` then `scatter(x, y)` with a fused enclose gives one hull per cluster with no option written, by the same rule that gives one line per lake in the small-multiples case.
- If a word is ever needed, "over" reads better for sets than "along" ("enclose over year" is one outline spanning the years). That would be a mark-appropriate synonym for the same slot, not a second concept.

The recommendation is to defer the word until fused-enclose examples exist, since #717 is not fully implemented and there are no specs to check a spelling against. The `avoiding` list from #717 is a second, separate relational slot (exclusion) and is out of scope here.

## The paint fix

Independent of the default split, a field-valued `fill` (or other paint) on a connector with no split should not leak the field name into CSS. The unsplit branch of `createRelationalMark` should run `resolveGroupFill` over the whole bag, treating it as one group. When the bag is homogeneous in the field, the paint resolves. When it is not, fail loudly. This matches the homogeneity-collapse rule already used for operator labels. With the new default in place, most field-valued paints will land on the split branch anyway, where each group is homogeneous by construction.

## Implementation notes

- The computation lives in `ChartBuilder`, at the fusion rewrite in `.mark()` and at the `.layer()` sugar path over previous-tier marks. `this.operators` is in hand at that point, and each operator carries `__serialize.opts` verbatim, so `by`, `dir`, and scatter's `x`/`y` channels are all readable without re-executing anything.
- Explicit and inferred stay in separate channels. The factory captures the user's opts immutably, and the fusable tag carries a second mutable cell (`inferred`) that the builder fills in. The mark closure resolves the two in one place when it is applied to its bag, explicit winning over inferred. The inferred values never touch `__serialize.opts`, so the default cannot serialize or masquerade as user intent. One consequence is that the split-versus-no-split dispatch must happen inside the closure at application time. Today `createRelationalMark` picks the branch when the factory is called, which is before the builder has seen the flow.
- The composite split key stays internal. The builder synthesizes a key function over the non-path fields rather than extending `SplitBy` to arrays, so nothing new serializes. The Python round trip rebuilds charts through the same `ChartBuilder.flow().mark()` chain in `fromJSON.ts`, so the default is recomputed on the JS side and both languages agree for free.
- One trap: a function-form `SplitBy` receives the raw bag element, a `GoFishRef`, not a datum. The synthesized key function must project fields through `ref.datum` the way the string form already does, via `projectValues`.
- With `along` adopted, `by` leaves the relational mark options, `dir` stays, and `along` crosses the Python bridge as a plain string option, with nothing nullable and nothing inferred ever serializing.

## Out of scope

- The function-form `SplitBy` receiving a render node rather than a datum has its own issue and is not changed here.
- Enclose adopts the rule when #717 lands. Its option word, if it ever needs one, is deferred until fused-enclose examples exist. The `avoiding` exclusion list is a separate slot.
- Migrating existing stories is implementation-phase work. The ridgeline, streamgraph, area, and ribbon stories drop their restated `by`, and the barley area story can drop the double `group` nested idiom.
