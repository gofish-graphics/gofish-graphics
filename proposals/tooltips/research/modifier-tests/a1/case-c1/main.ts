// (c1) The plugin's .d.ts is in the compilation through tsconfig "types",
// but nothing imports it at runtime.
import { rect } from "lib";
console.log("case-c1:", JSON.stringify(rect({}).tooltip("value").spec));
