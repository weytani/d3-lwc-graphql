# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Repo split from `weytani/d3-lwc` at the `v3-standalone` tip. This repo's own semver line
starts at 1.0.0 (consolidation gate). Inherited tags are preserved as `legacy/v*`:

| Legacy tag                      | Meaning                                                         |
| ------------------------------- | --------------------------------------------------------------- |
| `legacy/v1.0.0`                 | d3-lwc 30-chart hybrid release                                  |
| `legacy/v1.1.0`                 | GraphQL self-fetch added to bar (fetchMode)                     |
| `legacy/v2.0.0`                 | gantt GraphQL-only (first breaking release)                     |
| `legacy/v2.1.0`                 | 40 charts, hybrid fetchMode — d3-lwc-soql fork point            |
| `legacy/v3.0.0`–`legacy/v3.9.0` | per-chart standalone conversions — the line this repo continues |

## [3.9.0] - 2026-07-13

### Changed

- **BREAKING: `d3VariableColorLine` is now a standalone GraphQL-only bundle**,
  converted per the v3 recipe (see 3.0.0): GraphQL wire self-fetch only,
  bundle-local support modules, no shared `c/` imports, no Apex. `soqlQuery`
  and `fetchMode` removed; `graphqlQuery` free-text record queries and the
  `lightning__FlowScreen` target added; render-orchestration hardening
  applied. As a raw-record time-series chart its stroke color switches at a
  configurable threshold (below vs above target); it shapes dates with its
  own parser and feeds the same pipeline on every data path. Ships with the
  full unit + integration + e2e test tiers. Live-verified on-org (91 points,
  Amount over CloseDate, threshold 50K).

### Migration

- Same pattern as 3.0.0: detach placed `d3VariableColorLine` instances before
  deploying, then reconfigure with structured properties or `graphqlQuery`.

## [3.8.0] - 2026-07-12

### Changed

- **BREAKING: `d3StepChart` is now a standalone GraphQL-only bundle**,
  converted per the v3 recipe (see 3.0.0): GraphQL wire self-fetch only,
  bundle-local support modules, no shared `c/` imports, no Apex. `soqlQuery`
  and `fetchMode` removed; `graphqlQuery` free-text record queries and the
  `lightning__FlowScreen` target added; render-orchestration hardening
  applied. As a raw-record time-series chart it shapes dates with its own
  parser and step-interpolates each series through the same pipeline on
  every data path — multi-series points are never collapsed. Ships with the
  full unit + integration + e2e test tiers. Live-verified on-org.

### Migration

- Same pattern as 3.0.0: detach placed `d3StepChart` instances before
  deploying, then reconfigure with structured properties or `graphqlQuery`.

## [3.7.0] - 2026-07-12

### Changed

- **BREAKING: `d3AreaChart` is now a standalone GraphQL-only bundle**,
  converted per the v3 recipe (see 3.0.0): GraphQL wire self-fetch only,
  bundle-local support modules, no shared `c/` imports, no Apex. `soqlQuery`
  and `fetchMode` removed; `graphqlQuery` free-text record queries and the
  `lightning__FlowScreen` target added; render-orchestration hardening
  applied. As a raw-record time-series chart (overlapping, stacked, and
  normalized area modes with gradient fill) it shapes dates with its own
  parser and feeds the same pipeline on every data path — multi-series
  areas are never collapsed. Now ships with the full unit + integration +
  e2e test tiers. Live-verified on-org (4 series, Amount over CloseDate).

### Migration

- Same pattern as 3.0.0: detach placed `d3AreaChart` instances before
  deploying, then reconfigure with structured properties or `graphqlQuery`.

## [3.6.0] - 2026-07-12

Wave 2 opens with the line/time-series family. This release also folds the
Wave 2 lessons into `docs/conversion-recipe.md`: the line family is
documented as §9.2 raw-record charts with a date X-axis (single
auto-detecting normalizer, component-owned date parsing, no gantt-style
normalizer/parseDate), the §9.4 gantt path is scoped to gantt +
calendarHeatmap only, and the unified single-path wire handler is promoted
as the recommended shape for raw-record charts.

### Changed

- **BREAKING: `d3LineChart` is now a standalone GraphQL-only bundle**,
  converted per the v3 recipe (see 3.0.0): GraphQL wire self-fetch only,
  bundle-local support modules, no shared `c/` imports, no Apex. `soqlQuery`
  and `fetchMode` removed; `graphqlQuery` free-text record queries and the
  `lightning__FlowScreen` target added; render-orchestration hardening
  applied. As a raw-record time-series chart it shapes dates with its own
  parser and feeds the same pipeline on every data path — multi-series
  points are never collapsed. Live-verified on-org.

