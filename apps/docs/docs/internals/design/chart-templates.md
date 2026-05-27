---
title: Chart Templates
section: Speculative Notes
order: 30
status: speculative
---

# Design of the High-Level Chart API

This level is the closest to the original GoG. But because we also have the mid- and low-level APIs,
we can make this level much more restrictive and less compositional. Our goal at this level is to
match user intentions of the form "I want to make a bar chart."

That being said, these charts still produce GoFish scenegraphs so they can be transformed by
coordinate systems, layered, added as marks to `chart` pipelines, etc. This preserves a lot (all?)
of the compositional power of the GoG.

## Do Less

The name of the game here is _do less_. Do less inference than you think. Cover fewer chart types
with one function call than you might want to. This keeps things readable and predictable. It also
makes contributing examples easier, because they don't have to be as general.

Inference at this level of abstraction also breaks down really quickly. What might work well for bar
charts or bars, lines, and areas, quickly breaks down for more complex charts like waffles, boxes,
and mosaics.

Chart names at this level carry semantic/pragmatic meaning. If we allow too much flexibility in e.g.
a bar chart, then the name "bar chart" loses its meaning.

## Leave Space for Chart-Type DSLs

Don't try to do too much in a flat API for things like waffles or mosaics. That's a nice space for a
domain-specific language (DSL) to express these charts. For example, the Atom grammar for unit
charts could be ported. Or we could port productplots. These are useful for collections of charts
that have hierarchical structure, but have domain-specific primitives with more restrictive
structure than the mid-level API.

# Forks Not Taken

## The Road to Gantt Charts

One thing we might naturally want to try is changing the traditional encoding style:

```ts
barChart(data, { x: "x", y: "y" });
```

to

```ts
barChart(data, { x: "x", h: "y" });
```

since bars really use height to encode information. This makes switching between vertical and
horizontal bars a little harder, because we also have to switch `x` and `h` to `y` and `w`. But also
this affords a spec like:

```ts
barChart(data, { x: "x", h: "y", y: "group" });
```

And what should that mean? Maybe something like a Gantt chart, except that Gantt charts can have
multiple bars in the same group whereas a bar chart can't (except for stacking, which isn't the same
thing).

I checked ggplot2 and plotnine and actually a lot of charts do just fine with `x` and `y` without
resorting to `x` and `h`, which might be slightly higher cognitive load at this level of
abstraction. `x` and `y` act more like axes than dimensions at this level (also consistent with
ggplot2 where if you give `x` and `y`, but no marks, it will still render an empty coordinate space
of the proper size). Moreover, at a later time we can still stuff more data into each axis by giving
it an option like this: `x: { ... }`. That works well for e.g. box and whisker charts, which can
take quartile information.

It's possible we'll revisit and modify this decision later, but right now I like erring on the side
of familiarity, because (i) I don't think we should take advantage of the Gantt chart affordance and
(ii) the mid- and low-level APIs do a good job at being explicit about visual structure, so if you
really wanna be aware that a bar chart encodes data with height, then look at those abstraction
levels!

## The Road to `Auto`

Another thing I tried is the Vega-Lite approach. Suppose we don't just have encoding channels, but
we also know the types associated with those channels. Then we might ask, for example, what happens
if we have a bar chart where `x` and `y` are both continuous values? Or both discrete? Maybe we'd
get a scatterplot and a heatmap, respectively. This road leads to the `auto` mark like in Observable
Plot.

I looked back on this design option, and I realized that I'd misunderstood how Vega-Lite's bar mark
works. I thought that it made a scatterplot if you use two continuous values, but that's only if the
two values are the same field! (And in that case it still ends up stacking the y-axis...) So there
are really a lot of heuristics going on inside that bar mark. I'd like to avoid that complexity, but
I think we can still be fairly predictable in how we handle other data types. For example, we could,
like Vega-Lite when the fields are different, make a bar chart with continuous positioning on the
x-axis when both fields are continuous.

For now we will just error on data types we don't expect (or treat them as the types we _do_ expect)
and revisit this decision when we have more complex examples to look at.
