# HANDOFF — Sleep Tracker (stato al 2026-10-25, dopo il collaudo)

Documento di passaggio per una nuova chat. Leggi prima `CLAUDE.md`, poi questo file, poi `MEMORY.md`. Nessun segreto qui dentro: i valori stanno solo nelle variabili d'ambiente di Vercel/Supabase.

## 1. In una riga
App personale per tracciare il sonno (PWA Next.js, italiano, utente unico), **costruita, mergiata su `main` (PR #11) e online**. Il **collaudo in produzione è fatto** (§13); restano le prove su dispositivo reale (§11) e qualche rifinitura nota (§9).

## 2. Dove vive
| Cosa | Dove |
|---|---|
| App (produzione) | `https://sleep-tracker-app-nu.vercel.app` (alias: `https://sleep-tracker-app-simone-dr-s-projects.vercel.app`) |
| Progetto Vercel app | `sleep-tracker-app` · `prj_yi8lBL7dwpuncrSxYxSr5m7a5Zgd` · team `team_7cA5Y1PcLGxH0Rcb6HXHzwHx` · root `app` · anteprime disattivate · produzione da `main` |
| Gateway AI (progetto separato, solo API: la radice dà 404, è normale) | `https://sleep-tracker-simone-dr-s-projects.vercel.app` · progetto `sleep-tracker` · `prj_rPEEkueywddcJBwVPKriwwwRfZFI` · root `gateway` |
| Database | Supabase `sleep-tracker` · ref `bpsvvltrhlqvpxhjjrfy` · eu-central-1 · `https://bpsvvltrhlqvpxhjjrfy.supabase.co`. **Non toccare** il progetto finanze `aedoncqvypsrksnqiwgh`. |
| Repo | `Simooo1010/sleep-tracker` (GitHub). Flusso: branch → PR in bozza → CI → merge; niente push su `main`. |
| Design system | `docs/DESIGN.md`, `docs/design/` (artefatti nei link di `MEMORY.md`) |

Attenzione agli URL: aprire l'indirizzo del progetto `sleep-tracker` (gateway) dà "pagina non trovata". L'app è `sleep-tracker-app`.

## 3. Architettura
```
iPhone (Comandi iOS) ──POST /api/events (Bearer st_…)──▶ ┐
Browser/PWA ──(cookie di sessione firmato)──▶ Next.js 16 (Vercel) ──▶ Supabase (Postgres, solo service role, RLS senza policy)
                                                    └─▶ gateway AI (/v1/insights, Bearer GATEWAY_SECRET) ─▶ Groq…  (riserva: regole locali)
```
- **Un solo utente.** Accesso con password (`APP_LOGIN_PASSWORD`), fail-closed: se la variabile manca o ha < 12 caratteri, l'app mostra solo "Accesso non configurato".
- **Tutti i dati passano dal server** con la chiave `service_role`. Il browser non parla mai con Supabase. Le tabelle hanno RLS attiva e nessuna policy.
- **Fuso fisso Europe/Rome.** "Data notte" = giorno locale del risveglio. Asse del letto = minuti dalle 18:00.
- **Provenienza su ogni valore**: automatico / confermato / stimato / mancante. Nessun dato obbligatorio.
- **Ordine dei segnali**: letto = Riposo (`bedtime_candidate`) → check serale → stima; risveglio = sveglia interrotta (`wake`) → prima apertura app (`app_open`, limite superiore) → stima.

## 4. Mappa del codice (`app/`)
- `src/domain/` — logica pura (12 moduli + `time.ts`, `types.ts`, `index.ts`): ricostruzione notte, stima, baseline mediana 14 g, scarti ±30 min, deriva, social jet lag (notti ven+sab = nightDate sab/dom), debito, correlazioni, sonnellini, previsione, domande, salute segnali. Spec: `docs/design/system/Dati-e-calcoli.md`, `docs/PROJECT.md` §3c/§5b/§5c.
- `src/server/` — `types.ts` (interfaccia `Repo`), `repo-supabase.ts` (produzione), `memory-repo.ts` (solo sviluppo/test), `repo-factory.ts`, `ingest.ts`, `events-schema.ts` (Zod), `token.ts`, `mutations.ts` (scritture dell'utente), `insights.ts` (gateway + regole), `seed.ts` (dati demo), `views/` (view model pure per ogni schermata), `pages/` (loader per pagina).
- `src/lib/` — `auth.ts` (modi off/closed/on, cookie firmato, pepper derivato), `auth-server.ts`, `clock.ts` (`getNow()`: unica fonte dell'ora), `theme.ts`.
- `src/proxy.ts` — protezione di tutte le pagine (eccetto `/login`, `/api/events`, asset pubblici); le richieste non-GET senza sessione danno 401.
- `src/app/` — pagine: `/` (Notte), `/sera`, `/regolarita`, `/grafici`, `/storico`, `/segnali`, `/impostazioni`, `/login`; `actions.ts` (Server Actions con controllo accesso); `api/events/route.ts`.
- `src/components/` — 25 componenti del design system + `AppShell`. Stili locali in `*.module.css` con sole variabili di `tokens.css`.
- `supabase/migrations/` — schema applicato. Altre migrazioni applicate: log del gateway (`gateway/supabase/migrations/…ai_gateway_log.sql`) e `night_exceptions_slug_idx`.
- Test: `test/` (Vitest) ed `e2e/` (Playwright). `gateway/` è un progetto a parte, non modificato.

## 5. Comandi utili
Da `app/` (Node 26 in locale e CI; runtime Vercel 24.x, il massimo offerto da Vercel; per **aggiungere dipendenze** usa `npx npm@11 install …`, npm 10 non riesce a creare il lockfile):
- `npm run check` = typecheck + lint (0 avvisi) + Vitest (≈1500 test).
- `npm run build`.
- `npx playwright test --reporter=line` — progetti `iphone` (390×844 DPR3, Chromium con emulazione: WebKit non è installato nel cloud), `desktop` (1280×800), `uhd` (3840×2160), `auth` (secondo server sulla porta 3101 con password di prova). `workers: 1` per via del repo in memoria condiviso. Avviare **un solo** Playwright/`next dev` alla volta nella stessa cartella.
- Modalità demo locale: variabili `APP_DATA_MODE=memory APP_SEED=demo APP_FIXED_NOW=2026-10-24T08:30:00+02:00 APP_AUTH=off` (solo con `NODE_ENV!=='production'`; sono già impostate dal webServer di Playwright).
- `npm run sync:design` copia `tokens.css`/`bundle.css` da `docs/design/` (c'è un test che fallisce se divergono).

## 6. Variabili d'ambiente (solo nomi)
Progetto `sleep-tracker-app`, ambiente Production:
- `NEXT_PUBLIC_SUPABASE_URL` ✅ (pubblica) · `GATEWAY_URL` ✅ (pubblica)
- `APP_LOGIN_PASSWORD` ✅ (segreta; il pannello Vercel non mostra mai il valore delle variabili "Sensitive")
- `SUPABASE_SERVICE_ROLE_KEY` ✅ inserita dall'utente (da confermare con il collaudo: se le pagine mostrano "servizio dati non raggiungibile" il valore è sbagliato)
- `INGEST_TOKEN_PEPPER` — **non impostata**: il pepper si deriva da `APP_LOGIN_PASSWORD`. **Cambiare la password invalida tutti i token dei Comandi e le sessioni** (vanno ricreati da Impostazioni). Per evitarlo, impostare `INGEST_TOKEN_PEPPER` (≥16 caratteri) una volta per tutte.
- `GATEWAY_SECRET` — **non impostata** nell'app: gli insight usano le regole locali (badge "Regole"). Per l'AI vera: stesso valore nuovo su `sleep-tracker` (gateway) e `sleep-tracker-app`, rideploy di entrambi, verifica `GET /v1/health` (docs/AI_GATEWAY.md §13). Il valore attuale del gateway non lo conosce nessuno.
- Ogni modifica alle variabili richiede un **nuovo deploy** (Vercel → Deployments → Redeploy, oppure tool MCP `create_deployment` con `deploymentId`).

## 7. Cosa è verificato e cosa no
**Verificato**
- 1488 test unitari + 152 E2E (iPhone/desktop/4K/auth), `tsc`, lint a 0 avvisi, `next build`, CI GitHub verde sul merge.
- In produzione: `/login` mostra il form; `/` reindirizza a `/login`; log runtime senza errori dopo il primo accesso dell'utente.
- Database: 10 tabelle + `ai_gateway_log`, RLS attiva senza policy, advisor sicurezza senza avvisi reali (solo INFO "RLS senza policy": voluto).
- Gli E2E girano su dati demo in memoria.

**NON verificato — da collaudare**
1. **Il codice `repo-supabase.ts` contro il database vero.** È stato testato solo con un client finto (i test di integrazione `describe.skipIf(!SUPABASE_TEST_URL)` sono saltati). Rischio principale: dettagli di PostgREST (upsert/`onConflict`, formati `timestamptz`, ordinamenti, `maybeSingle`, vincoli). Se qualcosa dà "Il servizio dati non è raggiungibile" o errori generici: guardare `get_runtime_errors` / `get_runtime_logs` di Vercel e correggere `app/src/server/repo-supabase.ts` (+ test).
2. **I Comandi iOS** (non testabili dal cloud): guida in `docs/COMANDI_IOS.md`, mai provata su un telefono. Il contratto di `POST /api/events` è però coperto da 24+ test e da E2E.
3. **Gateway AI dall'app** (finora solo con un gateway finto).
4. **Controllo visivo su telefono vero**, tema scuro, installazione PWA ("Aggiungi alla schermata Home"), 4K reale.

## 8. Piano di collaudo suggerito
1. **Accesso**: apri l'app, password sbagliata → "Password non corretta."; password giusta → home Notte. Uscita da Impostazioni → "Esci". Prova dopo un rideploy a riaprire una scheda vecchia (un invio da una pagina caricata prima del deploy dà un errore innocuo "Server Action non trovata": ricarica).
2. **Token e API**: Impostazioni → crea token (visibile una sola volta) → prova:
   `curl -X POST <URL>/api/events -H "Authorization: Bearer st_…" -H "content-type: application/json" -d '{"type":"bedtime_candidate"}'` (200 `{ok:true,…}`); senza token → 401; JSON malformato/campi extra → 400; stesso `idempotencyKey` due volte → `duplicate:true`; body > 16 KB → 413.
3. **Giornata tipo** (con `ts` espliciti, entro 7 giorni): `bedtime_candidate` sera → `evening_check` (con `check`) → `wake` mattina → in Notte compare la notte "Stimata" con spiegazione; Conferma / Correggi orari (±5 min) / Annulla; voto energia; domande rapide (max 3, "Salta"); chip eccezioni; sonnellino Inizia/Termina.
4. **Giornata "disastro"**: nessun segnale, solo `app_open`, solo `evening_check` → nessun errore, niente rimproveri, dati "Mancante"/"Stimata".
5. **Sera** (`/sera`): wizard a passi su telefono, nessun passo obbligatorio, "Vado a dormire" salva; check già salvato precompilato.
6. **Dati su più giorni** (servono ≥14 notti per correlazioni, ≥5 per mediana): inserisci notti via API/Notte per riempire Regolarità, Grafici, Storico; controlla copertura ("9 su 14 notti") e frasi di soglia sotto i minimi.
7. **Segnali**: stati Attivo/Da configurare/In pausa, registro, un solo avviso neutro.
8. **Tema chiaro/scuro**, 390×844, tablet, 1280, 4K; nessuno scroll orizzontale (anche a 320 px); una sola azione piena per schermata; contrasti.
9. **Sicurezza**: pagine e Server Actions senza cookie → redirect/401; `/api/events` senza token → 401; nessun segreto in pagina/rete; token mai visibile dopo la creazione; `get_advisors` Supabase (security) pulito.
10. **Insight**: senza `GATEWAY_SECRET` → badge "Regole"; con gateway collegato → badge "AI" e `GET /v1/health` ok. Al gateway vanno solo statistiche aggregate (test: nessuna data/timestamp nel payload).
11. **Comandi iOS** secondo `docs/COMANDI_IOS.md`; verifica che arrivino in "Segnali".

## 9. Problemi noti e debito tecnico (candidati alle prime correzioni)
- `app/src/app/grafici/mapping.ts` rilegge in numeri i **testi** dei view model (la view non espone i valori): fragile se cambiano i formati.
- `Logo` esiste ma non è usato nelle pagine (il marchio nel guscio è solo testo); l'icona PWA c'è.
- Avviso "segnale in pausa": `alreadyWarned` non è persistito → l'avviso riappare a ogni visita.
- Annulla della conferma disponibile solo nella stessa sessione (il `previous` resta in memoria client). Annulla del sonnellino ripristina solo lo stato locale.
- `NightBars` ricostruisce i minuti dalle percentuali; fuori asse 21–11 si perde l'orario reale nel riassunto accessibile.
- Il riepilogo del check serale non riceve `alarmMin` (orario sveglia) → manca nel messaggio finale.
- Il test E2E di Playwright non copre WebKit reale; il Chromium emula l'iPhone.
- `getRepo()` crea il client Supabase una volta per processo (singleton in modulo); ok in serverless, da tenere d'occhio.
- Le variabili Vercel "Sensitive" non sono leggibili: per verificare un valore si guarda il comportamento dell'app.
- La CI non gira sulle PR in bozza; per attivarla segna la PR "Ready for review". Anteprime Vercel disattivate (solo produzione da `main`).
- Possibili miglioramenti: notifiche di recupero; persistenza di `questions_log` per il budget oltre il giorno; cache insight (`insights_cache` esiste ma non è usata); routine settimanale di controllo (vedi §11).

## 9b. PRESTAZIONI — risolte in PR #13 (misure in §13; testo originale della diagnosi)
L'utente riferisce che **cambiare sezione è lento**: dopo il tocco la nuova schermata compare dopo 1–2 secondi, l'app sembra poco reattiva. Obiettivi del collaudo: **massima velocità percepita e massima risoluzione/nitidezza, senza ridurre sicurezza ed efficienza.** Misurare prima e dopo ogni ottimizzazione.
Cause già individuate (non ancora corrette nel codice):
- Tutte le pagine sono `force-dynamic` (render del server a ogni navigazione) e **non esiste nessun `loading.tsx`**: nessuna schermata di attesa né prefetch utile per le rotte dinamiche → il tocco non dà feedback finché non arriva tutto.
- La voce di navigazione si evidenzia solo a navigazione finita (nessuno stato "in attesa" ottimistico).
- Nessuna cache del router lato client (`experimental.staleTimes` non impostato): tornare su una sezione appena vista rifà il giro completo.
- I loader in `app/src/server/pages/*.ts` fanno letture al database **in sequenza** (da parallelizzare con `Promise.all`).
- Regione delle funzioni: era `iad1` (Washington) con il database a Francoforte (`eu-central-1`). **Già cambiata** nel progetto Vercel a `fra1` (impostazione `resourceConfig.functionDefaultRegions`, vale dal deploy successivo): verificare nei log che le funzioni girino davvero a `fra1`.
- Da controllare: peso del JavaScript per pagina (tabella `next build`), client component grandi caricabili in differita, `font-display`, `touch-action: manipulation` e stato `:active` immediato sugli elementi interattivi, transizioni lunghe sulla navigazione, lavoro del `proxy.ts` per ogni richiesta.
- Idee per la risposta al tocco: scheletri di caricamento per rotta (`loading.tsx`) nello stile del design system, voce di navigazione attiva subito, `staleTimes` (con `revalidatePath` già presente nelle Server Actions per invalidare dopo le scritture), prefetch dei link, aggiornamenti ottimistici sulle azioni.
- Obiettivi indicativi: feedback al tocco < 100 ms, contenuto della nuova sezione < ~300 ms con dati in cache regionale, pagina interattiva < 1 s su 4G; Lighthouse/Web Vitals (INP, LCP, CLS) su emulazione iPhone.
- Alta risoluzione: tutto vettoriale, icone/logo SVG, icone PWA 180/192/512, testo in `rem`, linee da 1 px, screenshot a 390×844 DPR3, 1280×800 DPR2, 3840×2160 in entrambi i temi, ingrandendo i dettagli.

## 10. Regole di processo (vedi `CLAUDE.md`)
- Piano → design system → UI → codice → test → deploy; MEMORY.md e `docs/` sono la fonte di verità: aggiornali.
- Subagent: attività piccole, file disgiunti, in parallelo; contratto/tipi definiti prima. **Per la chat di costruzione l'utente ha chiesto: Sonnet costruisce quando l'obiettivo è definito, Opus solo per compiti di altissimo livello; sforzo massimo `high` (Opus `low`/`medium`).** Un solo agente alla volta usa Playwright.
- Sicurezza: mai segreti nel repo; azioni distruttive (drop, delete progetto) sempre confermate. Il sistema blocca (giustamente) la lettura di segreti generati nel contesto: l'utente li imposta a mano o autorizza esplicitamente.
- Branch → PR in bozza → merge. Ogni commit WIP va pushato (hook di stop), ma la CI parte solo quando la PR esce da bozza.
- L'utente vuole: pochi passaggi manuali, esiti mostrati (non i dettagli), molti grafici/insight, risposte in italiano, schiette; non beve caffè, si alza subito dopo la sveglia (niente NFC nella v1).

## 11. Per l'utente (azioni manuali rimaste)
1. (Se non già fatto) rideploy dopo aver impostato `SUPABASE_SERVICE_ROLE_KEY` nel progetto **`sleep-tracker-app`**.
2. iPhone: Comandi/automazioni (guida `docs/COMANDI_IOS.md`) e PWA in Home.
3. Opzionale: `GATEWAY_SECRET` condiviso per insight AI; `INGEST_TOKEN_PEPPER` fisso per non perdere i token se si cambia la password.
4. Opzionale: routine settimanale di controllo (deploy Vercel, errori runtime, advisor Supabase, dati in arrivo, gateway, dipendenze): proporre e creare solo con il suo ok.
5. Opzionale: modalità "Auto" nel menu permessi o `.claude/settings.json` con `permissions.allow`.

## 12. Cronologia essenziale
PR #1–#6 definizione e spec · #7 design system · #8–#10 gateway AI · **#11 app v1** (Slice 0–7 + accesso + Impostazioni). Dopo il merge: progetto Vercel app, variabili, redeploy; aggiunta "Mostra password" nel login (branch `claude/login-mostra-password`). Decisioni dettagliate: `docs/DECISIONS.md`.

## 13. Collaudo del 2026-10-25 (esito)
**Cicli**: ciclo 1 con 1 difetto corretto; cicli 2 e 3 consecutivi a zero difetti.
**Corretti**: PR #13 velocità (nav ottimistica, `loading.tsx`, `staleTimes`, `touch-action`); PR #14 barra in alto su telefono (la regola `.action` perdeva contro `.btn`: pulsanti troppo grandi su 2 righe), con test di regressione in `e2e/shell.spec.ts`.
**Misure** (390 px, CPU 4x, 4G, produzione): feedback al tocco 360–700 ms → 15–35 ms; contenuto già visitato 360–520 ms → ~40 ms; prima visita ~600–850 ms (limite del server, funzioni a fra1). Non misurati Lighthouse/INP/LCP.
**Verificato in produzione**: 7 pagine × 6 viewport (320, 390, 768, 1280, 1920, 4K) × 2 temi, senza overflow, `undefined`/`NaN` ed errori console; zoom del testo 200% a 320 e 390 senza overflow; focus visibile; /api/events con ~25 input ostili (400/401/413 corretti, 10 invii paralleli = 1 solo evento); Server Action senza cookie 401; 28 notti di prova con buchi, weekend, eccezioni, sonnellini e notte DST 24→25 ott (9 h corrette); doppi click su Notte e Sera senza errori; advisor Supabase solo INFO; nessun errore runtime.
**Pulizia**: eliminate solo le righe di prova (18 eventi `test-…`, 25 notti, 6 sonnellini, 11 check, 2 eccezioni, 1 domanda, token "collaudo"); contatori `exception_types.uses` invariati (0); tabelle tornate allo stato iniziale.
**Aperto/non fatto**: sotto 320 px (es. 195 px) i badge non vanno a capo (fuori dal minimo WCAG, non corretto); `getRepo` singleton, `mapping.ts` fragile e gli altri punti di §9 invariati; i Comandi iOS e l'installazione PWA su iPhone reale restano da provare (§11); gateway AI non collegato (`GATEWAY_SECRET`).

**Aggiunte dopo il collaudo (PR safe-area/tema)**: zone sicure iPhone (`--safe-top`/`--safe-bottom` in `app.css`; il test e2e le forza perché Chromium non emula `env()`), tema automatico senza interruttore nel guscio e sezione Impostazioni > Aspetto. Da verificare su iPhone vero: titolo non coperto dall'ora, pillola vicina al bordo senza toccare l'indicatore home.

**Cambio d'ora legale (PR cambio-ora)**: `src/domain/clock-change.ts` (`clockChangeShiftMin(nightDate)` = +60 / −60 / 0, calcolato dalla data: vale anche per i dati già presenti e per i cambi futuri). Mostrato in Notte (nota nella scheda Stanotte), Sera (avviso la sera prima), Storico (segno vettoriale a orologio nella cella, nome accessibile, tag e frase nel dettaglio, voce in legenda), Regolarità e Grafici (frase sotto il grafico; barra marcata nei Grafici). Test: `test/domain/clock-change.test.ts`, `test/server/clock-change-everywhere.test.tsx`, e2e `history.spec.ts`.