### Migration

- Same pattern as 3.0.0: detach placed `d3LineChart` instances before
  deploying, then reconfigure with structured properties or `graphqlQuery`.

## [3.5.0] - 2026-07-12

### Changed

- **BREAKING: `d3NormalizedBar` is now a standalone GraphQL-only bundle**,
  converted per the v3 recipe (see 3.0.0): GraphQL wire self-fetch only
  (two-field grouped aggregates), bundle-local support modules, no shared
  `c/` imports, no Apex. As a mandatory-series composition chart it drops the
  single-field aggregators as dead surface and routes Count through the
  two-field pivot. `soqlQuery` and `fetchMode` removed; `graphqlQuery`
  free-text record queries (flat rows pivoted and summed client-side, then
  normalized to 100% — proven identical to the structured path by test) and
  the `lightning__FlowScreen` target added; render-orchestration hardening
  applied. Live-verified on-org (10 categories × 3 series).

This completes Wave 1 of the v3 line: the entire bar family
(`d3BarChart`, `d3SortedBarChart`, `d3HorizontalBarChart`,
`d3StackedBarChart`, `d3StackedHorizontalBar`, `d3NormalizedBar`) is now
standalone and GraphQL-only.

### Migration

- Same pattern as 3.0.0: detach placed `d3NormalizedBar` instances before
  deploying, then reconfigure with structured properties or `graphqlQuery`.

## [3.4.0] - 2026-07-12

### Changed

- **BREAKING: `d3StackedHorizontalBar` is now a standalone GraphQL-only
  bundle**, converted per the v3 recipe (see 3.0.0): GraphQL wire self-fetch
  only (two-field grouped aggregates), bundle-local support modules, no
  shared `c/` imports, no Apex. `soqlQuery` and `fetchMode` removed;
  `graphqlQuery` free-text record queries (flat rows pivoted and summed
  client-side, with an equivalence test proving identical 100%-normalized
  percentages vs the structured path) and the `lightning__FlowScreen` target
  added; render-orchestration hardening applied. Live-verified on-org
  (10 categories × 3 series).

### Migration

- Same pattern as 3.0.0: detach placed `d3StackedHorizontalBar` instances
  before deploying, then reconfigure with structured properties or
  `graphqlQuery`.

## [3.3.0] - 2026-07-12

### Changed

- **BREAKING: `d3StackedBarChart` is now a standalone GraphQL-only bundle**,
  converted per the v3 recipe (see 3.0.0): GraphQL wire self-fetch only
  (two-field grouped aggregates via the bundle-local multi-group builder),
  bundle-local support modules, no shared `c/` imports, no Apex. `soqlQuery`
  and `fetchMode` removed; `graphqlQuery` free-text record queries (flat rows
  pivoted and summed client-side to match the aggregate path — proven by an
  equivalence test on the exact `d3.stack()` inputs) and the
  `lightning__FlowScreen` target added; render-orchestration hardening
  applied. Live-verified on-org (10 categories × 3 series).

### Migration

- Same pattern as 3.0.0: detach placed `d3StackedBarChart` instances before
  deploying, then reconfigure with structured properties or `graphqlQuery`.

## [3.2.0] - 2026-07-12

### Changed

- **BREAKING: `d3HorizontalBarChart` is now a standalone GraphQL-only
  bundle**, converted per the v3 recipe (see 3.0.0): GraphQL wire self-fetch
  only, bundle-local support modules, no shared `c/` imports, no Apex.
  `soqlQuery` and `fetchMode` removed; `graphqlQuery` free-text record
  queries and the `lightning__FlowScreen` target added; render-orchestration
  hardening applied with the chart's own horizontal margins (190px) guarding
  the sub-margin bail. Live-verified on-org.
- The conversion recipe (`docs/conversion-recipe.md`) folds in the Wave 1
  lessons: the §9.3 matrix-family split (stacked-bar charts pivot via
  `aggregateSeriesData` + `d3.stack()`, never `buildMatrix`), a single
  blessed two-commit shape, chart-specific sub-margin guards, the
  field-projection dedup idiom, and the summation-capable mock-D3 pattern.

### Migration

- Same pattern as 3.0.0: detach placed `d3HorizontalBarChart` instances
  before deploying, then reconfigure with structured properties or
  `graphqlQuery`.

## [3.1.0] - 2026-07-12

### Changed

