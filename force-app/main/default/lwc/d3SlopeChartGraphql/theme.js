// ABOUTME: Bundle-local color theming for the d3SlopeChartGraphql standalone bundle.
// ABOUTME: Resolves a theme name to the positive/negative pair that colors each entity's delta.

/**
 * Default theme.
 */
export const DEFAULT_THEME = "Salesforce Standard";

/**
 * Per-palette positive/negative color pair for directional charts. The slope
 * chart colors each connecting line by the sign of its delta rather than by a
 * categorical palette, so only this pair is needed. The default theme's values
 * are the SLDS success green and error red.
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
