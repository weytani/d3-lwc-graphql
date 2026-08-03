<!-- ABOUTME: Quick-reference map of all files in the d3-lwc project. -->
<!-- ABOUTME: Lookup tool to prevent unnecessary file reads. -->

# d3-lwc File Manifest

## Apex

| File                                                                | Purpose                                                             | Key Methods                                                                                                   |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `force-app/main/default/classes/D3ChartController.cls`              | Server-side controller (with sharing) for all chart data operations | `executeQuery`, `getAggregatedData`, `getStatistics`, `getCorrelation`                                        |
| `force-app/main/default/classes/D3ChartControllerTest.cls`          | Apex test class                                                     | 37 test methods covering SOQL execution, security, injection prevention, aggregation, statistics, correlation |
| `force-app/main/default/classes/D3ChartController.cls-meta.xml`     | Apex class metadata                                                 | apiVersion 65.0                                                                                               |
| `force-app/main/default/classes/D3ChartControllerTest.cls-meta.xml` | Test class metadata                                                 | apiVersion 65.0                                                                                               |

## Shared LWC Modules

| Module       | File                                                      | Key Exports                                                                                                                                                                                           |
| ------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dataService  | `force-app/main/default/lwc/dataService/dataService.js`   | `MAX_RECORDS`, `CHART_LIMITS`, `OPERATIONS`, `SVG_ELEMENT_CAP`, `validateData`, `validateFields`, `truncateData`, `prepareData`, `sampleData`, `aggregateData`                                        |
| chartUtils   | `force-app/main/default/lwc/chartUtils/chartUtils.js`     | `formatNumber`, `formatCurrency`, `formatPercent`, `truncateLabel`, `createTooltip`, `buildTooltipContent`, `createResizeHandler`, `calculateDimensions`, `shouldUseCompactMode`, `createLayoutRetry` |
| themeService | `force-app/main/default/lwc/themeService/themeService.js` | `PALETTES`, `THEMES`, `DEFAULT_THEME`, `getColors`, `createColorScale`, `getColor`                                                                                                                    |
| d3Lib        | `force-app/main/default/lwc/d3Lib/d3Lib.js`               | `loadD3`, `getD3`, `resetD3`                                                                                                                                                                          |

### Shared Module Tests

| Module                    | Test File                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------- |
| dataService               | `force-app/main/default/lwc/dataService/__tests__/dataService.test.js`             |
| dataService (integration) | `force-app/main/default/lwc/dataService/__tests__/dataService.integration.test.js` |
| chartUtils                | `force-app/main/default/lwc/chartUtils/__tests__/chartUtils.test.js`               |
| themeService              | `force-app/main/default/lwc/themeService/__tests__/themeService.test.js`           |
| d3Lib                     | `force-app/main/default/lwc/d3Lib/__tests__/d3Lib.test.js`                         |

### Shared Module Metadata

| File                                                               | Note             |
| ------------------------------------------------------------------ | ---------------- |
| `force-app/main/default/lwc/dataService/dataService.js-meta.xml`   | isExposed: false |
| `force-app/main/default/lwc/chartUtils/chartUtils.js-meta.xml`     | isExposed: false |
| `force-app/main/default/lwc/themeService/themeService.js-meta.xml` | isExposed: false |
| `force-app/main/default/lwc/d3Lib/d3Lib.js-meta.xml`               | isExposed: false |

## Chart Components (10)

| Component     | Main JS                              | HTML    | CSS    | Test Files                                         | Description                                                              |
| ------------- | ------------------------------------ | ------- | ------ | -------------------------------------------------- | ------------------------------------------------------------------------ |
| d3BarChart    | `lwc/d3BarChart/d3BarChart.js`       | `.html` | `.css` | `.test.js`, `.integration.test.js`, `.e2e.test.js` | Vertical bars with drill-down, server-side GROUP BY                      |
| d3DonutChart  | `lwc/d3DonutChart/d3DonutChart.js`   | `.html` | `.css` | `.test.js`, `.integration.test.js`, `.e2e.test.js` | Part-to-whole with configurable inner-radius, legends                    |
| d3Histogram   | `lwc/d3Histogram/d3Histogram.js`     | `.html` | `.css` | `.test.js`                                         | Numeric distribution with auto-binning, normal curve overlay, statistics |
| d3ScatterPlot | `lwc/d3ScatterPlot/d3ScatterPlot.js` | `.html` | `.css` | `.test.js`                                         | Two-field correlation with trend line, color grouping, SVG sampling      |
| d3LineChart   | `lwc/d3LineChart/d3LineChart.js`     | `.html` | `.css` | `.test.js`                                         | Time series with multi-series, drill-down                                |
| d3ForceGraph  | `lwc/d3ForceGraph/d3ForceGraph.js`   | `.html` | `.css` | `.test.js`                                         | Network/graph with force simulation, drag, zoom                          |
| d3Choropleth  | `lwc/d3Choropleth/d3Choropleth.js`   | `.html` | `.css` | `.test.js`                                         | Geographic regions colored by value (US states, world, custom GeoJSON)   |
| d3Sankey      | `lwc/d3Sankey/d3Sankey.js`           | `.html` | `.css` | `.test.js`                                         | Flow/process visualization with nodes and links                          |
| d3Gauge       | `lwc/d3Gauge/d3Gauge.js`             | `.html` | `.css` | `.test.js`, `.integration.test.js`, `.e2e.test.js` | Single KPI half-circle gauge with zones                                  |
| d3Treemap     | `lwc/d3Treemap/d3Treemap.js`         | `.html` | --     | `.test.js`                                         | Hierarchical nested rectangles, auto-nesting via groupByField            |

