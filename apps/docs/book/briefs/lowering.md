---
chapter: lowering
question: How does a chart chain become operators, and then constraints?
label: Lowering
words: 1100
---

## Must answer

- The three levels a spec passes through: the fluent chain (`chart(data).flow(...).mark(...)`), the direct-style operators applied to an explicit list of children (`spread(opts, [a, b])`, `layer([...])`), and the constraints or relations those operators install (`align`, `distribute`, `position`).
- How each level is turned into the next: which function does it, when it runs, and what it needs to know.
- What the user could have written by hand at each level to get the same picture. Show the same small chart written three ways.
- What an operator in `.flow()` does with data (splitting rows into groups) that the direct-style form does not, and where that work happens.
- What is not lowered this way today (operators or marks that skip a level).

## Figure

One small chart shown at the three levels side by side: the chain, the equivalent direct-style code, and the constraints as a list, with lines linking each part of the chain to what it became. Use the tree stepper if stepping reads better than side by side.

## Notes

- 2026-11-13, Josh: "specifically like lowering the chart pipeline to direct-style operators to constraints/relations. maybe that's a separate issue in addition to the overall pipeline"
