# d3-lwc Repo Split: d3-lwc-soql + d3-lwc-graphql — Design

- **Date:** 2026-08-02
- **Status:** Approved by David (fork picks: QA = live-org Playwright; sequencing = split first)
- **Origin repo:** `weytani/d3-lwc` (public), master at v3.9.0, `v3-standalone` ahead with 16/40 charts converted

## Decision log

| Question                   | Decision                                                                                                                                                                                                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repo genesis               | **Full-history clones.** Both new repos are clones of d3-lwc; original archived read-only after the split.                                                                                                                                                                                         |
| d3-lwc-soql v1.0.0 meaning | **Pure SOQL/Apex.** Strip `graphqlService` + `fetchMode` from all 40 charts; shared-module architecture stays.                                                                                                                                                                                     |
| QA architecture            | **Playwright drives the live AGENT org** (auth via frontdoor `storageState`); Chrome DevTools MCP remains the interactive dev loop; jest 3-tier suites remain the unit/integration layer. Playwright is a **local release gate only** — org credentials never reach GitHub Actions (public repos). |
| Sequencing                 | **Split first.** Remaining conversions and the strip sweep happen in the new repos, as parallel streams.                                                                                                                                                                                           |

## Goals

1. Two public GitHub repos under `weytani`, each a complete, coherent product:
   - **`d3-lwc-soql`** — 40 charts on the shared-module + Apex/SOQL architecture.
   - **`d3-lwc-graphql`** — 40 charts, each a fully standalone GraphQL-only bundle whose only dependency is the `d3` static resource.
2. Extensive, regenerable documentation in both repos; READMEs updated as a release-train step.
3. Automated quality gates: jest (CI) + Playwright live-org visual/console sweep (local) + Chrome DevTools MCP (dev loop).
4. Phase 2 (separate spec/plan cycle): +10 new chart types implemented in **both** repos (50 charts each).

## Non-goals

