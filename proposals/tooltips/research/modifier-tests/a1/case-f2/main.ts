// (f2) same as f, but lib is imported before the plugin.
import { rect } from "lib";
import "plugin-tooltip";
console.log("case-f2:", JSON.stringify(rect({}).tooltip("value").spec));
