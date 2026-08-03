// ABOUTME: Integration tests for d3StackedBarChartGraphql verifying the real bundle-local pipelines (data, theme, utils, graphql).
// ABOUTME: Only D3 and NavigationMixin are mocked; aggregation, color logic, and the GraphQL wire path run for real.

import { createElement } from "lwc";
import D3StackedBarChartGraphql from "c/d3StackedBarChartGraphql";
import { graphql } from "lightning/graphql";
import { loadD3 } from "../d3Loader";

jest.mock("../d3Loader", () => ({
  loadD3: jest.fn()
}));

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
};

// Matches this bundle's own established fixture shape (see
// d3StackedBarChartGraphql.test.js SERIES_DATA): StageName/Type/Amount.
const SERIES_DATA = [
  { StageName: "Prospecting", Type: "New", Amount: 100 },
  { StageName: "Prospecting", Type: "Existing", Amount: 200 },
  { StageName: "Qualification", Type: "New", Amount: 150 },
  { StageName: "Qualification", Type: "Existing", Amount: 250 }
];

// Matches this bundle's own established free-text fixture (see
// d3StackedBarChartGraphql.graphql.test.js FREE_TEXT_QUERY).
const FREE_TEXT_QUERY =
  "query { uiapi { query { Opportunity { edges { node { StageName { value } Type { value } Amount { value } } } } } } }";

// Duplicate (Prospecting, New) rows that must be summed client-side (60+40=100)
// to match the structured aggregate path, plus a second label to prove the
// pivot preserves both categories.
const FREE_TEXT_RESPONSE = {
  uiapi: {
    query: {
      Opportunity: {
        edges: [
          {
            node: {
              StageName: { value: "Prospecting" },
              Type: { value: "New" },
              Amount: { value: 60 }
            }
          },
          {
            node: {
              StageName: { value: "Prospecting" },
              Type: { value: "New" },
              Amount: { value: 40 }
            }
          },
          {
            node: {
              StageName: { value: "Prospecting" },
              Type: { value: "Existing" },
              Amount: { value: 200 }
            }
          },
          {
            node: {
              StageName: { value: "Qualification" },
              Type: { value: "New" },
              Amount: { value: 150 }
            }
          }
        ]
      }
    }
  }
};

const flushPromises = () => new Promise(process.nextTick);

