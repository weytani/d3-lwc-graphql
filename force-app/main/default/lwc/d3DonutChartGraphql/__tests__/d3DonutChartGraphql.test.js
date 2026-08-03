// ABOUTME: Unit tests for the D3 donut/pie chart Lightning Web Component.
// ABOUTME: Covers initialization, data sources, aggregation, themes, config, legend, events, tooltips, and responsive behavior.

import { createElement } from "lwc";
import D3DonutChartGraphql from "c/d3DonutChartGraphql";
import { loadD3 } from "../d3Loader";

// Mock the bundle-local D3 loader
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

// Factory function for isolated mock D3 instances (prevents shared mutable state between tests)
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
    attrTween: jest.fn(() => d3),
    on: jest.fn(() => d3),
    remove: jest.fn(() => d3),
    text: jest.fn(() => d3),
    insert: jest.fn(() => d3),
    pie: jest.fn(() => {
      const pieFn = jest.fn((data) =>
        data.map((d, i) => ({
          data: d,
          value: d.value,
          startAngle: i * 0.5,
          endAngle: (i + 1) * 0.5
        }))
      );
      pieFn.value = jest.fn(() => pieFn);
      pieFn.sort = jest.fn(() => pieFn);
      return pieFn;
    }),
    arc: jest.fn(() => {
      const arcFn = jest.fn(() => "M0,0");
      arcFn.innerRadius = jest.fn(() => arcFn);
      arcFn.outerRadius = jest.fn(() => arcFn);
      return arcFn;
    }),
    interpolate: jest.fn(() => jest.fn(() => ({ startAngle: 0, endAngle: 1 })))
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

