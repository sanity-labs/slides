import { describe, expect, test } from 'vitest';
import { DEFAULT_COMPONENT_TOOL_PREFIX, componentToolName, toSnakeCase } from './naming.js';

describe('toSnakeCase', () => {
  test('PascalCase → snake_case', () => {
    expect(toSnakeCase('Cover')).toBe('cover');
    expect(toSnakeCase('TwoColumn')).toBe('two_column');
    expect(toSnakeCase('SectionDivider')).toBe('section_divider');
  });

  test('handles consecutive caps', () => {
    expect(toSnakeCase('HTTPServer')).toBe('http_server');
    expect(toSnakeCase('IOQueue')).toBe('io_queue');
    expect(toSnakeCase('XMLHttpRequest')).toBe('xml_http_request');
  });

  test('passes through already-snake', () => {
    expect(toSnakeCase('two_column')).toBe('two_column');
  });

  test('replaces kebab-case', () => {
    expect(toSnakeCase('two-column')).toBe('two_column');
  });
});

describe('componentToolName', () => {
  test('joins prefix and snake_case component name', () => {
    expect(componentToolName('Cover')).toBe('slides_add_cover');
    expect(componentToolName('TwoColumn')).toBe('slides_add_two_column');
  });

  test('default prefix is exposed for downstream consumers', () => {
    expect(DEFAULT_COMPONENT_TOOL_PREFIX).toBe('slides_add_');
  });

  test('respects a custom prefix', () => {
    expect(componentToolName('Cover', 'report_add_')).toBe('report_add_cover');
  });
});
