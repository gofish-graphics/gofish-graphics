<script setup lang="ts">
// The figure of "How does a spec cross to Python and back?". The book cover
// shows it too. Every value in it is real output: the middle panel is what
// Python's `to_ir()` printed for the left panel's call (reformatted, rows
// cut), and the tree is what `book:tree --before` printed for the document
// rebuilt by `Serialize.buildIR`.
defineProps<{ still?: boolean }>();
</script>

<template>
  <figure id="fig-crossing" class="book-wide pyx">
    <div class="pyx__wrap">
      <div class="pyx__row">
        <section class="pyx__panel" aria-label="Python source">
          <h4 class="pyx__head">Python</h4>
          <div class="pyx__code">
            <div>chart(rows)</div>
            <div>
              &nbsp;&nbsp;.flow(<span class="pyx__gen">spread</span>(by=<span
                class="pyx__str"
                >"category"</span
              >,
            </div>
            <div>
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;dir=<span
                class="pyx__str"
                >"x"</span
              >))
            </div>
            <div>
              &nbsp;&nbsp;.mark(<span class="pyx__gen pyx__gen--whole"
                >rect</span
              >(h=<span class="pyx__str">"value"</span>))
            </div>
          </div>
          <ul class="pyx__notes">
            <li>
              <span class="pyx__key pyx__key--whole"></span><code>rect</code> is
              generated whole.
            </li>
            <li>
              <span class="pyx__key"></span><code>spread</code> is written by
              hand and calls the generated <code>_spread_opts</code>.
            </li>
          </ul>
        </section>

        <div class="pyx__arrow" aria-hidden="true">
          <span class="pyx__arrow-label">to_ir()</span>
          <span class="pyx__arrow-head"></span>
        </div>

        <section class="pyx__panel" aria-label="The serialized document">
          <h4 class="pyx__head">Frontend IR document</h4>
          <div class="pyx__code pyx__code--json">
            <div>{ "irVersion": 0,</div>
            <div>&nbsp;&nbsp;"ir": "gofish-frontend",</div>
            <div>&nbsp;&nbsp;"root": {</div>
            <div>&nbsp;&nbsp;&nbsp;&nbsp;"type": "chart",</div>
            <div>&nbsp;&nbsp;&nbsp;&nbsp;"data": { "type": "table",</div>
            <div>
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"id":
              "t0" },
            </div>
            <div>&nbsp;&nbsp;&nbsp;&nbsp;"operators": [</div>
            <div>
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{ "type": "<span
                class="pyx__gen"
                >spread</span
              >",
            </div>
            <div>
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"<span
                class="pyx__gen"
                >by</span
              >": "category",
            </div>
            <div>
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"<span
                class="pyx__gen"
                >dir</span
              >": "x" } ],
            </div>
            <div>
              &nbsp;&nbsp;&nbsp;&nbsp;"mark": { "type": "<span class="pyx__gen"
                >rect</span
              >",
            </div>
            <div>
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"<span
                class="pyx__gen"
                >h</span
              >": "value" },
            </div>
            <div>&nbsp;&nbsp;&nbsp;&nbsp;"options": {} },</div>
            <div>&nbsp;&nbsp;"tables": {</div>
            <div>
              &nbsp;&nbsp;&nbsp;&nbsp;"t0":
              <span class="pyx__cut">[ 3 rows cut ]</span>
              } }
            </div>
          </div>
          <ul class="pyx__notes">
            <li>
              <span class="pyx__key"></span>Each <code>type</code> and option
              key is a name the descriptor table declares.
            </li>
            <li>
              The notebook ships <code>t0</code> as base64 Arrow instead of JSON
              rows.
            </li>
          </ul>
        </section>

        <div class="pyx__arrow" aria-hidden="true">
          <span class="pyx__arrow-label">buildIR()</span>
          <span class="pyx__arrow-head"></span>
        </div>

        <section class="pyx__panel" aria-label="The JavaScript tree">
          <h4 class="pyx__head">JavaScript</h4>
          <div class="pyx__code">
            <div>chart(rows, {})</div>
            <div>&nbsp;&nbsp;.flow(spread({</div>
            <div>
              &nbsp;&nbsp;&nbsp;&nbsp;by:
              <span class="pyx__str">"category"</span>,
            </div>
            <div>
              &nbsp;&nbsp;&nbsp;&nbsp;dir: <span class="pyx__str">"x"</span> }))
            </div>
            <div>
              &nbsp;&nbsp;.mark(rect({ h:
              <span class="pyx__str">"value"</span> }))
            </div>
          </div>
          <div
            class="pyx__tree"
            role="list"
            aria-label="The node tree it builds"
          >
            <div class="pyx__node pyx__node--added" role="listitem">
              layer <small>chartBox</small>
            </div>
            <div class="pyx__node pyx__node--added pyx__d1" role="listitem">
              layer <small>chartContent</small>
            </div>
            <div class="pyx__node pyx__node--user pyx__d2" role="listitem">
              layer <small>the spread's output</small>
            </div>
            <div class="pyx__leaves pyx__d3" role="listitem">
              <span class="pyx__node pyx__node--leaf">rect A</span>
              <span class="pyx__node pyx__node--leaf">rect B</span>
              <span class="pyx__node pyx__node--leaf">rect C</span>
            </div>
          </div>
        </section>
      </div>

      <div v-if="!still" class="pyx__legend">
        <span
          ><i class="pyx__sw pyx__sw--gen"></i>generated from, or named in, the
          descriptor table</span
        >
        <span><i class="pyx__sw pyx__sw--user"></i>a node from your code</span>
        <span><i class="pyx__sw pyx__sw--added"></i>a node the chart adds</span>
      </div>
    </div>
    <figcaption v-if="!still">
      One bar chart at three stages. Left: the Python call. Middle: what
      <code>to_ir()</code> printed for it, with its lines rewrapped and the
      three rows cut. Right: what <code>Serialize.buildIR</code> rebuilds from
      that document, and the node tree it makes before layout, printed by
      <code>book:tree</code>. The same chart written in JavaScript prints the
      same tree.
    </figcaption>
  </figure>
</template>

<style scoped>
.pyx__wrap {
  container-type: inline-size;
}
.pyx__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
}
.pyx__panel {
  border: 1px solid var(--book-ink-3);
  border-radius: 6px;
  background: var(--book-panel);
  padding: 10px 12px 12px;
  min-width: 0;
}
.pyx__head {
  margin: 0 0 8px;
  font-family: var(--vp-font-family-base);
  font-size: 14px;
  font-weight: 600;
  color: var(--book-ink-strong);
  border: 0;
  padding: 0;
  letter-spacing: 0;
}
.pyx__code {
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  line-height: 1.55;
  color: var(--book-ink-strong);
  white-space: nowrap;
  overflow-x: auto;
}
.pyx__str {
  color: var(--book-ink-2);
}
.pyx__gen {
  color: var(--fig-added);
  font-weight: 600;
  border-bottom: 1.5px dotted var(--fig-added);
}
.pyx__gen--whole {
  border-bottom-style: solid;
}
.pyx__cut {
  color: var(--book-ink-3);
  font-style: italic;
}
.pyx__notes {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  font-family: var(--vp-font-family-base);
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--book-ink-2);
}
.pyx__notes li {
  margin: 4px 0 0;
}
.pyx__notes code {
  font-size: 11.5px;
}
.pyx__key {
  display: inline-block;
  width: 14px;
  margin-right: 6px;
  vertical-align: middle;
  border-bottom: 1.5px dotted var(--fig-added);
}
.pyx__key--whole {
  border-bottom-style: solid;
}
.pyx__arrow {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 2px 0;
}
.pyx__arrow-label {
  font-family: var(--vp-font-family-mono);
  font-size: 11.5px;
  color: var(--book-ink-2);
}
.pyx__arrow-head {
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 9px solid var(--book-ink-2);
}
.pyx__tree {
  margin-top: 12px;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.pyx__node {
  display: inline-block;
  white-space: nowrap;
  width: fit-content;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1.5px solid var(--book-ink-3);
  background: var(--book-bg);
  color: var(--book-ink-strong);
}
.pyx__node small {
  font-size: 10.5px;
  color: var(--book-ink-2);
}
.pyx__node--added {
  border-color: var(--fig-added);
}
.pyx__node--added small {
  color: var(--fig-added);
}
.pyx__node--user {
  border-color: var(--fig-user);
}
.pyx__node--leaf {
  background: var(--fig-user);
  border-color: var(--fig-user);
  color: var(--fig-on-user);
}
.pyx__leaves {
  display: flex;
  gap: 6px;
}
.pyx__d1 {
  margin-left: 14px;
}
.pyx__d2 {
  margin-left: 28px;
}
.pyx__d3 {
  margin-left: 42px;
}
.pyx__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin-top: 12px;
  font-family: var(--vp-font-family-base);
  font-size: 12.5px;
  color: var(--book-ink-2);
}
.pyx__sw {
  display: inline-block;
  width: 14px;
  height: 10px;
  margin-right: 6px;
  vertical-align: -1px;
  border-radius: 2px;
}
.pyx__sw--gen {
  height: 0;
  border-bottom: 2px dotted var(--fig-added);
  vertical-align: 3px;
}
.pyx__sw--user {
  background: var(--fig-user);
}
.pyx__sw--added {
  border: 1.5px solid var(--fig-added);
}

/* Three panels in a row when there is room: the chapter on a wide screen,
   and the cover, which lays the figure out at 860px. */
@container (min-width: 760px) {
  .pyx__row {
    grid-template-columns:
      minmax(0, 0.95fr) auto minmax(0, 1.1fr) auto
      minmax(0, 1fr);
    align-items: start;
  }
  .pyx__arrow {
    align-self: center;
    padding: 0 2px;
  }
  .pyx__arrow-label {
    writing-mode: vertical-rl;
  }
  .pyx__arrow-head {
    border-top: 6px solid transparent;
    border-bottom: 6px solid transparent;
    border-left: 9px solid var(--book-ink-2);
    border-right: 0;
  }
  .pyx__code {
    font-size: 11.5px;
  }
}
</style>
