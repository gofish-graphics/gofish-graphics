# Names and Scope

::: warning Under construction
This page is a first draft. The ideas are right, but the prose has not been
written properly yet and may change shape.
:::

A name in GoFish is a handle. You give one to a mark with `.name(...)`, and
some other piece of the picture uses it to say where that mark should sit or
what should point at it. Names are how a constraint says "center the label on
the box" and how an arrow says "start here and end there."

The question a naming system has to answer is: who can see the name? GoFish's
answer is that a name is visible to the thing that gave it out, and to nothing
above that. A name inside a component belongs to that component. This is called
**hygienic** scoping, borrowing the word from macro systems, where a hygienic
macro is one whose internal variables cannot be captured by the code it expands
into.

## The same name, many times

Here is a `slot` component. It draws a variable name, a box, and the value
inside the box. The box and the value are named so that a constraint can
center one on the other.

::: gofish

```js
const slot = gf.createMark(({ variable, value }) =>
  gf.Spread({ dir: "x", alignment: "middle", spacing: 6 }, [
    gf.text({ text: variable, fontSize: 16 }),
    gf
      .Layer([
        gf.rect({ w: 40, h: 40, fill: "#e2ebf6" }).name("box"),
        gf.text({ text: value, fontSize: 16 }).name("value"),
      ])
      .constrain(({ box, value }) => [
        gf.Constraint.align({ x: "middle", y: "middle" }, [box, value]),
      ]),
  ])
);

gf.Spread({ dir: "y", spacing: 8, alignment: "end" }, [
  slot({ variable: "x", value: "5" }),
  slot({ variable: "y", value: "8" }),
  slot({ variable: "z", value: "3" }),
]).render(root, { w: 120, h: 160 });
```

:::

Three slots are on the screen and every one of them has a child called `box`
and a child called `value`. Nothing collides, and nothing had to be made
unique. Each `.constrain()` callback looks its names up inside its own `slot`,
and it cannot see into anybody else's.

Make it ten slots, or one per row of a dataset, and the picture is the same.
The component author wrote `box` once and never had to think about how many
copies would exist.

## The nearest match wins

Inside a component, a string name is looked up from where it is used. A
`ref("box")` starts at the layer it sits in, and a `.constrain()` callback
starts at the layer it is attached to. If that layer's contents have a node
named `box`, at any depth, that is the one. If not, the lookup moves out one
level and tries again, and so on up to the component boundary.

This means a nearer name hides a farther one. That is on purpose. It is what
lets a layer that is repeated, once per row of a chart or once per call of a
helper function, use the same local names every time, because each copy finds
its own.

Inside the level where the lookup stops, the closest node wins, counted in
steps down from that level. So a layer's own child named `box` beats a `box`
nested deeper inside another child. Two nodes with the same name at the same
smallest distance are an error, and so is a name that is not found at all, so a
typo or a real collision never passes in silence.

Names that GoFish makes up never get in the way. A mark's data key is not a
name, so a `spread` over rows keyed `"a"` and `"b"` does not add nodes named
`"a"` and `"b"`. When an operator does need to name a node, it uses a fresh
name that cannot match one you write.

Because the lookup reaches into nested operators, a constraint can name a node
deep inside another child, such as one circle inside a `spread` inside an
`enclose`. That node stays attached to the child that contains it: the
constraint moves the whole child, or, if the child is not named, uses the node
as a fixed point.

## Why not one flat namespace

The obvious alternative is a single global table: every `.name()` writes into
it, every lookup reads from it. Most diagramming tools start there. It is a
fine model for a picture you write out by hand once, because you can see all
the names at the same time and keep them distinct.

It stops working as soon as the picture is made of parts. A flat namespace
makes a component leak. The author of `slot` picked the string `box` for
reasons internal to `slot`, and in a flat namespace that string is now a claim
on the whole document. Two slots in the same picture is already a collision.
So is one slot next to some unrelated component whose author also liked the
word `box`.

The usual repairs are worse than the problem. You can mangle names by hand, so
`box` becomes `slot-3-box` and every constraint has to rebuild the same string.
You can make the library mangle them, which means the names you wrote are not
the names that exist, and error messages stop matching your source. Or you can
declare the collision the user's problem, which makes every component a
liability in somebody else's document.

Hygiene removes the question. A name is scoped, so there is no shared table to
collide in, and the author of `slot` never has to know what else is on the
page.

