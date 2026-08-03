// ABOUTME: Integration tests for d3LineChartGraphql verifying real bundle-local pipelines (data, theme, utils, graphql).
// ABOUTME: Only D3 and NavigationMixin are mocked; time series processing, palette selection, and the GraphQL wire path run for real.

import { createElement } from "lwc";
import D3LineChartGraphql from "c/d3LineChartGraphql";
import { graphql } from "lightning/graphql";
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
    line: jest.fn(() => {
      const lineGen = jest.fn(() => "M0,0L100,100");
      lineGen.x = jest.fn(() => lineGen);
      lineGen.y = jest.fn(() => lineGen);
      lineGen.curve = jest.fn(() => lineGen);
      return lineGen;
    }),
    curveLinear: "curveLinear",
    curveMonotoneX: "curveMonotoneX",
    curveStep: "curveStep",
    easeLinear: "easeLinear"
  };
  return mockD3;
};

const SINGLE_SERIES_DATA = [
  { CloseDate: "2024-01-01", Amount: 100 },
  { CloseDate: "2024-02-01", Amount: 300 },
  { CloseDate: "2024-03-01", Amount: 150 }
];

// Matches this bundle's own established multi-series fixture shape (see
// d3LineChartGraphql.test.js SAMPLE_TIME_SERIES): "Won" is the first StageName
// encountered, so it must land first in seriesMap insertion order.
const MULTI_SERIES_DATA = [
  { CloseDate: "2024-01-15", Amount: 100, StageName: "Won" },
  { CloseDate: "2024-02-15", Amount: 200, StageName: "Won" },
  { CloseDate: "2024-01-15", Amount: 80, StageName: "Lost" },
  { CloseDate: "2024-02-15", Amount: 120, StageName: "Lost" }
];

const FREE_TEXT_QUERY =
  "query { uiapi { query { Opportunity { edges { node { CloseDate { value } Amount { value } StageName { value } } } } } } }";

const GQL_MULTI_SERIES_RESPONSE = {
  uiapi: {
    query: {
      Opportunity: {
        edges: [
          {
            node: {
              CloseDate: { value: "2024-01-15" },
              Amount: { value: 100 },
              StageName: { value: "Won" }
            }
          },
          {
            node: {
              CloseDate: { value: "2024-02-15" },
              Amount: { value: 200 },
              StageName: { value: "Won" }
            }
          },
          {
            node: {
              CloseDate: { value: "2024-01-15" },
              Amount: { value: 80 },
              StageName: { value: "Lost" }
            }
          }
        ]
      }
    }
  }
};

