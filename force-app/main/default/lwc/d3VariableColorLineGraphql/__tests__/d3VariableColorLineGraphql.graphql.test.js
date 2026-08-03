// ABOUTME: Tests the GraphQL self-fetch path on the standalone d3VariableColorLineGraphql bundle.
// ABOUTME: This chart has no server-side aggregate — it fetches raw dateField/valueField
// ABOUTME: records (structured builder or a free-text graphqlQuery override) and feeds the
// ABOUTME: existing processTimeSeriesData / threshold-gradient pipeline.
import { createElement } from "lwc";
import D3VariableColorLineGraphql from "c/d3VariableColorLineGraphql";
import { graphql, gql } from "lightning/graphql";
import { loadD3 } from "../d3Loader";

jest.mock("../d3Loader", () => ({ loadD3: jest.fn() }));

// Value-axis chart: renderChart calls d3.max/min/extent to build scales, and
// ALSO evaluates xScale(...) numerically (subtracting two calls to compute
// the gradient's total pixel span), so unlike the plain CT-REC template the
// `apply` trap must return a real number (0), not the chain object.
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
    apply: () => 0
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
              Amount: { value: -50 }
            }
          },
          {
            node: {
              CloseDate: { value: "2024-02-15" },
              Amount: { value: 100 }
            }
          }
        ]
      }
    }
  }
};

// A record-query response an admin's free-text graphqlQuery would return. Same
// envelope shape as the structured path — the chart date-parses and renders it.
const FREE_TEXT_RESPONSE = RECORD_RESPONSE;

const FREE_TEXT_QUERY =
  "query { uiapi { query { Opportunity { edges { node { CloseDate { value } Amount { value } } } } } } }";

async function flushPromises() {
  return Promise.resolve();
}

