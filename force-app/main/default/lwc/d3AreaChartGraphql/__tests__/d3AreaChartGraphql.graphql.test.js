// ABOUTME: Tests the GraphQL self-fetch path on the standalone d3AreaChartGraphql bundle.
// ABOUTME: Area never aggregates server-side — both the structured record query and
// ABOUTME: the free-text graphqlQuery override fetch raw date/value/series records and
// ABOUTME: feed the same processTimeSeriesData path, so the two paths match by construction.
import { createElement } from "lwc";
import D3AreaChartGraphql from "c/d3AreaChartGraphql";
import { graphql, gql } from "lightning/graphql";
import { loadD3 } from "../d3Loader";

jest.mock("../d3Loader", () => ({ loadD3: jest.fn() }));

// Value-axis chart: renderChart calls d3.max/min/extent to build scales, so the
// stub must compute those for real (a naive always-chain stub crashes the jest
// worker on numeric usage like `d3.max(...) * 1.1`).
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
      return (...args) => {
        calls.push([prop, ...args]);
        return chain;
      };
    },
    apply: () => chain
  });
  return { chain, calls };
}

// A single-series record response the structured record query returns.
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
          }
        ]
      }
    }
  }
};

// A free-text response keyed by an object (Contact) that differs from any set
// objectApiName — normalizeRecordsGeneric must auto-detect the key so a blank
// objectApiName still normalizes.
const CONTACT_FREE_TEXT_RESPONSE = {
  uiapi: {
    query: {
      Contact: {
        edges: [
          {
            node: {
              CreatedDate: { value: "2024-01-15" },
              AnnualRevenue: { value: 100 }
            }
          },
          {
            node: {
              CreatedDate: { value: "2024-02-15" },
              AnnualRevenue: { value: 200 }
            }
          }
        ]
      }
    }
  }
};

const CONTACT_FREE_TEXT_QUERY =
  "query { uiapi { query { Contact { edges { node { CreatedDate { value } AnnualRevenue { value } } } } } } }";

// A multi-series free-text response — two series, distinct (date, series) keys.
const MULTI_SERIES_FREE_TEXT_RESPONSE = {
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
              Amount: { value: 50 },
              StageName: { value: "Lost" }
            }
          },
          {
            node: {
              CloseDate: { value: "2024-02-15" },
              Amount: { value: 75 },
              StageName: { value: "Lost" }
            }
          }
        ]
      }
    }
  }
};

const MULTI_SERIES_FREE_TEXT_QUERY =
  "query { uiapi { query { Opportunity { edges { node { CloseDate { value } Amount { value } StageName { value } } } } } } }";

const RECORD_COLLECTION = [
  { CloseDate: "2024-01-15", Amount: 100 },
  { CloseDate: "2024-02-15", Amount: 200 }
];

async function flushPromises() {
  return Promise.resolve();
}

function countAreaPaths(calls) {
  return calls.filter(
    (c) => c[0] === "attr" && c[1] === "class" && c[2] === "area-path"
  ).length;
}

