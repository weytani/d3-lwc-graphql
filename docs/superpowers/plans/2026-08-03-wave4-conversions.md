# Wave 4 Conversions Implementation Plan (v1.1.0–v1.5.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the five Wave-4 categorical/comparison charts (divergingBar, dotPlot, slope, band, difference) into standalone GraphQL-only `*Graphql` bundles and ship each as its own minor release (v1.1.0–v1.5.0), live-verified on AGENT via the Playwright sweep.

**Architecture:** Each conversion follows `docs/conversion-recipe.md` end to end (commit 0 suffix rename → commit 1 additive inlining → commit 2 behavioral conversion → docs), executed on a `wave4/<chart>-graphql` branch in its own worktree so implementers can run in parallel. Release trains then land sequentially on `main`, one per chart: merge → showcase page 3 instance → additive AGENT deploy → Playwright manifest + baseline → live sweep → CHANGELOG + version bump → tag + GitHub release. Wave 4 ships `d3_graphql_showcase_3` (created in the first train).

**Tech Stack:** LWC/jest (sfdx-lwc-jest, jsdom), `lightning/graphql` wire (apiVersion 65), Salesforce CLI (`sf`) against AGENT, @playwright/test, git/gh.

## Global Constraints

- **READ `docs/conversion-recipe.md` IN FULL before starting any conversion task.** It is the mechanics carrier; this plan routes and sequences, the recipe prescribes. Implementers do NOT edit the recipe (wave-1 process rule) — recipe gaps/misfits go in your DONE report for the orchestrator to fold in between waves.
- **Public repo.** No org credentials, org URLs, frontdoor URLs, session ids, or real record data in ANY committed file or committed screenshot. Playwright auth state lives in git-ignored `playwright/.auth/`. Committed baselines may show only `[D3DEMO]`-seeded synthetic data.
- **This line NEVER deploys shared modules, Apex classes, unconverted charts, or the `d3` static resource.** Org deploys name the exact suffixed bundles and `d3_graphql_*` pages/tabs with `-m` — never `--source-dir force-app/main/default/lwc` wholesale.
- **Node 20 for every `sf` command**: prefix with `export PATH="/opt/homebrew/opt/node@20/bin:$PATH"`. jest runs on default node.
- NEVER `--no-verify`; husky + lint-staged must pass. Conventional commits, imperative mood.
- Jest TZ pinned `America/New_York`; chart date bucketing is UTC.
- Plan-prescribed expected test values are HYPOTHESES — verify against the real component at RED time; fix the TEST when reality differs and report the evidence.
- Chart-clone hygiene checklist (repo CLAUDE.md) + recipe §6 scan on every conversion; report the greps run.
- Suffix naming: folder/class `d3XxxGraphql`, tag `c-d3-xxx-graphql`, `masterLabel` gains ` (GraphQL)`. Rename-completeness gate per recipe §1.1 (the `-h` flag is load-bearing).
- Full jest suite runs whole (`npx jest --silent`); iterate per bundle via `npx jest force-app/main/default/lwc/<bundle>`.
- Conversion tasks (1–5) make NO org deploys and NO edits outside their own bundle dir. Release trains (7–11) own all org work.
- Worktree shape for conversion tasks: `git worktree add ../d3-lwc-graphql.worktrees/<chart> -b wave4/<chart>-graphql main` then `ln -s ~/code/d3-lwc-graphql/node_modules ../d3-lwc-graphql.worktrees/<chart>/node_modules`.

## Wave-4 roster (verified against the real components 2026-08-03)

All five are v2.1.0-era hybrid charts: every one imports `gql, graphql` from `lightning/graphql`, has `@api fetchMode = "auto"` + `@api soqlQuery` + `executeQuery` Apex, and ships ALL FOUR test tiers (`.test.js`, `.graphql.test.js`, `.integration.test.js`, `.e2e.test.js`) — no §4.1-precondition backfill flags this wave. Standard removals apply (recipe §4); none is a §9.0 already-GraphQL-only chart.

