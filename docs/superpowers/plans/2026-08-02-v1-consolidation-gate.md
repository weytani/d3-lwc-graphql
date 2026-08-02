# d3-lwc-graphql v1.0.0 Consolidation Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the v1.0.0 consolidation gate: finish the 6 merged-but-unreleased release trains (flexipage migrations + org reconciliation), backfill the 3 known test-tier gaps, build the Playwright live-sweep rig, refresh docs, and ship v1.0.0.

**Architecture:** All work happens in `~/code/d3-lwc-graphql` on `main` plus the live `AGENT` org. The 16 converted charts are already mechanically clean (verified 2026-08-02: zero `c/` imports, zero `soqlQuery`/`fetchMode`, `graphqlQuery` @api, FlowScreen target — all 16). What remains is org-state work, test backfills, the QA rig, and release mechanics. Spec: `docs/superpowers/specs/2026-08-02-repo-split-soql-graphql-design.md` (§3 names this gate; §4 designs the QA rig).

**Tech Stack:** LWC/jest (sfdx-lwc-jest, jsdom), Salesforce CLI (`sf`) against AGENT, @playwright/test, git/gh.

## Global Constraints

- **Public repo.** No org credentials, org URLs, frontdoor URLs, session ids, or real record data in ANY committed file or committed screenshot. Playwright auth state lives in git-ignored `playwright/.auth/`. Committed baselines may show only `[D3DEMO]`-seeded synthetic data.
- **Node 20 for every `sf` command**: prefix with `export PATH="/opt/homebrew/opt/node@20/bin:$PATH"`. jest runs fine on default node.
- The `d3` static resource is `force-app/main/default/staticresources/d3` — NO `.js` extension. Any reference to `staticresources/d3.js` is wrong.
- NEVER `--no-verify`; husky + lint-staged must pass. Conventional commits, imperative mood.
- Jest TZ is pinned `America/New_York` (jest.config.js) — date assertions must respect it; date bucketing in chart code is UTC (Wave-2 rule).
- Plan-prescribed expected test values are HYPOTHESES — verify against the real service/donor at RED time; if reality differs, fix the test and report the evidence (repo CLAUDE.md rule).
- Chart-clone hygiene checklist (repo CLAUDE.md) applies to every donor-derived test file: grep for donor strings, donor config keys, advertised-but-unasserted surfaces, test-name↔behavior mismatches; report the greps run.
- Removing/changed `@api` properties on a bundle placed on a live page requires the detach → deploy page → deploy bundle → reattach → deploy page dance; `scripts/deploy-property-removal.sh <org> <flexipage> <bundle-dir...>` automates deploy sequencing (hand-edit the XML for detach/reattach).
- Org wedge: if deploys start failing with stale "design time component information" property errors, redeploy ALL bundles: `sf project deploy start --source-dir force-app/main/default/lwc -o AGENT`.
- The full jest suite always runs whole (`npx jest --silent`, ~3.5k tests, fast); to iterate on one bundle pass its path: `npx jest force-app/main/default/lwc/<chart>`.
- No new conversions (waves 4–8) ship before this gate closes (spec §3).

## Versioning note

The 6 unreleased conversions do NOT get individual v3.x-style tags — this repo's semver restarted. Their release-train remnants fold into the single **v1.0.0** release; the CHANGELOG v1.0.0 entry documents all six per-chart BREAKING conversions using the same template as legacy 3.5–3.9 entries.

---

### Task 1: Org/repo reconciliation snapshot

**Files:** none committed — report + retrieved metadata go to the SDD workspace / a temp dir.

**Interfaces:**

- Produces: a per-chart reconciliation matrix (report file) that Tasks 5a–5c consume: for each of the 6 unreleased charts — is the org's deployed bundle the NEW standalone code or the OLD hybrid; per flexipage — does the org instance match the repo XML, and specifically whether org `d3_lwc_phase2`'s `d3SparklineGrid` instance already reflects the parked `d897328` migration.

