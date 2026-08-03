// ABOUTME: End-to-end lifecycle tests for the d3SparklineGridGraphql Lightning Web Component.
// ABOUTME: Verifies full pipeline: D3 load, entity bucketing (recordCollection and GraphQL self-fetch), multi-entity grid rendering, cleanup, and multi-instance isolation.

import { createElement } from "lwc";
import D3SparklineGridGraphql from "c/d3SparklineGridGraphql";
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

// Real-computing mock D3, matching d3SparklineGridGraphql.integration.test.js: extent/
// max/min/mean reduce over the real sparkline data instead of a constant, so
// the full lifecycle actually exercises entity bucketing rather than masking it.
function createMockD3() {
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
    datum: jest.fn(() => mockD3),
    enter: jest.fn(() => mockD3),
    on: jest.fn(() => mockD3),
    html: jest.fn(() => mockD3),
    line: jest.fn(() => {
      const lineGen = jest.fn(() => "M0,0L10,10");
      lineGen.x = jest.fn(() => lineGen);
      lineGen.y = jest.fn(() => lineGen);
      return lineGen;
    }),
    area: jest.fn(() => {
      const areaGen = jest.fn(() => "M0,0L10,10L10,30L0,30Z");
      areaGen.x = jest.fn(() => areaGen);
      areaGen.y0 = jest.fn(() => areaGen);
      areaGen.y1 = jest.fn(() => areaGen);
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
    mean: jest.fn((data, accessor) => {
      const vals = data.map(accessor);
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    })
  };
  return mockD3;
}

Element.prototype.getBoundingClientRect = jest.fn(() => ({
  width: 600,
  height: 400,
  top: 0,
  left: 0,
  bottom: 400,
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

// Counts attr("class", <name>) calls from the mockD3.attr call log — mirrors
// the countAreaPaths() helper in d3AreaChart's e2e backfill, generalized to
// any mark class so entity-row and sparkline-line counts can both be checked.
function countClassAttrs(attrCalls, className) {
  return attrCalls.filter(
    (call) => call[0] === "class" && call[1] === className
  ).length;
}

let consoleErrorSpy;

async function createChart(props = {}) {
  const element = createElement("c-d3-sparkline-grid-graphql", {
    is: D3SparklineGridGraphql
  });

  Object.assign(element, {
    entityField: "Type",
    dateField: "CloseDate",
    valueField: "Amount",
    operation: "Sum",
    height: 400,
    recordCollection: [],
    ...props
  });

  document.body.appendChild(element);
  await flushPromises();
  return element;
}

describe("c-d3-sparkline-grid-graphql e2e", () => {
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
      { Type: "New Business", CloseDate: "2024-01-01", Amount: 100 },
      { Type: "Renewal", CloseDate: "2024-01-01", Amount: 200 },
      { Type: "Upsell", CloseDate: "2024-01-01", Amount: 300 }
    ];

    it("create -> load D3 -> load data -> render -> verify one sparkline row per entity", async () => {
      const element = await createChart({ recordCollection: LIFECYCLE_DATA });

      expect(loadD3).toHaveBeenCalled();
      expect(mockD3.select).toHaveBeenCalled();

      const appendCalls = mockD3.append.mock.calls;
      expect(appendCalls.some((call) => call[0] === "svg")).toBe(true);
      expect(appendCalls.some((call) => call[0] === "path")).toBe(true);

      // Three entities in the input -> three real entity-row groups, each
      // with its own real sparkline line mark (not just a container).
      expect(countClassAttrs(mockD3.attr.mock.calls, "entity-row")).toBe(3);
      expect(countClassAttrs(mockD3.attr.mock.calls, "sparkline-line")).toBe(3);

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeFalsy();
    });

    it("GraphQL self-fetch: no recordCollection -> wire emits raw records -> normalizeRecordsGeneric -> processEntityData renders a real sparkline mark per entity", async () => {
      const RECORD_RESPONSE = {
        uiapi: {
          query: {
            Opportunity: {
              edges: [
                {
                  node: {
                    Type: { value: "New Business" },
                    CloseDate: { value: "2024-01-15" },
                    Amount: { value: 100 }
                  }
                },
                {
                  node: {
                    Type: { value: "New Business" },
                    CloseDate: { value: "2024-02-15" },
                    Amount: { value: 200 }
                  }
                },
                {
                  node: {
                    Type: { value: "Renewal" },
                    CloseDate: { value: "2024-01-10" },
                    Amount: { value: 50 }
                  }
                },
                {
                  node: {
                    Type: { value: "Renewal" },
                    CloseDate: { value: "2024-02-10" },
                    Amount: { value: 75 }
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

      // No recordCollection: the GraphQL wire is the data source.
      graphql.emit(RECORD_RESPONSE);
      await flushPromises();
      await flushPromises();

      // Two distinct entities in the wire payload -> two real entity rows,
      // each drawing its own real sparkline-line mark — not merely "some
      // path exists".
      expect(countClassAttrs(mockD3.attr.mock.calls, "entity-row")).toBe(2);
      expect(countClassAttrs(mockD3.attr.mock.calls, "sparkline-line")).toBe(2);

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeFalsy();
    });

    it("multi-entity grid: four entities render exactly four entity rows and four sparkline marks", async () => {
      const fourEntities = [
        { Type: "A", CloseDate: "2024-01-01", Amount: 10 },
        { Type: "B", CloseDate: "2024-01-01", Amount: 20 },
        { Type: "C", CloseDate: "2024-01-01", Amount: 30 },
        { Type: "D", CloseDate: "2024-01-01", Amount: 40 }
      ];

      await createChart({ recordCollection: fourEntities });

      expect(countClassAttrs(mockD3.attr.mock.calls, "entity-row")).toBe(4);
      expect(countClassAttrs(mockD3.attr.mock.calls, "sparkline-line")).toBe(4);
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
    it("D3 load failure -> error state -> component surfaces the error and logs it", async () => {
      loadD3.mockRejectedValue(new Error("CDN unreachable"));

      const element = await createChart({
        recordCollection: [
          { Type: "Solo", CloseDate: "2024-01-01", Amount: 100 }
        ]
      });

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeTruthy();
      expect(errorEl.textContent).toContain("CDN unreachable");
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it("GraphQL wire errors -> error state without leaking console.error", async () => {
      const element = await createChart({
        recordCollection: [],
        objectApiName: "Opportunity"
      });

      graphql.emitErrors([{ message: "boom" }]);
      await flushPromises();

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeTruthy();
      // wiredRecords handles wire errors by setting component state; it never
      // calls console.error, so this path must stay pristine.
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe("multi-component isolation", () => {
    it("two sparkline grids on the same page have independent lifecycle", async () => {
      const dataA = [
        { Type: "A1", CloseDate: "2024-01-01", Amount: 100 },
        { Type: "A2", CloseDate: "2024-01-01", Amount: 200 }
      ];
      const dataB = [
        { Type: "B1", CloseDate: "2024-01-01", Amount: 300 },
        { Type: "B2", CloseDate: "2024-01-01", Amount: 400 }
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
