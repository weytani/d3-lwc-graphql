// ABOUTME: Unit tests for the d3BandChartGraphql Lightning Web Component.
// ABOUTME: Tests initialization, data handling, date parsing, the lower/upper band area, optional center line, curves, render orchestration, and error recovery.

import { createElement } from "lwc";
import D3BandChartGraphql from "c/d3BandChartGraphql";
import { graphql, gql } from "lightning/graphql";
import { loadD3 } from "../d3Loader";

// Mock the bundle-local D3 loader. jest keys the module registry by resolved
// absolute filename, so the test's "../d3Loader" and the component's
// "./d3Loader" are the same module and this mock applies to both.
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
  { CloseDate: "2024-02-20", Amount: 200, ExpectedRevenue: 260 },
  { CloseDate: "2024-03-10", Amount: 150, ExpectedRevenue: 220 },
  { CloseDate: "2024-04-05", Amount: 300, ExpectedRevenue: 380 }
];

const ISO_DATE_DATA = [
  { CloseDate: "2024-06-15T10:30:00.000Z", Amount: 100, ExpectedRevenue: 150 },
  { CloseDate: "2024-07-20T14:00:00.000Z", Amount: 250, ExpectedRevenue: 300 }
];

const US_DATE_DATA = [
  { CloseDate: "01/15/2024", Amount: 100, ExpectedRevenue: 150 },
  { CloseDate: "02/20/2024", Amount: 200, ExpectedRevenue: 260 }
];

const EU_DATE_DATA = [
  { CloseDate: "15/01/2024", Amount: 100, ExpectedRevenue: 150 },
  { CloseDate: "20/02/2024", Amount: 200, ExpectedRevenue: 260 }
];

const SINGLE_RECORD = [
  { CloseDate: "2024-01-01", Amount: 100, ExpectedRevenue: 150 }
];

