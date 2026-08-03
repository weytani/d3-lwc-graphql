// ABOUTME: Integration tests for d3SortedBarChartGraphql verifying real bundle-local pipelines (data, theme, utils, graphql) and sort behavior.
// ABOUTME: Only D3, GraphQL, and NavigationMixin are mocked; aggregation, color, and sort logic run for real.

import { createElement } from "lwc";
import D3SortedBarChartGraphql from "c/d3SortedBarChartGraphql";
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
};

const SAMPLE_DATA = [
  { StageName: "Prospecting", Amount: 100 },
  { StageName: "Prospecting", Amount: 200 },
  { StageName: "Qualification", Amount: 150 },
  { StageName: "Closed Won", Amount: 500 }
];

const flushPromises = () => new Promise(process.nextTick);

describe("c-d3-sorted-bar-chart-graphql integration", () => {
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
    element = createElement("c-d3-sorted-bar-chart-graphql", {
      is: D3SortedBarChartGraphql
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

  // Each call to scaleBand() creates a NEW scale instance (fresh jest.fn()s
  // per the mock factory), so re-invoking scaleBand() here would inspect an
  // unrelated instance. Read the domain the renderer actually called by
  // going through scaleBand.mock.results — the instances actually returned
  // during rendering — and taking the most recent one.
  function lastScaleBandDomain() {
    const results = mockD3.scaleBand.mock.results.map((r) => r.value);
    const lastScale = results[results.length - 1];
    const domainCalls = lastScale.domain.mock.calls;
    return domainCalls[domainCalls.length - 1][0];
  }

  describe("sort pipeline integration", () => {
    it("renders bars in descending value order by default (real aggregateData + sort)", async () => {
      await createChart();

      // Real aggregateData Sum desc: Closed Won=500, Prospecting=300, Qualification=150
      // Default sortBy=value/sortDirection=desc is a no-op relative to that order.
      expect(lastScaleBandDomain()).toEqual([
        "Closed Won",
        "Prospecting",
        "Qualification"
      ]);
    });

    it("re-sorts to ascending value order when sortDirection=asc", async () => {
      await createChart({ sortDirection: "asc" });

      expect(lastScaleBandDomain()).toEqual([
        "Qualification",
        "Prospecting",
        "Closed Won"
      ]);
    });

    it("sorts alphabetically ascending when sortBy=label, sortDirection=asc", async () => {
      await createChart({ sortBy: "label", sortDirection: "asc" });

      expect(lastScaleBandDomain()).toEqual([
        "Closed Won",
        "Prospecting",
        "Qualification"
      ]);
    });

    it("sorts alphabetically descending when sortBy=label, sortDirection=desc", async () => {
      await createChart({ sortBy: "label", sortDirection: "desc" });

      expect(lastScaleBandDomain()).toEqual([
        "Qualification",
        "Prospecting",
        "Closed Won"
      ]);
    });

    it("changing sortBy after render re-computes the domain without a refetch", async () => {
      await createChart();
      loadD3.mockClear();

      mockD3.scaleBand.mockClear();
      element.sortBy = "label";
      await flushPromises();

      // sortDirection is untouched by this change and stays at its default
      // "desc", so the new domain is alphabetical-descending.
      expect(lastScaleBandDomain()).toEqual([
        "Qualification",
        "Prospecting",
        "Closed Won"
      ]);
      expect(loadD3).not.toHaveBeenCalled();
    });
  });

  describe("graphql wire integration", () => {
    it("aggregates a GraphQL Count record set through the real pipeline and sorts it", async () => {
      const { graphql } = require("lightning/graphql");

      element = createElement("c-d3-sorted-bar-chart-graphql", {
        is: D3SortedBarChartGraphql
      });
      Object.assign(element, {
        objectApiName: "Opportunity",
        groupByField: "StageName",
        operation: "Count"
      });
      document.body.appendChild(element);

      await flushPromises();
      graphql.emit({
        uiapi: {
          query: {
            Opportunity: {
              edges: [
                { node: { StageName: { value: "Negotiation" } } },
                { node: { StageName: { value: "Negotiation" } } },
                { node: { StageName: { value: "Closed Lost" } } }
              ]
            }
          }
        }
      });
      await flushPromises();
      await flushPromises();

      // Real aggregateData Count: Negotiation=2, Closed Lost=1; default value-desc.
      expect(lastScaleBandDomain()).toEqual(["Negotiation", "Closed Lost"]);
      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeFalsy();
    });

    it("free-text graphqlQuery Sum aggregates the wire rows to the correct values", async () => {
      const { graphql } = require("lightning/graphql");

      element = createElement("c-d3-sorted-bar-chart-graphql", {
        is: D3SortedBarChartGraphql
      });
      Object.assign(element, {
        graphqlQuery:
          "query { uiapi { query { Opportunity { edges { node { StageName { value } Amount { value } } } } } } }",
        objectApiName: "Opportunity",
        groupByField: "StageName",
        valueField: "Amount",
        operation: "Sum"
      });
      document.body.appendChild(element);

      await flushPromises();
      graphql.emit({
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
      });
      await flushPromises();
      await flushPromises();

      const dataCalls = mockD3.data.mock.calls;
      const chartDataCall = dataCalls.find(
        (call) =>
          Array.isArray(call[0]) && call[0].length > 0 && call[0][0].label
      );
      expect(chartDataCall).toBeTruthy();
      // Sum: Closed Won=500, Prospecting=300 (default value-desc sort).
      expect(chartDataCall[0]).toEqual([
        { label: "Closed Won", value: 500 },
        { label: "Prospecting", value: 300 }
      ]);
    });
  });

  describe("theme pipeline integration", () => {
    it("applies Salesforce Standard palette colors to bar fills, keyed by entity not rank", async () => {
      await createChart({ theme: "Salesforce Standard" });

      const fillFn = mockD3.attr.mock.calls.find(
        (c) => c[0] === "fill" && typeof c[1] === "function"
      )[1];

      // Colors are assigned from chartData's original (load) order:
      // Closed Won=500 (index 0), Prospecting=300 (index 1), Qualification=150 (index 2).
      expect(fillFn({ label: "Closed Won" })).toBe("#1589EE");
      expect(fillFn({ label: "Prospecting" })).toBe("#FF9E2C");
      expect(fillFn({ label: "Qualification" })).toBe("#4BCA81");
    });

    it("keeps colors stable when the display order changes via sortBy", async () => {
      await createChart({ theme: "Salesforce Standard" });

      const fillFnInitial = mockD3.attr.mock.calls.find(
        (c) => c[0] === "fill" && typeof c[1] === "function"
      )[1];
      const closedWonColor = fillFnInitial({ label: "Closed Won" });

      mockD3.attr.mockClear();
      element.sortBy = "label";
      await flushPromises();

      // Re-sort doesn't touch fill at all (colors are looked up once at initial
      // render and never reassigned by the resort path).
      expect(mockD3.attr.mock.calls.filter((c) => c[0] === "fill").length).toBe(
        0
      );
      expect(closedWonColor).toBe("#1589EE");
    });
  });

  describe("legend order integration", () => {
    it("renders legend items following the active sort order", async () => {
      await createChart({
        advancedConfig: '{"showLegend": true}',
        sortBy: "value",
        sortDirection: "asc"
      });
      await flushPromises();

      const labels = Array.from(
        element.shadowRoot.querySelectorAll(".legend-label")
      ).map((el) => el.textContent);

      expect(labels).toEqual(["Qualification", "Prospecting", "Closed Won"]);
    });
  });

  describe("drill-down integration", () => {
    it("dispatches barclick with real aggregated label/value on legend activation", async () => {
      await createChart({
        advancedConfig: '{"showLegend": true}',
        objectApiName: "Opportunity"
      });
      await flushPromises();

      const handler = jest.fn();
      element.addEventListener("barclick", handler);

      const legendItem = element.shadowRoot.querySelector(
        '[data-label="Closed Won"]'
      );
      legendItem.click();

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].detail).toEqual({
        label: "Closed Won",
        value: 500,
        filterField: "StageName"
      });
      expect(mockNavigate).toHaveBeenCalled();
    });
  });

  describe("accessibility wiring", () => {
    it("applies role=img and a title describing the active sort to the rendered svg", async () => {
      await createChart({ sortBy: "label", sortDirection: "asc" });

      const roleCall = mockD3.attr.mock.calls.find((c) => c[0] === "role");
      expect(roleCall[1]).toBe("img");

      const titleInsert = mockD3.insert.mock.calls.find(
        (c) => c[0] === "title"
      );
      expect(titleInsert).toBeTruthy();

      const ariaLabelCall = mockD3.attr.mock.calls.find(
        (c) => c[0] === "aria-label"
      );
      expect(ariaLabelCall[1]).toContain("sorted by label (asc)");
    });
  });
});
