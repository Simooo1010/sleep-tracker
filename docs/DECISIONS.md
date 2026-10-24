# Registro decisioni

| Data | Decisione | Stato |
|---|---|---|
| 2026-10-24 | Processo: piano → design system → UI → codice | confermata |
| 2026-10-24 | Regole subagent (Haiku/Sonnet leggere, Opus costruzione, sforzo max high) | confermata |
| 2026-10-24 | v1 = PWA + Supabase + Vercel + automazioni Comandi iOS | proposta |
| 2026-10-24 | Nessun wearable → cattura basata su automazioni iPhone + NFC + stima + conferma | confermata |
| 2026-10-24 | Web app (PWA), niente app nativa iOS | confermata |
| 2026-10-24 | Stack interamente gratuito (Vercel Hobby, Supabase Free) | confermata |
| 2026-10-24 | Segnali disponibili: sveglia iPhone, gesto fisso (caffè/porta → NFC), Full Immersion Riposo | confermata |
| 2026-10-24 | Dati extra: qualità percepita, fattori, risvegli/sonnellini, energia al mattino, mood/stanchezza serale | confermata |
| 2026-10-24 | Primo uso del telefono ≈ 1h–1h30 dopo il risveglio → è il momento della conferma | vincolo |
| 2026-10-24 | AI v1: solo provider con piano gratuito; Claude/ChatGPT più avanti | confermata |
| 2026-10-24 | AI gateway con fallback automatico tra provider + modalità senza AI (insight a regole) | confermata |
| 2026-10-24 | AI gateway = progetto separato, chat isolata, dopo il design system e prima dell'app | confermata |
| 2026-10-24 | Full Immersion attivata manualmente dall'utente → automazione Comandi invia l'evento | confermata |
| 2026-10-24 | Check serale (stanchezza/mood) subito prima di posare il telefono | confermata |
| 2026-10-24 | Tag NFC: da acquistare (spesa minima), previsti in v1 | superata |
| 2026-10-24 | Build autonoma end-to-end: costruzione → test (anche UI/E2E) → fix fino a funzionamento reale | confermata |
| 2026-10-24 | Design system: definito in una chat dedicata | confermata (fatto) |
| 2026-10-24 | Analisi regolarità orari letto/risveglio e confronto tra giornate | confermata |
| 2026-10-24 | Regolarità: riferimento = media mobile recente, weekend uguale ai feriali, tolleranza ±30 min | confermata |
| 2026-10-24 | NFC escluso dalla v1 (si alza subito, sveglia = risveglio; niente caffeina) | confermata |
| 2026-10-24 | Ampio set di grafici: regolarità, durata/debito, correlazioni, pattern/previsioni | confermata |
| 2026-10-24 | Media mobile a 14 giorni + indicatore di deriva della media | superata (→ mediana) |
| 2026-10-24 | Sonnellini pomeridiani nelle statistiche; cattura via comando rapido + recupero nel check serale | confermata |
| 2026-10-24 | Dopo il completamento: routine settimanale di controllo del progetto (da ricordare all'utente) | rinviata |
| 2026-10-24 | Direzione visiva: calma, pastello, Newsreader Light + Instrument Sans; azzurro, salvia, pesca; giallo pastello per energia e sonno diurno | confermata |
| 2026-10-24 | Giallo solo nel tema chiaro; nel tema scuro alias della salvia | confermata |
| 2026-10-24 | Una sola app adattabile PC/telefono, temi chiaro e scuro, alta risoluzione e 4K | confermata |
| 2026-10-24 | Telefono: un dato per volta, check serale una domanda per schermata; viste larghe solo su PC | confermata |
| 2026-10-24 | Barra di navigazione del telefono: pillola flottante staccata dai bordi | confermata |
| 2026-10-24 | Voto 1–5 con le fasi lunari; provenienza dei dati sempre con parola (automatico, confermato, stimato, mancante) | confermata |
| 2026-10-24 | Icona dell'app: nuvola con luna a falce, azzurro pastello non lineare, su bianco (PWA iPhone) | confermata |
| 2026-10-24 | Design system versionato nel repository in `docs/design/` e in `docs/DESIGN.md` | confermata |
| 2026-10-24 | Riferimento regolarità = mediana 14 giorni + indicatore di deriva | confermata |
| 2026-10-24 | Principio gestione imprevedibilità (PROJECT §3c) | confermata |
| 2026-10-24 | Fino a 2–3 domande rapide al giorno; recupero solo ultimi 2–3 giorni | confermata |
| 2026-10-24 | Creati progetti: Supabase `sleep-tracker` (ref bpsvvltrhlqvpxhjjrfy, eu-central-1) e Vercel `sleep-tracker` (prj_rPEEkueywddcJBwVPKriwwwRfZFI, team simone-dr-s-projects) collegato al repo | confermata |
| 2026-10-24 | Catena provider AI: Groq (gpt-oss-120b → gpt-oss-20b) → Mistral small → OpenRouter :free → regole. Gemini escluso (free tier vietato nello SEE + training). Cerebras e GitHub Models esclusi | confermata |
| 2026-10-24 | Ai provider solo statistiche aggregate, mai identificativi (dati sanitari) | confermata |
| 2026-10-24 | Chiavi API inserite dall'utente direttamente in env Vercel (mai in chat né nel repo) | confermata |
| 2026-10-24 | Gateway guidato da configurazione: aggiungere un provider/modello = una voce di config + una env var, zero codice | confermata |
| 2026-10-24 | Gateway deployato su Vercel (root `gateway`), Vercel Authentication disattivata: l'accesso è protetto dal bearer `GATEWAY_SECRET` | confermata |
| 2026-10-24 | Test reale su Groq eseguito da Claude ruotando `GATEWAY_SECRET` (valore di test poi invalidato con una seconda rotazione) | confermata |
| 2026-10-24 | Mistral disattivato (chiave non ottenibile senza piano a pagamento); OpenRouter facoltativo | confermata |
