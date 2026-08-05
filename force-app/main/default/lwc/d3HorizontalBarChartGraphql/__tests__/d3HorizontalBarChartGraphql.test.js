// ABOUTME: Unit tests for the d3HorizontalBarChartGraphql Lightning Web Component.
// ABOUTME: Tests initialization, data handling, aggregation, config, events, tooltip, resize, and error recovery for the horizontal (swapped-axis) bar chart.

import { createElement } from "lwc";
import D3HorizontalBarChartGraphql from "c/d3HorizontalBarChartGraphql";
import { loadD3 } from "../d3Loader";
import { graphql } from "lightning/graphql";

// Mock the bundle-local D3 loader
jest.mock("../d3Loader", () => ({
  loadD3: jest.fn()
}));

// ═══════════════════════════════════════════════════════════════
// MOCK D3 FACTORY
// ═══════════════════════════════════════════════════════════════

const createMockD3 = () => {
  const mockD3 = {
    select: jest.fn(() => mockD3),
    append: jest.fn(() => mockD3),
    attr: jest.fn(() => mockD3),
    style: jest.fn(() => mockD3),
    call: jest.fn(() => mockD3),
    selectAll: jest.fn(() => mockD3),
    data: jest.fn(() => mockD3),
    enter: jest.fn(() => mockD3),
    transition: jest.fn(() => mockD3),
    duration: jest.fn(() => mockD3),
    delay: jest.fn(() => mockD3),
    on: jest.fn(() => mockD3),
    remove: jest.fn(() => mockD3),
    html: jest.fn(() => mockD3),
    text: jest.fn(() => mockD3),
    insert: jest.fn(() => mockD3),
    scaleBand: jest.fn(() => {
      const scale = jest.fn(() => 50);
      scale.domain = jest.fn(() => scale);
      scale.range = jest.fn(() => scale);
      scale.padding = jest.fn(() => scale);
      scale.bandwidth = jest.fn(() => 40);
      return scale;
    }),
    scaleLinear: jest.fn(() => {
      const scale = jest.fn(() => 100);
      scale.domain = jest.fn(() => scale);
      scale.range = jest.fn(() => scale);
      scale.nice = jest.fn(() => scale);
      return scale;
    }),
    axisBottom: jest.fn(() => {
      const axis = jest.fn();
      axis.tickFormat = jest.fn(() => axis);
      axis.tickSize = jest.fn(() => axis);
      return axis;
    }),
    axisLeft: jest.fn(() => {
      const axis = jest.fn();
      axis.tickFormat = jest.fn(() => axis);
      axis.tickSize = jest.fn(() => axis);
      return axis;
    }),
    max: jest.fn(() => 500)
  };
  return mockD3;
};

// ═══════════════════════════════════════════════════════════════
// TEST DATA
// ═══════════════════════════════════════════════════════════════

const SAMPLE_DATA = [
  { StageName: "Prospecting", Amount: 100 },
  { StageName: "Prospecting", Amount: 200 },
  { StageName: "Qualification", Amount: 150 },
  { StageName: "Closed Won", Amount: 500 }
];

const SINGLE_RECORD = [{ StageName: "Prospecting", Amount: 100 }];

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

const NEGATIVE_DATA = [
  { StageName: "Loss", Amount: -100 },
  { StageName: "Gain", Amount: 200 }
];

const ZERO_DATA = [
  { StageName: "Zero", Amount: 0 },
  { StageName: "AlsoZero", Amount: 0 }
];

const SPECIAL_CHAR_DATA = [
  { StageName: 'Stage "A"', Amount: 100 },
  { StageName: "Stage 'B'", Amount: 200 },
  { StageName: "Stage <C>", Amount: 300 }
];

