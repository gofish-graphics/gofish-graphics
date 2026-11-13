<script setup lang="ts">
// Figure 1 of "How does every node get its size and its place?": the
// stacked bar chart at w 240, h 200, with the size request, size and place of
// each node filled in, step by step, in the order layout fills them. The
// book cover shows it still, at its last step.
//
// Every number here is from a run of the library, not typed by hand:
// tests/tmp/book/layout-dump.mts (runLayout at w 240, h 200, axes off, with
// GOFISH_DUMP_SCOPES=1) printed the two scope solves and each node's box and
// translate. The tree is `pnpm --filter docs book:tree` on the same spec,
// with the two pass-through content layers left out.
//
// It steps with <BookStepper> rather than <TreeStepper>: its steps fill in
// values, not nodes.
import BookStepper from "../.vitepress/theme/components/book/BookStepper.vue";

defineProps<{ still?: boolean }>();

const steps = [
  {
    label: "Given",
    note: "Layout starts with the tree, a canvas of 240 by 200 pixels, and the data range of each node: y runs from 0 to 8, and x has two categories.",
  },
  {
    label: "Ask",
    note: "From the leaves up, each node writes its size request in σ. A bar asks for one share of width and its value in units of height. A stack adds its parts. The spread adds its 20 pixels of spacing.",
  },
  {
    label: "Solve",
    note: "At the root, each request is set equal to the canvas and solved for σ: 110 pixels per share on x, and 25 pixels per data unit on y.",
  },
  {
    label: "Sizes",
    note: "From the root down, each node is handed its room and σ. Each bar turns its request into pixels: 110 wide, and 25 times its value tall.",
  },
  {
    label: "Stacks",
    note: "Each stack runs its constraints: it puts its second bar on top of its first. Its box is the hull of its bars.",
  },
  {
    label: "Spread",
    note: "The spread runs its constraints: the stacks go 20 pixels apart, with their baselines (data 0) on one line.",
  },
  {
    label: "Canvas",
    note: "Last, the root is placed on the canvas. Its y grows upward, so its origin goes at the bottom left, 200 pixels down.",
  },
];

// The tree, left to right: what the node asks for (step 2), the pixels it
// gets (step 4), and where it sits in its parent (the step its parent
// places it). Places are from the parent's bottom left, as y grows upward;
// the root's is on the canvas, from its top left.
type Row = {
  depth: number;
  type: string;
  name: string;
  ask: string;
  gets: string;
  at: string;
  atStep: number;
};
const rows: Row[] = [
  {
    depth: 0,
    type: "layer",
    name: "chart",
    ask: "2σ+20 × 8σ",
    gets: "240 × 200",
    at: "(0, 200)",
    atStep: 7,
  },
  {
    depth: 1,
    type: "layer",
    name: "spread",
    ask: "2σ+20 × 8σ",
    gets: "240 × 200",
    at: "(0, 0)",
    atStep: 7,
  },
  {
    depth: 2,
    type: "layer",
    name: "stack A",
    ask: "σ × 5σ",
    gets: "110 × 125",
    at: "(0, 0)",
    atStep: 6,
  },
  {
    depth: 3,
    type: "rect",
    name: "A·x",
    ask: "σ × 2σ",
    gets: "110 × 50",
    at: "(0, 0)",
    atStep: 5,
  },
  {
    depth: 3,
    type: "rect",
    name: "A·y",
    ask: "σ × 3σ",
    gets: "110 × 75",
    at: "(0, 50)",
    atStep: 5,
  },
  {
    depth: 2,
    type: "layer",
    name: "stack B",
    ask: "σ × 8σ",
    gets: "110 × 200",
    at: "(130, 0)",
    atStep: 6,
  },
  {
    depth: 3,
    type: "rect",
    name: "B·x",
    ask: "σ × 4σ",
    gets: "110 × 100",
    at: "(0, 0)",
    atStep: 5,
  },
  {
    depth: 3,
    type: "rect",
    name: "B·y",
    ask: "σ × 4σ",
    gets: "110 × 100",
    at: "(0, 100)",
    atStep: 5,
  },
];
const ROW0 = 50;
const ROWH = 26;
const y = (i: number) => ROW0 + i * ROWH;

// The canvas picture: the canvas's top left is at (CX, CY), at 1:1.
const CX = 56;
const CY = 30;
const bars = [
  {
    id: "Ax",
    label: "A·x",
    size: "110 × 50",
    x: 0,
    y: 150,
    w: 110,
    h: 50,
    low: true,
  },
  {
    id: "Ay",
    label: "A·y",
    size: "110 × 75",
    x: 0,
    y: 75,
    w: 110,
    h: 75,
    low: false,
  },
  {
    id: "Bx",
    label: "B·x",
    size: "110 × 100",
    x: 130,
    y: 100,
    w: 110,
    h: 100,
    low: true,
  },
  {
    id: "By",
    label: "B·y",
    size: "110 × 100",
    x: 130,
    y: 0,
    w: 110,
    h: 100,
    low: false,
  },
];
</script>

