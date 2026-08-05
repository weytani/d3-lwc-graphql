// ABOUTME: Tests the GraphQL-only self-fetch path on d3BandChartGraphql.
// ABOUTME: Band has no server-side aggregate — the wire always fetches raw
// ABOUTME: dateField/lowerField/upperField(/valueField) records and feeds the existing
// ABOUTME: processBandData path, same as recordCollection. Also covers the free-text override.
import { createElement } from "lwc";
import D3BandChartGraphql from "c/d3BandChartGraphql";
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
              Amount: { value: 200 },
              ExpectedRevenue: { value: 260 }
            }
          }
        ]
      }
    }
  }
};

// A free-text document may target any UI-API-queryable object with any field
// names; normalizeRecordsGeneric auto-detects the object key, so objectApiName
// can be left blank and the component's own field mappings do the shaping.
const FREE_TEXT_QUERY = `query {
  uiapi {
    query {
      Forecast__c(first: 50) {
        edges { node { PeriodStart__c { value } LowBound__c { value } HighBound__c { value } } }
      }
    }
  }
}`;

const FREE_TEXT_RESPONSE = {
  uiapi: {
    query: {
      Forecast__c: {
        edges: [
          {
            node: {
              PeriodStart__c: { value: "2024-03-01" },
              LowBound__c: { value: 400 },
              HighBound__c: { value: 900 }
            }
          },
          {
            node: {
              PeriodStart__c: { value: "2024-04-01" },
              LowBound__c: { value: 500 },
              HighBound__c: { value: 1100 }
            }
          }
        ]
      }
    }
  }
};

const EMPTY_FREE_TEXT_RESPONSE = { uiapi: { query: {} } };

const SAMPLE_DATA = [
  { CloseDate: "2024-01-01", Amount: 10, ExpectedRevenue: 20 },
  { CloseDate: "2024-02-01", Amount: 30, ExpectedRevenue: 40 }
];

async function flushPromises() {
  return Promise.resolve();
}

function makeElement(props = {}) {
  const element = createElement("c-d3-band-chart-graphql", {
    is: D3BandChartGraphql
  });
  Object.assign(element, props);
  document.body.appendChild(element);
  return element;
}

