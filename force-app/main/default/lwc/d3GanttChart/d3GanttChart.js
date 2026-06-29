/**
 * ABOUTME: D3 Gantt Chart Lightning Web Component.
 * ABOUTME: Renders date-range tasks as horizontal bars on a time axis with an optional today marker.
 */
import { LightningElement, api, track } from "lwc";
import { loadD3 } from "c/d3Lib";
import { getColors, DEFAULT_THEME } from "c/themeService";
import {
  formatNumber,
  truncateLabel,
  createTooltip,
  createResizeHandler,
  createLayoutRetry,
  parseDate,
  computeDateExtent
} from "c/chartUtils";
import { NavigationMixin } from "lightning/navigation";
import executeQuery from "@salesforce/apex/D3ChartController.executeQuery";
import getDateRangeData from "@salesforce/apex/D3ChartController.getDateRangeData";

export default class D3GanttChart extends NavigationMixin(LightningElement) {
  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API PROPERTIES
  // ═══════════════════════════════════════════════════════════════

  /** Data collection from Flow or parent component */
  @api recordCollection = [];

  /** SOQL query string (used if recordCollection is empty and no object set) */
  @api soqlQuery =
    "SELECT Name, Project_Start__c, Project_End__c FROM Opportunity";

  /** Field holding the task label (category / row) */
  @api labelField = "Name";

  /** Field holding the task start date */
  @api startDateField = "Project_Start__c";

  /** Field holding the task end date */
  @api endDateField = "Project_End__c";

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

  /** Filter field for drill-down */
  @api filterField = "";

  /** Optional WHERE clause fragment for server-side fetch */
  @api filterClause = "";

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

  // ═══════════════════════════════════════════════════════════════
  // LIFECYCLE HOOKS
  // ═══════════════════════════════════════════════════════════════

