# CLAUDE.md — Sleep Tracker

Regole e istruzioni del progetto. Va letto all'inizio di ogni sessione.
La memoria (contesto utente, stato) sta in `MEMORY.md`. Prodotto: `docs/PROJECT.md`. Decisioni: `docs/DECISIONS.md`. Design: `docs/DESIGN.md`. Layer AI: `docs/AI_GATEWAY.md`.

## Principio di prodotto
- Frizione di inserimento quasi nulla: raccolta passiva/automatica dove possibile, all'utente si chiede solo una conferma.

## Design (obbligatorio per ogni UI)
- Leggi `docs/DESIGN.md` e usa `docs/design/tokens.css` e `docs/design/system/`. Non inventare colori, font o componenti.
- Un dato per volta su telefono, un solo pulsante pieno per schermata, mai solo il colore per un significato.
- Alta risoluzione e 4K: tutto vettoriale, unità `rem`, contenuto centrato con larghezza massima.

## Layer AI (già costruito e online)
- Per qualsiasi funzione che usa l'AI (insight, previsioni, testi) si chiama il **gateway**, mai un provider direttamente. Doc completa: `docs/AI_GATEWAY.md`; codice in `gateway/`.
- Endpoint in produzione: `https://sleep-tracker-simone-dr-s-projects.vercel.app` (`POST /v1/insights`, `POST /v1/chat/completions`, `GET /v1/health`), autenticati con `Authorization: Bearer $GATEWAY_SECRET`.
- Gli ID dei modelli e le chiavi (`GROQ_API_KEY`, ecc.) stanno solo in env Vercel del progetto `sleep-tracker`; `GATEWAY_SECRET` è sensitive e non leggibile. Per usarlo dall'app: `docs/AI_GATEWAY.md` §13.
- Aggiungere un provider o un modello = una voce in `gateway/providers.config.json` (o `npm run add-provider`) + una env var, zero codice (`docs/AI_GATEWAY.md` §4).
- All'AI si inviano solo statistiche aggregate, mai dati identificativi (dati sanitari, `docs/AI_GATEWAY.md` §8). Se tutti i provider falliscono, il gateway risponde comunque con insight a regole.
- Il progetto Vercel `sleep-tracker` ha Root Directory `gateway`: l'app va in una cartella/progetto separato (vedi `docs/AI_GATEWAY.md` §13).

## Processo di lavoro (obbligatorio)
1. Pianificazione e definizione → 2. Design system → 3. UI (mockup) → 4. Codice → 5. Test → 6. Deploy.
   Non si scrive codice applicativo prima che design system e UI siano approvati.
2. Ogni task ha la sua chat/sessione. Le task vanno spezzate nelle unità più piccole possibili.
3. `MEMORY.md` e `docs/` sono la fonte di verità tra una sessione e l'altra: aggiornarli quando cambia qualcosa.

## Regole sui subagent
- **Haiku / Sonnet**: ricerca, lettura, attività read-only, task leggere o a basso rischio; Sonnet esegue quando l'obiettivo è già chiaro.
- **Opus (o Fable se disponibile)**: pianificazione, chiarimento, architettura, implementazione, fix, test, verifica — tutto ciò che richiede precisione.
- Sforzo massimo: **high**. Mai max/ultra.
- Subagent indipendenti → in parallelo nello stesso turno.
- **Granularità (regola dell'utente, 2026-10-24):** ogni obiettivo si spezza in attività sempre più piccole, ognuna con file propri (nessuna sovrapposizione), contratto/tipi condivisi definiti prima, e affidata a un subagent dedicato. Più agenti piccoli in parallelo battono pochi agenti grandi. L'orchestratore integra, lancia i controlli e committa; i fix vanno a un agente per problema.

## Automazione e accessi
- Obiettivo: zero azioni manuali per l'utente su GitHub, Vercel, Supabase.
- Sicurezza: mai segreti nel repo; chiavi solo in env Vercel/Supabase. Azioni distruttive (drop tabelle, delete progetti) sempre confermate.
- Branch → PR draft → merge. Niente push diretti su `main`.
