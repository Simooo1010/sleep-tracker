// Adapter registry. Only needed for providers that are NOT OpenAI-compatible:
// register a custom adapter with registerAdapter('name', fn) and set
// "adapter": "name" in the provider config entry.
import { openAICompatibleAdapter } from './openai-compatible.ts';
import type { Adapter } from './types.ts';

const registry = new Map<string, Adapter>([['openai-compatible', openAICompatibleAdapter]]);

export function registerAdapter(name: string, adapter: Adapter): void {
  registry.set(name, adapter);
}

export function getAdapter(name: string, overrides?: Record<string, Adapter>): Adapter | undefined {
  return overrides?.[name] ?? registry.get(name);
}

export type { Adapter, AdapterRequest, AdapterResult, AdapterContext } from './types.ts';
