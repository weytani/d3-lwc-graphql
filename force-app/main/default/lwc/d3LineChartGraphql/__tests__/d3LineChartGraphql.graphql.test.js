// ABOUTME: Tests the GraphQL self-fetch path on the standalone d3LineChartGraphql bundle.
// ABOUTME: Covers the structured record-query builder and the free-text graphqlQuery admin override.
import { createElement } from "lwc";
import D3LineChartGraphql from "c/d3LineChartGraphql";
import { graphql, gql } from "lightning/graphql";
import { loadD3 } from "../d3Loader";

jest.mock("../d3Loader", () => ({ loadD3: jest.fn() }));

// Value-axis chart: renderChart calls d3.max/min/extent to build scales, so the
// stub must compute those for real (a naive always-chain stub crashes the jest
// worker on `d3.max(...) * 1.1`-style numeric usage). It also special-cases
// `node()` because the line-draw animation calls `path.node().getTotalLength()`
// and compares the result numerically (`totalLength > 0`) — a chain object
// there throws "Cannot convert object to primitive value".
function makeD3Stub() {
  const calls = [];
  const chain = new Proxy(function () {}, {
    get: (target, prop) => {
      if (prop === "then") return undefined;
      if (prop === "max") return (a, f) => Math.max(...a.map(f ?? ((d) => d)));
      if (prop === "min") return (a, f) => Math.min(...a.map(f ?? ((d) => d)));
      if (prop === "extent")
        return (a, f) => {
          const m = a.map(f ?? ((d) => d));
          return [Math.min(...m), Math.max(...m)];
        };
      if (prop === "node") return () => ({ getTotalLength: () => 100 });
      return (...args) => {
        calls.push([prop, ...args]);
        return chain;
      };
    },
    apply: () => chain
  });
  return { chain, calls };
}

const RECORD_RESPONSE = {
  uiapi: {
    query: {
      Opportunity: {
        edges: [
          {
            node: {
              CloseDate: { value: "2024-01-15" },
              Amount: { value: 100 },
              StageName: { value: "Won" }
            }
          },
          {
            node: {
              CloseDate: { value: "2024-02-15" },
              Amount: { value: 200 },
              StageName: { value: "Won" }
            }
          },
          {
            node: {
              CloseDate: { value: "2024-01-15" },
              Amount: { value: 80 },
              StageName: { value: "Lost" }
            }
          }
        ]
      }
    }
  }
};

// A record-query response an admin's free-text graphqlQuery would return. The
// chart shapes these rows into time-series points client-side.
const FREE_TEXT_QUERY =
  "query { uiapi { query { Opportunity { edges { node { CloseDate { value } Amount { value } } } } } } }";

async function flushPromises() {
  return Promise.resolve();
}

