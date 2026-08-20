import { describe, expect, it } from "vitest";
import {
  dimension,
  isPathPrefix,
  parsePath,
  segments,
  tokenize,
} from "./paths";

describe("tokenize", () => {
  it("tokenizes a single label", () => {
    expect(tokenize("aber")).toEqual([{ label: "aber" }]);
  });

  it("tokenizes a path with colons and a bracketed multi-group", () => {
    expect(tokenize("a:ber:[c,d]")).toEqual([
      { label: "a" },
      ":",
      { label: "ber" },
      ":",
      "[",
      { label: "c" },
      ",",
      { label: "d" },
      "]",
    ]);
  });
});

describe("parsePath", () => {
  it("parses a single label", () => {
    expect(parsePath("a")).toEqual([["a"]]);
  });

  it("parses a simple chain", () => {
    expect(parsePath("a:b:c")).toEqual([["a", "b", "c"]]);
  });

  it("parses a bracketed multi-group into two roots", () => {
    expect(parsePath("[a:b,c:d]")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("parses same-named roots as two separate chains (no merge in the parser)", () => {
    expect(parsePath("[a:b,a:c]")).toEqual([
      ["a", "b"],
      ["a", "c"],
    ]);
  });

  it("distributes a trailing multi-group across the chain (a:[b,c])", () => {
    expect(parsePath("a:[b,c]")).toEqual([
      ["a", "b"],
      ["a", "c"],
    ]);
  });
});

describe("segments / dimension", () => {
  it("splits on colons", () => {
    expect(segments("animal:walking:cat")).toEqual([
      "animal",
      "walking",
      "cat",
    ]);
  });

  it("dimension is the first segment", () => {
    expect(dimension("animal:walking:cat")).toBe("animal");
    expect(dimension("animal")).toBe("animal");
  });
});

describe("isPathPrefix", () => {
  it("is true for equal paths", () => {
    expect(isPathPrefix("state:open", "state:open")).toBe(true);
  });

  it("is true for a segment-aware ancestor", () => {
    expect(isPathPrefix("state", "state:open")).toBe(true);
  });

  it("is false for a mere string prefix that isn't segment-aligned", () => {
    expect(isPathPrefix("stat", "state:open")).toBe(false);
  });

  it("is false when the candidate is longer than the path", () => {
    expect(isPathPrefix("state:open:extra", "state:open")).toBe(false);
  });

  it("is false for a divergent sibling", () => {
    expect(isPathPrefix("state:closed", "state:open")).toBe(false);
  });
});
