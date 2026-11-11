# Rankings so far (2026-11-11, 5 participants)

Mean distance in px between each model's predicted position and the
participant's choice, over 7 widgets (all but w7). Computed by pasting each block into the
proposal page's paste box (`node results/rank.mjs` reruns it). Lower is closer.

| Model                       | 01-anon | 02-josh | 03-jz | 04-anon | 05-anon | Mean |
| --------------------------- | ------- | ------- | ----- | ------- | ------- | ---- |
| (k) power mean p −3, cap 40 | 2.2     | 1.7     | 2.1   | 1.8     | 2.3     | 2.0  |
| (l) hull, p −8              | 2.0     | 2.3     | 3.2   | 2.2     | 2.3     | 2.4  |
| (d) pair white area         | 3.1     | 2.2     | 2.9   | 1.1     | 4.0     | 2.7  |
| (b) area model              | 4.1     | 2.2     | 2.3   | 1.6     | 5.2     | 3.1  |
| (k) power mean p −8         | 3.2     | 3.8     | 3.0   | 3.2     | 3.2     | 3.3  |
| contact                     | 4.0     | 5.0     | 5.0   | 5.4     | 2.5     | 4.4  |
| (g) opening r 4             | 4.2     | 4.9     | 5.8   | 4.3     | 3.4     | 4.5  |
| (a) straight-line           | 3.4     | 5.3     | 5.6   | 6.0     | 2.9     | 4.6  |
| (k) harmonic mean p −1      | 5.4     | 4.6     | 4.2   | 3.4     | 6.0     | 4.7  |
| box gap                     | 5.2     | 5.0     | 6.2   | 5.2     | 6.4     | 5.6  |
| (g) opening r 8             | 6.4     | 6.9     | 6.2   | 6.4     | 5.6     | 6.3  |
| (k) mean gap p 1            | 7.3     | 5.9     | 5.5   | 4.9     | 8.2     | 6.4  |
| (i) fillet R 30             | 11.1    | 10.1    | 9.7   | 8.8     | 11.5    | 10.2 |
| (i) fillet R 60             | 10.7    | 10.6    | 11.4  | 10.6    | 11.4    | 10.9 |

Notes:

- Widget 7 (the airplane in a pill) is dropped from every ranking and fit:
  padding against a container's wall is a separate problem, and Josh judged it
  too noisy. Its line stays in each result file. Every row above was
  recomputed over the other 7 widgets.
- The four (k) power mean rows and the (l) hull row were fit to these same five responses
  (`fitRun.ts`, the page's "Fitting one model to the responses"), so their
  distances here are in-sample and flatter them.

- 04-anon has the same w1 and w2 values as 02-josh (15.5 and 27.0). Before the
  2026-11-11 reset fix, the survey restored saved slider positions on reload,
  so 04 may have started from Josh's positions if it ran in the same browser.
- Squint: 02-josh used 3.5 px; the others used none.
- Two groups so far. 02, 03 and 04 set widget 1 (square to triangles) at 14 to
  15.5 px and match the area models best. 01 and 05 set it at 23 and 28.5 px and
  match contact or straight-line best. Widget 1 separates the groups most.
