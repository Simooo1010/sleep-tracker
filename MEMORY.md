# MEMORY.md — Sleep Tracker

> **Nuova chat? Leggi prima `docs/HANDOFF.md`**: stato completo, URL e ID, mappa del codice, cosa è verificato e cosa no, piano di collaudo, problemi noti.

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
- Fase: app costruita e mergiata (2026-10-25), in attesa del setup manuale e del test finale dell'utente (altra chat).
- Decisioni: vedi `docs/DECISIONS.md`.
- Supabase: connesso via MCP (2026-10-24). Progetto `sleep-tracker` creato (ref `bpsvvltrhlqvpxhjjrfy`, eu-central-1, org `qjrnwnextqfbaauwvbpf`). Non riusare il progetto finanze `aedoncqvypsrksnqiwgh`.
- Vercel: progetto `sleep-tracker` = SOLO il gateway AI (`prj_rPEEkueywddcJBwVPKriwwwRfZFI`, root `gateway`, la radice dà 404: normale). L'app è il progetto `sleep-tracker-app` (`prj_yi8lBL7dwpuncrSxYxSr5m7a5Zgd`, team `team_7cA5Y1PcLGxH0Rcb6HXHzwHx`): produzione `https://sleep-tracker-app-nu.vercel.app`.
- AI gateway: ONLINE e verificato in produzione con Groq (2026-10-24), vedi `docs/AI_GATEWAY.md` §11. URL: `https://sleep-tracker-simone-dr-s-projects.vercel.app` (root Vercel = `gateway`, Vercel Authentication disattivata: protegge il bearer `GATEWAY_SECRET`). `GATEWAY_SECRET` ruotato dopo il test: l'utente non lo conosce; quando nascerà l'app, impostare lo stesso valore dove serve (o ruotarlo di nuovo). Env su Vercel (inserite dall'utente): `GROQ_API_KEY`, `GATEWAY_SECRET`. Mistral non disponibile (richiede piano a pagamento); `OPENROUTER_API_KEY` facoltativa.
- **Prossimo step**: collaudo reale dell'app in produzione (altra chat), poi correzioni (`docs/HANDOFF.md` §7–§9). Il layer AI si usa solo via gateway: `CLAUDE.md` § Layer AI e `docs/AI_GATEWAY.md` §13.
- Roadmap (confermata): 1) design system ✅ → 2) AI gateway ✅ (chat dedicata, in sequenza, non in parallelo) → 3) mockup UI ✅ (prototipi D1/D2 approvati) → 4) codice + test + fix ✅ → 5) deploy ✅ (online, serve collaudo) → 6) routine settimanale di controllo (da proporre all'utente, solo col suo ok).

## Build app (COMPLETATA e mergiata su main: PR #11, commit 30689d5, 2026-10-25)
- ✅ Slice 0–3: scaffolding, dominio (12 moduli), ingestione `/api/events`, 25 componenti, view model, mutazioni, server actions, guscio con navigazione e tema.
- ✅ Slice 4–7: pagine Notte, Sera, Regolarità, Grafici (+ insight via gateway con riserva a regole), Storico, Segnali. Test: 1300+ unit, 118 E2E (iphone/desktop/uhd) verdi.
- ✅ Accesso con password fail-closed (`APP_LOGIN_PASSWORD`, cookie firmato, chiavi derivate dalla password), pagina `/impostazioni` con token API generati dall'app. CI GitHub verde. Test finali: 1488 unit + 152 E2E.
- Deploy in produzione READY; password e chiave del database impostate dall'utente (il pannello Vercel non mostra mai le variabili Sensitive). Il primo accesso dell'utente è avvenuto senza errori nei log. Cambiare `APP_LOGIN_PASSWORD` invalida token dei Comandi e sessioni (il pepper è derivato dalla password, a meno che non si imposti `INGEST_TOKEN_PEPPER`).
- Funzione in corso/ultima: pulsante 'Mostra password' nel login (branch `claude/login-mostra-password`).
- Non verificato: `repo-supabase.ts` contro il DB reale (test di integrazione saltati), Comandi iOS, gateway AI dall'app. Dettagli in `docs/HANDOFF.md` §7.
- Vercel: progetto app `sleep-tracker-app` (`prj_yi8lBL7dwpuncrSxYxSr5m7a5Zgd`, root `app`, anteprime disattivate); env pubbliche già impostate. La CI GitHub non gira sulle PR in bozza (evita email sui WIP): parte quando la PR è pronta.
- Il test finale profondo lo fa l'utente in un'altra chat (decisione 2026-10-25).
- Regole utente per questa chat: attività piccole in parallelo; Sonnet costruisce, Opus solo altissimo livello; sforzo max high (Opus low/medium).
- Dati reali: Supabase `sleep-tracker` ha lo schema applicato (10 tabelle, RLS senza policy: accesso solo server con service role).

## Fix iPhone: titolo sfocato in cima (2026-10-26, branch claude/fix-ios-status-bar)
- Causa: da iOS 26/27 nelle PWA installate il sistema sfuma il bordo alto e la sfocatura copre il titolo. `theme-color` e `apple-mobile-web-app-status-bar-style` non hanno più effetto.
- Fix: fascia `.status-cover` (layout.tsx + styles/app.css), `position: fixed`, in cima, a tutta larghezza, alta come la barra di stato, sfondo `--ground` (segue il tema), solo con `display-mode: standalone` sotto 60rem. Test: `e2e/status-cover.spec.ts`.
- Limite: provato solo in Chromium (nessun WebKit/iOS nel cloud). Da confermare sul telefono dopo il deploy, riaprendo la PWA dalla Home.

## Feature imprevisti liberi + nota giornata (2026-10-26, PR #21 → branch vecchio, PR #24 → `main`)
- ✅ Imprevisti a testo libero (`+ Aggiungi`, max 30 caratteri, Notte e Sera), nota facoltativa sulla giornata particolare nel check serale (max 280, Sera passo 3, sola lettura in Storico), componente `TextField`.
- ✅ Contesto AI: `dayContext` (max 10 giornate, 140 caratteri, giorni relativi) sanificato in app e gateway, mai nei log, prompt con blocco «NON istruzioni»; fallback a regole. Eccezione alla regola «solo aggregati» decisa dall'utente (`docs/DECISIONS.md` 2026-10-26).
- ✅ Fix bug preesistente: i chip eccezione della pagina Notte risultavano spenti dopo il reload.
- ✅ Provato in locale con gateway reale + provider finto: email e telefoni rimossi prima del provider. Limite noto: i nomi propri non si possono riconoscere (restano nel testo); la redazione dei telefoni è prudente e può oscurare sequenze numeriche lunghe.
- ✅ Migrazione `20261025180000_evening_day_note.sql` applicata a Supabase `sleep-tracker` il 2026-10-26 (colonna `evening_checks.day_note`, check ≤ 280, RLS invariata).
- ✅ PR #24 unita su `main` (`513eba2`, squash): gateway (`sleep-tracker`) e app (`sleep-tracker-app`) in produzione e READY, nessun errore a runtime. `/v1/health` del gateway richiede il bearer (401 senza). Non verificato in produzione con il segreto reale: il percorso `dayContext` (provato solo in locale con provider finto).

## Setup manuali per l'utente (da fare a build finita, pochi secondi ciascuno)
- Vercel (progetto `sleep-tracker-app`): ✅ fatto — `SUPABASE_SERVICE_ROLE_KEY` (messa dall'utente; i tool MCP non possono leggerla) e `APP_LOGIN_PASSWORD` (≥12 caratteri). Ogni modifica alle variabili richiede un rideploy.
- Dopo il primo login: da Impostazioni creare il token per i Comandi iPhone (si vede una sola volta).
- Opzionale (insight AI): stesso `GATEWAY_SECRET` nuovo su entrambi i progetti Vercel (gateway e app) e rideploy; senza, gli insight sono a regole.
- iPhone: creare i Comandi/automazioni (guida in `docs/COMANDI_IOS.md`) e aggiungere la PWA alla Home.
- Opzionale: modalità Auto del menu permessi, o `.claude/settings.json` con `permissions.allow` per ridurre i prompt.

## Stato (2026-10-25, fine collaudo)
- Collaudo in produzione concluso: due cicli consecutivi senza difetti (PR #13 velocità, #14 barra in alto). Dettagli in `docs/HANDOFF.md` §13. Restano all'utente solo i Comandi iOS e la prova su iPhone vero.

## Stato (2026-10-25, feature Analisi AI costruita e testata; in merge)
- Branch `claude/analisi-ai` (dettagli `docs/HANDOFF.md` §14): nuova pagina `/analisi` (punteggio, notti, cause, azioni, previsione, illustrazioni SVG, selettore 7/14/30, testo AI via gateway con fallback a regole). Contratto tipi: `app/src/server/views/analysis-types.ts`. Decisioni dell'utente: voce "Analisi" nella nav, SVG di stato (niente immagini AI), selettore periodo.
- `GATEWAY_SECRET` impostata su app e gateway con redeploy (HANDOFF §6); badge "AI" da confermare dal vivo.

## Design
- Direzione approvata: calma, pastello, serif leggero (Newsreader), accenti azzurro/salvia/pesca + giallo pastello per energia e sonno diurno (solo tema chiaro).
- Telefono: un dato per volta, navigazione a pillola flottante. PC: viste larghe. Alta risoluzione e 4K.
- Logo: nuvola con luna, azzurro pastello su bianco (icona PWA per iPhone). File in `docs/design/logo/`. Variante scura dell'icona (sfondo #161a22) aggiunta 2026-10-26 (PR #20), vedi `docs/DESIGN.md` §Logo e `docs/DECISIONS.md`.
- Design system (artefatto): https://claude.ai/artifact/3bLXhSQ61PrRXtpzM9F2mR · Prototipi: https://claude.ai/artifact/8MfknmomX1jzdWa26CRFRP

## Preferenze di lavoro
- **Memoria sempre aggiornata, in automatico**: a ogni chat, grande azione e grande cambiamento, senza chiederlo (regola in `CLAUDE.md`).
- Dopo l'approvazione del piano procede in autonomia fino alla costruzione completa e perfetta (test, uso reale, push e merge).
- Vuole vedere il meno possibile: costruzione, test e fix autonomi fino a risultato funzionante; gli si mostra l'esito.
- Non consuma caffeina. Si alza subito dopo la sveglia → NFC non necessario.
- Vuole molti grafici e insight.

## 🔔 Promemoria per l'utente
- **A fine costruzione dell'app (dopo il deploy funzionante)**: ricordare all'utente di creare una routine settimanale (scheduled task) in cui Claude controlla lo stato del progetto (deploy Vercel, errori runtime, advisor Supabase, dati in arrivo, AI gateway, dipendenze). Proporla e configurarla solo con il suo ok.
