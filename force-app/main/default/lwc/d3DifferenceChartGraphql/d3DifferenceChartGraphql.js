// ABOUTME: D3 Difference Chart Lightning Web Component.
// ABOUTME: Displays two time series (e.g. plan vs actual) shaded green where the primary field is above the secondary and red where it's below, via the two-area clip-path technique.
import { LightningElement, api, track, wire } from "lwc";
import { loadD3 } from "c/d3Lib";
import { prepareData, CHART_LIMITS, applyFilterClause } from "c/dataService";
import {
  getColors,
  getSemanticVariantForTheme,
  DEFAULT_THEME
} from "c/themeService";
import {
  formatNumber,
  createTooltip,
  createResizeHandler,
  createLayoutRetry,
  applySvgA11y
} from "c/chartUtils";
import { NavigationMixin } from "lightning/navigation";
import executeQuery from "@salesforce/apex/D3ChartController.executeQuery";
import { gql, graphql } from "lightning/graphql";
import { buildRecordQuery, normalizeRecordsGeneric } from "c/graphqlService";

export default class D3DifferenceChartGraphql extends NavigationMixin(
  LightningElement
) {
  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API PROPERTIES
  // ═══════════════════════════════════════════════════════════════

  /** Data collection from Flow or parent component */
  @api recordCollection = [];

  /** SOQL query string (used if recordCollection is empty) */
  @api soqlQuery =
    "SELECT CloseDate, Amount, ExpectedRevenue FROM Opportunity ORDER BY CloseDate";

  /** Date field for X-axis (time series) */
  @api dateField = "CloseDate";

  /** Field holding the primary series (e.g. Actual) */
  @api primaryField = "Amount";

  /** Field holding the secondary/baseline series (e.g. Plan) */
  @api secondaryField = "ExpectedRevenue";

  /** Date format for parsing (ISO, US, EU, or custom) */
  @api dateFormat = "ISO";

  /** Chart height in pixels */
  @api height = 300;

  /** Color theme (used for the primary/secondary line colors) */
  @api theme = DEFAULT_THEME;

  /** Curve type: linear, monotone, step */
  @api curveType = "monotone";

  /** Maximum records to process (leave empty for chart default) */
  @api recordLimit;

  /** Advanced configuration JSON */
  @api advancedConfig = "{}";

  /** Object API name for drill-down navigation */
  @api objectApiName = "";

  /** Filter field for drill-down */
  @api filterField = "";

  /** Optional WHERE clause fragment */
  @api filterClause = "";

  /** Fetch-mode selector: "auto" (default, existing priority order), "apex", or "graphql". */
  @api fetchMode = "auto";

  /** Structured filter for the GraphQL path: { field, operator, value }. */
  @api graphqlFilter;

  // ═══════════════════════════════════════════════════════════════
  // TRACKED STATE
  // ═══════════════════════════════════════════════════════════════

  @track isLoading = true;
  @track error = null;
  @track chartData = [];

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE PROPERTIES
  // ═══════════════════════════════════════════════════════════════

  d3 = null;
  svg = null;
  tooltip = null;
  resizeHandler = null;
  chartRendered = false;
  _layoutRetry = null;
  _config = {};
  _configParsed = false;

  // ═══════════════════════════════════════════════════════════════
  // GETTERS
  // ═══════════════════════════════════════════════════════════════

  get containerStyle() {
    return `height: ${this.height}px;`;
  }

  get hasError() {
    return !!this.error;
  }

  get hasData() {
    return this.chartData && this.chartData.length > 0;
  }

  get showChart() {
    return !this.isLoading && !this.hasError && this.hasData;
  }

  get config() {
    if (!this._configParsed) {
      try {
        this._config = JSON.parse(this.advancedConfig || "{}");
      } catch {
        this._config = {};
      }
      this._configParsed = true;
    }
    return this._config;
  }

  /** The legend always shows the primary/secondary field names — there is no series toggle. */
  get effectiveShowLegend() {
    return true;
  }

  /** Two-item legend naming the primary/secondary fields, colored by their line colors. */
  get legendItems() {
    const colors = getColors(this.theme, 2, this.config.customColors);
    return [
      {
        name: this.primaryField,
        colorStyle: `background-color: ${colors[0]};`
      },
      {
        name: this.secondaryField,
        colorStyle: `background-color: ${colors[1]};`
      }
    ];
  }

  // ═══════════════════════════════════════════════════════════════
  // GRAPHQL SELF-FETCH PATH (Approach A — additive, CT-REC)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Reactive GraphQL query for the self-fetch path. Returns undefined (so the wire
   * is skipped) unless fetchMode is "graphql" and objectApiName/dateField/
   * primaryField/secondaryField are set. Difference has no server-side aggregate:
   * it always fetches raw records for the three fields, then feeds the existing
   * processDifferenceData path (same as recordCollection/soqlQuery).
   */
  get gqlQuery() {
    if (this.fetchMode !== "graphql") return undefined;
    if (
      !this.objectApiName ||
      !this.dateField ||
      !this.primaryField ||
      !this.secondaryField
    ) {
      return undefined;
    }
    const fields = [
      ...new Set([this.dateField, this.primaryField, this.secondaryField])
    ];
    let queryString;
    try {
      queryString = buildRecordQuery({
        objectApiName: this.objectApiName,
        fields,
        filter: this.graphqlFilter,
        first: this.recordLimit || 2000
      });
    } catch {
      // Unsupported config: leave the wire un-provisioned; error surfaces below.
      return undefined;
    }
    return gql`
      ${queryString}
    `;
  }

  @wire(graphql, { query: "$gqlQuery" })
  wiredRecords({ data, errors }) {
    if (this.fetchMode !== "graphql") return;
    if (errors) {
      this.error = this._formatGqlErrors(errors);
      this.isLoading = false;
      return;
    }
    if (!data) return; // initial undefined emission
    try {
      const fields = [
        ...new Set([this.dateField, this.primaryField, this.secondaryField])
      ];
      const records = normalizeRecordsGeneric(data, {
        objectApiName: this.objectApiName,
        fields
      });
      this.processDifferenceData(records);
      if (this.chartData.length === 0) {
        this.error = "No data after processing";
      } else {
        this.error = null;
        this.chartRendered = false; // force renderedCallback to re-initialize the SVG
      }
    } catch (e) {
      this.error = e.message;
    }
    this.isLoading = false;
  }

  _formatGqlErrors(errors) {
    const list = Array.isArray(errors) ? errors : [errors];
    return list.map((e) => e?.message || e).join("; ") || "GraphQL error";
  }

  // ═══════════════════════════════════════════════════════════════
  // LIFECYCLE HOOKS
  // ═══════════════════════════════════════════════════════════════

  async connectedCallback() {
    try {
      this.d3 = await loadD3(this);
      await this.loadData();
    } catch (e) {
      this.error = e.message || "Failed to initialize chart";
      console.error("D3DifferenceChartGraphql initialization error:", e);
    } finally {
      this.isLoading = false;
    }
  }

  renderedCallback() {
    if (this.showChart && !this.chartRendered) {
      this.chartRendered = this.initializeChart();
      if (!this.chartRendered && !this._layoutRetry) {
        const container = this.template.querySelector(".chart-container");
        if (container) {
          this._layoutRetry = createLayoutRetry(container, () => {
            this._layoutRetry = null;
            if (!this.chartRendered) {
              this.chartRendered = this.initializeChart();
            }
          });
        }
      }
    }
  }

  disconnectedCallback() {
    if (this._layoutRetry) {
      this._layoutRetry.cancel();
      this._layoutRetry = null;
    }
    this.cleanup();
  }

  // ═══════════════════════════════════════════════════════════════
  // DATA LOADING
  // ═══════════════════════════════════════════════════════════════

  async loadData() {
    // GraphQL path is handled reactively by the @wire(graphql) — nothing to do here.
    if (this.fetchMode === "graphql") {
      return;
    }

    let rawData = [];

    if (this.recordCollection && this.recordCollection.length > 0) {
      rawData = [...this.recordCollection];
    } else if (this.soqlQuery) {
      try {
        rawData = await executeQuery({
          queryString: applyFilterClause(this.soqlQuery, this.filterClause)
        });
      } catch (e) {
        throw new Error(`SOQL Error: ${e.body?.message || e.message}`);
      }
    } else {
      throw new Error(
        "No data source provided. Set recordCollection or soqlQuery."
      );
    }

    const requiredFields = [
      this.dateField,
      this.primaryField,
      this.secondaryField
    ];
    const prepared = prepareData(rawData, {
      requiredFields,
      limit: this.recordLimit || CHART_LIMITS.DIFFERENCE_CHART
    });

    if (!prepared.valid) {
      throw new Error(prepared.error);
    }

    this.processDifferenceData(prepared.data);

    if (this.chartData.length === 0) {
      throw new Error("No data after processing");
    }
  }

  /**
   * Parses raw records into date-ordered {date, primary, secondary} rows.
   * Records missing a valid date/primary/secondary are dropped.
   * @param {Array} data - Raw data records
   */
  processDifferenceData(data) {
    const parseDate = this.getDateParser();

    const processedData = data
      .map((record) => {
        const date = parseDate(record[this.dateField]);
        const primary = Number(record[this.primaryField]);
        const secondary = Number(record[this.secondaryField]);

        if (
          date &&
          !isNaN(date.getTime()) &&
          !isNaN(primary) &&
          !isNaN(secondary)
        ) {
          return { date, primary, secondary, record };
        }
        return null;
      })
      .filter((d) => d !== null);

    processedData.sort((a, b) => a.date - b.date);
    this.chartData = processedData;
  }

  /**
   * Returns a date parser function based on dateFormat setting.
   * @returns {Function} - Date parser function
   */
  getDateParser() {
    switch (this.dateFormat) {
      case "US":
        return (str) => {
          if (!str) return null;
          if (str instanceof Date) return str;
          const parts = String(str).split("/");
          if (parts.length === 3) {
            return new Date(parts[2], parts[0] - 1, parts[1]);
          }
          return new Date(str);
        };
      case "EU":
        return (str) => {
          if (!str) return null;
          if (str instanceof Date) return str;
          const parts = String(str).split("/");
          if (parts.length === 3) {
            return new Date(parts[2], parts[1] - 1, parts[0]);
          }
          return new Date(str);
        };
      case "ISO":
      default:
        return (str) => {
          if (!str) return null;
          if (str instanceof Date) return str;
          return new Date(str);
        };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CHART RENDERING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Initializes the chart SVG, tooltip, and resize observer.
   * @returns {boolean} true if the chart was successfully initialized
   */
  initializeChart() {
    const container = this.template.querySelector(".chart-container");
    if (!container) return false;

    const { width } = container.getBoundingClientRect();
    if (width === 0) return false;

    this.tooltip = createTooltip(container);
    this.renderChart(width);

    this.resizeHandler = createResizeHandler(
      container,
      ({ width: newWidth }) => {
        if (newWidth > 0) {
          this.renderChart(newWidth);
        }
      }
    );
    this.resizeHandler.observe();
    return true;
  }

  renderChart(containerWidth) {
    const d3 = this.d3;
    const container = this.template.querySelector(".chart-container");
    if (!container || !d3) return;

    // Clear existing SVG
    d3.select(container).select("svg").remove();

    // Margins — extra bottom for the primary/secondary legend
    const margin = {
      top: 20,
      right: 30,
      bottom: 80,
      left: 60
    };

    const width = containerWidth - margin.left - margin.right;
    const height = this.height - margin.top - margin.bottom;

    if (width <= 0 || height <= 0) return;

    // Create SVG
    const svgRoot = d3
      .select(container)
      .append("svg")
      .attr("width", containerWidth)
      .attr("height", this.height)
      .attr("class", "difference-chart-svg");

    applySvgA11y(svgRoot, {
      title: `Difference chart: ${this.primaryField} vs ${this.secondaryField} over ${this.dateField}`,
      desc: `${this.chartData.length} points`
    });

    this.svg = svgRoot
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // X Scale (time)
    const xExtent = d3.extent(this.chartData, (d) => d.date);
    const xScale = d3.scaleTime().domain(xExtent).range([0, width]);

    // Y Scale — spans both series
    const allValues = this.chartData.flatMap((d) => [d.primary, d.secondary]);
    const yMax = d3.max(allValues) || 0;
    const yMin = d3.min(allValues) || 0;
    const yPadding = (yMax - yMin) * 0.1 || 1;

    const yScale = d3
      .scaleLinear()
      .domain([Math.min(0, yMin - yPadding), yMax + yPadding])
      .nice()
      .range([height, 0]);

    const colors = getColors(this.theme, 2, this.config.customColors);

    // Grid lines
    if (this.config.showGrid !== false) {
      this.svg
        .append("g")
        .attr("class", "grid grid-y")
        .call(d3.axisLeft(yScale).tickSize(-width).tickFormat(""))
        .selectAll("line")
        .attr("stroke", "#e0e0e0")
        .attr("stroke-dasharray", "2,2");

      this.svg.select(".grid-y .domain").remove();
    }

    // X Axis
    const xAxis = this.svg
      .append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${height})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(this.getTickCount(width))
          .tickFormat((d) => this.formatDate(d))
      );

    if (width < 400) {
      xAxis
        .selectAll("text")
        .attr("transform", "rotate(-45)")
        .style("text-anchor", "end")
        .attr("dx", "-0.5em")
        .attr("dy", "0.5em");
    }

    // Y Axis
    this.svg
      .append("g")
      .attr("class", "y-axis")
      .call(d3.axisLeft(yScale).tickFormat((d) => formatNumber(d)));

    this.renderDifferenceAreas(d3, xScale, yScale, height);
    this.renderLines(d3, xScale, yScale, colors);
    this.renderPoints(d3, xScale, yScale, colors);
  }

  /**
   * Draws the two-area clip-path difference fill: ONE area path connecting
   * the primary line (y1) to the secondary line (y0) — a self-intersecting
   * "bowtie" at every crossing — clipped twice against complementary masks
   * (the region above the secondary curve, and the region below it). SVG's
   * geometric clipping naturally splits the bowtie into correctly-colored,
   * exactly-bounded green/red regions without any manual crossing math.
   */
  renderDifferenceAreas(d3, xScale, yScale, height) {
    const curve = this.getCurve(d3);
    const points = this.chartData;

    const diffArea = d3
      .area()
      .x((d) => xScale(d.date))
      .y0((d) => yScale(d.secondary))
      .y1((d) => yScale(d.primary))
      .curve(curve);

    const belowMask = d3
      .area()
      .x((d) => xScale(d.date))
      .y0(height)
      .y1((d) => yScale(d.secondary))
      .curve(curve);

    const aboveMask = d3
      .area()
      .x((d) => xScale(d.date))
      .y0(0)
      .y1((d) => yScale(d.secondary))
      .curve(curve);

    const defs = this.svg.append("defs");
    const clipBelowId = `diff-clip-below-${Date.now()}`;
    const clipAboveId = `diff-clip-above-${Date.now()}`;

    defs
      .append("clipPath")
      .attr("id", clipBelowId)
      .append("path")
      .datum(points)
      .attr("d", belowMask);

    defs
      .append("clipPath")
      .attr("id", clipAboveId)
      .append("path")
      .datum(points)
      .attr("d", aboveMask);

    const { positive, negative } = getSemanticVariantForTheme(this.theme);

    this.svg
      .append("path")
      .datum(points)
      .attr("class", "diff-area diff-area-above")
      .attr("d", diffArea)
      .attr("fill", positive)
      .attr("fill-opacity", 0.4)
      .attr("clip-path", `url(#${clipAboveId})`);

    this.svg
      .append("path")
      .datum(points)
      .attr("class", "diff-area diff-area-below")
      .attr("d", diffArea)
      .attr("fill", negative)
      .attr("fill-opacity", 0.4)
      .attr("clip-path", `url(#${clipBelowId})`);
  }

  renderLines(d3, xScale, yScale, colors) {
    const curve = this.getCurve(d3);
    const points = this.chartData;

    const primaryLine = d3
      .line()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.primary))
      .curve(curve);

    const secondaryLine = d3
      .line()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.secondary))
      .curve(curve);

    this.svg
      .append("path")
      .datum(points)
      .attr("class", "diff-line diff-line-primary")
      .attr("fill", "none")
      .attr("stroke", colors[0])
      .attr("stroke-width", 2)
      .attr("d", primaryLine);

    this.svg
      .append("path")
      .datum(points)
      .attr("class", "diff-line diff-line-secondary")
      .attr("fill", "none")
      .attr("stroke", colors[1])
      .attr("stroke-width", 2)
      .attr("d", secondaryLine);
  }

  /**
   * Invisible-by-default hover/click targets on the primary line — the
   * standard donor idiom (one circle per data point) rather than a
   * mouse-tracking crosshair, so tooltip/click behavior needs no bisector.
   */
  renderPoints(d3, xScale, yScale, colors) {
    this.svg
      .selectAll(".diff-point")
      .data(this.chartData)
      .enter()
      .append("circle")
      .attr("class", "diff-point")
      .attr("cx", (d) => xScale(d.date))
      .attr("cy", (d) => yScale(d.primary))
      .attr("r", 4)
      .attr("fill", colors[0])
      .attr("stroke", "white")
      .attr("stroke-width", 1.5)
      .attr("cursor", this.objectApiName ? "pointer" : "default")
      .on("mouseenter", (event, d) => {
        this.showTooltip(event, d);
      })
      .on("mouseleave", () => {
        this.hideTooltip();
      })
      .on("click", (event, d) => {
        this.handleDifferenceClick(d);
      });
  }

  /**
   * Returns D3 curve function based on curveType setting.
   * @param {Object} d3 - D3 instance
   * @returns {Function} - D3 curve function
   */
  getCurve(d3) {
    switch (this.curveType) {
      case "linear":
        return d3.curveLinear;
      case "step":
        return d3.curveStepAfter;
      case "monotone":
      default:
        return d3.curveMonotoneX;
    }
  }

  /**
   * Returns appropriate tick count based on chart width.
   * @param {Number} width - Chart width
   * @returns {Number} - Number of ticks
   */
  getTickCount(width) {
    if (width < 300) return 3;
    if (width < 500) return 5;
    return 7;
  }

  /**
   * Formats date for axis display.
   * @param {Date} date - Date to format
   * @returns {String} - Formatted date string
   */
  formatDate(date) {
    if (!date) return "";
    const month = date.toLocaleString("default", { month: "short" });
    const day = date.getDate();
    const year = date.getFullYear();

    if (this.chartData.length > 0) {
      const years = new Set(this.chartData.map((d) => d.date.getFullYear()));
      if (years.size > 1) {
        return `${month} ${day}, ${year}`;
      }
    }
    return `${month} ${day}`;
  }

  // ═══════════════════════════════════════════════════════════════
  // TOOLTIP HANDLERS
  // ═══════════════════════════════════════════════════════════════

  showTooltip(event, d) {
    if (!this.tooltip) return;
    const delta = d.primary - d.secondary;
    const deltaStr = (delta >= 0 ? "+" : "") + formatNumber(delta);
    const content = `
      <div>
        <div style="font-weight: bold; margin-bottom: 4px;">${this.formatDate(d.date)}</div>
        <div>${this.primaryField}: ${formatNumber(d.primary)}</div>
        <div>${this.secondaryField}: ${formatNumber(d.secondary)}</div>
        <div style="font-weight: bold; margin-top: 4px;">${"Δ"} ${deltaStr}</div>
      </div>
    `;
    this.tooltip.show(content, event.offsetX, event.offsetY);
  }

  hideTooltip() {
    if (!this.tooltip) return;
    this.tooltip.hide();
  }

  // ═══════════════════════════════════════════════════════════════
  // CLICK HANDLER - DRILL DOWN
  // ═══════════════════════════════════════════════════════════════

  handleDifferenceClick(d) {
    if (!this.objectApiName) return;

    const filterFieldName = this.filterField || this.dateField;

    this[NavigationMixin.Navigate]({
      type: "standard__objectPage",
      attributes: {
        objectApiName: this.objectApiName,
        actionName: "list"
      }
    });

    this.dispatchEvent(
      new CustomEvent("differenceclick", {
        detail: {
          date: d.date,
          primary: d.primary,
          secondary: d.secondary,
          delta: d.primary - d.secondary,
          filterField: filterFieldName
        },
        bubbles: true,
        composed: true
      })
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════

  cleanup() {
    if (this.resizeHandler) {
      this.resizeHandler.disconnect();
      this.resizeHandler = null;
    }
    if (this.tooltip) {
      this.tooltip.destroy();
      this.tooltip = null;
    }
  }
}
