// ABOUTME: Bundle-local data processing for the d3NormalizedBarGraphql standalone bundle.
// ABOUTME: Client-side validation, truncation, and two-field (label + series) aggregation.

/**
 * Maximum number of records to process (performance guardrail).
 */
export const MAX_RECORDS = 2000;

/**
 * Supported aggregation operations.
 */
export const OPERATIONS = {
  SUM: "Sum",
  COUNT: "Count",
  AVERAGE: "Average"
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

/**
 * Aggregates data by two group fields (label + series). Operates on records
 * supplied via recordCollection or fetched through the GraphQL wire (Count or
 * free-text paths). Duplicate (label, series) rows are summed into one entry,
 * so a flat free-text record set produces the same totals the structured
 * grouped-aggregate wire returns pre-summed.
 * @param {Array} data - Array of records
 * @param {String} groupByField - Primary grouping (x-axis categories)
 * @param {String} seriesField - Secondary grouping (series/stacks)
 * @param {String} valueField - Field to aggregate
 * @param {String} operation - 'Sum', 'Count', or 'Average'
 * @returns {Array} - [{ label, series, value }, ...]
 */
export const aggregateSeriesData = (
  data,
  groupByField,
  seriesField,
  valueField,
  operation
) => {
  if (!data || !groupByField || !seriesField) {
    return [];
  }

  const groups = new Map();

  data.forEach((record) => {
    const label = String(record[groupByField] ?? "Null");
    const series = String(record[seriesField] ?? "Null");
    const key = `${label}|||${series}`;

    if (!groups.has(key)) {
      groups.set(key, { label, series, sum: 0, count: 0 });
    }
    const group = groups.get(key);
    group.count += 1;
    if (valueField && record[valueField] != null) {
      group.sum += Number(record[valueField]) || 0;
    }
  });

  const result = [];
  groups.forEach((group) => {
    let value;
    switch (operation) {
      case OPERATIONS.SUM:
        value = group.sum;
        break;
      case OPERATIONS.COUNT:
        value = group.count;
        break;
      case OPERATIONS.AVERAGE:
        value = group.count > 0 ? group.sum / group.count : 0;
        break;
      default:
        value = group.count;
    }
    result.push({ label: group.label, series: group.series, value });
  });

  return result;
};
