/**
 * Recursively enforces OpenAI strict JSON schema rules:
 * - Every object with `properties` gets `required = Object.keys(properties)`
 *   and `additionalProperties = false`
 * - Recurses into array items, anyOf, oneOf branches
 * - Preserves descriptions, enums, and type definitions
 */
export function enforceStrictSchema(schema: Record<string, any>): Record<string, any> {
  if (!schema || typeof schema !== "object") return schema;

  const result = { ...schema };

  if (result.type === "object" && result.properties) {
    result.required = Object.keys(result.properties);
    result.additionalProperties = false;
    const newProps: Record<string, any> = {};
    for (const [key, value] of Object.entries(result.properties)) {
      newProps[key] = enforceStrictSchema(value as Record<string, any>);
    }
    result.properties = newProps;
  }

  if (result.type === "array" && result.items) {
    result.items = enforceStrictSchema(result.items);
  }

  if (result.anyOf) {
    result.anyOf = result.anyOf.map((s: any) => enforceStrictSchema(s));
  }
  if (result.oneOf) {
    result.oneOf = result.oneOf.map((s: any) => enforceStrictSchema(s));
  }

  return result;
}
