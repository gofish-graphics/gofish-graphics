<script setup lang="ts">
// Figure 1 of "What happens between chart(...) and the pixels on screen?":
// the stages of one render, as a compiler pipeline, with the three-bar chart
// under each stage. Wide screens get two rows that read left to right; a
// narrow screen (a phone) gets one column that reads top to bottom. The
// book cover shows it still, in the wide form.
//
// Where the pictures come from (see pipeline.md, "What I ran"):
//   trees   pnpm --filter docs book:tree tests/tmp/book/pipeline-bars.mts --full
//   pixels  runLayout + lowerToDisplayList on the same spec at w 300, h 200
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { stages, loops, ticks, flows } from "./pipeline.figure";
import BookFigure from "../.vitepress/theme/components/book/BookFigure.vue";

defineProps<{ still?: boolean }>();

const root = ref<{ $el: HTMLElement } | null>(null);
const tall = ref(false);
let observer: ResizeObserver | undefined;
onMounted(() => {
  const el = root.value?.$el;
  if (!el) return;
  const check = () => (tall.value = el.clientWidth > 0 && el.clientWidth < 640);
  check();
  observer = new ResizeObserver(check);
  observer.observe(el);
});
onBeforeUnmount(() => observer?.disconnect());

type Pt = [number, number];

// Card size and the place of each part inside a card, per form.
const CARD = {
  wide: { w: 180, h: 190, thumb: [15, 50] as Pt, foot: [12, 166] as Pt },
  tall: { w: 320, h: 128, thumb: [164, 14] as Pt, foot: [12, 96] as Pt },
};

const layout = computed(() => {
  const isTall = tall.value;
  const c = isTall ? CARD.tall : CARD.wide;
  const pos: Pt[] = isTall
    ? stages.map((_, i) => [64, 50 + i * 168] as Pt)
    : stages.map((_, i) => [30 + (i % 4) * 225, i < 4 ? 56 : 330] as Pt);
  const mid = (i: number): Pt => [pos[i][0] + c.w / 2, pos[i][1] + c.h / 2];
  const arrows: { d: Pt[]; label: string[]; at: Pt; anchor: string }[] = [];
  // The input, into the first stage.
  const top: Pt = [pos[0][0] + (isTall ? c.w / 2 : 90), pos[0][1]];
  arrows.push({
    d: [[top[0], top[1] - 36], top],
    label: [flows[0]],
    at: [top[0] + 8, top[1] - 16],
    anchor: "start",
  });
  for (let i = 0; i + 1 < stages.length; i++) {
    const label = flows[i + 1].split(" ");
    if (isTall) {
      const x = mid(i)[0];
      const y0 = pos[i][1] + c.h;
      const y1 = pos[i + 1][1];
      arrows.push({
        d: [
          [x, y0],
          [x, y1],
        ],
        label: [flows[i + 1]],
        at: [x + 8, (y0 + y1) / 2 + 4],
        anchor: "start",
      });
    } else if (i === 3) {
      // From the end of the first row to the start of the second.
      const [x0] = mid(3);
      const y0 = pos[3][1] + c.h;
      const x1 = mid(4)[0] - 0;
      const y1 = pos[4][1];
      const yy = 288;
      arrows.push({
        d: [
          [x0, y0],
          [x0, yy],
          [x1 - 30, yy],
          [x1 - 30, y1],
        ],
        label: [flows[i + 1]],
        at: [457, yy - 6],
        anchor: "middle",
      });
    } else {
      const y = mid(i)[1];
      const x0 = pos[i][0] + c.w;
      const x1 = pos[i + 1][0];
      arrows.push({
        d: [
          [x0, y],
          [x1, y],
        ],
        label,
        at: [(x0 + x1) / 2, y - 8 - 12 * (label.length - 1)],
        anchor: "middle",
      });
    }
  }
  // The output, out of the last stage.
  const last = stages.length - 1;
  const out = isTall
    ? { x: mid(last)[0] - 40, y: pos[last][1] + c.h + 40, w: 80, h: 34 }
    : { x: 735, y: mid(last)[1] - 17, w: 100, h: 34 };
  arrows.push({
    d: isTall
      ? [
          [mid(last)[0], pos[last][1] + c.h],
          [mid(last)[0], out.y],
        ]
      : [
          [pos[last][0] + c.w, mid(last)[1]],
          [out.x, mid(last)[1]],
        ],
    label: [],
    at: [0, 0],
    anchor: "start",
  });

  // The loops: a stage, or a run of stages, that runs again.
  const loopPaths = loops.map((l, k) => {
    if (isTall) {
      const x = [54, 36, 18][k];
      const yFrom = pos[l.from][1] + [40, 64, 64][k];
      const yTo = pos[l.to][1] + [88, 64, 100][k];
      return {
        d: [
          [64, yFrom],
          [x, yFrom],
          [x, yTo],
          [64, yTo],
        ] as Pt[],
        label: l.label,
        at: [x - 5, (yFrom + yTo) / 2] as Pt,
        anchor: "middle",
        rotate: true,
      };
    }
    if (k === 0) {
      const xFrom = mid(l.from)[0];
      const xTo = mid(l.to)[0];
      const y = 36;
      return {
        d: [
          [xFrom, pos[l.from][1]],
          [xFrom, y],
          [xTo, y],
          [xTo, pos[l.to][1]],
        ] as Pt[],
        label: l.label,
        at: [(xFrom + xTo) / 2, y - 6] as Pt,
        anchor: "middle",
        rotate: false,
      };
    }
    const x = [0, 18, 8][k];
    const y = [0, 548, 572][k];
    const yTo = pos[0][1] + [0, 110, 140][k];
    const xFrom = mid(l.from)[0];
    return {
      d: [
        [xFrom, pos[l.from][1] + c.h],
        [xFrom, y],
        [x, y],
        [x, yTo],
        [pos[0][0], yTo],
      ] as Pt[],
      label: l.label,
      at: (k === 1 ? [xFrom + 8, y - 6] : [300, y - 6]) as Pt,
      anchor: k === 1 ? "start" : "middle",
      rotate: false,
    };
  });

  return {
    isTall,
    c,
    pos,
    arrows,
    out,
    loopPaths,
    width: isTall ? 400 : 900,
    height: isTall ? out.y + out.h + 6 : 590,
  };
});

