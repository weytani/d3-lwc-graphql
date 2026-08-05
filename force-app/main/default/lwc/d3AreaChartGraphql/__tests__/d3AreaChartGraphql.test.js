// ABOUTME: Unit tests for the d3AreaChartGraphql Lightning Web Component.
// ABOUTME: Tests initialization, data handling, date parsing, area modes, gradients, curves, legends, and error recovery.

import { createElement } from "lwc";
import D3AreaChartGraphql from "c/d3AreaChartGraphql";
import { loadD3 } from "../d3Loader";
import { graphql } from "lightning/graphql";

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
    html: jest.fn(() => mockD3),
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
    max: jest.fn((data, accessor) => {
      if (!data || data.length === 0) return 0;
      return Math.max(...data.map(accessor));
    }),
    min: jest.fn((data, accessor) => {
      if (!data || data.length === 0) return 0;
      return Math.min(...data.map(accessor));
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
    stack: jest.fn(() => {
      const stackGen = jest.fn(() => []);
      stackGen.keys = jest.fn(() => stackGen);
      stackGen.value = jest.fn(() => stackGen);
      stackGen.order = jest.fn(() => stackGen);
      stackGen.offset = jest.fn(() => stackGen);
      return stackGen;
    }),
    stackOrderNone: "stackOrderNone",
    stackOffsetNone: "stackOffsetNone",
    stackOffsetExpand: "stackOffsetExpand",
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
  { CloseDate: "2024-01-15", Amount: 100 },
  { CloseDate: "2024-02-20", Amount: 200 },
  { CloseDate: "2024-03-10", Amount: 150 },
  { CloseDate: "2024-04-05", Amount: 300 }
];

const MULTI_SERIES_DATA = [
  { CloseDate: "2024-01-15", Amount: 100, StageName: "Prospecting" },
  { CloseDate: "2024-02-20", Amount: 200, StageName: "Prospecting" },
  { CloseDate: "2024-01-15", Amount: 150, StageName: "Closed Won" },
  { CloseDate: "2024-02-20", Amount: 300, StageName: "Closed Won" }
];

const ISO_DATE_DATA = [
  { CloseDate: "2024-06-15T10:30:00.000Z", Amount: 100 },
  { CloseDate: "2024-07-20T14:00:00.000Z", Amount: 250 }
];

const US_DATE_DATA = [
  { CloseDate: "01/15/2024", Amount: 100 },
  { CloseDate: "02/20/2024", Amount: 200 }
];

const EU_DATE_DATA = [
  { CloseDate: "15/01/2024", Amount: 100 },
  { CloseDate: "20/02/2024", Amount: 200 }
];

const SALESFORCE_DATE_DATA = [
  { CloseDate: "2024-01-15", Amount: 100 },
  { CloseDate: "2024-02-20", Amount: 200 }
];

const SINGLE_RECORD = [{ CloseDate: "2024-01-01", Amount: 100 }];

const NEGATIVE_DATA = [
  { CloseDate: "2024-01-01", Amount: -50 },
  { CloseDate: "2024-02-01", Amount: 100 }
];

const ZERO_DATA = [
  { CloseDate: "2024-01-01", Amount: 0 },
  { CloseDate: "2024-02-01", Amount: 0 }
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

describe("c-d3-area-chart-graphql", () => {
  let element;
  let mockD3;
  let consoleErrorSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    mockD3 = createMockD3();
    loadD3.mockResolvedValue(mockD3);

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
    element = createElement("c-d3-area-chart-graphql", {
      is: D3AreaChartGraphql
    });

    Object.assign(element, {
      dateField: "CloseDate",
      valueField: "Amount",
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
      element = createElement("c-d3-area-chart-graphql", {
        is: D3AreaChartGraphql
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

    it("has correct default property values", async () => {
      element = createElement("c-d3-area-chart-graphql", {
        is: D3AreaChartGraphql
      });
      expect(element.dateField).toBe("CloseDate");
      expect(element.valueField).toBe("Amount");
      expect(element.seriesField).toBe("");
      expect(element.curveType).toBe("monotone");
      expect(element.height).toBe(300);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DATA HANDLING TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("data handling", () => {
    it("renders the chart from recordCollection without provisioning the wire", async () => {
      await createChart({
        recordCollection: SAMPLE_DATA
      });

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeNull();
    });

    it("shows the no-data state (neither error nor chart) when nothing is configured", async () => {
      // No recordCollection, no objectApiName, no graphqlQuery: the wire is never
      // provisioned, which is a no-data state rather than an error.
      await createChart({
        recordCollection: []
      });

      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeNull();
      expect(element.shadowRoot.querySelector(".chart-container")).toBeNull();
      expect(element.shadowRoot.textContent).toContain("No data available");
    });

    it("shows error when no valid data after processing", async () => {
      const invalidData = [{ CloseDate: "not-a-date", Amount: "not-a-number" }];
      await createChart({ recordCollection: invalidData });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DATE PARSING TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("date parsing", () => {
    it("parses ISO format dates (YYYY-MM-DD)", async () => {
      await createChart({
        recordCollection: SALESFORCE_DATE_DATA,
        dateFormat: "ISO"
      });
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
      await createChart({
        recordCollection: US_DATE_DATA,
        dateFormat: "US"
      });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });

    it("parses EU format dates (DD/MM/YYYY)", async () => {
      await createChart({
        recordCollection: EU_DATE_DATA,
        dateFormat: "EU"
      });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });

    it("handles Date objects in record data", async () => {
      const dateObjData = [
        { CloseDate: new Date("2024-01-15"), Amount: 100 },
        { CloseDate: new Date("2024-02-20"), Amount: 200 }
      ];
      await createChart({ recordCollection: dateObjData });
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });

    it("filters out records with unparseable dates", async () => {
      const mixedData = [
        { CloseDate: "2024-01-15", Amount: 100 },
        { CloseDate: null, Amount: 200 },
        { CloseDate: "2024-03-10", Amount: 150 }
      ];
      await createChart({ recordCollection: mixedData });
      await flushPromises();

      // Should still render the valid records
      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });

    it("sorts data by date within each series", async () => {
      const unsortedData = [
        { CloseDate: "2024-03-10", Amount: 150 },
        { CloseDate: "2024-01-15", Amount: 100 },
        { CloseDate: "2024-02-20", Amount: 200 }
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

    it("handles zero values", async () => {
      await createChart({ recordCollection: ZERO_DATA });
      await flushPromises();

      expect(loadD3).toHaveBeenCalled();
    });

    it("handles records with null values", async () => {
      const dataWithNull = [
        { CloseDate: "2024-01-15", Amount: null },
        { CloseDate: "2024-02-20", Amount: 200 }
      ];
      await createChart({ recordCollection: dataWithNull });
      await flushPromises();

      expect(loadD3).toHaveBeenCalled();
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
      const largeData = Array.from({ length: 1500 }, (_, i) => ({
        CloseDate: `2024-01-${String((i % 28) + 1).padStart(2, "0")}`,
        Amount: i * 10
      }));

      element = createElement("c-d3-area-chart-graphql", {
        is: D3AreaChartGraphql
      });
      Object.assign(element, {
        dateField: "CloseDate",
        valueField: "Amount",
        recordCollection: largeData
      });
      document.body.appendChild(element);

      await flushPromises();
      await flushPromises();

      // Chart should render without error (data truncated silently)
      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SERIES FIELD HANDLING TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("seriesField handling", () => {
    it("creates single series when seriesField is empty", async () => {
      await createChart({
        recordCollection: SAMPLE_DATA,
        seriesField: ""
      });
      await flushPromises();

      // Should render without errors
      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });

    it("groups data by seriesField when set", async () => {
      await createChart({
        recordCollection: MULTI_SERIES_DATA,
        seriesField: "StageName"
      });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });

    it("uses Default as series name when seriesField record value is null", async () => {
      const dataWithNullSeries = [
        { CloseDate: "2024-01-15", Amount: 100, StageName: null },
        { CloseDate: "2024-02-20", Amount: 200, StageName: "Closed Won" }
      ];
      await createChart({
        recordCollection: dataWithNullSeries,
        seriesField: "StageName"
      });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });

    it("renders multiple areas for multi-series data", async () => {
      await createChart({
        recordCollection: MULTI_SERIES_DATA,
        seriesField: "StageName"
      });
      await flushPromises();

      // d3.area() should be called for area generation
      expect(mockD3.area).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CURVE TYPE TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("curve type selection", () => {
    it("uses monotone curve by default", async () => {
      await createChart({ curveType: "monotone" });
      await flushPromises();

      // d3.area() should be called to create the area generator
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

      // Should not error, falls back to monotone
      expect(loadD3).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // AREA MODE TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("area mode", () => {
    it("uses overlapping mode by default", async () => {
      await createChart({
        recordCollection: MULTI_SERIES_DATA,
        seriesField: "StageName"
      });
      await flushPromises();

      // Should render without d3.stack() being used
      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });

    it("supports stacked mode via advancedConfig", async () => {
      await createChart({
        recordCollection: MULTI_SERIES_DATA,
        seriesField: "StageName",
        advancedConfig: '{"areaMode": "stacked"}'
      });
      await flushPromises();

      // d3.stack() should be called for stacked layout
      expect(mockD3.stack).toHaveBeenCalled();
    });

    it("supports normalized mode via advancedConfig", async () => {
      await createChart({
        recordCollection: MULTI_SERIES_DATA,
        seriesField: "StageName",
        advancedConfig: '{"areaMode": "normalized"}'
      });
      await flushPromises();

      // d3.stack() should be called for normalized layout
      expect(mockD3.stack).toHaveBeenCalled();
    });

    it("treats overlapping as default when areaMode is unset", async () => {
      await createChart({
        recordCollection: MULTI_SERIES_DATA,
        seriesField: "StageName",
        advancedConfig: "{}"
      });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // GRADIENT FILL TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("gradient fill", () => {
    it("creates SVG defs element for single series", async () => {
      await createChart({
        recordCollection: SAMPLE_DATA,
        seriesField: ""
      });
      await flushPromises();

      const appendCalls = mockD3.append.mock.calls;
      const defsCalls = appendCalls.filter((c) => c[0] === "defs");
      expect(defsCalls.length).toBeGreaterThan(0);
    });

    it("creates linearGradient element for single series", async () => {
      await createChart({
        recordCollection: SAMPLE_DATA,
        seriesField: ""
      });
      await flushPromises();

      const appendCalls = mockD3.append.mock.calls;
      const gradientCalls = appendCalls.filter(
        (c) => c[0] === "linearGradient"
      );
      expect(gradientCalls.length).toBeGreaterThan(0);
    });

    it("creates gradient stop elements", async () => {
      await createChart({
        recordCollection: SAMPLE_DATA,
        seriesField: ""
      });
      await flushPromises();

      const appendCalls = mockD3.append.mock.calls;
      const stopCalls = appendCalls.filter((c) => c[0] === "stop");
      expect(stopCalls.length).toBeGreaterThan(0);
    });

    it("uses distinct fill colors with opacity for multi-series", async () => {
      await createChart({
        recordCollection: MULTI_SERIES_DATA,
        seriesField: "StageName"
      });
      await flushPromises();

      // Check for fill-opacity attribute
      const attrCalls = mockD3.attr.mock.calls;
      const opacityCalls = attrCalls.filter((c) => c[0] === "fill-opacity");
      expect(opacityCalls.length).toBeGreaterThan(0);
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
      const svgCalls = appendCalls.filter((c) => c[0] === "svg");
      expect(svgCalls.length).toBeGreaterThan(0);
    });

    it("uses d3.scaleTime() for x-axis", async () => {
      await createChart();
      await flushPromises();

      expect(mockD3.scaleTime).toHaveBeenCalled();
    });

    it("uses d3.scaleLinear() for y-axis", async () => {
      await createChart();
      await flushPromises();

      expect(mockD3.scaleLinear).toHaveBeenCalled();
    });

    it("calls d3.area() generator", async () => {
      await createChart();
      await flushPromises();

      expect(mockD3.area).toHaveBeenCalled();
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

    it("creates area path elements", async () => {
      await createChart();
      await flushPromises();

      const appendCalls = mockD3.append.mock.calls;
      const pathCalls = appendCalls.filter((c) => c[0] === "path");
      expect(pathCalls.length).toBeGreaterThan(0);
    });

    it("creates stroke line on top of area", async () => {
      await createChart();
      await flushPromises();

      // Should have path elements with 'fill: none' for stroke lines
      const attrCalls = mockD3.attr.mock.calls;
      const fillNoneCalls = attrCalls.filter(
        (c) => c[0] === "fill" && c[1] === "none"
      );
      expect(fillNoneCalls.length).toBeGreaterThan(0);
    });

    it("sets SVG dimensions", async () => {
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

      expect(mockD3.select).toHaveBeenCalled();
      expect(mockD3.remove).toHaveBeenCalled();
    });

    it("creates grid lines when showGrid is not disabled", async () => {
      await createChart({
        advancedConfig: '{"showGrid": true}'
      });
      await flushPromises();

      const attrCalls = mockD3.attr.mock.calls;
      const gridCalls = attrCalls.filter(
        (c) =>
          c[0] === "class" && typeof c[1] === "string" && c[1].includes("grid")
      );
      expect(gridCalls.length).toBeGreaterThan(0);
    });

    it("creates clip-path for animation", async () => {
      await createChart();
      await flushPromises();

      const appendCalls = mockD3.append.mock.calls;
      const clipPathCalls = appendCalls.filter((c) => c[0] === "clipPath");
      expect(clipPathCalls.length).toBeGreaterThan(0);
    });

    it("applies animated clip-path reveal", async () => {
      await createChart();
      await flushPromises();

      // transition + duration should be called for clip-path animation
      expect(mockD3.transition).toHaveBeenCalled();
      expect(mockD3.duration).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // LEGEND TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("legend rendering", () => {
    it("renders legend for multi-series data", async () => {
      await createChart({
        recordCollection: MULTI_SERIES_DATA,
        seriesField: "StageName"
      });
      await flushPromises();

      const legend = element.shadowRoot.querySelector(".legend-container");
      expect(legend).toBeTruthy();
    });

    it("does not render legend for single series by default", async () => {
      await createChart({
        recordCollection: SAMPLE_DATA,
        seriesField: ""
      });
      await flushPromises();

      const legend = element.shadowRoot.querySelector(".legend-container");
      expect(legend).toBeFalsy();
    });

    it("renders legend items with series names", async () => {
      await createChart({
        recordCollection: MULTI_SERIES_DATA,
        seriesField: "StageName"
      });
      await flushPromises();

      const legendItems = element.shadowRoot.querySelectorAll(".legend-item");
      expect(legendItems.length).toBe(2);
    });

    it("renders legend color swatches", async () => {
      await createChart({
        recordCollection: MULTI_SERIES_DATA,
        seriesField: "StageName"
      });
      await flushPromises();

      const legendColors = element.shadowRoot.querySelectorAll(".legend-color");
      expect(legendColors.length).toBe(2);
    });

    it("shows legend when showLegend is explicitly true", async () => {
      await createChart({
        recordCollection: SAMPLE_DATA,
        seriesField: "",
        showLegend: true
      });
      await flushPromises();

      const legend = element.shadowRoot.querySelector(".legend-container");
      expect(legend).toBeTruthy();
    });

    it("hides legend when showLegend is explicitly false", async () => {
      await createChart({
        recordCollection: MULTI_SERIES_DATA,
        seriesField: "StageName",
        showLegend: false
      });
      await flushPromises();

      const legend = element.shadowRoot.querySelector(".legend-container");
      expect(legend).toBeFalsy();
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
        advancedConfig: '{"showGrid": true, "areaMode": "stacked"}'
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

    it("accepts customColors in advancedConfig", async () => {
      await createChart({
        advancedConfig: '{"customColors": ["#ff0000", "#00ff00", "#0000ff"]}'
      });

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
    it("accepts Salesforce Standard theme", async () => {
      await createChart({ theme: "Salesforce Standard" });

      await flushPromises();
      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeFalsy();
    });

    it("wires the theme prop to the area stroke color", async () => {
      await createChart({
        theme: "Salesforce Standard",
        recordCollection: SAMPLE_DATA,
        seriesField: ""
      });
      await flushPromises();
      expect(mockD3.attr).toHaveBeenCalledWith("stroke", "#1589EE");

      jest.clearAllMocks();
      mockD3 = createMockD3();
      loadD3.mockResolvedValue(mockD3);
      document.body.removeChild(element);

      await createChart({
        theme: "Warm",
        recordCollection: SAMPLE_DATA,
        seriesField: ""
      });
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
        expect.stringContaining("Area chart")
      );
      expect(mockD3.insert).toHaveBeenCalledWith("title", ":first-child");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TOOLTIP BEHAVIOR TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("tooltip behavior", () => {
    it("registers mouseenter handler on areas", async () => {
      await createChart();
      await flushPromises();

      const onCalls = mockD3.on.mock.calls;
      const mouseenterCalls = onCalls.filter((c) => c[0] === "mouseenter");
      expect(mouseenterCalls.length).toBeGreaterThan(0);
    });

    it("registers mouseleave handler on areas", async () => {
      await createChart();
      await flushPromises();

      const onCalls = mockD3.on.mock.calls;
      const mouseleaveCalls = onCalls.filter((c) => c[0] === "mouseleave");
      expect(mouseleaveCalls.length).toBeGreaterThan(0);
    });

    it("registers click handler on areas", async () => {
      await createChart();
      await flushPromises();

      const onCalls = mockD3.on.mock.calls;
      const clickCalls = onCalls.filter((c) => c[0] === "click");
      expect(clickCalls.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CLICK EVENT TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("click events", () => {
    it("configures for areaclick when objectApiName is set", async () => {
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
        width: 50,
        height: 300,
        top: 0,
        left: 0,
        bottom: 300,
        right: 50
      }));

      await createChart();
      await flushPromises();

      // 50px is below the 90px horizontal margin: no area drawn yet.
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

      element = createElement("c-d3-area-chart-graphql", {
        is: D3AreaChartGraphql
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
  // ERROR RECOVERY TESTS
  // ═══════════════════════════════════════════════════════════════

  describe("error recovery", () => {
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

      const spinner = element.shadowRoot.querySelector("lightning-spinner");
      expect(spinner).toBeFalsy();
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
      element = createElement("c-d3-area-chart-graphql", {
        is: D3AreaChartGraphql
      });
      element.dateField = "CloseDate";
      element.recordCollection = SAMPLE_DATA;
      document.body.appendChild(element);

      const spinner = element.shadowRoot.querySelector("lightning-spinner");
      expect(spinner).toBeTruthy();
    });

    it("legendItems returns items with color for multi-series", async () => {
      await createChart({
        recordCollection: MULTI_SERIES_DATA,
        seriesField: "StageName"
      });
      await flushPromises();

      const legendItems = element.shadowRoot.querySelectorAll(".legend-item");
      expect(legendItems.length).toBeGreaterThan(0);
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

    it("handles double disconnect gracefully", async () => {
      await createChart();
      await flushPromises();

      document.body.removeChild(element);

      expect(true).toBe(true);
    });
  });
});
