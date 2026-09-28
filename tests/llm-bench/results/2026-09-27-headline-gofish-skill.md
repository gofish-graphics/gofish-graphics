# LLM authoring benchmark headline: GoFish with the skill, 2026-09-27

This is the four-library comparison with the GoFish arm presented as the skill,
the default since the context experiment
(`2026-09-27-context-experiment.md`). The model is claude-opus-5-5 on the
claude-code backend, with 2 samples per task and up to 3 turns per job, over
all 33 create and edit tasks. Chains are not included.

Sources:

- The GoFish jobs come from run `2026-09-27T22-33-58-606Z-run`
  (`--context skill`).
- The Recharts, D3 and Matplotlib jobs come from runs
  `2026-09-27T21-19-02-879Z-run`, `2026-09-27T21-38-02-565Z-run`,
  `2026-09-27T22-17-55-385Z-run` and `2026-09-27T22-18-52-182Z-run`. The other
  arms get no docs, so the context change does not affect them.
- Code metrics are for each job's final program.
  - Arithmetic ops count `+ - * / % **`, their compound forms and `Math.*`
    calls.
  - Syntax tokens count identifiers, keywords, literals, operators and
    punctuation, without whitespace or comments.

### All tasks

| library        | jobs | pass | partial | fail | arithmetic ops median (mean) | syntax tokens median (mean) |
| -------------- | ---- | ---- | ------- | ---- | ---------------------------- | --------------------------- |
| GoFish (skill) | 62   | 76%  | 0%      | 24%  | 0.0 (9.7)                    | 140 (296)                   |
| Recharts       | 62   | 98%  | 0%      | 2%   | 12.0 (21.5)                  | 364 (453)                   |
| D3             | 62   | 100% | 0%      | 0%   | 15.0 (17.5)                  | 662 (652)                   |
| Matplotlib     | 62   | 97%  | 0%      | 3%   | 8.5 (14.6)                   | 339 (380)                   |

### Common tasks

| library        | jobs | pass | partial | fail | arithmetic ops median (mean) | syntax tokens median (mean) |
| -------------- | ---- | ---- | ------- | ---- | ---------------------------- | --------------------------- |
| GoFish (skill) | 40   | 82%  | 0%      | 18%  | 0.0 (1.4)                    | 125 (161)                   |
| Recharts       | 40   | 98%  | 0%      | 2%   | 9.0 (11.1)                   | 278 (297)                   |
| D3             | 40   | 100% | 0%      | 0%   | 12.0 (12.0)                  | 575 (606)                   |
| Matplotlib     | 40   | 100% | 0%      | 0%   | 1.0 (3.4)                    | 218 (243)                   |

### Beyond-defaults tasks

| library        | jobs | pass | partial | fail | arithmetic ops median (mean) | syntax tokens median (mean) |
| -------------- | ---- | ---- | ------- | ---- | ---------------------------- | --------------------------- |
| GoFish (skill) | 22   | 64%  | 0%      | 36%  | 3.0 (24.8)                   | 250 (542)                   |
| Recharts       | 22   | 100% | 0%      | 0%   | 35.0 (40.4)                  | 658 (737)                   |
| D3             | 22   | 100% | 0%      | 0%   | 22.0 (27.5)                  | 728 (735)                   |
| Matplotlib     | 22   | 91%  | 0%      | 9%   | 25.0 (34.9)                  | 506 (629)                   |
