// The single generic adapter used by every OpenAI-compatible provider.
import { ProviderError, classifyStatus, parseRetryAfter } from '../errors.ts';
import type { Adapter } from './types.ts';

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export const openAICompatibleAdapter: Adapter = async (provider, req, ctx) => {
  const body: Record<string, unknown> = {
    ...(provider.extraBody ?? {}),
    model: provider.model,
    messages: req.messages,
    stream: false,
  };
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;
  if (req.responseFormat && req.responseFormat.type !== 'text') body.response_format = req.responseFormat;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, provider.timeoutMs);
  const onExternalAbort = () => controller.abort();
  ctx.signal?.addEventListener('abort', onExternalAbort, { once: true });

  let res: Response;
  let text: string;
  try {
    res = await ctx.fetch(joinUrl(provider.baseUrl, 'chat/completions'), {
      method: 'POST',
      headers: {
        ...(provider.extraHeaders ?? {}),
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    text = await res.text();
  } catch (err) {
    if (timedOut) throw new ProviderError('timeout', `timeout dopo ${provider.timeoutMs} ms`);
    // Never include the raw error (could echo request data); keep the class name only.
    throw new ProviderError('network', `errore di rete (${(err as Error)?.name ?? 'Error'})`);
  } finally {
    clearTimeout(timer);
    ctx.signal?.removeEventListener('abort', onExternalAbort);
  }

  if (!res.ok) {
    const kind = classifyStatus(res.status);
    throw new ProviderError(kind, `HTTP ${res.status}`, {
      status: res.status,
      retryAfterMs: parseRetryAfter(res.headers.get('retry-after')),
    });
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ProviderError('invalid_response', 'risposta non JSON', { status: res.status });
  }
  const data = json as {
    model?: unknown;
    choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    error?: unknown;
  };
  // Some providers return 200 with an error object.
  if (data.error && !data.choices) {
    throw new ProviderError('server_error', 'errore applicativo in risposta 200', { status: res.status });
  }
  const choice = data.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw new ProviderError('invalid_response', 'risposta senza contenuto', { status: res.status });
  }
  return {
    content,
    model: typeof data.model === 'string' ? data.model : provider.model,
    finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : null,
    ...(data.usage
      ? {
          usage: {
            prompt_tokens: data.usage.prompt_tokens,
            completion_tokens: data.usage.completion_tokens,
            total_tokens: data.usage.total_tokens,
          },
        }
      : {}),
  };
};
