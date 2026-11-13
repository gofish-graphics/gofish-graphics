<script setup lang="ts">
// Figure 2 of "How does a chart get its axes?". The book cover shows it too.
defineProps<{ still?: boolean }>();
</script>

<template>
  <figure id="fig-names" class="book-wide">
    <div class="fig-panels">
      <svg
        viewBox="0 0 432 290"
        role="img"
        aria-label="At build time: selectAll reads a registry entry and gets three ref handles"
      >
        <defs>
          <marker
            id="axes-ah-ink"
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
            id="axes-ah-ref"
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
        <text class="fig-title" x="8" y="22">At build time: a registry</text>
        <rect class="fig-panel" x="8" y="42" width="416" height="100" rx="6" />
        <text class="fig-mono-small" x="20" y="62">scope of layer([...])</text>
        <rect
          class="fig-user-stroke"
          x="20"
          y="80"
          width="300"
          height="38"
          rx="4"
        />
        <text class="fig-mono" x="34" y="104">
          bars → [rect A, rect B, rect C]
        </text>
        <text class="fig-mono" x="8" y="206">chart(selectAll("bars"))</text>
        <path
          class="fig-line"
          d="M70 190 C 70 160, 90 140, 96 122"
          marker-end="url(#axes-ah-ink)"
        />
        <path
          class="fig-line"
          d="M250 120 C 250 170, 250 190, 251 226"
          marker-end="url(#axes-ah-ink)"
        />
        <path
          class="fig-line"
          d="M276 120 C 290 170, 320 190, 323 226"
          marker-end="url(#axes-ah-ink)"
        />
        <path
          class="fig-line"
          d="M302 120 C 330 165, 392 185, 396 226"
          marker-end="url(#axes-ah-ink)"
        />
        <rect
          class="fig-ref-box"
          x="218"
          y="232"
          width="64"
          height="26"
          rx="4"
        />
        <text
          class="fig-mono"
          x="250"
          y="249"
          text-anchor="middle"
          font-size="11"
        >
          ref → A
        </text>
        <rect
          class="fig-ref-box"
          x="291"
          y="232"
          width="64"
          height="26"
          rx="4"
        />
        <text
          class="fig-mono"
          x="323"
          y="249"
          text-anchor="middle"
          font-size="11"
        >
          ref → B
        </text>
        <rect
          class="fig-ref-box"
          x="364"
          y="232"
          width="64"
          height="26"
          rx="4"
        />
        <text
          class="fig-mono"
          x="396"
          y="249"
          text-anchor="middle"
          font-size="11"
        >
          ref → C
        </text>
      </svg>
      <svg
        viewBox="0 0 432 290"
        role="img"
        aria-label="At layout time: a string ref walks up the tree one parent at a time and stops at the nearest component"
      >
        <text class="fig-title" x="8" y="22">
          At layout time: a walk up the tree
        </text>
        <line class="fig-edge" x1="216" y1="68" x2="216" y2="112" />
        <line class="fig-edge" x1="216" y1="138" x2="132" y2="170" />
        <line class="fig-edge" x1="216" y1="138" x2="320" y2="170" />
        <line class="fig-edge" x1="132" y1="196" x2="88" y2="226" />
        <line class="fig-edge" x1="132" y1="196" x2="182" y2="226" />
        <rect
          class="fig-boundary"
          x="24"
          y="88"
          width="392"
          height="194"
          rx="10"
        />
        <text class="fig-label" x="36" y="106">component (createMark)</text>
        <rect
          class="fig-node-faint"
          x="182"
          y="42"
          width="68"
          height="26"
          rx="5"
        />
        <text
          class="fig-mono fig-faint"
          x="216"
          y="59"
          text-anchor="middle"
          font-size="12"
        >
          layer
        </text>
        <rect class="fig-node" x="182" y="112" width="68" height="26" rx="5" />
        <text
          class="fig-mono"
          x="216"
          y="129"
          text-anchor="middle"
          font-size="12"
        >
          mark
        </text>
        <rect class="fig-node" x="98" y="170" width="68" height="26" rx="5" />
        <text
          class="fig-mono"
          x="132"
          y="187"
          text-anchor="middle"
          font-size="12"
        >
          layer
        </text>
        <rect class="fig-user" x="276" y="170" width="88" height="26" rx="5" />
        <text
          class="fig-mono fig-on-user"
          x="320"
          y="187"
          text-anchor="middle"
          font-size="12"
        >
          rect "x"
        </text>
        <rect
          class="fig-node"
          x="54"
          y="226"
          width="68"
          height="26"
          rx="5"
          stroke-width="1.8"
        />
        <text
          class="fig-mono"
          x="88"
          y="243"
          text-anchor="middle"
          font-size="12"
        >
          text
        </text>
        <text class="fig-label" x="88" y="272" text-anchor="middle">start</text>
        <rect class="fig-node" x="148" y="226" width="68" height="26" rx="5" />
        <text
          class="fig-mono"
          x="182"
          y="243"
          text-anchor="middle"
          font-size="12"
        >
          rect
        </text>
        <path
          class="fig-ref-path"
          d="M54 236 C 34 222, 50 194, 94 186"
          marker-end="url(#axes-ah-ref)"
        />
        <path
          class="fig-ref-path"
          d="M98 176 C 90 146, 130 126, 176 124"
          marker-end="url(#axes-ah-ref)"
        />
        <path
          class="fig-ref-path"
          d="M252 122 C 300 122, 320 140, 320 164"
          marker-end="url(#axes-ah-ref)"
        />
      </svg>
    </div>
    <figcaption v-if="!still">
      Two ways a name is resolved. Left: selectAll reads a registry and gets a
      list of handles. Right: a string ref inside .relate() walks up the tree
      and stops at the nearest component.
    </figcaption>
  </figure>
</template>
