<script setup lang="ts">
// The figure of "How do names and refs find their targets?". The reader picks
// one of five lookups in the chapter's example, and the tree shows where the
// search starts, what it checks at each depth, where a component stops it,
// and what it finds. The lookups are choices, not a sequence, so the figure
// is a <BookStepper> picker. The chapter opens on the "widen" lookup; the
// book cover shows it still, on the last one, the token lookup.
import BookStepper from "../.vitepress/theme/components/book/BookStepper.vue";
import { rows, components, lookups } from "./names.figure";

defineProps<{ still?: boolean }>();

const choices = lookups.map((l) => ({ label: l.label }));
const start = lookups.findIndex((l) => l.id === "widen") + 1;

const TOP = 46;
const ROW = 27;
const X0 = 22;
const INDENT = 24;
const CHAR = 7.4;
const RIGHT = 316;

const y = (i: number) => TOP + i * ROW;
const x = (i: number) => X0 + rows[i].depth * INDENT;
const label = (i: number) =>
  rows[i].ref ? `ref → ${rows[i].name}` : rows[i].type;
const nameText = (i: number) =>
  rows[i].ref || rows[i].name === undefined
    ? ""
    : rows[i].token
      ? rows[i].name!
      : `"${rows[i].name}"`;
const pillW = (i: number) => {
  const n = nameText(i);
  return 14 + (label(i).length + (n ? n.length + 1 : 0)) * CHAR;
};
const parentOf = (i: number) => {
  for (let j = i - 1; j >= 0; j--)
    if (rows[j].depth === rows[i].depth - 1) return j;
  return -1;
};
const edges = rows
  .map((_, i) => [parentOf(i), i] as const)
  .filter(([p]) => p >= 0)
  .map(([p, i]) => `M${x(p) + 9} ${y(p) + 10} V${y(i)} H${x(i)}`);

/** For each lookup, its visit of each row. */
const visitAt = lookups.map(
  (l) => new Map(l.visits.map((v) => [v.row, v] as const))
);
const markText: Record<string, string> = {
  hit: "match",
  seen: "no match",
  closed: "not entered",
};

const jumpPath = (from: number, to: number) => {
  const after = (i: number) => x(i) + pillW(i) + (rows[i].token ? 46 : 4);
  const sx = after(from);
  const tx = after(to);
  const bend = Math.max(sx, tx) + 26;
  return `M${sx} ${y(from)} C ${bend} ${y(from)}, ${bend} ${y(to)}, ${tx} ${y(to)}`;
};

const bottom = y(rows.length - 1) + 22;
</script>