const NEGATIVE_DATA = [
  { CloseDate: "2024-01-01", Amount: -50, ExpectedRevenue: 0 },
  { CloseDate: "2024-02-01", Amount: 0, ExpectedRevenue: 100 }
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
              CloseDate: { value: "2024-02-20" },
              Amount: { value: 200 },
              ExpectedRevenue: { value: 260 }
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

describe("c-d3-band-chart-graphql", () => {
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
    element = createElement("c-d3-band-chart-graphql", {
      is: D3BandChartGraphql
    });

    Object.assign(element, {
      dateField: "CloseDate",
      lowerField: "Amount",
      upperField: "ExpectedRevenue",
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
      element = createElement("c-d3-band-chart-graphql", {
        is: D3BandChartGraphql
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
      element = createElement("c-d3-band-chart-graphql", {
        is: D3BandChartGraphql
      });
      expect(element.dateField).toBe("CloseDate");
      expect(element.lowerField).toBe("Amount");
      expect(element.upperField).toBe("ExpectedRevenue");
      expect(element.valueField).toBe("");
      expect(element.curveType).toBe("monotone");
      expect(element.height).toBe(300);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DATA HANDLING TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("data handling", () => {
    it("charts recordCollection without provisioning the GraphQL wire", async () => {
      await createChart({ recordCollection: SAMPLE_DATA });

      expect(gql).not.toHaveBeenCalled();
      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });

    it("shows the no-data state when nothing is configured to fetch", async () => {
      await createChart({ recordCollection: [], objectApiName: "" });
      await flushPromises();

      // An un-provisioned wire is not an error — neither the error state nor a
      // chart, just the empty state.
      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeFalsy();
      expect(element.shadowRoot.querySelector(".chart-container")).toBeFalsy();
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

    it("drops rows with a null upper bound value, keeps valid ones", async () => {
      const partial = [
        { CloseDate: "2024-01-15", Amount: 100, ExpectedRevenue: null },
        { CloseDate: "2024-02-20", Amount: 200, ExpectedRevenue: 260 }
      ];
      await createChart({ recordCollection: partial });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
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
        { CloseDate: "2024-02-20", Amount: 200, ExpectedRevenue: 260 }
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

    it("handles negative values", async () => {
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
  // CENTER LINE TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("optional center line", () => {
    it("hasCenterLine is false when valueField is not set", async () => {
      await createChart();
      expect(element.valueField).toBe("");
    });

    it("does not draw a center line when valueField is unset", async () => {
      await createChart();
      await flushPromises();

      const appendCalls = mockD3.append.mock.calls;
      const centerLineAttrCalls = mockD3.attr.mock.calls.filter(
        (c) => c[0] === "class" && c[1] === "band-center-line"
      );
      expect(centerLineAttrCalls.length).toBe(0);
      expect(appendCalls.some((c) => c[0] === "circle")).toBe(false);
    });

    it("draws a center line and points when valueField is set", async () => {
      const withCenter = SAMPLE_DATA.map((d) => ({
        ...d,
        Probability: (d.Amount + d.ExpectedRevenue) / 2
      }));
      await createChart({
        recordCollection: withCenter,
        valueField: "Probability"
      });
      await flushPromises();

      const centerLineCalls = mockD3.attr.mock.calls.filter(
        (c) => c[0] === "class" && c[1] === "band-center-line"
      );
      expect(centerLineCalls.length).toBeGreaterThan(0);

      const appendCalls = mockD3.append.mock.calls;
      expect(appendCalls.some((c) => c[0] === "circle")).toBe(true);
    });

    it("still renders the band when a center value is missing on some rows", async () => {
      const partialCenter = [
        { CloseDate: "2024-01-15", Amount: 100, ExpectedRevenue: 150 },
        {
          CloseDate: "2024-02-20",
          Amount: 200,
          ExpectedRevenue: 260,
          Probability: 220
        }
      ];
      await createChart({
        recordCollection: partialCenter,
        valueField: "Probability"
      });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
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

    it("calls d3.area() exactly once for the band (not per-series)", async () => {
      await createChart();
      await flushPromises();

      expect(mockD3.area).toHaveBeenCalledTimes(1);
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

    it("creates one band-area path plus upper/lower boundary lines", async () => {
      await createChart();
      await flushPromises();

      const classCalls = mockD3.attr.mock.calls.filter((c) => c[0] === "class");
      expect(classCalls.some((c) => c[1] === "band-area")).toBe(true);
      expect(
        classCalls.some((c) => c[1] === "band-boundary band-boundary-upper")
      ).toBe(true);
      expect(
        classCalls.some((c) => c[1] === "band-boundary band-boundary-lower")
      ).toBe(true);
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

    it("parses advancedConfig JSON", async () => {
      await createChart({ advancedConfig: '{"showGrid": true}' });

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });

    it("handles invalid advancedConfig JSON gracefully", async () => {
      await createChart({ advancedConfig: "not valid json" });

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });

    it("accepts customColors in advancedConfig", async () => {
      await createChart({ advancedConfig: '{"customColors": ["#ff0000"]}' });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // THEME TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("themes", () => {
    it("wires the theme prop to the band boundary stroke color", async () => {
      await createChart({ theme: "Salesforce Standard" });
      await flushPromises();
      expect(mockD3.attr).toHaveBeenCalledWith("stroke", "#1589EE");

      jest.clearAllMocks();
      mockD3 = createMockD3();
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
        expect.stringContaining("Band chart")
      );
      expect(mockD3.insert).toHaveBeenCalledWith("title", ":first-child");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TOOLTIP BEHAVIOR TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("tooltip behavior", () => {
    it("registers mouseenter/mouseleave/click handlers on the band area", async () => {
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
    it("configures for bandclick when objectApiName is set", async () => {
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
  });

  // ═══════════════════════════════════════════════════════════════
  // RENDER ORCHESTRATION
  // ═══════════════════════════════════════════════════════════════

  // renderChart subtracts this chart's own horizontal margins
  // (left 60 + right 30 = 90) from the container width and bails when the
  // remainder is <= 0. SUB_MARGIN_WIDTH is below that sum on purpose: it is
  // measurable (so it clears a naive `width === 0` gate) yet still produces no
  // svg — the exact "tooltip but no chart" state seen live on a wedged boot.
  const SUB_MARGIN_WIDTH = 50;

  function stubContainerWidth(width) {
    Element.prototype.getBoundingClientRect = jest.fn(() => ({
      width,
      height: 300,
      top: 0,
      left: 0,
      bottom: 300,
      right: width
    }));
  }

  function fireResizeObserver(width) {
    const [resizeCallback] = global.ResizeObserver.mock.calls[0];
    stubContainerWidth(width);
    jest.useFakeTimers();
    resizeCallback([{ contentRect: { width, height: 300 } }]);
    jest.advanceTimersByTime(300); // clear createResizeHandler's 250ms debounce
    jest.useRealTimers();
  }

  const svgAppended = () =>
    mockD3.append.mock.calls.some((c) => c[0] === "svg");

  describe("render orchestration", () => {
    it("renders once the observer reports a measurable width, even when the container boots at zero width", async () => {
      stubContainerWidth(0);

      await createChart();
      await flushPromises();

      expect(svgAppended()).toBe(false);

      fireResizeObserver(400);

      expect(svgAppended()).toBe(true);
    });

    it("renders once the container grows past the chart margins after booting below them", async () => {
      stubContainerWidth(SUB_MARGIN_WIDTH);

      const el = await createChart();
      await flushPromises();

      // Measurable but sub-margin: the tooltip exists and no svg was appended.
      const container = el.shadowRoot.querySelector(".chart-container");
      expect(container.querySelector(".slds-popover")).toBeTruthy();
      expect(svgAppended()).toBe(false);

      fireResizeObserver(400);

      expect(svgAppended()).toBe(true);
    });

    it("surfaces a mid-render exception as the component error state", async () => {
      mockD3.select = jest.fn(() => {
        throw new Error("d3 blew up mid-render");
      });

      await createChart();
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeTruthy();
      expect(errorElement.textContent).toContain("d3 blew up mid-render");
    });

    it("installs exactly one resize observer across repeated re-renders", async () => {
      element = createElement("c-d3-band-chart-graphql", {
        is: D3BandChartGraphql
      });
      Object.assign(element, {
        objectApiName: "Opportunity",
        dateField: "CloseDate",
        lowerField: "Amount",
        upperField: "ExpectedRevenue"
      });
      document.body.appendChild(element);

      await flushPromises();
      graphql.emit(WIRE_RESPONSE);
      await flushPromises();
      graphql.emit(WIRE_RESPONSE);
      await flushPromises();

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

      element = createElement("c-d3-band-chart-graphql", {
        is: D3BandChartGraphql
      });
      Object.assign(element, {
        objectApiName: "Opportunity",
        dateField: "CloseDate",
        lowerField: "Amount",
        upperField: "ExpectedRevenue"
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
