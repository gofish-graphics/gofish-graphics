// SCRATCH: what each connection gives per set: "groups (≥ 3 members) + outliers (1-2)", and the
// free-link count n.   BENCH=connection node playground/bench.mjs
import DATA from "../src/datasets.json";
import { pieceLinks } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
const CS = [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.88, 0.9, 0.92, 0.95, 0.97, 1];
console.log(`| dataset/set (n members, free links) | ${CS.join(" | ")} |`);
console.log(`|---|${CS.map(() => "---").join("|")}|`);
for (const d of DATA as any[])
  d.sets.forEach((s: any, si: number) => {
    const cells = CS.map((c) => {
      const J = pieceLinks(s.members, d.padding, c, 1);
      const g = J.pieces.filter((p) => p.length >= 3).length;
      return `${g}g+${J.pieces.length - g}o`;
    });
    const nFree = pieceLinks(s.members, d.padding, 1, 1).tree.filter(
      (e) => !e.floor
    ).length;
    console.log(
      `| ${d.id}/${si} (${s.members.length}, ${nFree}) | ${cells.join(" | ")} |`
    );
  });
