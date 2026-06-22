# GoFish Example Gallery prototype — design spec

A standalone HTML prototype at `prototypes/gallery/index.html` that reimagines the docs
example gallery as a **museum gallery hall**: real chart renders hung in frames on a long
wall, silhouetted visitors looking at them, wood floor, spotlights. It must read as a
sibling of the merged homepage ("worktable" landing page, PR #524).

## Hard requirements (from the user)

1. **Match the homepage style.** Reuse the landing page's material language verbatim:
   - Tokens from `apps/docs/docs/.vitepress/theme/components/landing/landing.css`:
     `--desk #6b5a47`, `--paper #f7f2e9`, `--paper-shade #efe7d8`, `--ink #26211b`,
     `--ink-soft #6e6457`, `--accent #2f9e6e`, `--accent-deep #1f7a52`,
     `--gold #e3aa2f`, `--shadow-warm rgba(38,28,18,.16)`.
   - The procedural **wood-grain tile** (`--wood` data-URI in landing.css) and the
     plank repeating-gradient from `html.landing-page body` — this becomes the FLOOR.
   - The procedural **paper tile** (`--paper-tex`) — use it on the gallery WALL so the
     wall reads as the same paper material the homepage sheet is made of.
   - Fonts: Fraunces (display), Spline Sans (UI/body), Spline Sans Mono (code),
     Architects Daughter (handwritten annotations). Load from Google Fonts.
   - Green accent, warm shadows, springy cubic-bezier(0.34,1.56,0.64,1) hovers,
     `prefers-reduced-motion` support — all as on the landing page.
2. **Real renders only.** Frames contain the actual SVG output of the docs examples,
   loaded from `prototypes/gallery/renders.js` (`window.GALLERY_RENDERS = [{id, title,
description, w, h, svg}]`). No fake placeholder doodles.
3. **Frame sizes proportional to true chart sizes.** Frame inner size = chart's real
   rendered `w × h` × one global scale factor. The natural variation in chart
   dimensions IS the salon-wall irregularity. Do not invent sizes.
4. **Automatic packing, fast.** Greedy strip packing of frames onto a fixed-height wall,
   growing rightward. O(n) or O(n log n) only (a sort is fine). Real-gallery spacing:
   generous gaps (≈40–70px at desktop scale) so pieces breathe. Vertically, center the
   arrangement around a "gallery line" (museum eye-level, slightly above wall center).
   Small deterministic jitter (seeded by index — `Math.random()` is fine in the
   prototype but keep it stable across repaints within a session) of a few px vertical
   and ±0.6° rotation for the hand-hung feel. Tall portrait pieces may occupy a column
   alone. Suggested algorithm: sort or bucket by height, then greedy column fill —
   place frames into the current column until wall height is exceeded, then start a
   new column; justify each column's contents vertically with even gaps. Document the
   algorithm in a comment.
5. **Horizontal scrolling everywhere** (desktop AND mobile): the hall is one long wall
   you dolly along. Vertical mouse-wheel input translates to horizontal scroll
   (`wheel` handler with `deltaY → scrollLeft`, passive:false, but leave native
   horizontal/trackpad gestures and touch swipe alone). Keyboard ← → page through.
   The point: the floor, figures, and wall are ALWAYS in view — the museum tableau
   never breaks, which is what sells the idea.
6. **Plaques.** Every frame gets a small always-visible museum plaque mounted just
   below it: chart title (and a second line for the description if present, in italic
   or Architects Daughter). Style: small warm-white/brass card, like real museum
   labels, NOT hover-only. Clicking frame or plaque navigates to
   `https://gofish-graphics.dev/js/examples/<id>.html` (use that as a placeholder
   docs origin; one const at the top of the script so it's easy to change).
7. **Dynamic search.** A search field that filters by title + description as you type
   (same semantics as `apps/docs/components/ExampleGallery.vue`), with a results count
   ("Showing 12 of 31 pieces"). On filter change the wall REPACKS and frames animate
   to their new positions (absolutely positioned frames + CSS transition on
   transform/left/top; removed frames fade out). The search UI lives in a fixed paper
   card (like the landing page's hanging gutter cards — it may literally hang from a
   fishing line, that's the homepage's motif) so it's reachable at any scroll position.
   An empty state when nothing matches ("Nothing on view — try another term"), ideally
   with a single puzzled silhouette standing in the empty hall.
8. **Wood floor from the homepage.** Floor = the landing `--wood` tile + plank
   gradient, with a subtle darker-at-back lighting gradient and a faint sheen.
   Baseboard molding between wall and floor. The floor scrolls WITH the wall (planks
   move past), and the figures stand ON the floor and scroll WITH it (they live inside
   the scrolling `.track`) — a viewport-fixed figure layer read as the visitors
   gliding/skating while the floor moved.
9. **Spotlights.** Ceiling-mounted gallery track lights: small fixture glyphs along the
   top edge, each casting a soft warm light cone down onto the art. Position them FROM
   THE PACKING OUTPUT (one per column/cluster, aimed at its center), so light actually
   falls on pieces. Use layered radial/conic gradients at low opacity (possibly
   `mix-blend-mode: soft-light` or `overlay`); also a soft elliptical pool of light on
   the floor under each cone. Subtle — ambiance, not flashlight.
10. **Redraw the people.** The old prototype's figures were lego-ish stacked rects.
    Replace with believable smooth single-silhouette SVG paths (think museum-map or
    airport-signage figures, but relaxed): correct proportions (head ≈ 1/7.5 of
    height), varied believable poses — hands clasped behind back leaning toward a
    piece, arms crossed, a pair where one points at a chart, someone on a bench,
    a child, one or two slow walkers (gentle CSS walk-cycle: body bob + subtle limb
    motion, no comic skew), one person looking up with a slight head tilt. Figures are
    near-black warm ink (#1d1813 / `--ink`), with soft contact shadows on the floor.
    They stand ON the floor inside the scrolling hall (front of the art, z6 over z4),
    their rest positions **derived from the packing output** so they cluster near
    pieces along the whole wall (re-derived on every repack; ~1 per 620px, capped 80;
    `content-visibility:auto` for n=150). The pointer is treated as another visitor:
    figures within ~170px **step aside** (rAF-lerped personal-space repulsion, max
    ~94px, with a small body lean in the direction of motion; touch never triggers;
    reduced-motion uses a smaller/slower step and no lean). Vary heights for depth;
    respect `prefers-reduced-motion` (no walkers, static poses).
11. **Works on mobile / small screens.** Same horizontal-scroll hall, scaled: smaller
    global frame scale, shorter wall, fewer/smaller figures (maybe 2), search card
    docks to a compact top bar, touch swipe scrolls the hall. Test at 390×844 and
    768×1024. No horizontal scrolling of the PAGE itself (only the hall scroll
    container); no vertical page scroll at all if possible — the scene fills the
    viewport (use dvh units, handle short landscape phones by shrinking floor/ceiling
    shares).
12. **Scale to 100–200 examples.** The real registry will grow to ~100–200 entries
    soon. Therefore:
    - Packing must stay instant (it will — it's linear) and the wall just grows longer.
    - DOM cost is the real risk: 200 inline chart SVGs. Use `content-visibility: auto`
      (+ `contain-intrinsic-size`) on frames, or lazy-inject each svg's markup only
      when its frame first approaches the viewport (IntersectionObserver on the scroll
      container, with a generous rootMargin) — pick one, measure, and note the choice.
    - Add a **test mode** `?n=150` that synthesizes a bigger dataset by cycling the
      real renders with numbered title suffixes, so scale can be validated now.
    - With a long wall, add a thin **minimap strip** (museum floor-plan style) docked
      at the bottom edge or inside the search card: tiny tick marks where pieces hang,
      a draggable/clickable viewport window indicator. Keep it ≤24px tall, paper-styled.
      This doubles as scroll progress. (Nice-to-have, but strongly desired.)

## Structure & chrome

- **Entrance wall** (leftmost section of the scrolling hall): museum-style vinyl
  lettering directly on the wall — "The GoFish Collection" in big Fraunces, a
  handwritten Architects Daughter subline ("every piece composed in GoFish — walk the
  hall →"), maybe a small green CTA button pair (Open the docs / GitHub) like landing
  buttons. This replaces a fixed page header; it scrolls away as you walk.
- **End wall** (rightmost): closing note + CTA ("Want yours on this wall? Open a PR")
  and the fish 🐟.
- **Frame styles**: 3–4 variants cycled deterministically (walnut wood matching the
  desk tone, thin brass/gold, thin ink, plain shadow-float with paper mat). All frames
  get a paper-white mat between frame and chart (charts are rendered on white).
  Recolor all frame materials into the landing palette (no cool grays).
- Code-on-hover from the old prototype is dropped (plaques + click-through replace it).
  Optional: hovering a frame may slightly enlarge it and brighten its spotlight.

## Quality bar / review loop

- Self-review with Playwright screenshots (tests/ package has playwright) at
  1600×900, 1280×800, 390×844, plus `?n=150`. Look at the screenshots. Iterate until:
  frames clearly proportional & non-overlapping with even spacing, plaques legible,
  spotlights subtle, figures believable at a glance, wall/floor materials match the
  homepage's warmth, 150-item mode scrolls smoothly.
- No console errors; works opened directly via `file://` (renders.js via script tag).
- Keep everything in `prototypes/gallery/` (index.html + renders.js + capture script;
  CSS/JS may be inline in index.html, single-file preferred like the old prototype).