<template>
  <BookStepper
    id="fig-fill"
    class="layout-fill"
    :steps="steps"
    label="Steps of layout"
    :still="still"
  >
    <template #default="{ stepClass }">
      <div class="lf-panels">
        <div class="lf-table">
          <svg
            viewBox="0 0 444 262"
            width="444"
            role="img"
            aria-label="The node tree with each node's size request, size in pixels and place in its parent"
          >
            <text class="fig-label" x="8" y="20">node</text>
            <text class="fig-label" x="166" y="20">asks for (w × h)</text>
            <text class="fig-label" x="282" y="20">gets</text>
            <text class="fig-label" x="370" y="20">sits at</text>
            <line class="fig-edge" x1="4" y1="30" x2="440" y2="30" />
            <g v-for="(r, i) in rows" :key="r.name">
              <text class="fig-mono" :x="8 + r.depth * 16" :y="y(i)">
                <tspan class="fig-faint lf-type">{{ r.type }}</tspan>
                <tspan
                  :class="r.type === 'rect' ? 'lf-user' : 'fig-text'"
                  dx="7"
                >
                  {{ r.name }}
                </tspan>
              </text>
              <text
                class="fig-mono lf-val bs-piece"
                :class="stepClass(2)"
                x="166"
                :y="y(i)"
              >
                {{ r.ask }}
              </text>
              <text
                class="fig-mono lf-val bs-piece"
                :class="stepClass(4)"
                x="282"
                :y="y(i)"
              >
                {{ r.gets }}
              </text>
              <text
                class="fig-mono lf-val bs-piece"
                :class="stepClass(r.atStep)"
                x="370"
                :y="y(i)"
              >
                {{ r.at }}
              </text>
            </g>
          </svg>
        </div>
        <div class="lf-pic">
          <svg
            viewBox="0 0 316 318"
            role="img"
            aria-label="The canvas, 240 by 200 pixels, with two stacks of two bars each"
          >
            <defs>
              <marker
                id="layout-ah"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path class="fig-ink" d="M0 0 L10 5 L0 10 z" />
              </marker>
            </defs>
            <!-- Step 1: the canvas, and the data range on each axis. -->
            <rect
              class="fig-boundary"
              :x="CX"
              :y="CY"
              width="240"
              height="200"
            />
            <text class="fig-label" :x="CX + 240" :y="CY - 8" text-anchor="end">
              canvas 240 × 200
            </text>
            <text class="fig-label" :x="CX - 6" :y="CY + 204" text-anchor="end">
              0
            </text>
            <text class="fig-label" :x="CX - 6" :y="CY + 8" text-anchor="end">
              8
            </text>
            <text
              class="fig-label"
              :x="CX + 55"
              :y="CY + 216"
              text-anchor="middle"
            >
              A
            </text>
            <text
              class="fig-label"
              :x="CX + 185"
              :y="CY + 216"
              text-anchor="middle"
            >
              B
            </text>

            <!-- Step 2: the root's request, along each edge. -->
            <g class="lf-step bs-piece" :class="stepClass(2)">
              <path
                class="fig-guide"
                :d="`M${CX} ${CY + 224}v8M${CX + 110} ${CY + 224}v8M${CX + 130} ${CY + 224}v8M${CX + 240} ${CY + 224}v8M${CX} ${CY + 228}H${CX + 240}`"
              />
              <text
                class="fig-mono-small"
                :x="CX + 55"
                :y="CY + 246"
                text-anchor="middle"
              >
                σ
              </text>
              <text
                class="fig-mono-small"
                :x="CX + 120"
                :y="CY + 246"
                text-anchor="middle"
              >
                20
              </text>
              <text
                class="fig-mono-small"
                :x="CX + 185"
                :y="CY + 246"
                text-anchor="middle"
              >
                σ
              </text>
              <path
                class="fig-guide"
                :d="`M${CX - 30} ${CY}h8M${CX - 30} ${CY + 200}h8M${CX - 26} ${CY}V${CY + 200}`"
              />
              <text
                class="fig-mono-small"
                :x="CX - 34"
                :y="CY + 104"
                text-anchor="end"
              >
                8σ
              </text>
            </g>

            <!-- Step 3: the two solves. -->
            <g class="lf-step bs-piece" :class="stepClass(3)">
              <text class="fig-mono-small lf-eq" :x="CX - 50" :y="CY + 268">
                x: 2σ + 20 = 240, σ = 110 px per share
              </text>
              <text class="fig-mono-small lf-eq" :x="CX - 50" :y="CY + 284">
                y: 8σ = 200, σ = 25 px per data unit
              </text>
            </g>

            <!-- Step 4: each bar's size, drawn where it will end up. -->
            <g class="lf-step bs-piece" :class="stepClass(4)">
              <rect
                v-for="b in bars"
                :key="b.id + '-o'"
                class="lf-outline"
                :x="CX + b.x + 0.75"
                :y="CY + b.y + 0.75"
                :width="b.w - 1.5"
                :height="b.h - 1.5"
              />
            </g>
            <!-- Step 5: the stacks place their bars. -->
            <g class="lf-step bs-piece" :class="stepClass(5)">
              <rect
                v-for="b in bars"
                :key="b.id + '-f'"
                :class="b.low ? 'lf-bar-low' : 'lf-bar-high'"
                :x="CX + b.x + 0.75"
                :y="CY + b.y + 0.75"
                :width="b.w - 1.5"
                :height="b.h - 1.5"
              />
            </g>
            <g class="lf-step bs-piece" :class="stepClass(4)">
              <template v-for="b in bars" :key="b.id + '-t'">
                <text
                  class="fig-mono-small lf-on"
                  :x="CX + b.x + 8"
                  :y="CY + b.y + 17"
                >
                  {{ b.label }}
                </text>
                <text
                  class="fig-mono-small lf-on"
                  :x="CX + b.x + 8"
                  :y="CY + b.y + 31"
                >
                  {{ b.size }}
                </text>
              </template>
            </g>

            <!-- Step 6: the spread's gap and shared baseline. -->
            <g class="lf-step bs-piece" :class="stepClass(6)">
              <line
                class="fig-guide-dash"
                :x1="CX - 4"
                :y1="CY + 200"
                :x2="CX + 244"
                :y2="CY + 200"
              />
              <path
                class="fig-guide"
                :d="`M${CX + 110} ${CY + 150}H${CX + 130}M${CX + 110} ${CY + 146}v8M${CX + 130} ${CY + 146}v8`"
              />
              <text
                class="fig-mono-small"
                :x="CX + 120"
                :y="CY + 140"
                text-anchor="middle"
              >
                20
              </text>
            </g>

            <!-- Step 7: the root's origin on the canvas. -->
            <g class="lf-step bs-piece" :class="stepClass(7)">
              <circle class="lf-origin" :cx="CX" :cy="CY + 200" r="4" />
              <line
                class="fig-line"
                :x1="CX - 12"
                :y1="CY + 184"
                :x2="CX - 12"
                :y2="CY + 152"
                marker-end="url(#layout-ah)"
              />
              <text
                class="fig-mono-small"
                :x="CX - 12"
                :y="CY + 144"
                text-anchor="middle"
              >
                y
              </text>
              <text
                class="fig-mono-small"
                :x="CX - 8"
                :y="CY + 216"
                text-anchor="end"
              >
                origin
              </text>
            </g>
          </svg>
        </div>
      </div>
    </template>
    <template #caption>
      The stacked bar chart above, rendered at 240 by 200 pixels with axes off.
      Every number is from a run of the library. Places are measured from the
      bottom left of the parent, since y grows upward; the root's place is on
      the canvas, measured from its top left. The tree leaves out two wrapper
      layers between the chart and the spread, which pass sizes and places
      through unchanged.
    </template>
  </BookStepper>
