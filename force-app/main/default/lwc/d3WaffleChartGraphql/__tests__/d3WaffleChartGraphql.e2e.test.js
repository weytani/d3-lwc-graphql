// ABOUTME: End-to-end lifecycle tests for the D3 Waffle Chart component.
// ABOUTME: Verifies full render pipeline, 100-cell allocation, GraphQL self-fetch, multi-instance isolation, and error recovery using real bundle-local modules with mocked D3.

import { createElement } from "lwc";
import D3WaffleChartGraphql from "c/d3WaffleChartGraphql";
import { loadD3 } from "../d3Loader";
import { graphql } from "lightning/graphql";

// ═══════════════════════════════════════════════════════════════
// MOCK SETUP: Only mock D3 lib and navigation.
// Real modules: ./data, ./theme, ./utils, ./graphql
// ═══════════════════════════════════════════════════════════════

jest.mock("../d3Loader", () => ({
  loadD3: jest.fn()
}));

const mockNavigate = jest.fn();
jest.mock(
  "lightning/navigation",
  () => {
    const NavMixin = jest.fn((Base) => {
      return class extends Base {
        [Symbol.for("NavigationMixin.Navigate")] = mockNavigate;
      };
    });
    NavMixin.Navigate = Symbol.for("NavigationMixin.Navigate");
    NavMixin.GenerateUrl = Symbol.for("NavigationMixin.GenerateUrl");
    return { NavigationMixin: NavMixin };
  },
  { virtual: true }
);

