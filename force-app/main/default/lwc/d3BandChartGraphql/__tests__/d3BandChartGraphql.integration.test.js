// ABOUTME: Integration tests for d3BandChartGraphql verifying the real bundle-local pipelines (data, theme, utils).
// ABOUTME: Only D3 and NavigationMixin are mocked; time series processing and color logic run for real.

import { createElement } from "lwc";
import D3BandChartGraphql from "c/d3BandChartGraphql";
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
    text: jest.fn(() => mockD3),
    node: jest.fn(() => ({ getTotalLength: () => 100 })),
    scaleTime: jest.fn(() => {
      const scale = jest.fn(() => 50);
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
    extent: jest.fn(() => [new Date("2024-01-01"), new Date("2024-12-31")]),
    max: jest.fn(() => 500),
    min: jest.fn(() => 0),
    curveMonotoneX: "curveMonotoneX",
    easeLinear: (t) => t
  };
  return mockD3;
};

const SAMPLE_DATA = [
  { CloseDate: "2024-01-01", Amount: 100, ExpectedRevenue: 150 },
  { CloseDate: "2024-02-01", Amount: 300, ExpectedRevenue: 360 },
  { CloseDate: "2024-03-01", Amount: 150, ExpectedRevenue: 220 }
];

const flushPromises = () => new Promise(process.nextTick);

describe("c-d3-band-chart-graphql integration", () => {
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
    element = createElement("c-d3-band-chart-graphql", {
      is: D3BandChartGraphql
    });

    Object.assign(element, {
      dateField: "CloseDate",
      lowerField: "Amount",
      upperField: "ExpectedRevenue",
      recordCollection: SAMPLE_DATA,
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
        { CloseDate: "2024-03-01", Amount: 150, ExpectedRevenue: 220 },
        { CloseDate: "2024-01-01", Amount: 100, ExpectedRevenue: 150 },
        { CloseDate: "2024-02-01", Amount: 300, ExpectedRevenue: 360 }
      ];

      await createChart({ recordCollection: unsorted });

      const datumCall = mockD3.datum.mock.calls.find(
        (call) => Array.isArray(call[0]) && call[0][0]?.date
      );
      expect(datumCall).toBeTruthy();
      const dates = datumCall[0].map((d) => d.date.toISOString());
      expect(dates).toEqual([...dates].sort());
    });
  });

  describe("theme pipeline integration", () => {
    it("applies the real Salesforce Standard palette to the band boundary stroke", async () => {
      await createChart({ theme: "Salesforce Standard" });
      expect(mockD3.attr).toHaveBeenCalledWith("stroke", "#1589EE");
    });
  });

  describe("drill-down integration", () => {
    it("dispatches bandclick with the real parsed lower/upper values on band click", async () => {
      await createChart({ objectApiName: "Opportunity" });

      const handler = jest.fn();
      element.addEventListener("bandclick", handler);

      const clickHandler = mockD3.on.mock.calls.find((c) => c[0] === "click");
      expect(clickHandler).toBeTruthy();
      const [, callback] = clickHandler;
      callback({ offsetX: 0, offsetY: 0 }, [
        { date: new Date("2024-01-01"), lowerValue: 100, upperValue: 150 },
        { date: new Date("2024-02-01"), lowerValue: 300, upperValue: 360 }
      ]);

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].detail.lowerValue).toBe(300);
      expect(handler.mock.calls[0][0].detail.upperValue).toBe(360);
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
