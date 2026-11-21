// (e) The library later adds .tooltip() itself; an old plugin is still installed.
import "plugin-tooltip";
import { rect } from "lib";
// The user follows the NEW library docs:
console.log(
  "case-e builtin call:",
  JSON.stringify(rect({}).tooltip({ format: ".2f" }).spec)
);
// Old plugin call:
console.log(
  "case-e plugin call:",
  JSON.stringify(rect({}).tooltip("value").spec)
);
