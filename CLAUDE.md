# d3-lwc-graphql

In this repo the agent is **GRAPH GRAVEDIGGER** and David is **Bigg DR NODEZILLA**.

Split 2026-08-02 from `weytani/d3-lwc` (now archived) at the `v3-standalone` tip; inherited
release tags live under `legacy/*`. Sibling repo: `weytani/d3-lwc-soql` (shared-module
Apex/SOQL line). Development happens on `main`; other inherited branches are inert history.

**What this repo is:** every chart becomes a fully standalone GraphQL-only LWC bundle —
self-fetches via the `lightning/graphql` wire, no Apex, no shared `c/` modules; the only
dependency is the `d3` static resource. 16/40 charts are converted (bar, sortedBar,
horizontalBar, stackedBar, stackedHorizontalBar, normalizedBar, line, area, step,
variableColorLine, sparklineGrid, pie, donut, lollipop, funnel, waffle). v1.0.0 ships after
the consolidation gate; the remaining 24 convert in waves; the final purge release deletes
the shared modules and all Apex.

- Program of record: `docs/superpowers/specs/2026-08-02-repo-split-soql-graphql-design.md`
- Per-chart conversion recipe: `docs/conversion-recipe.md`
- NOTE: the sections below predate the split and describe the hybrid architecture — still
  accurate for the 24 unconverted charts; superseded per chart as conversions land.

---

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Salesforce LWC library providing 30 D3.js chart components for use in Lightning App Builder, Flows, and Experience Builder. Each chart accepts data via `recordCollection` (from Flow/parent) or `soqlQuery` (Apex-backed SOQL).

## Commands

```bash
npm test                                        # Run all unit tests
# NOTE: --testPathPattern does NOT narrow in this jest config — it runs the FULL
# suite regardless. There is no per-component narrowing flag; just run `npm test`
# (the full ~2,561-test suite is fast). lint-staged runs the relevant tests on commit.
npm run test:unit:watch                         # Watch mode
npm run test:unit:coverage                      # With coverage report
npm run lint                                    # ESLint
npm run prettier                                # Format all files
npm run prettier:verify                         # Check formatting

# Deploy to Salesforce org
sf project deploy start --source-dir force-app -o <org-alias>

# Start local dev server (use Node 20, not 25)
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
sf lightning dev app -o <org-alias>
```

Pre-commit hook (husky + lint-staged) auto-runs Prettier, ESLint, and related Jest tests on staged files.

## Architecture

### Data Flow

1. **Server-preferred path** (when `objectApiName` + field config available):
   - Aggregation charts (bar, donut, treemap): `getAggregatedData` → server-side GROUP BY → pre-bucketed results
   - Histogram statistics: `getStatistics` → server-side mean/median/stdDev (raw values still fetched for binning)
   - Scatter correlation: `getCorrelation` → server-side Pearson r, slope, intercept (raw points still fetched for rendering)

2. **Client-side path** (recordCollection or soqlQuery-only fallback):
   - `recordCollection` or `soqlQuery` → Apex `D3ChartController.executeQuery()`
   - `dataService.validateData()` → `validateFields()` → `truncateData()` (2,000 record limit) → `aggregateData()`
   - Processed data → D3 renders into an empty `<div>`

### Shared Modules

- `d3Lib` — D3.js loader with singleton pattern and fetch+eval fallback for CSP-restricted environments. Use `loadD3(this)` first call, `getD3()` after, `resetD3()` in tests.
- `dataService` — Data validation, aggregation (Sum/Count/Average), truncation (MAX_RECORDS: 2,000)
- `themeService` — 4 color palettes (Salesforce Standard, Warm, Cool, Vibrant) + custom colors
- `chartUtils` — Number formatting, tooltips, resize handling, layout retry

### Chart Component Pattern

Every chart component follows this structure:

- **@api properties**: `recordCollection`, `soqlQuery`, field mappings (`groupByField`/`valueField` or `xField`/`yField`), `operation`, `height`, `theme`, `advancedConfig` (JSON string), `objectApiName`/`filterField` for drill-down
- **Lifecycle**: `connectedCallback` loads D3 + fetches data; `renderedCallback` initializes chart with layout retry for container measurement; `disconnectedCallback` cleans up ResizeObserver
- **State guards**: `chartRendered` flag prevents re-rendering; `_layoutRetry` handles cases where container has no dimensions yet

### Apex Controller

`D3ChartController` (`with sharing`) — four `@AuraEnabled(cacheable=true)` methods:

- `executeQuery(queryString)` — Raw SOQL execution with FLS enforcement. Auto-adds LIMIT 2000.
- `getAggregatedData(objectName, groupByField, valueField, operation, filterClause)` — Server-side GROUP BY aggregation. Validates object/field existence via Schema describe. Returns label/value pairs. LIMIT 200 groups.
- `getStatistics(queryString, valueField)` — Computes count, min, max, mean, median, and population stdDev server-side.
- `getCorrelation(queryString, xField, yField)` — Computes Pearson correlation coefficient, linear regression slope and intercept.

