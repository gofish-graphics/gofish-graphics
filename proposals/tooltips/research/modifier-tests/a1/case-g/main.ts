// (g) The reverse: the plugin IS loaded at runtime, but in a way the type
// checker cannot follow (a computed dynamic import; a <script> tag, a test
// setup file or a JS file outside the tsconfig behave the same).
import { rect } from "lib";
const pluginName = "plugin-" + "tooltip";
await import(pluginName);
console.log("case-g:", JSON.stringify(rect({}).tooltip("value").spec));
