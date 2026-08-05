// ABOUTME: Tests the GraphQL self-fetch path on the standalone d3DifferenceChartGraphql bundle.
// ABOUTME: Difference never aggregates server-side — both the structured record query and the
// ABOUTME: free-text graphqlQuery override fetch raw date/primary/secondary records and feed the
// ABOUTME: same processDifferenceData path, so the two paths match by construction.
import { createElement } from "lwc";
import D3DifferenceChartGraphql from "c/d3DifferenceChartGraphql";
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

// The two clipped fills are the chart's signature output; both classes applied
// proves renderChart actually ran, not merely that the wire populated data.
function drewDifferenceFill(calls) {
  const drewClass = (name) =>
    calls.some(
      (c) => c[0] === "attr" && c[1] === "class" && c[2] === `diff-area ${name}`
    );
  return drewClass("diff-area-above") && drewClass("diff-area-below");
}

// renderDifferenceAreas/renderLines bind the shaped rows with .datum(points), so
// the last such array is the chart's processed data — its length is the row count
// that survived processDifferenceData.
function shapedRows(calls) {
  const bound = calls.filter((c) => c[0] === "datum" && Array.isArray(c[1]));
  return bound.length ? bound[bound.length - 1][1] : null;
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
              ExpectedRevenue: { value: 150 }
            }
          },
          {
            node: {
              CloseDate: { value: "2024-02-15" },
              Amount: { value: 300 },
              ExpectedRevenue: { value: 200 }
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
              AnnualRevenue: { value: 100 },
              Budget__c: { value: 150 }
            }
          },
          {
            node: {
              CreatedDate: { value: "2024-02-15" },
              AnnualRevenue: { value: 300 },
              Budget__c: { value: 200 }
            }
          }
        ]
      }
    }
  }
};

const CONTACT_FREE_TEXT_QUERY =
  "query { uiapi { query { Contact { edges { node { CreatedDate { value } AnnualRevenue { value } Budget__c { value } } } } } } }";

// Four rows on two repeated dates. A raw-record chart must keep all four —
// there is no aggregation step on either path.
const DUPLICATE_DATE_RESPONSE = {
  uiapi: {
    query: {
      Opportunity: {
        edges: [
          {
            node: {
              CloseDate: { value: "2024-01-15" },
              Amount: { value: 100 },
              ExpectedRevenue: { value: 150 }
            }
          },
          {
            node: {
              CloseDate: { value: "2024-01-15" },
              Amount: { value: 250 },
              ExpectedRevenue: { value: 120 }
            }
          },
          {
            node: {
              CloseDate: { value: "2024-02-15" },
              Amount: { value: 300 },
              ExpectedRevenue: { value: 200 }
            }
          },
          {
            node: {
              CloseDate: { value: "2024-02-15" },
              Amount: { value: 80 },
              ExpectedRevenue: { value: 260 }
            }
          }
        ]
      }
    }
  }
};

const OPPORTUNITY_FREE_TEXT_QUERY =
  "query { uiapi { query { Opportunity { edges { node { CloseDate { value } Amount { value } ExpectedRevenue { value } } } } } } }";

const RECORD_COLLECTION = [
  { CloseDate: "2024-01-15", Amount: 100, ExpectedRevenue: 150 },
  { CloseDate: "2024-02-15", Amount: 300, ExpectedRevenue: 200 }
];

async function flushPromises() {
  return Promise.resolve();
}

