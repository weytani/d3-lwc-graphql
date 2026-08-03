// ABOUTME: End-to-end lifecycle tests for the D3 Pie Chart component.
// ABOUTME: Verifies full render pipeline, legend behavior, GraphQL self-fetch, multi-instance isolation, and error recovery using real bundle-local modules with mocked D3.

import { createElement } from "lwc";
import D3PieChartGraphql from "c/d3PieChartGraphql";
import { loadD3 } from "../d3Loader";
import { graphql } from "lightning/graphql";

// ═══════════════════════════════════════════════════════════════
// MOCK SETUP: Only mock D3, navigation, and toast
// Real modules: bundle-local data, theme, utils, graphql
// ═══════════════════════════════════════════════════════════════

jest.mock("../d3Loader", () => ({
  loadD3: jest.fn()
}));

const mockNavigate = jest.fn();
jest.mock(
  "lightning/navigation",
  () => {
    const NavMixin = jest.fn((Base) => {
      return class extends Base {
        [Symbol.for("NavigationMixin.Navigate")] = mockNavigate;
      };
    });
    NavMixin.Navigate = Symbol.for("NavigationMixin.Navigate");
    NavMixin.GenerateUrl = Symbol.for("NavigationMixin.GenerateUrl");
    return { NavigationMixin: NavMixin };
  },
  { virtual: true }
);

jest.mock(
  "lightning/platformShowToastEvent",
  () => {
    return {
      ShowToastEvent: class ShowToastEvent extends CustomEvent {
        constructor(toast) {
          super("lightning__showtoast", {
            composed: true,
            cancelable: true,
            bubbles: true,
            detail: toast
          });
        }
      }
    };
  },
  { virtual: true }
);

// ═══════════════════════════════════════════════════════════════
// MOCK D3 FACTORY (pie-specific — pie, arc, interpolate)
// ═══════════════════════════════════════════════════════════════

const createMockD3 = () => {
  const d3 = {
    select: jest.fn(() => d3),
    append: jest.fn(() => d3),
    attr: jest.fn(() => d3),
    style: jest.fn(() => d3),
    call: jest.fn(() => d3),
    selectAll: jest.fn(() => d3),
    data: jest.fn(() => d3),
    enter: jest.fn(() => d3),
    transition: jest.fn(() => d3),
    duration: jest.fn(() => d3),
    attrTween: jest.fn(() => d3),
    on: jest.fn(() => d3),
    remove: jest.fn(() => d3),
    text: jest.fn(() => d3),
    insert: jest.fn(() => d3),
    pie: jest.fn(() => {
      const pieFn = jest.fn((data) =>
        data.map((d, i) => ({
          data: d,
          value: d.value,
          startAngle: i * 0.5,
          endAngle: (i + 1) * 0.5
        }))
      );
      pieFn.value = jest.fn(() => pieFn);
      pieFn.sort = jest.fn(() => pieFn);
      return pieFn;
    }),
    arc: jest.fn(() => {
      const arcFn = jest.fn(() => "M0,0");
      arcFn.innerRadius = jest.fn(() => arcFn);
      arcFn.outerRadius = jest.fn(() => arcFn);
      arcFn.centroid = jest.fn(() => [0, 0]);
      return arcFn;
    }),
    interpolate: jest.fn(() => jest.fn(() => ({ startAngle: 0, endAngle: 1 })))
  };
  return d3;
};

// ═══════════════════════════════════════════════════════════════
// SAMPLE DATA
// ═══════════════════════════════════════════════════════════════

const SAMPLE_DATA = [
  { StageName: "Prospecting", Amount: 100 },
  { StageName: "Prospecting", Amount: 200 },
  { StageName: "Qualification", Amount: 150 },
  { StageName: "Closed Won", Amount: 500 }
];

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

// eslint-disable-next-line @lwc/lwc/no-async-operation
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

async function createChart(props = {}) {
  const element = createElement("c-d3-pie-chart-graphql", {
    is: D3PieChartGraphql
  });

  Object.assign(element, {
    groupByField: "StageName",
    valueField: "Amount",
    operation: "Sum",
    recordCollection: SAMPLE_DATA,
    ...props
  });

  document.body.appendChild(element);
  await flushPromises();
  await flushPromises();
  return element;
}

// ═══════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════

