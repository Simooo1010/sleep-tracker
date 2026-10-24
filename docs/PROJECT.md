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

## 4. Architettura proposta (da confermare)
- **v1**: Web app/PWA (Next.js) su Vercel + Supabase (Postgres, auth, edge functions). Ingestione tramite endpoint API chiamati dalle automazioni Comandi iOS (che possono anche leggere i campioni di sonno da Salute).
  - Pro: niente Apple Developer Program, niente App Store, deploy automatizzabile.
  - Contro: nessun accesso diretto a HealthKit dalla PWA (mitigato da Comandi).
- **v2 (eventuale)**: app nativa SwiftUI con HealthKit, widget, background delivery.
- **AI**: Claude via API, analisi periodica (settimanale) + insight su richiesta.

## 5. Funzionalità (backlog iniziale)
- Registro sessioni di sonno (inizio, fine, fonte, confidenza).
- Statistiche: durata, regolarità (orari), debito di sonno, trend.
- Insight AI personalizzati.
- Notifiche di recupero ("Ieri sera sembra tu sia andato a letto alle 00:40 — confermi?") in un momento della giornata in cui il telefono si usa davvero.

## 6. Domande aperte
Vedi la chat di definizione; le risposte vanno riportate in `docs/DECISIONS.md`.

## 7. Accessi
- GitHub: ok (repo `simooo1010/sleep-tracker`).
- Vercel: ok via MCP.
- Supabase: nessun connettore attivo in questa sessione — da collegare.
