# Choice, cost and wrap: one mechanism for pretty printing, waffles, line breaking and axis labels

Status: proposal, not implemented. Advances #486 (choice operator), #122 (wrap operator) and #1194 (tick density, label angle and placement as one mechanism).

## Summary

- Add one operator, `choose`, which lists alternatives in order of preference. You can use it as a node over child subtrees, and you can also use it as the value of an option, e.g. `angle: choose([0, 45, 90])` or `cols: choose({ from: 4, to: 24 })`.
- Add a `Cost` strategy family that says how `choose` ranks the alternatives. By default `choose` takes the first alternative that fits. With `cost: [Cost.overflow(), Cost.waste()]` it takes the alternative with the lowest cost, compared term by term.
- Add a `wrap` operator, which flows children along a direction and starts a new row when the row is full. A `Break` family picks the break rule: `Break.greedy`, `Break.optimal` (Knuth-Plass), `Break.balance`, `Break.group` (all breaks or none) and `Break.never`. Every `Break` strategy is a `choose` at each seam plus a cost, so `wrap` adds no new search machinery.

The "union of boxes" geometry that the pretty printer needs stays inside `wrap` and `choose` as an internal summary. Users see it only as the `parts` of a wrapped node's outline.

**Recommendation.** Approach B below: `choose` as one operator that works as a node and as an option value, ranked by preference order first and by an optional `Cost` list second, with `wrap` and its `Break` family as the first operator built on it. Today's `angle: "auto"` becomes sugar for a written-out `choose`.

```js
// Waffle: pick the column count whose square cells fill the box best.
chart(seafood)
  .flow(
    derive((d) => d.flatMap((d) => repeat(d, "count"))),
    wrap({ cols: choose({ from: 4, to: 24 }, { cost: Cost.waste() }) })
  )
  .mark(rect({ fill: "species" }));

// Paragraph: Knuth-Plass line breaking.
wrap(
  { w: 260, break: Break.optimal() },
  words.map((w) => text({ text: w }))
);

// Axis labels: the first angle whose labels do not overlap.
axes: {
  x: {
    label: {
      angle: choose([0, 45, 90]);
    }
  }
}

// Pretty printer: two layouts for an `if`, the printer picks one.
choose([
  wrap({ break: Break.never, spacing: "1ch" }, [kw("(if"), c, t, e, kw(")")]),
  stack({ dir: "y", align: "start" }, [
    wrap({ break: Break.never, spacing: "1ch" }, [kw("(if"), c]),
    offset({ x: "2ch" }, t),
    offset({ x: "2ch" }, e),
  ]),
]);
```

## Terms

- **Alternative.** One of the layouts a `choose` node can pick. An alternative is a subtree, or a value for an option.
- **Fit.** An alternative fits when its layout stays inside the room its parent gives it and passes the operator's own test, e.g. axis labels that do not overlap.
- **Cost.** A number, or a list of numbers compared in order, that ranks alternatives. Lower is better. A list compared in order is called lexicographic: the second number only matters when the first numbers are equal.
- **Seam.** The place between two neighboring children of a flow operator. `stack` and `spread` have fixed seams. A `wrap` seam is a choice between continuing on the current row and breaking to a new row.
- **Silhouette.** The summary of a child's shape that a parent uses when it joins children, e.g. a box, or a box plus the width of its last row. The term comes from `notes/design/silhouette-interface.md`, which defines it. We use "silhouette" and not "measure" because `Measure`, `measureText` and `ref.measure()` already mean other things in GoFish.
- **Pareto frontier.** The set of alternatives that no other alternative beats on every count. A layout engine keeps this set and drops the rest, so it does not have to try every combination.

## The examples

The proposal has to handle these six cases. Each one is a real story or a request in an open issue.

