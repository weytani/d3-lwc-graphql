// ABOUTME: Tests the GraphQL self-fetch path on the standalone d3SparklineGridGraphql bundle.
// ABOUTME: The grid has no server-side aggregate — the structured path and the free-text
// ABOUTME: graphqlQuery override both fetch raw records and feed the same client-side
// ABOUTME: per-entity monthly bucketing (processEntityData).
import { createElement } from "lwc";
import D3SparklineGridGraphql from "c/d3SparklineGridGraphql";
import { graphql, gql } from "lightning/graphql";
import { loadD3 } from "../d3Loader";

jest.mock("../d3Loader", () => ({ loadD3: jest.fn() }));

// Value-axis chart: renderChart calls d3.max/min/extent to build scales, so the
// stub must compute those for real (a naive always-chain stub crashes the jest
// worker on numeric usage like `d3.max(...) || 1`). Records every chained call
// so tests can assert on rendered marks and text (e.g. the summed value).
function makeD3Stub() {
  const calls = [];
  const chain = new Proxy(function () {}, {
    get: (target, prop) => {
      if (prop === "then") return undefined;
      if (prop === "max") return (a, f) => Math.max(...a.map(f ?? ((d) => d)));
      if (prop === "min") return (a, f) => Math.min(...a.map(f ?? ((d) => d)));
      if (prop === "mean")
        return (a, f) => {
          const m = a.map(f ?? ((d) => d));
          return m.reduce((s, v) => s + v, 0) / m.length;
        };
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

// Structured self-fetch response: two New Business rows across two months.
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
          }
        ]
      }
    }
  }
};

// A record-query response an admin's free-text graphqlQuery would return.
const FREE_TEXT_RESPONSE = {
  uiapi: {
    query: {
      Opportunity: {
        edges: [
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
              CloseDate: { value: "2024-03-10" },
              Amount: { value: 75 }
            }
          }
        ]
      }
    }
  }
};

// Two rows for the SAME entity in the SAME month: processEntityData must SUM
// them into one bucket (100 + 200 = 300), not keep last-wins (200).
const FREE_TEXT_DUP_RESPONSE = {
  uiapi: {
    query: {
      Opportunity: {
        edges: [
          {
            node: {
              Type: { value: "New Business" },
              CloseDate: { value: "2024-01-10" },
              Amount: { value: 100 }
            }
          },
          {
            node: {
              Type: { value: "New Business" },
              CloseDate: { value: "2024-01-20" },
              Amount: { value: 200 }
            }
          }
        ]
      }
    }
  }
};

// Distinctive free-text document (no `first:` so it is distinguishable from the
// structured builder's bounded query).
const FREE_TEXT_QUERY =
  "query { uiapi { query { Opportunity { edges { node { Type { value } CloseDate { value } Amount { value } } } } } } }";

async function flushPromises() {
  return Promise.resolve();
}

function attach(props) {
  const element = createElement("c-d3-sparkline-grid-graphql", {
    is: D3SparklineGridGraphql
  });
  Object.assign(element, props);
  document.body.appendChild(element);
  return element;
}

