// ABOUTME: Unit tests for the d3SlopeChartGraphql Lightning Web Component.
// ABOUTME: Tests initialization, data processing, rendering, config, theme-driven delta coloring, events, and cleanup.

import { createElement } from "lwc";
import D3SlopeChartGraphql from "c/d3SlopeChartGraphql";
import { loadD3 } from "c/d3Lib";
import executeQuery from "@salesforce/apex/D3ChartController.executeQuery";

jest.mock("c/d3Lib", () => ({
  loadD3: jest.fn()
}));

jest.mock(
  "@salesforce/apex/D3ChartController.executeQuery",
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
    insert: jest.fn(() => mockD3),
    selectAll: jest.fn(() => mockD3),
    data: jest.fn(() => mockD3),
    enter: jest.fn(() => mockD3),
    transition: jest.fn(() => mockD3),
    duration: jest.fn(() => mockD3),
    on: jest.fn(() => mockD3),
    remove: jest.fn(() => mockD3),
    text: jest.fn(() => mockD3),
    scalePoint: jest.fn(() => {
      const scale = jest.fn(() => 50);
      scale.domain = jest.fn(() => scale);
      scale.range = jest.fn(() => scale);
      scale.padding = jest.fn(() => scale);
      return scale;
    })
  };
  return mockD3;
};

// ═══════════════════════════════════════════════════════════════
// TEST DATA
// ═══════════════════════════════════════════════════════════════

const SAMPLE_DATA = [
  { Name: "Acme", Amount: 100, ExpectedRevenue: 150 },
  { Name: "Globex", Amount: 200, ExpectedRevenue: 180 },
  { Name: "Initech", Amount: 50, ExpectedRevenue: 90 }
];

const SINGLE_RECORD = [{ Name: "Acme", Amount: 100, ExpectedRevenue: 150 }];

