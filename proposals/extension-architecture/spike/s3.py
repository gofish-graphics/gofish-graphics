"""S3: run the GoFish engine inside a Python process and get scenes back as
Python data. Tries mini-racer (V8), then quickjs, then a node subprocess.

    .venv/bin/python s3.py            # all runtimes
    .venv/bin/python s3.py miniracer  # one runtime

Writes out/py/<runtime>/<spec>.json (the display lists) and prints timings.
"""
import json
import pathlib
import subprocess
import sys
import time

HERE = pathlib.Path(__file__).parent
OUT = HERE / "out"
import os
BUNDLE = (OUT / os.environ.get("ENGINE_BUNDLE", "engine.iife.js")).read_text()
WIDTHS = (OUT / "charwidths.json").read_text()
SPECS = ["bars", "scatter", "lines", "polar", "geo"]


def load_ir(name):
    msg = json.loads((OUT / "ir" / f"{name}.json").read_text())
    # HACK (declared): JS Serialize.toJSON emits Coord.geo as its runtime
    # fields (dataWindow, domain) instead of the descriptor's
    # {projection, lon, lat}, so the geo IR does not round-trip (no projection
    # -> error; no lon/lat -> whole world). Rewrite it by hand. Library bug.
    if name == "geo":
        coord = msg["doc"]["root"]["tiers"][0]["options"]["coord"]
        coord.setdefault("projection", "equalEarth")
        lon, lat = coord["dataWindow"]
        coord["lon"] = [lon["min"], lon["max"]]
        coord["lat"] = [lat["min"], lat["max"]]
    return json.dumps(msg["doc"]), json.dumps(msg["opts"])


IR = {n: load_ir(n) for n in SPECS}


class MiniRacerEngine:
    name = "miniracer"

    def __init__(self):
        from py_mini_racer import MiniRacer

        self.ctx = MiniRacer()
        self.ctx.eval(BUNDLE)
        self.ctx.eval("GoFishEngine.setCharWidths")(WIDTHS)
        self._scene = self.ctx.eval("GoFishEngine.scene")

    def scene(self, doc, opts):
        return self._scene(doc, opts).get()  # JSPromise.get() blocks until it settles

    def ctx_eval(self, src):
        return self.ctx.eval(src)


QUICKJS_PRELUDE = """
if (!Object.hasOwn) Object.hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const __def = (P, n, f) => { if (!P[n]) Object.defineProperty(P, n, { value: f, writable: true, configurable: true }); };
for (const P of [Array.prototype, Object.getPrototypeOf(Float64Array.prototype)]) {
  __def(P, "at", function (i) { i = Math.trunc(i) || 0; if (i < 0) i += this.length; return this[i]; });
  __def(P, "findLast", function (f, t) { for (let i = this.length - 1; i >= 0; i--) if (f.call(t, this[i], i, this)) return this[i]; });
  __def(P, "findLastIndex", function (f, t) { for (let i = this.length - 1; i >= 0; i--) if (f.call(t, this[i], i, this)) return i; return -1; });
  __def(P, "toReversed", function () { return Array.from(this).reverse(); });
  __def(P, "toSorted", function (c) { return Array.from(this).sort(c); });
}
__def(Array.prototype, "toSpliced", function (...a) { const c = Array.from(this); c.splice(...a); return c; });
__def(Array.prototype, "with", function (i, v) { const c = Array.from(this); c[i < 0 ? i + c.length : i] = v; return c; });
__def(String.prototype, "at", function (i) { i = Math.trunc(i) || 0; if (i < 0) i += this.length; return this[i]; });
if (!Map.groupBy) Map.groupBy = (xs, f) => { const m = new Map(); let i = 0; for (const x of xs) { const k = f(x, i++); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
if (!Object.groupBy) Object.groupBy = (xs, f) => { const o = Object.create(null); let i = 0; for (const x of xs) { const k = f(x, i++); (o[k] ??= []).push(x); } return o; };
if (typeof console === "undefined") globalThis.console = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
if (typeof structuredClone === "undefined") globalThis.structuredClone = (v) => JSON.parse(JSON.stringify(v));
"""


class QuickJSEngine:
    name = "quickjs"

    def __init__(self):
        import quickjs

        self.ctx = quickjs.Context()
        self.ctx.set_memory_limit(2**31 - 1)
        self.ctx.set_max_stack_size(64 * 2**20)
        # HACK (declared): this QuickJS build predates ES2022's Object.hasOwn,
        # which the bundle calls at module init. Polyfill it.
        self.ctx.eval(QUICKJS_PRELUDE)
        self.ctx.eval(BUNDLE)
        self.ctx.set("__w", WIDTHS)
        self.ctx.eval("GoFishEngine.setCharWidths(__w)")

    def scene(self, doc, opts):
        self.ctx.set("__doc", doc)
        self.ctx.set("__opts", opts)
        self.ctx.eval("GoFishEngine.sceneStart(__doc, __opts)")
        while self.ctx.execute_pending_job():
            pass
        res = json.loads(self.ctx.eval("GoFishEngine.sceneResult()") or "null")
        if res is None:
            raise RuntimeError("promise did not settle")
        if "err" in res:
            raise RuntimeError(res["err"][:500])
        return res["ok"]

    def ctx_eval(self, src):
        return self.ctx.eval(src)


