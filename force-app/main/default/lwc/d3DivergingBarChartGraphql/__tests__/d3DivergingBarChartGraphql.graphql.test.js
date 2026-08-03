// ABOUTME: Tests the GraphQL self-fetch path on d3DivergingBarChartGraphql — structured builder and free-text override.
// ABOUTME: Uses the real HTML selectors: .chart-container (chart) and .slds-text-color_error (error).
import { createElement } from "lwc";
import D3DivergingBarChartGraphql from "c/d3DivergingBarChartGraphql";
import { graphql, gql } from "lightning/graphql";
import { loadD3 } from "../d3Loader";

jest.mock("../d3Loader", () => ({ loadD3: jest.fn() }));

// Minimal chainable D3 stub: every call returns the same chainable object,
// except max(), which renderChart uses synchronously (-maxAbs, maxAbs) before
// any further D3 chaining and so needs a real number back, not the chain
// object. Calling the stub itself (invoking a scale, e.g. `xScale(0)`) also
// returns a real number rather than the chain object — renderChart computes
// `zero = xScale(0)` eagerly and interpolates it into a template literal
// (`translate(${zero},0)`), which throws the same "cannot convert to
// primitive" error if it gets a non-primitive back.
// The `then` guard keeps this from looking like a thenable to
// Promise.resolve()/await — without it, `prop === "then"` would return a
// callable that swallows (resolve, reject), and awaiting loadD3() would
// hang forever.
function makeD3Stub() {
  const chain = new Proxy(function () {}, {
    get: (target, prop) => {
      if (prop === "then") return undefined;
      if (prop === "max")
        return (arr, accessor) => Math.max(...arr.map(accessor ?? ((d) => d)));
      return () => chain;
    },
    apply: () => 0
  });
  return chain;
}

// Variant of the stub that captures every array bound through .data(), so a
// test can inspect the aggregated [{label, value}] rows renderChart actually
// drew. The plain stub returns the chain from .data() and is therefore blind
// to whether client-side aggregation summed anything.
function makeCapturingD3Stub(boundData) {
  const chain = new Proxy(function () {}, {
    get: (target, prop) => {
      if (prop === "then") return undefined;
      if (prop === "max")
        return (arr, accessor) => Math.max(...arr.map(accessor ?? ((d) => d)));
      if (prop === "data")
        return (rows) => {
          boundData.push(rows);
          return chain;
        };
      return () => chain;
    },
    apply: () => 0
  });
  return chain;
}

const AGG_RESPONSE = {
  uiapi: {
    aggregate: {
      Opportunity: {
        edges: [
          {
            node: {
              aggregate: {
                StageName: { value: "Loss" },
                Amount: { sum: { value: -300 } }
              }
            }
          },
          {
            node: {
              aggregate: {
                StageName: { value: "Gain" },
                Amount: { sum: { value: 200 } }
              }
            }
          }
        ]
      }
    }
  }
};

const RECORD_RESPONSE = {
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
};

// Two rows share the "Loss" key, so a client-side Sum must fold them to -300.
// An unaggregated (last-wins) path would leave -200 instead.
const FREE_TEXT_RESPONSE = {
  uiapi: {
    query: {
      Opportunity: {
        edges: [
          { node: { StageName: { value: "Loss" }, Amount: { value: -100 } } },
          { node: { StageName: { value: "Loss" }, Amount: { value: -200 } } },
          { node: { StageName: { value: "Gain" }, Amount: { value: 500 } } }
        ]
      }
    }
  }
};

const EMPTY_RECORD_RESPONSE = {
  uiapi: { query: { Opportunity: { edges: [] } } }
};

const FREE_TEXT_QUERY =
  "query { uiapi { query { Opportunity { edges { node { StageName { value } Amount { value } } } } } } }";

async function flushPromises() {
  return Promise.resolve();
}