  async connectedCallback() {
    try {
      this.d3 = await loadD3(this);
      await this.loadData();
    } catch (e) {
      this.error = e.message || "Failed to initialize chart";
      console.error("D3GanttChart initialization error:", e);
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
    // Priority 1: recordCollection (client-side date parsing)
    if (this.recordCollection && this.recordCollection.length > 0) {
      this.chartData = this._prepareDateRows([...this.recordCollection]);
      if (this.chartData.length === 0) {
        throw new Error("No tasks with valid start and end dates");
      }
      return;
    }

    // Priority 2: server date-range fetch
    if (
      this.objectApiName &&
      this.labelField &&
      this.startDateField &&
      this.endDateField
    ) {
      let result = [];
      try {
        result = await getDateRangeData({
          objectName: this.objectApiName,
          labelField: this.labelField,
          startField: this.startDateField,
          endField: this.endDateField,
          filterClause: this.filterClause || null
        });
      } catch (e) {
        throw new Error(`Date Range Error: ${e.body?.message || e.message}`);
      }
      // Server returns [{label, start, end}] with ISO date strings
      this.chartData = this._prepareDateRows(result);
      if (this.chartData.length === 0) {
        throw new Error("No tasks with valid start and end dates");
      }
      return;
    }

    // Priority 3: SOQL fallback with client-side date parsing
    if (this.soqlQuery) {
      let rawData = [];
      try {
        rawData = await executeQuery({ queryString: this.soqlQuery });
      } catch (e) {
        throw new Error(`SOQL Error: ${e.body?.message || e.message}`);
      }
      const mapped = rawData.map((row) => ({
        label: row[this.labelField],
        start: row[this.startDateField],
        end: row[this.endDateField]
      }));
      this.chartData = this._prepareDateRows(mapped);
      if (this.chartData.length === 0) {
        throw new Error("No tasks with valid start and end dates");
      }
      return;
    }

    throw new Error(
      "No data source provided. Set recordCollection or soqlQuery."
    );
  }

  /**
   * Normalizes rows into {label, start: Date, end: Date}, dropping rows
   * whose start or end date cannot be parsed.
   */
  _prepareDateRows(rows) {
    const limit = this.recordLimit || 2000;
    return rows
      .slice(0, limit)
      .map((row) => ({
        label: row.label,
        start: parseDate(row.start),
        end: parseDate(row.end)
      }))
      .filter((row) => row.start !== null && row.end !== null);
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

    // Clear existing SVG (idempotent across init + resize)
    d3.select(container).select("svg").remove();

    const margin = { top: 20, right: 20, bottom: 40, left: 180 };
    const width = containerWidth - margin.left - margin.right;
    const height = this.height - margin.top - margin.bottom;

    if (width <= 0 || height <= 0) return;

    this.svg = d3
      .select(container)
      .append("svg")
      .attr("width", containerWidth)
      .attr("height", this.height)
      .attr("class", "gantt-chart-svg")
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // X: time scale over the full task date extent
    const extent = computeDateExtent(this.chartData, "start", "end");
    const xScale = d3.scaleTime().domain(extent).range([0, width]).nice();

    // Y: band scale over task labels
    const yScale = d3
      .scaleBand()
      .domain(this.chartData.map((d) => d.label))
      .range([0, height])
      .padding(0.2);

    const colors = getColors(
      this.theme,
      this.chartData.length,
      this.config.customColors
    );

    // X Axis
    this.svg
      .append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(xScale).ticks(6));

    // Y Axis
    this.svg
      .append("g")
      .attr("class", "y-axis")
      .call(d3.axisLeft(yScale).tickFormat((d) => truncateLabel(d, 22)));

    // Task bars
    const bars = this.svg
      .selectAll(".task")
      .data(this.chartData)
      .enter()
      .append("rect")
      .attr("class", "task")
      .attr("x", (d) => xScale(d.start))
      .attr("y", (d) => yScale(d.label))
      .attr("width", (d) => Math.max(0, xScale(d.end) - xScale(d.start)))
      .attr("height", yScale.bandwidth())
      .attr("fill", (d, i) => colors[i])
      .attr("rx", 2)
      .attr("cursor", this.objectApiName ? "pointer" : "default");

    // Tooltip interactions
    bars
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
        this.handleTaskClick(d);
      });

    // Optional today marker — driven by config.today for deterministic tests
    if (this.config.today) {
      const todayDate = parseDate(this.config.today);
      if (todayDate) {
        this.svg
          .append("line")
          .attr("class", "today-line")
          .attr("x1", xScale(todayDate))
          .attr("x2", xScale(todayDate))
          .attr("y1", 0)
          .attr("y2", height)
          .attr("stroke", "#FF5D5D")
          .attr("stroke-width", 2)
          .attr("stroke-dasharray", "4,4");
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // TOOLTIP HANDLERS
  // ═══════════════════════════════════════════════════════════════

  showTooltip(event, d) {
    if (!this.tooltip) return;
    const startStr = d.start.toISOString().slice(0, 10);
    const endStr = d.end.toISOString().slice(0, 10);
    const durationDays = Math.round(
      (d.end.getTime() - d.start.getTime()) / 86400000
    );
    const content = `<strong>${d.label}</strong><br/>${startStr} → ${endStr}<br/>${formatNumber(
      durationDays
    )} days`;
    this.tooltip.show(content, event.offsetX, event.offsetY);
  }

  // eslint-disable-next-line no-unused-vars
  moveTooltip(event) {
    // Positioning handled in show()
  }

  hideTooltip() {
    if (!this.tooltip) return;
    this.tooltip.hide();
  }

  // ═══════════════════════════════════════════════════════════════
  // CLICK HANDLER - DRILL DOWN
  // ═══════════════════════════════════════════════════════════════

  handleTaskClick(d) {
    if (!this.objectApiName) return;

    const filterFieldName = this.filterField || this.labelField;

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
      new CustomEvent("taskclick", {
        detail: {
          label: d.label,
          start: d.start,
          end: d.end,
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
