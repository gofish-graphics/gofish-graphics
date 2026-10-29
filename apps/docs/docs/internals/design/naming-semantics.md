---
title: "Naming Semantics"
section: Speculative Notes
order: 68
status: speculative
---

# Naming semantics

> **Status: design exploration (2026-10-28).** Nothing here is implemented.
> This note maps the way GoFish names work onto programming language theory,
> turns three `.relate()` bugs into precise test cases, and compares three
> candidate semantics. It tracks
> [#1236](https://github.com/gofish-graphics/gofish-graphics/issues/1236), and
> it uses [#1235](https://github.com/gofish-graphics/gofish-graphics/issues/1235)
> as one of its test cases. Line numbers refer to `main` at `9e8dc8a91`. Every
> syntax below is a sketch.

The current rules are documented in
[Name Resolution & Scoping](/internals/core/names-and-scoping) (how the lookup
works) and in the user pages [Names and Scope](/js/concepts/names-and-scope)
and [Refs and Selection](/js/concepts/refs-and-selection). This note does not
repeat their explanations. It restates the rules in a form that can be checked
against theory, and then asks which theory GoFish should follow.

The note uses a few terms of art. Each one is defined here once.

- **Binder.** The place in a program that introduces a name, e.g., the `x` in
  `let x = 1`.
- **Reference.** A use of a name that should mean what some binder introduced.
- **Scope.** The region of a program in which a binder is visible.
- **Shadowing.** A nearer binder for a name hides a farther binder for the
  same name.
- **Capture.** A reference that was written to mean one binder ends up meaning
  another binder with the same spelling. Capture is almost always a bug.
- **Hygiene.** A guarantee that capture cannot happen, usually for code that a
  macro or a library builds on the user's behalf.
- **Introduction form.** A construct that builds a value, e.g., a constructor
  or a `let` that binds a name and then uses it.
- **Elimination form.** A construct that takes a value apart, e.g., pattern
  matching or field access.

## 1. The current rules

GoFish has three name mechanisms. They share the `createMark` boundary, but
otherwise they are separate tables with separate rules.

### 1.1 Declaring a name

`.name(x)` stores `x` in the node's `_name` field (`_node.ts:2641`). It does
nothing else at that moment. `x` is either a string or a token.

A chart mark that is named also gets a `__layerRegistration` tag. After the
chart's tree is built, `collectLayerRegistrations` (`chartBuilder.ts:146`)
walks the tree and pushes each tagged node into the chart's **layer
registry**, a plain object from name to a list of nodes and their data.

### 1.2 Lookup by string inside a layer

`resolveScopedName` (`_ref.tsx:504`) finds a string name from a use site. It
is used by two things:

- a constraint operand of a `.relate()` callback
  (`resolveConstraintOperands`, `constraints/index.ts:226`), and
- a string `ref("x")` inside a `.relate()` drawing clause
  (`resolveLocalString`, `_ref.tsx:242`).

The rule is this:

1. Start at the use site's level. For a clause ref, the level is the relating
   layer, found by `relatingLayerOf` (`_ref.tsx:401`), which walks up to the
   nearest ancestor flagged `_relateClause` and returns its parent.
2. Search the level's subtree breadth first (`closestAtLevel`,
   `_ref.tsx:468`). Stop at the first depth that has a match.
3. One match at that depth is the answer. Two or more is an error
   ("ambiguous").
4. No match means move up to the parent level and repeat. Never go above the
   nearest `createMark` component (`scopeRootOf`, `_ref.tsx:450`), and never
   descend into a nested component (`visibleNodes`, `_ref.tsx:431`).
5. No match up to the boundary is an error ("no node named").

A clause ref has one more check. Its match must be inside the relating layer
(`_ref.tsx:256`), or it is an error.

`createMark` makes a node a boundary through `sealComponent`
(`withGoFish.ts:468`), which sets `_isComponent`. Layers are not boundaries.

### 1.3 The layer registry: `selectAll` and chart-data `ref`

`selectAll("points")` (`chart.ts:437`) and `ref("points")` used as chart data
do not use `resolveScopedName`. They read the layer registry at build time
(`resolveRefData`, `resolveRefData.ts:21`):

- If the registry has no entry for the name, it is an error
  (`resolveRefData.ts:33`).
- `selectAll` returns one ref per registered node. A ref made this way points
  at its node directly (`ref({ __ref: node })`), not by name.
- The singular `ref` returns the same list but requires it to hold exactly one
  node.

Each `layer([...])` combinator makes a fresh, empty registry for its children
(`chart.ts:1242`), and it resolves its children in order, so a later child sees
an earlier child's names. The registry is flat. There is no widening and no
shadowing inside it.

### 1.4 Tokens

`createName("box")` (`createName.ts:11`) returns a fresh token
`{ __tag, __id: Symbol(tag) }`. Two calls with the same tag give two different
tokens. When names are resolved, a token-named node is stored in the render
session's token table (`_node.ts:1099`). `ref(token)` reads that table, so a
token reaches across any boundary. The token's tag is also entered in the
nearest scope root's `_scopeMap`, which is what lets a ref path such as
`ref([token, "value"])` step into a component.

### 1.5 Singular and plural

A name declared inside a split, e.g., a mark under `spread({ by: "k" })`, is
declared once in the source but held by one node per group. The two lookups
treat that differently:

- The layer registry keeps every copy. `selectAll` returns all of them, and the
  singular `ref` refuses.
- The tree lookup sees the copies as siblings at the same depth. From inside
  one copy, the copy's own node is nearest and wins. From outside, all copies
  tie, which is the "ambiguous" error.

The token table keeps one node per token. A token applied to a mark that a
split repeats is stored once per copy, and each store overwrites the last
(`tokenContext.set`, `_node.ts:1099`). I found this by reading the code. I did
not test what a `ref` to such a token then does.

### 1.6 `.relate()` callbacks

`layer.relate(fn)` (`_node.ts:2688`) does this:

1. It drops every child already flagged `_relateClause`
   (`_node.ts:2697`), so a second call replaces the first call's clauses.
2. It builds the environment with `relateEnv` (`constraints/index.ts:172`).
   The environment is a plain object with one `RelateOperand` per distinct
   name visible inside the layer. A `RelateOperand` holds only the name string
   (`relate.ts:28`).
3. It calls `fn(env)`. The callback reads names with JS destructuring, e.g.,
   `({ bar, tick }) => [...]`.
4. It sorts the result into constraints and drawing clauses
   (`resolveRelateClauses`, `relate.ts:128`). Each drawing clause is resolved
   with an empty layer registry (`relate.ts:163`), flagged `_relateClause`, and
   appended to the layer's children.

A `RelateOperand` used as a child of a drawing clause becomes a string ref
with the same name (`markResult.ts:109`). That string ref is resolved later,
from whatever layer `relatingLayerOf` finds for it.

## 2. Naming in GoFish is mostly elimination

A `let` is an introduction form. You pick a name, bind it to a value, and then
build something that uses the name:

```js
const box = rect({ w: 40, h: 40 });
const label = text({ text: "x" });
layer([box, label]);
```

GoFish naming mostly runs the other way. You build the whole structure first
and label some of its parts as you go. Later, something takes the structure
apart again by those labels:

```js
layer([
  rect({ w: 40, h: 40 }).name("box"),
  text({ text: "x" }).name("label"),
]).relate(({ box, label }) => [
  Constraint.align({ x: "middle" }, [box, label]),
]);
```

Here `.name` is not a binder in the `let` sense. It is a label placed inside a
value. The binder is the reader. `.relate`'s destructuring pattern
`({ box, label })`, `ref("box")`, and `selectAll("bars")` each match a pattern
against the built structure and bind the parts they find. That is the shape of
pattern matching, and `.relate` uses JS destructuring for it directly.

The everyday version of this is a regex with named capture groups. The pattern
`/(?<year>\d{4})-(?<month>\d{2})/` labels two parts of a string, and
`match.groups.year` reads one part back out after the match. Regexes also show
where plurality gets hard. In JavaScript, a named group inside a repetition
keeps only its last match. Running
`/(?:(?<d>\d),)+/.exec("1,2,3,").groups.d` gives `"3"`. .NET keeps every match
in `Group.Captures`. GoFish's `selectAll` is the .NET choice, and the tree
lookup's "ambiguous" error is a third choice, which is to refuse.

The duality also explains why some names must exist before use and others
need not. A `let` reference can only see binders above it. An elimination form
reads a finished value, so it can see any label inside that value, wherever the
label sits. That is why a `.relate()` operand can name a node nested deep
inside another child.

## 3. Mapping to theory

### 3.1 Regular tree patterns: XDuce and CDuce

XDuce added regular expression patterns over trees to a typed functional
language (Hosoya and Pierce, POPL 2001; journal version JFP 13(6), 2003). A
pattern can bind a variable to a part of a tree, and the pattern may contain
repetition. CDuce (Benzaken, Castagna and Frisch, ICFP 2003) supports capture
variables under repetition and adds a sequence capture form `x::R`, which binds
`x` to the sequence of items matched by `R`.

**What fits.** A name declared inside a split is a capture under repetition.
`selectAll` is sequence capture, because its variable holds the list of every
match in document order. The singular `ref` is a pattern that requires exactly one
match. A chart pipeline that reads `selectAll("points")` is a pattern match
over the tree that the earlier tier built.

**What does not fit.** XDuce and CDuce patterns are matched against a value
once, and the pattern's shape follows the tree's shape. GoFish names are found
by search, at any depth, without spelling the path between. GoFish also has no
types for its patterns, so a missing name is found when the program runs, not
before.

### 3.2 Optics: lens and traversal

An optic is a value that focuses on a part of a larger structure, so that you
can read or update that part. Pickering, Gibbons and Wu ("Profunctor Optics:
Modular Data Accessors", The Art, Science, and Engineering of Programming 1(2), 2017) give one representation for the common kinds. Two kinds matter here:

- A **lens** focuses on exactly one part. Its laws say that reading what you
  just wrote gives it back, and writing what you just read changes nothing.
- A **traversal** focuses on zero or more parts, in order.

**What fits.** `ref` is a lens and `selectAll` is a traversal. The
"exactly one" check on `ref` is what makes it a lens. Optics compose, and a lens
followed by a traversal is a traversal. A ref path such as
`ref([token, "value"])` is a composition of lenses, and `selectAll` inside a
component reached by a token would compose the same way.

**What does not fit.** GoFish optics read positions, and they never write
values back. Constraints do write positions, but they write through the
solver, not through the optic. So only the read half of the laws applies. A
GoFish ref is also found by a search that depends on where the ref is used, and
an optic in the papers does not depend on where it is used.

### 3.3 Scope graphs

Néron, Tolmach, Visser and Wachsmuth ("A Theory of Name Resolution", ESOP 2015) describe name resolution with a graph. Nodes are scopes, declarations
and references. Edges link a reference to its scope, a declaration to its
scope, and a scope to its parent scope (labeled `P`). A **resolution path**
runs from a reference to a declaration. The paper orders paths by how specific
they are, so that a declaration reached through fewer parent steps is more
specific and shadows one reached through more. A reference resolves to the
declaration on the most specific path. Two most specific paths to different
declarations mean the reference is ambiguous, and no path means it is
unresolved.

**What fits.** The GoFish rule in section 1.2 is a path order with two labels:

- `P` moves from a level up to its parent, as in the paper.
- `C` moves from a node down to one of its children. The paper's scope graphs
  have no edge like this. It is closest to the paper's import edges, which make
  the contents of another scope visible.

A path is `P^k C^d D`, which reads as "go up `k` levels, then down `d` steps,
then find the declaration". The order compares `k` first and `d` second, so a
path with fewer `P` steps always wins, and among those a path with fewer `C`
steps wins. Ambiguity is two best paths with the same `k` and `d`. The
`createMark` boundary is a scope with no `P` edge out of it, and a nested
component is a scope with no `C` edge into it. The inside-the-layer check for
clause refs is a rule that every path must have `k = 0`.

**What does not fit.** In the paper, a reference sits in one scope that is
fixed when the graph is built. In GoFish, the scope a string ref resolves from
is decided later, by `relatingLayerOf`, and it depends on where the ref ends up
in the final tree. Bug (c) in section 4 is exactly this gap.

### 3.4 Hygiene: sets of scopes and nominal names

Flatt ("Binding as Sets of Scopes", POPL 2016) gives every binding form and
every macro expansion a fresh scope. Each identifier carries the set of scopes
it was written in. A reference binds to the binder whose scope set is the
largest subset of the reference's own set. Two candidates where neither set
contains the other make the reference ambiguous. Identifiers that a macro
introduces carry the macro's scope, so they cannot be captured by the user's
binders, and the user's identifiers cannot be captured by the macro's.

Nominal techniques (Gabbay and Pitts, "A New Approach to Abstract Syntax with
Variable Binding", Formal Aspects of Computing 13, 2002) treat a name as an
atom that can only be compared for equality, and they treat making a fresh
atom as a basic operation. Lisp calls this operation `gensym`.

**What fits.** `createName` is `gensym`. A token has no meaning except its
identity, and two tokens with the same tag are different. The `createMark`
boundary is a coarse version of sets of scopes. Each component instance is a
new scope, and string names written inside the component cannot reach out of
it. The library's own names (`internalName`, e.g., `__spread#12`) are fresh by
construction, which is the hygiene a macro system wants for names that a
library builds on the user's behalf.

**What does not fit.** A string in GoFish carries no scope set. The string
`"density"` that the outer callback received and the string `"density"` an
inner layer declares are the same value, so nothing can tell them apart. This
is bug (c).

### 3.5 Attribute grammars

An attribute grammar (Knuth, "Semantics of Context-Free Languages",
Mathematical Systems Theory 2(2), 1968) attaches values to the nodes of a
tree. A **synthesized** attribute is computed from a node's children, so it
flows up. An **inherited** attribute is computed from a node's parent, so it
flows down. Reference attribute grammars (Hedin, "Reference Attributed
Grammars", Informatica 24(3), 2000) let an attribute's value be a reference to
another node in the tree, and they are the usual way to write name analysis
in this style, e.g., in the JastAdd system.

**What fits.** The set of names a subtree declares is a synthesized
attribute. `relateEnv` computes it for one layer. The place a lookup starts
from, and the environment a child should see, are inherited attributes. A
resolved operand is a reference attribute.

**What does not fit.** GoFish computes these with ad hoc walks, and two of them
disagree. The layer registry is an inherited environment that is passed to a
layer's plain children but not to its clauses, which is bug (b).

### 3.6 Selectors in documents

Several document systems separate "label a part" from "find the part":

- **CSS selectors and XPath.** A selector picks a set of nodes from a tree by
  name, class and position. Gottlob, Koch and Pichler ("Efficient Algorithms
  for Processing XPath Queries", VLDB 2002) define Core XPath, the navigation
  part of XPath, and show it can be evaluated in time linear in the size of
  the document times the size of the query. A selector is always plural, and
  an empty result is not an error.
- **D3.** `selectAll` returns a selection of every matching element (Bostock,
  Ogievetsky and Heer, "D3: Data-Driven Documents", IEEE TVCG 17(12), 2011).
  GoFish chose this name on purpose (see
  [Refs and Selection](/js/concepts/refs-and-selection)).
- **LaTeX.** `\label{key}` records where a part ended up in an auxiliary file,
  and `\ref{key}` reads it. Because the file is written during one run and read
  during the next, a forward reference needs a second run to be right.
- **Typst.** A label `<key>` marks an element, and `query(<key>)` returns every
  element with that label. A query can see elements placed later in the
  document, because Typst repeats layout until the results stop changing. The
  [Typst architecture notes](https://github.com/typst/typst/blob/main/docs/dev/architecture.md)
  say that most documents settle in one or two rounds and that Typst gives up
  after five, which users see as the error "layout did not converge within 5
  attempts".

**What fits.** `selectAll` is a selector, and its result is a list. Typst's
`query` is the closest match to `chart(selectAll(...))`, because both read a
tree that is still being laid out.

**What does not fit.** GoFish does not repeat layout. It orders the work
instead. The `.relate()` scheduler (`scheduleRelate`, `relate.ts:230`) lays out
a clause after the clauses whose positions it reads, and a cycle is an error.
GoFish also makes a missing name an error, while a CSS or XPath selector that
matches nothing returns an empty set.

### 3.7 `letrec` and forward references

A recursive `let` (`let rec` in OCaml, `letrec` in Scheme) makes its names
visible inside their own definitions, so definitions can refer to each other.
The hard part is a value that reads another value before that value exists.
Syme ("Initializing Mutually Referential Abstract Objects: The Value Recursion
Challenge", ML Workshop 2005, published in ENTCS 148(2), 2006) handles this by
building values as a graph of delayed computations and checking for a cycle
when one is forced.

**What fits.** A `.relate()` callback is a `letrec` over positions. A clause may
name a node in a sibling clause, and the scheduler orders the clauses so that
each position is written before it is read. The cycle error is the same check
Syme describes.

**What does not fit.** In GoFish the names are bound by the structure, not by
the `letrec`. The callback cannot introduce a name that the layer does not
already hold, except by naming a node inside a clause.

## 4. Three bugs as test cases

Each repro below runs on `main` (`9e8dc8a91`) with `npx tsx` from
`packages/gofish-graphics`, importing from `src/lib`. The output shown is what
I got.

### (a) `.relate()` drops other layers' clauses (#1235)

```ts
import { layer, chart, scatter, circle } from "../src/lib";
const rows = [{ x: 1 }, { x: 2 }];
const mk = () =>
  chart(rows)
    .flow(scatter({ x: "x" }))
    .mark(circle({ r: 3 }));
await layer([mk()])
  .relate(() => [mk()])
  .toDisplayList({ w: 300, h: 100 });
// Also run with axes: { x: true, y: false } and with axes: false.
```

```text
axes default: THROWS: Constraint.position: operand 1 is undefined. A .relate()
  callback receives only the names of nodes inside its layer; ... Names inside
  this layer: __xline, __xt0, __spread#27, __spread#28, __xt1, ...
axes {x:true,y:false}: OK
axes false: OK
```

What happens:

1. The outer layer's clause is a chart. It is flagged `_relateClause`.
2. Axis elaboration wraps the chart with `wrapPreservingIdentity`
   (`elaborationUtils.ts:16`). That function moves the chart's name, key,
   visibility and z-order to the wrapper, but not `_relateClause`. So the chart
   keeps the flag, and the wrapper does not get it.
3. Inside the wrapper, `wrapRing` builds `layer([chart, ...axisNodes])` and
   calls `.relate()` on it (`elaborationUtils.ts:75`). The first thing
   `.relate()` does is drop every child with the flag (`_node.ts:2697`). The
   chart has the flag from step 1, so the axis ring drops it.
4. The axis ring's position constraint names the chart, which is no longer
   there, so the operand is `undefined`.

I did not trace why the case with only the x axis passes.

I checked both halves with throwaway edits. Moving `_relateClause` onto the
wrapper in `wrapPreservingIdentity` makes all three cases pass. Changing
`.relate()` so that it drops clauses only when this layer added some also makes
all three pass. Neither edit is a proposed fix.

**In theory terms.** `_relateClause` is a flag on the child that says "a
`.relate()` bound me", but it does not say which layer did. The flag is read
relative to whatever the child's parent is now. When elaboration moves the
child to a new parent, the flag is read against the wrong binder. In scope
graph terms, the edge from the clause to its scope is stored on the wrong end
and without its target. In attribute grammar terms, an inherited fact
("my parent bound me") was stored as if it were a fact about the node.
`wrapPreservingIdentity` shows a second problem. A node's identity is spread
over several fields, and any field the function forgets to move is lost.

### (b) A clause cannot see the layer's chart names

```ts
import { layer, chart, scatter, circle, line, selectAll } from "../src/lib";
const rows = [
  { x: 1, y: 1 },
  { x: 2, y: 3 },
  { x: 3, y: 2 },
];
const pts = () =>
  chart(rows)
    .flow(scatter({ x: "x", y: "y" }))
    .mark(circle({ r: 3 }).name("points"));

// As a plain child:
layer([pts(), chart(selectAll("points")).mark(line())]);
// As a .relate() clause:
layer([pts()]).relate(() => [chart(selectAll("points")).mark(line())]);
```

```text
plain child: OK, items: 4
relate clause: THROWS: Layer "points" not found. Make sure to call
  .name("points") on the mark first.
```

The `layer` combinator passes one layer registry to all its
plain children (`chart.ts:1242`), so the second child sees the first child's
`points`. `resolveRelateClauses` resolves each clause with a new empty registry
(`relate.ts:163`), so the clause sees nothing.

**In theory terms.** The clause is evaluated in a different environment from
the layer's other children. In `let` terms, the body of the `let` does not see
the `let`'s own bindings. In attribute grammar terms, the inherited
environment is not passed down to the clause children. The bug also shows that
the layer registry and the tree lookup are two environments for one layer, and
`.relate()` connects only one of them.

### (c) Clause operands are looked up again where they are used

```ts
import { layer, rect, circle, arrow, spread } from "../src/lib";
let outerDensity;
const inner = (innerHasDensity) =>
  layer([
    circle({ r: 4 }).name("dot"),
    ...(innerHasDensity ? [rect({ w: 10, h: 10 }).name("density")] : []),
  ]).relate(({ dot }) => [arrow({}, [dot, outerDensity])]);

layer([
  spread({ dir: "x", spacing: 0 }, [
    rect({ w: 150, h: 5 }),
    rect({ w: 40, h: 20 }).name("density"),
  ]),
]).relate(({ density }) => {
  outerDensity = density;
  return [inner(true)]; // or inner(false)
});
```

```text
inner layer has no density: THROWS: ref("density") in a .relate() clause names
  a node outside the relating layer. ...
inner layer has its own density: OK: rects at x = 1.5 (w 150), 151.5 (w 40),
  1.5 (w 10); the arrow's head lies between x = 2.5 and x = 15.5
```

The outer `density` is the 40 wide rect at x = 151.5. The arrow ends at the
inner 10 wide rect at x = 1.5.

The outer callback's `density` is a `RelateOperand` that holds
only the string `"density"` (`relate.ts:28`). The inner callback closes over it
and puts it in an arrow. The arrow is a clause of the inner layer, so the
operand turns into `ref("density")` (`markResult.ts:109`), and that ref
resolves from the inner layer (`relatingLayerOf`). If the inner layer has no
`density`, the search finds the outer one, which is outside the inner layer,
so it throws. If the inner layer has its own `density`, the ref silently binds
to it.

**In theory terms.** This is unhygienic capture, the same bug as a macro whose
expansion mentions a variable that the use site rebinds. The JS closure is
lexically scoped and correct. It holds the outer operand. GoFish then throws
away the operand's binding site and keeps only its spelling, so the name is
resolved where it is used instead of where it was bound. That is dynamic
scoping. In scope graph terms, the reference was moved to a different scope
after the graph was built. In sets-of-scopes terms, the identifier lost its
scope set.

## 5. Candidate semantics

Each candidate is a full answer for `.name`, `ref`, `selectAll`, `.relate()`
and tokens. None of them changes the decided rules. `createMark` is the string
boundary, the nearest level wins, a tie is an error, `ref` is singular, and
`selectAll` is plural.

### A. `.relate()` is a hygienic `let`, run per layer instance, with node identity

This is the rule #1236 proposes.

- The environment maps each visible name to the node itself, found once with
  the current lookup when `.relate()` runs. An operand is a ref to that node,
  the kind `selectAll` already makes (`ref({ __ref: node })`). It is not a
  string.
- Clauses are resolved in the same environment as the layer's plain children,
  including the layer registry, so `selectAll` in a clause sees the layer's
  names.
- The layer records which children are its clauses, e.g., as a list on the
  layer. Children carry no flag.
- Elaboration that wraps a node leaves a forwarding link from the node to its
  wrapper, and an operand reads through it, so an operand still means the node
  that fills the slot after wrapping.

How it handles the bugs:

- (a) No child flag exists, so another layer's `.relate()` cannot drop it, and
  `wrapPreservingIdentity` has nothing to forget.
- (b) The clause sees the layer's registry.
- (c) The operand is the outer node. The inner layer's own `density` cannot
  capture it, and an operand outside the inner layer is legal, because a
  drawing clause reads positions and does not place them. A constraint operand
  must still be inside the layer that places it.

Cost:

- Operands are names today because elaboration replaces a named child with a
  wrapper (`constraints/index.ts:169`). The forwarding link is the price. It is
  a second identity channel next to `_name`, so it should replace the name and
  key moves in `wrapPreservingIdentity`, not sit beside them.
- This subsumes item 5 of #935 (hand out real refs, not a `RelateOperand`
  class), and `.relate()` can then stay synchronous.

Users see no change in the syntax. The bug (b) and (c) programs
start to work.

```js
layer([pts]).relate(({ points }) => [
  // selectAll sees the layer's names (b).
  chart(selectAll("points")).mark(line()),
  // An inner relate may point at an outer node (c).
  layer([circle({ r: 4 }).name("dot")]).relate(({ dot }) => [
    arrow({}, [dot, points]),
  ]),
]);
```

### B. Clauses are plain children, and operands are names with a scope

- `.relate()` appends its drawing clauses as ordinary children. There is no
  clause flag at all.
- One scheduler orders every child by what it reads. This is item 1 of #935.
- An operand stays a name, but it carries the layer it was bound in:
  `{ name, layer }`. A ref made from it resolves from that layer, not from
  wherever it ends up. This is the sets-of-scopes repair at the size GoFish
  needs, which is one scope per `.relate()` call.
- The layer passes one registry to all its children, which now includes the
  clauses.

How it handles the bugs:

- (a) No flag exists to drop.
- (b) Clauses are children and share the registry.
- (c) The operand resolves from the outer layer, so it finds the outer
  `density`.

Cost:

- If clauses are plain children, the rule "a string `ref` is legal only
  inside `.relate()`" loses its reason, because every child is scheduled. The
  rule could be kept or dropped. Dropping it reopens a decided rule.
- Operands are still looked up by name at layout, so they survive elaboration
  wrappers with no new mechanism. That is the advantage over A.
- Names still resolve twice, once to build the environment and once at
  layout, so a tree change between the two can change the answer.

Current programs do not change. If the string-ref rule is
dropped, this also becomes legal:

```js
layer([a.name("a"), b.name("b"), arrow({}, [ref("a"), ref("b")])]);
```

### C. One resolver: a scope graph for every name

- Every layer, `createMark` instance and split group is a scope. `.name` is a
  declaration in its scope. `ref`, `selectAll`, `.relate()` operands and
  tokens are all references, resolved by the one path order in section 3.3.
- `selectAll` returns every declaration on the best paths. A tie is its normal
  result, not an error. `ref` requires exactly one. This replaces the layer
  registry.
- A token is a declaration in a named scope, and a ref path is an import edge
  into that scope.
- A reference records the scope it was written in when the scope graph is
  built. That gives A's hygiene for (c).

All three bugs are gone by construction, because no name
is resolved against a scope other than the one it was written in, and there is
one environment per layer.

Cost:

- It is the largest change. It replaces three tables with one resolver and
  changes `selectAll`'s behavior, because it starts to widen and shadow like `ref`,
  where today it reads a flat table per `layer` combinator. Charts that rely on
  a name being found only in its own layer would need checking.
- It is the easiest to document and to mirror in Python, because there is one
  rule.

For users, `selectAll` follows the same scoping rule as `ref`.
Most programs see no difference, because most chart names are unique within
their component.

### Recommendation

> **Update (2026-10-28).** The API proposal in `proposals/naming-semantics/`
> refines this. Prototypes of A and of B's operand (a name plus the scope of
> the `.relate()` that bound it) draw the same pictures, and B's operand needs
> no forwarding link and is the same value in Python. The proposal recommends
> B's operand with A's clause list, plus C's `selectAll` rule. The text below
> is the original recommendation.

I recommend **A**. It fixes all three bugs with the smallest change to what
users see. It also matches what the JS code already says. The callback's
destructured names are JS variables, and JS variables are lexically scoped, so
GoFish should keep the binding the closure already holds instead of turning it
back into a string. It also finishes #935 item 5.

The runner-up is **C**. It is the cleanest end state, and A does not block it.
A's node-identity operands are what C's resolver would hand out. C should be
its own effort, because it changes `selectAll`.

B is the cheapest, but it keeps names as the identity channel, and it reopens
the string-ref rule.

## 6. Decision questions

1. Should a `.relate()` operand be the node itself (A), or a name that
   remembers the layer it was bound in (B)?
2. In A, may a drawing clause in an inner `.relate()` point at a node bound by
   an outer `.relate()` (the bug (c) program), or should that be an error that
   says to move the clause outward?
3. Should `selectAll` follow the same widen and shadow rule as `ref` (C), or
   keep its flat registry per `layer`?
4. Should a token applied under a split be an error, or a plural name like
   `selectAll`?

## References

- Benzaken, Castagna and Frisch. [CDuce: An XML-Centric General-Purpose Language](https://www.irif.fr/~gc/papers/icfp03.pdf). ICFP 2003.
- Bostock, Ogievetsky and Heer. D3: Data-Driven Documents. IEEE TVCG 17(12), 2011.
- Flatt. [Binding as Sets of Scopes](https://users.cs.utah.edu/plt/publications/popl16-f.pdf). POPL 2016.
- Gabbay and Pitts. A New Approach to Abstract Syntax with Variable Binding. Formal Aspects of Computing 13, 2002.
- Gottlob, Koch and Pichler. Efficient Algorithms for Processing XPath Queries. VLDB 2002. Extended in ACM TODS 30(2), 2005.
- Hedin. [Reference Attributed Grammars](https://lup.lub.lu.se/record/107069). Informatica 24(3), 2000.
- Hosoya and Pierce. [Regular Expression Pattern Matching for XML](https://repository.upenn.edu/cis_papers/155). POPL 2001. Journal version in JFP 13(6), 2003.
- Knuth. Semantics of Context-Free Languages. Mathematical Systems Theory 2(2), 1968.
- Néron, Tolmach, Visser and Wachsmuth. [A Theory of Name Resolution](https://research.tudelft.nl/en/publications/a-theory-of-name-resolution). ESOP 2015.
- Pickering, Gibbons and Wu. [Profunctor Optics: Modular Data Accessors](https://programming-journal.org/2017/1/7/). The Art, Science, and Engineering of Programming 1(2), 2017.
- Syme. [Initializing Mutually Referential Abstract Objects: The Value Recursion Challenge](https://www.microsoft.com/en-us/research/publication/initializing-mutually-referential-abstract-objects-the-value-recursion-challenge/). ML Workshop 2005, ENTCS 148(2), 2006.
- Microsoft. [Group.Captures](https://learn.microsoft.com/en-us/dotnet/api/system.text.regularexpressions.group.captures). .NET API reference.
