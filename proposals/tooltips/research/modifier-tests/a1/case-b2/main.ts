// (b2) Neither this file nor anything it imports loads the plugin.
import { rect } from "lib";
console.log("case-b2:", JSON.stringify(rect({}).tooltip("value").spec));
