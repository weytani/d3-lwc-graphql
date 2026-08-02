> **Repo split (2026-08-02):** this is **d3-lwc-graphql** — the standalone GraphQL-only line
> of the former `weytani/d3-lwc` (archived). Each converted chart is a self-contained LWC
> bundle whose only dependency is the `d3` static resource. For the shared-module Apex/SOQL
> line, see [`weytani/d3-lwc-soql`](https://github.com/weytani/d3-lwc-soql). Conversion
> status: 16/40 standalone; inherited release tags preserved as `legacy/*`.

# Salesforce D3.js Chart Component Library

A complete suite of Lightning Web Components (LWC) that wrap D3.js charts for use in Salesforce App Builder, Experience Builder, and Screen Flows. Components are drag-and-drop ready and support three data sources — a record collection from a Flow, a structured self-fetch straight from the object, or a free-text GraphQL override (see `docs/ADMIN-GUIDE.md` for the full admin-facing model).

The library is migrating chart-by-chart to a **v3 "standalone, GraphQL-only"**
architecture: each converted chart is a fully self-contained bundle (its
support modules inlined, no shared `c/` services, no Apex) that self-fetches
via the `lightning/graphql` wire adapter. The old `soqlQuery`/`fetchMode`
properties are replaced by the structured self-fetch + a `graphqlQuery`
free-text override, and every converted chart gains a `lightning__FlowScreen`
target. Charts not yet converted still use the earlier Apex/SOQL-backed data
path described further down; see `CHANGELOG.md` for which charts have moved
and `docs/conversion-recipe.md` for the conversion procedure itself.

## 🖼️ Gallery

All charts below are rendered **live in Salesforce** (Lightning App Pages) against demo Opportunity data — not static mockups of the D3 output.

### Phase 3 — radial, ranking & timeline charts

![Phase 3 charts rendered in Salesforce](docs/screenshots/phase3/d3-lwc-phase3-charts.png)

_Pie, Horizontal Bar, Lollipop, Progress Bar, Diverging Bar, Waffle, Sunburst, Bubble, Chord Diagram, and Gantt._

### Phase 2 — distributions, flows & time series

![Phase 2 charts rendered in Salesforce](docs/screenshots/phase2/d3-lwc-phase2-charts.png)

_Funnel, Bullet, Stacked Bar, Area, Waterfall, Heatmap, Box Plot, Radar, Calendar Heatmap, and Sparkline Grid._

### Phase 1 — core analytics charts

![D3 LWC charts in Salesforce](d3-lwc-smoke-test.png)

_Gauge, Bar, Donut, Line, Scatter, Histogram, Treemap, Sankey, Force Graph, and Choropleth._

## ✨ Features

- **40 Chart Types**: Bar, Line, Donut, Gauge, Scatter, Histogram, Treemap, Sankey, Force Graph, Choropleth, Area, Stacked Bar, Funnel, Radar, Heatmap, Box Plot, Waterfall, Bullet, Calendar Heatmap, Sparkline Grid, Pie, Horizontal Bar, Lollipop, Progress Bar, Diverging Bar, Waffle, Sunburst, Bubble, Chord Diagram, Gantt, Dot Plot, Sorted Bar, Step, Slope, Stacked Horizontal Bar, Icon Array, Normalized Bar, Variable-Color Line, Band, Difference
- **Drag-and-Drop Ready**: Fully configurable in Lightning App Builder
- **GraphQL Self-Fetch** (v3 standalone charts): structured self-fetch is the default the moment Object API Name + field mappings are set — no `fetchMode` attribute to opt into, no Apex controller, FLS/sharing enforced by the platform. A free-text `graphqlQuery` override is available for advanced queries, and a `recordCollection` passed in from a Flow always wins over either. See `docs/ADMIN-GUIDE.md` for the full precedence rules and property reference.
- **Server-Side Aggregation & Analytics** (charts not yet converted): GROUP BY, statistics (mean, median, stdDev), and correlation (Pearson r, linear regression) run in Apex, sending pre-bucketed results to the browser — this is the pre-v3 data path, still in place for charts the conversion hasn't reached yet
- **Configurable Limits**: Per-chart `recordLimit` property in App Builder — set your own data ceiling or use smart defaults
- **Responsive**: Uses ResizeObserver for adaptive reflow
- **SLDS Styled**: Consistent with Salesforce Lightning Design System
- **Theme Support**: 4 built-in palettes + custom colors via JSON config
- **3,435 Tests** (as of 2026-07-13): Comprehensive Jest test coverage across 135 suites

## 📦 Components

### Phase 1

| Component           | Description          | Key Features                                   |
| ------------------- | -------------------- | ---------------------------------------------- |
| `c-d3-gauge`        | Single KPI gauge     | Zones, thresholds, color coding                |
| `c-d3-bar-chart`    | Aggregated bar chart | Vertical bars, drill-down, grid                |
| `c-d3-donut-chart`  | Part-to-whole        | Animated slices, center total, legend          |
| `c-d3-line-chart`   | Time series          | Multi-series, date parsing, curve types        |
| `c-d3-scatter-plot` | Correlation          | Trend line, Pearson coefficient, point sizing  |
| `c-d3-histogram`    | Distribution         | Auto-binning, normal curve overlay, statistics |
| `c-d3-treemap`      | Hierarchical         | Nested rectangles, zoom/drill, breadcrumbs     |
| `c-d3-sankey`       | Flow/process         | Nodes + links, gradient colors, flow values    |
| `c-d3-force-graph`  | Network graph        | Force simulation, drag, zoom/pan, node sizing  |
| `c-d3-choropleth`   | Geographic map       | US states, world, custom GeoJSON, color scales |

### Phase 2

| Component                | Description        | Key Features                                          |
| ------------------------ | ------------------ | ----------------------------------------------------- |
| `c-d3-area-chart`        | Filled time series | Stacked areas, gradients, multi-series                |
| `c-d3-stacked-bar-chart` | Multi-series bars  | Grouped or stacked, series comparison                 |
| `c-d3-funnel-chart`      | Conversion funnel  | Stage progression, drop-off rates                     |
| `c-d3-radar-chart`       | Multi-axis         | Polygon overlay, category comparison                  |
| `c-d3-heatmap`           | 2D categorical     | Color intensity grid, sequential ramps                |
| `c-d3-box-plot`          | Distribution stats | Quartiles, whiskers, outliers                         |
| `c-d3-waterfall-chart`   | Bridge/variance    | Running totals, positive/negative coloring            |
| `c-d3-bullet-chart`      | KPI vs target      | Actual vs target, qualitative ranges                  |
| `c-d3-calendar-heatmap`  | Daily data grid    | Year view, day-level color intensity                  |
| `c-d3-sparkline-grid`    | Small multiples    | Inline mini-charts, entity comparison, monthly rollup |

### Phase 3

| Component                   | Description          | Key Features                                         |
| --------------------------- | -------------------- | ---------------------------------------------------- |
| `c-d3-pie-chart`            | Part-to-whole        | Full-circle slices, legend, percentage labels        |
| `c-d3-horizontal-bar-chart` | Ranked categories    | Y-axis bands, long-label support, drill-down         |
| `c-d3-lollipop-chart`       | Ranked metrics       | Stem + circle, low ink, leaderboard style            |
| `c-d3-progress-bar`         | Single KPI vs target | Linear gauge, target marker, percentage fill         |
| `c-d3-diverging-bar-chart`  | Positive/negative    | Centered axis, semantic up/down coloring             |
| `c-d3-waffle-chart`         | Percentage grid      | 10×10 cells, contrast-aware labels, goal progress    |
| `c-d3-sunburst-chart`       | Radial hierarchy     | Concentric rings, two-level grouping, part-to-whole  |
| `c-d3-bubble-chart`         | Three-variable       | X/Y position + area-scaled size, category color      |
| `c-d3-chord-diagram`        | Relationship matrix  | Circular arcs, ribbons, bidirectional flow           |
| `c-d3-gantt-chart`          | Project timeline     | Time axis, date-range bars, today marker, drill-down |

### Phase 4

| Component                     | Description             | Key Features                                               |
| ----------------------------- | ----------------------- | ---------------------------------------------------------- |
| `c-d3-dot-plot`               | Cleveland dot plot      | One dot per category, horizontal value axis, drill-down    |
| `c-d3-sorted-bar-chart`       | Re-sortable bars        | Vertical bars, sort by label or value, drill-down          |
| `c-d3-step-chart`             | Stepped time series     | Discrete state changes, multi-series, drill-down           |
| `c-d3-slope-chart`            | Before/after comparison | Two ranked axes, connecting slope lines, drill-down        |
| `c-d3-stacked-horizontal-bar` | Horizontal stacked bars | Stacked or 100%-normalized, series legend, drill-down      |
| `c-d3-icon-array`             | Pictogram / unit chart  | 100-glyph grid, proportional fill, contrast-aware labels   |
| `c-d3-normalized-bar`         | 100% stacked bars       | Full-height bars, percentage composition, drill-down       |
| `c-d3-variable-color-line`    | Threshold-colored line  | Single series, color switches at threshold, gradient stops |
| `c-d3-band-chart`             | Range / confidence band | Filled lower/upper bound, optional center line, time axis  |
| `c-d3-difference-chart`       | Plan vs actual          | Two series, green/red above-below shading, clip-path fill  |

## 🚀 Quick Start

### Prerequisites

- Salesforce CLI (`sf`)
- Node.js v20+ (v25 has compatibility issues with SF CLI)
- A Salesforce org with "Enable Local Development" turned on

### Installation

```bash
# Clone the repository
git clone https://github.com/weytani/d3-lwc.git
cd d3-lwc

# Install dependencies
npm install

# Deploy to your org
sf project deploy start --source-dir force-app -o <your-org-alias>
```

### Running Tests

```bash
npm test
```

### Local Development (Hot Reload)

```bash
# Use Node 20 for Salesforce CLI compatibility
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"

# Start the Lightning Dev Server
sf lightning dev app -o <your-org-alias>
```

## 📊 Usage

### Common Properties

Properties vary somewhat between a chart's pre-v3 (Apex/SOQL-backed) form and
its converted v3 standalone form — see `docs/ADMIN-GUIDE.md` for the full,
per-family property reference sourced from the actual component metadata.
Broad strokes:

| Property           | Type     | Description                                                                                                                                       |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recordCollection` | Object[] | Data from a Flow or parent component. Always wins over any query the chart would otherwise run.                                                   |
| `objectApiName`    | String   | SObject API name to query. On a v3 standalone chart this drives the GraphQL self-fetch; on a pre-v3 chart it drives server-side Apex aggregation. |
| `graphqlQuery`     | String   | **v3 standalone charts only.** Free-text `uiapi.query` override of the built query — see `docs/ADMIN-GUIDE.md` §2c for the contract and footgun.  |
| `soqlQuery`        | String   | **Pre-v3 charts only.** SOQL query (used if `recordCollection` is empty).                                                                         |
| `filterClause`     | String   | **Pre-v3 charts only.** Optional WHERE clause for server-side Apex aggregation.                                                                   |
| `recordLimit`      | Integer  | Max records to process (1–10,000). Leave empty for smart defaults per chart type.                                                                 |
| `height`           | Integer  | Chart height in pixels                                                                                                                            |
| `theme`            | String   | Color theme (Salesforce Standard, Warm, Cool, Vibrant)                                                                                            |
| `advancedConfig`   | String   | JSON for advanced options                                                                                                                         |

### D3 Bar Chart — structured self-fetch (v3 standalone)

The bar chart is a converted v3 standalone bundle: set `object-api-name` plus
the field mapping and it self-fetches via the `lightning/graphql` wire adapter
automatically — there's no `fetch-mode` attribute to opt into, and no
`D3ChartController` Apex class in the loop. Field- and record-level security
are enforced by the platform. The chart below is rendering live Opportunity
Amount summed by Stage, fetched entirely via GraphQL (verified against a live
org):

![D3 Bar Chart rendering live data via GraphQL self-fetch](docs/screenshots/d3-bar-chart-graphql-self-fetch.png)

```html
<!-- Structured self-fetch: aggregates via the UI API GraphQL wire adapter, no Apex -->
<c-d3-bar-chart
  object-api-name="Opportunity"
  group-by-field="StageName"
  value-field="Amount"
  operation="Sum"
  height="400"
>
</c-d3-bar-chart>
```

For a `Count` operation, this path fetches raw rows up to `record-limit` and
counts client-side (GraphQL has no server-side COUNT) — for an exact count on
a large object, pass records in from a Flow instead (below).

### D3 Bar Chart — records from a Flow

```html
<!-- recordCollection always wins: the chart renders exactly what it's given, no query -->
<c-d3-bar-chart
  record-collection="{records}"
  group-by-field="StageName"
  value-field="Amount"
  operation="Sum"
  height="300"
>
</c-d3-bar-chart>
```

### D3 Bar Chart — free-text GraphQL override

```html
<!-- graphqlQuery overrides the built query; must be a uiapi.query record query -->
<c-d3-bar-chart
  object-api-name="Opportunity"
  group-by-field="StageName"
  value-field="Amount"
  operation="Sum"
  graphql-query="query { uiapi { query { Opportunity(first: 200) { edges { node { StageName { value } Amount { value } } } } } } }"
  height="400"
>
</c-d3-bar-chart>
```

### D3 Gantt Chart (GraphQL-only since 2.0, BREAKING)

The gantt chart converted to GraphQL-only ahead of the wider v3 wave — like
the bar chart above, the Apex `soqlQuery`/`filterClause` properties have been
removed entirely. Set `object-api-name` plus `label-field`/`start-date-field`/
`end-date-field` and the chart fetches its own tasks through Salesforce's
`lightning/graphql` wire adapter, with no `D3ChartController` involved. The chart
below is rendering 12 live Opportunity project timelines fetched entirely via
GraphQL (verified against a live org):

![D3 Gantt Chart rendering live data via GraphQL self-fetch](docs/screenshots/d3-gantt-chart-graphql-self-fetch.png)

```html
<!-- GraphQL self-fetch: no Apex, no soqlQuery/filterClause -->
<c-d3-gantt-chart
  object-api-name="Opportunity"
  label-field="Name"
  start-date-field="Project_Start__c"
  end-date-field="Project_End__c"
  height="400"
>
</c-d3-gantt-chart>
```

**Migrating an existing gantt instance:** Salesforce refuses to deploy a bundle
that drops an `@api` property still referenced by a Lightning page, so an
in-use instance must be detached from its page, redeployed, then re-attached
with `object-api-name`/`label-field`/`start-date-field`/`end-date-field` in
place of `soql-query`/`filter-clause`. See `docs/graphql-prototype-comparison.md`
for the full cost comparison against the bar chart's additive approach.

### D3 Line Chart

```html
<c-d3-line-chart
  soql-query="SELECT CloseDate, Amount FROM Opportunity"
  date-field="CloseDate"
  value-field="Amount"
  curve-type="monotone"
  show-points="true"
>
</c-d3-line-chart>
```

### D3 Scatter Plot

```html
<c-d3-scatter-plot
  record-collection="{records}"
  x-field="AnnualRevenue"
  y-field="NumberOfEmployees"
  show-trend-line="true"
>
</c-d3-scatter-plot>
```

### D3 Choropleth (US States)

```html
<c-d3-choropleth
  record-collection="{records}"
  region-field="BillingState"
  value-field="Amount"
  map-type="us-states"
>
</c-d3-choropleth>
```

![App Builder configuration panel](docs/d3-bar-chart-config.png)

_Every chart is fully configurable in Lightning App Builder — point it at an object, pick fields, and choose a theme without writing code._

## ⚙️ Configuration

### Record Limits

Each chart has a default record limit tuned to its visual capacity. Set `recordLimit` in App Builder to override.

| Chart Type                                                                    | Default Limit | Why                                                                    |
| ----------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------- |
| Aggregation charts (Bar, Donut, Treemap, Funnel, Stacked Bar, Heatmap, Radar) | 2,000         | Client-side fallback path; server-side GROUP BY has no practical limit |
| Histogram                                                                     | 10,000        | Raw values needed for binning math                                     |
| Scatter                                                                       | 5,000         | SVG sampling kicks in at 500 points                                    |
| Box Plot                                                                      | 5,000         | Raw values needed for quartile math                                    |
| Sparkline Grid                                                                | 5,000         | Multiple small charts, raw values                                      |
| Calendar Heatmap                                                              | 2,000         | Daily data points (~5.5 years)                                         |
| Line, Area, Sankey                                                            | 1,000         | Visual comprehension ceiling                                           |
| Force Graph                                                                   | 500           | O(n log n) simulation cost                                             |
| Waterfall, Choropleth                                                         | 500           | Sequential/geographic readability                                      |
| Gauge, Bullet                                                                 | 1             | Single value (no `recordLimit` exposed)                                |

### Themes

Four built-in color palettes:

| Theme                   | Colors                                                   |
| ----------------------- | -------------------------------------------------------- |
| **Salesforce Standard** | Brand blue, orange, green, red, purple, pink, cyan, lime |
| **Warm**                | Reds, oranges, yellows                                   |
| **Cool**                | Blues, purples, cyans                                    |
| **Vibrant**             | High-contrast mixed colors                               |

Custom colors via `advancedConfig`:

```json
{
  "customColors": ["#FF5733", "#33FF57", "#3357FF"]
}
```

## 🏗️ Under the Hood

### Architecture

The diagram below is the **pre-v3 architecture** — still accurate for any
chart the v3 conversion hasn't reached yet: a shared Apex controller plus
shared LWC modules (`dataService`, `themeService`, `chartUtils`) that every
chart component imports from.

A **converted v3 standalone chart** doesn't fit this picture — it has no Apex
Controller in its data path and no shared-module imports at all. Its support
code (a D3 loader, theme palette, data helpers, formatters, and GraphQL query
builders) is inlined bundle-local inside that chart's own folder, and it talks
to Salesforce directly over the `lightning/graphql` wire. See
`docs/conversion-recipe.md` for exactly what "standalone" means per bundle.

```
┌─────────────────────────────────────────────────────────────────┐
│                        SALESFORCE ORG                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────────────────────┐  │
│  │  Static Resource │    │         Apex Controller          │  │
│  │   (D3.js v7)     │    │   D3ChartController.cls          │  │
│  └────────┬─────────┘    │   - executeQuery(soql)           │  │
│           │              │   - getAggregatedData(GROUP BY)  │  │
│           │              │   - getStatistics(stats)         │  │
│           │              │   - getCorrelation(Pearson r)    │  │
│           │              │   - with sharing (security)      │  │
│           │              └──────────────┬───────────────────┘  │
│           │                             │                       │
│  ┌────────▼─────────────────────────────▼───────────────────┐  │
│  │                    SHARED LWC MODULES                     │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │ dataService │  │themeService │  │  chartUtils     │   │  │
│  │  │ -aggregate  │  │ -palettes   │  │  -resize        │   │  │
│  │  │ -validate   │  │ -getColors  │  │  -tooltip       │   │  │
│  │  │ -truncate   │  │             │  │  -formatters    │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │  │
│  └──────────────────────────┬───────────────────────────────┘  │
│                             │                                   │
│  ┌──────────────────────────▼───────────────────────────────┐  │
│  │              40 CHART COMPONENTS (Phase 1–4)              │  │
│  │  ┌───────┐ ┌─────┐ ┌───────┐ ┌──────┐ ┌─────────┐        │  │
│  │  │ Gauge │ │ Bar │ │ Donut │ │ Line │ │ Scatter │  ···   │  │
│  │  └───────┘ └─────┘ └───────┘ └──────┘ └─────────┘        │  │
│  │  ┌──────┐ ┌─────────┐ ┌────────┐ ┌────────┐ ┌─────────┐  │  │
│  │  │ Area │ │ Funnel  │ │ Radar  │ │ BoxPlt │ │ Heatmap │  ···
│  │  └──────┘ └─────────┘ └────────┘ └────────┘ └─────────┘  │  │
│  │  ┌─────┐ ┌──────────┐ ┌────────┐ ┌───────┐ ┌───────┐     │  │
│  │  │ Pie │ │ Sunburst │ │ Bubble │ │ Chord │ │ Gantt │  ···│  │
│  │  └─────┘ └──────────┘ └────────┘ └───────┘ └───────┘     │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Data flow, pre-v3 charts:**

1. **Server-preferred path** (when `objectApiName` + field config available) — aggregation, statistics, and correlation are computed in Apex; only pre-bucketed results cross the wire.
2. **Client-side path** (`recordCollection` or `soqlQuery`-only) — raw records flow through `dataService.validateData()` → `truncateData()` → `aggregateData()`, then D3 renders into an empty `<div>`.

**Data flow, v3 standalone charts** (see `docs/ADMIN-GUIDE.md` §2 for the
admin-facing version of this):

1. **`recordCollection` wins** — if records are passed in (always the case on
   a Flow Screen), the chart renders them and never queries anything.
2. **Free-text `graphqlQuery` is next**, if set — the pasted UI API record
   query overrides the built query.
3. **Structured self-fetch is the fallback** — `objectApiName` + field
   mappings build a query the chart runs itself over `lightning/graphql`, no
   Apex involved.

### Shared Modules

#### dataService

```javascript
import {
  validateData,
  prepareData,
  aggregateData,
  CHART_LIMITS,
  OPERATIONS
} from "c/dataService";

const { data, valid, error } = prepareData(records, {
  requiredFields: ["Amount"],
  limit: CHART_LIMITS.HISTOGRAM // or pass a custom limit
});
const chartData = aggregateData(records, "StageName", "Amount", OPERATIONS.SUM);
```

#### themeService

```javascript
import { getColors, createColorScale, THEMES } from "c/themeService";

const colors = getColors("Warm", 5);
const colorScale = createColorScale("Salesforce Standard", categories);
```

#### chartUtils

```javascript
import {
  formatNumber,
  formatCurrency,
  formatPercent,
  createTooltip
} from "c/chartUtils";

formatNumber(1500000); // "1.5M"
formatCurrency(50000); // "$50,000"
```

### Project Structure

```
d3-lwc/
├── force-app/main/default/
│   ├── classes/
│   │   ├── D3ChartController.cls
│   │   └── D3ChartControllerTest.cls
│   ├── lwc/
│   │   ├── d3Lib/              # D3.js loader
│   │   ├── dataService/        # Data processing, limits, aggregation
│   │   ├── themeService/       # Color palettes + sequential ramps
│   │   ├── chartUtils/         # Shared utilities (tooltips, resize, formatting)
│   │   ├── graphqlService/     # GraphQL query builders + result normalizers
│   │   ├── d3Gauge/            # Phase 1
│   │   ├── d3BarChart/
│   │   ├── d3DonutChart/
│   │   ├── d3LineChart/
│   │   ├── d3ScatterPlot/
│   │   ├── d3Histogram/
│   │   ├── d3Treemap/
│   │   ├── d3Sankey/
│   │   ├── d3ForceGraph/
│   │   ├── d3Choropleth/
│   │   ├── d3AreaChart/        # Phase 2
│   │   ├── d3StackedBarChart/
│   │   ├── d3FunnelChart/
│   │   ├── d3RadarChart/
│   │   ├── d3Heatmap/
│   │   ├── d3BoxPlot/
│   │   ├── d3WaterfallChart/
│   │   ├── d3BulletChart/
│   │   ├── d3CalendarHeatmap/
│   │   ├── d3SparklineGrid/
│   │   ├── d3PieChart/         # Phase 3
│   │   ├── d3HorizontalBarChart/
│   │   ├── d3LollipopChart/
│   │   ├── d3ProgressBar/
│   │   ├── d3DivergingBarChart/
│   │   ├── d3WaffleChart/
│   │   ├── d3SunburstChart/
│   │   ├── d3BubbleChart/
│   │   ├── d3ChordDiagram/
│   │   ├── d3GanttChart/
│   │   ├── d3DotPlot/          # Phase 4
│   │   ├── d3SortedBarChart/
│   │   ├── d3StepChart/
│   │   ├── d3SlopeChart/
│   │   ├── d3StackedHorizontalBar/
│   │   ├── d3IconArray/
│   │   ├── d3NormalizedBar/
│   │   ├── d3VariableColorLine/
│   │   ├── d3BandChart/
│   │   └── d3DifferenceChart/
│   └── staticresources/
│       ├── d3                  # D3.js v7 (full build, no file extension)
│       ├── d3Sankey.js         # Sankey layout plugin
│       └── usStates            # US states GeoJSON
├── jest.config.js
├── package.json
├── PROJECT-SPEC.md
├── IMPLEMENTATION-BLUEPRINT.md
└── README.md
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage
```

**Test Coverage:** 3,435 tests across 135 suites, as of 2026-07-13 (includes server-side aggregation and GraphQL self-fetch path tests; grows with each chart's v3 conversion).

> Note: this Jest config runs the full suite — there is no per-component `--testPathPattern` narrowing flag. The pre-commit hook (husky + lint-staged) runs the relevant tests on staged files automatically.

## 📚 References

- [Admin Guide: App Builder & Flow usage](docs/ADMIN-GUIDE.md) — the admin-facing property reference and step-by-step setup
- [v3 conversion recipe](docs/conversion-recipe.md) — the per-chart procedure for converting to the standalone GraphQL architecture
- [D3.js Documentation](https://d3js.org/)
- [Lightning Web Components Guide](https://developer.salesforce.com/docs/component-library/documentation/en/lwc)
- [SLDS Design Tokens](https://www.lightningdesignsystem.com/design-tokens/)

## 📄 License

MIT

---

_Built with ⚔️ by Excalibur_
