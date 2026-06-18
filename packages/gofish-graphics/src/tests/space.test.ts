/**
 * Underlying-space fold semantics that the 5-kind → 3-kind collapse (#586) must
 * preserve. These pin the distinction the two-state `origin: number | null`
 * first cut lost — a baseline magnitude ("free") is NOT a data axis anchored at
 * 0 (`origin: 0`) — so a future re-collapse that overloads `origin === 0` fails
 * here instead of silently corrupting units / over-nicing. Run via `tsx`.
 */
import {
  POSITION,
  SIZE,
  UNDEFINED,
  ORDINAL,
  isPOSITION,
  isDIFFERENCE,
  isBaselineMagnitude,
  type UnderlyingSpace,
} from "../ast/underlyingSpace";
import { unionChildSpaces } from "../ast/graphicalOperators/alignment";
import * as M from "../util/monotonic";
import { interval } from "../util/interval";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const onY = (s: UnderlyingSpace): [UnderlyingSpace, UnderlyingSpace] => [
  UNDEFINED,
  s,
];
const throws = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

console.log("# space: baseline magnitude vs data axis anchored at 0");
{
  // Two anchored data axes, both with data-min 0 (POSITION([0, X])), in DIFFERENT
  // units. Overlaying foreign units onto one axis must be REFUSED — this is the
  // marginal-histogram unit guard. (Two-state's `every(origin === 0)` wrongly
  // took these for magnitudes and silently forgot the clash.)
  const dollars0 = POSITION(interval(0, 100), "dollars");
  const units0 = POSITION(interval(0, 50), "units");
  const msg = throws(() =>
    unionChildSpaces([onY(dollars0), onY(units0)], 1)
  );
  ok(
    "overlay of two origin-0 data axes with clashing measures THROWS",
    msg !== null && /different measures/.test(msg),
    msg ?? "did not throw"
  );

  // Two baseline magnitudes (the old SIZE) in different fields compose into a
  // real extent that carries no single unit — this must NOT throw, just forget.
  const dollarsMag = SIZE(M.linear(100, 0), "dollars");
  const unitsMag = SIZE(M.linear(50, 0), "units");
  let composed: UnderlyingSpace | undefined;
  const magMsg = throws(() => {
    composed = unionChildSpaces([onY(dollarsMag), onY(unitsMag)], 1);
  });
  ok(
    "overlay of two baseline magnitudes with clashing measures FORGETS (no throw)",
    magMsg === null,
    magMsg ?? ""
  );
  ok(
    "...and the forgotten composition is itself a baseline magnitude",
    composed !== undefined && isBaselineMagnitude(composed),
    composed && `origin=${JSON.stringify((composed as any).origin)}`
  );
}

console.log("# space: the three origin states are distinct");
{
  const mag = SIZE(M.linear(10, 0)); // "free"
  const atZero = POSITION(interval(0, 10)); // numeric origin 0
  ok("a baseline magnitude is NOT a POSITION", !isPOSITION(mag));
  ok("a data axis anchored at 0 IS a POSITION", isPOSITION(atZero));
  ok(
    "a data axis anchored at 0 is NOT a baseline magnitude",
    !isBaselineMagnitude(atZero)
  );
}

console.log("# space: an empty-ORDINAL sibling vetoes SIZE self-scaling");
{
  // A SIZE (sized bar) overlaid with an empty ORDINAL([]) — the latter is what
  // an unresolved `ref()` contributes. The empty ORDINAL is NOT a magnitude, so
  // the overlay is NOT a pure-magnitude self-scaling region: it must stay
  // unanchored (DIFFERENCE, no baseline → not self-scaled), exactly as before
  // the 3-kind collapse. Filtering to CONTINUOUS-only would silently drop the
  // ORDINAL and wrongly self-scale.
  const sized = SIZE(M.linear(40, 0));
  const composed = unionChildSpaces([onY(sized), onY(ORDINAL([]))], 1);
  ok(
    "SIZE + empty-ORDINAL overlay is a DIFFERENCE (unanchored), not a free magnitude",
    isDIFFERENCE(composed) && !isBaselineMagnitude(composed)
  );
  // Sanity: SIZE alone (or with an UNDEFINED sibling) DOES stay a free magnitude.
  const magOnly = unionChildSpaces([onY(sized), onY(UNDEFINED)], 1);
  ok(
    "SIZE + UNDEFINED overlay stays a free baseline magnitude",
    isBaselineMagnitude(magOnly)
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
