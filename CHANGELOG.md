# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.0] - 2026-08-03

Wave 4 closes with the difference chart, which joins the diverging bar chart, the dot plot, the
slope chart, and the band chart on showcase page 3. **21 of 40 charts are now converted.**

### Changed

- **BREAKING: `d3DifferenceChartGraphql` is now a standalone GraphQL-only bundle**, converted per
  `docs/conversion-recipe.md` and renamed from `d3DifferenceChart` to its `*Graphql` suffixed
  identity (tag `c-d3-difference-chart-graphql`, masterLabel "D3 Difference Chart (GraphQL)"):
  GraphQL wire self-fetch only, bundle-local support modules (`d3Loader.js`, `theme.js`,
  `data.js`, `utils.js`, `graphql.js`), no shared `c/` imports, no Apex. `soqlQuery` and
  `fetchMode` removed; `graphqlQuery` free-text record queries added. Like the band chart it is a
  date-axis chart with **no server-side aggregate path** (recipe §9.2): both the structured builder
  and the free-text override fetch raw records projecting the Date, Primary, and Secondary fields,
  then sort by date and shape one difference point per record — the same path `recordCollection`
  already took. Ships with the full unit + integration + graphql + e2e test tiers. Live-verified
  on-org via the Playwright sweep (48 `[D3DEMO]` opportunities comparing `Amount` against
  `ExpectedRevenue` across ten months of `CloseDate`).

### Fixed

