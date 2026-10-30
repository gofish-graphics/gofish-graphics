# Prior art: JSX / component APIs for visual trees and data pipelines

Survey for gofish-graphics#1266 (React wrapper). Researched 2026-10-30.
Code examples were copied from each project's source or docs (URL given). Claims I could not
check against a primary source are marked **[unverified]**.

Legend for each entry: **Model** (what the user writes / what the system decides),
**Naming**, **Data flow**, **Reconciler**, **SSR**, **Fits / doesn't fit GoFish**, **Image**.

---

## 1. modular-svg-react (theknarf-experiments/modular-svg)

Source read: `packages/modular-svg-react/src/{reconciler.ts,Graphic.tsx,index.ts}` and tests,
https://github.com/theknarf-experiments/modular-svg/tree/HEAD/packages/modular-svg-react

**Model.** Bluefish-style relations (`stackH`, `stackV`, `align`, `distribute`, `background`, `arrow`, `ref`)
over shapes (`circle`, `rect`, `text`). No data binding of any kind: it is purely the "explicit children"
surface. The core solves layout with a damped fixed-point iteration.

```tsx
// packages/modular-svg-react/src/__tests__/Graphic.test.tsx
<Graphic>
  <stackH spacing={10}>
    <circle r={5} fill="red" />
    <circle r={8} fill="blue" />
  </stackH>
</Graphic>
```

**Pipeline (verified from source).**

1. `react-reconciler@0.33` host config, `supportsMutation: true`, `isPrimaryRenderer: false`, no hydration.
   `createInstance` returns a plain record `{ type, key, props, children }`. Event handlers
   (`onClick`, `onMouseEnter`, ... six fixed names) are stripped from props and stored in a
   module-global `Map<id, handlers>` keyed by the React `key` (or an auto counter `${type}_${n}`).
2. `getScene()` walks the container: `instanceToJson` capitalizes the type (`stackH` -> `StackH`),
   folds text children into a `text` prop, special-cases `ref` to `{type:"Ref", target}`, wraps
   multiple roots in a `Group`, then calls core `buildSceneFromJson`.
3. `Graphic` (a react-dom component) runs, **inside `useEffect`**: `root.render(<ContextBridge>{children}</ContextBridge>)`
   -> `getScene()` -> `solveLayout` -> `layoutToAst` -> `setAst`. It then renders the resolved
   `SvgElement`s as real `<circle>/<rect>/<text>/<line>/<polygon>/<path>/<image>` via React DOM,
   re-attaching handlers looked up by element id.
4. `its-fine`: `Graphic` wraps itself in `<FiberProvider>` and uses `useContextBridge()` so outer
   contexts reach the secondary reconciler root.

**Naming.** Lowercase intrinsics. The `JSX.IntrinsicElements` augmentation exists only in the test
folder (`test-intrinsics.d.ts`); the package does not ship intrinsic types. Lowercase `circle`, `rect`,
`text`, `line`, `image` collide with React DOM's SVG intrinsics in the type namespace (they type-check
only because the DOM types already accept those names, with DOM SVG prop types).

**SSR.** None. The initial render is an empty `<div>`; the scene is computed in an effect. The
`updateContainer` callback path even special-cases `NODE_ENV === "test"`.

**Fits.** The exact input-side/output-side split #1266 proposes (reconciler builds a serializable scene;
React DOM draws resolved primitives; its-fine for context). Small (~500 lines).
**Doesn't fit / lessons.** (a) Effect-time layout kills SSR, which is the main payoff for MDX.
(b) Global handler map keyed by auto ids is fragile across re-renders. (c) A whole reconciler to build a
JSON tree that a synchronous `props.children` walk or a plain function could also build (see §10, React
Router). (d) No answer to data pipelines.

**Image.** None found in the repo (examples are JSON scenes only).

---

## 2. react-three-fiber (pmndrs)

Sources: https://github.com/pmndrs/react-three-fiber (readme.md; `packages/fiber/src/core/reconciler.tsx`,
`core/extend.ts`, `web/Canvas.tsx`), https://r3f.docs.pmnd.rs/api/objects

**Model.** JSX is a 1:1 spelling of the three.js object graph. The user writes objects and properties;
the renderer only creates, attaches, and mutates THREE objects. Layout is not computed.

