# MEMORY.md — Sleep Tracker

Memoria del progetto: contesto utente, stato attuale e informazioni da ricordare tra le sessioni.
Va aggiornata quando si impara qualcosa di durevole. Le regole stanno in `CLAUDE.md`.

## Requisiti recepiti nel design system (aggiunti 2026-10-24)
Il design system li include già, vedi `docs/DESIGN.md`:
1. **Regolarità orari** (priorità alta): barre orarie per notte sovrapposte (confronto tra giornate), scostamento da mediana mobile 14 giorni, tolleranza ±30 min, indicatore di deriva della media, feriali vs weekend (stessi criteri). → `docs/PROJECT.md` §5b
2. **Ampio set di grafici e insight**: durata/debito, correlazioni fattori ↔ qualità/energia/mood, heatmap per giorno della settimana, trend, previsione energia. → `docs/PROJECT.md` §5c
3. **NFC escluso dalla v1** (l'utente si alza subito dopo la sveglia, non consuma caffeina): niente UI per i tag.
5. **Sonnellini pomeridiani**: statistiche dedicate + cattura con comando rapido inizio/fine e recupero nel check serale.
6. **Gestione dell'imprevedibilità** (`docs/PROJECT.md` §3c): nessun dato obbligatorio, etichetta di provenienza su ogni valore (automatico/confermato/stimato/mancante), chip eccezioni one-tap, indicatore di copertura dati, 2–3 domande rapide al giorno.
4. Check serale (stanchezza/mood) subito prima di posare il telefono + Full Immersion attivata a mano.

## Contesto utente
- Sleep tracker personale, per un solo utente (il proprietario del repo). Lingua: italiano.
- Problema centrale: dimentica di registrare il sonno e fatica a mantenere i dati nel tempo.
- Non usa il telefono come ultima cosa prima di dormire né come prima dopo il risveglio.
- Primo uso del telefono al mattino: circa 1h–1h30 dopo il risveglio.
- Nessun wearable (niente Apple Watch).
- Segnali di routine costanti: sveglia iPhone, gesto fisso (caffè/porta), Full Immersion "Riposo".
- Vuole tutto gratuito.

## Stato attuale
- Fase: design system completato (2026-10-24). Vedi `docs/DESIGN.md`.
- Decisioni: vedi `docs/DECISIONS.md`.
- Supabase: connesso via MCP (2026-10-24). Progetto `sleep-tracker` creato (ref `bpsvvltrhlqvpxhjjrfy`, eu-central-1, org `qjrnwnextqfbaauwvbpf`). Non riusare il progetto finanze `aedoncqvypsrksnqiwgh`.
- Vercel: progetto `sleep-tracker` (`prj_rPEEkueywddcJBwVPKriwwwRfZFI`, team `team_7cA5Y1PcLGxH0Rcb6HXHzwHx`) collegato al repo, nessun deploy ancora.
- AI gateway: ONLINE e verificato in produzione con Groq (2026-10-24), vedi `docs/AI_GATEWAY.md` §11. URL: `https://sleep-tracker-simone-dr-s-projects.vercel.app` (root Vercel = `gateway`, Vercel Authentication disattivata: protegge il bearer `GATEWAY_SECRET`). `GATEWAY_SECRET` ruotato dopo il test: l'utente non lo conosce; quando nascerà l'app, impostare lo stesso valore dove serve (o ruotarlo di nuovo). Env su Vercel (inserite dall'utente): `GROQ_API_KEY`, `GATEWAY_SECRET`. Mistral non disponibile (richiede piano a pagamento); `OPENROUTER_API_KEY` facoltativa.
- **Prossimo step**: build principale (4) — partire da schema Supabase + endpoint di ingestione, poi logica di stima/statistiche, poi app Next.js/PWA in `app/` con progetto Vercel separato (il progetto `sleep-tracker` ha root `gateway`). Il layer AI si usa solo via gateway: `CLAUDE.md` § Layer AI e `docs/AI_GATEWAY.md` §13.
- Roadmap (confermata): 1) design system ✅ → 2) AI gateway ✅ (chat dedicata, in sequenza, non in parallelo) → 3) mockup UI ✅ (prototipi D1/D2 approvati) → 4) codice + test + fix → 5) deploy → 6) routine settimanale di controllo.

## Build app (in corso, branch claude/clever-hawking-s5b26t, PR #11)
- Slice 0 ✅ scaffolding `app/` (Next 16, Vitest, Playwright iphone/desktop/uhd, CI). WebKit non installato: iPhone emulato con Chromium. Per aggiungere dipendenze usare `npx npm@11 install` (npm 10 non crea il lockfile).
- Slice 1 ✅ dominio puro `app/src/domain/` (12 moduli, 392 test verdi, `index.ts`). Fuso Europe/Rome; asse letto = minuti dalle 18:00.
- Prossimo: Slice 2 (schema DB + ingestione eventi), poi 3 Notte, 4 Sera, 5 Regolarità, 6 Grafici+gateway, 7 Storico/Segnali, 8 seed+visual, 9 deploy. Piano: vedi PR #11.
- Regola utente: attività piccole, un agente Opus ciascuna, file disgiunti (CLAUDE.md).

## Design
- Direzione approvata: calma, pastello, serif leggero (Newsreader), accenti azzurro/salvia/pesca + giallo pastello per energia e sonno diurno (solo tema chiaro).
- Telefono: un dato per volta, navigazione a pillola flottante. PC: viste larghe. Alta risoluzione e 4K.
- Logo: nuvola con luna, azzurro pastello su bianco (icona PWA per iPhone). File in `docs/design/logo/`.
- Design system (artefatto): https://claude.ai/artifact/3bLXhSQ61PrRXtpzM9F2mR · Prototipi: https://claude.ai/artifact/8MfknmomX1jzdWa26CRFRP

## Preferenze di lavoro
- Vuole vedere il meno possibile: costruzione, test e fix autonomi fino a risultato funzionante; gli si mostra l'esito.
- Non consuma caffeina. Si alza subito dopo la sveglia → NFC non necessario.
- Vuole molti grafici e insight.

## 🔔 Promemoria per l'utente
- **A fine costruzione dell'app (dopo il deploy funzionante)**: ricordare all'utente di creare una routine settimanale (scheduled task) in cui Claude controlla lo stato del progetto (deploy Vercel, errori runtime, advisor Supabase, dati in arrivo, AI gateway, dipendenze). Proporla e configurarla solo con il suo ok.