- **`d3DifferenceChartGraphql`: container-rebind hardening (recipe §4.3).** The template's
  if/elseif chain destroys the `.chart-container` on every pass through loading/error/no-data, so
  the previous existence-only guards left the tooltip writing into a detached node and the
  ResizeObserver watching a dead element after a data → error → data cycle. `initializeChart` now
  tracks the container generation it is bound to and cleans up and re-creates both when the
  container identity changes. Fifth and final wave-4 bundle to ship the fix, after
  `d3DivergingBarChartGraphql`, `d3DotPlotGraphql`, `d3SlopeChartGraphql`, and
  `d3BandChartGraphql`; the 16 v1.0.0 bundles still carry the defect (issue #2).
- **`d3DifferenceChartGraphql`: `filterClause` removed as dead surface.** The property and its
  `applyFilterClause(this.soqlQuery, …)` call site only ever spliced a `WHERE` fragment into a raw
  SOQL string. With `soqlQuery` gone there is nothing for it to modify, so keeping it would have
  advertised a filter that silently did nothing on every remaining fetch path. Scoping on the
  GraphQL paths belongs in the query's own `where` (free-text) or in `graphqlFilter` (structured).
- **`d3DifferenceChartGraphql`: `recordLimit` meta max capped at 2,000**, the UI API record-query
  ceiling (recipe §5). The previous 10,000 advertised a bound the only remaining fetch path
  rejects.
- **`d3DifferenceChartGraphql`: FlowScreen `theme` gains the picklist datasource** the App Builder
  config already carried, so both targets offer the same four themes instead of a free-text box.
  (As with the band chart, this bundle already targeted `lightning__FlowScreen` before conversion —
  only the datasource parity is new.)

### Added

- **Showcase page 3 gains the difference chart** — `Amount` (actual) against `ExpectedRevenue`
  (expected) across `CloseDate`, with the gap between the two series shaded. Its component instance
  uses the same free-text `graphqlQuery` `where` idiom the page was established with, so it reads
  only `[D3DEMO]` seeded Opportunities and the committed Playwright baseline contains only
  synthetic demo data. Because this chart plots one point per record rather than one mark per
  group, the instance pins `first: 48` and an explicit `orderBy: { CloseDate: { order: ASC } }`:
  the `first` argument is what bounds the point count, and the ordering keeps the selected records
  — and therefore the committed baseline — stable across runs. The 48 seeded rows carry 48 distinct
  `CloseDate` values, so the chart gets exactly one point per date with no vertical spikes.
- **Only the positive (green) difference fill is exercised by the seeded data**, and the instance
  records why. `ExpectedRevenue` is derived as `Amount × Probability`, so it is ≤ `Amount` on every
  seeded row — 43 rows above and 5 exactly equal, none below — leaving the negative (red) clipped
  region unrendered. No alternative pairing fixes this: `Amount`'s seeded minimum (110,732) exceeds
  the maximum of every other numeric field on the demo Opportunities (`Quota_Variance__c` 48,277,
  `Forecast_Units__c` 4,944, `Probability` 100), so no field pair on this org crosses. The
  crossing-fill render path is covered by the bundle's unit tests instead, and the sibling
  `d3-lwc-soql` difference instance carries the identical mapping. Demonstrating both fills live
  needs a seeder change rather than a config change.

## [1.4.0] - 2026-08-03

Wave 4 reaches its first date-axis chart: the band chart, which joins the diverging bar chart, the
dot plot, and the slope chart on showcase page 3.

### Changed

- **BREAKING: `d3BandChartGraphql` is now a standalone GraphQL-only bundle**, converted per
  `docs/conversion-recipe.md` and renamed from `d3BandChart` to its `*Graphql` suffixed identity
  (tag `c-d3-band-chart-graphql`, masterLabel "D3 Band Chart (GraphQL)"): GraphQL wire self-fetch
  only, bundle-local support modules (`d3Loader.js`, `theme.js`, `data.js`, `utils.js`,
  `graphql.js`), no shared `c/` imports, no Apex. `soqlQuery` and `fetchMode` removed;
  `graphqlQuery` free-text record queries added. Like the slope chart it has **no server-side
  aggregate path** (recipe §9.2), but along a date axis: both the structured builder and the
  free-text override fetch raw records projecting the Date, Lower Bound, Upper Bound, and optional
  Center Line fields, then sort by date and shape one band point per record — the same path
  `recordCollection` already took. Ships with the full unit + integration + graphql + e2e test
  tiers. Live-verified on-org via the Playwright sweep (48 `[D3DEMO]` opportunities banding
  `Amount` against `ExpectedRevenue` across ten months of `CloseDate`).

### Fixed

- **`d3BandChartGraphql`: container-rebind hardening (recipe §4.3).** The template's if/elseif
  chain destroys the `.chart-container` on every pass through loading/error/no-data, so the
  previous existence-only guards left the tooltip writing into a detached node and the
  ResizeObserver watching a dead element after a data → error → data cycle. `initializeChart` now
  tracks the container generation it is bound to and cleans up and re-creates both when the
  container identity changes. Fourth bundle to ship the fix, after `d3DivergingBarChartGraphql`,
  `d3DotPlotGraphql`, and `d3SlopeChartGraphql`; the 16 v1.0.0 bundles still carry the defect
  (issue #2).
- **`d3BandChartGraphql`: `filterClause` removed as dead surface.** The property and its
  `applyFilterClause(this.soqlQuery, …)` call site only ever spliced a `WHERE` fragment into a
  raw SOQL string. With `soqlQuery` gone there is nothing for it to modify, so keeping it would
  have advertised a filter that silently did nothing on every remaining fetch path. Scoping on the
  GraphQL paths belongs in the query's own `where` (free-text) or in `graphqlFilter` (structured).
- **`d3BandChartGraphql`: `recordLimit` meta max capped at 2,000**, the UI API record-query
  ceiling (recipe §5). The previous 10,000 advertised a bound the only remaining fetch path
  rejects.
- **`d3BandChartGraphql`: `graphqlQuery` footgun wording corrected for band semantics.** The two
  failure modes differ by field and needed saying separately: a row missing the Date Field is
  dropped outright (the date parser returns null before the row is kept), whereas a row missing a
  bound field is _kept_ with that bound coerced to 0, so an under-projected query flattens the
  band against the axis rather than erroring or drawing fewer points. The property description now
  states both.
- **`d3BandChartGraphql`: FlowScreen `theme` gains the picklist datasource** the App Builder
  config already carried, so both targets offer the same four themes instead of a free-text box.
  (Unlike the other wave-4 charts, this bundle already targeted `lightning__FlowScreen` before
  conversion — only the datasource parity is new.)

### Added

- **Showcase page 3 gains the band chart** — `Amount` to `ExpectedRevenue` per opportunity across
  `CloseDate`. Its component instance uses the same free-text `graphqlQuery` `where` idiom the page
  was established with, so it reads only `[D3DEMO]` seeded Opportunities and the committed
  Playwright baseline contains only synthetic demo data. Because this chart plots one point per
  record rather than one mark per group, the instance pins `first: 48` and an explicit
  `orderBy: { CloseDate: { order: ASC } }`: the `first` argument is what bounds the point count,
  and the ordering keeps the selected records — and therefore the committed baseline — stable
  across runs. The 48 seeded rows carry 48 distinct `CloseDate` values, so the band gets exactly
  one point per date with no vertical spikes.
- The instance deliberately leaves the optional **Center Line Field (`valueField`) unset**. No
  numeric field seeded on the demo Opportunities shares the band's currency scale —
  `Forecast_Units__c` spans 81–4,944 and `Quota_Variance__c` −51,159–48,277 against a band running
  0–513,099, `Probability` is a 0–100 percent, and `TotalOpportunityQuantity` is null on every row
  — so any of them would render as a flat trace pinned to the axis rather than a center line
  within the band. The center-line path is covered instead by the bundle's unit tests, and the
  sibling `d3-lwc-soql` band instance leaves the property unset for the same reason.

## [1.3.0] - 2026-08-03

Wave 4 reaches its first raw-record chart: the slope chart, which joins the diverging bar chart
and the dot plot on showcase page 3.

### Changed

- **BREAKING: `d3SlopeChartGraphql` is now a standalone GraphQL-only bundle**, converted per
  `docs/conversion-recipe.md` and renamed from `d3SlopeChart` to its `*Graphql` suffixed identity
  (tag `c-d3-slope-chart-graphql`, masterLabel "D3 Slope Chart (GraphQL)"): GraphQL wire
  self-fetch only, bundle-local support modules (`d3Loader.js`, `theme.js`, `data.js`, `utils.js`,
  `graphql.js`), no shared `c/` imports, no Apex. `soqlQuery` and `fetchMode` removed;
  `graphqlQuery` free-text record queries and the `lightning__FlowScreen` target added. Unlike the
  wave's aggregate charts it has **no server-side aggregate path** (recipe §9.2): both the
  structured builder and the free-text override fetch raw records projecting the Entity, Start
  Value, and End Value fields, then shape one connecting line per record — the same path
  `recordCollection` already took. Ships with the full unit + integration + graphql + e2e test
  tiers. Live-verified on-org via the Playwright sweep (12 `[D3DEMO]` opportunities sloping
  `Amount` → `ExpectedRevenue`).

### Fixed

- **`d3SlopeChartGraphql`: container-rebind hardening (recipe §4.3).** The template's if/elseif
  chain destroys the `.chart-container` on every pass through loading/error/no-data, so the
  previous existence-only guards left the tooltip writing into a detached node and the
  ResizeObserver watching a dead element after a data → error → data cycle. `initializeChart` now
  tracks the container generation it is bound to and cleans up and re-creates both when the
  container identity changes. Third bundle to ship the fix, after `d3DivergingBarChartGraphql` and
  `d3DotPlotGraphql`; the 16 v1.0.0 bundles still carry the defect (issue #2).
- **`d3SlopeChartGraphql`: `recordLimit` meta max capped at 2,000**, the UI API record-query
  ceiling (recipe §5). The previous 10,000 advertised a bound the only remaining fetch path
  rejects.
- **`d3SlopeChartGraphql`: `graphqlQuery` footgun wording corrected for raw-record semantics.**
  The aggregate charts warn that a missing value field makes marks aggregate to zero; that is the
  wrong failure mode here. A slope row missing its entity, start, or end value is dropped before
  numeric coercion, so an under-projected query renders _fewer lines_ than expected — or reports
  no data if every row is dropped — rather than drawing a false slope to zero. The property
  description now says so.
- **`d3SlopeChartGraphql`: FlowScreen `theme` gains the picklist datasource** the App Builder
  config already carried, so both targets offer the same four themes instead of a free-text box.

### Added

- **Showcase page 3 gains the slope chart** — `Amount` → `ExpectedRevenue` per opportunity. Its
  component instance uses the same free-text `graphqlQuery` `where` idiom the page was established
  with, so it reads only `[D3DEMO]` seeded Opportunities and the committed Playwright baseline
  contains only synthetic demo data. Because this chart draws one line per record rather than one
  mark per group, the instance also pins `first: 12` and an explicit `orderBy` in the query: the
  `first` argument is what bounds the line count, and the ordering keeps the selected records —
  and therefore the committed baseline — stable across runs.

## [1.2.0] - 2026-08-03

Wave 4 continues through the categorical/comparison family with the Cleveland dot plot, which
joins the diverging bar chart on showcase page 3.

### Changed

- **BREAKING: `d3DotPlotGraphql` is now a standalone GraphQL-only bundle**, converted per
  `docs/conversion-recipe.md` and renamed from `d3DotPlot` to its `*Graphql` suffixed identity
  (tag `c-d3-dot-plot-graphql`, masterLabel "D3 Dot Plot (GraphQL)"): GraphQL wire self-fetch
  only, bundle-local support modules (`d3Loader.js`, `theme.js`, `data.js`, `utils.js`,
  `graphql.js`), no shared `c/` imports, no Apex. `soqlQuery` and `fetchMode` removed;
  `graphqlQuery` free-text record queries and the `lightning__FlowScreen` target added. As a
  single-value-per-category chart it routes Sum and Average through the GraphQL grouped-aggregate
  path and Count through a raw record query aggregated client-side, so every fetch path lands on
  the same one-dot-per-category shape. Ships with the full unit + integration + graphql + e2e
  test tiers. Live-verified on-org via the Playwright sweep (9 opportunity stages sized by
  `[D3DEMO]` amount sums).

### Fixed

- **`d3DotPlotGraphql`: container-rebind hardening (recipe §4.3).** The template's if/elseif chain
  destroys the `.chart-container` on every pass through loading/error/no-data, so the previous
  existence-only guards left the tooltip writing into a detached node and the ResizeObserver
  watching a dead element after a data → error → data cycle. `initializeChart` now tracks the
  container generation it is bound to and cleans up and re-creates both when the container
  identity changes. Second bundle to ship the fix, after `d3DivergingBarChartGraphql`; the 16
  v1.0.0 bundles still carry the defect (issue #2).
- **`d3DotPlotGraphql`: `recordLimit` meta max capped at 2,000**, the UI API record-query ceiling
  (recipe §5). The previous 10,000 advertised a bound the only remaining fetch path rejects.

### Added

- **Showcase page 3 gains the dot plot** — total amount by opportunity stage. Its component
  instance uses the same free-text `graphqlQuery` `where` idiom the page was established with, so
  it aggregates only `[D3DEMO]` seeded Opportunities and the committed Playwright baseline
  contains only synthetic demo data.

## [1.1.0] - 2026-08-03

First wave-4 release: the categorical/comparison family opens with the diverging bar chart, and
the org gains a third showcase page.

### Changed

- **BREAKING: `d3DivergingBarChartGraphql` is now a standalone GraphQL-only bundle**, converted
  per `docs/conversion-recipe.md` and renamed from `d3DivergingBarChart` to its `*Graphql`
  suffixed identity (tag `c-d3-diverging-bar-chart-graphql`, masterLabel
  "D3 Diverging Bar Chart (GraphQL)"): GraphQL wire self-fetch only, bundle-local support
  modules (`d3Loader.js`, `theme.js`, `data.js`, `utils.js`, `graphql.js`), no shared `c/`
  imports, no Apex. `soqlQuery` and `fetchMode` removed; `graphqlQuery` free-text record
  queries and the `lightning__FlowScreen` target added. As a signed-value chart it routes Sum
  and Average through the GraphQL grouped-aggregate path and Count through a raw record query
  aggregated client-side, so negative aggregates survive every fetch path and extend left of
  the zero baseline. Ships with the full unit + integration + graphql + e2e test tiers.
  Live-verified on-org via the Playwright sweep (7 lead sources, 4 positive and 3 negative,
  from `[D3DEMO]` quota-variance data).

### Fixed

- **`d3DivergingBarChartGraphql`: container-rebind hardening (recipe §4.3).** The template's
  if/elseif chain destroys the `.chart-container` on every pass through loading/error/no-data,
  so the previous existence-only guards left the tooltip writing into a detached node and the
  ResizeObserver watching a dead element after a data → error → data cycle. `initializeChart`
  now tracks the container generation it is bound to and cleans up and re-creates both when the
  container identity changes. This bundle is the first to ship the fix; the 16 v1.0.0 bundles
  still carry the defect (issue #2).
- **`d3DivergingBarChartGraphql`: `recordLimit` meta max capped at 2,000**, the UI API
  record-query ceiling (recipe §5). The previous 10,000 advertised a bound the only remaining
  fetch path rejects.

### Added

- **Showcase page 3** (`d3_graphql_showcase_3` FlexiPage + CustomTab, granted by the
  `D3_Graphql_Showcase` permission set) debuts on AGENT carrying the diverging bar chart —
  quota variance by lead source. The remaining wave-4 charts append to this page as they ship.
  Its component instance scopes itself to `[D3DEMO]` seeded Opportunities with a free-text
  `graphqlQuery` `where` clause, so the committed Playwright baseline contains only synthetic
  demo data.

## [1.0.0] - 2026-08-02

Closes the v1.0.0 consolidation gate. Repo split from `weytani/d3-lwc` (now archived) at the
`v3-standalone` tip; this repo's own semver line starts here. Inherited tags are preserved as
`legacy/v*`:

| Legacy tag                      | Meaning                                                         |
| ------------------------------- | --------------------------------------------------------------- |
| `legacy/v1.0.0`                 | d3-lwc 30-chart hybrid release                                  |
| `legacy/v1.1.0`                 | GraphQL self-fetch added to bar (fetchMode)                     |
| `legacy/v2.0.0`                 | gantt GraphQL-only (first breaking release)                     |
| `legacy/v2.1.0`                 | 40 charts, hybrid fetchMode — d3-lwc-soql fork point            |
| `legacy/v3.0.0`–`legacy/v3.9.0` | per-chart standalone conversions — the line this repo continues |

### Changed

- **BREAKING: repo-wide `*Graphql` suffix rename — all 16 previously-converted charts.**
  Every chart converted under the pre-split v3 line (`d3BarChart` → `d3BarChartGraphql`,
  `d3SortedBarChart` → `d3SortedBarChartGraphql`, `d3HorizontalBarChart` →
  `d3HorizontalBarChartGraphql`, `d3StackedBarChart` → `d3StackedBarChartGraphql`,
  `d3StackedHorizontalBar` → `d3StackedHorizontalBarGraphql`, `d3NormalizedBar` →
  `d3NormalizedBarGraphql`, `d3LineChart` → `d3LineChartGraphql`, `d3AreaChart` →
  `d3AreaChartGraphql`, `d3StepChart` → `d3StepChartGraphql`, `d3VariableColorLine` →
  `d3VariableColorLineGraphql`, plus the six below) is renamed: folder + exported class gain
  the `Graphql` suffix, the component tag gains a `-graphql` suffix (e.g. `c-d3-bar-chart` →
  `c-d3-bar-chart-graphql`), and `masterLabel` gains ` (GraphQL)` (e.g.
  "Bar Chart (GraphQL)"). This lets this line's components coexist on the same org as the
  sibling `d3-lwc-soql` line's `*Soql`-suffixed equivalents and any remaining unsuffixed
  legacy instances, without name collisions. Suffixed components are **new bundles** — no
  existing placed component's property surface was edited by this rename, so the detach →
  deploy → reattach property-removal dance did not apply.

- **BREAKING: `d3SparklineGridGraphql` is now a standalone GraphQL-only bundle**, converted
  per the v3 recipe (see legacy `3.0.0`) and shipped directly under its `*Graphql` suffixed
  identity (no prior unsuffixed release existed): GraphQL wire self-fetch only, bundle-local
  support modules, no shared `c/` imports, no Apex. `soqlQuery` and `fetchMode` removed;
  `graphqlQuery` free-text record queries and the `lightning__FlowScreen` target added;
  render-orchestration hardening applied. As a small-multiples chart (one inline sparkline per
  entity, monthly rollup) it shapes and buckets dates with its own parser on every data path —
  the TZ-sensitive month-bucketing regression this chart is named for in `jest.config.js` is
  guarded by the pinned `America/New_York` test timezone. Ships with the full unit +
  integration + graphql + e2e test tiers. Live-verified on-org via the v1.0.0 Playwright sweep
  (4 sparkline rows grouped by the demo `Type` field).

- **BREAKING: `d3PieChartGraphql` is now a standalone GraphQL-only bundle**, converted per the
  v3 recipe (see legacy `3.0.0`) and shipped directly under its `*Graphql` suffixed identity:
  GraphQL wire self-fetch only, bundle-local support modules, no shared `c/` imports, no Apex.
  `soqlQuery` and `fetchMode` removed; `graphqlQuery` free-text record queries and the
  `lightning__FlowScreen` target added; render-orchestration hardening applied. As a
  single-field aggregation chart it routes Sum/Average/Count through the same
  structured-vs-free-text-vs-recordCollection pipeline as the bar family. Ships with the full
  unit + integration + graphql + e2e test tiers. Live-verified on-org via the v1.0.0
  Playwright sweep (10 wedges grouped by StageName, percentages summing to 100%).

- **BREAKING: `d3DonutChartGraphql` is now a standalone GraphQL-only bundle**, converted per
  the v3 recipe (see legacy `3.0.0`) and shipped directly under its `*Graphql` suffixed
  identity: GraphQL wire self-fetch only, bundle-local support modules, no shared `c/`
  imports, no Apex. `soqlQuery` and `fetchMode` removed; `graphqlQuery` free-text record
  queries and the `lightning__FlowScreen` target added; render-orchestration hardening
  applied. Same single-field aggregation family as the pie chart, with its center-total label
  and configurable inner-radius ratio preserved through the conversion. Ships with the full
  unit + integration + graphql + e2e test tiers. Live-verified on-org via the v1.0.0
  Playwright sweep (4 segments grouped by the demo `Type` field, center total rendered).

- **BREAKING: `d3LollipopChartGraphql` is now a standalone GraphQL-only bundle**, converted
  per the v3 recipe (see legacy `3.0.0`) and shipped directly under its `*Graphql` suffixed
  identity: GraphQL wire self-fetch only, bundle-local support modules, no shared `c/`
  imports, no Apex. `soqlQuery` and `fetchMode` removed; `graphqlQuery` free-text record
  queries and the `lightning__FlowScreen` target added; render-orchestration hardening
  applied. Same single-field aggregation family as the bar chart (stem + circle rendering in
  place of a rect). Ships with the full unit + integration + graphql + e2e test tiers.
  Live-verified on-org via the v1.0.0 Playwright sweep (10 lollipops, same StageName grouping
  as the bar family).

- **BREAKING: `d3FunnelChartGraphql` is now a standalone GraphQL-only bundle**, converted per
  the v3 recipe (see legacy `3.0.0`) and shipped directly under its `*Graphql` suffixed
  identity: GraphQL wire self-fetch only, bundle-local support modules, no shared `c/`
  imports, no Apex. `soqlQuery` and `fetchMode` removed; `graphqlQuery` free-text record
  queries and the `lightning__FlowScreen` target added; render-orchestration hardening
  applied. As an ordered-stage aggregation chart it preserves stage-progression ordering and
  drop-off/conversion-percentage math through every data path. Ships with the full unit +
  integration + graphql + e2e test tiers (the e2e tier was a backfill, see below). Live-
  verified on-org via the v1.0.0 Playwright sweep (10 funnel segments with counts and a
  conversion-percentage column, StageName grouping).

- **BREAKING: `d3WaffleChartGraphql` is now a standalone GraphQL-only bundle**, converted per
  the v3 recipe (see legacy `3.0.0`) and shipped directly under its `*Graphql` suffixed
  identity: GraphQL wire self-fetch only, bundle-local support modules, no shared `c/`
  imports, no Apex. `soqlQuery` and `fetchMode` removed; `graphqlQuery` free-text record
  queries and the `lightning__FlowScreen` target added; render-orchestration hardening
  applied. As a percentage-grid chart its contrast-aware cell labeling (WCAG luminance-based
  black/white choice) is preserved verbatim through the conversion. Ships with the full unit +
  integration + graphql + e2e test tiers. Live-verified on-org via the v1.0.0 Playwright sweep
  (10×11 cell grid grouped by StageName, percentage legend).

### Added

- **Three test-tier backfills**, closing the known 2-tier gaps carried from earlier waves:
  - `d3LineChartGraphql` — integration (11 tests) + e2e (7 tests) tiers, donor
    `d3AreaChartGraphql` for the pipeline shape, `d3VariableColorLineGraphql` for the e2e
    D3-load-failure console-error-spy pattern (139 suites / 3,485 tests after this backfill).
  - `d3StackedBarChartGraphql` — integration (8 tests) + e2e (8 tests) tiers, donor
    `d3StackedHorizontalBarGraphql` (`aggregateSeriesData` + `d3.stack` pipeline) (141 suites /
    3,501 tests after this backfill).
  - `d3FunnelChartGraphql` — e2e tier only (7 tests; unit/integration/graphql tiers already
    existed), donor `d3PieChartGraphql` (142 suites / 3,508 tests after this backfill — the
    full suite as of this release).
- **`d3_graphql_showcase_1`/`_2`** Lightning app pages + tabs, demoing the 16 converted charts
  against live `[D3DEMO]`-seeded Opportunity data (showcase_1 = the 8 wave-A charts,
  showcase_2 = the 8 wave-B charts). Retires the 5 legacy `d3_lwc*`/`d3_graphql_test`
  flexipage files, which referenced pre-rename component names no longer present in this
  repo (the org's copies of those pages retire separately, in a joint cleanup with the
  `d3-lwc-soql` line).
- **`D3_Graphql_Showcase` permission set** — grants `tabSettings` visibility for both showcase
  tabs. Deploying `CustomTab` metadata alone does not grant Profile/Permission Set visibility,
  so without this the showcase tabs 404 with a generic "Page doesn't exist" shell even though
  the CustomTab and FlexiPage both deployed correctly — assign with
  `sf org assign permset -n D3_Graphql_Showcase -o AGENT`.
- **Playwright live-org sweep rig** (`playwright/`) — a local-only release gate (never CI; this
  is a public repo, no org credentials in GitHub Actions) that authenticates via a fresh
  `sf org open -o AGENT --url-only --json` frontdoor URL, walks both showcase pages, and
  asserts per chart: real SVG marks rendered (floor count), zero console errors, and a
  pixel-diff against a committed baseline PNG.
- **16-chart baseline set** (`playwright/chart-sweep.spec.js-snapshots/`) — one committed PNG
  per chart per showcase page, `[D3DEMO]`-seeded synthetic Opportunity data only, manually
  eyeballed before commit. `npm run test:e2e:live` runs clean against these baselines: zero
  console errors, all 16 charts rendering real marks, both showcase pages green.

### Migration

- Replace any legacy unsuffixed component instance (`c-d3-bar-chart`, etc.) with its
  `(GraphQL)`-labeled suffixed replacement (`c-d3-bar-chart-graphql`, etc.) — same property
  surface as the chart's most recent pre-suffix conversion, plus `graphqlQuery`. The legacy
  unsuffixed org artifacts (bundles and `d3_lwc*` pages) are not removed by this release; they
  retire in a later joint cleanup alongside the `d3-lwc-soql` line's own suffixed rollout.
- For the six charts converted for the first time in this release (sparklineGrid, pie, donut,
  lollipop, funnel, waffle), replace a configured `soqlQuery` with either the structured
  properties (Object API Name + fields + operation) or a pasted `graphqlQuery` record query —
  same pattern as every prior v3 conversion (see legacy `3.0.0`).

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
