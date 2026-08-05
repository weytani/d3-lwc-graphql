// ABOUTME: Unit tests for the d3StackedHorizontalBarGraphql Lightning Web Component.
// ABOUTME: Tests initialization, data handling, stacked/normalized modes, legend, click events, render orchestration, and error recovery.

import { createElement } from "lwc";
import D3StackedHorizontalBarGraphql from "c/d3StackedHorizontalBarGraphql";
import { loadD3 } from "../d3Loader";
import { graphql } from "lightning/graphql";

jest.mock("../d3Loader", () => ({
  loadD3: jest.fn()
}));

// ═══════════════════════════════════════════════════════════════
// MOCK D3 FACTORY
// ═══════════════════════════════════════════════════════════════

const createMockD3 = () => {
  const mockStack = jest.fn(() => []);
  mockStack.keys = jest.fn(() => mockStack);
  mockStack.value = jest.fn(() => mockStack);
  mockStack.offset = jest.fn(() => mockStack);

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
      return axis;
    }),
    max: jest.fn(() => 500),
    stack: jest.fn(() => mockStack),
    stackOffsetExpand: "stackOffsetExpand"
  };
  mockD3._mockStack = mockStack;
  return mockD3;
};

// ═══════════════════════════════════════════════════════════════
// TEST DATA
// ═══════════════════════════════════════════════════════════════

const SERIES_DATA = [
  { StageName: "Prospecting", Type: "New", Amount: 100 },
  { StageName: "Prospecting", Type: "Existing", Amount: 200 },
  { StageName: "Qualification", Type: "New", Amount: 150 },
  { StageName: "Qualification", Type: "Existing", Amount: 250 },
  { StageName: "Closed Won", Type: "New", Amount: 500 },
  { StageName: "Closed Won", Type: "Existing", Amount: 300 }
];

const SINGLE_SERIES_DATA = [
  { StageName: "Prospecting", Type: "New", Amount: 100 }
];

const NO_SERIES_DATA = [
  { StageName: "Prospecting", Amount: 100 },
  { StageName: "Qualification", Amount: 200 }
];

