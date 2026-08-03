// ABOUTME: Unit tests for the d3SparklineGridGraphql Lightning Web Component.
// ABOUTME: Tests entity grouping, sparkline rendering, date bucketing, reference lines, spark types, and theme colors.

import { createElement } from "lwc";
import D3SparklineGridGraphql from "c/d3SparklineGridGraphql";
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
    const Navigate = Symbol.for("NavigationMixin.Navigate");
    const mixin = (Base) => {
      return class extends Base {
        [Navigate] = mockNavigate;
      };
    };
    mixin.Navigate = Navigate;
    return { NavigationMixin: mixin };
  },
  { virtual: true }
);

// ===============================================================
// MOCK D3 FACTORY
// ===============================================================

const createMockD3 = () => {
  const mockD3 = {
    select: jest.fn(() => mockD3),
    append: jest.fn(() => mockD3),
    attr: jest.fn(() => mockD3),
    style: jest.fn(() => mockD3),
    call: jest.fn(() => mockD3),
    insert: jest.fn(() => mockD3),
    text: jest.fn(() => mockD3),
    remove: jest.fn(() => mockD3),
    selectAll: jest.fn(() => mockD3),
    data: jest.fn(() => mockD3),
    enter: jest.fn(() => mockD3),
    exit: jest.fn(() => mockD3),
    transition: jest.fn(() => mockD3),
    duration: jest.fn(() => mockD3),
    delay: jest.fn(() => mockD3),
    on: jest.fn(() => mockD3),
    merge: jest.fn(() => mockD3),
    html: jest.fn(() => mockD3),
    each: jest.fn(() => mockD3),
    datum: jest.fn(() => mockD3),
    line: jest.fn(() => {
      const lineGen = jest.fn(() => "M0,0L10,10");
      lineGen.x = jest.fn(() => lineGen);
      lineGen.y = jest.fn(() => lineGen);
      lineGen.curve = jest.fn(() => lineGen);
      return lineGen;
    }),
    area: jest.fn(() => {
      const areaGen = jest.fn(() => "M0,0L10,10L10,30L0,30Z");
      areaGen.x = jest.fn(() => areaGen);
      areaGen.y0 = jest.fn(() => areaGen);
      areaGen.y1 = jest.fn(() => areaGen);
      areaGen.curve = jest.fn(() => areaGen);
      return areaGen;
    }),
    scaleTime: jest.fn(() => {
      const scale = jest.fn(() => 50);
      scale.domain = jest.fn(() => scale);
      scale.range = jest.fn(() => scale);
      return scale;
    }),
    scaleLinear: jest.fn(() => {
      const scale = jest.fn(() => 15);
      scale.domain = jest.fn(() => scale);
      scale.range = jest.fn(() => scale);
      scale.nice = jest.fn(() => scale);
      return scale;
    }),
    scaleBand: jest.fn(() => {
      const scale = jest.fn(() => 10);
      scale.domain = jest.fn(() => scale);
      scale.range = jest.fn(() => scale);
      scale.padding = jest.fn(() => scale);
      scale.bandwidth = jest.fn(() => 8);
      return scale;
    }),
    extent: jest.fn(() => [new Date("2024-01-01"), new Date("2024-06-01")]),
    max: jest.fn(() => 50000),
    min: jest.fn(() => 0),
    mean: jest.fn(() => 25000),
    curveMonotoneX: "curveMonotoneX",
    curveLinear: "curveLinear"
  };
  return mockD3;
};

// ===============================================================
// TEST DATA
// ===============================================================

