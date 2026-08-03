> **Repo split (2026-08-02):** this is **d3-lwc-graphql** — the standalone GraphQL-only line
> of the former `weytani/d3-lwc` (archived). Each converted chart is a self-contained LWC
> bundle whose only dependency is the `d3` static resource. For the shared-module Apex/SOQL
> line, see [`weytani/d3-lwc-soql`](https://github.com/weytani/d3-lwc-soql). **v1.0.0** closed
> the consolidation gate at 16/40; **wave 4** (v1.1.0–v1.5.0) brings it to **21/40** charts
> converted and renamed to their `*Graphql` suffixed identity, live-verified on-org; inherited
> release tags preserved as `legacy/*`.

# d3-lwc-graphql: Standalone GraphQL-Only D3 Charts for Salesforce

A suite of Lightning Web Components that wrap D3.js charts for Salesforce App Builder,
Experience Builder, and Screen Flows — migrating chart-by-chart to a fully standalone
architecture. A **converted** chart is a self-contained bundle (its support code inlined,
no shared `c/` services, no Apex) that self-fetches data straight from Salesforce over the
`lightning/graphql` wire adapter — FLS and sharing enforced by the platform, the same way
they are for any other UI API read. Drag it onto a page, point it at an object and fields,
and it renders.

21 of 40 charts are converted as of v1.5.0 (bar, sortedBar, horizontalBar, stackedBar,
stackedHorizontalBar, normalizedBar, line, area, step, variableColorLine, sparklineGrid, pie,
donut, lollipop, funnel, waffle, divergingBar, dotPlot, slope, band, difference). The
remaining 19 still ship in this repo on the earlier Apex/SOQL-backed architecture (see
`docs/ARCHITECTURE.md`) until their conversion wave lands — see "Status & Roadmap" below.

## ✨ What a converted chart gives you

- **No Apex, no shared modules.** The bundle folder plus the `d3` static resource is
  everything — copy both into any org and it works.
- **Three data sources, in priority order:** a `recordCollection` passed in from a Flow or
  parent always wins; a free-text `graphqlQuery` (a pasted `uiapi.query` record query) is
  next; a structured self-fetch (Object API Name + field mappings) is the fallback that
  covers the common App Builder case with zero configuration beyond picking fields.
- **App Builder / Flow disambiguation.** Every converted component's label gains a
  ` (GraphQL)` suffix (e.g. "Bar Chart (GraphQL)") and its tag gains a `-graphql` suffix
  (e.g. `c-d3-bar-chart-graphql`), so it's never confused with an unsuffixed legacy instance
  still on the org.
- **`lightning__FlowScreen` target** — every converted chart can be placed on a Flow screen,
  fed by `recordCollection`.

## 🚀 Quick Start

### Prerequisites

- Salesforce CLI (`sf`)
- Node.js v20+ (v25 has compatibility issues with SF CLI)
- A Salesforce org with "Enable Local Development" turned on

### Installation

```bash
git clone https://github.com/weytani/d3-lwc-graphql.git
cd d3-lwc-graphql
npm install
```

### Deploy a converted chart

Deploys always name the exact components with `-m` — never
`--source-dir force-app/main/default/lwc` wholesale, which would also try to deploy the
Apex/shared-module code the 19 unconverted charts still carry.

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"   # Node 20 required for every sf command

# The d3 static resource + one example bundle
sf project deploy start -o <org-alias> \
  -m "StaticResource:d3" \
  -m "LightningComponentBundle:d3BarChartGraphql"
```

The full 21-bundle deploy command (plus the showcase pages/tabs and permission set) is in
`CLAUDE.md`.

### Running Tests

```bash
npm test
```

### Local Development (Hot Reload)

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
sf lightning dev app -o <your-org-alias>
```

## 📊 Usage

### D3 Bar Chart — structured self-fetch (the common case)

Set `object-api-name` plus the field mapping and it self-fetches via the `lightning/graphql`
wire adapter automatically — no `fetch-mode` attribute to opt into, no Apex controller in the
loop. Field- and record-level security are enforced by the platform. The chart below is
rendering live Opportunity Amount summed by Stage, fetched entirely via GraphQL (verified
against a live org):

![D3 Bar Chart rendering live data via GraphQL self-fetch](docs/screenshots/d3-bar-chart-graphql-self-fetch.png)

```html
<!-- Structured self-fetch: aggregates via the UI API GraphQL wire adapter, no Apex -->
<c-d3-bar-chart-graphql
  object-api-name="Opportunity"
  group-by-field="StageName"
  value-field="Amount"
  operation="Sum"
  height="400"
>
</c-d3-bar-chart-graphql>
```

For a `Count` operation, this path fetches raw rows up to `record-limit` and counts
client-side (GraphQL has no server-side COUNT) — for an exact count on a large object, pass
records in from a Flow instead.

### D3 Bar Chart — records from a Flow

```html
<!-- recordCollection always wins: the chart renders exactly what it's given, no query -->
<c-d3-bar-chart-graphql
  record-collection="{records}"
  group-by-field="StageName"
  value-field="Amount"
  operation="Sum"
  height="300"
>
</c-d3-bar-chart-graphql>
```

### D3 Bar Chart — free-text GraphQL override

```html
<!-- graphqlQuery overrides the built query; must be a uiapi.query record query -->
<c-d3-bar-chart-graphql
  object-api-name="Opportunity"
  group-by-field="StageName"
  value-field="Amount"
  operation="Sum"
  graphql-query="query { uiapi { query { Opportunity(first: 200) { edges { node { StageName { value } Amount { value } } } } } } }"
  height="400"
>
</c-d3-bar-chart-graphql>
```

### Charts not yet converted

The 19 charts still on the pre-conversion architecture keep their unsuffixed tags
(`c-d3-scatter-plot`, `c-d3-choropleth`, etc.) and their `recordCollection` /
`soqlQuery`-via-Apex data path. See `docs/ADMIN-GUIDE.md` for the full, per-family property
reference sourced from the actual component metadata, and `docs/ARCHITECTURE.md` for that
data flow.

## 📈 Status & Roadmap

### Converted — standalone GraphQL-only (21/40, through v1.5.0)

| Family                   | Charts                                                                                                                                                               | Release         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Bar                      | `d3BarChartGraphql`, `d3SortedBarChartGraphql`, `d3HorizontalBarChartGraphql`, `d3StackedBarChartGraphql`, `d3StackedHorizontalBarGraphql`, `d3NormalizedBarGraphql` | v1.0.0          |
| Line / time series       | `d3LineChartGraphql`, `d3AreaChartGraphql`, `d3StepChartGraphql`, `d3VariableColorLineGraphql`, `d3SparklineGridGraphql`                                             | v1.0.0          |
| Part-to-whole            | `d3PieChartGraphql`, `d3DonutChartGraphql`, `d3LollipopChartGraphql`, `d3FunnelChartGraphql`, `d3WaffleChartGraphql`                                                 | v1.0.0          |
| Categorical / comparison | `d3DivergingBarChartGraphql`, `d3DotPlotGraphql`, `d3SlopeChartGraphql`, `d3BandChartGraphql`, `d3DifferenceChartGraphql`                                            | v1.1.0 – v1.5.0 |

Each is live on the `D3 GraphQL Showcase 1`/`2`/`3` Lightning app pages (AGENT), verified by
the Playwright sweep below.

### Not yet converted — waves 5–8 (19)

| Wave | Family                     | Charts                                                | Status                |
| ---- | -------------------------- | ----------------------------------------------------- | --------------------- |
| 4    | Categorical / comparison   | divergingBar, dotPlot, slope, band, difference        | SHIPPED v1.1.0–v1.5.0 |
| 5    | Distribution / statistical | histogram, boxPlot, heatmap, calendarHeatmap, scatter | next                  |
| 6    | KPI / single-value         | progressBar, gauge, bullet, iconArray, waterfall      | pending               |
| 7    | Hierarchy / flow           | treemap, sunburst, sankey, chord, choropleth          | pending               |
| 8    | Relational / specialized   | forceGraph, gantt, radar, bubble                      | pending               |

One minor release per converted chart, following `docs/conversion-recipe.md`. `gantt` is
already GraphQL-only (a v2.0.0 legacy release) but not yet standalone/suffixed; its wave-8
conversion is inlining + `graphqlQuery` + the suffix rename only.

### After wave 8: the purge

The final release deletes the shared `c/` modules (`d3Lib`, `dataService`, `themeService`,
`chartUtils`, `graphqlService`) and all Apex classes (`D3ChartController` + its test class).
End state: 40 standalone bundles + the `d3` static resource + nothing else.

## 🧪 QA

Two tiers, per `CLAUDE.md`:

1. **Jest** — unit/integration/e2e tiers per bundle (jsdom, mocked `lightning/graphql` wire),
   CI-enforced on every push/PR. **142 suites / 3,543 tests**, as of v1.5.0.
   ```bash
   npm test              # full suite — no per-component --testPathPattern narrowing exists
   npm test -- --coverage
   ```
2. **Playwright live-org sweep** (`npm run test:e2e:live`) — local-only release gate, never
   CI (public repo, no org credentials in GitHub Actions). Walks all three
   `d3_graphql_showcase_*` pages on AGENT and asserts, per chart: real SVG marks rendered
   (floor count, polled so a slow first paint can't red a healthy chart), zero console errors,
   and a pixel-diff against a committed baseline PNG — 21 baselines, one per chart
   (`playwright/chart-sweep.spec.js-snapshots/`, `[D3DEMO]`-seeded synthetic data only).
   Requires `export PATH="/opt/homebrew/opt/node@20/bin:$PATH"` so the `sf`-driven frontdoor
   auth in `playwright/global-setup.js` can spawn.

## ⚙️ Configuration

### Themes

Four built-in color palettes — Salesforce Standard, Warm, Cool, Vibrant — plus custom colors
via `advancedConfig`:

```json
{
  "customColors": ["#FF5733", "#33FF57", "#3357FF"]
}
```

Record limits, the full per-property reference, and precedence rules live in
`docs/ADMIN-GUIDE.md`.

## 🏗️ Under the Hood

A converted chart has no Apex controller and no shared-module imports at all. Its support
code — a D3 loader, theme palette, data helpers, formatters, and a GraphQL query builder — is
inlined bundle-local inside that chart's own folder, and it talks to Salesforce directly over
the `lightning/graphql` wire. The 19 not-yet-converted charts still run the shared
Apex-controller + shared-LWC-module architecture documented in `docs/ARCHITECTURE.md`.

```
force-app/main/default/
├── lwc/
│   ├── d3BarChartGraphql/          # converted: bundle-local d3Loader.js, theme.js,
│   │   └── ...                     #   data.js, utils.js, graphql.js — no c/ imports
│   ├── ...                         # the other 20 converted bundles, same shape
│   ├── d3Lib/ dataService/         # shared modules — serve ONLY the 19 unconverted
│   │   themeService/ chartUtils/   #   charts below; never deployed by this line
│   ├── d3ScatterPlot/ d3Choropleth/  # unconverted charts (19) — Apex/SOQL-backed,
│   │   └── ...                       #   see docs/ARCHITECTURE.md
│   └── ...
├── classes/
│   └── D3ChartController.cls       # serves ONLY the 19 unconverted charts
└── staticresources/
    └── d3                          # D3.js v7 (full build, no file extension) —
                                     #   the only dependency a converted bundle has
```

## 📚 References

- [Admin Guide: App Builder & Flow usage](docs/ADMIN-GUIDE.md) — the admin-facing property reference and step-by-step setup
- [Architecture](docs/ARCHITECTURE.md) — the pre-conversion Apex/SOQL data flow, still accurate for the 19 unconverted charts
- [v3 conversion recipe](docs/conversion-recipe.md) — the per-chart procedure for converting to the standalone GraphQL architecture
- [D3.js Documentation](https://d3js.org/)
- [Lightning Web Components Guide](https://developer.salesforce.com/docs/component-library/documentation/en/lwc)
- [SLDS Design Tokens](https://www.lightningdesignsystem.com/design-tokens/)

## 📄 License

MIT

---

_Built with ⚔️ by Excalibur_
