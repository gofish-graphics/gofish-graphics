# Rankings so far (2026-11-11, 4 participants)

Mean distance in px between each model's predicted position and the
participant's choice, over all 8 widgets. Computed by pasting each block into the
proposal page's paste box (`node results/rank.mjs` reruns it). Lower is closer.

| Model               | 01-anon | 02-josh | 03-jz | 04-anon | Mean |
| ------------------- | ------- | ------- | ----- | ------- | ---- |
| (b) area model      | 4.0     | 2.4     | 2.2   | 2.0     | 2.7  |
| (d) pair white area | 3.6     | 2.8     | 3.1   | 1.2     | 2.7  |
| contact             | 3.7     | 4.5     | 4.8   | 6.0     | 4.8  |
| (a) straight-line   | 3.0     | 4.7     | 5.3   | 6.4     | 4.9  |
| box gap             | 4.8     | 4.6     | 5.9   | 5.9     | 5.3  |
| (g) opening r 4     | 4.8     | 5.4     | 6.5   | 6.0     | 5.7  |
| (g) opening r 8     | 7.1     | 7.6     | 7.3   | 8.2     | 7.6  |
| (i) fillet R 30     | 10.0    | 9.2     | 8.5   | 8.3     | 9.0  |
| (i) fillet R 60     | 9.8     | 9.8     | 10.1  | 9.9     | 9.9  |

Notes:

- 04-anon has the same w1 and w2 values as 02-josh (15.5 and 27.0). Before the
  2026-11-11 reset fix, the survey restored saved slider positions on reload,
  so 04 may have started from Josh's positions if it ran in the same browser.
- Squint: 02-josh used 3.5 px; the others used none.
