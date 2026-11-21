// (f3) The plugin bundled its own copy of lib into its JS (types still augment "lib").
import "plugin-tooltip";
import { rect } from "lib";
console.log("case-f3:", JSON.stringify(rect({}).tooltip("value").spec));
