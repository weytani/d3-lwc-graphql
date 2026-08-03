// ABOUTME: Tests the additive GraphQL self-fetch path on d3DivergingBarChartGraphql (Approach A).
// ABOUTME: Uses the real HTML selectors: .chart-container (chart) and .slds-text-color_error (error).
import { createElement } from "lwc";
import D3DivergingBarChartGraphql from "c/d3DivergingBarChartGraphql";
import { graphql, gql } from "lightning/graphql";
import { loadD3 } from "c/d3Lib";

jest.mock("c/d3Lib", () => ({ loadD3: jest.fn() }));

// Minimal chainable D3 stub: every call returns the same chainable object,
// except max(), which renderChart uses synchronously (-maxAbs, maxAbs) before
// any further D3 chaining and so needs a real number back, not the chain
// object. Calling the stub itself (invoking a scale, e.g. `xScale(0)`) also
// returns a real number rather than the chain object — renderChart computes
// `zero = xScale(0)` eagerly and interpolates it into a template literal
// (`translate(${zero},0)`), which throws the same "cannot convert to
// primitive" error if it gets a non-primitive back.
// The `then` guard keeps this from looking like a thenable to
// Promise.resolve()/await — without it, `prop === "then"` would return a
// callable that swallows (resolve, reject), and awaiting loadD3() would
// hang forever.
function makeD3Stub() {
  const chain = new Proxy(function () {}, {
    get: (target, prop) => {
      if (prop === "then") return undefined;
      if (prop === "max")
        return (arr, accessor) => Math.max(...arr.map(accessor ?? ((d) => d)));
      return () => chain;
    },
    apply: () => 0
  });
  return chain;
}

const AGG_RESPONSE = {
  uiapi: {
    aggregate: {
      Opportunity: {
        edges: [
          {
            node: {
              aggregate: {
                StageName: { value: "Loss" },
                Amount: { sum: { value: -300 } }
              }
            }
          },
          {
            node: {
              aggregate: {
                StageName: { value: "Gain" },
                Amount: { sum: { value: 200 } }
              }
            }
          }
        ]
      }
    }
  }
};

const RECORD_RESPONSE = {
  uiapi: {
    query: {
      Opportunity: {
        edges: [
          { node: { StageName: { value: "Prospecting" } } },
          { node: { StageName: { value: "Prospecting" } } },
          { node: { StageName: { value: "Closed Won" } } }
        ]
      }
    }
  }
};

async function flushPromises() {
  return Promise.resolve();
}

describe("d3DivergingBarChartGraphql GraphQL path (Approach A)", () => {
  beforeEach(() => {
    loadD3.mockResolvedValue(makeD3Stub());

    // Mock getBoundingClientRect so chart renders (not zero-width)
    Element.prototype.getBoundingClientRect = jest.fn(() => ({
      width: 400,
      height: 300,
      top: 0,
      left: 0,
      bottom: 300,
      right: 400
    }));

    // Mock ResizeObserver
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

  it("renders the chart container when GraphQL aggregate data arrives", async () => {
    const element = createElement("c-d3-diverging-bar-chart-graphql", {
      is: D3DivergingBarChartGraphql
    });
    element.fetchMode = "graphql";
    element.objectApiName = "Opportunity";
    element.groupByField = "StageName";
    element.valueField = "Amount";
    element.operation = "Sum";
    document.body.appendChild(element);

    await flushPromises(); // connectedCallback (loadD3 + loadData early-return)
    graphql.emit(AGG_RESPONSE);
    await flushPromises();
    await flushPromises();

    expect(element.shadowRoot.querySelector(".chart-container")).not.toBeNull();
    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).toBeNull();
  });

  it("shows an error when the GraphQL wire emits errors", async () => {
    const element = createElement("c-d3-diverging-bar-chart-graphql", {
      is: D3DivergingBarChartGraphql
    });
    element.fetchMode = "graphql";
    element.objectApiName = "Opportunity";
    element.groupByField = "StageName";
    element.valueField = "Amount";
    element.operation = "Sum";
    document.body.appendChild(element);

    await flushPromises();
    graphql.emitErrors([{ message: "boom" }]);
    await flushPromises();

    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).not.toBeNull();
  });

  it("falls back to a raw record query and counts client-side for Count operation", async () => {
    const element = createElement("c-d3-diverging-bar-chart-graphql", {
      is: D3DivergingBarChartGraphql
    });
    element.fetchMode = "graphql";
    element.objectApiName = "Opportunity";
    element.groupByField = "StageName";
    element.operation = "Count";
    document.body.appendChild(element);

    await flushPromises();
    graphql.emit(RECORD_RESPONSE);
    await flushPromises();
    await flushPromises();

    expect(element.shadowRoot.querySelector(".chart-container")).not.toBeNull();
    expect(
      element.shadowRoot.querySelector(".slds-text-color_error")
    ).toBeNull();
  });

  it("bounds the Count-path query with the same first: value as the aggregate path", async () => {
    const element = createElement("c-d3-diverging-bar-chart-graphql", {
      is: D3DivergingBarChartGraphql
    });
    element.fetchMode = "graphql";
    element.objectApiName = "Opportunity";
    element.groupByField = "StageName";
    element.operation = "Count";
    document.body.appendChild(element);

    await flushPromises();

    const queryStrings = gql.mock.results.map((r) => r.value);
    expect(queryStrings.some((q) => q.includes("first: 2000"))).toBe(true);
  });
});