describe("c-d3-pie-chart-graphql e2e", () => {
  let consoleErrorSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    jest.clearAllMocks();

    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

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
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  // ═══════════════════════════════════════════════════════════════
  // FULL RENDER LIFECYCLE
  // ═══════════════════════════════════════════════════════════════

  describe("full render lifecycle", () => {
    it("creates pie chart end-to-end with correct D3 calls", async () => {
      const mockD3 = createMockD3();
      loadD3.mockResolvedValue(mockD3);

      const element = await createChart();
      await flushPromises();

      // loadD3 was called during connectedCallback
      expect(loadD3).toHaveBeenCalled();

      // pie layout was created
      expect(mockD3.pie).toHaveBeenCalled();

      // arc generator was called at least 2 times (arc + arcHover)
      expect(mockD3.arc).toHaveBeenCalledTimes(2);

      // SVG was appended
      const appendCalls = mockD3.append.mock.calls.map((c) => c[0]);
      expect(appendCalls).toContain("svg");

      // Chart container is visible in the DOM
      const chartContainer =
        element.shadowRoot.querySelector(".chart-container");
      expect(chartContainer).toBeTruthy();

      // Legend container is visible with 3 aggregated items
      // (Closed Won=500, Prospecting=300, Qualification=150)
      const legendContainer =
        element.shadowRoot.querySelector(".legend-container");
      expect(legendContainer).toBeTruthy();

      const legendItems = element.shadowRoot.querySelectorAll(".legend-item");
      expect(legendItems.length).toBe(3);

      // No console errors during the full lifecycle
      const realErrors = consoleErrorSpy.mock.calls.filter(
        (call) =>
          !String(call[0]).includes("D3PieChartGraphql initialization error")
      );
      expect(realErrors.length).toBe(0);
    });

    it("GraphQL self-fetch path: no recordCollection -> wire emits -> full pipeline", async () => {
      const mockD3 = createMockD3();
      loadD3.mockResolvedValue(mockD3);

      const element = createElement("c-d3-pie-chart-graphql", {
        is: D3PieChartGraphql
      });
      Object.assign(element, {
        groupByField: "StageName",
        valueField: "Amount",
        operation: "Sum",
        height: 300,
        objectApiName: "Opportunity",
        recordCollection: []
      });
      document.body.appendChild(element);
      await flushPromises();

      // Grouped-aggregate wire result for the structured Sum path
      graphql.emit({
        uiapi: {
          aggregate: {
            Opportunity: {
              edges: [
                {
                  node: {
                    aggregate: {
                      StageName: { value: "Discovery" },
                      Amount: { sum: { value: 500 } }
                    }
                  }
                },
                {
                  node: {
                    aggregate: {
                      StageName: { value: "Proposal" },
                      Amount: { sum: { value: 300 } }
                    }
                  }
                }
              ]
            }
          }
        }
      });
      await flushPromises();
      await flushPromises();

      expect(loadD3).toHaveBeenCalled();
      expect(mockD3.select).toHaveBeenCalled();
      const appendCalls = mockD3.append.mock.calls.map((c) => c[0]);
      expect(appendCalls).toContain("svg");
      expect(mockD3.pie).toHaveBeenCalled();

      const container = element.shadowRoot.querySelector(".chart-container");
      expect(container).toBeTruthy();
      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeFalsy();

      const legendItems = element.shadowRoot.querySelectorAll(".legend-item");
      expect(legendItems.length).toBe(2);
    });

    it("cleanup removes resize handler and tooltip on disconnect", async () => {
      const mockDisconnect = jest.fn();
      global.ResizeObserver = jest.fn().mockImplementation(() => ({
        observe: jest.fn(),
        unobserve: jest.fn(),
        disconnect: mockDisconnect
      }));

      const mockD3 = createMockD3();
      loadD3.mockResolvedValue(mockD3);

      const element = await createChart();
      await flushPromises();

      // Verify chart rendered before removal
      const chartContainer =
        element.shadowRoot.querySelector(".chart-container");
      expect(chartContainer).toBeTruthy();

      // Remove element to trigger disconnectedCallback
      document.body.removeChild(element);

      // ResizeObserver should have been disconnected
      expect(mockDisconnect).toHaveBeenCalled();

      // No errors thrown during cleanup
      const cleanupErrors = consoleErrorSpy.mock.calls.filter(
        (call) =>
          String(call[0]).includes("cleanup") ||
          String(call[0]).includes("disconnect")
      );
      expect(cleanupErrors.length).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // MULTI-INSTANCE ISOLATION
  // ═══════════════════════════════════════════════════════════════

  describe("multi-instance isolation", () => {
    it("two pie charts render independently with isolated D3 instances", async () => {
      const mockD3A = createMockD3();
      loadD3.mockResolvedValueOnce(mockD3A);
      const elementA = await createChart({ operation: "Sum" });
      await flushPromises();

      const mockD3B = createMockD3();
      loadD3.mockResolvedValueOnce(mockD3B);
      const elementB = await createChart({ operation: "Count" });
      await flushPromises();

      // Each instance rendered its own container
      expect(
        elementA.shadowRoot.querySelector(".chart-container")
      ).toBeTruthy();
      expect(
        elementB.shadowRoot.querySelector(".chart-container")
      ).toBeTruthy();

      // Each instance drove its own D3 mock — no shared mutable state
      expect(mockD3A.pie).toHaveBeenCalled();
      expect(mockD3B.pie).toHaveBeenCalled();

      // Instance A (Sum): 3 legend items; Instance B (Count): 3 legend items
      const legendA = elementA.shadowRoot.querySelectorAll(".legend-item");
      const legendB = elementB.shadowRoot.querySelectorAll(".legend-item");
      expect(legendA.length).toBe(3);
      expect(legendB.length).toBe(3);

      // No console errors across both lifecycles
      const realErrors = consoleErrorSpy.mock.calls.filter(
        (call) =>
          !String(call[0]).includes("D3PieChartGraphql initialization error")
      );
      expect(realErrors.length).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DATA-FLOW VERIFICATION
  // ═══════════════════════════════════════════════════════════════

  describe("data-flow verification", () => {
    it("exact aggregated values bind from data to legend percentages", async () => {
      const mockD3 = createMockD3();
      loadD3.mockResolvedValue(mockD3);

      const element = await createChart({ operation: "Sum" });
      await flushPromises();

      // Real Sum aggregation: Closed Won=500, Prospecting=300, Qualification=150, total=950
      const pieFn = mockD3.pie.mock.results[0].value;
      const dataPassedToPie = pieFn.mock.calls[0][0];
      expect(dataPassedToPie).toEqual([
        { label: "Closed Won", value: 500 },
        { label: "Prospecting", value: 300 },
        { label: "Qualification", value: 150 }
      ]);

      const percentTexts = Array.from(
        element.shadowRoot.querySelectorAll(".legend-value")
      ).map((el) => el.textContent);
      expect(percentTexts[0]).toBe("52.6%");
      expect(percentTexts[1]).toBe("31.6%");
      expect(percentTexts[2]).toBe("15.8%");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // LEGEND VERIFICATION
  // ═══════════════════════════════════════════════════════════════

  describe("legend verification", () => {
    it("legend displays correct labels, colors, and percentages end-to-end", async () => {
      const mockD3 = createMockD3();
      loadD3.mockResolvedValue(mockD3);

      const element = await createChart({ operation: "Sum" });
      await flushPromises();

      const legendItems = element.shadowRoot.querySelectorAll(".legend-item");
      expect(legendItems.length).toBe(3);

      // Data aggregated by Sum: Closed Won=500, Prospecting=300, Qualification=150
      // Sorted descending by value, so order is: Closed Won, Prospecting, Qualification
      // Total = 950

      // First legend item should be 'Closed Won' (highest value)
      const firstLabel = legendItems[0].querySelector(".legend-label");
      expect(firstLabel.textContent).toBe("Closed Won");

      // Verify Salesforce Standard palette colors on legend swatches
      // JSDOM normalizes hex colors (#1589EE, #FF9E2C, #4BCA81) to rgb format
      const expectedColors = [
        "rgb(21, 137, 238)", // #1589EE
        "rgb(255, 158, 44)", // #FF9E2C
        "rgb(75, 202, 129)" // #4BCA81
      ];
      legendItems.forEach((item, index) => {
        const colorSwatch = item.querySelector(".legend-color");
        expect(colorSwatch.style.backgroundColor).toBe(expectedColors[index]);
      });

      // Verify percentages: 500/950=52.6%, 300/950=31.6%, 150/950=15.8%
      const percentTexts = Array.from(legendItems).map(
        (item) => item.querySelector(".legend-value").textContent
      );
      expect(percentTexts[0]).toBe("52.6%");
      expect(percentTexts[1]).toBe("31.6%");
      expect(percentTexts[2]).toBe("15.8%");
    });

    it("legend click dispatches sliceclick event with full pipeline data", async () => {
      const mockD3 = createMockD3();
      loadD3.mockResolvedValue(mockD3);

      const element = await createChart({
        objectApiName: "Opportunity",
        filterField: "StageName"
      });
      await flushPromises();

      // Listen for sliceclick event
      const sliceClickHandler = jest.fn();
      element.addEventListener("sliceclick", sliceClickHandler);

      // Click the first legend item (Closed Won, value 500)
      const legendItems = element.shadowRoot.querySelectorAll(".legend-item");
      expect(legendItems.length).toBe(3);

      legendItems[0].click();

      // Verify sliceclick event was dispatched with correct detail
      expect(sliceClickHandler).toHaveBeenCalledTimes(1);

      const eventDetail = sliceClickHandler.mock.calls[0][0].detail;
      expect(eventDetail).toEqual({
        label: "Closed Won",
        value: 500,
        filterField: "StageName"
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ERROR → RECOVERY FLOW
  // ═══════════════════════════════════════════════════════════════

  describe("error recovery flow", () => {
    it("shows error state when D3 fails to load", async () => {
      loadD3.mockRejectedValue(new Error("Network failure loading D3"));

      const element = await createChart();
      await flushPromises();
      await flushPromises();

      // Error element should be visible
      const errorElement = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorElement).toBeTruthy();

      // Chart container should NOT be present
      const chartContainer =
        element.shadowRoot.querySelector(".chart-container");
      expect(chartContainer).toBeFalsy();

      // Spinner should be gone (loading finished, even with error)
      const spinner = element.shadowRoot.querySelector("lightning-spinner");
      expect(spinner).toBeFalsy();
    });
  });
});