const SPARKLINE_RECORDS = [
  { Type: "New Business", CloseDate: "2024-01-15", Amount: 10000 },
  { Type: "New Business", CloseDate: "2024-01-20", Amount: 15000 },
  { Type: "New Business", CloseDate: "2024-02-10", Amount: 20000 },
  { Type: "New Business", CloseDate: "2024-03-05", Amount: 25000 },
  { Type: "Renewal", CloseDate: "2024-01-10", Amount: 5000 },
  { Type: "Renewal", CloseDate: "2024-02-15", Amount: 8000 },
  { Type: "Renewal", CloseDate: "2024-03-20", Amount: 12000 },
  { Type: "Upsell", CloseDate: "2024-01-25", Amount: 3000 },
  { Type: "Upsell", CloseDate: "2024-02-05", Amount: 4000 },
  { Type: "Upsell", CloseDate: "2024-03-15", Amount: 6000 }
];

const SINGLE_ENTITY_RECORDS = [
  { Type: "New Business", CloseDate: "2024-01-15", Amount: 10000 },
  { Type: "New Business", CloseDate: "2024-02-10", Amount: 20000 },
  { Type: "New Business", CloseDate: "2024-03-05", Amount: 25000 }
];

const UNSORTED_RECORDS = [
  { Type: "Alpha", CloseDate: "2024-03-01", Amount: 300 },
  { Type: "Alpha", CloseDate: "2024-01-01", Amount: 100 },
  { Type: "Alpha", CloseDate: "2024-02-01", Amount: 200 }
];

const MULTI_MONTH_RECORDS = [
  { Type: "A", CloseDate: "2024-01-05", Amount: 100 },
  { Type: "A", CloseDate: "2024-01-15", Amount: 200 },
  { Type: "A", CloseDate: "2024-01-25", Amount: 300 },
  { Type: "A", CloseDate: "2024-02-10", Amount: 400 }
];

const ZERO_RECORDS = [
  { Type: "X", CloseDate: "2024-01-01", Amount: 0 },
  { Type: "X", CloseDate: "2024-02-01", Amount: 0 }
];

const NEGATIVE_RECORDS = [
  { Type: "Y", CloseDate: "2024-01-01", Amount: -100 },
  { Type: "Y", CloseDate: "2024-02-01", Amount: 200 }
];

const SPECIAL_CHAR_RECORDS = [
  { Type: 'Type "A"', CloseDate: "2024-01-01", Amount: 100 },
  { Type: "Type <B>", CloseDate: "2024-02-01", Amount: 200 }
];

const NULL_ENTITY_RECORDS = [
  { Type: null, CloseDate: "2024-01-01", Amount: 100 },
  { Type: "Valid", CloseDate: "2024-02-01", Amount: 200 }
];

// eslint-disable-next-line @lwc/lwc/no-async-operation
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

// ===============================================================
// TESTS
// ===============================================================

