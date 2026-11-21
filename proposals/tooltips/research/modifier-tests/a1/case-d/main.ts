// (d) Two plugins both add .tooltip() with different signatures.
import "plugin-tooltip"; // tooltip(field: string)
import "plugin-tooltip2"; // tooltip(opts: { fields: string[] }), loaded last
import { rect } from "lib";

try {
  console.log(
    "case-d string form:",
    JSON.stringify(rect({}).tooltip("value").spec)
  );
} catch (e) {
  console.log("case-d string form threw:", String(e));
}
console.log(
  "case-d object form:",
  JSON.stringify(rect({}).tooltip({ fields: ["a"] }).spec)
);
