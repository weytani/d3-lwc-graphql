// ABOUTME: Tests the GraphQL self-fetch path on the standalone d3StepChartGraphql bundle.
// ABOUTME: Step has no server-side aggregate — the structured path fetches raw
// ABOUTME: dateField/valueField/seriesField records and feeds processTimeSeriesData;
// ABOUTME: the free-text graphqlQuery admin override shapes the same way.
import { createElement } from "lwc";
import D3StepChartGraphql from "c/d3StepChartGraphql";
import { graphql, gql } from "lightning/graphql";
import { loadD3 } from "../d3Loader";

jest.mock("../d3Loader", () => ({ loadD3: jest.fn() }));

// Value-axis chart: renderChart calls d3.max/min/extent to build scales, so the
// stub must compute those for real, and node().getTotalLength() must return a
// real number (the line-draw animation compares it numerically).
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
// chart shapes these rows client-side into the time series (date/value/series).
const FREE_TEXT_QUERY =
  "query { uiapi { query { Opportunity { edges { node { CloseDate { value } Amount { value } } } } } } }";

async function flushPromises() {
  return Promise.resolve();
}

describe("d3StepChartGraphql GraphQL path", () => {
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

  it("renders the chart container and actually draws the step line when structured GraphQL record data arrives", async () => {
    const element = createElement("c-d3-step-chart-graphql", {
      is: D3StepChartGraphql
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
    // a "line" path must have been appended with a "class" attribute.
    expect(
      d3Calls.some(
        (c) => c[0] === "attr" && c[1] === "class" && c[2] === "line"
      )
    ).toBe(true);
  });

  it("keeps the loading spinner up while the wire is provisioned and awaiting its first emission", async () => {
    const element = createElement("c-d3-step-chart-graphql", {
      is: D3StepChartGraphql
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

    // Emission clears the spinner and shows the chart.
    expect(element.shadowRoot.querySelector("lightning-spinner")).toBeNull();
    expect(element.shadowRoot.querySelector(".chart-container")).not.toBeNull();
  });

  it("shows an error when the GraphQL wire emits errors", async () => {
    const element = createElement("c-d3-step-chart-graphql", {
      is: D3StepChartGraphql
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

  it("bounds the structured query with a first: 2000 record cap", async () => {
    const element = createElement("c-d3-step-chart-graphql", {
      is: D3StepChartGraphql
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
    const element = createElement("c-d3-step-chart-graphql", {
      is: D3StepChartGraphql
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

  it("uses a free-text graphqlQuery verbatim and shapes the rows client-side", async () => {
    const element = createElement("c-d3-step-chart-graphql", {
      is: D3StepChartGraphql
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

    expect(element.shadowRoot.querySelector(".chart-container")).not.toBeNull();
    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).toBeNull();

    // The admin's document is passed to gql verbatim; the structured record
    // builder (which emits a first: bound) is never used.
    const queryStrings = gql.mock.results.map((r) => r.value);
    expect(queryStrings.some((q) => q.includes(FREE_TEXT_QUERY))).toBe(true);
    expect(queryStrings.every((q) => !q.includes("first: 2000"))).toBe(true);
  });

  it("auto-detects the object key for a free-text query when objectApiName is blank", async () => {
    // A free-text query can target any object; with objectApiName left blank the
    // record normalizer auto-detects the first object key under uiapi.query.
    const AUTODETECT_RESPONSE = {
      uiapi: {
        query: {
          MyCustomObject__c: {
            edges: [
              {
                node: {
                  CloseDate: { value: "2024-01-01" },
                  Amount: { value: 100 }
                }
              },
              {
                node: {
                  CloseDate: { value: "2024-02-01" },
                  Amount: { value: 200 }
                }
              }
            ]
          }
        }
      }
    };

    const element = createElement("c-d3-step-chart-graphql", {
      is: D3StepChartGraphql
    });
    element.graphqlQuery =
      "query { uiapi { query { MyCustomObject__c { edges { node { CloseDate { value } Amount { value } } } } } } }";
    // objectApiName intentionally left blank — the normalizer must auto-detect.
    element.dateField = "CloseDate";
    element.valueField = "Amount";
    document.body.appendChild(element);

    await flushPromises();
    graphql.emit(AUTODETECT_RESPONSE);
    await flushPromises();
    await flushPromises();

    expect(element.shadowRoot.querySelector(".chart-container")).not.toBeNull();
    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).toBeNull();
    // The step line was drawn from the auto-detected object's rows.
    expect(
      d3Calls.some(
        (c) => c[0] === "attr" && c[1] === "class" && c[2] === "line"
      )
    ).toBe(true);
  });

  it("plots duplicate (date, series) rows as distinct points on the free-text path (no client-side summation)", async () => {
    // Step is a raw-record time-series chart: its structured path fetches raw
    // records (buildRecordQuery, no server aggregate), so the free-text path must
    // NOT sum duplicate keys — every row stays a distinct point, matching the
    // structured raw path. Two rows at the same date + series => two points.
    const DUP_RESPONSE = {
      uiapi: {
        query: {
          Opportunity: {
            edges: [
              {
                node: {
                  CloseDate: { value: "2024-01-15" },
                  Amount: { value: 100 }
                }
              },
              {
                node: {
                  CloseDate: { value: "2024-01-15" },
                  Amount: { value: 250 }
                }
              }
            ]
          }
        }
      }
    };

    const element = createElement("c-d3-step-chart-graphql", {
      is: D3StepChartGraphql
    });
    element.graphqlQuery = FREE_TEXT_QUERY;
    element.objectApiName = "Opportunity";
    element.dateField = "CloseDate";
    element.valueField = "Amount";
    document.body.appendChild(element);

    await flushPromises();
    graphql.emit(DUP_RESPONSE);
    await flushPromises();
    await flushPromises();

    // The single ("Default") series' points array is datum'd onto the step path;
    // both same-date rows survive as separate points (length 2, not summed to 1).
    const datumCall = d3Calls.find(
      (c) => c[0] === "datum" && Array.isArray(c[1])
    );
    expect(datumCall).toBeTruthy();
    expect(datumCall[1]).toHaveLength(2);
  });

  it("surfaces wire errors from a free-text graphqlQuery in the error state", async () => {
    const element = createElement("c-d3-step-chart-graphql", {
      is: D3StepChartGraphql
    });
    element.graphqlQuery = FREE_TEXT_QUERY;
    element.objectApiName = "Opportunity";
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
    const element = createElement("c-d3-step-chart-graphql", {
      is: D3StepChartGraphql
    });
    element.graphqlQuery = FREE_TEXT_QUERY;
    element.objectApiName = "Opportunity";
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
    const element = createElement("c-d3-step-chart-graphql", {
      is: D3StepChartGraphql
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
  });

  it("recordCollection beats a set graphqlQuery", async () => {
    const element = createElement("c-d3-step-chart-graphql", {
      is: D3StepChartGraphql
    });
    element.recordCollection = [
      { CloseDate: "2024-01-01", Amount: 100 },
      { CloseDate: "2024-02-01", Amount: 200 }
    ];
    element.graphqlQuery = FREE_TEXT_QUERY;
    element.dateField = "CloseDate";
    element.valueField = "Amount";
    document.body.appendChild(element);

    await flushPromises();
    await flushPromises();

    // recordCollection wins: the chart renders from it and the un-emitted
    // free-text wire never becomes the data source (no error state).
    expect(element.shadowRoot.querySelector(".chart-container")).not.toBeNull();
    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).toBeNull();
  });

  describe("graphqlFilter JSON-string parsing", () => {
    const STRUCTURED_PROPS = {
      objectApiName: "Opportunity",
      dateField: "CloseDate",
      valueField: "Amount"
    };

    it("parses a JSON-string graphqlFilter into the structured where clause", async () => {
      const element = createElement("c-d3-step-chart-graphql", {
        is: D3StepChartGraphql
      });
      Object.assign(element, STRUCTURED_PROPS, {
        graphqlFilter: '{"field":"Name","operator":"like","value":"[D3DEMO]%"}'
      });
      document.body.appendChild(element);
      await flushPromises();
      const { query } = graphql.getLastConfig();
      expect(query).toContain('where: { Name: { like: "[D3DEMO]%" } }');
    });

    it("passes an object graphqlFilter through unchanged", async () => {
      const element = createElement("c-d3-step-chart-graphql", {
        is: D3StepChartGraphql
      });
      Object.assign(element, STRUCTURED_PROPS, {
        graphqlFilter: { field: "Name", operator: "like", value: "[D3DEMO]%" }
      });
      document.body.appendChild(element);
      await flushPromises();
      const { query } = graphql.getLastConfig();
      expect(query).toContain('where: { Name: { like: "[D3DEMO]%" } }');
    });

    it("surfaces an error and provisions no query for an unparseable JSON string", async () => {
      const element = createElement("c-d3-step-chart-graphql", {
        is: D3StepChartGraphql
      });
      Object.assign(element, STRUCTURED_PROPS, { graphqlFilter: "{not json" });
      document.body.appendChild(element);
      await flushPromises();
      // Mirror the DOM assertion used by the existing tests in this file that
      // check the error state — reuse the same error-element selector here.
      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).not.toBeNull();
      expect(graphql.getLastConfig().query).toBeUndefined();
    });

    it("treats a blank-string graphqlFilter as no filter", async () => {
      const element = createElement("c-d3-step-chart-graphql", {
        is: D3StepChartGraphql
      });
      Object.assign(element, STRUCTURED_PROPS, { graphqlFilter: "  " });
      document.body.appendChild(element);
      await flushPromises();
      const { query } = graphql.getLastConfig();
      expect(query).toBeDefined();
      expect(query).not.toContain("where:");
    });
  });
});