describe("d3DivergingBarChartGraphql GraphQL path", () => {
  beforeEach(() => {
    loadD3.mockResolvedValue(makeD3Stub());

    // Mock getBoundingClientRect so chart renders (not zero-width)
    Element.prototype.getBoundingClientRect = jest.fn(() => ({
      width: 400,
      height: 300,
      top: 0,
      left: 0,
      bottom: 300,
      right: 400
    }));

    // Mock ResizeObserver
    global.ResizeObserver = jest.fn().mockImplementation(() => ({
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn()
    }));
  });

  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
    jest.clearAllMocks();
  });

  describe("structured query builder", () => {
    it("renders the chart container when GraphQL aggregate data arrives", async () => {
      const element = createElement("c-d3-diverging-bar-chart-graphql", {
        is: D3DivergingBarChartGraphql
      });
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.valueField = "Amount";
      element.operation = "Sum";
      document.body.appendChild(element);

      await flushPromises(); // connectedCallback (loadD3 + loadData no-op)
      graphql.emit(AGG_RESPONSE);
      await flushPromises();
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".chart-container")
      ).not.toBeNull();
      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeNull();
    });

    it("keeps the loading spinner up while the wire is provisioned and awaiting its first emission", async () => {
      const element = createElement("c-d3-diverging-bar-chart-graphql", {
        is: D3DivergingBarChartGraphql
      });
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.valueField = "Amount";
      element.operation = "Sum";
      document.body.appendChild(element);

      await flushPromises();
      await flushPromises();

      // A query is provisioned but nothing has emitted: hold the spinner rather
      // than flashing the no-data state.
      expect(
        element.shadowRoot.querySelector("lightning-spinner")
      ).not.toBeNull();
      expect(element.shadowRoot.querySelector(".chart-container")).toBeNull();
      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeNull();

      graphql.emit(AGG_RESPONSE);
      await flushPromises();
      await flushPromises();

      expect(element.shadowRoot.querySelector("lightning-spinner")).toBeNull();
      expect(
        element.shadowRoot.querySelector(".chart-container")
      ).not.toBeNull();
    });

    it("shows an error when the GraphQL wire emits errors", async () => {
      const element = createElement("c-d3-diverging-bar-chart-graphql", {
        is: D3DivergingBarChartGraphql
      });
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.valueField = "Amount";
      element.operation = "Sum";
      document.body.appendChild(element);

      await flushPromises();
      graphql.emitErrors([{ message: "boom" }]);
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).not.toBeNull();
    });

    it("falls back to a raw record query and counts client-side for Count operation", async () => {
      const element = createElement("c-d3-diverging-bar-chart-graphql", {
        is: D3DivergingBarChartGraphql
      });
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.operation = "Count";
      document.body.appendChild(element);

      await flushPromises();
      graphql.emit(RECORD_RESPONSE);
      await flushPromises();
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".chart-container")
      ).not.toBeNull();
      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeNull();
    });

    it("bounds the Count-path query with the same first: value as the aggregate path", async () => {
      const element = createElement("c-d3-diverging-bar-chart-graphql", {
        is: D3DivergingBarChartGraphql
      });
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.operation = "Count";
      document.body.appendChild(element);

      await flushPromises();

      const queryStrings = gql.mock.results.map((r) => r.value);
      expect(queryStrings.some((q) => q.includes("first: 2000"))).toBe(true);
    });
  });

  describe("free-text graphqlQuery override", () => {
    it("uses a free-text graphqlQuery verbatim and sums duplicate categories client-side", async () => {
      const boundData = [];
      loadD3.mockResolvedValue(makeCapturingD3Stub(boundData));

      const element = createElement("c-d3-diverging-bar-chart-graphql", {
        is: D3DivergingBarChartGraphql
      });
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.valueField = "Amount";
      element.operation = "Sum";
      element.graphqlQuery = FREE_TEXT_QUERY;
      document.body.appendChild(element);

      await flushPromises();
      graphql.emit(FREE_TEXT_RESPONSE);
      await flushPromises();
      await flushPromises();

      // The pasted document reaches the wire unaltered.
      const queryStrings = gql.mock.results.map((r) => r.value);
      expect(queryStrings.some((q) => q.includes(FREE_TEXT_QUERY))).toBe(true);

      // The two "Loss" rows are summed client-side to -300, not last-wins -200.
      expect(boundData[boundData.length - 1]).toEqual([
        { label: "Gain", value: 500 },
        { label: "Loss", value: -300 }
      ]);
      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeNull();
    });

    it("surfaces wire errors from a free-text graphqlQuery in the error state", async () => {
      const element = createElement("c-d3-diverging-bar-chart-graphql", {
        is: D3DivergingBarChartGraphql
      });
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.valueField = "Amount";
      element.operation = "Sum";
      element.graphqlQuery = FREE_TEXT_QUERY;
      document.body.appendChild(element);

      await flushPromises();
      graphql.emitErrors([{ message: "malformed document" }]);
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).not.toBeNull();
      expect(errorElement.textContent).toContain("malformed document");
    });

    it("hints the record-query contract when a free-text graphqlQuery yields no records", async () => {
      const element = createElement("c-d3-diverging-bar-chart-graphql", {
        is: D3DivergingBarChartGraphql
      });
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.valueField = "Amount";
      element.operation = "Sum";
      element.graphqlQuery = FREE_TEXT_QUERY;
      document.body.appendChild(element);

      await flushPromises();
      graphql.emit(EMPTY_RECORD_RESPONSE);
      await flushPromises();

      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).not.toBeNull();
      expect(errorElement.textContent).toContain("uiapi.query");
    });

    it("ignores a whitespace-only graphqlQuery and falls through to the structured builder", async () => {
      const element = createElement("c-d3-diverging-bar-chart-graphql", {
        is: D3DivergingBarChartGraphql
      });
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.valueField = "Amount";
      element.operation = "Sum";
      element.graphqlQuery = "   ";
      document.body.appendChild(element);

      await flushPromises();

      // The structured aggregate builder ran, not the blank override.
      const queryStrings = gql.mock.results.map((r) => r.value);
      expect(queryStrings.some((q) => q.includes("uiapi { aggregate"))).toBe(
        true
      );

      graphql.emit(AGG_RESPONSE);
      await flushPromises();
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".chart-container")
      ).not.toBeNull();
    });

    it("prefers recordCollection over a set graphqlQuery", async () => {
      const boundData = [];
      loadD3.mockResolvedValue(makeCapturingD3Stub(boundData));

      const element = createElement("c-d3-diverging-bar-chart-graphql", {
        is: D3DivergingBarChartGraphql
      });
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.valueField = "Amount";
      element.operation = "Sum";
      element.graphqlQuery = FREE_TEXT_QUERY;
      element.recordCollection = [
        { StageName: "Passed In", Amount: 42 },
        { StageName: "Passed In", Amount: 8 }
      ];
      document.body.appendChild(element);

      await flushPromises();
      await flushPromises();

      // recordCollection wins: no query is provisioned, and the rendered rows
      // come from the passed-in records, not the free-text document.
      expect(gql).not.toHaveBeenCalled();
      expect(boundData[boundData.length - 1]).toEqual([
        { label: "Passed In", value: 50 }
      ]);
    });
  });
});
