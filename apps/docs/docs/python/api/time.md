---
title: time
---

# time

The `time` namespace holds the constructs that lay a chart out in time:
`time.sequence`, `time.history`, `time.transition`, `time.stagger` and
`time.parallel`. See the [JavaScript `time` page](/js/api/time) for what each
one does.

::: warning Not available in Python yet
The serialized form of these constructs is defined, and the JavaScript
renderer reads it, but the Python factories are not generated yet. The table
below is the wire form they will write.
:::

## Signature

```python
time.sequence(by, duration=None, loop=None, playing=None, at=None, on=None, cyclic=None)
time.history(last=None)
time.transition(along=None, at=None, curve=None, enter=None, exit=None, ...)
time.stagger(lag=None, spacing=None, dwell=None, by=None, from_=None)
time.parallel()
```

## Parameters

::: gofish-ref time.sequence time.history time.transition time.stagger time.parallel
:::
