import { describe, expect, it } from "vitest";
import {
  condition,
  dimensions,
  filter,
  linearize,
  marginalize,
  nest,
  nestPaths,
  normalizeRecords,
  type Confusion,
} from "./pipeline";

describe("dimensions", () => {
  it("collects dimensions across actual and observed, in first-occurrence order", () => {
    const data: Confusion[] = [
      { actual: ["a:1"], observed: ["b:2"], count: 1 },
      { actual: ["c:3", "a:4"], observed: ["a:5"], count: 1 },
    ];
    expect(dimensions(data)).toEqual(["a", "b", "c"]);
  });
});

describe("normalizeRecords", () => {
  it("fills in missing dimensions with <dim>:none", () => {
    const data: Confusion[] = [
      { actual: ["a:1"], observed: ["b:2"], count: 1 },
    ];
    const out = normalizeRecords(data, ["a", "b"]);
    expect(out).toEqual([
      { actual: ["a:1", "b:none"], observed: ["b:2", "a:none"], count: 1 },
    ]);
  });

  it("leaves records with every dimension present untouched", () => {
    const data: Confusion[] = [
      { actual: ["a:1", "b:2"], observed: ["a:3", "b:4"], count: 1 },
    ];
    expect(normalizeRecords(data, ["a", "b"])).toEqual(data);
  });
});

describe("condition (beverage/state worked example)", () => {
  const records: Confusion[] = [
    {
      actual: ["beverage:soda", "state:open"],
      observed: ["beverage:soda", "state:open"],
      count: 5,
    },
    {
      actual: ["beverage:water", "state:closed"],
      observed: ["beverage:soda", "state:closed"],
      count: 2,
    },
    {
      actual: ["beverage:soda", "state:closed"],
      observed: ["beverage:water", "state:closed"],
      count: 1,
    },
  ];

  it("keeps only the matching record and strips its qualifier-side dimension", () => {
    const out = condition(records, {
      qualifier: "actual",
      label: "state",
      is: "state:open",
    });
    expect(out).toEqual([
      {
        actual: ["beverage:soda"],
        observed: ["beverage:soda", "state:open"],
        count: 5,
      },
    ]);
  });
});

describe("filter", () => {
  const records: Confusion[] = [
    { actual: ["a:1"], observed: ["b:2"], count: 1 },
    { actual: ["a:2"], observed: ["b:1"], count: 1 },
    { actual: ["c:1"], observed: ["c:1"], count: 1 },
  ];

  it("keeps records where every filter matches on either side (segment-aware)", () => {
    expect(filter(records, ["a:1"])).toEqual([records[0]]);
    // matches the observed side, not the actual side, for the second record
    expect(filter(records, ["b:1"])).toEqual([records[1]]);
  });

  it("requires ALL filters to match (each on some side)", () => {
    expect(filter(records, ["a:1", "b:2"])).toEqual([records[0]]);
    expect(filter(records, ["a:1", "c:1"])).toEqual([]);
  });

  it("uses segment boundaries, not substring matching", () => {
    const data: Confusion[] = [
      { actual: ["state:open"], observed: ["x:y"], count: 1 },
    ];
    expect(filter(data, ["stat"])).toEqual([]);
    expect(filter(data, ["state"])).toEqual(data);
  });
});

describe("linearize", () => {
  it("collapses a shared-dimension branch into a brace leaf", () => {
    expect(linearize(["a:b", "a:c"])).toEqual(["a:{b,c}"]);
  });

  it("leaves unrelated top-level branches unchanged", () => {
    expect(linearize(["a:b", "x:y"])).toEqual(["a:b", "x:y"]);
  });

  it("collapses an inline multi-group the same way", () => {
    expect(linearize(["a:[b,c]"])).toEqual(["a:{b,c}"]);
  });
});

describe("nestPaths", () => {
  it("appends the secondary dimension's whole path onto the primary", () => {
    expect(nestPaths(["abc:a", "xy:x"], ["abc", "xy"])).toEqual(["abc:a:xy:x"]);
  });

  it("leaves paths alone when the secondary dimension is absent", () => {
    expect(nestPaths(["abc:a"], ["abc", "xy"])).toEqual(["abc:a"]);
  });

  it("nests through multiple secondary classes in order", () => {
    expect(nestPaths(["abc:a", "xy:x", "z:z1"], ["abc", "xy", "z"])).toEqual([
      "abc:a:xy:x:z:z1",
    ]);
  });
});

describe("nest (records)", () => {
  it("applies nestPaths to both sides", () => {
    const records: Confusion[] = [
      { actual: ["abc:a", "xy:x"], observed: ["abc:b", "xy:y"], count: 3 },
    ];
    expect(nest(records, ["abc", "xy"])).toEqual([
      { actual: ["abc:a:xy:x"], observed: ["abc:b:xy:y"], count: 3 },
    ]);
  });
});

describe("marginalize", () => {
  it("sums counts per (actual, observed) bucket, using 'none' for a missing dimension", () => {
    const records: Confusion[] = [
      { actual: ["k:A"], observed: ["k:B"], count: 3 },
      { actual: ["k:A"], observed: ["k:B"], count: 2 },
      { actual: ["other:1"], observed: ["k:B"], count: 1 },
    ];
    expect(marginalize(records, "k")).toEqual([
      { actual: "k:A", observed: "k:B", count: 5 },
      { actual: "none", observed: "k:B", count: 1 },
    ]);
  });
});