describe("d3AreaChartGraphql GraphQL path", () => {
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

  // ═══════════════════════════════════════════════════════════════
  // STRUCTURED RECORD-QUERY PATH
  // ═══════════════════════════════════════════════════════════════

  it("renders the chart and draws the area when structured GraphQL record data arrives", async () => {
    const element = createElement("c-d3-area-chart-graphql", {
      is: D3AreaChartGraphql
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

    // Prove renderChart actually ran (not just that the wire populated data):
    // an "area-path" must have been appended with a "d" attribute.
    expect(countAreaPaths(d3Calls)).toBeGreaterThan(0);
  });

  it("keeps the loading spinner up while the wire is provisioned and awaiting its first emission", async () => {
    const element = createElement("c-d3-area-chart-graphql", {
      is: D3AreaChartGraphql
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
    const element = createElement("c-d3-area-chart-graphql", {
      is: D3AreaChartGraphql
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

  it("bounds the structured query with first: 2000", async () => {
    const element = createElement("c-d3-area-chart-graphql", {
      is: D3AreaChartGraphql
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
    const element = createElement("c-d3-area-chart-graphql", {
      is: D3AreaChartGraphql
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

  // ═══════════════════════════════════════════════════════════════
  // FREE-TEXT graphqlQuery OVERRIDE
  // ═══════════════════════════════════════════════════════════════

  it("uses a free-text graphqlQuery verbatim and charts the rows, auto-detecting a blank objectApiName", async () => {
    const element = createElement("c-d3-area-chart-graphql", {
      is: D3AreaChartGraphql
    });
    // No objectApiName: the free-text query targets Contact and the normalizer
    // must auto-detect that key from the payload.
    element.graphqlQuery = CONTACT_FREE_TEXT_QUERY;
    element.dateField = "CreatedDate";
    element.valueField = "AnnualRevenue";
    document.body.appendChild(element);

    await flushPromises();
    graphql.emit(CONTACT_FREE_TEXT_RESPONSE);
    await flushPromises();
    await flushPromises();

    expect(element.shadowRoot.querySelector(".chart-container")).not.toBeNull();
    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).toBeNull();
    expect(countAreaPaths(d3Calls)).toBeGreaterThan(0);

    // The admin's document is passed to gql verbatim; the structured record
    // builder (which appends `first:`) is never used.
    const queryStrings = gql.mock.results.map((r) => r.value);
    expect(queryStrings.some((q) => q.includes(CONTACT_FREE_TEXT_QUERY))).toBe(
      true
    );
    expect(queryStrings.every((q) => !q.includes("first:"))).toBe(true);
  });

  it("surfaces wire errors from a free-text graphqlQuery in the error state", async () => {
    const element = createElement("c-d3-area-chart-graphql", {
      is: D3AreaChartGraphql
    });
    element.graphqlQuery = CONTACT_FREE_TEXT_QUERY;
    element.dateField = "CreatedDate";
    element.valueField = "AnnualRevenue";
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
    const element = createElement("c-d3-area-chart-graphql", {
      is: D3AreaChartGraphql
    });
    element.graphqlQuery = CONTACT_FREE_TEXT_QUERY;
    element.dateField = "CreatedDate";
    element.valueField = "AnnualRevenue";
    document.body.appendChild(element);

    await flushPromises();
    graphql.emit({ uiapi: { aggregate: { Contact: { edges: [] } } } });
    await flushPromises();

    const err = element.shadowRoot.querySelector(".slds-text-color_error");
    expect(err).not.toBeNull();
    expect(err.textContent).toMatch(/record query/i);
  });

  it("ignores a blank graphqlQuery and falls through to the structured builder", async () => {
    const element = createElement("c-d3-area-chart-graphql", {
      is: D3AreaChartGraphql
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
    const queryStrings = gql.mock.results.map((r) => r.value);
    expect(queryStrings.some((q) => q.includes("first: 2000"))).toBe(true);
    expect(queryStrings.some((q) => q.includes("CloseDate { value }"))).toBe(
      true
    );
  });

  it("lets recordCollection win over a set graphqlQuery (wire never provisioned)", async () => {
    const element = createElement("c-d3-area-chart-graphql", {
      is: D3AreaChartGraphql
    });
    element.recordCollection = RECORD_COLLECTION;
    element.graphqlQuery = CONTACT_FREE_TEXT_QUERY;
    element.dateField = "CloseDate";
    element.valueField = "Amount";
    document.body.appendChild(element);

    await flushPromises();
    await flushPromises();

    // recordCollection renders synchronously; gqlQuery returns undefined so the
    // free-text document is never sent to the wire.
    expect(element.shadowRoot.querySelector(".chart-container")).not.toBeNull();
    const queryStrings = gql.mock.results.map((r) => r.value);
    expect(
      queryStrings.every((q) => !q.includes(CONTACT_FREE_TEXT_QUERY))
    ).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════
  // MULTI-SERIES PARITY (stacked vs overlapping across data paths)
  // ═══════════════════════════════════════════════════════════════

  it("charts every series from a multi-series free-text response (overlapping, no client-side summation)", async () => {
    const element = createElement("c-d3-area-chart-graphql", {
      is: D3AreaChartGraphql
    });
    element.graphqlQuery = MULTI_SERIES_FREE_TEXT_QUERY;
    element.objectApiName = "Opportunity";
    element.dateField = "CloseDate";
    element.valueField = "Amount";
    element.seriesField = "StageName";
    document.body.appendChild(element);

    await flushPromises();
    graphql.emit(MULTI_SERIES_FREE_TEXT_RESPONSE);
    await flushPromises();
    await flushPromises();

    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).toBeNull();
    // Two series in, two overlapping areas out — the free-text path feeds the
    // same processTimeSeriesData as the structured path (no aggregation collapse).
    expect(countAreaPaths(d3Calls)).toBe(2);
  });

  it("preserves stacked rendering on the free-text path", async () => {
    const element = createElement("c-d3-area-chart-graphql", {
      is: D3AreaChartGraphql
    });
    element.graphqlQuery = MULTI_SERIES_FREE_TEXT_QUERY;
    element.objectApiName = "Opportunity";
    element.dateField = "CloseDate";
    element.valueField = "Amount";
    element.seriesField = "StageName";
    element.advancedConfig = JSON.stringify({ areaMode: "stacked" });
    document.body.appendChild(element);

    await flushPromises();
    graphql.emit(MULTI_SERIES_FREE_TEXT_RESPONSE);
    await flushPromises();
    await flushPromises();

    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).toBeNull();
    // Stacked mode routes through d3.stack(); overlapping mode never calls it.
    expect(d3Calls.some((c) => c[0] === "stack")).toBe(true);
  });
});
