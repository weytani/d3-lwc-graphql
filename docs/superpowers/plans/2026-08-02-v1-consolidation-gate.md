# d3-lwc-graphql v1.0.0 Consolidation Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Reworked 2026-08-02** for the spec's per-line suffix amendment (David: "put -soql or -graphql on the end of each chart"). The earlier revision's org-reconciliation and detach-dance tasks are obsolete — suffixed components are NEW bundles, so all org work is additive.

**Goal:** Close the v1.0.0 consolidation gate: rename the 16 converted charts to their `*Graphql` suffixed identities, backfill the 3 test-tier gaps, ship this line's own showcase pages to AGENT, build the Playwright live-sweep rig, refresh docs, and release v1.0.0.

**Architecture:** All repo work on `main` of `~/code/d3-lwc-graphql`; org work is additive deploys to AGENT (which also hosts the legacy unsuffixed d3-lwc-era bundles and, later, the soql line). Spec: `docs/superpowers/specs/2026-08-02-repo-split-soql-graphql-design.md` (§3 gate; §4 QA rig; Amendment 2026-08-02 suffixes).

**Tech Stack:** LWC/jest (sfdx-lwc-jest, jsdom), Salesforce CLI (`sf`) against AGENT, @playwright/test, git/gh.

## Global Constraints

- **Public repo.** No org credentials, org URLs, frontdoor URLs, session ids, or real record data in ANY committed file or committed screenshot. Playwright auth state lives in git-ignored `playwright/.auth/`. Committed baselines may show only `[D3DEMO]`-seeded synthetic data.
- **This line NEVER deploys shared modules, Apex classes, or unconverted charts** (spec amendment: those belong to the soql line / legacy). Org deploys name the exact suffixed bundles and the `d3_graphql_*` pages/tabs — never `--source-dir force-app/main/default/lwc` wholesale. If the org wedges with stale "design time component information" errors, redeploy the 16 suffixed bundles only (list them with `-m`), not the whole lwc dir.
- **Node 20 for every `sf` command**: prefix with `export PATH="/opt/homebrew/opt/node@20/bin:$PATH"`. jest runs on default node.
- The `d3` static resource is `force-app/main/default/staticresources/d3` — NO `.js` extension.
- NEVER `--no-verify`; husky + lint-staged must pass. Conventional commits, imperative mood.
- Jest TZ pinned `America/New_York`; chart date bucketing is UTC (Wave-2 rule).
- Plan-prescribed expected test values are HYPOTHESES — verify against the real component/donor at RED time; fix the TEST when reality differs and report the evidence.
- Chart-clone hygiene checklist (repo CLAUDE.md) applies to every donor-derived test file; report the greps run.
- Full jest suite runs whole (`npx jest --silent`); iterate per bundle via `npx jest force-app/main/default/lwc/<bundle>`.
- Suffix naming: folder/class `d3XxxGraphql`, tag `c-d3-xxx-graphql`, `masterLabel` gains ` (GraphQL)`. Rename-completeness gate per chart: `grep -rn "<oldName>" force-app/main/default/lwc/<newName>/ | grep -v "<newName>"` → zero, and same for the old kebab tag vs new.
- No new conversions (waves 4–8) ship before this gate closes.

## Versioning note

The 6 previously-unreleased conversions (sparklineGrid, pie, donut, lollipop, funnel, waffle) get no individual tags — everything folds into **v1.0.0**, whose CHANGELOG entry documents the six BREAKING conversions (legacy 3.5–3.9 template), the repo-wide `*Graphql` rename (BREAKING), the backfills, the showcase pages, and the QA rig.

---

### Task 1: Rename wave A — 8 charts to `*Graphql`

**Files:** `git mv` + edits across 8 bundles: d3BarChart, d3SortedBarChart, d3HorizontalBarChart, d3StackedBarChart, d3StackedHorizontalBar, d3NormalizedBar, d3LineChart, d3AreaChart → same name + `Graphql`.

**Interfaces:** Produces the renamed bundles later tasks reference (donors for backfills: `d3AreaChartGraphql`, `d3StackedHorizontalBarGraphql`, showcase/manifest entries, etc.).