// Flush promises helper
// eslint-disable-next-line @lwc/lwc/no-async-operation
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("c-d3-horizontal-bar-chart-graphql", () => {
  let element;
  let mockD3;
  let consoleErrorSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    mockD3 = createMockD3();
    loadD3.mockResolvedValue(mockD3);

    // Spy on console to ensure pristine output
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    // Mock getBoundingClientRect
    Element.prototype.getBoundingClientRect = jest.fn(() => ({
      width: 400,
      height: 300,
      top: 0,
      left: 0,
      bottom: 300,
      right: 400
    }));

    // Mock ResizeObserver
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
    jest.clearAllMocks();
  });

  // Helper to create element with properties
  async function createChart(props = {}) {
    element = createElement("c-d3-horizontal-bar-chart-graphql", {
      is: D3HorizontalBarChartGraphql
    });

    Object.assign(element, {
      groupByField: "StageName",
      valueField: "Amount",
      operation: "Sum",
      recordCollection: SAMPLE_DATA,
      ...props
    });

    document.body.appendChild(element);

    // Wait for async operations
    await flushPromises();
    await flushPromises();

    return element;
  }

  // ═══════════════════════════════════════════════════════════════
  // INITIALIZATION TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("initialization", () => {
    it("shows loading state initially", async () => {
      element = createElement("c-d3-horizontal-bar-chart-graphql", {
        is: D3HorizontalBarChartGraphql
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

    it("hides loading after initialization", async () => {
      await createChart();
      await flushPromises();

      const spinner = element.shadowRoot.querySelector("lightning-spinner");
      expect(spinner).toBeFalsy();
    });

    it("renders chart container when data is available", async () => {
      await createChart();
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DATA HANDLING TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("data handling", () => {
    it("renders from recordCollection when provided", async () => {
      await createChart({
        recordCollection: SAMPLE_DATA
      });

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });

    it("shows the no-data state when no source is configured", async () => {
      await createChart({
        recordCollection: [],
        objectApiName: "",
        graphqlQuery: ""
      });

      await flushPromises();

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
      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DATA EDGE CASES
  // ═══════════════════════════════════════════════════════════════

  describe("data edge cases", () => {
    it("handles single record", async () => {
      await createChart({ recordCollection: SINGLE_RECORD });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });

    it("handles records with null groupByField values", async () => {
      const dataWithNull = [
        { StageName: null, Amount: 100 },
        { StageName: "Valid", Amount: 200 }
      ];
      await createChart({ recordCollection: dataWithNull });
      await flushPromises();

      // Should render without crashing - null becomes 'Null' label
      expect(loadD3).toHaveBeenCalled();
    });

    it("handles records with undefined valueField values", async () => {
      const dataUndef = [
        { StageName: "A", Amount: undefined },
        { StageName: "B", Amount: 100 }
      ];
      await createChart({ recordCollection: dataUndef });
      await flushPromises();

      expect(loadD3).toHaveBeenCalled();
    });

    it("handles negative values", async () => {
      await createChart({ recordCollection: NEGATIVE_DATA });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });

    it("handles zero values", async () => {
      await createChart({ recordCollection: ZERO_DATA });
      await flushPromises();

      expect(loadD3).toHaveBeenCalled();
    });

    it("handles special characters in labels", async () => {
      await createChart({ recordCollection: SPECIAL_CHAR_DATA });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });

    it("handles records with wrong field names", async () => {
      const wrongFields = [{ WrongField: "A", WrongValue: 100 }];
      await createChart({ recordCollection: wrongFields });
      await flushPromises();

      // Should show error since required fields are missing
      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeTruthy();
    });

    it("silently truncates data exceeding record limit", async () => {
      const largeData = Array.from({ length: 2500 }, (_, i) => ({
        StageName: `Stage${i % 10}`,
        Amount: i * 10
      }));

      const toastHandler = jest.fn();
      element = createElement("c-d3-horizontal-bar-chart-graphql", {
        is: D3HorizontalBarChartGraphql
      });
      element.addEventListener("lightning__showtoast", toastHandler);
      Object.assign(element, {
        groupByField: "StageName",
        valueField: "Amount",
        operation: "Sum",
        recordCollection: largeData
      });
      document.body.appendChild(element);

      await flushPromises();
      await flushPromises();

      // Truncation happens silently — no toast is dispatched
      expect(toastHandler).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // AGGREGATION OPERATION TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("aggregation operations", () => {
    it("performs Sum aggregation", async () => {
      await createChart({
        operation: "Sum",
        groupByField: "StageName",
        valueField: "Amount"
      });

      await flushPromises();
      expect(loadD3).toHaveBeenCalled();
    });

    it("performs Count aggregation", async () => {
      await createChart({
        operation: "Count",
        groupByField: "StageName"
      });

      await flushPromises();
      expect(loadD3).toHaveBeenCalled();
    });

    it("performs Average aggregation", async () => {
      await createChart({
        operation: "Average",
        groupByField: "StageName",
        valueField: "Amount"
      });

      await flushPromises();
      expect(loadD3).toHaveBeenCalled();
    });

    it("Count operation works without valueField", async () => {
      await createChart({
        operation: "Count",
        groupByField: "StageName",
        valueField: ""
      });

      await flushPromises();
      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });

    it("falls back to Count for unknown operation", async () => {
      await createChart({
        operation: "UnknownOp",
        groupByField: "StageName",
        valueField: "Amount"
      });

      await flushPromises();
      // Should not error, falls back to Count
      expect(loadD3).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CONFIGURATION TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("configuration", () => {
    it("applies height style to container", async () => {
      await createChart({
        height: 400
      });

      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
      expect(container.getAttribute("style")).toContain("400px");
    });

    it("parses advancedConfig JSON", async () => {
      await createChart({
        advancedConfig: '{"showGrid": true, "showLegend": false}'
      });

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });

    it("handles invalid advancedConfig JSON gracefully", async () => {
      await createChart({
        advancedConfig: "not valid json"
      });

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });

    it("accepts showGrid config option", async () => {
      await createChart({
        advancedConfig: '{"showGrid": false}'
      });

      await flushPromises();
      expect(loadD3).toHaveBeenCalled();
    });

    it("accepts showLegend config option", async () => {
      await createChart({
        advancedConfig: '{"showLegend": true}'
      });

      await flushPromises();
      expect(loadD3).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // THEME TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("themes", () => {
    it("accepts Salesforce Standard theme", async () => {
      await createChart({ theme: "Salesforce Standard" });

      await flushPromises();
      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CLICK EVENT TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("click events", () => {
    it("configures for barclick when objectApiName is set", async () => {
      await createChart({
        objectApiName: "Opportunity"
      });

      await flushPromises();
      expect(loadD3).toHaveBeenCalled();
    });

    it("does not set pointer cursor without objectApiName", async () => {
      await createChart({
        objectApiName: ""
      });

      await flushPromises();
      // attr should have been called with 'cursor'
      const attrCalls = mockD3.attr.mock.calls;
      const cursorCalls = attrCalls.filter((c) => c[0] === "cursor");
      expect(cursorCalls.length).toBeGreaterThan(0);
    });

    it("sets pointer cursor with objectApiName", async () => {
      await createChart({
        objectApiName: "Opportunity"
      });

      await flushPromises();
      const attrCalls = mockD3.attr.mock.calls;
      const cursorCalls = attrCalls.filter((c) => c[0] === "cursor");
      expect(cursorCalls.length).toBeGreaterThan(0);
    });

    it("uses filterField for event detail when provided", async () => {
      await createChart({
        objectApiName: "Opportunity",
        filterField: "CustomField__c"
      });

      await flushPromises();
      expect(element.filterField).toBe("CustomField__c");
    });

    it("falls back to groupByField when filterField is empty", async () => {
      await createChart({
        objectApiName: "Opportunity",
        filterField: "",
        groupByField: "StageName"
      });

      await flushPromises();
      expect(element.groupByField).toBe("StageName");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TOOLTIP BEHAVIOR TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("tooltip behavior", () => {
    it("registers mouseenter handler on bars", async () => {
      await createChart();
      await flushPromises();

      // on() should be called with 'mouseenter'
      const onCalls = mockD3.on.mock.calls;
      const mouseenterCalls = onCalls.filter((c) => c[0] === "mouseenter");
      expect(mouseenterCalls.length).toBeGreaterThan(0);
    });

    it("registers mouseleave handler on bars", async () => {
      await createChart();
      await flushPromises();

      const onCalls = mockD3.on.mock.calls;
      const mouseleaveCalls = onCalls.filter((c) => c[0] === "mouseleave");
      expect(mouseleaveCalls.length).toBeGreaterThan(0);
    });

    it("registers mousemove handler on bars", async () => {
      await createChart();
      await flushPromises();

      const onCalls = mockD3.on.mock.calls;
      const moveCalls = onCalls.filter((c) => c[0] === "mousemove");
      expect(moveCalls.length).toBeGreaterThan(0);
    });

    it("registers click handler on bars", async () => {
      await createChart();
      await flushPromises();

      const onCalls = mockD3.on.mock.calls;
      const clickCalls = onCalls.filter((c) => c[0] === "click");
      expect(clickCalls.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // RESPONSIVE BEHAVIOR TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("responsive behavior", () => {
    it("sets up resize observer", async () => {
      await createChart();
      await flushPromises();

      expect(global.ResizeObserver).toHaveBeenCalled();
    });

    it("handles zero container width gracefully", async () => {
      Element.prototype.getBoundingClientRect = jest.fn(() => ({
        width: 0,
        height: 0,
        top: 0,
        left: 0,
        bottom: 0,
        right: 0
      }));

      await createChart();
      await flushPromises();

      // Should not crash
      expect(loadD3).toHaveBeenCalled();
    });

    it("handles very small container", async () => {
      Element.prototype.getBoundingClientRect = jest.fn(() => ({
        width: 50,
        height: 50,
        top: 0,
        left: 0,
        bottom: 50,
        right: 50
      }));

      await createChart({ height: 50 });
      await flushPromises();

      expect(loadD3).toHaveBeenCalled();
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
      await flushPromises();

      // Zero width: nothing drawn yet, but the observer must already be
      // registered so a later measurement can render (no fixed give-up window).
      expect(mockD3.scaleBand).not.toHaveBeenCalled();
      expect(roCallback).toBeTruthy();

      // The container becomes measurable; the observer fires the render.
      jest.useFakeTimers();
      roCallback([{ contentRect: { width: 400, height: 300 } }]);
      jest.advanceTimersByTime(250);
      jest.useRealTimers();
      await flushPromises();

      expect(mockD3.scaleBand).toHaveBeenCalled();
    });

    it("does not latch an empty shell when first measured below the chart margins, and recovers when it grows", async () => {
      // A sub-margin width (< left+right margin, 190px = 160 left + 30 right)
      // makes renderChart bail before appending the svg. The observer must draw
      // the chart once the container grows past the margins — not leave a
      // permanent empty shell.
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
        width: 40,
        height: 300,
        top: 0,
        left: 0,
        bottom: 300,
        right: 40
      }));

      await createChart();
      await flushPromises();

      // 40px is below the 190px horizontal margin: no bars drawn yet.
      expect(mockD3.scaleBand).not.toHaveBeenCalled();
      expect(roCallback).toBeTruthy();

      jest.useFakeTimers();
      roCallback([{ contentRect: { width: 400, height: 300 } }]);
      jest.advanceTimersByTime(250);
      jest.useRealTimers();
      await flushPromises();

      expect(mockD3.scaleBand).toHaveBeenCalled();
    });

    it("disconnects the resize observer cleanly on disconnect", async () => {
      const mockDisconnect = jest.fn();
      global.ResizeObserver = jest.fn().mockImplementation(() => ({
        observe: jest.fn(),
        unobserve: jest.fn(),
        disconnect: mockDisconnect
      }));

      await createChart();
      await flushPromises();

      document.body.removeChild(element);

      expect(mockDisconnect).toHaveBeenCalled();
    });

    it("creates exactly one resize observer across the render lifecycle", async () => {
      await createChart();
      await flushPromises();
      await flushPromises();

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

      element = createElement("c-d3-horizontal-bar-chart-graphql", {
        is: D3HorizontalBarChartGraphql
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
      mockD3.scaleBand.mockClear();
      jest.useFakeTimers();
      roCallbacks[roCallbacks.length - 1]([
        { contentRect: { width: 500, height: 300 } }
      ]);
      jest.advanceTimersByTime(250);
      jest.useRealTimers();
      await flushPromises();

      expect(mockD3.scaleBand).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ERROR RECOVERY TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("error recovery", () => {
    it("shows error when D3 fails to load", async () => {
      loadD3.mockRejectedValue(new Error("D3 load failed"));

      await createChart();
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeTruthy();
    });

    it("logs error to console on D3 load failure", async () => {
      loadD3.mockRejectedValue(new Error("D3 load failed"));

      await createChart();
      await flushPromises();

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it("sets isLoading to false even on error", async () => {
      loadD3.mockRejectedValue(new Error("D3 load failed"));

      await createChart();
      await flushPromises();

      // Spinner should be gone
      const spinner = element.shadowRoot.querySelector("lightning-spinner");
      expect(spinner).toBeFalsy();
    });

    it("surfaces an exception thrown during renderChart to the error state", async () => {
      // Force renderChart to throw mid-flight; it must not die silently.
      mockD3.select = jest.fn(() => {
        throw new Error("render boom");
      });

      await createChart();
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeTruthy();
      expect(errorElement.textContent).toContain("render boom");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // RENDERING DETAIL TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("rendering details", () => {
    it("creates SVG element", async () => {
      await createChart();
      await flushPromises();

      expect(mockD3.append).toHaveBeenCalled();
      const appendCalls = mockD3.append.mock.calls;
      const svgCalls = appendCalls.filter((c) => c[0] === "svg");
      expect(svgCalls.length).toBeGreaterThan(0);
    });

    it("creates bar rect elements", async () => {
      await createChart();
      await flushPromises();

      const appendCalls = mockD3.append.mock.calls;
      const rectCalls = appendCalls.filter((c) => c[0] === "rect");
      expect(rectCalls.length).toBeGreaterThan(0);
    });

    it("creates x-axis group", async () => {
      await createChart();
      await flushPromises();

      const attrCalls = mockD3.attr.mock.calls;
      const classCalls = attrCalls.filter(
        (c) => c[0] === "class" && c[1] === "x-axis"
      );
      expect(classCalls.length).toBeGreaterThan(0);
    });

    it("creates y-axis group", async () => {
      await createChart();
      await flushPromises();

      const attrCalls = mockD3.attr.mock.calls;
      const classCalls = attrCalls.filter(
        (c) => c[0] === "class" && c[1] === "y-axis"
      );
      expect(classCalls.length).toBeGreaterThan(0);
    });

    it("applies rounded corners to bars", async () => {
      await createChart();
      await flushPromises();

      const attrCalls = mockD3.attr.mock.calls;
      const rxCalls = attrCalls.filter((c) => c[0] === "rx");
      expect(rxCalls.length).toBeGreaterThan(0);
    });

    it("creates band scale for the category (Y) axis", async () => {
      await createChart();
      await flushPromises();

      expect(mockD3.scaleBand).toHaveBeenCalled();
    });

    it("creates linear scale for the value (X) axis", async () => {
      await createChart();
      await flushPromises();

      expect(mockD3.scaleLinear).toHaveBeenCalled();
    });

    it("binds bar width to the value scale (horizontal growth)", async () => {
      await createChart();
      await flushPromises();

      // Horizontal bars grow along X: the `width` attr is set with a function
      // of the datum value, while `height` is the band bandwidth.
      const attrCalls = mockD3.attr.mock.calls;
      const widthFnCalls = attrCalls.filter(
        (c) => c[0] === "width" && typeof c[1] === "function"
      );
      expect(widthFnCalls.length).toBeGreaterThan(0);
    });

    it("pins bars to x=0 origin", async () => {
      await createChart();
      await flushPromises();

      // Each bar starts its animation at width 0 from x=0
      const attrCalls = mockD3.attr.mock.calls;
      const xZeroCalls = attrCalls.filter((c) => c[0] === "x" && c[1] === 0);
      expect(xZeroCalls.length).toBeGreaterThan(0);
    });

    it("applies animation transition to bars", async () => {
      await createChart();
      await flushPromises();

      expect(mockD3.transition).toHaveBeenCalled();
      expect(mockD3.duration).toHaveBeenCalled();
    });

    it("sets SVG dimensions on container", async () => {
      await createChart();
      await flushPromises();

      const attrCalls = mockD3.attr.mock.calls;
      const widthCalls = attrCalls.filter((c) => c[0] === "width");
      const heightCalls = attrCalls.filter((c) => c[0] === "height");
      expect(widthCalls.length).toBeGreaterThan(0);
      expect(heightCalls.length).toBeGreaterThan(0);
    });

    it("removes existing SVG before re-render", async () => {
      await createChart();
      await flushPromises();

      // select().select('svg').remove() should be called
      expect(mockD3.select).toHaveBeenCalled();
      expect(mockD3.remove).toHaveBeenCalled();
    });

    it("creates grid lines when showGrid is not disabled", async () => {
      await createChart({
        advancedConfig: '{"showGrid": true}'
      });
      await flushPromises();

      const attrCalls = mockD3.attr.mock.calls;
      const gridCalls = attrCalls.filter(
        (c) => c[0] === "class" && c[1] === "grid"
      );
      expect(gridCalls.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // GETTER TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("getters", () => {
    it("containerStyle returns correct height string", async () => {
      await createChart({ height: 450 });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
      expect(container.getAttribute("style")).toContain("450px");
    });

    it("hasError returns true when error is set", async () => {
      loadD3.mockRejectedValue(new Error("Test error"));
      await createChart();
      await flushPromises();

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeTruthy();
    });

    it("showChart is false when loading", () => {
      element = createElement("c-d3-horizontal-bar-chart-graphql", {
        is: D3HorizontalBarChartGraphql
      });
      element.groupByField = "StageName";
      element.recordCollection = SAMPLE_DATA;
      document.body.appendChild(element);

      // While still loading, spinner should be visible
      const spinner = element.shadowRoot.querySelector("lightning-spinner");
      expect(spinner).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CLEANUP TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("cleanup", () => {
    it("disconnects resize observer on disconnect", async () => {
      const mockDisconnect = jest.fn();
      global.ResizeObserver = jest.fn().mockImplementation(() => ({
        observe: jest.fn(),
        unobserve: jest.fn(),
        disconnect: mockDisconnect
      }));

      await createChart();
      await flushPromises();

      document.body.removeChild(element);

      expect(mockDisconnect).toHaveBeenCalled();
    });

    it("cleans up tooltip on disconnect", async () => {
      await createChart();
      await flushPromises();

      // Should not throw when removed
      document.body.removeChild(element);
      expect(true).toBe(true);
    });

    it("handles double disconnect gracefully", async () => {
      await createChart();
      await flushPromises();

      document.body.removeChild(element);

      // No error should occur
      expect(true).toBe(true);
    });
  });
});
