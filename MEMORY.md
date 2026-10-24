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
- Supabase: connesso via MCP (2026-10-24).
- Roadmap (confermata): 1) design system ✅ → 2) AI gateway (chat dedicata, in sequenza, non in parallelo) → 3) mockup UI → 4) codice + test + fix → 5) deploy → 6) routine settimanale di controllo.

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
