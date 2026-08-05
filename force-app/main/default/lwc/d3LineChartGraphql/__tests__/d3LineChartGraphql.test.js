import { createElement } from "lwc";
import D3LineChartGraphql from "c/d3LineChartGraphql";
import { loadD3 } from "../d3Loader";
import { graphql } from "lightning/graphql";

// Mock the bundle-local D3 loader
jest.mock("../d3Loader", () => ({
  loadD3: jest.fn()
}));

// Mock D3 instance with comprehensive time series support
const mockD3 = {
  select: jest.fn(() => mockD3),
  append: jest.fn(() => mockD3),
  attr: jest.fn(() => mockD3),
  style: jest.fn(() => mockD3),
  call: jest.fn(() => mockD3),
  insert: jest.fn(() => mockD3),
  selectAll: jest.fn(() => mockD3),
  data: jest.fn(() => mockD3),
  datum: jest.fn(() => mockD3),
  enter: jest.fn(() => mockD3),
  transition: jest.fn(() => mockD3),
  duration: jest.fn(() => mockD3),
  delay: jest.fn(() => mockD3),
  ease: jest.fn(() => mockD3),
  on: jest.fn(() => mockD3),
  remove: jest.fn(() => mockD3),
  text: jest.fn(() => mockD3),
  node: jest.fn(() => ({ getTotalLength: () => 100 })),
  scaleTime: jest.fn(() => {
    const scale = jest.fn(() => 50);
    scale.domain = jest.fn(() => scale);
    scale.range = jest.fn(() => scale);
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
    axis.ticks = jest.fn(() => axis);
    return axis;
  }),
  axisLeft: jest.fn(() => {
    const axis = jest.fn();
    axis.tickFormat = jest.fn(() => axis);
    axis.tickSize = jest.fn(() => axis);
    return axis;
  }),
  line: jest.fn(() => {
    const lineFn = jest.fn(() => "M0,0 L100,100");
    lineFn.x = jest.fn(() => lineFn);
    lineFn.y = jest.fn(() => lineFn);
    lineFn.curve = jest.fn(() => lineFn);
    return lineFn;
  }),
  extent: jest.fn(() => [new Date("2024-01-01"), new Date("2024-12-31")]),
  max: jest.fn(() => 500),
  min: jest.fn(() => 0),
  curveLinear: "curveLinear",
  curveMonotoneX: "curveMonotoneX",
  curveStep: "curveStep",
  easeLinear: (t) => t
};

// Sample test data - time series
const SAMPLE_TIME_SERIES = [
  { CloseDate: "2024-01-15", Amount: 100, StageName: "Won" },
  { CloseDate: "2024-02-15", Amount: 200, StageName: "Won" },
  { CloseDate: "2024-03-15", Amount: 150, StageName: "Won" },
  { CloseDate: "2024-01-15", Amount: 80, StageName: "Lost" },
  { CloseDate: "2024-02-15", Amount: 120, StageName: "Lost" },
  { CloseDate: "2024-03-15", Amount: 90, StageName: "Lost" }
];

// Single series data
const SINGLE_SERIES_DATA = [
  { CloseDate: "2024-01-01", Amount: 100 },
  { CloseDate: "2024-02-01", Amount: 200 },
  { CloseDate: "2024-03-01", Amount: 150 },
  { CloseDate: "2024-04-01", Amount: 300 }
];

// US date format data
const US_DATE_DATA = [
  { CloseDate: "01/15/2024", Amount: 100 },
  { CloseDate: "02/15/2024", Amount: 200 },
  { CloseDate: "03/15/2024", Amount: 150 }
];

// EU date format data
const EU_DATE_DATA = [
  { CloseDate: "15/01/2024", Amount: 100 },
  { CloseDate: "15/02/2024", Amount: 200 },
  { CloseDate: "15/03/2024", Amount: 150 }
];

