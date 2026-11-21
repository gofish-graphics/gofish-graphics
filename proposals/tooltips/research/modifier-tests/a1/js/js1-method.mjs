import { rect } from "lib";
console.log("js1: module body started");
const m = rect({}).name("bars");
console.log("js1: built", JSON.stringify(m.spec));
m.tooltip("v"); // plugin never imported
