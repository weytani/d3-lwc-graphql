// ABOUTME: Unit tests for the D3 waffle chart Lightning Web Component.
// ABOUTME: Covers initialization, data sources, aggregation, themes, config, cell allocation, events, tooltips, and responsive behavior.

import { createElement } from "lwc";
import D3WaffleChartGraphql from "c/d3WaffleChartGraphql";
import { loadD3 } from "../d3Loader";
import { graphql } from "lightning/graphql";

jest.mock("../d3Loader", () => ({
  loadD3: jest.fn()
}));

// Mock NavigationMixin
const mockNavigate = jest.fn();
jest.mock(
  "lightning/navigation",
  () => {
    return {
      NavigationMixin: jest.fn((Base) => {
        return class extends Base {
          [Symbol.for("NavigationMixin.Navigate")] = mockNavigate;
        };
      })
    };
  },
  { virtual: true }
);

// ═══════════════════════════════════════════════════════════════
// MOCK D3 FACTORY (waffle uses RECTS, not arcs) — the bundle-local
// data.js/theme.js/utils.js/graphql.js modules run for real.
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

// Sample test data
const SAMPLE_DATA = [
  { StageName: "Prospecting", Amount: 100 },
  { StageName: "Prospecting", Amount: 200 },
  { StageName: "Qualification", Amount: 150 },
  { StageName: "Closed Won", Amount: 500 }
];

// UI API grouped-aggregate envelope, as the lightning/graphql wire delivers it.
const WIRE_RESPONSE = {
  uiapi: {
    aggregate: {
      Opportunity: {
        edges: [
          {
            node: {
              aggregate: {
                StageName: { value: "Prospecting" },
                Amount: { sum: { value: 1000 } }
              }
            }
          },
          {
            node: {
              aggregate: {
                StageName: { value: "Closed Won" },
                Amount: { sum: { value: 5000 } }
              }
            }
          }
        ]
      }
    }
  }
};

