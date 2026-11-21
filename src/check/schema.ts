// A minimal JSON Schema validator for the keywords design.schema.json uses.
// It throws on any keyword it does not implement, so the shipped schema can
// never silently ask for something this validator skips.

import { escapePointer } from './json.ts';

export interface SchemaError {
  pointer: string;
  message: string;
}

type Schema = { [keyword: string]: unknown };

const ANNOTATIONS = new Set(['$schema', '$id', '$comment', 'title', 'description', 'examples', 'default']);
const SUPPORTED = new Set([
  'type',
  'const',
  'enum',
  'required',
  'properties',
  'additionalProperties',
  'items',
  'minItems',
  'maxItems',
  'minLength',
  'maxLength',
  'pattern',
  'minimum',
  'maximum',
]);

export function validate(schema: unknown, value: unknown): SchemaError[] {
  const errors: SchemaError[] = [];
  check(asSchema(schema), value, '', errors);
  return errors;
}

function asSchema(s: unknown): Schema {
  if (typeof s !== 'object' || s === null || Array.isArray(s)) throw new Error('schema must be an object');
  for (const k of Object.keys(s)) {
    if (!SUPPORTED.has(k) && !ANNOTATIONS.has(k)) throw new Error(`unsupported schema keyword "${k}"`);
  }
  return s as Schema;
}

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function typeMatches(expected: string, v: unknown): boolean {
  const actual = typeOf(v);
  return expected === actual || (expected === 'number' && actual === 'integer');
}

function check(schema: Schema, v: unknown, ptr: string, errors: SchemaError[]): void {
  const err = (message: string, at = ptr): void => {
    errors.push({ pointer: at, message });
  };

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string];
    if (!types.some((t) => typeMatches(t, v))) {
      err(`must be ${types.map(article).join(' or ')}`);
      return;
    }
  }
  if ('const' in schema && JSON.stringify(schema.const) !== JSON.stringify(v)) {
    err(`must be ${JSON.stringify(schema.const)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(v))) {
    err(`must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}`);
  }

  if (typeof v === 'string') {
    if (typeof schema.minLength === 'number' && [...v].length < schema.minLength) {
      err(schema.minLength === 1 ? 'must not be empty' : `must be at least ${schema.minLength} characters`);
    }
    if (typeof schema.maxLength === 'number' && [...v].length > schema.maxLength) {
      err(`must be at most ${schema.maxLength} characters`);
    }
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern, 'u').test(v)) {
      err(`must match ${schema.pattern}`);
    }
  }

  if (typeof v === 'number') {
    if (typeof schema.minimum === 'number' && v < schema.minimum) err(`must be at least ${schema.minimum}`);
    if (typeof schema.maximum === 'number' && v > schema.maximum) err(`must be at most ${schema.maximum}`);
  }

  if (Array.isArray(v)) {
    if (typeof schema.minItems === 'number' && v.length < schema.minItems) {
      err(`must have at least ${schema.minItems} item${schema.minItems === 1 ? '' : 's'}`);
    }
    if (typeof schema.maxItems === 'number' && v.length > schema.maxItems) {
      err(`must have at most ${schema.maxItems} items`);
    }
    if (schema.items !== undefined) {
      const items = asSchema(schema.items);
      v.forEach((item, idx) => check(items, item, `${ptr}/${idx}`, errors));
    }
  }

  if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
    const obj = v as Record<string, unknown>;
    const props = (schema.properties ?? {}) as Record<string, unknown>;
    if (Array.isArray(schema.required)) {
      for (const key of schema.required as string[]) {
        if (!(key in obj)) err(`must have property "${key}"`);
      }
    }
    for (const [key, child] of Object.entries(obj)) {
      const at = `${ptr}/${escapePointer(key)}`;
      if (key in props) {
        check(asSchema(props[key]), child, at, errors);
      } else if (schema.additionalProperties === false) {
        err(`property "${key}" is not allowed`, at);
      } else if (typeof schema.additionalProperties === 'object') {
        check(asSchema(schema.additionalProperties), child, at, errors);
      }
    }
  }
}

function article(t: string): string {
  return t === 'array' || t === 'object' || t === 'integer' ? `an ${t}` : t === 'null' ? 'null' : `a ${t}`;
}
