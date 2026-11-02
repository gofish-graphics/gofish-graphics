import { load } from "./load";
import {
  arcsOutline,
  ARCS_PROTOTYPE,
} from "../src/ast/graphicalOperators/enclose/arcs";
const { members, rings } = load(process.argv[2]);
console.log(
  "members",
  members.length,
  "rings",
  rings.length,
  rings.map((r) => r.length)
);
ARCS_PROTOTYPE.spine = 0;
const t = performance.now();
const out = arcsOutline(members, { padding: 6, radius: 24 });
console.log(
  "ms",
  performance.now() - t,
  "out",
  out.length,
  out.map((r) => r.length)
);
let mx = 0;
for (const p of rings[0]) {
  let b = 1e9;
  for (const q of out[0]) b = Math.min(b, Math.hypot(p[0] - q[0], p[1] - q[1]));
  mx = Math.max(mx, b);
}
console.log("max dist rendered->computed", mx);
