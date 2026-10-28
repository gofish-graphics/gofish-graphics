<script setup lang="ts">
import { onMounted, ref } from "vue";
import * as gf from "gofish-graphics";
import _ from "lodash";
import { streamgraphData } from "./data/streamgraphData";
import { titanic } from "./data/titanic";
import { nightingale } from "./data/nightingale";
import { drivingShifts } from "./data/drivingShifts";
import { newCarColors } from "./data/newCarColors";
import { caltrain, caltrainStopOrder } from "./data/caltrain";
import { penguins } from "./data/penguins";
import { density1d } from "fast-kde";
import { genderPayGap, payGrade } from "./data/genderPayGap";
import { seafood, lakeLocations } from "./data/seafood";

const props = defineProps<{
  code: string;
  transform?: string;
}>();

const container = ref<HTMLElement | null>(null);

onMounted(() => {
  if (!container.value) return;

  try {
    // Create a scoped sandbox
    const fn = new Function(
      "_",
      "root",
      "size",
      "gf",
      "streamgraphData",
      "titanic",
      "nightingale",
      "drivingShifts",
      "newCarColors",
      "caltrain",
      "caltrainStopOrder",
      "penguins",
      "density1d",
      "genderPayGap",
      "payGrade",
      "mix",
      "seafood",
      "lakeLocations",
      props.code
    );
    const root = document.createElement("div");
    const size = { width: 500, height: 300 }; // default size
    fn(
      _,
      root,
      size,
      gf,
      streamgraphData,
      titanic,
      nightingale,
      drivingShifts,
      newCarColors,
      caltrain,
      caltrainStopOrder,
      penguins,
      density1d,
      genderPayGap,
      payGrade,
      gf.mix,
      seafood,
      lakeLocations
    );
    container.value.append(root);
  } catch (err) {
    console.error("GoFish execution failed:", err);
    container.value.textContent = "⚠️ Error rendering GoFish block.";
  }
});
</script>

<template>
  <div class="gofish-vue" :style="{ transform: transform }">
    <div ref="container" />
  </div>
</template>

<style scoped>
.gofish-vue {
  padding-bottom: 1rem;
  transform-origin: center center;
}
</style>