1. **Pretty printing** (#40, #486). Lay out code or an S-expression within a width limit. The alternatives are structurally different layouts, e.g. an `if` on one line or broken over three lines. Composition needs more than a box, because the next item continues on the last row of the previous one.
2. **Waffle chart** (#122, #739, #1128, #663). Today the gallery waffle hard-codes `spread({ by: chunk(5) })`. The column count should follow from the room, so the cells are square and fill the box.
3. **Knuth-Plass line breaking** (new). Break a paragraph into lines so the right edge is as even as possible, using a cost over the whole paragraph instead of filling each line greedily.
4. **Axis label orientation** (#961, #1017, #1151). Today `label: { angle: "auto" }` lays out the whole chart once per candidate angle (0, 45, 90, then hidden) and keeps the first one whose labels do not collide.
5. **Continuous label angle** (#1194). Plotly tries a list of angles. A continuous choice would allow "the smallest angle between 0 and 90 that clears".
6. **Tick count** (#1063, #1194). Today the axis always asks d3 for about 10 ticks, so labels overlap on a narrow chart. The choice is the largest count whose labels do not overlap, possibly together with the angle.

## How it works today

- `src/ast/choice/choose.ts` has the whole-chart first-fit loop: `chooseFirstFit(candidates, run, score, fits)` returns the first candidate that fits, otherwise the one with the lowest `Score` (a `number[]` compared in order). Its header says the loop should be replaced by a node-local choice with a frontier (#486, #630).
- `src/ast/axes/autoLabelAngle.ts` is the only client. It tries `[0, 45, 90, "hidden"]` per label row and lays out the whole chart again for each candidate.
- `.label()` with `Place.around` has its own first-fit chooser (`labels/placeStep.ts`) that gives each label its first free position.
- There is no `wrap` operator. The old `wrap` (an enclosure) was deleted in #396. `chunk(n)` and `table({ numCols })` give fixed rows.
- The layout protocol returns one box per axis. The silhouette note (`notes/design/silhouette-interface.md`) already defines the richer summary and says it stays inside the operator that declares it. Only the box leaves.

## Prior work

| System                                                                    | What the user writes                                         | What the system decides                                 | Cost                                                                                                                                                                   |
| ------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pretty expressive printer (Porncharoenwase, Pombrio, Torlak, OOPSLA 2023) | `text`, `nl`, `<>`, `nest`, `align`, `a <\|> b`, `cost n d`  | which branch of each `<\|>`                             | a user-supplied "cost factory": a totally ordered monoid with `text c len`, `newline i`, `combine`, `le`, `limit`. Default is (sum of squared overflow, newline count) |
| Bernardy, "A pretty but not greedy printer" (ICFP 2017)                   | `text`, `flush`, `<>`, `<\|>`                                | the layout with fewest lines that fits                  | the measure `(height, maxWidth, lastWidth)`, pruned to a Pareto frontier                                                                                               |
| Wadler, "A prettier printer"; Prettier                                    | `group`, `nest`, `line`, `conditionalGroup([...])`           | which groups are flattened                              | greedy: the first line must fit                                                                                                                                        |
| Knuth and Plass (1981); TeX; `tex-linebreak`                              | boxes, glue (width, stretch, shrink), penalties              | breakpoints                                             | sum of demerits from badness `100·\|r\|³`, dynamic programming over feasible breaks                                                                                    |
| CSS `text-wrap: pretty \| balance`; Typst `par(linebreaks: "optimized")`  | one keyword                                                  | breakpoints                                             | built in. Typst exposes weights: `text(costs: (runt: 100%, widow: 100%, ...))`                                                                                         |
| Observable Plot `waffleY`                                                 | `unit`, `multiple`, `gap`, `round`                           | `multiple` (cells per row)                              | none. A closed form: `multiple = floor(sqrt(bandwidth / scale))`, which makes cells square                                                                             |
| R `waffle`, pywaffle                                                      | `n_rows`, `rows` / `columns`                                 | the other dimension                                     | none                                                                                                                                                                   |
| Plotly                                                                    | `tickangle: "auto"`, `autotickangles: [0, 30, 90]`, `nticks` | the first angle that clears                             | first fit in list order                                                                                                                                                |
| Vega and Vega-Lite                                                        | `labelOverlap: "parity" \| "greedy"`, `labelAngle`           | which labels to hide                                    | a repair loop, the angle is never chosen                                                                                                                               |
| Talbot, Lin, Hanrahan (InfoVis 2010)                                      | data range, nice steps, target density, font size            | step, count, start, format, font size, orientation      | weighted sum `0.2·simplicity + 0.25·coverage + 0.5·density + 0.05·legibility`. Overlap is minus infinity                                                               |
| SwiftUI `ViewThatFits`                                                    | children in order of preference                              | the first child whose ideal size fits the proposed size | first fit                                                                                                                                                              |
| Draco                                                                     | ASP facts and soft constraints with weights                  | a whole chart spec                                      | weighted sum of soft constraint violations                                                                                                                             |
| SUPPLE (Gajos and Weld 2004)                                              | widget alternatives for each value                           | which widget                                            | branch and bound over a cost, under a screen size                                                                                                                      |
| Jacobs et al., adaptive grid layout (SIGGRAPH 2003)                       | page templates                                               | a template per page                                     | dynamic programming over a cost                                                                                                                                        |

Lessons for GoFish:

- Every system with real optimization has four parts. It has alternatives as a node, a summary of each layout that composes bottom up, a cost that is an ordered monoid, and a search that prunes dominated layouts. The pretty expressive printer states the laws the cost must follow, and the silhouette note already restates them for GoFish.
- First fit (`ViewThatFits`, Plotly, Prettier's `conditionalGroup`) is the case where the list order is the cost. It is cheap, and users can predict it. It covers label angle, tick count and most label placement.
- Plot's waffle rule is what a cost search returns when the answer has a closed form. GoFish can ship the general form and still compute the closed form as a fast path.
- Typst's `costs` and Talbot's weights are the precedent for exposing cost terms by name, with weights, instead of asking users to write a cost function.
- Draco and Penrose put the whole chart under one objective. That is the foil. GoFish keeps the choice local to one node so the user can see what is chosen and why.

Reference images are in `img/prior/`.

## Approaches

The design has three separate axes. The first axis is where the choice appears in the spec. The second is how alternatives are ranked. The third is how `wrap` names its break rule. We present the axes one at a time.

### Axis 1. Where the choice appears

#### Approach A. `choose` is a node over subtrees

`choose` takes a list of child subtrees, like `layer`. It is the pretty printer's `<|>`. To choose an option value, you write the subtree once per value.

```js
// waffle
choose([4, 8, 12, 16, 24].map(cols => wrap({ cols }, cells)), { cost: Cost.waste() })

// axis label angle: the axis is chrome, so the choice has to wrap the whole chart
choose([0, 45, 90].map(angle =>
  chart(data, { axes: { x: { label: { angle } } } }).flow(...).mark(...)))
```

```python
choose([wrap(cells, cols=c) for c in [4, 8, 12, 16, 24]], cost=Cost.waste())
```

- It is the smallest addition. The pretty printer maps onto it one to one.
- Axis options are hard to reach. The axis is built by the engine, so the user has to repeat the whole chart per alternative. That is today's whole-chart loop, moved into user code.
- A continuous choice, e.g. an angle between 0 and 90, cannot be written as a finite list of subtrees.

#### Approach B. `choose` is a node, and also an option value (recommended)

The same `choose` works in two places. As a node it takes subtrees. As an option value it takes values, and the option takes the chosen value. The value form is sugar. It means "instantiate this node once per value, then choose among those nodes", so it desugars to Approach A.

```js
// option value, discrete
axes: {
  x: {
    label: {
      angle: choose([0, 45, 90]);
    }
  }
}

// option value, a whole record per alternative (today's "auto" written out)
axes: {
  x: {
    label: choose([
      { angle: 0 },
      { angle: 45 },
      { angle: 90 },
      { hidden: true },
    ]);
  }
}

// option value, an integer range with a cost
wrap({ cols: choose({ from: 4, to: 24 }, { cost: Cost.waste() }) });

// option value, a continuous interval: the smallest angle that clears
axes: {
  x: {
    label: {
      angle: choose({ from: 0, to: 90 });
    }
  }
}

// node form, for structurally different layouts
choose([flatIf, brokenIf]);
```

```python
axes={"x": {"label": {"angle": choose([0, 45, 90])}}}
wrap(cols=choose(start=4, stop=24, cost=Cost.waste()))
choose([flat_if, broken_if])
```

- One word covers every case in the examples list.
- The axis case no longer repeats the chart. The axis is still built by the engine, but the engine builds one axis node with a choice inside, and only that axis is laid out again per alternative.
- A range or interval is a lazy list. For a first-fit choice over an interval the engine can bisect, because overlap falls as the angle grows. This is the "pick a basin, then solve inside it" idea from #486.
- `"auto"` stays as named sugar: `angle: "auto"` is the same as `label: choose([{ angle: 0 }, { angle: 45 }, { angle: 90 }, { hidden: true }])`. The docs show the expansion, so the user can copy it and change the list.
- The cost of this approach is a rule the user must learn. An option that accepts `choose(...)` has to say so in its type. We would start with a small set: `wrap.cols`, `label.angle`, `label` as a whole, `ticks.count`, and `axes.x` as a whole.

#### Approach C. No user-facing choice, only strategies

Each operator gets an `"auto"` value or a strategy, and the search stays inside the engine. This is CSS `text-wrap: pretty`, Plotly's `tickangle: "auto"` and Plot's waffle rule.

```js
wrap({ cols: "auto" })               // square cells that fill the room
wrap({ break: Break.optimal() })     // Knuth-Plass
axes: { x: { label: { angle: "auto" }, ticks: { count: "auto" } } }
```

- It is the simplest surface, and it is close to what GoFish ships today.
- The pretty printer cannot be written, because its alternatives are arbitrary user subtrees.
- Each `"auto"` is a hidden conditional. The user cannot change the candidate list or the order, which goes against the rule that a default should desugar to code the user could write.
- It is the runner-up, and it is also the first shipping step of Approach B. Every `"auto"` in this list is sugar for a `choose` that B makes writable.

#### Approach D. Free variables and an objective (foil)

The user names unknowns and one objective for the chart, in the style of Penrose and Draco.

```js
const cols = variable({ from: 4, to: 24, integer: true });
chart(data, { minimize: [overflow(), waste()] }).flow(wrap({ cols }));
```

- It can express everything, including choices that interact across the chart.
- The search is global, so the result is hard to predict and slow. The user cannot tell which variable moved a mark.
- A variable used in two places couples two parts of the tree, which breaks the rule that a choice stays inside one scale scope (#486).
- We list it to make the boundary clear. B can express the same examples without global variables.

### Axis 2. How alternatives are ranked

#### Ranking 1. Preference order with a fit test (default)

`choose` takes the first alternative that fits. If none fits, it takes the one that overflows least. This is `ViewThatFits`, Plotly and today's `chooseFirstFit`.

The fit test has two parts:

- The layout stays inside the room the parent gives. This connects to the proposal model in #1292, where a node with no own size uses the parent's proposal.
- The operator's own test passes, e.g. axis labels do not overlap, and a label does not cover an `avoiding` mark.

#### Ranking 2. A `Cost` list

`cost` replaces preference order with a list of named terms compared in order. Preference order is the last tie breaker.

```js
choose(alternatives, { cost: [Cost.overflow(), Cost.lines()] }); // the pretty printer default
wrap({ cols: choose({ from: 4, to: 24 }, { cost: Cost.waste() }) });
```

A first set of terms:

| Term                     | Meaning                                                                               | Used by                                  |
| ------------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------- |
| `Cost.overflow()`        | ink outside the room, squared and summed per row, as in the pretty expressive printer | pretty printing, wrap                    |
| `Cost.overlap()`         | total overlap area between labels or marks that should not touch                      | axis labels, tick count, label placement |
| `Cost.waste()`           | the fraction of the room left empty                                                   | waffle, treemap rows                     |
| `Cost.lines()`           | the number of rows                                                                    | pretty printing                          |
| `Cost.badness()`         | Knuth-Plass badness, `100·(slack/stretch)³` per row, last row free                    | `Break.optimal`                          |
| `Cost.weighted({ ... })` | a weighted sum of other terms, in the style of Talbot and Typst                       | tick choice in the Talbot style          |

A function is the escape hatch, e.g. `cost: layout => number`. It waits for #1101, which decides how a family accepts user functions and how they cross to Python.

The cost terms must follow the laws in the silhouette note: every join is monotone in the cost, and the cost is an ordered monoid. That is why `Cost.overflow` sums squared overflow and does not take a maximum. The pretty expressive paper shows that (max overflow, height) breaks monotonicity, so the engine could not prune with it.

#### Ranking 3. Penalties on alternatives

Knuth-Plass penalties and the pretty printer's `cost n d` attach a cost to one alternative. In GoFish this could be a method, e.g. `brokenIf.cost(2)`, or a per-alternative weight in `choose`. We do not propose it now. Preference order covers the cases above. It is listed as a decision.

### Axis 3. How `wrap` names its break rule

`wrap` folds its children with a soft seam. At each seam the layout either continues on the current row or breaks to a new one. This follows the silhouette note §7, which found that a wrap is the pretty printer's `fill` (one choice per seam), not `group` (one choice for all seams). `stack` and `spread` are the same fold with fixed seams.

```js
wrap({ dir: "x", w: 260, spacing: "0.5ch", break: Break.optimal() }, words);
wrap({ cols: 10 }, cells); // fixed columns, no choice at all
wrap({ break: Break.group }, items); // all on one row, or one item per row
wrap({ break: Break.never }, items); // one row; the next item starts on the last row of a multi-row child
```

| Strategy                        | Rule                              | Written as `choose` plus cost                     |
| ------------------------------- | --------------------------------- | ------------------------------------------------- |
| `Break.greedy`                  | continue while the next item fits | first fit at each seam, from the start            |
| `Break.optimal({ tolerance? })` | Knuth-Plass, lowest total badness | `choose` at each seam, `cost: Cost.badness()`     |
| `Break.balance`                 | rows of nearly equal length       | `choose` at each seam, minimize the largest slack |
| `Break.group`                   | all seams continue, or all break  | one `choose` over two layouts                     |
| `Break.never`                   | all seams continue                | no choice                                         |

The alternative spelling drops the family and puts the cost on `wrap` directly, e.g. `wrap({ cost: Cost.badness() })`. We prefer `Break`, because:

- Typst (`linebreaks: "optimized"`) and CSS (`text-wrap-style: pretty`) name the rule, not the cost.
- `Break.group` and `Break.never` are not costs.

`text` can then take a width, e.g. `text({ text: para, w: 260, break: Break.optimal() })`. It desugars to a `wrap` over one `text` per word, so a multi-line label is not a new mark.

## The examples under Approach B

### Waffle chart

![waffle candidates](img/waffle-candidates.png)

The prototype fits 73 cells into a 300 by 200 box. The cost is the fraction of the box left empty, `1 − n·s²/(W·H)`, where `s` is the largest square cell that fits. Twelve columns win, with 25 px cells and a cost of 0.24. Four columns cost 0.87 and 24 columns cost 0.81.

![today and chosen](img/waffle-today-vs-chosen.png)

Above is the gallery waffle today, with five columns of 8 px cells. In a 600 by 200 box it needs 28 rows and spills out of the top. Below, the same chart picks its column count by the same cost. All six lakes share eight columns of 11 px cells, and the tallest lake sets the row count.

Today:

```js
(spread({ by: chunk(5), spacing: 2, dir: "y", reverse: true }),
  spread({ spacing: 2, dir: "x" }));
```

Proposed:

```js
wrap({
  cols: choose({ from: 4, to: 24 }, { cost: Cost.waste() }),
  spacing: 2,
  start: "bottom",
});
```

`wrap` with an unsized cell divides the room into square cells. The cost picks the column count that wastes the least room. Plot's `floor(sqrt(bandwidth / scale))` is the closed form of the same rule, and the engine can use it when the cost is exactly `Cost.waste()` with uniform cells. The grouped waffle is `stack("species"), wrap()` and the "stacked" waffle is `wrap("species"), wrap()`, as in the spec square from the silhouette note.

### Knuth-Plass

![greedy and Knuth-Plass](img/knuth-plass.png)

The prototype sets a 61 word paragraph at 256 px. Greedy first fit has a total badness of 0.99 and a worst line of 0.78. Knuth-Plass has a total of 0.41 and a worst line of 0.19, with the same number of lines. Word widths come from the text mark's own measurement.

```js
wrap(
  { w: 260, spacing: "0.5ch", break: Break.optimal() },
  words.map((w) => text({ text: w }))
);
```

### Pretty printer

![pretty printer at three widths](img/pretty-printer.png)

The prototype prints `(define (fold f acc xs) (if (null? xs) acc (fold f (f acc (car xs)) (cdr xs))))` with three alternatives per list (flat, hang and indent) and the cost (sum of squared overflow, newlines). At 80 columns it fits on one line. At 40 it takes 6 lines, and the shape has a first row of 23 columns, a widest row of 34 and a last row of 29. At 24 it takes 8 lines. The blue boxes are the row boxes, so you can see that each layout's shape is a union of boxes. The prototype searches all 1555 layouts. A real implementation would keep only the Pareto frontier. When two layouts tie on cost, the prototype keeps the earlier alternative, which is why the 40 column layout hangs the `if` after `(define ` instead of indenting it.

```js
const row = (items) => wrap({ break: Break.never, spacing: "1ch" }, items);
const column = (items) => stack({ dir: "y", align: "start" }, items);
const open = text({ text: "(" }),
  close = text({ text: ")" });

const sexp = (e) =>
  typeof e === "string"
    ? text({ text: e, font: "mono" })
    : choose(
        [
          // flat: everything on the current row
          row([open, ...e.map(sexp), close]),
          // hang: the head, then the arguments in a column that starts after it
          row([open, sexp(e[0]), column(e.slice(1).map(sexp)), close]),
          // indent: the head alone, then the arguments indented by two columns
          row([
            column([
              row([open, sexp(e[0])]),
              offset({ x: "2ch" }, column(e.slice(1).map(sexp))),
            ]),
            close,
          ]),
        ],
        { cost: [Cost.overflow(), Cost.lines()] }
      );

sexp(program).render(container, { w: 40 * CH });
```

```python
def row(items):
    return wrap(items, break_=Break.never, spacing="1ch")

def column(items):
    return stack(items, dir="y", align="start")

def sexp(e):
    if isinstance(e, str):
        return text(text=e, font="mono")
    head, args = sexp(e[0]), [sexp(a) for a in e[1:]]
    return choose(
        [
            row([text(text="("), head, *args, text(text=")")]),
            row([text(text="("), head, column(args), text(text=")")]),
            row([column([row([text(text="("), head]), offset(column(args), x="2ch")]), text(text=")")]),
        ],
        cost=[Cost.overflow(), Cost.lines()],
    )
```

The mapping to the pretty expressive printer:

| Pretty expressive                   | GoFish                                                                |
| ----------------------------------- | --------------------------------------------------------------------- |
| `text s`                            | `text({ text: s })`                                                   |
| `a <> b` (continue on the last row) | `wrap({ break: Break.never }, [a, b])`                                |
| `a <$> b` (newline)                 | `stack({ dir: "y", align: "start" }, [a, b])`                         |
| `align d`                           | a `stack` starts its rows at the column where it begins               |
| `nest n d`                          | `offset({ x: n }, d)` inside a `stack`                                |
| `a <\|> b`                          | `choose([a, b])`                                                      |
| cost factory                        | `cost: [Cost.overflow(), Cost.lines()]`, and later a function (#1101) |
| page width                          | the room from `render(container, { w })`                              |

The layout of a wrapped S-expression is a union of row boxes: a first row, a block, and a last row that can end early. The next item continues on that last row. This is the silhouette `(h, w, ℓ)` from the silhouette note, and it is the "union of AABBs" geometry. It stays inside `wrap` and `choose`. Outside, the node has its box, and its outline has one part per row, so `enclose`, `.label()` and `ref` can follow the staircase shape.

One difference from the pretty expressive printer remains. Its `<>` is unaligned, so the next row of the right side starts at the indentation level and not at the column where the right side began. GoFish places children by box, so every multi-row child is aligned. Aligned concatenation covers the Lisp and JSON styles. The C-style `nest` with unaligned rows would need `offset` with a negative x or a new join, and we leave it out.

### Axis label angle

![label angle candidates](img/label-angle.png)

At 400 px the product names collide at 0 degrees. At 45 degrees they clear, so first fit stops there. 90 degrees also clears but takes more height. Today's `"auto"` (bottom right) picks 45 degrees too, by laying out the whole chart once per angle.

Today:

```js
axes: {
  x: {
    label: {
      angle: "auto";
    }
  }
}
```

Proposed, with `"auto"` kept as the short spelling:

```js
axes: {
  x: {
    label: choose([
      { angle: 0 },
      { angle: 45 },
      { angle: 90 },
      { hidden: true },
    ]);
  }
}
// or a continuous angle
axes: {
  x: {
    label: {
      angle: choose({ from: 0, to: 90 });
    }
  }
}
```

The axis is one node, so only its label row is laid out again per alternative. The engine no longer rebuilds the whole chart, which removes the rebuild hook in `runLayout` and the cost that keeps #1017 ("auto" as the default) from shipping.

### Tick count

![tick count candidates](img/tick-count.png)

A 200 px axis over 0 to 12,000, with ticks from d3's `ticks(0, 12000, count)`. Overlapping labels are drawn in orange. Asking for about 3 ticks gives 3 ticks with no overlap. About 5 gives 7 ticks with one overlapping pair, and about 10 gives 13 ticks with 12 overlapping pairs. The first-fit rule "the most ticks with no overlap" picks the first row.

```js
// the most ticks whose labels do not overlap
axes: {
  x: {
    ticks: {
      count: choose([10, 8, 6, 5, 4, 3, 2]);
    }
  }
}

// tick count and angle as one choice, which #1194 asks for
axes: {
  x: choose([
    { ticks: { count: 10 } },
    { ticks: { count: 5 } },
    { ticks: { count: 10 }, label: { angle: 45 } },
    { ticks: { count: 3 } },
  ]);
}

// Talbot style, with weights
axes: {
  x: {
    ticks: {
      count: choose(
        { from: 2, to: 12 },
        {
          cost: Cost.weighted({
            overlap: Infinity,
            density: 0.5,
            simplicity: 0.2,
          }),
        }
      );
    }
  }
}
```

The third form needs `density` and `simplicity` terms that only make sense for ticks. We would add them only if a user asks, and we list it as a decision.

## How it composes

- **Layout engine.** A `choose` node lays out each alternative in the room its parent gives, and keeps the chosen one. When the parent asks for its size before giving room, `choose` reports the smallest size among its alternatives. That is the `min` in the claim algebra (#630), and monotone piecewise-linear claims stay invertible under `min`.
- **Scale scopes.** A choice must not change a scale domain (#486). Alternatives that would give different domains are an error. The search is bounded to the scope that holds the `choose`.
- **Silhouettes.** `wrap` and `choose` keep a Pareto frontier of `(silhouette, cost)` pairs inside their scope and commit one at the boundary. Outside, only the box leaves. This is the silhouette note's Law 2, so no existing operator changes.
- **Coordinate transforms.** The choice is made in the layout space, before the coordinate transform. In polar coordinates `Cost.overflow` measures the box, not the arc. That is fine for labels and wraps, which do not bend.
- **Animation.** A choice can change between frames. A tween between two alternatives moves shared marks by key. A choice that flips back and forth while a value changes is a known risk. We would add hysteresis only if it shows up.
- **Data types.** Nothing new. Ranges in `choose({ from, to })` are plain numbers.
- **Python.** `choose` is a builtin construct with a list of children or values. Costs are `Cost.overflow()` as strategies in the `STRATEGIES` table. A cost function crosses through the callback runner once #1101 decides its spelling.

## Overlap with existing operators

| Existing                                         | Relation                                                                                               | Regime                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `angle: "auto"`, `chooseFirstFit`                | `"auto"` becomes named sugar for a written-out `choose`                                                | exact rewrite, delete the special loop                                        |
| `.label({ position: Place.around })`             | each label's first free position is a `choose` over `Place.along` candidates, with an overlap fit test | exact rewrite. The placer becomes a client of `choose`                        |
| `spread({ by: chunk(n) })`, `table({ numCols })` | a fixed-columns `wrap` is the same as nested spreads over chunks                                       | exact rewrite. We define `wrap({ cols })` by it. `chunk` stays for other uses |
| `stack`, `spread`                                | the same fold, with fixed seams instead of soft ones                                                   | shared mechanism, degenerate overlap                                          |
| `Overlap` family (`scatter`)                     | deterministic, no alternatives                                                                         | none                                                                          |
| region `union` (shape compositing)               | the name is taken, so we do not call the row geometry a "union" in the API                             | none, naming only                                                             |

## Trade-offs

- **Easy.** Every example above is a few lines. The default (first fit) is predictable. Costs are named terms that a user can read.
- **Awkward.** Options have to declare that they accept `choose`. A cost over several terms is lexicographic, and users may expect a weighted sum. Unaligned concatenation is left out.
- **New terms.** `choose`, `wrap`, `Cost`, `Break`. "Silhouette" stays internal.
- **Extension cost.** New cost terms are new entries in the `Cost` family. User cost functions wait for #1101. A new `Break` strategy is a cost plus a search, so it adds no engine code beyond its cost.

## Recommendation

Approach B with first fit by default, a `Cost` list when given, and `wrap` with `Break`.

- **It desugars into the core.** The value form desugars to the node form. `Break` strategies desugar to `choose` at each seam plus a cost. `"auto"` desugars to a written-out `choose`. The core grows by one operator and one internal summary (`principles.md`, "Why keep the core small").
- **One concept is one operator.** Label angle, tick count, label placement, waffle columns, line breaks and pretty printing all use `choose`. Two existing first-fit loops (`chooseFirstFit` and the label placer) become clients of it (`api-design.md`, "One concept is one operator").
- **Names match precedent.** `wrap` is the CSS and Flutter word. `choose` is a plain verb. It avoids the pretty printer's `group`, which already means something else in GoFish, and `alt`, which is jargon. `Break` and `Cost` follow the strategy family pattern (`Tile`, `Curve`).
- **Closed kinds plus a function.** `Cost` and `Break` are closed families like the others, and the function escape hatch is #1101's question, not a new one.
- **Same shape in JS and Python.** `choose([...], cost=[Cost.overflow()])` in both.

The runner-up is Approach C. It is a subset of B, with the same engine and no user-facing `choose`. If you want to ship waffles and Knuth-Plass before deciding on the value form, ship `wrap({ cols: "auto" })` and `Break` first. Each `"auto"` is then a named `choose` that B makes writable later. We would switch to C for good only if the value form turns out to be confusing in the type of every option.

## Shipping order

1. `wrap` with fixed `cols` and `Break.greedy`. No choice machinery, works on today's engine (#122 comment, 07-12).
2. `choose` with first fit as a node and as an option value. Port `angle: "auto"` and the label placer to it, and delete `chooseFirstFit`'s whole-chart loop.
3. `Cost` with a frontier inside `wrap` and `choose`. `Break.optimal`, `cols: choose(...)` with `Cost.waste()`, and pretty printing. This step needs the cross-axis claim `h(w)` for a wrap whose width comes from the room (silhouette note §6).

## Decisions for Josh

1. Is the operator called `choose`? Other options are `choice`, `alt`, `oneOf` and `firstOf`.
2. Should `choose` also be an option value (B), or only a node (A)?
3. Is first fit in list order the default, with `cost` as the override? The other option is to always minimize a default cost.
4. Is `cost` a lexicographic list of `Cost` terms, with `Cost.weighted` for sums?
5. Is the range spelled `choose({ from: 4, to: 24 })`, with an integer step when both ends are integers? Python would use `choose(start=4, stop=24)`.
6. Does `wrap` take a `Break` family, or a `cost` directly?
7. Does `text` take `w` and `break` and desugar to a `wrap` over words?
8. Does `"auto"` stay as named sugar, with the docs showing its expansion?
9. Do we want penalties on alternatives now (`node.cost(2)`), or later?
10. Do tick-specific cost terms (`density`, `simplicity`) belong in `Cost`, or should tick count stay first fit only?

## Syntax to review

```js
choose([a, b, c]);
choose([a, b], { cost: [Cost.overflow(), Cost.lines()] });
label: {
  angle: choose([0, 45, 90]);
}
label: choose([{ angle: 0 }, { angle: 45 }, { angle: 90 }, { hidden: true }]);
label: {
  angle: choose({ from: 0, to: 90 });
}
ticks: {
  count: choose([10, 8, 6, 5, 4, 3, 2]);
}
wrap({ cols: 10 });
wrap({ cols: choose({ from: 4, to: 24 }, { cost: Cost.waste() }) });
wrap({ w: 260, break: Break.optimal() });
wrap({ break: Break.never });
text({ text: para, w: 260, break: Break.optimal() });
```

## Related issues

- #486 Choice operator and cost-based selection that generalizes the pretty printer. The parent issue for this proposal.
- #122 Wrap operator for faceting, waffles and text. The 07-12 comment says wrap is `fill`, not `group`.
- #1194 Tick density, label angle and label placement as one composable mechanism.
- #1063 Ticks that account for their labels, in the style of Talbot et al.
- #630 Add `min` to the claim algebra, which is how a choice reports its size.
- #961 `labelAngle: "auto"`, the first choice client (merged).
- #1017 Make `"auto"` the default once it is cheap.
- #1151 Per-chart label angles.
- #40 Document pretty printing.
- #739 Grid and waffle reshape primitive.
- #1128 `chunk` with a size per group.
- #663 Atom unit grids with a unit size derived from the fit.
- #1153 Calendar heatmap with months in a wrapped grid.
- #290 `.stack()` as a mark method. The silhouette note says wrap dissolves it for waffles.
- #1292 A node with no own size uses its parent's proposal, in the style of SwiftUI.
- #1101 How a strategy family accepts a user function.
- #485 Relational core plus solver tactics for the cases a frontier cannot handle.
- #806 Draft design note on choice-based layout.
- #396 Removal of the old enclosure `wrap`, so the name is free.

## Sources

- Porncharoenwase, Pombrio, Torlak. A Pretty Expressive Printer. OOPSLA 2023. https://arxiv.org/abs/2310.01530, https://docs.racket-lang.org/pretty-expressive/
- Bernardy. A Pretty But Not Greedy Printer. ICFP 2017. https://jyp.github.io/pdf/Prettiest.pdf
- Wadler. A prettier printer. 2003.
- Knuth, Plass. Breaking Paragraphs into Lines. Software: Practice and Experience, 1981. https://github.com/robertknight/tex-linebreak
- Observable Plot waffle mark, `src/marks/waffle.js`. https://github.com/observablehq/plot
- Plotly `autotickangles`, `src/plots/cartesian/layout_attributes.js`. https://github.com/plotly/plotly.js
- Vega overlap transform, `packages/vega-view-transforms/src/Overlap.js`. https://github.com/vega/vega
- Talbot, Lin, Hanrahan. An Extension of Wilkinson's Algorithm for Positioning Tick Labels on Axes. InfoVis 2010. http://vis.stanford.edu/files/2010-TickLabels-InfoVis.pdf
- SwiftUI `ViewThatFits`. https://developer.apple.com/documentation/swiftui/viewthatfits
- WebKit, `text-wrap: pretty`. https://webkit.org/blog/16547/better-typography-with-text-wrap-pretty/
- Typst `par` and `text(costs:)`. https://typst.app/docs/reference/model/par/
- Draco 2. https://github.com/cmudig/draco2
- Jiang et al. ORC Layout. CHI 2019. https://arxiv.org/abs/1912.07827
- Gajos, Weld. SUPPLE. IUI 2004.
- Jacobs et al. Adaptive Grid-Based Document Layout. SIGGRAPH 2003.
- `notes/design/silhouette-interface.md` and `notes/design/modular-layout-algorithms.md` in this repo.
