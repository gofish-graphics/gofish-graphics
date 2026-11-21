// (f) Two copies of lib@1.0.0 on disk: the app's, and one nested under the
// plugin (the d3-selection duplicate problem). The plugin patches ITS copy.
import "plugin-tooltip";
import { rect } from "lib";
console.log("case-f:", JSON.stringify(rect({}).tooltip("value").spec));
