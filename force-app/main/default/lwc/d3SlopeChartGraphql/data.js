// ABOUTME: Bundle-local data processing for the d3SlopeChartGraphql standalone bundle.
// ABOUTME: Client-side validation and truncation of records before slope shaping.

/**
 * Maximum number of records to process (performance guardrail).
 */
export const MAX_RECORDS = 2000;

/**
 * Per-chart-type record limit for the slope chart, tuned to visual capacity.
 * One connecting line is drawn per record, so the ceiling is the point at
 * which the two ranked rails stop being legible.
 */
export const CHART_LIMITS = {
  SLOPE: 500
};

/**
 * Validates that data is a non-empty array.
 * @param {Array} data - Data to validate
 * @returns {Object} - { isValid: boolean, error: string|null }
 */
export const validateData = (data) => {
  if (!data) {
    return { isValid: false, error: "Data is required" };
  }
  if (!Array.isArray(data)) {
    return { isValid: false, error: "Data must be an array" };
  }
  if (data.length === 0) {
    return { isValid: false, error: "Data array is empty" };
  }
  return { isValid: true, error: null };
};

/**
 * Validates that required fields exist in data objects.
 * @param {Array} data - Data array
 * @param {Array} requiredFields - Field names to check
 * @returns {Object} - { isValid: boolean, error: string|null, missingFields: Array }
 */
export const validateFields = (data, requiredFields) => {
  if (!requiredFields || requiredFields.length === 0) {
    return { isValid: true, error: null, missingFields: [] };
  }

  const sample = data[0];
  const missingFields = requiredFields.filter((field) => !(field in sample));

  if (missingFields.length > 0) {
    return {
      isValid: false,
      error: `Missing required fields: ${missingFields.join(", ")}`,
      missingFields
    };
  }

  return { isValid: true, error: null, missingFields: [] };
};

/**
 * Truncates data array to max records limit.
 * @param {Array} data - Data to truncate
 * @param {Number} limit - Max records (default: MAX_RECORDS)
 * @returns {Object} - { data: Array, truncated: boolean, originalCount: number }
 */
export const truncateData = (data, limit = MAX_RECORDS) => {
  const originalCount = data.length;
  const truncated = originalCount > limit;

  return {
    data: truncated ? data.slice(0, limit) : data,
    truncated,
    originalCount
  };
};

/**
 * Prepares data with validation and truncation.
 * @param {Array} data - Raw data
 * @param {Object} options - { requiredFields: Array, limit: Number }
 * @returns {Object} - { data: Array, valid: boolean, error: string, truncated: boolean }
 */
export const prepareData = (data, options = {}) => {
  const { requiredFields = [], limit = MAX_RECORDS } = options;

  // Validate
  const validation = validateData(data);
  if (!validation.isValid) {
    return {
      data: [],
      valid: false,
      error: validation.error,
      truncated: false
    };
  }

  // Validate fields
  const fieldValidation = validateFields(data, requiredFields);
  if (!fieldValidation.isValid) {
    return {
      data: [],
      valid: false,
      error: fieldValidation.error,
      truncated: false
    };
  }

  // Truncate
  const truncation = truncateData(data, limit);

  return {
    data: truncation.data,
    valid: true,
    error: null,
    truncated: truncation.truncated,
    originalCount: truncation.originalCount
  };
};
