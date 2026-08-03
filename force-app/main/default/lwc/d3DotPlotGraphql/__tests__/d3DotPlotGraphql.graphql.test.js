// ABOUTME: Tests the additive GraphQL self-fetch path on d3DotPlotGraphql (Approach A, CT-AGG).
// ABOUTME: Uses the real HTML selectors: .chart-container (chart) and .slds-text-color_error (error).
import { createElement } from "lwc";
import D3DotPlotGraphql from "c/d3DotPlotGraphql";
import { graphql, gql } from "lightning/graphql";
import { loadD3 } from "c/d3Lib";

jest.mock("c/d3Lib", () => ({ loadD3: jest.fn() }));

// Robust chainable D3 stub (per conversion-templates.md): `then` guarded so the
// stub never looks thenable, and max() computed for real since renderChart uses
// it synchronously (xMax * 1.1) to build the value scale.
function makeD3Stub() {
  const chain = new Proxy(function () {}, {
    get: (target, prop) => {
      if (prop === "then") return undefined;
      if (prop === "max")
        return (arr, accessor) => Math.max(...arr.map(accessor ?? ((d) => d)));
      return () => chain;
    },
    apply: () => chain
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
                StageName: { value: "Prospecting" },
                Amount: { sum: { value: 1000 } }
              }
            }
          },
          {
            node: {
              aggregate: {
                StageName: { value: "Closed Won" },
                Amount: { sum: { value: 5000 } }
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

describe("d3DotPlotGraphql GraphQL path (Approach A, CT-AGG)", () => {
  beforeEach(() => {
    loadD3.mockResolvedValue(makeD3Stub());

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

  it("renders the chart container when GraphQL aggregate data arrives", async () => {
    const element = createElement("c-d3-dot-plot-graphql", { is: D3DotPlotGraphql });
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
    const element = createElement("c-d3-dot-plot-graphql", { is: D3DotPlotGraphql });
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
    const element = createElement("c-d3-dot-plot-graphql", { is: D3DotPlotGraphql });
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
    const element = createElement("c-d3-dot-plot-graphql", { is: D3DotPlotGraphql });
    element.fetchMode = "graphql";
    element.objectApiName = "Opportunity";
    element.groupByField = "StageName";
    element.operation = "Count";
    document.body.appendChild(element);

    await flushPromises();

    const queryStrings = gql.mock.results.map((r) => r.value);
    expect(queryStrings.some((q) => q.includes("first: 2000"))).toBe(true);
  });

  it("draws a real D3 dot mark when data arrives (proves renderChart executed)", async () => {
    const calls = [];
    const chain = new Proxy(function () {}, {
      get: (target, prop) => {
        if (prop === "then") return undefined;
        if (prop === "max")
          return (arr, accessor) =>
            Math.max(...arr.map(accessor ?? ((d) => d)));
        return (...args) => {
          calls.push([prop, ...args]);
          return chain;
        };
      },
      apply: () => chain
    });
    loadD3.mockResolvedValue(chain);

    const element = createElement("c-d3-dot-plot-graphql", { is: D3DotPlotGraphql });
    element.fetchMode = "graphql";
    element.objectApiName = "Opportunity";
    element.groupByField = "StageName";
    element.valueField = "Amount";
    element.operation = "Sum";
    document.body.appendChild(element);

    await flushPromises();
    graphql.emit(AGG_RESPONSE);
    await flushPromises();
    await flushPromises();

    expect(
      calls.some((c) => c[0] === "attr" && c[1] === "class" && c[2] === "dot")
    ).toBe(true);
  });
});
