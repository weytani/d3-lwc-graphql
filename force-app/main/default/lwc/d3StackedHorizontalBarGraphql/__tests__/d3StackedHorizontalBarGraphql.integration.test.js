// ABOUTME: Integration tests for d3StackedHorizontalBarGraphql verifying the real bundle-local pipelines (data, theme, utils).
// ABOUTME: Only D3 and NavigationMixin are mocked; aggregation and color logic run for real.

import { createElement } from "lwc";
import D3StackedHorizontalBarGraphql from "c/d3StackedHorizontalBarGraphql";
import { loadD3 } from "../d3Loader";

jest.mock("../d3Loader", () => ({
  loadD3: jest.fn()
}));

const mockNavigate = jest.fn();
jest.mock(
  "lightning/navigation",
  () => {
    const Navigate = Symbol.for("NavigationMixin.Navigate");
    const mixin = (Base) => {
      return class extends Base {
        [Navigate] = mockNavigate;
      };
    };
    mixin.Navigate = Navigate;
    return { NavigationMixin: mixin };
  },
  { virtual: true }
);

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
    selectAll: jest.fn(() => mockD3),
    data: jest.fn(() => mockD3),
    enter: jest.fn(() => mockD3),
    transition: jest.fn(() => mockD3),
    duration: jest.fn(() => mockD3),
    delay: jest.fn(() => mockD3),
    on: jest.fn(() => mockD3),
    remove: jest.fn(() => mockD3),
    text: jest.fn(() => mockD3),
    insert: jest.fn(() => mockD3),
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

const SERIES_DATA = [
  { StageName: "Prospecting", Type: "New", Amount: 100 },
  { StageName: "Prospecting", Type: "Existing", Amount: 200 },
  { StageName: "Qualification", Type: "New", Amount: 150 },
  { StageName: "Qualification", Type: "Existing", Amount: 250 }
];

const flushPromises = () => new Promise(process.nextTick);

describe("c-d3-stacked-horizontal-bar-graphql integration", () => {
  let element;
  let mockD3;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();

    mockD3 = createMockD3();
    loadD3.mockResolvedValue(mockD3);

    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

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
    jest.clearAllMocks();
  });

  async function createChart(props = {}) {
    element = createElement("c-d3-stacked-horizontal-bar-graphql", {
      is: D3StackedHorizontalBarGraphql
    });

    Object.assign(element, {
      groupByField: "StageName",
      seriesField: "Type",
      valueField: "Amount",
      operation: "Sum",
      recordCollection: SERIES_DATA,
      ...props
    });

    document.body.appendChild(element);

    await flushPromises();
    await flushPromises();

    return element;
  }

  describe("aggregation pipeline integration", () => {
    it("pivots real aggregateSeriesData output into stack-ready rows", async () => {
      await createChart();

      // Real aggregateSeriesData groups by (label, series); the pivot step
      // feeds d3.stack().keys(seriesNames) with one row per label.
      const keysCall = mockD3._mockStack.keys.mock.calls[0];
      expect(keysCall[0].sort()).toEqual(["Existing", "New"]);
    });
  });

  describe("theme pipeline integration", () => {
    it("applies the real Salesforce Standard palette to stacked layer fills", async () => {
      await createChart({ theme: "Salesforce Standard" });

      const fillFn = mockD3.attr.mock.calls.find(
        (c) => c[0] === "fill" && typeof c[1] === "function"
      )[1];
      expect(fillFn(null, 0)).toBe("#1589EE");
      expect(fillFn(null, 1)).toBe("#FF9E2C");
    });
  });

  describe("drill-down integration", () => {
    it("dispatches barclick with real pivoted label/series/value on bar click", async () => {
      await createChart({ objectApiName: "Opportunity" });

      const handler = jest.fn();
      element.addEventListener("barclick", handler);

      const clickHandler = mockD3.on.mock.calls.find((c) => c[0] === "click");
      expect(clickHandler).toBeTruthy();
      const [, callback] = clickHandler;
      // Simulate a stack-datum click: d[0]=100 (baseline), d[1]=250 (top),
      // d.data.label="Prospecting" (stack-generator shape).
      callback(
        { offsetX: 0, offsetY: 0 },
        Object.assign([100, 250], { data: { label: "Prospecting" } })
      );

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].detail).toEqual({
        label: "Prospecting",
        value: 150,
        series: null,
        filterField: "StageName"
      });
      expect(mockNavigate).toHaveBeenCalled();
    });
  });

  describe("accessibility wiring", () => {
    it("applies role=img and a title to the rendered svg", async () => {
      await createChart();

      const roleCall = mockD3.attr.mock.calls.find((c) => c[0] === "role");
      expect(roleCall[1]).toBe("img");
      expect(mockD3.insert).toHaveBeenCalledWith("title", ":first-child");
    });
  });
});
