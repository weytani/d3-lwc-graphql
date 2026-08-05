// ABOUTME: Tests the GraphQL self-fetch path on the standalone d3StackedBarChartGraphql bundle.
// ABOUTME: Structured multi-series (buildMultiGroupQuery/normalizeMultiGroup), single-series
// ABOUTME: (buildAggregateQuery/normalizeAggregate), the Count raw-record fallback, and the
// ABOUTME: free-text graphqlQuery admin override with client-side pivot+sum of duplicate keys.
import { createElement } from "lwc";
import D3StackedBarChartGraphql from "c/d3StackedBarChartGraphql";
import { graphql, gql } from "lightning/graphql";
import { loadD3 } from "../d3Loader";

jest.mock("../d3Loader", () => ({ loadD3: jest.fn() }));

// Hand-rolled mock D3 (mirrors d3StackedBarChartGraphql.test.js): max is a real
// jest.fn() implementation returning a fixed number, not a naive Proxy, so
// there is no thenable trap and no risk of primitive-conversion crashes.
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
    html: jest.fn(() => mockD3),
    text: jest.fn(() => mockD3),
    each: jest.fn(() => mockD3),
    scaleBand: jest.fn(() => {
      const scale = jest.fn(() => 50);
      scale.domain = jest.fn(() => scale);
      scale.range = jest.fn(() => scale);
      scale.padding = jest.fn(() => scale);
      scale.bandwidth = jest.fn(() => 40);
      scale.paddingInner = jest.fn(() => scale);
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
      return axis;
    }),
    axisLeft: jest.fn(() => {
      const axis = jest.fn();
      axis.tickFormat = jest.fn(() => axis);
      axis.tickSize = jest.fn(() => axis);
      return axis;
    }),
    max: jest.fn(() => 500),
    stack: jest.fn(() => mockStack),
    stackOffsetNone: "stackOffsetNone",
    stackOffsetExpand: "stackOffsetExpand"
  };
  mockD3._mockStack = mockStack;
  return mockD3;
};

// A mock D3 whose max() really computes the stacked total per row and whose
// linear-scale domain calls are captured, so a test can assert that the
// free-text client-side aggregation summed duplicate (label, series) keys.
const createSummationMockD3 = () => {
  const domainCalls = [];
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
    html: jest.fn(() => mockD3),
    text: jest.fn(() => mockD3),
    each: jest.fn(() => mockD3),
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
      scale.domain = jest.fn((d) => {
        domainCalls.push(d);
        return scale;
      });
      scale.range = jest.fn(() => scale);
      scale.nice = jest.fn(() => scale);
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
    max: (arr, accessor) => Math.max(...arr.map(accessor ?? ((d) => d))),
    stack: jest.fn(() => mockStack),
    stackOffsetExpand: "stackOffsetExpand"
  };
  return { mockD3, domainCalls };
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

const RECORD_RESPONSE_SINGLE = {
  uiapi: {
    query: {
      Opportunity: {
        edges: [
          { node: { StageName: { value: "Prospecting" } } },
          { node: { StageName: { value: "Qualification" } } }
        ]
      }
    }
  }
};

// A record-query response an admin's free-text graphqlQuery would return:
// flat, un-summed rows, with two rows sharing the (Prospecting, New) key so
// the chart's client-side pivot must sum them to match the server aggregate.
const FREE_TEXT_DUP_RESPONSE = {
  uiapi: {
    query: {
      Opportunity: {
        edges: [
          {
            node: {
              StageName: { value: "Prospecting" },
              Type: { value: "New" },
              Amount: { value: 100 }
            }
          },
          {
            node: {
              StageName: { value: "Prospecting" },
              Type: { value: "New" },
              Amount: { value: 50 }
            }
          },
          {
            node: {
              StageName: { value: "Prospecting" },
              Type: { value: "Existing" },
              Amount: { value: 200 }
            }
          }
        ]
      }
    }
  }
};