describe("d3BandChartGraphql GraphQL self-fetch", () => {
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

  describe("structured record query", () => {
    it("renders the chart container and actually draws the band when GraphQL record data arrives", async () => {
      const element = makeElement({
        objectApiName: "Opportunity",
        dateField: "CloseDate",
        lowerField: "Amount",
        upperField: "ExpectedRevenue"
      });

      await flushPromises(); // connectedCallback (loadD3 + loadData no-op)
      graphql.emit(RECORD_RESPONSE);
      await flushPromises();
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".chart-container")
      ).not.toBeNull();
      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeNull();

      // Prove renderChart actually ran (not just that the wire populated data):
      // a "band-area" path must have been appended with a "d" attribute.
      expect(
        d3Calls.some(
          (c) => c[0] === "attr" && c[1] === "class" && c[2] === "band-area"
        )
      ).toBe(true);
    });

    it("shows an error when the GraphQL wire emits errors", async () => {
      const element = makeElement({
        objectApiName: "Opportunity",
        dateField: "CloseDate",
        lowerField: "Amount",
        upperField: "ExpectedRevenue"
      });

      await flushPromises();
      graphql.emitErrors([{ message: "boom" }]);
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).not.toBeNull();
    });

    it("bounds the query with first: 2000 by default", async () => {
      makeElement({
        objectApiName: "Opportunity",
        dateField: "CloseDate",
        lowerField: "Amount",
        upperField: "ExpectedRevenue"
      });

      await flushPromises();

      const queryStrings = gql.mock.results.map((r) => r.value);
      expect(queryStrings.some((q) => q.includes("first: 2000"))).toBe(true);
    });

    it("requests dateField, lowerField, upperField, and valueField, deduped", async () => {
      makeElement({
        objectApiName: "Opportunity",
        dateField: "CloseDate",
        lowerField: "Amount",
        upperField: "ExpectedRevenue",
        // valueField repeats dateField on purpose to prove deduping.
        valueField: "CloseDate"
      });

      await flushPromises();

      const queryStrings = gql.mock.results.map((r) => r.value);
      const query = queryStrings[queryStrings.length - 1];
      expect(query).toContain("CloseDate {");
      expect(query).toContain("Amount {");
      expect(query).toContain("ExpectedRevenue {");
      expect(query.match(/CloseDate \{/g).length).toBe(1);
    });

    it("does not provision the wire when upperField is missing", async () => {
      makeElement({
        objectApiName: "Opportunity",
        dateField: "CloseDate",
        lowerField: "Amount",
        upperField: ""
      });

      await flushPromises();

      expect(gql).not.toHaveBeenCalled();
    });
  });

  describe("free-text graphqlQuery override", () => {
    it("passes a non-blank graphqlQuery to the wire verbatim and charts the returned rows", async () => {
      const element = makeElement({
        // objectApiName deliberately blank: the normalizer auto-detects the
        // object key, so a free-text query against any object is accepted.
        graphqlQuery: FREE_TEXT_QUERY,
        dateField: "PeriodStart__c",
        lowerField: "LowBound__c",
        upperField: "HighBound__c"
      });

      await flushPromises();

      const queryStrings = gql.mock.results.map((r) => r.value);
      expect(queryStrings.some((q) => q.includes(FREE_TEXT_QUERY))).toBe(true);
      // The structured builder must not have run.
      expect(queryStrings.some((q) => q.includes("first: 2000"))).toBe(false);

      graphql.emit(FREE_TEXT_RESPONSE);
      await flushPromises();
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeNull();
      expect(
        d3Calls.some(
          (c) => c[0] === "attr" && c[1] === "class" && c[2] === "band-area"
        )
      ).toBe(true);
    });

    it("surfaces wire errors raised by a free-text query", async () => {
      const element = makeElement({
        graphqlQuery: FREE_TEXT_QUERY,
        dateField: "PeriodStart__c",
        lowerField: "LowBound__c",
        upperField: "HighBound__c"
      });

      await flushPromises();
      graphql.emitErrors([{ message: "Invalid field LowBound__c" }]);
      await flushPromises();

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).not.toBeNull();
      expect(errorEl.textContent).toContain("Invalid field LowBound__c");
    });

    it("hints the record-query contract when a free-text query normalizes to no rows", async () => {
      const element = makeElement({
        graphqlQuery: FREE_TEXT_QUERY,
        dateField: "PeriodStart__c",
        lowerField: "LowBound__c",
        upperField: "HighBound__c"
      });

      await flushPromises();
      graphql.emit(EMPTY_FREE_TEXT_RESPONSE);
      await flushPromises();

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).not.toBeNull();
      expect(errorEl.textContent).toContain("uiapi.query");
    });

    it("falls through to the structured builder when graphqlQuery is only whitespace", async () => {
      makeElement({
        graphqlQuery: "   \n  ",
        objectApiName: "Opportunity",
        dateField: "CloseDate",
        lowerField: "Amount",
        upperField: "ExpectedRevenue"
      });

      await flushPromises();

      const queryStrings = gql.mock.results.map((r) => r.value);
      expect(queryStrings.some((q) => q.includes("first: 2000"))).toBe(true);
      expect(queryStrings.some((q) => q.includes("Opportunity"))).toBe(true);
    });

    it("lets recordCollection win over a set graphqlQuery, leaving the wire un-provisioned", async () => {
      const element = makeElement({
        graphqlQuery: FREE_TEXT_QUERY,
        recordCollection: SAMPLE_DATA,
        dateField: "CloseDate",
        lowerField: "Amount",
        upperField: "ExpectedRevenue"
      });

      await flushPromises();
      await flushPromises();

      expect(gql).not.toHaveBeenCalled();
      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeNull();
      expect(
        d3Calls.some(
          (c) => c[0] === "attr" && c[1] === "class" && c[2] === "band-area"
        )
      ).toBe(true);
    });
  });

  describe("loading state", () => {
    it("keeps the spinner up while a provisioned wire has not emitted yet", async () => {
      const element = makeElement({
        objectApiName: "Opportunity",
        dateField: "CloseDate",
        lowerField: "Amount",
        upperField: "ExpectedRevenue"
      });

      await flushPromises();
      await flushPromises();

      expect(
        element.shadowRoot.querySelector("lightning-spinner")
      ).not.toBeNull();
      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeNull();
    });

    it("clears the spinner on the first wire emission", async () => {
      const element = makeElement({
        objectApiName: "Opportunity",
        dateField: "CloseDate",
        lowerField: "Amount",
        upperField: "ExpectedRevenue"
      });

      await flushPromises();
      graphql.emit(RECORD_RESPONSE);
      await flushPromises();
      await flushPromises();

      expect(element.shadowRoot.querySelector("lightning-spinner")).toBeNull();
    });

    it("clears the spinner immediately when no wire is provisioned", async () => {
      const element = makeElement({
        dateField: "CloseDate",
        lowerField: "Amount",
        upperField: "ExpectedRevenue"
      });

      await flushPromises();
      await flushPromises();

      expect(element.shadowRoot.querySelector("lightning-spinner")).toBeNull();
    });
  });

  describe("graphqlFilter JSON-string parsing", () => {
    const STRUCTURED_PROPS = {
      objectApiName: "Opportunity",
      dateField: "CloseDate",
      lowerField: "Amount",
      upperField: "ExpectedRevenue"
    };

    it("parses a JSON-string graphqlFilter into the structured where clause", async () => {
      const element = makeElement({
        ...STRUCTURED_PROPS,
        graphqlFilter: '{"field":"Name","operator":"like","value":"[D3DEMO]%"}'
      });
      await flushPromises();

      const queryStrings = gql.mock.results.map((r) => r.value);
      expect(
        queryStrings.some((q) =>
          q.includes('where: { Name: { like: "[D3DEMO]%" } }')
        )
      ).toBe(true);
      expect(element).toBeTruthy();
    });

    it("passes an object graphqlFilter through unchanged", async () => {
      const element = makeElement({
        ...STRUCTURED_PROPS,
        graphqlFilter: { field: "Name", operator: "like", value: "[D3DEMO]%" }
      });
      await flushPromises();

      const queryStrings = gql.mock.results.map((r) => r.value);
      expect(
        queryStrings.some((q) =>
          q.includes('where: { Name: { like: "[D3DEMO]%" } }')
        )
      ).toBe(true);
      expect(element).toBeTruthy();
    });

    it("surfaces an error and provisions no query for an unparseable JSON string", async () => {
      const element = makeElement({
        ...STRUCTURED_PROPS,
        graphqlFilter: "{not json"
      });
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).not.toBeNull();
      expect(gql).not.toHaveBeenCalled();
    });

    it("treats a blank-string graphqlFilter as no filter", async () => {
      makeElement({
        ...STRUCTURED_PROPS,
        graphqlFilter: "  "
      });
      await flushPromises();

      const queryStrings = gql.mock.results.map((r) => r.value);
      expect(queryStrings.length).toBeGreaterThan(0);
      expect(queryStrings.every((q) => !q.includes("where:"))).toBe(true);
    });
  });
});
