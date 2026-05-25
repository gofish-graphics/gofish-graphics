---
title: Overview
section: Layout & Rendering
order: 60
group: Scale Resolution
status: draft
---

# Scale Utilities

A checkpoint of current thinking on position scales and statistical data types.

Position scales can be described roughly by statistical data type:

- nominal and ordinal positions use labels (eg bar chart). unlike current frameworks that typically
  treat it like nominal/ordinal _cast/coerced_ to a ratio scale
- interval positions use ticks that emphasize size, not position (eg map scales, but also for use in
  streamgraph etc)
- ratio position use ticks with absolute positions (and possibly a zero point). conventional scales

During inference/resolution, scales may start out as interval and be elevated to ratio. For example,
the height of a rectangle is an interval quantity, but it can be elevated to a ratio quantity by
alignment, eg. (TODO: As I'm writing this I'm wondering if the size is actually some kind of ratio
thing (maybe not a ratio position yet because the position is undefined?) so maybe it is not having
any sway over the conversion to an interval scale and that has to do with shape embedding...)
