// (c2) A type-only import pulls the augmentation in; it is erased at emit.
import type {} from "plugin-tooltip";
import { rect } from "lib";
console.log("case-c2:", JSON.stringify(rect({}).tooltip("value").spec));
