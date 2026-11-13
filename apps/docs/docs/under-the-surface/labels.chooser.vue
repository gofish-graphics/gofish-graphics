<script setup lang="ts">
// Figure 1 of "How does a label find its place?": the label chooser trying
// Place.around()'s spots in order for four labeled dots. The data is in
// labels.figure.ts, printed by a run of the library. The left panel is the
// whole 300 x 200 chart; the right one is the two close dots, three times
// larger. The book cover shows it still, at its last step.
//
// This is its own small stepper, not <TreeStepper>: the picture changes what
// it shows between steps (one dot's spots at a time, one tried box at a
// time), which TreeStepper's "pieces only appear" contract cannot say.
import { computed, ref } from "vue";
import {
  W,
  H,
  R,
  FONT,
  dots,
  candidates,
  chosen,
  boxAt,
  steps,
} from "./labels.figure";

const props = defineProps<{ still?: boolean }>();
const n = steps.length;
const step = ref(props.still ? n : 1);
const cur = computed(() => steps[step.value - 1]);

// The zoomed panel: chart pixels [X0, X0 + ZW] x [Y0, Y0 + ZH], times S.
const X0 = 80;
const Y0 = 74;
const ZW = 100;
const ZH = 62;
const S = 3;
const zx = (x: number) => (x - X0) * S;
const zy = (y: number) => (y - Y0) * S;

const placedBoxes = computed(() =>
  cur.value.placed.map((name) => ({
    name,
    box: boxAt(name, candidates[name][chosen[name]]),
  }))
);
const tries = computed(() =>
  cur.value.tries.map((t) => ({
    ...t,
    box: boxAt(t.name, candidates[t.name][t.k]),
  }))
);
const marks = computed(() =>
  cur.value.marks
    ? candidates[cur.value.marks].map(([x, y], i) => ({ x, y, i }))
    : []
);
const lima = dots[0];
const limaLabel = boxAt("Lima", candidates.Lima[chosen.Lima]);

function setStep(k: number) {
  step.value = Math.max(1, Math.min(n, k));
}
function onKey(ev: KeyboardEvent) {
  if (ev.key === "ArrowLeft") {
    ev.preventDefault();
    setStep(step.value - 1);
  } else if (ev.key === "ArrowRight") {
    ev.preventDefault();
    setStep(step.value + 1);
  }
}
</script>

