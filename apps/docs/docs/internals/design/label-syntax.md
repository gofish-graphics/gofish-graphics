---
title: Labels
section: Frontend
order: 60
status: draft
---

# Label Syntax

Scratch notes exploring possible surface syntaxes for labels, label styling, and
related string-valued props (`stroke`, `h`). These are sketches, not decisions.

## Label and style spellings

```ts
({
  label: align("x-middle", "y-middle"),
});
//
({
  label: style({ x: "middle", y: "middle", color: "red" }),
})(
  //
  {
    label: align.middle("x") + align.middle("y"),
  }
)(
  //
  {
    label: align.middle("x") + align.middle("y"),
  }
)(
  //
  {
    label: "x-middle + y-middle",
  }
)(
  //
  {
    label: "count",
  }
)(
  //
  {
    label: "count" + align("x-middle y-middle"),
  }
)(
  //
  {
    label: "count" + style("x-middle y-middle red"),
  }
);

label: ((d) => count + " (g)") + align("x-middle y-middle");
label: "count (align x-middle y-middle)";

label: label("count") + align("x-middle y-middle");

label: "count";

h: norm("count");
h: col("sales_q1") + col("sales_q2");
h: "count";
h: v(myRandomFunction(oiaenrtoeiarsotein)) + "";

label: "$key";
labelStyle: "x-middle y-middle red";
stroke: "2pt + red";
stroke: "2pt red";
```

## Labeling a selected subset of a layer

```ts
layer([
  ...,
  chart(selectAll("bars").when((d) => d < 10)).mark(label("count", {align: {x: "middle", y: "middle"}}))
]
)
```
