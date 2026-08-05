/**
 * ABOUTME: D3 Variable-Color Line Chart Lightning Web Component.
 * ABOUTME: Displays a single time series whose stroke color switches at a configurable threshold (e.g. red below target, green above), via an SVG linearGradient with hard-edge stops at each crossing.
 */
import { LightningElement, api, track, wire } from "lwc";
import { loadD3 } from "./d3Loader";
import { prepareData, CHART_LIMITS } from "./data";
import { DEFAULT_THEME, getSemanticVariantForTheme } from "./theme";
import {
  formatNumber,
  createTooltip,
  createResizeHandler,
  applySvgA11y
} from "./utils";
import { NavigationMixin } from "lightning/navigation";
import { gql, graphql } from "lightning/graphql";
import { buildRecordQuery, normalizeRecordsGeneric } from "./graphql";

export default class D3VariableColorLineGraphql extends NavigationMixin(
  LightningElement
) {
  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API PROPERTIES
  // ═══════════════════════════════════════════════════════════════

  /** Data collection from Flow or parent component */
  @api recordCollection = [];

  /** Date field for X-axis (time series) */
  @api dateField = "CloseDate";

  /** Value field for Y-axis, compared against advancedConfig.threshold */
  @api valueField = "Amount";

  /** Date format for parsing (ISO, US, EU, or custom) */
  @api dateFormat = "ISO";

  /** Chart height in pixels */
  @api height = 300;

  /** Color theme (used for the two-item Above/Below-threshold legend) */
  @api theme = DEFAULT_THEME;

  /** Show data points on line (defaults to true via getter) */
  @api showPoints;

  /** Show the Above/Below threshold legend (defaults to true via getter) */
  @api showLegend;

  /** Curve type: linear, monotone, step */
  @api curveType = "monotone";

  /** Advanced configuration JSON. Recognized key: threshold (Number, default 0) */
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
   * are date-parsed and rendered as the single time series.
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
    return this.showLegend !== false;
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

  /** The value threshold separating "above" (positive) from "below" (negative) coloring. Defaults to 0. */
  get threshold() {
    const configured = Number(this.config.threshold);
    return isNaN(configured) ? 0 : configured;
  }

  /** Fixed two-item legend: Above/Below threshold, colored by the theme's semantic pair. */
  get legendItems() {
    if (!this.effectiveShowLegend) return [];
    const { positive, negative } = getSemanticVariantForTheme(this.theme);
    return [
      {
        name: `Above ${formatNumber(this.threshold)}`,
        colorStyle: `background-color: ${positive};`
      },
      {
        name: `Below ${formatNumber(this.threshold)}`,
        colorStyle: `background-color: ${negative};`
      }
    ];
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
   * missing. A non-blank graphqlQuery overrides the structured builder. This
   * chart has no server-side aggregate: it always fetches raw records for
   * dateField and valueField, then feeds the existing processTimeSeriesData path.
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
    const fields = [...new Set([this.dateField, this.valueField])];
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
      const fields = [...new Set([this.dateField, this.valueField])];
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
      console.error("D3VariableColorLineGraphql initialization error:", e);
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
    // recordCollection is processed client-side here. Otherwise the GraphQL wire
    // (structured builder or a free-text graphqlQuery) provides the data
    // reactively and there is nothing to fetch synchronously.
    if (this.recordCollection && this.recordCollection.length > 0) {
      const prepared = prepareData([...this.recordCollection], {
        requiredFields: [this.dateField, this.valueField],
        limit: this.recordLimit || CHART_LIMITS.VARIABLE_COLOR_LINE
      });

      if (!prepared.valid) {
        throw new Error(prepared.error);
      }

      this.processTimeSeriesData(prepared.data);

      if (this.seriesData.length === 0) {
        throw new Error("No data after processing");
      }
    }
  }

  /**
   * Processes raw data into a single time series (this chart has no
   * seriesField — the color varies along ONE line by threshold, not by
   * category). Kept as a one-element seriesData array for structural
   * parity with the donor's renderChart shape.
   * @param {Array} data - Raw data records
   */
  processTimeSeriesData(data) {
    const parseDate = this.getDateParser();

    const processedData = data
      .map((record) => {
        const date = parseDate(record[this.dateField]);
        const value = Number(record[this.valueField]);

        if (date && !isNaN(date.getTime()) && !isNaN(value)) {
          return { date, value, record };
        }
        return null;
      })
      .filter((d) => d !== null);

    processedData.sort((a, b) => a.date - b.date);

    this.seriesData =
      processedData.length > 0
        ? [{ name: "Default", points: processedData }]
        : [];
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
      .attr("class", "variable-color-line-svg");

    applySvgA11y(svgRoot, {
      title: `Variable-color line chart: ${this.valueField} over ${this.dateField}, threshold ${formatNumber(this.threshold)}`,
      desc: `${this.chartData.length} points`
    });

    this.svg = svgRoot
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const points = this.seriesData[0].points;

    // X Scale (time)
    const xExtent = d3.extent(points, (d) => d.date);
    const xScale = d3.scaleTime().domain(xExtent).range([0, width]);

    // Y Scale
    const yMax = d3.max(points, (d) => d.value) || 0;
    const yMin = d3.min(points, (d) => d.value) || 0;
    const yPadding = (yMax - yMin) * 0.1 || 1;

    const yScale = d3
      .scaleLinear()
      .domain([Math.min(0, yMin - yPadding), yMax + yPadding])
      .nice()
      .range([height, 0]);

    const { positive, negative } = getSemanticVariantForTheme(this.theme);
    const colorFor = (value) => (value >= this.threshold ? positive : negative);

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

    // Threshold reference line
    this.svg
      .append("line")
      .attr("class", "threshold-line")
      .attr("x1", 0)
      .attr("x2", width)
      .attr("y1", yScale(this.threshold))
      .attr("y2", yScale(this.threshold))
      .attr("stroke", "#706e6b")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4,3");

    // Gradient stroke keyed to threshold crossings: two colors, hard edges
    // at each point where the line crosses the threshold (the D3 gallery's
    // "bichromatic line" technique — interpolate the exact x fraction where
    // consecutive points straddle the threshold, then emit a same-offset
    // color-pair stop pair there so the transition is a clean vertical cut).
    const gradientId = `variable-color-line-gradient-${Date.now()}`;
    const defs = this.svg.append("defs");
    const gradient = defs
      .append("linearGradient")
      .attr("id", gradientId)
      .attr("gradientUnits", "userSpaceOnUse")
      .attr("x1", xScale(points[0].date))
      .attr("x2", xScale(points[points.length - 1].date))
      .attr("y1", 0)
      .attr("y2", 0);

    const totalSpan =
      xScale(points[points.length - 1].date) - xScale(points[0].date) || 1;
    const stops = [{ offset: 0, color: colorFor(points[0].value) }];
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const prevColor = colorFor(prev.value);
      const currColor = colorFor(curr.value);
      if (prevColor !== currColor) {
        const t = (this.threshold - prev.value) / (curr.value - prev.value);
        const crossTime =
          prev.date.getTime() + t * (curr.date.getTime() - prev.date.getTime());
        const offset =
          (xScale(new Date(crossTime)) - xScale(points[0].date)) / totalSpan;
        stops.push({ offset, color: prevColor });
        stops.push({ offset, color: currColor });
      }
    }
    stops.push({
      offset: 1,
      color: colorFor(points[points.length - 1].value)
    });

    stops.forEach((s) => {
      gradient
        .append("stop")
        .attr("offset", `${Math.max(0, Math.min(1, s.offset)) * 100}%`)
        .attr("stop-color", s.color);
    });

    // Line generator
    const line = d3
      .line()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.value))
      .curve(this.getCurve(d3));

    const seriesGroup = this.svg.append("g").attr("class", "series series-0");

    const path = seriesGroup
      .append("path")
      .datum(points)
      .attr("class", "line")
      .attr("fill", "none")
      .attr("stroke", `url(#${gradientId})`)
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

    // Draw points if enabled, each colored solid by which side of the
    // threshold it falls on
    if (this.effectiveShowPoints) {
      seriesGroup
        .selectAll(".point")
        .data(points)
        .enter()
        .append("circle")
        .attr("class", "point")
        .attr("cx", (d) => xScale(d.date))
        .attr("cy", (d) => yScale(d.value))
        .attr("r", 0)
        .attr("fill", (d) => colorFor(d.value))
        .attr("stroke", "white")
        .attr("stroke-width", 2)
        .attr("cursor", this.objectApiName ? "pointer" : "default")
        .on("mouseenter", (event, d) => {
          this.showTooltip(event, d, colorFor(d.value));
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
          this.handlePointClick(d);
        })
        .transition()
        .delay((d, idx) => 1000 + idx * 20)
        .duration(200)
        .attr("r", 5);
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
        return d3.curveStep;
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

  showTooltip(event, d, color) {
    if (!this.tooltip) return;

    const dateStr = this.formatDate(d.date);
    const status = d.value >= this.threshold ? "Above" : "Below";
    const content = `
            <div style="border-left: 3px solid ${color}; padding-left: 8px;">
                <div style="font-weight: bold; margin-bottom: 4px;">${dateStr}</div>
                <div style="font-size: 14px; font-weight: bold;">
                    ${formatNumber(d.value)}
                </div>
                <div>${status} threshold (${formatNumber(this.threshold)})</div>
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

  handlePointClick(d) {
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
          record: d.record,
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