| Chart               | New identity               | Release | Recipe family                                   | Key surface (verified)                                                                                                                                                                    |
| ------------------- | -------------------------- | ------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| d3DivergingBarChart | d3DivergingBarChartGraphql | v1.1.0  | §9.1 aggregation                                | groupByField/valueField/operation; `getAggregatedData` + `executeQuery`; `getSemanticVariantForTheme` from themeService (pos/neg semantic colors — trace into `theme.js`); `filterClause` |
| d3DotPlot           | d3DotPlotGraphql           | v1.2.0  | §9.1 aggregation (**recipe misfit — see task**) | groupByField/valueField/operation; `getAggregatedData` + `executeQuery`; `getColors, DEFAULT_THEME`; `filterClause`                                                                       |
| d3SlopeChart        | d3SlopeChartGraphql        | v1.3.0  | §9.2 raw-record                                 | groupByField + startValueField/endValueField (two value fields, no `operation`); already imports `buildRecordQuery, normalizeRecordsGeneric` from graphqlService                          |
| d3BandChart         | d3BandChartGraphql         | v1.4.0  | §9.2 raw-record, date X-axis                    | dateField/lowerField/upperField (+ `valueField` — verify it's read; hygiene check 3); `applyFilterClause` from dataService; `getColor` (singular) from themeService                       |
| d3DifferenceChart   | d3DifferenceChartGraphql   | v1.5.0  | §9.2 raw-record, date X-axis                    | dateField/primaryField/secondaryField; `applyFilterClause`; curveType                                                                                                                     |

---

### Task 1: Convert d3DivergingBarChart → d3DivergingBarChartGraphql

**Files:**

- Rename: `force-app/main/default/lwc/d3DivergingBarChart/` → `.../d3DivergingBarChartGraphql/` (all bundle files incl. `.css`, per recipe §1.1)
- Create (inside the renamed bundle): `d3Loader.js`, `theme.js`, `data.js`, `utils.js`, `graphql.js`
- Modify: `d3DivergingBarChartGraphql.js`, `.html`, `.js-meta.xml`, all four `__tests__/*.js`

**Interfaces:**

- Consumes: `docs/conversion-recipe.md` (read in full), shared modules as inlining source, wave-1 aggregation siblings (`d3BarChartGraphql`, `d3SortedBarChartGraphql`) as reference implementations.
- Produces: branch `wave4/d3DivergingBarChart-graphql` with the finished bundle; Task 7 merges and releases it.

Family routing: **§9.1 aggregation** (bar baseline): structured path `buildAggregateQuery`/`normalizeAggregate` with `buildRecordQuery` Count fallback; free-text projects `[...new Set([groupByField, valueField].filter(Boolean))]` and runs the chart's `_aggregateRawData`. Chart-specific: the diverging pos/neg coloring uses `getSemanticVariantForTheme` — the §2.1 trace must pull it (and its transitive closure) into `theme.js`. `filterClause` — verify per recipe §4.2 whether any non-Apex path reads it before removing (bar's was Apex-only dead surface; confirm for this chart and report).

- [ ] **Step 1:** Worktree + branch per Global Constraints; `npx jest --silent` green from the start.
- [ ] **Step 2 (commit 0):** Suffix rename per recipe §1.1 (git-mv loop WITH `.css`, class/label/test edits, staging-sanity `git add -A` + empty unstaged diff, both `-h` completeness greps recorded); `npx jest force-app/main/default/lwc/d3DivergingBarChartGraphql` green; commit `refactor(d3DivergingBarChart): rename to d3DivergingBarChartGraphql per suffix amendment`.
- [ ] **Step 3 (commit 1):** Inline used-subset modules per recipe §2 (trace transitive closure; NO `createLayoutRetry`; ABOUTMEs evergreen; §2.3 `normalizeRecordsGeneric` pinned in `graphql.js`); nothing references the new files yet; full suite trivially green; commit `refactor(d3DivergingBarChartGraphql): inline shared-module subsets as bundle-local files`.
- [ ] **Step 4 (commit 2, RED):** Rewrite tests per recipe §4.1 — delete Apex mocks/assertions and `fetchMode` tests (grep for leftovers per §4.1), add the four free-text override cases, add §4.3 render-orchestration tests with a sub-margin fixture width computed from THIS chart's real margins (read them from `renderChart` — do not copy bar's 40px), convert one happy-path e2e/integration test to a `graphql.emit(...)` wire path in a correctly-named describe block. Run the bundle's jest — RED only where expected.
- [ ] **Step 5 (commit 2, GREEN):** Implement per recipe §3 + §4.2 + §4.3 — import swap (component + `jest.mock("../d3Loader", …)`), remove Apex/`soqlQuery`/`fetchMode` (+`filterClause` if verified dead), add `graphqlQuery` + `hasFreeTextQuery` + `gqlQuery` getter + wire handler + loading-state gate + single-lifetime ResizeObserver + `_safeRenderChart`. Bundle jest green, then `npx jest --silent` FULL suite green.
- [ ] **Step 6:** `.js-meta.xml` per recipe §5 + §5.1 — remove `soqlQuery`/`fetchMode` properties, add `graphqlQuery` (free-text contract + footgun wording), Count-bound sentence on `operation`, `objectApiName` label per drill-down rule, add `lightning__FlowScreen` target + targetConfig exposing THIS chart's real render props (adopt-and-keep existing targets). Commit `feat(d3DivergingBarChartGraphql): GraphQL-only self-fetch with graphqlQuery override`.
- [ ] **Step 7:** Recipe §6 hygiene scan (all four checks + import ban, commands recorded) + §7 verification gate (`npx jest --silent`, `npx eslint` on the bundle, `npx prettier --write` touched files only). Fix-loop anything found.
- [ ] **Step 8:** Push branch. DONE report: family-routing evidence, filterClause verdict, completeness greps, hygiene results, sub-margin width used and the real margin numbers, any recipe gaps/misfits (do NOT edit the recipe).

