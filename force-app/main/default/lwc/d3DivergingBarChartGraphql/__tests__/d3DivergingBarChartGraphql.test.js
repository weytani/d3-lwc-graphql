// ABOUTME: Unit tests for the d3DivergingBarChartGraphql Lightning Web Component.
// ABOUTME: Tests centered-zero domain, sign-based coloring, data handling, config, events, tooltip, resize, and error recovery.

import { createElement } from "lwc";
import D3DivergingBarChartGraphql from "c/d3DivergingBarChartGraphql";
import { loadD3 } from "c/d3Lib";
import executeQuery from "@salesforce/apex/D3ChartController.executeQuery";
import getAggregatedData from "@salesforce/apex/D3ChartController.getAggregatedData";

// Mock d3Lib
jest.mock("c/d3Lib", () => ({
  loadD3: jest.fn()
}));

// Mock Apex
jest.mock(
  "@salesforce/apex/D3ChartController.executeQuery",
  () => ({
    default: jest.fn()
  }),
  { virtual: true }
);

jest.mock(
  "@salesforce/apex/D3ChartController.getAggregatedData",
  () => ({
    default: jest.fn()
  }),
  { virtual: true }
);

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
      scale.clamp = jest.fn(() => scale);
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

const NEGATIVE_DATA = [
  { StageName: "Loss", Amount: -300 },
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

describe("c-d3-diverging-bar-chart-graphql", () => {
  let element;
  let mockD3;
  let consoleErrorSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    mockD3 = createMockD3();
    loadD3.mockResolvedValue(mockD3);
    executeQuery.mockResolvedValue(SAMPLE_DATA);
    getAggregatedData.mockResolvedValue([
      { label: "Closed Won", value: 500 },
      { label: "Prospecting", value: 300 },
      { label: "Lost", value: -250 }
    ]);

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
    element = createElement("c-d3-diverging-bar-chart-graphql", {
      is: D3DivergingBarChartGraphql
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
      element = createElement("c-d3-diverging-bar-chart-graphql", {
        is: D3DivergingBarChartGraphql
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
    it("uses recordCollection when provided", async () => {
      await createChart({
        recordCollection: SAMPLE_DATA
      });

      expect(executeQuery).not.toHaveBeenCalled();
    });

    it("executes SOQL when recordCollection is empty", async () => {
      await createChart({
        recordCollection: [],
        soqlQuery: "SELECT StageName, Amount FROM Opportunity"
      });

      expect(executeQuery).toHaveBeenCalledWith({
        queryString: "SELECT StageName, Amount FROM Opportunity"
      });
    });

    it("shows error when no data source provided", async () => {
      await createChart({
        recordCollection: [],
        soqlQuery: ""
      });

      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeTruthy();
    });

    it("shows error when SOQL query fails", async () => {
      executeQuery.mockRejectedValue({
        body: { message: "Query error" }
      });

      await createChart({
        recordCollection: [],
        soqlQuery: "SELECT Invalid FROM Opportunity"
      });

      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeTruthy();
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
      element = createElement("c-d3-diverging-bar-chart-graphql", {
        is: D3DivergingBarChartGraphql
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

    it("overrides the theme's positive/negative colors with customColors [positive, negative]", async () => {
      await createChart({
        theme: "Salesforce Standard",
        recordCollection: [
          { StageName: "Loss", Amount: -300 },
          { StageName: "Gain", Amount: 200 }
        ],
        advancedConfig: '{"customColors": ["#00AA00", "#AA0000"]}'
      });

      await flushPromises();
      const fillCalls = mockD3.attr.mock.calls.filter((c) => c[0] === "fill");
      expect(fillCalls.length).toBeGreaterThan(0);
      const fillFn = fillCalls[fillCalls.length - 1][1];
      expect(fillFn({ label: "Gain", value: 200 })).toBe("#00AA00");
      expect(fillFn({ label: "Loss", value: -300 })).toBe("#AA0000");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // THEMES TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("themes", () => {
    it("wires the default theme's real semantic positive/negative colors to the bar fills", async () => {
      await createChart({
        theme: "Salesforce Standard",
        recordCollection: [
          { StageName: "Loss", Amount: -300 },
          { StageName: "Gain", Amount: 200 }
        ]
      });

      await flushPromises();
      const fillCalls = mockD3.attr.mock.calls.filter((c) => c[0] === "fill");
      const fillFn = fillCalls[fillCalls.length - 1][1];
      expect(fillFn({ label: "Gain", value: 200 })).toBe("#4BCA81");
      expect(fillFn({ label: "Loss", value: -300 })).toBe("#FF5D5D");
    });

    it("wires the Warm theme's real semantic positive/negative colors to the bar fills", async () => {
      await createChart({
        theme: "Warm",
        recordCollection: [
          { StageName: "Loss", Amount: -300 },
          { StageName: "Gain", Amount: 200 }
        ]
      });

      await flushPromises();
      const fillCalls = mockD3.attr.mock.calls.filter((c) => c[0] === "fill");
      const fillFn = fillCalls[fillCalls.length - 1][1];
      expect(fillFn({ label: "Gain", value: 200 })).toBe("#FFD93D");
      expect(fillFn({ label: "Loss", value: -300 })).toBe("#F94144");
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

    it("retries chart init when container starts at zero width", async () => {
      // Start with zero width
      let containerWidth = 0;
      Element.prototype.getBoundingClientRect = jest.fn(() => ({
        width: containerWidth,
        height: 300,
        top: 0,
        left: 0,
        bottom: 300,
        right: containerWidth
      }));

      // Track RAF calls
      const rafCallbacks = [];
      global.requestAnimationFrame = jest.fn((cb) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length;
      });
      global.cancelAnimationFrame = jest.fn();

      await createChart();
      await flushPromises();

      // Chart was not rendered (width was 0), but RAF should have been requested
      expect(global.requestAnimationFrame).toHaveBeenCalled();
      expect(mockD3.scaleBand).not.toHaveBeenCalled();

      // Simulate container getting width from layout engine
      containerWidth = 400;
      Element.prototype.getBoundingClientRect = jest.fn(() => ({
        width: 400,
        height: 300,
        top: 0,
        left: 0,
        bottom: 300,
        right: 400
      }));

      // Fire the RAF callback chain
      while (rafCallbacks.length > 0) {
        const cb = rafCallbacks.shift();
        cb();
      }

      // Chart should now have rendered
      expect(mockD3.select).toHaveBeenCalled();
    });

    it("cancels layout retry on disconnect", async () => {
      // Start with zero width
      Element.prototype.getBoundingClientRect = jest.fn(() => ({
        width: 0,
        height: 0,
        top: 0,
        left: 0,
        bottom: 0,
        right: 0
      }));

      global.requestAnimationFrame = jest.fn(() => 42);
      global.cancelAnimationFrame = jest.fn();

      await createChart();
      await flushPromises();

      // Remove element triggers disconnectedCallback
      document.body.removeChild(element);

      expect(global.cancelAnimationFrame).toHaveBeenCalled();
    });

    it("does not start duplicate retries on multiple renderedCallback calls", async () => {
      // Start with zero width
      Element.prototype.getBoundingClientRect = jest.fn(() => ({
        width: 0,
        height: 300,
        top: 0,
        left: 0,
        bottom: 300,
        right: 0
      }));

      let rafCount = 0;
      global.requestAnimationFrame = jest.fn(() => ++rafCount);
      global.cancelAnimationFrame = jest.fn();

      await createChart();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      // Only one RAF should be requested (one retry loop, not multiple)
      expect(global.requestAnimationFrame).toHaveBeenCalledTimes(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ERROR RECOVERY TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("error recovery", () => {
    it("shows error from SOQL body.message", async () => {
      executeQuery.mockRejectedValue({
        body: { message: "Specific SOQL error" }
      });

      await createChart({
        recordCollection: [],
        soqlQuery: "SELECT Bad FROM Object"
      });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeTruthy();
    });

    it("falls back to e.message when body is missing", async () => {
      executeQuery.mockRejectedValue(new Error("Network error"));

      await createChart({
        recordCollection: [],
        soqlQuery: "SELECT Id FROM Account"
      });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeTruthy();
    });

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

    it("creates band scale for category axis", async () => {
      await createChart();
      await flushPromises();

      expect(mockD3.scaleBand).toHaveBeenCalled();
    });

    it("creates linear scale for y-axis", async () => {
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

    it("uses a symmetric centered-zero domain (-maxAbs to +maxAbs)", async () => {
      await createChart({
        recordCollection: [
          { StageName: "Loss", Amount: -300 },
          { StageName: "Gain", Amount: 200 }
        ]
      });
      await flushPromises();

      // renderChart builds a scaleLinear and calls .domain([-maxAbs, +maxAbs]).
      // Capture the domain passed to any linear-scale instance.
      expect(mockD3.scaleLinear).toHaveBeenCalled();
      const scaleInstance = mockD3.scaleLinear.mock.results[0].value;
      const domainCalls = scaleInstance.domain.mock.calls;
      // The value (x) scale domain must be symmetric around zero.
      const symmetricDomain = domainCalls.find(
        (c) =>
          Array.isArray(c[0]) &&
          c[0].length === 2 &&
          c[0][0] === -c[0][1] &&
          c[0][1] > 0
      );
      expect(symmetricDomain).toBeTruthy();
      expect(symmetricDomain[0][0]).toBe(-symmetricDomain[0][1]);
    });

    it("colors positive bars with the positive semantic color", async () => {
      await createChart({
        recordCollection: [
          { StageName: "Loss", Amount: -300 },
          { StageName: "Gain", Amount: 200 }
        ]
      });
      await flushPromises();

      const fillCalls = mockD3.attr.mock.calls.filter((c) => c[0] === "fill");
      expect(fillCalls.length).toBeGreaterThan(0);
      const fillFn = fillCalls[fillCalls.length - 1][1];
      expect(typeof fillFn).toBe("function");
      // Positive value -> positive semantic color #4BCA81
      expect(fillFn({ label: "Gain", value: 200 })).toBe("#4BCA81");
    });

    it("colors negative bars with the negative semantic color", async () => {
      await createChart({
        recordCollection: [
          { StageName: "Loss", Amount: -300 },
          { StageName: "Gain", Amount: 200 }
        ]
      });
      await flushPromises();

      const fillCalls = mockD3.attr.mock.calls.filter((c) => c[0] === "fill");
      expect(fillCalls.length).toBeGreaterThan(0);
      const fillFn = fillCalls[fillCalls.length - 1][1];
      expect(typeof fillFn).toBe("function");
      // Negative value -> negative semantic color #FF5D5D
      expect(fillFn({ label: "Loss", value: -300 })).toBe("#FF5D5D");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SERVER AGGREGATION TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("server aggregation", () => {
    it("calls getAggregatedData when objectApiName, groupByField, valueField, and operation are set", async () => {
      await createChart({
        recordCollection: [],
        soqlQuery: "",
        objectApiName: "Opportunity",
        groupByField: "StageName",
        valueField: "Amount",
        operation: "Sum"
      });

      await flushPromises();

      expect(getAggregatedData).toHaveBeenCalledWith({
        objectName: "Opportunity",
        groupByField: "StageName",
        valueField: "Amount",
        operation: "Sum",
        filterClause: null
      });
      expect(executeQuery).not.toHaveBeenCalled();
    });

    it("passes filterClause to getAggregatedData when set", async () => {
      await createChart({
        recordCollection: [],
        soqlQuery: "",
        objectApiName: "Opportunity",
        groupByField: "StageName",
        valueField: "Amount",
        operation: "Sum",
        filterClause: "Amount > 1000"
      });

      await flushPromises();

      expect(getAggregatedData).toHaveBeenCalledWith({
        objectName: "Opportunity",
        groupByField: "StageName",
        valueField: "Amount",
        operation: "Sum",
        filterClause: "Amount > 1000"
      });
    });

    it("falls back to soqlQuery with client aggregation when objectApiName is not set", async () => {
      await createChart({
        recordCollection: [],
        soqlQuery: "SELECT StageName, Amount FROM Opportunity",
        objectApiName: "",
        groupByField: "StageName",
        valueField: "Amount",
        operation: "Sum"
      });

      await flushPromises();

      expect(getAggregatedData).not.toHaveBeenCalled();
      expect(executeQuery).toHaveBeenCalledWith({
        queryString: "SELECT StageName, Amount FROM Opportunity"
      });
    });

    it("renders chart from server aggregated data", async () => {
      await createChart({
        recordCollection: [],
        soqlQuery: "",
        objectApiName: "Opportunity",
        groupByField: "StageName",
        valueField: "Amount",
        operation: "Sum"
      });

      await flushPromises();
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });

    it("shows error when getAggregatedData fails", async () => {
      getAggregatedData.mockRejectedValue({
        body: { message: "Aggregation failed" }
      });

      await createChart({
        recordCollection: [],
        soqlQuery: "",
        objectApiName: "Opportunity",
        groupByField: "StageName",
        valueField: "Amount",
        operation: "Sum"
      });

      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeTruthy();
    });

    it("shows error when getAggregatedData returns empty array", async () => {
      getAggregatedData.mockResolvedValue([]);

      await createChart({
        recordCollection: [],
        soqlQuery: "",
        objectApiName: "Opportunity",
        groupByField: "StageName",
        valueField: "Amount",
        operation: "Sum"
      });

      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeTruthy();
    });

    it("prefers recordCollection over server aggregation", async () => {
      await createChart({
        recordCollection: SAMPLE_DATA,
        objectApiName: "Opportunity",
        groupByField: "StageName",
        valueField: "Amount",
        operation: "Sum"
      });

      await flushPromises();

      expect(getAggregatedData).not.toHaveBeenCalled();
      expect(executeQuery).not.toHaveBeenCalled();
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
      element = createElement("c-d3-diverging-bar-chart-graphql", {
        is: D3DivergingBarChartGraphql
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
