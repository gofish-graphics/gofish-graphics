---
layout: false
---

<script setup>
  import { VPButton } from 'vitepress/theme';
  import StackV from '../components/StackV.vue';
  import StackH from '../components/StackH.vue';
</script>

<style>
@keyframes breathe-1 {
  0% { font-weight: 400; } /* Start */
  28.6% { font-weight: 700; } /* Inhale complete (4s) */
  42.9% { font-weight: 700; } /* Hold complete (2s) */
  85.7% { font-weight: 400; } /* Exhale complete (6s) */
  100% { font-weight: 400; } /* Hold complete (4s) */
}
@keyframes breathe-2 {
  0% { font-weight: 400; }
  40% { font-weight: 700; } /* More delayed inhale */
  54% { font-weight: 700; } /* More delayed hold */
  92% { font-weight: 400; } /* More delayed exhale */
  100% { font-weight: 400; }
}
@keyframes breathe-3 {
  0% { font-weight: 400; }
  52% { font-weight: 700; } /* Significantly delayed inhale */
  66% { font-weight: 700; } /* Significantly delayed hold */
  95% { font-weight: 400; } /* Significantly delayed exhale */
  100% { font-weight: 400; }
}
@keyframes breathe-4 {
  0% { font-weight: 400; }
  64% { font-weight: 700; } /* Most delayed inhale */
  78% { font-weight: 700; } /* Most delayed hold */
  98% { font-weight: 400; } /* Most delayed exhale */
  100% { font-weight: 400; }
}
</style>

<div style="background-color: #fdf6f3; min-height: 100vh; padding-top: 2rem; padding-bottom: 2rem; text-align: center;">
<StackV gap="2rem">
  <StackV gap="2rem">
    <h1 style="font-family: 'Balsamiq Sans', sans serif; color: coral; font-size: 72pt; margin: 2rem;"><b>GoFish Graphics</b></h1>
    <h2 style="font-family: 'Source Sans 3', sans serif; font-size: 36pt; color: #301812;">Make <span style="font-family: 'Dancing Script', cursive;">stylish</span> visualizations in JavaScript with <span style="display: inline-block;"><span style="animation: breathe-1 14s ease-in-out infinite;">e</span><span style="animation: breathe-2 14s ease-in-out infinite;">a</span><span style="animation: breathe-3 14s ease-in-out infinite;">s</span><span style="animation: breathe-4 14s ease-in-out infinite;">e</span></span></h2>
  </StackV>

<StackH width="fit-content" gap="1rem" style="margin: 0 auto; margin-top: -1rem; margin-bottom: -4rem">
<div style="font-family: 'Fira Code', monospace; background-color: var(--vp-c-brand-soft); color: #fdf6f3; font-weight: 700; padding: 0.5rem 1rem; border-radius: 8px; display: inline-block; margin: 2rem 0;">
  npm install gofish-graphics@nightly
</div>
<div style="display: flex; gap: 0.5rem; justify-content: center;">
<VPButton
    tag="a"
    size="medium"
    text="Get Started!"
    theme="brand"
    href="/get-started"
  />
<VPButton
    tag="a"
    size="medium"
    text="Tutorial"
    theme="alt"
    href="/tutorial"
  />
<VPButton
    tag="a"
    size="medium"
    text="Examples"
    theme="alt"
    href="/examples"
  />
<!-- <VPButton
    tag="a"
    size="medium"
    text="API Reference"
    theme="alt"
    href="/api"
  /> -->
</div>
</StackH>

  <div>
  <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; max-width: 800px; margin-top: 2rem; margin-bottom: 0rem; margin-left: auto; margin-right: auto;">
    <a href="/examples/ribbon-charts.html#polar-ribbon-chart">
      <img src="./images/polar-ribbon-chart.png" alt="Polar Ribbon Chart" style="width: 100%; border-radius: 8px; object-fit: cover; aspect-ratio: 256/276; object-position: bottom; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);">
    </a>
    <!-- <a href="/examples/ribbon-charts.html#polar-ribbon-chart"> -->
      <img src="./images/vfx.png" alt="Visual Effects" style="width: 100%; border-radius: 8px; object-fit: cover; aspect-ratio: 256/276; object-position: center; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);">
    <!-- </a> -->
    <!-- <a href="/examples/bar-charts.html#waffle-chart">
      <img src="./images/waffle-chart.png" alt="Waffle Chart" style="width: 100%; border-radius: 8px; object-fit: cover; aspect-ratio: 256/276; object-position: top; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);">
    </a> -->
    <a href="/examples/pie-charts.html#flower-chart">
      <img src="./images/flower-chart.png" alt="Flower Chart" style="width: 100%; border-radius: 8px; object-fit: cover; aspect-ratio: 256/276; object-position: top; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);">
    </a>
    <a href="/examples/area-charts.html#streamgraph">
      <img src="./images/streamgraph.png" alt="Streamgraph" style="width: 100%; border-radius: 8px; object-fit: cover; aspect-ratio: 256/276; object-position: center; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);">
    </a>
    <img src="./images/polar-ribbon-chart.png" alt="Chart example 5" style="width: 100%; border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);">
    <img src="./images/polar-ribbon-chart.png" alt="Chart example 6" style="width: 100%; border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);">
  </div>

  <div style="background-color: #fff1eb; width: 65%; padding: 2rem; padding-right: 1em; padding-bottom: 1em; margin: 2rem auto; margin-top: 2rem; border-radius: 12px;">
    <StackV gap="2rem" align="flex-start" style="margin: 0 auto;">
      <h2 style="font-family: 'Balsamiq Sans', sans serif; font-size: 36pt; color: coral;">Why GoFish?</h2>
      <StackV gap="1.5rem" width="100%" align="flex-start">
        <StackV gap="0.6rem" width="100%" align="flex-start">
          <h3 style="font-family: 'Source Sans 3', sans serif; font-size: 24pt; color: #301812;">You're a star! Express yourself!</h3>
          <p style="font-family: 'Source Sans 3', sans serif; font-size: 16pt; color: #301812; text-align: left; margin: 0;">Minimalist? Maximalist? Formal? Whimsical? Whatever your style, GoFish is here for you.</p>
        </StackV>
        <StackV gap="0.6rem" width="100%" align="flex-start">
          <h3 style="font-family: 'Source Sans 3', sans serif; font-size: 24pt; color: #301812;">Beauty by default</h3>
          <p style="font-family: 'Source Sans 3', sans serif; font-size: 16pt; color: #301812; text-align: left; margin: 0;">GoFish's design system of colors, spacing, and arrows build on graphic design best practices helping you get beautiful results out of the box.</p>
        </StackV>
        <StackV gap="0.6rem" width="100%" align="flex-start">
          <h3 style="font-family: 'Source Sans 3', sans serif; font-size: 24pt; color: #301812;">Power when you need it</h3>
          <p style="font-family: 'Source Sans 3', sans serif; font-size: 16pt; color: #301812; text-align: left; margin: 0;">GoFish makes easy things simple, like bar charts and scatter plots. But GoFish lets you make complex custom charts and diagrams, too.</p>
        </StackV>
      </StackV>
    </StackV>
  </div>
  </div>
  </StackV>
</div>
