# Extensible mark modifiers: method or imported function?

**Verdict: the claim is partly right.** In TypeScript, a modifier added by prototype patching plus module augmentation can type-check and then throw `TypeError: ... is not a function` at runtime. This happens whenever the plugin's `.d.ts` reaches the program but the plugin's module is not loaded at runtime, is loaded after the call runs, or patches a different copy of the library. I reproduced that in 7 setups, plus a production-only failure caused by `"sideEffects": false`. Two plugins with the same method, or a plugin and a later built-in, collide silently, with no error from the checker or at runtime. An imported function turns a missing import or a typo into a static error in that file. Even in untyped JS it fails earlier than a method does: a wrong named import fails at link time, and a missing import throws a `ReferenceError` at the call. But the claim is not about method chaining as such. A single generic chain method that takes an imported value, `.use(tooltip("v"))`, keeps the chain and gets the same static guarantee. Python is the other way round: mypy and pyright reject both monkeypatched methods and accessor namespaces even when they work at runtime, and they check the `.pipe(f, ...)` form correctly. GoFish today cannot be prototype-patched at all: marks are functions whose methods are own properties drawn from a fixed private list, and `NameableMark` is a type alias.

The test projects are in [`modifier-tests/`](./modifier-tests/README.md). Tools used: TypeScript 5.7.2 (the repo's `packages/gofish-graphics/node_modules/.bin/tsc`), Node 26.10, Vite 6.0.0 (Rollup), mypy 2.4.1 and pyright 1.1.414 through `uvx`, and swiftc 6.2.4. Everything in A and B was run. Statements marked "(from memory)" or "(inferred)" were not checked.

---

## A. TypeScript (run)

### A1. Prototype patch plus `declare module "lib" { interface Mark { tooltip(field: string): Mark } }`

`lib` has `class Mark { name(); label() }`. `plugin-tooltip/index.js` does `Mark.prototype.tooltip = function (field) {...}`, and its `index.d.ts` holds the augmentation. Each case was compiled with `tsc` (which emits despite errors) and then run with `node`.

| Case                                                                                                                       | tsc                                                                                       | node                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| a. `import "plugin-tooltip"` in the same file                                                                              | exit 0                                                                                    | works                                                                                                     |
| a'. typo `.toolTip(...)`                                                                                                   | `error TS2551: Property 'toolTip' does not exist on type 'Mark'. Did you mean 'tooltip'?` | `TypeError: rect(...).toolTip is not a function`                                                          |
| b1. this file has no import; the entry imports `other.ts` (which imports the plugin) first                                 | exit 0                                                                                    | works                                                                                                     |
| b2. `other.ts` imports the plugin and is in the same tsconfig, but the entry never imports it                              | **exit 0**                                                                                | **`TypeError: rect(...).tooltip is not a function`**                                                      |
| b3. entry does `import {bars} from "./chart.js"; import "plugin-tooltip";`, and `chart.ts` calls `.tooltip()` at top level | **exit 0**                                                                                | **`TypeError`** at `out/chart.js:3` (ESM evaluates imports in order)                                      |
| c1. plugin only in tsconfig `"types": ["plugin-tooltip"]`                                                                  | **exit 0**                                                                                | **TypeError**                                                                                             |
| c2. `import type {} from "plugin-tooltip"`                                                                                 | **exit 0**                                                                                | **TypeError**                                                                                             |
| c3. a dependency's `.d.ts` does `import "plugin-tooltip"`, but its JS never loads it                                       | **exit 0**                                                                                | **TypeError**                                                                                             |
| d. two plugins: `tooltip(field: string)` and `tooltip(opts: {fields: string[]})`                                           | **exit 0** (the two signatures merge into overloads)                                      | no error; the string form silently ran plugin 2: `{"tooltip":{"plugin":"tooltip-2"}}`, `fields` lost      |
| e. lib v2 adds a built-in `tooltip(opts?: {format?})`; the old plugin is still installed                                   | **exit 0** (built-in and plugin become overloads)                                         | the built-in call is **silently hijacked**: `{"tooltip":{"plugin":"tooltip-1","field":{"format":".2f"}}}` |
| f, f2. second copy of lib@1.0.0 nested under the plugin's own `node_modules`                                               | `TS2339: Property 'tooltip' does not exist on type 'Mark'` (TS caught it)                 | TypeError                                                                                                 |
| f3. plugin bundles its own copy of lib in its JS; its types still augment `"lib"` (the d3 duplicate-copy shape)            | **exit 0**                                                                                | **TypeError**                                                                                             |
| g (the reverse). plugin loaded through a computed `await import(name)`, as with a `<script>` tag or a test setup file      | `TS2339`                                                                                  | **works**                                                                                                 |
| h. GoFish's shape: `NameableMark` is a `type` alias                                                                        | `TS2300: Duplicate identifier 'NameableMark'` (×2), plus `TS2339`                         | augmentation is impossible                                                                                |

Compiler and runtime output, verbatim. Stack frames are trimmed: the grep in `run.sh` drops lines that start with `    at`.

```
=================== case-a: tsc
main.ts(9,12): error TS2551: Property 'toolTip' does not exist on type 'Mark'. Did you mean 'tooltip'?
tsc exit=2
------------------- case-a: node
case-a ok: {"type":"rect","h":"value","name":"bars","tooltip":{"plugin":"tooltip-1","field":"value"}}
case-a typo runtime: TypeError: rect(...).toolTip is not a function
=================== case-b1: tsc
tsc exit=0
------------------- case-b1: node
case-b1: {"type":"rect","tooltip":{"plugin":"tooltip-1","field":"value"}}
=================== case-b2: tsc
tsc exit=0
------------------- case-b2: node
file:///.../a1/case-b2/out/main.js:3
console.log("case-b2:", JSON.stringify(rect({}).tooltip("value").spec));
                                                ^
TypeError: rect(...).tooltip is not a function
=================== case-b3: tsc
tsc exit=0
------------------- case-b3: node
file:///.../a1/case-b3/out/chart.js:3
export const bars = rect({}).tooltip("value");
                             ^
TypeError: rect(...).tooltip is not a function
=================== case-c1: tsc
tsc exit=0
------------------- case-c1: node
file:///.../a1/case-c1/out/main.js:4
console.log("case-c1:", JSON.stringify(rect({}).tooltip("value").spec));
                                                ^
TypeError: rect(...).tooltip is not a function
=================== case-c2: tsc
tsc exit=0
------------------- case-c2: node
file:///.../a1/case-c2/out/main.js:2
console.log("case-c2:", JSON.stringify(rect({}).tooltip("value").spec));
                                                ^
TypeError: rect(...).tooltip is not a function
=================== case-c3: tsc
tsc exit=0
------------------- case-c3: node
file:///.../a1/case-c3/out/main.js:6
console.log("case-c3:", JSON.stringify(rect({}).tooltip("value").spec));
                                                ^
TypeError: rect(...).tooltip is not a function
=================== case-d: tsc
tsc exit=0
------------------- case-d: node
case-d string form: {"type":"rect","tooltip":{"plugin":"tooltip-2"}}
case-d object form: {"type":"rect","tooltip":{"plugin":"tooltip-2","fields":["a"]}}
=================== case-e: tsc
tsc exit=0
------------------- case-e: node
case-e builtin call: {"type":"rect","tooltip":{"plugin":"tooltip-1","field":{"format":".2f"}}}
case-e plugin call: {"type":"rect","tooltip":{"plugin":"tooltip-1","field":"value"}}
=================== case-f: tsc
main.ts(5,48): error TS2339: Property 'tooltip' does not exist on type 'Mark'.
tsc exit=2
------------------- case-f: node
file:///.../a1/case-f/out/main.js:5
console.log("case-f:", JSON.stringify(rect({}).tooltip("value").spec));
                                               ^
TypeError: rect(...).tooltip is not a function
=================== case-f2: tsc
main.ts(4,49): error TS2339: Property 'tooltip' does not exist on type 'Mark'.
tsc exit=2
------------------- case-f2: node
file:///.../a1/case-f2/out/main.js:4
console.log("case-f2:", JSON.stringify(rect({}).tooltip("value").spec));
                                                ^
TypeError: rect(...).tooltip is not a function
=================== case-f3: tsc
tsc exit=0
------------------- case-f3: node
file:///.../a1/case-f3/out/main.js:4
console.log("case-f3:", JSON.stringify(rect({}).tooltip("value").spec));
                                                ^
TypeError: rect(...).tooltip is not a function
=================== case-g: tsc
main.ts(7,48): error TS2339: Property 'tooltip' does not exist on type 'Mark'.
tsc exit=2
------------------- case-g: node
case-g: {"type":"rect","tooltip":{"plugin":"tooltip-1","field":"value"}}
```

Case h (`tsc --noEmit`):

```
main.ts(3,10): error TS2339: Property 'tooltip' does not exist on type 'NameableMark<any>'.
node_modules/glib/index.d.ts(3,13): error TS2300: Duplicate identifier 'NameableMark'.
node_modules/gplugin/index.d.ts(2,13): error TS2300: Duplicate identifier 'NameableMark'.
exit=2
```

In case f, the `--traceResolution` output shows that the two copies resolve separately: one from `main.ts` to `node_modules/lib/index.d.ts` ("Package ID 'lib/index.d.ts@1.0.0'"), and one from the plugin to `node_modules/plugin-tooltip/node_modules/lib/package.json`. So the augmentation lands on the other copy's type.

There is also a production-only failure, shown in A4. If the plugin's package.json says `"sideEffects": false`, Vite/Rollup drops `import "patch-plugin"`. Unbundled, the code works; bundled, it throws.

**So yes, it type-checks and then throws:** in b2, b3, c1, c2, c3, f3, and the `sideEffects` build. The reverse also happens (g). Collisions (d, e) give no error at all. The plugin loaded last wins, even over a method the library adds later.

### A2. Imported function through one generic method (`modifier-tests/a2/`)

```ts
class Mark {
  use<R extends Mark>(mod: (m: this) => R): R;
  pipe(): this;
  pipe<A extends Mark>(f1: (m: this) => A): A;
  pipe<A extends Mark, B extends Mark>(f1: (m: this) => A, f2: (m: A) => B): B;
  pipe<A extends Mark, B extends Mark, C extends Mark>(
    f1: (m: this) => A,
    f2: (m: A) => B,
    f3: (m: B) => C
  ): C;
  pipe(...fns: ((m: Mark) => Mark)[]): Mark;
}
// third party
export const tooltip =
  (field: string) =>
  <M extends Mark>(m: M): M =>
    m.with({ tooltip: field });
export const outline =
  (width: number) =>
  (m: TextMark): TextMark =>
    m.with({ outline: width });
export const tooltipOf = <M extends Mark>(m: M, field: string): M =>
  m.with({ tooltip: field });
```

The inferred types, from `--declaration` output (`out/main.d.ts`):

```
export declare const used: import("lib").RectMark;      // rect().name().use(label("v")).use(tooltip("v")).cornerRadius(2)
export declare const piped3: import("lib").RectMark;    // rect().pipe(label, tooltip, tooltip)
export declare const piped4: import("lib").Mark;        // 4 modifiers: past the overloads, precision lost
export declare const wrapped: import("lib").RectMark;   // tooltipOf(rect().name("bars"), "v").cornerRadius(2)
export declare const wrongMark: import("lib").TextMark;
export declare const okText: import("lib").TextMark;
export declare const typo: import("lib").Mark;
```

Errors:

```
main.ts(21,39): error TS2345: Argument of type '(m: TextMark) => TextMark' is not assignable to parameter of type '(m: RectMark) => TextMark'.
  Types of parameters 'm' and 'm' are incompatible.
    Property 'fontSize' is missing in type 'RectMark' but required in type 'TextMark'.
main.ts(27,34): error TS2552: Cannot find name 'toolTip'. Did you mean 'tooltip'?
```

```
file:///.../a2/out/main.js:20
export const typo = rect({}).use(toolTip("v"));
                            ^
ReferenceError: toolTip is not defined
```

A missing import, with `--lib es2022,dom`:

```
missing.ts(3,31): error TS2304: Cannot find name 'tooltip'.
missing.ts(5,31): error TS2349: This expression is not callable.
  Type 'void' has no call signatures.
```

The second error is a forgotten `name` import that resolves to the DOM global `name`. It is still a static error. In a browser it would be a TypeError at runtime (inferred).

With the two error lines commented out, the file runs:

```
[{"type":"rect","h":"v","name":"bars","label":"v","tooltip":"v","rx":2},{"type":"rect","label":"v","tooltip":"w"},{"type":"rect","label":"v","tooltip":"x"},{"type":"rect","name":"bars","tooltip":"v","rx":2},{"type":"text","outline":1,"fontSize":12}]
```

Chaining one-argument `.use()` calls needs no overloads and stays exact at any length. A variadic `pipe` needs overloads. RxJS 7 types `Observable.pipe` up to 9 operators; the 9-plus-rest overload returns `Observable<unknown>` ([Observable.ts L392-L403](https://github.com/ReactiveX/rxjs/blob/7.x/src/internal/Observable.ts#L392-L403)).

### A3. Plain JavaScript, no type checker (`modifier-tests/a1/js/`)

```
== js/js1-method.mjs          (method, plugin never imported)
js1: module body started
js1: built {"type":"rect","name":"bars"}
file:///.../a1/js/js1-method.mjs:5
m.tooltip("v"); // plugin never imported
  ^
TypeError: m.tooltip is not a function
== js/js2-fn-noimport.mjs     (imported function, import forgotten)
js2: module body started
js2: built {"type":"rect","name":"bars"}
file:///.../a1/js/js2-fn-noimport.mjs:5
tooltip("v")(m); // forgot the import
^
ReferenceError: tooltip is not defined
== js/js3-fn-typo.mjs         (typo in a named import)
file:///.../a1/js/js3-fn-typo.mjs:2
import { toolTip } from "fn-tooltip"; // typo in a named import
         ^^^^^^^
SyntaxError: The requested module 'fn-tooltip' does not provide an export named 'toolTip'
== js/js4-method-uncalled.mjs (method call inside a function nobody calls)
js4: module body started
js4: defined later(), not called; exit clean
```

- **Missing method:** a TypeError, raised only when the call runs. Code that never runs never fails.
- **Missing import:** a ReferenceError at the call. ESLint's `no-undef` would catch it statically (not run).
- **Wrong named import:** a SyntaxError at link time, before any line of the module runs. A bundler also fails the build:

```
x Build failed in 14ms
error during build:
src3/main.js (1:15): "toolTipFn" is not exported by "src/lib.js", imported by "src3/main.js".
```

### A4. Tree-shaking (Vite 6.0.0 / Rollup, `minify: false`, `modifier-tests/a4/`)

The entry uses `rect().name()` and `labelFn`, and never uses `.tooltip()` or `tooltipFn`. The bundle:

```js
class Mark {
  constructor(spec) {
    this.spec = spec;
  }
  name(n) {
    return new Mark({ ...this.spec, name: n });
  }
  tooltip(f) {
    return new Mark({ ...this.spec, tooltip: "METHOD_TOOLTIP_BODY" + f });
  }
  use(mod) {
    return mod(this);
  }
}
const rect = (o) => new Mark({ type: "rect", ...o });
const labelFn = (f) => (m) =>
  new Mark({ ...m.spec, label: "FUNCTION_LABEL_BODY" + f });
console.log(rect({}).name("bars").use(labelFn("v")).spec);
```

The unused method stayed. The unused function `tooltipFn` was dropped.

A side-effect plugin import cannot be shaken. If the plugin marks itself `"sideEffects": false`, the bundler drops it:

```
--- dist2/out.js:
class Mark {
  constructor(s) {
    this.spec = s;
  }
}
const rect = (o) => new Mark({ type: "rect", ...o });
console.log(rect({}).tooltip("v").spec);
--- node dev (unbundled):
{ type: 'rect', tooltip: 'PATCHEDv' }
--- node bundled:
file:///.../a4/dist2/out.js:7
console.log(rect({}).tooltip("v").spec);
                     ^
TypeError: rect(...).tooltip is not a function
```

---

## B. Python (run)

### Type checkers on the three ways to add a method (`modifier-tests/b/proj/`)

`fakelib.Mark` has `pipe(self, f: Callable[Concatenate[Self, P], R], *args: P.args, **kwargs: P.kwargs) -> R`, as pandas and polars do. Three plugins add `tooltip`:

- `plugin_patch.py` monkeypatches it: `Mark.tooltip = _tooltip`.
- `plugin_ns.py` registers an accessor namespace `tt`, pandas style.
- `plugin_fn.py` exports a function `tooltip(mark: M, field: str) -> M`.

```python
a = rect(h="v").tooltip("v")                          # monkeypatched method
b = rect(h="v").tt.tooltip("v")                       # accessor namespace
c = rect(h="v").pipe(tooltip, "v").corner_radius(2)   # pipe + imported function
d = rect(h="v").pipe(tooltip, 3)                      # wrong argument type
e = rect(h="v").pipe(toolTip, "v")                    # typo / missing import
f = tooltip(rect(h="v"), "v").corner_radius(2)        # wrapping form
reveal_type(c)
```

mypy 2.4.1:

```
plugin_patch.py:8: error: "type[Mark]" has no attribute "tooltip"  [attr-defined]
user.py:6: error: "Rect" has no attribute "tooltip"  [attr-defined]
user.py:7: error: "Rect" has no attribute "tt"  [attr-defined]
user.py:9: error: Argument 1 to "pipe" of "Mark" has incompatible type "Callable[[M, str], M]"; expected "Callable[[Rect, int], Rect]"  [arg-type]
user.py:9: note: This is likely because "tooltip" has named arguments: "mark", "field". Consider marking them positional-only
user.py:10: error: Name "toolTip" is not defined; did you mean "tooltip"?  [name-defined]
user.py:12: note: Revealed type is "fakelib.Rect"
Found 5 errors in 2 files (checked 2 source files)
```

pyright 1.1.414:

```
plugin_patch.py:8:6 - error: Cannot assign to attribute "tooltip" for class "type[Mark]"
    Attribute "tooltip" is unknown (reportAttributeAccessIssue)
user.py:6:17 - error: Cannot access attribute "tooltip" for class "Rect"
    Attribute "tooltip" is unknown (reportAttributeAccessIssue)
user.py:7:17 - error: Cannot access attribute "tt" for class "Rect"
    Attribute "tt" is unknown (reportAttributeAccessIssue)
user.py:9:31 - error: Argument of type "Literal[3]" cannot be assigned to parameter "field" of type "str"
    "Literal[3]" is not assignable to "str" (reportArgumentType)
user.py:10:22 - error: "toolTip" is not defined (reportUndefinedVariable)
user.py:12:13 - information: Type of "c" is "Rect"
5 errors, 0 warnings, 1 information
```

Runtime:

```
a {'type': 'rect', 'h': 'v', 'tooltip': 'v'}
b {'type': 'rect', 'h': 'v', 'tooltip': 'v'}
c {'type': 'rect', 'h': 'v', 'tooltip': 'v', 'rx': 2}
d (wrong type, runs anyway) {'type': 'rect', 'h': 'v', 'tooltip': 3}
e: NameError name 'toolTip' is not defined
no plugin import: AttributeError 'Rect' object has no attribute 'tooltip'
```

So in Python both method-extension forms are static errors even when they work at runtime: false positives. A missing plugin import is an `AttributeError` at the call. The function form, through `.pipe` or by wrapping, is checked correctly and keeps the precise type (`Rect`).

### Name collisions in pandas and polars (`modifier-tests/b/collide.py`, run)

```
collide.py:10: UserWarning: registration of accessor <class '__main__.A'> under name 'plot' for type <class 'pandas.core.frame.DataFrame'> is overriding a preexisting attribute with the same name.
collide.py:22: UserWarning: registration of accessor <class '__main__.B2'> under name 'tt' for type <class 'pandas.core.frame.DataFrame'> is overriding a preexisting attribute with the same name.
collide.py:34: UserWarning: overriding existing custom namespace 'tt' (on DataFrame)
Traceback (most recent call last):
  ...
AttributeError: cannot override `DataFrame.columns` with custom namespace 'C3'
```

pandas warns and lets a plugin override even a built-in (`plot`). polars warns on a second plugin with the same name and refuses to override a built-in attribute.

### The real GoFish Python `Mark` (`modifier-tests/b/real_gofish_probe.py`, run against the worktree's `packages/gofish-python`)

```
after .tooltip():  _tooltip = value
after .name():     _tooltip = <lost>
IR of m: {"type": "rect", "h": "value"}
rewrite IR root type: layer
has .pipe on Mark: False
```

- **State is lost:** a monkeypatched modifier's state disappears at the next `.name()`, because `_copy_meta` (`packages/gofish-python/gofish/ast.py:605`) copies a fixed list of fields.
- **State is not serialized:** `_write_meta` (`ast.py:588`) writes only `name`, `zOrder`, `hidden` and `translate`.
- **There is no `pipe`.**

### What a third-party modifier needs in order to cross the bridge (read)

**A modifier that rewrites into existing constructs crosses with no new IR.** `tooltip_as_rewrite("value")(rect(h="value"))`, which returns `layer([mark, text(text=field).hidden()])`, emitted root type `layer` (run). The Python `@mark` decorator (`ast.py:495`) works the same way: it runs eagerly into a Mark tree and sets `__scope: true` (see `apps/docs/docs/internals/frontend/serialization.md`, "Bridge extensions").

**A modifier that needs new engine behavior needs everything the add-cross-language-construct checklist lists.** That means a descriptor entry in `packages/gofish-ir/src/frontend/descriptors.ts`, a deserializer path, engine code and a Python wrapper. Tooltip is such a modifier: grep finds no hover or tooltip code in `packages/gofish-graphics/src`.

Unknown fields are silently dropped today:

- The JS emitter "keeps only the keys the mark's descriptor declares" (`packages/gofish-graphics/src/ast/withGoFish.ts:430`).
- The descriptor's `MARK_BASE_FIELDS` (`descriptors.ts:347`) lists name, label, relate, zOrder, hidden, translate, debug and the bridge sentinels.
- `withMarkMeta` (`packages/gofish-graphics/src/serialize/fromJSON.ts:526`) applies only translate, name, zOrder and hidden.
- A JS-only modifier such as `.transition` emits nothing (`createOperator.ts:657`).
- Custom `createMark` marks are listed as an open question for IR v0.1+ (`serialization.md`, around line 1171).

A third party with new behavior would need a generic extension IR node plus a renderer-side registry. That design does not exist yet (inferred). The Python bridge essay (`apps/docs/docs/internals/python/bridge.md`) is still a draft outline.

---

## C. Precedent (verified against current docs unless marked)

### RxJS: changed its mind in 5.5/6

Source: [v6 pipeable operators guide](https://github.com/ReactiveX/rxjs/blob/6.x/docs_app/content/guide/v6/pipeable-operators.md). Quoted:

> Problems with the patched operators for dot-chaining are:
>
> 1. Any library that imports a patch operator will augment the `Observable.prototype` for all consumers of that library, creating blind dependencies. If the library removes their usage, they unknowingly break everyone else. With pipeables, you have to import the operators you need into each file you use them in.
> 2. Operators patched directly onto the prototype are not "tree-shakeable" by tools like rollup or webpack. Pipeable operators will be as they are just functions pulled in from modules directly.
> 3. Unused operators that are being imported in apps cannot be detected reliably by any sort of build tool or lint rule. That means that you might import `scan`, but stop using it, and it's still being added to your output bundle. With pipeable operators, if you're not using it, a lint rule can pick it up for you.
> 4. Functional composition is awesome. Building your own custom operators becomes much easier, and now they work and look just like all other operators in rxjs. You don't need to extend Observable or override `lift` anymore.

Also: "The `let` operator is now part of `Observable` as `pipe`". RxJS 7 types `pipe` with overloads up to 9 operators ([source](https://github.com/ReactiveX/rxjs/blob/7.x/src/internal/Observable.ts#L392-L403)).

### D3

- **`selection.call`** ([docs](https://d3js.org/d3-selection/control-flow)): "`selection.call(function, ...arguments)` Invokes the specified function exactly once, passing in this selection along with any optional arguments. Returns this selection. This is equivalent to invoking the function by hand but facilitates method chaining."
- **d3-transition** adds `selection.transition` to `d3-selection`'s prototype by side effect. Its failure mode is [d3/d3#3256](https://github.com/d3/d3/issues/3256): two d3-selection versions (1.2.0 and 1.3.0) ended up in one bundle, and "any later import of d3-transition would modify a different version of selection that we never saw". That is case f3 above. Bostock released d3@4.13.0 for the last 4.x, declined to pin the submodules ("that would exacerbate the problem"), and unpinned them in 5.0.
- Rollup users had to import `d3-transition` for its side effect (from search results; see the [mbostock gist](https://gist.github.com/mbostock/97557a39b4bfc8229786c8bccb54074d)).

### Other JS libraries

- **jQuery** ([guide](https://learn.jquery.com/plugins/basic-plugin-creation/)): `$.fn.greenify = function () {...}`. Its advice: it is "good practice when writing plugins to only take up one slot within `$.fn`", which lowers "the chance that your plugin will be overridden".
- **Chai** ([plugins guide](https://www.chaijs.com/guide/plugins/)): `chai.use(fn)`, where the function receives `chai` and `utils`, and plugins add to the `Assertion` chain. It is the same patch pattern; overwrite rules are not on that page.
- **dayjs:**
  - [Loading plugins](https://day.js.org/docs/en/plugin/loading-into-nodejs): `dayjs.extend(AdvancedFormat)`.
  - Plugin types augment the class, as in [isBetween.d.ts](https://unpkg.com/dayjs@1.11.13/plugin/isBetween.d.ts): `declare module 'dayjs' { interface Dayjs { isBetween(...): boolean } }`.
  - So importing a plugin without calling `extend` type-checks and throws (inferred from the d.ts, not run).
- **Zod:**
  - Classic Zod keeps methods (`z.string().min(5).max(10).trim()`).
  - [Zod Mini](https://zod.dev/packages/mini) moved to functions: "Bundlers are generally not able to remove ('treeshake') unused method implementations", but "they are able to remove unused top-level functions".
  - Its form is `z.string().check(z.minLength(5), z.maxLength(10), z.trim())` and `.check(z.refine(...))`: one generic method taking imported values.
- **lodash** (from memory; [docs](https://lodash.com/docs/4.17.15#chain)): `_.chain` with `_.mixin` adds methods to the wrapper and pulls in the whole library. `lodash/fp` with `flow` composes imported functions.
- **Effect** ([building pipelines](https://effect.website/docs/getting-started/building-pipelines/)): "Functions are tree shakeable, while methods are not", and "You can define your own 'extension methods' as plain old functions without the need to modify the prototypes of objects." It still has a `.pipe` method "similarly to the `pipe` method found in rxjs". fp-ts uses the same `pipe` function (from memory).
- **TC39:**
  - [Pipeline operator](https://github.com/tc39/proposal-pipeline-operator): Stage 2, Hack style, with the `%` topic token not final.
  - Call-this (J. S. Choi) and Extensions (HE Shi-Jun): Stage 1 ([stage 1 list](https://github.com/tc39/proposals/blob/main/stage-1-proposals.md)).

### Languages with real static extension methods

- **Swift.** Run with swiftc 6.2.4 (`modifier-tests/swift/`). A file that imports only `Lib` and calls `.tooltip()` from module `Plugin`:

  ```
  main.swift:2:32: error: value of type 'Mark' has no member 'tooltip'
  ```

  It compiles if another file in the same module imports `Plugin` (the old visibility leak). With `-enable-upcoming-feature MemberImportVisibility` (SE-0444):

  ```
  main.swift:2:32: error: instance method 'tooltip' is not available due to missing import of defining module 'Plugin' [#MemberImportVisibility]
  note: add import of module 'Plugin'
  ```

  It is never a runtime error. SwiftUI's `ViewModifier` is applied with `.modifier(M())`, and the convention is to wrap that in an `extension View { func cardStyle() -> some View { modifier(CardStyle()) } }`. That convention is from memory; [Apple's page](https://developer.apple.com/documentation/swiftui/viewmodifier) did not render for the fetcher.

- **Kotlin** ([extensions](https://kotlinlang.org/docs/extensions.html)): "Extension functions are dispatched statically". Outside the declaring package you "import it at the call site". "If a class has a member function and there's an extension function with the same receiver type, the same name, and compatible arguments, the member function takes precedence."
- **C#** ([extension members](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/classes-and-structs/extension-methods)): "Extension methods are only in scope when you explicitly import the namespace into your source code with a `using` directive." "An extension method isn't called if it has the same signature as a method defined in the type." C# 14 adds `extension` blocks.
- **Rust** ([book ch. 10.2](https://doc.rust-lang.org/book/ch10-02-traits.html)): "the user must bring the trait into scope as well as the types". The orphan rule means that "other people's code can't break your code and vice versa". A missing trait import is compile error E0599. The "trait not in scope" hint text is from memory; [the E0599 page](https://doc.rust-lang.org/error_codes/E0599.html) does not mention it.
- **Scala 3** ([extension methods](https://docs.scala-lang.org/scala3/reference/contextual/extension-methods.html)): an extension is visible "by being defined or inherited or imported in a scope enclosing the reference" or through given instances and implicit scope. "If more than one rewriting works, the result is an ambiguity error" (paraphrased by the fetcher).
- **Dart** ([extension methods](https://dart.dev/language/extension-methods)): "just import the library it's in, and use it like an ordinary method". Conflicts are resolved with `show`/`hide`, explicit application (`NumberParsing('42').parseInt()`) or a prefix. Calls are "resolved against the static type of the receiver", so on `dynamic` they fail at runtime with `NoSuchMethodError`.

In all of these a missing import is a compile error, and a built-in member beats an extension. TypeScript augmentation does neither: it is global to the program and decoupled from loading, and collisions merge into overloads.

### Visualization libraries

- **ggplot2** ([ggplot2 book, ch. 20](https://ggplot2-book.org/extensions.html)): a new geom is a ggproto object plus an ordinary `geom_*()` function. "All layer functions have the same form: you specify defaults in the function arguments and then call `layer()`." Built-in and third-party layers look the same after `+` (ggrepel, ggiraph).
- **Observable Plot:**
  - Marks and transforms are imported functions.
  - A transform rewrites an options object ([transforms.md](https://github.com/observablehq/plot/blob/main/docs/features/transforms.md)). `Plot.transform(options, transform)` and `initializer(options, initializer)` "composes the _initializer_ function with any other transforms present in the _options_, and returns a new _options_ object".
  - That is how a third party adds a mark option.
  - Marks also take a `render` option that can override or wrap drawing ([PR #1811](https://github.com/observablehq/plot/pull/1811/files)).
- **Vega-Lite and Altair** (from memory): tooltip is an encoding channel in a closed JSON schema. Altair is generated from that schema, so third parties cannot add channels.
- **matplotlib** (from memory): third-party plotting code is a function taking `ax=` (seaborn), plus registered projections.
- **Svelte** ([`use:`](https://svelte.dev/docs/svelte/use)): an action is a function "called when an element is mounted", typed with `Action`. "In Svelte 5.29 and newer, consider using attachments instead."
- **Solid** `use:` directives: typed by augmenting `JSX.Directives` in `declare module "solid-js"` ([docs preview](https://deploy-preview-1136--solid-docs.netlify.app/reference/jsx-attributes/use)). TypeScript can elide a directive import used only in JSX ([solid#569](https://github.com/solidjs/solid/issues/569), [example repo](https://github.com/codechips/solidjs-clickoutside-bug)). That is the same "types fine, runtime missing" gap.

### Python data libraries

- **pandas** ([extending](https://pandas.pydata.org/docs/development/extending.html)): `register_dataframe_accessor("geo")` adds a namespace. A collision is a `UserWarning` and the override proceeds (run in B). `.pipe(func, *args, **kwargs)` is the function form.
- **polars** ([register_dataframe_namespace](https://docs.pola.rs/api/python/stable/reference/api/polars.api.register_dataframe_namespace.html)): the same mechanism. It warns on a second plugin with the same name and refuses to override a built-in (run in B). It also has `.pipe`.
- **xarray** (from memory): `register_dataset_accessor` and `register_dataarray_accessor`, the same mechanism.

Type checkers do not see any of these accessors (B).

---

## D. What GoFish has today (read)

### Marks are functions, not class instances

- `createMark` (`packages/gofish-graphics/src/ast/withGoFish.ts:458`) returns `nameableMark(baseMark)` (`withGoFish.ts:633`).
- `NameableMark<T>` is a `type` alias: `Mark<T> & { name; label; zOrder; hidden; transition; translate; render; ... }` (`withGoFish.ts:375`). Module augmentation cannot extend it (case h).
- `attachModifiers` (`packages/gofish-graphics/src/ast/marks/createOperator.ts:411`) installs each method as an own property with `Object.defineProperty` (`createOperator.ts:417`), plus `translate` and the export terminals.
- The list it installs is `NAMEABLE_MODIFIERS`, which is module-private (`createOperator.ts:673`): `nameModifier` (`:453`), `labelModifier` (`:558`), `zOrderModifier`, `hiddenModifier` (`:642`) and `transitionModifier` (`:657`).
- Every chained call builds a new wrapped function and re-decorates it with that same fixed list (`modifierMethod` `createOperator.ts:313`, `return redecorate(wrapped)` at `:380`).
- `.cut` uses a separate `attachTransformModifiers` (`createOperator.ts:703`).
- Wrappers must hard-code the list. `image.tsx:366` forwards `NAMEABLE_METHODS`.

### What a third party can do today

Nothing clean:

- There is no shared prototype. The only one is `Function.prototype`, and patching it would add the method to every function.
- A property set on one mark instance disappears at the next `.name()`, because the redecoration attaches only the fixed list.
- The modifier protocol `ModifierConfig` (`createOperator.ts:205`: `name`, `apply(node, layerContext, datum, ...args)`, `tag`, `bind`, `resolveArgs`) and `attachModifiers` are not exported. `packages/gofish-graphics/src/lib.ts:104` exports only `createMark`.

I attempted a runtime probe of the real marks (`d/probe.ts` via `tsx`). It failed with `ERR_PACKAGE_PATH_NOT_EXPORTED` because the worktree's `gofish-ir` has no build output, so this paragraph rests on reading the code.

### Internal precedent for the patch pattern

`packages/gofish-graphics/src/ast/marks/builderMixins.ts:27-51` already uses prototype patching plus `declare module "./chartBuilder"` on the `ChartBuilder` class (`chartBuilder.ts:597`), for `.facet`, `.stack` and `.toJSON`. It is loaded by a side-effect import at `lib.ts:333`. The reason is to avoid an import cycle.

### No generic attachment method

Marks have no `.pipe`, `.use`, `.apply`, `.call` or `.with`. The nearest thing is `ChartBuilder.flow(...ops)` (`chartBuilder.ts:653`). The type `Operator<T, U> = (_: Mark<U>) => Promise<Mark<T>>` (`packages/gofish-graphics/src/ast/types.ts:30`) is already a function from mark to mark, which is the shape a modifier needs. The chart builder's own `.name`, `.zOrder` and `.hidden` are class methods (`chartBuilder.ts:756`, `:1117`, `:1123`).

### Python

`Mark` is a class (`gofish-python/gofish/ast.py:538`). Its modifier methods are `.name` (`:649`), `.z_order` (`:670`), `.hidden` (`:701`) and `.label` (`:752`). They copy through `_copy_meta` (`:605`) and serialize through `_write_meta` (`:588`), both with fixed field lists.

### The design rule (`apps/docs/docs/internals/design/api-design.md:252-272`)

- "A function call joins parts that are independent, or that pass very little between them."
- "A method chain is a universal interface that can read the caller's internal state, and even branch on it, or turn it into a new object."
- "An option is a local adjective of one thing."
- "A method has a function twin only for a one-child operator." Also: "A method that sets a field of the node (`.name`, `.zOrder`, `.hidden`) or reaches outward from it (`.label`, `.relate`) has no function twin (#1267)."

A generic `.use(tooltip())` is not a function twin. But making the built-ins sugar for it (design 5 below) would need this rule restated.

### Issue #1101

"Design: one extensibility model for strategy families (custom curves, tiles, overlaps)" is open and has no comments. It proposes that each strategy family accept one of its declared kinds, which cross to Python as `{ kind, ...params }`, or a user function, which would cross from Python "the way derive lambdas do today, through the callback runner". It notes that `registerRoute` was removed as a shortcut. **It says nothing about third-party packages or mark methods.**

---

## E. Synthesis (inferred from A to D)

### Design 1: prototype patch plus declaration merging

- **Built-in call:** JS `rect({h: "v"}).label("v")`. Python `rect(h="v").label("v")`.
- **Third-party call:** JS `import "gofish-tooltip"; rect(...).tooltip("v")`. Python `import gofish_tooltip; rect(...).tooltip("v")` (a monkeypatch).
- **Missing import:** in TS, a runtime TypeError at the call, whenever the types reach the program another way (b2, b3, c, f3, and `sideEffects`). In Python, mypy and pyright already flag the call even when the import is present (a false positive), and at runtime it is an `AttributeError`.
- **Typo:** static in TS (TS2551). In plain JS, a TypeError at the call.
- **Collisions:** silent, last-loaded wins, and it can hijack built-ins (cases d and e).
- **Tree-shaking:** not shakeable.
- **Looks the same as built-ins:** yes.
- **Serialization:** needs a new IR field, or the modifier is lost.
- **In GoFish:** not available without first turning marks into a class with a prototype.

### Design 2: one generic method taking an imported modifier value

- **Built-in call:** `.label("v")`, unchanged.
- **Third-party call:** JS `import { tooltip } from "gofish-tooltip"; rect(...).use(tooltip("v"))`. Python `from gofish_tooltip import tooltip; rect(...).pipe(tooltip, "v")` or `.use(tooltip("v"))`.
- **Missing import or typo:**
  - TS: TS2304/TS2552 at edit time.
  - mypy/pyright: `name-defined` / `reportUndefinedVariable`.
  - Plain JS: a SyntaxError at link time for a wrong named import, and a ReferenceError at the call for a missing one (caught statically by `no-undef`).
  - Python: a `NameError` at the call.
- **A modifier used on the wrong mark kind:** static (TS2345).
- **Collisions:** only within one file, solved with `import { tooltip as tt }`.
- **Tree-shaking:** shakeable.
- **Types:** exact at any chain length if the method takes one argument. A variadic `pipe` needs N overloads (RxJS: 9).
- **Looks the same as built-ins:** no, unless the built-ins use it too.
- **Serialization:** a rewrite modifier needs no new IR. A modifier with new behavior needs IR, the same as in every design.

### Design 3: a wrapping function

- **Call:** `tooltip(rect(...).name("bars"), "v")` in both languages.
- **Errors:** the same as design 2.
- **Reading:** inside out, and it breaks the chain.
- **Collisions, tree-shaking, serialization:** the same as design 2.
- **Looks the same as built-ins:** only if the built-ins become functions too. That contradicts api-design.md's "no function twin" rule for `.name`, `.hidden` and `.label`.

### Design 4: a registry that returns a typed builder

- **Call:** `const gf = GoFish.extend(tooltipPlugin); gf.rect(...).tooltip("v")`.
- **Typing:** typed only through the returned object. A mark from the plain `rect` import has no `.tooltip`, and that is a static error, so the guarantee holds only if the extended namespace is threaded through the whole program.
- **Collisions:** the registry can detect them at registration and throw or warn, as pandas and polars do.
- **Tree-shaking:** the registered methods are kept.
- **Precedent:** dayjs `extend`, `chai.use`.
- **Python:** decorator registration, which type checkers cannot see.

### Design 5: design 2 with the built-ins expressed as sugar over it

- **Call:** `.label(a, o)` ≡ `.use(label(a, o))`. Third parties write `.use(tooltip(...))`.
- **Effect:** one mechanism, and built-in and third-party modifiers are the same kind of value, as SwiftUI does with `.modifier()` and Zod Mini with `.check()`. The call sites still differ slightly, unless third parties also ship method sugar, which brings back design 1's risks.
- **Errors, collisions, tree-shaking, serialization:** the same as design 2.

### Is the maintainer's claim right?

**Partly.** It is right in TypeScript for methods added by module augmentation. There the type check passes whenever the augmentation's `.d.ts` is anywhere in the program, regardless of whether the runtime module is loaded, loaded before the call, loaded into the same copy of the library, or kept by the bundler. Each of those gaps produces a runtime TypeError that the checker cannot see (b2, b3, c1 to c3, f3, `sideEffects`). Collisions are silent in both the checker and at runtime (d, e). The imported-function form makes a missing import or a typo a static error in the file that uses it, and fails earlier in untyped JS as well.

It is wrong if read as "method chaining causes the problem". A generic chain method that takes an imported value gets the same static guarantee and keeps the chain. When the plugin is imported for side effects in the same file (case a), the method form is also fully static for typos.

In Python the claim holds in a stronger form. Method extension is statically rejected even when it works, and the function form through `.pipe` is checked correctly.

For GoFish specifically, the question is mostly moot for design 1. There is no prototype to patch, and the method types are a type alias.

### Recommendation

Use **design 5**: one generic chain method that takes an imported modifier value, with the built-in modifiers re-expressed through it. The spelling still needs sign-off. By precedent count `.pipe` is the strongest (RxJS, Effect, pandas, polars), with `.use` (Svelte, Chai, dayjs) and `.with` or `.check` (Zod Mini) as alternatives. A Python `pipe` should follow pandas: `pipe(f, *args, **kwargs)`.

Three reasons:

- It keeps chaining.
- It makes a missing import a static error in both languages.
- It tree-shakes, and it serializes for free for any modifier written as a rewrite into existing constructs.

**Runner-up: design 2 alone.** Built-ins stay as dedicated methods and only third parties use the generic method. It avoids restating the api-design.md "no function twin" rule, at the cost of two mechanisms.

**What would change this:**

- If no third-party modifier can cross the IR, so that only rewrite modifiers are possible, unifying the built-ins buys less, and the runner-up is enough.
- If tooltips and similar modifiers turn out to need engine behavior anyway, the real extension question moves to a generic extension IR node with a renderer registry, which is outside both designs.
- If TypeScript gains import-scoped extension members, or TC39 call-this or Extensions reaches Stage 3, the method form becomes safe.
