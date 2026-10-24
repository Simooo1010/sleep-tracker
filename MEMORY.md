# MEMORY.md — Sleep Tracker

Memoria del progetto: contesto utente, stato attuale e informazioni da ricordare tra le sessioni.
Va aggiornata quando si impara qualcosa di durevole. Le regole stanno in `CLAUDE.md`.

## ⚠️ NOVITÀ — leggere prima del design system (aggiunte 2026-10-24, dopo l'avvio della chat design system)
Il design system deve prevedere componenti per:
1. **Regolarità orari** (priorità alta): barre orarie per notte sovrapposte (confronto tra giornate), scostamento da media mobile 14 giorni, tolleranza ±30 min, indicatore di deriva della media, feriali vs weekend (stessi criteri). → `docs/PROJECT.md` §5b
2. **Ampio set di grafici e insight**: durata/debito, correlazioni fattori ↔ qualità/energia/mood, heatmap per giorno della settimana, trend, previsione energia. → `docs/PROJECT.md` §5c
3. **NFC escluso dalla v1** (l'utente si alza subito dopo la sveglia, non consuma caffeina): niente UI per i tag.
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
- Fase: definizione (prima del design system).
- Decisioni: vedi `docs/DECISIONS.md`.
- Supabase: connesso via MCP (2026-10-24).
- Prossimi passi: chat design system → chat AI gateway → build app.

## Preferenze di lavoro
- Vuole vedere il meno possibile: costruzione, test e fix autonomi fino a risultato funzionante; gli si mostra l'esito.
- Non consuma caffeina. Si alza subito dopo la sveglia → NFC non necessario.
- Vuole molti grafici e insight.