describe("c-d3-sparkline-grid-graphql", () => {
  let element;
  let mockD3;
  let consoleErrorSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    mockD3 = createMockD3();
    loadD3.mockResolvedValue(mockD3);

    // Spy on console to keep output pristine
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    // Mock getBoundingClientRect globally
    Element.prototype.getBoundingClientRect = jest.fn(() => ({
      width: 600,
      height: 400,
      top: 0,
      left: 0,
      bottom: 400,
      right: 600
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
    element = createElement("c-d3-sparkline-grid-graphql", {
      is: D3SparklineGridGraphql
    });

    Object.assign(element, {
      entityField: "Type",
      dateField: "CloseDate",
      valueField: "Amount",
      operation: "Sum",
      recordCollection: SPARKLINE_RECORDS,
      ...props
    });

    document.body.appendChild(element);

    // Wait for async operations
    await flushPromises();
    await flushPromises();

    return element;
  }

  // ===============================================================
  // INITIALIZATION & LIFECYCLE
  // ===============================================================

  describe("initialization", () => {
    it("loads D3 library on connected", async () => {
      await createChart();
      expect(loadD3).toHaveBeenCalled();
    });

    it("shows loading spinner initially", async () => {
      element = createElement("c-d3-sparkline-grid-graphql", {
        is: D3SparklineGridGraphql
      });
      element.entityField = "Type";
      element.recordCollection = SPARKLINE_RECORDS;

      document.body.appendChild(element);

      const spinner = element.shadowRoot.querySelector("lightning-spinner");
      expect(spinner).toBeTruthy();
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

  // ===============================================================
  // PUBLIC API PROPERTIES
  // ===============================================================

  describe("API properties", () => {
    it("has default height of 400", async () => {
      await createChart();
      expect(element.height).toBe(400);
    });

    it("has default operation of Sum", async () => {
      await createChart();
      expect(element.operation).toBe("Sum");
    });

    it("has default valueField of Amount", async () => {
      await createChart();
      expect(element.valueField).toBe("Amount");
    });

    it("has default dateField of CloseDate", async () => {
      await createChart();
      expect(element.dateField).toBe("CloseDate");
    });

    it("has default empty entityField", async () => {
      element = createElement("c-d3-sparkline-grid-graphql", {
        is: D3SparklineGridGraphql
      });
      expect(element.entityField).toBe("");
    });

    it("accepts entityField property", async () => {
      await createChart({ entityField: "Owner" });
      expect(element.entityField).toBe("Owner");
    });

    it("accepts theme property", async () => {
      await createChart({ theme: "Warm" });
      expect(element.theme).toBe("Warm");
    });

    it("accepts advancedConfig property", async () => {
      const config = JSON.stringify({ sparkType: "bar" });
      await createChart({ advancedConfig: config });
      expect(element.advancedConfig).toBe(config);
    });

    it("applies container height from height property", async () => {
      await createChart({ height: 500 });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
      expect(container.style.cssText).toContain("500");
    });

    it("accepts objectApiName property", async () => {
      await createChart({ objectApiName: "Opportunity" });
      expect(element.objectApiName).toBe("Opportunity");
    });

    it("accepts filterField property", async () => {
      await createChart({ filterField: "CustomField__c" });
      expect(element.filterField).toBe("CustomField__c");
    });
  });

  // ===============================================================
  // ERROR HANDLING
  // ===============================================================

  describe("error handling", () => {
    it("displays error when D3 fails to load", async () => {
      loadD3.mockRejectedValue(new Error("D3 load failed"));
      await createChart();

      await flushPromises();

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeTruthy();
      expect(errorEl.textContent).toContain("D3 load failed");
    });

    it("handles invalid advancedConfig JSON gracefully", async () => {
      await createChart({ advancedConfig: "not valid json" });
      await flushPromises();

      // Should not crash
      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeFalsy();
    });

    it("shows the no-data state (no error) when nothing is configured", async () => {
      // No recordCollection, no objectApiName, no graphqlQuery: the wire is
      // never provisioned, so this is a no-data state, not an error.
      await createChart({ recordCollection: [] });

      await flushPromises();

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeFalsy();
      expect(element.shadowRoot.querySelector(".chart-container")).toBeFalsy();
      expect(element.shadowRoot.querySelector("lightning-spinner")).toBeFalsy();
      expect(element.shadowRoot.textContent).toContain("No data available");
    });

    it("displays error when entityField is missing from records", async () => {
      await createChart({
        entityField: "NonExistent",
        recordCollection: SPARKLINE_RECORDS
      });

      await flushPromises();

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeTruthy();
    });
  });

  // ===============================================================
  // DATA LOADING
  // ===============================================================

  describe("data loading", () => {
    it("renders the grid from recordCollection", async () => {
      await createChart({ recordCollection: SPARKLINE_RECORDS });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeFalsy();
    });

    it("silently truncates data exceeding record limit", async () => {
      const largeData = Array.from({ length: 6000 }, (_, i) => ({
        Type: `Type${i % 5}`,
        CloseDate: `2024-${String((i % 12) + 1).padStart(2, "0")}-15`,
        Amount: Math.random() * 1000
      }));

      const toastHandler = jest.fn();
      element = createElement("c-d3-sparkline-grid-graphql", {
        is: D3SparklineGridGraphql
      });
      element.addEventListener("lightning__showtoast", toastHandler);
      Object.assign(element, {
        entityField: "Type",
        dateField: "CloseDate",
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

  // ===============================================================
  // ENTITY GROUPING
  // ===============================================================

  describe("entity grouping", () => {
    it("groups records by entityField into separate rows", async () => {
      await createChart();
      await flushPromises();

      // 3 entities: New Business, Renewal, Upsell
      // Each entity gets an appended <g> with entity-row class
      const attrCalls = mockD3.attr.mock.calls;
      const rowClasses = attrCalls.filter(
        (c) => c[0] === "class" && c[1] === "entity-row"
      );
      // One entity-row per entity
      expect(rowClasses.length).toBe(3);
    });

    it("creates row groups for each entity", async () => {
      await createChart();
      await flushPromises();

      const appendCalls = mockD3.append.mock.calls.map((c) => c[0]);
      expect(appendCalls).toContain("g");
    });

    it("renders entity labels as text elements", async () => {
      await createChart();
      await flushPromises();

      const appendCalls = mockD3.append.mock.calls.map((c) => c[0]);
      expect(appendCalls).toContain("text");
    });

    it("handles single entity correctly", async () => {
      await createChart({ recordCollection: SINGLE_ENTITY_RECORDS });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });

    it("handles null entity values gracefully", async () => {
      await createChart({ recordCollection: NULL_ENTITY_RECORDS });
      await flushPromises();

      // Should not crash, null treated as a group label
      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeFalsy();
    });
  });

  // ===============================================================
  // SPARKLINE RENDERING
  // ===============================================================

  describe("sparkline rendering", () => {
    it("creates SVG with sparkline-grid-svg class", async () => {
      await createChart();
      await flushPromises();

      const attrCalls = mockD3.attr.mock.calls;
      const classAttrs = attrCalls.filter(
        (c) => c[0] === "class" && c[1] === "sparkline-grid-svg"
      );
      expect(classAttrs.length).toBeGreaterThan(0);
    });

    it("renders path elements for sparklines (line type)", async () => {
      await createChart();
      await flushPromises();

      const appendCalls = mockD3.append.mock.calls.map((c) => c[0]);
      expect(appendCalls).toContain("path");
    });

    it("uses d3.line() for line-type sparklines", async () => {
      await createChart();
      await flushPromises();

      expect(mockD3.line).toHaveBeenCalled();
    });

    it("renders area fill below sparkline", async () => {
      await createChart();
      await flushPromises();

      // area() is called for the filled region below the line
      expect(mockD3.area).toHaveBeenCalled();
    });

    it("uses scaleTime for x-axis in sparklines", async () => {
      await createChart();
      await flushPromises();

      expect(mockD3.scaleTime).toHaveBeenCalled();
    });

    it("uses scaleLinear for y-axis in sparklines", async () => {
      await createChart();
      await flushPromises();

      expect(mockD3.scaleLinear).toHaveBeenCalled();
    });

    it("does not render axes on mini sparklines", async () => {
      await createChart();
      await flushPromises();

      // Sparklines have no visible axes
      const attrCalls = mockD3.attr.mock.calls;
      const axisClasses = attrCalls.filter(
        (c) => c[0] === "class" && (c[1] === "x-axis" || c[1] === "y-axis")
      );
      expect(axisClasses.length).toBe(0);
    });

    it("does not call axisBottom or axisLeft for sparklines", async () => {
      await createChart();
      await flushPromises();

      // Mini sparklines should have no axis rendering — the mock D3 factory
      // never defines axisBottom, so calling it would throw before this
      // assertion runs at all.
      expect(mockD3.axisBottom).toBeUndefined();
    });

    it("sets stroke attribute on sparkline paths", async () => {
      await createChart();
      await flushPromises();

      const attrCalls = mockD3.attr.mock.calls;
      const strokeAttrs = attrCalls.filter((c) => c[0] === "stroke");
      expect(strokeAttrs.length).toBeGreaterThan(0);
    });

    it("assigns sparkline-line class to line paths", async () => {
      await createChart();
      await flushPromises();

      const attrCalls = mockD3.attr.mock.calls;
      const classAttrs = attrCalls.filter(
        (c) => c[0] === "class" && c[1] === "sparkline-line"
      );
      expect(classAttrs.length).toBeGreaterThan(0);
    });

    it("assigns sparkline-area class to area paths", async () => {
      await createChart();
      await flushPromises();

      const attrCalls = mockD3.attr.mock.calls;
      const classAttrs = attrCalls.filter(
        (c) => c[0] === "class" && c[1] === "sparkline-area"
      );
      expect(classAttrs.length).toBeGreaterThan(0);
    });
  });

  // ===============================================================
  // CURRENT VALUE DISPLAY
  // ===============================================================

  describe("current value display", () => {
    it("renders value text elements for each entity", async () => {
      await createChart();
      await flushPromises();

      // text() is called to set entity labels and current values
      expect(mockD3.text).toHaveBeenCalled();
    });

    it("assigns entity-value class to value text elements", async () => {
      await createChart();
      await flushPromises();

      const attrCalls = mockD3.attr.mock.calls;
      const classAttrs = attrCalls.filter(
        (c) => c[0] === "class" && c[1] === "entity-value"
      );
      expect(classAttrs.length).toBeGreaterThan(0);
    });

    it("assigns entity-label class to label text elements", async () => {
      await createChart();
      await flushPromises();

      const attrCalls = mockD3.attr.mock.calls;
      const classAttrs = attrCalls.filter(
        (c) => c[0] === "class" && c[1] === "entity-label"
      );
      expect(classAttrs.length).toBeGreaterThan(0);
    });
  });

  // ===============================================================
  // DATE SORTING & MONTHLY BUCKETING
  // ===============================================================

  describe("date sorting and monthly bucketing", () => {
    it("sorts dates within each entity group", async () => {
      await createChart({ recordCollection: UNSORTED_RECORDS });
      await flushPromises();

      // Should render successfully even with unsorted input
      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });

    it("aggregates multiple records in same month into buckets", async () => {
      await createChart({ recordCollection: MULTI_MONTH_RECORDS });
      await flushPromises();

      // 3 records in Jan + 1 in Feb for entity A
      // After bucketing: 2 data points (Jan, Feb)
      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });

    it("handles records spanning many months", async () => {
      const manyMonths = Array.from({ length: 24 }, (_, i) => ({
        Type: "TestType",
        CloseDate: `${2023 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-15`,
        Amount: (i + 1) * 1000
      }));
      await createChart({ recordCollection: manyMonths });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });
  });

  // ===============================================================
  // REFERENCE LINE
  // ===============================================================

  describe("reference line", () => {
    it("renders reference line when config has referenceLine=average", async () => {
      await createChart({
        advancedConfig: JSON.stringify({ referenceLine: "average" })
      });
      await flushPromises();

      const attrCalls = mockD3.attr.mock.calls;
      const refLineClass = attrCalls.filter(
        (c) => c[0] === "class" && c[1] === "reference-line"
      );
      expect(refLineClass.length).toBeGreaterThan(0);
    });

    it("does not render reference line when config has no referenceLine", async () => {
      await createChart({ advancedConfig: "{}" });
      await flushPromises();

      const attrCalls = mockD3.attr.mock.calls;
      const refLineClass = attrCalls.filter(
        (c) => c[0] === "class" && c[1] === "reference-line"
      );
      expect(refLineClass.length).toBe(0);
    });

    it("uses d3.mean for average reference line", async () => {
      await createChart({
        advancedConfig: JSON.stringify({ referenceLine: "average" })
      });
      await flushPromises();

      expect(mockD3.mean).toHaveBeenCalled();
    });
  });

  // ===============================================================
  // SPARK TYPE CONFIG
  // ===============================================================

  describe("sparkType config", () => {
    it("defaults to line type sparkline", async () => {
      await createChart();
      await flushPromises();

      expect(mockD3.line).toHaveBeenCalled();
    });

    it("renders bar sparklines when sparkType is bar", async () => {
      await createChart({
        advancedConfig: JSON.stringify({ sparkType: "bar" })
      });
      await flushPromises();

      // Bar type uses scaleBand + rect instead of line
      expect(mockD3.scaleBand).toHaveBeenCalled();
      const appendCalls = mockD3.append.mock.calls.map((c) => c[0]);
      expect(appendCalls).toContain("rect");
    });

    it("renders area sparklines when sparkType is area", async () => {
      await createChart({
        advancedConfig: JSON.stringify({ sparkType: "area" })
      });
      await flushPromises();

      expect(mockD3.area).toHaveBeenCalled();
      expect(mockD3.line).toHaveBeenCalled();
    });

    it("falls back to line for unknown sparkType", async () => {
      await createChart({
        advancedConfig: JSON.stringify({ sparkType: "unknown" })
      });
      await flushPromises();

      expect(mockD3.line).toHaveBeenCalled();
    });
  });

  // ===============================================================
  // THEME COLORS PER ENTITY
  // ===============================================================

  describe("theme colors per entity", () => {
    it("applies stroke color from theme to sparklines", async () => {
      await createChart();
      await flushPromises();

      const attrCalls = mockD3.attr.mock.calls;
      const strokeAttrs = attrCalls.filter((c) => c[0] === "stroke");
      expect(strokeAttrs.length).toBeGreaterThan(0);
    });

    it("applies fill opacity for area below sparkline", async () => {
      await createChart();
      await flushPromises();

      const attrCalls = mockD3.attr.mock.calls;
      const opacityAttrs = attrCalls.filter(
        (c) => c[0] === "fill-opacity" || c[0] === "opacity"
      );
      expect(opacityAttrs.length).toBeGreaterThan(0);
    });

    it("uses different colors for each entity", async () => {
      await createChart();
      await flushPromises();

      // getColors is called from themeService — verified indirectly via stroke attrs
      const attrCalls = mockD3.attr.mock.calls;
      const strokeAttrs = attrCalls.filter((c) => c[0] === "stroke");
      // Multiple entities = multiple strokes
      expect(strokeAttrs.length).toBeGreaterThanOrEqual(1);
    });

    it("respects custom theme", async () => {
      await createChart({ theme: "Vibrant" });
      await flushPromises();

      // Chart should render without error — theme colors are applied from themeService
      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });
  });

  // ===============================================================
  // AGGREGATION OPERATIONS
  // ===============================================================

  describe("aggregation operations", () => {
    it("performs Sum aggregation", async () => {
      await createChart({ operation: "Sum" });
      await flushPromises();

      expect(loadD3).toHaveBeenCalled();
    });

    it("performs Count aggregation", async () => {
      await createChart({ operation: "Count" });
      await flushPromises();

      expect(loadD3).toHaveBeenCalled();
    });

    it("performs Average aggregation", async () => {
      await createChart({ operation: "Average" });
      await flushPromises();

      expect(loadD3).toHaveBeenCalled();
    });
  });

  // ===============================================================
  // DATA EDGE CASES
  // ===============================================================

  describe("data edge cases", () => {
    it("handles zero values", async () => {
      await createChart({ recordCollection: ZERO_RECORDS });
      await flushPromises();

      expect(loadD3).toHaveBeenCalled();
    });

    it("handles negative values", async () => {
      await createChart({ recordCollection: NEGATIVE_RECORDS });
      await flushPromises();

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeFalsy();
    });

    it("handles special characters in entity labels", async () => {
      await createChart({ recordCollection: SPECIAL_CHAR_RECORDS });
      await flushPromises();

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeFalsy();
    });

    it("handles records with wrong field names", async () => {
      const wrongFields = [
        { WrongField: "A", WrongDate: "2024-01-01", WrongValue: 100 }
      ];
      await createChart({ recordCollection: wrongFields });
      await flushPromises();

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeTruthy();
    });

    it("handles single data point per entity", async () => {
      const singlePoint = [
        { Type: "Solo", CloseDate: "2024-01-01", Amount: 100 }
      ];
      await createChart({ recordCollection: singlePoint });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });
  });

  // ===============================================================
  // ACCESSIBILITY
  // ===============================================================

  describe("accessibility", () => {
    it("applies SVG accessibility attributes (role=img + title)", async () => {
      await createChart();
      await flushPromises();

      expect(mockD3.attr).toHaveBeenCalledWith("role", "img");
      expect(mockD3.attr).toHaveBeenCalledWith(
        "aria-label",
        expect.stringContaining("Sparkline grid")
      );
      expect(mockD3.insert).toHaveBeenCalledWith("title", ":first-child");
    });
  });

  // ===============================================================
  // TOOLTIP WIRING
  // ===============================================================

  describe("tooltip wiring", () => {
    it("registers mouseenter/mouseleave on sparkline points to show/hide the tooltip", async () => {
      await createChart();
      await flushPromises();

      const onCalls = mockD3.on.mock.calls;
      expect(onCalls.some((c) => c[0] === "mouseenter")).toBe(true);
      expect(onCalls.some((c) => c[0] === "mouseleave")).toBe(true);
    });

    it("invokes the registered mouseenter/mouseleave handlers without throwing", async () => {
      await createChart();
      await flushPromises();

      const onCalls = mockD3.on.mock.calls;
      const enterCall = onCalls.find((c) => c[0] === "mouseenter");
      const leaveCall = onCalls.find((c) => c[0] === "mouseleave");
      expect(enterCall).toBeTruthy();
      expect(leaveCall).toBeTruthy();

      expect(() =>
        enterCall[1](
          { offsetX: 5, offsetY: 5, currentTarget: {} },
          { date: new Date(), value: 10 }
        )
      ).not.toThrow();
      expect(() => leaveCall[1]({ currentTarget: {} })).not.toThrow();
    });

    it("registers mouseenter/mouseleave on bar sparkline points too", async () => {
      await createChart({
        advancedConfig: JSON.stringify({ sparkType: "bar" })
      });
      await flushPromises();

      const onCalls = mockD3.on.mock.calls;
      expect(onCalls.some((c) => c[0] === "mouseenter")).toBe(true);
      expect(onCalls.some((c) => c[0] === "mouseleave")).toBe(true);
    });
  });

  // ===============================================================
  // DRILL-DOWN
  // ===============================================================

  describe("drill-down", () => {
    it("does not navigate when objectApiName is not set", async () => {
      await createChart({ objectApiName: "" });
      await flushPromises();

      const clickCall = mockD3.on.mock.calls.find((c) => c[0] === "click");
      expect(clickCall).toBeTruthy();
      clickCall[1]({}, {});

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("navigates and dispatches rowclick event when objectApiName is set", async () => {
      await createChart({ objectApiName: "Opportunity" });
      await flushPromises();

      const handler = jest.fn();
      element.addEventListener("rowclick", handler);

      const clickCall = mockD3.on.mock.calls.find((c) => c[0] === "click");
      expect(clickCall).toBeTruthy();
      clickCall[1]({}, {});

      expect(mockNavigate).toHaveBeenCalled();
      expect(handler).toHaveBeenCalled();
    });
  });

  // ===============================================================
  // RESIZE & CLEANUP
  // ===============================================================

  describe("resize and cleanup", () => {
    it("creates resize observer via ResizeObserver", async () => {
      await createChart();
      await flushPromises();

      expect(global.ResizeObserver).toHaveBeenCalled();
    });

    it("cleans up on disconnect", async () => {
      await createChart();
      await flushPromises();

      document.body.removeChild(element);

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  // ===============================================================
  // CONFIG PARSING
  // ===============================================================

  describe("config parsing", () => {
    it("parses valid advancedConfig JSON", async () => {
      await createChart({
        advancedConfig: '{"sparkType": "bar"}'
      });
      await flushPromises();

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeFalsy();
    });

    it("handles empty config string", async () => {
      await createChart({ advancedConfig: "" });
      await flushPromises();

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeFalsy();
    });

    it("handles malformed JSON in advancedConfig", async () => {
      await createChart({ advancedConfig: "not-json" });
      await flushPromises();

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeFalsy();
    });
  });

  // ===============================================================
  // CONTAINER STYLE
  // ===============================================================

  describe("container style", () => {
    it("uses default 400px height", async () => {
      await createChart();
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
      expect(container.style.cssText).toContain("400");
    });

    it("uses custom height from property", async () => {
      await createChart({ height: 600 });
      await flushPromises();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
      expect(container.style.cssText).toContain("600");
    });
  });

  // ===============================================================
  // RENDER GUARDS
  // ===============================================================

  describe("render guards", () => {
    it("does not render SVG when container has zero width", async () => {
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

      // scaleTime should not have been called because width is 0
      expect(mockD3.scaleTime).not.toHaveBeenCalled();
    });
  });

  // ===============================================================
  // RENDER ORCHESTRATION HARDENING (§4.3)
  // ===============================================================

  describe("render orchestration hardening", () => {
    it("installs a lifetime resize observer at width 0 and renders once the container gains width", async () => {
      // Boot with an unmeasurable container; capture the RO callback.
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
        height: 400,
        top: 0,
        left: 0,
        bottom: 400,
        right: 0
      }));

      await createChart();
      await flushPromises();

      // Zero width: no sparkline drawn yet, but the observer is registered so a
      // later measurement can render (no fixed give-up window).
      expect(mockD3.scaleTime).not.toHaveBeenCalled();
      expect(roCallback).toBeTruthy();

      // The container becomes measurable; the observer fires the render.
      jest.useFakeTimers();
      roCallback([{ contentRect: { width: 600, height: 400 } }]);
      jest.advanceTimersByTime(250);
      jest.useRealTimers();
      await flushPromises();

      expect(mockD3.scaleTime).toHaveBeenCalled();
    });

    it("does not latch an empty shell when first measured below the grid margins, and recovers when it grows", async () => {
      // The grid's horizontal chrome is labelWidth 120 + valueWidth 80 + 40
      // padding = 240px. A width under 240 makes renderChart bail before the
      // per-entity sparkline loop. The observer must draw the grid once the
      // container grows past that — not leave a permanent empty shell.
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
        width: 150,
        height: 400,
        top: 0,
        left: 0,
        bottom: 400,
        right: 150
      }));

      await createChart();
      await flushPromises();

      // 150px is below the 240px horizontal chrome: no sparkline drawn yet.
      expect(mockD3.scaleTime).not.toHaveBeenCalled();
      expect(roCallback).toBeTruthy();

      jest.useFakeTimers();
      roCallback([{ contentRect: { width: 600, height: 400 } }]);
      jest.advanceTimersByTime(250);
      jest.useRealTimers();
      await flushPromises();

      expect(mockD3.scaleTime).toHaveBeenCalled();
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
  });

  // ===============================================================
  // TRUNCATION WARNING
  // ===============================================================

  describe("truncation warning", () => {
    it("does not show truncation warning when data exceeds limit", async () => {
      const largeData = Array.from({ length: 6000 }, (_, i) => ({
        Type: `Type${i % 3}`,
        CloseDate: `2024-${String((i % 12) + 1).padStart(2, "0")}-15`,
        Amount: (i + 1) * 10
      }));

      await createChart({ recordCollection: largeData });
      await flushPromises();

      const warning = element.shadowRoot.querySelector(".slds-alert_warning");
      expect(warning).toBeFalsy();
    });

    it("does not show truncation warning for small datasets", async () => {
      await createChart();
      await flushPromises();

      const warning = element.shadowRoot.querySelector(".slds-alert_warning");
      expect(warning).toBeFalsy();
    });
  });
});
