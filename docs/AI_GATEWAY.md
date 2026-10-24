# AI gateway

Progetto separato in `gateway/` (TypeScript, dipendenze: solo `zod`; dev: `typescript`, `vitest`). Nessun framework UI, `fetch` nativo, handler HTTP Web-standard (`Request` → `Response`) usabile da una Vercel function o da una route Next.js.

Scopo: l'app chiede insight o completamenti **senza sapere quale provider risponde**. Il gateway prova i provider gratuiti in ordine, valida sempre il JSON in uscita e, se nessun provider risponde, genera gli insight **a regole** (senza AI): l'app non resta mai senza suggerimenti.

## 1. Architettura

```
app ──HTTP + Bearer GATEWAY_SECRET──► handler (auth, rate limit, routing)
                                         │
                                         ▼
                                privacy guard (solo statistiche aggregate)
                                         │
                                         ▼
           router ── per ogni provider in ordine di priority ──────────────┐
             │  health check (cooldown / circuit breaker / limiti rpm-rpd)  │
             │  adapter OpenAI-compatible (UNO solo per tutti)              │
             │  validazione JSON (zod) → 1 retry correttivo → provider dopo │
             └──────────────────────────────────────────────────────────────┘
                                         │ tutti giù
                                         ▼
                              insight a regole (italiano)
```

| File | Ruolo |
|---|---|
| `gateway/providers.config.json` | lista ordinata dei provider (unica cosa da toccare per aggiungerne uno) |
| `src/config.ts` | validazione config, override `GATEWAY_PROVIDERS_JSON`, salto dei provider senza chiave |
| `src/adapters/openai-compatible.ts` | adapter generico unico (POST `{baseUrl}/chat/completions`) |
| `src/adapters/index.ts` | registro adapter: hook `registerAdapter()` solo per API non OpenAI-compatibili (oggi non serve) |
| `src/health.ts` | health tracking in memoria, cooldown esponenziale, Retry-After, circuit breaker, interfaccia `HealthStore` |
| `src/structured.ts` | `json_schema` strict / `json_object` / schema nel prompt + validazione + messaggio di correzione |
| `src/gateway.ts` | router, endpoint logici `chat`, `insights`, `health` |
| `src/insights/*` | schema statistiche, soglie dati, prompt, generatore a regole |
| `src/privacy.ts` | guard: rifiuto campi identificativi, redazione di email/telefoni/date complete/UUID, limiti di lunghezza |
| `src/http/*` | handler, bearer a tempo costante, rate limit, adattatore Vercel (`vercel.ts`), ponte `node:http` (`node.ts`) |
| `api/gateway.ts` + `vercel.json` | function Vercel unica + rewrite `/v1/*` (§12) |
| `scripts/dev-server.ts`, `scripts/fake-upstream.ts` | server locale con lo stesso entry di Vercel; provider finto OpenAI-compatible per prove locali |
| `src/log.ts` | log di soli metadati (console; Supabase solo opt-in) |
| `src/tools/add-provider.ts` + `scripts/add-provider.ts` | aggiunta provider da riga di comando con chiamata di prova |
| `scripts/smoke-live.ts` | test con i provider reali (manuale, mai in CI) |
| `supabase/migrations/…_ai_gateway_log.sql` | tabella log metadati (da applicare a mano) |

## 2. Catena provider attuale

| # | id | Modello | Env | Stato |
|---|---|---|---|---|
| 1 | `groq-gpt-oss-120b` | `openai/gpt-oss-120b` | `GROQ_API_KEY` | attivo |
| 2 | `groq-gpt-oss-20b` | `openai/gpt-oss-20b` | `GROQ_API_KEY` | attivo |
| 3 | `mistral-small` | `mistral-small-latest` | `MISTRAL_API_KEY` | **disattivato**: chiave ottenibile solo con piano a pagamento |
| 4 | `openrouter-gemma-4-31b` | `google/gemma-4-31b-it:free` | `OPENROUTER_API_KEY` | attivo se la chiave c'è (oggi assente → saltato) |
| 5 | `openrouter-nemotron-3-super` | `nvidia/nemotron-3-super-120b-a12b:free` | `OPENROUTER_API_KEY` | come sopra |
| – | `gemini-flash` | – | – | escluso: free tier vietato nello SEE + dati usati per training |
| – | `cerebras`, `github-models` | – | – | esclusi per decisione di progetto |
| ∞ | regole | – | – | sempre disponibile |

