// ABOUTME: Bundle-local color palettes and helpers for the d3DifferenceChartGraphql standalone bundle.
// ABOUTME: SLDS-aligned palettes for the two series lines plus the positive/negative pair for the difference fills.

/**
 * Predefined color palettes.
 * 'Salesforce Standard' uses SLDS chart colors.
 */
export const PALETTES = {
  "Salesforce Standard": [
    "#1589EE", // Brand Blue
    "#FF9E2C", // Warning Orange
    "#4BCA81", // Success Green
    "#FF5D5D", // Error Red
    "#AD7BFF", // Purple
    "#FF84C6", // Pink
    "#00C6CD", // Cyan
    "#B8E986", // Lime
    "#FFD86E", // Yellow
    "#A4C7F1" // Light Blue
  ],
  Warm: [
    "#FF6B6B",
    "#FF8E72",
    "#FFB677",
    "#FFD93D",
    "#F9844A",
    "#F3722C",
    "#F94144",
    "#E63946",
    "#D62839",
    "#BA1B1D"
  ],
  Cool: [
    "#4361EE",
    "#3A0CA3",
    "#7209B7",
    "#560BAD",
    "#480CA8",
    "#3F37C9",
    "#4895EF",
    "#4CC9F0",
    "#00B4D8",
    "#0077B6"
  ],
  Vibrant: [
    "#FF595E",
    "#FFCA3A",
    "#8AC926",
    "#1982C4",
    "#6A4C93",
    "#FF85A1",
    "#FFD166",
    "#06D6A0",
    "#118AB2",
    "#9B5DE5"
  ]
};

/**
 * Default theme.
 */
export const DEFAULT_THEME = "Salesforce Standard";

/**
 * Per-palette positive/negative color pair for directional charts. The
 * difference chart uses it for the two clipped fills: positive shades the
 * region where the primary series runs above the secondary, negative the
 * region where it runs below.
 */
const SEMANTIC_VARIANTS = {
  "Salesforce Standard": { positive: "#4BCA81", negative: "#FF5D5D" },
  Warm: { positive: "#FFD93D", negative: "#F94144" },
  Cool: { positive: "#4CC9F0", negative: "#3A0CA3" },
  Vibrant: { positive: "#8AC926", negative: "#FF595E" }
};

/**
 * Resolves a theme name to its positive/negative semantic color pair.
 * Unknown or undefined themes fall back to the default theme's pair.
 * @param {String} theme - Theme name
 * @returns {{positive:String, negative:String}}
 */
export const getSemanticVariantForTheme = (theme) =>
  SEMANTIC_VARIANTS[theme] || SEMANTIC_VARIANTS[DEFAULT_THEME];

/**
 * Extends or truncates a color array to match count.
 * If count > colors.length, cycles through colors.
 * @param {Array} colors - Base color array
 * @param {Number} count - Desired count
 * @returns {Array} - Color array of exact length
 */
const extendColors = (colors, count) => {
  if (count <= 0) return [];
  if (count <= colors.length) return colors.slice(0, count);

  // Cycle through colors to fill count
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(colors[i % colors.length]);
  }
  return result;
};

/**
 * Gets color array for a dataset.
 * @param {String} theme - Theme name (falls back to default)
 * @param {Number} count - Number of colors needed
 * @param {Array} customColors - Optional custom color override
 * @returns {Array} - Array of hex color strings
 */
export const getColors = (theme, count, customColors = null) => {
  // Use custom colors if provided
  if (customColors && Array.isArray(customColors) && customColors.length > 0) {
    return extendColors(customColors, count);
  }

  // Get palette for theme
  const palette = PALETTES[theme] || PALETTES[DEFAULT_THEME];
  return extendColors(palette, count);
};
