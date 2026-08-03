# Per-Chart GraphQL-Standalone Conversion Recipe

Hardened in Wave 0 on **d3BarChart** (branch `v3/d3BarChart-standalone`). This is
the reproducible procedure for converting one chart bundle into a fully
standalone, GraphQL-only bundle for waves 1–N. It is written from what the bar
conversion actually required, not from what the design predicted. Read the
approved design first: `docs/superpowers/specs/2026-07-11-graphql-standalone-design.md`.

The end state per chart: the bundle folder + the `d3` static resource is
everything. No `c/d3Lib`, `c/dataService`, `c/themeService`, `c/chartUtils`,
`c/graphqlService` imports; no `@salesforce/apex/*` imports; no `soqlQuery` or
`fetchMode`; a new `graphqlQuery` free-text admin override.

> **Amendment pending fold-in (waves 4–8):** the v1.0.0 consolidation gate added a
> per-line suffix convention on top of this recipe — folder/class `d3XxxGraphql`,
> tag `c-d3-xxx-graphql`, `masterLabel` gains ` (GraphQL)` — with a
> rename-completeness grep gate. This recipe predates that amendment and does not
> yet document the suffix step; until it's folded in, apply the suffix mechanics
> from `docs/superpowers/plans/2026-08-02-v1-consolidation-gate.md` (Task 1) on
> top of every step below.

---

## 0. Prerequisites

- A worktree + branch off the v3 integration branch (do **not** work in the main
  checkout). Example used in Wave 0:
  `git worktree add ../d3-lwc.worktrees/<chart> v3/<chart>-standalone`
- `node -v` → v20 (jest ran under Node 26 here fine, but SF CLI needs 20).
- `npx jest --silent` green from the start (full suite; ~2.4s / 3,377 tests). The
  suite always runs whole — there is **no per-component narrowing flag**
  (`--testPathPattern` does nothing here). To watch just your bundle while
  iterating, pass a path: `npx jest force-app/main/default/lwc/<chart>`.
- Know your chart's shared-module usage before you start (step 2).

---

## 1. Commit shape (what worked)

Wave 1 produced three divergent-but-green interpretations of this split; the
shape below is the **one blessed shape**. Two code commits + one docs commit, in
this order:

1. `refactor(<chart>): inline shared-module subsets as bundle-local files`
   — **purely ADDITIVE: create the bundle-local module files only.** No component
   edits, no import swaps, no test changes. Nothing references the new files yet,
   so the full suite is **trivially green** and the diff is reviewable as a single
   question: "is the inlining a faithful subset of the shared modules?"
2. `feat(<chart>): GraphQL-only self-fetch with graphqlQuery override`
   — everything behavioral, riding together: the import swap (component `c/*` →
   `./*`, test mocks `c/d3Lib` → `../d3Loader`; §3), the §4.3 render-orchestration
   hardening, the TDD GraphQL-only conversion (§4.1 RED → §4.2 GREEN — remove Apex
   - `soqlQuery` + `fetchMode`, add `graphqlQuery`), and the `.js-meta.xml` edit
     (§5). GREEN at the end.
3. `docs(...)` — recipe/CHANGELOG updates as needed.

**Why the import swap cannot ride in commit 1.** The inlined `utils.js` omits
`createLayoutRetry` (§2.2 — it carries the §4.3 render-orchestration defect). The
moment the component switches from `c/chartUtils` to `./utils`, its
`createLayoutRetry` import and call sites dangle and the suite goes red — until
the §4.3 hardening removes them. So the import swap and the §4.3 hardening are
**coupled** and must land together in commit 2; there is no way to swap imports in
commit 1 and stay green. Keeping commit 1 additive-only (new files, zero
references) is exactly what makes it independently green — do not try to swap
imports there.

---

## 2. Inline the used-subset modules

### 2.1 Decision procedure (how to trace what to copy)

1. Open the component and list its `c/*` imports. For bar:
   `loadD3` (d3Lib); `prepareData, aggregateData, OPERATIONS, MAX_RECORDS`
   (dataService); `getColors, DEFAULT_THEME` (themeService);
   `formatNumber, truncateLabel, createTooltip, createResizeHandler,
buildTooltipContent, createLayoutRetry, applySvgA11y` (chartUtils);
   `buildAggregateQuery, buildRecordQuery, normalizeAggregate, normalizeRecords`
   (graphqlService).
2. For **each** imported symbol, open the shared module and trace its transitive
   closure — every helper and module-level constant it calls. Copy the closure,
   not just the named export. Bar examples:
   - `prepareData` pulls in `validateData`, `validateFields`, `truncateData`,
     `MAX_RECORDS`.
   - `aggregateData` pulls in `OPERATIONS`.
   - `getColors` pulls in `extendColors`, `PALETTES`, `DEFAULT_THEME`.
   - `buildTooltipContent` defaults its formatter to `formatNumber`, so
     `formatNumber` comes too.
   - `buildAggregateQuery`/`buildRecordQuery` pull in `buildWhere` → `formatValue`,
     `OPERATORS`, and `AGG_FN`.
3. **Do NOT copy** exports the chart never touches. Dropped from the bar inlines:
   `getD3`/`resetD3`; `CHART_LIMITS`, `sampleData`, `aggregateSeriesData`,
   `computeQuartiles`, `computeRunningTotal`, `buildMatrix`, `buildHierarchy`,
   `applyFilterClause`; `THEMES`, `createColorScale`, `getSequentialRamp`,
   `SEMANTIC_*`; `formatCurrency`, `formatPercent`, `getContrastColor`,
   `parseDate`, `computeDateExtent`, `calculateDimensions`; `buildMultiGroupQuery`,
   `normalizeMultiGroup`.
4. Rewrite any inlined comment that is now **actively false** in a standalone
   bundle (CLAUDE.md permits removing only false comments). The dataService and
   graphqlService docstrings referenced "prefer server-side getAggregatedData
   Apex" and `(use dataSource="apex")` — those were rewritten to describe the
   client-side / record-query reality. Do not add temporal "copied from X" notes;
   ABOUTMEs must be evergreen ("Bundle-local … for the d3<Chart> bundle").

