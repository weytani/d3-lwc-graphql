// ABOUTME: Unit tests for the d3DifferenceChartGraphql Lightning Web Component.
// ABOUTME: Tests initialization, data handling, date parsing, the two-area clip-path difference fill, curves, legend, render orchestration, and error recovery.

import { createElement } from "lwc";
import D3DifferenceChartGraphql from "c/d3DifferenceChartGraphql";
import { graphql } from "lightning/graphql";
import { loadD3 } from "../d3Loader";

// Mock the bundle-local D3 loader. jest keys the module registry by resolved
// absolute filename, so the test's `../d3Loader` and the component's
// `./d3Loader` are the same module — the mock applies to both.
jest.mock("../d3Loader", () => ({
  loadD3: jest.fn()
}));

// ═══════════════════════════════════════════════════════════════
// MOCK D3 FACTORY
// ═══════════════════════════════════════════════════════════════

const createMockD3 = () => {
  const mockNode = {
    getTotalLength: jest.fn(() => 200)
  };

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
    node: jest.fn(() => mockNode),
    scaleTime: jest.fn(() => {
      const scale = jest.fn((d) => (d ? d.getTime() / 1000000 : 0));
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
    extent: jest.fn((data, accessor) => {
      if (!data || data.length === 0) return [new Date(), new Date()];
      const vals = data.map(accessor);
      return [
        vals.reduce((a, b) => (a < b ? a : b)),
        vals.reduce((a, b) => (a > b ? a : b))
      ];
    }),
    max: jest.fn((data) => {
      if (!data || data.length === 0) return 0;
      return Math.max(...data);
    }),
    min: jest.fn((data) => {
      if (!data || data.length === 0) return 0;
      return Math.min(...data);
    }),
    area: jest.fn(() => {
      const areaGen = jest.fn(() => "M0,0L100,100Z");
      areaGen.x = jest.fn(() => areaGen);
      areaGen.y0 = jest.fn(() => areaGen);
      areaGen.y1 = jest.fn(() => areaGen);
      areaGen.curve = jest.fn(() => areaGen);
      return areaGen;
    }),
    line: jest.fn(() => {
      const lineGen = jest.fn(() => "M0,0L100,100");
      lineGen.x = jest.fn(() => lineGen);
      lineGen.y = jest.fn(() => lineGen);
      lineGen.curve = jest.fn(() => lineGen);
      return lineGen;
    }),
    curveLinear: "curveLinear",
    curveMonotoneX: "curveMonotoneX",
    curveStepAfter: "curveStepAfter",
    easeLinear: "easeLinear"
  };
  return mockD3;
};

// ═══════════════════════════════════════════════════════════════
// TEST DATA
// ═══════════════════════════════════════════════════════════════

const SAMPLE_DATA = [
  { CloseDate: "2024-01-15", Amount: 100, ExpectedRevenue: 150 },
  { CloseDate: "2024-02-20", Amount: 260, ExpectedRevenue: 200 },
  { CloseDate: "2024-03-10", Amount: 150, ExpectedRevenue: 220 },
  { CloseDate: "2024-04-05", Amount: 380, ExpectedRevenue: 300 }
];

const ISO_DATE_DATA = [
  { CloseDate: "2024-06-15T10:30:00.000Z", Amount: 100, ExpectedRevenue: 150 },
  { CloseDate: "2024-07-20T14:00:00.000Z", Amount: 300, ExpectedRevenue: 250 }
];

const US_DATE_DATA = [
  { CloseDate: "01/15/2024", Amount: 100, ExpectedRevenue: 150 },
  { CloseDate: "02/20/2024", Amount: 260, ExpectedRevenue: 200 }
];

const EU_DATE_DATA = [
  { CloseDate: "15/01/2024", Amount: 100, ExpectedRevenue: 150 },
  { CloseDate: "20/02/2024", Amount: 260, ExpectedRevenue: 200 }
];

const SINGLE_RECORD = [
  { CloseDate: "2024-01-01", Amount: 100, ExpectedRevenue: 150 }
];

const NEGATIVE_DATA = [
  { CloseDate: "2024-01-01", Amount: -50, ExpectedRevenue: 0 },
  { CloseDate: "2024-02-01", Amount: 100, ExpectedRevenue: -20 }
];

// UI API record-query envelope, as the lightning/graphql wire delivers it.
const WIRE_RESPONSE = {
  uiapi: {
    query: {
      Opportunity: {
        edges: [
          {
            node: {
              CloseDate: { value: "2024-01-15" },
              Amount: { value: 100 },
              ExpectedRevenue: { value: 150 }
            }
          },
          {
            node: {
              CloseDate: { value: "2024-02-15" },
              Amount: { value: 300 },
              ExpectedRevenue: { value: 200 }
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

describe("c-d3-difference-chart-graphql", () => {
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
    element = createElement("c-d3-difference-chart-graphql", {
      is: D3DifferenceChartGraphql
    });

    Object.assign(element, {
      dateField: "CloseDate",
      primaryField: "Amount",
      secondaryField: "ExpectedRevenue",
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
      element = createElement("c-d3-difference-chart-graphql", {
        is: D3DifferenceChartGraphql
      });
      element.dateField = "CloseDate";
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

    it("has correct default property values", () => {
      element = createElement("c-d3-difference-chart-graphql", {
        is: D3DifferenceChartGraphql
      });
      expect(element.dateField).toBe("CloseDate");
      expect(element.primaryField).toBe("Amount");
      expect(element.secondaryField).toBe("ExpectedRevenue");
      expect(element.curveType).toBe("monotone");
      expect(element.height).toBe(300);
    });

    it("does not expose a valueField or seriesField property", () => {
      element = createElement("c-d3-difference-chart-graphql", {
        is: D3DifferenceChartGraphql
      });
      expect(element.valueField).toBeUndefined();
      expect(element.seriesField).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DATA HANDLING TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("data handling", () => {
    it("renders the chart from recordCollection without provisioning the wire", async () => {
      await createChart({ recordCollection: SAMPLE_DATA });

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeNull();
    });

    it("shows the no-data state (neither error nor chart) when nothing is configured", async () => {
      // No recordCollection, no objectApiName, no graphqlQuery: the wire is never
      // provisioned, which is a no-data state rather than an error.
      await createChart({ recordCollection: [] });
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeNull();
      expect(element.shadowRoot.querySelector(".chart-container")).toBeNull();
      expect(element.shadowRoot.textContent).toContain("No data available");
    });

    it("shows error when no valid data after processing", async () => {
      const invalidData = [
        { CloseDate: "not-a-date", Amount: "x", ExpectedRevenue: "y" }
      ];
      await createChart({ recordCollection: invalidData });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeTruthy();
    });

    it("does not expose the removed Apex-era soqlQuery, fetchMode, or filterClause properties", async () => {
      element = createElement("c-d3-difference-chart-graphql", {
        is: D3DifferenceChartGraphql
      });
      expect(element.soqlQuery).toBeUndefined();
      expect(element.fetchMode).toBeUndefined();
      expect(element.filterClause).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DATE PARSING TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("date parsing", () => {
    it("parses ISO format dates (YYYY-MM-DD)", async () => {
      await createChart({ recordCollection: SAMPLE_DATA, dateFormat: "ISO" });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });

    it("parses full ISO datetime strings", async () => {
      await createChart({
        recordCollection: ISO_DATE_DATA,
        dateFormat: "ISO"
      });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });

    it("parses US format dates (MM/DD/YYYY)", async () => {
      await createChart({ recordCollection: US_DATE_DATA, dateFormat: "US" });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });

    it("parses EU format dates (DD/MM/YYYY)", async () => {
      await createChart({ recordCollection: EU_DATE_DATA, dateFormat: "EU" });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });

    it("filters out records with unparseable dates", async () => {
      const mixedData = [
        { CloseDate: "2024-01-15", Amount: 100, ExpectedRevenue: 150 },
        { CloseDate: null, Amount: 200, ExpectedRevenue: 260 },
        { CloseDate: "2024-03-10", Amount: 150, ExpectedRevenue: 220 }
      ];
      await createChart({ recordCollection: mixedData });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });

    it("sorts data by date", async () => {
      const unsortedData = [
        { CloseDate: "2024-03-10", Amount: 150, ExpectedRevenue: 220 },
        { CloseDate: "2024-01-15", Amount: 100, ExpectedRevenue: 150 },
        { CloseDate: "2024-02-20", Amount: 260, ExpectedRevenue: 200 }
      ];
      await createChart({ recordCollection: unsortedData });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
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

    it("handles negative values on either series", async () => {
      await createChart({ recordCollection: NEGATIVE_DATA });
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
  });

  // ═══════════════════════════════════════════════════════════════
  // CURVE TYPE TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("curve type selection", () => {
    // Every area/line generator is built with the same curve, so the first
    // d3.area() call carries the curve getCurve() resolved for this curveType.
    const curvePassedToArea = () =>
      mockD3.area.mock.results[0].value.curve.mock.calls[0][0];

    it("uses d3.curveMonotoneX by default", async () => {
      await createChart({ curveType: "monotone" });
      await flushPromises();

      expect(curvePassedToArea()).toBe("curveMonotoneX");
    });

    it("uses d3.curveLinear for the linear curve type", async () => {
      await createChart({ curveType: "linear" });
      await flushPromises();

      expect(curvePassedToArea()).toBe("curveLinear");
    });

    it("uses d3.curveStepAfter for the step curve type", async () => {
      await createChart({ curveType: "step" });
      await flushPromises();

      expect(curvePassedToArea()).toBe("curveStepAfter");
    });

    it("falls back to d3.curveMonotoneX for an unknown curve type", async () => {
      await createChart({ curveType: "unknown" });
      await flushPromises();

      expect(curvePassedToArea()).toBe("curveMonotoneX");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TWO-AREA CLIP-PATH DIFFERENCE FILL TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("two-area clip-path difference fill", () => {
    it("creates two clipPath elements (above and below the secondary curve)", async () => {
      await createChart();
      await flushPromises();

      const appendCalls = mockD3.append.mock.calls;
      const clipPathCalls = appendCalls.filter((c) => c[0] === "clipPath");
      expect(clipPathCalls.length).toBe(2);
    });

    it("creates exactly two diff-area paths, clipped by url() references", async () => {
      await createChart();
      await flushPromises();

      const classCalls = mockD3.attr.mock.calls.filter((c) => c[0] === "class");
      expect(classCalls.some((c) => c[1] === "diff-area diff-area-above")).toBe(
        true
      );
      expect(classCalls.some((c) => c[1] === "diff-area diff-area-below")).toBe(
        true
      );

      const clipPathAttrCalls = mockD3.attr.mock.calls.filter(
        (c) => c[0] === "clip-path"
      );
      expect(clipPathAttrCalls.length).toBe(2);
      clipPathAttrCalls.forEach((c) => {
        expect(c[1]).toMatch(/^url\(#diff-clip-(above|below)-/);
      });
    });

    it("fills the above area with the theme's positive semantic color and the below area with negative", async () => {
      await createChart({ theme: "Salesforce Standard" });
      await flushPromises();

      const fillCalls = mockD3.attr.mock.calls.filter((c) => c[0] === "fill");
      expect(fillCalls.some((c) => c[1] === "#4BCA81")).toBe(true); // positive
      expect(fillCalls.some((c) => c[1] === "#FF5D5D")).toBe(true); // negative
    });

    it("calls d3.area() exactly 3 times: the diff area plus the two masks", async () => {
      await createChart();
      await flushPromises();

      expect(mockD3.area).toHaveBeenCalledTimes(3);
    });

    it("draws the primary and secondary lines on top of the fill", async () => {
      await createChart();
      await flushPromises();

      const classCalls = mockD3.attr.mock.calls.filter((c) => c[0] === "class");
      expect(
        classCalls.some((c) => c[1] === "diff-line diff-line-primary")
      ).toBe(true);
      expect(
        classCalls.some((c) => c[1] === "diff-line diff-line-secondary")
      ).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // RENDERING DETAIL TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("rendering details", () => {
    it("creates SVG element", async () => {
      await createChart();
      await flushPromises();

      const appendCalls = mockD3.append.mock.calls;
      expect(appendCalls.some((c) => c[0] === "svg")).toBe(true);
    });

    it("uses d3.scaleTime() for x-axis and d3.scaleLinear() for y-axis", async () => {
      await createChart();
      await flushPromises();

      expect(mockD3.scaleTime).toHaveBeenCalled();
      expect(mockD3.scaleLinear).toHaveBeenCalled();
    });

    it("creates x-axis and y-axis groups", async () => {
      await createChart();
      await flushPromises();

      const attrCalls = mockD3.attr.mock.calls;
      expect(attrCalls.some((c) => c[0] === "class" && c[1] === "x-axis")).toBe(
        true
      );
      expect(attrCalls.some((c) => c[0] === "class" && c[1] === "y-axis")).toBe(
        true
      );
    });

    it("sets SVG dimensions", async () => {
      await createChart();
      await flushPromises();

      const attrCalls = mockD3.attr.mock.calls;
      expect(attrCalls.some((c) => c[0] === "width")).toBe(true);
      expect(attrCalls.some((c) => c[0] === "height")).toBe(true);
    });

    it("removes existing SVG before re-render", async () => {
      await createChart();
      await flushPromises();

      expect(mockD3.select).toHaveBeenCalled();
      expect(mockD3.remove).toHaveBeenCalled();
    });

    it("creates grid lines when showGrid is not disabled", async () => {
      await createChart({ advancedConfig: '{"showGrid": true}' });
      await flushPromises();

      const attrCalls = mockD3.attr.mock.calls;
      const gridCalls = attrCalls.filter(
        (c) =>
          c[0] === "class" && typeof c[1] === "string" && c[1].includes("grid")
      );
      expect(gridCalls.length).toBeGreaterThan(0);
    });

    it("draws one diff-point circle per data point", async () => {
      await createChart();
      await flushPromises();

      const appendCalls = mockD3.append.mock.calls;
      expect(appendCalls.some((c) => c[0] === "circle")).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // LEGEND TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("legend", () => {
    it("always shows a two-item legend naming the primary and secondary fields", async () => {
      await createChart();
      await flushPromises();

      const legendItems = element.shadowRoot.querySelectorAll(".legend-item");
      expect(legendItems.length).toBe(2);
      expect(legendItems[0].textContent).toContain("Amount");
      expect(legendItems[1].textContent).toContain("ExpectedRevenue");
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

    it("accepts customColors in advancedConfig", async () => {
      await createChart({
        advancedConfig: '{"customColors": ["#ff0000", "#00ff00"]}'
      });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
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
        expect.stringContaining("Difference chart")
      );
      expect(mockD3.insert).toHaveBeenCalledWith("title", ":first-child");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TOOLTIP BEHAVIOR TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("tooltip behavior", () => {
    it("registers mouseenter/mouseleave/click handlers on points", async () => {
      await createChart();
      await flushPromises();

      const onCalls = mockD3.on.mock.calls;
      expect(onCalls.some((c) => c[0] === "mouseenter")).toBe(true);
      expect(onCalls.some((c) => c[0] === "mouseleave")).toBe(true);
      expect(onCalls.some((c) => c[0] === "click")).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CLICK EVENT TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("click events", () => {
    const firePointClick = (datum) => {
      const clickHandler = mockD3.on.mock.calls.find((c) => c[0] === "click");
      expect(clickHandler).toBeTruthy();
      clickHandler[1]({ offsetX: 0, offsetY: 0 }, datum);
    };

    it("dispatches differenceclick with the point's delta when objectApiName is set", async () => {
      await createChart({ objectApiName: "Opportunity" });
      await flushPromises();

      const handler = jest.fn();
      element.addEventListener("differenceclick", handler);

      firePointClick({
        date: new Date("2024-02-20"),
        primary: 260,
        secondary: 200
      });

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].detail).toEqual(
        expect.objectContaining({ primary: 260, secondary: 200, delta: 60 })
      );
    });

    it("does not dispatch differenceclick when objectApiName is blank", async () => {
      await createChart({ objectApiName: "" });
      await flushPromises();

      const handler = jest.fn();
      element.addEventListener("differenceclick", handler);

      firePointClick({
        date: new Date("2024-02-20"),
        primary: 260,
        secondary: 200
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it("uses filterField for the event detail's filterField when provided", async () => {
      await createChart({
        objectApiName: "Opportunity",
        filterField: "CustomField__c"
      });
      await flushPromises();

      const handler = jest.fn();
      element.addEventListener("differenceclick", handler);

      firePointClick({
        date: new Date("2024-02-20"),
        primary: 260,
        secondary: 200
      });

      expect(handler.mock.calls[0][0].detail.filterField).toBe(
        "CustomField__c"
      );
    });

    it("falls back to dateField for the event detail's filterField", async () => {
      await createChart({ objectApiName: "Opportunity", filterField: "" });
      await flushPromises();

      const handler = jest.fn();
      element.addEventListener("differenceclick", handler);

      firePointClick({
        date: new Date("2024-02-20"),
        primary: 260,
        secondary: 200
      });

      expect(handler.mock.calls[0][0].detail.filterField).toBe("CloseDate");
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
      roCallback([{ contentRect: { width: 400, height: 300 } }]);
      jest.advanceTimersByTime(250);
      jest.useRealTimers();
      await flushPromises();

      expect(mockD3.scaleTime).toHaveBeenCalled();
    });

    it("does not latch an empty shell when first measured below the chart margins, and recovers when it grows", async () => {
      // renderChart's horizontal margins are left 60 + right 30 = 90px, so a
      // 50px container passes the zero-width gate but bails before appending the
      // svg. The observer must draw once the container grows past the margins —
      // not leave a permanent empty shell.
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
        width: 50,
        height: 300,
        top: 0,
        left: 0,
        bottom: 300,
        right: 50
      }));

      await createChart();
      await flushPromises();

      // 50px is below the 90px horizontal margin sum: no scales built yet.
      expect(mockD3.scaleTime).not.toHaveBeenCalled();
      expect(roCallback).toBeTruthy();

      jest.useFakeTimers();
      roCallback([{ contentRect: { width: 400, height: 300 } }]);
      jest.advanceTimersByTime(250);
      jest.useRealTimers();
      await flushPromises();

      expect(mockD3.scaleTime).toHaveBeenCalled();
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

      element = createElement("c-d3-difference-chart-graphql", {
        is: D3DifferenceChartGraphql
      });
      Object.assign(element, {
        objectApiName: "Opportunity",
        dateField: "CloseDate",
        primaryField: "Amount",
        secondaryField: "ExpectedRevenue"
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
        { contentRect: { width: 400, height: 300 } }
      ]);
      jest.advanceTimersByTime(300);
      jest.useRealTimers();
      await flushPromises();

      expect(mockD3.scaleTime).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ERROR RECOVERY TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("error recovery", () => {
    it("surfaces an exception thrown during renderChart to the error state", async () => {
      // Force renderChart to throw mid-flight; it must not die silently leaving
      // a tooltip-only empty shell. mockD3 comes from the per-test
      // createMockD3() factory, so this mutation cannot leak into later blocks.
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

    it("removes the tooltip element from the DOM on disconnect", async () => {
      await createChart();
      await flushPromises();

      const tooltipEl = element.shadowRoot.querySelector(
        ".slds-popover_tooltip"
      );
      expect(tooltipEl).toBeTruthy();

      document.body.removeChild(element);

      expect(tooltipEl.parentNode).toBeNull();
    });
  });
});
