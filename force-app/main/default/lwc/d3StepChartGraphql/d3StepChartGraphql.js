/**
 * ABOUTME: D3 Step Chart Lightning Web Component.
 * ABOUTME: Displays time series data as a stepped line (discrete state changes) with multi-series and drill-down support.
 */
import { LightningElement, api, track, wire } from "lwc";
import { loadD3 } from "./d3Loader";
import { prepareData, CHART_LIMITS } from "./data";
import { getColors, DEFAULT_THEME } from "./theme";
import {
  formatNumber,
  createTooltip,
  createResizeHandler,
  applySvgA11y
} from "./utils";
import { NavigationMixin } from "lightning/navigation";
import { gql, graphql } from "lightning/graphql";
import { buildRecordQuery, normalizeRecordsGeneric } from "./graphql";

export default class D3StepChartGraphql extends NavigationMixin(
  LightningElement
) {
  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API PROPERTIES
  // ═══════════════════════════════════════════════════════════════

  /** Data collection from Flow or parent component */
  @api recordCollection = [];

  /** Date field for X-axis (time series) */
  @api dateField = "CloseDate";

  /** Value field for Y-axis */
  @api valueField = "Amount";

  /** Optional series field for multi-line support */
  @api seriesField = "";

  /** Date format for parsing (ISO, US, EU, or custom) */
  @api dateFormat = "ISO";

  /** Chart height in pixels */
  @api height = 300;

  /** Color theme */
  @api theme = DEFAULT_THEME;

  /** Show data points on the step line (defaults to true via getter) */
  @api showPoints;

  /** Show legend (defaults to true for multi-series) */
  @api showLegend;

  /** Advanced configuration JSON */
  @api advancedConfig = "{}";

  /** Maximum records to process (overrides default limit) */
  @api recordLimit;

  /** Object API name for drill-down navigation */
  @api objectApiName = "";

  /** Filter field for drill-down */
  @api filterField = "";

  /**
   * Free-text UI API GraphQL document. When non-blank it overrides the
   * structured query builder as the wire's data source; the returned records
   * are shaped client-side into the time series by dateField/valueField/seriesField.
   */
  @api graphqlQuery = "";

  /**
   * Structured filter for the GraphQL path: { field, operator, value }.
   * Accepts the object directly (programmatic use) or a JSON string (the
   * App Builder property). An unparseable string surfaces the component
   * error state and provisions no query, rather than silently querying
   * unfiltered.
   */
  @api
  get graphqlFilter() {
    return this._graphqlFilter;
  }
  set graphqlFilter(value) {
    this._graphqlFilterInvalid = false;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        this._graphqlFilter = undefined;
        return;
      }
      try {
        this._graphqlFilter = JSON.parse(trimmed);
      } catch {
        this._graphqlFilter = undefined;
        this._graphqlFilterInvalid = true;
        this.error =
          'Invalid GraphQL Filter: must be JSON like {"field":"Name","operator":"like","value":"[D3DEMO]%"}';
        this.isLoading = false;
      }
    } else {
      this._graphqlFilter = value;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // TRACKED STATE
  // ═══════════════════════════════════════════════════════════════

  @track isLoading = true;
  @track error = null;
  @track chartData = [];
  @track seriesData = [];

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE PROPERTIES
  // ═══════════════════════════════════════════════════════════════

  d3 = null;
  svg = null;
  tooltip = null;
  resizeHandler = null;
  /** The .chart-container generation the tooltip and observer are bound to. */
  _observedContainer = null;
  chartRendered = false;
  _config = {};
  _graphqlFilter;
  _graphqlFilterInvalid = false;
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
    return this.seriesData && this.seriesData.length > 0;
  }

  get showChart() {
    return !this.isLoading && !this.hasError && this.hasData;
  }

  get effectiveShowPoints() {
    // Default to true unless explicitly set to false
    return this.showPoints !== false;
  }

  get effectiveShowLegend() {
    // Show legend if explicitly set, or if multi-series
    if (this.showLegend !== undefined) {
      return this.showLegend;
    }
    return this.seriesData.length > 1;
  }

  get legendItems() {
    if (!this.seriesData || !this.effectiveShowLegend) return [];
    const colors = getColors(
      this.theme,
      this.seriesData.length,
      this.config.customColors
    );
    return this.seriesData.map((series, i) => ({
      name: series.name,
      color: colors[i],
      colorStyle: `background-color: ${colors[i]};`
    }));
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

  // ═══════════════════════════════════════════════════════════════
  // GRAPHQL SELF-FETCH PATH
  // ═══════════════════════════════════════════════════════════════

  /** True when an admin has supplied a non-blank free-text GraphQL document. */
  get hasFreeTextQuery() {
    return !!(this.graphqlQuery && this.graphqlQuery.trim());
  }

  /**
   * Reactive GraphQL query for the self-fetch path. Returns undefined (so the
   * wire is skipped) when recordCollection is the source or required config is
   * missing. A non-blank graphqlQuery overrides the structured builder. Step has
   * no server-side aggregate: the structured path fetches raw records for
   * dateField, valueField, and (if set) seriesField, then feeds the existing
   * processTimeSeriesData path (same as recordCollection).
   */
  get gqlQuery() {
    // recordCollection wins: skip the wire so it is never the data source.
    if (this.recordCollection && this.recordCollection.length > 0) {
      return undefined;
    }
    // Admin free-text override: pass the document straight to the wire.
    if (this.hasFreeTextQuery) {
      return gql`
        ${this.graphqlQuery}
      `;
    }
    // An unparseable GraphQL Filter must not fall back to an unfiltered query.
    if (this._graphqlFilterInvalid) {
      return undefined;
    }
    // Structured builder path.
    if (!this.objectApiName || !this.dateField || !this.valueField) {
      return undefined;
    }
    const fields = [
      ...new Set(
        [this.dateField, this.valueField, this.seriesField].filter(Boolean)
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
    // recordCollection is handled synchronously in loadData; ignore the wire.
    if (this.recordCollection && this.recordCollection.length > 0) return;
    if (errors) {
      this.error = this._formatGqlErrors(errors);
      this.isLoading = false;
      return;
    }
    if (!data) return; // initial undefined emission
    try {
      const fields = [
        ...new Set(
          [this.dateField, this.valueField, this.seriesField].filter(Boolean)
        )
      ];
      const records = normalizeRecordsGeneric(data, {
        objectApiName: this.objectApiName,
        fields
      });
      if (this.hasFreeTextQuery && !records.length) {
        // No rows normalized: the pasted document must be a UI API record
        // query (uiapi.query), not an aggregate query.
        this.error =
          "The GraphQL Query returned no records. It must be a UI API record query (uiapi.query).";
        this.isLoading = false;
        return;
      }
      this.processTimeSeriesData(records);
      if (this.seriesData.length === 0) {
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
      console.error("D3StepChartGraphql initialization error:", e);
    } finally {
      // Keep the spinner up while a GraphQL query is provisioned but has not yet
      // emitted data or an error — the wire handler clears isLoading on arrival.
      // This avoids a no-data flash on the self-fetch path. When no wire is
      // provisioned (recordCollection resolved it, or nothing is configured) we
      // stop loading here.
      if (this.hasData || this.error || !this.gqlQuery) {
        this.isLoading = false;
      }
    }
  }

  renderedCallback() {
    if (this.showChart && !this.chartRendered) {
      // initializeChart installs a ResizeObserver that draws the chart
      // on the first measurable width and re-draws on resize — so it is safe to
      // mark initialization done even if the container is not measurable yet.
      this.chartRendered = this.initializeChart();
    }
  }

  disconnectedCallback() {
    this.cleanup();
  }

  // ═══════════════════════════════════════════════════════════════
  // DATA LOADING
  // ═══════════════════════════════════════════════════════════════

  async loadData() {
    // recordCollection is validated, truncated, and shaped into the time series
    // client-side here. Otherwise the GraphQL wire (structured builder or a
    // free-text graphqlQuery) provides the data reactively and there is nothing
    // to fetch synchronously.
    if (this.recordCollection && this.recordCollection.length > 0) {
      const prepared = prepareData([...this.recordCollection], {
        requiredFields: [this.dateField, this.valueField],
        limit: this.recordLimit || CHART_LIMITS.STEP
      });

      if (!prepared.valid) {
        throw new Error(prepared.error);
      }

      // Process into time series format
      this.processTimeSeriesData(prepared.data);

      if (this.seriesData.length === 0) {
        throw new Error("No data after processing");
      }
    }
  }

  /**
   * Processes raw data into time series format with optional multi-series support.
   * @param {Array} data - Raw data records
   */
  processTimeSeriesData(data) {
    const parseDate = this.getDateParser();

    // Parse dates and values
    const processedData = data
      .map((record) => {
        const date = parseDate(record[this.dateField]);
        const value = Number(record[this.valueField]);
        const series = this.seriesField
          ? String(record[this.seriesField] || "Default")
          : "Default";

        if (date && !isNaN(date.getTime()) && !isNaN(value)) {
          return { date, value, series, record };
        }
        return null;
      })
      .filter((d) => d !== null);

    // Group by series
    const seriesMap = new Map();
    processedData.forEach((d) => {
      if (!seriesMap.has(d.series)) {
        seriesMap.set(d.series, []);
      }
      seriesMap.get(d.series).push(d);
    });

    // Sort each series by date and convert to array
    this.seriesData = [];
    seriesMap.forEach((points, name) => {
      points.sort((a, b) => a.date - b.date);
      this.seriesData.push({ name, points });
    });

    // Store flat data for reference
    this.chartData = processedData;
  }

  /**
   * Returns a date parser function based on dateFormat setting.
   * @returns {Function} - Date parser function
   */
  getDateParser() {
    switch (this.dateFormat) {
      case "US":
        // MM/DD/YYYY
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
        // DD/MM/YYYY
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
        // ISO 8601 (YYYY-MM-DD or full ISO string)
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
   * Initializes the tooltip and a single ResizeObserver per container
   * generation, then attempts an immediate render. The observer drives both the
   * first render (whenever the container becomes measurable — there is no fixed
   * give-up window) and every subsequent resize, so a container that is
   * unmeasurable or narrower than the chart margins at boot still renders the
   * moment it gains usable width.
   * @returns {boolean} true once the tooltip + observer are installed
   */
  initializeChart() {
    const container = this.template.querySelector(".chart-container");
    if (!container) return false;

    if (this._observedContainer && this._observedContainer !== container) {
      // The template destroyed the old container (loading/error/no-data pass):
      // rebind, or the tooltip writes into a detached node and the observer
      // watches a dead element.
      this.cleanup();
    }

    // Create the tooltip once.
    if (!this.tooltip) {
      this.tooltip = createTooltip(container);
    }

    // Install the single observer once; it renders on every measurable width.
    if (!this.resizeHandler) {
      this.resizeHandler = createResizeHandler(
        container,
        ({ width: newWidth }) => {
          if (newWidth > 0) {
            this._safeRenderChart(newWidth);
          }
        }
      );
      this.resizeHandler.observe();
    }

    this._observedContainer = container;

    // Render immediately when the container is already measured (the common,
    // warm-cache path); otherwise the observer renders once it has a width.
    const { width } = container.getBoundingClientRect();
    if (width > 0) {
      this._safeRenderChart(width);
    }

    return true;
  }

  /**
   * Renders the chart, surfacing any unexpected exception to the component error
   * state instead of dying silently mid-render.
   */
  _safeRenderChart(containerWidth) {
    try {
      this.renderChart(containerWidth);
    } catch (e) {
      this.error = e.message || "Failed to render chart";
      this.isLoading = false;
    }
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
      .attr("class", "step-chart-svg");

    applySvgA11y(svgRoot, {
      title: `Step chart: ${this.valueField} over ${this.dateField}`,
      desc: `${this.seriesData.length} series`
    });

    this.svg = svgRoot
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Get all data points for scale calculations
    const allPoints = this.seriesData.flatMap((s) => s.points);

    // X Scale (time)
    const xExtent = d3.extent(allPoints, (d) => d.date);
    const xScale = d3.scaleTime().domain(xExtent).range([0, width]);

    // Y Scale
    const yMax = d3.max(allPoints, (d) => d.value) || 0;
    const yMin = d3.min(allPoints, (d) => d.value) || 0;
    const yPadding = (yMax - yMin) * 0.1 || 1;

    const yScale = d3
      .scaleLinear()
      .domain([Math.min(0, yMin - yPadding), yMax + yPadding])
      .nice()
      .range([height, 0]);

    // Colors
    const colors = getColors(
      this.theme,
      this.seriesData.length,
      this.config.customColors
    );

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

    // Rotate labels if many ticks
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

    // Step line generator — d3.curveStepAfter holds each value until the next
    // date, drawing the discrete state change as a right-angle step.
    const line = d3
      .line()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.value))
      .curve(d3.curveStepAfter);

    // Draw lines for each series
    this.seriesData.forEach((series, i) => {
      const seriesGroup = this.svg
        .append("g")
        .attr("class", `series series-${i}`);

      // Draw step line
      const path = seriesGroup
        .append("path")
        .datum(series.points)
        .attr("class", "line")
        .attr("fill", "none")
        .attr("stroke", colors[i])
        .attr("stroke-width", 2)
        .attr("d", line);

      // Animate line drawing
      const totalLength = path.node()?.getTotalLength() || 0;
      if (totalLength > 0) {
        path
          .attr("stroke-dasharray", totalLength)
          .attr("stroke-dashoffset", totalLength)
          .transition()
          .duration(1000)
          .ease(d3.easeLinear)
          .attr("stroke-dashoffset", 0);
      }

      // Draw points if enabled
      if (this.effectiveShowPoints) {
        seriesGroup
          .selectAll(".point")
          .data(series.points)
          .enter()
          .append("circle")
          .attr("class", "point")
          .attr("cx", (d) => xScale(d.date))
          .attr("cy", (d) => yScale(d.value))
          .attr("r", 0)
          .attr("fill", colors[i])
          .attr("stroke", "white")
          .attr("stroke-width", 2)
          .attr("cursor", this.objectApiName ? "pointer" : "default")
          .on("mouseenter", (event, d) => {
            this.showTooltip(event, d, series.name, colors[i]);
            d3.select(event.currentTarget)
              .transition()
              .duration(100)
              .attr("r", 8);
          })
          .on("mouseleave", (event) => {
            this.hideTooltip();
            d3.select(event.currentTarget)
              .transition()
              .duration(100)
              .attr("r", 5);
          })
          .on("click", (event, d) => {
            this.handlePointClick(d, series.name);
          })
          .transition()
          .delay((d, idx) => 1000 + idx * 20)
          .duration(200)
          .attr("r", 5);
      }
    });
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

    // Show year only if data spans multiple years
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

  showTooltip(event, d, seriesName, color) {
    if (!this.tooltip) return;

    const dateStr = this.formatDate(d.date);
    const content = `
            <div style="border-left: 3px solid ${color}; padding-left: 8px;">
                <div style="font-weight: bold; margin-bottom: 4px;">${seriesName}</div>
                <div>${dateStr}</div>
                <div style="font-size: 14px; font-weight: bold; margin-top: 4px;">
                    ${formatNumber(d.value)}
                </div>
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

  handlePointClick(d, seriesName) {
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
      new CustomEvent("pointclick", {
        detail: {
          date: d.date,
          value: d.value,
          series: seriesName,
          record: d.record,
          filterField: filterFieldName
        },
        bubbles: true,
        composed: true
      })
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // LEGEND CLICK
  // ═══════════════════════════════════════════════════════════════

  handleLegendClick(event) {
    const seriesName = event.currentTarget.dataset.series;

    this.dispatchEvent(
      new CustomEvent("legendclick", {
        detail: { series: seriesName },
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
