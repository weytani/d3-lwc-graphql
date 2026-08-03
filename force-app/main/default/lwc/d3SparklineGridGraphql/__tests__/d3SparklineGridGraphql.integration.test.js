// ABOUTME: Integration tests for d3SparklineGridGraphql verifying real bundle-local pipelines (data, theme, utils).
// ABOUTME: Only D3 and NavigationMixin are mocked; entity bucketing, aggregation math, palette selection, and a11y wiring run for real.

import { createElement } from "lwc";
import D3SparklineGridGraphql from "c/d3SparklineGridGraphql";
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

// Real-computing mock D3: extent/max/min/mean actually reduce over the real
// sparkline data instead of returning a constant, so tests can observe the
// real per-entity bucketing/summation (recipe §8 — the shared unit-tier mock's
// `max: () => 500` is blind to bucketing).
const createMockD3 = () => {
  const mockD3 = {
    select: jest.fn(() => mockD3),
    append: jest.fn(() => mockD3),
    attr: jest.fn(() => mockD3),
    style: jest.fn(() => mockD3),
    call: jest.fn(() => mockD3),
    insert: jest.fn(() => mockD3),
    text: jest.fn(() => mockD3),
    remove: jest.fn(() => mockD3),
    selectAll: jest.fn(() => mockD3),
    data: jest.fn(() => mockD3),
    datum: jest.fn(() => mockD3),
    enter: jest.fn(() => mockD3),
    on: jest.fn(() => mockD3),
    html: jest.fn(() => mockD3),
    line: jest.fn(() => {
      const lineGen = jest.fn(() => "M0,0L10,10");
      lineGen.x = jest.fn(() => lineGen);
      lineGen.y = jest.fn(() => lineGen);
      return lineGen;
    }),
    area: jest.fn(() => {
      const areaGen = jest.fn(() => "M0,0L10,10L10,30L0,30Z");
      areaGen.x = jest.fn(() => areaGen);
      areaGen.y0 = jest.fn(() => areaGen);
      areaGen.y1 = jest.fn(() => areaGen);
      return areaGen;
    }),
    scaleTime: jest.fn(() => {
      const scale = jest.fn(() => 50);
      scale.domain = jest.fn(() => scale);
      scale.range = jest.fn(() => scale);
      return scale;
    }),
    scaleLinear: jest.fn(() => {
      const scale = jest.fn(() => 15);
      scale.domain = jest.fn(() => scale);
      scale.range = jest.fn(() => scale);
      return scale;
    }),
    scaleBand: jest.fn(() => {
      const scale = jest.fn(() => 10);
      scale.domain = jest.fn(() => scale);
      scale.range = jest.fn(() => scale);
      scale.padding = jest.fn(() => scale);
      scale.bandwidth = jest.fn(() => 8);
      return scale;
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
    mean: jest.fn((data, accessor) => {
      const vals = data.map(accessor);
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    })
  };
  return mockD3;
};

// eslint-disable-next-line @lwc/lwc/no-async-operation
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("c-d3-sparkline-grid-graphql integration", () => {
  let element;
  let mockD3;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();

    mockD3 = createMockD3();
    loadD3.mockResolvedValue(mockD3);

    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    Element.prototype.getBoundingClientRect = jest.fn(() => ({
      width: 600,
      height: 400,
      top: 0,
      left: 0,
      bottom: 400,
      right: 600
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
    element = createElement("c-d3-sparkline-grid-graphql", {
      is: D3SparklineGridGraphql
    });

    Object.assign(element, {
      entityField: "Type",
      dateField: "CloseDate",
      valueField: "Amount",
      operation: "Sum",
      recordCollection: [],
      ...props
    });

    document.body.appendChild(element);
    await flushPromises();
    await flushPromises();

    return element;
  }

  describe("entity bucketing pipeline", () => {
    it("sums duplicate-month records per entity, then renders entities in real descending-value order with formatted totals", async () => {
      const records = [
        { Type: "New Business", CloseDate: "2024-01-05", Amount: 10000 },
        { Type: "New Business", CloseDate: "2024-01-25", Amount: 15000 }, // same Jan bucket: real sum = 25000
        { Type: "Renewal", CloseDate: "2024-01-10", Amount: 5000 }
      ];

      await createChart({ recordCollection: records });

      // Real processEntityData sums the duplicate January rows into one
      // bucket (25000, not 10000 or 15000), real formatNumber renders it as
      // "25K", and the real entityData.sort(descending) puts New Business
      // (25000) before Renewal (5000). The first two text() calls are the
      // real applySvgA11y title/desc (asserted separately below); the
      // per-row label/value calls follow in render order.
      const rowTexts = mockD3.text.mock.calls.map((c) => c[0]).slice(2);
      expect(rowTexts).toEqual(["New Business", "25K", "Renewal", "5K"]);
    });

    it("sorts a single entity's sparkline data chronologically regardless of input order", async () => {
      const unsorted = [
        { Type: "Solo", CloseDate: "2024-03-01", Amount: 300 },
        { Type: "Solo", CloseDate: "2024-01-01", Amount: 100 },
        { Type: "Solo", CloseDate: "2024-02-01", Amount: 200 }
      ];

      await createChart({ recordCollection: unsorted });

      const datumCall = mockD3.datum.mock.calls.find(
        (call) => Array.isArray(call[0]) && call[0][0]?.date
      );
      expect(datumCall).toBeTruthy();
      const dates = datumCall[0].map((d) => d.date.toISOString());
      expect(dates).toEqual([...dates].sort());
      expect(dates.length).toBe(3);
    });
  });

  describe("date bucketing timezone safety", () => {
    it("buckets a first-of-month date field into the correct real calendar month regardless of the host timezone", async () => {
      // Defect found via this integration tier: `new Date("2024-01-01")`
      // parses a date-only field (e.g. CloseDate) as UTC midnight, but the
      // original bucketing read it back with local getters — rolling it
      // back a calendar day in any negative-UTC-offset timezone (all of the
      // Americas) and silently splitting these two January records into
      // separate December/January buckets. Fixed via UTC getters/Date.UTC
      // in processEntityData. Both records must land in ONE January bucket
      // and sum together (400), not split into two buckets.
      await createChart({
        recordCollection: [
          { Type: "Solo", CloseDate: "2024-01-01", Amount: 100 },
          { Type: "Solo", CloseDate: "2024-01-15", Amount: 300 }
        ]
      });

      const datumCall = mockD3.datum.mock.calls.find(
        (call) => Array.isArray(call[0]) && call[0][0]?.date
      );
      expect(datumCall[0].length).toBe(1);
      expect(mockD3.text.mock.calls.some((c) => c[0] === "400")).toBe(true);
    });
  });

  describe("aggregation math pipeline", () => {
    // Two records for the same entity in the same month: Sum, Count, and
    // Average must each compute a genuinely different real value.
    const AGG_RECORDS = [
      { Type: "A", CloseDate: "2024-01-01", Amount: 100 },
      { Type: "A", CloseDate: "2024-01-15", Amount: 300 }
    ];

    it("sums real per-entity monthly totals for operation=Sum", async () => {
      await createChart({ recordCollection: AGG_RECORDS, operation: "Sum" });

      expect(mockD3.text.mock.calls.some((c) => c[0] === "400")).toBe(true);
    });

    it("counts real per-entity monthly record counts for operation=Count", async () => {
      await createChart({ recordCollection: AGG_RECORDS, operation: "Count" });

      expect(mockD3.text.mock.calls.some((c) => c[0] === "2")).toBe(true);
    });

    it("averages real per-entity monthly totals for operation=Average", async () => {
      await createChart({
        recordCollection: AGG_RECORDS,
        operation: "Average"
      });

      expect(mockD3.text.mock.calls.some((c) => c[0] === "200")).toBe(true);
    });
  });

  describe("theme pipeline integration", () => {
    it("applies the real Warm palette as distinct per-entity stroke colors, in descending-value order", async () => {
      await createChart({
        theme: "Warm",
        recordCollection: [
          { Type: "Big", CloseDate: "2024-01-01", Amount: 900 },
          { Type: "Small", CloseDate: "2024-01-01", Amount: 100 }
        ]
      });

      // Each entity row draws two "stroke" attrs: the area's "none" and the
      // line's real per-entity color. Filtering out "none" isolates the real
      // getColors("Warm", 2) sequence, in the real descending-sort order
      // (Big=900 first, Small=100 second).
      const strokeColors = mockD3.attr.mock.calls
        .filter((c) => c[0] === "stroke" && c[1] !== "none")
        .map((c) => c[1]);
      expect(strokeColors).toEqual(["#FF6B6B", "#FF8E72"]);
    });
  });

  describe("accessibility pipeline integration", () => {
    it("builds the real title/desc from entityData length and the real operation/valueField/dateField/entityField props", async () => {
      await createChart({
        recordCollection: [
          { Type: "New Business", CloseDate: "2024-01-01", Amount: 100 },
          { Type: "Renewal", CloseDate: "2024-01-01", Amount: 200 }
        ]
      });

      expect(mockD3.attr).toHaveBeenCalledWith(
        "aria-label",
        "Sparkline grid: 2 entities"
      );
      expect(mockD3.text).toHaveBeenCalledWith("Sparkline grid: 2 entities");
      expect(mockD3.text).toHaveBeenCalledWith(
        "Sum of Amount by CloseDate, grouped by Type"
      );
    });
  });

  describe("drill-down pipeline integration", () => {
    it("dispatches rowclick with the real entity name, real computed value, and entityField as the default filterField", async () => {
      await createChart({
        objectApiName: "Opportunity",
        recordCollection: [
          { Type: "Enterprise", CloseDate: "2024-01-01", Amount: 4000 },
          { Type: "SMB", CloseDate: "2024-01-01", Amount: 1000 }
        ]
      });

      const handler = jest.fn();
      element.addEventListener("rowclick", handler);

      // Rows render in real descending-value order: Enterprise (4000) first.
      const clickCall = mockD3.on.mock.calls.find((c) => c[0] === "click");
      expect(clickCall).toBeTruthy();
      clickCall[1]();

      expect(mockNavigate).toHaveBeenCalled();
      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].detail).toEqual({
        entity: "Enterprise",
        value: 4000,
        filterField: "Type"
      });
    });
  });

  describe("recordLimit truncation pipeline integration", () => {
    it("truncates raw records via the real prepareData/truncateData pipeline before bucketing", async () => {
      // Three months for one entity; recordLimit: 2 truncates to the first
      // two rows (Jan, Feb) in original array order, dropping March.
      const threeMonths = [
        { Type: "Solo", CloseDate: "2024-01-01", Amount: 100 },
        { Type: "Solo", CloseDate: "2024-02-01", Amount: 200 },
        { Type: "Solo", CloseDate: "2024-03-01", Amount: 300 }
      ];

      await createChart({ recordCollection: threeMonths, recordLimit: 2 });

      const datumCall = mockD3.datum.mock.calls.find(
        (call) => Array.isArray(call[0]) && call[0][0]?.date
      );
      expect(datumCall[0].length).toBe(2);

      // currentValue is the last (real) bucket among the truncated set —
      // February (200), not the dropped March (300).
      expect(mockD3.text.mock.calls.some((c) => c[0] === "200")).toBe(true);
      expect(mockD3.text.mock.calls.some((c) => c[0] === "300")).toBe(false);
    });
  });
});