All chart paths relative to `force-app/main/default/`. Each component also has a `.js-meta.xml` metadata file.

## Static Resources

| File                                                                | Purpose                          |
| ------------------------------------------------------------------- | -------------------------------- |
| `force-app/main/default/staticresources/d3`                         | D3.js v7 library bundle          |
| `force-app/main/default/staticresources/d3.resource-meta.xml`       | D3 resource metadata             |
| `force-app/main/default/staticresources/d3Sankey.js`                | d3-sankey plugin module          |
| `force-app/main/default/staticresources/d3Sankey.resource-meta.xml` | Sankey resource metadata         |
| `force-app/main/default/staticresources/usStates`                   | US states GeoJSON for choropleth |
| `force-app/main/default/staticresources/usStates.resource-meta.xml` | US states resource metadata      |

## FlexiPages

| File                                                          | Purpose                                         |
| ------------------------------------------------------------- | ----------------------------------------------- |
| `force-app/main/default/flexipages/d3_lwc.flexipage-meta.xml` | Lightning App Builder page for chart components |

## Mocks

### Apex Mocks (`__mocks__/@salesforce/apex/`)

| File                                     | Stubs                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `D3ChartController.executeQuery.js`      | `jest.fn().mockResolvedValue([])`                                        |
| `D3ChartController.getAggregatedData.js` | `jest.fn().mockResolvedValue([])`                                        |
| `D3ChartController.getStatistics.js`     | `jest.fn().mockResolvedValue({ mean, median, stdDev, count, min, max })` |
| `D3ChartController.getCorrelation.js`    | `jest.fn().mockResolvedValue({ r, slope, intercept, count })`            |

### Lightning Mocks (`__mocks__/lightning/`)

| File                        | Stubs                                                       |
| --------------------------- | ----------------------------------------------------------- |
| `platformResourceLoader.js` | `loadScript`, `loadStyle` (both resolve undefined)          |
| `navigation.js`             | `NavigationMixin` with `Navigate` and `GenerateUrl` symbols |
| `platformShowToastEvent.js` | `ShowToastEvent` class extending `CustomEvent`              |

## Config (Root)

| File                              | Purpose                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------- |
| `package.json`                    | npm scripts (test, lint, prettier), devDependencies, lint-staged config           |
| `jest.config.js`                  | Extends `@salesforce/sfdx-lwc-jest/config`, custom moduleNameMapper for all mocks |
| `eslint.config.js`                | Flat ESLint config: Aura rules, LWC recommended, Jest globals for test files      |
| `sfdx-project.json`               | SFDX project definition, sourceApiVersion 65.0, namespace empty                   |
| `config/project-scratch-def.json` | Scratch org definition                                                            |

## Scripts

| File                        | Purpose                      |
| --------------------------- | ---------------------------- |
| `scripts/apex/hello.apex`   | Sample anonymous Apex script |
| `scripts/soql/account.soql` | Sample SOQL query            |

## Documentation (Root)

| File                          | Purpose                                                     |
| ----------------------------- | ----------------------------------------------------------- |
| `CLAUDE.md`                   | Claude Code project instructions and architecture reference |
| `README.md`                   | Project readme                                              |
| `CHART-INDEX.md`              | Next 50 charts beyond roadmap, ordered by complexity        |
| `ROADMAP.md`                  | Next 16 charts (Weeks 1-16), detailed specs                 |
| `IMPLEMENTATION-BLUEPRINT.md` | Implementation guide                                        |
| `PROJECT-SPEC.md`             | Project specification                                       |