// UI API record-query envelope, as the lightning/graphql wire delivers it on
// the structured self-fetch path.
const WIRE_RESPONSE = {
  uiapi: {
    query: {
      Opportunity: {
        edges: [
          {
            node: {
              CloseDate: { value: "2024-01-15" },
              Amount: { value: 100 }
            }
          },
          {
            node: {
              CloseDate: { value: "2024-02-15" },
              Amount: { value: 200 }
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

describe("c-d3-line-chart-graphql", () => {
  let element;

  beforeEach(() => {
    jest.clearAllMocks();
    loadD3.mockResolvedValue(mockD3);

    Element.prototype.getBoundingClientRect = jest.fn(() => ({
      width: 500,
      height: 300,
      top: 0,
      left: 0,
      bottom: 300,
      right: 500
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
  });

  async function createChart(props = {}) {
    element = createElement("c-d3-line-chart-graphql", {
      is: D3LineChartGraphql
    });

    Object.assign(element, {
      dateField: "CloseDate",
      valueField: "Amount",
      recordCollection: SINGLE_SERIES_DATA,
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
      element = createElement("c-d3-line-chart-graphql", {
        is: D3LineChartGraphql
      });
      element.dateField = "CloseDate";
      element.valueField = "Amount";
      element.recordCollection = SINGLE_SERIES_DATA;

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

    it("shows trending icon in no-data state", async () => {
      await createChart({ recordCollection: [] });
      await flushPromises();
      await flushPromises();

      // The no-data state should show an icon
      const icon = element.shadowRoot.querySelector("lightning-icon");
      expect(icon).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DATA SOURCE TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("data sources", () => {
    it("uses recordCollection when provided", async () => {
      await createChart({ recordCollection: SINGLE_SERIES_DATA });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });

    it("shows the no-data state when no data source is configured", async () => {
      // Empty recordCollection and no objectApiName/graphqlQuery means no wire is
      // provisioned — that is a no-data state, not an error.
      await createChart({ recordCollection: [] });
      await flushPromises();
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeFalsy();
      const icon = element.shadowRoot.querySelector("lightning-icon");
      expect(icon).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DATE PARSING TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("date parsing", () => {
    it("parses ISO dates by default", async () => {
      await createChart({
        dateFormat: "ISO",
        recordCollection: SINGLE_SERIES_DATA
      });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });

    it("parses US date format (MM/DD/YYYY)", async () => {
      await createChart({
        dateFormat: "US",
        recordCollection: US_DATE_DATA
      });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });

    it("parses EU date format (DD/MM/YYYY)", async () => {
      await createChart({
        dateFormat: "EU",
        recordCollection: EU_DATE_DATA
      });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });

    it("handles Date objects directly", async () => {
      const dateObjectData = [
        { CloseDate: new Date("2024-01-01"), Amount: 100 },
        { CloseDate: new Date("2024-02-01"), Amount: 200 }
      ];

      await createChart({ recordCollection: dateObjectData });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });

    it("filters out records with invalid dates", async () => {
      const mixedData = [
        { CloseDate: "2024-01-01", Amount: 100 },
        { CloseDate: "not-a-date", Amount: 200 },
        { CloseDate: "2024-03-01", Amount: 150 }
      ];

      await createChart({ recordCollection: mixedData });
      await flushPromises();

      // Should still render with valid dates
      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // MULTI-SERIES TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("multi-series support", () => {
    it("renders single series without seriesField", async () => {
      await createChart({
        recordCollection: SINGLE_SERIES_DATA
      });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });

    it("splits data into multiple series with seriesField", async () => {
      await createChart({
        recordCollection: SAMPLE_TIME_SERIES,
        seriesField: "StageName"
      });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });

    it("shows legend automatically for multi-series", async () => {
      await createChart({
        recordCollection: SAMPLE_TIME_SERIES,
        seriesField: "StageName"
      });
      await flushPromises();

      const legend = element.shadowRoot.querySelector(".legend-container");
      expect(legend).toBeTruthy();
    });

    it("hides legend for single series by default", async () => {
      await createChart({
        recordCollection: SINGLE_SERIES_DATA
      });
      await flushPromises();

      const legend = element.shadowRoot.querySelector(".legend-container");
      expect(legend).toBeFalsy();
    });

    it("handles null values in series field", async () => {
      const dataWithNulls = [
        { CloseDate: "2024-01-01", Amount: 100, StageName: null },
        { CloseDate: "2024-02-01", Amount: 200, StageName: "Won" }
      ];

      await createChart({
        recordCollection: dataWithNulls,
        seriesField: "StageName"
      });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });

    it("renders exactly one legend for multi-series data (no duplicate SVG legend)", async () => {
      await createChart({
        recordCollection: SAMPLE_TIME_SERIES,
        seriesField: "StageName"
      });
      await flushPromises();

      // Accessible HTML legend (kept).
      const htmlLegends =
        element.shadowRoot.querySelectorAll(".legend-container");
      expect(htmlLegends.length).toBe(1);

      // SVG legend group must NOT be appended (removed as a duplicate).
      const svgLegendCalls = mockD3.attr.mock.calls.filter(
        (call) => call[0] === "class" && call[1] === "legend"
      );
      expect(svgLegendCalls.length).toBe(0);
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
        advancedConfig: '{"showGrid": false}'
      });
      await flushPromises();

      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });

    it("handles invalid advancedConfig gracefully", async () => {
      await createChart({
        advancedConfig: "not valid json"
      });
      await flushPromises();

      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });

    it("shows points by default (showPoints undefined)", async () => {
      await createChart(); // Default - should show points
      await flushPromises();

      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });

    it("hides points when showPoints=false", async () => {
      await createChart({ showPoints: false });
      await flushPromises();

      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });

    it("can force show legend with showLegend=true", async () => {
      await createChart({
        recordCollection: SINGLE_SERIES_DATA,
        showLegend: true
      });
      await flushPromises();

      const legend = element.shadowRoot.querySelector(".legend-container");
      expect(legend).toBeTruthy();
    });

    it("can force hide legend with showLegend=false", async () => {
      await createChart({
        recordCollection: SAMPLE_TIME_SERIES,
        seriesField: "StageName",
        showLegend: false
      });
      await flushPromises();

      const legend = element.shadowRoot.querySelector(".legend-container");
      expect(legend).toBeFalsy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CURVE TYPE TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("curve types", () => {
    it("renders with linear curve", async () => {
      await createChart({ curveType: "linear" });
      await flushPromises();

      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });

    it("renders with monotone curve (default)", async () => {
      await createChart({ curveType: "monotone" });
      await flushPromises();

      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });

    it("renders with step curve", async () => {
      await createChart({ curveType: "step" });
      await flushPromises();

      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
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

    it("wires the theme prop to the line stroke color", async () => {
      await createChart({ theme: "Salesforce Standard" });
      await flushPromises();
      expect(mockD3.attr).toHaveBeenCalledWith("stroke", "#1589EE");

      jest.clearAllMocks();
      loadD3.mockResolvedValue(mockD3);
      document.body.removeChild(element);

      await createChart({ theme: "Warm" });
      await flushPromises();
      expect(mockD3.attr).toHaveBeenCalledWith("stroke", "#FF6B6B");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ACCESSIBILITY TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("accessibility", () => {
    it("applies SVG accessibility attributes (role=img + title)", async () => {
      await createChart();
      await flushPromises();

      expect(mockD3.attr).toHaveBeenCalledWith("role", "img");
      expect(mockD3.attr).toHaveBeenCalledWith(
        "aria-label",
        expect.stringContaining("Line chart")
      );
      expect(mockD3.insert).toHaveBeenCalledWith("title", ":first-child");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // RESPONSIVE TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("responsive behavior", () => {
    it("creates ResizeObserver for responsive reflow", async () => {
      await createChart();
      await flushPromises();

      expect(global.ResizeObserver).toHaveBeenCalled();
    });

    it("disconnects ResizeObserver on component removal", async () => {
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

    it("handles zero-width container gracefully", async () => {
      Element.prototype.getBoundingClientRect = jest.fn(() => ({
        width: 0,
        height: 0
      }));

      await createChart();
      await flushPromises();

      // Should not crash
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
      await flushPromises();

      // Zero width: nothing drawn yet, but the observer must already be
      // registered so a later measurement can render (no fixed give-up window).
      expect(mockD3.scaleTime).not.toHaveBeenCalled();
      expect(roCallback).toBeTruthy();

      // The container becomes measurable; the observer fires the render.
      jest.useFakeTimers();
      roCallback([{ contentRect: { width: 500, height: 300 } }]);
      jest.advanceTimersByTime(250);
      jest.useRealTimers();
      await flushPromises();

      expect(mockD3.scaleTime).toHaveBeenCalled();
    });

    it("does not latch an empty shell when first measured below the chart margins, and recovers when it grows", async () => {
      // A sub-margin width (< left+right margin, 90px) makes renderChart bail
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
        width: 80,
        height: 300,
        top: 0,
        left: 0,
        bottom: 300,
        right: 80
      }));

      await createChart();
      await flushPromises();

      // 80px is below the 90px horizontal margin sum: no line drawn yet.
      expect(mockD3.scaleTime).not.toHaveBeenCalled();
      expect(roCallback).toBeTruthy();

      jest.useFakeTimers();
      roCallback([{ contentRect: { width: 500, height: 300 } }]);
      jest.advanceTimersByTime(250);
      jest.useRealTimers();
      await flushPromises();

      expect(mockD3.scaleTime).toHaveBeenCalled();
    });

    it("surfaces a render exception to the error state instead of a silent partial render", async () => {
      // A D3 stub whose svg append throws, simulating a mid-render failure.
      const throwingD3 = {
        select: jest.fn(() => throwingD3),
        append: jest.fn(() => {
          throw new Error("render blew up");
        }),
        remove: jest.fn(() => throwingD3)
      };
      loadD3.mockResolvedValue(throwingD3);

      await createChart();
      await flushPromises();
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeTruthy();
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

      element = createElement("c-d3-line-chart-graphql", {
        is: D3LineChartGraphql
      });
      Object.assign(element, {
        objectApiName: "Opportunity",
        dateField: "CloseDate",
        valueField: "Amount"
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
      mockD3.scaleTime.mockClear();
      jest.useFakeTimers();
      roCallbacks[roCallbacks.length - 1]([
        { contentRect: { width: 500, height: 300 } }
      ]);
      jest.advanceTimersByTime(250);
      jest.useRealTimers();
      await flushPromises();

      expect(mockD3.scaleTime).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // EVENT TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("events", () => {
    it("sets objectApiName for drill-down navigation", async () => {
      await createChart({ objectApiName: "Opportunity" });
      await flushPromises();

      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });

    it("renders legend items with click handlers", async () => {
      await createChart({
        recordCollection: SAMPLE_TIME_SERIES,
        seriesField: "StageName"
      });
      await flushPromises();

      const legendItems = element.shadowRoot.querySelectorAll(".legend-item");
      expect(legendItems.length).toBeGreaterThan(0);
    });

    it("dispatches legendclick event", async () => {
      await createChart({
        recordCollection: SAMPLE_TIME_SERIES,
        seriesField: "StageName"
      });
      await flushPromises();

      const handler = jest.fn();
      element.addEventListener("legendclick", handler);

      const legendItem = element.shadowRoot.querySelector(".legend-item");
      expect(legendItem).toBeTruthy();
      legendItem.click();
      expect(handler).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // EDGE CASE TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("edge cases", () => {
    it("handles records with missing value field", async () => {
      const incompleteData = [
        { CloseDate: "2024-01-01", Amount: 100 },
        { CloseDate: "2024-02-01" }, // missing Amount
        { CloseDate: "2024-03-01", Amount: 150 }
      ];

      await createChart({ recordCollection: incompleteData });
      await flushPromises();

      // Should filter out incomplete records
      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });

    it("handles single data point", async () => {
      const singlePoint = [{ CloseDate: "2024-01-01", Amount: 100 }];

      await createChart({ recordCollection: singlePoint });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });

    it("handles negative values", async () => {
      const negativeData = [
        { CloseDate: "2024-01-01", Amount: -100 },
        { CloseDate: "2024-02-01", Amount: 50 },
        { CloseDate: "2024-03-01", Amount: -50 }
      ];

      await createChart({ recordCollection: negativeData });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });

    it("handles all zero values", async () => {
      const zeroData = [
        { CloseDate: "2024-01-01", Amount: 0 },
        { CloseDate: "2024-02-01", Amount: 0 },
        { CloseDate: "2024-03-01", Amount: 0 }
      ];

      await createChart({ recordCollection: zeroData });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });

    it("handles very large numbers", async () => {
      const largeData = [
        { CloseDate: "2024-01-01", Amount: 1000000000 },
        { CloseDate: "2024-02-01", Amount: 2000000000 }
      ];

      await createChart({ recordCollection: largeData });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CLEANUP TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("cleanup", () => {
    it("cleans up tooltip on disconnect", async () => {
      await createChart();
      await flushPromises();

      // Remove element
      document.body.removeChild(element);

      // Should not throw
      expect(true).toBe(true);
    });

    it("cleans up resize handler on disconnect", async () => {
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
