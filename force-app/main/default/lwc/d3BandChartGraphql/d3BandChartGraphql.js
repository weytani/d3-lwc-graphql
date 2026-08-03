// ABOUTME: D3 Band Chart Lightning Web Component.
// ABOUTME: Displays a time series confidence interval / acceptable range as a filled band between a lower and upper bound, with an optional center line.
import { LightningElement, api, track, wire } from "lwc";
import { loadD3 } from "c/d3Lib";
import { prepareData, CHART_LIMITS, applyFilterClause } from "c/dataService";
import { getColor, DEFAULT_THEME } from "c/themeService";
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

export default class D3BandChartGraphql extends NavigationMixin(LightningElement) {
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

  /** Field holding the lower bound of the band */
  @api lowerField = "Amount";

  /** Field holding the upper bound of the band */
  @api upperField = "ExpectedRevenue";

  /** Optional field for a center line drawn within the band */
  @api valueField = "";

  /** Date format for parsing (ISO, US, EU, or custom) */
  @api dateFormat = "ISO";

  /** Chart height in pixels */
  @api height = 300;

  /** Color theme */
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

  /** Whether a center line should be drawn — true when valueField is set. */
  get hasCenterLine() {
    return !!this.valueField;
  }

  // ═══════════════════════════════════════════════════════════════
  // GRAPHQL SELF-FETCH PATH (Approach A — additive, CT-REC)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Reactive GraphQL query for the self-fetch path. Returns undefined (so the wire
   * is skipped) unless fetchMode is "graphql" and objectApiName/dateField/
   * lowerField/upperField are set. Band has no server-side aggregate: it always
   * fetches raw records for dateField, lowerField, upperField, and (if set)
   * valueField, then feeds the existing processBandData path (same as
   * recordCollection/soqlQuery).
   */
  get gqlQuery() {
    if (this.fetchMode !== "graphql") return undefined;
    if (
      !this.objectApiName ||
      !this.dateField ||
      !this.lowerField ||
      !this.upperField
    ) {
      return undefined;
    }
    const fields = [
      ...new Set(
        [
          this.dateField,
          this.lowerField,
          this.upperField,
          this.valueField
        ].filter(Boolean)
      )
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
        ...new Set(
          [
            this.dateField,
            this.lowerField,
            this.upperField,
            this.valueField
          ].filter(Boolean)
        )
      ];
      const records = normalizeRecordsGeneric(data, {
        objectApiName: this.objectApiName,
        fields
      });
      this.processBandData(records);
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
      console.error("D3BandChartGraphql initialization error:", e);
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

    const requiredFields = [this.dateField, this.lowerField, this.upperField];
    const prepared = prepareData(rawData, {
      requiredFields,
      limit: this.recordLimit || CHART_LIMITS.BAND_CHART
    });

    if (!prepared.valid) {
      throw new Error(prepared.error);
    }

    this.processBandData(prepared.data);

    if (this.chartData.length === 0) {
      throw new Error("No data after processing");
    }
  }

  /**
   * Parses raw records into date-ordered {date, lowerValue, upperValue,
   * centerValue} rows. Records missing a valid date/lower/upper are dropped.
   * When valueField is set but a record's center value is non-numeric, the
   * row is kept (the band still renders) with centerValue left undefined —
   * the center line simply skips that point.
   * @param {Array} data - Raw data records
   */
  processBandData(data) {
    const parseDate = this.getDateParser();

    const processedData = data
      .map((record) => {
        const date = parseDate(record[this.dateField]);
        const lowerValue = Number(record[this.lowerField]);
        const upperValue = Number(record[this.upperField]);
        const rawCenter = this.hasCenterLine
          ? Number(record[this.valueField])
          : NaN;
        const centerValue = isNaN(rawCenter) ? undefined : rawCenter;

        if (
          date &&
          !isNaN(date.getTime()) &&
          !isNaN(lowerValue) &&
          !isNaN(upperValue)
        ) {
          return { date, lowerValue, upperValue, centerValue, record };
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

    // Margins
    const margin = {
      top: 20,
      right: 30,
      bottom: 50,
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
      .attr("class", "band-chart-svg");

    applySvgA11y(svgRoot, {
      title: `Band chart: ${this.lowerField} to ${this.upperField} over ${this.dateField}`,
      desc: `${this.chartData.length} points${this.hasCenterLine ? `, center line ${this.valueField}` : ""}`
    });

    this.svg = svgRoot
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // X Scale (time)
    const xExtent = d3.extent(this.chartData, (d) => d.date);
    const xScale = d3.scaleTime().domain(xExtent).range([0, width]);

    // Y Scale — spans the lower/upper bounds, and the center line when present
    const yValues = this.chartData.flatMap((d) => {
      return d.centerValue !== undefined
        ? [d.lowerValue, d.upperValue, d.centerValue]
        : [d.lowerValue, d.upperValue];
    });
    const yMax = d3.max(yValues) || 0;
    const yMin = d3.min(yValues) || 0;
    const yPadding = (yMax - yMin) * 0.1 || 1;

    const yScale = d3
      .scaleLinear()
      .domain([yMin - yPadding, yMax + yPadding])
      .nice()
      .range([height, 0]);

    const bandColor = getColor(this.theme, 0, this.config.customColors);

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

    const curve = this.getCurve(d3);

    // Band area (lower -> upper)
    const area = d3
      .area()
      .x((d) => xScale(d.date))
      .y0((d) => yScale(d.lowerValue))
      .y1((d) => yScale(d.upperValue))
      .curve(curve);

    this.svg
      .append("path")
      .datum(this.chartData)
      .attr("class", "band-area")
      .attr("d", area)
      .attr("fill", bandColor)
      .attr("fill-opacity", 0.25)
      .attr("cursor", this.objectApiName ? "pointer" : "default")
      .on("mouseenter", (event, d) => {
        this.showBandTooltip(event, d);
      })
      .on("mouseleave", () => {
        this.hideTooltip();
      })
      .on("click", (event, points) => {
        this.handleBandClick(points[points.length - 1]);
      });

    // Boundary stroke lines for definition
    const boundaryLine = (accessor) =>
      d3
        .line()
        .x((d) => xScale(d.date))
        .y((d) => yScale(accessor(d)))
        .curve(curve);

    this.svg
      .append("path")
      .datum(this.chartData)
      .attr("class", "band-boundary band-boundary-upper")
      .attr("fill", "none")
      .attr("stroke", bandColor)
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,2")
      .attr(
        "d",
        boundaryLine((d) => d.upperValue)
      );

    this.svg
      .append("path")
      .datum(this.chartData)
      .attr("class", "band-boundary band-boundary-lower")
      .attr("fill", "none")
      .attr("stroke", bandColor)
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,2")
      .attr(
        "d",
        boundaryLine((d) => d.lowerValue)
      );

    // Optional center line
    if (this.hasCenterLine) {
      const centerPoints = this.chartData.filter(
        (d) => d.centerValue !== undefined
      );

      const centerLine = d3
        .line()
        .x((d) => xScale(d.date))
        .y((d) => yScale(d.centerValue))
        .curve(curve);

      this.svg
        .append("path")
        .datum(centerPoints)
        .attr("class", "band-center-line")
        .attr("fill", "none")
        .attr("stroke", bandColor)
        .attr("stroke-width", 2)
        .attr("d", centerLine);

      this.svg
        .selectAll(".band-center-point")
        .data(centerPoints)
        .enter()
        .append("circle")
        .attr("class", "band-center-point")
        .attr("cx", (d) => xScale(d.date))
        .attr("cy", (d) => yScale(d.centerValue))
        .attr("r", 4)
        .attr("fill", bandColor)
        .attr("stroke", "white")
        .attr("stroke-width", 1.5)
        .attr("cursor", this.objectApiName ? "pointer" : "default")
        .on("mouseenter", (event, d) => {
          this.showPointTooltip(event, d);
        })
        .on("mouseleave", () => {
          this.hideTooltip();
        })
        .on("click", (event, d) => {
          this.handleBandClick(d);
        });
    }
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

  showBandTooltip(event, points) {
    if (!this.tooltip || !points || points.length === 0) return;
    const latest = points[points.length - 1];
    const content = `
      <div>
        <div style="font-weight: bold; margin-bottom: 4px;">${this.formatDate(latest.date)}</div>
        <div>Range: ${formatNumber(latest.lowerValue)} – ${formatNumber(latest.upperValue)}</div>
      </div>
    `;
    this.tooltip.show(content, event.offsetX, event.offsetY);
  }

  showPointTooltip(event, d) {
    if (!this.tooltip) return;
    const content = `
      <div>
        <div style="font-weight: bold; margin-bottom: 4px;">${this.formatDate(d.date)}</div>
        <div>${this.valueField}: ${formatNumber(d.centerValue)}</div>
        <div>Range: ${formatNumber(d.lowerValue)} – ${formatNumber(d.upperValue)}</div>
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

  handleBandClick(d) {
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
      new CustomEvent("bandclick", {
        detail: {
          date: d?.date,
          lowerValue: d?.lowerValue,
          upperValue: d?.upperValue,
          centerValue: d?.centerValue,
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