- **BREAKING: `d3SortedBarChart` is now a standalone GraphQL-only bundle**,
  converted per the v3 recipe (see 3.0.0): GraphQL wire self-fetch only,
  bundle-local support modules, no shared `c/` imports, no Apex. `soqlQuery`
  and `fetchMode` removed; `graphqlQuery` free-text record queries and the
  `lightning__FlowScreen` target (with `sortBy`/`sortDirection` in the Flow
  config) added; render-orchestration hardening applied. Sorting behaves
  identically across recordCollection, structured, and free-text data paths;
  Count fetches raw rows bounded by Record Limit. Live-verified on-org.

### Migration

- Same pattern as 3.0.0: detach placed `d3SortedBarChart` instances before
  deploying, then reconfigure with structured properties or `graphqlQuery`.

## [3.0.0] - 2026-07-12

First release of the v3 line: every chart becomes a fully standalone,
GraphQL-only bundle — one release per converted chart. This release converts
`d3BarChart` (the reference conversion) and ships the conversion recipe the
remaining charts follow.

### Changed

- **BREAKING: `d3BarChart` is now a standalone GraphQL-only bundle.** The
  component self-fetches exclusively through the v2 `lightning/graphql` wire
  adapter (FLS/sharing enforced by the platform) and carries bundle-local
  copies of exactly the service code it uses (`d3Loader.js`, `theme.js`,
  `data.js`, `utils.js`, `graphql.js`) — it no longer imports `c/d3Lib`,
  `c/themeService`, `c/dataService`, `c/chartUtils`, `c/graphqlService`, or
  any Apex. Copy the bundle folder plus the `d3` static resource into any
  project and it works. `recordCollection` (Flow/parent data) still takes
  priority over self-fetch.
- **Render orchestration hardened.** A single lifetime ResizeObserver draws
  the chart whenever its container first becomes measurable (replacing a
  60-frame polling budget that could silently give up on slow page boots),
  and any exception thrown mid-render now surfaces in the component's error
  state instead of leaving a silent blank card. Live-verified on a cold-cache
  Lightning boot.

### Added

- **`graphqlQuery` (Admin free-text query)** on `d3BarChart`: paste a complete
  UI API GraphQL _record_ query and the chart renders it — the replacement
  for the removed raw-SOQL escape hatch. Works with a blank Object API Name
  via response object-key auto-detection. Bounded by the platform's UI-API
  object coverage and 2,000-records-per-query cap.
- **`lightning__FlowScreen` target** on `d3BarChart` — the chart can be
  placed on Flow screens, fed by `recordCollection`.
- **`docs/conversion-recipe.md`** — the reviewed per-chart conversion recipe
  (per-family free-text normalization, meta templates, hygiene scans,
  render-orchestration hardening) used by all subsequent v3.x releases.

### Removed

- **`soqlQuery` and `fetchMode`** properties on `d3BarChart`. Raw SOQL cannot
  execute without Apex; the structured builder properties and `graphqlQuery`
  are the replacements.

### Migration

- Detach any placed `d3BarChart` instance from its Lightning pages before
  deploying (Salesforce blocks `@api` property removal while referenced);
  `scripts/deploy-property-removal.sh` sequences the detach → bundle →
  reattach deploys.
- Replace a configured `soqlQuery` with either the structured properties
  (Object API Name + fields + operation) or a pasted `graphqlQuery` record
  query.

## [2.1.0] - 2026-07-11

### Added

#### Chart components (10 — library grows 30 → 40)

- **Comparison & ranking** — `d3DotPlot` (Cleveland dot plot: one circle per
  category on a horizontal value axis), `d3SortedBarChart` (vertical bars
  re-sortable by label or value), `d3SlopeChart` (before/after comparison per
  entity as a connecting line between two ranked axes).
- **Composition** — `d3StackedHorizontalBar` (horizontal stacked or
  100%-normalized bars with series legend), `d3NormalizedBar` (vertical
  full-height bars whose segments show series composition as a percentage of
  each category's total), `d3IconArray` (pictogram / unit chart filling a
  100-glyph grid in proportion to each category).
- **Trend** — `d3StepChart` (stepped line for discrete state changes,
  multi-series), `d3VariableColorLine` (single series whose stroke color
  switches at a configurable threshold via an SVG gradient with hard-edge
  stops at each crossing), `d3BandChart` (time-series confidence interval /
  acceptable range as a filled band between a lower and upper bound, with an
  optional center line), `d3DifferenceChart` (two series — e.g. plan vs actual
  — shaded green where the primary is above the secondary and red where below,
  via the two-area clip-path technique).
- All ten support drill-down where applicable and ship with GraphQL self-fetch
  (see below).

