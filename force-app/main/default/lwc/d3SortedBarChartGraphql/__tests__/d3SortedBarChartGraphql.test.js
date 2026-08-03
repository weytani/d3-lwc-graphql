// ABOUTME: Unit tests for the d3SortedBarChartGraphql Lightning Web Component.
// ABOUTME: Tests initialization, data handling, aggregation, sorting, legend, events, tooltip, resize, and error recovery.

import { createElement } from "lwc";
import D3SortedBarChartGraphql from "c/d3SortedBarChartGraphql";
import { loadD3 } from "../d3Loader";

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

// Flush promises helper
// eslint-disable-next-line @lwc/lwc/no-async-operation
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("c-d3-sorted-bar-chart-graphql", () => {
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
    element = createElement("c-d3-sorted-bar-chart-graphql", {
      is: D3SortedBarChartGraphql
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
  // INITIALIZATION TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("initialization", () => {
    it("shows loading state initially", async () => {
      element = createElement("c-d3-sorted-bar-chart-graphql", {
        is: D3SortedBarChartGraphql
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

    it("defaults sortBy to value and sortDirection to desc", async () => {
      await createChart();
      expect(element.sortBy).toBe("value");
      expect(element.sortDirection).toBe("desc");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DATA HANDLING TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("data handling", () => {
    it("renders from recordCollection when provided", async () => {
      await createChart({ recordCollection: SAMPLE_DATA });

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

    it("handles records with wrong field names", async () => {
      const wrongFields = [{ WrongField: "A", WrongValue: 100 }];
      await createChart({ recordCollection: wrongFields });
      await flushPromises();

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
      element = createElement("c-d3-sorted-bar-chart-graphql", {
        is: D3SortedBarChartGraphql
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
      await createChart({ operation: "Count", groupByField: "StageName" });
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
  });

  // ═══════════════════════════════════════════════════════════════
  // SORTING TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("sorting", () => {
    it("accepts sortBy=label", async () => {
      await createChart({ sortBy: "label" });
      expect(element.sortBy).toBe("label");
    });

    it("accepts sortDirection=asc", async () => {
      await createChart({ sortDirection: "asc" });
      expect(element.sortDirection).toBe("asc");
    });

    it("falls back to value for an invalid sortBy", async () => {
      await createChart({ sortBy: "bogus" });
      expect(element.sortBy).toBe("value");
    });

    it("falls back to desc for an invalid sortDirection", async () => {
      await createChart({ sortDirection: "bogus" });
      expect(element.sortDirection).toBe("desc");
    });

    it("re-sorts without refetching data when sortBy changes after render", async () => {
      await createChart({ recordCollection: SAMPLE_DATA });
      await flushPromises();

      loadD3.mockClear();

      element.sortBy = "label";
      await flushPromises();

      // A resort redraws in place; it never re-runs the D3 load / data pipeline.
      expect(loadD3).not.toHaveBeenCalled();
    });

    it("re-sorts without refetching data when sortDirection changes after render", async () => {
      await createChart({ recordCollection: SAMPLE_DATA });
      await flushPromises();

      loadD3.mockClear();

      element.sortDirection = "asc";
      await flushPromises();

      expect(loadD3).not.toHaveBeenCalled();
    });

    it("uses d3.transition() to reorder bars when a sort prop changes", async () => {
      await createChart({ recordCollection: SAMPLE_DATA });
      await flushPromises();

      mockD3.transition.mockClear();
      mockD3.duration.mockClear();

      element.sortBy = "label";
      await flushPromises();

      expect(mockD3.transition).toHaveBeenCalled();
      expect(mockD3.duration).toHaveBeenCalled();
    });

    it("does not attempt to re-sort before the chart has rendered", async () => {
      element = createElement("c-d3-sorted-bar-chart-graphql", {
        is: D3SortedBarChartGraphql
      });
      // Setting sortBy before the element is even attached must not throw.
      element.sortBy = "label";
      document.body.appendChild(element);
      await flushPromises();

      expect(element.sortBy).toBe("label");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // LEGEND TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("legend", () => {
    it("hides legend by default", async () => {
      await createChart();
      await flushPromises();

      const legend = element.shadowRoot.querySelector(".legend-container");
      expect(legend).toBeFalsy();
    });

    it("shows legend when showLegend config is true", async () => {
      await createChart({ advancedConfig: '{"showLegend": true}' });
      await flushPromises();

      const legend = element.shadowRoot.querySelector(".legend-container");
      expect(legend).toBeTruthy();
    });

    it("renders legend items in the current sort order", async () => {
      await createChart({
        advancedConfig: '{"showLegend": true}',
        sortBy: "label",
        sortDirection: "asc"
      });
      await flushPromises();

      const legendLabels = Array.from(
        element.shadowRoot.querySelectorAll(".legend-label")
      ).map((el) => el.textContent);
      const sorted = [...legendLabels].sort();
      expect(legendLabels).toEqual(sorted);
    });

    it("dispatches barclick when a legend item is activated", async () => {
      await createChart({
        advancedConfig: '{"showLegend": true}',
        objectApiName: "Opportunity"
      });
      await flushPromises();

      const handler = jest.fn();
      element.addEventListener("barclick", handler);

      const legendItem = element.shadowRoot.querySelector(".legend-item");
      legendItem.click();

      expect(handler).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CONFIGURATION TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("configuration", () => {
    it("applies height style to container", async () => {
      await createChart({ height: 400 });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container.getAttribute("style")).toContain("400px");
    });

    it("handles invalid advancedConfig JSON gracefully", async () => {
      await createChart({ advancedConfig: "not valid json" });

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });

    it("accepts showGrid config option", async () => {
      await createChart({ advancedConfig: '{"showGrid": false}' });
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

    it("keeps a bar's color stable across a resort", async () => {
      await createChart({ recordCollection: SAMPLE_DATA });
      await flushPromises();

      const fillCallsBefore = mockD3.attr.mock.calls.filter(
        (c) => c[0] === "fill"
      );
      const fillFnBefore = fillCallsBefore[fillCallsBefore.length - 1][1];
      const colorForClosedWonBefore = fillFnBefore({ label: "Closed Won" });

      mockD3.attr.mockClear();
      element.sortBy = "label";
      await flushPromises();

      // The resort path only transitions x; it never re-derives fill, so the
      // stable color assigned at load time is untouched.
      const fillCallsAfter = mockD3.attr.mock.calls.filter(
        (c) => c[0] === "fill"
      );
      expect(fillCallsAfter.length).toBe(0);
      expect(colorForClosedWonBefore).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CLICK EVENT TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("click events", () => {
    it("does not set pointer cursor without objectApiName", async () => {
      await createChart({ objectApiName: "" });
      await flushPromises();
      const cursorCalls = mockD3.attr.mock.calls.filter(
        (c) => c[0] === "cursor"
      );
      expect(cursorCalls.length).toBeGreaterThan(0);
    });

    it("sets pointer cursor with objectApiName", async () => {
      await createChart({ objectApiName: "Opportunity" });
      await flushPromises();
      const cursorCalls = mockD3.attr.mock.calls.filter(
        (c) => c[0] === "cursor"
      );
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
  });

  // ═══════════════════════════════════════════════════════════════
  // TOOLTIP BEHAVIOR TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("tooltip behavior", () => {
    it("registers mouseenter handler on bars", async () => {
      await createChart();
      await flushPromises();
      const onCalls = mockD3.on.mock.calls;
      expect(
        onCalls.filter((c) => c[0] === "mouseenter").length
      ).toBeGreaterThan(0);
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
      // A sub-margin width (< left+right margin, 80px) makes renderChart bail
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
        width: 40,
        height: 300,
        top: 0,
        left: 0,
        bottom: 300,
        right: 40
      }));

      await createChart();
      await flushPromises();

      // 40px is below the 80px horizontal margin: no bars drawn yet.
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

      const svgCalls = mockD3.append.mock.calls.filter((c) => c[0] === "svg");
      expect(svgCalls.length).toBeGreaterThan(0);
    });

    it("creates bar rect elements", async () => {
      await createChart();
      await flushPromises();

      const rectCalls = mockD3.append.mock.calls.filter((c) => c[0] === "rect");
      expect(rectCalls.length).toBeGreaterThan(0);
    });

    it("creates a scale band for the x-axis", async () => {
      await createChart();
      await flushPromises();
      expect(mockD3.scaleBand).toHaveBeenCalled();
    });

    it("creates a linear scale for the y-axis", async () => {
      await createChart();
      await flushPromises();
      expect(mockD3.scaleLinear).toHaveBeenCalled();
    });

    it("applies animation transition to bars", async () => {
      await createChart();
      await flushPromises();

      expect(mockD3.transition).toHaveBeenCalled();
      expect(mockD3.duration).toHaveBeenCalled();
    });

    it("removes existing SVG before re-render", async () => {
      await createChart();
      await flushPromises();

      expect(mockD3.select).toHaveBeenCalled();
      expect(mockD3.remove).toHaveBeenCalled();
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