describe("d3SparklineGridGraphql GraphQL path", () => {
  let d3Calls;

  beforeEach(() => {
    const stub = makeD3Stub();
    d3Calls = stub.calls;
    loadD3.mockResolvedValue(stub.chain);

    Element.prototype.getBoundingClientRect = jest.fn(() => ({
      width: 600,
      height: 400,
      top: 0,
      left: 0,
      bottom: 400,
      right: 600
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

  // ── Structured self-fetch (the default path) ──────────────────────────────

  it("renders the grid and draws sparkline rows when structured record data arrives", async () => {
    attach({
      objectApiName: "Opportunity",
      entityField: "Type",
      dateField: "CloseDate",
      valueField: "Amount"
    });

    await flushPromises(); // connectedCallback (loadD3 + loadData early-return)
    graphql.emit(RECORD_RESPONSE);
    await flushPromises();
    await flushPromises();

    const element = document.body.firstChild;
    expect(element.shadowRoot.querySelector(".chart-container")).not.toBeNull();
    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).toBeNull();

    // Prove renderChart actually ran: an "entity-row" group was appended.
    expect(
      d3Calls.some(
        (c) => c[0] === "attr" && c[1] === "class" && c[2] === "entity-row"
      )
    ).toBe(true);
  });

  it("keeps the loading spinner up while the wire is provisioned and awaiting its first emission", async () => {
    const element = attach({
      objectApiName: "Opportunity",
      entityField: "Type",
      dateField: "CloseDate",
      valueField: "Amount"
    });

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
    const element = attach({
      objectApiName: "Opportunity",
      entityField: "Type",
      dateField: "CloseDate",
      valueField: "Amount"
    });

    await flushPromises();
    graphql.emitErrors([{ message: "boom" }]);
    await flushPromises();

    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).not.toBeNull();
  });

  it("bounds the structured query with first: 2000", async () => {
    attach({
      objectApiName: "Opportunity",
      entityField: "Type",
      dateField: "CloseDate",
      valueField: "Amount"
    });

    await flushPromises();

    const queryStrings = gql.mock.results.map((r) => r.value);
    expect(queryStrings.some((q) => q.includes("first: 2000"))).toBe(true);
  });

  it("requests entityField, dateField, and valueField, deduped", async () => {
    attach({
      objectApiName: "Opportunity",
      entityField: "Type",
      dateField: "CloseDate",
      // valueField repeats entityField on purpose to prove deduping.
      valueField: "Type"
    });

    await flushPromises();

    const queryStrings = gql.mock.results.map((r) => r.value);
    const query = queryStrings[queryStrings.length - 1];
    expect(query).toContain("Type {");
    expect(query).toContain("CloseDate {");
    expect(query.match(/Type \{/g).length).toBe(1);
  });

  // ── Free-text graphqlQuery override ───────────────────────────────────────

  it("uses a free-text graphqlQuery verbatim and never builds the structured query", async () => {
    const element = attach({
      graphqlQuery: FREE_TEXT_QUERY,
      objectApiName: "Opportunity",
      entityField: "Type",
      dateField: "CloseDate",
      valueField: "Amount"
    });

    await flushPromises();
    graphql.emit(FREE_TEXT_RESPONSE);
    await flushPromises();
    await flushPromises();

    expect(element.shadowRoot.querySelector(".chart-container")).not.toBeNull();
    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).toBeNull();

    // The admin's document is passed to gql verbatim; the structured builder
    // (which bounds with `first:`) is never used.
    const queryStrings = gql.mock.results.map((r) => r.value);
    expect(queryStrings.some((q) => q.includes(FREE_TEXT_QUERY))).toBe(true);
    expect(queryStrings.every((q) => !q.includes("first:"))).toBe(true);
  });

  it("auto-detects the object key when objectApiName is blank on the free-text path", async () => {
    const element = attach({
      graphqlQuery: FREE_TEXT_QUERY,
      objectApiName: "", // blank: normalizeRecordsGeneric falls back to the first key
      entityField: "Type",
      dateField: "CloseDate",
      valueField: "Amount"
    });

    await flushPromises();
    graphql.emit(FREE_TEXT_RESPONSE);
    await flushPromises();
    await flushPromises();

    expect(element.shadowRoot.querySelector(".chart-container")).not.toBeNull();
    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).toBeNull();
    expect(
      d3Calls.some(
        (c) => c[0] === "attr" && c[1] === "class" && c[2] === "entity-row"
      )
    ).toBe(true);
  });

  it("sums duplicate (entity, month) keys client-side on the free-text path", async () => {
    const element = attach({
      graphqlQuery: FREE_TEXT_QUERY,
      objectApiName: "Opportunity",
      entityField: "Type",
      dateField: "CloseDate",
      valueField: "Amount",
      operation: "Sum"
    });

    await flushPromises();
    graphql.emit(FREE_TEXT_DUP_RESPONSE);
    await flushPromises();
    await flushPromises();

    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).toBeNull();

    // Two rows in 2024-01 collapse to one bucket summed to 300 (not last-wins
    // 200). The current value text renders the summed total.
    expect(d3Calls.some((c) => c[0] === "text" && c[1] === "300")).toBe(true);
    expect(d3Calls.some((c) => c[0] === "text" && c[1] === "200")).toBe(false);
  });

  it("surfaces wire errors from a free-text graphqlQuery in the error state", async () => {
    const element = attach({
      graphqlQuery: FREE_TEXT_QUERY,
      objectApiName: "Opportunity",
      entityField: "Type",
      dateField: "CloseDate",
      valueField: "Amount"
    });

    await flushPromises();
    graphql.emitErrors([{ message: "bad free-text query" }]);
    await flushPromises();

    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).not.toBeNull();
  });

  it("hints record-query-only when a free-text graphqlQuery yields no records", async () => {
    // An aggregate-shaped payload has no uiapi.query, so the record normalizer
    // finds nothing — the error must point the admin at the record-query contract.
    const element = attach({
      graphqlQuery: FREE_TEXT_QUERY,
      objectApiName: "Opportunity",
      entityField: "Type",
      dateField: "CloseDate",
      valueField: "Amount"
    });

    await flushPromises();
    graphql.emit({ uiapi: { aggregate: { Opportunity: { edges: [] } } } });
    await flushPromises();

    const err = element.shadowRoot.querySelector(".slds-text-color_error");
    expect(err).not.toBeNull();
    expect(err.textContent).toMatch(/record query/i);
  });

  it("ignores a blank graphqlQuery and falls through to the structured builder", async () => {
    const element = attach({
      graphqlQuery: "   ",
      objectApiName: "Opportunity",
      entityField: "Type",
      dateField: "CloseDate",
      valueField: "Amount"
    });

    await flushPromises();
    graphql.emit(RECORD_RESPONSE);
    await flushPromises();
    await flushPromises();

    expect(element.shadowRoot.querySelector(".chart-container")).not.toBeNull();
    const queryStrings = gql.mock.results.map((r) => r.value);
    expect(queryStrings.some((q) => q.includes("first: 2000"))).toBe(true);
  });

  // ── recordCollection priority ─────────────────────────────────────────────

  it("lets recordCollection win over a set graphqlQuery and never provisions the wire", async () => {
    const element = attach({
      graphqlQuery: FREE_TEXT_QUERY,
      entityField: "Type",
      dateField: "CloseDate",
      valueField: "Amount",
      recordCollection: [
        { Type: "New Business", CloseDate: "2024-01-15", Amount: 100 },
        { Type: "New Business", CloseDate: "2024-02-15", Amount: 200 }
      ]
    });

    await flushPromises();
    await flushPromises();

    expect(element.shadowRoot.querySelector(".chart-container")).not.toBeNull();
    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).toBeNull();
    // recordCollection resolves the data synchronously; the wire is skipped.
    expect(gql).not.toHaveBeenCalled();
    expect(
      d3Calls.some(
        (c) => c[0] === "attr" && c[1] === "class" && c[2] === "entity-row"
      )
    ).toBe(true);
  });

  describe("graphqlFilter JSON-string parsing", () => {
    const STRUCTURED_PROPS = {
      objectApiName: "Opportunity",
      entityField: "Type",
      dateField: "CloseDate",
      valueField: "Amount"
    };

    it("parses a JSON-string graphqlFilter into the structured where clause", async () => {
      attach({
        ...STRUCTURED_PROPS,
        graphqlFilter: '{"field":"Name","operator":"like","value":"[D3DEMO]%"}'
      });
      await flushPromises();
      const { query } = graphql.getLastConfig();
      expect(query).toContain('where: { Name: { like: "[D3DEMO]%" } }');
    });

    it("passes an object graphqlFilter through unchanged", async () => {
      attach({
        ...STRUCTURED_PROPS,
        graphqlFilter: { field: "Name", operator: "like", value: "[D3DEMO]%" }
      });
      await flushPromises();
      const { query } = graphql.getLastConfig();
      expect(query).toContain('where: { Name: { like: "[D3DEMO]%" } }');
    });

    it("surfaces an error and provisions no query for an unparseable JSON string", async () => {
      const element = attach({
        ...STRUCTURED_PROPS,
        graphqlFilter: "{not json"
      });
      await flushPromises();
      // Mirror the DOM assertion used by the existing tests in this file that
      // check the error state — reuse the same error-element selector here.
      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).not.toBeNull();
      expect(graphql.getLastConfig().query).toBeUndefined();
    });

    it("treats a blank-string graphqlFilter as no filter", async () => {
      attach({ ...STRUCTURED_PROPS, graphqlFilter: "  " });
      await flushPromises();
      const { query } = graphql.getLastConfig();
      expect(query).toBeDefined();
      expect(query).not.toContain("where:");
    });
  });
});