Per chart (exact mechanics, shown for d3BarChart — repeat verbatim per chart, one commit each):

```bash
cd ~/code/d3-lwc-graphql/force-app/main/default/lwc
git mv d3BarChart d3BarChartGraphql
cd d3BarChartGraphql
for f in d3BarChart.js d3BarChart.html d3BarChart.js-meta.xml; do git mv "$f" "${f/d3BarChart/d3BarChartGraphql}"; done
cd __tests__
for f in d3BarChart.*; do git mv "$f" "${f/d3BarChart/d3BarChartGraphql}"; done
```

Then edit:

1. Component .js: `export default class D3BarChart` → `D3BarChartGraphql` (and any self-referential name strings/ABOUTME).
2. `.js-meta.xml`: `<masterLabel>` gains ` (GraphQL)` (e.g. `Bar Chart (GraphQL)`); nothing else.
3. Every test file: module imports `c/d3BarChart` → `c/d3BarChartGraphql`; `createElement("c-d3-bar-chart"...)` → `c-d3-bar-chart-graphql`; describe/it strings that name the chart updated. Bundle-local module files (`d3Loader.js`, `data.js`, `utils.js`, `graphql.js`, `theme.js`) keep their names — relative `./` imports are untouched.

- [ ] **Step 1:** Rename all 8, one at a time; after EACH: rename-completeness greps (Global Constraints) + `npx jest force-app/main/default/lwc/<newName>` green + commit `refactor(<old>): rename to <new> per suffix amendment`.
- [ ] **Step 2:** `npx jest --silent` full suite green; push.

### Task 2: Rename wave B — 8 charts to `*Graphql`

Same mechanics for: d3StepChart, d3VariableColorLine, d3SparklineGrid, d3PieChart, d3DonutChart, d3LollipopChart, d3FunnelChart, d3WaffleChart.

- [ ] Steps as Task 1.

### Task 3: Backfill d3LineChartGraphql integration + e2e test tiers

**Files:**

- Create: `force-app/main/default/lwc/d3LineChartGraphql/__tests__/d3LineChartGraphql.integration.test.js`, `.../d3LineChartGraphql.e2e.test.js`

**Interfaces:** Donor: `d3AreaChartGraphql/__tests__/` (same raw-record time-series family, all 4 tiers).

Donor-derivation rules (the plan does NOT hard-code assertion values — compute from the real component at RED time):

- Integration tier coverage: recordCollection end-to-end render (multi-series preserved, date parsing), `graphqlQuery` free-text path through the mocked `lightning/graphql` wire with a realistic UI-API envelope, error state on invalid config, no-data state, theme/palette application.
- E2e tier coverage: full lifecycle (connected → D3 load via mocked `d3Loader` → render → resize → disconnect cleanup), D3-load-failure path asserting the console-error spy (pattern: d3VariableColorLineGraphql e2e), tooltip creation, `chartRendered` latch.
- Transformation: donor `area`/stacked/normalized/gradient strings and config keys → line-chart equivalents the component actually reads.

- [ ] **Step 1 (RED):** copy + transform donor files; `npx jest force-app/main/default/lwc/d3LineChartGraphql` — failures only where line-specific expecteds are hypotheses; fix TESTS from real output.
- [ ] **Step 2 (GREEN):** same command all-pass. **Step 3:** full suite green. **Step 4:** clone-hygiene greps recorded. **Step 5:** commit `test(d3LineChartGraphql): backfill integration + e2e test tiers`.

### Task 4: Backfill d3StackedBarChartGraphql integration + e2e test tiers

As Task 3 with donor `d3StackedHorizontalBarGraphql` (stacked family, aggregateSeriesData + d3.stack pipeline); transformation focus: orientation flips, event names, vertical-variant config keys. Commit `test(d3StackedBarChartGraphql): backfill integration + e2e test tiers`.

- [ ] Steps 1–5 as Task 3.

### Task 5: Backfill d3FunnelChartGraphql e2e test tier

As Task 3, e2e only (integration exists — untouched), donor `d3PieChartGraphql` e2e. Commit `test(d3FunnelChartGraphql): backfill e2e test tier`.

