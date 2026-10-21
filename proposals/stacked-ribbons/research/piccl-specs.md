# PiCCL original specifications: school days, Beatles, trade chord

Source: the PiCCL site (https://piccl.github.io/) is a Vue single-page app. Its example index lives in the bundle chunk `https://piccl.github.io/assets/index-Bg8IKDE7.js`, which lists each example as `{name, image, code, workspace}`. The example page (`/example/<name>`) fetches the `code` path and shows it as the spec. The code files below were fetched verbatim from those paths on 2026-10-20. Each file is the whole spec: `data`, `container` and `pictures` are supplied by the page, so there is no data loading boilerplate to trim.

## 1. "7 emotional school days"

- Example URL: https://piccl.github.io/example/7%20emotional%20school%20days
- Source file: https://piccl.github.io/examples/codes/emotions.txt
- Data files (named in the spec): `days.csv`, `emotions.csv`, `links.csv`

```js
const palette = [
  "rgb(235,207,79)",
  "rgb(159,115,166)",
  "rgb(217,129,88)",
  "rgb(121,178,86)",
  "rgb(159,205,213)",
];
const creatBarChart = () => {
  const waterDrop = new PICCL.Picture({
    url: "water_drop.svg",
    height: 15,
  }).mapValue("color", "emotion", { palette });
  const row = PICCL.repeat(waterDrop, "count").stackLayout("x", 2);
  const label = new PICCL.Text({ textAnchor: "end" }).mapValue(
    "content",
    "day"
  );
  const rowWithLabel = PICCL.union([row, label]).pointSnap(label, row, {
    anchor: [0, 0.5],
    offset: [-10, -4],
  });
  const chart = PICCL.replicate(rowWithLabel, "day").stackLayout("y", 10);
  return chart;
};
const dayRect = new PICCL.Rect({
  fill: "white",
  height: 30,
  width: 50,
}).mapValue("linkId", "name");
const label = new PICCL.Text({
  fill: "#6a473b",
  fontSize: 30,
  textAnchor: "middle",
}).mapValue("content", "name");
const glyphDay = PICCL.union([dayRect, label]).pointSnap(label, dayRect, {
  anchor: [0.5, 0.3],
});
const daysCollection = PICCL.replicate(glyphDay, "name").stackLayout("x", 120);
const waterCup = new PICCL.Picture({ url: "cup_of_water.png", width: 90 })
  .mapValue("linkId", "emotion")
  .mapValue("color", "emotion");
const emotionLabel = new PICCL.Text({
  fill: "white",
  fontSize: 20,
  textAnchor: "middle",
  fontFamily: "Impact ",
}).mapValue("content", "emotion");
const barChart = creatBarChart();
const glyphEmotion = PICCL.union([waterCup, emotionLabel, barChart])
  .pointSnap(emotionLabel, waterCup, { anchor: [0.5, 0.3] })
  .pointSnap(barChart, waterCup, {
    sourceAnchor: [0.5, 1],
    targetAnchor: [0.5, 0],
    offset: [0, -20],
  });
const emotionsCollection = PICCL.replicate(glyphEmotion, "emotion").stackLayout(
  "x",
  140
);
const composite = PICCL.union([daysCollection, emotionsCollection]).pointSnap(
  daysCollection,
  emotionsCollection,
  { sourceAnchor: [0.5, 0], targetAnchor: [0.5, 1], offset: [0, 400] }
);
const link = PICCL.link(composite, {
  linkByData: true,
  srcDirection: "bottom",
  dstDirection: "top",
  opacity: 0.4,
  shape: "bezier",
  curveness: 300,
})
  .mapValue("linkWidth", "count")
  .mapValue("fill", "target_id");
const drop2 = new PICCL.Picture({
  url: "drop3.png",
  height: 70,
  x: -200,
  y: 500,
}).mapValue("color", "emotion");
const dropAnchor = new PICCL.Rect({ height: 50, width: 0 }).mapValue(
  "linkId",
  "emotion"
);
const dl = new PICCL.Text({
  fill: "white",
  textAnchor: "middle",
  fontSize: 24,
}).mapValue("content", "emotion");
const dg = PICCL.union([drop2, dropAnchor, dl])
  .pointSnap(drop2, dropAnchor)
  .pointSnap(dl, drop2, { offset: [20, -10] });
const dropCollection = PICCL.replicate(dg, "emotion").stackLayout("-y", 70);
const rectForLink = new PICCL.Rect({ width: 50, height: 0, x: -440, y: 580 })
  .mapValue("fill", "emotion")
  .mapValue("linkId", "emotion");
const rectCollection = PICCL.replicate(rectForLink, "emotion").stackLayout(
  "-x",
  -20
);
const left = PICCL.union([rectCollection, dropCollection]).pointSnap(
  dropCollection,
  rectCollection,
  { sourceAnchor: [0, 1], targetAnchor: [1, 0], offset: [100, -100] }
);
const link2 = PICCL.link(left, {
  srcDirection: "bottom",
  dstDirection: "left",
  opacity: 0.4,
  shape: "bezier",
  curveness: 150,
});
const t1 = new PICCL.Text({
  content: "2010",
  fontSize: 200,
  fontWeight: "600",
  fill: "#ddd",
  x: -600,
  y: 650,
});
const t2 = new PICCL.Text({
  content: "7 EMOTIONAL SCHOOL DAYS",
  fontSize: 32,
  fontWeight: "600",
  fill: "#6a473b",
  x: -600,
  y: 600,
});
await PICCL.show(
  [
    [daysCollection, data["days.csv"]],
    [emotionsCollection, data["emotions.csv"]],
    [link, data["links.csv"]],
    [link2, data["emotions.csv"]],
    t1,
    t2,
  ],
  container,
  { pictures }
);
```

## 2. "beatles"

- Example URL: https://piccl.github.io/example/beatles
- Source file: https://piccl.github.io/examples/codes/beatles.txt
- Data files: `songs.csv`, `members.csv`, `links.csv`

```js
const bar = new PICCL.Rect({ width: 2 })
  .mapValue("fill", "writer")
  .mapValue("height", "peak", {
    scale: new PICCL.LinearScale({ range: [200, 0] }),
  })
  .mapValue("linkId", "name");
const note = new PICCL.Picture({ url: "note.png", width: 10 }).mapValue(
  "color",
  "year"
);
const glyph = PICCL.union([bar, note]).pointSnap(note, bar, {
  sourceAnchor: [0.5, 0.5],
  targetAnchor: [0.5, 1],
});

const bars = PICCL.replicate(glyph).stackLayout("x", 5);

const memberImage = new PICCL.Picture({ colorMode: "darkness", width: 150 })
  .mapValue("url", "url")
  .mapValue("color", "name");
const rectForLink = new PICCL.Rect({ width: 60, height: 0 }).mapValue(
  "linkId",
  "name"
);

const memberGlyph = PICCL.union([memberImage, rectForLink]).pointSnap(
  rectForLink,
  memberImage,
  { anchor: [0.5, 1] }
);

const memberCollection = PICCL.replicate(memberGlyph).stackLayout("x", 20);

const composite = PICCL.union([bars, memberCollection]).pointSnap(
  bars,
  memberCollection,
  { sourceAnchor: [0.5, 0], targetAnchor: [0.5, 1], offset: [0, 200] }
);

const link = PICCL.link(composite, {
  linkByData: true,
  srcDirection: "bottom",
  dstDirection: "top",
  shape: "bezier",
  curveness: 100,
}).mapValue("fill", "target_id");

await PICCL.show(
  [
    [bars, data["songs.csv"]],
    [memberCollection, data["members.csv"]],
    [link, data["links.csv"]],
  ],
  container,
  { pictures, padding: 20 }
);
```

## 3. "chord diagram" (the trade network)

- Example URL: https://piccl.github.io/example/chord%20diagram
- Source file: https://piccl.github.io/examples/codes/chord.txt
- Data files: `nodes.csv` (columns used: `id`, `Name`, `Region`, `Total`), `links.csv` (`source_id`, `target_id`, `Amount`, plus `Region`)

```js
const circle = new PICCL.Circle({ r: 800, innerRadius: 780 });

const [chart, arc] = PICCL.divide(circle, "angular", {
  key: "id",
  sizeEncode: "Total",
  gap: 0.5,
});
arc.sort("Region").mapValue("fill", "Region").mapValue("linkId", "id");

const label = new PICCL.Text({ fill: "white", fontSize: 20 }).mapValue(
  "content",
  "Name"
);

PICCL.union([arc, label])
  .pointSnap(label, arc, { anchor: [0.5, 1], offset: [0.5, 20] })
  .orientMatch(label, arc, -90);

const link = PICCL.link(chart, {
  linkByData: true,
  filter: arc,
  opacity: 0.5,
  srcDirection: "inner",
  dstDirection: "inner",
  shape: "arc",
})
  .mapValue("linkWidth", "Amount")
  .mapValue("fill", "Region");

PICCL.show(
  [
    [link, data["links.csv"]],
    [chart, data["nodes.csv"]],
  ],
  container,
  { padding: 250, background: "black" }
);
```

## Related: "sankey diagram"

- Example URL: https://piccl.github.io/example/sankey%20diagram
- Source file: https://piccl.github.io/examples/codes/sankey.txt

```js
const rect = new PICCL.Rect({
  width: 100,
  height: 1000,
  stroke: "white",
  strokeWidth: 2,
})
  .mapValue("height", "Value")
  .mapValue("linkId", "id")
  .mapValue("fill", "Value");

const label = new PICCL.Text({ fill: "white", fontSize: 20 }).mapValue(
  "content",
  "Name"
);

const glyph = PICCL.union([rect, label]).pointSnap(label, rect, {
  anchor: [1, 0.5],
  offset: [10, -7],
});

const stack = PICCL.replicate(glyph, "Name").stackLayout("y", 6);

const collection = PICCL.replicate(stack, "Kind")
  .stackLayout("x", 500)
  .alignLayout("y", 0.5);

const link = PICCL.link(collection, {
  linkByData: true,
  filter: rect,
  opacity: 0.5,
  shape: "bezier",
  curveness: 100,
})
  .mapValue("linkWidth", "Value")
  .mapValue("fill", "Value");

await PICCL.show(
  [
    [link, data["links.csv"]],
    [collection, data["nodes.csv"]],
  ],
  container,
  { padding: 200, background: "black" }
);
```

## How PiCCL builds the divided ribbon ends

PiCCL has no stacking call for ribbon ends. The ends come from one operator, `PICCL.link(graphic, { linkByData: true, ... })`, applied to an already laid out composite. Every element that can be an endpoint gets a `linkId` with `.mapValue("linkId", field)`. A separate edge table (columns `source_id` and `target_id`) is bound to the link in `PICCL.show`, and `.mapValue("linkWidth", field)` sets each band's width. The library then places the bands side by side along the chosen edge of each endpoint (`srcDirection` / `dstDirection`: `"bottom"`, `"top"`, `"left"`, or `"inner"` for arcs), so each endpoint's edge is split into one slot per incident band. This slotting is implicit: the docs do not describe it, and no option controls the order or packing. That is what the images show.

In the school days example, the ends are invisible rectangles that exist only to give the band an edge to attach to: `dayRect` is a 50-wide white rectangle, and `rectForLink` / `dropAnchor` are zero-height or zero-width rectangles that carry a `linkId`. In Beatles, the anchor is `rectForLink` (60 wide, height 0), snapped to the bottom of each member's picture with `pointSnap`. The layout before linking uses `replicate(..., field).stackLayout(dir, gap)` to make the rows of nodes, and `union([...]).pointSnap(a, b, {sourceAnchor, targetAnchor, offset})` to place one row relative to the other. In Beatles, the song end is the 2-pixel `bar`, so each song band is a single thin band and only the member end is split.

The chord diagram is the one example that uses `divide`. `PICCL.divide(circle, "angular", { key: "id", sizeEncode: "Total", gap: 0.5 })` splits a ring into one arc per country, sized by `Total`, and returns `[chart, arc]`. The arcs get `linkId` and the link uses `filter: arc` and `srcDirection` / `dstDirection: "inner"`, so the bands attach to the inner edge of each arc, side by side. The size of the arc and the sum of its bands are separate encodings (`Total` against `Amount`), so nothing forces the bands to fill the arc. The sankey example has the same structure as the school days example, except that the node `height` is mapped to `Value`.

API reference (from `https://piccl.github.io/assets/020Operators-D2Wb74oS.js`):

- `divide(object, direction, {key, sizeEncode, gap})`: "Divides a graphic object into several segments and transforms the original graphic into a composite containing all segments." Direction is `"x"`/`"y"` for rectangles and images, and `"angular"`/`"radial"` for circles and arcs.
- `link(object, {filter, linkByData, endEdge, startEdge, type, shape, curveness, overlay, ...style})`: "Sequential link: Elements with the same linkId are grouped and linked sequentially. Pairwise link: Requires independent data. Connections are made by matching linkId with the values in the source_id and target_id columns of the data." `type` is `"link"` or `"band"` (default `"band"`). `shape` is `"straight"`, `"arc"` or `"bezier"`.

## Other link, ribbon and divide examples in the gallery

The gallery has 26 examples. Besides the four above, these use `PICCL.link` or `PICCL.divide` (all at `https://piccl.github.io/examples/codes/<file>`):

- `digitalEconomyEurope.txt`, `combinedFlower.txt`: sequential `link(glyph, {srcDirection: "bottom", dstDirection: "top", shape: "bezier", ...})` inside `replicate(link, "country")`, with thin strokes (`strokeWidth: 2`), not width encoded bands.
- `usDollar.txt`, `iceberg.txt`, `bicycle2.txt`, `phone.txt`: `link` used to make area fills or polylines through points (`filter: "point"` / `"line"`).
- `alcohol.txt`, `bicycle.txt`, `pie.txt`, `cucumber.txt`, `dailyRoutine.txt`: `divide` without `link` (pie and segmented pictures).
