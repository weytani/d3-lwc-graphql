// ABOUTME: Integration tests for d3WaffleChartGraphql verifying real bundle-local pipelines (data, theme, utils, graphql).
// ABOUTME: Only D3, GraphQL, and NavigationMixin are mocked; aggregation, color, contrast, and self-fetch logic run for real.

import { createElement } from "lwc";
import D3WaffleChartGraphql from "c/d3WaffleChartGraphql";
import { loadD3 } from "../d3Loader";

// ═══════════════════════════════════════════════════════════════
// MOCKS — Only external dependencies, NOT the bundle-local modules
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
// MOCK D3 FACTORY (waffle-specific — rects, no arcs/pie)
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
// Total = 950; cells: round(500/950*100)=53, round(300/950*100)=32, round(150/950*100)=16->15 (cap)

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

const flushPromises = () => new Promise(process.nextTick);

async function createChart(props = {}) {
  const element = createElement("c-d3-waffle-chart-graphql", {
    is: D3WaffleChartGraphql
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

describe("c-d3-waffle-chart-graphql integration", () => {
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
  // CELL ALLOCATION WITH REAL DATA.JS AGGREGATION
  // ═══════════════════════════════════════════════════════════════

  describe("cell allocation with real aggregation", () => {
    it("binds exactly 100 cells from real Sum aggregation", async () => {
      await createChart({ operation: "Sum" });

      const dataCalls = mockD3.data.mock.calls;
      const cellBinding = dataCalls.find(
        (call) => Array.isArray(call[0]) && call[0].length === 100
      );
      expect(cellBinding).toBeDefined();
      expect(cellBinding[0].length).toBe(100);
    });

    it("filled cell counts match rounded real proportions (descending, capped)", async () => {
      await createChart({ operation: "Sum" });

      const dataCalls = mockD3.data.mock.calls;
      const cells = dataCalls.find(
        (call) => Array.isArray(call[0]) && call[0].length === 100
      )[0];

      const counts = cells.reduce((acc, cell) => {
        if (cell.label) acc[cell.label] = (acc[cell.label] || 0) + 1;
        return acc;
      }, {});

      // Real data.js Sum: Closed Won=500, Prospecting=300, Qualification=150 (total 950)
      // round(500/950*100)=53, round(300/950*100)=32, round(150/950*100)=16
      // descending allocator caps at 100 -> Qualification trimmed to 15
      expect(counts["Closed Won"]).toBe(53);
      expect(counts.Prospecting).toBe(32);
      expect(counts.Qualification).toBe(15);

      const filled =
        counts["Closed Won"] + counts.Prospecting + counts.Qualification;
      expect(filled).toBe(100);
    });

    it("Count operation produces correct cell counts", async () => {
      // Count: Prospecting=2, Closed Won=1, Qualification=1 (total 4)
      // round(2/4*100)=50, round(1/4*100)=25, round(1/4*100)=25 -> 100 total
      await createChart({ operation: "Count" });

      const dataCalls = mockD3.data.mock.calls;
      const cells = dataCalls.find(
        (call) => Array.isArray(call[0]) && call[0].length === 100
      )[0];

      const counts = cells.reduce((acc, cell) => {
        if (cell.label) acc[cell.label] = (acc[cell.label] || 0) + 1;
        return acc;
      }, {});

      expect(counts.Prospecting).toBe(50);
      expect(counts["Closed Won"]).toBe(25);
      expect(counts.Qualification).toBe(25);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // REAL THEME.JS PALETTE FLOWS INTO CELLS
  // ═══════════════════════════════════════════════════════════════

  describe("real theme.js palette", () => {
    it("Salesforce Standard hex colors map to descending categories", async () => {
      await createChart({ operation: "Sum", theme: "Salesforce Standard" });

      const dataCalls = mockD3.data.mock.calls;
      const cells = dataCalls.find(
        (call) => Array.isArray(call[0]) && call[0].length === 100
      )[0];

      // createColorScale built over full domain [Closed Won, Prospecting, Qualification]
      // Salesforce Standard palette: #1589EE, #FF9E2C, #4BCA81
      const colorByLabel = {};
      cells.forEach((cell) => {
        if (cell.label) colorByLabel[cell.label] = cell.color;
      });

      expect(colorByLabel["Closed Won"]).toBe("#1589EE");
      expect(colorByLabel.Prospecting).toBe("#FF9E2C");
      expect(colorByLabel.Qualification).toBe("#4BCA81");
    });

    it("Warm theme hex colors flow into cells", async () => {
      await createChart({ operation: "Sum", theme: "Warm" });

      const dataCalls = mockD3.data.mock.calls;
      const cells = dataCalls.find(
        (call) => Array.isArray(call[0]) && call[0].length === 100
      )[0];

      const closedWonCell = cells.find((c) => c.label === "Closed Won");
      // Warm palette first color
      expect(closedWonCell.color).toBe("#FF6B6B");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // REAL UTILS.JS CONTRAST
  // ═══════════════════════════════════════════════════════════════

  describe("real utils.js contrast", () => {
    it("each cell carries a real getContrastColor textColor", async () => {
      await createChart({ operation: "Sum", theme: "Salesforce Standard" });

      const dataCalls = mockD3.data.mock.calls;
      const cells = dataCalls.find(
        (call) => Array.isArray(call[0]) && call[0].length === 100
      )[0];

      // getContrastColor returns "#000000" or "#ffffff"
      cells.forEach((cell) => {
        expect(["#000000", "#ffffff"]).toContain(cell.textColor);
      });

      // #1589EE (Closed Won) has WCAG luminance ~0.24 (> 0.179) -> dark text
      const closedWonCell = cells.find((c) => c.label === "Closed Won");
      expect(closedWonCell.textColor).toBe("#000000");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // GRAPHQL WIRE INTEGRATION (real graphql.js + data.js pipeline)
  // ═══════════════════════════════════════════════════════════════

  describe("graphql wire integration", () => {
    it("aggregates a GraphQL Count record set through the real pipeline", async () => {
      const { graphql } = require("lightning/graphql");

      const element = createElement("c-d3-waffle-chart-graphql", {
        is: D3WaffleChartGraphql
      });
      Object.assign(element, {
        objectApiName: "Opportunity",
        groupByField: "StageName",
        operation: "Count"
      });
      document.body.appendChild(element);

      await flushPromises();
      graphql.emit({
        uiapi: {
          query: {
            Opportunity: {
              edges: [
                { node: { StageName: { value: "Negotiation" } } },
                { node: { StageName: { value: "Negotiation" } } },
                { node: { StageName: { value: "Closed Lost" } } }
              ]
            }
          }
        }
      });
      await flushPromises();
      await flushPromises();

      // Real aggregateData Count: Negotiation=2, Closed Lost=1 (total 3)
      // round(2/3*100)=67, round(1/3*100)=33
      const dataCalls = mockD3.data.mock.calls;
      const cells = dataCalls.find(
        (call) => Array.isArray(call[0]) && call[0].length === 100
      )[0];
      const counts = cells.reduce((acc, cell) => {
        if (cell.label) acc[cell.label] = (acc[cell.label] || 0) + 1;
        return acc;
      }, {});
      expect(counts.Negotiation).toBe(67);
      expect(counts["Closed Lost"]).toBe(33);

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeFalsy();
    });

    it("free-text graphqlQuery Sum aggregates the wire rows to the correct values", async () => {
      const { graphql } = require("lightning/graphql");

      const element = createElement("c-d3-waffle-chart-graphql", {
        is: D3WaffleChartGraphql
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

      // Sum: Closed Won=500, Prospecting=300 (total 800)
      // round(500/800*100)=63, round(300/800*100)=38 -> capped: 63+37=100
      const dataCalls = mockD3.data.mock.calls;
      const cells = dataCalls.find(
        (call) => Array.isArray(call[0]) && call[0].length === 100
      )[0];
      const counts = cells.reduce((acc, cell) => {
        if (cell.label) acc[cell.label] = (acc[cell.label] || 0) + 1;
        return acc;
      }, {});
      expect(counts["Closed Won"]).toBe(63);
      expect(counts.Prospecting).toBe(37);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // EVENT PIPELINE INTEGRATION
  // ═══════════════════════════════════════════════════════════════

  describe("event pipeline integration", () => {
    it("cell click registers D3 click handler when objectApiName is set", async () => {
      const element = await createChart({
        objectApiName: "Opportunity",
        filterField: "StageName"
      });

      const onCalls = mockD3.on.mock.calls;
      const clickCalls = onCalls.filter((c) => c[0] === "click");
      expect(clickCalls.length).toBeGreaterThan(0);

      expect(element.objectApiName).toBe("Opportunity");
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
