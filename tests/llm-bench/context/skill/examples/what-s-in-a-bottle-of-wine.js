// What's in a Bottle of Wine
// A wine bottle sliced into proportional bands by ingredient and exploded into a vertical stack, with each slice labeled by category and its share of the bottle.

import { Constraint, chart, image, layer, spread, text } from "gofish-graphics";
import bottlePng from "./wilsonblanco.png";
const bottleData = [
  { category: "Marketing", amount: 6 },
  { category: "Pretentiousness", amount: 7 },
  { category: "Sulfites", amount: 2 },
  { category: "Tannins", amount: 3 },
  { category: "Water", amount: 40 },
  { category: "Grape juice", amount: 42 },
];
const container = document.getElementById("app");
// The cut ties each slice's image band to data order (slice i = band i,
// top→bottom). To land Grape juice (the bulk) at the BOTTOM showing the
// bottle BODY, it must be the LAST data row (bottom band) AND positioned
// last — so reverse the data and keep `reverse: true` on the spread.
chart([...bottleData].reverse())
  .flow(spread({ dir: "y", spacing: 20, reverse: true }))
  .mark(
    image({ href: bottlePng, w: 193, h: 600 }).cut({
      dir: "y",
      size: "amount",
      inset: 4,
    }),
  )
  .layer(
    chart().mark((data) =>
      layer(
        data.map((d) =>
          layer([
            d.name("slice"),
            text({
              fontSize: 18,
              fontWeight: "bold",
              fill: "#1c5e20",
              text: d.datum.category,
            }).name("label"),
            text({
              fontSize: 36,
              fontFamily: "Impact",
              fill: "#1c5e20",
              text: `${d.datum.amount}`,
            }).name("amount"),
          ]).relate(({ slice, label, amount }) => [
            Constraint.align({ y: "middle" }, [slice, label]),
            Constraint.distribute({ dir: "x", spacing: 12 }, [slice, label]),
            Constraint.align({ x: "middle" }, [slice, amount]),
            Constraint.align({ y: "middle" }, [slice, amount]),
          ]),
        ),
      ),
    ),
  )
  .render(container, { axes: false });
