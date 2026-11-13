<script setup lang="ts">
// The figure of "How does a chart get its axes?". The chapter shows it with
// its controls. The book cover shows it still, at its last step.
import rewrite from "./axes.figure";
defineProps<{ still?: boolean }>();
</script>

<template>
  <TreeStepper id="fig-rewrite" :figure="rewrite" :still="still">
    <svg
      viewBox="0 0 340 290"
      role="img"
      aria-label="Sketch of the bar chart with bars A, B and C of values 3, 7 and 5, its two types, and the axes the rewrite adds"
    >
      <rect
        class="fig-region"
        data-id="ringT"
        x="6"
        y="0.5"
        width="328"
        height="285.5"
      />
      <rect
        class="fig-region"
        data-id="ringC"
        x="40"
        y="0.5"
        width="268"
        height="255.5"
      />
      <rect
        class="fig-region"
        data-id="ringV"
        x="44"
        y="0.5"
        width="258"
        height="227.5"
      />
      <rect
        class="fig-region"
        data-id="box"
        x="82"
        y="30"
        width="216"
        height="196"
      />
      <rect
        class="fig-region"
        data-id="content"
        x="86"
        y="31"
        width="208"
        height="187"
      />
      <rect
        class="fig-region"
        data-id="spread"
        x="93"
        y="32"
        width="194"
        height="184"
      />
      <g data-id="own">
        <rect
          class="fig-guide-dash"
          x="82"
          y="30"
          width="216"
          height="196"
          rx="3"
        />
      </g>
      <g data-id="tyX">
        <rect class="fig-hit" x="93" y="2" width="194" height="24" />
        <path
          class="fig-guide"
          d="M97 26V22H143V26M167 26V22H213V26M237 26V22H283V26"
        />
        <text
          class="fig-label"
          x="190"
          y="15"
          text-anchor="middle"
          font-style="italic"
        >
          x: slots A, B, C
        </text>
      </g>
      <g data-id="tyY">
        <rect class="fig-hit" x="302" y="30" width="30" height="188" />
        <path class="fig-guide" d="M302 214H308V34H302" />
        <text
          class="fig-label"
          x="0"
          y="0"
          text-anchor="middle"
          font-style="italic"
          transform="translate(324 124) rotate(90)"
        >
          y: 0 to 7
        </text>
      </g>
      <g data-id="rectA">
        <rect class="fig-user" x="97" y="136.86" width="46" height="77.14" />
      </g>
      <g data-id="rectB">
        <rect class="fig-user" x="167" y="34" width="46" height="180" />
      </g>
      <g data-id="rectC">
        <rect class="fig-user" x="237" y="85.43" width="46" height="128.57" />
      </g>
      <g data-id="axis">
        <rect class="fig-hit" x="66" y="31" width="8" height="186" />
        <line
          class="fig-added-stroke"
          stroke-width="1.5"
          x1="70"
          y1="214"
          x2="70"
          y2="34"
        />
      </g>
      <g data-id="ticks">
        <rect class="fig-hit" x="46" y="26" width="20" height="195" />
        <path
          class="fig-added-stroke"
          stroke-width="1"
          d="M64 214H70M64 201.14H70M64 188.29H70M64 175.43H70M64 162.57H70M64 149.71H70M64 136.86H70M64 124H70M64 111.14H70M64 98.29H70M64 85.43H70M64 72.57H70M64 59.71H70M64 46.86H70M64 34H70"
        />
        <text
          class="fig-added-text"
          x="60"
          y="217.8"
          text-anchor="end"
          font-size="11"
        >
          0
        </text>
        <text
          class="fig-added-text"
          x="60"
          y="192.09"
          text-anchor="end"
          font-size="11"
        >
          1
        </text>
        <text
          class="fig-added-text"
          x="60"
          y="166.37"
          text-anchor="end"
          font-size="11"
        >
          2
        </text>
        <text
          class="fig-added-text"
          x="60"
          y="140.66"
          text-anchor="end"
          font-size="11"
        >
          3
        </text>
        <text
          class="fig-added-text"
          x="60"
          y="114.94"
          text-anchor="end"
          font-size="11"
        >
          4
        </text>
        <text
          class="fig-added-text"
          x="60"
          y="89.23"
          text-anchor="end"
          font-size="11"
        >
          5
        </text>
        <text
          class="fig-added-text"
          x="60"
          y="63.51"
          text-anchor="end"
          font-size="11"
        >
          6
        </text>
        <text
          class="fig-added-text"
          x="60"
          y="37.8"
          text-anchor="end"
          font-size="11"
        >
          7
        </text>
      </g>
      <g data-id="catA">
        <text
          class="fig-added-text"
          x="120"
          y="233"
          text-anchor="middle"
          font-size="12.5"
        >
          A
        </text>
      </g>
      <g data-id="crefA">
        <rect class="fig-ref" x="94" y="133.86" width="52" height="83.14" />
      </g>
      <g data-id="catB">
        <text
          class="fig-added-text"
          x="190"
          y="233"
          text-anchor="middle"
          font-size="12.5"
        >
          B
        </text>
      </g>
      <g data-id="crefB">
        <rect class="fig-ref" x="164" y="31" width="52" height="186" />
      </g>
      <g data-id="catC">
        <text
          class="fig-added-text"
          x="260"
          y="233"
          text-anchor="middle"
          font-size="12.5"
        >
          C
        </text>
      </g>
      <g data-id="crefC">
        <rect class="fig-ref" x="234" y="82.43" width="52" height="134.57" />
      </g>
      <g data-id="span">
        <rect class="fig-hit" x="97" y="242" width="186" height="10" />
        <path
          class="fig-added-stroke"
          stroke-width="1"
          opacity="0.55"
          d="M97 247H283M97 244V250M283 244V250"
        />
      </g>
      <g data-id="trefS">
        <rect class="fig-ref" x="93" y="241" width="194" height="12" />
      </g>
      <g data-id="trefV">
        <rect class="fig-ref" x="66" y="30" width="8" height="188" />
      </g>
      <g data-id="titleC">
        <text
          class="fig-added-text"
          x="190"
          y="276"
          text-anchor="middle"
          font-size="12.5"
        >
          category
        </text>
      </g>
      <g data-id="titleV">
        <text
          class="fig-added-text"
          x="0"
          y="0"
          text-anchor="middle"
          font-size="12.5"
          transform="translate(22 124) rotate(-90)"
        >
          value
        </text>
      </g>
    </svg>
    <template #caption
      >Step through typing and the rewrite. Hover a line of the tree to find it
      in the picture. Gray italic notes with a round mark are types, which
      typing writes on the tree; they are not nodes. Hover the note beside a
      ring to see the type that made it. The tree is the real one, printed by
      <code>book:tree</code>, without the constraints of the rings and the
      spread. The picture is a sketch: it labels the whole-number ticks only,
      and the real axis labels all 15.</template
    >
  </TreeStepper>
</template>

<style>
/* Type notes: a kind of tree item the shared TreeStepper has no style for
   (see axes.figure.ts). */
.tree-stepper .ts-item.k-type {
  font-style: italic;
  color: var(--book-ink-2);
}
.tree-stepper .ts-item.k-type::before {
  box-sizing: border-box;
  width: 7px;
  height: 7px;
  border: 1.5px solid var(--book-ink-2);
  border-radius: 50%;
}
</style>