- **GraphQL self-fetch (`fetchMode`) on every chart.** The `fetchMode` property
  (`auto` | `apex` | `graphql`, default `auto`) introduced for the bar chart in
  1.1.0 now covers all charts. The 28 remaining Apex/`recordCollection` charts
  gained the opt-in GraphQL path (declarative fetch through Salesforce's v2
  `lightning/graphql` wire adapter, no `D3ChartController` Apex class required,
  FLS/sharing enforced by the platform); the 10 new charts ship with it. `auto`
  preserves existing behavior exactly — fully backward-compatible. The gantt
  chart remains GraphQL-only (as of 2.0.0).
- **`graphqlService` multi-group support** — `buildMultiGroupQuery` (two-field
  grouped aggregate) and `normalizeMultiGroup`, enabling GraphQL self-fetch for
  multi-series charts. Added alongside `themeService` ramp/semantic helpers
  (`getRampHueForTheme`) and a shared SVG accessibility helper on `chartUtils`.
- **v2.1 showcase page** — a Lightning app page (`d3_lwc_v2_1`), plus its tab
  and custom application, demoing all 10 new charts against live Opportunity
  data.

### Changed

- Consolidated redundant unit-test cases across existing chart suites; no
  coverage loss (see the test count in Notes).
- Aligned the donut chart bundle's `apiVersion` to 65.0, required for the
  `@wire(graphql)` adapter.

### Fixed

- **Count via GraphQL on the bar and sorted-bar charts** — back-ported the
  Count-aggregation branch (from `d3DotPlot`) so `operation="Count"` works
  through the GraphQL path. GraphQL Count fetches raw rows up to the record
  limit and counts client-side, unlike Sum/Average which aggregate
  server-side; every Count-capable chart's `fetchMode` meta description now
  documents this bound (`use apex/auto for exact counts on larger objects`).
- **`d3ProgressBar`** — clamp `aria-valuenow` to `aria-valuemax` so an
  over-target value no longer reports an out-of-range ARIA value.
- **`d3SlopeChart`** — drop rows with non-numeric start/end values instead of
  coercing them to `0`, which had distorted the slope.
- **`d3StackedHorizontalBar`** — corrected a stale `ABOUTME` comment that
  referenced a nonexistent series toggle.
- Bugs surfaced and fixed during the GraphQL conversion: `d3Gauge` no longer
  renders a false zero-gauge on empty data; `d3Sankey` no longer stays
  permanently blank at zero container width; `d3BulletChart`'s unreachable
  no-data branch; `d3BarChart`'s empty `renderLegend` stub replaced with a real
  HTML legend; `d3Treemap` label-contrast bug; `d3Heatmap` now lets an explicit
  `rampHue` win over the theme; `d3CalendarHeatmap` preserves its green default
  ramp when the theme is unset.

### Notes

- **Tested** — 133 Jest suites / 3,384 tests, all green.
- **Platform** — Salesforce API version 65.0; D3.js v7 served from the `d3`
  static resource; Node.js v20 required for the Salesforce CLI / local dev
  server.
- The `fetchMode="graphql"` path covers UI API-queryable objects with structured
  filters; for non-UI-API objects or arbitrary SOQL, use `auto`/`apex` — the
  Apex escape hatch remains.

## [2.0.0] - 2026-07-01

### Changed

- **BREAKING: GraphQL self-fetch replaces the Apex path on the gantt chart**
  (`d3GanttChart`). The chart now fetches its own data declaratively through
  Salesforce's v2 `lightning/graphql` wire adapter via `graphqlService`, with
  no `D3ChartController` Apex class required. Field- and record-level security
  are enforced by the platform. Verified end-to-end against a live org (12 demo
  projects rendering through the wire adapter).

### Removed

- **`soqlQuery` and `filterClause`** properties on `d3GanttChart`. These no
  longer exist on the component. Salesforce refuses to deploy a bundle that
  drops an `@api` property still referenced by a Lightning page, so upgrading
  an in-use gantt instance requires detaching it from the page first.

### Migration

- Detach any existing `d3GanttChart` instance from its Lightning page before
  deploying this version (Salesforce blocks the deploy otherwise).
- Replace `soqlQuery` / `filterClause` configuration with `objectApiName`
  plus `labelField` / `startDateField` / `endDateField`.
- Re-add the chart to the page. No Apex controller is involved in the gantt
  chart's data path any longer.

### Notes

- This ships Approach B from `docs/graphql-prototype-comparison.md` (previously
  an unmerged prototype on the `gantt-graphql-replace` branch), contrasted there
  against the bar chart's additive Approach A shipped in v1.1.0.
