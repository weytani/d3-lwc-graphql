// ABOUTME: Tests the additive GraphQL self-fetch path on d3SlopeChartGraphql (Approach A, CT-REC).
// ABOUTME: Slope has no server-side aggregate — the graphql path always fetches raw
// ABOUTME: groupByField/startValueField/endValueField records and feeds the existing
// ABOUTME: processSlopeData path, same as recordCollection/soqlQuery.
import { createElement } from "lwc";
import D3SlopeChartGraphql from "c/d3SlopeChartGraphql";
import { graphql, gql } from "lightning/graphql";
import { loadD3 } from "c/d3Lib";

jest.mock("c/d3Lib", () => ({ loadD3: jest.fn() }));

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

async function flushPromises() {
  return Promise.resolve();
}

describe("d3SlopeChartGraphql GraphQL path (Approach A, CT-REC)", () => {
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
    element.fetchMode = "graphql";
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
    element.fetchMode = "graphql";
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

  it("bounds the query with the same first: value as other CT-REC charts", async () => {
    const element = createElement("c-d3-slope-chart-graphql", {
      is: D3SlopeChartGraphql
    });
    element.fetchMode = "graphql";
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
    element.fetchMode = "graphql";
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
    element.fetchMode = "graphql";
    element.objectApiName = "Opportunity";
    element.groupByField = "Name";
    element.startValueField = "Amount";
    element.endValueField = "";
    document.body.appendChild(element);

    await flushPromises();

    expect(gql).not.toHaveBeenCalled();
  });
});
