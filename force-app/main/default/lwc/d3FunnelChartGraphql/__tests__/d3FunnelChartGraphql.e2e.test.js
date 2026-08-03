// ABOUTME: End-to-end lifecycle tests for the d3FunnelChartGraphql Lightning Web Component.
// ABOUTME: Verifies full pipeline: D3 load, funnel segment rendering (recordCollection and GraphQL self-fetch), resize redraw, tooltip creation, the chartRendered re-render latch, and cleanup.

import { createElement } from "lwc";
import D3FunnelChartGraphql from "c/d3FunnelChartGraphql";
import { graphql } from "lightning/graphql";
import { loadD3 } from "../d3Loader";

jest.mock("../d3Loader", () => ({
  loadD3: jest.fn()
}));

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
    insert: jest.fn(() => mockD3)
  };
  return mockD3;
}

Element.prototype.getBoundingClientRect = jest.fn(() => ({
  width: 400,
  height: 300,
  top: 0,
  left: 0,
  bottom: 300,
  right: 400,
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
  const element = createElement("c-d3-funnel-chart-graphql", {
    is: D3FunnelChartGraphql
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

describe("c-d3-funnel-chart-graphql e2e", () => {
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

    it("create -> load D3 -> load data -> render -> verify funnel segment SVG creation", async () => {
      const element = await createChart({ recordCollection: LIFECYCLE_DATA });

      expect(loadD3).toHaveBeenCalled();
      expect(mockD3.select).toHaveBeenCalled();

      const appendCalls = mockD3.append.mock.calls;
      expect(appendCalls.some((call) => call[0] === "svg")).toBe(true);
      expect(appendCalls.some((call) => call[0] === "path")).toBe(true);
      const segmentClassCalls = mockD3.attr.mock.calls.filter(
        (call) => call[0] === "class" && call[1] === "funnel-segment"
      );
      expect(segmentClassCalls.length).toBeGreaterThan(0);

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeFalsy();
    });

    it("GraphQL self-fetch: no recordCollection -> wire emits aggregate -> full pipeline renders the funnel", async () => {
      const AGGREGATE_RESPONSE = {
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
      };

      const element = await createChart({
        recordCollection: [],
        objectApiName: "Opportunity"
      });

      // No recordCollection: the GraphQL wire (structured aggregate builder)
      // is the data source. Emit the grouped-aggregate response.
      graphql.emit(AGGREGATE_RESPONSE);
      await flushPromises();
      await flushPromises();

      expect(loadD3).toHaveBeenCalled();
      expect(mockD3.select).toHaveBeenCalled();
      const appendCalls = mockD3.append.mock.calls;
      expect(appendCalls.some((call) => call[0] === "svg")).toBe(true);
      expect(appendCalls.some((call) => call[0] === "path")).toBe(true);

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
      { StageName: "Prospecting", Amount: 100 },
      { StageName: "Prospecting", Amount: 200 },
      { StageName: "Qualification", Amount: 150 },
      { StageName: "Closed Won", Amount: 500 }
    ];

    it("creates an SLDS tooltip element and populates it with the real formatted value on segment mouseenter", async () => {
      const element = await createChart({ recordCollection: LIFECYCLE_DATA });

      const tooltipEl = element.shadowRoot.querySelector(".slds-popover");
      expect(tooltipEl).toBeTruthy();
      expect(tooltipEl.style.opacity).toBe("0");

      const mouseEnterHandler = mockD3.on.mock.calls.find(
        (c) => c[0] === "mouseenter"
      );
      expect(mouseEnterHandler).toBeTruthy();
      const [, callback] = mouseEnterHandler;

      // Funnel segments bind the raw aggregated {label, value} datum directly
      // (no d3.pie/arc, no d3.stack) — sortedData is passed straight into
      // .data(sortedData), so the mouseenter datum has .label/.value present.
      callback(
        { offsetX: 10, offsetY: 20 },
        { label: "Closed Won", value: 500 }
      );

      expect(tooltipEl.style.opacity).toBe("1");
      const body = tooltipEl.querySelector(".slds-popover__body");
      expect(body).toBeTruthy();
      // showTooltip prefixes with `${operation}: ` and formatNumber(500) === "500".
      expect(body.textContent).toContain("Closed Won");
      expect(body.textContent).toContain("Sum: 500");
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
      };
      const SECOND_RESPONSE = {
        uiapi: {
          aggregate: {
            Opportunity: {
              edges: [
                {
                  node: {
                    aggregate: {
                      StageName: { value: "Discovery" },
                      Amount: { sum: { value: 700 } }
                    }
                  }
                },
                {
                  node: {
                    aggregate: {
                      StageName: { value: "Proposal" },
                      Amount: { sum: { value: 100 } }
                    }
                  }
                },
                {
                  node: {
                    aggregate: {
                      StageName: { value: "Closed Won" },
                      Amount: { sum: { value: 50 } }
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
        recordCollection: [{ StageName: "Prospecting", Amount: 100 }]
      });

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeTruthy();
      expect(errorEl.textContent).toContain("CDN unreachable");
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });
});
