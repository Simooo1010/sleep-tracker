import type { ResolvedProvider } from '../config.ts';
import type { ChatMessage, FetchLike, ResponseFormat, Usage } from '../types.ts';

export interface AdapterRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: ResponseFormat;
}

export interface AdapterResult {
  content: string;
  model: string;
  finishReason: string | null;
  usage?: Usage;
}

export interface AdapterContext {
  fetch: FetchLike;
  /** Optional external abort (e.g. client disconnected). */
  signal?: AbortSignal;
}

/**
 * An adapter turns a provider config + request into a completion.
 * Must throw ProviderError for every failure so the router can classify it.
 */
export type Adapter = (provider: ResolvedProvider, req: AdapterRequest, ctx: AdapterContext) => Promise<AdapterResult>;
