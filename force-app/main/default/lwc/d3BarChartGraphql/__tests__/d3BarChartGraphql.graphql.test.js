// ABOUTME: Tests the GraphQL self-fetch path on the standalone d3BarChartGraphql bundle.
// ABOUTME: Covers the structured builders and the free-text graphqlQuery admin override.
import { createElement } from "lwc";
import D3BarChartGraphql from "c/d3BarChartGraphql";
import { graphql, gql } from "lightning/graphql";
import { loadD3 } from "../d3Loader";

jest.mock("../d3Loader", () => ({ loadD3: jest.fn() }));

// Minimal chainable D3 stub: every call returns the same chainable object,
// except max(), which renderChart uses synchronously (yMax * 1.1) before any
// further D3 chaining and so needs a real number back, not the chain object.
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
    apply: () => chain
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
                StageName: { value: "Prospecting" },
                Amount: { sum: { value: 1000 } }
              }
            }
          },
          {
            node: {
              aggregate: {
                StageName: { value: "Closed Won" },
                Amount: { sum: { value: 5000 } }
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

// A record-query response an admin's free-text graphqlQuery would return.
// The chart aggregates these rows client-side by groupByField/valueField.
const FREE_TEXT_RESPONSE = {
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
            node: { StageName: { value: "Closed Won" }, Amount: { value: 500 } }
          }
        ]
      }
    }
  }
};

const FREE_TEXT_QUERY =
  "query { uiapi { query { Opportunity { edges { node { StageName { value } Amount { value } } } } } } }";

async function flushPromises() {
  return Promise.resolve();
}

