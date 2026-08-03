// ABOUTME: Unit tests for the d3SlopeChartGraphql Lightning Web Component.
// ABOUTME: Tests initialization, data processing, rendering, config, theme-driven delta coloring, events, and cleanup.

import { createElement } from "lwc";
import D3SlopeChartGraphql from "c/d3SlopeChartGraphql";
import { loadD3 } from "../d3Loader";
import { gql, graphql } from "lightning/graphql";

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

// UI API record-query envelope, as the lightning/graphql wire delivers it.
const WIRE_RESPONSE = {
  uiapi: {
    query: {
      Opportunity: {
        edges: [
          {
            node: {
              Name: { value: "Acme" },
              Amount: { value: 100 },
              ExpectedRevenue: { value: 150 }
            }
          },
          {
            node: {
              Name: { value: "Globex" },
              Amount: { value: 200 },
              ExpectedRevenue: { value: 180 }
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

describe("c-d3-slope-chart-graphql", () => {
  let element;
  let mockD3;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    mockD3 = createMockD3();
    loadD3.mockResolvedValue(mockD3);

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

    it("logs error to console when D3 fails to load", async () => {
      loadD3.mockRejectedValue(new Error("CDN unreachable"));

      await createChart();
      await flushPromises();

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DATA HANDLING TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("data handling", () => {
    it("renders from recordCollection without provisioning the GraphQL wire", async () => {
      // objectApiName is set, so the structured self-fetch would provision a
      // query if recordCollection did not win outright.
      await createChart({
        recordCollection: SAMPLE_DATA,
        objectApiName: "Opportunity"
      });
      await flushPromises();

      expect(gql).not.toHaveBeenCalled();
      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });

    it("shows the no-data state when no data source is configured", async () => {
      // An un-provisioned wire is not an error: with no records passed in and
      // no object to query, the chart settles on the no-data state.
      await createChart({ recordCollection: [] });
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeFalsy();
      expect(element.shadowRoot.querySelector(".chart-container")).toBeFalsy();
      expect(element.shadowRoot.querySelector("lightning-spinner")).toBeFalsy();
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
      expect(cursorCalls.every((c) => c[1] === "default")).toBe(true);
    });

    it("sets pointer cursor with objectApiName", async () => {
      await createChart({ objectApiName: "Opportunity" });
      await flushPromises();
      const cursorCalls = mockD3.attr.mock.calls.filter(
        (c) => c[0] === "cursor"
      );
      expect(cursorCalls.length).toBeGreaterThan(0);
      expect(cursorCalls.every((c) => c[1] === "pointer")).toBe(true);
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

      const handler = jest.fn();
      element.addEventListener("slopeclick", handler);

      const [, callback] = mockD3.on.mock.calls.find((c) => c[0] === "click");
      callback(
        { offsetX: 0, offsetY: 0 },
        { label: "Acme", startValue: 100, endValue: 150, delta: 50 }
      );

      expect(handler.mock.calls[0][0].detail.filterField).toBe(
        "CustomField__c"
      );
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

      // Zero width: no rails built yet, but the observer must already be
      // registered so a later measurement renders (no fixed give-up window).
      expect(mockD3.scalePoint).not.toHaveBeenCalled();
      expect(roCallback).toBeTruthy();

      // The container becomes measurable; the observer fires the render.
      jest.useFakeTimers();
      roCallback([{ contentRect: { width: 500, height: 300 } }]);
      jest.advanceTimersByTime(250);
      jest.useRealTimers();
      await flushPromises();

      expect(mockD3.scalePoint).toHaveBeenCalled();
    });

    it("does not latch an empty shell when first measured below the chart margins, and recovers when it grows", async () => {
      // Slope's horizontal margins are 140 left + 140 right = 280px while the
      // per-entity labels are on, so a 200px container is non-zero yet leaves a
      // negative plot width: renderChart bails before appending the svg. The
      // observer must draw once the container grows past the margins rather
      // than leave a permanently empty shell.
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
        width: 200,
        height: 300,
        top: 0,
        left: 0,
        bottom: 300,
        right: 200
      }));

      await createChart();
      await flushPromises();

      // 200px is below the 280px horizontal margin sum: no rails built yet.
      expect(mockD3.scalePoint).not.toHaveBeenCalled();
      expect(roCallback).toBeTruthy();

      jest.useFakeTimers();
      roCallback([{ contentRect: { width: 500, height: 300 } }]);
      jest.advanceTimersByTime(250);
      jest.useRealTimers();
      await flushPromises();

      expect(mockD3.scalePoint).toHaveBeenCalled();
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

      element = createElement("c-d3-slope-chart-graphql", {
        is: D3SlopeChartGraphql
      });
      Object.assign(element, {
        objectApiName: "Opportunity",
        groupByField: "Name",
        startValueField: "Amount",
        endValueField: "ExpectedRevenue"
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
      mockD3.scalePoint.mockClear();
      jest.useFakeTimers();
      roCallbacks[roCallbacks.length - 1]([
        { contentRect: { width: 500, height: 300 } }
      ]);
      jest.advanceTimersByTime(300);
      jest.useRealTimers();
      await flushPromises();

      expect(mockD3.scalePoint).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // RENDER ORCHESTRATION HARDENING
  // ═══════════════════════════════════════════════════════════════

  describe("render orchestration hardening", () => {
    it("surfaces an exception thrown during renderChart to the error state", async () => {
      // Force renderChart to throw mid-flight; it must not die silently.
      const originalSelect = mockD3.select;
      mockD3.select = jest.fn(() => {
        throw new Error("render boom");
      });

      try {
        await createChart();
        await flushPromises();

        const errorElement = element.shadowRoot.querySelector(
          ".slds-text-color_error"
        );
        expect(errorElement).toBeTruthy();
        expect(errorElement.textContent).toContain("render boom");
      } finally {
        mockD3.select = originalSelect;
      }
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

      // cleanup() nulls the resize handler and tooltip, so re-attaching and
      // detaching again runs a second cleanup pass that must not throw.
      document.body.appendChild(element);
      await flushPromises();

      expect(() => document.body.removeChild(element)).not.toThrow();
    });
  });
});
