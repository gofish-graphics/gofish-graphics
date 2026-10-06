import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/bottle-image",
  kind: "create",
  group: "beyond-defaults",
  data: "bottle-fill",
  size: { w: 640, h: 360 },
  instruction:
    "Make a bottle fill chart from a picture of a bottle, one bottle per `wine`. The picture " +
    "is the PNG file `bottle.png`, 157 x 650 px, a bottle on a transparent background. A " +
    "JavaScript program loads it from the URL `/assets/bottle.png`; a Python program reads it " +
    'from the path `os.path.join(os.environ["ASSET_DIR"], "bottle.png")`. Draw the picture ' +
    "once per wine, 240 px tall and 58 px wide (its own aspect ratio, not stretched), side by " +
    "side from left to right in the order the wines appear in the data, with room between " +
    "them for the labels, all standing on the same baseline, on a white background. Show each " +
    "bottle in grayscale. Then color it as if it were filled with liquid up to `fill_pct` " +
    "percent of the picture's height: from the bottom of the picture up to that level, give " +
    "the bottle's own pixels the color #00c853, where each pixel takes that color's hue and " +
    "saturation but keeps its own gray brightness, so the highlights and shadows of the glass " +
    "stay visible. Above the level the bottle stays gray. The transparent parts of the " +
    "picture stay transparent: the color follows the bottle's shape, and nothing around the " +
    "bottle is colored. Draw a thin #666666 line at the fill level, exactly as wide as the " +
    "picture, and write the percentage (for example 55%) in #666666 just to the right of the " +
    "bottle, next to the line. Write the wine's name centered below each bottle. Do not draw " +
    "axes.",
  checks: [
    {
      check: "imageFill",
      image: "bottle.png",
      height: 240,
      color: "#00c853",
      category: "wine",
      value: "fill_pct",
      max: 100,
    },
    {
      check: "textIncludes",
      strings: [
        "Merlot",
        "Chardonnay",
        "Riesling",
        "Prosecco",
        "30%",
        "55%",
        "80%",
        "92%",
      ],
    },
    { check: "sizeAbout" },
  ],
};
export default task;
