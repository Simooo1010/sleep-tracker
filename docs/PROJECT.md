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
- **Sonnellino**: comando rapido inizio/fine (o timer con sveglia che chiude da solo); se dimenticato, recupero nel check serale ("sonnellino oggi? quanto?").
- Se un segnale manca: stima dai giorni precedenti, marcata "stimata".

## 3c. Gestione dell'imprevedibilità (principio di progetto)
1. Nessun dato obbligatorio. Mancante = mancante (mai zero, mai stima nascosta, mai errore). Niente streak né rimproveri.
2. Ogni valore ha una provenienza: automatico / confermato / stimato / mancante, mostrata in UI.
3. Segnali ridondanti per evento. Letto: Full Immersion → check serale → stima. Risveglio: sveglia → prima app aperta al mattino (automazione Comandi, limite superiore) → stima.
4. Recupero: al primo uso del mattino notte già ricostruita, conferma in 1–2 tap. Se si saltano giorni, si chiedono solo gli ultimi 2–3; i precedenti restano stimati.
5. Budget domande: 2–3 domande al giorno, rapidissime (1 tap ciascuna), scelte per valore informativo.
6. Eccezioni come chip one-tap (caffè, alcol, malattia, viaggio, festa, notte in bianco…), lista aperta e personalizzabile (l'utente può aggiungere imprevisti a testo libero), ordinata per frequenza d'uso. Nel check serale una nota facoltativa descrive la giornata se è stata davvero particolare; imprevisti e nota alimentano anche gli insight AI (`dayContext`).
7. Statistiche robuste: riferimento = **mediana** 14 giorni; giorni-eccezione visibili ma esclusi dal riferimento; ogni statistica mostra la copertura ("9/14 notti"); insight nascosti sotto soglia dati.
8. Adattività: se un segnale non viene usato per giorni, l'app smette di attenderlo e avvisa una sola volta, solo se cala la precisione.

## 4. Architettura (confermata: web app, tutto free)
- **v1**: Web app/PWA (Next.js) su Vercel + Supabase (Postgres, auth, edge functions). Ingestione tramite endpoint API chiamati dalle automazioni Comandi iOS (che possono anche leggere i campioni di sonno da Salute).
  - Pro: niente Apple Developer Program, niente App Store, deploy automatizzabile.
  - Contro: nessun accesso diretto a HealthKit dalla PWA (mitigato da Comandi).
- **AI**: statistiche calcolate in codice (gratis); insight testuali via LLM. Decisione aperta: provider free tier vs Claude (costo stimato pochi centesimi/mese con analisi settimanale).

## 4b. AI gateway (progetto separato) — **costruito e online** (2026-10-24)
Documentazione completa in `docs/AI_GATEWAY.md`; codice in `gateway/`; stato in `MEMORY.md`.
- Router verso provider con piano gratuito. Catena attuale: Groq (`gpt-oss-120b` → `gpt-oss-20b`) → OpenRouter `:free` (facoltativo, senza chiave) → insight a regole. Mistral disattivato (chiave a pagamento); Gemini, Cerebras e GitHub Models esclusi (motivi in `docs/DECISIONS.md`).
- Fallback automatico su errore/429/quota/JSON non valido, con cooldown e health tracking.
- Interfaccia unica OpenAI-compatible; provider e modelli sono configurazione (`gateway/providers.config.json`): aggiungerne uno non richiede codice.
- Ultimo livello: insight a regole dalle statistiche, così l'app non resta mai senza suggerimenti.
- Privacy: solo statistiche aggregate in ingresso, nessun log dei contenuti.
- Vincolo: una sola chiave per provider, rispettando i ToS.

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
- Riferimento: mediana mobile degli ultimi 14 giorni (nessun orario obiettivo fisso).
- Indicatore di deriva: segnala quando la media stessa si sposta nel tempo (es. "+40 min in 4 settimane").
- Weekend: stessi criteri dei feriali; lo scostamento del weekend conta.
- Tolleranza: ±30 min = "regolare".

## 5c. Grafici e insight (ampio set, priorità alta)
- Regolarità: barre orarie per notte sovrapposte, scostamenti dalla media, deriva della media, feriali vs weekend, punto medio.
- Durata e debito: durata per notte, medie 7/30 giorni, debito di sonno accumulato.
- Correlazioni: fattori (schermi, sport, stress…) vs qualità percepita, energia mattutina, mood serale.
- Pattern e previsioni: heatmap per giorno della settimana, trend mensili, energia prevista per domani.
- Sonnellini pomeridiani: frequenza, durata, orario; effetto sul sonno notturno (latenza, orario di letto, qualità) e sull'energia; inclusi nel sonno totale delle 24h.
- Insight testuali: da statistiche (sempre) + AI gateway (quando disponibile). Le correlazioni si mostrano solo con dati sufficienti (es. ≥14 notti) e come indizi, non come cause.

## 6. Domande aperte
Vedi la chat di definizione; le risposte vanno riportate in `docs/DECISIONS.md`.

## 7. Accessi
- GitHub: ok (repo `simooo1010/sleep-tracker`).
- Vercel: ok via MCP.
- Supabase: connesso via MCP.
