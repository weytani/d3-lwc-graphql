// ABOUTME: Integration tests for d3FunnelChartGraphql verifying real bundle-local pipelines (data, theme, utils, graphql).
// ABOUTME: Only D3, GraphQL, and NavigationMixin are mocked; aggregation, color, and a11y logic run for real.

import { createElement } from "lwc";
import D3FunnelChartGraphql from "c/d3FunnelChartGraphql";
import { loadD3 } from "../d3Loader";

// ═══════════════════════════════════════════════════════════════
// MOCKS — Only external dependencies, NOT real bundle-local pipelines
// ═══════════════════════════════════════════════════════════════

jest.mock("../d3Loader", () => ({
  loadD3: jest.fn()
}));

jest.mock(
  "lightning/platformShowToastEvent",
  () => ({
    ShowToastEvent: jest.fn()
  }),
  { virtual: true }
);

const NAVIGATE_SYMBOL = Symbol.for("NavigationMixin.Navigate");
const mockNavigate = jest.fn();
jest.mock(
  "lightning/navigation",
  () => {
    const NavigationMixin = (Base) => {
      return class extends Base {
        [NAVIGATE_SYMBOL] = mockNavigate;
      };
    };
    NavigationMixin.Navigate = NAVIGATE_SYMBOL;
    return { NavigationMixin };
  },
  { virtual: true }
);

// ═══════════════════════════════════════════════════════════════
// MOCK D3 FACTORY
// ═══════════════════════════════════════════════════════════════

const createMockD3 = () => {
  const d3 = {
    select: jest.fn(() => d3),
    append: jest.fn(() => d3),
    attr: jest.fn(() => d3),
    style: jest.fn(() => d3),
    call: jest.fn(() => d3),
    selectAll: jest.fn(() => d3),
    data: jest.fn(() => d3),
    enter: jest.fn(() => d3),
    transition: jest.fn(() => d3),
    duration: jest.fn(() => d3),
    delay: jest.fn(() => d3),
    on: jest.fn(() => d3),
    remove: jest.fn(() => d3),
    text: jest.fn(() => d3),
    insert: jest.fn(() => d3)
  };
  return d3;
};

// ═══════════════════════════════════════════════════════════════
// SAMPLE DATA
// ═══════════════════════════════════════════════════════════════

const SAMPLE_DATA = [
  { StageName: "Prospecting", Amount: 100 },
  { StageName: "Prospecting", Amount: 200 },
  { StageName: "Qualification", Amount: 150 },
  { StageName: "Closed Won", Amount: 500 }
];
// After Sum aggregation by StageName: Closed Won=500, Prospecting=300, Qualification=150

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

const flushPromises = () => new Promise(process.nextTick);

async function createChart(props = {}) {
  const element = createElement("c-d3-funnel-chart-graphql", {
    is: D3FunnelChartGraphql
  });

  Object.assign(element, {
    groupByField: "StageName",
    valueField: "Amount",
    operation: "Sum",
    recordCollection: SAMPLE_DATA,
    theme: "Salesforce Standard",
    ...props
  });

  document.body.appendChild(element);

  await flushPromises();
  await flushPromises();

  return element;
}

// ═══════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════

describe("c-d3-funnel-chart-graphql integration", () => {
  let mockD3;
  let consoleErrorSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    mockD3 = createMockD3();
    loadD3.mockResolvedValue(mockD3);

    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    Element.prototype.getBoundingClientRect = jest.fn(() => ({
      width: 400,
      height: 300,
      top: 0,
      left: 0,
      bottom: 300,
      right: 400
    }));

    global.ResizeObserver = jest.fn().mockImplementation(() => ({
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn()
    }));
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  // ═══════════════════════════════════════════════════════════════
  // THEME PIPELINE INTEGRATION
  // ═══════════════════════════════════════════════════════════════

  describe("theme pipeline integration", () => {
    it("applies Salesforce Standard palette colors to segment fills", async () => {
      await createChart({ theme: "Salesforce Standard" });

      // Real getColors for 'Salesforce Standard' returns:
      // ['#1589EE', '#FF9E2C', '#4BCA81', ...] sliced to count
      // The segment path's fill is set first, before the label text fills.
      const attrCalls = mockD3.attr.mock.calls;
      const fillCalls = attrCalls.filter((call) => call[0] === "fill");
      expect(fillCalls.length).toBeGreaterThan(0);

      const fillFn = fillCalls[0][1];
      expect(typeof fillFn).toBe("function");

      expect(fillFn({}, 0)).toBe("#1589EE");
      expect(fillFn({}, 1)).toBe("#FF9E2C");
      expect(fillFn({}, 2)).toBe("#4BCA81");
    });

    it("applies Warm palette colors correctly", async () => {
      await createChart({ theme: "Warm" });

      const attrCalls = mockD3.attr.mock.calls;
      const fillCalls = attrCalls.filter((call) => call[0] === "fill");
      expect(fillCalls.length).toBeGreaterThan(0);

      const fillFn = fillCalls[0][1];
      expect(fillFn({}, 0)).toBe("#FF6B6B");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // GRAPHQL WIRE INTEGRATION
  // ═══════════════════════════════════════════════════════════════

  describe("graphql wire integration", () => {
    it("free-text graphqlQuery Sum aggregates the wire rows through the real data.js pipeline", async () => {
      const { graphql } = require("lightning/graphql");

      const element = createElement("c-d3-funnel-chart-graphql", {
        is: D3FunnelChartGraphql
      });
      Object.assign(element, {
        graphqlQuery:
          "query { uiapi { query { Opportunity { edges { node { StageName { value } Amount { value } } } } } } }",
        objectApiName: "Opportunity",
        groupByField: "StageName",
        valueField: "Amount",
        operation: "Sum"
      });
      document.body.appendChild(element);

      await flushPromises();
      graphql.emit({
        uiapi: {
          query: {
            Opportunity: {
              edges: [
                {
                  node: {
                    StageName: { value: "Prospecting" },
                    Amount: { value: 100 }
                  }
                },
                {
                  node: {
                    StageName: { value: "Prospecting" },
                    Amount: { value: 200 }
                  }
                },
                {
                  node: {
                    StageName: { value: "Closed Won" },
                    Amount: { value: 500 }
                  }
                }
              ]
            }
          }
        }
      });
      await flushPromises();
      await flushPromises();

      const dataCalls = mockD3.data.mock.calls;
      const chartDataCall = dataCalls.find(
        (call) =>
          Array.isArray(call[0]) && call[0].length > 0 && call[0][0].label
      );
      expect(chartDataCall).toBeTruthy();
      // Sum: Closed Won=500, Prospecting=300; sorted descending by value for the funnel.
      expect(chartDataCall[0]).toEqual([
        { label: "Closed Won", value: 500 },
        { label: "Prospecting", value: 300 }
      ]);

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeFalsy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ACCESSIBILITY WIRING
  // ═══════════════════════════════════════════════════════════════

  describe("accessibility wiring", () => {
    it("applies role=img and a title to the rendered svg", async () => {
      await createChart();

      const attrCalls = mockD3.attr.mock.calls;
      const roleCall = attrCalls.find((call) => call[0] === "role");
      expect(roleCall).toBeTruthy();
      expect(roleCall[1]).toBe("img");

      const insertCalls = mockD3.insert.mock.calls;
      const titleInsert = insertCalls.find((call) => call[0] === "title");
      expect(titleInsert).toBeTruthy();
      expect(titleInsert[1]).toBe(":first-child");
    });
  });
});
