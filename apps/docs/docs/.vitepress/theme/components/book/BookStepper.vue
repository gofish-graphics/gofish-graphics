<script setup lang="ts">
// The one stepper of "Under the Sea". It owns everything about stepping
// and nothing about what is drawn: the step buttons, Previous and Next, the
// "Step n of N" text, the note of the current step, the arrow keys, focus,
// the aria state, and the figure frame (<BookFigure>: anchor, legend,
// caption, `still`). The figure draws its content in the default slot, which
// receives the current step:
//
//   <BookStepper id="fig-fill" :steps="steps" label="Steps of layout"
//     :still="still" v-slot="{ step, shown, stepClass }">
//     <rect v-if="shown(2, 4)" ... />          <!-- steps 2 to 4 only -->
//     <g class="bs-piece" :class="stepClass(5)"> <!-- fades in at step 5 -->
//   </BookStepper>
//
// Steps count from 1. `picker` makes the buttons a set of choices rather
// than a sequence: no Previous and Next, no "Step n of N". `still` (the book
// cover) shows `stillStep`, or the last step, with no controls, note, legend
// or caption. Every figure file under docs/under-the-sea/ steps through
// this component or <TreeStepper>, which is built on it; `book:check` fails a
// figure that draws its own step controls. Styles: theme/book-stepper.css.
// See apps/docs/book/README.md, "Figures".
import { computed, nextTick, ref } from "vue";
import BookFigure from "./BookFigure.vue";
import type { BookStep, FigKind } from "./bookFigure";

const props = defineProps<{
  /** The anchor, "fig-<name>". */
  id: string;
  steps: BookStep[];
  /** A name for the group of step buttons, read by screen readers. */
  label?: string;
  /** The step shown first (default 1). */
  start?: number;
  /** Choices, not a sequence. */
  picker?: boolean;
  still?: boolean;
  /** The step a still figure shows (default the last). */
  stillStep?: number;
  /** The palette kinds the figure uses, listed in the legend. */
  kinds?: FigKind[];
}>();

const n = computed(() => props.steps.length);
const clamp = (k: number) => Math.max(1, Math.min(n.value, k));

/** The current step. A parent that needs it in its script (TreeStepper)
 *  binds it with v-model:step; a figure file reads it from the slot. */
const step = defineModel<number>("step");
step.value = clamp(
  props.still ? (props.stillStep ?? n.value) : (props.start ?? 1)
);
const cur = computed(() => clamp(step.value ?? 1));

function setStep(k: number) {
  step.value = clamp(k);
}

/** Whether a piece that appears at step `from`, and goes away after step
 *  `until` (if given), is shown now. */
const shown = (from: number, until?: number) =>
  cur.value >= from && (until === undefined || cur.value <= until);

/** Classes for a piece that keeps its place at every step: `is-future`
 *  before `from`, `is-past` after `until`, `is-new` at `from` itself (from
 *  step 2 on, and not when still). Give the piece class `bs-piece` to hide it
 *  when it is not shown, or style the classes yourself. */
const stepClass = (from: number, until?: number) => ({
  "is-future": cur.value < from,
  "is-past": until !== undefined && cur.value > until,
  "is-new": !props.still && !props.picker && cur.value === from && from > 1,
});

// ---- keys and focus -----------------------------------------------------
const stepsEl = ref<HTMLElement | null>(null);

function focusStepButton(k: number) {
  stepsEl.value?.querySelectorAll<HTMLButtonElement>("button")[k - 1]?.focus();
}

/** Arrow keys anywhere on the controls move one step; Home and End go to the
 *  ends. When focus is on a step button it follows the pressed one, and when
 *  Previous or Next becomes disabled under focus, focus moves to the step. */
async function onKey(ev: KeyboardEvent) {
  const to =
    ev.key === "ArrowLeft"
      ? cur.value - 1
      : ev.key === "ArrowRight"
        ? cur.value + 1
        : ev.key === "Home"
          ? 1
          : ev.key === "End"
            ? n.value
            : undefined;
  if (to === undefined) return;
  ev.preventDefault();
  setStep(to);
  const onStep = stepsEl.value?.contains(ev.target as Node);
  await nextTick();
  if (onStep) focusStepButton(cur.value);
  else if ((ev.target as HTMLButtonElement | null)?.disabled)
    focusStepButton(cur.value);
}

async function onNav(delta: number, ev: MouseEvent) {
  setStep(cur.value + delta);
  await nextTick();
  if ((ev.currentTarget as HTMLButtonElement | null)?.disabled)
    focusStepButton(cur.value);
}

const note = computed(() => props.steps[cur.value - 1]?.note);
const hasNotes = computed(() => props.steps.some((s) => s.note));
</script>

<template>
  <BookFigure :id="id" :kinds="kinds" :still="still" class="book-stepper">
    <template v-if="!still">
      <div class="bs-controls" @keydown="onKey">
        <div
          ref="stepsEl"
          class="bs-steps"
          role="group"
          :aria-label="label ?? (picker ? 'Choices' : 'Steps')"
        >
          <button
            v-for="(s, i) in steps"
            :key="s.label"
            type="button"
            class="bs-btn"
            :aria-pressed="i + 1 === cur ? 'true' : 'false'"
            @click="setStep(i + 1)"
          >
            {{ s.label }}
          </button>
        </div>
        <div v-if="!picker" class="bs-nav">
          <button
            type="button"
            class="bs-btn"
            :disabled="cur === 1"
            @click="onNav(-1, $event)"
          >
            Previous
          </button>
          <button
            type="button"
            class="bs-btn"
            :disabled="cur === n"
            @click="onNav(1, $event)"
          >
            Next
          </button>
        </div>
      </div>
      <p v-if="hasNotes" class="bs-note" aria-live="polite">
        <span v-if="!picker" class="bs-count">Step {{ cur }} of {{ n }}.</span>
        {{ note }}
      </p>
      <div v-else class="bs-gap"></div>
    </template>
    <slot
      :step="cur"
      :n="n"
      :still="!!still"
      :shown="shown"
      :step-class="stepClass"
    />
    <template v-if="$slots.caption" #caption><slot name="caption" /></template>
  </BookFigure>
</template>
