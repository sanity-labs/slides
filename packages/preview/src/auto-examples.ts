import { Fragment, createElement, type ReactNode } from 'react';
import type { z } from 'zod';
import type { Template, TemplateComponent } from 'react-pptx/template';

export const deriveAutoPreview = (template: Template): ReactNode => {
  const entries = Object.entries(template.components);
  if (entries.length === 0) return null;
  return createElement(
    Fragment,
    null,
    ...entries.map(([name, tc]) => createElement(Fragment, { key: name }, renderSample(tc, name))),
  );
};

const renderSample = (tc: TemplateComponent, name: string): ReactNode => {
  const props = sampleProps(tc.schema, name);
  return createElement(tc.component as (p: unknown) => ReactNode, props);
};
export const sampleProps = (schema: z.ZodTypeAny, contextName: string): Record<string, unknown> => {
  const value = sample(schema, contextName);
  return (value && typeof value === 'object' ? (value as Record<string, unknown>) : {}) ?? {};
};

const sample = (schema: z.ZodTypeAny, ctx: string): unknown => {
  const def = (schema as unknown as { _def: { typeName: string } })._def;
  switch (def.typeName) {
    case 'ZodObject':
      return sampleObject(schema as z.ZodObject<z.ZodRawShape>, ctx);
    case 'ZodString':
      return sampleString(schema, ctx);
    case 'ZodNumber':
      return 1;
    case 'ZodBoolean':
      return false;
    case 'ZodEnum':
    case 'ZodNativeEnum': {
      const values = (def as unknown as { values: unknown }).values;
      const arr = Array.isArray(values) ? values : Object.values(values as object);
      return arr[0];
    }
    case 'ZodLiteral':
      return (def as unknown as { value: unknown }).value;
    case 'ZodUnion':
    case 'ZodDiscriminatedUnion': {
      const options = (def as unknown as { options: z.ZodTypeAny[] }).options;
      return options.length > 0 && options[0] ? sample(options[0], ctx) : undefined;
    }
    case 'ZodArray': {
      const item = (def as unknown as { type: z.ZodTypeAny }).type;
      return [sample(item, ctx), sample(item, ctx)];
    }
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault': {
      const inner = (def as unknown as { innerType: z.ZodTypeAny }).innerType;
      return sample(inner, ctx);
    }
    case 'ZodEffects': {
      const inner = (def as unknown as { schema: z.ZodTypeAny }).schema;
      return sample(inner, ctx);
    }
    default:
      return undefined;
  }
};

const sampleObject = (schema: z.ZodObject<z.ZodRawShape>, ctx: string): Record<string, unknown> => {
  const shape = schema.shape;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(shape)) {
    if (isOptional(child)) continue;
    out[key] = sample(child, `${ctx}.${key}`);
  }
  return out;
};

const isOptional = (schema: z.ZodTypeAny): boolean => {
  const name = (schema as unknown as { _def: { typeName: string } })._def.typeName;
  return name === 'ZodOptional' || name === 'ZodDefault' || name === 'ZodNullable';
};

const sampleString = (schema: z.ZodTypeAny, ctx: string): string => {
  const checks =
    (schema as unknown as { _def: { checks?: Array<{ kind: string; value?: number }> } })._def
      .checks ?? [];
  const min = checks.find((c) => c.kind === 'min')?.value ?? 0;
  const sample = `Sample ${ctx.split('.').pop() ?? 'value'}`;
  return sample.length >= min ? sample : sample.padEnd(min, '.');
};
