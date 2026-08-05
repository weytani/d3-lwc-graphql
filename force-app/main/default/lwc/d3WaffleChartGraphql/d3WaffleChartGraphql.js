// ABOUTME: D3 waffle chart Lightning Web Component rendering part-to-whole as a 10x10 grid.
// ABOUTME: Each category fills round(proportion*100) of 100 cells; colors via theme.js, contrast via utils.js.
import { LightningElement, api, track, wire } from "lwc";
import { loadD3 } from "./d3Loader";
import { prepareData, aggregateData, OPERATIONS, MAX_RECORDS } from "./data";
import { DEFAULT_THEME, createColorScale } from "./theme";
import {
  formatNumber,
  formatPercent,
  createTooltip,
  createResizeHandler,
  getContrastColor,
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

const GRID_SIZE = 10;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;

export default class D3WaffleChartGraphql extends NavigationMixin(
  LightningElement
) {
  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API PROPERTIES
  // ═══════════════════════════════════════════════════════════════

  /** Data collection from Flow or parent component */
  @api recordCollection = [];

  /** Field to group by (cell categories) */
  @api groupByField = "";

  /** Field to aggregate (category values) */
  @api valueField = "";

  /** Aggregation operation: Sum, Count, Average */
  @api operation = OPERATIONS.COUNT;

  /** Chart height in pixels */
  @api height = 300;

  /** Color theme */
  @api theme = DEFAULT_THEME;

  /** Show legend (defaults to true via getter) */
  @api showLegend;

  /** Advanced configuration JSON */
  @api advancedConfig = "{}";

  /** Maximum records to process (overrides default limit) */
  @api recordLimit;

  /** Object API name for drill-down navigation. When set (and no records are
   *  passed in), the chart also self-fetches this object via GraphQL. */
  @api objectApiName = "";

  /** Filter field for drill-down */
  @api filterField = "";

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

  /**
   * Free-text UI API GraphQL document. When non-blank it overrides the
   * structured query builder as the wire's data source; the returned records
   * are aggregated client-side by groupByField/valueField/operation.
   */
  @api graphqlQuery = "";

  // ═══════════════════════════════════════════════════════════════
  // TRACKED STATE
  // ═══════════════════════════════════════════════════════════════

  @track isLoading = true;
  @track error = null;
  @track chartData = [];
  @track totalValue = 0;

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
  _configParsed = false;
  _graphqlFilter;
  _graphqlFilterInvalid = false;

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
    return this.showLegend !== false;
  }

  get legendItems() {
    if (!this.chartData || !this.effectiveShowLegend) return [];
    const colorScale = createColorScale(
      this.theme,
      this.chartData.map((d) => d.label),
      this.config.customColors
    );
    return this.chartData.map((d) => ({
      label: d.label,
      value: d.value,
      percent:
        this.totalValue > 0 ? formatPercent(d.value / this.totalValue) : "0%",
      colorStyle: `background-color: ${colorScale(d.label)};`
    }));
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
    // An unparseable GraphQL Filter must not fall back to an unfiltered query.
    if (this._graphqlFilterInvalid) {
      return undefined;
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
          fields: [...new Set([this.groupByField].filter(Boolean))],
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
            ? [...new Set([this.groupByField].filter(Boolean))]
            : [
                ...new Set([this.groupByField, this.valueField].filter(Boolean))
              ];
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
          fields: [...new Set([this.groupByField].filter(Boolean))]
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
        this.totalValue = normalized.reduce((sum, d) => sum + d.value, 0);
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
      console.error("D3WaffleChartGraphql initialization error:", e);
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
    // recordCollection is aggregated client-side here. Otherwise the GraphQL
    // wire (structured builder or a free-text graphqlQuery) provides the data
    // reactively and there is nothing to fetch synchronously.
    if (this.recordCollection && this.recordCollection.length > 0) {
      this.chartData = this._aggregateRawData([...this.recordCollection]);
      this.totalValue = this.chartData.reduce((sum, d) => sum + d.value, 0);
    }
  }

  /**
   * Validates, truncates, and aggregates raw record data client-side.
   * Used by the recordCollection path and the GraphQL free-text / Count paths.
   */
  _aggregateRawData(rawData) {
    const requiredFields = [this.groupByField];
    if (this.operation !== OPERATIONS.COUNT) {
      requiredFields.push(this.valueField);
    }

    const prepared = prepareData(rawData, {
      requiredFields,
      limit: this.recordLimit || MAX_RECORDS
    });

    if (!prepared.valid) {
      throw new Error(prepared.error);
    }

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
  // CELL ALLOCATION
  // ═══════════════════════════════════════════════════════════════

  /**
   * Allocates the 100 cells across categories in descending value order.
   * Each category gets round(proportion * 100) cells; the running total is
   * capped at 100 so rounding overflow is trimmed from the last category.
   * @returns {Array<{label:string,value:number,color:string}>} one entry per category
   */
  _allocateCells() {
    const total = this.totalValue;
    const colorScale = createColorScale(
      this.theme,
      this.chartData.map((d) => d.label),
      this.config.customColors
    );

    let remaining = TOTAL_CELLS;
    const allocations = [];
    this.chartData.forEach((d) => {
      const proportion = total > 0 ? d.value / total : 0;
      let count = Math.round(proportion * TOTAL_CELLS);
      if (count > remaining) {
        count = remaining;
      }
      remaining -= count;
      allocations.push({
        label: d.label,
        value: d.value,
        count,
        color: colorScale(d.label)
      });
    });
    return allocations;
  }

  /**
   * Expands category allocations into a flat array of exactly 100 cell
   * descriptors, each carrying its grid row/column, label, value, and color.
   * @param {Array} allocations - output of _allocateCells()
   * @returns {Array<{index:number,row:number,col:number,label:string,value:number,color:string,textColor:string}>}
   */
  _buildCells(allocations) {
    const cells = [];
    allocations.forEach((alloc) => {
      for (let i = 0; i < alloc.count; i++) {
        cells.push({
          label: alloc.label,
          value: alloc.value,
          color: alloc.color,
          textColor: getContrastColor(alloc.color)
        });
      }
    });
    while (cells.length < TOTAL_CELLS) {
      cells.push({
        label: null,
        value: 0,
        color: "#E5E5E5",
        textColor: getContrastColor("#E5E5E5")
      });
    }
    return cells.slice(0, TOTAL_CELLS).map((cell, index) => ({
      ...cell,
      index,
      row: Math.floor(index / GRID_SIZE),
      col: index % GRID_SIZE
    }));
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

    d3.select(container).select("svg").remove();

    const padding = Math.max(10, Math.round(containerWidth * 0.04));
    const margin = {
      top: padding,
      right: padding,
      bottom: padding,
      left: padding
    };
    const width = containerWidth - margin.left - margin.right;
    const height = this.height - margin.top - margin.bottom;

    if (width <= 0 || height <= 0) return;

    const side = Math.min(width, height);
    const gap = side * 0.02;
    const cellSize = (side - gap * (GRID_SIZE - 1)) / GRID_SIZE;

    // Center the square grid within the (typically wider) drawing area so it
    // doesn't hug the left edge leaving empty space on the right.
    const offsetX = margin.left + Math.max(0, (width - side) / 2);
    const offsetY = margin.top + Math.max(0, (height - side) / 2);

    const svgRoot = d3
      .select(container)
      .append("svg")
      .attr("width", containerWidth)
      .attr("height", this.height)
      .attr("class", "waffle-chart-svg");

    applySvgA11y(svgRoot, {
      title: `Waffle chart: ${this.operation} of ${this.valueField || this.groupByField} by ${this.groupByField}`,
      desc: `${this.chartData.length} categories, total ${formatNumber(this.totalValue)}`
    });

    this.svg = svgRoot
      .append("g")
      .attr("transform", `translate(${offsetX},${offsetY})`);

    const allocations = this._allocateCells();
    const cells = this._buildCells(allocations);
    const showCellLabels = this.config.showCellLabels === true;

    const cellGroups = this.svg
      .selectAll(".waffle-cell")
      .data(cells)
      .enter()
      .append("g")
      .attr("class", "waffle-cell")
      .attr(
        "transform",
        (d) =>
          `translate(${d.col * (cellSize + gap)},${
            (GRID_SIZE - 1 - d.row) * (cellSize + gap)
          })`
      );

    cellGroups
      .append("rect")
      .attr("width", cellSize)
      .attr("height", cellSize)
      .attr("rx", 2)
      .attr("fill", (d) => d.color)
      .attr("cursor", this.objectApiName ? "pointer" : "default")
      .on("mouseenter", (event, d) => {
        this.showTooltip(event, d);
      })
      .on("mousemove", (event) => {
        this.moveTooltip(event);
      })
      .on("mouseleave", () => {
        this.hideTooltip();
      })
      .on("click", (event, d) => {
        this.handleCellClick(d);
      });

    if (showCellLabels) {
      cellGroups
        .append("text")
        .attr("x", cellSize / 2)
        .attr("y", cellSize / 2)
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .style("font-size", `${Math.max(6, cellSize * 0.3)}px`)
        .style("fill", (d) => d.textColor)
        .text((d) => (d.label ? formatNumber(d.value) : ""));
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // TOOLTIP HANDLERS
  // ═══════════════════════════════════════════════════════════════

  showTooltip(event, d) {
    if (!this.tooltip || !d.label) return;

    const percent = this.totalValue > 0 ? d.value / this.totalValue : 0;
    const content = `
            <strong>${d.label}</strong><br/>
            ${formatNumber(d.value)} (${formatPercent(percent)})
        `;

    this.tooltip.show(content, event.offsetX, event.offsetY);
  }

  moveTooltip() {
    // Position handled in show()
  }

  hideTooltip() {
    if (!this.tooltip) return;
    this.tooltip.hide();
  }

  // ═══════════════════════════════════════════════════════════════
  // CLICK HANDLER - DRILL DOWN
  // ═══════════════════════════════════════════════════════════════

  handleCellClick(d) {
    if (!this.objectApiName || !d.label) return;

    const filterFieldName = this.filterField || this.groupByField;

    this[NavigationMixin.Navigate]({
      type: "standard__objectPage",
      attributes: {
        objectApiName: this.objectApiName,
        actionName: "list"
      }
    });

    this.dispatchEvent(
      new CustomEvent("cellclick", {
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
      this.handleCellClick({ label: item.label, value: item.value });
    }
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