### Task 2: Convert d3DotPlot → d3DotPlotGraphql

**Files:**

- Rename: `force-app/main/default/lwc/d3DotPlot/` → `.../d3DotPlotGraphql/` (all bundle files incl. `.css`)
- Create: `d3Loader.js`, `theme.js`, `data.js`, `utils.js`, `graphql.js` in the bundle
- Modify: `d3DotPlotGraphql.js`, `.html`, `.js-meta.xml`, all four `__tests__/*.js`

**Interfaces:**

- Consumes: `docs/conversion-recipe.md`; `d3BarChartGraphql`/`d3LollipopChartGraphql` as aggregation-family references.
- Produces: branch `wave4/d3DotPlot-graphql`; Task 8 merges and releases it.

Family routing: **§9.1 aggregation** — and note the misfit: recipe §9.2's family list names dotPlot as raw-record, but the REAL component is aggregation-shaped (`groupByField`/`valueField`/`operation`, `getAggregatedData` + `executeQuery`, Cleveland-style aggregated dot plot). Route per the real component (§9.1: structured `buildAggregateQuery`/`normalizeAggregate` + Count fallback; free-text → `_aggregateRawData`); state the misfit explicitly in your DONE report so the orchestrator fixes §9.2's list. `filterClause` — same verify-before-remove rule as Task 1.

- [ ] **Steps 1–8:** Identical structure to Task 1, substituting `d3DotPlot`/`d3DotPlotGraphql`/`c-d3-dot-plot-graphql`, branch `wave4/d3DotPlot-graphql`, commits `refactor(d3DotPlot): rename to d3DotPlotGraphql per suffix amendment` → `refactor(d3DotPlotGraphql): inline shared-module subsets as bundle-local files` → `feat(d3DotPlotGraphql): GraphQL-only self-fetch with graphqlQuery override`. Sub-margin fixture width computed from d3DotPlot's real margins. DONE report must include the §9.2 misfit note.

### Task 3: Convert d3SlopeChart → d3SlopeChartGraphql

**Files:**

- Rename: `force-app/main/default/lwc/d3SlopeChart/` → `.../d3SlopeChartGraphql/` (all bundle files incl. `.css`)
- Create: `d3Loader.js`, `theme.js`, `data.js`, `utils.js`, `graphql.js` in the bundle
- Modify: `d3SlopeChartGraphql.js`, `.html`, `.js-meta.xml`, all four `__tests__/*.js`

**Interfaces:**

- Consumes: `docs/conversion-recipe.md`; wave-2 raw-record siblings (`d3LineChartGraphql`, `d3StepChartGraphql`) for the unified-wire shape.
- Produces: branch `wave4/d3SlopeChart-graphql`; Task 9 merges and releases it.