### Testing

- Mocks in `__mocks__/` for `lightning/platformResourceLoader`, `lightning/navigation`, `lightning/platformShowToastEvent`, and `@salesforce/apex/D3ChartController.executeQuery`
- Tests create a mock D3 factory with chainable method stubs (since D3 isn't available in jsdom)
- Jest config extends `@salesforce/sfdx-lwc-jest/config` with custom `moduleNameMapper` for the mocks above

### Conventions

- Component names prefixed with `d3` (e.g., `d3BarChart`)
- `// ABOUTME:` comments at top of component files for component-level documentation
- Constants use UPPER_SNAKE_CASE (`MAX_RECORDS`, `OPERATIONS`, `PALETTES`)
- HTML templates use SLDS classes with conditional rendering for loading/error/no-data/chart states

## Chart Backlog

- **ROADMAP.md** — Next 16 charts (Weeks 1–16), detailed specs with Salesforce use cases
- **CHART-INDEX.md** — Next 50 charts beyond the roadmap, ordered by complexity (1 = simplest → 50 = most complex). When deciding what to build next, consult this index and build in order. Each entry includes: D3 gallery reference, proposed component name, Salesforce use case, and new D3 concepts required.

Total library target: 76 charts (30 built + 46 more in CHART-INDEX).

## Key Constraints

- Node.js v20 required for Salesforce CLI compatibility (v25 has issues)
- D3.js v7 loaded from the `d3` static resource (the file is named `d3`, with NO `.js` extension — a 285 KB full v7 build). Any plan/command reference to `staticresources/d3.js` is wrong; the real file is `staticresources/d3`.
- Salesforce API version: 65.0

## Two-Project Sync Strategy

This project is the **source of truth**. Changes flow one direction: d3-lwc → agentforce-dev.

### Path Mapping

| d3-lwc                            | agentforce-dev                            |
| --------------------------------- | ----------------------------------------- |
| `force-app/main/default/lwc/`     | `force-app/main/d3/lwc/`                  |
| `force-app/main/default/classes/` | `force-app/main/d3/classes/`              |
| `__mocks__/`                      | `__mocks__/` (project root)               |
| `jest.config.js`                  | `jest.config.js` (merge moduleNameMapper) |

### Sync Checklist

After making changes here, sync to `~/code/agentforce-dev/`:

1. **Apex classes** — full replace (cls + meta.xml)
2. **Service JS** (dataService, chartUtils, themeService, d3Lib) — full replace
3. **Chart component JS** — full replace
4. **Test files** — ALL tiers: unit (.test.js), integration (.integration.test.js), e2e (.e2e.test.js)
5. **Mock files** (`__mocks__/`) — **additive copy** (the sync uses `rsync` WITHOUT `--delete`: agentforce-dev's `__mocks__/` is shared and holds non-d3 mocks that must be preserved)
6. **jest.config.js** — merge moduleNameMapper (don't replace — agentforce-dev has other config)
7. **meta.xml** — MERGE, don't replace. agentforce-dev has `lightningCommunity__Page` targets to preserve.

### Automation

Run `scripts/sync-to-agentforce.sh` to automate steps 1-5. Steps 6-7 require manual review.

## Repo Tooling Gotchas

- `npm test -- --testPathPattern=X` does NOT narrow here — it runs the full suite regardless. No per-component flag exists; run the full `npm test` (the ~2,561-test suite is fast). lint-staged runs the relevant tests on commit.
- `npm run prettier` reformats the ENTIRE repo (it ignores path args). To format only your files: `npx prettier --write <file>...`. Never stage a whole-repo reformat alongside your change.
- `npm run lint` fails on a stale `aura/**` glob in the eslint config (no `aura/` dir exists). Rely on the per-file lint-staged hook (which works) or `npx eslint <path>` over the dirs you touched, not the repo-wide `npm run lint`.
- Apex has NO local compile/test. TDD is **deploy-then-test** against a live org (`sf project deploy start --source-dir force-app/main/default/classes -o <org>`, then `sf apex run test --tests <Class> -o <org>`). A deploy that fails to compile (referencing a not-yet-written method) IS the RED state. `.cls` commits are slow because lint-staged spins up a JVM `prettier-plugin-apex` parser — be patient, it's not hung. Confirm an authenticated org first (`sf org list`); the historical default `portfolio` may be deauthenticated — `AGENT` is the orgfarm dev edition.
- **Removing an `@api` property from a chart bundle that's placed on a live page fails to deploy** (`You can't remove the property tag ... in use on one or more Lightning pages`) — Salesforce validates against the org's _current_ bundle, even in the same deploy as the page update, and even if that page instance sets no value for the property. Workaround: detach the component instance from the page, deploy the page, deploy the new bundle, then reattach. `scripts/deploy-property-removal.sh <org> <flexipage> <bundle-dir...>` automates the deploy sequencing (with correct `sf --json` status parsing) — you still hand-edit the page XML to detach first, since picking the right `<componentInstance>` block when a page has multiple instances of the same chart type is judgment, not a mechanical pattern.

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