// UI API two-field grouped-aggregate envelope, as the lightning/graphql wire
// delivers it for the structured multi-series (seriesField) path.
const WIRE_RESPONSE = {
  uiapi: {
    aggregate: {
      Opportunity: {
        edges: [
          {
            node: {
              aggregate: {
                StageName: { value: "Prospecting" },
                Type: { value: "New" },
                Amount: { sum: { value: 100 } }
              }
            }
          },
          {
            node: {
              aggregate: {
                StageName: { value: "Prospecting" },
                Type: { value: "Existing" },
                Amount: { sum: { value: 200 } }
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

describe("c-d3-stacked-horizontal-bar-graphql", () => {
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
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    jest.clearAllMocks();
  });

  async function createChart(props = {}) {
    element = createElement("c-d3-stacked-horizontal-bar-graphql", {
      is: D3StackedHorizontalBarGraphql
    });

    Object.assign(element, {
      groupByField: "StageName",
      seriesField: "Type",
      valueField: "Amount",
      operation: "Sum",
      recordCollection: SERIES_DATA,
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
    it("shows loading state initially", async () => {
      element = createElement("c-d3-stacked-horizontal-bar-graphql", {
        is: D3StackedHorizontalBarGraphql
      });
      element.groupByField = "StageName";
      element.seriesField = "Type";
      element.recordCollection = SERIES_DATA;

      document.body.appendChild(element);

      const spinner = element.shadowRoot.querySelector("lightning-spinner");
      expect(spinner).toBeTruthy();
    });

    it("loads D3 library on connect", async () => {
      await createChart();
      expect(loadD3).toHaveBeenCalled();
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
      await createChart({ recordCollection: SERIES_DATA });

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
        recordCollection: SERIES_DATA,
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

    it("handles single record", async () => {
      await createChart({ recordCollection: SINGLE_SERIES_DATA });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });

    it("renders without a seriesField as simple bars", async () => {
      await createChart({ recordCollection: NO_SERIES_DATA, seriesField: "" });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
      expect(mockD3.stack).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // AGGREGATION OPERATION TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("aggregation operations", () => {
    it("performs Sum aggregation", async () => {
      await createChart({ operation: "Sum" });
      await flushPromises();
      expect(loadD3).toHaveBeenCalled();
    });

    it("performs Count aggregation", async () => {
      await createChart({ operation: "Count", valueField: "" });
      await flushPromises();
      expect(loadD3).toHaveBeenCalled();
    });

    it("Count operation works without valueField", async () => {
      await createChart({ operation: "Count", valueField: "" });
      await flushPromises();
      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // STACKED RENDERING TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("stacked rendering", () => {
    it("calls d3.stack() to compute stacked positions", async () => {
      await createChart();
      await flushPromises();
      expect(mockD3.stack).toHaveBeenCalled();
    });

    it("sets keys on the stack generator from series names", async () => {
      await createChart();
      await flushPromises();
      expect(mockD3._mockStack.keys).toHaveBeenCalled();
    });

    it("renders rect elements for stacked bars", async () => {
      await createChart();
      await flushPromises();

      const rectCalls = mockD3.append.mock.calls.filter((c) => c[0] === "rect");
      expect(rectCalls.length).toBeGreaterThan(0);
    });

    it("creates a scaleBand for the category (y) axis", async () => {
      await createChart();
      await flushPromises();
      expect(mockD3.scaleBand).toHaveBeenCalled();
    });

    it("creates a linear scale for the value (x) axis", async () => {
      await createChart();
      await flushPromises();
      expect(mockD3.scaleLinear).toHaveBeenCalled();
    });

    it("uses default stacked mode when stackMode not specified", async () => {
      await createChart({ advancedConfig: "{}" });
      await flushPromises();
      expect(mockD3._mockStack.offset).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // NORMALIZED MODE TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("normalized mode", () => {
    it("uses normalized stacking when stackMode is normalized", async () => {
      await createChart({ advancedConfig: '{"stackMode": "normalized"}' });
      await flushPromises();

      expect(mockD3.stack).toHaveBeenCalled();
      expect(mockD3._mockStack.offset).toHaveBeenCalledWith(
        "stackOffsetExpand"
      );
    });

    it("formats the x-axis as a percentage in normalized mode", async () => {
      await createChart({ advancedConfig: '{"stackMode": "normalized"}' });
      await flushPromises();

      const axisBottomResults = mockD3.axisBottom.mock.results.map(
        (r) => r.value
      );
      const tickFormatCall = axisBottomResults
        .flatMap((axis) => axis.tickFormat.mock.calls)
        .find(
          (call) => typeof call[0] === "function" && call[0](0.5) === "50%"
        );
      expect(tickFormatCall).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // LEGEND RENDERING TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("legend rendering", () => {
    it("renders legend when series exist", async () => {
      await createChart();
      await flushPromises();

      const attrCalls = mockD3.attr.mock.calls;
      const legendCalls = attrCalls.filter(
        (c) =>
          c[0] === "class" &&
          typeof c[1] === "string" &&
          c[1].includes("legend")
      );
      expect(legendCalls.length).toBeGreaterThan(0);
    });

    it("does not render a legend when there is no series field", async () => {
      await createChart({ recordCollection: NO_SERIES_DATA, seriesField: "" });
      await flushPromises();

      const attrCalls = mockD3.attr.mock.calls;
      const legendCalls = attrCalls.filter(
        (c) => c[0] === "class" && c[1] === "legend"
      );
      expect(legendCalls.length).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // THEME TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("themes", () => {
    it("wires the theme's color palette into the layer fill colors", async () => {
      await createChart({ theme: "Warm" });
      await flushPromises();

      const attrCalls = mockD3.attr.mock.calls;
      const fillCalls = attrCalls
        .filter((c) => c[0] === "fill" && typeof c[1] === "function")
        .map((c) => c[1]);
      const firstFill = fillCalls.find((fn) => {
        try {
          return fn(null, 0) === "#FF6B6B";
        } catch {
          return false;
        }
      });
      expect(firstFill).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ACCESSIBILITY TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("accessibility", () => {
    it("applies role=img and a title to the chart SVG", async () => {
      await createChart();
      await flushPromises();

      const attrCalls = mockD3.attr.mock.calls;
      expect(attrCalls.some((c) => c[0] === "role" && c[1] === "img")).toBe(
        true
      );
      expect(mockD3.insert).toHaveBeenCalledWith("title", ":first-child");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CLICK EVENT TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("click events", () => {
    it("sets pointer cursor with objectApiName", async () => {
      await createChart({ objectApiName: "Opportunity" });
      await flushPromises();
      const cursorCalls = mockD3.attr.mock.calls.filter(
        (c) => c[0] === "cursor"
      );
      expect(cursorCalls.length).toBeGreaterThan(0);
    });

    it("registers click handler on bars", async () => {
      await createChart();
      await flushPromises();
      const onCalls = mockD3.on.mock.calls;
      expect(onCalls.filter((c) => c[0] === "click").length).toBeGreaterThan(0);
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
  });

  // ═══════════════════════════════════════════════════════════════
  // RENDER ORCHESTRATION TESTS (single lifetime observer, no give-up window)
  // ═══════════════════════════════════════════════════════════════

  describe("render orchestration", () => {
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
      // A sub-margin width (< left+right margin, 190px) makes renderChart bail
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
        width: 100,
        height: 300,
        top: 0,
        left: 0,
        bottom: 300,
        right: 100
      }));

      await createChart();
      await flushPromises();

      // 100px is below the 190px horizontal margin: no bars drawn yet.
      expect(mockD3.scaleBand).not.toHaveBeenCalled();
      expect(roCallback).toBeTruthy();

      jest.useFakeTimers();
      roCallback([{ contentRect: { width: 400, height: 300 } }]);
      jest.advanceTimersByTime(250);
      jest.useRealTimers();
      await flushPromises();

      expect(mockD3.scaleBand).toHaveBeenCalled();
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

      element = createElement("c-d3-stacked-horizontal-bar-graphql", {
        is: D3StackedHorizontalBarGraphql
      });
      Object.assign(element, {
        objectApiName: "Opportunity",
        groupByField: "StageName",
        seriesField: "Type",
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
  });
});
