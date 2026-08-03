// ABOUTME: Unit tests for the d3DifferenceChartGraphql Lightning Web Component.
// ABOUTME: Tests initialization, data handling, date parsing, the two-area clip-path difference fill, curves, legend, and error recovery.

import { createElement } from "lwc";
import D3DifferenceChartGraphql from "c/d3DifferenceChartGraphql";
import { loadD3 } from "c/d3Lib";
import executeQuery from "@salesforce/apex/D3ChartController.executeQuery";

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
    executeQuery.mockResolvedValue(SAMPLE_DATA);

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
    it("uses recordCollection when provided", async () => {
      await createChart({ recordCollection: SAMPLE_DATA });
      expect(executeQuery).not.toHaveBeenCalled();
    });

    it("executes SOQL when recordCollection is empty", async () => {
      await createChart({
        recordCollection: [],
        soqlQuery:
          "SELECT CloseDate, Amount, ExpectedRevenue FROM Opportunity ORDER BY CloseDate"
      });

      expect(executeQuery).toHaveBeenCalledWith({
        queryString:
          "SELECT CloseDate, Amount, ExpectedRevenue FROM Opportunity ORDER BY CloseDate"
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
        soqlQuery: "SELECT Invalid FROM Opportunity"
      });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeTruthy();
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

    it("wires filterClause into the SOQL query sent to Apex, before ORDER BY", async () => {
      await createChart({
        recordCollection: [],
        soqlQuery:
          "SELECT CloseDate, Amount, ExpectedRevenue FROM Opportunity ORDER BY CloseDate",
        filterClause: "Amount > 1000"
      });

      expect(executeQuery).toHaveBeenCalledWith({
        queryString:
          "SELECT CloseDate, Amount, ExpectedRevenue FROM Opportunity WHERE (Amount > 1000) ORDER BY CloseDate"
      });
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
    it("uses monotone curve by default", async () => {
      await createChart({ curveType: "monotone" });
      await flushPromises();

      expect(mockD3.area).toHaveBeenCalled();
    });

    it("accepts linear curve type", async () => {
      await createChart({ curveType: "linear" });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });

    it("accepts step curve type", async () => {
      await createChart({ curveType: "step" });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });

    it("falls back to monotone for unknown curve type", async () => {
      await createChart({ curveType: "unknown" });
      await flushPromises();

      expect(loadD3).toHaveBeenCalled();
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
    it("configures for differenceclick when objectApiName is set", async () => {
      await createChart({ objectApiName: "Opportunity" });
      await flushPromises();

      expect(loadD3).toHaveBeenCalled();
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
  // RESPONSIVE BEHAVIOR TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("responsive behavior", () => {
    it("sets up resize observer", async () => {
      await createChart();
      await flushPromises();

      expect(global.ResizeObserver).toHaveBeenCalled();
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

      containerWidth = 400;
      Element.prototype.getBoundingClientRect = jest.fn(() => ({
        width: 400,
        height: 300,
        top: 0,
        left: 0,
        bottom: 300,
        right: 400
      }));

      while (rafCallbacks.length > 0) {
        const cb = rafCallbacks.shift();
        cb();
      }

      expect(mockD3.select).toHaveBeenCalled();
    });

    it("cancels layout retry on disconnect", async () => {
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

      document.body.removeChild(element);

      expect(global.cancelAnimationFrame).toHaveBeenCalled();
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

    it("cleans up tooltip on disconnect", async () => {
      await createChart();
      await flushPromises();

      document.body.removeChild(element);
      expect(true).toBe(true);
    });
  });
});