<template>
  <BookStepper
    id="fig-walk"
    class="names-walk"
    :steps="choices"
    label="Pick a lookup"
    picker
    :start="start"
    :still="still"
  >
    <template #default="{ step }">
      <div class="nw-body">
        <svg
          :viewBox="`0 0 440 ${bottom + 6}`"
          role="img"
          :aria-label="`The example's node tree, with the lookup ${lookups[step - 1].label}: ${lookups[step - 1].result}`"
        >
          <defs>
            <marker
              id="names-ah-ref"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path class="fig-ink-ref" d="M0 0 L10 5 L0 10 z" />
            </marker>
          </defs>
          <!-- the diagram: no component above it, so it is the top -->
          <rect
            class="fig-panel"
            x="4"
            y="8"
            width="432"
            :height="bottom - 4"
            rx="8"
          />
          <text class="fig-mono-small" x="14" y="24">
            diagram (no createMark above: the top)
          </text>
          <!-- the two card components -->
          <g v-for="(c, k) in components" :key="k">
            <rect
              :class="[
                'fig-boundary',
                { 'nw-wall': lookups[step - 1].walls?.includes(k) },
              ]"
              :x="x(c.from) - 8"
              :y="y(c.from) - 13"
              :width="RIGHT - 14 - (x(c.from) - 8)"
              :height="(c.to - c.from) * ROW + 26"
              rx="6"
            />
            <text
              class="fig-mono-small"
              :x="RIGHT - 20"
              :y="y(c.from) + 4"
              text-anchor="end"
            >
              {{ c.label }}
            </text>
          </g>
          <path
            v-for="(d, k) in edges"
            :key="'e' + k"
            class="fig-edge nw-edge"
            :d="d"
          />
          <!-- the nodes -->
          <g v-for="(r, i) in rows" :key="'n' + i">
            <rect
              :class="[
                r.ref ? 'fig-ref-box' : 'fig-user-stroke',
                {
                  'nw-start': i === lookups[step - 1].start,
                  'nw-hit': visitAt[step - 1].get(i)?.mark === 'hit',
                },
              ]"
              :x="x(i)"
              :y="y(i) - 10"
              :width="pillW(i)"
              height="20"
              rx="4"
            />
            <text class="fig-mono" :x="x(i) + 7" :y="y(i) + 4.5">
              {{ label(i) }}
              <tspan v-if="nameText(i)" class="nw-name" dx="7.4">
                {{ nameText(i) }}
              </tspan>
            </text>
            <text
              v-if="r.token"
              class="fig-mono-small nw-token"
              :x="x(i) + pillW(i) + 5"
              :y="y(i) + 4"
            >
              token
            </text>
            <text
              v-else-if="r.note"
              class="fig-mono-small fig-faint"
              :x="x(i) + pillW(i) + 6"
              :y="y(i) + 4"
            >
              {{ r.note }}
            </text>
          </g>
          <!-- token jumps -->
          <path
            v-for="(j, k) in lookups[step - 1].jumps ?? []"
            :key="'j' + k"
            class="fig-ref-path"
            :d="jumpPath(j[0], j[1])"
            marker-end="url(#names-ah-ref)"
          />
          <!-- the walk, in the right column -->
          <g>
            <text
              class="fig-label"
              :x="RIGHT"
              :y="y(lookups[step - 1].start) + 4"
            >
              ◀ start
            </text>
            <g v-for="v in lookups[step - 1].visits" :key="'v' + v.row">
              <circle
                :class="['nw-badge', 'is-' + v.mark]"
                :cx="RIGHT + 8"
                :cy="y(v.row)"
                r="8"
              />
              <text
                :class="['nw-badge-n', 'is-' + v.mark]"
                :x="RIGHT + 8"
                :y="y(v.row) + 4"
                text-anchor="middle"
              >
                {{ v.step }}
              </text>
              <text class="fig-label" :x="RIGHT + 21" :y="y(v.row) + 4">
                {{ markText[v.mark] }}
              </text>
            </g>
          </g>
        </svg>
        <div v-if="!still" class="nw-panel" aria-live="polite">
          <p class="nw-code">
            <code>{{ lookups[step - 1].code }}</code>
          </p>
          <p class="nw-when">{{ lookups[step - 1].when }}</p>
          <ol>
            <li v-for="(s, k) in lookups[step - 1].steps" :key="k">{{ s }}</li>
          </ol>
          <p :class="['nw-result', lookups[step - 1].ok ? 'is-ok' : 'is-err']">
            <strong>{{ lookups[step - 1].ok ? "Found." : "Throws." }}</strong
            >&#32;<span v-if="lookups[step - 1].ok">{{
              lookups[step - 1].result
            }}</span>
            <code v-else>{{ lookups[step - 1].result }}</code>
          </p>
        </div>
      </div>
    </template>
    <template #caption>
      The chapter's example as a tree, simplified from the real tree (the spread
      is a <code>layer</code> node, and token names are shown by their tag). The
      dashed boxes are the two card components. Pick a lookup to see where it
      starts and what it checks. Numbers are depths of the search; a badge
      marked "not entered" is a component the search checks by its own name and
      does not go inside. The <code>rect</code> and <code>text</code> nodes are
      components too, but they have no children, so their boundary hides
      nothing.
    </template>
  </BookStepper>
</template>

<style scoped>
.names-walk .nw-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px 24px;
}
@media (min-width: 860px) {
  .names-walk:not(.is-still) .nw-body {
    grid-template-columns: minmax(0, 440px) minmax(0, 1fr);
    align-items: start;
  }
}
.names-walk svg {
  width: 100%;
  max-width: 440px;
  height: auto;
  display: block;
  margin: 0 auto;
}
.names-walk .nw-edge {
  fill: none;
}
.names-walk .nw-name {
  fill: var(--fig-user);
}
.names-walk .nw-token {
  fill: var(--fig-ref);
}
.names-walk .nw-start {
  stroke: var(--fig-hl);
  stroke-width: 2.6;
}
.names-walk .nw-hit {
  fill: var(--fig-hl-bg);
  stroke: var(--fig-hl);
  stroke-width: 2;
}
.names-walk .nw-wall {
  stroke: var(--fig-hl);
  stroke-width: 2.4;
  stroke-dasharray: none;
}
.names-walk .nw-badge {
  stroke-width: 1.4;
}
.names-walk .nw-badge.is-hit {
  fill: var(--fig-user);
  stroke: var(--fig-user);
}
.names-walk .nw-badge.is-seen {
  fill: var(--book-bg);
  stroke: var(--fig-constraint);
}
.names-walk .nw-badge.is-closed {
  fill: var(--book-bg);
  stroke: var(--fig-hl);
  stroke-dasharray: 2 2;
}
.names-walk .nw-badge-n {
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  fill: var(--book-ink-2);
}
.names-walk .nw-badge-n.is-hit {
  fill: var(--fig-on-user);
}
.names-walk .nw-panel {
  font-size: 14px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.names-walk .nw-panel p,
.names-walk .nw-panel ol {
  margin: 0 0 8px;
}
.names-walk .nw-panel ol {
  padding-left: 1.3em;
}
.names-walk .nw-when {
  color: var(--book-ink-2);
  font-size: 13px;
}
.names-walk .nw-result code {
  font-size: 12.5px;
}
</style>
