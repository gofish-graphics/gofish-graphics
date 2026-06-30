import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { chart, spread, image, rect, paint } from "../../src/lib";
import bottlePng from "../assets/wilsonblanco.png";

// System latencies (Gregg, *Systems Performance*, Table 2.2). The raw latencies
// span ~12 orders of magnitude — too wide for one row of size-encoded bottles
// (a CPU-cycle bottle would be an invisible sliver beside a reboot). Instead we
// facet into three magnitude bands; within each band the bottle heights are
// log-scaled to that band's own range, so neighbors read clearly, and the band
// titles carry the ×1000-per-row story.
const rows = [
  { tier: "CPU & memory · nanoseconds", event: "1 CPU cycle", latency: "0.3 ns", scaled: "1 s", ns: 0.3 },
  { tier: "CPU & memory · nanoseconds", event: "L1 cache access", latency: "0.9 ns", scaled: "3 s", ns: 0.9 },
  { tier: "CPU & memory · nanoseconds", event: "L2 cache access", latency: "3 ns", scaled: "10 s", ns: 3 },
  { tier: "CPU & memory · nanoseconds", event: "L3 cache access", latency: "10 ns", scaled: "33 s", ns: 10 },
  { tier: "CPU & memory · nanoseconds", event: "Main memory (DRAM)", latency: "100 ns", scaled: "6 min", ns: 100 },
  { tier: "Storage & network · µs–ms", event: "SSD I/O (flash)", latency: "10–100 µs", scaled: "9–90 hours", ns: 50_000 },
  { tier: "Storage & network · µs–ms", event: "Rotational disk I/O", latency: "1–10 ms", scaled: "1–12 months", ns: 5_000_000 },
  { tier: "Storage & network · µs–ms", event: "Internet: SF → New York", latency: "40 ms", scaled: "4 years", ns: 40_000_000 },
  { tier: "Storage & network · µs–ms", event: "Internet: SF → U.K.", latency: "81 ms", scaled: "8 years", ns: 81_000_000 },
  { tier: "Storage & network · µs–ms", event: "Lightweight HW virt boot", latency: "100 ms", scaled: "11 years", ns: 100_000_000 },
  { tier: "Storage & network · µs–ms", event: "Internet: SF → Australia", latency: "183 ms", scaled: "19 years", ns: 183_000_000 },
  { tier: "System events · seconds–minutes", event: "OS virt system boot", latency: "< 1 s", scaled: "105 years", ns: 1_000_000_000 },
  { tier: "System events · seconds–minutes", event: "TCP timer retransmit", latency: "1–3 s", scaled: "105–317 years", ns: 2_000_000_000 },
  { tier: "System events · seconds–minutes", event: "SCSI command time-out", latency: "30 s", scaled: "3 millennia", ns: 30_000_000_000 },
  { tier: "System events · seconds–minutes", event: "HW virt system boot", latency: "40 s", scaled: "4 millennia", ns: 40_000_000_000 },
  { tier: "System events · seconds–minutes", event: "Physical system reboot", latency: "5 m", scaled: "32 millennia", ns: 300_000_000_000 },
];

// Per-band bottle heights: log10(latency) mapped to [H_MIN, H_MAX] using each
// band's own min/max, so each row of bottles fills the height range.
const H_MIN = 56;
const H_MAX = 190;
// wilsonblanco.png is 157×650; `bw` is the bottle width at a given height, used
// to size the burgundy tint rect so it exactly covers the bottle.
const BOTTLE_ASPECT = 157 / 650;
const bandLogRange: Record<string, [number, number]> = {};
for (const r of rows) {
  const l = Math.log10(r.ns);
  const cur = bandLogRange[r.tier];
  bandLogRange[r.tier] = cur ? [Math.min(cur[0], l), Math.max(cur[1], l)] : [l, l];
}
const data = rows.map((r) => {
  const [lo, hi] = bandLogRange[r.tier];
  const t = hi > lo ? (Math.log10(r.ns) - lo) / (hi - lo) : 1;
  const h = H_MIN + t * (H_MAX - H_MIN);
  return { ...r, h, bw: h * BOTTLE_ASPECT, scaledLabel: `≈ ${r.scaled}` };
});

const meta: Meta = {
  title: "Piccl/LatencyBottles",
};
export default meta;

export const Default: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Latency Bottle Chart",
      description:
        "System latencies from a CPU cycle to a full reboot, drawn as wine bottles and faceted into three magnitude bands — a playful small-multiples take on the classic wine-bottle-sizes poster.",
    },
  },
  render: () => {
    const container = initializeContainer();

    chart(data, { axes: { x: false, y: { title: false } } })
      .flow(
        // Facet into magnitude bands stacked top-to-bottom (fastest on top)...
        spread({ by: "tier", dir: "y", spacing: 64, alignment: "start", reverse: true, axes: { x: false, y: false } }),
        // ...each band a row of bottles aligned on a common base.
        spread({ by: "event", dir: "x", spacing: 24, alignment: "baseline", axes: { x: false, y: false } })
      )
      .mark(
        // Tint the whole bottle burgundy (a `color`-blend rect sized to the
        // bottle) so the white name reads against it.
        paint({ blendMode: "multiply" }, [
          image({ href: bottlePng, h: "h" }),
          rect({ h: "h", w: "bw", fill: "#b3304f" }),
        ])
          .label("latency", { position: "outset-top", offset: 6, fontSize: 12, color: "#7a1020" })
          // The table's "Scaled" column: latency re-felt at human time (a CPU
          // cycle ≈ 1 s), which is what makes the dynamic range visceral.
          .label("scaledLabel", { position: "outset-top", offset: 22, fontSize: 9, color: "#9a9a9a" })
          // Event name printed up the bottle, wine-label style.
          .label("event", { position: "center", fontSize: 10, color: "#ffffff", rotate: -90 })
      )
      .render(container, {});

    return container;
  },
};