// Free-text raw rows whose per-key sums (New: 60+40=100, Existing: 200) exactly
// match the pre-summed MULTI_GROUP_RESPONSE totals, so both paths must produce
// identical d3.stack inputs.
const FREE_TEXT_EQUIV_RESPONSE = {
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

describe("d3StackedBarChartGraphql GraphQL path", () => {
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

  describe("structured multi-series (CT-MG)", () => {
    it("renders the chart container and actually draws bars when GraphQL multi-group data arrives", async () => {
      const element = createElement("c-d3-stacked-bar-chart-graphql", {
        is: D3StackedBarChartGraphql
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
      // a "stacked-bar" must have been appended.
      expect(
        mockD3.attr.mock.calls.some(
          (c) => c[0] === "class" && c[1] === "stacked-bar"
        )
      ).toBe(true);
    });

    it("keeps the loading spinner up while the wire is provisioned and awaiting its first emission", async () => {
      const element = createElement("c-d3-stacked-bar-chart-graphql", {
        is: D3StackedBarChartGraphql
      });
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.seriesField = "Type";
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

      graphql.emit(MULTI_GROUP_RESPONSE);
      await flushPromises();
      await flushPromises();

      expect(element.shadowRoot.querySelector("lightning-spinner")).toBeNull();
      expect(
        element.shadowRoot.querySelector(".chart-container")
      ).not.toBeNull();
    });

    it("shows an error when the GraphQL wire emits errors", async () => {
      const element = createElement("c-d3-stacked-bar-chart-graphql", {
        is: D3StackedBarChartGraphql
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

    it("bounds the query with the same first: value as other CT-MG charts", async () => {
      const element = createElement("c-d3-stacked-bar-chart-graphql", {
        is: D3StackedBarChartGraphql
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
      const element = createElement("c-d3-stacked-bar-chart-graphql", {
        is: D3StackedBarChartGraphql
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
      const element = createElement("c-d3-stacked-bar-chart-graphql", {
        is: D3StackedBarChartGraphql
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

      // Prove renderChart actually ran with the Count-derived record data.
      expect(
        mockD3.attr.mock.calls.some(
          (c) => c[0] === "class" && c[1] === "stacked-bar"
        )
      ).toBe(true);
    });
  });

  describe("structured single-series (plain aggregate, CT-AGG)", () => {
    it("renders the chart container and actually draws bars when GraphQL aggregate data arrives", async () => {
      const element = createElement("c-d3-stacked-bar-chart-graphql", {
        is: D3StackedBarChartGraphql
      });
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.seriesField = "";
      element.valueField = "Amount";
      element.operation = "Sum";
      document.body.appendChild(element);

      await flushPromises();
      graphql.emit(AGGREGATE_RESPONSE);
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
    });

    it("builds a single-field groupBy when seriesField is empty", async () => {
      const element = createElement("c-d3-stacked-bar-chart-graphql", {
        is: D3StackedBarChartGraphql
      });
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.seriesField = "";
      element.valueField = "Amount";
      document.body.appendChild(element);

      await flushPromises();

      const queryStrings = gql.mock.results.map((r) => r.value);
      const query = queryStrings[queryStrings.length - 1];
      expect(query).toContain("groupBy: { StageName: {} }");
      expect(query).not.toContain("Type");
    });

    it("falls back to a bounded raw-record fetch for Count with a single field", async () => {
      const element = createElement("c-d3-stacked-bar-chart-graphql", {
        is: D3StackedBarChartGraphql
      });
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.seriesField = "";
      element.operation = "Count";
      document.body.appendChild(element);

      await flushPromises();
      graphql.emit(RECORD_RESPONSE_SINGLE);
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

      // Prove renderChart actually ran with the Count-derived record data.
      expect(
        mockD3.attr.mock.calls.some(
          (c) => c[0] === "class" && c[1] === "stacked-bar"
        )
      ).toBe(true);
    });

    it("does not provision the wire when valueField is missing for Sum", async () => {
      const element = createElement("c-d3-stacked-bar-chart-graphql", {
        is: D3StackedBarChartGraphql
      });
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.seriesField = "";
      element.valueField = "";
      element.operation = "Sum";
      document.body.appendChild(element);

      await flushPromises();

      expect(gql).not.toHaveBeenCalled();
    });
  });

  describe("free-text graphqlQuery override", () => {
    it("uses a free-text graphqlQuery verbatim and aggregates the rows client-side", async () => {
      const element = createElement("c-d3-stacked-bar-chart-graphql", {
        is: D3StackedBarChartGraphql
      });
      element.graphqlQuery = FREE_TEXT_QUERY;
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.seriesField = "Type";
      element.valueField = "Amount";
      element.operation = "Sum";
      document.body.appendChild(element);

      await flushPromises();
      graphql.emit(FREE_TEXT_DUP_RESPONSE);
      await flushPromises();
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".chart-container")
      ).not.toBeNull();
      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeNull();

      // The admin's document is passed to gql verbatim; neither structured
      // aggregate builder (both emit a groupBy clause) is ever used.
      const queryStrings = gql.mock.results.map((r) => r.value);
      expect(queryStrings.some((q) => q.includes(FREE_TEXT_QUERY))).toBe(true);
      expect(queryStrings.every((q) => !q.includes("groupBy"))).toBe(true);
    });

    it("sums duplicate (category, series) keys so free-text numbers match the aggregate path", async () => {
      // FREE_TEXT_DUP_RESPONSE has two Prospecting/New rows (100 + 50) plus a
      // Prospecting/Existing row (200). If the client-side pivot sums duplicate
      // keys, the stacked total for Prospecting is 150 + 200 = 350 and the
      // y-scale domain upper bound is 350 * 1.1. If it did NOT sum (e.g.
      // last-wins), New would be 50 and the total would be 250.
      const { mockD3: sumMock, domainCalls } = createSummationMockD3();
      loadD3.mockResolvedValue(sumMock);

      const element = createElement("c-d3-stacked-bar-chart-graphql", {
        is: D3StackedBarChartGraphql
      });
      element.graphqlQuery = FREE_TEXT_QUERY;
      element.objectApiName = "Opportunity";
      element.groupByField = "StageName";
      element.seriesField = "Type";
      element.valueField = "Amount";
      element.operation = "Sum";
      document.body.appendChild(element);

      await flushPromises();
      graphql.emit(FREE_TEXT_DUP_RESPONSE);
      await flushPromises();
      await flushPromises();

      // The only numeric [0, max] domain call is the stacked y-scale.
      const numericDomain = domainCalls.find(
        (d) => Array.isArray(d) && d[0] === 0 && typeof d[1] === "number"
      );
      expect(numericDomain).toBeTruthy();
      // Divide out the 10% headroom to recover the summed stacked total.
      expect(Math.round(numericDomain[1] / 1.1)).toBe(350);
    });

    it("surfaces wire errors from a free-text graphqlQuery in the error state", async () => {
      const element = createElement("c-d3-stacked-bar-chart-graphql", {
        is: D3StackedBarChartGraphql
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
      const element = createElement("c-d3-stacked-bar-chart-graphql", {
        is: D3StackedBarChartGraphql
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
      const element = createElement("c-d3-stacked-bar-chart-graphql", {
        is: D3StackedBarChartGraphql
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
      const element = createElement("c-d3-stacked-bar-chart-graphql", {
        is: D3StackedBarChartGraphql
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
      const element = createElement("c-d3-stacked-bar-chart-graphql", {
        is: D3StackedBarChartGraphql
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
      const element = createElement("c-d3-stacked-bar-chart-graphql", {
        is: D3StackedBarChartGraphql
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
      const element = createElement("c-d3-stacked-bar-chart-graphql", {
        is: D3StackedBarChartGraphql
      });
      Object.assign(element, STRUCTURED_PROPS, { graphqlFilter: "  " });
      document.body.appendChild(element);
      await flushPromises();
      const { query } = graphql.getLastConfig();
      expect(query).toBeDefined();
      expect(query).not.toContain("where:");
    });
  });

  describe("free-text ⇄ structured stack-input equivalence", () => {
    it("free-text (un-summed rows) and structured (pre-summed) feed d3.stack identical keys and pivot rows", async () => {
      // Two D3 mocks so each path's stack-generator calls are captured
      // independently. The wire adapter's emit fans out to every mounted
      // instance, so the structured chart is unmounted before the free-text
      // response is emitted.
      const mockStructured = createMockD3();
      const mockFreeText = createMockD3();
      loadD3
        .mockResolvedValueOnce(mockStructured)
        .mockResolvedValueOnce(mockFreeText);

      // Structured path: server pre-summed New=100, Existing=200.
      const structured = createElement("c-d3-stacked-bar-chart-graphql", {
        is: D3StackedBarChartGraphql
      });
      structured.objectApiName = "Opportunity";
      structured.groupByField = "StageName";
      structured.seriesField = "Type";
      structured.valueField = "Amount";
      structured.operation = "Sum";
      document.body.appendChild(structured);
      await flushPromises();
      graphql.emit(MULTI_GROUP_RESPONSE);
      await flushPromises();
      await flushPromises();

      const structuredKeys = mockStructured._mockStack.keys.mock.calls[0][0];
      const structuredPivot = mockStructured._mockStack.mock.calls[0][0];

      document.body.removeChild(structured);

      // Free-text path: raw un-summed rows (New 60+40=100, Existing 200).
      const freeText = createElement("c-d3-stacked-bar-chart-graphql", {
        is: D3StackedBarChartGraphql
      });
      freeText.graphqlQuery = FREE_TEXT_QUERY;
      freeText.objectApiName = "Opportunity";
      freeText.groupByField = "StageName";
      freeText.seriesField = "Type";
      freeText.valueField = "Amount";
      freeText.operation = "Sum";
      document.body.appendChild(freeText);
      await flushPromises();
      graphql.emit(FREE_TEXT_EQUIV_RESPONSE);
      await flushPromises();
      await flushPromises();

      const freeTextKeys = mockFreeText._mockStack.keys.mock.calls[0][0];
      const freeTextPivot = mockFreeText._mockStack.mock.calls[0][0];

      // Both paths must hand d3.stack() the same series keys and the same
      // pivoted rows — the client-side pivot+sum reproduces the server aggregate.
      expect(freeTextKeys).toEqual(structuredKeys);
      expect(freeTextKeys).toEqual(["New", "Existing"]);
      expect(freeTextPivot).toEqual(structuredPivot);
      expect(freeTextPivot).toEqual([
        { label: "Prospecting", New: 100, Existing: 200 }
      ]);
    });
  });
});
