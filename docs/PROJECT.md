# Sleep Tracker — Definizione progetto (bozza v0)

## 1. Obiettivo
Tracciare il sonno con sforzo microscopico, conservare i dati in modo affidabile, ottenere statistiche e suggerimenti personalizzati via AI.

## 2. Vincolo chiave
Il telefono non è usato come ultima/prima cosa della giornata. Quindi la cattura deve funzionare **senza** che l'utente apra l'app.

## 3. Strategia di cattura (dalla meno alla più faticosa)
| Livello | Metodo | Sforzo | Note |
|---|---|---|---|
| 0 | Apple Watch / dati Salute (HealthKit) letti in automatico | nullo | Il più affidabile se c'è un Watch o un'app che scrive in Salute |
| 1 | Automazioni iOS Comandi (Shortcuts): sveglia disattivata, Focus "Sonno" on/off, iPhone in carica/scollegato a una certa ora | nullo | Inviano un evento all'API senza aprire l'app |
| 2 | Tag NFC (comodino / porta camera / caffettiera) | un tocco | Shortcut "tocca tag → registra" |
| 3 | Widget / Live Activity / Action Button | un tocco | |
| 4 | Recupero retroattivo: l'app propone l'orario stimato, l'utente conferma con un tap | 1 tap | Rete di sicurezza contro i buchi |
| 5 | Inserimento manuale | alto | Solo fallback |

Principio: **stimare automaticamente, chiedere solo conferma**. Un buco nei dati va colmato con una stima marcata come tale, non lasciato vuoto.

## 3b. Flusso giornaliero concreto (v1)
- **Sera**: l'utente fa il check (stanchezza/mood) poco prima di posare il telefono, poi attiva a mano la Full Immersion "Riposo" → automazione Comandi invia `bedtime_candidate`. Idealmente check + attivazione in un solo Comando.
- **Notte**: risvegli registrati solo se l'utente lo vuole (tap / NFC), altrimenti chiesti a posteriori.
- **Risveglio**: automazione "Sveglia interrotta" invia `wake` in automatico (gira senza aprire l'app).
- **Gesto fisso (caffè/porta)**: tap su tag NFC → `up` (alzata effettiva) — utile se si rimane a letto dopo la sveglia.
- **Primo uso telefono (~1h–1h30 dopo)**: notifica/widget con la notte già ricostruita → conferma in 1 tap + voto energia/qualità + fattori.
- Se un segnale manca: stima dai giorni precedenti, marcata "stimata".

## 4. Architettura (confermata: web app, tutto free)
- **v1**: Web app/PWA (Next.js) su Vercel + Supabase (Postgres, auth, edge functions). Ingestione tramite endpoint API chiamati dalle automazioni Comandi iOS (che possono anche leggere i campioni di sonno da Salute).
  - Pro: niente Apple Developer Program, niente App Store, deploy automatizzabile.
  - Contro: nessun accesso diretto a HealthKit dalla PWA (mitigato da Comandi).
- **AI**: statistiche calcolate in codice (gratis); insight testuali via LLM. Decisione aperta: provider free tier vs Claude (costo stimato pochi centesimi/mese con analisi settimanale).

## 4b. AI gateway (progetto separato)
- Router verso più provider con piano gratuito (es. Groq, Google Gemini, OpenRouter modelli free, Mistral, Cerebras) — lista da verificare.
- Fallback automatico su errore/429/quota esaurita: provider successivo, con cooldown e health tracking.
- Interfaccia unica (stile OpenAI-compatible); il provider è un dettaglio di configurazione → passaggio futuro a Claude/ChatGPT senza toccare l'app.
- Ultimo livello: insight generati da regole/statistiche, così l'app non resta mai senza suggerimenti.
- Vincolo: una sola chiave per provider, rispettando i ToS (niente account multipli per aggirare i limiti).

## 4c. Strategia di test
- Unit + integrazione (API, DB, logica di stima).
- E2E UI con Playwright in emulazione iPhone (Safari/WebKit), con screenshot e verifica visiva.
- Limite: automazioni Comandi e NFC non sono testabili dal cloud → si simulano le chiamate API; verifica finale sul dispositivo con checklist breve.

## 5. Funzionalità (backlog iniziale)
- Registro sessioni di sonno (inizio, fine, fonte, confidenza).
- Statistiche: durata, regolarità (orari), debito di sonno, trend.
- Insight AI personalizzati.
- Notifiche di recupero ("Ieri sera sembra tu sia andato a letto alle 00:40 — confermi?") in un momento della giornata in cui il telefono si usa davvero.

## 5b. Regolarità (priorità alta)
- Obiettivo: andare a letto e svegliarsi alla stessa ora nella maggior parte dei giorni.
- Analisi: scostamento giornaliero di orario di letto e risveglio rispetto al riferimento, deviazione standard, "social jet lag" (feriali vs weekend), punto medio del sonno.
- Visualizzazione: confronto tra giornate (es. timeline/barre orarie sovrapposte per giorno) che evidenzia le differenze.
- Dettagli (riferimento, tolleranza, weekend): vedi domande aperte.

## 6. Domande aperte
Vedi la chat di definizione; le risposte vanno riportate in `docs/DECISIONS.md`.

## 7. Accessi
- GitHub: ok (repo `simooo1010/sleep-tracker`).
- Vercel: ok via MCP.
- Supabase: connesso via MCP.