describe("d3LineChartGraphql GraphQL self-fetch path", () => {
  let d3Calls;

  beforeEach(() => {
    const stub = makeD3Stub();
    d3Calls = stub.calls;
    loadD3.mockResolvedValue(stub.chain);

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
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
    jest.clearAllMocks();
  });

  describe("structured record-query path", () => {
    it("renders the chart container and draws the line when GraphQL record data arrives", async () => {
      const element = createElement("c-d3-line-chart-graphql", {
        is: D3LineChartGraphql
      });
      element.objectApiName = "Opportunity";
      element.dateField = "CloseDate";
      element.valueField = "Amount";
      document.body.appendChild(element);

      await flushPromises(); // connectedCallback (loadD3 + loadData early-return)
      graphql.emit(RECORD_RESPONSE);
      await flushPromises();
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".chart-container")
      ).not.toBeNull();
      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeNull();

      // Prove renderChart actually ran: a "line" path was appended with a "d" attr.
      expect(
        d3Calls.some(
          (c) => c[0] === "attr" && c[1] === "class" && c[2] === "line"
        )
      ).toBe(true);
    });

    it("keeps the loading spinner up while the wire is provisioned and awaiting its first emission", async () => {
      const element = createElement("c-d3-line-chart-graphql", {
        is: D3LineChartGraphql
      });
      element.objectApiName = "Opportunity";
      element.dateField = "CloseDate";
      element.valueField = "Amount";
      document.body.appendChild(element);

      await flushPromises();
      // Provisioned wire, no emission yet: spinner shows, no chart, no error —
      // i.e. no no-data flash on the self-fetch path.
      expect(
        element.shadowRoot.querySelector("lightning-spinner")
      ).not.toBeNull();
      expect(element.shadowRoot.querySelector(".chart-container")).toBeNull();
      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeNull();

      graphql.emit(RECORD_RESPONSE);
      await flushPromises();
      await flushPromises();

      expect(element.shadowRoot.querySelector("lightning-spinner")).toBeNull();
      expect(
        element.shadowRoot.querySelector(".chart-container")
      ).not.toBeNull();
    });

    it("shows an error when the GraphQL wire emits errors", async () => {
      const element = createElement("c-d3-line-chart-graphql", {
        is: D3LineChartGraphql
      });
      element.objectApiName = "Opportunity";
      element.dateField = "CloseDate";
      element.valueField = "Amount";
      document.body.appendChild(element);

      await flushPromises();
      graphql.emitErrors([{ message: "boom" }]);
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).not.toBeNull();
    });

    it("bounds the query with first: 2000", async () => {
      const element = createElement("c-d3-line-chart-graphql", {
        is: D3LineChartGraphql
      });
      element.objectApiName = "Opportunity";
      element.dateField = "CloseDate";
      element.valueField = "Amount";
      document.body.appendChild(element);

      await flushPromises();

      const queryStrings = gql.mock.results.map((r) => r.value);
      expect(queryStrings.some((q) => q.includes("first: 2000"))).toBe(true);
    });

    it("requests dateField, valueField, and seriesField, deduped", async () => {
      const element = createElement("c-d3-line-chart-graphql", {
        is: D3LineChartGraphql
      });
      element.objectApiName = "Opportunity";
      element.dateField = "CloseDate";
      element.valueField = "Amount";
      // seriesField repeats dateField on purpose to prove deduping.
      element.seriesField = "CloseDate";
      document.body.appendChild(element);

      await flushPromises();

      const queryStrings = gql.mock.results.map((r) => r.value);
      const query = queryStrings[queryStrings.length - 1];
      expect(query).toContain("CloseDate {");
      expect(query).toContain("Amount {");
      expect(query.match(/CloseDate \{/g).length).toBe(1);
    });
  });

  describe("free-text graphqlQuery override", () => {
    it("uses a free-text graphqlQuery verbatim and shapes the rows client-side", async () => {
      const element = createElement("c-d3-line-chart-graphql", {
        is: D3LineChartGraphql
      });
      element.graphqlQuery = FREE_TEXT_QUERY;
      element.objectApiName = "Opportunity";
      element.dateField = "CloseDate";
      element.valueField = "Amount";
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

      // The admin's document is passed to gql verbatim; the structured builder
      // (which bounds the query with first: 2000) is never used.
      const queryStrings = gql.mock.results.map((r) => r.value);
      expect(queryStrings.some((q) => q.includes(FREE_TEXT_QUERY))).toBe(true);
      expect(queryStrings.every((q) => !q.includes("first: 2000"))).toBe(true);
    });

    it("auto-detects the object key when objectApiName is blank (real admin case)", async () => {
      const element = createElement("c-d3-line-chart-graphql", {
        is: D3LineChartGraphql
      });
      element.graphqlQuery = FREE_TEXT_QUERY;
      // objectApiName intentionally left blank — the admin pasted a query.
      element.dateField = "CloseDate";
      element.valueField = "Amount";
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
      expect(
        d3Calls.some(
          (c) => c[0] === "attr" && c[1] === "class" && c[2] === "line"
        )
      ).toBe(true);
    });

    it("surfaces wire errors from a free-text graphqlQuery in the error state", async () => {
      const element = createElement("c-d3-line-chart-graphql", {
        is: D3LineChartGraphql
      });
      element.graphqlQuery = FREE_TEXT_QUERY;
      element.dateField = "CloseDate";
      element.valueField = "Amount";
      document.body.appendChild(element);

      await flushPromises();
      graphql.emitErrors([{ message: "bad free-text query" }]);
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).not.toBeNull();
    });

    it("hints record-query-only when a free-text graphqlQuery yields no records", async () => {
      // An aggregate-shaped payload has no uiapi.query, so the record normalizer
      // finds nothing — the error should point the admin at the record-query contract.
      const element = createElement("c-d3-line-chart-graphql", {
        is: D3LineChartGraphql
      });
      element.graphqlQuery = FREE_TEXT_QUERY;
      element.dateField = "CloseDate";
      element.valueField = "Amount";
      document.body.appendChild(element);

      await flushPromises();
      graphql.emit({ uiapi: { aggregate: { Opportunity: { edges: [] } } } });
      await flushPromises();

      const err = element.shadowRoot.querySelector(".slds-text-color_error");
      expect(err).not.toBeNull();
      expect(err.textContent).toMatch(/record query/i);
    });

    it("ignores a blank graphqlQuery and falls through to the structured builder", async () => {
      const element = createElement("c-d3-line-chart-graphql", {
        is: D3LineChartGraphql
      });
      element.graphqlQuery = "   ";
      element.objectApiName = "Opportunity";
      element.dateField = "CloseDate";
      element.valueField = "Amount";
      document.body.appendChild(element);

      await flushPromises();
      graphql.emit(RECORD_RESPONSE);
      await flushPromises();
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".chart-container")
      ).not.toBeNull();
      const queryStrings = gql.mock.results.map((r) => r.value);
      expect(queryStrings.some((q) => q.includes("first: 2000"))).toBe(true);
    });

    it("lets recordCollection beat a set graphqlQuery (wire skipped)", async () => {
      const element = createElement("c-d3-line-chart-graphql", {
        is: D3LineChartGraphql
      });
      element.graphqlQuery = FREE_TEXT_QUERY;
      element.recordCollection = [
        { CloseDate: "2024-01-01", Amount: 100 },
        { CloseDate: "2024-02-01", Amount: 200 }
      ];
      element.dateField = "CloseDate";
      element.valueField = "Amount";
      document.body.appendChild(element);

      await flushPromises();
      await flushPromises();

      // recordCollection wins: the chart renders without the wire ever being
      // provisioned with the free-text document.
      expect(
        element.shadowRoot.querySelector(".chart-container")
      ).not.toBeNull();
      const queryStrings = gql.mock.results.map((r) => r.value);
      expect(queryStrings.some((q) => q.includes(FREE_TEXT_QUERY))).toBe(false);
    });
  });
});
