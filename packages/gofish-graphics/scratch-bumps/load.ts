// SCRATCH: load the ChartAccent members and rendered path from a capture-one .html
import { readFileSync } from "node:fs";
import type {
  BlobMember,
  Pt,
} from "../src/ast/graphicalOperators/enclose/blob";
export function load(html: string) {
  const s = readFileSync(html, "utf8");
  const members: BlobMember[] = [];
  for (const m of s.matchAll(
    /<ellipse cx="([\d.]+)" cy="([\d.]+)" fill="#47b8a0"[^>]*rx="([\d.]+)"/g
  ))
    members.push({ kind: "disc", cx: +m[1], cy: +m[2], r: +m[3] });
  const d = s.match(/<path d="([^"]*)" fill="#47b8a0"/)![1];
  const rings: Pt[][] = d
    .split(/Z/i)
    .filter((x) => x.trim())
    .map((sub) =>
      [...sub.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(
        (m) => [+m[1], +m[2]] as Pt
      )
    );
  return { members, rings };
}
