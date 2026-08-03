# d3-lwc-graphql

In this repo the agent is **GRAPH GRAVEDIGGER** and David is **Bigg DR NODEZILLA**.

Split 2026-08-02 from `weytani/d3-lwc` (now archived) at the `v3-standalone` tip; inherited
release tags live under `legacy/*`. Sibling repo: `weytani/d3-lwc-soql` (shared-module
Apex/SOQL line). Development happens on `main`; other inherited branches are inert history.

**What this repo is:** every chart becomes a fully standalone GraphQL-only LWC bundle —
self-fetches via the `lightning/graphql` wire, no Apex, no shared `c/` modules; the only
dependency is the `d3` static resource. 21/40 charts are converted (bar, sortedBar,
horizontalBar, stackedBar, stackedHorizontalBar, normalizedBar, line, area, step,
variableColorLine, sparklineGrid, pie, donut, lollipop, funnel, waffle, divergingBar, dotPlot,
slope, band, difference). v1.0.0 closed the consolidation gate and wave 4 shipped as
v1.1.0–v1.5.0; the remaining 19 convert in waves 5–8; the final purge release deletes the
shared modules and all Apex.

- Program of record: `docs/superpowers/specs/2026-08-02-repo-split-soql-graphql-design.md`
- Per-chart conversion recipe: `docs/conversion-recipe.md`

---

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repo's whole job is one architecture: convert every D3 chart into a fully standalone,
GraphQL-only Lightning Web Component. A converted chart self-fetches its own data over the
`lightning/graphql` wire adapter (FLS/sharing enforced by the platform) or renders a
`recordCollection` passed in from a Flow/parent — there is no Apex controller and no shared
`c/` module in its data path. 21/40 charts are converted as of v1.5.0; the other 19 still sit
in this repo pre-conversion (shared-module Apex/SOQL architecture, documented in
`docs/ARCHITECTURE.md`/`docs/ADMIN-GUIDE.md`) until their wave lands.

## Suffix naming convention