### 2.2 File layout (design's suggested names — kept verbatim)

```
<chart>/
  d3Loader.js   # loadD3 singleton + CSP fetch/eval fallback
  theme.js      # PALETTES, DEFAULT_THEME, extendColors, getColors
  data.js       # MAX_RECORDS, OPERATIONS, validate/truncate/prepare/aggregate
  utils.js      # formatters, tooltip, resize observer, applySvgA11y
  graphql.js    # buildWhere/buildRecordQuery/buildAggregateQuery/normalizers
```

Note: do **not** inline the shared `createLayoutRetry` — it carries the
render-orchestration defect (§4.3). The resize observer replaces it.

Every inlined file starts with a 2-line `// ABOUTME:` header. `graphql.js` (a
bundle-local module) coexists with the platform `lightning/graphql` import — the
compiler distinguishes `./graphql` (relative) from `lightning/graphql` (bare) so
there is no collision; jest's `moduleNameMapper` for `^lightning/graphql$` does
not match the relative path either.

Bar inlined line counts: d3Loader 79, theme 99, data 173, utils 229, graphql 141.

### 2.3 The canonical free-text normalizer

Pin this adapted `normalizeRecordsGeneric` in every bundle's `graphql.js`. It
extends the shared version with **object-key auto-detection** (so a free-text
query targeting any object is accepted) and a **project-all fallback** (project
every node field when `fields` is omitted). Both are needed for the admin
override; the shared version required an explicit object + field list.

```js
export function normalizeRecordsGeneric(data, { objectApiName, fields } = {}) {
  const queryRoot = data?.uiapi?.query;
  if (!queryRoot) return [];
  const key =
    objectApiName && queryRoot[objectApiName]
      ? objectApiName
      : Object.keys(queryRoot)[0];
  if (!key) return [];
  const edges = queryRoot[key]?.edges ?? [];
  return edges.map((e) => {
    const node = e.node ?? {};
    const record = {};
    (fields ?? Object.keys(node)).forEach((f) => {
      record[f] = node[f]?.value ?? null;
    });
    return record;
  });
}
```

---

## 3. Switch imports + test mocks (commit 2 — opening moves)

This is the first move **inside commit 2**, and it rides with the §4.3 hardening —
the two are coupled (§1). Do **not** expect an independently-green checkpoint
after the bare import swap: once the component imports from `./utils`, its dangling
`createLayoutRetry` reference reddens the suite until §4.3 removes it. Green is
confirmed only after §4.3 has landed.

- Component: `c/d3Lib` → `./d3Loader`, `c/dataService` → `./data`, etc.
- **The one non-obvious move:** the tests mock the loader. Change
  `jest.mock("c/d3Lib", …)` + `import { loadD3 } from "c/d3Lib"` to
  `jest.mock("../d3Loader", …)` + `import { loadD3 } from "../d3Loader"`.
  **A `jest.mock` of a bundle-relative path works**: jest keys the module
  registry by resolved absolute filename, so the test's `../d3Loader` and the
  component's `./d3Loader` are the same module and the mock applies to both.
  Verified in Wave 0 (full suite stayed green once the swap + §4.3 rode in).
- If the chart uses the gantt-specific `normalizeRecords` and you chose not to
  inline it, switch its Count path to `normalizeRecordsGeneric` in this same
  commit. Output is identical (`[{ [groupByField]: value }, …]`), so tests stay
  green.

Run `npx jest --silent` **after §4.3 has landed** → must be green before
committing commit 2.

---

## 4. Component conversion (commit 2, TDD)

### 4.1 Rewrite tests first (RED)

Per tier:

- Delete `@salesforce/apex/*` imports + `jest.mock(...apex..., { virtual: true })`
  and the `mockResolvedValue` lines in `beforeEach`.
- Delete every test that asserts on `executeQuery`/`getAggregatedData`/`soqlQuery`
  behavior or sets `fetchMode`. **Grep for leftovers** — a lingering
  `expect(executeQuery)...` in a test you kept becomes a `ReferenceError` once
  the import is gone. Command:
  `grep -nE 'executeQuery|getAggregatedData|soqlQuery|fetchMode|@salesforce/apex' __tests__/*.js`
- The old "no data source → error" expectation becomes a **no-data state**
  (neither error nor chart), because an un-provisioned wire is not an error.
- Add override coverage to the `.graphql.test.js` tier: (a) free-text
  `graphqlQuery` used verbatim + aggregated client-side, (b) free-text wire
  errors surface, (c) a blank/whitespace `graphqlQuery` falls through to the
  structured builder, (d) `recordCollection` beats a set `graphqlQuery`.
