// (b3) The entry DOES import the plugin, but after chart.ts. ESM evaluates
// imports in order, so chart.ts runs before the prototype is patched.
import { bars } from "./chart.js";
import "plugin-tooltip";
console.log("case-b3:", JSON.stringify(bars.spec));