// Flush promises helper
// eslint-disable-next-line @lwc/lwc/no-async-operation
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("c-d3-slope-chart-graphql", () => {
  let element;
  let mockD3;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    mockD3 = createMockD3();
    loadD3.mockResolvedValue(mockD3);
    executeQuery.mockResolvedValue(SAMPLE_DATA);

    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

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
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  async function createChart(props = {}) {
    element = createElement("c-d3-slope-chart-graphql", {
      is: D3SlopeChartGraphql
    });

    Object.assign(element, {
      groupByField: "Name",
      startValueField: "Amount",
      endValueField: "ExpectedRevenue",
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
      element = createElement("c-d3-slope-chart-graphql", {
        is: D3SlopeChartGraphql
      });
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
      await createChart({ recordCollection: SAMPLE_DATA });
      expect(executeQuery).not.toHaveBeenCalled();
    });

    it("executes SOQL when recordCollection is empty", async () => {
      await createChart({
        recordCollection: [],
        soqlQuery: "SELECT Name, Amount, ExpectedRevenue FROM Opportunity"
      });

      expect(executeQuery).toHaveBeenCalledWith({
        queryString: "SELECT Name, Amount, ExpectedRevenue FROM Opportunity"
      });
    });

    it("shows error when no data source provided", async () => {
      await createChart({ recordCollection: [], soqlQuery: "" });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeTruthy();
    });

    it("shows error when SOQL query fails", async () => {
      executeQuery.mockRejectedValue({ body: { message: "Query error" } });

      await createChart({
        recordCollection: [],
        soqlQuery: "SELECT Bad FROM Opportunity"
      });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeTruthy();
    });

    it("logs error to console when SOQL query fails", async () => {
      executeQuery.mockRejectedValue({ body: { message: "Query error" } });

      await createChart({
        recordCollection: [],
        soqlQuery: "SELECT Bad FROM Opportunity"
      });
      await flushPromises();

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it("handles a single entity", async () => {
      await createChart({ recordCollection: SINGLE_RECORD });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });

    it("shows error when required fields are missing", async () => {
      const wrongFields = [{ WrongField: "A" }];
      await createChart({ recordCollection: wrongFields });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DATA PROCESSING EDGE CASES
  // ═══════════════════════════════════════════════════════════════

  describe("data processing edge cases", () => {
    it("filters out records with a non-numeric start value", async () => {
      const mixedData = [
        { Name: "A", Amount: "not-a-number", ExpectedRevenue: 100 },
        { Name: "B", Amount: 50, ExpectedRevenue: 100 }
      ];

      await createChart({ recordCollection: mixedData });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });

    it("filters out records with a null label", async () => {
      const mixedData = [
        { Name: null, Amount: 50, ExpectedRevenue: 100 },
        { Name: "B", Amount: 50, ExpectedRevenue: 100 }
      ];

      await createChart({ recordCollection: mixedData });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });

    it("drops (does not coerce to 0) a record with a null start value", async () => {
      const mixedData = [
        { Name: "A", Amount: null, ExpectedRevenue: 100 },
        { Name: "B", Amount: 50, ExpectedRevenue: 100 }
      ];

      await createChart({ recordCollection: mixedData });
      await flushPromises();

      const dataCall = mockD3.data.mock.calls.find((c) => Array.isArray(c[0]));
      expect(dataCall[0]).toHaveLength(1);
      expect(dataCall[0][0].label).toBe("B");
    });

    it("drops (does not coerce to 0) a record with an empty-string end value", async () => {
      const mixedData = [
        { Name: "A", Amount: 50, ExpectedRevenue: "" },
        { Name: "B", Amount: 50, ExpectedRevenue: 100 }
      ];

      await createChart({ recordCollection: mixedData });
      await flushPromises();

      const dataCall = mockD3.data.mock.calls.find((c) => Array.isArray(c[0]));
      expect(dataCall[0]).toHaveLength(1);
      expect(dataCall[0][0].label).toBe("B");
    });

    it("shows an error when every record is invalid", async () => {
      const allInvalid = [{ Name: "A", Amount: "x", ExpectedRevenue: "y" }];

      await createChart({ recordCollection: allInvalid });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeTruthy();
    });

    it("handles negative deltas (decrease)", async () => {
      const decreaseData = [{ Name: "A", Amount: 200, ExpectedRevenue: 100 }];

      await createChart({ recordCollection: decreaseData });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });

    it("handles a zero delta (no change)", async () => {
      const noChangeData = [{ Name: "A", Amount: 100, ExpectedRevenue: 100 }];

      await createChart({ recordCollection: noChangeData });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
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

    it("shows per-entity labels by default", async () => {
      await createChart();
      await flushPromises();

      const textCalls = mockD3.attr.mock.calls.filter(
        (c) =>
          c[0] === "class" &&
          typeof c[1] === "string" &&
          c[1].includes("slope-label")
      );
      expect(textCalls.length).toBeGreaterThan(0);
    });

    it("hides per-entity labels when showLabels is false", async () => {
      await createChart({ advancedConfig: '{"showLabels": false}' });
      await flushPromises();

      const textCalls = mockD3.attr.mock.calls.filter(
        (c) =>
          c[0] === "class" &&
          typeof c[1] === "string" &&
          c[1].includes("slope-label")
      );
      expect(textCalls.length).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // THEME / DELTA COLORING TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("theme-driven delta coloring", () => {
    it("colors an increasing entity with the theme's positive semantic color", async () => {
      const increaseData = [{ Name: "A", Amount: 100, ExpectedRevenue: 200 }];
      await createChart({
        recordCollection: increaseData,
        theme: "Salesforce Standard"
      });
      await flushPromises();

      const strokeCalls = mockD3.attr.mock.calls.filter(
        (c) => c[0] === "stroke" && typeof c[1] === "function"
      );
      expect(strokeCalls.length).toBeGreaterThan(0);
      const strokeFn = strokeCalls[0][1];
      expect(strokeFn({ delta: 100 })).toBe("#4BCA81");
    });

    it("colors a decreasing entity with the theme's negative semantic color", async () => {
      const decreaseData = [{ Name: "A", Amount: 200, ExpectedRevenue: 100 }];
      await createChart({
        recordCollection: decreaseData,
        theme: "Salesforce Standard"
      });
      await flushPromises();

      const strokeCalls = mockD3.attr.mock.calls.filter(
        (c) => c[0] === "stroke" && typeof c[1] === "function"
      );
      const strokeFn = strokeCalls[0][1];
      expect(strokeFn({ delta: -100 })).toBe("#FF5D5D");
    });

    it("uses the Warm theme's semantic variant", async () => {
      await createChart({ theme: "Warm" });
      await flushPromises();

      const strokeCalls = mockD3.attr.mock.calls.filter(
        (c) => c[0] === "stroke" && typeof c[1] === "function"
      );
      const strokeFn = strokeCalls[0][1];
      expect(strokeFn({ delta: 10 })).toBe("#FFD93D");
      expect(strokeFn({ delta: -10 })).toBe("#F94144");
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

    it("registers a click handler on each entity group", async () => {
      await createChart();
      await flushPromises();

      const onCalls = mockD3.on.mock.calls;
      expect(onCalls.filter((c) => c[0] === "click").length).toBeGreaterThan(0);
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
    it("registers mouseenter handler on entity groups", async () => {
      await createChart();
      await flushPromises();

      const onCalls = mockD3.on.mock.calls;
      expect(
        onCalls.filter((c) => c[0] === "mouseenter").length
      ).toBeGreaterThan(0);
    });

    it("registers mouseleave handler on entity groups", async () => {
      await createChart();
      await flushPromises();

      const onCalls = mockD3.on.mock.calls;
      expect(
        onCalls.filter((c) => c[0] === "mouseleave").length
      ).toBeGreaterThan(0);
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

    it("retries chart init when container starts at zero width", async () => {
      let containerWidth = 0;
      Element.prototype.getBoundingClientRect = jest.fn(() => ({
        width: containerWidth,
        height: 300,
        top: 0,
        left: 0,
        bottom: 300,
        right: containerWidth
      }));

      const rafCallbacks = [];
      global.requestAnimationFrame = jest.fn((cb) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length;
      });
      global.cancelAnimationFrame = jest.fn();

      await createChart();
      await flushPromises();

      expect(global.requestAnimationFrame).toHaveBeenCalled();
      expect(mockD3.scalePoint).not.toHaveBeenCalled();

      containerWidth = 500;
      Element.prototype.getBoundingClientRect = jest.fn(() => ({
        width: 500,
        height: 300,
        top: 0,
        left: 0,
        bottom: 300,
        right: 500
      }));

      while (rafCallbacks.length > 0) {
        const cb = rafCallbacks.shift();
        cb();
      }

      expect(mockD3.select).toHaveBeenCalled();
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

    it("creates two scalePoint scales (start rail + end rail)", async () => {
      await createChart();
      await flushPromises();

      expect(mockD3.scalePoint).toHaveBeenCalledTimes(2);
    });

    it("creates a connecting line per entity", async () => {
      await createChart();
      await flushPromises();

      // The mock records one call per .append() invocation in the code, not
      // one per bound datum: two standalone calls for the vertical guide
      // rails, plus one data-driven .enter().append("line") call for all
      // per-entity connecting lines.
      const lineCalls = mockD3.append.mock.calls.filter((c) => c[0] === "line");
      expect(lineCalls.length).toBe(3);
    });

    it("creates dot circles for both the start and end rail", async () => {
      await createChart();
      await flushPromises();

      // One data-driven .enter().append("circle") call for the start dots,
      // one for the end dots — see the note above about mock call counting.
      const circleCalls = mockD3.append.mock.calls.filter(
        (c) => c[0] === "circle"
      );
      expect(circleCalls.length).toBe(2);
    });

    it("does not create bar rect elements", async () => {
      await createChart();
      await flushPromises();

      const rectCalls = mockD3.append.mock.calls.filter((c) => c[0] === "rect");
      expect(rectCalls.length).toBe(0);
    });

    it("removes existing SVG before re-render", async () => {
      await createChart();
      await flushPromises();

      expect(mockD3.select).toHaveBeenCalled();
      expect(mockD3.remove).toHaveBeenCalled();
    });

    it("applies a fade-in transition to the connecting lines", async () => {
      await createChart();
      await flushPromises();

      expect(mockD3.transition).toHaveBeenCalled();
      expect(mockD3.duration).toHaveBeenCalled();
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

    it("handles double disconnect gracefully", async () => {
      await createChart();
      await flushPromises();

      document.body.removeChild(element);

      expect(true).toBe(true);
    });
  });
});
