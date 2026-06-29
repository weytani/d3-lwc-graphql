// ABOUTME: Integration tests for d3GanttChart verifying real service pipelines (chartUtils date utils, themeService).
// ABOUTME: Only D3, Apex, NavigationMixin, and ShowToastEvent are mocked; all utility services use real implementations.

import { createElement } from "lwc";
import D3GanttChart from "c/d3GanttChart";
import { loadD3 } from "c/d3Lib";
import executeQuery from "@salesforce/apex/D3ChartController.executeQuery";

jest.mock("c/d3Lib", () => ({
  loadD3: jest.fn()
}));

jest.mock(
  "@salesforce/apex/D3ChartController.executeQuery",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

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
// MOCK D3 FACTORY — captures the time-scale domain
// ═══════════════════════════════════════════════════════════════

let capturedTimeDomain;

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
    scaleTime: jest.fn(() => {
      const scale = jest.fn(() => 25);
      scale.domain = jest.fn((d) => {
        if (d !== undefined) capturedTimeDomain = d;
        return scale;
      });
      scale.range = jest.fn(() => scale);
      scale.nice = jest.fn(() => scale);
      return scale;
    }),
    scaleBand: jest.fn(() => {
      const scale = jest.fn(() => 50);
      scale.domain = jest.fn(() => scale);
      scale.range = jest.fn(() => scale);
      scale.padding = jest.fn(() => scale);
      scale.bandwidth = jest.fn(() => 40);
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
    max: jest.fn(() => 500)
  };
  return mockD3;
};

// ═══════════════════════════════════════════════════════════════
// TEST DATA
// ═══════════════════════════════════════════════════════════════

const SAMPLE_DATA = [
  { label: "Design", start: "2024-01-01", end: "2024-02-15" },
  { label: "Build", start: "2024-02-01", end: "2024-03-20" },
  { label: "Test", start: "2024-03-10", end: "2024-04-30" }
];

const flushPromises = () => new Promise(process.nextTick);

describe("c-d3-gantt-chart integration", () => {
  let element;
  let mockD3;
  let consoleErrorSpy;
  let consoleWarnSpy;
  let resizeObserverCallback;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedTimeDomain = undefined;

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

  async function createChart(props = {}) {
    element = createElement("c-d3-gantt-chart", {
      is: D3GanttChart
    });

    Object.assign(element, {
      labelField: "Name",
      startDateField: "Project_Start__c",
      endDateField: "Project_End__c",
      recordCollection: SAMPLE_DATA,
      ...props
    });

    document.body.appendChild(element);
    await flushPromises();
    await flushPromises();
    return element;
  }

  // ═══════════════════════════════════════════════════════════════
  // DATE PIPELINE INTEGRATION (real chartUtils)
  // ═══════════════════════════════════════════════════════════════

  describe("date pipeline integration", () => {
    it("parses ISO date strings into real Dates and binds them to D3 data()", async () => {
      await createChart({ recordCollection: SAMPLE_DATA });

      const dataCalls = mockD3.data.mock.calls;
      const chartDataCall = dataCalls.find(
        (call) =>
          Array.isArray(call[0]) && call[0].length > 0 && call[0][0].label
      );
      expect(chartDataCall).toBeTruthy();

      const passedData = chartDataCall[0];
      expect(passedData).toHaveLength(3);
      expect(passedData[0].label).toBe("Design");
      expect(passedData[0].start instanceof Date).toBe(true);
      expect(passedData[0].end instanceof Date).toBe(true);
      expect(passedData[0].start.getTime()).toBe(
        new Date("2024-01-01").getTime()
      );
      expect(passedData[0].end.getTime()).toBe(
        new Date("2024-02-15").getTime()
      );
    });

    it("sets the time-scale domain to the real computeDateExtent output", async () => {
      await createChart({ recordCollection: SAMPLE_DATA });

      // Real computeDateExtent over all rows: min start 2024-01-01, max end 2024-04-30
      expect(capturedTimeDomain).toBeTruthy();
      expect(capturedTimeDomain[0].getTime()).toBe(
        new Date("2024-01-01").getTime()
      );
      expect(capturedTimeDomain[1].getTime()).toBe(
        new Date("2024-04-30").getTime()
      );
    });

    it("drops rows whose dates cannot be parsed", async () => {
      const mixed = [
        { label: "Good", start: "2024-01-01", end: "2024-02-01" },
        { label: "Bad", start: "not-a-date", end: "2024-03-01" }
      ];
      await createChart({ recordCollection: mixed });

      const dataCalls = mockD3.data.mock.calls;
      const chartDataCall = dataCalls.find(
        (call) =>
          Array.isArray(call[0]) && call[0].length > 0 && call[0][0].label
      );
      expect(chartDataCall).toBeTruthy();
      const passedData = chartDataCall[0];
      expect(passedData).toHaveLength(1);
      expect(passedData[0].label).toBe("Good");
    });

    it("passes SOQL query results through the same date pipeline", async () => {
      const soqlRows = [
        {
          Name: "Phase 1",
          Project_Start__c: "2024-05-01",
          Project_End__c: "2024-06-01"
        }
      ];
      executeQuery.mockResolvedValue(soqlRows);

      await createChart({
        recordCollection: [],
        objectApiName: "",
        soqlQuery:
          "SELECT Name, Project_Start__c, Project_End__c FROM Opportunity"
      });

      expect(executeQuery).toHaveBeenCalledWith({
        queryString:
          "SELECT Name, Project_Start__c, Project_End__c FROM Opportunity"
      });

      const dataCalls = mockD3.data.mock.calls;
      const chartDataCall = dataCalls.find(
        (call) =>
          Array.isArray(call[0]) && call[0].length > 0 && call[0][0].label
      );
      expect(chartDataCall).toBeTruthy();
      const passedData = chartDataCall[0];
      expect(passedData[0].label).toBe("Phase 1");
      expect(passedData[0].start.getTime()).toBe(
        new Date("2024-05-01").getTime()
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // THEME PIPELINE INTEGRATION (real themeService)
  // ═══════════════════════════════════════════════════════════════

  describe("theme pipeline integration", () => {
    it("applies Salesforce Standard palette colors to task fills", async () => {
      await createChart({
        theme: "Salesforce Standard",
        recordCollection: SAMPLE_DATA
      });

      const attrCalls = mockD3.attr.mock.calls;
      const fillCalls = attrCalls.filter((call) => call[0] === "fill");
      expect(fillCalls.length).toBeGreaterThan(0);

      const fillFn = fillCalls[fillCalls.length - 1][1];
      expect(typeof fillFn).toBe("function");
      expect(fillFn({}, 0)).toBe("#1589EE");
    });

    it("applies Warm palette colors correctly", async () => {
      await createChart({ theme: "Warm", recordCollection: SAMPLE_DATA });

      const attrCalls = mockD3.attr.mock.calls;
      const fillCalls = attrCalls.filter((call) => call[0] === "fill");
      expect(fillCalls.length).toBeGreaterThan(0);

      const fillFn = fillCalls[fillCalls.length - 1][1];
      expect(fillFn({}, 0)).toBe("#FF6B6B");
    });

    it("uses custom colors from advancedConfig over theme", async () => {
      await createChart({
        theme: "Salesforce Standard",
        advancedConfig: '{"customColors":["#AA0000","#00AA00","#0000AA"]}',
        recordCollection: SAMPLE_DATA
      });

      const attrCalls = mockD3.attr.mock.calls;
      const fillCalls = attrCalls.filter((call) => call[0] === "fill");
      const fillFn = fillCalls[fillCalls.length - 1][1];
      expect(fillFn({}, 0)).toBe("#AA0000");
      expect(fillFn({}, 1)).toBe("#00AA00");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // RESIZE PIPELINE INTEGRATION (real createResizeHandler)
  // ═══════════════════════════════════════════════════════════════

  describe("resize pipeline integration", () => {
    it("real createResizeHandler triggers chart re-render on resize", async () => {
      await createChart();

      expect(global.ResizeObserver).toHaveBeenCalled();
      expect(resizeObserverCallback).toBeTruthy();

      const selectCallsBefore = mockD3.select.mock.calls.length;

      jest.useFakeTimers();
      resizeObserverCallback([{ contentRect: { width: 600, height: 400 } }]);
      jest.advanceTimersByTime(250);
      jest.useRealTimers();
      await flushPromises();

      const selectCallsAfter = mockD3.select.mock.calls.length;
      expect(selectCallsAfter).toBeGreaterThan(selectCallsBefore);
    });
  });
});
