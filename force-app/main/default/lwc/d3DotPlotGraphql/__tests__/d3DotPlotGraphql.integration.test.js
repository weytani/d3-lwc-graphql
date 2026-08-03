// ABOUTME: Integration tests for d3DotPlotGraphql verifying the real bundle-local pipelines (data, theme, utils, graphql).
// ABOUTME: Only D3, the GraphQL wire, NavigationMixin, and ShowToastEvent are mocked; all bundle-local modules use real implementations.

import { createElement } from "lwc";
import D3DotPlotGraphql from "c/d3DotPlotGraphql";
import { loadD3 } from "../d3Loader";
import { graphql } from "lightning/graphql";

jest.mock("../d3Loader", () => ({
  loadD3: jest.fn()
}));

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
    scalePoint: jest.fn(() => {
      const scale = jest.fn(() => 50);
      scale.domain = jest.fn(() => scale);
      scale.range = jest.fn(() => scale);
      scale.padding = jest.fn(() => scale);
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
      axis.tickSize = jest.fn(() => axis);
      return axis;
    }),
    axisLeft: jest.fn(() => {
      const axis = jest.fn();
      axis.tickFormat = jest.fn(() => axis);
      return axis;
    }),
    max: jest.fn(() => 500)
  };
  return mockD3;
};

const SAMPLE_DATA = [
  { StageName: "Prospecting", Amount: 100 },
  { StageName: "Prospecting", Amount: 200 },
  { StageName: "Qualification", Amount: 150 },
  { StageName: "Closed Won", Amount: 500 }
];

const flushPromises = () => new Promise(process.nextTick);

