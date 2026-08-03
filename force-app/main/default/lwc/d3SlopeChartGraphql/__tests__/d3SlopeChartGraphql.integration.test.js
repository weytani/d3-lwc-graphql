// ABOUTME: Integration tests for d3SlopeChartGraphql verifying real service pipelines (dataService, themeService, chartUtils).
// ABOUTME: Only D3, Apex, and NavigationMixin are mocked; data processing and semantic-color logic run for real.

import { createElement } from "lwc";
import D3SlopeChartGraphql from "c/d3SlopeChartGraphql";
import { loadD3 } from "c/d3Lib";
import executeQuery from "@salesforce/apex/D3ChartController.executeQuery";

jest.mock("c/d3Lib", () => ({
  loadD3: jest.fn()
}));

jest.mock(
  "@salesforce/apex/D3ChartController.executeQuery",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

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
    on: jest.fn(() => mockD3),
    remove: jest.fn(() => mockD3),
    text: jest.fn(() => mockD3),
    scalePoint: jest.fn(() => {
      const scale = jest.fn(() => 50);
      scale.domain = jest.fn(() => scale);
      scale.range = jest.fn(() => scale);
      scale.padding = jest.fn(() => scale);
      return scale;
    })
  };
  return mockD3;
};

const SAMPLE_DATA = [
  { Name: "Acme", Amount: 100, ExpectedRevenue: 150 },
  { Name: "Globex", Amount: 200, ExpectedRevenue: 180 },
  { Name: "Initech", Amount: 50, ExpectedRevenue: 90 }
];

const flushPromises = () => new Promise(process.nextTick);

describe("c-d3-slope-chart-graphql integration", () => {
  let element;
  let mockD3;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();

    mockD3 = createMockD3();
    loadD3.mockResolvedValue(mockD3);
    executeQuery.mockResolvedValue(SAMPLE_DATA);

    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

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
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  async function createChart(props = {}) {
    element = createElement("c-d3-slope-chart-graphql", {
      is: D3SlopeChartGraphql
    });

    Object.assign(element, {
      groupByField: "Name",
      startValueField: "Amount",
      endValueField: "ExpectedRevenue",
      recordCollection: SAMPLE_DATA,
      ...props
    });

    document.body.appendChild(element);
    await flushPromises();
    await flushPromises();

    return element;
  }

  describe("data processing pipeline integration", () => {
    it("computes real per-entity deltas and binds them to the entity groups", async () => {
      await createChart();

      const dataCall = mockD3.data.mock.calls.find(
        (call) =>
          Array.isArray(call[0]) &&
          call[0].length > 0 &&
          call[0][0].delta !== undefined
      );
      expect(dataCall).toBeTruthy();

      const bound = dataCall[0];
      expect(bound).toEqual([
        {
          label: "Acme",
          startValue: 100,
          endValue: 150,
          delta: 50,
          record: SAMPLE_DATA[0]
        },
        {
          label: "Globex",
          startValue: 200,
          endValue: 180,
          delta: -20,
          record: SAMPLE_DATA[1]
        },
        {
          label: "Initech",
          startValue: 50,
          endValue: 90,
          delta: 40,
          record: SAMPLE_DATA[2]
        }
      ]);
    });

    it("passes SOQL query results through the same processing pipeline", async () => {
      const soqlResults = [
        { Name: "Umbrella", Amount: 300, ExpectedRevenue: 250 }
      ];
      executeQuery.mockResolvedValue(soqlResults);

      await createChart({
        recordCollection: [],
        soqlQuery: "SELECT Name, Amount, ExpectedRevenue FROM Opportunity"
      });

      const dataCall = mockD3.data.mock.calls.find(
        (call) =>
          Array.isArray(call[0]) &&
          call[0].length > 0 &&
          call[0][0].delta !== undefined
      );
      expect(dataCall[0]).toEqual([
        {
          label: "Umbrella",
          startValue: 300,
          endValue: 250,
          delta: -50,
          record: soqlResults[0]
        }
      ]);
    });
  });

  describe("theme pipeline integration", () => {
    it("uses the real getSemanticVariantForTheme positive/negative pair", async () => {
      await createChart({ theme: "Cool" });

      const strokeFn = mockD3.attr.mock.calls.find(
        (c) => c[0] === "stroke" && typeof c[1] === "function"
      )[1];
      expect(strokeFn({ delta: 5 })).toBe("#4CC9F0");
      expect(strokeFn({ delta: -5 })).toBe("#3A0CA3");
    });
  });

  describe("drill-down integration", () => {
    it("dispatches slopeclick with real computed delta on entity click", async () => {
      await createChart({ objectApiName: "Opportunity" });

      const handler = jest.fn();
      element.addEventListener("slopeclick", handler);

      const clickHandler = mockD3.on.mock.calls.find((c) => c[0] === "click");
      expect(clickHandler).toBeTruthy();
      const [, callback] = clickHandler;
      callback(
        { offsetX: 0, offsetY: 0 },
        { label: "Acme", startValue: 100, endValue: 150, delta: 50 }
      );

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].detail).toEqual({
        label: "Acme",
        startValue: 100,
        endValue: 150,
        delta: 50,
        filterField: "Name"
      });
      expect(mockNavigate).toHaveBeenCalled();
    });
  });

  describe("accessibility wiring", () => {
    it("applies role=img and a title to the rendered svg", async () => {
      await createChart();

      expect(mockD3.attr).toHaveBeenCalledWith("role", "img");
      expect(mockD3.insert).toHaveBeenCalledWith("title", ":first-child");
    });
  });
});
