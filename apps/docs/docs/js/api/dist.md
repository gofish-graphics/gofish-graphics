---
title: Dist
---

# Dist

The `Dist` family holds distributions. A distribution is a value a channel
reads through its members: `d.density()` and `d.domain()` are functions of
`t` for the shape form of [`ribbon`](/js/api/marks/ribbon#function-channels)
and [`line`](/js/api/marks/line#function-channels), and `d.median()` is one
value per group for any channel. A column can hold a distribution too:
[`kde`](#kde) smooths a group's values into one, and
[`field(x)`](/js/api/operators/spread#distribution-members) reads it through
the same members.

::: gofish

```js
const d = gf.Dist.normal({ mean: "mean", sd: "sd" });

gf.chart([{ mean: 0, sd: 1 }])
  .mark(gf.ribbon({ x: d.domain(), h: d.density(), fill: "#4c78a8" }))
  .render(root, { w: 400, h: 200, axes: true });
```

:::

## Signature

```ts
Dist.normal({ mean, sd });
Dist.lognormal({ meanlog, sdlog });
Dist.uniform({ min, max });
Dist.exponential({ rate });
kde(column, { bandwidth? }); // a derive helper

d.density();
d.cdf();
d.domain();
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
| `d.domain()`    | a function of `t`: `t` itself, over the same interval as the density | the variable              |
| `d.quantile(p)` | the value with the share `p` of the mass at or below it              | the variable              |
| `d.median()`    | `d.quantile(0.5)`                                                    | the variable              |
| `d.mean()`      | the mean                                                             | the variable              |
| `d.mass()`      | 1 for a family, the number of values for a kernel density            | a probability, or a count |

The members describe one distribution. The density's area over the whole
line is the mass. The cdf is the density's integral over the mass, the
quantile is the inverse of the cdf, the median is `d.quantile(0.5)`, and
the mean is the density's mean.

The functions run over the interval the density is drawn over. For a family
that is its support, cut at the 0.001 and 0.999 quantiles where the support
has no end: a normal runs from its 0.001 to its 0.999 quantile, a lognormal
and an exponential from 0 to their 0.999 quantile. For a kernel density it
runs from 3 bandwidths below the least value to 3 above the greatest, so the
density tapers to near zero at both ends.

`d.domain()` is the interval GoFish draws the density over. It is not the
distribution's support when the support is unbounded: a normal's support is
every number, and its `d.domain()` ends at its 0.001 and 0.999 quantiles.

The variable of a family is in the unit of the column its location
parameter reads (`mean` for `normal`, `min` for `uniform`), so the axis of
`d.domain()` joins an axis in that unit. It is not that column, so it has
no name, and its axis has no title unless you give one. A density is in the mass per the variable's unit, or per a
difference of two of its values (a density over times is per duration). A
density adds up, so densities stack.

## Cells: `d.bin(p)`

`d.bin(p)` is a key for [`partition`](/js/api/operators/partition#a-distribution-s-cells):
the cells of `p` (`Binning.step`, `Binning.thresholds` or `Binning.quantiles`) over the
interval the density is drawn over. `Binning.quantiles(n)` cuts at the
distribution's own quantiles, so each cell holds `1 / n` of the mass. In a
cell, every member is the distribution restricted to the cell: the density
and the domain run over the cell, `d.mass()` is the cell's share of the
mass (a cell at an end of the interval also holds the tail past it), and
`d.median()` is the median of the mass in the cell. A member of a
distribution, such as `d.density().bin(p)`, is not binned, and is an error.

```ts
const d = Dist.normal({ mean: "mean", sd: "sd" });
partition({ by: d.bin(Binning.quantiles(5)), dir: "x" });
```

## `kde(column, { bandwidth? })` {#kde}

A helper for [`derive`](/js/api/operators/derive#data-helpers):
`derive(kde("x"))` takes the rows as a sample of the column `x`, and gives
one row whose `x` holds the sample's kernel density. The row also holds
every other column whose value is the same in all the rows, such as a
group's species after a split by it. In a flow after a split, `derive` runs
in each group, so each group's column holds its own distribution. No rows
give no row.

The density is a normal kernel on each value, with area the number of
values, so the densities of several groups add up. `bandwidth` is the
kernel's standard deviation, in the column's unit; without it, it is
Silverman's rule (R's `bw.nrd0`), and a sample of fewer than two different
values is an error that asks for one. Missing values are left out. The
density is drawn from 3 bandwidths below the least value to 3 above the
greatest, as seaborn's `cut=3` draws it. Past 3 bandwidths a kernel has
0.135% of its mass, so the area over the drawn interval is the number of
values less at most that share at each end. There is no option yet to
choose how far past the values the density runs, or to bound it at a hard
limit, such as 0 for counts.

The column keeps its name and unit, so `field("x").domain()` joins the
axis of `x`. A field of the column reads the distribution: its
[members](/js/api/operators/spread#distribution-members) are those above,
and `field("x").bin(Binning.quantiles(n))` is a key for
[`partition`](/js/api/operators/partition#a-distribution-s-cells) that cuts
it at its own quantiles. `field("x").median()` is the distribution's median,
not the data's.

```ts
const mass = field("Body Mass (g)");

chart(penguins)
  .flow(spread({ by: "Species", dir: "x" }), derive(kde("Body Mass (g)")))
  .mark(ribbon({ y: mass.domain(), w: mass.density(), fill: "Species" }));
```

### The data's own summaries

A summary of the data, such as its median, is read before the `kde`, while
the rows are still the data. A column whose value is the same in a group's
rows is kept in the `kde`'s row. Here each violin's dot is its species'
median body mass, from the rows:

::: gofish

```js
const col = "Body Mass (g)";
const mass = gf.field(col);
// Each group's median, as a column of every row.
const withMedian = (rows) => {
  const xs = rows
    .map((r) => r[col])
    .filter((x) => x != null)
    .sort((a, b) => a - b);
  const h = xs.length / 2;
  const median = xs.length % 2 ? xs[Math.floor(h)] : (xs[h - 1] + xs[h]) / 2;
  return rows.map((r) => ({ ...r, median }));
};

gf.chart(penguins)
  .flow(
    gf.spread({ by: "Species", dir: "x", spacing: 64 }),
    gf.derive(withMedian),
    gf.derive(gf.kde(col))
  )
  .mark(
    gf.layer([
      gf.stack({ dir: "x", baseline: gf.Baseline.middle() }, [
        gf.ribbon({ y: mass.domain(), w: mass.density(), fill: "Species" }),
      ]),
      gf.circle({ cy: "median", r: 3, fill: "white" }),
    ])
  )
  .render(root, { w: 400, h: 300, axes: true });
```

:::

Other tools draw the same: ggplot2 4.0's `geom_violin` draws its
`quantiles` from the data under a kernel density body, ggdist pairs a
density estimate with the data's empirical cdf, and seaborn's `violinplot`
draws the data's quartiles (`inner="quart"`) on a kernel density.

### As data

A distribution in a column is data, a plain record, so it serializes and
crosses to and from Python:

```ts
{ type: "dist", family: "kde", params: { values: [3750, 3800, ...], bandwidth: 100 } }
{ type: "dist", family: "normal", params: { mean: 0, sd: 1 } }
```

The first is what `kde` makes: the values it smooths, and the bandwidth when
one is given. The second is a family with numbers for its parameters, the
wire form of `Dist.normal({ mean: 0, sd: 1 })`. A column may hold either.