describe("d3BarChartGraphql GraphQL path", () => {
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

  it("renders the chart container when GraphQL aggregate data arrives", async () => {
    const element = createElement("c-d3-bar-chart-graphql", {
      is: D3BarChartGraphql
    });
    element.objectApiName = "Opportunity";
    element.groupByField = "StageName";
    element.valueField = "Amount";
    element.operation = "Sum";
    document.body.appendChild(element);

    await flushPromises(); // connectedCallback (loadD3 + loadData early-return)
    graphql.emit(AGG_RESPONSE);
    await flushPromises();
    await flushPromises();

    expect(element.shadowRoot.querySelector(".chart-container")).not.toBeNull();
    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).toBeNull();
  });

  it("keeps the loading spinner up while the wire is provisioned and awaiting its first emission", async () => {
    const element = createElement("c-d3-bar-chart-graphql", {
      is: D3BarChartGraphql
    });
    element.objectApiName = "Opportunity";
    element.groupByField = "StageName";
    element.valueField = "Amount";
    element.operation = "Sum";
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

    graphql.emit(AGG_RESPONSE);
    await flushPromises();
    await flushPromises();

    // Emission clears the spinner and shows the chart.
    expect(element.shadowRoot.querySelector("lightning-spinner")).toBeNull();
    expect(element.shadowRoot.querySelector(".chart-container")).not.toBeNull();
  });

  it("shows an error when the GraphQL wire emits errors", async () => {
    const element = createElement("c-d3-bar-chart-graphql", {
      is: D3BarChartGraphql
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

  it("falls back to a raw record query for Count and draws a real bar mark", async () => {
    const calls = [];
    const chain = new Proxy(function () {}, {
      get: (target, prop) => {
        if (prop === "then") return undefined;
        if (prop === "max")
          return (arr, accessor) =>
            Math.max(...arr.map(accessor ?? ((d) => d)));
        return (...args) => {
          calls.push([prop, ...args]);
          return chain;
        };
      },
      apply: () => chain
    });
    loadD3.mockResolvedValue(chain);

    const element = createElement("c-d3-bar-chart-graphql", {
      is: D3BarChartGraphql
    });
    element.objectApiName = "Opportunity";
    element.groupByField = "StageName";
    element.operation = "Count";
    document.body.appendChild(element);

    await flushPromises();
    graphql.emit(RECORD_RESPONSE);
    await flushPromises();
    await flushPromises();

    expect(element.shadowRoot.querySelector(".chart-container")).not.toBeNull();
    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).toBeNull();
    expect(
      calls.some((c) => c[0] === "attr" && c[1] === "class" && c[2] === "bar")
    ).toBe(true);

    const queryStrings = gql.mock.results.map((r) => r.value);
    expect(queryStrings.some((q) => q.includes("uiapi { query {"))).toBe(true);
  });

  it("bounds the Count-path query with the same first: value as the aggregate path", async () => {
    const element = createElement("c-d3-bar-chart-graphql", {
      is: D3BarChartGraphql
    });
    element.objectApiName = "Opportunity";
    element.groupByField = "StageName";
    element.operation = "Count";
    document.body.appendChild(element);

    await flushPromises();

    const queryStrings = gql.mock.results.map((r) => r.value);
    expect(queryStrings.some((q) => q.includes("first: 2000"))).toBe(true);
  });

  it("uses a free-text graphqlQuery verbatim and aggregates the rows client-side", async () => {
    const element = createElement("c-d3-bar-chart-graphql", {
      is: D3BarChartGraphql
    });
    element.graphqlQuery = FREE_TEXT_QUERY;
    element.objectApiName = "Opportunity";
    element.groupByField = "StageName";
    element.valueField = "Amount";
    element.operation = "Sum";
    document.body.appendChild(element);

    await flushPromises();
    graphql.emit(FREE_TEXT_RESPONSE);
    await flushPromises();
    await flushPromises();

    expect(element.shadowRoot.querySelector(".chart-container")).not.toBeNull();
    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).toBeNull();

    // The admin's document is passed to gql verbatim; the structured aggregate
    // builder (which emits a groupBy clause) is never used.
    const queryStrings = gql.mock.results.map((r) => r.value);
    expect(queryStrings.some((q) => q.includes(FREE_TEXT_QUERY))).toBe(true);
    expect(queryStrings.every((q) => !q.includes("groupBy"))).toBe(true);
  });

  it("surfaces wire errors from a free-text graphqlQuery in the error state", async () => {
    const element = createElement("c-d3-bar-chart-graphql", {
      is: D3BarChartGraphql
    });
    element.graphqlQuery = FREE_TEXT_QUERY;
    element.objectApiName = "Opportunity";
    element.groupByField = "StageName";
    element.valueField = "Amount";
    element.operation = "Sum";
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
    const element = createElement("c-d3-bar-chart-graphql", {
      is: D3BarChartGraphql
    });
    element.graphqlQuery = FREE_TEXT_QUERY;
    element.objectApiName = "Opportunity";
    element.groupByField = "StageName";
    element.valueField = "Amount";
    element.operation = "Sum";
    document.body.appendChild(element);

    await flushPromises();
    graphql.emit({ uiapi: { aggregate: { Opportunity: { edges: [] } } } });
    await flushPromises();

    const err = element.shadowRoot.querySelector(".slds-text-color_error");
    expect(err).not.toBeNull();
    expect(err.textContent).toMatch(/record query/i);
  });

  it("ignores a blank graphqlQuery and falls through to the structured builder", async () => {
    const element = createElement("c-d3-bar-chart-graphql", {
      is: D3BarChartGraphql
    });
    element.graphqlQuery = "   ";
    element.objectApiName = "Opportunity";
    element.groupByField = "StageName";
    element.valueField = "Amount";
    element.operation = "Sum";
    document.body.appendChild(element);

    await flushPromises();
    graphql.emit(AGG_RESPONSE);
    await flushPromises();
    await flushPromises();

    expect(element.shadowRoot.querySelector(".chart-container")).not.toBeNull();
    const queryStrings = gql.mock.results.map((r) => r.value);
    expect(queryStrings.some((q) => q.includes("groupBy"))).toBe(true);
  });
});