class NodeEngine:
    name = "node-subprocess"

    def __init__(self):
        self.p = subprocess.Popen(
            ["node", str(HERE / "engine-server.mjs")],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        self._call({"charWidths": json.loads(WIDTHS)})

    def _call(self, msg):
        self.p.stdin.write(json.dumps(msg) + "\n")
        self.p.stdin.flush()
        return self.p.stdout.readline()

    def scene(self, doc, opts):
        # Re-parse to embed; a real host would send the IR bytes as-is.
        line = self._call({"doc": json.loads(doc), "opts": json.loads(opts)})
        if line.startswith('{"error"'):
            raise RuntimeError(json.loads(line)["error"][:500])
        return line

    def close(self):
        self.p.stdin.close()
        self.p.wait()


def kinds(items, acc=None):
    acc = {} if acc is None else acc
    for it in items:
        acc[it["kind"]] = acc.get(it["kind"], 0) + 1
        kinds(it.get("children", []), acc)
    return acc


def run(cls):
    print(f"\n== {cls.name}")
    t0 = time.perf_counter()
    try:
        eng = cls()
    except Exception as e:  # noqa: BLE001 - the spike reports any failure
        print(f"  cold start FAILED: {type(e).__name__}: {str(e)[:400]}")
        return None
    cold = time.perf_counter() - t0
    print(f"  cold start (runtime + bundle eval): {cold * 1000:.0f} ms")
    out = OUT / "py" / cls.name
    out.mkdir(parents=True, exist_ok=True)
    for name in SPECS:
        doc, opts = IR[name]
        try:
            times = []
            for _ in range(3):
                t = time.perf_counter()
                s = eng.scene(doc, opts)
                times.append(time.perf_counter() - t)
            t = time.perf_counter()
            scene = json.loads(s)  # the scene as Python data
            parse = time.perf_counter() - t
            (out / f"{name}.json").write_text(s)
            print(
                f"  {name:8s} first {times[0] * 1000:6.0f} ms, warm {min(times[1:]) * 1000:6.0f} ms,"
                f" json.loads {parse * 1000:4.0f} ms, {len(s) / 1024:5.0f} KiB, {kinds(scene['items'])}"
            )
        except Exception as e:  # noqa: BLE001
            print(f"  {name:8s} FAILED: {type(e).__name__}: {str(e)[:400]}")
    return eng


def column_transfer(eng):
    """Move a 1e6-row float64 column into the JS heap and sum it there."""
    import base64

    import numpy as np

    col = np.random.default_rng(0).normal(size=1_000_000)
    print(f"  1e6-row column transfer into {eng.name}:")
    if isinstance(eng, NodeEngine):
        print("    (skipped for the subprocess: it is a pipe, same cost as JSON or raw bytes over stdin)")
        return
    # 1. JSON
    t = time.perf_counter()
    s = json.dumps(col.tolist())
    t_enc = time.perf_counter() - t
    if isinstance(eng, MiniRacerEngine):
        f = eng.ctx.eval("(s) => { const a = JSON.parse(s); let t = 0; for (const v of a) t += v; return t; }")
        t = time.perf_counter()
        total = f(s)
    else:
        eng.ctx.set("__s", s)
        t = time.perf_counter()
        total = eng.ctx.eval("(() => { const a = JSON.parse(__s); let t = 0; for (const v of a) t += v; return t; })()")
    print(f"    JSON: encode {t_enc * 1000:.0f} ms, move+parse+sum {(time.perf_counter() - t) * 1000:.0f} ms ({len(s) / 1e6:.1f} MB), sum ok={abs(total - col.sum()) < 1e-6}")
    # 2. base64 of the raw float64 bytes, decoded in JS into a Float64Array.
    #    Neither runtime exposes a zero-copy ArrayBuffer from Python bytes, so
    #    base64-in-a-string is the cheapest binary path available.
    decode = """(b) => {
      const tbl = new Uint8Array(128);
      const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      for (let i = 0; i < 64; i++) tbl[A.charCodeAt(i)] = i;
      const n = (b.length / 4) * 3 - (b.endsWith('==') ? 2 : b.endsWith('=') ? 1 : 0);
      const u8 = new Uint8Array(n);
      for (let i = 0, j = 0; i < b.length; i += 4) {
        const v = (tbl[b.charCodeAt(i)] << 18) | (tbl[b.charCodeAt(i+1)] << 12) | (tbl[b.charCodeAt(i+2)] << 6) | tbl[b.charCodeAt(i+3)];
        u8[j++] = v >> 16; if (j < n) u8[j++] = (v >> 8) & 255; if (j < n) u8[j++] = v & 255;
      }
      const a = new Float64Array(u8.buffer); let t = 0; for (let i = 0; i < a.length; i++) t += a[i]; return t;
    }"""
    t = time.perf_counter()
    b = base64.b64encode(col.tobytes()).decode()
    t_enc = time.perf_counter() - t
    if isinstance(eng, MiniRacerEngine):
        f = eng.ctx.eval(decode)
        t = time.perf_counter()
        total = f(b)
    else:
        eng.ctx.set("__b", b)
        t = time.perf_counter()
        total = eng.ctx.eval(f"({decode})(__b)")
    print(f"    base64 Float64Array: encode {t_enc * 1000:.0f} ms, move+decode+sum {(time.perf_counter() - t) * 1000:.0f} ms ({len(b) / 1e6:.1f} MB), sum ok={abs(total - col.sum()) < 1e-6}")


if __name__ == "__main__":
    which = sys.argv[1:] or ["miniracer", "quickjs", "node"]
    table = {"miniracer": MiniRacerEngine, "quickjs": QuickJSEngine, "node": NodeEngine}
    for w in which:
        eng = run(table[w])
        if eng is not None:
            try:
                column_transfer(eng)
            except Exception as e:  # noqa: BLE001
                print(f"    column transfer FAILED: {type(e).__name__}: {str(e)[:300]}")
            if isinstance(eng, NodeEngine):
                eng.close()