jest.mock(
  "lightning/platformShowToastEvent",
  () => {
    return {
      ShowToastEvent: class ShowToastEvent extends CustomEvent {
        constructor(toast) {
          super("lightning__showtoast", {
            composed: true,
            cancelable: true,
            bubbles: true,
            detail: toast
          });
        }
      }
    };
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

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

// eslint-disable-next-line @lwc/lwc/no-async-operation
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

async function createChart(props = {}) {
  const element = createElement("c-d3-waffle-chart-graphql", {
    is: D3WaffleChartGraphql
  });

  Object.assign(element, {
    groupByField: "StageName",
    valueField: "Amount",
    operation: "Sum",
    recordCollection: SAMPLE_DATA,
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

describe("c-d3-waffle-chart-graphql e2e", () => {
  let consoleErrorSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    jest.clearAllMocks();

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
  // FULL RENDER LIFECYCLE
  // ═══════════════════════════════════════════════════════════════

  describe("full render lifecycle", () => {
    it("creates waffle chart end-to-end with 100 cells and pristine console", async () => {
      const mockD3 = createMockD3();
      loadD3.mockResolvedValue(mockD3);

      const element = await createChart();

      // loadD3 was called during connectedCallback
      expect(loadD3).toHaveBeenCalled();

      // SVG and rect cells were appended
      const appendCalls = mockD3.append.mock.calls.map((c) => c[0]);
      expect(appendCalls).toContain("svg");
      expect(appendCalls).toContain("rect");

      // Exactly 100 cells were bound
      const cellBinding = mockD3.data.mock.calls.find(
        (call) => Array.isArray(call[0]) && call[0].length === 100
      );
      expect(cellBinding).toBeDefined();

      // Chart container visible, spinner gone, no error
      const chartContainer =
        element.shadowRoot.querySelector(".chart-container");
      expect(chartContainer).toBeTruthy();

      const spinner = element.shadowRoot.querySelector("lightning-spinner");
      expect(spinner).toBeFalsy();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();

      // No console errors during the full lifecycle
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("GraphQL self-fetch path: no recordCollection -> wire emits -> full pipeline", async () => {
      const mockD3 = createMockD3();
      loadD3.mockResolvedValue(mockD3);

      const element = createElement("c-d3-waffle-chart-graphql", {
        is: D3WaffleChartGraphql
      });
      Object.assign(element, {
        groupByField: "StageName",
        operation: "Count",
        objectApiName: "Opportunity",
        recordCollection: []
      });
      document.body.appendChild(element);
      await flushPromises();

      graphql.emit({
        uiapi: {
          query: {
            Opportunity: {
              edges: [
                { node: { StageName: { value: "Discovery" } } },
                { node: { StageName: { value: "Discovery" } } },
                { node: { StageName: { value: "Proposal" } } }
              ]
            }
          }
        }
      });
      await flushPromises();
      await flushPromises();

      expect(loadD3).toHaveBeenCalled();
      const appendCalls = mockD3.append.mock.calls.map((c) => c[0]);
      expect(appendCalls).toContain("svg");
      expect(appendCalls).toContain("rect");
      const cellBinding = mockD3.data.mock.calls.find(
        (call) => Array.isArray(call[0]) && call[0].length === 100
      );
      expect(cellBinding).toBeDefined();

      const chartContainer =
        element.shadowRoot.querySelector(".chart-container");
      expect(chartContainer).toBeTruthy();
      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeFalsy();
    });

    it("cleanup removes resize handler on disconnect without errors", async () => {
      const mockDisconnect = jest.fn();
      global.ResizeObserver = jest.fn().mockImplementation(() => ({
        observe: jest.fn(),
        unobserve: jest.fn(),
        disconnect: mockDisconnect
      }));

      const mockD3 = createMockD3();
      loadD3.mockResolvedValue(mockD3);

      const element = await createChart();

      const chartContainer =
        element.shadowRoot.querySelector(".chart-container");
      expect(chartContainer).toBeTruthy();

      document.body.removeChild(element);

      expect(mockDisconnect).toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DATA-FLOW VERIFICATION (exact values)
  // ═══════════════════════════════════════════════════════════════

  describe("data-flow verification", () => {
    it("real Sum aggregation flows into exact cell counts end-to-end", async () => {
      const mockD3 = createMockD3();
      loadD3.mockResolvedValue(mockD3);

      await createChart({ operation: "Sum" });

      const cells = mockD3.data.mock.calls.find(
        (call) => Array.isArray(call[0]) && call[0].length === 100
      )[0];

      const counts = cells.reduce((acc, cell) => {
        if (cell.label) acc[cell.label] = (acc[cell.label] || 0) + 1;
        return acc;
      }, {});

      // Closed Won=500, Prospecting=300, Qualification=150 (total 950)
      // round(53), round(32), round(16)->trimmed to 15 by cap = 100 filled cells
      expect(counts["Closed Won"]).toBe(53);
      expect(counts.Prospecting).toBe(32);
      expect(counts.Qualification).toBe(15);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // MULTI-COMPONENT ISOLATION
  // ═══════════════════════════════════════════════════════════════

  describe("multi-component isolation", () => {
    it("two instances render independently with separate D3 state", async () => {
      const mockD3A = createMockD3();
      loadD3.mockResolvedValue(mockD3A);
      const elementA = await createChart({ theme: "Salesforce Standard" });

      const mockD3B = createMockD3();
      loadD3.mockResolvedValue(mockD3B);
      const elementB = await createChart({ theme: "Warm" });

      // Each instance bound its own 100-cell array
      const cellsA = mockD3A.data.mock.calls.find(
        (call) => Array.isArray(call[0]) && call[0].length === 100
      )[0];
      const cellsB = mockD3B.data.mock.calls.find(
        (call) => Array.isArray(call[0]) && call[0].length === 100
      )[0];

      expect(cellsA.length).toBe(100);
      expect(cellsB.length).toBe(100);

      // Theme isolation: instance A uses Salesforce Standard, B uses Warm
      const closedWonA = cellsA.find((c) => c.label === "Closed Won");
      const closedWonB = cellsB.find((c) => c.label === "Closed Won");
      expect(closedWonA.color).toBe("#1589EE");
      expect(closedWonB.color).toBe("#FF6B6B");

      // Both containers exist in the DOM
      expect(
        elementA.shadowRoot.querySelector(".chart-container")
      ).toBeTruthy();
      expect(
        elementB.shadowRoot.querySelector(".chart-container")
      ).toBeTruthy();

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ERROR → RECOVERY FLOW
  // ═══════════════════════════════════════════════════════════════

  describe("error recovery flow", () => {
    it("shows error state when D3 fails to load", async () => {
      loadD3.mockRejectedValue(new Error("Network failure loading D3"));

      const element = await createChart();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeTruthy();

      const chartContainer =
        element.shadowRoot.querySelector(".chart-container");
      expect(chartContainer).toBeFalsy();

      const spinner = element.shadowRoot.querySelector("lightning-spinner");
      expect(spinner).toBeFalsy();

      // Error path: the init error is logged (expected) — assert the spy WAS called
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });
});
