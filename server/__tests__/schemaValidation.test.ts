/**
 * Schema Validation Tests
 * Ensures all OpenAI strict mode schemas comply with requirements
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';

describe('OpenAI Strict Mode Schema Validation', () => {
  let OKR_JSON_SCHEMA: any;
  let ROADMAP_JSON_SCHEMA: any;
  let BLOCKER_JSON_SCHEMA: any;
  let OWNER_JSON_SCHEMA: any;
  let DEADLINE_JSON_SCHEMA: any;
  let BUDGET_JSON_SCHEMA: any;

  before(async () => {
    const module = await import('../lib/rag/structuredExtractor.js');
    OKR_JSON_SCHEMA = module.OKR_JSON_SCHEMA;
    ROADMAP_JSON_SCHEMA = module.ROADMAP_JSON_SCHEMA;
    BLOCKER_JSON_SCHEMA = module.BLOCKER_JSON_SCHEMA;
    OWNER_JSON_SCHEMA = module.OWNER_JSON_SCHEMA;
    DEADLINE_JSON_SCHEMA = module.DEADLINE_JSON_SCHEMA;
    BUDGET_JSON_SCHEMA = module.BUDGET_JSON_SCHEMA;
  });

  function validateSchemaStrictMode(schema: any, path = ''): string[] {
    const errors: string[] = [];

    if (!schema) return errors;

    if (schema.type === 'object' && schema.properties) {
      const propertyKeys = Object.keys(schema.properties);
      const requiredKeys = schema.required || [];

      // OpenAI strict mode: ALL properties must be in required
      const missingRequired = propertyKeys.filter(k => !requiredKeys.includes(k));
      if (missingRequired.length > 0) {
        errors.push(`${path}: Properties [${missingRequired.join(', ')}] defined but not in required array`);
      }

      // Recursively check nested objects
      for (const [key, value] of Object.entries(schema.properties)) {
        if (typeof value === 'object' && value !== null) {
          errors.push(...validateSchemaStrictMode(value as any, `${path}.${key}`));
        }
      }
    }

    if (schema.type === 'array' && schema.items) {
      errors.push(...validateSchemaStrictMode(schema.items, `${path}[]`));
    }

    return errors;
  }

  it('should have all 6 schemas defined', () => {
    assert.ok(OKR_JSON_SCHEMA, 'OKR_JSON_SCHEMA should be defined');
    assert.ok(ROADMAP_JSON_SCHEMA, 'ROADMAP_JSON_SCHEMA should be defined');
    assert.ok(BLOCKER_JSON_SCHEMA, 'BLOCKER_JSON_SCHEMA should be defined');
    assert.ok(OWNER_JSON_SCHEMA, 'OWNER_JSON_SCHEMA should be defined');
    assert.ok(DEADLINE_JSON_SCHEMA, 'DEADLINE_JSON_SCHEMA should be defined');
    assert.ok(BUDGET_JSON_SCHEMA, 'BUDGET_JSON_SCHEMA should be defined');
  });

  describe('Top-level Schema Validation', () => {
    const schemasToTest = [
      { name: 'OKR', getSchema: () => OKR_JSON_SCHEMA },
      { name: 'ROADMAP', getSchema: () => ROADMAP_JSON_SCHEMA },
      { name: 'BLOCKER', getSchema: () => BLOCKER_JSON_SCHEMA },
      { name: 'OWNER', getSchema: () => OWNER_JSON_SCHEMA },
      { name: 'DEADLINE', getSchema: () => DEADLINE_JSON_SCHEMA },
      { name: 'BUDGET', getSchema: () => BUDGET_JSON_SCHEMA }
    ];

    schemasToTest.forEach(({ name, getSchema }) => {
      it(`${name} schema should be OpenAI strict-valid`, () => {
        const schema = getSchema();
        const errors = validateSchemaStrictMode(schema, name);
        if (errors.length > 0) {
          console.error(`Schema validation errors for ${name}:`, errors);
        }
        assert.deepStrictEqual(errors, [], `${name} schema should have no validation errors`);
      });

      it(`${name} schema should have items, framingContext, and summary in required array`, () => {
        const schema = getSchema();
        assert.ok(schema.required.includes('items'), `${name} required should include 'items'`);
        assert.ok(schema.required.includes('framingContext'), `${name} required should include 'framingContext'`);
        assert.ok(schema.required.includes('summary'), `${name} required should include 'summary'`);
      });
    });
  });

  describe('Nested Schema Validation', () => {
    it('OKR KeyResults should require all 7 properties', () => {
      const krSchema = OKR_JSON_SCHEMA.properties.items.items.properties.keyResults.items;
      assert.deepStrictEqual(
        krSchema.required,
        ['result', 'target', 'current', 'owner', 'status', 'due', 'citations'],
        'KeyResults should require all 7 properties (with nullable types for optional ones)'
      );
    });

    it('OKR item should have all properties in required', () => {
      const itemSchema = OKR_JSON_SCHEMA.properties.items.items;
      const props = Object.keys(itemSchema.properties);
      const required = itemSchema.required;

      // All properties should be in required
      props.forEach(prop => {
        assert.ok(required.includes(prop), `OKR item property '${prop}' should be in required array`);
      });
    });
  });
});
