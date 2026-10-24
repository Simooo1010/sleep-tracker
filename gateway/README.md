# AI gateway (sleep-tracker)

Modulo TypeScript indipendente dall'app: interfaccia unica OpenAI-compatible con fallback automatico tra provider gratuiti, validazione del JSON in uscita e ultimo livello di insight a regole (senza AI).

Documentazione completa: [`../docs/AI_GATEWAY.md`](../docs/AI_GATEWAY.md).

```bash
cd gateway
npm install            # .npmrc imposta legacy-peer-deps (bug di npm 10 con i peer di vitest)
npm run check          # typecheck + test
npm run smoke:live     # test con i provider reali (solo con le chiavi in env, mai in CI)
npm run add-provider -- --id mio-provider --baseUrl https://api.esempio.com/v1 --model esempio/modello --env ESEMPIO_API_KEY
```

- Provider: `providers.config.json` (una voce per modello) + env var della chiave. Zero codice.
- Override senza deploy di codice: env `GATEWAY_PROVIDERS_JSON`.
- Handler HTTP Web-standard: `createHandler()` da `src/index.ts` (Vercel function / Next route handler).
- Migrazione log metadati: `supabase/migrations/` (da applicare a mano).

Richiede Node >= 22.18 per eseguire gli script `.ts` direttamente (type stripping nativo).
