<script setup lang="ts">
// The figure of "How do names and refs find their targets?". The reader picks
// one of five lookups in the chapter's example, and the tree shows where the
// search starts, what it checks at each depth, where a component stops it,
// and what it finds. The book cover shows it still, on the token lookup.
import { computed, ref } from "vue";
import { rows, components, lookups } from "./names.figure";

const props = defineProps<{ still?: boolean }>();

const picked = ref(props.still ? "token" : "widen");
const lookup = computed(
  () => lookups.find((l) => l.id === picked.value) ?? lookups[0]
);

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

const visitAt = computed(() => {
  const m = new Map<number, { step: number; mark: string }>();
  for (const v of lookup.value.visits) m.set(v.row, v);
  return m;
});
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
  <figure
    id="fig-walk"
    class="book-wide names-walk"
    :class="{ 'is-still': still }"
  >
    <div
      v-if="!still"
      class="nw-picker"
      role="group"
      aria-label="Pick a lookup"
    >
      <button
        v-for="l in lookups"
        :key="l.id"
        type="button"
        class="nw-btn"
        :aria-pressed="l.id === picked"
        @click="picked = l.id"
      >
        {{ l.label }}
      </button>
    </div>
    <div class="nw-body">
      <svg
        :viewBox="`0 0 440 ${bottom + 6}`"
        role="img"
        :aria-label="`The example's node tree, with the lookup ${lookup.label}: ${lookup.result}`"
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
            :class="['fig-boundary', { 'nw-wall': lookup.walls?.includes(k) }]"
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
                'nw-start': i === lookup.start,
                'nw-hit': visitAt.get(i)?.mark === 'hit',
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
          v-for="(j, k) in lookup.jumps ?? []"
          :key="'j' + k"
          class="fig-ref-path"
          :d="jumpPath(j[0], j[1])"
          marker-end="url(#names-ah-ref)"
        />
        <!-- the walk, in the right column -->
        <g>
          <text class="fig-label" :x="RIGHT" :y="y(lookup.start) + 4">
            ◀ start
          </text>
          <g v-for="v in lookup.visits" :key="'v' + v.row">
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
          <code>{{ lookup.code }}</code>
        </p>
        <p class="nw-when">{{ lookup.when }}</p>
        <ol>
          <li v-for="(s, k) in lookup.steps" :key="k">{{ s }}</li>
        </ol>
        <p :class="['nw-result', lookup.ok ? 'is-ok' : 'is-err']">
          <strong>{{ lookup.ok ? "Found." : "Throws." }}</strong
          >&#32;<span v-if="lookup.ok">{{ lookup.result }}</span>
          <code v-else>{{ lookup.result }}</code>
        </p>
      </div>
    </div>
    <figcaption v-if="!still">
      The chapter's example as a tree, simplified from the real tree (the spread
      is a <code>layer</code> node, and token names are shown by their tag). The
      dashed boxes are the two card components. Pick a lookup to see where it
      starts and what it checks. Numbers are depths of the search; a badge
      marked "not entered" is a component the search checks by its own name and
      does not go inside. The <code>rect</code> and <code>text</code> nodes are
      components too, but they have no children, so their boundary hides
      nothing.
    </figcaption>
  </figure>
</template>

<style scoped>
.names-walk .nw-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.names-walk .nw-btn {
  font: inherit;
  font-size: 13px;
  padding: 3px 10px;
  border: 1px solid var(--book-ink-3);
  border-radius: 999px;
  background: var(--book-bg);
  color: var(--book-ink-2);
  cursor: pointer;
}
.names-walk .nw-btn:hover {
  color: var(--book-ink-strong);
  border-color: var(--book-ink-2);
}
.names-walk .nw-btn[aria-pressed="true"] {
  background: var(--fig-hl-bg);
  color: var(--fig-hl);
  border-color: var(--fig-hl);
  font-weight: 600;
}
.names-walk .nw-btn:focus-visible {
  outline: 2px solid var(--fig-hl);
  outline-offset: 2px;
}
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
