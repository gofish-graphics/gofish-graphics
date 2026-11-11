# Rankings so far (2026-11-11, 5 participants)

Mean distance in px between each model's predicted position and the
participant's choice, over all 8 widgets. Computed by pasting each block into the
proposal page's paste box (`node results/rank.mjs` reruns it). Lower is closer.

| Model               | 01-anon | 02-josh | 03-jz | 04-anon | 05-anon | Mean |
| ------------------- | ------- | ------- | ----- | ------- | ------- | ---- |
| (d) pair white area | 3.6     | 2.8     | 3.1   | 1.2     | 4.4     | 3.0  |
| (b) area model      | 4.0     | 2.4     | 2.2   | 2.0     | 5.0     | 3.1  |
| contact             | 3.7     | 4.5     | 4.8   | 6.0     | 2.4     | 4.3  |
| (a) straight-line   | 3.0     | 4.7     | 5.3   | 6.4     | 2.6     | 4.4  |
| (g) opening r 4     | 4.8     | 5.4     | 6.5   | 6.0     | 4.1     | 5.4  |
| box gap             | 4.8     | 4.6     | 5.9   | 5.9     | 5.8     | 5.4  |
| (g) opening r 8     | 7.1     | 7.6     | 7.3   | 8.2     | 6.4     | 7.3  |
| (i) fillet R 30     | 10.0    | 9.2     | 8.5   | 8.3     | 10.4    | 9.3  |
| (i) fillet R 60     | 9.8     | 9.8     | 10.1  | 9.9     | 10.4    | 10.0 |

Notes:

- 04-anon has the same w1 and w2 values as 02-josh (15.5 and 27.0). Before the
  2026-11-11 reset fix, the survey restored saved slider positions on reload,
  so 04 may have started from Josh's positions if it ran in the same browser.
- Squint: 02-josh used 3.5 px; the others used none.
- Two groups so far. 02, 03 and 04 set widget 1 (square to triangles) at 14 to
  15.5 px and match the area models best. 01 and 05 set it at 23 and 28.5 px and
  match contact or straight-line best. Widget 1 separates the groups most.