// eslint-disable-next-line @lwc/lwc/no-async-operation
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("c-d3-line-chart-graphql integration", () => {
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
    element = createElement("c-d3-line-chart-graphql", {
      is: D3LineChartGraphql
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
    it("sorts points by real date parsing and feeds the D3 line generator", async () => {
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
      // Real seriesMap insertion order: "Won" appears before "Lost" in
      // MULTI_SERIES_DATA, so it must land first (not alphabetical).
      expect(labels).toEqual(["Won", "Lost"]);
    });
  });

  describe("theme pipeline integration", () => {
    it("applies the real Salesforce Standard palette to the single-series line stroke", async () => {
      await createChart({
        theme: "Salesforce Standard",
        recordCollection: SINGLE_SERIES_DATA,
        seriesField: ""
      });

      expect(mockD3.attr).toHaveBeenCalledWith("stroke", "#1589EE");
    });

    it("applies the real Warm palette as distinct per-series stroke colors for multi-series", async () => {
      await createChart({
        theme: "Warm",
        recordCollection: MULTI_SERIES_DATA,
        seriesField: "StageName"
      });

      expect(mockD3.attr).toHaveBeenCalledWith("stroke", "#FF6B6B");
      expect(mockD3.attr).toHaveBeenCalledWith("stroke", "#FF8E72");
    });
  });

  describe("error state integration", () => {
    it("surfaces a real validateFields error when recordCollection is missing the configured valueField", async () => {
      // First record has no "Amount" key at all (not merely an undefined
      // value) — validateFields checks key presence on the sample record.
      await createChart({
        recordCollection: [{ CloseDate: "2024-01-01" }]
      });

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeTruthy();
      expect(errorEl.textContent).toContain("Missing required fields: Amount");
    });

    it("surfaces a real 'No data after processing' error when every record fails date parsing", async () => {
      await createChart({
        recordCollection: [{ CloseDate: "not-a-date", Amount: "not-a-number" }]
      });

      const errorEl = element.shadowRoot.querySelector(
        ".slds-text-color_error"
      );
      expect(errorEl).toBeTruthy();
      expect(errorEl.textContent).toContain("No data after processing");
    });
  });

  describe("no-data state integration", () => {
    it("shows the no-data state without invoking D3 when no recordCollection and no query config are provided", async () => {
      await createChart({ recordCollection: [] });

      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeFalsy();
      expect(element.shadowRoot.textContent).toContain("No data available");
      expect(mockD3.select).not.toHaveBeenCalled();
    });
  });

  describe("GraphQL free-text pipeline integration", () => {
    it("processes a free-text graphqlQuery UI-API response through the real time series pipeline, preserving multi-series grouping", async () => {
      element = createElement("c-d3-line-chart-graphql", {
        is: D3LineChartGraphql
      });
      Object.assign(element, {
        dateField: "CloseDate",
        valueField: "Amount",
        seriesField: "StageName",
        objectApiName: "Opportunity",
        graphqlQuery: FREE_TEXT_QUERY,
        recordCollection: []
      });
      document.body.appendChild(element);
      await flushPromises();

      graphql.emit(GQL_MULTI_SERIES_RESPONSE);
      await flushPromises();
      await flushPromises();

      expect(
        element.shadowRoot.querySelector(".slds-text-color_error")
      ).toBeFalsy();
      const legend = element.shadowRoot.querySelectorAll(".legend-item");
      expect(legend.length).toBe(2);
      const labels = [...legend].map(
        (item) => item.querySelector(".legend-label").textContent
      );
      expect(labels).toEqual(["Won", "Lost"]);

      const lineClassCalls = mockD3.attr.mock.calls.filter(
        (call) => call[0] === "class" && call[1] === "line"
      );
      expect(lineClassCalls.length).toBeGreaterThan(0);
    });
  });

  describe("drill-down integration", () => {
    it("dispatches pointclick with the real parsed date/value and default filterField on point click", async () => {
      await createChart({ objectApiName: "Opportunity" });

      const handler = jest.fn();
      element.addEventListener("pointclick", handler);

      const clickHandler = mockD3.on.mock.calls.find((c) => c[0] === "click");
      expect(clickHandler).toBeTruthy();
      const [, callback] = clickHandler;
      const point = { date: new Date("2024-01-01"), value: 100, record: {} };
      callback({ offsetX: 0, offsetY: 0 }, point);

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].detail).toEqual({
        date: point.date,
        value: 100,
        series: "Default",
        record: point.record,
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
      element.addEventListener("pointclick", handler);
      callback(
        { offsetX: 0, offsetY: 0 },
        { date: new Date("2024-01-01"), value: 100, record: {} }
      );

      expect(handler.mock.calls[0][0].detail.filterField).toBe("CreatedDate");
    });
  });

  describe("accessibility wiring", () => {
    it("applies role=img and a title built from the real dateField/valueField props", async () => {
      await createChart({ dateField: "CloseDate", valueField: "Amount" });

      expect(mockD3.attr).toHaveBeenCalledWith("role", "img");
      expect(mockD3.attr).toHaveBeenCalledWith(
        "aria-label",
        "Line chart: Amount over CloseDate"
      );
      expect(mockD3.insert).toHaveBeenCalledWith("title", ":first-child");
    });
  });
});
