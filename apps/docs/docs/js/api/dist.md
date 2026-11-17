---
title: Dist
---

# Dist

The `Dist` family holds distributions. A distribution is a value a channel
reads through its members: `d.density()` and `d.support()` are functions of
`t` for the shape form of [`ribbon`](/js/api/marks/ribbon#function-channels)
and [`line`](/js/api/marks/line#function-channels), and `d.median()` is one
value per group for any channel.

::: gofish

```js
const d = gf.Dist.normal({ mean: "mean", sd: "sd" });

gf.chart([{ mean: 0, sd: 1 }])
  .mark(gf.ribbon({ x: d.support(), h: d.density(), fill: "#4c78a8" }))
  .render(root, { w: 400, h: 200, axes: true });
```

:::

## Signature

```ts
Dist.normal({ mean, sd });
Dist.lognormal({ meanlog, sdlog });
Dist.uniform({ min, max });
Dist.exponential({ rate });
Dist.sample(values, { bandwidth? });
Dist.units(variable, mass);

d.density();
d.cdf();
d.support();
d.quantile(p);
d.median();
d.mean();
d.mass();
d.bin(p);
```

The family is also a module of its own:

```ts
import { Dist } from "gofish-graphics";
import { normal } from "gofish-graphics/dist"; // the same function as Dist.normal
```

## Families

| Member                               | The distribution                                                          |
| ------------------------------------ | ------------------------------------------------------------------------- |
| `Dist.normal({ mean, sd })`          | The normal distribution with mean `mean` and standard deviation `sd`.     |
| `Dist.lognormal({ meanlog, sdlog })` | `exp` of a normal with mean `meanlog` and standard deviation `sdlog`.     |
| `Dist.uniform({ min, max })`         | The uniform distribution from `min` to `max`.                             |
| `Dist.exponential({ rate })`         | The exponential distribution with rate `rate`, so its mean is `1 / rate`. |

Each parameter is a number, a column name, or a value expression such as
`field("t").mean()`. A column is read over each group's rows, and it must
have one value in the group. A column with several values in one group is an
error. A family's wire form is data, so it serializes.

## Members

| Member          | Gives                                                                | Unit                      |
| --------------- | -------------------------------------------------------------------- | ------------------------- |
| `d.density()`   | a function of `t`: the mass times the probability density            | the mass per the variable |
| `d.cdf()`       | a function of `t`: the share of the mass at or below `t`             | a ratio                   |
| `d.support()`   | a function of `t`: `t` itself, over the same interval as the density | the variable              |
| `d.quantile(p)` | the value with the share `p` of the mass at or below it              | the variable              |
| `d.median()`    | `d.quantile(0.5)`                                                    | the variable              |
| `d.mean()`      | the mean                                                             | the variable              |
| `d.mass()`      | 1 for a family, the number of values for a sample                    | a probability, or a count |

The functions run over the interval the density is drawn over. For a family
that is its support, cut at the 0.001 and 0.999 quantiles where the support
has no end: a normal runs from its 0.001 to its 0.999 quantile, a lognormal
and an exponential from 0 to their 0.999 quantile. For a sample it is the
least value to the greatest.

The variable of a family is the quantity of the column its location
parameter reads (`mean` for `normal`, `min` for `uniform`), so the axis of
`d.support()` joins an axis over that column. Otherwise it is named
"value". A density is in the mass per the variable's unit, or per a
difference of two of its values (a density over times is per duration). A
density adds up, so densities stack.

## Cells: `d.bin(p)`

`d.bin(p)` is a key for [`partition`](/js/api/operators/partition#a-distribution-s-cells):
the cells of `p` (`Bin.step`, `Bin.thresholds` or `Bin.quantiles`) over the
interval the density is drawn over. `Bin.quantiles(n)` cuts at the
distribution's own quantiles, so each cell holds `1 / n` of the mass. In a
cell, every member is the distribution restricted to the cell: the density
and the support run over the cell, `d.mass()` is the cell's share of the
mass, and `d.median()` is the median of the mass in the cell. A member of a
distribution, such as `d.density().bin(p)`, is not binned, and is an error.

```ts
const d = Dist.normal({ mean: "mean", sd: "sd" });
partition({ by: d.bin(Bin.quantiles(5)), dir: "x" });
```

## `Dist.sample(values, { bandwidth? })`

The distribution of a sample of values, as R's distributional package holds
one (`dist_sample`). Its quantiles, median and mean are the values' own
(type-7 quantiles, as `field(x).median()`). Its density is a normal kernel
density with area the number of values, over the least to the greatest
value, reflected at both ends. `bandwidth` is the kernel's standard
deviation; without it, it is Silverman's rule (R's `bw.nrd0`). Missing
values are left out. A sample of fewer than two different values has
quantiles but no density.

`Dist.sample` gives a distribution at run time, not an expression. A
[`reduce`](/js/api/operators/spread#map-and-reduce) that returns one is
lifted by its shape, as any record is:

```ts
const mass = field("Body Mass (g)").reduce(
  (xs) => Dist.sample(xs, { bandwidth: 100 }),
  { unit: Dist.units("g", "count") }
);

ribbon({ x: mass.support(), h: mass.density() });
```

`field(x).density()` and the other
[distribution members](/js/api/operators/spread#distribution-members) of a
field are `Dist.sample` with the default bandwidth.

## `Dist.units(variable, mass)`

The `unit` option of a reduce that returns a distribution over amounts in
`variable`, with its mass in `mass`. Each is a unit's name or a `Unit`. It
gives a record that mirrors the distribution's members, with the units in
the table above.
