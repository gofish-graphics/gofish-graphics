/**
 * `resolveAccessors` / `resolveChannelAccessors` (#1080): an async channel
 * accessor (a Python lambda) is resolved over the rows before inference, and
 * inference reads the values back by row. The checks pin what makes the
 * lookup safe: the operator factory resolves over its whole input plus every
 * split entry's rows, and the splits hand inference the input's own row
 * objects.
 *
 * Run: `tsx src/tests/resolveAccessors.test.ts` (wired as
 * `pnpm test:resolve-accessors`).
 */

import "../lib";
import { field } from "../ast/data";
import {
  resolveAccessors,
  resolveChannelAccessors,
} from "../ast/channels";
import { splitEntries } from "../ast/datumProjection";

declare const process: { exit(code: number): never };

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const rows = [
  { k: "a", v: 1 },
  { k: "b", v: 2 },
  { k: "a", v: 3 },
];

console.log("# resolveAccessors");
{
  let calls = 0;
  const asyncV = async (d: { v: number }) => {
    calls += 1;
    return d.v * 10;
  };
  const resolved = await resolveAccessors(asyncV, rows);
  check(
    "an async accessor reads back each row's value synchronously",
    rows.every((r) => resolved(r) === r.v * 10),
    JSON.stringify(rows.map((r) => resolved(r)))
  );
  check("it is called once per row", calls === rows.length, `${calls}`);

  const sync = (d: { v: number }) => d.v;
  check(
    "a sync accessor is left as it is",
    (await resolveAccessors(sync, rows)) === sync
  );

  const dims = await resolveAccessors({ r: { size: asyncV }, x: "k" }, rows);
  check(
    "an accessor nested in a dims bag is resolved",
    typeof dims.r.size === "function" &&
      dims.r.size(rows[1]) === 20 &&
      dims.x === "k"
  );

  let message = "";
  try {
    resolved({ k: "a", v: 1 });
  } catch (e) {
    message = (e as Error).message;
  }
  check(
    "reading a row it was not resolved over is a loud error",
    message.includes("not resolved over"),
    message
  );
}

console.log("# resolveChannelAccessors");
{
  const by = async (d: { k: string }) => d.k;
  const h = async (d: { v: number }) => d.v;
  const out = await resolveChannelAccessors(
    { by, h, dir: "x" },
    { h: "size" },
    rows
  );
  check("a channel is resolved", out.h(rows[2]) === 3);
  check("an option that is not a channel is left as it is", out.by === by);

  // A split that hands inference copies: resolving over the input plus the
  // entries' rows (what the operator factory passes) finds every one.
  const copies = rows.map((r) => ({ ...r }));
  const both = await resolveChannelAccessors({ h }, { h: "size" }, [
    ...rows,
    ...copies,
  ]);
  check(
    "resolving over input and entry rows covers rows a split copied",
    copies.every((r) => both.h(r) === r.v)
  );
}

console.log("# splits hand inference the input's own rows");
{
  const sameRows = (entries: Map<unknown, any>) =>
    [...entries.values()].every((items) =>
      (Array.isArray(items) ? items : [items]).every((r) => rows.includes(r))
    );
  check("a field-name split", sameRows(splitEntries("k", rows)));
  check("a function split", sameRows(splitEntries((d: any) => d.k, rows)));
  check(
    "a bin split",
    sameRows(splitEntries(field("v").bin({ thresholds: 2 } as any), rows))
  );
  check(
    "a sorted, null-dropping split",
    sameRows(splitEntries(field("k").dropNulls().sort(), rows))
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