- The property-removal deploy block was hit and worked around live (detach →
  deploy → re-attach); all 12 demo projects rendered correctly afterward via
  the GraphQL wire adapter.
- `agentforce-dev`'s synced copy of `d3GanttChart` still declares `soqlQuery`/
  `filterClause` and has no page placing an instance yet — re-sync it and
  hand-merge the meta.xml (matching prior sync practice) before this ships
  there too.

## [1.1.0] - 2026-06-29

### Added

- **GraphQL self-fetch for the bar chart** (`d3BarChart`). A new `fetchMode`
  property (`auto` | `apex` | `graphql`, default `auto`) lets the chart fetch its
  own data declaratively through Salesforce's v2 `lightning/graphql` wire adapter,
  with no `D3ChartController` Apex class required. Field- and record-level security
  are enforced by the platform. `auto` preserves existing behavior exactly — fully
  backward-compatible. Verified end-to-end against a live org (Opportunity Amount
  summed by Stage rendering through the wire adapter).
- **`graphqlService`** shared LWC module: dynamic GraphQL query builders (record
  and grouped-aggregate) plus result normalizers, unit-tested in isolation.

### Notes

- The `lightning/graphql` aggregate response envelope was verified against a live
  org and corrected from the documented best-guess: aggregates live under
  `uiapi.aggregate` (a sibling of `query`) with a `node.aggregate { }` wrapper
  holding the grouping key and measures.
- An alternative "replace the Apex path entirely" approach was prototyped on the
  gantt chart and is preserved on the `gantt-graphql-replace` branch. It is **not**
  shipped in this release: removing the `soqlQuery`/`filterClause` properties is a
  breaking change that fails to deploy where the chart is already in use. See
  `docs/graphql-prototype-comparison.md` for the full A-vs-B comparison.

## [1.0.0] - 2026-06-23

First stable release of the D3-LWC chart library: 30 production D3.js v7 chart
components for Salesforce, each usable in Lightning App Builder, Flows, and
Experience Builder via `recordCollection` (Flow/parent) or `soqlQuery` (Apex).

### Added

#### Chart components (30)

- **Comparison & trend** — `d3BarChart`, `d3HorizontalBarChart`, `d3StackedBarChart`,
  `d3DivergingBarChart`, `d3LollipopChart`, `d3LineChart`, `d3AreaChart`
- **Part-to-whole** — `d3PieChart`, `d3DonutChart`, `d3WaffleChart`, `d3FunnelChart`,
  `d3ProgressBar`, `d3Treemap`, `d3SunburstChart`
- **Distribution & correlation** — `d3Histogram`, `d3BoxPlot`, `d3ScatterPlot`, `d3BubbleChart`
- **KPI vs target** — `d3Gauge`, `d3BulletChart`
- **Relationships & flow** — `d3Sankey`, `d3ChordDiagram`, `d3ForceGraph`
- **Time & activity** — `d3GanttChart`, `d3CalendarHeatmap`, `d3SparklineGrid`
- **Matrix & geographic** — `d3Heatmap`, `d3Choropleth`
- **Multi-axis** — `d3RadarChart`
- **Sequential change** — `d3WaterfallChart`

#### Shared architecture

- `d3Lib` — D3.js v7 loader with singleton pattern and fetch+eval fallback for
  CSP-restricted environments.
- `dataService` — data validation, aggregation (Sum/Count/Average), and truncation
  (2,000-record client limit).
- `themeService` — four color palettes (Salesforce Standard, Warm, Cool, Vibrant)
  plus custom colors.
- `chartUtils` — number formatting, tooltips, resize handling, and layout retry.

#### Apex backend

- `D3ChartController` (`with sharing`) — four `@AuraEnabled(cacheable=true)` methods
  with FLS enforcement:
  - `executeQuery` — raw SOQL execution (auto-adds `LIMIT 2000`).
  - `getAggregatedData` — server-side `GROUP BY` aggregation (limit 200 groups).
  - `getStatistics` — server-side count, min, max, mean, median, population stdDev.
  - `getCorrelation` — server-side Pearson r, regression slope, and intercept.

### Notes

- **Tested** — 61 Jest suites / 2,561 tests (unit, integration, and e2e tiers per
  component), all green.
- **Platform** — Salesforce API version 65.0; D3.js v7 served from the `d3` static
  resource; Node.js v20 required for the Salesforce CLI / local dev server.
- **Continuous integration** — GitHub Actions runs the full Jest suite on every push
  and pull request.

[1.0.0]: https://github.com/weytani/d3-lwc/releases/tag/v1.0.0
