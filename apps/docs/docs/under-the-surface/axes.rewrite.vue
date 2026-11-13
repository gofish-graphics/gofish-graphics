<script setup lang="ts">
// Figure 1 of "How does a chart get its axes?". The chapter shows it with
// its controls. The book cover shows it still, at its last step.
import rewrite from "./axes.figure";
defineProps<{ still?: boolean }>();
</script>

<template>
  <TreeStepper id="fig-rewrite" :figure="rewrite" :still="still">
    <svg
      viewBox="0 0 340 290"
      role="img"
      aria-label="Sketch of the bar chart with bars A, B and C of values 3, 7 and 5"
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
        width="264"
        height="255.5"
      />
      <rect
        class="fig-region"
        data-id="ringV"
        x="44"
        y="0.5"
        width="256"
        height="227.5"
      />
      <rect
        class="fig-region"
        data-id="frame"
        x="82"
        y="0.5"
        width="216"
        height="225.5"
      />
      <rect
        class="fig-region"
        data-id="content"
        x="86"
        y="3"
        width="208"
        height="220"
      />
      <rect
        class="fig-region"
        data-id="labels"
        x="90"
        y="6"
        width="200"
        height="214"
      />
      <rect
        class="fig-region"
        data-id="spread"
        x="93"
        y="30"
        width="194"
        height="188"
      />
      <g data-id="cons">
        <rect class="fig-hit" x="84" y="190" width="212" height="27" />
        <line class="fig-guide-dash" x1="84" y1="214.5" x2="296" y2="214.5" />
        <path
          class="fig-guide"
          d="M143 202H167M143 198V206M167 198V206M152 196H158M152 193H158"
        />
        <path
          class="fig-guide"
          d="M213 202H237M213 198V206M237 198V206M222 196H228M222 193H228"
        />
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
        <rect class="fig-hit" x="48" y="26" width="18" height="195" />
        <path
          class="fig-added-stroke"
          stroke-width="1"
          d="M64 214H70M67 201.14H70M64 188.29H70M67 175.43H70M64 162.57H70M67 149.71H70M64 136.86H70M67 124H70M64 111.14H70M67 98.29H70M64 85.43H70M67 72.57H70M64 59.71H70M67 46.86H70M64 34H70"
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
      <g data-id="lrefA">
        <rect class="fig-ref" x="91" y="130.86" width="58" height="89.14" />
      </g>
      <g data-id="lab3">
        <text
          class="fig-added-text"
          x="120"
          y="125.86"
          text-anchor="middle"
          font-size="12.5"
          font-weight="600"
        >
          3
        </text>
      </g>
      <g data-id="lrefB">
        <rect class="fig-ref" x="161" y="28" width="58" height="192" />
      </g>
      <g data-id="lab7">
        <text
          class="fig-added-text"
          x="190"
          y="23"
          text-anchor="middle"
          font-size="12.5"
          font-weight="600"
        >
          7
        </text>
      </g>
      <g data-id="lrefC">
        <rect class="fig-ref" x="231" y="79.43" width="58" height="140.57" />
      </g>
      <g data-id="lab5">
        <text
          class="fig-added-text"
          x="260"
          y="74.43"
          text-anchor="middle"
          font-size="12.5"
          font-weight="600"
        >
          5
        </text>
      </g>
    </svg>
    <template #caption
      >Step through the rewrite. Hover a line of the tree to find it in the
      picture. The tree is the real one, printed from a run of this spec. The
      picture is a sketch of it.</template
    >
  </TreeStepper>
</template>
