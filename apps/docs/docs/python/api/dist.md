---
title: Dist
---

# Dist

The `Dist` family holds distributions. A distribution is a value a channel
reads through its members: `d.density()` and `d.support()` are functions of
`t` for the shape form of
[`ribbon`](/python/api/marks/ribbon#function-channels) and
[`line`](/python/api/marks/line#function-channels), and `d.median()` is one
value per group for any channel.

```python
d = Dist.normal(mean="mean", sd="sd")

chart([{"mean": 0, "sd": 1}]).mark(
    ribbon(x=d.support(), h=d.density(), fill="#4c78a8")
)
```

## Signature

```python
Dist.normal(mean=..., sd=...)
Dist.lognormal(meanlog=..., sdlog=...)
Dist.uniform(min=..., max=...)
Dist.exponential(rate=...)
d.density()
d.cdf()
d.support()
d.quantile(p)
d.median()
d.mean()
d.mass()
```

The family is also a module of its own:

```python
from gofish import Dist
from gofish.dist import normal  # the same function as Dist.normal
```

## Families

| Member                                   | The distribution                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `Dist.normal(mean=..., sd=...)`          | The normal distribution with mean `mean` and standard deviation `sd`.     |
| `Dist.lognormal(meanlog=..., sdlog=...)` | `exp` of a normal with mean `meanlog` and standard deviation `sdlog`.     |
| `Dist.uniform(min=..., max=...)`         | The uniform distribution from `min` to `max`.                             |
| `Dist.exponential(rate=...)`             | The exponential distribution with rate `rate`, so its mean is `1 / rate`. |

Each parameter is a number, a column name, or a value expression such as
`field("t").mean()`. A column is read over each group's rows, and it must
have one value in the group. A column with several values in one group is an
error. A distribution goes on the wire as data, and JS computes it, with no
call into Python.

## Members

| Member          | Gives                                                                | Unit                      |
| --------------- | -------------------------------------------------------------------- | ------------------------- |
| `d.density()`   | a function of `t`: the mass times the probability density            | the mass per the variable |
| `d.cdf()`       | a function of `t`: the share of the mass at or below `t`             | a ratio                   |
| `d.support()`   | a function of `t`: `t` itself, over the same interval as the density | the variable              |
| `d.quantile(p)` | the value with the share `p` of the mass at or below it              | the variable              |
| `d.median()`    | `d.quantile(0.5)`                                                    | the variable              |
| `d.mean()`      | the mean                                                             | the variable              |
| `d.mass()`      | 1                                                                    | a probability             |

The functions run over the interval the density is drawn over: the support,
cut at the 0.001 and 0.999 quantiles where the support has no end. A normal
runs from its 0.001 to its 0.999 quantile, a lognormal and an exponential
from 0 to their 0.999 quantile.

The variable of a family is the quantity of the column its location
parameter reads (`mean` for `normal`, `min` for `uniform`), so the axis of
`d.support()` joins an axis over that column. Otherwise it is named
"value". A density is in the mass per the variable's unit, or per a
difference of two of its values (a density over times is per duration). A
density adds up, so densities stack.

The distribution of a group's values is `field(x).density()` and the other
[distribution members](/python/api/operators/spread#distribution-members) of
a field. A Python reduce cannot return a distribution: its density is a
function of `t`, which cannot cross the bridge.