- [ ] **Step 1: Retrieve org state to a temp project (never into this repo)**

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
TMP=$(mktemp -d) && cd "$TMP"
sf project generate --name org-snapshot && cd org-snapshot
sf project retrieve start -o AGENT \
  -m "LightningComponentBundle:d3SparklineGrid" -m "LightningComponentBundle:d3PieChart" \
  -m "LightningComponentBundle:d3DonutChart" -m "LightningComponentBundle:d3LollipopChart" \
  -m "LightningComponentBundle:d3FunnelChart" -m "LightningComponentBundle:d3WaffleChart" \
  -m "FlexiPage:d3_lwc" -m "FlexiPage:d3_lwc_phase2" -m "FlexiPage:d3_lwc_phase3" \
  -m "FlexiPage:d3_graphql_test" -m "FlexiPage:d3_lwc_v2_1"
```

- [ ] **Step 2: Diff each retrieved bundle + page against the repo**

For each of the 6 bundles and 5 pages: `diff -ru "$TMP/org-snapshot/force-app/main/default/lwc/<chart>" ~/code/d3-lwc-graphql/force-app/main/default/lwc/<chart>` (and likewise for flexipages). Classify each chart: **org-has-old-hybrid** (org .js imports `c/graphqlService` or declares `soqlQuery`) vs **org-has-new-standalone** (matches repo) vs **org-drifted-other** (report verbatim). Classify each page instance: legacy / migrated / mismatched.

- [ ] **Step 3: Write the reconciliation matrix** to the SDD workspace report file: one row per chart (org bundle state, org page-instance state, required Task-5 actions) and the explicit sparklineGrid verdict. Delete `$TMP`.

### Task 2: Backfill d3LineChart integration + e2e test tiers

**Files:**

- Create: `force-app/main/default/lwc/d3LineChart/__tests__/d3LineChart.integration.test.js`
- Create: `force-app/main/default/lwc/d3LineChart/__tests__/d3LineChart.e2e.test.js`

**Interfaces:**

- Consumes: the donor pattern in `force-app/main/default/lwc/d3AreaChart/__tests__/d3AreaChart.integration.test.js` and `d3AreaChart.e2e.test.js` (d3AreaChart is the same raw-record time-series family and already has all 4 tiers).
- Produces: full 4-tier coverage for d3LineChart; suite counts rise accordingly.

Donor-derivation rules (the plan deliberately does NOT hard-code assertion values — the repo's own rule says compute them from the real component at RED time):

- Coverage the integration tier must carry (mirroring the donor): recordCollection end-to-end render through the real data pipeline (multi-series preserved, date parsing), graphqlQuery free-text path through the mocked `lightning/graphql` wire returning a realistic UI-API envelope, error state on invalid config, no-data state, theme/palette application.
- Coverage the e2e tier must carry: full lifecycle (connected → D3 load via mocked `d3Loader` → render → resize → disconnect cleanup), D3-load-failure path asserting the console-error spy (see `0f192ad`'s pattern in d3VariableColorLine), tooltip creation, `chartRendered` latch behavior.
- Transformation: every donor string `area`/`Area`/area-specific config keys (`stacked`, `normalized`, gradient assertions) must be replaced by line-chart equivalents the component actually reads — run the clone-hygiene greps and include them in the report.

- [ ] **Step 1: Copy donor files, transform names/selectors/config keys, then RED**: `npx jest force-app/main/default/lwc/d3LineChart` — new tests must fail only where line-specific expected values are still hypotheses; compute real values from the component output and fix the TESTS.
- [ ] **Step 2: GREEN**: same command, all line-chart tests pass.
- [ ] **Step 3: Full suite**: `npx jest --silent` green.
- [ ] **Step 4: Clone-hygiene greps** (`grep -rn 'area\|stacked\|normalized' force-app/main/default/lwc/d3LineChart/__tests__/` — justify or eliminate every hit) and record them.
- [ ] **Step 5: Commit** `test(d3LineChart): backfill integration + e2e test tiers`.

### Task 3: Backfill d3StackedBarChart integration + e2e test tiers

Same structure as Task 2 with:

**Files:** Create `d3StackedBarChart.integration.test.js` + `d3StackedBarChart.e2e.test.js` under `force-app/main/default/lwc/d3StackedBarChart/__tests__/`.
**Donor:** `d3StackedHorizontalBar` (same stacked-family, all 4 tiers, uses the aggregateSeriesData + d3.stack pipeline §9.3(b)).
**Transformation focus:** orientation flips (x/y axis roles), event names, stacked-bar-specific config keys the vertical variant actually reads; summation-capable mock-D3 pattern is already in the donor.

- [ ] Steps 1–5 as in Task 2 (RED with real-value verification → GREEN → full suite → hygiene greps recorded → commit `test(d3StackedBarChart): backfill integration + e2e test tiers`).

### Task 4: Backfill d3FunnelChart e2e test tier

Same structure with:

**Files:** Create `force-app/main/default/lwc/d3FunnelChart/__tests__/d3FunnelChart.e2e.test.js` (integration tier already exists — do not touch it).
**Donor:** `d3PieChart.e2e.test.js` (same Wave-3 part-to-whole family).

- [ ] Steps 1–5 as in Task 2 (commit `test(d3FunnelChart): backfill e2e test tier`).

### Task 5a: Migrate + deploy — d3_lwc page (d3DonutChart)

**Files:**

- Modify: `force-app/main/default/flexipages/d3_lwc.flexipage-meta.xml` (donut instance: legacy → structured)

**Interfaces:**

- Consumes: Task 1's matrix (whether donut's org bundle is old-hybrid — if so this dance is mandatory; if org already has the new bundle, deploy steps that no-op are still run to convergence).
- Produces: org page + bundle + repo XML all converged on the structured config; the committed final-state XML.

- [ ] **Step 1: Detach** — hand-edit the repo XML: temporarily remove the whole `d3DonutChart` `<componentInstance>` block (keep a copy).
- [ ] **Step 2: Deploy sequence** — `export PATH="/opt/homebrew/opt/node@20/bin:$PATH"; scripts/deploy-property-removal.sh AGENT d3_lwc force-app/main/default/lwc/d3DonutChart` (deploys detached page, then the bundle).
- [ ] **Step 3: Reattach** — restore the instance with the structured config: keep `groupByField`, `valueField`, `operation`, `height`, `theme`, `innerRadiusRatio`, `advancedConfig` values as they were; replace the `soqlQuery` property with `objectApiName` set to the same object the old query targeted (read it from the removed block's SOQL text). Deploy the page: `sf project deploy start --source-dir force-app/main/default/flexipages -o AGENT`.
- [ ] **Step 4: Live smoke** — fetch the page once via a fresh frontdoor session (or defer to Task 7's sweep if the rig exists by then) and confirm no deploy-level error; full rendering assertions belong to Task 7.
- [ ] **Step 5: Commit final state** — `feat(flexipage): migrate d3_lwc d3DonutChart instance to structured GraphQL config`, push.

### Task 5b: Migrate + deploy — d3_lwc_phase2 page (d3FunnelChart + d3SparklineGrid reconciliation)

Same dance as 5a with two instances:

- [ ] **Step 1:** Per Task 1's matrix: if org sparklineGrid bundle/instance is still pre-migration, include `d3SparklineGrid` in the detach set; funnel is always in it. Detach the needed instances from the repo XML (funnel's block removed; sparklineGrid's block — already structured in the repo since `d897328` — removed temporarily as well if its bundle must deploy).
- [ ] **Step 2:** `scripts/deploy-property-removal.sh AGENT d3_lwc_phase2 force-app/main/default/lwc/d3FunnelChart force-app/main/default/lwc/d3SparklineGrid` (bundle list per matrix).
- [ ] **Step 3:** Reattach: funnel gets the structured swap (soqlQuery → objectApiName, other props preserved); sparklineGrid's block is restored exactly as committed in `d897328` (already structured). Deploy the page.
- [ ] **Step 4:** Live smoke as in 5a.
- [ ] **Step 5:** Commit `feat(flexipage): migrate d3_lwc_phase2 funnel instance; complete parked sparklineGrid train`, push.

### Task 5c: Migrate + deploy — d3_lwc_phase3 page (d3PieChart, d3LollipopChart, d3WaffleChart)

Same dance, batched — all three detach BEFORE any bundle deploys (a bundle deploy fails while ANY page still references a removed property):

- [ ] **Step 1:** Detach all three instances from the repo XML.
- [ ] **Step 2:** `scripts/deploy-property-removal.sh AGENT d3_lwc_phase3 force-app/main/default/lwc/d3PieChart force-app/main/default/lwc/d3LollipopChart force-app/main/default/lwc/d3WaffleChart`.
- [ ] **Step 3:** Reattach all three with the structured swap (soqlQuery → objectApiName each, other props preserved); deploy the page.
- [ ] **Step 4:** Live smoke as in 5a.
- [ ] **Step 5:** Commit `feat(flexipage): migrate d3_lwc_phase3 pie/lollipop/waffle instances to structured GraphQL config`, push.

### Task 6: Playwright rig scaffold

**Files:**

- Create: `playwright.config.js` (repo root), `playwright/global-setup.js`, `playwright/chart-manifest.json`, `playwright/chart-sweep.spec.js`
- Modify: `package.json` (devDependency `@playwright/test`; scripts), `.gitignore`

**Interfaces:**

- Produces: `npm run test:e2e:live` — the local-only live sweep Task 7 gates on. Auth state at `playwright/.auth/agent.json` (git-ignored). Baselines under `playwright/chart-sweep.spec.js-snapshots/` (committed).

- [ ] **Step 1: Install** — `npm install --save-dev @playwright/test && npx playwright install chromium`.

- [ ] **Step 2: `.gitignore` additions**

```
playwright/.auth/
test-results/
playwright-report/
```

- [ ] **Step 3: `playwright.config.js`**

```js
// ABOUTME: Playwright config for the local-only live-org chart sweep (never runs in CI).
// ABOUTME: Auth via sf frontdoor storageState from global-setup; baselines are committed.
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./playwright",
  globalSetup: "./playwright/global-setup.js",
  timeout: 120000,
  workers: 1, // Lightning sessions dislike parallel contexts; serial keeps org load sane
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