<template>
  <figure
    id="fig-chooser"
    class="tree-stepper book-wide lab-fig"
    :class="{ 'is-still': still }"
  >
    <div class="ts-body">
      <div v-if="!still" class="ts-controls" @keydown="onKey">
        <div class="ts-steps" role="group" aria-label="Steps of the chooser">
          <button
            v-for="(s, i) in steps"
            :key="s.label"
            type="button"
            class="ts-btn"
            :aria-pressed="i + 1 === step ? 'true' : 'false'"
            @click="setStep(i + 1)"
          >
            {{ s.label }}
          </button>
        </div>
        <div class="ts-nav">
          <button
            type="button"
            class="ts-btn"
            :disabled="step === 1"
            @click="setStep(step - 1)"
          >
            Previous
          </button>
          <button
            type="button"
            class="ts-btn"
            :disabled="step === n"
            @click="setStep(step + 1)"
          >
            Next
          </button>
        </div>
      </div>
      <p v-if="!still" class="ts-note" aria-live="polite">
        <span class="ts-count">Step {{ step }} of {{ n }}.</span>
        {{ cur.note }}
      </p>
      <div class="fig-panels lab-panels">
        <!-- The whole chart. The dashed rectangle is the frame the chooser
             keeps its labels inside. -->
        <svg
          viewBox="-26 -24 356 248"
          role="img"
          aria-label="The whole chart: four dots, Lima and Quito close together in the middle, Oslo at the lower left corner and Rome at the upper right corner"
        >
          <rect
            class="fig-boundary"
            :class="{ 'lab-hit-frame': cur.hit === 'frame' }"
            x="0"
            y="0"
            :width="W"
            :height="H"
          />
          <rect class="fig-guide" :x="X0" :y="Y0" :width="ZW" :height="ZH" />
          <circle
            v-for="d in dots"
            :key="d.name"
            class="fig-user"
            :cx="d.cx"
            :cy="d.cy"
            :r="R"
          />
          <g v-for="t in tries.filter((t) => !t.zoom)" :key="t.name + t.k">
            <rect
              class="fig-guide-dash"
              :x="t.box.minX"
              :y="t.box.minY"
              :width="t.box.maxX - t.box.minX"
              :height="t.box.maxY - t.box.minY"
            />
            <text
              class="fig-label lab-small"
              :x="(t.box.minX + t.box.maxX) / 2"
              :y="(t.box.minY + t.box.maxY) / 2 + 3.5"
              text-anchor="middle"
            >
              {{ t.k + 1 }}
            </text>
          </g>
          <text
            v-for="p in placedBoxes"
            :key="p.name"
            class="fig-added-text"
            :x="(p.box.minX + p.box.maxX) / 2"
            :y="p.box.maxY - 2.4"
            text-anchor="middle"
            :font-size="FONT"
          >
            {{ p.name }}
          </text>
          <text class="fig-label" x="0" y="216">whole chart, 300 × 200</text>
        </svg>

        <!-- The two close dots, three times larger. -->
        <svg
          :viewBox="`-4 -4 ${ZW * S + 8} ${ZH * S + 26}`"
          role="img"
          aria-label="Lima and Quito, three times larger, with the spots the chooser tries"
        >
          <rect
            class="fig-guide"
            x="0"
            y="0"
            :width="ZW * S"
            :height="ZH * S"
          />
          <circle
            v-for="d in dots.slice(0, 2)"
            :key="d.name"
            class="fig-user"
            :cx="zx(d.cx)"
            :cy="zy(d.cy)"
            :r="R * S"
          />
          <!-- The obstacle a refused spot hits. -->
          <rect
            v-if="cur.hit === 'limaLabel'"
            class="fig-outline"
            :x="zx(limaLabel.minX) - 2"
            :y="zy(limaLabel.minY) - 2"
            :width="(limaLabel.maxX - limaLabel.minX) * S + 4"
            :height="(limaLabel.maxY - limaLabel.minY) * S + 4"
            rx="3"
          />
          <circle
            v-if="cur.hit === 'limaDot'"
            class="fig-outline"
            :cx="zx(lima.cx)"
            :cy="zy(lima.cy)"
            :r="R * S + 3"
          />
          <!-- Placed labels, each in its box. -->
          <g
            v-for="p in placedBoxes.filter(
              (p) => p.name === 'Lima' || p.name === 'Quito'
            )"
            :key="p.name"
          >
            <text
              class="fig-added-text"
              :x="zx((p.box.minX + p.box.maxX) / 2)"
              :y="zy((p.box.minY + p.box.maxY) / 2) + 7.5"
              text-anchor="middle"
              font-size="22"
            >
              {{ p.name }}
            </text>
          </g>
          <!-- A tried spot: its box, refused (crossed) or taken. -->
          <g v-for="t in tries.filter((t) => t.zoom)" :key="t.name + t.k">
            <rect
              :class="t.ok ? 'fig-added-stroke' : 'fig-guide-dash'"
              :x="zx(t.box.minX)"
              :y="zy(t.box.minY)"
              :width="(t.box.maxX - t.box.minX) * S"
              :height="(t.box.maxY - t.box.minY) * S"
              stroke-width="1.5"
            />
            <path
              v-if="!t.ok"
              class="fig-line"
              :d="`M${zx(t.box.minX)} ${zy(t.box.minY)}L${zx(t.box.maxX)} ${zy(t.box.maxY)}M${zx(t.box.minX)} ${zy(t.box.maxY)}L${zx(t.box.maxX)} ${zy(t.box.minY)}`"
            />
          </g>
          <!-- One dot's spots, numbered in the order they are tried. -->
          <g v-for="m in marks" :key="m.i">
            <circle class="fig-node" :cx="zx(m.x)" :cy="zy(m.y)" r="9" />
            <text
              class="fig-label"
              :x="zx(m.x)"
              :y="zy(m.y) + 4"
              text-anchor="middle"
            >
              {{ m.i + 1 }}
            </text>
          </g>
          <text
            v-for="d in dots.slice(0, 2)"
            :key="'n' + d.name"
            class="fig-on-user lab-dot-name"
            :x="zx(d.cx)"
            :y="zy(d.cy) + 3"
            text-anchor="middle"
          >
            {{ d.name }}
          </text>
          <text class="fig-label" x="0" :y="ZH * S + 18">
            the boxed area, 3 times larger
          </text>
        </svg>
      </div>
    </div>
    <figcaption v-if="!still">
      The label chooser on four dots, each labeled with
      <code>Place.around()</code>, the default for a dot. The spots, their order
      and each outcome were printed by a run of the library in Node, where text
      is measured by the fallback rule (0.6 em per character), so a browser's
      boxes are a little different in size. Use the arrow keys on the buttons to
      step.
    </figcaption>
  </figure>
</template>

<style scoped>
.lab-panels > svg:first-child {
  flex-basis: 300px;
  max-width: 380px;
}
.lab-small {
  font-size: 9px;
}
.lab-dot-name {
  font-size: 8.5px;
  font-family: var(--vp-font-family-base);
  font-weight: 600;
}
.lab-hit-frame {
  stroke: var(--fig-hl);
  stroke-width: 1.8;
}
</style>
