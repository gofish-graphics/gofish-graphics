# Reactivity & Interaction

::: warning Under construction
This page is a first draft. The ideas are right, but the prose has not been
written properly yet and may change shape.
:::

::: tip Before you start
This page assumes [Basics](/js/tutorials/basics) for marks, operators and
`layer()`, and [Charts](/js/tutorials/charts) for `chart()`, `.flow()` and
`.mark()`. Reactivity is available in JavaScript only.
:::

A GoFish picture can read from values that change while the page is open, and
redraw itself when they do. This tutorial will build a chart whose threshold
line can be dragged, and it will show how a dragged value flows back into the
marks that depend on it. The pieces are the same marks and operators you
already know, plus a way to say that a number comes from the reader rather than
from the data.

::: gofish story:interaction-draggable-threshold--default hidden
:::

## For now

The tutorial has not been written yet. Read
[Reactivity & Interaction](/js/reactivity) in the API reference for the full
picture of how live values and input marks work today.
