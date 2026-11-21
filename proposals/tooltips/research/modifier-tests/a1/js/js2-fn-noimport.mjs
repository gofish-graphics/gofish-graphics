import { rect } from "lib";
console.log("js2: module body started");
const m = rect({}).name("bars");
console.log("js2: built", JSON.stringify(m.spec));
tooltip("v")(m); // eslint-disable-line no-undef -- forgot the import; that is the point of this case
