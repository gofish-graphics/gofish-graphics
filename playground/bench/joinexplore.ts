// SCRATCH: per set, the barcode's finite bars (the tree edges that do not touch, longest
// first) in plain and mutual reachability, and the piece sizes at k = 2..8.
//   BENCH=joinexplore node playground/bench.mjs   (DS=<ids>, K=<core k>)
import DATA from "../src/datasets.json";
import {
  joinLinks,
  type JoinDistance,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";

const IDS = (process.env.DS ?? "chartaccent,penguins").split(",");
const K = +(process.env.K ?? 4);
for (const id of IDS) {
  const d = (DATA as any[]).find((x) => x.id === id);
  d.sets.forEach((s: any, si: number) => {
    for (const dist of ["plain", "reach"] as JoinDistance[]) {
      const J = joinLinks(s.members, d.padding, 1, 1, "pieces", dist, K);
      const free = J.tree.filter((e) => !e.floor).sort((a, b) => b.w - a.w);
      const floor = J.tree.filter((e) => e.floor);
      console.log(
        `${id} set ${si} (${s.members.length}) ${dist}: ${floor.length} touching (w ${Math.min(...floor.map((e) => e.w)).toFixed(1)}..${Math.max(...floor.map((e) => e.w)).toFixed(1)}), ${free.length} bars, typical ${J.typical.toFixed(1)}`
      );
      console.log(
        "   bars " +
          free
            .slice(0, 24)
            .map((e) => e.w.toFixed(1))
            .join(" ") +
          (free.length > 24 ? " …" : "")
      );
      const sizes: string[] = [];
      for (let k = 2; k <= 8; k++) {
        const P = joinLinks(s.members, d.padding, k, 1, "pieces", dist, K)
          .pieces.map((p) => p.length)
          .sort((a, b) => b - a);
        sizes.push(`k${k}: ${P.join(",")}`);
      }
      console.log("   " + sizes.join("  "));
    }
  });
}
