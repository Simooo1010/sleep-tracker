// Local server that mounts the SAME entry used on Vercel (createVercelHandler), so
// /v1/... and /api/gateway?route=... behave as in production.
//   GATEWAY_SECRET=... GROQ_API_KEY=... npm run dev:server        (PORT default 8787, 0 = random)
// Configuration comes only from env (GATEWAY_PROVIDERS_JSON, provider keys, SUPABASE_*...).
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createVercelHandler } from '../src/http/vercel.ts';
import { nodeListener } from '../src/http/node.ts';

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 8787);
const handle = createVercelHandler(); // once, as in api/gateway.ts

let origin = `http://${host}:${port}`;
const server = createServer(nodeListener(handle, () => origin));
server.listen(port, host, () => {
  origin = `http://${host}:${(server.address() as AddressInfo).port}`;
  console.log(`ai-gateway dev server listening on ${origin}`);
});

const stop = () => server.close(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