const path = (pts: Pt[]) =>
  pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");

// An arrowhead at the end of a polyline, along its last segment.
const head = (pts: Pt[]) => {
  const [x1, y1] = pts[pts.length - 2];
  const [x2, y2] = pts[pts.length - 1];
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const s = 6;
  const a: Pt = [x2 - ux * s - uy * s * 0.55, y2 - uy * s + ux * s * 0.55];
  const b: Pt = [x2 - ux * s + uy * s * 0.55, y2 - uy * s - ux * s * 0.55];
  return `M${x2} ${y2} L${a[0]} ${a[1]} L${b[0]} ${b[1]} Z`;
};

// The bars as placed: x, y, w, h in the 300 by 200 canvas (display list).
const bars: [number, number, number, number][] = [
  [50, 92.4, 78, 65.6],
  [136, 5, 78, 153],
  [222, 48.7, 78, 109.3],
];
const S = 0.45;
</script>

<template>
  <BookFigure id="fig-stages" ref="root" class="pl-fig" :still="still">
    <svg
      class="pl-svg"
      :viewBox="`0 0 ${layout.width} ${layout.height}`"
      :style="{ maxWidth: layout.width + 'px' }"
      role="img"
      aria-label="The seven stages of a GoFish render, from the builder chain to the SVG, with the three-bar chart after each stage and arrows for the stages that run again"
    >
      <!-- Loops: what runs again. Drawn first, under the cards. -->
      <g v-for="(l, k) in layout.loopPaths" :key="'loop' + k">
        <path class="pl-loop" :d="path(l.d)" />
        <path class="pl-head-loop" :d="head(l.d)" />
        <text
          class="pl-loop-label"
          :text-anchor="l.anchor ?? 'middle'"
          :transform="
            l.rotate
              ? `translate(${l.at[0]} ${l.at[1]}) rotate(-90)`
              : `translate(${l.at[0]} ${l.at[1]})`
          "
        >
          {{ l.label }}
        </text>
      </g>

      <!-- Flows: what one stage hands the next. -->
      <g v-for="(a, k) in layout.arrows" :key="'arrow' + k">
        <path class="fig-line" :d="path(a.d)" />
        <path class="pl-head" :d="head(a.d)" />
        <text
          v-for="(line, j) in a.label"
          :key="j"
          class="pl-flow"
          :x="a.at[0]"
          :y="a.at[1] + j * 12"
          :text-anchor="a.anchor"
        >
          {{ line }}
        </text>
      </g>

      <!-- The output. -->
      <g>
        <rect
          class="pl-out"
          :x="layout.out.x"
          :y="layout.out.y"
          :width="layout.out.w"
          :height="layout.out.h"
          rx="17"
        />
        <text
          class="pl-out-text"
          :x="layout.out.x + layout.out.w / 2"
          :y="layout.out.y + layout.out.h / 2 + 4.5"
          text-anchor="middle"
        >
          &lt;svg&gt;
        </text>
      </g>

      <!-- The stages. -->
      <g
        v-for="(s, i) in stages"
        :key="s.name"
        :transform="`translate(${layout.pos[i][0]} ${layout.pos[i][1]})`"
      >
        <rect class="pl-card" :width="layout.c.w" :height="layout.c.h" rx="6" />
        <text class="pl-name" x="12" y="22">
          <tspan class="pl-num">{{ i + 1 }}</tspan>
          {{ " " + s.name }}
        </text>
        <text class="pl-sub" x="12" y="38">{{ s.sub }}</text>
        <text
          v-for="(f, j) in s.foot"
          :key="j"
          :class="f.coord ? 'pl-coord' : 'pl-foot'"
          :x="layout.c.foot[0]"
          :y="layout.c.foot[1] + j * 14"
        >
          {{ f.text }}
        </text>

        <g :transform="`translate(${layout.c.thumb[0]} ${layout.c.thumb[1]})`">
          <rect class="pl-thumb" width="150" height="100" rx="3" />

          <!-- 1 Build: the tree the builder makes. -->
          <g v-if="i === 0">
            <g
              v-for="(ln, k) in s.tree"
              :key="k"
              :transform="`translate(${8 + ln.depth * 10} ${14 + k * 14})`"
            >
              <circle class="fig-user" cx="2" cy="-3.2" r="2.6" />
              <text class="pl-mono" x="9" y="0">
                <tspan class="pl-type">{{ ln.type }}</tspan>
                {{ " " + ln.name }}
              </text>
            </g>
          </g>

          <!-- 2 Resolve: constraints installed, a type on each axis. -->
          <g v-else-if="i === 1">
            <circle class="fig-user" cx="10" cy="10.8" r="2.6" />
            <text class="pl-mono" x="17" y="14">
              <tspan class="pl-type">layer</tspan>
              spread
            </text>
            <text class="pl-mono pl-cons" x="17" y="27">align, distribute</text>
            <circle class="fig-user" cx="20" cy="38.8" r="2.6" />
            <text class="pl-mono" x="27" y="42">
              <tspan class="pl-type">rect</tspan>
              A B C
            </text>
            <line class="fig-guide" x1="8" y1="52" x2="142" y2="52" />
            <text class="pl-mono" x="8" y="68">
              <tspan class="pl-type">x</tspan>
              category: A B C
            </text>
            <text class="pl-mono" x="8" y="84">
              <tspan class="pl-type">y</tspan>
              value: 0 to 7
            </text>
          </g>

          <!-- 3 Elaborate: the library wraps the chart in rings. -->
          <g v-else-if="i === 2">
            <g
              v-for="(ln, k) in s.tree"
              :key="k"
              :transform="`translate(${8 + ln.depth * 9} ${14 + k * 14})`"
            >
              <circle
                :class="ln.added ? 'fig-added' : 'fig-user'"
                cx="2"
                cy="-3.2"
                r="2.6"
              />
              <text class="pl-mono" x="9" y="0">
                <tspan class="pl-type">{{ ln.type }}</tspan>
                {{ " " + ln.name }}
              </text>
            </g>
            <text class="pl-mono pl-type" x="8" y="91">6 nodes become 68</text>
          </g>

          <!-- 4 Ask: the room the root needs, solved for sigma. -->
          <g v-else-if="i === 3">
            <rect class="fig-guide-dash" x="10" y="8" width="24" height="84" />
            <rect class="fig-user" x="14" y="10" width="16" height="64" />
            <path class="fig-guide" d="M38 10V74M35 10H41M35 74H41" />
            <text class="pl-mono" x="44" y="45">7σ</text>
            <text class="pl-mono" x="62" y="18">canvas 200 px</text>
            <text class="pl-mono" x="62" y="34">bar of 7: 153</text>
            <text class="pl-mono" x="62" y="50">axes: 47</text>
            <text class="pl-mono pl-strong" x="62" y="72">σ = 21.86</text>
            <text class="pl-mono pl-type" x="62" y="86">px per unit</text>
          </g>

          <!-- 5 Place: every node gets a size and a place. -->
          <g v-else-if="i === 4">
            <rect
              class="fig-guide-dash"
              x="7"
              y="5"
              :width="300 * S"
              :height="200 * S"
            />
            <rect
              v-for="(b, k) in bars"
              :key="k"
              class="fig-user"
              :x="7 + b[0] * S"
              :y="5 + b[1] * S"
              :width="b[2] * S"
              :height="b[3] * S"
            />
            <text class="pl-mono pl-type" x="11" y="16" style="font-size: 9px">
              B: 136, 5
            </text>
            <text class="pl-mono pl-type" x="11" y="27" style="font-size: 9px">
              78 × 153
            </text>
          </g>

          <!-- 6 Lower: one flat list in canvas pixels. -->
          <g v-else-if="i === 5">
            <text
              v-for="(ln, k) in s.items"
              :key="k"
              :class="['pl-mono', ln.added ? 'pl-added' : 'pl-user']"
              x="8"
              :y="14 + k * 14"
            >
              {{ ln.text }}
            </text>
            <text class="pl-mono pl-type" x="8" y="91">
              39 items, no nesting
            </text>
          </g>

          <!-- 7 Paint: the SVG (a sketch at the same pixels). -->
          <g v-else>
            <g :transform="`translate(7 5) scale(${S})`">
              <rect
                v-for="(b, k) in bars"
                :key="k"
                class="fig-user"
                :x="b[0]"
                :y="b[1]"
                :width="b[2]"
                :height="b[3]"
              />
              <rect class="fig-added" x="43" y="5" width="1.6" height="153" />
              <rect
                v-for="t in ticks"
                :key="t"
                class="fig-added"
                x="38"
                :y="t"
                width="6"
                height="1.6"
              />
              <text
                v-for="(c, k) in ['A', 'B', 'C']"
                :key="c"
                class="fig-added-text"
                :x="bars[k][0] + 39"
                y="182"
                text-anchor="middle"
                font-size="17"
              >
                {{ c }}
              </text>
              <text
                class="fig-added-text"
                x="175"
                y="203"
                text-anchor="middle"
                font-size="15"
              >
                category
              </text>
              <text
                class="fig-added-text"
                font-size="15"
                text-anchor="middle"
                transform="translate(16 82) rotate(-90)"
              >
                value
              </text>
            </g>
          </g>
        </g>
      </g>
    </svg>
    <template #caption>
      One render of the three-bar chart at 300 by 200 pixels, stage by stage.
      The words on each arrow name what one stage hands the next. The gray loops
      are the stages that run again. Under each stage is the chart as that stage
      leaves it: blue for nodes from your code, red for nodes the library adds.
      The trees are printed by <code>book:tree</code> and simplified, and the
      numbers come from the display list of the same run. The blue lines at the
      foot of a stage say what a <code>Coord</code> does there.
    </template>
  </BookFigure>