describe("d3VariableColorLineGraphql GraphQL path", () => {
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

  it("renders the chart container and draws the threshold-gradient line when GraphQL record data arrives", async () => {
    const element = createElement("c-d3-variable-color-line-graphql", {
      is: D3VariableColorLineGraphql
    });
    element.objectApiName = "Opportunity";
    element.dateField = "CloseDate";
    element.valueField = "Amount";
    document.body.appendChild(element);

    await flushPromises(); // connectedCallback (loadD3 + loadData early-return)
    graphql.emit(RECORD_RESPONSE);
    await flushPromises();
    await flushPromises();

    expect(element.shadowRoot.querySelector(".chart-container")).not.toBeNull();
    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).toBeNull();

    // Prove renderChart actually ran: a "line" path was appended AND a
    // linearGradient with stops (the threshold-coloring mechanism) was built.
    expect(
      d3Calls.some(
        (c) => c[0] === "attr" && c[1] === "class" && c[2] === "line"
      )
    ).toBe(true);
    expect(
      d3Calls.some((c) => c[0] === "append" && c[1] === "linearGradient")
    ).toBe(true);
    expect(d3Calls.some((c) => c[0] === "append" && c[1] === "stop")).toBe(
      true
    );
  });

  it("keeps the loading spinner up while the wire is provisioned and awaiting its first emission", async () => {
    const element = createElement("c-d3-variable-color-line-graphql", {
      is: D3VariableColorLineGraphql
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
    expect(element.shadowRoot.querySelector(".chart-container")).not.toBeNull();
  });

  it("shows an error when the GraphQL wire emits errors", async () => {
    const element = createElement("c-d3-variable-color-line-graphql", {
      is: D3VariableColorLineGraphql
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

  it("bounds the query with the same first: value as other record-fetch charts", async () => {
    const element = createElement("c-d3-variable-color-line-graphql", {
      is: D3VariableColorLineGraphql
    });
    element.objectApiName = "Opportunity";
    element.dateField = "CloseDate";
    element.valueField = "Amount";
    document.body.appendChild(element);

    await flushPromises();

    const queryStrings = gql.mock.results.map((r) => r.value);
    expect(queryStrings.some((q) => q.includes("first: 2000"))).toBe(true);
  });

  it("requests only dateField and valueField, deduped", async () => {
    const element = createElement("c-d3-variable-color-line-graphql", {
      is: D3VariableColorLineGraphql
    });
    element.objectApiName = "Opportunity";
    // dateField repeats valueField's name on purpose to prove deduping.
    element.dateField = "Amount";
    element.valueField = "Amount";
    document.body.appendChild(element);

    await flushPromises();

    const queryStrings = gql.mock.results.map((r) => r.value);
    const query = queryStrings[queryStrings.length - 1];
    expect(query.match(/Amount \{/g).length).toBe(1);
  });

  it("does not provision the wire when valueField is missing", async () => {
    const element = createElement("c-d3-variable-color-line-graphql", {
      is: D3VariableColorLineGraphql
    });
    element.objectApiName = "Opportunity";
    element.dateField = "CloseDate";
    element.valueField = "";
    document.body.appendChild(element);

    await flushPromises();

    expect(gql).not.toHaveBeenCalled();
  });

  it("uses a free-text graphqlQuery verbatim and feeds the record pipeline", async () => {
    const element = createElement("c-d3-variable-color-line-graphql", {
      is: D3VariableColorLineGraphql
    });
    element.graphqlQuery = FREE_TEXT_QUERY;
    element.objectApiName = "Opportunity";
    element.dateField = "CloseDate";
    element.valueField = "Amount";
    document.body.appendChild(element);

    await flushPromises();
    graphql.emit(FREE_TEXT_RESPONSE);
    await flushPromises();
    await flushPromises();

    expect(element.shadowRoot.querySelector(".chart-container")).not.toBeNull();
    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).toBeNull();

    // The admin's document is passed to gql verbatim; the structured record
    // builder (which emits a `uiapi { query {` with a first: bound) is skipped.
    const queryStrings = gql.mock.results.map((r) => r.value);
    expect(queryStrings.some((q) => q.includes(FREE_TEXT_QUERY))).toBe(true);
    expect(queryStrings.every((q) => !q.includes("first:"))).toBe(true);
  });

  it("auto-detects the object key for a free-text query with a blank objectApiName", async () => {
    const element = createElement("c-d3-variable-color-line-graphql", {
      is: D3VariableColorLineGraphql
    });
    element.graphqlQuery = FREE_TEXT_QUERY;
    element.objectApiName = ""; // blank: normalizeRecordsGeneric must auto-detect
    element.dateField = "CloseDate";
    element.valueField = "Amount";
    document.body.appendChild(element);

    await flushPromises();
    graphql.emit(FREE_TEXT_RESPONSE);
    await flushPromises();
    await flushPromises();

    // The first object key under uiapi.query is used, so the rows still normalize.
    expect(element.shadowRoot.querySelector(".chart-container")).not.toBeNull();
    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).toBeNull();
  });

  it("surfaces wire errors from a free-text graphqlQuery in the error state", async () => {
    const element = createElement("c-d3-variable-color-line-graphql", {
      is: D3VariableColorLineGraphql
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
    const element = createElement("c-d3-variable-color-line-graphql", {
      is: D3VariableColorLineGraphql
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
    const element = createElement("c-d3-variable-color-line-graphql", {
      is: D3VariableColorLineGraphql
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

    expect(element.shadowRoot.querySelector(".chart-container")).not.toBeNull();
    // The structured builder ran: its bounded record query carries a first: arg.
    const queryStrings = gql.mock.results.map((r) => r.value);
    expect(queryStrings.some((q) => q.includes("first: 2000"))).toBe(true);
  });

  it("recordCollection beats a set graphqlQuery (wire never provisioned)", async () => {
    const element = createElement("c-d3-variable-color-line-graphql", {
      is: D3VariableColorLineGraphql
    });
    element.recordCollection = [
      { CloseDate: "2024-01-01", Amount: -20 },
      { CloseDate: "2024-02-01", Amount: 80 }
    ];
    element.graphqlQuery = FREE_TEXT_QUERY;
    element.dateField = "CloseDate";
    element.valueField = "Amount";
    document.body.appendChild(element);

    await flushPromises();
    await flushPromises();

    // recordCollection wins: the chart renders from it and the free-text wire is
    // never built (gqlQuery short-circuits before touching gql).
    expect(element.shadowRoot.querySelector(".chart-container")).not.toBeNull();
    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).toBeNull();
    expect(gql).not.toHaveBeenCalled();
  });
});
