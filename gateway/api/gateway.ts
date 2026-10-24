// Vercel Function (Node.js runtime, Fluid Compute) for the AI gateway.
// vercel.json rewrites /v1/chat/completions, /v1/insights and /v1/health here.
// The handler is created once per instance (module scope): health, cooldown and rate-limit
// state are kept in memory and shared by every request served by this instance.
import { createVercelHandler } from '../src/http/vercel.ts';

const handle = createVercelHandler(); // reads process.env

export const GET = handle;
export const POST = handle;