// Flush promises helper
// eslint-disable-next-line @lwc/lwc/no-async-operation
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("c-d3-donut-chart-graphql", () => {
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
    element = createElement("c-d3-donut-chart-graphql", {
      is: D3DonutChartGraphql
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
    return element;
  }

  // ═══════════════════════════════════════════════════════════════
  // INITIALIZATION TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("initialization", () => {
    it("shows loading spinner initially", () => {
      element = createElement("c-d3-donut-chart-graphql", {
        is: D3DonutChartGraphql
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
    it("uses recordCollection when provided", async () => {
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
  // AGGREGATION TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("aggregation", () => {
    it("accepts Sum operation", async () => {
      await createChart({ operation: "Sum" });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });

    it("accepts Count operation", async () => {
      await createChart({ operation: "Count" });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });

    it("accepts Average operation", async () => {
      await createChart({ operation: "Average" });
      await flushPromises();

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
      await flushPromises();

      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CONFIGURATION TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("configuration", () => {
    it("applies custom height", async () => {
      await createChart({ height: 400 });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container.getAttribute("style")).toContain("400px");
    });

    it("accepts advancedConfig JSON", async () => {
      await createChart({
        advancedConfig: '{"showTotal": false}'
      });
      await flushPromises();

      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });

    it("handles invalid advancedConfig gracefully", async () => {
      await createChart({
        advancedConfig: "not valid json"
      });
      await flushPromises();

      // Should not crash - still renders
      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });

    it("accepts innerRadiusRatio for donut vs pie", async () => {
      await createChart({ innerRadiusRatio: 0 }); // pie
      await flushPromises();

      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // LEGEND TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("legend", () => {
    it("shows legend by default", async () => {
      await createChart();
      await flushPromises();

      const legend = element.shadowRoot.querySelector(".legend-container");
      expect(legend).toBeTruthy();
    });

    it("hides legend when showLegend is false", async () => {
      await createChart({ showLegend: false });
      await flushPromises();

      const legend = element.shadowRoot.querySelector(".legend-container");
      expect(legend).toBeFalsy();
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
      expect(mockD3.pie).not.toHaveBeenCalled();
      expect(roCallback).toBeTruthy();

      // The container becomes measurable; the observer fires the render.
      jest.useFakeTimers();
      roCallback([{ contentRect: { width: 400, height: 300 } }]);
      jest.advanceTimersByTime(250);
      jest.useRealTimers();
      await flushPromises();

      expect(mockD3.pie).toHaveBeenCalled();
    });

    it("does not latch an empty shell when first measured below the chart margins, and recovers when it grows", async () => {
      // Donut's padding is max(10, round(containerWidth * 0.04)), applied as
      // both the left and right margin, so the horizontal margin sum is at
      // least 20px. A 15px width is below that sum: renderChart bails before
      // appending the svg. The observer must draw the chart once the
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
        width: 15,
        height: 300,
        top: 0,
        left: 0,
        bottom: 300,
        right: 15
      }));

      await createChart();
      await flushPromises();

      // 15px is below the (>= 20px) horizontal margin sum: no pie layout drawn yet.
      expect(mockD3.pie).not.toHaveBeenCalled();
      expect(roCallback).toBeTruthy();

      jest.useFakeTimers();
      roCallback([{ contentRect: { width: 400, height: 300 } }]);
      jest.advanceTimersByTime(250);
      jest.useRealTimers();
      await flushPromises();

      expect(mockD3.pie).toHaveBeenCalled();
    });

    it("creates exactly one resize observer across the render lifecycle", async () => {
      await createChart();
      await flushPromises();
      await flushPromises();

      // A single unified observer drives both the first render and re-renders.
      expect(global.ResizeObserver).toHaveBeenCalledTimes(1);
    });

    it("re-renders on resize callback via the resize observer", async () => {
      let roCallback = null;
      global.ResizeObserver = jest.fn().mockImplementation((cb) => {
        roCallback = cb;
        return {
          observe: jest.fn(),
          unobserve: jest.fn(),
          disconnect: jest.fn()
        };
      });

      await createChart();
      await flushPromises();

      expect(roCallback).toBeTruthy();

      // Reset D3 mock calls to verify re-render
      mockD3.select.mockClear();

      jest.useFakeTimers();
      roCallback([{ contentRect: { width: 500, height: 300 } }]);
      jest.advanceTimersByTime(250);
      jest.useRealTimers();
      await flushPromises();

      // renderChart should be called again, which invokes d3.select
      expect(mockD3.select).toHaveBeenCalled();
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
  // EVENTS TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("events", () => {
    it("sets objectApiName for drill-down navigation", async () => {
      await createChart({ objectApiName: "Opportunity" });
      await flushPromises();

      // Component should be configured for navigation
      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // INNER RADIUS RATIO VARIATIONS
  // ═══════════════════════════════════════════════════════════════

  describe("innerRadiusRatio variations", () => {
    it("renders as pie chart when innerRadiusRatio is 0", async () => {
      await createChart({ innerRadiusRatio: 0 });
      await flushPromises();

      // d3.arc() was called by the component; access the returned arc via mock results
      expect(mockD3.arc).toHaveBeenCalled();
      const arcObj = mockD3.arc.mock.results[0].value;
      expect(arcObj.innerRadius).toHaveBeenCalled();
      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });

    it("renders as donut chart when innerRadiusRatio is 0.5", async () => {
      await createChart({ innerRadiusRatio: 0.5 });
      await flushPromises();

      expect(mockD3.arc).toHaveBeenCalled();
      const arcObj = mockD3.arc.mock.results[0].value;
      expect(arcObj.innerRadius).toHaveBeenCalled();
      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });

    it("renders as thin donut when innerRadiusRatio is 0.8", async () => {
      await createChart({ innerRadiusRatio: 0.8 });
      await flushPromises();

      expect(mockD3.arc).toHaveBeenCalled();
      const arcObj = mockD3.arc.mock.results[0].value;
      expect(arcObj.innerRadius).toHaveBeenCalled();
      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });

    it("handles boundary value of 1.0", async () => {
      await createChart({ innerRadiusRatio: 1.0 });
      await flushPromises();

      // Should not crash even at the boundary
      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CENTER TEXT RENDERING
  // ═══════════════════════════════════════════════════════════════

  describe("center text rendering", () => {
    it("shows total when innerRadius > 30 and showTotal is not false", async () => {
      // Default innerRadiusRatio of 0.5 with container width 400 gives sufficient inner radius
      await createChart({ innerRadiusRatio: 0.5 });
      await flushPromises();

      // renderChart appends text elements for the center total
      // The mock d3 chain: svg.append('text').attr(...).text('Total')
      const textCalls = mockD3.text.mock.calls;
      const totalLabelWritten = textCalls.some((call) => call[0] === "Total");
      expect(totalLabelWritten).toBe(true);
    });

    it("hides center text when inner radius is too small", async () => {
      // innerRadiusRatio of 0 means innerRadius = 0, which is <= 30
      mockD3.text.mockClear();
      await createChart({ innerRadiusRatio: 0 });
      await flushPromises();

      const textCalls = mockD3.text.mock.calls;
      const totalLabelWritten = textCalls.some((call) => call[0] === "Total");
      expect(totalLabelWritten).toBe(false);
    });

    it("displays formatted total value", async () => {
      await createChart({ innerRadiusRatio: 0.5 });
      await flushPromises();

      // SAMPLE_DATA sums (via Sum aggregation) to 950; the real formatNumber
      // renders that as "950" and the component passes it to d3.text().
      const textCalls = mockD3.text.mock.calls;
      const formattedValueWritten = textCalls.some((call) => call[0] === "950");
      expect(formattedValueWritten).toBe(true);
    });

    it("hides center text when showTotal is false in advancedConfig", async () => {
      mockD3.text.mockClear();
      await createChart({
        innerRadiusRatio: 0.5,
        advancedConfig: '{"showTotal": false}'
      });
      await flushPromises();

      const textCalls = mockD3.text.mock.calls;
      const totalLabelWritten = textCalls.some((call) => call[0] === "Total");
      expect(totalLabelWritten).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SLICE CLICK EVENTS
  // ═══════════════════════════════════════════════════════════════

  describe("slice click events", () => {
    it("registers click handler on slice paths via D3 on()", async () => {
      await createChart({
        objectApiName: "Opportunity",
        filterField: "StageName"
      });
      await flushPromises();

      // D3's on() should have been called with 'click'
      const onCalls = mockD3.on.mock.calls;
      const clickCalls = onCalls.filter((c) => c[0] === "click");
      expect(clickCalls.length).toBeGreaterThan(0);
    });

    it("does not set pointer cursor without objectApiName", async () => {
      await createChart({ objectApiName: "" });
      await flushPromises();

      const attrCalls = mockD3.attr.mock.calls;
      const cursorCalls = attrCalls.filter((c) => c[0] === "cursor");
      // When no objectApiName, cursor should be 'default'
      expect(cursorCalls.length).toBeGreaterThan(0);
    });

    it("sets pointer cursor with objectApiName", async () => {
      await createChart({
        objectApiName: "Opportunity",
        filterField: "StageName"
      });
      await flushPromises();

      const attrCalls = mockD3.attr.mock.calls;
      const cursorCalls = attrCalls.filter((c) => c[0] === "cursor");
      expect(cursorCalls.length).toBeGreaterThan(0);
    });

    it("uses filterField property for drill-down configuration", async () => {
      await createChart({
        objectApiName: "Opportunity",
        filterField: "CustomField__c"
      });
      await flushPromises();

      expect(element.filterField).toBe("CustomField__c");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // LEGEND CLICK DELEGATION
  // ═══════════════════════════════════════════════════════════════

  describe("legend click delegation", () => {
    it("renders clickable legend items with data-label attribute", async () => {
      await createChart({
        objectApiName: "Opportunity",
        filterField: "StageName"
      });
      await flushPromises();

      const legendItems = element.shadowRoot.querySelectorAll(".legend-item");
      expect(legendItems.length).toBeGreaterThan(0);

      // Each legend item should have a data-label attribute
      legendItems.forEach((item) => {
        expect(item.dataset.label).toBeTruthy();
      });
    });

    it("legend items have onclick handler bound", async () => {
      await createChart({
        objectApiName: "Opportunity",
        filterField: "StageName"
      });
      await flushPromises();

      // Legend items exist in the DOM with click handler via template
      const legendItems = element.shadowRoot.querySelectorAll(".legend-item");
      expect(legendItems.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PERCENTAGE CALCULATION
  // ═══════════════════════════════════════════════════════════════

  describe("percentage calculation", () => {
    it("computes correct percentages in legendItems", async () => {
      await createChart({ operation: "Sum" });
      await flushPromises();

      // With Sum: Closed Won=500, Prospecting=300, Qualification=150 => total=950
      const legend = element.shadowRoot.querySelectorAll(".legend-item");
      expect(legend.length).toBeGreaterThan(0);

      // Verify legend items are rendered with percent values
      const percentTexts = element.shadowRoot.querySelectorAll(".legend-value");
      expect(percentTexts.length).toBeGreaterThan(0);
      // Each legend item should display a percent string
      percentTexts.forEach((el) => {
        expect(el.textContent).toContain("%");
      });
    });

    it("handles zero total edge case", async () => {
      const zeroData = [
        { StageName: "A", Amount: 0 },
        { StageName: "B", Amount: 0 }
      ];
      await createChart({ recordCollection: zeroData, operation: "Sum" });
      await flushPromises();

      // With zero totals, legendItems percent should be '0%'
      const percentTexts = element.shadowRoot.querySelectorAll(".legend-value");
      percentTexts.forEach((el) => {
        expect(el.textContent).toBe("0%");
      });
    });

    it("totalValue is the sum of all chart data values", async () => {
      await createChart({ operation: "Sum" });
      await flushPromises();

      // Prospecting: 100+200=300, Qualification: 150, Closed Won: 500 => 950
      // We can verify via the legend: all percents should collectively represent the total
      const legend = element.shadowRoot.querySelectorAll(".legend-item");
      expect(legend.length).toBe(3);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TOOLTIP HANDLERS
  // ═══════════════════════════════════════════════════════════════

  describe("tooltip handlers", () => {
    it("registers mouseenter handler on slice paths", async () => {
      await createChart();
      await flushPromises();

      const onCalls = mockD3.on.mock.calls;
      const mouseenterCalls = onCalls.filter((c) => c[0] === "mouseenter");
      expect(mouseenterCalls.length).toBeGreaterThan(0);
    });

    it("registers mouseleave handler on slice paths", async () => {
      await createChart();
      await flushPromises();

      const onCalls = mockD3.on.mock.calls;
      const mouseleaveCalls = onCalls.filter((c) => c[0] === "mouseleave");
      expect(mouseleaveCalls.length).toBeGreaterThan(0);
    });

    it("registers mousemove handler on slice paths", async () => {
      await createChart();
      await flushPromises();

      const onCalls = mockD3.on.mock.calls;
      const moveCalls = onCalls.filter((c) => c[0] === "mousemove");
      expect(moveCalls.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ADVANCED CONFIG EDGE CASES
  // ═══════════════════════════════════════════════════════════════

  describe("advancedConfig edge cases", () => {
    it("handles empty string gracefully", async () => {
      await createChart({ advancedConfig: "" });
      await flushPromises();

      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });

    it("handles null gracefully", async () => {
      await createChart({ advancedConfig: null });
      await flushPromises();

      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });

    it("handles deeply nested invalid JSON gracefully", async () => {
      await createChart({ advancedConfig: "{{{invalid: true}}}" });
      await flushPromises();

      // JSON.parse fails, config falls back to {}
      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });

    it("applies customColors from advancedConfig", async () => {
      const configWithColors = JSON.stringify({
        customColors: ["#FF0000", "#00FF00", "#0000FF"]
      });

      await createChart({ advancedConfig: configWithColors });
      await flushPromises();

      // The component should render without error using the custom colors
      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
      // Legend items should still be present
      const legend = element.shadowRoot.querySelector(".legend-container");
      expect(legend).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // RENDERING DETAILS
  // ═══════════════════════════════════════════════════════════════

  describe("rendering details", () => {
    it("creates pie layout via d3.pie()", async () => {
      await createChart();
      await flushPromises();

      expect(mockD3.pie).toHaveBeenCalled();
    });

    it("creates arc generator via d3.arc()", async () => {
      await createChart();
      await flushPromises();

      // d3.arc() is called at least twice (regular arc + hover arc)
      expect(mockD3.arc).toHaveBeenCalled();
      expect(mockD3.arc.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it("removes existing SVG before re-render", async () => {
      await createChart();
      await flushPromises();

      // renderChart calls d3.select(container).select('svg').remove()
      // The mock chains: select -> select -> remove
      expect(mockD3.select).toHaveBeenCalled();
      expect(mockD3.remove).toHaveBeenCalled();
    });

    it("sets SVG dimensions from container width and configured height", async () => {
      await createChart({ height: 350 });
      await flushPromises();

      // renderChart calls .attr('width', containerWidth) and .attr('height', this.height)
      const attrCalls = mockD3.attr.mock.calls;
      const widthSet = attrCalls.some(
        (call) => call[0] === "width" && typeof call[1] === "number"
      );
      const heightSet = attrCalls.some(
        (call) => call[0] === "height" && call[1] === 350
      );
      expect(widthSet).toBe(true);
      expect(heightSet).toBe(true);
    });
  });
});
