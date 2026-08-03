/**
 * ABOUTME: D3 Sorted Bar Chart Lightning Web Component.
 * ABOUTME: Displays aggregated data as vertical bars that can be re-sorted by label or value, with drill-down support.
 */
import { LightningElement, api, track, wire } from "lwc";
import { loadD3 } from "./d3Loader";
import { prepareData, aggregateData, OPERATIONS, MAX_RECORDS } from "./data";
import { getColors, DEFAULT_THEME } from "./theme";
import {
  formatNumber,
  truncateLabel,
  createTooltip,
  createResizeHandler,
  buildTooltipContent,
  applySvgA11y
} from "./utils";
import { NavigationMixin } from "lightning/navigation";
import { gql, graphql } from "lightning/graphql";
import {
  buildAggregateQuery,
  buildRecordQuery,
  normalizeAggregate,
  normalizeRecordsGeneric
} from "./graphql";

const SORT_BY_VALUES = ["label", "value"];
const SORT_DIRECTION_VALUES = ["asc", "desc"];

export default class D3SortedBarChartGraphql extends NavigationMixin(
  LightningElement
) {
  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API PROPERTIES
  // ═══════════════════════════════════════════════════════════════

  /** Data collection from Flow or parent component */
  @api recordCollection = [];

  /** Field to group by (category axis) */
  @api groupByField = "StageName";

  /** Field to aggregate (value axis) */
  @api valueField = "Amount";

  /** Aggregation operation: Sum, Count, Average */
  @api operation = OPERATIONS.SUM;

  /** Chart height in pixels */
  @api height = 300;

  /** Color theme */
  @api theme = DEFAULT_THEME;

  /** Advanced configuration JSON */
  @api advancedConfig = "{}";

  /** Maximum records to process (overrides default limit) */
  @api recordLimit;

  /** Object API name for drill-down navigation */
  @api objectApiName = "";

  /** Filter field for drill-down (usually same as groupByField) */
  @api filterField = "";

  /**
   * Free-text UI API GraphQL document. When non-blank it overrides the
   * structured query builder as the wire's data source; the returned records
   * are aggregated client-side by groupByField/valueField/operation, then sorted.
   */
  @api graphqlQuery = "";

  /** Structured filter for the GraphQL path: { field, operator, value }. */
  @api graphqlFilter;

  /**
   * Sort key: "label" (alphabetical) or "value" (numeric). Setting this after
   * the chart has rendered re-sorts and redraws immediately, without
   * refetching data.
   */
  @api
  get sortBy() {
    return this._sortBy;
  }
  set sortBy(value) {
    this._sortBy = SORT_BY_VALUES.includes(value) ? value : "value";
    this._resortIfRendered();
  }

  /**
   * Sort direction: "asc" or "desc". Setting this after the chart has
   * rendered re-sorts and redraws immediately, without refetching data.
   */
  @api
  get sortDirection() {
    return this._sortDirection;
  }
  set sortDirection(value) {
    this._sortDirection = SORT_DIRECTION_VALUES.includes(value)
      ? value
      : "desc";
    this._resortIfRendered();
  }

  // ═══════════════════════════════════════════════════════════════
  // TRACKED STATE
  // ═══════════════════════════════════════════════════════════════

  @track isLoading = true;
  @track error = null;
  @track chartData = [];

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE PROPERTIES
  // ═══════════════════════════════════════════════════════════════

  _sortBy = "value";
  _sortDirection = "desc";
  _lastContainerWidth = 0;

  d3 = null;
  svg = null;
  tooltip = null;
  resizeHandler = null;
  chartRendered = false;
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

  get effectiveShowLegend() {
    return !!this.config.showLegend;
  }

  /** Legend placement: "bottom" (default, wraps under the chart) or "right" (sidebar). */
  get legendPosition() {
    return this.config.legendPosition === "right" ? "right" : "bottom";
  }

  get chartWrapperClass() {
    return this.legendPosition === "right"
      ? "chart-wrapper chart-wrapper_row"
      : "chart-wrapper chart-wrapper_column";
  }

  get legendContainerClass() {
    return this.legendPosition === "right"
      ? "legend-container legend-container_right"
      : "legend-container legend-container_bottom";
  }

  get legendItems() {
    if (!this.chartData || !this.effectiveShowLegend) return [];
    const colorMap = this._getColorMap();
    return this._getSortedData().map((d) => ({
      label: d.label,
      value: d.value,
      color: colorMap.get(d.label),
      colorStyle: `background-color: ${colorMap.get(d.label)};`
    }));
  }

  // ═══════════════════════════════════════════════════════════════
  // SORTING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Returns a re-ordered copy of chartData per the current sortBy/sortDirection,
   * without mutating chartData or re-fetching. Ascending sort is computed first
   * (by label localeCompare, or by numeric value), then reversed for "desc" —
   * this keeps both sort keys' comparators simple and symmetric.
   */
  _getSortedData() {
    const data = [...this.chartData];
    if (this._sortBy === "label") {
      data.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    } else {
      data.sort((a, b) => a.value - b.value);
    }
    if (this._sortDirection !== "asc") {
      data.reverse();
    }
    return data;
  }

  /**
   * Maps each entity's label to a stable color, assigned once from chartData's
   * original (load) order. Re-sorting only changes bar position — never color —
   * so a given category keeps the same color across every sort order.
   */
  _getColorMap() {
    const colors = getColors(
      this.theme,
      this.chartData.length,
      this.config.customColors
    );
    const map = new Map();
    this.chartData.forEach((d, i) => map.set(d.label, colors[i]));
    return map;
  }

  /**
   * Re-orders the already-rendered bars in place (no data refetch, no SVG
   * teardown) when sortBy/sortDirection change after the initial render.
   * Bars slide via d3.transition() to their new x position on the existing
   * scaleBand/axis; a full renderChart() (used for the initial render and on
   * resize) is not needed since the data and colors haven't changed.
   */
  _resortIfRendered() {
    if (!this.chartRendered || !this.d3 || !this.svg) return;
    const d3 = this.d3;

    const margin = {
      top: 20,
      right: 20,
      bottom: this.config.showGrid !== false ? 60 : 40,
      left: 60
    };
    const width = this._lastContainerWidth - margin.left - margin.right;
    if (width <= 0) return;

    const sortedData = this._getSortedData();
    const xScale = d3
      .scaleBand()
      .domain(sortedData.map((d) => d.label))
      .range([0, width])
      .padding(0.2);

    this.svg
      .selectAll(".bar")
      .data(sortedData, (d) => d.label)
      .transition()
      .duration(750)
      .attr("x", (d) => xScale(d.label));

    this.svg
      .select(".x-axis")
      .transition()
      .duration(750)
      .call(d3.axisBottom(xScale).tickFormat((d) => truncateLabel(d, 12)));
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
   * missing. A non-blank graphqlQuery overrides the structured builder.
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
    // Structured builder path.
    if (!this.objectApiName || !this.groupByField || !this.operation) {
      return undefined;
    }
    // valueField is not required for Count.
    if (this.operation !== OPERATIONS.COUNT && !this.valueField) {
      return undefined;
    }
    let queryString;
    try {
      if (this.operation === OPERATIONS.COUNT) {
        queryString = buildRecordQuery({
          objectApiName: this.objectApiName,
          fields: [this.groupByField],
          filter: this.graphqlFilter,
          first: this.recordLimit || 2000
        });
      } else {
        queryString = buildAggregateQuery({
          objectApiName: this.objectApiName,
          groupByField: this.groupByField,
          valueField: this.valueField,
          operation: this.operation,
          filter: this.graphqlFilter,
          first: this.recordLimit || 2000
        });
      }
    } catch {
      // Unsupported operation/config: leave the wire un-provisioned; error surfaces below.
      return undefined;
    }
    return gql`
      ${queryString}
    `;
  }

  @wire(graphql, { query: "$gqlQuery" })
  wiredAggregate({ data, errors }) {
    // recordCollection is handled synchronously in loadData; ignore the wire.
    if (this.recordCollection && this.recordCollection.length > 0) return;
    if (errors) {
      this.error = this._formatGqlErrors(errors);
      this.isLoading = false;
      return;
    }
    if (!data) return; // initial undefined emission
    try {
      let normalized;
      if (this.hasFreeTextQuery) {
        // Free-text override: treat the response as a record query and
        // aggregate client-side by the field mappings.
        const fields =
          this.operation === OPERATIONS.COUNT
            ? [this.groupByField]
            : [this.groupByField, this.valueField];
        const records = normalizeRecordsGeneric(data, {
          objectApiName: this.objectApiName,
          fields
        });
        if (!records.length) {
          // No rows normalized: the pasted document must be a UI API record
          // query (uiapi.query), not an aggregate query.
          this.error =
            "The GraphQL Query returned no records. It must be a UI API record query (uiapi.query).";
          this.isLoading = false;
          return;
        }
        normalized = this._aggregateRawData(records);
      } else if (this.operation === OPERATIONS.COUNT) {
        const records = normalizeRecordsGeneric(data, {
          objectApiName: this.objectApiName,
          fields: [this.groupByField]
        });
        normalized = this._aggregateRawData(records);
      } else {
        normalized = normalizeAggregate(data, {
          objectApiName: this.objectApiName,
          groupByField: this.groupByField,
          valueField: this.valueField,
          operation: this.operation
        });
      }
      if (!normalized.length) {
        this.error = "No data after aggregation";
      } else {
        this.chartData = normalized;
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
      // Load D3
      this.d3 = await loadD3(this);

      // Load data
      await this.loadData();

      // Render will happen in renderedCallback after DOM is ready
    } catch (e) {
      this.error = e.message || "Failed to initialize chart";
      console.error("D3SortedBarChartGraphql initialization error:", e);
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
      // initializeChart installs a lifetime ResizeObserver that draws the chart
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
    // recordCollection is aggregated client-side here. Otherwise the GraphQL
    // wire (structured builder or a free-text graphqlQuery) provides the data
    // reactively and there is nothing to fetch synchronously.
    if (this.recordCollection && this.recordCollection.length > 0) {
      this.chartData = this._aggregateRawData([...this.recordCollection]);
    }
  }

  /**
   * Validates, truncates, and aggregates raw record data client-side.
   * Used by the recordCollection path and the GraphQL free-text / Count paths.
   */
  _aggregateRawData(rawData) {
    // Validate required fields
    const requiredFields = [this.groupByField];
    if (this.operation !== OPERATIONS.COUNT) {
      requiredFields.push(this.valueField);
    }

    // Prepare data (validate + truncate)
    const prepared = prepareData(rawData, {
      requiredFields,
      limit: this.recordLimit || MAX_RECORDS
    });

    if (!prepared.valid) {
      throw new Error(prepared.error);
    }

    // Aggregate data
    const aggregated = aggregateData(
      prepared.data,
      this.groupByField,
      this.valueField,
      this.operation
    );

    if (aggregated.length === 0) {
      throw new Error("No data after aggregation");
    }

    return aggregated;
  }

  // ═══════════════════════════════════════════════════════════════
  // CHART RENDERING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Initializes the tooltip and a single lifetime ResizeObserver, then attempts
   * an immediate render. The observer drives both the first render (whenever the
   * container becomes measurable — there is no fixed give-up window) and every
   * subsequent resize, so a container that is unmeasurable or narrower than the
   * chart margins at boot still renders the moment it gains usable width.
   * @returns {boolean} true once the tooltip + observer are installed
   */
  initializeChart() {
    const container = this.template.querySelector(".chart-container");
    if (!container) return false;

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

    this._lastContainerWidth = containerWidth;

    // Clear existing SVG
    d3.select(container).select("svg").remove();

    // Sort a copy of chartData per the current sortBy/sortDirection — the
    // original chartData (and its load order) is never mutated, so re-sorting
    // never needs a refetch.
    const sortedData = this._getSortedData();

    // Margins
    const margin = {
      top: 20,
      right: 20,
      bottom: this.config.showGrid !== false ? 60 : 40,
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
      .attr("class", "sorted-bar-chart-svg");

    applySvgA11y(svgRoot, {
      title: `Sorted bar chart: ${this.operation} of ${this.valueField} by ${this.groupByField}, sorted by ${this._sortBy} (${this._sortDirection})`,
      desc: `${sortedData.length} categories`
    });

    this.svg = svgRoot
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3
      .scaleBand()
      .domain(sortedData.map((d) => d.label))
      .range([0, width])
      .padding(0.2);

    const yMax = d3.max(sortedData, (d) => d.value) || 0;
    const yScale = d3
      .scaleLinear()
      .domain([0, yMax * 1.1]) // 10% headroom
      .nice()
      .range([height, 0]);

    // Colors — stable per entity (see _getColorMap), so re-sorting never
    // reassigns a category's color, only its position.
    const colorMap = this._getColorMap();

    // Grid lines (optional)
    if (this.config.showGrid !== false) {
      this.svg
        .append("g")
        .attr("class", "grid")
        .call(d3.axisLeft(yScale).tickSize(-width).tickFormat(""))
        .selectAll("line")
        .attr("stroke", "#e0e0e0")
        .attr("stroke-dasharray", "2,2");

      this.svg.select(".grid .domain").remove();
    }

    // X Axis
    const xAxis = this.svg
      .append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(xScale).tickFormat((d) => truncateLabel(d, 12)));

    // Rotate labels if many bars
    if (sortedData.length > 6) {
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

    // Bars
    const bars = this.svg
      .selectAll(".bar")
      .data(sortedData, (d) => d.label)
      .enter()
      .append("rect")
      .attr("class", "bar")
      .attr("x", (d) => xScale(d.label))
      .attr("width", xScale.bandwidth())
      .attr("y", height) // Start from bottom for animation
      .attr("height", 0)
      .attr("fill", (d) => colorMap.get(d.label))
      .attr("rx", 2) // Rounded corners
      .attr("cursor", this.objectApiName ? "pointer" : "default");

    // Animate bars
    bars
      .transition()
      .duration(750)
      .delay((d, i) => i * 50)
      .attr("y", (d) => yScale(d.value))
      .attr("height", (d) => height - yScale(d.value));

    // Tooltip interactions
    bars
      .on("mouseenter", (event, d) => {
        this.showTooltip(event, d);
        d3.select(event.currentTarget)
          .transition()
          .duration(100)
          .attr("opacity", 0.8);
      })
      .on("mousemove", (event) => {
        this.moveTooltip(event);
      })
      .on("mouseleave", (event) => {
        this.hideTooltip();
        d3.select(event.currentTarget)
          .transition()
          .duration(100)
          .attr("opacity", 1);
      })
      .on("click", (event, d) => {
        this.handleBarClick(d);
      });
  }

  // ═══════════════════════════════════════════════════════════════
  // TOOLTIP HANDLERS
  // ═══════════════════════════════════════════════════════════════

  showTooltip(event, d) {
    if (!this.tooltip) return;

    const content = buildTooltipContent(d.label, d.value, {
      prefix: `${this.operation || "Value"}: `
    });

    this.tooltip.show(content, event.offsetX, event.offsetY);
  }

  // eslint-disable-next-line no-unused-vars
  moveTooltip(event) {
    // Tooltip position is set in show(), but we can update it here if needed
    // The current implementation handles positioning in show()
  }

  hideTooltip() {
    if (!this.tooltip) return;
    this.tooltip.hide();
  }

  // ═══════════════════════════════════════════════════════════════
  // CLICK HANDLER - DRILL DOWN
  // ═══════════════════════════════════════════════════════════════

  handleBarClick(d) {
    if (!this.objectApiName) return;

    const filterFieldName = this.filterField || this.groupByField;

    // Navigate to list view with filter
    this[NavigationMixin.Navigate]({
      type: "standard__objectPage",
      attributes: {
        objectApiName: this.objectApiName,
        actionName: "list"
      },
      state: {
        filterName: "Recent"
      }
    });

    // Dispatch custom event for parent components to handle filtering
    this.dispatchEvent(
      new CustomEvent("barclick", {
        detail: {
          label: d.label,
          value: d.value,
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
    const label = event.currentTarget.dataset.label;
    const item = this.chartData.find((d) => d.label === label);
    if (item) {
      this.handleBarClick(item);
    }
  }

  /** Activates a legend item via keyboard (Enter/Space), matching the click behavior. */
  handleLegendKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    this.handleLegendClick(event);
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
