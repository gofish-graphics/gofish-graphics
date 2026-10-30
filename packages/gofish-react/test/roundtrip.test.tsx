import { describe, expect, it } from "vitest";
import { useState } from "react";
import { renderToString } from "react-dom/server";
import { prerenderToNodeStream } from "react-dom/static";
import { EXAMPLES } from "../examples/examples";
import {
  toGoFish,
  displayListOf,
  DisplayListSVG,
  Serialize,
  Layer,
  Rect,
} from "../src/index";

// "Excluding function identity": JSON drops functions (a coord's projection
// closures, say), so two IRs that differ only in closure identity compare equal.
const plain = (v: unknown) => JSON.parse(JSON.stringify(v));
const irOf = async (g: any) => plain(await Serialize.toJSON(g));
// Display-list item ids come from a global node counter, so they differ
// between any two builds; drop them.
const dl = (doc: unknown) =>
  JSON.parse(JSON.stringify(doc, (k, v) => (k === "id" ? undefined : v)));

async function streamToString(stream: unknown) {
  let s = "";
  for await (const chunk of stream as AsyncIterable<Buffer>)
    s += chunk.toString();
  return s;
}

for (const [id, ex] of Object.entries(EXAMPLES)) {
  describe(`${id}: ${ex.title}`, () => {
    if (ex.hasIR) {
      it("spelling A (nesting) builds the same frontend IR as the fluent chain", async () => {
        expect(await irOf(toGoFish(ex.jsx()))).toEqual(await irOf(ex.fluent()));
      });
    } else {
      it("has no JS frontend IR (the emitter throws on the fluent chain too)", async () => {
        await expect(irOf(ex.fluent())).rejects.toThrow();
        await expect(irOf(toGoFish(ex.jsx()))).rejects.toThrow();
      });
    }
    if (ex.specB)
      it("spelling B builds the same IR as the fluent chain", async () => {
        expect(await irOf(toGoFish(ex.specB!()))).toEqual(
          await irOf(ex.fluent())
        );
      });
    if (ex.specC)
      it("spelling C builds the same IR as the fluent chain", async () => {
        expect(await irOf(toGoFish(ex.specC!()))).toEqual(
          await irOf(ex.fluent())
        );
      });

    it("spelling A lays out to the same display list as the fluent chain", async () => {
      const a = await displayListOf(ex.jsx());
      const b = await ex.fluent().toDisplayList({});
      expect(dl(a)).toEqual(dl(b));
    });

    it("renderToString of the precomputed display list is an <svg>", async () => {
      const doc = await displayListOf(ex.jsx());
      const html = renderToString(<DisplayListSVG doc={doc} />);
      expect(html.startsWith("<svg")).toBe(true);
      expect(doc.items.length).toBeGreaterThan(0);
    });

    it("react-dom/static prerenderToNodeStream of the bare JSX root (suspends on layout) is an <svg>", async () => {
      const { prelude } = await prerenderToNodeStream(ex.jsx());
      const html = await streamToString(prelude as any);
      expect(html).toMatch(/^<svg/);
    });
  });
}

describe("walls", () => {
  it("renderToString of the bare JSX root cannot wait for async layout", () => {
    // No Suspense boundary: React throws; with one, it would emit the fallback.
    expect(() => renderToString(EXAMPLES.stackedBar.jsx())).toThrow(
      /suspended/
    );
  });

  it("a user component that calls a hook cannot be walked without a reconciler", async () => {
    function Bar() {
      const [h] = useState(10);
      return <Rect w={10} h={h} />;
    }
    const el = (
      <Layer>
        <Bar />
      </Layer>
    );
    // The component is called by createMark at layout time, outside React's
    // render, so React has no dispatcher for the hook.
    await expect(displayListOf(el)).rejects.toThrow();
  });
});
