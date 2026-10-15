---
title: Designed Like a Language
section: Overview
order: 27
group: Design Philosophy
status: stable
handwritten: true
---

# Designed Like a Language

::: info Moved from the GitHub wiki
This page is the _GoFish Design Philosophy_ page of the project's GitHub wiki
(last edited November 2025), moved here verbatim. Some of it has gone out of
date:

- It speaks of "our low-level APIs" for defining new operators. The public
  extension points today are `createMark` and `createRelationalMark`;
  `createOperator` is internal and not exported from `lib.ts`. See [The Mark
  Factory](/internals/frontend/mark-factory) and [The Operator
  Factory](/internals/frontend/operator-factory).
- The API is no longer split into levels. See [The API
  Levels](/internals/design-evolution/api-levels) for the old split and [Three
  Surfaces](/internals/design-evolution/three-surfaces) for the current one.

The comb-and-tree argument in [Composition, Not
Enumeration](/internals/design/composition-not-enumeration) and the
extensibility argument in [Charts Are User
Interfaces](/internals/design/ui-as-charts) are later, longer versions of the
first two sections.
:::

GoFish is designed like a programming language (PL) or domain-specific language (DSL) rather than as a toolkit or library. Now those words don't mean much specifically so let me be clear about what I mean.

## Hierarchical/Recursive Composition

The biggest difference between GoFish and approaches taken by GoG libraries is that GoFish programs have _recursive_ compositional structure. In the GoG, you typically select the chart type you want to use with a mark (like `bar`), pick some encoding channels (e.g., `x`, `y`, `fill`), maybe a coordinate system. These choices are "flat." It's sort of like picking an appetizer, entree, and dessert from a menu. While you might do something like layering or faceting, which are forms of hierarchical composition, these are bolted onto the main marks-and-channels model and typically cannot be nested. So you can't have multi-level faceting. The hierarchical composition is an afterthought.

In GoFish, hierarchical composition is the _main_ form of composition that we think and care about. That's not to say that marks and channels are unimportant, they're absolutely necessary, but much of the behavior and the complexity of the system arises from the composition mechanisms rather than from the objects that are being composed.

This has additional downstream consequences. When you're designing something in a flat compositional structure, like the menu, you get a lot of authorial control over each object on that menu. Your entree item might be a waffle chart. You can say "labels should look like this," "the default size of a unit should be this," "the default aspect ratio should be this."

When you are working with hierarchical composition, an operator like spread may be used in dozens of different ways: it's the spacing between bars in a bar chart, and between rows in a waffle chart, and as faceting between charts. As a result, simple, good-enough, predictable defaults that can be overridden are a much better fit than hand-crafting the default behavior of every aspect of a chart. For expert use, I think this is a very _good_ thing. Whenever you want to override defaults or make modifications, you usually have to understand what all the default decisions were, and these can get very complex. Moreover, in the "menu" model, you have to understand these decisions for every chart type.

Does that mean we need to give up all the conveniences of a hand-crafted menu? No! That leads to the next major point.

## Extensible by Design

The prototypical programming language in PL theory/design is the lambda calculus. The lambda calculus only has three primitives: variables (`x`), anonymous functions (`(x) => E`), and function calls (`E_1(E_2)`) where `E`, `E_1`, and `E_2` are expressions. For the purposes of this, you don't really need to know the details of how that works, just that the language is very, very small. But the cool thing is, from just these three primitives, we can simulate any other programming construct we want: loops, conditionals, data structures, objects, etc. The lambda calculus can be augmented with these other constructs to make the language easier to use, and to make a closer mapping to our specific domain problem, but these constructs don't add any new functionality to the language.

A similar phenomenon occurs in UI framework design. HTML and SwiftUI provide basic building blocks like lists and buttons and text. But these can be combined to form new, composite components that act like built-in ones. These new components don't add any new functionality that you couldn't have in HTML or the base SwiftUI standard library, but they make it easier to design your specific UI.

Charts and diagrams aren't so different from user interfaces. All of these are 2D graphics that visualize data, and thus (I believe) are governed by similar forces of design. GoFish's compositional design allows you to build your own curated menu of charts, even a version of the Grammar of Graphics, the same way you can build custom components in a UI framework.

Moreover, we work carefully to ensure that every part of the language is as extensible as we can reasonably make it. Users can define new coordinate transforms, graphical operators, and marks by either composing existing things together or using our low-level APIs to create brand new ones. (Over time, we hope that extending the language using the low-level APIs becomes rarer and rarer while extensions at the high-level become more and more frequent. But I'm not sure if this is how things will go.)

## Tension Between Menus and Composition

The truth is that most people, especially initial users, want menus. They just want to get things done. And that makes tons of sense, and we need to cater to that. But the compositional design makes it much easier to create menus, to the point where end-users can make them themselves. And compositional design means the system can support users from their very first day to when they've spent 1000s of hours with the system in ways that a fixed menu could never provide.

There will never be a complete menu that satisfies everyone. We have the GoG, yes, but Seaborn has lots of bespoke charts that people use all the time. There's a very long tail of users that have very bespoke charting needs, and yet these users exist in clumps: teams, labs, research areas, fields. And those clumps can be served by domain-specific menus or "grammars."

I think it is important to recognize that 90+% of even these custom menus are really compositions of a very small core set of basic shapes and operators, the way 90+% of UIs are compositions of lists, grids, text, images, buttons, menus, etc. And even if GoFish focuses on one or two specific domains for some time, our ultimate goal is to construct this core set, the architecture that supports its construction and composition, and extensibility mechanisms for people to write their own menus, whether they are first-time users, domain-experts, or visualization researchers.

## Afford Local Reasoning

The ability to reason locally about a specification/program is one of the best things we can do as language designers to make reading a program scale with program size. Some examples of this:

**Favor immutable operators and language constructs.** Immutability is a great property for local reasoning, because it means that whatever contract your operator/shape/coordinate transform establishes, it can't be broken by something else later. (This is very closely related to the idea of monotonicity, where things can be added to, but never removed from. (Or other versions where you can +A but not -A.)) I want to make it clear, though, that from a pragmatic perspective mutability is sometimes much better than immutability. Some things naturally want to be mutable or imperative in some way. (A good example of this is contemporary signal systems like in Solid vs FRP systems like Flapjax <https://joshmpollock.com/blog/flapjax-revisited/>.) In visualization, you may want to create a pie chart and then move one of the wedges to highlight it. Or you may want to change the border color of one of the bars in a bar chart to highlight it. These kinds of things are more naturally done via mutation than immutably. But if you construct most of your program this way, things can quickly become hard to read and understand.

We allow for label customization and naming to happen at each shape, operator, mark, or chart boundary (while sometimes providing shortcuts that affect a whole chart). This kind of local reasoning goes hand-in-hand with building a recursively compositional system.

## Inspirations

GoFish aspires to be a tool with aesthetics similar to Lean, Typst, Rust, SolidJS/Svelte, and SwiftUI. These systems all have concise, clean syntax and really powerful compositional constructs compared to the things that came before them. Lean, Typst, and Rust all have macro systems that integrate seamlessly with the rest of the language (in contrast to Rocq, LaTeX, and C++). SolidJS's signals system is much simpler and much more composable than React hooks. This kind of compositionality tends to clean up many rough edges of a system. There seems to be a kind of attractor basin where your language wants to get as expressive as possible until it ends up at that attractor state. If you are able to design for that basin explicitly, you can make a much more cohesive system than when you're unaware of it.
