// ABOUTME: End-to-end lifecycle tests for the d3AreaChartGraphql Lightning Web Component.
// ABOUTME: Verifies full pipeline: D3 load, time series processing (recordCollection and GraphQL self-fetch), gradient/stacked area rendering, cleanup, and multi-instance isolation.

import { createElement } from "lwc";
import D3AreaChartGraphql from "c/d3AreaChartGraphql";
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
      // Minimal but real-computing d3.stack() stand-in: builds one layer per
      // key with [0, value] tuples, so renderStackedAreas actually iterates
      // non-empty layers and appends real path elements (a blind `() => []`
      // stub would silently skip every stacked/normalized area path).
      let keys = [];
      const stackGen = jest.fn((data) =>
        keys.map((key) => {
          const layer = (data || []).map((row) => [0, row[key] || 0]);
          layer.key = key;
          return layer;
        })
      );
      stackGen.keys = jest.fn((k) => {
        keys = k;
        return stackGen;
      });
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

// Counts <path class="area-path"> elements from the mockD3.attr call log —
// mirrors the countAreaPaths() helper in d3AreaChartGraphql.graphql.test.js, adapted
// to this file's per-method jest.fn() mock (rather than a unified call log).
function countAreaPaths(attrCalls) {
  return attrCalls.filter(
    (call) => call[0] === "class" && call[1] === "area-path"
  ).length;
}

let consoleErrorSpy;

async function createChart(props = {}) {
  const element = createElement("c-d3-area-chart-graphql", {
    is: D3AreaChartGraphql
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

describe("c-d3-area-chart-graphql e2e", () => {
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

    const MULTI_SERIES_DATA = [
      { CloseDate: "2024-01-15", Amount: 100, StageName: "Prospecting" },
      { CloseDate: "2024-02-20", Amount: 200, StageName: "Prospecting" },
      { CloseDate: "2024-01-15", Amount: 150, StageName: "Closed Won" },
      { CloseDate: "2024-02-20", Amount: 300, StageName: "Closed Won" }
    ];

    it("create -> load D3 -> load data -> render -> verify gradient area SVG creation", async () => {
      const element = await createChart({ recordCollection: LIFECYCLE_DATA });

      expect(loadD3).toHaveBeenCalled();
      expect(mockD3.select).toHaveBeenCalled();

      const appendCalls = mockD3.append.mock.calls;
      expect(appendCalls.some((call) => call[0] === "svg")).toBe(true);
      expect(appendCalls.some((call) => call[0] === "path")).toBe(true);
      // Single series: renderOverlappingAreas builds a gradient fill.
      expect(appendCalls.some((call) => call[0] === "linearGradient")).toBe(
        true
      );
      expect(appendCalls.some((call) => call[0] === "stop")).toBe(true);

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeFalsy();
    });

    it("GraphQL self-fetch: no recordCollection -> wire emits records -> full pipeline renders the area", async () => {
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

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeFalsy();
    });

    it("multi-series recordCollection with stacked advancedConfig -> renders stacked area paths without a gradient", async () => {
      const element = await createChart({
        recordCollection: MULTI_SERIES_DATA,
        seriesField: "StageName",
        advancedConfig: '{"areaMode": "stacked"}'
      });

      expect(mockD3.stack).toHaveBeenCalled();

      const appendCalls = mockD3.append.mock.calls;
      // Stacked mode renders one <path class="area-path"> per stacked layer;
      // with 2 series (Prospecting, Closed Won) that's exactly 2 layers, so
      // this is strictly stronger than merely checking some path appended.
      expect(countAreaPaths(mockD3.attr.mock.calls)).toBe(2);
      // Stacked mode renders via renderStackedAreas, which never builds a
      // gradient (that is overlapping single-series only).
      expect(appendCalls.some((call) => call[0] === "linearGradient")).toBe(
        false
      );

      const legendItems = element.shadowRoot.querySelectorAll(".legend-item");
      expect(legendItems.length).toBe(2);

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
