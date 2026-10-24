// Fake OpenAI-compatible provider for local end-to-end checks (no real API calls).
//   FAKE_MODE=ok|429|500 PORT=9001 node scripts/fake-upstream.ts
// POST /v1/chat/completions → valid insights JSON (ok), or the given error status.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const mode = process.env.FAKE_MODE ?? 'ok';
const port = Number(process.env.PORT ?? 9001);

const content = JSON.stringify({
  summary: 'Risposta del provider finto locale.',
  insights: [
    { category: 'duration', severity: 'attention', title: 'Durata sotto il riferimento', body: 'Durata mediana sotto le 7 ore.', confidence: 'medium' },
  ],
});

const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    console.log(`[fake-upstream:${mode}] ${req.method} ${req.url}`);
    if (mode !== 'ok') {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (mode === '429') headers['retry-after'] = '60';
      res.writeHead(Number(mode) || 500, headers).end('{"error":{"message":"fake"}}');
      return;
    }
    let model = 'fake';
    try {
      model = (JSON.parse(body) as { model?: string }).model ?? model;
    } catch {
      /* ignore */
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        id: 'fake-1',
        object: 'chat.completion',
        model,
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
    );
  });
});
server.listen(port, '127.0.0.1', () => {
  console.log(`fake upstream (${mode}) on http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`);
});