Con la sola `GROQ_API_KEY` la catena effettiva è **Groq 120b → Groq 20b → regole** (coperto da test).

## 3. Schema di una voce di config

```jsonc
{
  "id": "groq-gpt-oss-120b",          // univoco: lettere, numeri, . _ -
  "label": "Groq · gpt-oss-120b",     // opzionale, solo per /v1/health
  "baseUrl": "https://api.groq.com/openai/v1", // senza /chat/completions
  "apiKeyEnv": "GROQ_API_KEY",        // NOME della env var (mai la chiave!)
  "model": "openai/gpt-oss-120b",
  "enabled": true,                    // default true
  "priority": 10,                     // più basso = provato prima (default 100)
  "structuredOutput": "json_schema",  // json_schema | json_object | prompt
                                      // in alternativa: "supportsJsonSchema": true / "jsonMode": true
  "timeoutMs": 20000,                 // default 20000
  "limits": { "rpm": 30, "rpd": 1000 }, // opzionale: limiti locali, il provider viene saltato prima di sforare
  "extraHeaders": { "X-Title": "…" }, // opzionale
  "extraBody": { "reasoning_effort": "low" }, // opzionale: campi aggiunti al body
  "adapter": "openai-compatible",     // default; serve cambiarlo solo per API non compatibili
  "note": "…"                         // opzionale, mostrata in /v1/health
}
```

Regole: voce non valida o duplicata → ignorata con un *warning* visibile in `/v1/health` (il gateway non si blocca). Provider senza env var impostata → **saltato in silenzio** (non è un errore; in `/v1/health` compare `reason: "missing_env"`).

`structuredOutput`:
- `json_schema`: `response_format: {type: "json_schema", strict: true}`; lo schema inviato è ripulito delle parole chiave che alcuni provider rifiutano in strict (`minLength`, `maxItems`, `pattern`…), ma la validazione locale resta completa.
- `json_object`: `response_format: {type: "json_object"}` + schema nel prompt di sistema.
- `prompt`: nessun `response_format`, solo schema nel prompt (funziona con qualunque provider). È il default se non si specifica nulla.

In ogni caso l'output è **sempre** validato con zod; se non valido si riprova **una volta** lo stesso provider con un messaggio di correzione, poi si passa al successivo.

## 4. Aggiungere un provider o un modello in 30 secondi

### Ricetta in 3 passi (consigliata)