- [ ] **Step 4: `playwright/global-setup.js`**

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

- [ ] **Step 5: Build `playwright/chart-manifest.json`** — enumerate `force-app/main/default/tabs/*.tab-meta.xml` to map each showcase flexipage to its CustomTab name (AppPages render at `/lightning/n/<tabName>`). One entry per converted chart placed on a page (17 instances: 16 charts, bar ×2):

```json
{
  "orgBase": "USE-INSTANCE-URL-FROM-STORAGESTATE-AT-RUNTIME",
  "pages": [
    {
      "tab": "<tab name for d3_lwc>",
      "charts": [
        {
          "element": "c-d3-bar-chart",
          "name": "d3BarChart",
          "minSvgDescendants": 10
        },
        {
          "element": "c-d3-donut-chart",
          "name": "d3DonutChart",
          "minSvgDescendants": 10
        }
      ]
    }
  ]
}
```

Fill ALL pages/charts from the actual flexipage XMLs (source of truth: which converted charts sit on which page — Task 5 committed the final states). `minSvgDescendants: 10` is a floor asserting real marks rendered, not an exact count (data-driven counts vary with org data). `orgBase` is resolved at runtime from the storageState origin — never hard-code the org URL in the committed manifest.

- [ ] **Step 6: `playwright/chart-sweep.spec.js`**