describe("c-d3-stacked-bar-chart-graphql integration", () => {
  let element;
  let mockD3;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();

    mockD3 = createMockD3();
    loadD3.mockResolvedValue(mockD3);

    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

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
    jest.clearAllMocks();
  });

  async function createChart(props = {}) {
    element = createElement("c-d3-stacked-bar-chart-graphql", {
      is: D3StackedBarChartGraphql
    });

    Object.assign(element, {
      groupByField: "StageName",
      seriesField: "Type",
      valueField: "Amount",
      operation: "Sum",
      recordCollection: SERIES_DATA,
      ...props
    });

    document.body.appendChild(element);

    await flushPromises();
    await flushPromises();

    return element;
  }

  describe("aggregation pipeline integration", () => {
    it("pivots real aggregateSeriesData output into stack-ready rows, preserving first-occurrence series order", async () => {
      await createChart();

      // Real aggregateSeriesData groups by composite (label|||series) key in a
      // Map, so seriesNames is derived from first-occurrence order in
      // chartData -- "New" appears before "Existing" in SERIES_DATA, so it
      // must land first (not alphabetical, which would put "Existing" first).
      const keysCall = mockD3._mockStack.keys.mock.calls[0];
      expect(keysCall[0]).toEqual(["New", "Existing"]);
    });
  });

  describe("theme pipeline integration", () => {
    it("applies the real Salesforce Standard palette to stacked layer fills", async () => {
      await createChart({ theme: "Salesforce Standard" });

      const fillFn = mockD3.attr.mock.calls.find(
        (c) => c[0] === "fill" && typeof c[1] === "function"
      )[1];
      expect(fillFn(null, 0)).toBe("#1589EE");
      expect(fillFn(null, 1)).toBe("#FF9E2C");
    });
  });

  describe("error state integration", () => {
    it("surfaces a real validateFields error when recordCollection is missing the configured valueField", async () => {
      // The sample record has no "Amount" key at all (not merely an
      // undefined value) -- validateFields checks key presence on the
      // sample record.
      await createChart({
        recordCollection: [{ StageName: "Prospecting", Type: "New" }]
      });

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeTruthy();
      expect(errorEl.textContent).toContain("Missing required fields: Amount");
    });

    it("surfaces a real 'No data after aggregation' error when the GraphQL multi-group aggregate returns no rows", async () => {
      // Unlike the recordCollection path (aggregateSeriesData always produces
      // >=1 group from non-empty prepared data), the GraphQL wire path can
      // genuinely aggregate down to zero rows -- an empty `edges` array
      // normalizes to [], which wiredAggregate reports as this exact error.
      element = createElement("c-d3-stacked-bar-chart-graphql", {
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
      await flushPromises();

      graphql.emit({
        uiapi: {
          aggregate: {
            Opportunity: { edges: [] }
          }
        }
      });
      await flushPromises();
      await flushPromises();

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeTruthy();
      expect(errorEl.textContent).toContain("No data after aggregation");
    });
  });

  describe("no-data state integration", () => {
    it("shows the no-data state without invoking D3 when no recordCollection and no query config are provided", async () => {
      await createChart({ recordCollection: [] });

      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeFalsy();
      expect(element.shadowRoot.textContent).toContain("No data available");
      expect(mockD3.select).not.toHaveBeenCalled();
    });
  });

  describe("GraphQL free-text pipeline integration", () => {
    it("processes a free-text graphqlQuery UI-API response through the real pivot+sum pipeline, preserving multi-series stack keys", async () => {
      element = createElement("c-d3-stacked-bar-chart-graphql", {
        is: D3StackedBarChartGraphql
      });
      Object.assign(element, {
        groupByField: "StageName",
        seriesField: "Type",
        valueField: "Amount",
        operation: "Sum",
        objectApiName: "Opportunity",
        graphqlQuery: FREE_TEXT_QUERY,
        recordCollection: []
      });
      document.body.appendChild(element);
      await flushPromises();

      graphql.emit(FREE_TEXT_RESPONSE);
      await flushPromises();
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeFalsy();

      // Duplicate (Prospecting, New) rows (60+40) must collapse into one
      // stack-ready row alongside (Prospecting, Existing) and
      // (Qualification, New) -- both labels and both series survive.
      const keysCall = mockD3._mockStack.keys.mock.calls[0];
      expect(keysCall[0]).toEqual(["New", "Existing"]);
    });
  });

  describe("drill-down integration", () => {
    it("dispatches barclick with real pivoted label/series/value on bar click", async () => {
      await createChart({ objectApiName: "Opportunity" });

      const handler = jest.fn();
      element.addEventListener("barclick", handler);

      const clickHandler = mockD3.on.mock.calls.find((c) => c[0] === "click");
      expect(clickHandler).toBeTruthy();
      const [, callback] = clickHandler;
      // Simulate a stack-datum click: d[0]=100 (baseline), d[1]=250 (top),
      // d.data.label="Prospecting" (stack-generator shape).
      callback(
        { offsetX: 0, offsetY: 0 },
        Object.assign([100, 250], { data: { label: "Prospecting" } })
      );

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].detail).toEqual({
        label: "Prospecting",
        value: 150,
        series: null,
        filterField: "StageName"
      });
      expect(mockNavigate).toHaveBeenCalled();
    });
  });

  describe("accessibility wiring", () => {
    it("applies role=img and a title to the rendered svg", async () => {
      await createChart();

      const roleCall = mockD3.attr.mock.calls.find((c) => c[0] === "role");
      expect(roleCall[1]).toBe("img");
      expect(mockD3.insert).toHaveBeenCalledWith("title", ":first-child");
    });
  });
});
