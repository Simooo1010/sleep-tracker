// Structured output: request JSON via json_schema (strict) when supported,
// otherwise json_object / prompt + schema in the system prompt. Output is ALWAYS validated.
import { z } from 'zod';
import type { StructuredOutputMode } from './config.ts';
import { GatewayError } from './errors.ts';
import type { ChatMessage, ResponseFormat } from './types.ts';

export type ValidationResult = { ok: true; value: unknown } | { ok: false; errors: string[] };

export interface StructuredSpec {
  name: string;
  jsonSchema: Record<string, unknown>;
  strict: boolean;
  validate(value: unknown): ValidationResult;
}

function zodValidator(schema: z.ZodType): StructuredSpec['validate'] {
  return (value) => {
    const res = schema.safeParse(value);
    if (res.success) return { ok: true, value: res.data };
    return {
      ok: false,
      errors: res.error.issues.slice(0, 10).map((i) => `${i.path.join('.') || '(radice)'}: ${i.message}`),
    };
  };
}

function cleanName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'response';
}

export function specFromZod(name: string, schema: z.ZodType, strict = true): StructuredSpec {
  const jsonSchema = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return { name: cleanName(name), jsonSchema, strict, validate: zodValidator(schema) };
}

export function specFromJsonSchema(name: string, jsonSchema: Record<string, unknown>, strict = true): StructuredSpec {
  let schema: z.ZodType;
  try {
    schema = z.fromJSONSchema(jsonSchema as Parameters<typeof z.fromJSONSchema>[0]) as z.ZodType;
  } catch {
    throw new GatewayError(400, 'invalid_schema', 'response_format.json_schema.schema non supportato o non valido');
  }
  return { name: cleanName(name), jsonSchema, strict, validate: zodValidator(schema) };
}

export function specFromResponseFormat(rf: ResponseFormat | undefined): StructuredSpec | null {
  if (!rf || rf.type === 'text') return null;
  if (rf.type === 'json_object') {
    return {
      name: 'json_object',
      jsonSchema: { type: 'object' },
      strict: false,
      validate: (v) =>
        v !== null && typeof v === 'object' && !Array.isArray(v)
          ? { ok: true, value: v }
          : { ok: false, errors: ['atteso un oggetto JSON'] },
    };
  }
  return specFromJsonSchema(rf.json_schema.name, rf.json_schema.schema, rf.json_schema.strict ?? true);
}

function schemaInstruction(spec: StructuredSpec): string {
  return [
    'Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza testo prima o dopo e senza blocchi di codice.',
    `Il JSON deve rispettare questo JSON Schema (${spec.name}):`,
    JSON.stringify(spec.jsonSchema),
  ].join('\n');
}

/** Builds messages + response_format for the provider's structured output capability. */
export function buildStructuredRequest(
  mode: StructuredOutputMode,
  spec: StructuredSpec,
  messages: ChatMessage[],
): { messages: ChatMessage[]; responseFormat?: ResponseFormat } {
  if (spec.name === 'json_object') {
    // Plain JSON mode requested by the client: no schema to enforce.
    const hint: ChatMessage = { role: 'system', content: 'Rispondi solo con un oggetto JSON valido.' };
    return mode === 'prompt'
      ? { messages: [...messages, hint] }
      : { messages: [...messages, hint], responseFormat: { type: 'json_object' } };
  }
  if (mode === 'json_schema') {
    return {
      messages,
      responseFormat: {
        type: 'json_schema',
        json_schema: { name: spec.name, schema: spec.jsonSchema, strict: spec.strict },
      },
    };
  }
  const withSchema: ChatMessage[] = [...messages, { role: 'system', content: schemaInstruction(spec) }];
  return mode === 'json_object' ? { messages: withSchema, responseFormat: { type: 'json_object' } } : { messages: withSchema };
}

/** Parses model output into JSON, tolerating ```json fences and surrounding prose. */
export function parseJsonContent(content: string): { ok: true; value: unknown } | { ok: false } {
  const trimmed = content.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const candidates = [fence?.[1] ?? trimmed];
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(trimmed.slice(first, last + 1));
  for (const c of candidates) {
    try {
      return { ok: true, value: JSON.parse(c) };
    } catch {
      // try next candidate
    }
  }
  return { ok: false };
}

export function validateContent(spec: StructuredSpec, content: string): ValidationResult {
  const parsed = parseJsonContent(content);
  if (!parsed.ok) return { ok: false, errors: ['la risposta non e\' JSON valido'] };
  return spec.validate(parsed.value);
}

/** Correction turn used for the single same-provider retry. */
export function correctionMessages(previousContent: string, errors: string[]): ChatMessage[] {
  return [
    { role: 'assistant', content: previousContent.slice(0, 4000) },
    {
      role: 'user',
      content: `La risposta precedente non e' valida: ${errors.join('; ')}. Rispondi di nuovo SOLO con il JSON corretto conforme allo schema.`,
    },
  ];
}
