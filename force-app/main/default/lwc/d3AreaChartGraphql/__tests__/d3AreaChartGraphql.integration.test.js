// ABOUTME: Integration tests for d3AreaChartGraphql verifying real bundle-local pipelines (data, theme, utils).
// ABOUTME: Only D3 and NavigationMixin are mocked; time series processing, palette selection, and area-mode config parsing run for real.

import { createElement } from "lwc";
import D3AreaChartGraphql from "c/d3AreaChartGraphql";
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
  const mockNode = {
    getTotalLength: jest.fn(() => 200)
  };

  const mockD3 = {
    select: jest.fn(() => mockD3),
    append: jest.fn(() => mockD3),
    attr: jest.fn(() => mockD3),
    style: jest.fn(() => mockD3),
    call: jest.fn(() => mockD3),
    insert: jest.fn(() => mockD3),
    selectAll: jest.fn(() => mockD3),
    data: jest.fn(() => mockD3),
    datum: jest.fn(() => mockD3),
    enter: jest.fn(() => mockD3),
    transition: jest.fn(() => mockD3),
    duration: jest.fn(() => mockD3),
    delay: jest.fn(() => mockD3),
    ease: jest.fn(() => mockD3),
    on: jest.fn(() => mockD3),
    remove: jest.fn(() => mockD3),
    html: jest.fn(() => mockD3),
    text: jest.fn(() => mockD3),
    node: jest.fn(() => mockNode),
    scaleTime: jest.fn(() => {
      const scale = jest.fn((d) => (d ? d.getTime() / 1000000 : 0));
      scale.domain = jest.fn(() => scale);
      scale.range = jest.fn(() => scale);
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
      axis.ticks = jest.fn(() => axis);
      return axis;
    }),
    axisLeft: jest.fn(() => {
      const axis = jest.fn();
      axis.tickFormat = jest.fn(() => axis);
      axis.tickSize = jest.fn(() => axis);
      return axis;
    }),
    extent: jest.fn((data, accessor) => {
      if (!data || data.length === 0) return [new Date(), new Date()];
      const vals = data.map(accessor);
      return [
        vals.reduce((a, b) => (a < b ? a : b)),
        vals.reduce((a, b) => (a > b ? a : b))
      ];
    }),
    max: jest.fn((data, accessor) => {
      if (!data || data.length === 0) return 0;
      return Math.max(...data.map(accessor));
    }),
    min: jest.fn((data, accessor) => {
      if (!data || data.length === 0) return 0;
      return Math.min(...data.map(accessor));
    }),
    area: jest.fn(() => {
      const areaGen = jest.fn(() => "M0,0L100,100Z");
      areaGen.x = jest.fn(() => areaGen);
      areaGen.y0 = jest.fn(() => areaGen);
      areaGen.y1 = jest.fn(() => areaGen);
      areaGen.curve = jest.fn(() => areaGen);
      return areaGen;
    }),
    line: jest.fn(() => {
      const lineGen = jest.fn(() => "M0,0L100,100");
      lineGen.x = jest.fn(() => lineGen);
      lineGen.y = jest.fn(() => lineGen);
      lineGen.curve = jest.fn(() => lineGen);
      return lineGen;
    }),
    stack: jest.fn(() => {
      // Minimal but real-computing d3.stack() stand-in: builds one layer per
      // key with [0, value] tuples, so renderStackedAreas actually iterates
      // non-empty layers and appends real path elements (a blind `() => []`
      // stub would silently skip every stacked/normalized area path).
      let keys = [];
      const stackGen = jest.fn((data) =>
        keys.map((key) => {
          const layer = (data || []).map((row) => [0, row[key] || 0]);
          layer.key = key;
          return layer;
        })
      );
      stackGen.keys = jest.fn((k) => {
        keys = k;
        return stackGen;
      });
      stackGen.value = jest.fn(() => stackGen);
      stackGen.order = jest.fn(() => stackGen);
      stackGen.offset = jest.fn(() => stackGen);
      return stackGen;
    }),
    stackOrderNone: "stackOrderNone",
    stackOffsetNone: "stackOffsetNone",
    stackOffsetExpand: "stackOffsetExpand",
    curveLinear: "curveLinear",
    curveMonotoneX: "curveMonotoneX",
    curveStepAfter: "curveStepAfter",
    easeLinear: "easeLinear"
  };
  return mockD3;
};

const SINGLE_SERIES_DATA = [
  { CloseDate: "2024-01-01", Amount: 100 },
  { CloseDate: "2024-02-01", Amount: 300 },
  { CloseDate: "2024-03-01", Amount: 150 }
];

const MULTI_SERIES_DATA = [
  { CloseDate: "2024-01-15", Amount: 100, StageName: "Prospecting" },
  { CloseDate: "2024-02-20", Amount: 200, StageName: "Prospecting" },
  { CloseDate: "2024-01-15", Amount: 150, StageName: "Closed Won" },
  { CloseDate: "2024-02-20", Amount: 300, StageName: "Closed Won" }
];

