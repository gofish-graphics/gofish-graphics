# Modifier extension tests

Small projects behind sections A and B of `../extensible-modifiers.md`. Results were taken with TypeScript 5.7.2 (the repo's), Node 26.10, Vite 6.0.0, mypy 2.4.1, pyright 1.1.414 and swiftc 6.2.4.

## Setup

The fake packages each case imports (`lib`, `plugin-tooltip`, ...) are checked in as `fake_node_modules/`, so the repo holds no `node_modules`. Copy this folder to a scratch directory, then run:

```sh
sh setup.sh   # renames every fake_node_modules/ to node_modules/
export TSC=/path/to/gofish/packages/gofish-graphics/node_modules/.bin/tsc
export VITE=/path/to/gofish/packages/gofish-graphics/node_modules/.bin/vite
```

## a1: prototype patch plus `declare module` augmentation (A1, A3)

```sh
sh a1/run.sh case-a case-b1 case-b2 case-b3 case-c1 case-c2 case-c3 case-d case-e case-f case-f2 case-f3 case-g
(cd a1/case-h && $TSC -p tsconfig.json --noEmit --pretty false)
for f in a1/js/*.mjs; do node $f; done
```

| Case            | What it sets up                                                                     | tsc                     | node                                                                                |
| --------------- | ----------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------- |
| case-a          | plugin imported in the same file; plus a `.toolTip` typo                            | TS2551 on the typo only | works; typo is `TypeError: rect(...).toolTip is not a function`                     |
| case-b1         | entry imports `other.ts`, which imports the plugin                                  | exit 0                  | works                                                                               |
| case-b2         | `other.ts` imports the plugin and is in the program, but the entry never imports it | exit 0                  | `TypeError: rect(...).tooltip is not a function`                                    |
| case-b3         | entry imports `chart.ts` (calls `.tooltip()` at top level) before the plugin        | exit 0                  | TypeError in `chart.js`                                                             |
| case-c1         | plugin only in tsconfig `types`                                                     | exit 0                  | TypeError                                                                           |
| case-c2         | `import type {} from "plugin-tooltip"`                                              | exit 0                  | TypeError                                                                           |
| case-c3         | a dependency's `.d.ts` imports the plugin; its JS does not                          | exit 0                  | TypeError                                                                           |
| case-d          | two plugins add `tooltip` with different signatures                                 | exit 0                  | the string call silently runs plugin 2                                              |
| case-e          | lib v2 adds a built-in `tooltip`; old plugin installed                              | exit 0                  | the built-in call silently runs the plugin                                          |
| case-f, case-f2 | second copy of lib nested under the plugin                                          | TS2339                  | TypeError                                                                           |
| case-f3         | plugin bundles its own copy of lib in its JS                                        | exit 0                  | TypeError                                                                           |
| case-g          | plugin loaded by a computed dynamic import                                          | TS2339                  | works                                                                               |
| case-h          | GoFish shape: `NameableMark` is a `type` alias                                      | TS2300 (x2) and TS2339  | not run                                                                             |
| js/js1          | method called, plugin never imported                                                | none                    | earlier lines run, then `TypeError: m.tooltip is not a function`                    |
| js/js2          | imported function used, import forgotten                                            | none                    | earlier lines run, then `ReferenceError: tooltip is not defined`                    |
| js/js3          | typo in a named import                                                              | none                    | `SyntaxError: ... does not provide an export named 'toolTip'`, before any line runs |
| js/js4          | method call inside a function nobody calls                                          | none                    | exits cleanly                                                                       |

## a2: imported function through one generic method (A2)

```sh
cd a2 && $TSC -p . --pretty false && cat out/main.d.ts && node out/main.js
$TSC --noEmit --strict --module nodenext --moduleResolution nodenext --target es2022 --lib es2022,dom --pretty false missing.ts
```

`main.d.ts` shows `used`, `piped3` and `wrapped` as `RectMark`, and `piped4` (past the 3 `pipe` overloads) as `Mark`. In `main.ts`, the lines `wrongMark` and `typo` are commented out so the file runs. Uncomment them to get `TS2345` (text-only modifier on a rect), `TS2552: Cannot find name 'toolTip'`, and at runtime `ReferenceError: toolTip is not defined`. `missing.ts` prints `TS2304: Cannot find name 'tooltip'` and `TS2349: This expression is not callable. Type 'void' has no call signatures.` (the forgotten `name` import resolves to the DOM global).

## a4: tree-shaking and bundler behavior (A3, A4)

```sh
cd a4
$VITE build && cat dist/out.js                       # unused method kept, unused function dropped
$VITE build -c vite2.config.mjs && node src2/main.js && node dist2/out.js
$VITE build -c vite3.config.mjs                      # build error
```

- `dist/out.js` keeps the unused class method `tooltip` ("METHOD_TOOLTIP_BODY") and drops the unused `tooltipFn`.
- `vite2`: the plugin says `"sideEffects": false`, so the bundle drops `import "patch-plugin"`. Unbundled, the code prints `{ type: 'rect', tooltip: 'PATCHEDv' }`. Bundled, it throws `TypeError: rect(...).tooltip is not a function`.
- `vite3`: the build fails with `"toolTipFn" is not exported by "src/lib.js"`.

## b: Python (B)

```sh
cd b/proj
uvx --with typing_extensions mypy user.py plugin_patch.py
uvx pyright user.py plugin_patch.py
cd .. && uv run --no-project --with pandas --with polars python collide.py
uv run --no-project --with narwhals --with pyarrow --with anywidget python real_gofish_probe.py
```

- mypy and pyright reject both the monkeypatched method (`"Rect" has no attribute "tooltip"`) and the accessor namespace (`"Rect" has no attribute "tt"`), though both work at runtime.
- Both checkers accept `rect().pipe(tooltip, "v")`, with the type revealed as `Rect`. They flag `pipe(tooltip, 3)` and the undefined `toolTip`.
- `collide.py` prints the pandas and polars override warnings, then the polars `AttributeError: cannot override DataFrame.columns`.
- `real_gofish_probe.py` imports the real GoFish Python package from `packages/gofish-python`. Edit the `sys.path` line if your checkout lives elsewhere. It prints:
  - `_tooltip = value` after `.tooltip()`.
  - `_tooltip = <lost>` after `.name()`.
  - The IR `{"type": "rect", "h": "value"}`.
  - The root type `layer` for the rewrite modifier.
  - `has .pipe on Mark: False`.

## swift: static extension methods (C)

```sh
cd swift
swiftc -emit-module -emit-library -module-name Lib -parse-as-library Lib.swift -o libLib.dylib
swiftc -emit-module -emit-library -module-name Plugin -parse-as-library -I . -L . -lLib Plugin.swift -o libPlugin.dylib
swiftc -I . -L . -lLib -lPlugin main.swift a.swift -o app      # compiles (a.swift imports Plugin)
swiftc -I . -L . -lLib -lPlugin main.swift -o app2             # error: value of type 'Mark' has no member 'tooltip'
swiftc -enable-upcoming-feature MemberImportVisibility -I . -L . -lLib -lPlugin main.swift a.swift -o app3
# error: instance method 'tooltip' is not available due to missing import of defining module 'Plugin'
```