```jsx
// readme.md
function Box(props) {
  const ref = useRef();
  const [hovered, hover] = useState(false);
  const [clicked, click] = useState(false);
  useFrame((state, delta) => (ref.current.rotation.x += delta));
  return (
    <mesh
      {...props}
      ref={ref}
      scale={clicked ? 1.5 : 1}
      onClick={(event) => click(!clicked)}
      onPointerOver={(event) => hover(true)}
      onPointerOut={(event) => hover(false)}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={hovered ? "hotpink" : "orange"} />
    </mesh>
  );
}
<Canvas>
  <ambientLight intensity={Math.PI / 2} />
  <Box position={[-1.2, 0, 0]} />
  <Box position={[1.2, 0, 0]} />
</Canvas>;
```

**Naming.** Lowercase camelCase intrinsics generated from the THREE namespace: `web/Canvas.tsx` calls
`extend(THREE)`, and the reconciler resolves `toPascalCase(type)` in a catalogue (`<mesh/>` -> `new THREE.Mesh()`).
User components are capitalized (`<Box>`). Third-party classes join via `extend({ OrbitControls })` -> `<orbitControls/>`.
Constructor args: `args={[...]}` (changing them reconstructs the object). Parent slot: `attach="material"`
(materials/geometries attach by default). Nested property "piercing": `rotation-x={1}`.

**Data flow.** Plain props + React context + hooks (`useFrame`, `useThree`). No data-binding layer.
**Reconciler.** Yes, custom. Uses its-fine (`FiberProvider` is built into `Canvas`).
**SSR.** Not applicable (WebGL canvas). **[unverified: no official SSR story beyond rendering an empty canvas]**

**Fits.** Shows that a catalogue generated from another library (THREE / our descriptors) can define the
whole intrinsic vocabulary with zero hand-written components; lowercase = host object, Capital = user component.
**Doesn't fit.** Lowercase names work for r3f because THREE names (`mesh`, `boxGeometry`) don't collide with DOM
intrinsics. GoFish's `rect`, `text`, `image`, `line`, `circle`, `ellipse`, `polygon` do collide.

**Image.** https://raw.githubusercontent.com/pmndrs/react-three-fiber/master/docs/basic-app.gif (readme demo, 200 OK).

---

## 3. Bluefish (joshpoll/bluefish-monorepo)

Sources: https://github.com/joshpoll/bluefish-monorepo (`packages/bluefish-solid/src/stories/44.stories.tsx`,
`src/plot/{plot,dot}.tsx`, `docs/learn/tutorial-1-intro.md`); paper: Pollock et al., "Bluefish: Composing
Diagrams with Declarative Relations", UIST 2024, https://vis.mit.edu/pubs/bluefish , arXiv 2307.00146.

