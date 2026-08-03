/**
 * ABOUTME: D3 Slope Chart Lightning Web Component.
 * ABOUTME: Displays a before/after comparison per entity as a connecting line between two ranked value axes, with drill-down support.
 */
import { LightningElement, api, track, wire } from "lwc";
import { loadD3 } from "./d3Loader";
import { prepareData, CHART_LIMITS } from "./data";
import { DEFAULT_THEME, getSemanticVariantForTheme } from "./theme";
import {
  formatNumber,
  truncateLabel,
  createTooltip,
  createResizeHandler,
  applySvgA11y
} from "./utils";
import { NavigationMixin } from "lightning/navigation";
import { gql, graphql } from "lightning/graphql";
import { buildRecordQuery, normalizeRecordsGeneric } from "./graphql";

export default class D3SlopeChartGraphql extends NavigationMixin(
  LightningElement
) {
  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API PROPERTIES
  // ═══════════════════════════════════════════════════════════════

  /** Data collection from Flow or parent component */
  @api recordCollection = [];

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

  /**
   * Object to query on the structured self-fetch path (when no records are
   * passed in), and the target of drill-down navigation on line click.
   */
  @api objectApiName = "";

  /** Filter field for drill-down (defaults to Group By Field) */
  @api filterField = "";

  /**
   * Free-text UI API GraphQL document. When non-blank it overrides the
   * structured query builder as the wire's data source; the returned records
   * are shaped client-side into per-entity before/after pairs by
   * groupByField/startValueField/endValueField.
   */
  @api graphqlQuery = "";

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
  /** The .chart-container generation the tooltip and observer are bound to. */
  _observedContainer = null;
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

  /** Per-entity labels next to each dot. Default on; disable via advancedConfig. */
  get effectiveShowLabels() {
    return this.config.showLabels !== false;
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
   * missing. A non-blank graphqlQuery overrides the structured builder. Slope
   * has no server-side aggregate: the structured path fetches raw records for
   * the entity, start, and end fields, then feeds the existing processSlopeData
   * path (same as recordCollection).
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
    if (
      !this.objectApiName ||
      !this.groupByField ||
      !this.startValueField ||
      !this.endValueField
    ) {
      return undefined;
    }
    const fields = [
      ...new Set(
        [this.groupByField, this.startValueField, this.endValueField].filter(
          Boolean
        )
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
          [this.groupByField, this.startValueField, this.endValueField].filter(
            Boolean
          )
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
    // recordCollection is validated, truncated, and shaped into per-entity
    // before/after pairs here. Otherwise the GraphQL wire (structured builder or
    // a free-text graphqlQuery) provides the data reactively and there is
    // nothing to fetch synchronously.
    if (this.recordCollection && this.recordCollection.length > 0) {
      const requiredFields = [
        this.groupByField,
        this.startValueField,
        this.endValueField
      ];

      const prepared = prepareData([...this.recordCollection], {
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
   * Renders the chart, surfacing any exception to the component error state so
   * a mid-render failure never leaves a silent partial render.
   * @param {Number} containerWidth - Measured container width in pixels
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
