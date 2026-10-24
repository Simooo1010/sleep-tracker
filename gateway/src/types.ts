// Shared types: OpenAI-compatible chat completions subset used by the gateway.

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface JsonSchemaFormat {
  type: 'json_schema';
  json_schema: {
    name: string;
    schema: Record<string, unknown>;
    strict?: boolean;
    description?: string;
  };
}

export type ResponseFormat = { type: 'text' } | { type: 'json_object' } | JsonSchemaFormat;

export interface ChatCompletionRequest {
  /** "auto" (default) = whole chain; otherwise a provider id to pin a single provider. */
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: ResponseFormat;
}

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: 'assistant'; content: string };
    finish_reason: string | null;
  }>;
  usage?: Usage;
  /** Gateway metadata (never contains prompt content or secrets). */
  x_gateway: GatewayMeta;
}

export interface AttemptMeta {
  provider: string;
  model: string;
  outcome: 'success' | 'error' | 'skipped';
  errorKind?: string;
  httpStatus?: number;
  latencyMs?: number;
  reason?: string;
}

export interface GatewayMeta {
  requestId: string;
  provider: string | null;
  model: string | null;
  source: 'ai' | 'rules';
  attempts: AttemptMeta[];
  redactions?: number;
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type Env = Record<string, string | undefined>;
