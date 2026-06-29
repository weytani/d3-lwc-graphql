// ABOUTME: End-to-end lifecycle tests for the d3GanttChart Lightning Web Component.
// ABOUTME: Verifies full pipeline: D3 load, date parsing, SVG rendering, cleanup, and multi-instance isolation.

import { createElement } from "lwc";
import D3GanttChart from "c/d3GanttChart";
import { loadD3 } from "c/d3Lib";
import executeQuery from "@salesforce/apex/D3ChartController.executeQuery";
import getDateRangeData from "@salesforce/apex/D3ChartController.getDateRangeData";

jest.mock("c/d3Lib", () => ({
  loadD3: jest.fn()
}));

jest.mock(
  "@salesforce/apex/D3ChartController.executeQuery",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

jest.mock(
  "@salesforce/apex/D3ChartController.getDateRangeData",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

jest.mock("lightning/navigation", () => {
  const Navigate = Symbol.for("Navigate");
  const GenerateUrl = Symbol.for("GenerateUrl");
  return {
    NavigationMixin: (Base) => {
      return class extends Base {
        [Navigate] = jest.fn();
        [GenerateUrl] = jest.fn();
      };
    },
    Navigate,
    GenerateUrl
  };
});

jest.mock("lightning/platformShowToastEvent", () => {
  const ShowToastEventMock = jest.fn().mockImplementation((config) => {
    return new CustomEvent("lightning__showtoast", { detail: config });
  });
  return { ShowToastEvent: ShowToastEventMock };
});

// ═══════════════════════════════════════════════════════════════
// MOCK D3 FACTORY
// ═══════════════════════════════════════════════════════════════

function createMockD3() {
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
    scaleTime: jest.fn(() => {
      const scale = jest.fn(() => 25);
      scale.domain = jest.fn(() => scale);
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
}

// ═══════════════════════════════════════════════════════════════
// GLOBAL MOCKS
// ═══════════════════════════════════════════════════════════════

Element.prototype.getBoundingClientRect = jest.fn(() => ({
  width: 600,
  height: 300,
  top: 0,
  left: 0,
  bottom: 300,
  right: 600,
  x: 0,
  y: 0
}));

global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn()
}));

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function flushPromises() {
  return new Promise((resolve) => {
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    setTimeout(resolve, 0);
  });
}

let consoleErrorSpy;

async function createChart(props = {}) {
  const element = createElement("c-d3-gantt-chart", {
    is: D3GanttChart
  });

  Object.assign(element, {
    labelField: "Name",
    startDateField: "Project_Start__c",
    endDateField: "Project_End__c",
    height: 300,
    recordCollection: [],
    ...props
  });

  document.body.appendChild(element);
  await flushPromises();
  return element;
}

// ═══════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════

describe("c-d3-gantt-chart e2e", () => {
  let mockD3;

  beforeEach(() => {
    jest.clearAllMocks();
    mockD3 = createMockD3();
    loadD3.mockResolvedValue(mockD3);
    executeQuery.mockResolvedValue([]);
    getDateRangeData.mockResolvedValue([]);

    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

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

  // ═══════════════════════════════════════════════════════════════
  // 1. FULL LIFECYCLE
  // ═══════════════════════════════════════════════════════════════

  describe("full lifecycle", () => {
    const LIFECYCLE_DATA = [
      { label: "Design", start: "2024-01-01", end: "2024-02-15" },
      { label: "Build", start: "2024-02-01", end: "2024-03-20" },
      { label: "Test", start: "2024-03-10", end: "2024-04-30" }
    ];

    it("create -> load D3 -> parse dates -> render -> verify SVG creation", async () => {
      const element = await createChart({
        recordCollection: LIFECYCLE_DATA
      });

      expect(loadD3).toHaveBeenCalled();
      expect(executeQuery).not.toHaveBeenCalled();
      expect(getDateRangeData).not.toHaveBeenCalled();

      expect(mockD3.select).toHaveBeenCalled();

      const appendCalls = mockD3.append.mock.calls;
      const svgAppended = appendCalls.some((call) => call[0] === "svg");
      expect(svgAppended).toBe(true);

      expect(mockD3.scaleTime).toHaveBeenCalled();
      expect(mockD3.data).toHaveBeenCalled();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();

      const spinner = element.shadowRoot.querySelector("lightning-spinner");
      expect(spinner).toBeFalsy();

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeFalsy();

      // Success path: no console errors leaked
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("cleanup destroys resize handler and tooltip on disconnect", async () => {
      const mockDisconnect = jest.fn();
      global.ResizeObserver = jest.fn().mockImplementation(() => ({
        observe: jest.fn(),
        unobserve: jest.fn(),
        disconnect: mockDisconnect
      }));

      const element = await createChart({
        recordCollection: LIFECYCLE_DATA
      });

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();

      document.body.removeChild(element);

      expect(mockDisconnect).toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 2. ERROR RECOVERY
  // ═══════════════════════════════════════════════════════════════

  describe("error recovery", () => {
    it("D3 load failure -> error state -> component shows error", async () => {
      loadD3.mockRejectedValue(new Error("CDN unreachable"));

      const element = await createChart({
        recordCollection: [
          { label: "Design", start: "2024-01-01", end: "2024-02-15" }
        ]
      });

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeTruthy();
      expect(errorEl.textContent).toContain("CDN unreachable");

      const spinner = element.shadowRoot.querySelector("lightning-spinner");
      expect(spinner).toBeFalsy();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeFalsy();
    });

    it("server fetch path: no recordCollection -> getDateRangeData returns data -> full pipeline", async () => {
      const serverData = [
        { label: "Discovery", start: "2024-01-01", end: "2024-01-31" },
        { label: "Proposal", start: "2024-02-01", end: "2024-02-28" }
      ];
      getDateRangeData.mockResolvedValue(serverData);

      const element = await createChart({
        recordCollection: [],
        soqlQuery: "",
        objectApiName: "Opportunity",
        labelField: "Name",
        startDateField: "Project_Start__c",
        endDateField: "Project_End__c"
      });

      expect(getDateRangeData).toHaveBeenCalledWith({
        objectName: "Opportunity",
        labelField: "Name",
        startField: "Project_Start__c",
        endField: "Project_End__c",
        filterClause: null
      });

      expect(loadD3).toHaveBeenCalled();
      expect(mockD3.select).toHaveBeenCalled();
      const appendCalls = mockD3.append.mock.calls;
      const svgAppended = appendCalls.some((call) => call[0] === "svg");
      expect(svgAppended).toBe(true);
      expect(mockD3.data).toHaveBeenCalled();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeFalsy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 3. MULTI-COMPONENT ISOLATION
  // ═══════════════════════════════════════════════════════════════

  describe("multi-component isolation", () => {
    it("two charts on same page have independent lifecycle", async () => {
      const mockDisconnectA = jest.fn();
      const mockDisconnectB = jest.fn();
      let roCallCount = 0;

      global.ResizeObserver = jest.fn().mockImplementation(() => {
        roCallCount += 1;
        const disconnectFn =
          roCallCount === 1 ? mockDisconnectA : mockDisconnectB;
        return {
          observe: jest.fn(),
          unobserve: jest.fn(),
          disconnect: disconnectFn
        };
      });

      const dataA = [
        { label: "A1", start: "2024-01-01", end: "2024-02-01" },
        { label: "A2", start: "2024-02-01", end: "2024-03-01" }
      ];
      const dataB = [
        { label: "B1", start: "2024-03-01", end: "2024-04-01" },
        { label: "B2", start: "2024-04-01", end: "2024-05-01" },
        { label: "B3", start: "2024-05-01", end: "2024-06-01" }
      ];

      const elementA = await createChart({
        recordCollection: dataA,
        theme: "Warm"
      });

      const elementB = await createChart({
        recordCollection: dataB,
        theme: "Cool"
      });

      const containerA = elementA.shadowRoot.querySelector(".chart-container");
      const containerB = elementB.shadowRoot.querySelector(".chart-container");
      expect(containerA).toBeTruthy();
      expect(containerB).toBeTruthy();

      document.body.removeChild(elementA);

      const containerBAfter =
        elementB.shadowRoot.querySelector(".chart-container");
      expect(containerBAfter).toBeTruthy();

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 4. DATA FLOW VERIFICATION
  // ═══════════════════════════════════════════════════════════════

  describe("data flow verification", () => {
    it("parsed date-range data flows through to D3 with correct values", async () => {
      const knownData = [
        { label: "Phase 1", start: "2024-01-01", end: "2024-03-01" },
        { label: "Phase 2", start: "2024-02-01", end: "2024-04-01" }
      ];

      await createChart({
        recordCollection: knownData
      });

      expect(mockD3.data).toHaveBeenCalled();

      const dataCall = mockD3.data.mock.calls.find(
        (call) =>
          Array.isArray(call[0]) &&
          call[0].length > 0 &&
          call[0][0].label !== undefined
      );

      expect(dataCall).toBeTruthy();
      const boundData = dataCall[0];

      expect(boundData).toHaveLength(2);
      expect(boundData[0].label).toBe("Phase 1");
      expect(boundData[0].start.getTime()).toBe(
        new Date("2024-01-01").getTime()
      );
      expect(boundData[1].label).toBe("Phase 2");
      expect(boundData[1].end.getTime()).toBe(new Date("2024-04-01").getTime());

      // No console errors on the success path
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("drops unparseable rows and still renders the valid ones", async () => {
      const mixed = [
        { label: "Valid", start: "2024-01-01", end: "2024-02-01" },
        { label: "Invalid", start: "", end: "" }
      ];

      const element = await createChart({
        recordCollection: mixed
      });

      const dataCall = mockD3.data.mock.calls.find(
        (call) =>
          Array.isArray(call[0]) &&
          call[0].length > 0 &&
          call[0][0].label !== undefined
      );
      expect(dataCall).toBeTruthy();
      expect(dataCall[0]).toHaveLength(1);
      expect(dataCall[0][0].label).toBe("Valid");

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
    });
  });
});
