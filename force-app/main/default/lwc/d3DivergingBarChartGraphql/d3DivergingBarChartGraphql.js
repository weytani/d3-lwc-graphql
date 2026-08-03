/**
 * ABOUTME: D3 Diverging Bar Chart Lightning Web Component.
 * ABOUTME: Displays signed aggregated values as horizontal bars diverging left/right from a centered zero baseline.
 */
import { LightningElement, api, track, wire } from "lwc";
import { loadD3 } from "c/d3Lib";
import {
  prepareData,
  aggregateData,
  OPERATIONS,
  MAX_RECORDS
} from "c/dataService";
import { getSemanticVariantForTheme } from "c/themeService";
import {
  formatNumber,
  truncateLabel,
  createTooltip,
  createResizeHandler,
  buildTooltipContent,
  createLayoutRetry,
  applySvgA11y
} from "c/chartUtils";
import { NavigationMixin } from "lightning/navigation";
import executeQuery from "@salesforce/apex/D3ChartController.executeQuery";
import getAggregatedData from "@salesforce/apex/D3ChartController.getAggregatedData";
import { gql, graphql } from "lightning/graphql";
import {
  buildAggregateQuery,
  normalizeAggregate,
  buildRecordQuery,
  normalizeRecords
} from "c/graphqlService";

