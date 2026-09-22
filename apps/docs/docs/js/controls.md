# Controls

A control in GoFish is a picture, not a DOM widget. `slider` and `button` are
ordinary marks: they draw with `rect`, `ellipse` and `text`, they read the
pointer through [`drag()` and `click()`](/js/reactivity#inputs), and they lay out
with the ordinary operators inside the same `<svg>` as the chart they drive.

::: warning JavaScript only
Controls are part of the reactive layer, which is available only from the
JavaScript API.
:::

```ts
import { slider, button } from "gofish-graphics";
```

## The shape: controlled inputs, one way each

Both controls follow the shape Solid and React use for a form input: you hand
them the value to display and a callback to call when the user changes it.

```ts
slider({
  value: () => number,          // read: what the handle and the readout show
  onInput: (v: number) => void, // write: called with the pointed-at value
  domain: readonly [number, number],
  step?: number,              // quantize the emitted value; default continuous
  w?: number,                 // track length in px; default 300
  wrap?: boolean,             // cyclic domain: drag off one end, come in at the
                              // other; default false
  format?: (v: number) => string, // the readout beside the track; default String
});

button({
  label: string | (() => string),
  onClick: () => void,
  w?: number,                 // default 24
  h?: number,                 // default 24
});
```

There is no two-way binding construct. A control owns no state of its own: it
reads one accessor and writes through one callback, and the state lives in
whatever input you pass — a [`signal()`](/js/reactivity#signal-init), a
[`timer()`](/js/reactivity#timer-options), anything with a `.set`.

```ts
const level = signal(50);

const levelSlider = slider({
  value: level,
  onInput: (v) => level.set(v),
  domain: [0, 100],
  step: 1,
  w: 240,
});
const resetButton = button({ label: "0", onClick: () => level.set(0) });

GoFish(container, { w: 420, h: 120 }, () =>
  spreadX({ spacing: 8 }, [resetButton, levelSlider])
);
```

The slider draws its own value readout to the right of the track, so you do not
have to add one. `format` decides how it reads:

```ts
slider({ ...opts, format: (d) => `day ${d}` }); // "day 43"
slider({ ...opts, format: (d) => d.toFixed(1) }); // "42.5"
```

## Make the control once, render it many times

A control is a **mark** — a deferred node constructor, like `rect(...)` — and
that matters for where you call it.

- Call `slider(...)` / `button(...)` **once**, outside the render thunk. Each
  call makes one `drag()` or `click()` input and one write effect, and those have
  to survive every re-render (a drag in flight must not be rebuilt under the
  pointer).
- The **thunk** is what re-runs: each resolve re-invokes the mark, which reads
  `value()` again and places the handle again. A control's geometry depends on
  its value, and geometry cannot be `live()` — `live()` patches attributes at
  paint, it does not move a node — so the spec itself must be re-evaluable. That
  is exactly what the thunk form of the terminal,
  `GoFish(container, options, () => node)`, is for.

## Panel E: a play button and a scrub slider over a clock

The timer is the single source of truth. The slider displays it in one direction
and writes it in the other; dragging pauses the clock first, so a scrub takes
ownership of playback until the button resumes it.

```ts
const day = timer({ domain: [1, 365], step: 1, duration: 10000 });

const map = basemap({ padding: 0 }).layer(
  chart(birds)
    .flow(
      // Day-of-year is cyclic, so the 20-day trail is a window on the wrapped
      // distance back from the playhead.
      filter((d) =>
        between((day() - d.day + 365) % 365, 0, 20, { closed: "left" })
      ),
      scatter({ x: "lon", y: "lat" })
    )
    .mark(
      circle({
        r: 3,
        fill: "species",
        opacity: (d) => (d.day === day() ? 1 : 0.1),
      })
    )
);

const timeSlider = slider({
  value: day,
  onInput: (v) => {
    day.pause();
    day.set(v);
  },
  domain: day.domain,
  step: day.step,
  w: 300,
  // Day-of-year is a cycle, like the trail filter above: a scrub off either end
  // of the track continues around the year instead of stopping.
  wrap: true,
  format: (d) => `day ${d}`,
});
const playButton = button({
  label: () => (day.isPlaying() ? "❚❚" : "▶"),
  onClick: () => (day.isPlaying() ? day.pause() : day.play()),
});

GoFish(container, { w: 600, h: 660, legend: false }, () =>
  spreadY({ spacing: 12 }, [
    Frame({ w: 600, h: 600 }, [map]),
    spreadX({ spacing: 8 }, [playButton, timeSlider]),
  ])
);
```

::: gofish example:bird-migration-e-controls hidden
:::

Two things about that composition are worth copying:

- A `chart(...)` builder — with or without `.layer(...)` tiers — is usable as a
  child of a low-level operator. It resolves to one node, which is what the
  operator stacks.
- `legend: false` and the map's size are options of the **root render** here, not
  of the chart. Once the chart is no longer the root, it is the enclosing
  composition that decides how big the map box is and whether the canvas grows a
  swatch column. Pass `padding: 0` to a chart you are composing: its padding is
  drawn outside the node's box, so a padded child paints past the box its
  siblings are stacked against.

## What the slider does with the pointer

- **Pixels to domain, absolutely.** The pointer's position along the track _is_
  the value. A press on the bare track puts the handle under the pointer, and the
  handle then follows it exactly; the track and the handle are both drag targets,
  so it makes no difference which one the press landed on. The widget still does
  not measure anything in the DOM: it asks the published frame where the node it
  drew ended up, through [`nodeBox(id)`](/js/reactivity#drag-options) —
  the same read-off-the-frame move as `drag().currentData()`.
- **The handle's travel is inset by its radius** (`w - 2r`), so the handle always
  lies on the track and the control's bounding box is exactly `w` wide whatever
  the value is. A box that changed width with the value would shift everything
  laid out beside it on every frame. The mapping uses that same travel, which is
  why the handle's center lands exactly on the pointer rather than a few pixels
  off it near the ends.
- **`wrap: true` makes the domain a cycle.** The fraction is no longer clamped:
  drag off the right end and the value comes in at the left, and the other way
  around, continuously. The cycle length is `hi - lo` for a continuous domain (so
  `hi` and `lo` are the same point, as they are for an angle) and `hi - lo + step`
  for a quantized one (a day-of-year domain `[1, 365]` with `step: 1` has 365
  distinct days, so day 365 is followed by day 1 rather than identified with it).
  The name is Qt's `wrapping` property, and so is the behavior.
- **The readout keeps the box stable.** The value is drawn to the right of the
  track, right-aligned against a reserved slot, so the glyphs grow leftward from a
  fixed edge and the control is the same width for `1` and for `day 365`. Nothing
  laid out beside the slider moves when the value changes.
- **The drag is claimed by hit-testing**, not by geometry: the control passes the
  uids of the nodes it just drew to `drag({ hitTest })`, so a press on the chart
  next door never scrubs.
