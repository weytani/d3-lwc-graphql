// ABOUTME: Tests the GraphQL self-fetch path on the standalone d3NormalizedBarGraphql bundle.
// ABOUTME: Covers the two-field structured builder, the Count raw-record fallback, and the
// ABOUTME: free-text graphqlQuery admin override. seriesField is REQUIRED — a 100%
// ABOUTME: composition chart with no composition dimension has nothing to normalize. The
// ABOUTME: free-text path pivots+sums flat records client-side, matching the pre-summed
// ABOUTME: structured aggregate path percentage-for-percentage.
import { createElement } from "lwc";
import D3NormalizedBarGraphql from "c/d3NormalizedBarGraphql";
import { graphql, gql } from "lightning/graphql";
import { loadD3 } from "../d3Loader";

jest.mock("../d3Loader", () => ({ loadD3: jest.fn() }));

// Hand-rolled mock D3: stack() is a real jest.fn() so we can read back the
// pivoted rows fed to d3.stack()(pivotData) — the input the always-on
// stackOffsetExpand normalizes to percentages.
const createMockD3 = () => {
  const mockStack = jest.fn(() => []);
  mockStack.keys = jest.fn(() => mockStack);
  mockStack.offset = jest.fn(() => mockStack);

  const mockD3 = {
    select: jest.fn(() => mockD3),
    append: jest.fn(() => mockD3),
    attr: jest.fn(() => mockD3),
    style: jest.fn(() => mockD3),
    call: jest.fn(() => mockD3),
    insert: jest.fn(() => mockD3),
    selectAll: jest.fn(() => mockD3),
    data: jest.fn(() => mockD3),
    enter: jest.fn(() => mockD3),
    transition: jest.fn(() => mockD3),
    duration: jest.fn(() => mockD3),
    delay: jest.fn(() => mockD3),
    on: jest.fn(() => mockD3),
    remove: jest.fn(() => mockD3),
    text: jest.fn(() => mockD3),
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
    stack: jest.fn(() => mockStack),
    stackOffsetExpand: "stackOffsetExpand"
  };
  mockD3._mockStack = mockStack;
  return mockD3;
};

const MULTI_GROUP_RESPONSE = {
  uiapi: {
    aggregate: {
      Opportunity: {
        edges: [
          {
            node: {
              aggregate: {
                StageName: { value: "Prospecting" },
                Type: { value: "New" },
                Amount: { sum: { value: 100 } }
              }
            }
          },
          {
            node: {
              aggregate: {
                StageName: { value: "Prospecting" },
                Type: { value: "Existing" },
                Amount: { sum: { value: 200 } }
              }
            }
          }
        ]
      }
    }
  }
};

const RECORD_RESPONSE_MULTI = {
  uiapi: {
    query: {
      Opportunity: {
        edges: [
          {
            node: {
              StageName: { value: "Prospecting" },
              Type: { value: "New" }
            }
          },
          {
            node: {
              StageName: { value: "Prospecting" },
              Type: { value: "Existing" }
            }
          }
        ]
      }
    }
  }
};

// A record-query response an admin's free-text graphqlQuery would return.
// Flat rows, one per source record, with a duplicate (StageName, Type) key
// (Prospecting/New appears twice: 40 + 60) — the chart must sum client-side.
const FREE_TEXT_RESPONSE = {
  uiapi: {
    query: {
      Opportunity: {
        edges: [
          {
            node: {
              StageName: { value: "Prospecting" },
              Type: { value: "New" },
              Amount: { value: 40 }
            }
          },
          {
            node: {
              StageName: { value: "Prospecting" },
              Type: { value: "Existing" },
              Amount: { value: 200 }
            }
          },
          {
            node: {
              StageName: { value: "Prospecting" },
              Type: { value: "New" },
              Amount: { value: 60 }
            }
          },
          {
            node: {
              StageName: { value: "Qualification" },
              Type: { value: "New" },
              Amount: { value: 150 }
            }
          },
          {
            node: {
              StageName: { value: "Qualification" },
              Type: { value: "Existing" },
              Amount: { value: 50 }
            }
          }
        ]
      }
    }
  }
};

