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
| 2026-10-25 | App in `app/` come secondo progetto Vercel (`sleep-tracker-app`, root `app`); il gateway resta separato | confermata |
| 2026-10-25 | Fuso fisso Europe/Rome; "data notte" = giorno locale del risveglio; asse letto = minuti dalle 18:00 | confermata |
| 2026-10-25 | Tutti gli accessi ai dati passano dal server con service role; RLS attiva senza policy | confermata |
| 2026-10-25 | Accesso all'app con password a utente singolo, fail-closed (`APP_LOGIN_PASSWORD`); chiavi di cookie e pepper derivate dalla password | confermata |
| 2026-10-25 | Token API dei Comandi generati dall'app (pagina Impostazioni), salvati solo come hash, mostrati una volta | confermata |
| 2026-10-25 | Insight: gateway con timeout 6 s e riserva a regole locali; al gateway solo statistiche aggregate | confermata |
| 2026-10-25 | CI GitHub non eseguita sulle PR in bozza (evita email sui WIP) | confermata |
| 2026-10-25 | Test finale profondo dell'app eseguito dall'utente in un'altra chat | confermata |
| 2026-10-25 | Velocità percepita: nav ottimistica, `loading.tsx` con skeleton, `staleTimes` (dynamic 30 s, static 180 s; le Server Actions invalidano con `revalidatePath`); accettato che un evento dai Comandi compaia con fino a 30 s di ritardo | confermata |
| 2026-10-25 | I dati di prova del collaudo si scrivono su produzione con date nel passato recente e si eliminano a fine lavoro con DELETE mirati (mai DROP/TRUNCATE) | confermata |
| 2026-10-25 | iPhone: titolo sotto la barra di stato (`--safe-top`), pillola a 14px dal fondo come ai lati (`--safe-bottom`, concentrica agli angoli dello schermo) | confermata |
| 2026-10-25 | Tema automatico (segue il sistema, anche dal vivo); niente interruttore nel guscio: la scelta manuale (Automatico/Chiaro/Scuro) sta in Impostazioni > Aspetto | confermata |
| 2026-10-25 | Cambio d'ora legale gestito in ogni direzione (ritorno all'ora solare +1 h, passaggio all'ora legale −1 h): durate sempre reali (differenza fra istanti); il segno del cambio si calcola dalla data (`domain/clock-change.ts`), nessuna migrazione dei dati già salvati; segnalato in Notte, Sera (avviso la sera prima), Storico (orologio nel calendario, anche per i cambi futuri), Regolarità e Grafici, con la frase «Cambio applicato» | confermata |
| 2026-10-25 | Node.js: locale e CI su 26.12.1 (ultima release, status Current); runtime di deploy su Vercel 24.x, il massimo offerto da Vercel (22.x e 24.x), impostato da `engines` di `app/` e `gateway/` e dal progetto Vercel. `@types/node` 24.x allineato al runtime di deploy | confermata |
| 2026-10-25 | Nuova pagina `/analisi` («Analisi AI»): punteggio 0–100 (durata 40 %, regolarità 35 %, debito 25 %, pesi ricalcolati sulle parti presenti; nascosto con meno di 2 parti), cause come «indizi» (mai causalità), 2–3 azioni con impatto in parole, previsione, selettore 7/14/30 notti (`?periodo=`, default 14). Numeri e grafici solo dal dominio: l'AI (gateway, `windowDays` 7/14/30) scrive solo il racconto; senza gateway badge «Regole». Illustrazioni SVG vettoriali per 5 stati (recupero, regolare, debito, deriva, pochi dati), niente immagini generate | confermata |
| 2026-10-25 | Navigazione: «Analisi» è `desktopOnly` (barra laterale) e sul telefono un pulsante nella barra in alto prima di Segnali e Impostazioni, perché 6 voci nella pillola non stanno a 320 px (Schermate.md prevede 5 voci) | confermata |
| 2026-10-25 | Regola dell'utente: la memoria (`MEMORY.md`, `docs/HANDOFF.md`, `docs/DECISIONS.md`) si aggiorna in automatico a ogni chat, grande azione e grande cambiamento, nello stesso commit del lavoro (scritta in `CLAUDE.md`) | confermata |
