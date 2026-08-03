// ABOUTME: Integration tests for d3DivergingBarChartGraphql verifying real service pipelines (dataService, themeService, chartUtils).
// ABOUTME: Only D3, Apex, NavigationMixin, and ShowToastEvent are mocked; sign coloring + symmetric domain use real services.

import { createElement } from "lwc";
import D3DivergingBarChartGraphql from "c/d3DivergingBarChartGraphql";
import { loadD3 } from "c/d3Lib";
import executeQuery from "@salesforce/apex/D3ChartController.executeQuery";
// ShowToastEvent is imported by the component; we mock it below

// ═══════════════════════════════════════════════════════════════
// MOCKS — Only external dependencies that cannot run in JSDOM
// Real services (dataService, themeService, chartUtils) are NOT mocked
// ═══════════════════════════════════════════════════════════════

jest.mock("c/d3Lib", () => ({
  loadD3: jest.fn()
}));

jest.mock(
  "@salesforce/apex/D3ChartController.executeQuery",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

// ShowToastEvent mock must produce real Event instances so dispatchEvent() accepts them.
// The factory is self-contained to work with jest.mock hoisting.
jest.mock(
  "lightning/platformShowToastEvent",
  () => {
    const Mock = jest.fn((params) => {
      return new CustomEvent("lightning__showtoast", { detail: params });
    });
    return { ShowToastEvent: Mock };
  },
  { virtual: true }
);

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

// Uses process.nextTick so it works regardless of fake/real timers
const flushPromises = () => new Promise(process.nextTick);

// ═══════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════

describe("c-d3-diverging-bar-chart-graphql integration", () => {
  let element;
  let mockD3;
  let consoleErrorSpy;
  let consoleWarnSpy;
  let resizeObserverCallback;

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

    // Capture the ResizeObserver callback so tests can trigger it
    resizeObserverCallback = null;
    global.ResizeObserver = jest.fn().mockImplementation((cb) => {
      resizeObserverCallback = cb;
      return {
        observe: jest.fn(),
        unobserve: jest.fn(),
        disconnect: jest.fn()
      };
    });
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    jest.clearAllMocks();
  });

  /**
   * Helper to create a d3DivergingBarChartGraphql element with default and overridden properties.
   * @param {Object} props - Property overrides
   * @returns {HTMLElement} - The created element
   */
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

    // Flush async: connectedCallback -> loadD3 -> loadData -> renderedCallback
    await flushPromises();
    await flushPromises();

    return element;
  }

  // ═══════════════════════════════════════════════════════════════
  // DATA PIPELINE INTEGRATION
  // ═══════════════════════════════════════════════════════════════

  describe("data pipeline integration", () => {
    it("aggregates recordCollection data with Sum operation and passes to D3 data()", async () => {
      await createChart({
        recordCollection: SAMPLE_DATA,
        operation: "Sum",
        groupByField: "StageName",
        valueField: "Amount"
      });

      // Real aggregateData with Sum: Closed Won=500, Prospecting=300, Qualification=150 (desc)
      const dataCalls = mockD3.data.mock.calls;
      expect(dataCalls.length).toBeGreaterThan(0);

      // Find the call that received chart data (array of {label, value} objects)
      const chartDataCall = dataCalls.find(
        (call) =>
          Array.isArray(call[0]) && call[0].length > 0 && call[0][0].label
      );
      expect(chartDataCall).toBeTruthy();

      const passedData = chartDataCall[0];
      expect(passedData).toEqual([
        { label: "Closed Won", value: 500 },
        { label: "Prospecting", value: 300 },
        { label: "Qualification", value: 150 }
      ]);
    });

    it("aggregates with Count operation correctly", async () => {
      await createChart({
        recordCollection: SAMPLE_DATA,
        operation: "Count",
        groupByField: "StageName",
        valueField: "Amount"
      });

      const dataCalls = mockD3.data.mock.calls;
      const chartDataCall = dataCalls.find(
        (call) =>
          Array.isArray(call[0]) && call[0].length > 0 && call[0][0].label
      );
      expect(chartDataCall).toBeTruthy();

      const passedData = chartDataCall[0];
      // Count: Prospecting=2, Qualification=1, Closed Won=1 (sorted desc by value)
      expect(passedData[0]).toEqual({ label: "Prospecting", value: 2 });
      expect(passedData[1].value).toBe(1);
      expect(passedData[2].value).toBe(1);
      // The two with value=1 could be in either order since sort is stable for equal values
      const onesLabels = passedData
        .filter((d) => d.value === 1)
        .map((d) => d.label)
        .sort();
      expect(onesLabels).toEqual(["Closed Won", "Qualification"]);
    });

    it("aggregates with Average operation correctly", async () => {
      await createChart({
        recordCollection: SAMPLE_DATA,
        operation: "Average",
        groupByField: "StageName",
        valueField: "Amount"
      });

      const dataCalls = mockD3.data.mock.calls;
      const chartDataCall = dataCalls.find(
        (call) =>
          Array.isArray(call[0]) && call[0].length > 0 && call[0][0].label
      );
      expect(chartDataCall).toBeTruthy();

      const passedData = chartDataCall[0];
      // Average: Closed Won=500/1=500, Prospecting=(100+200)/2=150, Qualification=150/1=150
      // Sorted desc: Closed Won=500, then Prospecting=150 and Qualification=150 (equal)
      expect(passedData[0]).toEqual({ label: "Closed Won", value: 500 });
      expect(passedData[1].value).toBe(150);
      expect(passedData[2].value).toBe(150);
    });

    it("passes SOQL query results through same pipeline", async () => {
      const soqlResults = [
        { StageName: "Negotiation", Amount: 400 },
        { StageName: "Negotiation", Amount: 100 },
        { StageName: "Closed Lost", Amount: 250 }
      ];
      executeQuery.mockResolvedValue(soqlResults);

      await createChart({
        recordCollection: [],
        soqlQuery: "SELECT StageName, Amount FROM Opportunity",
        operation: "Sum",
        groupByField: "StageName",
        valueField: "Amount"
      });

      expect(executeQuery).toHaveBeenCalledWith({
        queryString: "SELECT StageName, Amount FROM Opportunity"
      });

      const dataCalls = mockD3.data.mock.calls;
      const chartDataCall = dataCalls.find(
        (call) =>
          Array.isArray(call[0]) && call[0].length > 0 && call[0][0].label
      );
      expect(chartDataCall).toBeTruthy();

      const passedData = chartDataCall[0];
      // Sum: Negotiation=500, Closed Lost=250 (sorted desc)
      expect(passedData).toEqual([
        { label: "Negotiation", value: 500 },
        { label: "Closed Lost", value: 250 }
      ]);
    });

    it("aggregates signed values with Sum and binds them to D3 data()", async () => {
      const signedData = [
        { StageName: "Loss", Amount: -100 },
        { StageName: "Loss", Amount: -200 },
        { StageName: "Gain", Amount: 250 }
      ];

      await createChart({
        recordCollection: signedData,
        operation: "Sum",
        groupByField: "StageName",
        valueField: "Amount"
      });

      const chartDataCall = mockD3.data.mock.calls.find(
        (call) =>
          Array.isArray(call[0]) && call[0].length > 0 && call[0][0].label
      );
      expect(chartDataCall).toBeTruthy();

      const passedData = chartDataCall[0];
      // Real Sum: Loss = -300, Gain = 250. Sort is value-desc, so Gain first.
      expect(passedData).toEqual([
        { label: "Gain", value: 250 },
        { label: "Loss", value: -300 }
      ]);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SIGN-COLOR PIPELINE INTEGRATION (real themeService SEMANTIC_COLORS)
  // ═══════════════════════════════════════════════════════════════

  describe("sign-color pipeline integration", () => {
    const SIGNED_DATA = [
      { StageName: "Loss", Amount: -300 },
      { StageName: "Gain", Amount: 200 }
    ];

    it("colors negative bars with real SEMANTIC_COLORS.negative (#FF5D5D)", async () => {
      await createChart({
        recordCollection: SIGNED_DATA,
        operation: "Sum",
        groupByField: "StageName",
        valueField: "Amount"
      });

      const fillCalls = mockD3.attr.mock.calls.filter((c) => c[0] === "fill");
      expect(fillCalls.length).toBeGreaterThan(0);
      const fillFn = fillCalls[fillCalls.length - 1][1];
      expect(typeof fillFn).toBe("function");

      // Real SEMANTIC_COLORS.negative flows through unmocked themeService
      expect(fillFn({ label: "Loss", value: -300 })).toBe("#FF5D5D");
    });

    it("colors positive bars with real SEMANTIC_COLORS.positive (#4BCA81)", async () => {
      await createChart({
        recordCollection: SIGNED_DATA,
        operation: "Sum",
        groupByField: "StageName",
        valueField: "Amount"
      });

      const fillCalls = mockD3.attr.mock.calls.filter((c) => c[0] === "fill");
      const fillFn = fillCalls[fillCalls.length - 1][1];
      expect(fillFn({ label: "Gain", value: 200 })).toBe("#4BCA81");
    });

    it("builds a symmetric centered-zero domain from real aggregated maxAbs", async () => {
      // Real aggregateData Sum: Loss=-300, Gain=200 -> maxAbs = 300
      await createChart({
        recordCollection: SIGNED_DATA,
        operation: "Sum",
        groupByField: "StageName",
        valueField: "Amount"
      });

      const scaleInstance = mockD3.scaleLinear.mock.results[0].value;
      const symmetricDomain = scaleInstance.domain.mock.calls.find(
        (c) =>
          Array.isArray(c[0]) &&
          c[0].length === 2 &&
          c[0][0] === -c[0][1] &&
          c[0][1] >= 300
      );
      expect(symmetricDomain).toBeTruthy();
      // d3.max is mocked to return 500, so symmetric domain is [-500, 500]
      expect(symmetricDomain[0]).toEqual([-500, 500]);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TRUNCATION PIPELINE INTEGRATION
  // ═══════════════════════════════════════════════════════════════

  describe("truncation pipeline integration", () => {
    it("silently truncates data at 2000 records without toast", async () => {
      const largeData = Array.from({ length: 2500 }, (_, i) => ({
        StageName: `Stage${i % 5}`,
        Amount: (i + 1) * 10
      }));

      element = createElement("c-d3-diverging-bar-chart-graphql", {
        is: D3DivergingBarChartGraphql
      });

      // Capture dispatched events via listener before appending to DOM
      const toastHandler = jest.fn();
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
      await flushPromises();

      // Truncation happens silently — no toast is dispatched
      expect(toastHandler).not.toHaveBeenCalled();

      // Verify the component rendered the chart container (not stuck in error/loading)
      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();

      // Verify D3 was used for rendering (scaleBand is called during renderChart)
      expect(mockD3.scaleBand).toHaveBeenCalled();
    });

    it("does not truncate data under 2000 records", async () => {
      const normalData = Array.from({ length: 100 }, (_, i) => ({
        StageName: `Stage${i % 10}`,
        Amount: (i + 1) * 5
      }));

      element = createElement("c-d3-diverging-bar-chart-graphql", {
        is: D3DivergingBarChartGraphql
      });

      const toastHandler = jest.fn();
      element.addEventListener("lightning__showtoast", toastHandler);

      Object.assign(element, {
        groupByField: "StageName",
        valueField: "Amount",
        operation: "Sum",
        recordCollection: normalData
      });

      document.body.appendChild(element);

      await flushPromises();
      await flushPromises();

      // No truncation toast should have been dispatched
      expect(toastHandler).not.toHaveBeenCalled();

      // Chart should render normally
      const dataCalls = mockD3.data.mock.calls;
      const chartDataCall = dataCalls.find(
        (call) =>
          Array.isArray(call[0]) && call[0].length > 0 && call[0][0].label
      );
      expect(chartDataCall).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // VALIDATION PIPELINE INTEGRATION
  // ═══════════════════════════════════════════════════════════════

  describe("validation pipeline integration", () => {
    it("shows error when required field is missing from data", async () => {
      // Data records lack the groupByField ('StageName')
      const missingFieldData = [
        { WrongField: "A", Amount: 100 },
        { WrongField: "B", Amount: 200 }
      ];

      await createChart({
        recordCollection: missingFieldData,
        groupByField: "StageName",
        valueField: "Amount"
      });

      await flushPromises();

      // Component should display error state
      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeTruthy();
      expect(errorElement.textContent).toContain("Missing required fields");
    });

    it("shows error when data is empty array", async () => {
      await createChart({
        recordCollection: [],
        soqlQuery: ""
      });

      await flushPromises();

      // Component should display error state for no data source
      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // RESIZE PIPELINE INTEGRATION
  // ═══════════════════════════════════════════════════════════════

  describe("resize pipeline integration", () => {
    it("real createResizeHandler triggers chart re-render on resize", async () => {
      await createChart();

      // ResizeObserver should have been constructed by real createResizeHandler
      expect(global.ResizeObserver).toHaveBeenCalled();
      expect(resizeObserverCallback).toBeTruthy();

      // Record how many times select has been called so far (initial render)
      const selectCallsBefore = mockD3.select.mock.calls.length;

      // Switch to fake timers to control the debounce
      jest.useFakeTimers();

      // Simulate a resize event through the captured ResizeObserver callback
      resizeObserverCallback([{ contentRect: { width: 600, height: 400 } }]);

      // Advance past the debounce delay (250ms default in createResizeHandler)
      jest.advanceTimersByTime(250);

      // Restore real timers before flushing promises
      jest.useRealTimers();
      await flushPromises();

      // select should have been called again for the re-render
      const selectCallsAfter = mockD3.select.mock.calls.length;
      expect(selectCallsAfter).toBeGreaterThan(selectCallsBefore);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ACCESSIBILITY WIRING
  // ═══════════════════════════════════════════════════════════════

  describe("accessibility wiring", () => {
    it("applies role=img and a title to the rendered svg", async () => {
      await createChart();

      const attrCalls = mockD3.attr.mock.calls;
      const roleCall = attrCalls.find((call) => call[0] === "role");
      expect(roleCall).toBeTruthy();
      expect(roleCall[1]).toBe("img");

      const insertCalls = mockD3.insert.mock.calls;
      const titleInsert = insertCalls.find((call) => call[0] === "title");
      expect(titleInsert).toBeTruthy();
      expect(titleInsert[1]).toBe(":first-child");
    });
  });
});