Family routing: **§9.2 raw-record** — no `operation`, two value fields (`startValueField`, `endValueField`). Structured path already uses `buildRecordQuery` + `normalizeRecordsGeneric` (the chart imports them today — the conversion inlines them and removes the Apex/`soqlQuery` branch + `fetchMode` gate). Use the **unified-wire handler** shape (§9.2): every emission runs `normalizeRecordsGeneric` → the chart's own slope-shaping step; free-text adds only the empty-record hint. Field projection `[...new Set([groupByField, startValueField, endValueField].filter(Boolean))]`. NO summation on the free-text branch (§9.2 parity invariant). Record-limit constant: single-key `CHART_LIMITS` object shape (§9.2 go-forward convention).

- [ ] **Steps 1–8:** Identical structure to Task 1, substituting `d3SlopeChart`/`d3SlopeChartGraphql`/`c-d3-slope-chart-graphql`, branch `wave4/d3SlopeChart-graphql`, commits `refactor(d3SlopeChart): rename to d3SlopeChartGraphql per suffix amendment` → `refactor(d3SlopeChartGraphql): inline shared-module subsets as bundle-local files` → `feat(d3SlopeChartGraphql): GraphQL-only self-fetch with graphqlQuery override`. `graphql.js` inlines ONLY `buildRecordQuery` + `normalizeRecordsGeneric` + `buildWhere`/`formatValue`/`OPERATORS` (no aggregate builders — dead surface here). Parity test: a free-text emission renders through the same slope-shaping as structured.

### Task 4: Convert d3BandChart → d3BandChartGraphql

**Files:**

- Rename: `force-app/main/default/lwc/d3BandChart/` → `.../d3BandChartGraphql/` (all bundle files incl. `.css`)
- Create: `d3Loader.js`, `theme.js`, `data.js`, `utils.js`, `graphql.js` in the bundle
- Modify: `d3BandChartGraphql.js`, `.html`, `.js-meta.xml`, all four `__tests__/*.js`

**Interfaces:**

- Consumes: `docs/conversion-recipe.md`; wave-2 date-axis siblings (`d3AreaChartGraphql`, `d3VariableColorLineGraphql`) as references.
- Produces: branch `wave4/d3BandChart-graphql`; Task 10 merges and releases it.

