// Diverging Likert Chart
// Survey answers stacked in the order of the response scale, with every row centered on the middle of its Neutral bar.

import { Schema, chart, palette, rect, spread, stack } from "gofish-graphics";
const LEVELS = [
  "Strongly disagree",
  "Disagree",
  "Neutral",
  "Agree",
  "Strongly agree",
];
const likertColors = palette({
  "Strongly disagree": "#ca0020",
  Disagree: "#f4a582",
  Neutral: "#d9d9d9",
  Agree: "#92c5de",
  "Strongly agree": "#0571b0",
});
const survey = [
  ["The docs are clear", [12, 22, 38, 86, 42]],
  ["The API is easy to learn", [26, 48, 50, 54, 22]],
  ["Error messages are helpful", [58, 64, 36, 30, 12]],
  ["Charts render fast enough", [8, 18, 44, 80, 50]],
  // Nobody strongly disagreed, so this question has no row for that level.
  // The center is set by the order, so it does not move.
  ["I would recommend it", [0, 9, 27, 78, 86]],
].flatMap(([question, counts]) =>
  counts.flatMap((count, i) =>
    count === 0 ? [] : [{ question, response: LEVELS[i], count }],
  ),
);
const container = document.getElementById("app");
chart(survey, {
  schema: { response: Schema.ordered(LEVELS).diverging() },
  color: likertColors,
  axes: { x: { title: "Respondents" }, y: true },
})
  .flow(
    spread({ by: "question", dir: "y" }),
    stack({ by: "response", dir: "x" }),
  )
  .mark(rect({ w: "count", fill: "response" }))
  .render(container, { w: 640, h: 300 });