// Flush promises helper
// eslint-disable-next-line @lwc/lwc/no-async-operation
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("c-d3-waffle-chart-graphql", () => {
  let element;
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
    jest.clearAllMocks();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  async function createChart(props = {}) {
    element = createElement("c-d3-waffle-chart-graphql", {
      is: D3WaffleChartGraphql
    });

    Object.assign(element, {
      groupByField: "StageName",
      valueField: "Amount",
      operation: "Count",
      recordCollection: SAMPLE_DATA,
      ...props
    });

    document.body.appendChild(element);
    await flushPromises();
    await flushPromises();
    return element;
  }

  // ═══════════════════════════════════════════════════════════════
  // INITIALIZATION TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("initialization", () => {
    it("shows loading spinner initially", () => {
      element = createElement("c-d3-waffle-chart-graphql", {
        is: D3WaffleChartGraphql
      });
      element.groupByField = "StageName";
      element.recordCollection = SAMPLE_DATA;

      document.body.appendChild(element);

      const spinner = element.shadowRoot.querySelector("lightning-spinner");
      expect(spinner).toBeTruthy();
    });

    it("loads D3 library on connect", async () => {
      await createChart();
      expect(loadD3).toHaveBeenCalled();
    });

    it("hides spinner after data loads", async () => {
      await createChart();

      const spinner = element.shadowRoot.querySelector("lightning-spinner");
      expect(spinner).toBeFalsy();
    });

    it("renders chart container when data is available", async () => {
      await createChart();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DATA HANDLING TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("data handling", () => {
    it("uses recordCollection when provided", async () => {
      await createChart({ recordCollection: SAMPLE_DATA });

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeFalsy();
    });

    it("shows the no-data state when no source is configured", async () => {
      await createChart({
        recordCollection: [],
        objectApiName: "",
        graphqlQuery: ""
      });

      // No recordCollection and no provisioned GraphQL query: neither an error
      // nor a chart, just the empty state.
      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeFalsy();
    });

    it("recordCollection takes priority over a free-text graphqlQuery", async () => {
      await createChart({
        recordCollection: SAMPLE_DATA,
        graphqlQuery:
          "query { uiapi { query { Opportunity { edges { node { StageName { value } } } } } } }"
      });

      // recordCollection wins: the chart renders from it and the un-emitted
      // free-text wire never becomes the data source (no error state).
      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeFalsy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DATA EDGE CASES
  // ═══════════════════════════════════════════════════════════════

  describe("data edge cases", () => {
    it("shows an error when records are missing the mapped fields", async () => {
      const wrongFields = [{ WrongField: "A", WrongValue: 100 }];
      await createChart({ recordCollection: wrongFields });

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // AGGREGATION TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("aggregation operations", () => {
    it("accepts Sum operation", async () => {
      await createChart({ operation: "Sum" });

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });

    it("accepts Count operation", async () => {
      await createChart({ operation: "Count" });

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });

    it("accepts Average operation", async () => {
      await createChart({ operation: "Average" });

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // THEME TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("themes", () => {
    it("renders with Salesforce Standard theme", async () => {
      await createChart({ theme: "Salesforce Standard" });
      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });

    it("renders with Warm theme", async () => {
      await createChart({ theme: "Warm" });
      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });

    it("renders with Cool theme", async () => {
      await createChart({ theme: "Cool" });
      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });

    it("renders with Vibrant theme", async () => {
      await createChart({ theme: "Vibrant" });
      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CONFIGURATION TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("configuration", () => {
    it("applies custom height", async () => {
      await createChart({ height: 400 });

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container.getAttribute("style")).toContain("400px");
    });

    it("accepts advancedConfig JSON", async () => {
      await createChart({
        advancedConfig: '{"showCellLabels": true}'
      });

      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });

    it("handles invalid advancedConfig gracefully", async () => {
      await createChart({
        advancedConfig: "not valid json"
      });

      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // EVENTS TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("events", () => {
    it("registers click handler on cells via D3 on()", async () => {
      await createChart({
        objectApiName: "Opportunity",
        filterField: "StageName"
      });

      const onCalls = mockD3.on.mock.calls;
      const clickCalls = onCalls.filter((c) => c[0] === "click");
      expect(clickCalls.length).toBeGreaterThan(0);
    });

    it("registers mouseenter handler on cells", async () => {
      await createChart();

      const onCalls = mockD3.on.mock.calls;
      const mouseenterCalls = onCalls.filter((c) => c[0] === "mouseenter");
      expect(mouseenterCalls.length).toBeGreaterThan(0);
    });

    it("registers mouseleave handler on cells", async () => {
      await createChart();

      const onCalls = mockD3.on.mock.calls;
      const mouseleaveCalls = onCalls.filter((c) => c[0] === "mouseleave");
      expect(mouseleaveCalls.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // RENDERING DETAILS — WAFFLE CELL ALLOCATION
  // ═══════════════════════════════════════════════════════════════

  describe("rendering details", () => {
    it("removes existing SVG before re-render", async () => {
      await createChart();

      expect(mockD3.select).toHaveBeenCalled();
      expect(mockD3.remove).toHaveBeenCalled();
    });

    it("appends an svg element", async () => {
      await createChart();

      const appendCalls = mockD3.append.mock.calls.map((c) => c[0]);
      expect(appendCalls).toContain("svg");
    });

    it("binds exactly 100 cells to d3.data()", async () => {
      await createChart();

      // renderChart builds a flat array of 100 cell descriptors and binds it
      const dataCalls = mockD3.data.mock.calls;
      const cellBinding = dataCalls.find(
        (call) => Array.isArray(call[0]) && call[0].length === 100
      );
      expect(cellBinding).toBeDefined();
    });

    it("appends rect elements for cells (not arcs)", async () => {
      await createChart();

      const appendCalls = mockD3.append.mock.calls.map((c) => c[0]);
      expect(appendCalls).toContain("rect");
    });

    it("allocates filled cell counts matching rounded proportions", async () => {
      // recordCollection (Sum): Closed Won=500, Prospecting=300, Qualification=150 (total 950)
      // round(500/950*100)=53, round(300/950*100)=32, round(150/950*100)=16 => 101,
      // descending allocator caps total at 100: last category trimmed to 15
      await createChart({ recordCollection: SAMPLE_DATA, operation: "Sum" });

      const dataCalls = mockD3.data.mock.calls;
      const cellBinding = dataCalls.find(
        (call) => Array.isArray(call[0]) && call[0].length === 100
      );
      expect(cellBinding).toBeDefined();

      const cells = cellBinding[0];
      const counts = cells.reduce((acc, cell) => {
        acc[cell.label] = (acc[cell.label] || 0) + 1;
        return acc;
      }, {});

      expect(counts["Closed Won"]).toBe(53);
      expect(counts.Prospecting).toBe(32);
      expect(counts.Qualification).toBe(15);
    });

    it("assigns each cell a color string from the category color scale", async () => {
      await createChart();

      const dataCalls = mockD3.data.mock.calls;
      const cellBinding = dataCalls.find(
        (call) => Array.isArray(call[0]) && call[0].length === 100
      );
      const cells = cellBinding[0];
      cells.forEach((cell) => {
        expect(typeof cell.color).toBe("string");
        expect(cell.color.startsWith("#")).toBe(true);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // GETTERS
  // ═══════════════════════════════════════════════════════════════

  describe("getters", () => {
    it("containerStyle reflects configured height", async () => {
      await createChart({ height: 350 });

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container.getAttribute("style")).toContain("350px");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // RESPONSIVE BEHAVIOR / RENDER-ORCHESTRATION HARDENING (§4.3)
  // ═══════════════════════════════════════════════════════════════

  describe("responsive behavior", () => {
    it("sets up a resize observer", async () => {
      await createChart();
      expect(global.ResizeObserver).toHaveBeenCalled();
    });

    it("handles zero container width gracefully", async () => {
      Element.prototype.getBoundingClientRect = jest.fn(() => ({
        width: 0,
        height: 300,
        top: 0,
        left: 0,
        bottom: 300,
        right: 0
      }));

      await createChart();
      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });

    it("renders once the container becomes measurable via the resize observer", async () => {
      // Container starts at zero width; capture the ResizeObserver callback.
      let roCallback = null;
      global.ResizeObserver = jest.fn().mockImplementation((cb) => {
        roCallback = cb;
        return {
          observe: jest.fn(),
          unobserve: jest.fn(),
          disconnect: jest.fn()
        };
      });
      Element.prototype.getBoundingClientRect = jest.fn(() => ({
        width: 0,
        height: 300,
        top: 0,
        left: 0,
        bottom: 300,
        right: 0
      }));

      await createChart();

      // Zero width: nothing drawn yet, but the observer must already be
      // registered so a later measurement can render (no fixed give-up window).
      expect(mockD3.append.mock.calls.map((c) => c[0])).not.toContain("svg");
      expect(roCallback).toBeTruthy();

      // The container becomes measurable; the observer fires the render.
      jest.useFakeTimers();
      roCallback([{ contentRect: { width: 400, height: 300 } }]);
      jest.advanceTimersByTime(250);
      jest.useRealTimers();
      await flushPromises();

      expect(mockD3.append.mock.calls.map((c) => c[0])).toContain("svg");
    });

    it("does not latch an empty shell when first measured below the chart margins, and recovers when it grows", async () => {
      // waffle's padding floors at 10px per side (Math.max(10, round(cw*0.04)))
      // for any containerWidth under 250, so the left+right margin sum is a
      // flat 20px in that range. A 10px width (nonzero) makes renderChart bail
      // before appending the svg. The observer must draw the chart once the
      // container grows past the margins — not leave a permanent empty shell.
      let roCallback = null;
      global.ResizeObserver = jest.fn().mockImplementation((cb) => {
        roCallback = cb;
        return {
          observe: jest.fn(),
          unobserve: jest.fn(),
          disconnect: jest.fn()
        };
      });
      Element.prototype.getBoundingClientRect = jest.fn(() => ({
        width: 10,
        height: 300,
        top: 0,
        left: 0,
        bottom: 300,
        right: 10
      }));

      await createChart();

      // 10px is below the 20px horizontal margin: no svg drawn yet.
      expect(mockD3.append.mock.calls.map((c) => c[0])).not.toContain("svg");
      expect(roCallback).toBeTruthy();

      jest.useFakeTimers();
      roCallback([{ contentRect: { width: 400, height: 300 } }]);
      jest.advanceTimersByTime(250);
      jest.useRealTimers();
      await flushPromises();

      expect(mockD3.append.mock.calls.map((c) => c[0])).toContain("svg");
    });

    it("creates exactly one resize observer across the render lifecycle", async () => {
      await createChart();

      // A single unified observer drives both the first render and re-renders.
      expect(global.ResizeObserver).toHaveBeenCalledTimes(1);
    });

    it("rebinds the tooltip and observer when an error destroys and recreates the container", async () => {
      // data → error → data walks the template's if/elseif chain through the
      // error branch, which destroys .chart-container and builds a fresh one on
      // recovery. Existence-only guards would strand the tooltip in the detached
      // old node and leave the observer watching a dead element.
      const roCallbacks = [];
      global.ResizeObserver = jest.fn().mockImplementation((cb) => {
        roCallbacks.push(cb);
        return {
          observe: jest.fn(),
          unobserve: jest.fn(),
          disconnect: jest.fn()
        };
      });

      element = createElement("c-d3-waffle-chart-graphql", {
        is: D3WaffleChartGraphql
      });
      Object.assign(element, {
        objectApiName: "Opportunity",
        groupByField: "StageName",
        valueField: "Amount",
        operation: "Sum"
      });
      document.body.appendChild(element);
      await flushPromises();

      graphql.emit(WIRE_RESPONSE);
      await flushPromises();
      const firstContainer =
        element.shadowRoot.querySelector(".chart-container");
      expect(firstContainer).toBeTruthy();

      graphql.emitErrors([{ message: "wire boom" }]);
      await flushPromises();
      expect(element.shadowRoot.querySelector(".chart-container")).toBeFalsy();

      graphql.emit(WIRE_RESPONSE);
      await flushPromises();

      const secondContainer =
        element.shadowRoot.querySelector(".chart-container");
      expect(secondContainer).toBeTruthy();
      expect(secondContainer).not.toBe(firstContainer);

      // The tooltip must live in the container that is actually on screen.
      expect(secondContainer.querySelector(".slds-popover")).toBeTruthy();
      // One observer per container generation, rebound to the live container.
      expect(global.ResizeObserver).toHaveBeenCalledTimes(2);

      // The newly captured callback must drive a render, not watch a dead node.
      mockD3.append.mockClear();
      jest.useFakeTimers();
      roCallbacks[roCallbacks.length - 1]([
        { contentRect: { width: 500, height: 300 } }
      ]);
      jest.advanceTimersByTime(250);
      jest.useRealTimers();
      await flushPromises();

      expect(mockD3.append.mock.calls.map((c) => c[0])).toContain("svg");
    });

    it("disconnects resize handler on component removal", async () => {
      const mockDisconnect = jest.fn();
      global.ResizeObserver = jest.fn().mockImplementation(() => ({
        observe: jest.fn(),
        unobserve: jest.fn(),
        disconnect: mockDisconnect
      }));

      await createChart();
      document.body.removeChild(element);

      expect(mockDisconnect).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ERROR RECOVERY TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("error recovery", () => {
    it("shows error when D3 fails to load", async () => {
      loadD3.mockRejectedValue(new Error("D3 load failed"));

      await createChart();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeTruthy();
    });

    it("surfaces an exception thrown during renderChart to the error state", async () => {
      // Force renderChart to throw mid-flight; it must not die silently.
      mockD3.select = jest.fn(() => {
        throw new Error("render boom");
      });

      await createChart();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeTruthy();
      expect(errorElement.textContent).toContain("render boom");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════

  describe("cleanup", () => {
    it("destroys the tooltip element on disconnect", async () => {
      await createChart();

      const tooltip = element.shadowRoot
        .querySelector(".chart-container")
        .querySelector(".slds-popover_tooltip");
      expect(tooltip).toBeTruthy();
      expect(tooltip.parentNode).toBeTruthy();

      document.body.removeChild(element);

      expect(tooltip.parentNode).toBeFalsy();
    });
  });
});
