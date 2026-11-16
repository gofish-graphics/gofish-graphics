# fun

Makes a function value: a function of `t` over an interval. The shape form
of [`ribbon`](/js/api/marks/ribbon#function-channels) and
[`line`](/js/api/marks/line#function-channels) reads it in a channel, at one
parameter `t`.

## Signature

```ts
fun(at, { domain, knots? })
f.support()
```

## Parameters

| Option   | Type                    | Default  | Description                                                                                |
| -------- | ----------------------- | -------- | ------------------------------------------------------------------------------------------ |
| `at`     | `(t: number) => number` | required | The function's value at `t`.                                                               |
| `domain` | `[min, max]`            | required | The interval of `t` the function is defined over. Both ends are finite, and `min < max`.   |
| `knots`  | `number[]`              | none     | Places in the domain where the function may bend sharply. A mark splits its drawing there. |

## The value

A function value is the same function in every group. Its methods:

- `f.support()` is `t ↦ t` over the domain of `f`. It is the position
  channel that reads `f` at the mark's parameter:
  `line({ x: f.support(), y: f })`.

A mark draws a function value by sampling it until the drawn path is within
half a pixel of the function, and it finds the function's extent the same
way. Under a coordinate transform the path is resampled again through the
transform.

A function value is only valid in a channel of the shape form of `ribbon` and
`line`. In any other mark's channel it is a type error and a run-time error.
A plain JS function in a channel is still a row accessor, as before.

A function value has no JSON form, so a spec that holds one does not
serialize it.

## Example

```ts
const trend = fun((t) => 1.5 * t + 0.3, { domain: [1, 3] });

layer([
  chart(points)
    .flow(scatter({ x: "x", y: "y" }))
    .mark(circle({ r: 3 })),
  line({ x: trend.support(), y: trend }),
]).render(container, { w: 400, h: 300 });
```
