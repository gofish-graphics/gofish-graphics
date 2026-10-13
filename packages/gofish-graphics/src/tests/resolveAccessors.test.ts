/**
 * `resolveChannelAccessors` (#1080): a Python accessor (an accessor with a
 * batch form, `RESOLVE_ROWS`) is resolved over the rows before inference, in
 * one call, and inference reads the values back by row. The checks also pin
 * what makes the by-row lookup safe: the operator factory resolves over its
 * whole input plus every split entry's rows, and the splits hand inference
 * the input's own row objects.
 *
 * Run: `tsx src/tests/resolveAccessors.test.ts` (wired as
 * `pnpm test:resolve-accessors`).
 */

import "../lib";
import { field } from "../ast/data";
import { RESOLVE_ROWS, resolveChannelAccessors } from "../ast/channels";
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

/** An accessor with a batch form, as `makeLambdaAccessor` builds one. */
function batched(fn: (d: any) => unknown) {
  const calls: unknown[][] = [];
  const accessor = Object.assign(
    () => {
      throw new Error("called per row");
    },
    {
      [RESOLVE_ROWS]: async (rs: readonly unknown[]) => {
        calls.push([...rs]);
        return rs.map(fn);
      },
    }
  );
  return { accessor, calls };
}

console.log("# resolveChannelAccessors");
{
  const { accessor, calls } = batched((d) => d.v * 10);
  const out = (await resolveChannelAccessors(
    { h: accessor, dir: "x" },
    { h: "size" },
    () => rows
  )) as any;
  check(
    "a batch accessor reads back each row's value synchronously",
    rows.every((r) => out.h(r) === r.v * 10)
  );
  check("it is resolved in one call", calls.length === 1, `${calls.length}`);

  const nested = batched((d) => d.v);
  const dims = (await resolveChannelAccessors(
    { dims: { r: { size: nested.accessor }, x: "k" } },
    { dims: "dims" },
    () => rows
  )) as any;
  check(
    "a batch accessor nested in a dims bag is resolved",
    dims.dims.r.size(rows[1]) === 2 && dims.dims.x === "k"
  );

  const notChannel = batched((d) => d.k);
  const kept = (await resolveChannelAccessors(
    { by: notChannel.accessor },
    { h: "size" },
    () => rows
  )) as any;
  check(
    "an option that is not a channel is left as it is",
    kept.by === notChannel.accessor && notChannel.calls.length === 0
  );

  let message = "";
  try {
    out.h({ k: "a", v: 1 });
  } catch (e) {
    message = (e as Error).message;
  }
  check(
    "reading a row it was not resolved over is a loud error",
    message.includes("not resolved over"),
    message
  );

  // A split that hands inference copies: resolving over the input plus the
  // entries' rows (what the operator factory passes) finds every one.
  const copies = rows.map((r) => ({ ...r }));
  const both = (await resolveChannelAccessors(
    { h: batched((d) => d.v).accessor },
    { h: "size" },
    () => [...rows, ...copies]
  )) as any;
  check(
    "resolving over input and entry rows covers rows a split copied",
    copies.every((r) => both.h(r) === r.v)
  );
}

console.log("# the fast path");
{
  const opts = { h: "v", w: (d: any) => d.v, dims: { r: { size: 3 } } };
  let asked = false;
  const out = resolveChannelAccessors(
    opts,
    { h: "size", w: "size", dims: "dims" },
    () => {
      asked = true;
      return rows;
    }
  );
  check(
    "with no batch accessor, opts come back as they are, synchronously",
    out === opts
  );
  check("and the rows are never gathered", !asked);
  const asyncFn = async (d: any) => d.v;
  check(
    "a plain async function is not a Python accessor and is left alone",
    resolveChannelAccessors({ h: asyncFn }, { h: "size" }, () => rows) !==
      undefined &&
      (resolveChannelAccessors({ h: asyncFn }, { h: "size" }, () => rows) as any)
        .h === asyncFn
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
