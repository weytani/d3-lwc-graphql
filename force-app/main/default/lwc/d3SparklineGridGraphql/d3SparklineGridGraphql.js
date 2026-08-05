// ABOUTME: D3 Sparkline Grid Lightning Web Component.
// ABOUTME: Displays small multiples inline mini-charts for entity comparison with monthly aggregation.
import { LightningElement, api, track, wire } from "lwc";
import { loadD3 } from "./d3Loader";
import { prepareData, OPERATIONS, CHART_LIMITS } from "./data";
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
import { buildRecordQuery, normalizeRecordsGeneric } from "./graphql";

export default class D3SparklineGridGraphql extends NavigationMixin(
  LightningElement
) {
  // ===============================================================
  // PUBLIC API PROPERTIES
  // ===============================================================

  /** Data collection from Flow or parent component */
  @api recordCollection = [];

  /** Field to group entities by (e.g., Type, Owner) */
  @api entityField = "";

  /** Time field for x-axis */
  @api dateField = "CloseDate";

  /** Numeric field for values */
  @api valueField = "Amount";

  /** Aggregation operation: Sum, Count, Average */
  @api operation = OPERATIONS.SUM;

  /** Chart height in pixels */
  @api height = 400;

  /** Color theme */
  @api theme = DEFAULT_THEME;

  /** Advanced configuration JSON */
  @api advancedConfig = "{}";

  /** Object API name for drill-down navigation and structured GraphQL query building */
  @api objectApiName = "";

  /** Filter field for drill-down (defaults to entityField) */
  @api filterField = "";

  /** Maximum records to process (overrides default limit) */
  @api recordLimit;

  /**
   * Free-text UI API GraphQL document. When non-blank it overrides the
   * structured record-query builder as the wire's data source; the returned
   * records are grouped by entityField and bucketed by month client-side.
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

  // ===============================================================
  // TRACKED STATE
  // ===============================================================

  @track isLoading = true;
  @track error = null;
  @track entityData = [];
  // ===============================================================
  // PRIVATE PROPERTIES
  // ===============================================================

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

  // ===============================================================
  // GETTERS
  // ===============================================================

  get containerStyle() {
    return `height: ${this.height}px;`;
  }

  get hasError() {
    return !!this.error;
  }

  get hasData() {
    return this.entityData && this.entityData.length > 0;
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

  // ===============================================================
  // GRAPHQL SELF-FETCH PATH
  // ===============================================================

  /** True when an admin has supplied a non-blank free-text GraphQL document. */
  get hasFreeTextQuery() {
    return !!(this.graphqlQuery && this.graphqlQuery.trim());
  }

  /**
   * Reactive GraphQL query for the self-fetch path. Returns undefined (so the
   * wire is skipped) when recordCollection is the source or required config is
   * missing. The grid has no server-side aggregate: the structured path fetches
   * raw records (entityField, dateField, and, when set, valueField), and a
   * non-blank graphqlQuery overrides it with the admin's document. Both feed the
   * same per-entity monthly bucketing (processEntityData).
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
    // Structured builder path: raw record query (no server-side aggregate).
    if (!this.objectApiName || !this.entityField || !this.dateField) {
      return undefined;
    }
    const fields = [
      ...new Set(
        [this.entityField, this.dateField, this.valueField].filter(Boolean)
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
          [this.entityField, this.dateField, this.valueField].filter(Boolean)
        )
      ];
      const records = normalizeRecordsGeneric(data, {
        objectApiName: this.objectApiName,
        fields
      });
      if (!records.length) {
        // No rows normalized. On the free-text path the pasted document must be
        // a UI API record query (uiapi.query); otherwise it is simply no data.
        this.error = this.hasFreeTextQuery
          ? "The GraphQL Query returned no records. It must be a UI API record query (uiapi.query)."
          : "No data after processing";
        this.isLoading = false;
        return;
      }
      this._processRawData(records);
      this.error = null;
      this.chartRendered = false; // force renderedCallback to re-initialize the SVG
    } catch (e) {
      this.error = e.message;
    }
    this.isLoading = false;
  }

  _formatGqlErrors(errors) {
    const list = Array.isArray(errors) ? errors : [errors];
    return list.map((e) => e?.message || e).join("; ") || "GraphQL error";
  }

  // ===============================================================
  // LIFECYCLE HOOKS
  // ===============================================================

  async connectedCallback() {
    try {
      this.d3 = await loadD3(this);
      await this.loadData();
    } catch (e) {
      this.error = e.message || "Failed to initialize chart";
      console.error("D3SparklineGridGraphql initialization error:", e);
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
      // initializeChart installs a ResizeObserver that draws the grid
      // on the first measurable width and re-draws on resize — so it is safe to
      // mark initialization done even if the container is not measurable yet.
      this.chartRendered = this.initializeChart();
    }
  }

  disconnectedCallback() {
    this.cleanup();
  }

  // ===============================================================
  // DATA LOADING
  // ===============================================================

  async loadData() {
    // recordCollection is grouped + bucketed client-side here. Otherwise the
    // GraphQL wire (structured builder or a free-text graphqlQuery) provides the
    // data reactively and there is nothing to fetch synchronously.
    if (this.recordCollection && this.recordCollection.length > 0) {
      this._processRawData([...this.recordCollection]);
    }
  }

  /**
   * Validates and truncates raw records, then groups them into per-entity
   * sparkline series. Shared by the recordCollection path and the GraphQL
   * structured / free-text paths.
   */
  _processRawData(rawData) {
    const requiredFields = [this.entityField, this.dateField];
    if (this.operation !== OPERATIONS.COUNT) {
      requiredFields.push(this.valueField);
    }

    const prepared = prepareData(rawData, {
      requiredFields,
      limit: this.recordLimit || CHART_LIMITS.SPARKLINE_GRID
    });

    if (!prepared.valid) {
      throw new Error(prepared.error);
    }

    // Process into entity-grouped sparkline data
    this.processEntityData(prepared.data);

    if (this.entityData.length === 0) {
      throw new Error("No data after processing");
    }
  }

  /**
   * Groups records by entityField, buckets by month, and aggregates values.
   * Result: [{ entity, currentValue, sparklineData: [{date, value}] }]
   */
  processEntityData(data) {
    // Group by entity
    const entityMap = new Map();

    data.forEach((record) => {
      const entityKey = String(record[this.entityField] ?? "Null");
      if (!entityMap.has(entityKey)) {
        entityMap.set(entityKey, []);
      }
      entityMap.get(entityKey).push(record);
    });

    // For each entity, bucket by month and aggregate
    this.entityData = [];
    entityMap.forEach((records, entity) => {
      const monthBuckets = new Map();

      records.forEach((record) => {
        const dateVal = record[this.dateField];
        if (!dateVal) return;

        const date = new Date(dateVal);
        if (isNaN(date.getTime())) return;

        // Bucket key: YYYY-MM. UTC getters, not local: a date-only field
        // (e.g. CloseDate) arrives as "2024-01-01" and is parsed as UTC
        // midnight per the ECMAScript date-string spec. Reading it back with
        // local getters rolls it back a calendar day in any negative-UTC-offset
        // timezone (all of the Americas), silently bucketing the 1st of the
        // month into the previous month and corrupting the sum.
        const bucketKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

        if (!monthBuckets.has(bucketKey)) {
          monthBuckets.set(bucketKey, { sum: 0, count: 0 });
        }
        const bucket = monthBuckets.get(bucketKey);
        bucket.count += 1;
        if (this.valueField && record[this.valueField] != null) {
          bucket.sum += Number(record[this.valueField]) || 0;
        }
      });

      // Convert buckets to sorted sparkline data
      const sparklineData = [];
      monthBuckets.forEach((bucket, bucketKey) => {
        let value;
        switch (this.operation) {
          case OPERATIONS.SUM:
            value = bucket.sum;
            break;
          case OPERATIONS.COUNT:
            value = bucket.count;
            break;
          case OPERATIONS.AVERAGE:
            value = bucket.count > 0 ? bucket.sum / bucket.count : 0;
            break;
          default:
            value = bucket.count;
        }

        // Parse bucket key back to date (first day of month), in UTC to match
        // the UTC bucket key above — a local-time reconstruction here would
        // reintroduce the same off-by-one-day/month drift downstream.
        const [year, month] = bucketKey.split("-").map(Number);
        const date = new Date(Date.UTC(year, month - 1, 1));

        sparklineData.push({ date, value });
      });

      // Sort by date ascending
      sparklineData.sort((a, b) => a.date - b.date);

      // Current value = last data point
      const currentValue =
        sparklineData.length > 0
          ? sparklineData[sparklineData.length - 1].value
          : 0;

      this.entityData.push({ entity, currentValue, sparklineData });
    });

    // Sort entities by currentValue descending
    this.entityData.sort((a, b) => b.currentValue - a.currentValue);
  }

  // ===============================================================
  // CHART RENDERING
  // ===============================================================

  /**
   * Initializes the tooltip and a single ResizeObserver per container
   * generation, then attempts an immediate render. The observer drives both the
   * first render (whenever the container becomes measurable — there is no fixed
   * give-up window) and every subsequent resize, so a container that is
   * unmeasurable or narrower than the grid's horizontal chrome at boot still
   * renders the moment it gains usable width.
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
   * Renders the grid, surfacing any unexpected exception to the component error
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

    // Layout constants
    const labelWidth = 120;
    const valueWidth = 80;
    const sparkWidth = containerWidth - labelWidth - valueWidth - 40;
    const rowHeight = 40;
    const sparkHeight = 30;
    const sparkPadding = 5;
    const totalHeight = Math.max(
      this.height,
      this.entityData.length * rowHeight + 20
    );

    if (sparkWidth <= 0) return;

    // Colors
    const colors = getColors(
      this.theme,
      this.entityData.length,
      this.config.customColors
    );

    // Create SVG
    const svg = d3
      .select(container)
      .append("svg")
      .attr("width", containerWidth)
      .attr("height", totalHeight)
      .attr("class", "sparkline-grid-svg");

    applySvgA11y(svg, {
      title: `Sparkline grid: ${this.entityData.length} entities`,
      desc: `${this.operation} of ${this.valueField} by ${this.dateField}, grouped by ${this.entityField}`
    });

    this.svg = svg;

    // Render each entity row
    this.entityData.forEach((entityItem, i) => {
      const rowG = svg
        .append("g")
        .attr("class", "entity-row")
        .attr("transform", `translate(0, ${i * rowHeight + 10})`)
        .attr("cursor", this.objectApiName ? "pointer" : "default")
        .on("click", () => {
          this.handleRowClick(entityItem);
        });

      const color = colors[i];

      // Entity label (left)
      rowG
        .append("text")
        .attr("class", "entity-label")
        .attr("x", 10)
        .attr("y", rowHeight / 2 + 4)
        .attr("fill", "#706e6b")
        .text(truncateLabel(entityItem.entity, 15));

      // Sparkline mini chart (center)
      const sparkG = rowG
        .append("g")
        .attr("class", "sparkline-container")
        .attr("transform", `translate(${labelWidth}, ${sparkPadding})`);

      this.renderSparkline(
        d3,
        sparkG,
        entityItem.sparklineData,
        sparkWidth,
        sparkHeight,
        color,
        entityItem.entity
      );

      // Current value (right)
      rowG
        .append("text")
        .attr("class", "entity-value")
        .attr("x", labelWidth + sparkWidth + 15)
        .attr("y", rowHeight / 2 + 4)
        .attr("fill", "#3e3e3c")
        .text(formatNumber(entityItem.currentValue));
    });
  }

  /**
   * Renders a single sparkline within a group element.
   */
  renderSparkline(d3, group, sparklineData, width, height, color, entityName) {
    if (!sparklineData || sparklineData.length === 0) return;

    const sparkType = this.config.sparkType || "line";

    // X scale
    const xExtent = d3.extent(sparklineData, (d) => d.date);

    // Y scale
    const yMax = d3.max(sparklineData, (d) => d.value) || 0;
    const yMin = d3.min(sparklineData, (d) => d.value) || 0;

    if (sparkType === "bar") {
      this.renderBarSparkline(
        d3,
        group,
        sparklineData,
        width,
        height,
        color,
        entityName
      );
    } else {
      this.renderLineSparkline(
        d3,
        group,
        sparklineData,
        width,
        height,
        color,
        xExtent,
        yMax,
        yMin,
        sparkType,
        entityName
      );
    }

    // Reference line (optional)
    if (this.config.referenceLine === "average") {
      const avgValue = d3.mean(sparklineData, (d) => d.value);
      const yScale = d3
        .scaleLinear()
        .domain([Math.min(0, yMin), yMax || 1])
        .range([height, 0]);

      group
        .append("line")
        .attr("class", "reference-line")
        .attr("x1", 0)
        .attr("x2", width)
        .attr("y1", yScale(avgValue))
        .attr("y2", yScale(avgValue))
        .attr("stroke", "#999")
        .attr("stroke-dasharray", "2,2")
        .attr("stroke-width", 1)
        .attr("opacity", 0.6);
    }
  }

  /**
   * Renders a line/area type sparkline.
   */
  renderLineSparkline(
    d3,
    group,
    sparklineData,
    width,
    height,
    color,
    xExtent,
    yMax,
    yMin,
    sparkType,
    entityName
  ) {
    const xScale = d3.scaleTime().domain(xExtent).range([0, width]);

    const yScale = d3
      .scaleLinear()
      .domain([Math.min(0, yMin), yMax || 1])
      .range([height, 0]);

    // Line generator
    const lineGen = d3
      .line()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.value));

    // Area fill below the line
    const areaGen = d3
      .area()
      .x((d) => xScale(d.date))
      .y0(height)
      .y1((d) => yScale(d.value));

    // Draw area fill
    group
      .append("path")
      .datum(sparklineData)
      .attr("class", "sparkline-area")
      .attr("d", areaGen)
      .attr("fill", color)
      .attr("fill-opacity", 0.1)
      .attr("stroke", "none");

    // Draw line
    group
      .append("path")
      .datum(sparklineData)
      .attr("class", "sparkline-line")
      .attr("d", lineGen)
      .attr("fill", "none")
      .attr("stroke", color)
      .attr("stroke-width", 1.5);

    // Hoverable point markers (transparent until hover) — this is what makes
    // the tooltip allocated in initializeChart actually get shown.
    group
      .selectAll(".sparkline-point")
      .data(sparklineData)
      .enter()
      .append("circle")
      .attr("class", "sparkline-point")
      .attr("cx", (d) => xScale(d.date))
      .attr("cy", (d) => yScale(d.value))
      .attr("r", 3)
      .attr("fill", color)
      .attr("opacity", 0)
      .on("mouseenter", (event, d) => {
        this._showPointTooltip(event, entityName, d);
        d3.select(event.currentTarget).attr("opacity", 1);
      })
      .on("mouseleave", (event) => {
        this._hideTooltip();
        d3.select(event.currentTarget).attr("opacity", 0);
      });
  }

  /**
   * Renders a bar type sparkline using scaleBand.
   */
  renderBarSparkline(
    d3,
    group,
    sparklineData,
    width,
    height,
    color,
    entityName
  ) {
    const xScale = d3
      .scaleBand()
      .domain(sparklineData.map((d) => d.date))
      .range([0, width])
      .padding(0.1);

    const yMax = d3.max(sparklineData, (d) => d.value) || 1;
    const yMin = d3.min(sparklineData, (d) => d.value) || 0;

    const yScale = d3
      .scaleLinear()
      .domain([Math.min(0, yMin), yMax])
      .range([height, 0]);

    // Draw bars
    group
      .selectAll(".sparkline-bar")
      .data(sparklineData)
      .enter()
      .append("rect")
      .attr("class", "sparkline-bar")
      .attr("x", (d) => xScale(d.date))
      .attr("width", xScale.bandwidth())
      .attr("y", (d) => yScale(d.value))
      .attr("height", (d) => height - yScale(d.value))
      .attr("fill", color)
      .attr("opacity", 0.7)
      .on("mouseenter", (event, d) => {
        this._showPointTooltip(event, entityName, d);
        d3.select(event.currentTarget).attr("opacity", 1);
      })
      .on("mouseleave", (event) => {
        this._hideTooltip();
        d3.select(event.currentTarget).attr("opacity", 0.7);
      });
  }

  // ===============================================================
  // TOOLTIP HANDLERS
  // ===============================================================

  _showPointTooltip(event, entityName, d) {
    if (!this.tooltip) return;

    // timeZone: "UTC" matches the UTC bucket date built in processEntityData —
    // formatting it in the host's local zone would re-shift the displayed
    // month back by a day in negative-UTC-offset timezones.
    const monthLabel = d.date.toLocaleString("default", {
      month: "short",
      year: "numeric",
      timeZone: "UTC"
    });
    const content = buildTooltipContent(entityName, d.value, {
      prefix: `${monthLabel}: `
    });

    this.tooltip.show(content, event.offsetX, event.offsetY);
  }

  _hideTooltip() {
    if (!this.tooltip) return;
    this.tooltip.hide();
  }

  // ===============================================================
  // CLICK HANDLER - DRILL DOWN
  // ===============================================================

  handleRowClick(entityItem) {
    if (!this.objectApiName) return;

    const filterFieldName = this.filterField || this.entityField;

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
      new CustomEvent("rowclick", {
        detail: {
          entity: entityItem.entity,
          value: entityItem.currentValue,
          filterField: filterFieldName
        },
        bubbles: true,
        composed: true
      })
    );
  }

  // ===============================================================
  // CLEANUP
  // ===============================================================

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
