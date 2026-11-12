# Results of "Spacing by eye, part 2"

Each file here is one person's block from `survey2.html`, pasted as it came,
named like part 1's: `01-anon.txt`, `02-josh.txt`, and so on. A block starts
with `optical-spacing-survey v2c` (or `v2` for the earlier design, see below);
then come `name:`, `squint:`, `zoom:`, `screen:` (the window width in px),
`theme:` (light or dark, the page's color scheme, which with each widget's
inversion gives the polarity it was seen in), `extended:` (shown if the person
opened the optional widgets), `invert:` (the Invert toggle) and one line per
widget:

    w<id> <key> <value> start=<far|close> pos=<position>

The value is the box gap in px of the pair being set, or `unset`. `start` is
the side the slider started on, drawn at random for each person, and `pos` is
where the widget sat on the page, since the order is shuffled within each
tier. An unset widget still records both. Widgets in the extended tier are
`unset` unless the person opened it. The ids and keys, and what each widget
is for, are in `../../survey2_design.md`.

Design versions:

- **v2b** (header `optical-spacing-survey v2`): starts pinned to one side per
  widget and a fixed order, so its lines have no `start=` or `pos=`. Its
  sides were: far on w1, w3, w5, w6, w7, w8 and w9 to w11, w13 to w15; close
  (touching) on w2, w4 and w12. The order was w1 to w15.
- **v2c**: the current page, with random sides and order.

The ranking page (`page.html`) ranks part 1 only. Its paste box recognizes a v2
block and says it belongs here instead of reading its `w` lines as part 1's
widgets, and the saved part 1 responses it plots come only from `../*.txt`, not
from this folder.

Not built yet: the analysis in `survey2_design.md` (the start effect, noise
from the repeat, ruling candidates out, the wedge slope, mixed sizes, scale,
inversion and color). It needs a script that reads these files, which is
worth writing once a few responses are in.

- 01-josh: Josh, 2026-11-12, design v2b before the Invert toggle (name line
  filled in afterward; it was blank). Josh: "definitely least confident about
  all the < shape ones". It shows the start effect: interlock-small 7.5 from a
  touching start, its mirror 20.5 from a far start.
