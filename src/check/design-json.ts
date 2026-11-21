import { join } from 'node:path';
import schema from '../../schema/design.schema.json' with { type: 'json' };
import { isFile, readText } from '../files.ts';
import type { DesignJson, Finding } from '../model.ts';
import { JsonSyntaxError, lineForPointer, parseJson } from './json.ts';
import { validate } from './schema.ts';
import { KEBAB } from './text.ts';

export const DESIGN_JSON = 'design.json';

export interface LoadedDesign {
  /** The validated design.json, or null when it is missing or invalid. */
  design: DesignJson | null;
  findings: Finding[];
  /** Slug and name read even from an invalid file, when they are usable. */
  slug: string | null;
  name: string | null;
}

export function loadDesignJson(root: string): LoadedDesign {
  const file = join(root, DESIGN_JSON);
  if (!isFile(file)) {
    return {
      design: null,
      slug: null,
      name: null,
      findings: [{ path: DESIGN_JSON, line: 1, rule: 'design-json/missing', message: 'design.json is missing' }],
    };
  }

  const invalid = (line: number, message: string): Finding => ({
    path: DESIGN_JSON,
    line,
    rule: 'design-json/invalid',
    message,
  });

  let parsed;
  try {
    parsed = parseJson(readText(file));
  } catch (e) {
    if (e instanceof JsonSyntaxError) {
      return { design: null, slug: null, name: null, findings: [invalid(e.line, `not valid JSON: ${e.message}`)] };
    }
    throw e;
  }

  const findings: Finding[] = validate(schema, parsed.value).map((err) =>
    invalid(lineForPointer(parsed.lines, err.pointer), `${err.pointer || '(root)'} ${err.message}`),
  );

  // Uniqueness of ids is not expressible in the schema subset; check it here.
  const value = parsed.value as Partial<DesignJson> | null;
  for (const key of ['viewports', 'flows'] as const) {
    const list = value && Array.isArray(value[key]) ? (value[key] as { id?: unknown }[]) : [];
    const seen = new Set<unknown>();
    list.forEach((item, idx) => {
      const id = item && typeof item === 'object' ? item.id : undefined;
      if (typeof id !== 'string') return;
      if (seen.has(id)) {
        findings.push(invalid(lineForPointer(parsed.lines, `/${key}/${idx}/id`), `/${key}/${idx}/id "${id}" is used twice`));
      }
      seen.add(id);
    });
  }

  const slug = value && typeof value.slug === 'string' && KEBAB.test(value.slug) ? value.slug : null;
  const name = value && typeof value.name === 'string' && value.name ? value.name : null;
  return { design: findings.length === 0 ? (value as DesignJson) : null, findings, slug, name };
}
