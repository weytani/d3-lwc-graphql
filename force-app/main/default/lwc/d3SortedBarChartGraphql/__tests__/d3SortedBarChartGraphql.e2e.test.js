// ABOUTME: End-to-end lifecycle tests for the d3SortedBarChartGraphql Lightning Web Component.
// ABOUTME: Verifies full pipeline: D3 load, data aggregation, sorted bar rendering, resort-without-refetch, and cleanup.

import { createElement } from "lwc";
import D3SortedBarChartGraphql from "c/d3SortedBarChartGraphql";
import { loadD3 } from "../d3Loader";
import { graphql } from "lightning/graphql";

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
    selectAll: jest.fn(() => mockD3),
    data: jest.fn(() => mockD3),
    enter: jest.fn(() => mockD3),
    transition: jest.fn(() => mockD3),
    duration: jest.fn(() => mockD3),
    delay: jest.fn(() => mockD3),
    on: jest.fn(() => mockD3),
    remove: jest.fn(() => mockD3),
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
  const element = createElement("c-d3-sorted-bar-chart-graphql", {
    is: D3SortedBarChartGraphql
  });

  Object.assign(element, {
    groupByField: "StageName",
    valueField: "Amount",
    operation: "Sum",
    height: 300,
    recordCollection: [],
    ...props
  });

  document.body.appendChild(element);
  await flushPromises();
  return element;
}

describe("c-d3-sorted-bar-chart-graphql e2e", () => {
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
      { StageName: "Prospecting", Amount: 100 },
      { StageName: "Prospecting", Amount: 200 },
      { StageName: "Qualification", Amount: 150 },
      { StageName: "Closed Won", Amount: 500 }
    ];

    it("create -> load D3 -> load data -> render -> verify SVG creation", async () => {
      const element = await createChart({ recordCollection: LIFECYCLE_DATA });

      expect(loadD3).toHaveBeenCalled();
      expect(mockD3.select).toHaveBeenCalled();

      const appendCalls = mockD3.append.mock.calls;
      expect(appendCalls.some((call) => call[0] === "svg")).toBe(true);
      expect(appendCalls.some((call) => call[0] === "rect")).toBe(true);

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeFalsy();
    });

    it("re-sort after initial render redraws bars without a new load cycle", async () => {
      const element = await createChart({ recordCollection: LIFECYCLE_DATA });
      await flushPromises();

      loadD3.mockClear();
      mockD3.transition.mockClear();

      element.sortBy = "label";
      element.sortDirection = "asc";
      await flushPromises();

      expect(loadD3).not.toHaveBeenCalled();
      expect(mockD3.transition).toHaveBeenCalled();
    });

    it("GraphQL fetch path: no recordCollection -> wire emits -> full pipeline", async () => {
      const element = createElement("c-d3-sorted-bar-chart-graphql", {
        is: D3SortedBarChartGraphql
      });
      Object.assign(element, {
        groupByField: "StageName",
        valueField: "Amount",
        operation: "Sum",
        height: 300,
        objectApiName: "Opportunity",
        recordCollection: []
      });
      document.body.appendChild(element);
      await flushPromises();

      // Grouped-aggregate wire result for the structured Sum path
      graphql.emit({
        uiapi: {
          aggregate: {
            Opportunity: {
              edges: [
                {
                  node: {
                    aggregate: {
                      StageName: { value: "Discovery" },
                      Amount: { sum: { value: 500 } }
                    }
                  }
                },
                {
                  node: {
                    aggregate: {
                      StageName: { value: "Proposal" },
                      Amount: { sum: { value: 300 } }
                    }
                  }
                }
              ]
            }
          }
        }
      });
      await flushPromises();
      await flushPromises();

      expect(loadD3).toHaveBeenCalled();
      expect(mockD3.select).toHaveBeenCalled();
      const appendCalls = mockD3.append.mock.calls;
      expect(appendCalls.some((call) => call[0] === "svg")).toBe(true);
      expect(mockD3.data).toHaveBeenCalled();

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
        recordCollection: [{ StageName: "Prospecting", Amount: 100 }]
      });

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeTruthy();
      expect(errorEl.textContent).toContain("CDN unreachable");
    });
  });

  describe("multi-component isolation", () => {
    it("two charts with different sort settings have independent lifecycle", async () => {
      const dataA = [
        { StageName: "StageA1", Amount: 100 },
        { StageName: "StageA2", Amount: 200 }
      ];
      const dataB = [
        { StageName: "StageB1", Amount: 300 },
        { StageName: "StageB2", Amount: 400 }
      ];

      const elementA = await createChart({
        recordCollection: dataA,
        sortBy: "label",
        sortDirection: "asc"
      });
      const elementB = await createChart({
        recordCollection: dataB,
        sortBy: "value",
        sortDirection: "desc"
      });

      expect(elementA.sortBy).toBe("label");
      expect(elementB.sortBy).toBe("value");

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
