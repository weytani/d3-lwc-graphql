/**
 * ABOUTME: D3 Slope Chart Lightning Web Component.
 * ABOUTME: Displays a before/after comparison per entity as a connecting line between two ranked value axes, with drill-down support.
 */
import { LightningElement, api, track, wire } from "lwc";
import { loadD3 } from "c/d3Lib";
import { prepareData, CHART_LIMITS } from "c/dataService";
import { DEFAULT_THEME, getSemanticVariantForTheme } from "c/themeService";
import {
  formatNumber,
  truncateLabel,
  createTooltip,
  createResizeHandler,
  createLayoutRetry,
  applySvgA11y
} from "c/chartUtils";
import { NavigationMixin } from "lightning/navigation";
import executeQuery from "@salesforce/apex/D3ChartController.executeQuery";
import { gql, graphql } from "lightning/graphql";
import { buildRecordQuery, normalizeRecordsGeneric } from "c/graphqlService";

export default class D3SlopeChartGraphql extends NavigationMixin(
  LightningElement
) {
  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API PROPERTIES
  // ═══════════════════════════════════════════════════════════════

  /** Data collection from Flow or parent component */
  @api recordCollection = [];

  /** SOQL query string (used if recordCollection is empty) */
  @api soqlQuery = "SELECT Name, Amount, ExpectedRevenue FROM Opportunity";

  /** Entity/category field (one connecting line per distinct value) */
  @api groupByField = "Name";

  /** Field holding the "before" value */
  @api startValueField = "Amount";

  /** Field holding the "after" value */
  @api endValueField = "ExpectedRevenue";

  /** Chart height in pixels */
  @api height = 300;

  /** Color theme (used for the axis header text; the connecting lines use
   * theme-derived semantic positive/negative colors, not the full palette) */
  @api theme = DEFAULT_THEME;

  /** Advanced configuration JSON */
  @api advancedConfig = "{}";

  /** Maximum records to process (overrides default limit) */
  @api recordLimit;

  /** Object API name for drill-down navigation */
  @api objectApiName = "";

  /** Filter field for drill-down (defaults to Group By Field) */
  @api filterField = "";

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

  /** Per-entity labels next to each dot. Default on; disable via advancedConfig. */
  get effectiveShowLabels() {
    return this.config.showLabels !== false;
  }

  // ═══════════════════════════════════════════════════════════════
  // GRAPHQL SELF-FETCH PATH (Approach A — additive, CT-REC)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Reactive GraphQL query for the self-fetch path. Returns undefined (so the wire
   * is skipped) unless fetchMode is "graphql" and objectApiName/groupByField/
   * startValueField/endValueField are set. Slope has no server-side aggregate:
   * it always fetches raw records for the three fields, then feeds the existing
   * processSlopeData path (same as recordCollection/soqlQuery).
   */
  get gqlQuery() {
    if (this.fetchMode !== "graphql") return undefined;
    if (
      !this.objectApiName ||
      !this.groupByField ||
      !this.startValueField ||
      !this.endValueField
    ) {
      return undefined;
    }
    const fields = [
      ...new Set([this.groupByField, this.startValueField, this.endValueField])
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
        ...new Set([
          this.groupByField,
          this.startValueField,
          this.endValueField
        ])
      ];
      const records = normalizeRecordsGeneric(data, {
        objectApiName: this.objectApiName,
        fields
      });
      this.processSlopeData(records);
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
      console.error("D3SlopeChartGraphql initialization error:", e);
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
        rawData = await executeQuery({ queryString: this.soqlQuery });
      } catch (e) {
        throw new Error(`SOQL Error: ${e.body?.message || e.message}`);
      }
    } else {
      throw new Error(
        "No data source provided. Set recordCollection or soqlQuery."
      );
    }

    const requiredFields = [
      this.groupByField,
      this.startValueField,
      this.endValueField
    ];

    const prepared = prepareData(rawData, {
      requiredFields,
      limit: this.recordLimit || CHART_LIMITS.SLOPE
    });

    if (!prepared.valid) {
      throw new Error(prepared.error);
    }

    this.processSlopeData(prepared.data);

    if (this.chartData.length === 0) {
      throw new Error("No data after processing");
    }
  }

  /**
   * Parses raw records into per-entity before/after pairs. Records with a
   * missing label or non-numeric start/end value are dropped (mirrors the
   * time series charts' filter-out-invalid-rows behavior). Slope does not
   * dedupe by groupByField — one line is drawn per record, so callers who
   * want one line per entity must pre-aggregate before passing data in.
   * @param {Array} records - Raw data records
   */
  processSlopeData(records) {
    this.chartData = records
      .map((record) => {
        const label = record[this.groupByField];
        const rawStart = record[this.startValueField];
        const rawEnd = record[this.endValueField];
        // null/undefined/"" coerce to 0 via Number(), which would silently
        // render a missing value as a real slope to zero — reject them
        // before coercion instead of after, so they're dropped as documented.
        if (
          label == null ||
          rawStart == null ||
          rawStart === "" ||
          rawEnd == null ||
          rawEnd === ""
        ) {
          return null;
        }
        const startValue = Number(rawStart);
        const endValue = Number(rawEnd);
        if (isNaN(startValue) || isNaN(endValue)) {
          return null;
        }
        return {
          label: String(label),
          startValue,
          endValue,
          delta: endValue - startValue,
          record
        };
      })
      .filter((d) => d !== null);
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

    // Margins — room for the per-entity labels on both sides and the axis
    // header text above each rail.
    const margin = {
      top: 40,
      right: this.effectiveShowLabels ? 140 : 20,
      bottom: 20,
      left: this.effectiveShowLabels ? 140 : 20
    };

    const width = containerWidth - margin.left - margin.right;
    const height = this.height - margin.top - margin.bottom;

    if (width <= 0 || height <= 0) return;

    const svgRoot = d3
      .select(container)
      .append("svg")
      .attr("width", containerWidth)
      .attr("height", this.height)
      .attr("class", "slope-chart-svg");

    applySvgA11y(svgRoot, {
      title: `Slope chart: ${this.startValueField} to ${this.endValueField} by ${this.groupByField}`,
      desc: `${this.chartData.length} entities`
    });

    this.svg = svgRoot
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Two independent rank-based scalePoint axes: each side positions its
    // dots by that side's own value ranking (highest at top), not a shared
    // linear value scale. This keeps rows evenly spaced and legible even
    // when values cluster, while the connecting line's slope still shows
    // the direction and relative magnitude of change.
    const sortedByStart = [...this.chartData]
      .sort((a, b) => b.startValue - a.startValue)
      .map((d) => d.label);
    const sortedByEnd = [...this.chartData]
      .sort((a, b) => b.endValue - a.endValue)
      .map((d) => d.label);

    const yStart = d3
      .scalePoint()
      .domain(sortedByStart)
      .range([0, height])
      .padding(0.5);
    const yEnd = d3
      .scalePoint()
      .domain(sortedByEnd)
      .range([0, height])
      .padding(0.5);

    const { positive, negative } = getSemanticVariantForTheme(this.theme);
    const colorForDelta = (d) => (d.delta >= 0 ? positive : negative);

    // Vertical guide rails at each side
    this.svg
      .append("line")
      .attr("class", "slope-axis-line slope-axis-line-start")
      .attr("x1", 0)
      .attr("x2", 0)
      .attr("y1", 0)
      .attr("y2", height)
      .attr("stroke", "#dddbda");

    this.svg
      .append("line")
      .attr("class", "slope-axis-line slope-axis-line-end")
      .attr("x1", width)
      .attr("x2", width)
      .attr("y1", 0)
      .attr("y2", height)
      .attr("stroke", "#dddbda");

    // Axis header text — names the field driving each rail
    this.svg
      .append("text")
      .attr("class", "axis-header axis-header-start")
      .attr("x", 0)
      .attr("y", -15)
      .attr("text-anchor", "middle")
      .style("font-size", "12px")
      .attr("fill", "#706e6b")
      .text(this.startValueField);

    this.svg
      .append("text")
      .attr("class", "axis-header axis-header-end")
      .attr("x", width)
      .attr("y", -15)
      .attr("text-anchor", "middle")
      .style("font-size", "12px")
      .attr("fill", "#706e6b")
      .text(this.endValueField);

    // One group per entity: connecting line + two dots (+ labels)
    const entityGroups = this.svg
      .selectAll(".slope-entity")
      .data(this.chartData)
      .enter()
      .append("g")
      .attr("class", "slope-entity")
      .attr("cursor", this.objectApiName ? "pointer" : "default");

    const line = entityGroups
      .append("line")
      .attr("class", "slope-line")
      .attr("x1", 0)
      .attr("x2", width)
      .attr("y1", (d) => yStart(d.label))
      .attr("y2", (d) => yEnd(d.label))
      .attr("stroke", colorForDelta)
      .attr("stroke-width", 2)
      .attr("opacity", 0);

    line.transition().duration(750).attr("opacity", 1);

    entityGroups
      .append("circle")
      .attr("class", "slope-point slope-point-start")
      .attr("cx", 0)
      .attr("cy", (d) => yStart(d.label))
      .attr("r", 4)
      .attr("fill", colorForDelta);

    entityGroups
      .append("circle")
      .attr("class", "slope-point slope-point-end")
      .attr("cx", width)
      .attr("cy", (d) => yEnd(d.label))
      .attr("r", 4)
      .attr("fill", colorForDelta);

    if (this.effectiveShowLabels) {
      entityGroups
        .append("text")
        .attr("class", "slope-label slope-label-start")
        .attr("x", -8)
        .attr("y", (d) => yStart(d.label))
        .attr("dy", "0.32em")
        .attr("text-anchor", "end")
        .style("font-size", "11px")
        .attr("fill", "#3e3e3c")
        .text(
          (d) => `${truncateLabel(d.label, 16)} (${formatNumber(d.startValue)})`
        );

      entityGroups
        .append("text")
        .attr("class", "slope-label slope-label-end")
        .attr("x", width + 8)
        .attr("y", (d) => yEnd(d.label))
        .attr("dy", "0.32em")
        .attr("text-anchor", "start")
        .style("font-size", "11px")
        .attr("fill", "#3e3e3c")
        .text(
          (d) => `${truncateLabel(d.label, 16)} (${formatNumber(d.endValue)})`
        );
    }

    // Tooltip + click interactions on the whole entity group
    entityGroups
      .on("mouseenter", (event, d) => {
        this.showTooltip(event, d);
        d3.select(event.currentTarget)
          .select(".slope-line")
          .transition()
          .duration(100)
          .attr("stroke-width", 4);
      })
      .on("mousemove", (event) => {
        this.moveTooltip(event);
      })
      .on("mouseleave", (event) => {
        this.hideTooltip();
        d3.select(event.currentTarget)
          .select(".slope-line")
          .transition()
          .duration(100)
          .attr("stroke-width", 2);
      })
      .on("click", (event, d) => {
        this.handleSlopeClick(d);
      });
  }

  // ═══════════════════════════════════════════════════════════════
  // TOOLTIP HANDLERS
  // ═══════════════════════════════════════════════════════════════

  showTooltip(event, d) {
    if (!this.tooltip) return;

    const deltaStr = (d.delta >= 0 ? "+" : "") + formatNumber(d.delta);
    const content = `
      <div style="font-weight: bold; margin-bottom: 4px;">${d.label}</div>
      <div>${this.startValueField}: ${formatNumber(d.startValue)}</div>
      <div>${this.endValueField}: ${formatNumber(d.endValue)}</div>
      <div style="font-weight: bold; margin-top: 4px;">${"Δ"} ${deltaStr}</div>
    `;

    this.tooltip.show(content, event.offsetX, event.offsetY);
  }

  // eslint-disable-next-line no-unused-vars
  moveTooltip(event) {
    // Tooltip position is set in show(); kept for interaction symmetry.
  }

  hideTooltip() {
    if (!this.tooltip) return;
    this.tooltip.hide();
  }

  // ═══════════════════════════════════════════════════════════════
  // CLICK HANDLER - DRILL DOWN
  // ═══════════════════════════════════════════════════════════════

  handleSlopeClick(d) {
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
      new CustomEvent("slopeclick", {
        detail: {
          label: d.label,
          startValue: d.startValue,
          endValue: d.endValue,
          delta: d.delta,
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
