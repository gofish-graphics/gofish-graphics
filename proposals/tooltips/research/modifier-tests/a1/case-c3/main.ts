// (c3) A dependency the app uses ships types that import the plugin's types
// (a transitive .d.ts reference). The app never loads the plugin at runtime.
import { helper } from "uses-plugin-types";
import { rect } from "lib";
helper();
console.log("case-c3:", JSON.stringify(rect({}).tooltip("value").spec));