Family routing: **§9.2 raw-record with date X-axis** (NOT §9.4 — that's gantt/calendarHeatmap only). Date shaping stays in the component's own date-parsing/`processBandData`-style step; `graphql.js` does no date work. Unified-wire handler. Field projection `[...new Set([dateField, lowerField, upperField, valueField].filter(Boolean))]` — but FIRST verify `valueField` is actually read by the component (hygiene check 3): if it's dead surface, remove the `@api` + meta entry and drop it from the projection, and say so in the report. `applyFilterClause` (dataService): determine which path reads it — if only the removed Apex/soqlQuery path, it goes; if the recordCollection path applies it client-side, it stays and gets traced into `data.js`. Report the verdict either way. `getColor` (singular) from themeService — trace its real closure; don't blindly copy bar's `getColors` set.

- [ ] **Steps 1–8:** Identical structure to Task 1, substituting `d3BandChart`/`d3BandChartGraphql`/`c-d3-band-chart-graphql`, branch `wave4/d3BandChart-graphql`, commits `refactor(d3BandChart): rename to d3BandChartGraphql per suffix amendment` → `refactor(d3BandChartGraphql): inline shared-module subsets as bundle-local files` → `feat(d3BandChartGraphql): GraphQL-only self-fetch with graphqlQuery override`. Sub-margin fixture from THIS chart's margins. Date-bucketing tests respect the pinned `America/New_York` TZ.

### Task 5: Convert d3DifferenceChart → d3DifferenceChartGraphql

**Files:**

- Rename: `force-app/main/default/lwc/d3DifferenceChart/` → `.../d3DifferenceChartGraphql/` (all bundle files incl. `.css`)
- Create: `d3Loader.js`, `theme.js`, `data.js`, `utils.js`, `graphql.js` in the bundle
- Modify: `d3DifferenceChartGraphql.js`, `.html`, `.js-meta.xml`, all four `__tests__/*.js`

**Interfaces:**

- Consumes: `docs/conversion-recipe.md`; `d3AreaChartGraphql` (area-fill date chart) as nearest reference.
- Produces: branch `wave4/d3DifferenceChart-graphql`; Task 11 merges and releases it.

Family routing: **§9.2 raw-record with date X-axis**, same rules as Task 4: unified-wire handler, component-owned date shaping, projection `[...new Set([dateField, primaryField, secondaryField].filter(Boolean))]`, no free-text summation, `CHART_LIMITS` object shape. `applyFilterClause` + `filterClause`: same verify-before-remove rule as Task 4, report the verdict.

- [ ] **Steps 1–8:** Identical structure to Task 1, substituting `d3DifferenceChart`/`d3DifferenceChartGraphql`/`c-d3-difference-chart-graphql`, branch `wave4/d3DifferenceChart-graphql`, commits `refactor(d3DifferenceChart): rename to d3DifferenceChartGraphql per suffix amendment` → `refactor(d3DifferenceChartGraphql): inline shared-module subsets as bundle-local files` → `feat(d3DifferenceChartGraphql): GraphQL-only self-fetch with graphqlQuery override`.

### Task 6: Wave review — cross-sibling drift + recipe fold-in

**Files:**

- Read-only across the five new bundles + wave-1/2 siblings; recipe edits by the ORCHESTRATOR only.

**Interfaces:**

- Consumes: the five `wave4/*` branches (all pushed, all DONE reports in).
- Produces: APPROVE/fix-loop verdict per chart gating Tasks 7–11; a recipe-gap list for the orchestrator.

- [ ] **Step 1:** Per chart: verify the four commits' shape, the completeness/hygiene grep evidence, and spec-fidelity to the recipe family sections (§9.1 for divergingBar/dotPlot, §9.2 for slope/band/difference).
- [ ] **Step 2:** Cross-sibling drift check: for each of `d3Loader.js`, `theme.js`, `data.js`, `utils.js`, `graphql.js`, md5 the five new copies + one wave-1 and one wave-2 sibling; every DIFFERING pair must be explained by a genuine per-chart subset difference (different traced closure), never by wording/logic drift in shared functions. Matrix in the review report.
- [ ] **Step 3:** Fix-loop any must-fix findings back to the owning implementer branch before its release train runs.
- [ ] **Step 4 (orchestrator):** Fold reported recipe gaps into `docs/conversion-recipe.md` (incl. the Task-2 §9.2 dotPlot misfit) and commit `docs(recipe): wave 4 fold-in — <topics>`.

### Task 7: Release train v1.1.0 — d3DivergingBarChartGraphql (creates showcase page 3)

**Files:**

- Create: `force-app/main/default/flexipages/d3_graphql_showcase_3.flexipage-meta.xml`, `force-app/main/default/tabs/d3_graphql_showcase_3.tab-meta.xml`
- Modify: `force-app/main/default/permissionsets/D3_Graphql_Showcase.permissionset-meta.xml` (add `tabSettings` Visible for the new tab), `playwright/chart-manifest.json` (page-3 entry), `CHANGELOG.md`, `package.json` (version)
- Baseline: `playwright/chart-sweep.spec.js-snapshots/d3DivergingBarChartGraphql-d3_graphql_showcase_3.png`

**Interfaces:**

- Consumes: branch `wave4/d3DivergingBarChart-graphql` (Task 6 APPROVE).
- Produces: tag `v1.1.0` + GitHub release; page 3 live on AGENT with one chart; manifest page-3 skeleton Tasks 8–11 append to.

- [ ] **Step 1:** On `main`: `git merge --no-ff wave4/d3DivergingBarChart-graphql -m "merge: d3DivergingBarChartGraphql standalone conversion (wave 4)"`; `npx jest --silent` green; remove the worktree (`git worktree remove ../d3-lwc-graphql.worktrees/d3DivergingBarChart && git branch -d wave4/d3DivergingBarChart-graphql`).
- [ ] **Step 2:** Author `d3_graphql_showcase_3` flexipage (AppPage template, modeled structurally on `d3_graphql_showcase_1`) with ONE `componentInstance`: `d3DivergingBarChartGraphql`, config translated from the soql line's instance (`~/code/d3-lwc-soql/force-app/main/default/flexipages/d3_soql_showcase_1.flexipage-meta.xml`, `d3DivergingBarChartSoql` block): keep field/operation/height/theme values, drop `soqlQuery`/`fetchMode`/`filterClause`, ensure `objectApiName=Opportunity`, and scope to `[D3DEMO]` data using the same filter idiom the existing `d3_graphql_showcase_1/2` structured instances use (read one before authoring). Author the tab XML modeled on `d3_graphql_showcase_1.tab-meta.xml`; add the permset `tabSettings` entry (KEY ORG LESSON: CustomTab deploy grants NO visibility without it).
- [ ] **Step 3:** Confirm `[D3DEMO]` data: `sf data query -q "SELECT COUNT() FROM Opportunity WHERE Name LIKE '[D3DEMO]%'" -o AGENT` (Node-20 PATH) non-zero; if zero, seed via `sf apex run --file scripts/apex/load_phase3_demo_data.apex -o AGENT` and re-check.
- [ ] **Step 4:** Deploy, bundles before pages:

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
sf project deploy start -o AGENT -m "LightningComponentBundle:d3DivergingBarChartGraphql"
sf project deploy start -o AGENT -m "FlexiPage:d3_graphql_showcase_3" -m "CustomTab:d3_graphql_showcase_3" -m "PermissionSet:D3_Graphql_Showcase"
sf org assign permset -n D3_Graphql_Showcase -o AGENT || true  # idempotent; errors only if already assigned
```

- [ ] **Step 5:** Manifest: add page-3 entry `{ "tab": "d3_graphql_showcase_3", "charts": [{ "element": "c-d3-diverging-bar-chart-graphql", "name": "d3DivergingBarChartGraphql", "minSvgDescendants": 10 }] }`. Generate its baseline only: `npx playwright test --grep d3_graphql_showcase_3 --update-snapshots`; EYEBALL the new PNG (Read it): real marks incl. negative bars, no blank/error state, ONLY `[D3DEMO]` labels — non-synthetic data is STOP-and-report.
- [ ] **Step 6:** Full gate: `npm run test:e2e:live` — all three pages green, zero console errors, no baseline drift on pages 1–2. Failures are findings; fix-loop, never loosen.
- [ ] **Step 7:** CHANGELOG v1.1.0 entry (model: the v1.0.0 per-chart BREAKING conversion paragraphs — standalone GraphQL-only bundle, renamed `d3DivergingBarChartGraphql`, `soqlQuery`/`fetchMode` removed, `graphqlQuery` added, FlowScreen target, live-verified; note showcase page 3 debut). `package.json` version → `1.1.0`. Commit everything from Steps 2/5/7: `release: v1.1.0 — d3DivergingBarChartGraphql standalone + showcase page 3`.
- [ ] **Step 8:** `git push origin main && git tag v1.1.0 && git push origin v1.1.0`; `gh release create v1.1.0 --title "v1.1.0 — Diverging Bar Chart (GraphQL) standalone" --notes "<the CHANGELOG v1.1.0 section>"`.

### Task 8: Release train v1.2.0 — d3DotPlotGraphql

**Files:**

- Modify: `force-app/main/default/flexipages/d3_graphql_showcase_3.flexipage-meta.xml` (append instance), `playwright/chart-manifest.json` (append chart), `CHANGELOG.md`, `package.json`
- Baseline: `playwright/chart-sweep.spec.js-snapshots/d3DotPlotGraphql-d3_graphql_showcase_3.png`

**Interfaces:**

- Consumes: branch `wave4/d3DotPlot-graphql` (Task 6 APPROVE); page 3 exists (Task 7).
- Produces: tag `v1.2.0` + GitHub release.

- [ ] **Step 1:** Merge `wave4/d3DotPlot-graphql` (`--no-ff`, message `merge: d3DotPlotGraphql standalone conversion (wave 4)`); full suite green; remove worktree + branch.
- [ ] **Step 2:** Append the `d3DotPlotGraphql` instance to page 3 (config translated from `~/code/d3-lwc-soql/.../d3_soql_showcase_3.flexipage-meta.xml`'s `d3DotPlotSoql` block, same translation rules as Task 7 Step 2).
- [ ] **Step 3:** Deploy: bundle first (`-m "LightningComponentBundle:d3DotPlotGraphql"`), then `-m "FlexiPage:d3_graphql_showcase_3"` (Node-20 PATH).
- [ ] **Step 4:** Manifest append (`c-d3-dot-plot-graphql`, floor 10); `npx playwright test --grep d3_graphql_showcase_3 --update-snapshots`; eyeball the NEW PNG; confirm the divergingBar baseline did not drift (git status shows only the new PNG — a changed existing baseline is a finding).
- [ ] **Step 5:** `npm run test:e2e:live` fully green.
- [ ] **Step 6:** CHANGELOG v1.2.0 + version bump; commit `release: v1.2.0 — d3DotPlotGraphql standalone`; push, tag `v1.2.0`, `gh release create v1.2.0 --title "v1.2.0 — Dot Plot (GraphQL) standalone" --notes "<CHANGELOG v1.2.0 section>"`.

### Task 9: Release train v1.3.0 — d3SlopeChartGraphql

Same structure as Task 8, substituting: branch `wave4/d3SlopeChart-graphql`, merge message `merge: d3SlopeChartGraphql standalone conversion (wave 4)`, soql config source `d3_soql_showcase_2.flexipage-meta.xml` (`d3SlopeChartSoql` block), deploy `-m "LightningComponentBundle:d3SlopeChartGraphql"` then the page, manifest element `c-d3-slope-chart-graphql` name `d3SlopeChartGraphql` floor 10, baseline `d3SlopeChartGraphql-d3_graphql_showcase_3.png`, CHANGELOG v1.3.0, commit `release: v1.3.0 — d3SlopeChartGraphql standalone`, tag `v1.3.0`, release title `"v1.3.0 — Slope Chart (GraphQL) standalone"`.

- [ ] Steps 1–6 as Task 8 with the substitutions above.

### Task 10: Release train v1.4.0 — d3BandChartGraphql

Same structure as Task 8, substituting: branch `wave4/d3BandChart-graphql`, merge message `merge: d3BandChartGraphql standalone conversion (wave 4)`, soql config source `d3_soql_showcase_2.flexipage-meta.xml` (`d3BandChartSoql` block), deploy `-m "LightningComponentBundle:d3BandChartGraphql"` then the page, manifest element `c-d3-band-chart-graphql` name `d3BandChartGraphql` floor 10, baseline `d3BandChartGraphql-d3_graphql_showcase_3.png`, CHANGELOG v1.4.0, commit `release: v1.4.0 — d3BandChartGraphql standalone`, tag `v1.4.0`, release title `"v1.4.0 — Band Chart (GraphQL) standalone"`.

- [ ] Steps 1–6 as Task 8 with the substitutions above.

### Task 11: Release train v1.5.0 — d3DifferenceChartGraphql

Same structure as Task 8, substituting: branch `wave4/d3DifferenceChart-graphql`, merge message `merge: d3DifferenceChartGraphql standalone conversion (wave 4)`, soql config source `d3_soql_showcase_2.flexipage-meta.xml` (`d3DifferenceChartSoql` block), deploy `-m "LightningComponentBundle:d3DifferenceChartGraphql"` then the page, manifest element `c-d3-difference-chart-graphql` name `d3DifferenceChartGraphql` floor 10, baseline `d3DifferenceChartGraphql-d3_graphql_showcase_3.png`, CHANGELOG v1.5.0, commit `release: v1.5.0 — d3DifferenceChartGraphql standalone`, tag `v1.5.0`, release title `"v1.5.0 — Difference Chart (GraphQL) standalone"`.

- [ ] Steps 1–6 as Task 8 with the substitutions above.

### Task 12: Wave-4 docs refresh + memory

**Files:**

- Modify: `CLAUDE.md` (status: 21/40; converted list + wave table; deploy command block gains the 5 bundles + page 3/tab 3), `README.md` (status table), `docs/FILE_MANIFEST.md` only if trivially safe (it is a known-stale joint-cleanup item — do not deep-clean it here).

**Interfaces:**

- Consumes: Tasks 7–11 complete (five tags live).
- Produces: repo docs telling the truth at 21/40; Auto Memory current.

- [ ] **Step 1:** Update CLAUDE.md: converted count/list (21: += divergingBar, dotPlot, slope, band, difference), wave table marks Wave 4 SHIPPED, deploy block includes the 5 new `-m` bundle flags and `FlexiPage:d3_graphql_showcase_3`/`CustomTab:d3_graphql_showcase_3`. README status table likewise.
- [ ] **Step 2:** `npx jest --silent` green; commit `docs: wave 4 shipped — 21/40 converted, showcase page 3`; push.
- [ ] **Step 3 (orchestrator, not committed to this repo):** Update Auto Memory `project_d3_lwc.md` (wave 4 shipped v1.1.0–v1.5.0; 21/40; next = wave 5: histogram, boxPlot, heatmap, calendarHeatmap, scatter; recipe fold-ins applied) and MEMORY.md hook line.