## Strings and tokens

Scoping alone would make components airtight, which is too airtight. An arrow
between two components has to name an endpoint inside each of them. So GoFish
has a second kind of name.

A **string** name is a label. It is meaningful inside the component that
contains it and nowhere else. `.name("box")` is a note to the constraints and
refs in that component.

A **token**, made by `createName("value")`, is an identity. Each call returns a
fresh value, so two components that both call `createName("value")` hold two
different tokens that happen to share a tag. Attaching a token to a node makes
that node reachable from outside by a path.

The difference matters because a string cannot be an identity. Two components
that both write `"value"` have written the same string, and a string carries no
information about which instance meant it. A token is a distinct value at
runtime, so it can be handed around, stored, and used as the first step of a
path without ambiguity. That is the whole reason both exist: a label is cheap
and local, an identity is what crosses a boundary.

The convention that follows is worth stating. The caller creates the token for
a component instance, and the component creates the tokens for the parts of
itself that it is willing to expose. Everything else stays a string.

::: gofish

```js
const slot = gf.createMark(({ variable, value }) => {
  const valueTag = gf.createName("value");
  return gf.Spread({ dir: "x", alignment: "middle", spacing: 6 }, [
    gf.text({ text: variable, fontSize: 16 }),
    gf
      .Layer([
        gf.rect({ w: 40, h: 40, fill: "#e2ebf6" }).name("box"),
        gf.text({ text: value, fontSize: 16 }).name(valueTag),
      ])
      .constrain(({ box, value }) => [
        gf.Constraint.align({ x: "middle", y: "middle" }, [box, value]),
      ]),
  ]);
});

const first = gf.createName("first");
const second = gf.createName("second");

gf.Layer([
  gf.Spread({ dir: "y", spacing: 40, alignment: "end" }, [
    slot({ variable: "x", value: "5" }).name(first),
    slot({ variable: "y", value: "5" }).name(second),
  ]),
  gf.Arrow({ bow: 0, stretch: 0, stroke: "#1a5683" }, [
    gf.ref(first).value,
    gf.ref(second).value,
  ]),
]).render(root, { w: 160, h: 160 });
```

:::

`ref(first).value` reads as "the part tagged `value` inside the instance called
`first`." The box in each slot is still a string, so it is not reachable that
way, and that is the component saying which of its parts are public.

## What a component boundary does

`createMark` is what draws the boundary. Every mark built with it is a scope,
so the names inside one call of the component are separate from the names
inside every other call.

The boundary works in both directions, and the second direction is the one
people notice. A name registered inside a component is not selectable from
outside it. That applies to layer names used by [`selectAll`](/js/api/selection/ref)
just as it applies to names used by constraints. A component is not a bag of
parts you can reach into; it is a thing with an inside.

The cost is real. If you want to reach a part of a component from outside, the
component has to have decided to expose it with a token. That is a deliberate
trade. The alternative, where everything inside is reachable by default, means
a component's internal structure is its public interface, and changing a
private detail breaks a caller who was never told it was private.

## What was rejected

**Letting every descendant name bubble up.** This is the version where a name
anywhere in the tree is visible everywhere above it. It makes the simple case
convenient and makes the composite case a lottery, since whether your lookup
works depends on what else happens to be nested under the same node. It also
turns every rename inside a component into a possible break somewhere else.

**Automatic name mangling.** Appending an index to make names unique keeps one
flat table and hides the mangling. The names you read in your source stop being
the names the system uses, which shows up in every error message and every
debugging session.

**Tokens only, with no strings.** Every name could be a token, which would make
the model uniform. It would also make the common case, naming two children so a
constraint can relate them, into three lines instead of one, for a name that
was never going to leave the layer. Strings stay because most names are labels,
not identities.

**Strings that are path addressable.** Letting `ref(token).someString` reach a
string-named child would blur the one distinction that carries the design. The
point of a string is that it made no promise to anyone outside.

## Where next

- [How to name and scope](/js/api/howto/naming-and-scoping) for the rules as a
  decision table, including paths, reserved property names, and the array form.
- [Diagrams](/js/tutorials/diagrams) for the same ideas built up a step at a
  time into a memory diagram.
- [Refs and Selection](/js/concepts/refs-and-selection) for what you do with a
  name once you have one.