**Model.** Relations (`StackH`, `Align`, `Distribute`, `Background`, `Arrow`) over marks; a relation does
not own its children (the paper's "relaxed component"); `<Ref select="name"/>` lets one mark take part in
several relations, so the scenegraph is a compound graph, not a tree. The user writes relations; the
system solves positions.

```tsx
// packages/bluefish-solid/src/stories/44.stories.tsx (Solid JSX)
<Bluefish>
  <Background padding={10}>
    <StackH spacing={50}>
      <Circle
        name="mercury"
        r={15}
        fill="#EBE3CF"
        stroke-width={3}
        stroke="black"
      />
      <Circle
        name="venus"
        r={36}
        fill="#DC933C"
        stroke-width={3}
        stroke="black"
      />
      ...
    </StackH>
  </Background>
  <Align alignment="centerX">
    <Text name="label">{planet()}</Text>
    <Ref select={planet()} />
  </Align>
  <Arrow>
    <Ref select="label" />
    <Ref select={planet()} />
  </Arrow>
</Bluefish>
```

The `bluefish-js` docs spell the same thing as capitalized function calls, not JSX:
`Background({ padding: 40 }, StackH({ spacing: 50 }, [Circle({...}), ...]))`.

**Naming.** Capitalized components everywhere (Solid convention), kebab-case SVG props passed through (`stroke-width`).
**Data-driven constructs.** Mostly none: data is mapped with Solid's `<For each>` by hand. There is an
experimental `Plot`/`Dot` pair (`src/plot/`) in the LayerCake style: `<Plot data x y color>` puts `data`
and scales into a `PlotContext`; `<Dot x="field" y="field">` reads the context and renders `<For each={plotContext.data}>`
of `Circle`s. No grouping/stacking pipeline.
**Reconciler.** None (Solid components; layout via a scenegraph context).
**SSR.** **[unverified]**

**Fits.** Closest ancestor of GoFish's low-level surface; capitalized components for relations is the
established spelling in this lineage. **Doesn't fit.** Offers no model for the data pipeline.

**Image.** https://raw.githubusercontent.com/joshpoll/bluefish-monorepo/main/docs/learn/assets/circle-stack-with-background.png
(tutorial 1, 200 OK).

---

## 4. Victory (FormidableLabs / Nearform)

Sources: https://github.com/FormidableLabs/victory `website/docs/api/victory-stack.mdx`, `victory-group.mdx`;
https://nearform.com/open-source/victory/docs/victory-stack ; issue https://github.com/FormidableLabs/victory/issues/2342

**Model.** One component per series; wrapper components coordinate them. `VictoryStack` "is a wrapper component
that renders a given set of children in a stacked layout. Like other wrapper components, `VictoryStack` also
reconciles the domain and layout for all its children". `VictoryGroup` offsets children (grouped bars) or
shares data/styles. The **user splits the data into series by hand**: one child per series, each with its own `data`.

```jsx
// website/docs/api/victory-stack.mdx
<VictoryChart theme={VictoryTheme.clean}>
  <VictoryStack>
    <VictoryArea
      data={[
        { x: "a", y: 2 },
        { x: "b", y: 3 },
        { x: "c", y: 5 },
      ]}
    />
    <VictoryArea
      data={[
        { x: "a", y: 1 },
        { x: "b", y: 4 },
        { x: "c", y: 5 },
      ]}
    />
    <VictoryArea
      data={[
        { x: "a", y: 3 },
        { x: "b", y: 2 },
        { x: "c", y: 6 },
      ]}
    />
  </VictoryStack>
</VictoryChart>
```

**Naming.** Prefixed capitalized components (`VictoryX`); props `data`, `x`, `y` (accessor key or function), `style`.
**Data flow.** Parent inspects and clones children: "Children supplied to `VictoryGroup` will be cloned and rendered
with new props so that all children share common props such as `domain` and `scale`" (victory-group.mdx).
**Reconciler.** None (React DOM SVG). **SSR.** **[unverified; renders SVG synchronously in render, so likely works]**

**Pain point (verified).** Issue #2342 "Unable to wrap victory components into customizable components" (open,
label Accepted). Maintainer: "`VictoryChart` component makes decisions about how to render its children based on the
top-level props and static properties of each child". Later: "the architecture does not have a simple way to
accommodate a custom component because it looks at the Type of the first child and runs logic based on that Type ...
Our hope is to move completely to functional components and use context in the future which solves this".
**Lesson:** a parent that reads `props.children` element types breaks React composition (user components cannot
return chart parts).

**Fits.** `VictoryStack` is literally "pipeline step as a wrapper": nesting = stacking. **Doesn't fit.** The wrapper
stacks _siblings the user wrote out_, it does not partition data (`by`). GoFish's `stack({by})` creates the children
from data; Victory's needs them enumerated.

**Image.** https://cloud.githubusercontent.com/assets/3719995/20915779/b51e3652-bb3c-11e6-8243-6e7521a59115.png
(README pie, 200 OK). No stacked-bar image found.

---

## 5. Recharts

Sources: https://github.com/recharts/recharts `www/src/docs/exampleComponents/BarChart/StackedBarChart.tsx`,
`src/cartesian/BarStack.tsx`, `package.json`; 3.0 migration guide https://github.com/recharts/recharts/wiki/3.0-migration-guide

**Model.** Data (wide format, one row per category) on the root; each leaf names a field; stacking is a
**leaf prop** (`stackId`): "When two Bars have the same axisId and same stackId, then the two Bars are stacked".