// The same underlying totals as FREE_TEXT_RESPONSE, but pre-summed the way the
// structured groupBy aggregate wire returns them (Prospecting/New = 100).
const MULTI_GROUP_IDENTITY_RESPONSE = {
  uiapi: {
    aggregate: {
      Opportunity: {
        edges: [
          {
            node: {
              aggregate: {
                StageName: { value: "Prospecting" },
                Type: { value: "New" },
                Amount: { sum: { value: 100 } }
              }
            }
          },
          {
            node: {
              aggregate: {
                StageName: { value: "Prospecting" },
                Type: { value: "Existing" },
                Amount: { sum: { value: 200 } }
              }
            }
          },
          {
            node: {
              aggregate: {
                StageName: { value: "Qualification" },
                Type: { value: "New" },
                Amount: { sum: { value: 150 } }
              }
            }
          },
          {
            node: {
              aggregate: {
                StageName: { value: "Qualification" },
                Type: { value: "Existing" },
                Amount: { sum: { value: 50 } }
              }
            }
          }
        ]
      }
    }
  }
};

const FREE_TEXT_QUERY =
  "query { uiapi { query { Opportunity { edges { node { StageName { value } Type { value } Amount { value } } } } } } }";

async function flushPromises() {
  return Promise.resolve();
}

