const { jestConfig } = require("@salesforce/sfdx-lwc-jest/config");

// Pin the timezone for deterministic date-based tests across every host and CI
// runner. Several charts bucket date-only fields (parsed as UTC midnight); a
// negative-UTC-offset zone is required for the d3SparklineGrid month-bucketing
// regression test to catch its bug — under TZ=UTC (typical CI) it would pass
// vacuously. Set here, before jest forks its workers, so each worker inherits it
// at process start (a runtime assignment inside a test file does not re-tzset).
process.env.TZ = "America/New_York";

module.exports = {
  ...jestConfig,
  modulePathIgnorePatterns: ["<rootDir>/.localdevserver"],
  // Exclude the Playwright live-org sweep: its *.spec.js file matches Jest's
  // default testMatch, but it requires the `playwright test` runner (not jsdom).
  testPathIgnorePatterns: [
    ...jestConfig.testPathIgnorePatterns,
    "<rootDir>/playwright/"
  ],
  moduleNameMapper: {
    ...jestConfig.moduleNameMapper,
    "^lightning/platformShowToastEvent$":
      "<rootDir>/__mocks__/lightning/platformShowToastEvent.js",
    "^lightning/navigation$": "<rootDir>/__mocks__/lightning/navigation.js",
    "^lightning/platformResourceLoader$":
      "<rootDir>/__mocks__/lightning/platformResourceLoader.js",
    "^lightning/graphql$": "<rootDir>/__mocks__/lightning/graphql.js",
    "^@salesforce/apex/D3ChartController.executeQuery$":
      "<rootDir>/__mocks__/@salesforce/apex/D3ChartController.executeQuery.js",
    "^@salesforce/apex/D3ChartController.getAggregatedData$":
      "<rootDir>/__mocks__/@salesforce/apex/D3ChartController.getAggregatedData.js",
    "^@salesforce/apex/D3ChartController.getStatistics$":
      "<rootDir>/__mocks__/@salesforce/apex/D3ChartController.getStatistics.js",
    "^@salesforce/apex/D3ChartController.getCorrelation$":
      "<rootDir>/__mocks__/@salesforce/apex/D3ChartController.getCorrelation.js",
    "^@salesforce/apex/D3ChartController.getMultiGroupData$":
      "<rootDir>/__mocks__/@salesforce/apex/D3ChartController.getMultiGroupData.js",
    "^@salesforce/apex/D3ChartController.getDateRangeData$":
      "<rootDir>/__mocks__/@salesforce/apex/D3ChartController.getDateRangeData.js",
    "^@salesforce/apex/D3ChartController.getXYData$":
      "<rootDir>/__mocks__/@salesforce/apex/D3ChartController.getXYData.js"
  }
};