</template>

<style scoped>
.lf-panels {
  display: flex;
  flex-wrap: wrap;
  gap: 20px 32px;
  align-items: flex-start;
  justify-content: center;
}
/* The table keeps its type size; on a phone it scrolls inside its box. */
.lf-table {
  flex: 0 1 444px;
  max-width: 100%;
  overflow-x: auto;
}
.lf-table svg {
  display: block;
  width: 444px;
  height: auto;
}
.lf-pic {
  flex: 1 1 280px;
  max-width: 340px;
}
.lf-pic svg {
  display: block;
  width: 100%;
  height: auto;
}
.lf-user {
  fill: var(--fig-user);
}
.lf-val.is-new,
.lf-step.is-new .lf-eq {
  fill: var(--book-accent);
}
.lf-outline {
  fill: none;
  stroke: var(--fig-user);
  stroke-width: 1.5;
  stroke-dasharray: 4 3;
}
.lf-bar-low {
  fill: var(--fig-user);
  fill-opacity: 0.32;
  stroke: var(--fig-user);
  stroke-width: 1.5;
}
.lf-bar-high {
  fill: var(--fig-user);
  fill-opacity: 0.16;
  stroke: var(--fig-user);
  stroke-width: 1.5;
}
.lf-on {
  fill: var(--book-ink-strong);
}
.lf-origin {
  fill: var(--book-ink-strong);
}
.is-still .lf-panels {
  flex-wrap: nowrap;
}
</style>