1. **Chiave**: aggiungi la env var del provider in Vercel (Project → Settings → Environment Variables), es. `NUOVO_API_KEY`. Per provare in locale esportala nella shell. Mai nel repo.
2. **Voce**: da `gateway/` esegui
   ```bash
   npm run add-provider -- --id nuovo-llama --baseUrl https://api.nuovo.ai/v1 --model meta/llama-4-free --env NUOVO_API_KEY
   ```
   Lo script valida la voce, la aggiunge a `providers.config.json` (priorità: dopo l'ultimo provider attivo, oppure `--priority 15`) e, **se la env var è presente**, fa una chiamata di prova reale rilevando da solo il miglior `structuredOutput` (`json_schema` → `json_object` → `prompt`). Senza chiave scrive la voce e segnala che la prova è pendente (rilancia con `--replace` dopo aver impostato la chiave). Opzioni: `--label`, `--timeout`, `--rpm`, `--rpd`, `--header "Nome: valore"`, `--structured`, `--disabled`, `--no-test`, `--config`.
3. **Commit + deploy** del solo `providers.config.json` (branch → PR → merge). Nessun codice da toccare.

### Alternativa a mano (stesso risultato)

Aggiungi in `providers.config.json`:

```json
{
  "id": "nuovo-llama",
  "baseUrl": "https://api.nuovo.ai/v1",
  "apiKeyEnv": "NUOVO_API_KEY",
  "model": "meta/llama-4-free",
  "priority": 60,
  "structuredOutput": "json_object"
}
```

Un altro modello dello **stesso** provider = un'altra voce con lo stesso `baseUrl`/`apiKeyEnv` e `model` diverso (come i due Groq).

### Alternativa senza deploy di codice: `GATEWAY_PROVIDERS_JSON`

Env var opzionale (in Vercel), letta all'avvio:

- **array** → *merge per id*: stesso id = modifica i campi indicati; id nuovo = aggiunto.
  ```json
  [{"id":"mistral-small","enabled":true},
   {"id":"nuovo-llama","baseUrl":"https://api.nuovo.ai/v1","apiKeyEnv":"NUOVO_API_KEY","model":"meta/llama-4-free","priority":5}]
  ```
- **oggetto** `{"mode":"replace","providers":[…]}` → sostituisce l'intera lista.

JSON non valido → ignorato con warning (resta la config del file).

### Provider non OpenAI-compatibile (non serve oggi)

`registerAdapter('nome', fn)` (o opzione `adapters` di `createGateway`) e `"adapter": "nome"` nella voce. L'adapter deve lanciare `ProviderError` con il `kind` corretto.

## 5. Env richieste

| Variabile | Obbligatoria | Note |
|---|---|---|
| `GATEWAY_SECRET` | sì | bearer condiviso app ↔ gateway, ≥ 16 caratteri (consigliati 32+ casuali). Se manca, ogni richiesta → 500 (fail closed). |
| `GROQ_API_KEY` | sì | provider principale. Senza: `/v1/insights` risponde solo a regole, `/v1/chat/completions` → 503 |
| `OPENROUTER_API_KEY` | no | opzionale, oggi assente |
| `MISTRAL_API_KEY` | no | provider disattivato |
| `GATEWAY_PROVIDERS_JSON` | no | override/aggiunte (§4) |
| `GATEWAY_RATE_LIMIT_RPM` | no | richieste/minuto per IP, default 60 |
| `GATEWAY_LOG` | no | `off` disattiva i log |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | no | **opt-in**: solo se presenti **entrambe** (non vuote) i metadati vanno anche su `ai_gateway_log` (insert con timeout 2 s, un errore di log non blocca mai la richiesta). Altrimenti solo log su console (visibili nei log runtime Vercel). |

## 6. Endpoint

Tutti richiedono `Authorization: Bearer <GATEWAY_SECRET>` (confronto a tempo costante su hash SHA-256) e sono soggetti a rate limit per IP (429 + `Retry-After`). I percorsi sono riconosciuti per suffisso, quindi il gateway può stare sotto qualunque prefisso (es. `/api/ai/v1/...`).

### `POST /v1/chat/completions`
Formato OpenAI. Campi: `messages` (system/user/assistant), `model` (`"auto"` = catena completa, oppure l'id di un provider per forzarlo), `temperature`, `max_tokens`, `response_format` (`text` | `json_object` | `json_schema`). `stream: true` non è supportato (400).
Risposta: `chat.completion` standard + `x_gateway` `{requestId, provider, model, source, attempts[], redactions}`. Con `json_schema` il `content` è il JSON validato e normalizzato. Se tutti i provider falliscono: **503** `all_providers_failed` con i soli metadati dei tentativi.

### `POST /v1/insights`
Body: **solo statistiche aggregate** (schema `insightStatsSchema`, campi sconosciuti rifiutati):

```json
{
  "windowDays": 14,
  "nights": { "inWindow": 14, "withData": 12, "confirmed": 9, "estimated": 3 },
  "targetSleepMinutes": 450,
  "duration": { "nights": 12, "medianMinutes": 402 },
  "debt": { "nights": 12, "minutes": 210 },
  "regularity": { "nights": 12, "toleranceMinutes": 30, "bedtimeMedian": "23:50", "wakeMedian": "07:05",
                  "bedtimeWithinShare": 0.58, "wakeWithinShare": 0.83 },
  "drift": { "nights": 26, "overDays": 28, "bedtimeShiftMinutes": 40, "wakeShiftMinutes": 5 },
  "weekdayWeekend": { "weekdayNights": 8, "weekendNights": 4, "weekdayMidpoint": "03:20",
                      "weekendMidpoint": "04:35", "socialJetLagMinutes": 75 },
  "naps": { "days": 14, "count": 4, "medianMinutes": 25 },
  "correlations": [{ "factor": "schermi", "target": "quality", "r": -0.42, "n": 18 }]
}
```

Risposta (stesso schema per AI e regole):

```json
{
  "summary": "…",
  "insights": [{ "category": "regularity", "severity": "attention", "title": "…", "body": "…", "confidence": "medium" }],
  "source": "ai",            // oppure "rules"
  "provider": "groq-gpt-oss-120b", // null se rules
  "model": "openai/gpt-oss-120b",
  "coverage": { "nightsWithData": 12, "nightsInWindow": 14, "windowDays": 14, "share": 0.86 },
  "hidden": ["correlations"],     // sezioni nascoste per dati insufficienti
  "x_gateway": { "requestId": "…", "attempts": [ … ] }
}
```

Soglie dati (sezioni sotto soglia rimosse **prima** di AI e regole; l'AI che ne parla comunque viene respinta e ritentata):

| Sezione | Soglia |
|---|---|
| durata, debito | ≥ 5 notti |
| regolarità (mediana 14 gg, ±30 min) | ≥ 7 notti |
| deriva | ≥ 14 notti su ≥ 14 giorni |
| feriali vs weekend | ≥ 4 notti feriali e ≥ 2 nel weekend |
| sonnellini | ≥ 7 giorni e ≥ 3 sonnellini |
| correlazioni | ≥ 14 notti e \|r\| ≥ 0.3, presentate come *indizi, non cause* |
| copertura | insight dedicato se copertura < 60% o < 5 notti |

### `GET /v1/health`
Stato di ogni provider: `enabled`, `configured`, `reason` (`disabled` / `missing_env`), `apiKeyEnv` (solo il nome), `note`, e per quelli attivi `health` `{state: closed|open|half_open, cooldownRemainingMs, consecutiveFailures, lastErrorKind, window}`. Stato globale: `ok` / `degraded` (tutti in cooldown) / `rules_only` (nessun provider configurato). **Mai** chiavi o valori di env.

### Uso da Vercel / Next.js

Deploy standalone (consigliato, già pronto): vedi §12. In alternativa, dentro l'app Next.js:

```ts
// app/api/ai/[...path]/route.ts
import { createHandler } from '../../../../gateway/src/index.ts';
const handler = createHandler(); // legge process.env
export const GET = handler;
export const POST = handler;
```

Oppure da codice server, senza HTTP: `createGateway().insights(stats)`.

Nota integrazione: il sorgente usa import con estensione `.ts` (eseguibile direttamente da Node ≥ 22.18) e importa `providers.config.json` con `with { type: 'json' }`. Per il deploy standalone è verificato (§12): il `tsconfig` ha `rewriteRelativeImportExtensions: true`, quindi il compilatore di Vercel riscrive `./x.ts` → `./x.js`. Dentro un'app Next servirà `"allowImportingTsExtensions": true` nel `tsconfig` dell'app e va verificato che il bundler di Next accetti gli import attributes JSON (fase integrazione).

## 7. Routing, cooldown e circuit breaker

- Errori che causano il passaggio al provider successivo: rete, timeout, 5xx, 429, 401/403, 404, altri 4xx, risposta non JSON/vuota, output non valido dopo il retry.
- Cooldown: Retry-After se presente (max 1 h); altrimenti 429 → 30 s × 2ⁿ (max 15 min); rete/timeout/5xx → 5 s × 2ⁿ (max 10 min); 401/403/404 → 1 h (problema di configurazione); output non valido/400 → nessun cooldown proprio.
- Circuit breaker: dopo 3 errori consecutivi il circuito si apre (≥ 60 s, crescente fino a 30 min); poi *half-open*: una sola richiesta di prova, se va bene si richiude.
- Finestra di successo/errore degli ultimi 10 minuti esposta in `/v1/health`.
- Limiti locali `rpm`/`rpd` da config: il provider viene saltato prima di prendere un 429.
- Stato in memoria *best effort*: su serverless ogni istanza ha il suo stato e si azzera ai cold start. Per uno stato condiviso basta implementare `HealthStore` (`get`/`set`) su Supabase e passarlo a `createGateway({ healthStore })`.

## 8. Privacy (dati sanitari)

- `/v1/insights` accetta solo lo schema di statistiche aggregate: numeri, quote, orari `HH:MM` **senza data**, etichette brevi (slug ≤ 40 caratteri) per i fattori. Campi identificativi o grezzi (`email`, `nome`, `userId`, `timestamps`, `events`, `note`…) a qualunque profondità → **400 `privacy_violation`**; campi sconosciuti → 400.
- `/v1/chat/completions`: redazione automatica di email, numeri di telefono, date/timestamp completi e UUID prima dell'invio al provider (conteggio in `x_gateway.redactions`); massimo 30 messaggi, 8000 caratteri per messaggio, 16000 totali (413).
- Log: **solo metadati** (provider, modello, esito, tipo di errore, stato HTTP, latenza, token, modo strutturato, esito validazione). Mai contenuto di prompt o risposte, mai chiavi. Gli errori interni non vengono mai restituiti al client.
- Tabella `ai_gateway_log`: RLS attiva, nessuna policy, privilegi revocati ad `anon`/`authenticated` → accessibile solo con service role. Migrazione: `gateway/supabase/migrations/20261024120000_ai_gateway_log.sql` (**non applicata**; verificata su un Postgres 16 locale usa e getta: crea la tabella, RLS attiva, `anon` riceve *permission denied*).
- Un solo account/chiave per provider, nel rispetto dei ToS.

## 9. Test

```bash
cd gateway && npm install && npm run check   # tsc --noEmit + vitest
```

Coperti (provider simulati con `fetch` finto + test end-to-end con server HTTP locali reali; `test/deploy.test.ts` avvia **davvero** `scripts/dev-server.ts` come processo figlio, configurato solo via env `GATEWAY_PROVIDERS_JSON` verso due provider finti locali: health 401 senza bearer / 200 con bearer senza segreti, chat con fallback dopo 429, insight con provider in cooldown saltato nella stessa istanza, forma riscritta `/api/gateway?route=…`; più logging Supabase opt-in e mappatura dei rewrite): successo al primo provider; 429 + Retry-After → fallback e cooldown; timeout; 5xx; errore di rete; 401 con cooldown lungo; JSON non valido → retry → fallback; retry che corregge; modalità strutturata per capacità del provider; tutti giù → 503 per chat e regole per insight; provider senza env saltato; **solo `GROQ_API_KEY` presente**; **nuovo provider solo via config**; override `GATEWAY_PROVIDERS_JSON` (merge, riattivazione, replace, JSON invalido); **script `add-provider`** (rilevamento modo strutturato, assenza chiave, duplicati, CLI reale); circuit breaker e half-open; limiti rpm/rpd; guard privacy; auth errata → 401; secret mancante → 500; health senza segreti; rate limit; insight sotto soglia nascosti; correlazioni come indizi; log senza contenuti. Lint: non configurato (tsc in modalità strict con `noUnused*` fa da controllo statico).

## 10. Limiti noti

- Stato health e rate limit in memoria per istanza (vedi §7).
- Niente streaming.
- La validazione di schemi JSON arbitrari su `/v1/chat/completions` usa `z.fromJSONSchema` (zod 4): copre lo standard comune; schemi esotici → 400 `invalid_schema`.
- I limiti `rpm`/`rpd` in config sono stime dei piani free (Groq: 30 rpm / 1000 rpd verificati sulla documentazione il 2026-10-24; OpenRouter free: 20 rpm / 50 rpd senza crediti); non tengono conto dei limiti a token (Groq free: 8K TPM).
- Modelli "reasoning" (gpt-oss, Nemotron, Gemma 4): `max_tokens` basso può lasciare il contenuto vuoto → trattato come `invalid_response` e fallback. Per Groq si usa `reasoning_effort: "low"`.

## 11. Stato delle verifiche live

**Verificato in produzione il 2026-10-24** (`https://sleep-tracker-simone-dr-s-projects.vercel.app`, progetto Vercel `sleep-tracker`, root `gateway`, Node 24, regione `iad1`):
- Senza bearer o con bearer errato: `401`. Dopo la rotazione del secret il vecchio valore dà `401`, il nuovo `200`.
- `/v1/health`: Groq 120b e 20b `configured: true`; Mistral disattivato; OpenRouter `missing_env` (nessuna chiave); Gemini, Cerebras e GitHub Models esclusi.
- `/v1/chat/completions`: risposta da `openai/gpt-oss-120b` in ~350 ms; con `response_format` `json_schema` strict l'output è JSON valido (~270 ms).
- `/v1/insights` con statistiche aggregate: `source: "ai"`, provider Groq 120b, ~860 ms, copertura e confidenza corrette.

**Non ancora verificato**
- OpenRouter (nessuna chiave): rifare lo smoke test quando c'è `OPENROUTER_API_KEY`.
- Fallback reale tra provider in produzione (coperto solo dai test con provider simulati).
- Log su DB: migrazione `ai_gateway_log` non applicata, `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` non impostate (il log è opt-in).
- Regione funzioni: `iad1` (USA est). Per l'uso dall'Italia valutare `fra1` in `vercel.json`.
- Limiti reali del piano Free di Groq: non leggibili dalla documentazione, da controllare su console.groq.com/settings/limits.

Ricetta per riverificare in qualsiasi momento: chiamare `/v1/health` e `/v1/insights` con il bearer (vedi §12).

## 12. Deploy su Vercel

Progetto Vercel dedicato, **Root Directory = `gateway`** (Framework preset: *Other*). Tutto il resto è in `gateway/vercel.json`, nessuna impostazione manuale aggiuntiva:

| Voce | Valore |
|---|---|
| Function | `api/gateway.ts` (una sola: health/cooldown/rate limit sono in memoria e devono essere condivisi da tutti gli endpoint della stessa istanza; l'handler è creato una volta a livello di modulo) |
| Runtime | Node.js (versione da `engines` `>=22.18` → Vercel usa **24.x**), `fluid: true`, `maxDuration: 60` |
| Rewrite | `/v1/:route(.*)` → `/api/gateway?route=:route` (l'adattatore `src/http/vercel.ts` riporta il percorso a `/v1/<route>` sia che la function riceva l'URL originale sia quello riscritto) |
| File inclusi | `providers.config.json` (`includeFiles`) |
| Install / build | `npm ci`; nessun build: le function TS le compila Vercel. Output statico: `public/` (solo `robots.txt`, così i sorgenti non vengono serviti come file statici) |

Env da impostare nel progetto Vercel (Production e Preview):

- **richieste**: `GATEWAY_SECRET` (≥ 16 caratteri, consigliati 32+ casuali, es. `openssl rand -hex 32`), `GROQ_API_KEY`;
- **opzionali**: `OPENROUTER_API_KEY`, `GATEWAY_PROVIDERS_JSON`, `GATEWAY_RATE_LIMIT_RPM`, `GATEWAY_LOG`, `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (log su DB solo con entrambe e con la migrazione `ai_gateway_log` applicata).

Chiamare l'endpoint (sostituire dominio e segreto):

```bash
GW=https://<progetto>.vercel.app
TOKEN=<GATEWAY_SECRET>

curl -s "$GW/v1/health" -H "Authorization: Bearer $TOKEN"

curl -s "$GW/v1/chat/completions" -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"model":"auto","messages":[{"role":"user","content":"Dammi un consiglio sul sonno in una frase."}]}'

curl -s "$GW/v1/insights" -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"windowDays":14,"nights":{"inWindow":14,"withData":12,"confirmed":9,"estimated":3},"targetSleepMinutes":450,"duration":{"nights":12,"medianMinutes":402}}'
```

Senza bearer (o con bearer errato) la risposta è `401`. Se la *Deployment Protection* di Vercel è attiva sulle preview, le chiamate esterne alle preview ricevono prima la pagina di login Vercel: per provarle serve il bypass o un deploy di produzione.

Prova locale con lo stesso entry di Vercel:

```bash
cd gateway
FAKE_MODE=429 PORT=9101 npm run dev:fake-upstream &   # provider finto che risponde 429
FAKE_MODE=ok  PORT=9102 npm run dev:fake-upstream &   # provider finto che risponde bene
GATEWAY_SECRET=local-dev-secret-0123456789abcdef K1=x K2=y \
GATEWAY_PROVIDERS_JSON='{"mode":"replace","providers":[{"id":"fake-429","baseUrl":"http://127.0.0.1:9101/v1","apiKeyEnv":"K1","model":"m1","priority":1},{"id":"fake-ok","baseUrl":"http://127.0.0.1:9102/v1","apiKeyEnv":"K2","model":"m2","priority":2,"structuredOutput":"json_object"}]}' \
npm run dev:server                                      # http://127.0.0.1:8787
```

Verifiche fatte (2026-10-24, senza chiavi reali): `vercel build` (CLI 65.2.0, `@vercel/node` con TypeScript 5.9.3 del progetto) su una copia di `gateway/` con impostazioni di progetto locali → build ok, function `api/gateway.func` con `runtime: nodejs24.x`, `maxDuration: 60`, import riscritti in `.js`, `providers.config.json` incluso, rotta `^/v1(?:/(.*))$ → /api/gateway?route=$1`. L'output compilato, eseguito con Node, risponde: health senza bearer 401, health 200 (`rules_only`), chat 503 `all_providers_failed`, insight 200 da regole. **Non verificati**: deploy reale su Vercel (Fluid Compute attivo, URL ricevuto dalla function dopo il rewrite, env di produzione) e chiamate ai provider reali (§11).
