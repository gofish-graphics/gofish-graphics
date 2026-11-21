import { rect } from "lib";
console.log("js4: module body started");
function later() {
  return rect({}).tooltip("v");
} // only fails if called
console.log("js4: defined later(), not called; exit clean");
