import { rect } from "lib";
// forgot: import { tooltip } from "gofish-tooltip";
export const a = rect({}).use(tooltip("v"));
// forgot to import a modifier whose name is also a DOM global:
export const b = rect({}).use(name("bars"));
