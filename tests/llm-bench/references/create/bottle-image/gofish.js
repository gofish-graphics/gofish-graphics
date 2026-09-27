import {
  chart,
  spread,
  rect,
  image,
  text,
  layer,
  paint,
  v,
  Constraint,
} from "gofish-graphics";

// The gallery's bottle fill chart (stories/piccl/Bottle.stories.tsx).
// `paint` draws the image in grayscale and lays the liquid rect over it in
// the "color" blend mode, only where the image is opaque.
export default function render(container, data) {
  return chart(data, { axes: false })
    .flow(
      spread({ by: "wine", dir: "x", spacing: 82 }).label("wine", {
        position: "outset-bottom",
      })
    )
    .mark(
      layer([
        paint({ blendMode: "color" }, [
          // 100% is the image's full height, which render() sets to 240 px
          image({ href: "/assets/bottle.png", h: v(100) }),
          rect({ w: 58, h: "fill_pct", fill: "#00c853" }),
        ]).name("bottle"),
        rect({ w: 58, h: 1, y: "fill_pct", fill: "#666666" }).name("line"),
        text({
          text: (d) => `${d.fill_pct}%`,
          fill: "#666666",
          fontSize: 14,
        }).name("label"),
      ]).relate(({ line, label }) => [
        // the label sits just right of the line's end, centered on it
        Constraint.align({ y: "middle" }, [line, label]),
        Constraint.distribute({ dir: "x", spacing: 4 }, [line, label]),
      ])
    )
    .render(container, { h: 240 });
}
