---
title: Tutorials
---

# Tutorials

Charts and diagrams are built out of the same pieces in GoFish: a handful of
marks, and graphical operators that arrange them. **Basics** teaches those
pieces, and every other tutorial here depends on it and nothing else. So start
with Basics, then take the rest in whatever order you like.

<TutorialGrid>

<TutorialCard title="Basics" href="/js/tutorials/basics" requires="Start here" blurb="Draw shapes and arrange them with graphical operators, the two ideas everything else is built from.">

::: gofish story:tutorials-basics--basics hidden
:::

</TutorialCard>

<TutorialCard title="Charts" href="/js/tutorials/charts" requires="Builds on Basics" blurb="Grow a bar chart into a stacked bar chart, a ribbon chart, and finally a polar ribbon chart.">

::: gofish example:polar-ribbon-chart hidden
:::

</TutorialCard>

<TutorialCard title="Diagrams" href="/js/tutorials/diagrams" requires="Builds on Basics" blurb="Lay out boxes, labels, and arrows to draw a memory diagram of a running program.">

::: gofish example:python-tutor-memory-diagram hidden
:::

</TutorialCard>

<TutorialCard title="Reactivity &amp; Interaction" href="/js/reactivity" requires="Builds on Basics" note="JavaScript only" blurb="Make a visualization respond to the pointer, the wheel, a drag, or a timer.">

::: gofish story:interaction-draggable-threshold--default hidden
:::

</TutorialCard>

<TutorialCard title="GoTree" href="/js/gotree" requires="Builds on Basics" note="Separate package" blurb="Use the companion tree grammar to draw node-link diagrams, nested boxes, sunbursts, and more.">

::: gofish story:gotree-node-link--nodelink hidden
:::

</TutorialCard>

</TutorialGrid>

New to GoFish? [First Steps](/js/get-started) installs the library and gets a
chart on the screen in a couple of minutes. When you want to read finished specs
instead of building one up, walk the [examples](/js/examples/).
