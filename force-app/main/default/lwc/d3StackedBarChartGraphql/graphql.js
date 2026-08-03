// ABOUTME: Bundle-local Salesforce GraphQL (v2) query builders and normalizers for the d3StackedBarChartGraphql bundle.
// ABOUTME: Pure functions only — no @wire, no DOM — so they unit-test in isolation.

const OPERATORS = ["eq", "ne", "gt", "gte", "lt", "lte", "like", "in"];

function formatValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map(formatValue).join(", ")}]`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  // GraphQL string literal; escape embedded quotes.
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

/**
 * Builds a GraphQL `where:` fragment from a structured filter.
 * @param {{field:string, operator:string, value:*}|null} filter
 * @returns {string} `where: { Field: { op: value } }` or "".
 */
export function buildWhere(filter) {
  if (!filter || !filter.field || !filter.operator) return "";
  if (!OPERATORS.includes(filter.operator)) {
    throw new Error(`Unsupported filter operator: ${filter.operator}`);
  }
  return `where: { ${filter.field}: { ${filter.operator}: ${formatValue(filter.value)} } }`;
}

/**
 * Builds a raw-record GraphQL query string.
 * @param {{objectApiName:string, fields:string[], filter?:object, orderBy?:string, first?:number}} config
 * @returns {string}
 */
export function buildRecordQuery({
  objectApiName,
  fields,
  filter,
  orderBy,
  first
}) {
  if (!objectApiName) throw new Error("objectApiName is required");
  if (!fields || !fields.length) throw new Error("fields are required");

  const args = [];
  const where = buildWhere(filter);
  if (where) args.push(where);
  if (orderBy) args.push(`orderBy: { ${orderBy}: { order: ASC } }`);
  if (first) args.push(`first: ${first}`);
  const argStr = args.length ? `(${args.join(", ")})` : "";

  const fieldSel = fields.map((f) => `${f} { value }`).join(" ");
  return `query { uiapi { query { ${objectApiName}${argStr} { edges { node { ${fieldSel} } } } } } }`;
}

/**
 * Normalizes a record-query wire result into flat [{field: value}, ...] records.
 * Used by the Count path (project the group/series fields, then aggregate
 * client-side) and the free-text `graphqlQuery` override (project the field
 * mappings). When `objectApiName` is omitted or absent from the payload, the
 * first object key under `data.uiapi.query` is used — so an admin's free-text
 * query is accepted regardless of the object it targets. When `fields` is
 * omitted, every field present on the node is projected.
 * @param {object} data wire `data` ({uiapi:{query:{Object:{edges:[...]}}}})
 * @param {{objectApiName?:string, fields?:string[]}} cfg
 * @returns {Array<Object<string,*>>}
 */
export function normalizeRecordsGeneric(data, { objectApiName, fields } = {}) {
  const queryRoot = data?.uiapi?.query;
  if (!queryRoot) return [];
  const key =
    objectApiName && queryRoot[objectApiName]
      ? objectApiName
      : Object.keys(queryRoot)[0];
  if (!key) return [];
  const edges = queryRoot[key]?.edges ?? [];
  return edges.map((e) => {
    const node = e.node ?? {};
    const record = {};
    (fields ?? Object.keys(node)).forEach((f) => {
      record[f] = node[f]?.value ?? null;
    });
    return record;
  });
}

/** Chart aggregate operation -> GraphQL aggregate function. Count is handled
 * separately via a raw record query (see buildRecordQuery), not the aggregate path. */
export const AGG_FN = { Sum: "sum", Average: "avg", Min: "min", Max: "max" };

/**
 * Builds a grouped-aggregate GraphQL query string (single group field).
 * @param {{objectApiName:string, groupByField:string, valueField:string,
 *          operation:string, filter?:object, first?:number}} config
 * @returns {string}
 */
export function buildAggregateQuery({
  objectApiName,
  groupByField,
  valueField,
  operation,
  filter,
  first = 2000
}) {
  if (!objectApiName || !groupByField || !valueField || !operation) {
    throw new Error(
      "objectApiName, groupByField, valueField, and operation are required"
    );
  }
  const fn = AGG_FN[operation];
  if (!fn) {
    throw new Error(
      `Aggregate operation not supported on the GraphQL aggregate path: ${operation}`
    );
  }

  const args = [`groupBy: { ${groupByField}: {} }`];
  const where = buildWhere(filter);
  if (where) args.push(where);
  if (first) args.push(`first: ${first}`);

  return `query { uiapi { aggregate { ${objectApiName}(${args.join(", ")}) { edges { node { aggregate { ${groupByField} { value } ${valueField} { ${fn} { value } } } } } } } } }`;
}

/**
 * Normalizes a single-field grouped-aggregate wire result into [{label,value}]
 * for the no-series render path.
 * @param {object} data wire `data`
 * @param {{objectApiName:string, groupByField:string, valueField:string, operation:string}} cfg
 * @returns {Array<{label:*, value:*}>}
 */
export function normalizeAggregate(
  data,
  { objectApiName, groupByField, valueField, operation }
) {
  const fn = AGG_FN[operation];
  const edges = data?.uiapi?.aggregate?.[objectApiName]?.edges ?? [];
  return edges.map((e) => ({
    label: e.node.aggregate?.[groupByField]?.value ?? null,
    value: e.node.aggregate?.[valueField]?.[fn]?.value ?? null
  }));
}

/**
 * Builds a two-field grouped-aggregate GraphQL query string. Extends
 * buildAggregateQuery's single groupBy clause to a second (series) field.
 * @param {{objectApiName:string, groupByField:string, seriesField:string,
 *          valueField:string, operation:string, filter?:object, first?:number}} config
 * @returns {string}
 */
export function buildMultiGroupQuery({
  objectApiName,
  groupByField,
  seriesField,
  valueField,
  operation,
  filter,
  first = 2000
}) {
  if (
    !objectApiName ||
    !groupByField ||
    !seriesField ||
    !valueField ||
    !operation
  ) {
    throw new Error(
      "objectApiName, groupByField, seriesField, valueField, and operation are required"
    );
  }
  const fn = AGG_FN[operation];
  if (!fn) {
    throw new Error(
      `Aggregate operation not supported on the GraphQL aggregate path: ${operation}`
    );
  }

  const args = [`groupBy: { ${groupByField}: {}, ${seriesField}: {} }`];
  const where = buildWhere(filter);
  if (where) args.push(where);
  if (first) args.push(`first: ${first}`);

  return `query { uiapi { aggregate { ${objectApiName}(${args.join(", ")}) { edges { node { aggregate { ${groupByField} { value } ${seriesField} { value } ${valueField} { ${fn} { value } } } } } } } } }`;
}

/**
 * Normalizes a two-field grouped-aggregate wire result into
 * [{label,series,value}] for the stacked/grouped/normalized render paths.
 * @param {object} data wire `data`
 * @param {{objectApiName:string, groupByField:string, seriesField:string, valueField:string, operation:string}} cfg
 * @returns {Array<{label:*, series:*, value:*}>}
 */
export function normalizeMultiGroup(
  data,
  { objectApiName, groupByField, seriesField, valueField, operation }
) {
  const fn = AGG_FN[operation];
  const edges = data?.uiapi?.aggregate?.[objectApiName]?.edges ?? [];
  return edges.map((e) => ({
    label: e.node.aggregate?.[groupByField]?.value ?? null,
    series: e.node.aggregate?.[seriesField]?.value ?? null,
    value: e.node.aggregate?.[valueField]?.[fn]?.value ?? null
  }));
}
