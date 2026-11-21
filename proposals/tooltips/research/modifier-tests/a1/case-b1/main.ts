// (b1) This file never imports the plugin; the entry imports other.ts first.
import "./other.js";
import { rect } from "lib";
console.log("case-b1:", JSON.stringify(rect({}).tooltip("value").spec));