```js
// ABOUTME: Live-org sweep: for every converted chart instance on the showcase pages,
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
      (c) => c.name === "sid" && c.domain.includes("lightning.force.com")
    ) || state.cookies.find((c) => c.name === "sid");
  return `https://${c.domain.replace(/^\./, "")}`;
}

for (const pageDef of manifest.pages) {
  test.describe(`page ${pageDef.tab}`, () => {
    test(`renders all converted charts cleanly`, async ({ page }) => {
      const consoleErrors = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err) => consoleErrors.push(String(err)));
      await page.goto(`${orgBaseFromState()}/lightning/n/${pageDef.tab}`, {
        waitUntil: "load"
      });
      // Lightning renders async; charts self-fetch via the graphql wire then draw.
      await page.waitForTimeout(8000);
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

- [ ] **Step 7: `package.json` script** — add `"test:e2e:live": "playwright test"`. (Do NOT wire it into `test` or CI.)
- [ ] **Step 8:** `npx jest --silent` still green (nothing jest-visible changed) and `npx playwright test --list` parses the suite. Commit `feat(qa): playwright live-org sweep rig (local release gate)`, push.

### Task 7: Baseline generation + 16-chart sweep gate

**Interfaces:** Consumes Tasks 5a–5c (migrated pages) + Task 6 (rig). Produces committed baselines + a green sweep — THE v1.0.0 gate.

- [ ] **Step 1:** Confirm the org's `[D3DEMO]` synthetic dataset is present (`export PATH="/opt/homebrew/opt/node@20/bin:$PATH"; sf data query -q "SELECT COUNT() FROM Opportunity WHERE Name LIKE '[D3DEMO]%'" -o AGENT` — non-zero). If zero, seed via `scripts/apex/load_phase3_demo_data.apex` (`sf apex run -f scripts/apex/load_phase3_demo_data.apex -o AGENT`) and re-check.
- [ ] **Step 2:** First run generates baselines: `npx playwright test --update-snapshots`. MANUALLY EYEBALL every baseline PNG (Read each image): every chart must show real marks, no blank/error states, and ONLY `[D3DEMO]` synthetic labels — a baseline showing non-synthetic org data is a STOP-and-report finding, never committed.
- [ ] **Step 3:** Second run must pass clean against the committed baselines: `npm run test:e2e:live` → all pages green, zero console errors. A failure here is a real finding (render bug, migration miss, cold-cache regression) — route it through the fix loop, do not loosen assertions to pass.
- [ ] **Step 4:** Commit `test(qa): 16-chart live sweep baselines (AGENT, D3DEMO synthetic data)`, push.

### Task 8: v1.0.0 docs

**Files:**

- Modify: `CLAUDE.md` (full rewrite of the legacy body), `README.md` (refresh below the split banner), `CHANGELOG.md` (v1.0.0 entry)
- Delete: `d3-lwc-smoke-test.png` if tracked (`git ls-files d3-lwc-smoke-test.png` — if listed, `git rm`; if untracked, plain `rm`)

- [ ] **Step 1: CLAUDE.md rewrite** — keep the cutover identity header (names, split provenance) and rewrite the body for THIS repo's reality: standalone-bundle anatomy (bundle + `d3` static resource only), the conversion recipe pointer, commands (jest, sf deploy, `npm run test:e2e:live` with the Node-20/frontdoor notes), carried-forward gotchas that still apply (durable component cache clear, property-removal dance, design-time wedge, prettier/lint/test-narrowing quirks, jest TZ pin, static resource name), the 16/40 status table, and the purge end-state. REMOVE: the entire "Two-Project Sync Strategy" section (sync belongs to d3-lwc-soql — this kills the dangling `sync-to-agentforce.sh` reference), Apex-controller architecture prose for converted charts, and the "predates the split" disclaimer note (no longer true after this rewrite). Keep a short "Demo-data seeders" note: `scripts/apex/*` + `sfdmu/` stay until the purge release (they seed the `[D3DEMO]` data the live gates depend on) — decision recorded 2026-08-02.
- [ ] **Step 2: README refresh** — under the split banner: what the repo is, quickstart (deploy bundle + static resource, App Builder/Flow usage, `graphqlQuery` example), conversion status table (16 converted ✅ / 24 pending, wave grouping from the spec), QA section (jest tiers + the local Playwright live gate), roadmap (waves 4–8 → purge), contribution pointer to `docs/conversion-recipe.md`.
- [ ] **Step 3: CHANGELOG v1.0.0 entry** — dated, above the legacy-mapping block: the six per-chart BREAKING conversion paragraphs (same template as legacy 3.5–3.9: standalone GraphQL-only bundle, soqlQuery/fetchMode removed, graphqlQuery added, FlowScreen target, live-verified) for sparklineGrid/pie/donut/lollipop/funnel/waffle; the three test-tier backfills; the Playwright rig; the flexipage migrations; the Migration section (detach→deploy→reattach note, same as legacy entries).
- [ ] **Step 4:** `npx jest --silent` green; commit `docs: v1.0.0 consolidation — CLAUDE.md rewrite, README status, changelog`, push.

### Task 9: Release v1.0.0

- [ ] **Step 1:** `package.json` version `1.0.0-dev` → `1.0.0`; commit `release: v1.0.0 — 16 standalone GraphQL-only charts, consolidation gate closed`.
- [ ] **Step 2:** Verify the gate evidence one final time: full jest suite green + latest sweep run green (both from THIS commit's tree).
- [ ] **Step 3:** `git push origin main && git tag v1.0.0 && git push origin v1.0.0`.
- [ ] **Step 4:** `gh release create v1.0.0 --title "v1.0.0 — standalone GraphQL-only line, consolidation gate closed" --notes-file <(sed -n '/## \[1.0.0\]/,/^## \[/p' CHANGELOG.md | sed '$d')` — or paste the 1.0.0 CHANGELOG section as notes if process substitution misbehaves under zsh.
- [ ] **Step 5:** Update Auto Memory (`project_d3_lwc.md`: graphql v1.0.0 SHIPPED, gate closed, next = waves 4–8; MEMORY.md hook line accordingly). Do not commit memory files.