- No new chart behavior during the split (strip and convert only; the one sanctioned behavioral change is the §4.3 hardening backport, below).
- No LWC OSS / off-platform harness (rejected: `lightning/graphql` and `platformResourceLoader` don't exist off-platform; a stubbed harness is a mock mode by another name).
- No agentforce-dev architecture change (it keeps consuming the SOQL line).

## 1. Repo genesis mechanics

- **`d3-lwc-graphql`:** clone of d3-lwc with full history; `main` cut from the `v3-standalone` tip. The uncommitted `d3_lwc_phase2.flexipage-meta.xml` edit (interrupted release-train detach) is triaged at cutover — inspect, then commit or discard. The 10 parked worktrees stay with the old repo and are pruned; their branches ride along in the clone.
- **`d3-lwc-soql`:** clone of d3-lwc with full history; `main` cut from the **`v2.1.0` tag** (last point where all 40 charts carry the SOQL/Apex path).
- **Tags:** in both clones, inherited tags are renamed `v*` → `legacy/v*` so each repo starts a clean semver line at its own `v1.0.0`. Each CHANGELOG opens with a legacy-version mapping table.
- **GitHub:** both repos created public under `weytani` (matches d3-lwc).
- **Old repo:** one final commit pointing the README at the two successors, then archived read-only on GitHub. Local checkout retained. This spec lives in the old repo (the split's program of record); each new repo carries the docs relevant to it.

## 2. d3-lwc-soql

### v1.0.0 — the strip sweep (mechanical)

From the v2.1.0 state, for all 40 charts: remove the `graphqlService` bundle, per-chart `fetchMode` @api + graphql imports + graphql code paths, graphql jest tiers, and `.js-meta.xml` graphql surfaces. Retained: `recordCollection`, `soqlQuery` via `D3ChartController`, server-side aggregation endpoints (`getAggregatedData`, `getStatistics`, `getCorrelation`), shared modules (`d3Lib`, `dataService`, `themeService`, `chartUtils`), unit + integration + e2e jest tiers, `sync-to-agentforce.sh`. Chart-clone hygiene grep applies in reverse: after the strip, no chart may reference `graphql`, `fetchMode`, or `graphqlQuery` anywhere (code, tests, meta, docs).

### v1.1.0 — render-orchestration hardening backport (behavioral)

v2.1.0 predates the v3 §4.3 hardening. Backport to all 40 charts: single lifetime ResizeObserver replaces `createLayoutRetry`'s silent 60-frame give-up; `_safeRenderChart` surfaces mid-render exceptions. Shipped as its own release so the mechanical strip and the behavioral change never share a diff.

## 3. d3-lwc-graphql

### v1.0.0 — consolidation gate

v1.0.0 = the 16 already-converted charts (bar, sortedBar, horizontalBar, stackedBar, stackedHorizontalBar, normalizedBar, line, area, step, variableColorLine, sparklineGrid, pie, donut, lollipop, funnel, waffle). Gate: finish the 6 merged-but-unreleased release trains (sparklineGrid + Wave 3) — flexipage migrations, live gates — then a full 16-chart Playwright sweep on AGENT. No new conversions ship before this gate closes.

### v1.1.0 → v1.24.0 — waves 4–8

One minor release per converted chart, per `docs/conversion-recipe.md` and the proven release train (merge → flexipage-final-state commit → detach-edit → 3-step deploy → live gate → CHANGELOG + bump → ff main → tag → gh release). Wave machinery unchanged: ≤5-chart waves, parallel subagent implementers, implementers never edit the recipe, orchestrator folds recipe gaps between waves, recipe-review gate before each fan-out (including non-code artifacts: meta.xml, API-version pins).

Indicative wave grouping of the remaining 24 (plan phase finalizes):

| Wave | Family                   | Charts                                                |
| ---- | ------------------------ | ----------------------------------------------------- |
| 4    | Categorical/comparison   | divergingBar, dotPlot, slope, band, difference        |
| 5    | Distribution/statistical | histogram, boxPlot, heatmap, calendarHeatmap, scatter |
| 6    | KPI/single-value         | progressBar, gauge, bullet, iconArray, waterfall      |
| 7    | Hierarchy/flow           | treemap, sunburst, sankey, chord, choropleth          |
| 8    | Relational/specialized   | forceGraph, gantt, radar, bubble                      |

Special cases: **gantt** is already GraphQL-only (v2.0.0) but not standalone — its conversion is inlining + `graphqlQuery` + FlowScreen + hardening only. **choropleth** may carry a geo-data static resource beyond `d3` — wave-time investigation decides: bundle the geo data into the component or document the extra resource as the one sanctioned exception.

### End state — the purge

After the last conversion: delete the shared `c/` modules (`d3Lib`, `dataService`, `themeService`, `chartUtils`, `graphqlService`) and **all Apex classes**. Final state: 40 standalone bundles + the `d3` static resource + nothing else. "No dependencies except d3" is enforced structurally — there is nothing left to depend on. Shipped as its own release with a repo-wide grep gate (`c/`, `@salesforce/apex`) proving emptiness.

## 4. QA architecture (both repos)

- **Playwright** (`playwright/` in each repo): auth via `sf org open --url-only` frontdoor → saved `storageState` (frontdoor OTPs are single-use/short-lived — generate and use back-to-back); walk showcase flexipages enumerating every chart; per chart assert (a) SVG rendered with data-driven node counts, (b) zero console errors, (c) screenshot matches committed visual baseline. Baselines regenerate on sanctioned visual changes. Runs locally as a release gate; never in CI.
- **CI (GitHub Actions):** jest full suite + eslint on PR. No org credentials.
- **Chrome DevTools MCP:** interactive dev verification — the durable component-cache-clear recipe, GraphQL wire envelope inspection, on-demand perf traces.
- **Jest:** 3-tier suites (unit / integration / e2e) remain per chart; the known 2-tier gaps carried from Waves 2–3 get backfilled before their charts' consolidation-gate sign-off.

## 5. Documentation (both repos)

- `README.md` — positioning (which repo do I want?), quickstart, full chart gallery table with screenshots. Updated every release (release-train step).
- `docs/ADMIN-GUIDE.md` — per-chart config surfaces; `soqlQuery` examples (soql repo) vs structured + `graphqlQuery` free-text examples (graphql repo).
- `docs/ARCHITECTURE.md` — shared-module + Apex data flow (soql) vs standalone-bundle anatomy (graphql).
- `docs/charts/<chartName>.md` — 40 per-chart reference pages each: properties, Flow/App-Builder usage, examples, screenshot **produced by the Playwright rig** so images regenerate with the code.
- `MIGRATION.md` — from hybrid d3-lwc to this repo (including the detach → deploy → reattach dance for property removals).
- `CONTRIBUTING.md` — dev setup, TDD workflow, release train; in graphql the conversion recipe evolves into the new-chart authoring recipe.
- `CHANGELOG.md` — Keep a Changelog; opens with the legacy-version mapping table.

## 6. agentforce-dev sync

`scripts/sync-to-agentforce.sh` moves to **d3-lwc-soql** (agentforce-dev consumes the shared-module/Apex architecture today). The script's additive `__mocks__/` copy behavior is preserved. Removed from d3-lwc-graphql. Revisit only if David flips agentforce-dev to the graphql line.

## 7. Phase 2 — +10 charts each (separate spec/plan cycle)

Same 10 chart types in both repos, from CHART-INDEX.md complexity order (next 10 unbuilt): **Dumbbell, Moving Average Overlay, Connected Scatterplot, Grouped Horizontal Bar, Diverging Stacked Bar, Radial Bar, Marimekko, Candlestick, Streamgraph, Ridgeline.** Each type ships twice: shared-module SOQL implementation and standalone GraphQL implementation (authoring recipe). Starts only after both repos reach 40 released charts. David may veto/swap picks at the Phase-2 spec.

## 8. New-repo ritual

Each repo gets its own CLAUDE.md (carrying forward the tooling gotchas, clone-hygiene checklist, and deploy protocols that still apply) with fresh names:

- **d3-lwc-soql** — agent: **QUERYSAURUS WRECKS**; David: **Bigg DR SOQLSLAM**
- **d3-lwc-graphql** — agent: **GRAPH GRAVEDIGGER**; David: **Bigg DR NODEZILLA**

## Risks and constraints

- **Public repos:** no org credentials, org URLs, or record data in code, docs, fixtures, or Playwright baselines. Screenshots use `[D3DEMO]` synthetic data only.
- Property-removal deploys still require the detach → deploy → reattach dance (`scripts/deploy-property-removal.sh`); the strip sweep (soql) hits this for every chart placed on a live page.
- Node 20 for SF CLI; `AGENT` is the authenticated org (`portfolio` is deauthenticated and over its data cap).
- Org "design time component information" wedge after many deploys → redeploy all LWC bundles to clear.
- Jest TZ pinned America/New_York (date-bucketing guards); UTC bucketing rule from Wave 2 applies to all date charts.
- The old repo's open branches (`gantt-graphql-replace`, prototypes) ride along in clones as inert history; none are deleted.

## Out of scope

- Phase-2 implementation details (own spec).
- Any change to d3-lwc-soql's data-service behavior beyond the strip + hardening backport.
- Managed-package / AppExchange packaging.

## Amendment 2026-08-02: per-line component suffixes (single-org coexistence)

David's direction at strip-plan review: "put -soql or -graphql on the end of each chart to make it clearer."

- Every chart bundle is renamed with a per-line suffix: `d3BarChartSoql` (tag `c-d3-bar-chart-soql`) in d3-lwc-soql; `d3BarChartGraphql` (tag `c-d3-bar-chart-graphql`) in d3-lwc-graphql. LWC names cannot contain hyphens, so the camelCase suffix realizes the `-soql`/`-graphql` ending in every tag, template, and test. `masterLabel` gains ` (SOQL)` / ` (GraphQL)` so App Builder/Flow pickers disambiguate.
- Both lines coexist on the AGENT org; no second org is provisioned. This supersedes the earlier one-line-per-org assumption.
- Shared modules (`d3Lib`, `dataService`, `themeService`, `chartUtils`) and Apex (`D3ChartController`) stay UNsuffixed, owned by the soql line. The graphql repo's frozen copies serve only its unconverted charts in-repo, are never deployed by that line, and die at its purge release.
- Each line ships its OWN showcase flexipages + tabs (`d3_soql_*` / `d3_graphql_*`) referencing suffixed components. The org's existing unsuffixed bundles and `d3_lwc*` pages become legacy, retired in a dedicated joint cleanup after both lines' pages are live (pages deleted before bundles).
- Consequence: the detach → deploy → reattach property-removal dance disappears from both streams — suffixed components are NEW bundles; no placed component's property surface is ever edited.
- The archived weytani/d3-lwc copy of this spec cannot be updated; the copies in d3-lwc-soql and d3-lwc-graphql are canonical from this amendment forward.
