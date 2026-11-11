# Results of "Spacing by eye, part 2"

Each file here is one person's block from `survey2.html`, pasted as it came,
named like part 1's: `01-anon.txt`, `02-josh.txt`, and so on. A block starts
with `optical-spacing-survey v2`; then come `name:`, `squint:`, `zoom:`,
`screen:` (the window width in px) and one line per widget:
`w<id> <key> <value>`, where the value is the box gap in px of the pair being
set, or `unset`. The ids and keys, and what each widget is for, are in
`../../survey2_design.md`.

The ranking page (`page.html`) ranks part 1 only. Its paste box recognizes a v2
block and says it belongs here instead of reading its `w` lines as part 1's
widgets, and the saved part 1 responses it plots come only from `../*.txt`, not
from this folder.

Not built yet: the analysis in `survey2_design.md` (noise from the repeats,
strategy variance, clustering people on the discriminating widgets, the
controls and the scaled copies). It needs a script that reads these files,
which is worth writing once a few responses are in.
