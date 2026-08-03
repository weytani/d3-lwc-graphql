// ABOUTME: End-to-end lifecycle tests for the d3StepChartGraphql Lightning Web Component.
// ABOUTME: Verifies full pipeline: D3 load, time series processing, step-line rendering, cleanup, and multi-instance isolation.

import { createElement } from "lwc";
import D3StepChartGraphql from "c/d3StepChartGraphql";
import { graphql } from "lightning/graphql";
import { loadD3 } from "../d3Loader";

jest.mock("../d3Loader", () => ({
  loadD3: jest.fn()
}));

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

function createMockD3() {
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
    node: jest.fn(() => ({ getTotalLength: () => 100 })),
    scaleTime: jest.fn(() => {
      const scale = jest.fn(() => 50);
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
    line: jest.fn(() => {
      const lineFn = jest.fn(() => "M0,0 L100,100");
      lineFn.x = jest.fn(() => lineFn);
      lineFn.y = jest.fn(() => lineFn);
      lineFn.curve = jest.fn(() => lineFn);
      return lineFn;
    }),
    extent: jest.fn(() => [new Date("2024-01-01"), new Date("2024-12-31")]),
    max: jest.fn(() => 500),
    min: jest.fn(() => 0),
    curveStepAfter: "curveStepAfter",
    easeLinear: (t) => t
  };
  return mockD3;
}

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

function flushPromises() {
  return new Promise((resolve) => {
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    setTimeout(resolve, 0);
  });
}

let consoleErrorSpy;

async function createChart(props = {}) {
  const element = createElement("c-d3-step-chart-graphql", {
    is: D3StepChartGraphql
  });

  Object.assign(element, {
    dateField: "CloseDate",
    valueField: "Amount",
    height: 300,
    recordCollection: [],
    ...props
  });

  document.body.appendChild(element);
  await flushPromises();
  return element;
}

describe("c-d3-step-chart-graphql e2e", () => {
  let mockD3;

  beforeEach(() => {
    jest.clearAllMocks();
    mockD3 = createMockD3();
    loadD3.mockResolvedValue(mockD3);

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

  describe("full lifecycle", () => {
    const LIFECYCLE_DATA = [
      { CloseDate: "2024-01-01", Amount: 100 },
      { CloseDate: "2024-02-01", Amount: 200 },
      { CloseDate: "2024-03-01", Amount: 150 }
    ];

    it("create -> load D3 -> load data -> render -> verify step-line SVG creation", async () => {
      const element = await createChart({ recordCollection: LIFECYCLE_DATA });

      expect(loadD3).toHaveBeenCalled();
      expect(mockD3.select).toHaveBeenCalled();

      const appendCalls = mockD3.append.mock.calls;
      expect(appendCalls.some((call) => call[0] === "svg")).toBe(true);
      expect(appendCalls.some((call) => call[0] === "path")).toBe(true);

      const lineInstance = mockD3.line.mock.results[0].value;
      expect(lineInstance.curve).toHaveBeenCalledWith("curveStepAfter");

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeFalsy();
    });

    it("GraphQL self-fetch: no recordCollection -> wire emits records -> full pipeline renders the step line", async () => {
      const RECORD_RESPONSE = {
        uiapi: {
          query: {
            Opportunity: {
              edges: [
                {
                  node: {
                    CloseDate: { value: "2024-01-01" },
                    Amount: { value: 400 }
                  }
                },
                {
                  node: {
                    CloseDate: { value: "2024-02-01" },
                    Amount: { value: 300 }
                  }
                }
              ]
            }
          }
        }
      };

      const element = await createChart({
        recordCollection: [],
        objectApiName: "Opportunity"
      });

      // No recordCollection: the GraphQL wire is the data source. Emit records.
      graphql.emit(RECORD_RESPONSE);
      await flushPromises();
      await flushPromises();

      const appendCalls = mockD3.append.mock.calls;
      expect(appendCalls.some((call) => call[0] === "svg")).toBe(true);
      expect(appendCalls.some((call) => call[0] === "path")).toBe(true);

      const lineInstance = mockD3.line.mock.results[0].value;
      expect(lineInstance.curve).toHaveBeenCalledWith("curveStepAfter");

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeFalsy();
    });

    it("cleanup destroys resize handler and tooltip on disconnect", async () => {
      const mockDisconnect = jest.fn();
      global.ResizeObserver = jest.fn().mockImplementation(() => ({
        observe: jest.fn(),
        unobserve: jest.fn(),
        disconnect: mockDisconnect
      }));

      const element = await createChart({ recordCollection: LIFECYCLE_DATA });

      document.body.removeChild(element);

      expect(mockDisconnect).toHaveBeenCalled();
    });
  });

  describe("error recovery", () => {
    it("D3 load failure -> error state -> component shows error", async () => {
      loadD3.mockRejectedValue(new Error("CDN unreachable"));

      const element = await createChart({
        recordCollection: [{ CloseDate: "2024-01-01", Amount: 100 }]
      });

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeTruthy();
      expect(errorEl.textContent).toContain("CDN unreachable");
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe("multi-component isolation", () => {
    it("two charts on same page have independent lifecycle", async () => {
      const dataA = [
        { CloseDate: "2024-01-01", Amount: 100 },
        { CloseDate: "2024-02-01", Amount: 200 }
      ];
      const dataB = [
        { CloseDate: "2024-01-01", Amount: 300 },
        { CloseDate: "2024-02-01", Amount: 400 }
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
    });
  });
});
