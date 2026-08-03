// ABOUTME: Bundle-local chart utilities for the d3HorizontalBarChartGraphql standalone bundle.
// ABOUTME: Number formatting, label truncation, tooltip, resize, and SVG a11y helpers.

// ===== NUMBER FORMATTERS =====

/**
 * Formats a number for display (K, M, B suffixes).
 * @param {Number} value - Number to format
 * @param {Number} decimals - Decimal places (default: 1)
 * @returns {String} - Formatted string
 */
export const formatNumber = (value, decimals = 1) => {
  if (value === null || value === undefined || isNaN(value)) {
    return "0";
  }

  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (absValue >= 1e9) {
    return sign + (absValue / 1e9).toFixed(decimals).replace(/\.0+$/, "") + "B";
  }
  if (absValue >= 1e6) {
    return sign + (absValue / 1e6).toFixed(decimals).replace(/\.0+$/, "") + "M";
  }
  if (absValue >= 1e3) {
    return sign + (absValue / 1e3).toFixed(decimals).replace(/\.0+$/, "") + "K";
  }

  return sign + absValue.toFixed(decimals).replace(/\.0+$/, "");
};

/**
 * Truncates a label to max length with ellipsis.
 * @param {String} label - Label to truncate
 * @param {Number} maxLength - Maximum characters
 * @returns {String} - Truncated label
 */
export const truncateLabel = (label, maxLength = 20) => {
  if (!label) return "";
  const str = String(label);
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + "...";
};

// ===== TOOLTIP UTILITIES =====

/**
 * Creates SLDS-styled tooltip element.
 * @param {HTMLElement} container - Parent container for tooltip
 * @returns {Object} - Tooltip controller { show, hide, destroy, element }
 */
export const createTooltip = (container) => {
  // Create tooltip div with SLDS styling
  const tooltip = document.createElement("div");
  tooltip.className = "slds-popover slds-popover_tooltip slds-nubbin_bottom";
  tooltip.setAttribute("role", "tooltip");
  tooltip.style.cssText = `
        position: absolute;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s ease-in-out;
        z-index: 9999;
        max-width: 300px;
        background: #16325c;
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;

  const body = document.createElement("div");
  body.className = "slds-popover__body";
  tooltip.appendChild(body);

  container.appendChild(tooltip);

  return {
    element: tooltip,

    /**
     * Shows tooltip with content at position.
     * @param {String} content - HTML content
     * @param {Number} x - X position
     * @param {Number} y - Y position
     */
    show(content, x, y) {
      // eslint-disable-next-line @lwc/lwc/no-inner-html
      body.innerHTML = content;
      tooltip.style.opacity = "1";

      // Position tooltip above the point
      const rect = tooltip.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      let left = x - rect.width / 2;
      let top = y - rect.height - 10;

      // Keep within container bounds
      left = Math.max(0, Math.min(left, containerRect.width - rect.width));
      top = Math.max(0, top);

      tooltip.style.left = left + "px";
      tooltip.style.top = top + "px";
    },

    /**
     * Hides the tooltip.
     */
    hide() {
      tooltip.style.opacity = "0";
    },

    /**
     * Removes tooltip from DOM.
     */
    destroy() {
      if (tooltip.parentNode) {
        tooltip.parentNode.removeChild(tooltip);
      }
    }
  };
};

/**
 * Builds tooltip content HTML.
 * @param {String} label - Primary label
 * @param {String|Number} value - Value to display
 * @param {Object} options - { formatter: Function, prefix: String, suffix: String }
 * @returns {String} - HTML string
 */
export const buildTooltipContent = (label, value, options = {}) => {
  const { formatter = formatNumber, prefix = "", suffix = "" } = options;
  const formattedValue = formatter ? formatter(value) : value;

  return `
        <div style="font-weight: bold; margin-bottom: 4px;">${label}</div>
        <div>${prefix}${formattedValue}${suffix}</div>
    `;
};

// ===== RESIZE UTILITIES =====

/**
 * Creates a debounced resize observer for a container.
 * @param {HTMLElement} container - Element to observe
 * @param {Function} callback - Called with { width, height } on resize
 * @param {Number} debounceMs - Debounce delay (default: 250)
 * @returns {Object} - { observe, disconnect }
 */
export const createResizeHandler = (container, callback, debounceMs = 250) => {
  let timeoutId = null;
  let observer = null;

  const debouncedCallback = (entries) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // eslint-disable-next-line @lwc/lwc/no-async-operation
    timeoutId = setTimeout(() => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        callback({ width, height });
      }
    }, debounceMs);
  };

  return {
    /**
     * Starts observing the container.
     */
    observe() {
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(debouncedCallback);
        observer.observe(container);
      } else {
        // Fallback: just call once with current size
        const rect = container.getBoundingClientRect();
        callback({ width: rect.width, height: rect.height });
      }
    },

    /**
     * Stops observing and cleans up.
     */
    disconnect() {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }
  };
};

// ===== ACCESSIBILITY UTILITIES =====

/**
 * Applies SVG accessibility attributes and child nodes to a chart's root svg.
 * Sets role="img" + aria-label, and prepends <title>/<desc> nodes so the final
 * child order is <title>, <desc>. Dependency-free: operates only on the passed
 * d3 selection (no chart-specific knowledge).
 * @param {Object} svgSelection - d3 selection of the root svg
 * @param {Object} options - { title: String, desc: String }
 * @returns {void}
 */
export const applySvgA11y = (svgSelection, { title, desc } = {}) => {
  if (!svgSelection) return;

  svgSelection.attr("role", "img");
  if (title) {
    svgSelection.attr("aria-label", title);
  }

  // Insert <desc> first, then <title>, so the final child order is
  // <title>, <desc> (each insert goes before the current first child).
  if (desc) {
    svgSelection.insert("desc", ":first-child").text(desc);
  }
  if (title) {
    svgSelection.insert("title", ":first-child").text(title);
  }
};
