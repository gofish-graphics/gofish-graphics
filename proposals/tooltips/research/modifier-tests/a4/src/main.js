import { rect, labelFn } from "./lib.js";
// uses .name() and labelFn; never uses .tooltip() or tooltipFn
console.log(rect({}).name("bars").use(labelFn("v")).spec);