```tsx
// www/src/docs/exampleComponents/BarChart/StackedBarChart.tsx (abridged)
<BarChart
  data={data}
  responsive
  margin={{ top: 20, right: 0, left: 0, bottom: 5 }}
>
  <CartesianGrid />
  <XAxis dataKey="label" />
  <YAxis width="auto" />
  <Tooltip />
  <Legend />
  <Bar dataKey="x" stackId="a" background />
  <Bar dataKey="y" stackId="a" background />
</BarChart>
```

**Evolution toward nesting (verified).** Recharts 3.x added a `<BarStack>` wrapper (`src/cartesian/BarStack.tsx`):
"This prop sets the stack ID for all Bar components inside this BarStack component ... When both BarStack and individual
Bar components have stackId defined, the BarStack's stackId wins". So the leaf-prop design grew a wrapper form.
Grouped + stacked = one `stackId` per group (several stacks side by side).

**Data flow.** Root `data` + `dataKey` on leaves. 2.x inspected children by type (`findAllByType`, still used for `Cell`);
3.0 "rewrote the whole state management" (Redux Toolkit is a dependency) and "The one big feature in 3.0 is support for
custom components" (migration guide) — i.e. children now register through context/store instead of being inspected.
Caveat in the guide: "`Label` cannot be wrapped in a custom component without" a `displayName`.
**Reconciler.** None. **SSR.** Static SVG; Recharts' own site prerenders with `renderToString`
(`www/SSG_README.md`). **[unverified whether v3 store-registration renders all series on the first server pass]**

**Fits.** Shows the end state of the "data on root, field names on leaves" strategy, and that real users need
the wrapper form anyway. **Doesn't fit.** Wide-format data (one `<Bar>` per series column) means the series list is
hand-enumerated, like Victory. No partition-by-field.

**Image.** https://raw.githubusercontent.com/recharts/recharts/main/test-vr/__snapshots__/tests/Bar.6192.spec-vr.tsx-snapshots/ComposedChart-with-stacked-Area-and-Bar-1-chromium-linux.png
(visual-regression snapshot, 200 OK; snapshot paths may churn).

---

## 6. visx (airbnb)

Sources: https://github.com/airbnb/visx `packages/visx-demo/src/sandboxes/visx-barstack/Example.tsx`,
`packages/visx-xychart/README.md`

**Model.** Low-level primitives; the user builds scales by hand; "layout" components compute geometry and hand it
back through a **render prop**, the user draws plain SVG.

```tsx
// visx-demo/src/sandboxes/visx-barstack/Example.tsx (abridged)
<BarStack<CityTemperature, CityName>
  data={data}
  keys={keys}
  x={getDate}
  xScale={dateScale}
  yScale={temperatureScale}
  color={colorScale}
>
  {(barStacks) =>
    barStacks.map((barStack) =>
      barStack.bars.map((bar) => (
        <rect
          key={`bar-stack-${barStack.index}-${bar.index}`}
          x={bar.x}
          y={bar.y}
          height={bar.height}
          width={bar.width}
          fill={bar.color}
        />
      ))
    )
  }
</BarStack>
```

Separate components per direction (`BarStack` / `BarStackHorizontal`, `BarGroup` / `BarGroupHorizontal`).
The higher-level `@visx/xychart` uses **nesting** instead: "`<BarStack><BarSeries /><BarSeries />...</BarStack>`",
"`<BarGroup><BarSeries /><BarSeries />...</BarGroup>`" inside `<XYChart xScale yScale>` (README table), each
`BarSeries` carrying its own `dataKey`/`data`/accessors.

**Naming.** Capitalized components; lowercase DOM SVG for the drawn output. Accessor props (`x={getDate}`).
**Data flow.** Explicit props; render props for computed layout; context in `XYChart`.
**Reconciler.** None. **SSR.** Primitive layer computes in render, so it server-renders **[by inspection; not tested]**.

**Fits.** Render props are the honest answer to "the template is instantiated per group": the group data
is a function argument. **Doesn't fit.** Render props expose computed geometry; the user re-implements drawing
and the stack/group nesting doesn't compose (no BarStack inside BarGroup in the primitive layer **[unverified as a
hard limit]**). Users hand-build scales.

**Image.** https://raw.githubusercontent.com/airbnb/visx/master/assets/simplebar.png (README, 200 OK);
gallery: https://raw.githubusercontent.com/airbnb/visx/master/assets/visx-gallery.png

