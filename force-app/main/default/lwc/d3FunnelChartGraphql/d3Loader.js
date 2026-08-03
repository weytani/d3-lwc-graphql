// ABOUTME: Bundle-local D3.js loader for the d3FunnelChartGraphql standalone bundle.
// ABOUTME: Singleton load from the `d3` static resource with a fetch+eval CSP fallback.
import { loadScript } from "lightning/platformResourceLoader";
import D3_RESOURCE from "@salesforce/resourceUrl/d3";

let d3Instance = null;
let loadPromise = null;

// CDN URL matching the version deployed as a static resource.
// Used only as a fallback when loadScript fails (e.g., local dev preview CSP restrictions).
const D3_CDN_URL = "https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js";

/**
 * Fetches D3 source as text and evaluates it in global scope.
 * Handles environments where loadScript fails due to CSP (e.g., local dev preview)
 * because CSP allows fetch (connect-src) and eval (unsafe-eval) but blocks
 * cross-origin script tags (script-src) on the Visualforce session redirect.
 * Falls back to CDN when the static resource URL also fails (CORS on redirect).
 * @returns {Promise<Object>} - The d3 library object
 */
const loadD3ViaFetch = async () => {
  const urls = [D3_RESOURCE, D3_CDN_URL];
  for (const url of urls) {
    try {
      const response = await fetch(url); // eslint-disable-line no-await-in-loop
      if (!response.ok) continue;
      const source = await response.text(); // eslint-disable-line no-await-in-loop
      // Indirect eval executes in global scope so window.d3 is set
      (0, eval)(source); // eslint-disable-line no-eval
      if (window.d3) return window.d3;
    } catch {
      // Try next URL
    }
  }
  throw new Error("All fetch sources exhausted");
};

/**
 * Loads D3.js library and returns the d3 object.
 * Uses singleton pattern to prevent multiple loads. The module-scoped singleton
 * checks window.d3 first, so co-located charts on one page share a single eval of
 * the static resource. Tries loadScript first (production path), then falls back to
 * fetch+eval for environments where CSP blocks the script tag redirect.
 * @param {LightningElement} component - The LWC component instance
 * @returns {Promise<Object>} - The d3 library object
 */
export const loadD3 = async (component) => {
  if (d3Instance) {
    return d3Instance;
  }
  // Pick up D3 if already present on window
  if (window.d3) {
    d3Instance = window.d3;
    return d3Instance;
  }
  if (!loadPromise) {
    loadPromise = loadScript(component, D3_RESOURCE)
      .then(() => {
        d3Instance = window.d3;
        return d3Instance;
      })
      .catch(async (loadScriptError) => {
        // Fallback: fetch the static resource text and eval it
        try {
          d3Instance = await loadD3ViaFetch();
          return d3Instance;
        } catch (fetchError) {
          loadPromise = null;
          const msg =
            loadScriptError?.message ||
            String(loadScriptError || "unknown error");
          throw new Error(
            `Failed to load D3.js: ${msg} (fallback also failed: ${fetchError.message})`
          );
        }
      });
  }
  return loadPromise;
};