export default class D3DivergingBarChartGraphql extends NavigationMixin(
  LightningElement
) {
  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API PROPERTIES
  // ═══════════════════════════════════════════════════════════════

  /** Data collection from Flow or parent component */
  @api recordCollection = [];

  /** SOQL query string (used if recordCollection is empty) */
  @api soqlQuery = "SELECT StageName, Amount FROM Opportunity";

  /** Field to group by (category axis) */
  @api groupByField = "StageName";

  /** Field to aggregate (signed value axis) */
  @api valueField = "Amount";

  /** Aggregation operation: Sum, Count, Average */
  @api operation = OPERATIONS.SUM;

  /** Chart height in pixels */
  @api height = 300;

  /** Color theme — resolves to a positive/negative semantic color pair (see semanticColors) */
  @api theme = "Salesforce Standard";

  /** Advanced configuration JSON */
  @api advancedConfig = "{}";

  /** Maximum records to process (overrides default limit) */
  @api recordLimit;

  /** Object API name for drill-down navigation */
  @api objectApiName = "";

  /** Filter field for drill-down (usually same as groupByField) */
  @api filterField = "";

  /** Optional WHERE clause fragment for server-side aggregation */
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

  /**
   * Resolves the positive/negative bar colors: the theme's semantic variant,
   * with each side individually overridable via advancedConfig.customColors
   * as [positive, negative].
   */
  get semanticColors() {
    const variant = getSemanticVariantForTheme(this.theme);
    const custom = Array.isArray(this.config.customColors)
      ? this.config.customColors
      : null;
    return {
      positive: (custom && custom[0]) || variant.positive,
      negative: (custom && custom[1]) || variant.negative
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // GRAPHQL SELF-FETCH PATH (Approach A — additive)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Reactive GraphQL query for the self-fetch path. Returns undefined (so the wire
   * is skipped) unless fetchMode is "graphql" and all required config is present.
   */
  get gqlQuery() {
    if (this.fetchMode !== "graphql") return undefined;
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
    if (this.fetchMode !== "graphql") return;
    if (errors) {
      this.error = this._formatGqlErrors(errors);
      this.isLoading = false;
      return;
    }
    if (!data) return; // initial undefined emission
    try {
      let normalized;
      if (this.operation === OPERATIONS.COUNT) {
        const records = normalizeRecords(data, {
          objectApiName: this.objectApiName,
          labelField: this.groupByField
        });
        normalized = this._aggregateRawData(
          records.map((r) => ({ [this.groupByField]: r.label }))
        );
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
      this.d3 = await loadD3(this);
      await this.loadData();
    } catch (e) {
      this.error = e.message || "Failed to initialize chart";
      console.error("D3DivergingBarChartGraphql initialization error:", e);
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

    if (this.recordCollection && this.recordCollection.length > 0) {
      this.chartData = this._aggregateRawData([...this.recordCollection]);
      return;
    }

    if (
      this.objectApiName &&
      this.groupByField &&
      this.valueField &&
      this.operation
    ) {
      try {
        const result = await getAggregatedData({
          objectName: this.objectApiName,
          groupByField: this.groupByField,
          valueField: this.valueField,
          operation: this.operation,
          filterClause: this.filterClause || null
        });
        this.chartData = result;
      } catch (e) {
        throw new Error(`Aggregation Error: ${e.body?.message || e.message}`);
      }

      if (!this.chartData || this.chartData.length === 0) {
        throw new Error("No data after aggregation");
      }
      return;
    }

    if (this.soqlQuery) {
      let rawData = [];
      try {
        rawData = await executeQuery({ queryString: this.soqlQuery });
      } catch (e) {
        throw new Error(`SOQL Error: ${e.body?.message || e.message}`);
      }
      this.chartData = this._aggregateRawData(rawData);
      return;
    }

    throw new Error(
      "No data source provided. Set recordCollection or soqlQuery."
    );
  }

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

    // Clear existing SVG (idempotent — runs on init and every resize)
    d3.select(container).select("svg").remove();

    const margin = {
      top: 20,
      right: 20,
      bottom: 40,
      left: 150
    };

    const width = containerWidth - margin.left - margin.right;
    const height = this.height - margin.top - margin.bottom;

    if (width <= 0 || height <= 0) return;

    const svgRoot = d3
      .select(container)
      .append("svg")
      .attr("width", containerWidth)
      .attr("height", this.height)
      .attr("class", "diverging-bar-chart-svg");

    applySvgA11y(svgRoot, {
      title: `Diverging bar chart: ${this.operation} of ${this.valueField} by ${this.groupByField}`,
      desc: `${this.chartData.length} categories`
    });

    this.svg = svgRoot
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Centered zero baseline: symmetric domain [-maxAbs, +maxAbs]
    const maxAbs = d3.max(this.chartData, (d) => Math.abs(d.value)) || 0;
    const xScale = d3
      .scaleLinear()
      .domain([-maxAbs, maxAbs])
      .nice()
      .range([0, width]);

    // Categories on the band (vertical) axis
    const yScale = d3
      .scaleBand()
      .domain(this.chartData.map((d) => d.label))
      .range([0, height])
      .padding(0.2);

    const zero = xScale(0);

    // Zero baseline reference line
    this.svg
      .append("line")
      .attr("class", "zero-line")
      .attr("x1", zero)
      .attr("x2", zero)
      .attr("y1", 0)
      .attr("y2", height)
      .attr("stroke", "#b0c4de")
      .attr("stroke-width", 1);

    // X (value) Axis with centered zero
    this.svg
      .append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(xScale).tickFormat((d) => formatNumber(d)));

    // Y (category) Axis
    this.svg
      .append("g")
      .attr("class", "y-axis")
      .attr("transform", `translate(${zero},0)`)
      .call(d3.axisLeft(yScale).tickFormat((d) => truncateLabel(d, 22)));

    // Diverging bars: extend left for negative, right for positive
    const colors = this.semanticColors;
    const bars = this.svg
      .selectAll(".bar")
      .data(this.chartData)
      .enter()
      .append("rect")
      .attr("class", "bar")
      .attr("y", (d) => yScale(d.label))
      .attr("height", yScale.bandwidth())
      .attr("x", (d) => (d.value < 0 ? xScale(d.value) : zero))
      .attr("width", 0) // start at zero for animation
      .attr("fill", (d) => (d.value < 0 ? colors.negative : colors.positive))
      .attr("rx", 2)
      .attr("cursor", this.objectApiName ? "pointer" : "default");

    // Animate width from zero baseline outward
    bars
      .transition()
      .duration(750)
      .delay((d, i) => i * 50)
      .attr("width", (d) => Math.abs(xScale(d.value) - zero));

    // Tooltip + click interactions
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
    // Tooltip position is set in show(); no-op here.
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
