<script setup lang="ts">
// The figure of "How does a chart chain become operators, and then
// constraints?": one bar chart at three levels, top to bottom, with lines
// from each part to what it became. The code in it was run: see the chapter.
// The book cover shows it too, with `still` (no caption).
defineProps<{ still?: boolean }>();
// The three rows of the chart's data, one rect each.
const rows = [
  { k: "A", v: 3 },
  { k: "B", v: 7 },
  { k: "C", v: 5 },
];
</script>

<template>
  <figure id="fig-levels" class="book-wide lowering-fig">
    <svg
      viewBox="0 0 460 636"
      role="img"
      aria-label="The same bar chart as a chain, as a spread over three rects, and as a layer with an align and a distribute constraint, with lines from each part to what it became"
    >
      <defs>
        <marker
          id="lowering-ah"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path class="fig-ink" d="M0 0 L10 5 L0 10 z" />
        </marker>
        <marker
          id="lowering-ah-guide"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path style="fill: var(--fig-constraint)" d="M0 0 L10 5 L0 10 z" />
        </marker>
      </defs>

      <!-- 1. The chain -->
      <text class="fig-title" x="24" y="22">The chain</text>
      <text class="fig-label" x="128" y="22">what you write</text>
      <text class="fig-mono" x="24" y="49">chart(data)</text>
      <rect
        class="fig-user-stroke"
        x="36"
        y="61"
        width="343"
        height="24"
        rx="4"
      />
      <text class="fig-mono" x="44" y="77.5">
        .flow(spread({ by: "category", dir: "x" }))
      </text>
      <rect
        class="fig-user-stroke"
        x="36"
        y="92"
        width="221"
        height="24"
        rx="4"
      />
      <text class="fig-mono" x="44" y="108.5">.mark(rect({ h: "value" }))</text>

      <!-- chain to direct style -->
      <text class="fig-label" x="36" y="146">
        createOperator: split the rows by category, and call
      </text>
      <text class="fig-label" x="36" y="162">
        rect once per group. Runs in resolve(); needs the rows.
      </text>
      <!-- the operator: spread(...) to spread(..., [...]) -->
      <path
        class="fig-line"
        d="M379 73 H432 Q440 73 440 81 V228 Q440 236 432 236 H223"
        marker-end="url(#lowering-ah)"
      />
      <!-- the mark: rect(...) to one rect per group -->
      <path
        class="fig-line"
        d="M36 104 H18 Q10 104 10 112 V320 Q10 328 18 328 H48"
        marker-end="url(#lowering-ah)"
      />
      <path class="fig-line" d="M10 272 H48" marker-end="url(#lowering-ah)" />
      <path class="fig-line" d="M10 300 H48" marker-end="url(#lowering-ah)" />

      <!-- 2. Direct style -->
      <text class="fig-title" x="24" y="196">Direct style</text>
      <text class="fig-label" x="138" y="196">operators over a list</text>
      <text class="fig-mono fig-faint" x="24" y="222">chart(data).mark(</text>
      <rect
        class="fig-user-stroke"
        x="36"
        y="230"
        width="183"
        height="24"
        rx="4"
      />
      <text class="fig-mono" x="44" y="246.5">spread({ dir: "x" }, [</text>
      <g v-for="(r, i) in rows" :key="r.k">
        <rect
          class="fig-user-stroke"
          x="52"
          :y="260 + 28 * i"
          width="259"
          height="24"
          rx="4"
        />
        <text class="fig-mono" x="60" :y="276.5 + 28 * i">
          rect({ key:
          <tspan class="fig-added-text">"{{ r.k }}"</tspan>
          , h:
          <tspan class="fig-added-text">value({{ r.v }})</tspan>
          }),
        </text>
      </g>
      <text class="fig-mono fig-faint" x="36" y="360">])</text>
      <text class="fig-mono fig-faint" x="24" y="376">)</text>

      <!-- direct style to constraints -->
      <text class="fig-label" x="36" y="402">
        Spread: a layer at once. Its align and distribute
      </text>
      <text class="fig-label" x="36" y="418">
        are added when layout() starts and x has a meaning.
      </text>
      <path
        class="fig-line"
        d="M219 248 H412 Q420 248 420 256 V490 Q420 498 412 498 H328"
        marker-end="url(#lowering-ah)"
      />
      <path
        class="fig-guide"
        d="M420 490 V593 Q420 601 412 601 H333"
        marker-end="url(#lowering-ah-guide)"
      />
      <path
        class="fig-guide"
        d="M420 550 Q420 558 412 558 H333"
        marker-end="url(#lowering-ah-guide)"
      />

      <!-- 3. Constraints -->
      <text class="fig-title" x="24" y="452">Constraints</text>
      <text class="fig-label" x="134" y="452">what layout solves</text>
      <rect
        class="fig-user-stroke"
        x="24"
        y="466"
        width="300"
        height="64"
        rx="5"
      />
      <text class="fig-mono" x="34" y="484">layer</text>
      <g v-for="(r, i) in rows" :key="'c' + r.k">
        <rect
          class="fig-user"
          :x="40 + 94 * i"
          y="494"
          width="84"
          height="26"
          rx="4"
        />
        <text
          class="fig-mono fig-on-user"
          :x="82 + 94 * i"
          y="511.5"
          text-anchor="middle"
        >
          r{{ i }}: {{ r.k }}
        </text>
      </g>
      <rect class="fig-guide" x="24" y="546" width="305" height="24" rx="4" />
      <text class="fig-mono" x="32" y="562.5">
        align({ y: "baseline" }, [r0, r1, r2])
      </text>
      <rect class="fig-guide" x="24" y="580" width="305" height="42" rx="4" />
      <text class="fig-mono" x="32" y="597">
        distribute({ dir: "x", spacing: 8,
      </text>
      <text class="fig-mono" x="32" y="614">
        <tspan class="fig-added-text">measure: "category"</tspan>
        }, [r0, r1, r2])
      </text>
    </svg>
    <figcaption v-if="!still">
      One bar chart at three levels. Blue boxes are your code and the nodes it
      becomes. Red text is what the lowering fills in from the data: the group
      keys, the bar heights and the name of the category axis. Gray boxes are
      constraints. Black lines go from a part to what it became. The rects pass
      into the layer unchanged, now as slots r0, r1 and r2. Options at their
      defaults are left out. Every level was run, and the three draw the same
      bars, with the differences listed in the text.
    </figcaption>
  </figure>
</template>

<style scoped>
.lowering-fig svg {
  max-width: 620px;
}
</style>
