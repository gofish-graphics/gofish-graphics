// Grouped Box-and-Whisker Plot
// Paired distributions across five categories shown as grouped box-and-whisker plots, with male and female boxes side by side over a labeled value axis.

import { testBoxWhiskerPlot } from "gofish-graphics";
const container = document.getElementById("app");
testBoxWhiskerPlot().render(container, {
  axes: true,
});
