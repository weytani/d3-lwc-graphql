// ABOUTME: Tests the GraphQL self-fetch path on the standalone d3SlopeChartGraphql bundle.
// ABOUTME: Slope has no server-side aggregate — the structured path fetches raw
// ABOUTME: groupByField/startValueField/endValueField records and feeds processSlopeData;
// ABOUTME: the free-text graphqlQuery admin override shapes through the same step.
import { createElement } from "lwc";
import D3SlopeChartGraphql from "c/d3SlopeChartGraphql";
import { graphql, gql } from "lightning/graphql";
import { loadD3 } from "../d3Loader";

jest.mock("../d3Loader", () => ({ loadD3: jest.fn() }));

// Slope only uses scalePoint (no d3.max/min/extent numeric reduction), so the
// stub only needs the standard `then` guard to avoid looking thenable to
// Promise.resolve() — no special numeric handling is required.
function makeD3Stub() {
  const calls = [];
  const chain = new Proxy(function () {}, {
    get: (target, prop) => {
      if (prop === "then") return undefined;
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
              Name: { value: "Acme" },
              Amount: { value: 100 },
              ExpectedRevenue: { value: 150 }
            }
          },
          {
            node: {
              Name: { value: "Globex" },
              Amount: { value: 200 },
              ExpectedRevenue: { value: 180 }
            }
          }
        ]
      }
    }
  }
};

// A record-query document an admin would paste into graphqlQuery. The chart
// shapes the returned rows client-side into per-entity before/after pairs.
const FREE_TEXT_QUERY =
  "query { uiapi { query { Opportunity { edges { node { Name { value } Amount { value } ExpectedRevenue { value } } } } } } }";

// Two rows sharing one label — slope draws a line per record and never dedupes,
// so both paths must keep them as two distinct entities.
const DUPLICATE_LABEL_RESPONSE = {
  uiapi: {
    query: {
      Opportunity: {
        edges: [
          {
            node: {
              Name: { value: "Acme" },
              Amount: { value: 100 },
              ExpectedRevenue: { value: 150 }
            }
          },
          {
            node: {
              Name: { value: "Acme" },
              Amount: { value: 30 },
              ExpectedRevenue: { value: 40 }
            }
          }
        ]
      }
    }
  }
};

async function flushPromises() {
  return Promise.resolve();
}

/** The entity array bound to the slope groups by renderChart's .data(...) call. */
function boundEntities(calls) {
  const call = calls.find((c) => c[0] === "data" && Array.isArray(c[1]));
  return call ? call[1] : null;
}

/** Applies the field mappings every test in this tier shares. */
function applyFieldMappings(element) {
  element.groupByField = "Name";
  element.startValueField = "Amount";
  element.endValueField = "ExpectedRevenue";
}

