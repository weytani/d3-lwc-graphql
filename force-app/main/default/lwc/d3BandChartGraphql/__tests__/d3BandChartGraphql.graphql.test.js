// ABOUTME: Tests the additive GraphQL self-fetch path on d3BandChartGraphql (Approach A, CT-REC).
// ABOUTME: Band has no server-side aggregate — the graphql path always fetches raw
// ABOUTME: dateField/lowerField/upperField(/valueField) records and feeds the existing
// ABOUTME: processBandData path, same as recordCollection/soqlQuery.
import { createElement } from "lwc";
import D3BandChartGraphql from "c/d3BandChartGraphql";
import { graphql, gql } from "lightning/graphql";
import { loadD3 } from "c/d3Lib";

jest.mock("c/d3Lib", () => ({ loadD3: jest.fn() }));

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

async function flushPromises() {
  return Promise.resolve();
}

describe("d3BandChartGraphql GraphQL path (Approach A, CT-REC)", () => {
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

  it("renders the chart container and actually draws the band when GraphQL record data arrives", async () => {
    const element = createElement("c-d3-band-chart-graphql", { is: D3BandChartGraphql });
    element.fetchMode = "graphql";
    element.objectApiName = "Opportunity";
    element.dateField = "CloseDate";
    element.lowerField = "Amount";
    element.upperField = "ExpectedRevenue";
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
    // a "band-area" path must have been appended with a "d" attribute.
    expect(
      d3Calls.some(
        (c) => c[0] === "attr" && c[1] === "class" && c[2] === "band-area"
      )
    ).toBe(true);
  });

  it("shows an error when the GraphQL wire emits errors", async () => {
    const element = createElement("c-d3-band-chart-graphql", { is: D3BandChartGraphql });
    element.fetchMode = "graphql";
    element.objectApiName = "Opportunity";
    element.dateField = "CloseDate";
    element.lowerField = "Amount";
    element.upperField = "ExpectedRevenue";
    document.body.appendChild(element);

    await flushPromises();
    graphql.emitErrors([{ message: "boom" }]);
    await flushPromises();

    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).not.toBeNull();
  });

  it("bounds the query with the same first: value as other CT-REC charts", async () => {
    const element = createElement("c-d3-band-chart-graphql", { is: D3BandChartGraphql });
    element.fetchMode = "graphql";
    element.objectApiName = "Opportunity";
    element.dateField = "CloseDate";
    element.lowerField = "Amount";
    element.upperField = "ExpectedRevenue";
    document.body.appendChild(element);

    await flushPromises();

    const queryStrings = gql.mock.results.map((r) => r.value);
    expect(queryStrings.some((q) => q.includes("first: 2000"))).toBe(true);
  });

  it("requests dateField, lowerField, upperField, and valueField, deduped", async () => {
    const element = createElement("c-d3-band-chart-graphql", { is: D3BandChartGraphql });
    element.fetchMode = "graphql";
    element.objectApiName = "Opportunity";
    element.dateField = "CloseDate";
    element.lowerField = "Amount";
    element.upperField = "ExpectedRevenue";
    // valueField repeats dateField on purpose to prove deduping.
    element.valueField = "CloseDate";
    document.body.appendChild(element);

    await flushPromises();

    const queryStrings = gql.mock.results.map((r) => r.value);
    const query = queryStrings[queryStrings.length - 1];
    expect(query).toContain("CloseDate {");
    expect(query).toContain("Amount {");
    expect(query).toContain("ExpectedRevenue {");
    expect(query.match(/CloseDate \{/g).length).toBe(1);
  });

  it("does not provision the wire when upperField is missing", async () => {
    const element = createElement("c-d3-band-chart-graphql", { is: D3BandChartGraphql });
    element.fetchMode = "graphql";
    element.objectApiName = "Opportunity";
    element.dateField = "CloseDate";
    element.lowerField = "Amount";
    element.upperField = "";
    document.body.appendChild(element);

    await flushPromises();

    expect(gql).not.toHaveBeenCalled();
  });
});
