/**
 * Unit tests for the spectral color mixing in `src/color.ts`: every CSS color
 * syntax culori parses (named, hex, `rgb()` with commas or spaces, `hsl()`,
 * `oklch()`) mixes the same as its hex form, and alpha survives. Run:
 * `tsx src/tests/color.test.ts` (wired into `pnpm test` as `test:color`).
 */
import { applyColorOps, mix, tailwindColors } from "../color";
import { parse, toRgb } from "../colorModes";
import { HEX, mix as spectralMix } from "spectral.js";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) console.log(`ok   ${name}`);
  else {
    failed++;
    console.log(`FAIL ${name} ${detail}`);
  }
};

/** Two colors equal to within one 8-bit step per channel (and in alpha, unless `rgbOnly`). */
const same = (a: string, b: string, rgbOnly = false) => {
  const ca = toRgb(parse(a)!);
  const cb = toRgb(parse(b)!);
  if (!ca || !cb) return false;
  const d = (x: number, y: number) => Math.abs(x - y) * 255 <= 1;
  return (
    d(ca.r, cb.r) &&
    d(ca.g, cb.g) &&
    d(ca.b, cb.b) &&
    (rgbOnly || d(ca.alpha ?? 1, cb.alpha ?? 1))
  );
};

const alphaOf = (c: string) => toRgb(parse(c)!)?.alpha ?? 1;


const lighten = (c: string) =>
  applyColorOps(c, [{ op: "lighten", amount: 0.5 }]);
const darken = (c: string) => applyColorOps(c, [{ op: "darken", amount: 0.3 }]);

const steelblue = ["#4682b4", "rgb(70, 130, 180)"];
const equivalents = [
  "steelblue",
  "rgb(70 130 180)",
  "hsl(207.27 44% 49.02%)",
  // steelblue converted to oklch by culori
  "oklch(0.5880009113178375 0.09933886434832809 245.73941733871706)",
];

for (const ref of steelblue) {
  for (const c of equivalents) {
    check(
      `lighten(${c}) = lighten(${ref})`,
      same(lighten(c), lighten(ref)),
      `${lighten(c)} vs ${lighten(ref)}`
    );
    check(
      `darken(${c}) = darken(${ref})`,
      same(darken(c), darken(ref)),
      `${darken(c)} vs ${darken(ref)}`
    );
  }
}

// The lighten of a mid blue is lighter than the blue, not black or grey.
check(
  "lighten(steelblue) is lighter than steelblue",
  toRgb(parse(lighten("steelblue"))!)!.b > toRgb(parse("steelblue")!)!.b
);

// Alpha: a color op keeps the color's opacity.
for (const c of [
  "rgb(70 130 180 / 0.5)",
  "rgba(70, 130, 180, 0.5)",
  "#4682b480",
]) {
  const expected = alphaOf(c);
  for (const [name, out] of [
    ["lighten", lighten(c)],
    ["darken", darken(c)],
  ] as const) {
    check(
      `${name}(${c}) keeps alpha ${expected.toFixed(2)}`,
      Math.abs(alphaOf(out) - expected) < 1 / 255 + 1e-9,
      `got ${out}`
    );
  }
  check(
    `lighten(${c}) has the rgb of lighten(opaque)`,
    same(lighten(c), lighten("#4682b4"), true),
    `${lighten(c)} vs ${lighten("#4682b4")}`
  );
}

// tailwindColors with opacity is emitted as space-separated rgb with alpha.
const tw = tailwindColors.blue[500];
const { r, g, b } = toRgb(parse(tw)!)!;
const twHex = `rgb(${[r, g, b].map((v) => Math.round(v * 255)).join(", ")})`;
check(
  `tailwindColors.blue[500] (${tw}) lightens like its opaque rgb`,
  same(lighten(tw), lighten(twHex), true) &&
    Math.abs(alphaOf(lighten(tw)) - alphaOf(tw)) <= 1 / 255,
  `${lighten(tw)} vs ${lighten(twHex)}`
);

// mix interpolates alpha linearly in t, as CSS color-mix() does.
check(
  "mix interpolates alpha linearly in t",
  alphaOf(mix("steelblue", "rgb(0 0 0 / 0.5)", 0.3)) === 0.85,
  `got ${mix("steelblue", "rgb(0 0 0 / 0.5)", 0.3)}`
);
check(
  "mix of transparent and opaque at t = 0.5 has alpha 0.5",
  alphaOf(mix("rgb(0 0 0 / 0)", "#ffffff", 0.5)) === 0.5
);

// mix is premultiplied, as CSS color-mix() is: each color weighs in by its
// alpha, so a transparent color adds no color of its own.
check(
  "transparent red and blue at t = 0.5 is blue at alpha 0.5",
  mix("rgba(255, 0, 0, 0)", "blue", 0.5) === "rgba(0, 0, 255, 0.5)",
  `got ${mix("rgba(255, 0, 0, 0)", "blue", 0.5)}`
);
check(
  'mix("transparent", c, 0.3) is c at alpha 0.3, not darker',
  mix("transparent", "#4682b4", 0.3) === "rgba(70, 130, 180, 0.3)",
  `got ${mix("transparent", "#4682b4", 0.3)}`
);
check(
  "a half-transparent black darkens steelblue by its premultiplied weight",
  same(
      mix("steelblue", "rgb(0 0 0 / 0.5)", 0.3),
      mix("steelblue", "black", (0.3 * 0.5) / (0.7 + 0.3 * 0.5)),
      true
    ),
  `got ${mix("steelblue", "rgb(0 0 0 / 0.5)", 0.3)}`
);

// Opaque inputs mix exactly as spectral.js mixes them, byte for byte: a
// 7-character hex string (the theme palettes are built this way).
for (const t of [0, 1 / 7, 2 / 7, 0.3, 0.5, 5 / 7, 1]) {
  const got = mix("#4682b4", "#ffffff", t);
  const want = spectralMix("#4682b4", "#ffffff", t, HEX);
  check(`opaque mix at t = ${t.toFixed(3)} is spectral.js's`, got === want, `${got} vs ${want}`);
}

// An unparseable color passes through a color op unchanged.
check(
  "unparseable color passes through",
  applyColorOps("currentColor", [{ op: "lighten", amount: 0.5 }]) ===
    "currentColor"
);

if (failed > 0) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