describe("d3SlopeChartGraphql GraphQL path", () => {
  let d3Calls;

  beforeEach(() => {
    const stub = makeD3Stub();
    d3Calls = stub.calls;
    loadD3.mockResolvedValue(stub.chain);

    Element.prototype.getBoundingClientRect = jest.fn(() => ({
      width: 500,
      height: 300,
      top: 0,
      left: 0,
      bottom: 300,
      right: 500
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

  it("renders the chart container and actually draws a connecting line when GraphQL record data arrives", async () => {
    const element = createElement("c-d3-slope-chart-graphql", {
      is: D3SlopeChartGraphql
    });
    element.objectApiName = "Opportunity";
    element.groupByField = "Name";
    element.startValueField = "Amount";
    element.endValueField = "ExpectedRevenue";
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
    // a "slope-line" must have been appended with a class attribute.
    expect(
      d3Calls.some(
        (c) => c[0] === "attr" && c[1] === "class" && c[2] === "slope-line"
      )
    ).toBe(true);
  });

  it("shows an error when the GraphQL wire emits errors", async () => {
    const element = createElement("c-d3-slope-chart-graphql", {
      is: D3SlopeChartGraphql
    });
    element.objectApiName = "Opportunity";
    element.groupByField = "Name";
    element.startValueField = "Amount";
    element.endValueField = "ExpectedRevenue";
    document.body.appendChild(element);

    await flushPromises();
    graphql.emitErrors([{ message: "boom" }]);
    await flushPromises();

    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).not.toBeNull();
  });

  it("bounds the structured query with a first: 2000 record cap", async () => {
    const element = createElement("c-d3-slope-chart-graphql", {
      is: D3SlopeChartGraphql
    });
    element.objectApiName = "Opportunity";
    element.groupByField = "Name";
    element.startValueField = "Amount";
    element.endValueField = "ExpectedRevenue";
    document.body.appendChild(element);

    await flushPromises();

    const queryStrings = gql.mock.results.map((r) => r.value);
    expect(queryStrings.some((q) => q.includes("first: 2000"))).toBe(true);
  });

  it("requests groupByField, startValueField, and endValueField, deduped", async () => {
    const element = createElement("c-d3-slope-chart-graphql", {
      is: D3SlopeChartGraphql
    });
    element.objectApiName = "Opportunity";
    element.groupByField = "Name";
    element.startValueField = "Amount";
    // endValueField repeats startValueField on purpose to prove deduping.
    element.endValueField = "Amount";
    document.body.appendChild(element);

    await flushPromises();

    const queryStrings = gql.mock.results.map((r) => r.value);
    const query = queryStrings[queryStrings.length - 1];
    expect(query).toContain("Name {");
    expect(query).toContain("Amount {");
    expect(query.match(/Amount \{/g).length).toBe(1);
  });

  it("does not provision the wire when endValueField is missing", async () => {
    const element = createElement("c-d3-slope-chart-graphql", {
      is: D3SlopeChartGraphql
    });
    element.objectApiName = "Opportunity";
    element.groupByField = "Name";
    element.startValueField = "Amount";
    element.endValueField = "";
    document.body.appendChild(element);

    await flushPromises();

    expect(gql).not.toHaveBeenCalled();
  });

  it("keeps the loading spinner up while the wire is provisioned and awaiting its first emission", async () => {
    const element = createElement("c-d3-slope-chart-graphql", {
      is: D3SlopeChartGraphql
    });
    element.objectApiName = "Opportunity";
    applyFieldMappings(element);
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

  it("uses a free-text graphqlQuery verbatim and shapes the rows client-side", async () => {
    const element = createElement("c-d3-slope-chart-graphql", {
      is: D3SlopeChartGraphql
    });
    element.graphqlQuery = FREE_TEXT_QUERY;
    element.objectApiName = "Opportunity";
    applyFieldMappings(element);
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
                  Name: { value: "Acme" },
                  Amount: { value: 100 },
                  ExpectedRevenue: { value: 150 }
                }
              }
            ]
          }
        }
      }
    };

    const element = createElement("c-d3-slope-chart-graphql", {
      is: D3SlopeChartGraphql
    });
    element.graphqlQuery =
      "query { uiapi { query { MyCustomObject__c { edges { node { Name { value } Amount { value } ExpectedRevenue { value } } } } } } }";
    // objectApiName intentionally left blank — the normalizer must auto-detect.
    applyFieldMappings(element);
    document.body.appendChild(element);

    await flushPromises();
    graphql.emit(AUTODETECT_RESPONSE);
    await flushPromises();
    await flushPromises();

    expect(element.shadowRoot.querySelector(".chart-container")).not.toBeNull();
    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).toBeNull();
    // The connecting line was drawn from the auto-detected object's rows.
    expect(
      d3Calls.some(
        (c) => c[0] === "attr" && c[1] === "class" && c[2] === "slope-line"
      )
    ).toBe(true);
  });

  it("shapes a free-text emission through the same slope step as the structured path", async () => {
    // Slope's structured path fetches raw, un-summed records and draws one line
    // per record. The free-text path feeds the identical processSlopeData step,
    // so the same payload must bind the identical entity array — in particular
    // the two same-label rows stay distinct rather than being summed.
    const structured = createElement("c-d3-slope-chart-graphql", {
      is: D3SlopeChartGraphql
    });
    structured.objectApiName = "Opportunity";
    applyFieldMappings(structured);
    document.body.appendChild(structured);

    await flushPromises();
    graphql.emit(DUPLICATE_LABEL_RESPONSE);
    await flushPromises();
    await flushPromises();

    const structuredBound = boundEntities(d3Calls);
    document.body.removeChild(structured);

    // Fresh stub so the free-text run's d3 calls are captured on their own.
    const freeTextStub = makeD3Stub();
    loadD3.mockResolvedValue(freeTextStub.chain);

    const freeText = createElement("c-d3-slope-chart-graphql", {
      is: D3SlopeChartGraphql
    });
    freeText.graphqlQuery = FREE_TEXT_QUERY;
    freeText.objectApiName = "Opportunity";
    applyFieldMappings(freeText);
    document.body.appendChild(freeText);

    await flushPromises();
    graphql.emit(DUPLICATE_LABEL_RESPONSE);
    await flushPromises();
    await flushPromises();

    const freeTextBound = boundEntities(freeTextStub.calls);

    expect(structuredBound).toHaveLength(2);
    expect(structuredBound.map((d) => d.startValue)).toEqual([100, 30]);
    expect(freeTextBound).toEqual(structuredBound);
  });

  it("drops free-text rows whose value field the query omitted, and reports no data when all are dropped", async () => {
    // The documented graphqlQuery footgun: the normalizer sets every projected
    // key (null when the query did not select it), so a row missing a value
    // field is dropped by processSlopeData rather than coerced to a zero slope.
    const MISSING_END_FIELD_RESPONSE = {
      uiapi: {
        query: {
          Opportunity: {
            edges: [
              { node: { Name: { value: "Acme" }, Amount: { value: 100 } } },
              { node: { Name: { value: "Globex" }, Amount: { value: 200 } } }
            ]
          }
        }
      }
    };

    const element = createElement("c-d3-slope-chart-graphql", {
      is: D3SlopeChartGraphql
    });
    element.graphqlQuery =
      "query { uiapi { query { Opportunity { edges { node { Name { value } Amount { value } } } } } } }";
    element.objectApiName = "Opportunity";
    applyFieldMappings(element);
    document.body.appendChild(element);

    await flushPromises();
    graphql.emit(MISSING_END_FIELD_RESPONSE);
    await flushPromises();

    const err = element.shadowRoot.querySelector(".slds-text-color_error");
    expect(err).not.toBeNull();
    expect(err.textContent).toContain("No data after processing");
  });

  it("surfaces wire errors from a free-text graphqlQuery in the error state", async () => {
    const element = createElement("c-d3-slope-chart-graphql", {
      is: D3SlopeChartGraphql
    });
    element.graphqlQuery = FREE_TEXT_QUERY;
    element.objectApiName = "Opportunity";
    applyFieldMappings(element);
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
    const element = createElement("c-d3-slope-chart-graphql", {
      is: D3SlopeChartGraphql
    });
    element.graphqlQuery = FREE_TEXT_QUERY;
    element.objectApiName = "Opportunity";
    applyFieldMappings(element);
    document.body.appendChild(element);

    await flushPromises();
    graphql.emit({ uiapi: { aggregate: { Opportunity: { edges: [] } } } });
    await flushPromises();

    const err = element.shadowRoot.querySelector(".slds-text-color_error");
    expect(err).not.toBeNull();
    expect(err.textContent).toMatch(/record query/i);
  });

  it("ignores a blank graphqlQuery and falls through to the structured builder", async () => {
    const element = createElement("c-d3-slope-chart-graphql", {
      is: D3SlopeChartGraphql
    });
    element.graphqlQuery = "   ";
    element.objectApiName = "Opportunity";
    applyFieldMappings(element);
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
    const element = createElement("c-d3-slope-chart-graphql", {
      is: D3SlopeChartGraphql
    });
    element.recordCollection = [
      { Name: "Acme", Amount: 100, ExpectedRevenue: 150 },
      { Name: "Globex", Amount: 200, ExpectedRevenue: 180 }
    ];
    element.graphqlQuery = FREE_TEXT_QUERY;
    applyFieldMappings(element);
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
});
