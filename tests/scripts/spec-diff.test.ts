/**
 * Fixture tests for spec-diff.ts: which `StoryObj` exports a change to a
 * story file is credited to. Run with `tsx --test scripts/spec-diff.test.ts`
 * (part of `pnpm check-python-sync`).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { changedStoryExportsBetween } from "./spec-diff.js";

/** A story file: a meta, three helpers (one built on another), a dataset,
 * and three stories. `Plain` uses no helper, `Panel` reaches `panel` and,
 * through it, `cell`, and `Table` reaches `ROWS`. */
const file = ({
  cell = `rect({ w: 10, h: 10, fill: "none" })`,
  rows = `[1, 2, 3]`,
  plain = `circle({ r: 2 })`,
  meta = `{ title: "T" }`,
  extra = ``,
} = {}) => `
import type { Meta, StoryObj } from "@storybook/html";
import { circle, rect, layer } from "gofish-graphics";

const meta: Meta = ${meta};
export default meta;

const cell = () => ${cell};
const panel = () => layer([cell(), cell()]);
const ROWS = ${rows};
${extra}
export const Plain: StoryObj = { render: () => ${plain} };
export const Panel: StoryObj = { render: () => panel() };
export const Table: StoryObj = { render: () => ROWS.map(() => circle({ r: 1 })) };
`;

const diff = (before: object, after: object) =>
  changedStoryExportsBetween(file(before), file(after));

test("an unchanged file changes no export", () => {
  assert.deepEqual(diff({}, {}), []);
});

test("a change inside an export counts against that export only", () => {
  assert.deepEqual(diff({}, { plain: `circle({ r: 3 })` }), ["Plain"]);
});

test("a helper change counts against the exports that reach it, transitively", () => {
  assert.deepEqual(diff({}, { cell: `rect({ w: 10, h: 10 }).hidden()` }), [
    "Panel",
  ]);
});

test("a dataset change counts against the exports that read it", () => {
  assert.deepEqual(diff({}, { rows: `[1, 2]` }), ["Table"]);
});

test("a comment-only helper change is spec-neutral", () => {
  assert.deepEqual(
    diff({}, { cell: `/* a cell */ rect({ w: 10, h: 10, fill: "none" })` }),
    []
  );
});

test("a meta change counts against the whole file", () => {
  assert.equal(diff({}, { meta: `{ title: "T", args: { w: 1 } }` }), undefined);
});

test("a side-effecting top-level statement counts against the whole file", () => {
  assert.equal(diff({}, { extra: `console.log("x");` }), undefined);
});

test("a changed helper no export reaches counts against the whole file", () => {
  assert.equal(
    diff({ extra: `const unused = 1;` }, { extra: `const unused = 2;` }),
    undefined
  );
});

test("a changed helper reached from the meta counts against the whole file", () => {
  const meta = `{ title: "T", render: () => cell() }`;
  assert.equal(
    diff({ meta }, { meta, cell: `rect({ w: 10, h: 10 }).hidden()` }),
    undefined
  );
});

test("an exported non-story declaration counts against the whole file", () => {
  assert.equal(
    diff(
      { extra: `export const shared = 1;` },
      { extra: `export const shared = 2;` }
    ),
    undefined
  );
});

test("a destructuring declaration counts against the whole file", () => {
  assert.equal(
    diff(
      { extra: `const { a } = { a: 1 };` },
      { extra: `const { a } = { a: 2 };` }
    ),
    undefined
  );
});

test("a helper renamed under its one user counts against that user", () => {
  const before = file();
  const after = before
    .replace("const panel = ", "const twoCells = ")
    .replace("render: () => panel()", "render: () => twoCells()");
  assert.deepEqual(changedStoryExportsBetween(before, after), ["Panel"]);
});