describe("d3NormalizedBarGraphql GraphQL path", () => {
  let mockD3;

  beforeEach(() => {
    mockD3 = createMockD3();
    loadD3.mockResolvedValue(mockD3);

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

  describe("structured self-fetch", () => {
    it("renders the chart container and draws normalized segments when GraphQL multi-group data arrives", async () => {
      const element = createElement("c-d3-normalized-bar-graphql", {
        is: D3NormalizedBarGraphql
      });
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.seriesField = "Type";
      element.valueField = "Amount";
      element.operation = "Sum";
      document.body.appendChild(element);

      await flushPromises(); // connectedCallback (loadD3 + loadData early-return)
      graphql.emit(MULTI_GROUP_RESPONSE);
      await flushPromises();
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".chart-container")
      ).not.toBeNull();
      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeNull();

      // Prove renderChart actually ran (not just that the wire populated data):
      // a "normalized-segment" must have been appended, always via stackOffsetExpand.
      expect(
        mockD3.attr.mock.calls.some(
          (c) => c[0] === "class" && c[1] === "normalized-segment"
        )
      ).toBe(true);
      expect(mockD3._mockStack.offset).toHaveBeenCalledWith(
        "stackOffsetExpand"
      );
    });

    it("keeps the loading spinner up while the wire is provisioned and awaiting its first emission", async () => {
      const element = createElement("c-d3-normalized-bar-graphql", {
        is: D3NormalizedBarGraphql
      });
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.seriesField = "Type";
      element.valueField = "Amount";
      element.operation = "Sum";
      document.body.appendChild(element);

      await flushPromises();
      // Provisioned wire, no emission yet: spinner shows, no chart, no error —
      // no no-data flash on the self-fetch path.
      expect(
        element.shadowRoot.querySelector("lightning-spinner")
      ).not.toBeNull();
      expect(element.shadowRoot.querySelector(".chart-container")).toBeNull();
      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeNull();

      graphql.emit(MULTI_GROUP_RESPONSE);
      await flushPromises();
      await flushPromises();

      expect(element.shadowRoot.querySelector("lightning-spinner")).toBeNull();
      expect(
        element.shadowRoot.querySelector(".chart-container")
      ).not.toBeNull();
    });

    it("shows an error when the GraphQL wire emits errors", async () => {
      const element = createElement("c-d3-normalized-bar-graphql", {
        is: D3NormalizedBarGraphql
      });
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.seriesField = "Type";
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
      const element = createElement("c-d3-normalized-bar-graphql", {
        is: D3NormalizedBarGraphql
      });
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.seriesField = "Type";
      element.valueField = "Amount";
      document.body.appendChild(element);

      await flushPromises();

      const queryStrings = gql.mock.results.map((r) => r.value);
      expect(queryStrings.some((q) => q.includes("first: 2000"))).toBe(true);
    });

    it("builds a groupBy on both groupByField and seriesField", async () => {
      const element = createElement("c-d3-normalized-bar-graphql", {
        is: D3NormalizedBarGraphql
      });
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.seriesField = "Type";
      element.valueField = "Amount";
      document.body.appendChild(element);

      await flushPromises();

      const queryStrings = gql.mock.results.map((r) => r.value);
      const query = queryStrings[queryStrings.length - 1];
      expect(query).toContain("groupBy: { StageName: {}, Type: {} }");
    });

    it("falls back to a bounded raw-record fetch for Count (no server aggregate)", async () => {
      const element = createElement("c-d3-normalized-bar-graphql", {
        is: D3NormalizedBarGraphql
      });
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.seriesField = "Type";
      element.operation = "Count";
      document.body.appendChild(element);

      await flushPromises();
      graphql.emit(RECORD_RESPONSE_MULTI);
      await flushPromises();
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".chart-container")
      ).not.toBeNull();
      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeNull();

      const queryStrings = gql.mock.results.map((r) => r.value);
      const query = queryStrings[queryStrings.length - 1];
      expect(query).toContain("uiapi { query {");
      expect(query).not.toContain("uiapi { aggregate {");

      expect(
        mockD3.attr.mock.calls.some(
          (c) => c[0] === "class" && c[1] === "normalized-segment"
        )
      ).toBe(true);
    });

    it("does not provision the wire when seriesField is empty — there is nothing to normalize", async () => {
      const element = createElement("c-d3-normalized-bar-graphql", {
        is: D3NormalizedBarGraphql
      });
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.seriesField = "";
      element.valueField = "Amount";
      element.operation = "Sum";
      document.body.appendChild(element);

      await flushPromises();

      expect(gql).not.toHaveBeenCalled();
    });

    it("does not provision the wire when valueField is missing for Sum", async () => {
      const element = createElement("c-d3-normalized-bar-graphql", {
        is: D3NormalizedBarGraphql
      });
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.seriesField = "Type";
      element.valueField = "";
      element.operation = "Sum";
      document.body.appendChild(element);

      await flushPromises();

      expect(gql).not.toHaveBeenCalled();
    });
  });

  describe("free-text graphqlQuery override", () => {
    it("uses a free-text graphqlQuery verbatim and pivots+sums the rows client-side", async () => {
      const element = createElement("c-d3-normalized-bar-graphql", {
        is: D3NormalizedBarGraphql
      });
      element.graphqlQuery = FREE_TEXT_QUERY;
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.seriesField = "Type";
      element.valueField = "Amount";
      element.operation = "Sum";
      document.body.appendChild(element);

      await flushPromises();
      graphql.emit(FREE_TEXT_RESPONSE);
      await flushPromises();
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".chart-container")
      ).not.toBeNull();
      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeNull();

      // The admin's document is passed to gql verbatim; the structured
      // multi-group builder (which emits a groupBy clause) is never used.
      const queryStrings = gql.mock.results.map((r) => r.value);
      expect(queryStrings.some((q) => q.includes(FREE_TEXT_QUERY))).toBe(true);
      expect(queryStrings.every((q) => !q.includes("groupBy"))).toBe(true);

      // The duplicate (Prospecting, New) rows summed to 100 before rendering.
      const pivotData = mockD3._mockStack.mock.calls[0][0];
      const prospecting = pivotData.find((r) => r.label === "Prospecting");
      expect(prospecting.New).toBe(100);
      expect(prospecting.Existing).toBe(200);
    });

    it("surfaces wire errors from a free-text graphqlQuery in the error state", async () => {
      const element = createElement("c-d3-normalized-bar-graphql", {
        is: D3NormalizedBarGraphql
      });
      element.graphqlQuery = FREE_TEXT_QUERY;
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.seriesField = "Type";
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
      const element = createElement("c-d3-normalized-bar-graphql", {
        is: D3NormalizedBarGraphql
      });
      element.graphqlQuery = FREE_TEXT_QUERY;
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.seriesField = "Type";
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
      const element = createElement("c-d3-normalized-bar-graphql", {
        is: D3NormalizedBarGraphql
      });
      element.graphqlQuery = "   ";
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.seriesField = "Type";
      element.valueField = "Amount";
      element.operation = "Sum";
      document.body.appendChild(element);

      await flushPromises();
      graphql.emit(MULTI_GROUP_RESPONSE);
      await flushPromises();
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".chart-container")
      ).not.toBeNull();
      const queryStrings = gql.mock.results.map((r) => r.value);
      expect(queryStrings.some((q) => q.includes("groupBy"))).toBe(true);
    });

    it("prefers recordCollection over a set graphqlQuery — the wire is never provisioned", async () => {
      const element = createElement("c-d3-normalized-bar-graphql", {
        is: D3NormalizedBarGraphql
      });
      element.graphqlQuery = FREE_TEXT_QUERY;
      element.recordCollection = [
        { StageName: "Prospecting", Type: "New", Amount: 100 },
        { StageName: "Prospecting", Type: "Existing", Amount: 200 }
      ];
      element.groupByField = "StageName";
      element.seriesField = "Type";
      element.valueField = "Amount";
      element.operation = "Sum";
      document.body.appendChild(element);

      await flushPromises();
      await flushPromises();

      expect(gql).not.toHaveBeenCalled();
      expect(
        element.shadowRoot.querySelector(".chart-container")
      ).not.toBeNull();
    });

    it("produces the same normalized stack input as the structured aggregate path for the same underlying rows", async () => {
      // Structured path: pre-summed groupBy aggregate.
      const mockD3Structured = createMockD3();
      loadD3.mockResolvedValue(mockD3Structured);
      const structured = createElement("c-d3-normalized-bar-graphql", {
        is: D3NormalizedBarGraphql
      });
      structured.objectApiName = "Opportunity";
      structured.groupByField = "StageName";
      structured.seriesField = "Type";
      structured.valueField = "Amount";
      structured.operation = "Sum";
      document.body.appendChild(structured);
      await flushPromises();
      graphql.emit(MULTI_GROUP_IDENTITY_RESPONSE);
      await flushPromises();
      await flushPromises();
      const pivotStructured = mockD3Structured._mockStack.mock.calls[0][0];
      document.body.removeChild(structured);

      // Free-text path: flat, un-summed records (duplicate Prospecting/New rows).
      const mockD3FreeText = createMockD3();
      loadD3.mockResolvedValue(mockD3FreeText);
      const freeText = createElement("c-d3-normalized-bar-graphql", {
        is: D3NormalizedBarGraphql
      });
      freeText.graphqlQuery = FREE_TEXT_QUERY;
      freeText.objectApiName = "Opportunity";
      freeText.groupByField = "StageName";
      freeText.seriesField = "Type";
      freeText.valueField = "Amount";
      freeText.operation = "Sum";
      document.body.appendChild(freeText);
      await flushPromises();
      graphql.emit(FREE_TEXT_RESPONSE);
      await flushPromises();
      await flushPromises();
      const pivotFreeText = mockD3FreeText._mockStack.mock.calls[0][0];

      // Identical pivoted rows feed the always-on stackOffsetExpand, so both
      // paths render identical percentages.
      expect(pivotFreeText).toEqual(pivotStructured);
    });
  });

  describe("graphqlFilter JSON-string parsing", () => {
    const STRUCTURED_PROPS = {
      objectApiName: "Opportunity",
      groupByField: "StageName",
      seriesField: "Type",
      valueField: "Amount",
      operation: "Sum"
    };

    it("parses a JSON-string graphqlFilter into the structured where clause", async () => {
      const element = createElement("c-d3-normalized-bar-graphql", {
        is: D3NormalizedBarGraphql
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
      const element = createElement("c-d3-normalized-bar-graphql", {
        is: D3NormalizedBarGraphql
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
      const element = createElement("c-d3-normalized-bar-graphql", {
        is: D3NormalizedBarGraphql
      });
      Object.assign(element, STRUCTURED_PROPS, { graphqlFilter: "{not json" });
      document.body.appendChild(element);
      await flushPromises();
      // Mirror the DOM assertion used by the existing test
      // "shows an error when the GraphQL wire emits errors" in this file —
      // reuse its exact error-element selector here.
      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).not.toBeNull();
      expect(graphql.getLastConfig().query).toBeUndefined();
    });

    it("treats a blank-string graphqlFilter as no filter", async () => {
      const element = createElement("c-d3-normalized-bar-graphql", {
        is: D3NormalizedBarGraphql
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
