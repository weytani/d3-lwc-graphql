// ABOUTME: Bundle-local theme colors for the d3DivergingBarChartGraphql standalone bundle.
// ABOUTME: Resolves a theme name to the positive/negative semantic color pair the diverging bars use.

/**
 * Default theme.
 */
const DEFAULT_THEME = "Salesforce Standard";

/**
 * Semantic colors for charts with directional meaning.
 */
const SEMANTIC_COLORS = {
  positive: "#4BCA81",
  negative: "#FF5D5D"
};

/**
 * Per-palette positive/negative color pair for directional charts. The default
 * theme returns the SEMANTIC_COLORS positive/negative values byte-for-byte.
 */
const SEMANTIC_VARIANTS = {
  "Salesforce Standard": {
    positive: SEMANTIC_COLORS.positive,
    negative: SEMANTIC_COLORS.negative
  },
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
