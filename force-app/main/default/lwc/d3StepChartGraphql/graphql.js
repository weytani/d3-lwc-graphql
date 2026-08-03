// ABOUTME: Bundle-local Salesforce GraphQL (v2) record-query builder and normalizer for the d3StepChartGraphql bundle.
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
 * Used by both the structured record path (project the field mappings) and the
 * free-text `graphqlQuery` override. When `objectApiName` is omitted or absent
 * from the payload, the first object key under `data.uiapi.query` is used — so an
 * admin's free-text query is accepted regardless of the object it targets. When
 * `fields` is omitted, every field present on the node is projected.
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
