// Privacy guard. The gateway must only ever receive AGGREGATE statistics:
// - /v1/insights: strict schema (see insights/schema.ts) + identifying-key scan → reject.
// - /v1/chat/completions: size limits + redaction of identifiers (email, phone,
//   full dates/timestamps, UUIDs) before anything leaves for a provider.
import { GatewayError } from './errors.ts';
import type { ChatMessage } from './types.ts';

export interface PrivacyLimits {
  maxMessages: number;
  maxMessageChars: number;
  maxTotalChars: number;
}

export const defaultPrivacyLimits: PrivacyLimits = {
  maxMessages: 30,
  maxMessageChars: 8000,
  maxTotalChars: 16000,
};

const REDACTIONS: Array<{ re: RegExp; label: string }> = [
  { re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, label: '[email]' },
  { re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, label: '[id]' },
  // Full ISO date or timestamp (a time of day alone, e.g. 23:40, is allowed).
  {
    re: /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g,
    label: '[data]',
  },
  { re: /\b\d{1,2}[/.]\d{1,2}[/.]\d{4}\b/g, label: '[data]' },
  {
    re: /(?<![\w.])(?:\+\d{1,3}[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}|3\d{2}[\s-]?\d{6,7}|0\d{1,3}[\s-]?\d{6,8})(?![\w.])/g,
    label: '[telefono]',
  },
];

export function redactText(text: string): { text: string; count: number } {
  let count = 0;
  let out = text;
  for (const { re, label } of REDACTIONS) {
    out = out.replace(re, () => {
      count += 1;
      return label;
    });
  }
  return { text: out, count };
}

export const DAY_CONTEXT_TEXT_MAX = 140;

/**
 * Sanitizes the user-reported text of one day: strips control characters, collapses whitespace,
 * redacts identifiers (email, phone, ISO dates, UUID) and clamps the length. Never logs.
 */
export function sanitizeDayContextText(text: string): { text: string; redactions: number } {
  const flat = text.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
  const r = redactText(flat);
  return { text: r.text.slice(0, DAY_CONTEXT_TEXT_MAX), redactions: r.count };
}

export function guardMessages(
  messages: ChatMessage[],
  limits: PrivacyLimits = defaultPrivacyLimits,
): { messages: ChatMessage[]; redactions: number } {
  if (messages.length > limits.maxMessages) {
    throw new GatewayError(413, 'too_many_messages', `massimo ${limits.maxMessages} messaggi`);
  }
  let total = 0;
  let redactions = 0;
  const out = messages.map((m) => {
    if (m.content.length > limits.maxMessageChars) {
      throw new GatewayError(413, 'message_too_long', `messaggio oltre ${limits.maxMessageChars} caratteri: inviare solo statistiche aggregate`);
    }
    total += m.content.length;
    const r = redactText(m.content);
    redactions += r.count;
    return { role: m.role, content: r.text };
  });
  if (total > limits.maxTotalChars) {
    throw new GatewayError(413, 'payload_too_large', `contenuto oltre ${limits.maxTotalChars} caratteri`);
  }
  return { messages: out, redactions };
}

const IDENTIFYING_KEY =
  /^(e-?mail|mail|name|first_?name|last_?name|full_?name|nome|cognome|username|user_?name|user_?id|userid|phone|telefono|cellulare|address|indirizzo|ip|ip_?address|birth_?date|data_?nascita|dob|fiscal_?code|codice_?fiscale|notes?|note_?text|free_?text|diary|diario|raw|timestamps?|events?)$/i;

/** Rejects payloads that contain identifying fields or raw data (any depth). */
export function assertNoIdentifyingKeys(value: unknown, path = ''): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoIdentifyingKeys(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const p = path ? `${path}.${k}` : k;
      if (IDENTIFYING_KEY.test(k)) {
        throw new GatewayError(400, 'privacy_violation', `campo non ammesso (identificativo o dato grezzo): ${p}`);
      }
      assertNoIdentifyingKeys(v, p);
    }
  }
}
