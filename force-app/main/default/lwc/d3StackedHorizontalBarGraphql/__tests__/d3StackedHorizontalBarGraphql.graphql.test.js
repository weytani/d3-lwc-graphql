// ABOUTME: Tests the GraphQL self-fetch path on the standalone d3StackedHorizontalBarGraphql bundle.
// ABOUTME: Covers the structured multi-group / aggregate / Count builders and the free-text
// ABOUTME: graphqlQuery admin override, including the matrix pivot+sum and 100%-normalized parity.
import { createElement } from "lwc";
import D3StackedHorizontalBarGraphql from "c/d3StackedHorizontalBarGraphql";
import { graphql, gql } from "lightning/graphql";
import { loadD3 } from "../d3Loader";

jest.mock("../d3Loader", () => ({ loadD3: jest.fn() }));

const createMockD3 = () => {
  const mockStack = jest.fn(() => []);
  mockStack.keys = jest.fn(() => mockStack);
  mockStack.value = jest.fn(() => mockStack);
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
      scale.nice = jest.fn(() => scale);
      return scale;
    }),
    axisBottom: jest.fn(() => {
      const axis = jest.fn();
      axis.tickFormat = jest.fn(() => axis);
      axis.tickSize = jest.fn(() => axis);
      return axis;
    }),
    axisLeft: jest.fn(() => {
      const axis = jest.fn();
      axis.tickFormat = jest.fn(() => axis);
      return axis;
    }),
    max: jest.fn(() => 500),
    stack: jest.fn(() => mockStack),
    stackOffsetExpand: "stackOffsetExpand"
  };
  mockD3._mockStack = mockStack;
  return mockD3;
};

// Two-field grouped aggregate response (server-summed, one edge per label/series).
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

// A four-cell server-summed grouped aggregate for the normalized-parity test.
const MULTI_GROUP_RESPONSE_NORM = {
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
                Amount: { sum: { value: 250 } }
              }
            }
          }
        ]
      }
    }
  }
};

// Single-field grouped aggregate response (no series).
const AGGREGATE_RESPONSE = {
  uiapi: {
    aggregate: {
      Opportunity: {
        edges: [
          {
            node: {
              aggregate: {
                StageName: { value: "Prospecting" },
                Amount: { sum: { value: 300 } }
              }
            }
          },
          {
            node: {
              aggregate: {
                StageName: { value: "Qualification" },
                Amount: { sum: { value: 400 } }
              }
            }
          }
        ]
      }
    }
  }
};

// A flat record-query response an admin's free-text graphqlQuery returns.
// Duplicate (category, series) rows are UN-summed — the chart sums them
// client-side so the numbers match the server-side grouped aggregate above:
// Prospecting/New 60+40=100, Prospecting/Existing 200,
// Qualification/New 150, Qualification/Existing 100+150=250.
const FREE_TEXT_SERIES_RESPONSE = {
  uiapi: {
    query: {
      Opportunity: {
        edges: [
          {
            node: {
              StageName: { value: "Prospecting" },
              Type: { value: "New" },
              Amount: { value: 60 }
            }
          },
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
              StageName: { value: "Qualification" },
              Type: { value: "New" },
              Amount: { value: 150 }
            }
          },
          {
            node: {
              StageName: { value: "Qualification" },
              Type: { value: "Existing" },
              Amount: { value: 100 }
            }
          },
          {
            node: {
              StageName: { value: "Qualification" },
              Type: { value: "Existing" },
              Amount: { value: 150 }
            }
          }
        ]
      }
    }
  }
};

const FREE_TEXT_SERIES_QUERY =
  "query { uiapi { query { Opportunity { edges { node { StageName { value } Type { value } Amount { value } } } } } } }";

async function flushPromises() {
  return Promise.resolve();
}

function appendConfigured(props) {
  const element = createElement("c-d3-stacked-horizontal-bar-graphql", {
    is: D3StackedHorizontalBarGraphql
  });
  Object.assign(element, {
    objectApiName: "Opportunity",
    groupByField: "StageName",
    seriesField: "Type",
    valueField: "Amount",
    operation: "Sum",
    ...props
  });
  document.body.appendChild(element);
  return element;
}

