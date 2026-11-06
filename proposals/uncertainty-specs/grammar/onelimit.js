document.getElementById("p-one-limit").innerHTML = `
<style>
#p-one-limit .figrow { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin: 18px 0 6px; }
#p-one-limit .fig { background: var(--surface); border: 1px solid var(--rule); border-radius: 8px; padding: 10px 12px 8px; }
#p-one-limit .fig h5 { margin: 0 0 6px; font-size: 0.88rem; }
#p-one-limit .fig p { margin: 4px 0 0; font-size: 0.82rem; color: var(--muted); }
#p-one-limit canvas, #p-one-limit svg.plot { width: 100%; height: auto; display: block; }
#p-one-limit figcaption { font-size: 0.9rem; color: var(--muted); max-width: 72ch; margin: 6px 0 22px; }
#p-one-limit .key { background: var(--accent-soft); border-left: 3px solid var(--accent); padding: 10px 14px; border-radius: 4px; margin: 14px 0; max-width: 72ch; }
#p-one-limit .key p { margin: 0; }
#p-one-limit .warnbox { background: var(--warn-soft); border-left: 3px solid var(--warn); padding: 10px 14px; border-radius: 4px; margin: 14px 0; max-width: 72ch; }
#p-one-limit .warnbox p { margin: 0; }
#p-one-limit table { border-collapse: collapse; margin: 12px 0 18px; font-size: 0.92rem; }
#p-one-limit th, #p-one-limit td { border-bottom: 1px solid var(--rule); padding: 6px 10px; text-align: left; vertical-align: top; }
#p-one-limit th { font-weight: 600; }
#p-one-limit .tw { overflow-x: auto; }
#p-one-limit p, #p-one-limit li { max-width: 72ch; }
</style>

<section class="lede">
  <p>This tab follows Harriet Mason's email of 2026-11-04 and Josh's notes on it. Josh asked about two limits. Overlaid draws seem to tend toward a ggdist mark as the number of draws grows. Partitioned draws (dodged bars, subdivided map regions, heatmap cells) seem to tend toward the plain ggplot2 chart, or toward a noise texture as the cells shrink. This tab works out what those limits are. The short answer: the two are one limit, what survives it depends on the channel, and sorting the draws within a cell is what turns a ggdibbler picture into a ggdist mark. It builds on <a href="#limits">Blur as a limit</a>, <a href="#stable">Stable layouts</a> and the symmetry rule in <a href="#theory">Theory</a>.</p>
  <p>The figures are simulated in this page with plain random draws. They are not GoFish or ggdibbler renders.</p>
</section>

<h2>1. The setup</h2>
<p>Let <code>T</code> be a random table, with type <code>Dist&lt;Table&gt;</code>. Pick draws <code>t₁ … tₙ</code>. Render each one with the ordinary chart <code>V</code>, which turns one table into one picture. Then <strong>collapse</strong> the n pictures into one picture. The collapse puts the draws along one axis, and the viewer averages over that axis at some scale.</p>
<div class="tw"><table>
  <thead><tr><th>Collapse axis</th><th>ggdibbler name</th><th>GoFish proposal</th><th>Where the averaging happens</th></tr></thead>
  <tbody>
    <tr><td>Color</td><td>overlay (alpha)</td><td><code>group({ by: "draw", blend: "mean" })</code></td><td>Exactly, in the blend.</td></tr>
    <tr><td>Space</td><td>dodge, subdivide, sf tiling</td><td><code>spread({ by: "draw" })</code></td><td>In the eye, once a cell is smaller than a pixel or a just noticeable difference.</td></tr>
    <tr><td>Time</td><td>hypothetical outcome plots (HOPs)</td><td><code>time.sequence</code> on the draw key</td><td>In the eye, once frames come faster than flicker fusion.</td></tr>
    <tr><td>Panels</td><td>lineups</td><td><code>table({ by: "draw" })</code></td><td>Never. Each panel stays one draw.</td></tr>
  </tbody>
</table></div>

<h2>2. One limit, not two</h2>
<p>On every axis except panels, the limit as n grows is the <strong>expected picture</strong>: for each pixel, the average of its color over all draws. Write it <code>E[V(T)]</code>.</p>
<ul>
  <li><strong>Overlay</strong> reaches it directly. The blend is an average, and the law of large numbers makes the average converge.</li>
  <li><strong>Partition</strong> has no limit at any single point. Each sub-cell stays one independent draw however many there are, so the picture is a noise texture. But the ink in any small region does converge, to the same <code>E[V(T)]</code>. Once the cells are thinner than a pixel, the screen does that averaging and the partition looks just like the overlay.</li>
</ul>

<figure>
  <div class="figrow">
    <div class="fig"><h5>a. Overlay, 600 draws</h5><canvas id="ol-a" width="200" height="220"></canvas><p>Fade by 1 − CDF.</p></div>
    <div class="fig"><h5>b. Dodge, 12 draws</h5><canvas id="ol-b" width="200" height="220"></canvas><p>Separate sub-bars.</p></div>
    <div class="fig"><h5>c. Dodge, 200 draws</h5><canvas id="ol-c" width="200" height="220"></canvas><p>One pixel each: noise.</p></div>
    <div class="fig"><h5>d. Panel c, averaged over 10 px</h5><canvas id="ol-d" width="200" height="220"></canvas><p>Same as panel a.</p></div>
  </div>
  <figcaption>One bar whose height is normal with mean 5 and standard deviation 1. Panels a and c start from the same kind of draws. Panel c is noise at full resolution, but averaging it over a window the width of a few cells (what the eye does from a distance) gives panel a's fade. The fade is the expected picture: the pixel at height y is inked with probability P(H &gt; y).</figcaption>
</figure>

<h2>3. What survives the limit: the Jensen gap</h2>
<p>So why does the limit keep the uncertainty in some charts and give back the plain chart in others? The answer is the gap between "average of the pictures" and "picture of the average", <code>E[V(X)] − V(E[X])</code>. This is the Jensen gap. It depends on whether the channel is linear in the value, not on overlay versus partition.</p>
<ul>
  <li><strong>Color on a straight palette is linear.</strong> The average of palette colors is the palette color of the average, so the limit is the plain map of the means. All uncertainty is gone. This is Josh's sf and heatmap case, and the "mean map" failure in the ARSIA paper (Mason, Cook et al., "The Noisy Work of Uncertainty Visualization").</li>
  <li><strong>Position is not linear.</strong> A bar covers height y only when its height is above y, which is a step function of the value. Its average is <code>P(H &gt; y)</code>, the fade. The uncertainty survives.</li>
  <li><strong>Color on a curved palette</strong> keeps part of it. A diverging palette bends at its middle, so the average of a wide spread lands off the palette, toward gray. This is the "color blending is really hue blending" point from 11-04.</li>
</ul>

<figure>
  <div class="figrow">
    <div class="fig"><h5>a. Subdivided, 64 draws</h5><canvas id="ol-m1" width="220" height="110"></canvas><p>Texture shows the spread.</p></div>
    <div class="fig"><h5>b. Limit, straight palette</h5><canvas id="ol-m2" width="220" height="110"></canvas><p>Both regions identical.</p></div>
    <div class="fig"><h5>c. Limit, diverging palette</h5><canvas id="ol-m3" width="220" height="110"></canvas><p>Wide region drifts to gray.</p></div>
    <div class="fig"><h5>d. Subdivided, sorted</h5><canvas id="ol-m4" width="220" height="110"></canvas><p>A quantile ramp (section 5).</p></div>
  </div>
  <figcaption>Two map regions with the same mean, 0.5. The left one has standard deviation 0.05, the right one 0.3. On a straight palette (a, b, d) the limit of the subdivided map is the plain map of the means, and the two regions can no longer be told apart. On a diverging palette (c) the limit keeps a trace of the spread, as a loss of saturation, because the palette is not linear.</figcaption>
</figure>

<div class="warnbox"><p><strong>A correction to the framing.</strong> Dodged stacked bars encode by position, so their limit is the same fade as overlaid stacked bars, not the plain ggplot2 chart. "Partition tends to the original chart" holds for maps and heatmaps because they use a straight color palette. It is a fact about the channel, not about partitioning.</p></div>

<h2>4. Partitions cannot be both convergent and readable</h2>
<p>Harriet writes that a ggdibbler chart should always be made with a number of draws that tends to infinity, because visual convergence needs it. For overlay that is fine. For a spatial partition it fails: in a fixed area, more draws means smaller cells, and once the cells are below what the eye can tell apart, the partition is just the blend from section 3. With a straight palette, that blend has lost the uncertainty.</p>
<p>So a partition only works at a finite n, in a middle range: enough draws that the texture's mix of colors is a fair picture of the distribution, few enough that each cell stays visible. What converges there is not the picture but the mix of colors inside each region (its histogram). That is a different kind of convergence from the overlay's.</p>
<p>Time works the same way. A HOP at a slow frame rate converges in the mix of frames. At a fast frame rate the eye blends the frames, and it becomes the overlay.</p>

<h2>5. Sorting the draws gives ggdist</h2>
<p>A partition has a true limit at every point only if the draws are <strong>arranged by their own value instead of by draw number</strong>. Each case below is a ggdist mark:</p>
<ul>
  <li>Sorted dodged sub-bars tend to the graph of the quantile function (panel e below).</li>
  <li>Sorted sub-cells in a map region tend to a ramp of the quantile colors (panel d above).</li>
  <li>Draws binned by value and stacked, each dot with area 1/n, form a quantile dotplot. As n grows the dotplot tends to the density <strong>slab</strong> (figure below).</li>
  <li>Picking ranks out of sorted draws tends to <strong>intervals</strong> and medians. Doing it at each x gives a <strong>lineribbon</strong>.</li>
</ul>

<figure>
  <div class="figrow">
    <div class="fig"><h5>e. Dodge, 200 draws, sorted</h5><canvas id="ol-e" width="200" height="220"></canvas><p>The quantile function.</p></div>
    <div class="fig"><h5>Dotplot, 20 draws</h5><svg class="plot" id="ol-dot1" viewBox="0 0 380 170"></svg></div>
    <div class="fig"><h5>Dotplot, 100 draws</h5><svg class="plot" id="ol-dot2" viewBox="0 0 380 170"></svg></div>
    <div class="fig"><h5>Dotplot, 1000 draws</h5><svg class="plot" id="ol-dot3" viewBox="0 0 380 170"></svg></div>
  </div>
  <figcaption>Panel e is panel c with its sub-bars sorted by height. It now has a limit at every point. The dotplots stack quantile draws of a standard normal in bins one dot wide, with dot area shrinking as 1/n. The line is the density, scaled the same way. The dotplot tends to the slab.</figcaption>
</figure>

<div class="key"><p>So ggdist's marks are limits too, but of a different arrangement: draws sorted or binned by value within each cell, not overlaid in draw order. Every univariate ggdist mark this tab checked (slab, interval, point summary, dots, lineribbon, gradient) is a limit of some such arrangement.</p></div>

<h2>6. The precise version of M(U(X)) and U(M(X))</h2>
<p>You may sort a cell's draws only if they are <em>exchangeable</em> within that cell: nothing outside the cell cares which draw is number 1. That is exactly Harriet's "table of distributions". In a "distribution of tables", draw 1 ties together every cell's first value, and sorting each cell on its own destroys that link.</p>
<p>Say it with symmetry groups over the n × k matrix of draws (n draws, k cells), as in the placement test of section 1.6 of the <a href="#theory">Theory</a> tab (section 3.1 there works out the overlay limit):</p>
<div class="tw"><table>
  <thead><tr><th></th><th>Picture is unchanged when you…</th><th>Can show</th><th>Examples</th></tr></thead>
  <tbody>
    <tr><td><strong>ggdibbler</strong>, U(M(X))</td><td>relabel whole rows of draws (the group Sₙ)</td><td>the joint distribution across cells</td><td>spaghetti lines, linked map cells, HOPs</td></tr>
    <tr><td><strong>ggdist</strong>, M(U(X))</td><td>shuffle each column on its own (the group Sₙᵏ)</td><td>each cell's own distribution only</td><td>slab, interval, dots, lineribbon</td></tr>
  </tbody>
</table></div>
<p>The two meet in overlay of independent per-cell draws. There the blend limit is a function of each cell's distribution, so it is some ggdist mark. It equals a ggdist mark exactly when that mark is <strong>affine in the distribution</strong>: a mix of two distributions draws as the blend of their two pictures. Fades and gradients pass this test. Slabs (a region's outline is not the average of two outlines) and intervals (quantiles of a mix are not the mix of quantiles) fail it.</p>
<p>So both readings are partly right. Overlay limits do fall inside ggdist's space, which is what the ggdist video Josh linked suggests. But ggdist is not the limit of ggdibbler in general, which is Harriet's point. The 11-04 decision that slab, interval and dots are separate from blur and fades fits this: they are limits of sorted arrangements, not of overlays.</p>
<p>The lineribbon and spaghetti pair is the clearest case. A ribbon picks ranks at each x on its own, so it shuffles each column and loses the link between x values. Spaghetti keeps whole rows, so it shows that link.</p>

<h2>7. In terms of the probability monad</h2>
<p><code>Dist</code> is a monad (the Giry monad). U(M(X)) does not mean "uncertainty in aesthetic space". It means: map the chart over the distribution of tables to get a distribution of pictures, then collapse. The uncertainty still lives in data space.</p>
<pre><code class="language-ts" id="ol-code"></code></pre>
<p>U(M(U(X))) is the <code>Dist&lt;Dist&lt;T&gt;&gt;</code> case from the jk-plots paper. The inner level is drawn by a ggdist mark, for example a dotplot of a predictive distribution. The outer level, each dot's own uncertainty, is collapsed ggdibbler-style: overlay many dotplots, and the blur appears. Flattening the two levels first with <code>join</code> would mix them into one wider distribution and draw one wider dotplot. The blur is what keeps the two levels apart.</p>
<p>The <a href="#limits">Blur as a limit</a> tab already explains the cliff in ggdibbler paper Figure 14: the blur is applied after binning and stacking, so it is not tied to where the dot could have landed. Section 3.5 of <a href="#grammar">GoFish over draws</a> compares the real ggdist chart with the two-level version.</p>

<h2>8. Smaller points</h2>
<ul>
  <li><strong>What "uncertainty" means.</strong> Keeping only <code>Dist&lt;T&gt;</code> inside GoFish fits Harriet's rule that a chart's uncertainty must come only from its data. As a type rule: draw keys are created only by <code>sample</code> on a <code>Dist</code> column, and everything after the draws is deterministic. The system never needs to know what "uncertainty" means.</li>
  <li><strong>"Vibes" encodings.</strong> Her continuity objection applies when the blur is on a channel with a metric: the same axis that positions the value. There, a blur claims to be the overlay limit and must match it. On a channel with no metric (treemap positions, network node positions, a sketchy line style), a blur whose radius comes from a fixed summary such as the standard deviation is just an ordinary encoding of a derived column. It is M(summary(U(X))). It needs a legend and is not a limit of anything, but it is not inference either.</li>
  <li><strong>Scales.</strong> Drawing samples and then applying any map gives the same result as mapping the distribution, with no correction. A density carries a "per x" unit, so drawing it on a warped axis needs the 1/g′ factor. That is Harriet's pushforward point, and the one-Jacobian rule in <a href="#scales">Scales and densities</a>. ggplot2 cannot apply it automatically because it has no units of measure.</li>
  <li><strong>The axis range of a ggdibbler chart</strong> does depend on the distribution, which answers Josh's earlier question. The collapse needs every draw in one shared frame, so the range comes from all the draws together, not from any single draw.</li>
</ul>

<h2>9. What this changes in the proposal</h2>
<ul>
  <li><a href="#limits">Blur as a limit</a> makes <code>spread</code> or <code>time.sequence</code> on an infinite draw key a type error. Sections 2 and 4 explain why: those collapses have a limit only relative to screen resolution or frame rate, so the spec alone does not define one. The rule stands, now with a reason to give in the error message.</li>
  <li>Sorting draws within a cell is a new, checkable step. It is legal only when the draw key was created per cell (a table of distributions). Over a draw key shared across cells, it should be an error that names the lost link.</li>
  <li>The 11-04 decision to build slab and interval as derives instead of marks gets a meaning. Each derive is the limit of a sorted or binned arrangement of draws from the same <code>sample</code> step. Whether to say that in the docs or in the API is open.</li>
</ul>

<h2>10. Open questions</h2>
<p>For Harriet:</p>
<ol>
  <li>Does a partition with n tending to infinity collapse into the blend once cells drop below resolution, so that partitions only make sense at a finite n? If so, what does visual convergence mean for them?</li>
  <li>Are ggdist marks the limits of draws sorted or binned by value, which is legal only for a table of distributions?</li>
  <li>Is "affine in the distribution" the right test for which ggdist marks are overlay limits?</li>
</ol>
<p>For Josh:</p>
<ol start="4">
  <li>Should sorting within a cell be its own step, or a <code>sort</code> option on <code>spread({ by: "draw" })</code>?</li>
  <li>Should GoFish warn when a partition's cells will render below a pixel, since the chart then shows only the blend?</li>
  <li>Is a "vibes" blur on a non-metric channel allowed as an ordinary channel of a summary column, with a legend?</li>
</ol>
`;
(function () {
  var seed = 7;
  function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  function gauss() { var u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  var BAR = [62, 110, 180];
  function Acc(W, H) { return { W: W, H: H, r: new Float32Array(W * H), g: new Float32Array(W * H), b: new Float32Array(W * H), a: new Float32Array(W * H) }; }
  function rect(acc, x0, y0, x1, y1, col, w) {
    x0 = Math.max(0, Math.round(x0)); x1 = Math.min(acc.W, Math.round(x1));
    y0 = Math.max(0, Math.round(y0)); y1 = Math.min(acc.H, Math.round(y1));
    for (var y = y0; y < y1; y++) for (var x = x0; x < x1; x++) {
      var k = y * acc.W + x;
      acc.r[k] += col[0] * w; acc.g[k] += col[1] * w; acc.b[k] += col[2] * w; acc.a[k] += w;
    }
  }
  function paint(id, acc) {
    var c = document.getElementById(id), g = c.getContext("2d"), img = g.createImageData(acc.W, acc.H);
    for (var k = 0; k < acc.W * acc.H; k++) {
      var a = acc.a[k];
      if (a > 0) {
        img.data[4 * k] = acc.r[k] / a; img.data[4 * k + 1] = acc.g[k] / a; img.data[4 * k + 2] = acc.b[k] / a;
        img.data[4 * k + 3] = Math.round(255 * Math.min(1, a));
      }
    }
    g.putImageData(img, 0, 0);
    var ink = getComputedStyle(c).color;
    g.strokeStyle = ink; g.globalAlpha = 0.5; g.beginPath(); g.moveTo(0, BASE + 0.5); g.lineTo(acc.W, BASE + 0.5); g.stroke(); g.globalAlpha = 1;
  }
  // Bars: H ~ Normal(5, 1), drawn in a 200 x 220 canvas, y range 0..9.
  var W = 200, H = 220, BASE = 210, X0 = 0, X1 = 200, PX = (BASE - 10) / 9;
  function hgt() { return Math.max(0, 5 + gauss()); }
  var a = Acc(W, H), N = 600;
  for (var i = 0; i < N; i++) rect(a, X0, BASE - hgt() * PX, X1, BASE, BAR, 1 / N);
  paint("ol-a", a);
  function dodge(n, sorted) {
    var vals = []; for (var i = 0; i < n; i++) vals.push(hgt());
    if (sorted) vals.sort(function (p, q) { return p - q; });
    var acc = Acc(W, H), sw = (X1 - X0) / n;
    vals.forEach(function (v, i) { rect(acc, X0 + i * sw, BASE - v * PX, X0 + (i + 1) * sw, BASE, BAR, 1); });
    return acc;
  }
  var b = dodge(12, false);
  // Add gaps between the 12 sub-bars so they read as separate.
  for (var y = 0; y < H; y++) for (var j = 1; j < 12; j++) { var k = y * W + Math.round(j * W / 12); b.a[k] = 0; }
  paint("ol-b", b);
  var c = dodge(200, false);
  paint("ol-c", c);
  // Box-average panel c horizontally over a 10 px window: what the eye sees from a distance.
  var d = Acc(W, H), R = 5;
  for (y = 0; y < H; y++) for (var x = 0; x < W; x++) {
    var s = 0, cnt = 0;
    for (var t = x - R; t < x + R; t++) { if (t < 0 || t >= W) continue; s += c.a[y * W + t]; cnt++; }
    var m = s / cnt, kk = y * W + x;
    d.a[kk] = m; d.r[kk] = BAR[0] * m; d.g[kk] = BAR[1] * m; d.b[kk] = BAR[2] * m;
  }
  paint("ol-d", d);
  paint("ol-e", dodge(200, true));

  // Maps: two regions with mean 0.5, sd 0.05 (left) and 0.3 (right).
  function clamp(v) { return Math.max(0, Math.min(1, v)); }
  function straight(v) { var lo = [232, 238, 248], hi = [31, 63, 117]; return lo.map(function (l, i) { return l + (hi[i] - l) * v; }); }
  function diverging(v) {
    var blue = [44, 98, 168], white = [245, 245, 245], red = [192, 57, 43];
    return v < 0.5 ? blue.map(function (b, i) { return b + (white[i] - b) * v * 2; }) : white.map(function (w, i) { return w + (red[i] - w) * (v - 0.5) * 2; });
  }
  var SDS = [0.05, 0.3], MW = 220, MH = 110, RW = 100, RH = 100, GAP = 20;
  function region(sd, n) { var v = []; for (var i = 0; i < n; i++) v.push(clamp(0.5 + sd * gauss())); return v; }
  function mapPanel(id, fn) {
    var cv = document.getElementById(id), g = cv.getContext("2d");
    SDS.forEach(function (sd, r) { fn(g, 5 + r * (RW + GAP), 5, sd); });
    g.strokeStyle = getComputedStyle(cv).color; g.globalAlpha = 0.5;
    SDS.forEach(function (sd, r) { g.strokeRect(5.5 + r * (RW + GAP), 5.5, RW - 1, RH - 1); }); g.globalAlpha = 1;
  }
  function fill(g, col, x, y, w, h) { g.fillStyle = "rgb(" + col.map(Math.round).join(",") + ")"; g.fillRect(x, y, w, h); }
  function meanColor(sd, pal) {
    var vals = region(sd, 4000), sum = [0, 0, 0];
    vals.forEach(function (v) { var c = pal(v); sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2]; });
    return sum.map(function (s) { return s / vals.length; });
  }
  function cells(sorted) {
    return function (g, x, y, sd) {
      var v = region(sd, 64); if (sorted) v.sort(function (p, q) { return p - q; });
      var cw = RW / 8;
      v.forEach(function (val, i) { fill(g, straight(val), x + (i % 8) * cw, y + Math.floor(i / 8) * cw, cw + 0.5, cw + 0.5); });
    };
  }
  mapPanel("ol-m1", cells(false));
  mapPanel("ol-m2", function (g, x, y, sd) { fill(g, meanColor(sd, straight), x, y, RW, RH); });
  mapPanel("ol-m3", function (g, x, y, sd) { fill(g, meanColor(sd, diverging), x, y, RW, RH); });
  mapPanel("ol-m4", cells(true));

  // Quantile dotplots of a standard normal, dot area 1/n.
  function invNorm(p) {
    var a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    var b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    var c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    var d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    var q, r;
    if (p < 0.02425) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - 0.02425) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  function dotplot(id, n) {
    var DW = 360, OX = 10, BY = 160, d = 150 / Math.sqrt(n), counts = {}, out = [];
    for (var i = 0; i < n; i++) {
      var z = invNorm((i + 0.5) / n), px = OX + (z + 3) / 6 * DW, bin = Math.floor((px - OX) / d), k = counts[bin] || 0;
      counts[bin] = k + 1;
      out.push('<circle cx="' + (OX + (bin + 0.5) * d).toFixed(2) + '" cy="' + (BY - (k + 0.5) * d).toFixed(2) + '" r="' + (d * 0.46).toFixed(2) + '" fill="rgb(' + BAR.join(",") + ')"/>');
    }
    var pts = [];
    for (var s = 0; s <= 120; s++) { var zz = -3 + s / 20, pdf = Math.exp(-zz * zz / 2) / Math.sqrt(2 * Math.PI); pts.push((OX + (zz + 3) / 6 * DW).toFixed(1) + "," + (BY - 375 * pdf).toFixed(1)); }
    out.push('<polyline points="' + pts.join(" ") + '" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>');
    out.push('<line x1="0" x2="380" y1="' + BY + '" y2="' + BY + '" stroke="currentColor" opacity="0.4"/>');
    document.getElementById(id).innerHTML = out.join("");
  }
  dotplot("ol-dot1", 20); dotplot("ol-dot2", 100); dotplot("ol-dot3", 1000);

  var code = document.getElementById("ol-code");
  code.textContent = [
    "// A chart V turns one table into one picture. A collapse turns many pictures into one: blend, spread, time.",
    "type Collapse = (pictures: Dist<Picture>) => Picture;",
    "// ggdibbler, U(M(X)): render every draw, then collapse.",
    "const ggdibbler =",
    "  (V: (t: Table) => Picture, collapse: Collapse) => (x: Dist<Table>) =>",
    "    collapse(x.map(V));",
    "// ggdist, M(U(X)): any picture made from the distribution itself.",
    "type Ggdist = (x: Dist<Table>) => Picture;",
    "// U(M(U(X))): two levels. Draw the inner level with a ggdist mark, collapse the outer level.",
    "const nested = (inner: Ggdist, collapse: Collapse) => (x: Dist<Dist<Table>>) =>",
    "  collapse(x.map(inner));",
    "// Flattening first (x.join()) mixes the two levels into one wider distribution."
  ].join("\n");
  function hl() { if (window.hljs) window.hljs.highlightElement(code); }
  if (document.readyState === "complete") hl(); else window.addEventListener("load", hl);
})();