// eslint-disable-next-line @lwc/lwc/no-async-operation
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("c-d3-area-chart-graphql integration", () => {
  let element;
  let mockD3;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();

    mockD3 = createMockD3();
    loadD3.mockResolvedValue(mockD3);

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
    element = createElement("c-d3-area-chart-graphql", {
      is: D3AreaChartGraphql
    });

    Object.assign(element, {
      dateField: "CloseDate",
      valueField: "Amount",
      recordCollection: SINGLE_SERIES_DATA,
      ...props
    });

    document.body.appendChild(element);
    await flushPromises();
    await flushPromises();

    return element;
  }

  describe("time series pipeline integration", () => {
    it("sorts points by real date parsing and feeds the D3 area generator", async () => {
      const unsorted = [
        { CloseDate: "2024-03-01", Amount: 150 },
        { CloseDate: "2024-01-01", Amount: 100 },
        { CloseDate: "2024-02-01", Amount: 300 }
      ];

      await createChart({ recordCollection: unsorted });

      const datumCall = mockD3.datum.mock.calls.find(
        (call) => Array.isArray(call[0]) && call[0][0]?.date
      );
      expect(datumCall).toBeTruthy();
      const dates = datumCall[0].map((d) => d.date.toISOString());
      expect(dates).toEqual([...dates].sort());
    });

    it("groups multi-series data by the real seriesField grouping logic, preserving insertion order", async () => {
      await createChart({
        recordCollection: MULTI_SERIES_DATA,
        seriesField: "StageName"
      });

      const legend = element.shadowRoot.querySelectorAll(".legend-item");
      expect(legend.length).toBe(2);
      const labels = [...legend].map(
        (item) => item.querySelector(".legend-label").textContent
      );
      // Real seriesMap insertion order: "Prospecting" appears before "Closed
      // Won" in MULTI_SERIES_DATA, so it must land first (not alphabetical).
      expect(labels).toEqual(["Prospecting", "Closed Won"]);
    });
  });

  describe("theme pipeline integration", () => {
    it("applies the real Salesforce Standard palette to the single-series stroke and gradient fill", async () => {
      await createChart({
        theme: "Salesforce Standard",
        recordCollection: SINGLE_SERIES_DATA,
        seriesField: ""
      });

      expect(mockD3.attr).toHaveBeenCalledWith("stroke", "#1589EE");
      expect(mockD3.attr).toHaveBeenCalledWith("stop-color", "#1589EE");
    });

    it("applies the real Warm palette as distinct per-series fill colors for multi-series", async () => {
      await createChart({
        theme: "Warm",
        recordCollection: MULTI_SERIES_DATA,
        seriesField: "StageName"
      });

      expect(mockD3.attr).toHaveBeenCalledWith("fill", "#FF6B6B");
      expect(mockD3.attr).toHaveBeenCalledWith("fill", "#FF8E72");
    });
  });

  describe("area-mode config pipeline integration", () => {
    it("parses real advancedConfig JSON and routes normalized mode through d3.stack().offset(stackOffsetExpand)", async () => {
      await createChart({
        recordCollection: MULTI_SERIES_DATA,
        seriesField: "StageName",
        advancedConfig: '{"areaMode": "normalized"}'
      });

      const stackGen = mockD3.stack.mock.results[0].value;
      expect(stackGen.keys).toHaveBeenCalledWith(["Prospecting", "Closed Won"]);
      expect(stackGen.offset).toHaveBeenCalledWith("stackOffsetExpand");
    });

    it("routes stacked mode through d3.stack().offset(stackOffsetNone)", async () => {
      await createChart({
        recordCollection: MULTI_SERIES_DATA,
        seriesField: "StageName",
        advancedConfig: '{"areaMode": "stacked"}'
      });

      const stackGen = mockD3.stack.mock.results[0].value;
      expect(stackGen.offset).toHaveBeenCalledWith("stackOffsetNone");
    });
  });

  describe("drill-down integration", () => {
    it("dispatches areaclick with the real series name and point count on area click", async () => {
      await createChart({ objectApiName: "Opportunity" });

      const handler = jest.fn();
      element.addEventListener("areaclick", handler);

      const clickHandler = mockD3.on.mock.calls.find((c) => c[0] === "click");
      expect(clickHandler).toBeTruthy();
      const [, callback] = clickHandler;
      callback();

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].detail).toEqual({
        series: "Default",
        pointCount: SINGLE_SERIES_DATA.length,
        filterField: "CloseDate"
      });
      expect(mockNavigate).toHaveBeenCalled();
    });

    it("uses the real filterField override for the drill-down event detail", async () => {
      await createChart({
        objectApiName: "Opportunity",
        filterField: "CreatedDate"
      });

      const clickHandler = mockD3.on.mock.calls.find((c) => c[0] === "click");
      const [, callback] = clickHandler;

      const handler = jest.fn();
      element.addEventListener("areaclick", handler);
      callback();

      expect(handler.mock.calls[0][0].detail.filterField).toBe("CreatedDate");
    });
  });

  describe("accessibility wiring", () => {
    it("applies role=img and a title built from the real dateField/valueField props", async () => {
      await createChart({ dateField: "CloseDate", valueField: "Amount" });

      expect(mockD3.attr).toHaveBeenCalledWith("role", "img");
      expect(mockD3.attr).toHaveBeenCalledWith(
        "aria-label",
        "Area chart: Amount over CloseDate"
      );
      expect(mockD3.insert).toHaveBeenCalledWith("title", ":first-child");
    });
  });
});