- **Precondition — confirm the chart ships `.e2e`/`.integration` tiers.** The
  happy-path conversion below has nowhere obvious to live in a chart that only ships
  two tiers (`.test.js` + `.graphql.test.js`). If the base bundle lacks the
  `.e2e`/`.integration` tiers, **do NOT silently skip this step** — instead place
  the converted happy-path wire test in the `.graphql.test.js` tier (so a real
  self-fetch scenario still runs end to end), AND flag the absent
  `.e2e`/`.integration` tiers in your DONE report as a backfill/waiver item. (Wave 1
  hit this on `d3StackedBarChart` (task #38); Wave 2 on `d3LineChart` /
  `d3AreaChart` / `d3SparklineGrid` (task #47) — all ship only `.test.js` +
  `.graphql.test.js`. Their e2e/integration happy-path conversion was deferred to
  an explicit backfill task rather than dropped.)
- Convert one happy-path fetch test in `.e2e`/`.integration` from the old
  Apex/SOQL path to a `graphql.emit(...)` wire path so a real self-fetch scenario
  still runs end to end.
- **Place that converted happy-path wire test in a happy-path/lifecycle
  `describe` block**, never wherever the donor Apex/SOQL test happened to sit. In
  Wave 0 the old SOQL test lived under `describe("error recovery")`; a successful
  self-fetch does not belong there. Describe-block accuracy is mandatory — hygiene
  check 4 (test name ↔ behavior) extends to the block name.

Run `npx jest force-app/main/default/lwc/<chart>` → confirm RED is exactly the
structured-wire tests (now un-gated) + the new override tests. If anything else
is red, it is test cruft, not the feature — fix the test.

### 4.2 Implement (GREEN)

Remove the Apex imports and the `soqlQuery`/`fetchMode`/`filterClause` `@api`
properties. `filterClause` was only read by the removed Apex path — dropping it
is a dead-surface removal (hygiene check 3), not a feature cut. Add:

```js
/**
 * Free-text UI API GraphQL document. When non-blank it overrides the
 * structured query builder as the wire's data source; the returned records
 * are aggregated client-side by groupByField/valueField/operation.
 */
@api graphqlQuery = "";

get hasFreeTextQuery() {
  return !!(this.graphqlQuery && this.graphqlQuery.trim());
}
```

**`gqlQuery` getter** — recordCollection wins, then free-text, then structured:

```js
get gqlQuery() {
  // recordCollection wins: skip the wire so it is never the data source.
  if (this.recordCollection && this.recordCollection.length > 0) {
    return undefined;
  }
  // Admin free-text override: pass the document straight to the wire.
  if (this.hasFreeTextQuery) {
    return gql`
      ${this.graphqlQuery}
    `;
  }
  // Structured builder path.
  if (!this.objectApiName || !this.groupByField || !this.operation) {
    return undefined;
  }
  if (this.operation !== OPERATIONS.COUNT && !this.valueField) {
    return undefined;
  }
  let queryString;
  try {
    queryString =
      this.operation === OPERATIONS.COUNT
        ? buildRecordQuery({ objectApiName: this.objectApiName,
            fields: [this.groupByField], filter: this.graphqlFilter,
            first: this.recordLimit || 2000 })
        : buildAggregateQuery({ objectApiName: this.objectApiName,
            groupByField: this.groupByField, valueField: this.valueField,
            operation: this.operation, filter: this.graphqlFilter,
            first: this.recordLimit || 2000 });
  } catch {
    return undefined; // leave the wire un-provisioned; error surfaces below
  }
  return gql`
    ${queryString}
  `;
}
```

**Wire handler** — drop the `fetchMode` gate; guard recordCollection; branch
free-text → generic-normalize + client-aggregate, else the chart's normal path:

```js
@wire(graphql, { query: "$gqlQuery" })
wiredAggregate({ data, errors }) {
  if (this.recordCollection && this.recordCollection.length > 0) return;
  if (errors) { this.error = this._formatGqlErrors(errors); this.isLoading = false; return; }
  if (!data) return; // initial undefined emission
  try {
    let normalized;
    if (this.hasFreeTextQuery) {
      const fields = this.operation === OPERATIONS.COUNT
        ? [this.groupByField]
        : [this.groupByField, this.valueField];
      const records = normalizeRecordsGeneric(data, { objectApiName: this.objectApiName, fields });
      if (!records.length) {
        // Hint the record-query contract, not the generic "empty" message.
        this.error = "The GraphQL Query returned no records. It must be a UI API record query (uiapi.query).";
        this.isLoading = false; return;
      }
      normalized = this._aggregateRawData(records);
    } else if (this.operation === OPERATIONS.COUNT) {
      const records = normalizeRecordsGeneric(data, { objectApiName: this.objectApiName, fields: [this.groupByField] });
      normalized = this._aggregateRawData(records);
    } else {
      normalized = normalizeAggregate(data, { objectApiName: this.objectApiName,
        groupByField: this.groupByField, valueField: this.valueField, operation: this.operation });
    }
    if (!normalized.length) this.error = "No data after aggregation";
    else { this.chartData = normalized; this.error = null; this.chartRendered = false; }
  } catch (e) { this.error = e.message; }
  this.isLoading = false;
}
```

**`loadData`** collapses to recordCollection-only (avoid a trailing `return;` —
ESLint `no-useless-return` fails the lint-staged hook):

```js
async loadData() {
  if (this.recordCollection && this.recordCollection.length > 0) {
    this.chartData = this._aggregateRawData([...this.recordCollection]);
  }
}
```

**Loading state — every conversion must carry this.** The old
`finally { this.isLoading = false }` clears the spinner before the wire emits,
producing a no-data flash on the self-fetch path. Gate it on whether a wire is
provisioned and still pending:

```js
} finally {
  // Keep the spinner up while a GraphQL query is provisioned but has not yet
  // emitted data or an error; the wire handler clears isLoading on arrival.
  if (this.hasData || this.error || !this.gqlQuery) {
    this.isLoading = false;
  }
}
```

TDD it: with a provisioned wire and no emission yet, the spinner shows (no chart,
no error); the first `graphql.emit(...)` clears it. When no wire is provisioned
(recordCollection resolved it, or nothing is configured) the spinner clears
immediately — the no-data state is then correct, not a flash.

### 4.3 Render orchestration hardening — every conversion must carry this

The inlined render loop must **not** reproduce the shared `createLayoutRetry`
silent give-up. Live on AGENT, a cold-cache/wedged boot rendered an **empty
shell** (slds-card + chart-container + tooltip element, but no svg, no spinner,
no error). Two silent failure modes cause it:

1. **rAF give-up at width 0.** `createLayoutRetry` polls the container width for
   `maxAttempts=60` frames then returns with no signal (and rAF is throttled on
   hidden/busy pages). Past the budget the chart never renders — and in the
   original `initializeChart` the ResizeObserver was never even installed at
   width 0, so a later growth is never caught.
2. **Sub-margin `renderChart` bail after the tooltip.** `initializeChart`'s gate
   was `width === 0`, so a transient width **smaller than the chart's own
   horizontal margins** passes the gate, creates the tooltip, then `renderChart`
   computes `width = containerWidth - (left + right margin)` ≤ 0 and returns
   **before appending the svg** — while `initializeChart` returns `true`,
   latching `chartRendered`. Tooltip present, no svg, never retried. (This is the
   exact state observed live.) The trigger width is **chart-specific**: bar's
   margins sum to ~80px (a 40px container fires it), `d3HorizontalBarChart`'s are
   `left 160 + right 30 = 190px`, and the time-series line-family
   (line/area/step/variableColorLine) all use `left 60 + right 30 = 90px`.
   sparklineGrid is different in kind — its bail threshold is **grid chrome**, not
   a plotting margin: `labelWidth 120 + valueWidth 80 + 40 = 240px`. Compute the
   threshold from the chart in front of you, not from bar's numbers.

**Fix — bundle-local `utils.js` + component; do NOT touch shared chartUtils:**

- **Delete the inlined `createLayoutRetry`.** Install a **single lifetime**
  `createResizeHandler` observer in `initializeChart` (guarded by
  `if (!this.resizeHandler)`), which draws on the first measurable width and
  re-draws on every resize — **no give-up window**. Keep the immediate
  `getBoundingClientRect` draw only as a warm-path fast path. Create the tooltip
  once (`if (!this.tooltip)`). `disconnectedCallback` just calls `cleanup()`
  (which disconnects the observer); drop the `_layoutRetry` field + cancel and
  the `createLayoutRetry` import.
- **Wrap every render in `_safeRenderChart`** (try/catch) so an exception thrown
  mid-render surfaces to the component error state (same UX as wire errors),
  never a silent partial render.

```js
initializeChart() {
  const container = this.template.querySelector(".chart-container");
  if (!container) return false;
  if (!this.tooltip) this.tooltip = createTooltip(container);
  if (!this.resizeHandler) {
    this.resizeHandler = createResizeHandler(container, ({ width }) => {
      if (width > 0) this._safeRenderChart(width);
    });
    this.resizeHandler.observe();
  }
  const { width } = container.getBoundingClientRect();
  if (width > 0) this._safeRenderChart(width);
  return true;
}

_safeRenderChart(containerWidth) {
  try {
    this.renderChart(containerWidth);
  } catch (e) {
    this.error = e.message || "Failed to render chart";
    this.isLoading = false;
  }
}
```

Tests (unit tier): (a) container 0-width, capture the RO callback, fire it with a
measurable width → chart renders (**RED** against old code, which installs no
observer at width 0); (b) a render exception → error state visible (see §8's
mockD3-leak trap — a **module-level shared-const `mockD3`** used to force the throw
must be restored in a `finally`, or the mutation reddens later describes); (c)
disconnect disconnects the observer; (d) exactly one observer across the lifecycle.
The sub-margin fixture width in (a)/(b) is **chart-specific** — feed a width below
the chart's own `left + right` margin sum (bar ~80px so 40px works;
`d3HorizontalBarChart` needs a width under 190px; the line-family's is 90px so use
50–80; sparklineGrid bails on **grid chrome** at 240px, so go under that). Copying
bar's "40px" onto a wide-margin chart silently tests nothing, because 40px already
clears that chart's zero-width gate the old way.

**Why this matters more now:** with `recordCollection` the parent usually sizes
the container before data arrives; with GraphQL-by-default the chart boots and
self-fetches inside App Builder / Flow where the container is frequently
unmeasurable for many frames — so this pre-existing library defect fires far more
often. Every converted chart needs the fix in its inlined `utils.js`.

---

## 5. `.js-meta.xml` diff template

- **Remove** the `soqlQuery` `<property>` (and its "Data Source" comment) and the
  `fetchMode` `<property>`.
- **Add** the `graphqlQuery` property. **Keep the free-text contract and the
  structured-Count bound in separate descriptions** — they are different concerns:
  - The **structured-Count bound** ("Count is bounded to the first Record Limit
    rows, default 2000") lives on the `operation` (Aggregation) property, since it
    describes the built Count query, not the free-text one.
  - The **free-text contract** lives on `graphqlQuery`: it must be a **record
    query** (`uiapi.query`) whose node selects the Group By and Value fields as
    top-level fields, and it carries the accepted footgun (see §Judgment).

```xml
<property name="operation" type="String" label="Aggregation" default="Sum"
  datasource="Sum,Count,Average"
  description="How to aggregate the values. On the GraphQL self-fetch path, Count is bounded to the first Record Limit rows (default 2000)."/>

<!-- GraphQL Query Override -->
<property name="graphqlQuery" type="String" label="GraphQL Query"
  description="Optional override of the built query. Must be a UI API record query (uiapi.query) whose node selects the Group By Field and Value Field as top-level fields; the returned rows are aggregated client-side by <the chart's field mappings>. UI-API-queryable objects only; at most 2,000 records; GraphQL syntax. Footgun: if the Value Field is missing from the query, bars aggregate to zero rather than erroring. Leave blank to build the query automatically."/>
```

- **Broaden `objectApiName` only when the chart has drill-down.** It now also
  drives the self-fetch, so if the label/description said only "Drill-Down
  Object", widen it (bar became label "Object API Name", description "Object to
  query. When set (and no records are passed in), the chart self-fetches this
  object via GraphQL. Also used for drill-down navigation…"). For a chart with no
  drill-down, just label it "Object API Name" and describe it as the query object
  — do not imply navigation.
- Keep `apiVersion` at **65.0** (floor for dynamic `gql` string interpolation).
- Update `<description>` only if it names SOQL/Apex (bar's did not).

### 5.1 Flow screen target (F1 — every converted chart, uniformly)

Add `lightning__FlowScreen` to `<targets>` and a **second** `<targetConfig>` for
it. **Adopt-and-keep, never strip:** if the chart already declares
`lightningCommunity__Default`/`lightningCommunity__Page` targets (several Wave-2
time-series charts do), **preserve** them — you are adding FlowScreen, not
replacing the target list (mirrors the meta-merge sync principle, source side).
Flow passes a record collection in, so expose `recordCollection` (as a
**generic sObject collection**) plus the render config — **not** the self-fetch
knobs (`graphqlQuery`, `objectApiName`) and not drill-down/limit knobs. The
generic sObject collection uses a `<propertyType extends="SObject">` type
parameter with `type="{T[]}"` (verified against the Salesforce LWC docs; not
deploy-verified in Wave 0 since deploys are out of scope):

```xml
<targets>
  <target>lightning__AppPage</target>
  <target>lightning__RecordPage</target>
  <target>lightning__HomePage</target>
  <target>lightning__FlowScreen</target>
</targets>
...
<targetConfig targets="lightning__FlowScreen">
  <propertyType name="T" extends="SObject" label="Record Type"
    description="Generic sObject type of the input record collection"/>
  <property name="recordCollection" type="{T[]}" label="Records" role="inputOnly"
    description="Collection of records to chart, from the flow"/>
  <property name="groupByField" type="String" label="Group By Field"
    description="API name of the category field"/>
  <property name="valueField" type="String" label="Value Field"
    description="API name of the numeric field to aggregate (not required for Count)"/>
  <property name="operation" type="String" label="Aggregation"
    datasource="Sum,Count,Average" description="How to aggregate the values"/>
  <property name="height" type="Integer" label="Height (px)"
    description="Chart height in pixels"/>
  <property name="theme" type="String" label="Color Theme"
    datasource="Salesforce Standard,Warm,Cool,Vibrant"
    description="Color palette for the chart"/>
  <property name="advancedConfig" type="String" label="Advanced Config (JSON)"
    description='{"showGrid": true, "showLegend": false, ...}'/>
</targetConfig>
```

**The XML above is bar's list — an EXAMPLE, not a template.** Expose the
render-config properties _the chart in front of you actually reads_, including its
chart-specific knobs: `sortBy`/`sortDirection` on `d3SortedBarChart`,
`seriesField` on the stacked/matrix charts, and so on. Keep the always-present
ones (field mappings, `operation`, `height`, `theme`, and `advancedConfig` where
the chart parses it). Omit the self-fetch knobs (`graphqlQuery`, `objectApiName`)
and the drill-down/limit knobs unless a chart already treats them as
flow-relevant. jest does not parse the meta, so the Flow config is not covered by
the suite — verify it at deploy time in the release step.

---

## 6. Chart-clone hygiene scan (run before reporting DONE)

Donor here is the **pre-conversion** chart; the leak is Apex/SOQL/fetchMode
strings. Run and report all four:

```bash
# 1. Stale donor strings (source + tests). Expect zero, or an intentional survivor.
cd force-app/main/default/lwc/<chart>
grep -niE 'soql|apex|fetchmode|executequery|getaggregateddata|filterclause|D3ChartController' \
  <chart>.js d3Loader.js data.js theme.js utils.js graphql.js <chart>.js-meta.xml <chart>.html <chart>.css __tests__/*.js
# 2. Stale config keys: confirm every advancedConfig key the tests set is one renderChart reads.
# 3. Dead surface: every @api property AND every <property> in the meta is read by the component.
# 4. Test-name ↔ behavior: each renamed it() asserts what its description claims.
# Import ban:
grep -nE 'from "c/(d3Lib|dataService|themeService|chartUtils|graphqlService)"|@salesforce/apex' \
  <chart>.js d3Loader.js data.js theme.js utils.js graphql.js __tests__/*.js
```

(The repo hook blocks Bash `grep -r`; the commands above are non-recursive on an
explicit file list, which is allowed.) In Wave 0 the only survivor was one
integration-test ABOUTME that still said "Apex … are mocked" — corrected.

---

## 7. Verification gate

```bash
npx jest --silent                                   # FULL suite green (the other charts still use shared modules)
npx eslint force-app/main/default/lwc/<chart>       # exit 0 (do NOT run repo-wide `npm run lint` — stale aura glob)
npx prettier --write <only files you touched>       # never `npm run prettier` (reformats whole repo)
```

Commit; the husky + lint-staged pre-commit hook re-runs prettier/eslint/related
jest on staged files. Never `--no-verify`. Live-org render verification + the
detach/reattach deploy sequencing belong to the **release** step, not the
conversion (SCOPE excludes deploys here).

---

## 8. Known traps

- **`@api` names cannot start with `data` or `on`** (LWC1107) — they collide with
  `data-*` attributes / `on*` handlers. `graphqlQuery` is safe; watch chart props
  like `dataField` in other bundles.
- **Aggregate envelope has a double `aggregate` wrapper:**
  `data.uiapi.aggregate.<Object>.edges[].node.aggregate.<Field>.{value | <fn>.value}`.
  The record envelope does not: `data.uiapi.query.<Object>.edges[].node.<Field>.value`.
  The free-text override targets the **record** envelope (`uiapi.query`) — an admin
  who pastes an aggregate query gets no rows.
- **`lightning/graphql` v2 jest mock is repo-shared** at `__mocks__/lightning/graphql.js`
  via `moduleNameMapper` (the pinned sfdx-lwc-jest only ships the v1 stub). It
  provides `graphql.emit(data)`, `graphql.emitErrors(errs)`, and a `gql` that
  reconstructs the interpolated string. It is **not** part of any bundle — leave it.
- **The shared mock D3 cannot observe summation.** The hand-rolled mock D3 that
  the unit/`.graphql` tiers reuse hard-codes `max: jest.fn(() => 500)` — a
  constant, so it is blind to whether the client-side aggregation actually summed
  anything. A test that must prove summation (e.g. the free-text path sums
  duplicate `(category, series)` keys — §9.3(b)) needs a **dedicated real-max
  mock**: `max: (arr, acc) => Math.max(...arr.map(acc ?? ((d) => d)))` plus a
  `scaleLinear().domain` stub that **captures every domain call** into an array.
  The test then finds the numeric `[0, max]` y-scale domain call and divides out
  the axis headroom to recover the summed total (e.g.
  `Math.round(domain[1] / 1.1) === 350`). Pattern: `d3StackedBarChart`'s
  `createSummationMockD3` in its `.graphql.test.js`.
- **Module-level shared-const `mockD3` leaks a forced throw across describes.** The
  §4.3 render-exception test forces `renderChart` to throw by mutating the mock D3
  (e.g. making `mockD3.select` throw). If the bundle's tests share **one
  module-level `const mockD3`** instead of a per-test `createMockD3()` factory, that
  mutation persists into later `describe` blocks and reddens unrelated tests
  (wave2-`d3StepChart` lost 6 tests to exactly this before adding a guard). Fixes,
  in order of preference: (1) use the chart's per-test `createMockD3()` factory if
  it has one; (2) swap in a separate `throwingD3` loader return for just that test
  (`d3LineChart`'s approach); (3) failing both, save `mockD3.select` before the
  forced throw and restore it in a `try`/`finally` inside that single test.
- **Whole-string `gql` interpolation (`` gql`${queryString}` ``) is undocumented**
  but is the same mechanism the structured builders already ship; live-verified per
  the design. Wave 0 confirms the jest-level mechanism (the mock reconstructs and
  tests assert the string); **org verification is a release-step task**, not part
  of the conversion.
- **apiVersion 65 floor** for dynamic `gql`. Do not bump or drop it.
- **Relative `jest.mock`** of `../d3Loader` is required and it works (§3). Do not
  try to mock `c/d3Loader` — the loader is bundle-local, not a `c/` module.
- **`no-useless-return`** — the collapsed `loadData` must not end with a bare
  `return;` or the lint-staged hook fails the commit.
- **Do NOT delete the repo-shared `__mocks__/@salesforce/apex/D3ChartController.*.js`
  files.** They live at the repo root, not in any bundle, and the 39
  not-yet-converted charts' suites still import them via `moduleNameMapper`. You
  only stop _referencing_ them from your bundle's tests; they get deleted in the
  final teardown wave (with `D3ChartController` itself), not per chart.
- **No-data flash on self-fetch** — if you skip the §4.2 loading-state gate, the
  spinner clears before the wire emits and the chart flashes the "No data" state.
  Carry the gate on every conversion.

---

## 9. Per-family conversion + free-text recipe

Bar is an aggregation chart with a Count fallback and drill-down. Every family
below gets an **explicit** `graphqlQuery` free-text recipe — the free-text
document is always a flat `uiapi.query` record set (normalize with the §2.3
`normalizeRecordsGeneric`, which auto-detects the object key so a **blank
`objectApiName` still works**); what differs is the client-side computation that
turns those flat rows into the chart's data shape.

### 9.0 Already-GraphQL-only charts (R2) — skip the removals

Some charts never had the Apex/`soqlQuery`/`fetchMode` surface. **Verified:
`d3GanttChart`** has no `fetchMode`, `soqlQuery`, `filterClause`, or
`@salesforce/apex` import — it already self-fetches through `lightning/graphql`
with a recordCollection-priority gate. For such a chart, conversion is **only**:

1. Inline the used subsets (§2) and switch to relative imports (§3).
2. Add the `graphqlQuery` free-text override with the chart's family-specific
   normalizer (below) + the empty-record hint.
3. Confirm the existing recordCollection-priority gate and add the §4.2 loading
   state if missing.
4. Add the FlowScreen target + Flow targetConfig (§5.1).

Skip every "remove Apex / remove soqlQuery / remove fetchMode" step and skip the
apex-mock deletions in the tests — there are none. Verify with the §6 grep before
assuming; charts vary.

### 9.1 Aggregation charts (bar family: sortedBar, horizontalBar, lollipop, pie, donut, waffle, funnel, progress, gauge, bullet)

The bar baseline. Structured path: `buildAggregateQuery`/`normalizeAggregate`
(Sum/Avg) with a `buildRecordQuery` Count fallback. **Free-text:** project
`[groupByField, valueField]` (or `[groupByField]` for Count) and run the chart's
existing client-side `aggregateData` (`_aggregateRawData`). Numbers match the
aggregate path because the client-side group-by sums duplicate keys.

### 9.2 Raw-record charts, no aggregation — incl. date X-axis (line, area, step, difference, slope, variableColorLine, scatter, bubble, dotPlot, sparklineGrid)

These self-fetch raw records via `buildRecordQuery` + `normalizeRecordsGeneric`,
**not** `buildAggregateQuery`. Their structured path fetches raw, un-summed rows
(same contract as `recordCollection`) and hands them straight to the component's
own record-shaping step — there is **no server-side pre-aggregation** and **no
aggregate branch** in `gqlQuery`. The **date-axis members (line, area, step,
variableColorLine)** belong here, **NOT** in the gantt §9.4 path: each already
imports `normalizeRecordsGeneric` (not the gantt `normalizeRecords`) and shapes
dates through its **own** `getDateParser()` / `processTimeSeriesData()` — never
`chartUtils.parseDate`. Inlining the gantt `normalizeRecords` or
`chartUtils.parseDate` on these charts is **dead surface**.

**One normalizer, both paths.** Use the single auto-detecting
`normalizeRecordsGeneric` (§2.3) for **both** the structured and the free-text
path — it auto-detects the object key, so a blank `objectApiName` still works.
`graphql.js` inlines only `buildRecordQuery` + `normalizeRecordsGeneric` +
`buildWhere`/`formatValue`/`OPERATORS` (no aggregate builder, no aggregate
normalizer). Keep **all** date/record shaping in the component's existing
`getDateParser` / `processTimeSeriesData` (or `processEntityData` for the grid);
`graphql.js` does no date work.

**Parity invariant = "free-text feeds the same shaping step as structured," NOT
§9.3(b) summation.** Because the structured path fetches raw records and never
pre-sums, the free-text path already matches it once both run through the same
`processTimeSeriesData` / `processEntityData`. **Do NOT add a client-side
summation to the free-text branch** — that would INTRODUCE a divergence the
structured path does not have. (Contrast §9.3(b): stacked-bar's _structured_ path
arrives server-pre-summed, so there the free-text branch MUST sum to catch up —
reasoning specific to the pre-summed families that does **not** transfer here.)
Prove parity, not summation: a multi-series free-text response renders N paths; an
area/stacked response routes through the same `d3.stack()`/pivot as structured.

**Unified-wire handler — the recommended shape for a new raw-record conversion.**
Prefer a **single** `@wire` handler that runs `normalizeRecordsGeneric` →
`processTimeSeriesData`/`processEntityData` on **every** emission, with the
free-text branch adding **only** the empty-record record-query hint (§4.2). All
four Wave-2 line-family charts used this shape; it is cleaner than bar's §4.2
two-branch template and structurally eliminates the path-parity divergence — there
is exactly one shaping path, so free-text cannot drift from structured. Bar's
two-branch template stays fine for aggregation charts; for raw-record charts,
reach for the unified handler.

**sparklineGrid is the one member that genuinely buckets/sums** — it has an
`operation` @api and groups by `entityField`, so `processEntityData` sums
duplicate `(entity, month)` keys. But it sums **identically on both paths** (the
same `processEntityData` bucket runs for structured and free-text), so there is
**still no free-text-only summation step** and the unified-wire invariant holds.
Its sub-margin `renderChart` bail threshold (§4.3) is **grid chrome**, not a
plotting margin — `labelWidth 120 + valueWidth 80 + 40 = 240px`.

**Per-chart JSDoc, not verbatim.** The §9.3(b) "copy `graphql.js` JSDoc verbatim
between siblings" rule is **matrix-family-scoped**. On raw-record charts the
`normalizeRecordsGeneric` docblock legitimately differs per chart — each names its
own field projection (`[xField, yField]`, `[xField, yField, sizeField]` for
bubble, the date + value pair for the time-series members) — so do **not** force
byte-identical docblocks here.

**Field projection:** normalize with `normalizeRecordsGeneric` projecting the
chart's field set (`[xField, yField]`; `[xField, yField, sizeField]` for bubble;
the date + value fields for the time-series members), then feed the chart's
existing record-shaping (date parsing, sorting, sampling). Use the §9.3(b) blessed
`[...new Set([...].filter(Boolean))]` dedup form.

**Go-forward — record-limit constant convention.** Declare the per-chart record
cap as a single-key object `const CHART_LIMITS = { <CHART_KEY>: n };`
(line/step/variableColorLine/sparklineGrid shipped this shape; area shipped a bare
scalar). Use the object shape for future raw-record conversions. _Convention for
new work only — do NOT rewrite already-converted bundles to match._

**Go-forward cleanup nit (log, do not fix mid-conversion):** `d3LineChart`'s
`.js-meta.xml` `dateField` default is `"CreatedDate"` while its JS `@api dateField`
default is `"CloseDate"`. Reconcile in a dedicated cleanup pass, not inside a
conversion.

### 9.3 Matrix / hierarchy + stacked-bar families

Wave 1 converted three stacked-bar members and found the original single section
conflated two genuinely different data paths. It splits into two sub-families that
do **not** share a client-side shaping step — pick the one your chart belongs to.

#### 9.3(a) True matrix / hierarchy charts (heatmap, chord, sunburst, treemap)

Structured path: grouped rows → `buildMatrix` / `buildHierarchy` (from
dataService) → the chart's D3 shape. **Free-text:** the pasted document returns
**flat `uiapi.query` records** — one row per source record, un-summed. So you MUST
pivot+sum client-side before feeding `buildMatrix`/`buildHierarchy`, or the
numbers will not match the structured aggregate path (which sums server-side):

1. `normalizeRecordsGeneric` with the matrix/hierarchy field list.
2. Group rows by the composite key (`groupByField|seriesField`, or the full
   hierarchy path) into a Map, **summing `valueField`** per key with the chart's
   `operation` — a small reducer for hierarchy, or `aggregateSeriesData` for a
   two-field matrix.
3. Feed the summed rows to `buildMatrix` / `buildHierarchy` (both accept flat
   rows) → the chart's D3 shape.

#### 9.3(b) Stacked-bar family (stackedBar, stackedHorizontalBar, normalizedBar)

These members converted in Wave 1. They **never touch `buildMatrix` /
`buildHierarchy`** — inlining or reaching for those here is **dead surface**.
Their pipeline is:

- **Structured, series set:** `buildMultiGroupQuery` + `normalizeMultiGroup`
  (two-field group). The wire result arrives **pre-summed by the server — do NOT
  re-sum on this branch.**
- **Free-text:** `normalizeRecordsGeneric([groupByField, seriesField, valueField])`
  → `aggregateSeriesData` (pivot + SUM of duplicate `(category, series)` keys) →
  the chart's **existing in-render pivot + `d3.stack()`**. The flat rows arrive
  un-summed, so this branch MUST sum them or free-text numbers diverge from the
  pre-summed structured path.
- **Count** (either path) projects `[groupByField, seriesField]` — **no
  `valueField`**, matching the structured Count record query — and counts
  client-side through `aggregateSeriesData`.

**Mandatory-vs-optional series decision rule (decide per member).** This governs
which aggregators the bundle imports, and it is the difference between a clean
conversion and shipping dead surface:

- **Mandatory series — `d3NormalizedBar`.** A 100%-composition chart is
  meaningless without a composition dimension; its `_aggregateRawData` _throws_
  when `seriesField` is blank. So **drop the single-field trio** `aggregateData` /
  `buildAggregateQuery` / `normalizeAggregate` — there is no no-series path for
  them to serve, and importing them is dead surface (hygiene check 3). Route
  **Count** through `aggregateSeriesData` (it supports Count via `group.count`),
  fed by a `buildRecordQuery` raw fetch.
- **Optional series — `d3StackedBarChart`, `d3StackedHorizontalBar`** (default
  `@api seriesField = ""`). **Keep both aggregator sets.** `seriesField` present →
  `buildMultiGroupQuery` / `normalizeMultiGroup` + `aggregateSeriesData`;
  `seriesField` blank → the single-field `buildAggregateQuery` /
  `normalizeAggregate` + `aggregateData` no-series path. Removing the single-field
  trio here would cut a live path.

**Field-projection dedup (blessed, all Count/free-text projections).** Build every
projected field list as `[...new Set([groupByField, seriesField, valueField].filter(Boolean))]`.
The `.filter(Boolean)` drops a blank `seriesField` or an omitted `valueField`
(Count); the `Set` guards against a collision when two mappings name the same
field (e.g. `groupByField === seriesField`), which would otherwise malform the
query. This echoes the repo CLAUDE.md SOQL field-set dedup lesson — apply it in
every family's Count and free-text projection, not only here.

**Canonical matrix-module wording (keep siblings byte-identical).** Adopt
`d3NormalizedBar`'s `buildMultiGroupQuery` error string as canonical for the
matrix builders — when an operation has no GraphQL aggregate function, throw:

```
`Aggregate operation not supported on the GraphQL aggregate path: ${operation} (Count fetches bounded raw records and counts client-side)`
```

The parenthetical tells the reader _why_ Count is absent from `AGG_FN`, which the
terser bar-era wording did not. The `graphql.js` JSDoc for `buildMultiGroupQuery`,
`normalizeMultiGroup`, and `normalizeRecordsGeneric` should be **copied verbatim
between the matrix siblings** — they are the same functions, and wording drift
between bundles is pure review noise. **This verbatim rule is
matrix-family-scoped:** on §9.2 raw-record charts the `normalizeRecordsGeneric`
docblock legitimately differs per chart (each names its own field projection), so
do **not** force byte-identical docblocks there.

**Prove the summation with a real-max mock.** The client-side pivot+sum above is
invisible to the shared `max: () => 500` mock D3, so a passing test proves
nothing. Use the dedicated real-max / domain-capture mock (§8,
`createSummationMockD3` pattern): emit a free-text response with a duplicated
`(category, series)` key and assert the recovered stacked total is the **summed**
value, not last-wins.

**Meta help text:** state that the free-text query selects the two group fields +
the value field as top-level node fields.

### 9.4 Date / time-domain charts — gantt + calendarHeatmap ONLY

**Scope:** this path is for **gantt and calendarHeatmap only.** The time-series
line-family (**line, area, step, variableColorLine**) does **NOT** live here —
those are §9.2 raw-record charts with a date X-axis (component-owned
`getDateParser`/`processTimeSeriesData`, single auto-detecting
`normalizeRecordsGeneric`). Routing a line-family chart through the gantt
`normalizeRecords` + `chartUtils.parseDate` path is exactly the dead-surface
mistake §9.2 warns against. What distinguishes the two §9.4 charts is that their
**structured render depends on a fixed record shape** the generic normalizer does
not produce.

gantt/calendarHeatmap's structured path uses the gantt-specific `normalizeRecords`
(fixed `{label,start,end}` shape) and/or `parseDate` / `computeDateExtent` from
chartUtils. **Free-text:** map the generic records to the chart's shape
explicitly —
`normalizeRecordsGeneric(data, { fields: [labelField, startField, endField] })`
then `rows.map(r => ({ label: r[labelField], start: r[startField], end: r[endField] }))`,
running each date through the inlined `parseDate`. **Critical:** the gantt
`normalizeRecords` indexes strictly by `objectApiName`, so it returns `[]` for a
free-text query when `objectApiName` is blank; the free-text path must use the
auto-detecting `normalizeRecordsGeneric` (§2.3) instead. Here — unlike the §9.2
line-family — you **keep both**: `normalizeRecords` for the structured wire (the
render depends on its fixed `{label,start,end}` shape), `normalizeRecordsGeneric`
for free-text. Do **not** blindly substitute one for the other.

### 9.5 Distribution / server-statistic charts (histogram, boxPlot, scatter)

These had server-side stat Apex that is **already computed client-side on the
graphql path**, so deleting the Apex branch is sufficient — no new math. The
server-stat methods a converter will encounter and remove:

- `getStatistics` — histogram (count/min/max/mean/median/stdDev)
- `getCorrelation` — scatter (Pearson r, slope, intercept)
- `getMultiGroupData` — heatmap/stacked (two-field group)
- `getXYData` — scatter/bubble raw XY
- `getDateRangeData` — gantt raw date ranges

**Free-text:** project the raw fields with `normalizeRecordsGeneric` and feed the
chart's existing client-side statistic (the same code the old `graphql` fetchMode
already used — `computeQuartiles` for boxPlot, the histogram binning math, the
scatter correlation reducer). **Require a test** that emits a raw-record wire
payload and asserts the client-side stat output (e.g. boxPlot quartiles, scatter
r), not just that the chart renders — this is the behavior the removed Apex used
to guarantee.

### 9.6 Cross-cutting

- **Count-bounded caveat:** any chart whose Count path uses `buildRecordQuery`
  (record query, then client-side count) is bounded to the first `recordLimit`
  (default 2000) rows — GraphQL has no server COUNT. Keep that sentence on the
  `operation` property (§5), separate from the free-text contract.
- **objectApiName label:** widen to "Object API Name" + self-fetch note only when
  the chart has drill-down to disambiguate; otherwise just name it the query
  object (§5).
- **Field-set dedup:** every Count/free-text projection uses the blessed
  `[...new Set([...fields].filter(Boolean))]` form (§9.3(b)) — a field collision
  or a blank/omitted mapping otherwise malforms the query. Applies to the bar
  (§9.1) and raw-record (§9.2) families too, not just the stacked family.

---

## Judgment outcomes (encoded above)

- **Free-text validation gap is ACCEPTED — no runtime guard.** `normalizeRecordsGeneric`
  sets every projected key (null when absent), so a free-text Sum query missing
  the value field aggregates to zero bars rather than erroring. This footgun is
  documented in the `graphqlQuery` meta help text (§5); do not add a runtime
  field-presence check.
- **Free-text is record-query-only** (`uiapi.query`). The empty-result path emits
  a hint naming the record-query contract (§4.2). The meta help text says "record
  query".
- **objectApiName rename is conditional** per §5 (only when it disambiguates
  drill-down vs query-object).
- **Describe-block accuracy is mandatory** (§4.1, hygiene check 4).
