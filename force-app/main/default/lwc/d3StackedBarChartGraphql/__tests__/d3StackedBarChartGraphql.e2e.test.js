// ABOUTME: End-to-end lifecycle tests for the d3StackedBarChartGraphql Lightning Web Component.
// ABOUTME: Verifies full pipeline: D3 load, multi-group aggregation, stacked bar rendering, resize redraw, tooltip creation, the chartRendered re-render latch, and cleanup.

import { createElement } from "lwc";
import D3StackedBarChartGraphql from "c/d3StackedBarChartGraphql";
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
  const mockStack = jest.fn(() => []);
  mockStack.keys = jest.fn(() => mockStack);
  mockStack.value = jest.fn(() => mockStack);
  mockStack.offset = jest.fn(() => mockStack);

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
      axis.tickSize = jest.fn(() => axis);
      return axis;
    }),
    axisLeft: jest.fn(() => {
      // The vertical variant's grid lines call .tickSize() on axisLeft (Y is
      // the value axis here) -- the mirror image of the horizontal donor,
      // which calls .tickSize() on axisBottom instead. Both are supported to
      // match the real d3 axis API.
      const axis = jest.fn();
      axis.tickFormat = jest.fn(() => axis);
      axis.tickSize = jest.fn(() => axis);
      return axis;
    }),
    max: jest.fn(() => 500),
    stack: jest.fn(() => mockStack),
    stackOffsetExpand: "stackOffsetExpand"
  };
  mockD3._mockStack = mockStack;
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
  const element = createElement("c-d3-stacked-bar-chart-graphql", {
    is: D3StackedBarChartGraphql
  });

  Object.assign(element, {
    groupByField: "StageName",
    seriesField: "Type",
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

describe("c-d3-stacked-bar-chart-graphql e2e", () => {
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
      { StageName: "Prospecting", Type: "New", Amount: 100 },
      { StageName: "Prospecting", Type: "Existing", Amount: 200 },
      { StageName: "Qualification", Type: "New", Amount: 150 }
    ];

    it("create -> load D3 -> load data -> render -> verify SVG creation", async () => {
      const element = await createChart({ recordCollection: LIFECYCLE_DATA });

      expect(loadD3).toHaveBeenCalled();
      expect(mockD3.select).toHaveBeenCalled();

      const appendCalls = mockD3.append.mock.calls;
      expect(appendCalls.some((call) => call[0] === "svg")).toBe(true);
      expect(appendCalls.some((call) => call[0] === "rect")).toBe(true);

      expect(mockD3.stack).toHaveBeenCalled();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeFalsy();
    });

    it("self-fetch: no recordCollection -> GraphQL multi-group emits -> full pipeline", async () => {
      const element = createElement("c-d3-stacked-bar-chart-graphql", {
        is: D3StackedBarChartGraphql
      });
      Object.assign(element, {
        groupByField: "StageName",
        seriesField: "Type",
        valueField: "Amount",
        operation: "Sum",
        objectApiName: "Opportunity",
        recordCollection: []
      });
      document.body.appendChild(element);

      await flushPromises(); // connectedCallback (loadD3 + loadData early-return)
      graphql.emit({
        uiapi: {
          aggregate: {
            Opportunity: {
              edges: [
                {
                  node: {
                    aggregate: {
                      StageName: { value: "Discovery" },
                      Type: { value: "New" },
                      Amount: { sum: { value: 400 } }
                    }
                  }
                },
                {
                  node: {
                    aggregate: {
                      StageName: { value: "Discovery" },
                      Type: { value: "Existing" },
                      Amount: { sum: { value: 100 } }
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

      const appendCalls = mockD3.append.mock.calls;
      expect(appendCalls.some((call) => call[0] === "svg")).toBe(true);
      expect(appendCalls.some((call) => call[0] === "rect")).toBe(true);
      expect(mockD3.stack).toHaveBeenCalled();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeFalsy();
    });

    it("redraws the chart when the container is resized", async () => {
      let roCallback = null;
      global.ResizeObserver = jest.fn().mockImplementation((cb) => {
        roCallback = cb;
        return {
          observe: jest.fn(),
          unobserve: jest.fn(),
          disconnect: jest.fn()
        };
      });

      const element = await createChart({ recordCollection: LIFECYCLE_DATA });

      // The immediate warm-cache render already cleared/redrew the svg once.
      const removeCallsAfterMount = mockD3.remove.mock.calls.length;
      expect(removeCallsAfterMount).toBeGreaterThan(0);
      expect(roCallback).toBeTruthy();

      jest.useFakeTimers();
      roCallback([{ contentRect: { width: 800, height: 300 } }]);
      jest.advanceTimersByTime(250);
      jest.useRealTimers();
      await flushPromises();

      // A resize past the debounce window triggers a second full renderChart
      // pass, which clears and redraws the svg again.
      expect(mockD3.remove.mock.calls.length).toBeGreaterThan(
        removeCallsAfterMount
      );
      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
    });

    it("cleanup destroys resize handler and tooltip on disconnect", async () => {
      const mockDisconnect = jest.fn();
      global.ResizeObserver = jest.fn().mockImplementation(() => ({
        observe: jest.fn(),
        unobserve: jest.fn(),
        disconnect: mockDisconnect
      }));

      const element = await createChart({ recordCollection: LIFECYCLE_DATA });

      // createTooltip() appends a real (unmocked) DOM node into the
      // lwc:dom="manual" .chart-container, so its presence/removal is
      // observable directly through the shadow DOM.
      const tooltipBefore = element.shadowRoot.querySelector(".slds-popover");
      expect(tooltipBefore).toBeTruthy();

      document.body.removeChild(element);

      expect(mockDisconnect).toHaveBeenCalled();
      const tooltipAfter = element.shadowRoot.querySelector(".slds-popover");
      expect(tooltipAfter).toBeFalsy();
    });
  });

  describe("tooltip creation", () => {
    const LIFECYCLE_DATA = [
      { StageName: "Prospecting", Type: "New", Amount: 100 },
      { StageName: "Prospecting", Type: "Existing", Amount: 200 },
      { StageName: "Qualification", Type: "New", Amount: 150 }
    ];

    it("creates an SLDS tooltip element and populates it with the real formatted value on stack-segment mouseenter", async () => {
      const element = await createChart({ recordCollection: LIFECYCLE_DATA });

      const tooltipEl = element.shadowRoot.querySelector(".slds-popover");
      expect(tooltipEl).toBeTruthy();
      expect(tooltipEl.style.opacity).toBe("0");

      const mouseEnterHandler = mockD3.on.mock.calls.find(
        (c) => c[0] === "mouseenter"
      );
      expect(mouseEnterHandler).toBeTruthy();
      const [, callback] = mouseEnterHandler;

      // Stack-generator datum shape: d[0]=baseline, d[1]=top, d.data.label.
      callback(
        { offsetX: 10, offsetY: 20 },
        Object.assign([100, 250], { data: { label: "Prospecting" } })
      );

      expect(tooltipEl.style.opacity).toBe("1");
      const body = tooltipEl.querySelector(".slds-popover__body");
      expect(body).toBeTruthy();
      // showTooltip falls back to d[1]-d[0]=150 when d.value is absent (the
      // real stack datum shape); formatNumber(150) === "150". The operation
      // prefix defaults to "Sum" per this createChart's default props.
      expect(body.textContent).toContain("150");
      expect(body.textContent).toContain("Sum");
    });
  });

  describe("chartRendered latch", () => {
    it("resets the chartRendered latch when the GraphQL wire emits new data, forcing a full re-render", async () => {
      const FIRST_RESPONSE = {
        uiapi: {
          aggregate: {
            Opportunity: {
              edges: [
                {
                  node: {
                    aggregate: {
                      StageName: { value: "Discovery" },
                      Type: { value: "New" },
                      Amount: { sum: { value: 400 } }
                    }
                  }
                },
                {
                  node: {
                    aggregate: {
                      StageName: { value: "Discovery" },
                      Type: { value: "Existing" },
                      Amount: { sum: { value: 100 } }
                    }
                  }
                }
              ]
            }
          }
        }
      };
      const SECOND_RESPONSE = {
        uiapi: {
          aggregate: {
            Opportunity: {
              edges: [
                {
                  node: {
                    aggregate: {
                      StageName: { value: "Negotiation" },
                      Type: { value: "New" },
                      Amount: { sum: { value: 300 } }
                    }
                  }
                },
                {
                  node: {
                    aggregate: {
                      StageName: { value: "Negotiation" },
                      Type: { value: "Existing" },
                      Amount: { sum: { value: 200 } }
                    }
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

      graphql.emit(FIRST_RESPONSE);
      await flushPromises();
      await flushPromises();

      const removeCallsAfterFirstEmit = mockD3.remove.mock.calls.length;
      expect(removeCallsAfterFirstEmit).toBeGreaterThan(0);

      // wiredAggregate explicitly resets chartRendered = false on every
      // successful emission, so a second emission must drive a second full
      // renderChart pass (not a silent no-op skipped by the latch).
      graphql.emit(SECOND_RESPONSE);
      await flushPromises();
      await flushPromises();

      expect(mockD3.remove.mock.calls.length).toBeGreaterThan(
        removeCallsAfterFirstEmit
      );
      expect(element.shadowRoot.querySelector(".chart-container")).toBeTruthy();
      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeFalsy();
    });
  });

  describe("error recovery", () => {
    it("D3 load failure -> error state -> component shows error", async () => {
      loadD3.mockRejectedValue(new Error("CDN unreachable"));

      const element = await createChart({
        recordCollection: [
          { StageName: "Prospecting", Type: "New", Amount: 100 }
        ]
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
        { StageName: "StageA1", Type: "New", Amount: 100 },
        { StageName: "StageA2", Type: "Existing", Amount: 200 }
      ];
      const dataB = [
        { StageName: "StageB1", Type: "New", Amount: 300 },
        { StageName: "StageB2", Type: "Existing", Amount: 400 }
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