</template>

<style scoped>
.pl-svg {
  display: block;
  width: 100%;
  height: auto;
  margin: 0 auto;
}
.pl-card {
  fill: var(--book-panel);
  stroke: var(--book-rule);
  stroke-width: 1.2;
}
.pl-thumb {
  fill: var(--book-bg);
  stroke: var(--book-rule);
  stroke-width: 1;
}
.pl-name {
  font-family: var(--vp-font-family-base);
  font-size: 14.5px;
  font-weight: 600;
  fill: var(--book-ink-strong);
}
.pl-num {
  fill: var(--book-ink-3);
}
.pl-sub,
.pl-foot,
.pl-coord,
.pl-flow,
.pl-loop-label {
  font-family: var(--vp-font-family-base);
  font-size: 11px;
}
.pl-sub {
  fill: var(--book-ink-2);
}
.pl-foot {
  fill: var(--book-ink-2);
  font-style: italic;
}
.pl-coord {
  fill: var(--fig-user);
}
.pl-flow {
  fill: var(--book-ink-strong);
  font-style: italic;
}
.pl-loop-label {
  fill: var(--book-ink-2);
}
.pl-loop {
  fill: none;
  stroke: var(--fig-constraint);
  stroke-width: 1.3;
}
.pl-head {
  fill: var(--book-ink-2);
}
.pl-head-loop {
  fill: var(--fig-constraint);
}
.pl-out {
  fill: var(--book-bg);
  stroke: var(--book-ink-2);
  stroke-width: 1.2;
}
.pl-out-text {
  font-family: var(--vp-font-family-mono);
  font-size: 12.5px;
  fill: var(--book-ink-strong);
}
.pl-mono {
  font-family: var(--vp-font-family-mono);
  font-size: 10px;
  fill: var(--book-ink-strong);
}
.pl-type {
  fill: var(--book-ink-3);
}
.pl-strong {
  font-weight: 600;
}
.pl-cons {
  fill: var(--fig-constraint);
}
.pl-added {
  fill: var(--fig-added);
}
.pl-user {
  fill: var(--fig-user);
}
</style>