describe("c-d3-dot-plot-graphql integration", () => {
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
    element = createElement("c-d3-dot-plot-graphql", {
      is: D3DotPlotGraphql
    });

    Object.assign(element, {
      groupByField: "StageName",
      valueField: "Amount",
      operation: "Sum",
      recordCollection: SAMPLE_DATA,
      ...props
    });

    document.body.appendChild(element);

    await flushPromises();
    await flushPromises();

    return element;
  }

  describe("data pipeline integration", () => {
    it("aggregates recordCollection data with Sum operation and passes to D3 data()", async () => {
      await createChart({
        recordCollection: SAMPLE_DATA,
        operation: "Sum",
        groupByField: "StageName",
        valueField: "Amount"
      });

      const dataCalls = mockD3.data.mock.calls;
      const chartDataCall = dataCalls.find(
        (call) =>
          Array.isArray(call[0]) && call[0].length > 0 && call[0][0].label
      );
      expect(chartDataCall).toBeTruthy();

      expect(chartDataCall[0]).toEqual([
        { label: "Closed Won", value: 500 },
        { label: "Prospecting", value: 300 },
        { label: "Qualification", value: 150 }
      ]);
    });

    it("aggregates with Count operation correctly", async () => {
      await createChart({
        recordCollection: SAMPLE_DATA,
        operation: "Count",
        groupByField: "StageName"
      });

      const dataCalls = mockD3.data.mock.calls;
      const chartDataCall = dataCalls.find(
        (call) =>
          Array.isArray(call[0]) && call[0].length > 0 && call[0][0].label
      );
      expect(chartDataCall).toBeTruthy();
      expect(chartDataCall[0][0]).toEqual({ label: "Prospecting", value: 2 });
    });
  });

  describe("graphql wire integration", () => {
    // Builds a chart with no recordCollection so the GraphQL wire is the data
    // source, then drives it with a real wire emission.
    async function createWiredChart(props, response) {
      element = createElement("c-d3-dot-plot-graphql", {
        is: D3DotPlotGraphql
      });
      Object.assign(element, {
        objectApiName: "Opportunity",
        groupByField: "StageName",
        ...props
      });
      document.body.appendChild(element);

      await flushPromises();
      graphql.emit(response);
      await flushPromises();
      await flushPromises();

      return element;
    }

    it("counts a GraphQL record set client-side through the real aggregation pipeline", async () => {
      // Count fetches raw records and counts them with the real aggregateData:
      // two Prospecting rows and one Closed Won row.
      await createWiredChart(
        { operation: "Count" },
        {
          uiapi: {
            query: {
              Opportunity: {
                edges: [
                  { node: { StageName: { value: "Prospecting" } } },
                  { node: { StageName: { value: "Prospecting" } } },
                  { node: { StageName: { value: "Closed Won" } } }
                ]
              }
            }
          }
        }
      );

      const chartDataCall = mockD3.data.mock.calls.find(
        (call) =>
          Array.isArray(call[0]) && call[0].length > 0 && call[0][0].label
      );
      expect(chartDataCall).toBeTruthy();
      expect(chartDataCall[0]).toEqual([
        { label: "Prospecting", value: 2 },
        { label: "Closed Won", value: 1 }
      ]);
    });

    it("sums a free-text graphqlQuery record set through the real aggregation pipeline", async () => {
      // The free-text rows arrive un-summed; the real aggregateData sums the
      // duplicate Prospecting keys to 300 and sorts by value descending.
      await createWiredChart(
        {
          graphqlQuery:
            "query { uiapi { query { Opportunity { edges { node { StageName { value } Amount { value } } } } } } }",
          valueField: "Amount",
          operation: "Sum"
        },
        {
          uiapi: {
            query: {
              Opportunity: {
                edges: [
                  {
                    node: {
                      StageName: { value: "Prospecting" },
                      Amount: { value: 100 }
                    }
                  },
                  {
                    node: {
                      StageName: { value: "Prospecting" },
                      Amount: { value: 200 }
                    }
                  },
                  {
                    node: {
                      StageName: { value: "Closed Won" },
                      Amount: { value: 500 }
                    }
                  }
                ]
              }
            }
          }
        }
      );

      const chartDataCall = mockD3.data.mock.calls.find(
        (call) =>
          Array.isArray(call[0]) && call[0].length > 0 && call[0][0].label
      );
      expect(chartDataCall).toBeTruthy();
      expect(chartDataCall[0]).toEqual([
        { label: "Closed Won", value: 500 },
        { label: "Prospecting", value: 300 }
      ]);
    });
  });

  describe("theme pipeline integration", () => {
    it("applies Salesforce Standard palette colors to dot fills", async () => {
      await createChart({
        theme: "Salesforce Standard",
        recordCollection: SAMPLE_DATA,
        operation: "Sum"
      });

      const attrCalls = mockD3.attr.mock.calls;
      const fillCalls = attrCalls.filter((call) => call[0] === "fill");
      expect(fillCalls.length).toBeGreaterThan(0);

      const fillFn = fillCalls.find((c) => typeof c[1] === "function")[1];
      expect(fillFn({}, 0)).toBe("#1589EE");
      expect(fillFn({}, 1)).toBe("#FF9E2C");
    });

    it("applies Warm palette colors correctly", async () => {
      await createChart({
        theme: "Warm",
        recordCollection: SAMPLE_DATA,
        operation: "Sum"
      });

      const attrCalls = mockD3.attr.mock.calls;
      const fillFn = attrCalls.find(
        (c) => c[0] === "fill" && typeof c[1] === "function"
      )[1];
      expect(fillFn({}, 0)).toBe("#FF6B6B");
    });

    it("uses custom colors from advancedConfig over theme", async () => {
      await createChart({
        theme: "Salesforce Standard",
        advancedConfig: '{"customColors":["#AA0000","#00AA00","#0000AA"]}',
        recordCollection: SAMPLE_DATA,
        operation: "Sum"
      });

      const attrCalls = mockD3.attr.mock.calls;
      const fillFn = attrCalls.find(
        (c) => c[0] === "fill" && typeof c[1] === "function"
      )[1];
      expect(fillFn({}, 0)).toBe("#AA0000");
    });
  });

  describe("truncation pipeline integration", () => {
    it("silently truncates data at 2000 records without toast", async () => {
      const largeData = Array.from({ length: 2500 }, (_, i) => ({
        StageName: `Stage${i % 5}`,
        Amount: (i + 1) * 10
      }));

      element = createElement("c-d3-dot-plot-graphql", {
        is: D3DotPlotGraphql
      });
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

      expect(toastHandler).not.toHaveBeenCalled();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
      expect(mockD3.scalePoint).toHaveBeenCalled();
    });
  });

  describe("validation pipeline integration", () => {
    it("shows error when required field is missing from data", async () => {
      const missingFieldData = [
        { WrongField: "A", Amount: 100 },
        { WrongField: "B", Amount: 200 }
      ];

      await createChart({
        recordCollection: missingFieldData,
        groupByField: "StageName",
        valueField: "Amount"
      });

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeTruthy();
      expect(errorElement.textContent).toContain("Missing required fields");
    });
  });

  describe("resize pipeline integration", () => {
    it("real createResizeHandler triggers chart re-render on resize", async () => {
      let resizeObserverCallback = null;
      global.ResizeObserver = jest.fn().mockImplementation((cb) => {
        resizeObserverCallback = cb;
        return {
          observe: jest.fn(),
          unobserve: jest.fn(),
          disconnect: jest.fn()
        };
      });

      await createChart();

      expect(global.ResizeObserver).toHaveBeenCalled();
      expect(resizeObserverCallback).toBeTruthy();

      const selectCallsBefore = mockD3.select.mock.calls.length;

      jest.useFakeTimers();
      resizeObserverCallback([{ contentRect: { width: 600, height: 400 } }]);
      jest.advanceTimersByTime(250);
      jest.useRealTimers();
      await flushPromises();

      expect(mockD3.select.mock.calls.length).toBeGreaterThan(
        selectCallsBefore
      );
    });
  });

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