describe("d3StackedHorizontalBarGraphql GraphQL path", () => {
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

  // ═══════════════════════════════════════════════════════════════
  // STRUCTURED MULTI-SERIES (CT-MG)
  // ═══════════════════════════════════════════════════════════════

  describe("structured multi-series", () => {
    it("renders the chart and draws stacked bars when multi-group data arrives", async () => {
      const element = appendConfigured();

      await flushPromises();
      graphql.emit(MULTI_GROUP_RESPONSE);
      await flushPromises();
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".chart-container")
      ).not.toBeNull();
      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeNull();
      expect(
        mockD3.attr.mock.calls.some(
          (c) => c[0] === "class" && c[1] === "stacked-bar"
        )
      ).toBe(true);
      expect(mockD3.stack).toHaveBeenCalled();
    });

    it("keeps the spinner up while the wire is provisioned and awaiting its first emission", async () => {
      const element = appendConfigured();

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

      graphql.emit(MULTI_GROUP_RESPONSE);
      await flushPromises();
      await flushPromises();

      expect(element.shadowRoot.querySelector("lightning-spinner")).toBeNull();
      expect(
        element.shadowRoot.querySelector(".chart-container")
      ).not.toBeNull();
    });

    it("shows an error when the GraphQL wire emits errors", async () => {
      const element = appendConfigured();

      await flushPromises();
      graphql.emitErrors([{ message: "boom" }]);
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).not.toBeNull();
    });

    it("bounds the query with first: 2000 and groups by both fields", async () => {
      appendConfigured();

      await flushPromises();

      const queryStrings = gql.mock.results.map((r) => r.value);
      const query = queryStrings[queryStrings.length - 1];
      expect(query).toContain("first: 2000");
      expect(query).toContain("groupBy: { StageName: {}, Type: {} }");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // STRUCTURED SINGLE-SERIES (CT-AGG)
  // ═══════════════════════════════════════════════════════════════

  describe("structured single-series", () => {
    it("renders simple bars (no stack) when seriesField is empty", async () => {
      const element = appendConfigured({ seriesField: "" });

      await flushPromises();
      graphql.emit(AGGREGATE_RESPONSE);
      await flushPromises();
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".chart-container")
      ).not.toBeNull();
      expect(
        mockD3.attr.mock.calls.some(
          (c) => c[0] === "class" && c[1] === "stacked-bar"
        )
      ).toBe(true);
      expect(mockD3.stack).not.toHaveBeenCalled();
    });

    it("builds a single-field groupBy when seriesField is empty", async () => {
      appendConfigured({ seriesField: "" });

      await flushPromises();

      const queryStrings = gql.mock.results.map((r) => r.value);
      const query = queryStrings[queryStrings.length - 1];
      expect(query).toContain("groupBy: { StageName: {} }");
      expect(query).not.toContain("Type");
    });

    it("does not provision the wire when valueField is missing for Sum", async () => {
      appendConfigured({ seriesField: "", valueField: "", operation: "Sum" });

      await flushPromises();

      expect(gql).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // COUNT (raw record query, client-side count)
  // ═══════════════════════════════════════════════════════════════

  describe("count path", () => {
    it("fetches a raw record query for Count and bounds it with first: 2000", async () => {
      appendConfigured({ operation: "Count", valueField: "" });

      await flushPromises();

      const queryStrings = gql.mock.results.map((r) => r.value);
      const query = queryStrings[queryStrings.length - 1];
      expect(query).toContain("uiapi { query {");
      expect(query).toContain("first: 2000");
      // Count projects the group-by + series fields (no aggregate wrapper).
      expect(query).toContain("StageName { value }");
      expect(query).toContain("Type { value }");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // FREE-TEXT graphqlQuery OVERRIDE
  // ═══════════════════════════════════════════════════════════════

  describe("free-text graphqlQuery override", () => {
    it("uses the free-text document verbatim and never emits a structured groupBy", async () => {
      const element = appendConfigured({
        graphqlQuery: FREE_TEXT_SERIES_QUERY
      });

      await flushPromises();
      graphql.emit(FREE_TEXT_SERIES_RESPONSE);
      await flushPromises();
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".chart-container")
      ).not.toBeNull();
      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeNull();

      const queryStrings = gql.mock.results.map((r) => r.value);
      expect(queryStrings.some((q) => q.includes(FREE_TEXT_SERIES_QUERY))).toBe(
        true
      );
      expect(queryStrings.every((q) => !q.includes("groupBy"))).toBe(true);
    });

    it("sums duplicate (category, series) rows client-side before building the matrix", async () => {
      const element = appendConfigured({
        graphqlQuery: FREE_TEXT_SERIES_QUERY
      });

      await flushPromises();
      graphql.emit(FREE_TEXT_SERIES_RESPONSE);
      await flushPromises();
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeNull();

      // The pivoted rows fed to d3.stack() must carry the SUMMED per-cell values,
      // not the raw un-summed rows: Prospecting/New = 60 + 40 = 100.
      const pivot = mockD3._mockStack.mock.calls[0][0];
      const prospecting = pivot.find((r) => r.label === "Prospecting");
      const qualification = pivot.find((r) => r.label === "Qualification");
      expect(prospecting.New).toBe(100);
      expect(prospecting.Existing).toBe(200);
      expect(qualification.New).toBe(150);
      expect(qualification.Existing).toBe(250);
    });

    it("computes identical 100%-normalized percentages from free-text and structured data", async () => {
      // Structured (server-summed) path, normalized mode.
      const mockStructured = createMockD3();
      loadD3.mockResolvedValue(mockStructured);
      appendConfigured({ advancedConfig: '{"stackMode": "normalized"}' });
      await flushPromises();
      graphql.emit(MULTI_GROUP_RESPONSE_NORM);
      await flushPromises();
      await flushPromises();
      const pivotStructured = mockStructured._mockStack.mock.calls[0][0];

      // Free-text (client-summed) path, normalized mode, equivalent totals.
      const mockFree = createMockD3();
      loadD3.mockResolvedValue(mockFree);
      appendConfigured({
        graphqlQuery: FREE_TEXT_SERIES_QUERY,
        advancedConfig: '{"stackMode": "normalized"}'
      });
      await flushPromises();
      graphql.emit(FREE_TEXT_SERIES_RESPONSE);
      await flushPromises();
      await flushPromises();
      const pivotFree = mockFree._mockStack.mock.calls[0][0];

      // Identical pivot rows fed to the same stackOffsetExpand offset ⇒ identical
      // per-row percentages by construction. Both paths must request the expand offset.
      expect(pivotFree).toEqual(pivotStructured);
      expect(mockStructured._mockStack.offset).toHaveBeenCalledWith(
        "stackOffsetExpand"
      );
      expect(mockFree._mockStack.offset).toHaveBeenCalledWith(
        "stackOffsetExpand"
      );
    });

    it("surfaces wire errors from a free-text graphqlQuery in the error state", async () => {
      const element = appendConfigured({
        graphqlQuery: FREE_TEXT_SERIES_QUERY
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
      // finds nothing — the error points the admin at the record-query contract.
      const element = appendConfigured({
        graphqlQuery: FREE_TEXT_SERIES_QUERY
      });

      await flushPromises();
      graphql.emit({ uiapi: { aggregate: { Opportunity: { edges: [] } } } });
      await flushPromises();

      const err = element.shadowRoot.querySelector(".slds-text-color_error");
      expect(err).not.toBeNull();
      expect(err.textContent).toMatch(/record query/i);
    });

    it("ignores a blank graphqlQuery and falls through to the structured builder", async () => {
      const element = appendConfigured({ graphqlQuery: "   " });

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
  });

  describe("graphqlFilter JSON-string parsing", () => {
    it("parses a JSON-string graphqlFilter into the structured where clause", async () => {
      appendConfigured({
        graphqlFilter: '{"field":"Name","operator":"like","value":"[D3DEMO]%"}'
      });
      await flushPromises();
      const { query } = graphql.getLastConfig();
      expect(query).toContain('where: { Name: { like: "[D3DEMO]%" } }');
    });

    it("passes an object graphqlFilter through unchanged", async () => {
      appendConfigured({
        graphqlFilter: { field: "Name", operator: "like", value: "[D3DEMO]%" }
      });
      await flushPromises();
      const { query } = graphql.getLastConfig();
      expect(query).toContain('where: { Name: { like: "[D3DEMO]%" } }');
    });

    it("surfaces an error and provisions no query for an unparseable JSON string", async () => {
      const element = appendConfigured({ graphqlFilter: "{not json" });
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
      appendConfigured({ graphqlFilter: "  " });
      await flushPromises();
      const { query } = graphql.getLastConfig();
      expect(query).toBeDefined();
      expect(query).not.toContain("where:");
    });
  });
});