Every converted chart is renamed with the `Graphql` suffix at conversion time (v1.0.0
amendment — see the design spec's "Amendment 2026-08-02"):

- Folder + exported class: `d3XxxGraphql` (e.g. `d3BarChartGraphql`, class `D3BarChartGraphql`)
- Component tag: `c-d3-xxx-graphql` (e.g. `c-d3-bar-chart-graphql`)
- `.js-meta.xml` `<masterLabel>` gains ` (GraphQL)` (e.g. `Bar Chart (GraphQL)`), so App
  Builder/Flow pickers disambiguate it from any unsuffixed legacy instance still on the org.

**Rename-completeness gate**, run after renaming any chart: `grep -rn "<oldName>" force-app/main/default/lwc/<newName>/ | grep -v "<newName>"` must be empty, and the same check for the old kebab-case tag against the new one. Suffixed components are **new bundles** — this is why the old detach → deploy → reattach property-removal dance (below) no longer applies to conversions: nothing is edited in place.

## Standalone-bundle anatomy

A converted bundle's folder + the `d3` static resource is everything it needs. Its support
code — a D3 loader, theme palette, data helpers, formatters, and GraphQL query builder — is
inlined bundle-local (`d3Loader.js`, `theme.js`, `data.js`, `utils.js`, `graphql.js` inside
the chart's own folder), not imported from a shared module. Copy the bundle folder plus the
`d3` static resource into any org and it works standalone.

`@api` surface on a converted chart: `recordCollection` (still wins over any self-fetch),
field mappings, `objectApiName` for the structured self-fetch, `graphqlQuery` (free-text
`uiapi.query` override — the replacement for the old raw-SOQL escape hatch), `height`,
`theme`, `advancedConfig`. No `soqlQuery`, no `fetchMode` — those only exist on the 19
charts not yet converted.

## Never-deploy list

This line **never** deploys, from any command run in this repo:

- The shared LWC modules (`c/d3Lib`, `c/dataService`, `c/themeService`, `c/chartUtils`,
  `c/graphqlService`) — they're frozen copies serving only the in-repo unconverted charts and
  die at the purge release (below); they belong to the `d3-lwc-soql` sibling line.
- Apex (`D3ChartController` + its test class) — same reason.
- Any unconverted chart bundle.
- The `d3` static resource — it already exists on AGENT; this line never redeploys it.

Org deploys always name the exact suffixed bundles / `d3_graphql_*` pages/tabs with `-m`,
never `--source-dir force-app/main/default/lwc` wholesale.

## Commands

```bash
npm test                                        # Run all unit tests (jest, jsdom)
# NOTE: --testPathPattern does NOT narrow in this jest config — it runs the FULL
# suite regardless. There is no per-component narrowing flag; just run `npm test`
# (142 suites / 3,543 tests, fast). lint-staged runs the relevant tests on commit.
# To watch just one bundle while iterating: npx jest force-app/main/default/lwc/<bundle>
npm run test:unit:watch                         # Watch mode
npm run test:unit:coverage                      # With coverage report
npm run lint                                    # ESLint (see gotcha below)
npm run prettier                                # Format all files (whole repo — see gotcha below)
npm run prettier:verify                         # Check formatting

# Deploy the 21 converted bundles to AGENT — bundles first, then pages/tabs (pages
# reference the bundles). Node 20 required for every sf command.
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
sf project deploy start -o AGENT \
  -m "LightningComponentBundle:d3BarChartGraphql" -m "LightningComponentBundle:d3SortedBarChartGraphql" \
  -m "LightningComponentBundle:d3HorizontalBarChartGraphql" -m "LightningComponentBundle:d3StackedBarChartGraphql" \
  -m "LightningComponentBundle:d3StackedHorizontalBarGraphql" -m "LightningComponentBundle:d3NormalizedBarGraphql" \
  -m "LightningComponentBundle:d3LineChartGraphql" -m "LightningComponentBundle:d3AreaChartGraphql" \
  -m "LightningComponentBundle:d3StepChartGraphql" -m "LightningComponentBundle:d3VariableColorLineGraphql" \
  -m "LightningComponentBundle:d3SparklineGridGraphql" -m "LightningComponentBundle:d3PieChartGraphql" \
  -m "LightningComponentBundle:d3DonutChartGraphql" -m "LightningComponentBundle:d3LollipopChartGraphql" \
  -m "LightningComponentBundle:d3FunnelChartGraphql" -m "LightningComponentBundle:d3WaffleChartGraphql" \
  -m "LightningComponentBundle:d3DivergingBarChartGraphql" -m "LightningComponentBundle:d3DotPlotGraphql" \
  -m "LightningComponentBundle:d3SlopeChartGraphql" -m "LightningComponentBundle:d3BandChartGraphql" \
  -m "LightningComponentBundle:d3DifferenceChartGraphql"
sf project deploy start -o AGENT \
  -m "FlexiPage:d3_graphql_showcase_1" -m "FlexiPage:d3_graphql_showcase_2" \
  -m "FlexiPage:d3_graphql_showcase_3" \
  -m "CustomTab:d3_graphql_showcase_1" -m "CustomTab:d3_graphql_showcase_2" \
  -m "CustomTab:d3_graphql_showcase_3"

# Grant the showcase tabs (deploying the CustomTab metadata does NOT grant Profile/
# Permission Set visibility on its own — see gotcha below)
sf org assign permset -n D3_Graphql_Showcase -o AGENT

# Local-only live-org QA gate (never runs in CI) — see playwright/ below
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
npm run test:e2e:live
```

Pre-commit hook (husky + lint-staged) auto-runs Prettier, ESLint, and related Jest tests on staged files.

## QA: two tiers

1. **Jest** (`npm test`, CI-enforced on every push/PR) — unit/integration/e2e tiers per
   bundle, jsdom, mocked `lightning/graphql` wire. `jest.config.js` pins `TZ=America/New_York`
   (several charts bucket date-only fields at UTC midnight; a negative-UTC-offset zone is
   required for date-bucketing regressions to actually fail under a bug); `testPathIgnorePatterns`
   excludes `playwright/` since its `*.spec.js` files need the Playwright runner, not jest.
2. **Playwright live-org sweep** (`npm run test:e2e:live`, local only, never CI — public repo,
   no org credentials in GitHub Actions) — walks all three `d3_graphql_showcase_*` pages on
   AGENT (21 charts, one committed baseline each), asserts real SVG marks rendered (floor
   count, not exact, polled so a slow first paint after a fresh deploy can't red a healthy
   chart), zero console errors, and a
   pixel-diff against a committed baseline PNG per chart (`playwright/chart-sweep.spec.js-snapshots/`,
   `[D3DEMO]`-seeded synthetic Opportunity data only — never real records). Auth is a fresh
   `sf org open -o AGENT --url-only --json` frontdoor URL turned into a saved `storageState`
   by `playwright/global-setup.js` on every run (`playwright/.auth/` is git-ignored); requires
   `export PATH="/opt/homebrew/opt/node@20/bin:$PATH"` so the `sf` spawn works.

**Showcase-page scoping convention.** Page 3 instances scope themselves to the `[D3DEMO]`
seeded rows with a free-text `graphqlQuery` whose `where` carries `Name: { like: "[D3DEMO]%" }`,
so a baseline can't drift when unrelated Opportunity data lands on the org. Pages 1–2 predate
the convention and are unscoped — a known item to fix when their instances are next touched.

## 21/40 status + roadmap

**Converted (21):** bar, sortedBar, horizontalBar, stackedBar, stackedHorizontalBar,
normalizedBar, line, area, step, variableColorLine, sparklineGrid, pie, donut, lollipop,
funnel, waffle (v1.0.0) + divergingBar, dotPlot, slope, band, difference (wave 4, one minor
release each: v1.1.0–v1.5.0) — every one renamed to its `*Graphql` suffix, all three-plus jest
tiers, live-verified on AGENT via the Playwright sweep.

The five wave-4 bundles each carry the recipe §4.3 container-rebind hardening (tooltip +
resize observer re-acquired after an error→recovery re-render) that the 16 v1.0.0 bundles
lack; backporting it to those 16 is tracked as issue #2.

**Not yet converted (19):** everything else in `force-app/main/default/lwc/` without the
suffix — still on the shared-module Apex/SOQL architecture pending its wave.

**Waves 4–8** (one minor release per converted chart, per `docs/conversion-recipe.md`):

| Wave | Family                   | Charts                                                | Status                  |
| ---- | ------------------------ | ----------------------------------------------------- | ----------------------- |
| 4    | Categorical/comparison   | divergingBar, dotPlot, slope, band, difference        | SHIPPED — v1.1.0–v1.5.0 |
| 5    | Distribution/statistical | histogram, boxPlot, heatmap, calendarHeatmap, scatter | next                    |
| 6    | KPI/single-value         | progressBar, gauge, bullet, iconArray, waterfall      | pending                 |
| 7    | Hierarchy/flow           | treemap, sunburst, sankey, chord, choropleth          | pending                 |
| 8    | Relational/specialized   | forceGraph, gantt, radar, bubble                      | pending                 |

**The purge (after wave 8):** delete the shared `c/` modules and all Apex classes. End state:
40 standalone bundles + the `d3` static resource + nothing else, proven by a repo-wide grep
gate (`c/`, `@salesforce/apex`) showing zero hits. Shipped as its own release.

**Legacy org cleanup (joint, both lines):** the org's pre-suffix unsuffixed bundles and
`d3_lwc*` pages retire in a dedicated cleanup once both this line and `d3-lwc-soql` have their
suffixed pages live — pages deleted before bundles. Not scheduled yet.

## Demo-data seeders

`scripts/apex/*` (`load_phase3_demo_data.apex`, `curate_gantt_demo_data.apex`,
`populate_quota_variance.apex`) and `sfdmu/` stay in this repo until the purge release — they
seed the `[D3DEMO]`-prefixed Opportunity data the live Playwright gate depends on. Decision
2026-08-02: deferring their removal (they'd otherwise look like leftover shared-architecture
scaffolding) to the purge, alongside the shared modules and Apex, rather than stripping them
early and breaking the live gate mid-wave.

## Carried-forward gotchas

- **Design-time wedge.** If the org wedges with stale "design time component information"
  errors, redeploy the 21 suffixed bundles only (list them with `-m`, per the Commands block
  above), not the whole `lwc` dir.
- **CustomTab deploy does not grant visibility.** `sf project deploy start -m "CustomTab:..."`
  deploys the CustomTab record but does **not** add it to any Profile/Permission Set —
  unlike creating a tab through the Setup UI wizard. Without a visibility grant,
  `/lightning/n/<tab>` resolves to a generic "Page doesn't exist" shell even though the
  CustomTab and FlexiPage both deployed correctly (confirmed via Setup's Classic tab-detail
  redirect). Fix: deploy a Permission Set with `tabSettings` entries set `Visible` for the new
  tab(s) and assign it (`D3_Graphql_Showcase` is the one covering all three showcase
  tabs) — never touch the Profile directly for this.
- **Durable component cache.** When iterating in a Chrome DevTools MCP dev-loop session, a
  stale durable LWC component cache can mask a bundle you just redeployed — clear it before
  trusting what's on screen.
- `npm run prettier` reformats the ENTIRE repo (it ignores path args). To format only your
  files: `npx prettier --write <file>...`. Never stage a whole-repo reformat alongside your
  change.
- `npm run lint` fails on a stale `aura/**` glob in the eslint config (no `aura/` dir exists).
  Rely on the per-file lint-staged hook (which works) or `npx eslint <path>` over the dirs you
  touched, not the repo-wide `npm run lint`.
- Apex (for the 19 unconverted charts) has NO local compile/test. TDD is **deploy-then-test**
  against a live org (`sf project deploy start --source-dir force-app/main/default/classes -o
<org>`, then `sf apex run test --tests <Class> -o <org>`). A deploy that fails to compile
  (referencing a not-yet-written method) IS the RED state. `.cls` commits are slow because
  lint-staged spins up a JVM `prettier-plugin-apex` parser — be patient, it's not hung.
  Confirm an authenticated org first (`sf org list`); the historical default `portfolio` may
  be deauthenticated — `AGENT` is the orgfarm dev edition.
- **Property-removal deploy block — legacy concern, not a v1.0.0-conversion concern.**
  Removing an `@api` property from a bundle placed on a live page fails to deploy (`You can't
remove the property tag ... in use on one or more Lightning pages`). `scripts/deploy-property-removal.sh
<org> <flexipage> <bundle-dir...>` automates the detach → deploy → reattach sequencing when
  this is genuinely needed (e.g. editing an already-converted `*Graphql` bundle that's since
  been placed on a page) — but per the suffix amendment, converting a chart no longer hits
  this at all, since the suffixed bundle is a brand-new component, not an edit to a placed one.
- D3.js v7 loaded from the `d3` static resource (the file is named `d3`, with NO `.js`
  extension — a 285 KB full v7 build). Any plan/command reference to `staticresources/d3.js`
  is wrong; the real file is `staticresources/d3`.
- Node.js v20 required for Salesforce CLI compatibility (v25 has issues). Salesforce API
  version: 65.0.

## Chart-Clone Hygiene Checklist (run BEFORE reporting a cloned chart DONE)

When a component/test is cloned from a donor (Pie←Donut, Lollipop←Bar, Sunburst←Treemap, etc.), the donor's identity leaks. Before reporting DONE you MUST scan-and-fix:

1. **Stale donor strings.** Grep the new bundle for the DONOR's chart name and event name (e.g. Bar→Lollipop: `grep -rn 'bar\|barclick' <new dir>`). Every `it()`/`describe()` description, code comment, event-name assertion, and file-path string must name the NEW chart. Intentional negative assertions ("does not render a bar rect") are the only allowed survivors — flag them explicitly in your report.
2. **Stale config keys.** Grep the new tests for the donor's `advancedConfig` keys (`showTotal`, `innerRadiusRatio`, `showGrid`, etc.). A key the new `renderChart` never reads is a silent false-positive (renderChart ignores unknown keys, so the test passes meaninglessly). Replace with a key the new component actually consumes, or delete the assertion.
3. **Advertised-but-unimplemented surfaces.** For EVERY `@api` property and EVERY `<property>` in the `.js-meta.xml`, confirm the component's logic actually reads it (a getter, `renderChart`, `loadData`, or a wired event). A declared-but-unused property (a "Swimlane Field" `groupByField` that nothing references, a `showLabels` gating a no-op block) is dead surface — either implement it or remove the `@api` + meta entry + any JSDoc/ABOUTME claim. Do NOT ship a property the UI exposes but the code ignores.
4. **Test-name ↔ behavior match.** Each `it()` description must describe what the assertion actually checks (a donor-copied "clamps at 100%" name on a test that no longer clamps is a lie).

Report all 4 scan results in your DONE message with the grep commands you ran.

## Plan-prescribed test assertions are written against an _idealized_ service — verify against the real one

When executing a detailed plan that hard-codes EXPECTED values in integration/e2e tests, treat any expected value that depends on a real service's internal logic as a HYPOTHESIS. Verify it by invoking the real service (or tracing its code) at RED time before trusting the plan. High-risk classes (all produced wrong plan values in the Phase-3 run):

- **Color-palette index order** — which category lands at `palette[0]` depends on the real aggregation/sort, not the order the plan lists.
- **WCAG contrast / luminance** — `getContrastColor`'s black-vs-white choice is a real luminance computation (`#1589EE` → 0.242 > 0.179 → black). Never hand-guess.
- **Aggregation insertion order** — `aggregateData` returns categories in the real grouping order, not alphabetical or the plan's listed order.
- **SOQL field-set semantics** — duplicate field names (e.g. `x == size`) must be de-duplicated (escapeSingleQuotes-preserving `Set`) or the query is malformed.
- **Cross-tier contracts** — an LWC that sends `field || null` requires the Apex endpoint to treat that field as OPTIONAL. Verify both sides.
- **CSV / line-ending exactness** — `csv.DictWriter` emits CRLF; SFDMU + exact-header assertions must expect `\r\n`.

If the plan's value differs from the real one, fix the **test** (not the service) and report the empirical evidence. This is correct behavior, not a deviation.