- [ ] Steps 1–5 as Task 3.

### Task 6: GraphQL showcase pages + AGENT deploy

**Files:**

- Create: `force-app/main/default/flexipages/d3_graphql_showcase_1.flexipage-meta.xml`, `d3_graphql_showcase_2.flexipage-meta.xml`; `force-app/main/default/tabs/d3_graphql_showcase_1.tab-meta.xml`, `d3_graphql_showcase_2.tab-meta.xml`
- Delete: the 5 legacy `d3_lwc*`/`d3_graphql_test` flexipage files (they reference pre-rename component names that no longer exist in this repo — dead metadata; the ORG's copies stay until the joint legacy cleanup with the soql line)

**Interfaces:** Produces the two pages the Playwright manifest (Task 7) enumerates: showcase_1 = the 8 Task-1 charts, showcase_2 = the 8 Task-2 charts.

- [ ] **Step 1:** Author the two flexipages modeled structurally on the existing `d3_lwc_v2_1.flexipage-meta.xml` (AppPage template, regions), one `componentInstance` per suffixed chart. Config values: translate each chart's instance from the legacy pages — the 10 already-structured instances carry over as-is (component name suffixed); the 5 legacy-soqlQuery instances (pie, donut, lollipop, funnel, waffle) drop `soqlQuery` and gain `objectApiName` set to the object named in the old query's `FROM` clause, other properties preserved; sparklineGrid uses the structured config already committed in `d897328` (see `git show d897328 -- force-app/main/default/flexipages/d3_lwc_phase2.flexipage-meta.xml`).
- [ ] **Step 2:** Author the two CustomTab XMLs modeled on an existing tab file in `force-app/main/default/tabs/` (flexiPage reference + motif).
- [ ] **Step 3:** Deploy bundles FIRST, then pages+tabs (pages reference the bundles):

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
sf project deploy start -o AGENT \
  -m "LightningComponentBundle:d3BarChartGraphql" -m "LightningComponentBundle:d3SortedBarChartGraphql" \
  -m "LightningComponentBundle:d3HorizontalBarChartGraphql" -m "LightningComponentBundle:d3StackedBarChartGraphql" \
  -m "LightningComponentBundle:d3StackedHorizontalBarGraphql" -m "LightningComponentBundle:d3NormalizedBarGraphql" \
  -m "LightningComponentBundle:d3LineChartGraphql" -m "LightningComponentBundle:d3AreaChartGraphql" \
  -m "LightningComponentBundle:d3StepChartGraphql" -m "LightningComponentBundle:d3VariableColorLineGraphql" \
  -m "LightningComponentBundle:d3SparklineGridGraphql" -m "LightningComponentBundle:d3PieChartGraphql" \
  -m "LightningComponentBundle:d3DonutChartGraphql" -m "LightningComponentBundle:d3LollipopChartGraphql" \
  -m "LightningComponentBundle:d3FunnelChartGraphql" -m "LightningComponentBundle:d3WaffleChartGraphql"
sf project deploy start -o AGENT \
  -m "FlexiPage:d3_graphql_showcase_1" -m "FlexiPage:d3_graphql_showcase_2" \
  -m "CustomTab:d3_graphql_showcase_1" -m "CustomTab:d3_graphql_showcase_2"
```

(The `d3` static resource already exists on AGENT — do not redeploy it from this line.)

- [ ] **Step 4:** `npx jest --silent` green; commit `feat(showcase): d3_graphql showcase pages + tabs; retire legacy flexipage files` and push.

### Task 7: Playwright rig scaffold

**Files:**

- Create: `playwright.config.js` (root), `playwright/global-setup.js`, `playwright/chart-manifest.json`, `playwright/chart-sweep.spec.js`
- Modify: `package.json` (devDependency `@playwright/test`; script `"test:e2e:live": "playwright test"`), `.gitignore` (add `playwright/.auth/`, `test-results/`, `playwright-report/`)

- [ ] **Step 1:** `npm install --save-dev @playwright/test && npx playwright install chromium`; .gitignore additions.
- [ ] **Step 2:** `playwright.config.js`:

```js
// ABOUTME: Playwright config for the local-only live-org chart sweep (never runs in CI).
// ABOUTME: Auth via sf frontdoor storageState from global-setup; baselines are committed.
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./playwright",
  globalSetup: "./playwright/global-setup.js",
  timeout: 120000,
  workers: 1,
  retries: 0,
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: "disabled" }
  },
  use: {
    storageState: "playwright/.auth/agent.json",
    viewport: { width: 1600, height: 1000 },
    video: "off",
    trace: "retain-on-failure"
  }
});
```

- [ ] **Step 3:** `playwright/global-setup.js`:

```js
// ABOUTME: Generates a fresh AGENT frontdoor URL via sf CLI and saves storageState.
// ABOUTME: Frontdoor OTPs are single-use and short-lived: generate and navigate back-to-back.
const { chromium } = require("@playwright/test");
const { execFileSync } = require("child_process");
const fs = require("fs");