describe("d3DifferenceChartGraphql GraphQL path", () => {
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

  it("renders the chart and draws the difference fill when structured GraphQL record data arrives", async () => {
    const element = createElement("c-d3-difference-chart-graphql", {
      is: D3DifferenceChartGraphql
    });
    element.objectApiName = "Opportunity";
    element.dateField = "CloseDate";
    element.primaryField = "Amount";
    element.secondaryField = "ExpectedRevenue";
    document.body.appendChild(element);

    await flushPromises(); // connectedCallback (loadD3 + loadData early-return)
    graphql.emit(RECORD_RESPONSE);
    await flushPromises();
    await flushPromises();

    expect(element.shadowRoot.querySelector(".chart-container")).not.toBeNull();
    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).toBeNull();
    expect(drewDifferenceFill(d3Calls)).toBe(true);
  });

  it("keeps the loading spinner up while the wire is provisioned and awaiting its first emission", async () => {
    const element = createElement("c-d3-difference-chart-graphql", {
      is: D3DifferenceChartGraphql
    });
    element.objectApiName = "Opportunity";
    element.dateField = "CloseDate";
    element.primaryField = "Amount";
    element.secondaryField = "ExpectedRevenue";
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
    const element = createElement("c-d3-difference-chart-graphql", {
      is: D3DifferenceChartGraphql
    });
    element.objectApiName = "Opportunity";
    element.dateField = "CloseDate";
    element.primaryField = "Amount";
    element.secondaryField = "ExpectedRevenue";
    document.body.appendChild(element);

    await flushPromises();
    graphql.emitErrors([{ message: "boom" }]);
    await flushPromises();

    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).not.toBeNull();
  });

  it("bounds the structured query with first: 2000", async () => {
    const element = createElement("c-d3-difference-chart-graphql", {
      is: D3DifferenceChartGraphql
    });
    element.objectApiName = "Opportunity";
    element.dateField = "CloseDate";
    element.primaryField = "Amount";
    element.secondaryField = "ExpectedRevenue";
    document.body.appendChild(element);

    await flushPromises();

    const queryStrings = gql.mock.results.map((r) => r.value);
    expect(queryStrings.some((q) => q.includes("first: 2000"))).toBe(true);
  });

  it("requests dateField, primaryField, and secondaryField, deduped", async () => {
    const element = createElement("c-d3-difference-chart-graphql", {
      is: D3DifferenceChartGraphql
    });
    element.objectApiName = "Opportunity";
    element.dateField = "CloseDate";
    element.primaryField = "Amount";
    // secondaryField repeats primaryField on purpose to prove deduping.
    element.secondaryField = "Amount";
    document.body.appendChild(element);

    await flushPromises();

    const queryStrings = gql.mock.results.map((r) => r.value);
    const query = queryStrings[queryStrings.length - 1];
    expect(query).toContain("CloseDate {");
    expect(query).toContain("Amount {");
    expect(query.match(/Amount \{/g).length).toBe(1);
  });

  it("does not provision the wire when secondaryField is missing", async () => {
    const element = createElement("c-d3-difference-chart-graphql", {
      is: D3DifferenceChartGraphql
    });
    element.objectApiName = "Opportunity";
    element.dateField = "CloseDate";
    element.primaryField = "Amount";
    element.secondaryField = "";
    document.body.appendChild(element);

    await flushPromises();

    expect(gql).not.toHaveBeenCalled();
  });

  // ═══════════════════════════════════════════════════════════════
  // FREE-TEXT graphqlQuery OVERRIDE
  // ═══════════════════════════════════════════════════════════════

  it("uses a free-text graphqlQuery verbatim and charts the rows, auto-detecting a blank objectApiName", async () => {
    const element = createElement("c-d3-difference-chart-graphql", {
      is: D3DifferenceChartGraphql
    });
    // No objectApiName: the free-text query targets Contact and the normalizer
    // must auto-detect that key from the payload.
    element.graphqlQuery = CONTACT_FREE_TEXT_QUERY;
    element.dateField = "CreatedDate";
    element.primaryField = "AnnualRevenue";
    element.secondaryField = "Budget__c";
    document.body.appendChild(element);

    await flushPromises();
    graphql.emit(CONTACT_FREE_TEXT_RESPONSE);
    await flushPromises();
    await flushPromises();

    expect(element.shadowRoot.querySelector(".chart-container")).not.toBeNull();
    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).toBeNull();
    expect(drewDifferenceFill(d3Calls)).toBe(true);

    // The admin's document is passed to gql verbatim; the structured record
    // builder (which appends `first:`) is never used.
    const queryStrings = gql.mock.results.map((r) => r.value);
    expect(queryStrings.some((q) => q.includes(CONTACT_FREE_TEXT_QUERY))).toBe(
      true
    );
    expect(queryStrings.every((q) => !q.includes("first:"))).toBe(true);
  });

  it("surfaces wire errors from a free-text graphqlQuery in the error state", async () => {
    const element = createElement("c-d3-difference-chart-graphql", {
      is: D3DifferenceChartGraphql
    });
    element.graphqlQuery = CONTACT_FREE_TEXT_QUERY;
    element.dateField = "CreatedDate";
    element.primaryField = "AnnualRevenue";
    element.secondaryField = "Budget__c";
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
    const element = createElement("c-d3-difference-chart-graphql", {
      is: D3DifferenceChartGraphql
    });
    element.graphqlQuery = CONTACT_FREE_TEXT_QUERY;
    element.dateField = "CreatedDate";
    element.primaryField = "AnnualRevenue";
    element.secondaryField = "Budget__c";
    document.body.appendChild(element);

    await flushPromises();
    graphql.emit({ uiapi: { aggregate: { Contact: { edges: [] } } } });
    await flushPromises();

    const err = element.shadowRoot.querySelector(".slds-text-color_error");
    expect(err).not.toBeNull();
    expect(err.textContent).toMatch(/record query/i);
  });

  it("ignores a blank graphqlQuery and falls through to the structured builder", async () => {
    const element = createElement("c-d3-difference-chart-graphql", {
      is: D3DifferenceChartGraphql
    });
    element.graphqlQuery = "   ";
    element.objectApiName = "Opportunity";
    element.dateField = "CloseDate";
    element.primaryField = "Amount";
    element.secondaryField = "ExpectedRevenue";
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
    const element = createElement("c-d3-difference-chart-graphql", {
      is: D3DifferenceChartGraphql
    });
    element.recordCollection = RECORD_COLLECTION;
    element.graphqlQuery = CONTACT_FREE_TEXT_QUERY;
    element.dateField = "CloseDate";
    element.primaryField = "Amount";
    element.secondaryField = "ExpectedRevenue";
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
  // PATH PARITY (raw records, no client-side summation on either path)
  // ═══════════════════════════════════════════════════════════════

  it("keeps every raw row on the free-text path — repeated dates are not summed", async () => {
    const element = createElement("c-d3-difference-chart-graphql", {
      is: D3DifferenceChartGraphql
    });
    element.graphqlQuery = OPPORTUNITY_FREE_TEXT_QUERY;
    element.objectApiName = "Opportunity";
    element.dateField = "CloseDate";
    element.primaryField = "Amount";
    element.secondaryField = "ExpectedRevenue";
    document.body.appendChild(element);

    await flushPromises();
    graphql.emit(DUPLICATE_DATE_RESPONSE);
    await flushPromises();
    await flushPromises();

    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).toBeNull();
    // Four source records on two dates stay four plotted rows: the difference
    // chart shapes raw records and never aggregates.
    const rows = shapedRows(d3Calls);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.primary)).toEqual([100, 250, 300, 80]);
  });

  it("shapes an identical payload identically on the structured and free-text paths", async () => {
    const structured = createElement("c-d3-difference-chart-graphql", {
      is: D3DifferenceChartGraphql
    });
    structured.objectApiName = "Opportunity";
    structured.dateField = "CloseDate";
    structured.primaryField = "Amount";
    structured.secondaryField = "ExpectedRevenue";
    document.body.appendChild(structured);
    await flushPromises();
    graphql.emit(DUPLICATE_DATE_RESPONSE);
    await flushPromises();
    await flushPromises();
    const structuredRows = shapedRows(d3Calls);

    // Fresh stub so the second element's calls are isolated from the first.
    const stub = makeD3Stub();
    loadD3.mockResolvedValue(stub.chain);

    const freeText = createElement("c-d3-difference-chart-graphql", {
      is: D3DifferenceChartGraphql
    });
    freeText.graphqlQuery = OPPORTUNITY_FREE_TEXT_QUERY;
    freeText.objectApiName = "Opportunity";
    freeText.dateField = "CloseDate";
    freeText.primaryField = "Amount";
    freeText.secondaryField = "ExpectedRevenue";
    document.body.appendChild(freeText);
    await flushPromises();
    graphql.emit(DUPLICATE_DATE_RESPONSE);
    await flushPromises();
    await flushPromises();
    const freeTextRows = shapedRows(stub.calls);

    // One shaping path serves both wires, so the two must agree row for row.
    expect(freeTextRows.map((r) => [r.primary, r.secondary])).toEqual(
      structuredRows.map((r) => [r.primary, r.secondary])
    );
  });

  describe("graphqlFilter JSON-string parsing", () => {
    const STRUCTURED_PROPS = {
      objectApiName: "Opportunity",
      dateField: "CloseDate",
      primaryField: "Amount",
      secondaryField: "ExpectedRevenue"
    };

    it("parses a JSON-string graphqlFilter into the structured where clause", async () => {
      const element = createElement("c-d3-difference-chart-graphql", {
        is: D3DifferenceChartGraphql
      });
      Object.assign(element, STRUCTURED_PROPS, {
        graphqlFilter: '{"field":"Name","operator":"like","value":"[D3DEMO]%"}'
      });
      document.body.appendChild(element);
      await flushPromises();

      const queryStrings = gql.mock.results.map((r) => r.value);
      expect(
        queryStrings.some((q) =>
          q.includes('where: { Name: { like: "[D3DEMO]%" } }')
        )
      ).toBe(true);
    });

    it("passes an object graphqlFilter through unchanged", async () => {
      const element = createElement("c-d3-difference-chart-graphql", {
        is: D3DifferenceChartGraphql
      });
      Object.assign(element, STRUCTURED_PROPS, {
        graphqlFilter: { field: "Name", operator: "like", value: "[D3DEMO]%" }
      });
      document.body.appendChild(element);
      await flushPromises();

      const queryStrings = gql.mock.results.map((r) => r.value);
      expect(
        queryStrings.some((q) =>
          q.includes('where: { Name: { like: "[D3DEMO]%" } }')
        )
      ).toBe(true);
    });

    it("surfaces an error and provisions no query for an unparseable JSON string", async () => {
      const element = createElement("c-d3-difference-chart-graphql", {
        is: D3DifferenceChartGraphql
      });
      Object.assign(element, STRUCTURED_PROPS, { graphqlFilter: "{not json" });
      document.body.appendChild(element);
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).not.toBeNull();
      expect(gql).not.toHaveBeenCalled();
    });

    it("treats a blank-string graphqlFilter as no filter", async () => {
      const element = createElement("c-d3-difference-chart-graphql", {
        is: D3DifferenceChartGraphql
      });
      Object.assign(element, STRUCTURED_PROPS, { graphqlFilter: "  " });
      document.body.appendChild(element);
      await flushPromises();

      const queryStrings = gql.mock.results.map((r) => r.value);
      expect(queryStrings.length).toBeGreaterThan(0);
      expect(queryStrings.every((q) => !q.includes("where:"))).toBe(true);
    });
  });
});
