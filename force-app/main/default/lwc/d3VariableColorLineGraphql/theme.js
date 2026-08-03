// ABOUTME: Bundle-local color helpers for the d3VariableColorLineGraphql standalone bundle.
// ABOUTME: Provides the default theme and the positive/negative semantic pair that colors the line by threshold.

/**
 * Default theme.
 */
export const DEFAULT_THEME = "Salesforce Standard";

/**
 * Per-palette positive/negative color pair for directional charts. The default
 * theme's pair is the SLDS success-green / error-red used across the library.
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