module.exports = async () => {
  const env = {
    ...process.env,
    PATH: `/opt/homebrew/opt/node@20/bin:${process.env.PATH}`
  };
  const out = execFileSync(
    "sf",
    ["org", "open", "-o", "AGENT", "--url-only", "--json"],
    { env }
  );
  const url = JSON.parse(out.toString()).result.url;
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(
    "one-appnav, div.slds-global-header, one-app-launcher-header",
    { timeout: 60000 }
  );
  fs.mkdirSync("playwright/.auth", { recursive: true });
  await context.storageState({ path: "playwright/.auth/agent.json" });
  await browser.close();
};
```

- [ ] **Step 4:** `playwright/chart-manifest.json` — two page entries (`d3_graphql_showcase_1`/`_2`), each chart as `{ "element": "c-d3-bar-chart-graphql", "name": "d3BarChartGraphql", "minSvgDescendants": 10 }` (floor asserting real marks, not exact counts). Fill all 16 from the Task 6 pages — the flexipage XMLs are the source of truth. No org URL anywhere in the manifest.
- [ ] **Step 5:** `playwright/chart-sweep.spec.js`:

```js
// ABOUTME: Live-org sweep: for every chart instance on the graphql showcase pages,
// ABOUTME: assert SVG marks rendered, zero console errors, and a stable visual baseline.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const manifest = JSON.parse(
  fs.readFileSync("playwright/chart-manifest.json", "utf8")
);

function orgBaseFromState() {
  const state = JSON.parse(
    fs.readFileSync("playwright/.auth/agent.json", "utf8")
  );
  const c =
    state.cookies.find(
      (k) => k.name === "sid" && k.domain.includes("lightning.force.com")
    ) || state.cookies.find((k) => k.name === "sid");
  return `https://${c.domain.replace(/^\./, "")}`;
}

