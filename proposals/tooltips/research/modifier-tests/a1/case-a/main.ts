// (a) plugin imported for side effects in the same file.
import { rect } from "lib";
import "plugin-tooltip";

const m = rect({ h: "value" }).name("bars").tooltip("value");
console.log("case-a ok:", JSON.stringify(m.spec));
// (a') typo in a plugin method name: static error, as for a built-in.
try {
  rect({}).toolTip("value");
} catch (e) {
  console.log("case-a typo runtime:", String(e));
}