---

## 7. react-vega, Observable Plot in React

### react-vega (v8)

Source: https://github.com/vega/react-vega README.

```tsx
import { VegaEmbed } from "react-vega";
function Component() {
  return <VegaEmbed spec={spec} options={options} />;
}
```

Plus `useVegaEmbed({ ref, spec, options })`. "Any changes to `spec` or `options` will cause the view to be torn down
and re-embedded. If you need to update the view without re-embedding, use the View API." v8 removed the `data`,
`width`/`height` and `signalListeners` props in favor of the View API. Client-only (vega-embed into a div ref).
Spec for comparison (https://vega.github.io/vega-lite/examples/stacked_bar_weather.vl.json):

```json
{
  "data": { "url": "data/seattle-weather.csv" },
  "mark": "bar",
  "encoding": {
    "x": { "timeUnit": "month", "field": "date", "type": "ordinal" },
    "y": { "aggregate": "count", "type": "quantitative" },
    "color": { "field": "weather", "type": "nominal" }
  }
}
```

Stacking in Vega-Lite is implicit (a consequence of `color` on a bar), not a pipeline step.
**Image.** https://vega.github.io/vega-lite/examples/stacked_bar_weather.png (also `.svg`, 200 OK).

### Observable Plot in React

Source: https://github.com/observablehq/plot `docs/getting-started.md` ("Plot in React").

Two officially recommended patterns, both spec-as-prop:

```js
// SSR: render through a virtual Document, emit React elements
import * as Plot from "@observablehq/plot";
import { createElement as h } from "react";
export default function PlotFigure({ options }) {
  return Plot.plot({ ...options, document: new Document() }).toHyperScript();
}
// <PlotFigure options={{ marks: [Plot.dot(penguins, {x: "culmen_length_mm", y: "culmen_depth_mm"})] }} />
```

```jsx
// Client: useEffect + append, replace on change
useEffect(() => {
  if (data === undefined) return;
  const plot = Plot.plot({
    y: { grid: true },
    marks: [Plot.ruleY([0]), Plot.dot(data, { x: "Date", y: "Anomaly" })],
  });
  containerRef.current.append(plot);
  return () => plot.remove();
}, [data]);
```

The docs: "Server-side rendering is only practical for simple plots of small data; complex plots ... are better
rendered on the client because the serialized SVG is large." Update model: "simply throw away the old plot ... and
then replace it with a new one."
Community wrappers found (`plot-react` npm, gists) are all `PlotFigure`-style options props. **I found no maintained
library exposing Plot marks as JSX components** (one search; not exhaustive).

**Fits.** Plot's SSR trick (layout against a virtual document, then emit React elements) is the same idea as
"display list -> React elements", and Plot's authors chose spec-as-prop rather than JSX marks.

---

## 8. Config-as-prop foils: nivo, Semiotic, react-chartjs-2

**nivo** (https://github.com/plouc/nivo, `storybook/stories/bar/Bar.stories.tsx`). One component per chart type;
stacking is an enum prop.

```tsx
const keys = ['hot dogs', 'burgers', 'sandwich', 'kebab', 'fries', 'donut']
const commonProps = { data: generateCountriesData(keys, { size: 7 }), indexBy: 'country', keys, ... }
<Bar {...commonProps} />                       // stacked (default)
<Bar {...commonProps} groupMode="grouped" />
<Bar {...commonProps} layout="horizontal" />
```

Image: https://raw.githubusercontent.com/plouc/nivo/master/website/src/assets/captures/bar.png (200 OK).
**[unverified]** customization via a `layers` prop that accepts custom components.

**Semiotic** (https://github.com/nteract/semiotic README, v3.13). Two layers: Charts (`<LineChart data xAccessor yAccessor/>`,
`<BarChart data categoryAccessor valueAccessor/>`) and Frames (`<StreamXYFrame chartType="line" .../>`).
Notable: "Charts serialize to JSON and back: `toConfig`, `fromConfig`, `toURL`, `copyConfig`, `configToJSX`.
Have Vega-Lite specs? `fromVegaLite(spec)` translates them" — a JSX <-> config round trip, the property #1266 wants
for JSX <-> frontend IR. Composition across charts is a wrapper: `<LinkedCharts><Scatterplot .../><BarChart .../></LinkedCharts>`.

**react-chartjs-2** (README): `import { Doughnut } from 'react-chartjs-2'; <Doughnut data={...} />` — thin config prop over
Chart.js (canvas, client-only).

---

## 9. Other JSX renderers and nesting precedents

**Mafs** (https://mafs.dev, https://github.com/stevenpetryk/mafs). `<Mafs><Coordinates.Cartesian /></Mafs>`.
No reconciler (peer deps only `react`, `react-dom`); components render DOM SVG directly. `src/display/Point.tsx` reads
`useTransformContext()` and draws a `<circle>`. `<Transform matrix>` composes a new matrix and re-provides
`TransformContext` — **coordinate transform as a nesting wrapper via context**. Namespaced component names
(`Coordinates.Cartesian`, `Plot.OfX`) — relevant to GoFish's capital-means-namespace rule.

**react-pdf** (https://github.com/diegomura/react-pdf). Custom reconciler (`@react-pdf/reconciler` vendors
react-reconciler 0.23/0.31/0.33). Its capitalized exports are **just string host types**:
`packages/primitives/src/index.ts`: `export const View = 'VIEW'; export const Text = 'TEXT'; export const Rect = 'RECT'; export const Document = 'DOCUMENT'; ...`
So users write `<Document><Page><View><Text>` (capitalized, importable, no clash with DOM `rect`/`text`) while the reconciler
sees host strings. Output is a PDF document, not DOM. Also has `Svg`, `Rect`, `Circle`, `Path` primitives.

**Ink** (https://github.com/vadimdemedes/ink). Custom reconciler (`react-reconciler ^0.34`) + Yoga flexbox layout to a
terminal. `<Box>` is a capitalized component that renders the hyphenated intrinsic `<ink-box>` (`src/components/Box.tsx`) —
another way to dodge DOM name clashes.

**Remotion** (https://www.remotion.dev/docs/sequence, /docs/series). Time pipeline as nesting via context, no custom reconciler.
`<Sequence from={30} durationInFrames={30}><div>Clip</div></Sequence>`; "You can nest sequences within each other and they will
cascade" (offsets add). `<Series>` lays children end to end: `<Series><Series.Sequence durationInFrames={40}>...</Series.Sequence>...</Series>`.
Children read time with `useCurrentFrame()`. Strong analog for GoFish's `spread`/`stack`: a wrapper that places its children
along an axis and re-bases their coordinate frame.

**React Router** (https://reactrouter.com/start/declarative/routing, /api/utils/createRoutesFromElements).
Nesting = path concatenation: "The path of the parent is automatically included in the child"; "Child routes are rendered
through the `<Outlet/>` in the parent route." Crucially, `<Routes>`/`createRoutesFromElements` **read JSX as config without
rendering it**: "Create route objects from JSX elements instead of arrays of objects." The cost is the Victory problem:
`components.tsx` throws "`[X] is not a <Route> component. All component children of <Routes> must be a <Route> or <React.Fragment>`".
JSX and the object form (`createBrowserRouter([{path, children}])`) are two spellings of one config.

---

## 10. Data-pipeline-in-JSX precedents beyond charts

**Solid `<For>`** (https://docs.solidjs.com/reference/components/for):
`children: (item: T[number], index: Accessor<number>) => U` — `<For each={items} fallback={<div>No items</div>}>{(item) => <div>{item}</div>}</For>`.
The iteration is a component; the per-item template is a function child. This is the standard JSX idiom for "template
instantiated per element".

**LayerCake (Svelte)** (https://layercake.graphics/guide). `<LayerCake x="x" y="y" data={points}><Svg><Scatter fill={'blue'} r={3} /></Svg></LayerCake>`.
Data and accessors on the root; children read `getLayerCakeContext()` (`k.data`, `k.xScale`, reactive). "Layer Cake is more about
having a system to organize your own custom components than it is a high-level charting library." SSR: "Just set the ssr prop
to `true`"; use `percentRange` because width is unknown on the server.

**TanStack Table** (https://tanstack.com/table/latest/docs/guide/row-models). Headless: the data pipeline is hook configuration,
rendering is plain JSX. The pipeline order is fixed by the library: "Internally, this is the order in which each of the row models
are applied to the data": core -> filtered -> grouped -> sorted -> expanded -> paginated. Users toggle stages; they do not compose them.

**chart-parts (Microsoft Research, archived)** (https://github.com/microsoft/chart-parts). "A flexible, React-friendly, Grammar of
Graphics" (Vega-inspired). Data transforms live **outside JSX** in a fluent library (`@chart-parts/transform`:
`stack('value').groupBy(groupBy || 'key')`); JSX holds scales, axes and marks bound to a named table with encoding callbacks:

```tsx
// packages/charts/src/BarChart/marks/StackedBarMarks.tsx (abridged)
<Rect
  table="data"
  fill={fill}
  x={encodeX}
  y={encodeY}
  y2={useY2Encoding(barPadding)}
  x2={useX2Encoding(barPadding)}
/>
// encodeX = ({ d, xVertical, xHorizontal }) => xHorizontal ? xHorizontal(d.y0) : xVertical(d._category)
```

Mechanism (`packages/api-react/src/marks/BaseMark.tsx`): no reconciler; each mark component builds a `MarkBuilder` and
**registers it into a parent `SceneBuilderContext` inside `useEffect`**, re-providing the child scene node; `Chart` renders the
assembled scene. Effect-time registration means no server render of marks **[inferred from code]**.

**Observable Framework** (https://github.com/observablehq/framework `docs/jsx.md`). Supports ` ```jsx ` blocks with React
(`display(<Greeting subject="JSX" />)`, since 1.9), but Plot is used from plain ` ```js ` blocks that evaluate
`Plot.plot({...})` to a DOM node. Because a Markdown cell can display any DOM node, Framework never needed a JSX layer for Plot;
JSX is for app UI. **[the "why" is my inference; the docs don't state it]**

**MDX / Docusaurus.** Charts are embedded as ordinary React components imported at the top of the `.mdx`; there is no
convention beyond "a component". **[not separately verified]**

---

## 11. Research literature

- **Bluefish** (UIST 2024, DOI 10.1145/3654777.3676465): relations as relaxed components; compound-graph scenegraph; JSX (Solid).
  The only paper found that is specifically about a component/JSX API for graphics composition.
- **Vega-Lite** (Satyanarayan et al., InfoVis 2016/TVCG 2017): the canonical spec-as-data grammar; React integration is a
  wrapper (react-vega), not a JSX grammar.
- **chart-parts** has a talk ("The Missing Abstraction of Charting", linked in its README) but I found no paper.
- I found **no paper** on mapping a grammar-of-graphics _data pipeline_ onto a JSX tree (two searches; not exhaustive).

---

## Strategy classification: how a pipeline meets a tree

| #   | Strategy                                                                    | Systems                                                                                                                                                                                       | Known pain points                                                                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| i   | **Nesting: each step wraps the next**                                       | VictoryStack/Group, visx XYChart BarStack/BarGroup, Recharts 3.6 `BarStack`, Remotion Sequence/Series, React Router nested Route, Mafs Transform, Bluefish relations, LinkedCharts (Semiotic) | In every chart example the wrapper stacks **children the user enumerated** (one per series); none partitions data by a field. Victory implements it by cloning/inspecting children, which breaks user components (#2342, open since 2022). Recharts and Victory both say the fix is context. |
| ii  | **Spec/config as one prop, no JSX tree**                                    | react-vega, Plot `PlotFigure`, nivo, react-chartjs-2, Semiotic Charts                                                                                                                         | Updates re-embed the whole view (react-vega: "torn down and re-embedded"); no React composition inside; client-only unless the library can render to a virtual document (Plot). Cheap and exact.                                                                                             |
| iii | **Data on root, leaves name fields**                                        | Recharts (`data` + `dataKey` + `stackId`), LayerCake, Bluefish `Plot`/`Dot`, XYChart (`dataKey`)                                                                                              | Wide-format data; series enumerated by hand; grouped+stacked needs ID tricks; Recharts grew a nesting wrapper (`BarStack`) on top.                                                                                                                                                           |
| iv  | **Render props / function-as-child receive group data**                     | visx BarStack/BarGroup, Solid `<For>`                                                                                                                                                         | Exposes computed geometry, so users redraw everything; deep pyramids of `map`; not serializable (functions). It is the only strategy where "template instantiated per group" is literal.                                                                                                     |
| v   | **Hooks compute, plain JSX draws**                                          | visx primitives + d3 scales, TanStack Table, Plot `useEffect`                                                                                                                                 | Users write the drawing; the pipeline is fixed-order config (TanStack) or imperative code. Good SSR when computed in render.                                                                                                                                                                 |
| vi  | **Custom reconciler builds a scene**                                        | modular-svg-react, r3f, react-pdf, Ink                                                                                                                                                        | Cost of maintaining a host config across react-reconciler versions (react-pdf vendors three). Context does not cross roots without its-fine. Effect-time solve (modular-svg) loses SSR.                                                                                                      |
| vii | **JSX read as config (element walk or context registration), not rendered** | React Router `createRoutesFromElements`, Victory/Recharts 2 child inspection, chart-parts and Recharts 3 context/store registration                                                           | Element walking forbids wrapper components (Router throws; Victory silently fails). Registration in effects forbids SSR and causes a second render.                                                                                                                                          |

Observation: no surveyed library turns a _data-partitioning_ pipeline (`spread by lake`, then `stack by species`, then a mark
template) into nested JSX. Chart libraries either enumerate series by hand (i, iii), hide the pipeline inside a chart type (ii),
or hand the group to a function (iv). Vega-Lite and chart-parts keep transforms out of the markup entirely.

## Lessons for GoFish

1. **Nesting is the precedent for operators, and it round-trips if a wrapper means "partition my data and instantiate my
   children per part".** `<Spread by="lake" dir="x"><Stack by="species" dir="y"><Rect h="count"/></Stack></Spread>` is exactly
   `.flow(spread(...), stack(...)).mark(rect(...))` read outside-in, because each flow step's output is the next step's input.
   Remotion and Router show nested wrappers that re-base the frame for their children; GoFish's are the first to also split data.
   What nesting does not express directly: `.layer(...)` siblings over the same data and names/`selectAll`. Those want sibling
   children and a `name` prop, which JSX handles naturally.
2. **The leaf is a template, not an instance.** Every library that made leaves instances (Victory, Recharts) had to make users
   enumerate series. In GoFish the mark under the innermost operator is instantiated per group by the core; the JSX must not run
   it per datum. This argues against render props (strategy iv) as the default, since GoFish's marks already take field names
   and accessors.
3. **Do not inspect `props.children` by type.** Victory #2342 and React Router's "must be a `<Route>`" error are the same bug.
   Either use a reconciler (host instances see through user components) or context registration. A reconciler is the only one
   of these that also keeps registration synchronous.
4. **Solve during render, not in an effect, or there is no SSR.** modular-svg and chart-parts both do the scene work in
   `useEffect`. For MDX the static HTML must contain the SVG. Plot's `document: new Document()` + `toHyperScript()` shows the
   target: run layout synchronously against a non-DOM backend, emit React elements. A secondary reconciler root can be flushed
   synchronously during the outer render **[technique used by some libraries; not verified in this survey]**; the simpler
   alternative is a pure function from the JSX element tree to frontend IR (strategy vii done right: walk elements, but call
   function components to see through them).
5. **Spell components with capitals and avoid DOM clashes the react-pdf way.** Capitalized exports that are string host types
   (`export const Rect = 'RECT'`) give `<Rect>` without colliding with DOM `<rect>`, keep user components capitalized too,
   and let the reconciler/walker see a host type. Ink's `<ink-box>` and r3f's generated lowercase catalogue are alternatives;
   r3f works only because THREE names don't clash. Mafs uses namespaces (`Coordinates.Cartesian`), which matches GoFish's
   `Coord.polar()` families if strategies appear as props.
6. **Generate the vocabulary.** r3f derives every intrinsic from THREE; GoFish can derive components and prop types from
   `descriptors.ts` (as #685 does for Python). Semiotic's `toConfig`/`configToJSX` shows the payoff of a two-way JSX <-> config
   mapping: the JSX is one more frontend for the same IR.
7. **Keep a spec-as-prop component regardless.** Every ecosystem (Vega, Plot, Chart.js, nivo) ships `<X spec/>` first; it is
   the cheapest MDX path and the fallback for constructs JSX spells badly.