for (const pageDef of manifest.pages) {
  test.describe(`page ${pageDef.tab}`, () => {
    test(`renders all charts cleanly`, async ({ page }) => {
      const consoleErrors = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err) => consoleErrors.push(String(err)));
      await page.goto(`${orgBaseFromState()}/lightning/n/${pageDef.tab}`, {
        waitUntil: "load"
      });
      await page.waitForTimeout(8000); // Lightning + graphql wire + d3 draw
      for (const chart of pageDef.charts) {
        const host = page.locator(chart.element).first();
        await expect(host, `${chart.name} present`).toBeVisible({
          timeout: 30000
        });
        const svgCount = await host.locator("svg *").count();
        expect(
          svgCount,
          `${chart.name} rendered ${svgCount} svg nodes`
        ).toBeGreaterThanOrEqual(chart.minSvgDescendants);
        await page.waitForTimeout(1500); // let d3 transitions settle before pixels
        await expect(host).toHaveScreenshot(`${chart.name}-${pageDef.tab}.png`);
      }
      expect(consoleErrors, `console errors on ${pageDef.tab}`).toEqual([]);
    });
  });
}
```

- [ ] **Step 6:** `npx jest --silent` green; `npx playwright test --list` parses. Commit `feat(qa): playwright live-org sweep rig (local release gate)`, push.

### Task 8: Baselines + 16-chart sweep gate

- [ ] **Step 1:** Confirm `[D3DEMO]` data: `sf data query -q "SELECT COUNT() FROM Opportunity WHERE Name LIKE '[D3DEMO]%'" -o AGENT` (Node-20 PATH) non-zero; if zero, seed via `sf apex run -f scripts/apex/load_phase3_demo_data.apex -o AGENT` and re-check.
- [ ] **Step 2:** `npx playwright test --update-snapshots`; MANUALLY EYEBALL every baseline PNG (Read each image): real marks, no blank/error states, ONLY `[D3DEMO]` synthetic labels — non-synthetic data in a baseline is STOP-and-report, never committed.
- [ ] **Step 3:** `npm run test:e2e:live` passes clean against committed baselines — zero console errors, all pages green. Failures are real findings (render bug, config miss, cold-cache regression): fix-loop them; never loosen assertions to pass.
- [ ] **Step 4:** Commit `test(qa): 16-chart live sweep baselines (AGENT, D3DEMO synthetic data)`, push.

### Task 9: v1.0.0 docs

**Files:** Modify `CLAUDE.md` (body rewrite), `README.md` (below the split banner), `CHANGELOG.md` (v1.0.0 entry). Delete `d3-lwc-smoke-test.png` (if `git ls-files` shows it: `git rm`; else plain `rm`).

- [ ] **Step 1: CLAUDE.md rewrite** — keep the identity header; rewrite the body: suffix naming convention (`d3XxxGraphql` / `c-d3-xxx-graphql` / ` (GraphQL)` labels), standalone-bundle anatomy (bundle + `d3` static resource only), never-deploy list (shared modules/Apex/unconverted charts), commands (jest; the exact `-m`-listed deploy pattern; `npm run test:e2e:live` with Node-20/frontdoor notes), carried-forward gotchas (durable component cache clear, design-time wedge → redeploy the 16 suffixed bundles, prettier/lint/test-narrowing quirks, jest TZ, static resource name), 16/40 status, waves 4–8 + purge roadmap, demo-data seeders note (`scripts/apex/*` + `sfdmu/` stay until purge — they seed the [D3DEMO] data the live gate needs; decision 2026-08-02). REMOVE the whole "Two-Project Sync Strategy" section and the pre-split disclaimer note.
- [ ] **Step 2: README refresh** — positioning, quickstart (deploy suffixed bundle + static resource, App Builder `(GraphQL)` labels, `graphqlQuery` example), 16/40 status table, QA (jest tiers + local Playwright gate), roadmap, conversion-recipe pointer (note: recipe gains the suffix step for waves 4–8 — orchestrator fold-in, cite this plan).
- [ ] **Step 3: CHANGELOG v1.0.0** — dated entry above the legacy mapping: BREAKING repo-wide `*Graphql` rename (all 16, tags/labels); the six per-chart BREAKING conversion paragraphs (legacy 3.5–3.9 template: standalone GraphQL-only bundle, soqlQuery/fetchMode removed, graphqlQuery added, FlowScreen target, live-verified); three test-tier backfills; showcase pages + Playwright rig; Migration note (replace legacy unsuffixed instances with the `(GraphQL)` components; legacy org artifacts retired in a later joint cleanup).
- [ ] **Step 4:** Full suite green; commit `docs: v1.0.0 consolidation — suffix convention, CLAUDE.md rewrite, changelog`, push.

### Task 10: Release v1.0.0

- [ ] **Step 1:** `package.json` `1.0.0-dev` → `1.0.0`; commit `release: v1.0.0 — 16 standalone GraphQL-only charts, consolidation gate closed`.
- [ ] **Step 2:** Final evidence check from THIS tree: full jest green + latest sweep run green.
- [ ] **Step 3:** `git push origin main && git tag v1.0.0 && git push origin v1.0.0`.
- [ ] **Step 4:** `gh release create v1.0.0 --title "v1.0.0 — standalone GraphQL-only line, consolidation gate closed"` with the CHANGELOG 1.0.0 section as `--notes`.
- [ ] **Step 5:** Update Auto Memory (graphql v1.0.0 SHIPPED; suffix amendment live; next = waves 4–8 with suffixed recipe; joint legacy-cleanup pending both lines). Do not commit memory files.
