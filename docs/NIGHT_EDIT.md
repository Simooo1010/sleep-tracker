# Modifica notte dallo Storico

Stato: implementata e verificata in locale (2026-11-25): 1685 test unitari, 187 E2E (iphone/desktop/uhd/auth) verdi. Contratto di tipi: `app/src/server/night-edit-contract.ts`.

## Perché
Oggi la correzione di una notte esiste solo per **stanotte** (pagina Notte). Se per più giorni di fila non si apre il tracker, quelle notti restano `stimata` o `mancante` e non si possono più sistemare. La funzione permette di aprire **qualsiasi notte passata** dallo Storico e completarla o correggerla in una schermata dedicata, anche a distanza di più notti. Principio di prodotto: nessun campo obbligatorio, si cambia solo ciò che si vuole.

## Comportamento
1. **Ingresso**: nel dettaglio di un giorno dello Storico c'è il pulsante `Modifica notte` (peach, unico pieno della scheda). Apre `/storico/YYYY-MM-DD`.
2. **«Da sistemare»**: sotto il calendario, elenco delle notti **degli ultimi 14 giorni (da ieri)** `mancante` o `stimata`, ciascuna è un link alla sua modifica. Se non ce ne sono, la sezione non compare. Serve proprio a chi ha saltato più giornate.
3. **Schermata di modifica** (`/storico/[date]`, solo date passate o di oggi, valide; altrimenti 404):
   - Intestazione: `Indietro` (torna a `/storico?m=…&d=…`), titolo `Notte del 24 ottobre`, badge di stato, durata.
   - **Orari**: due campi `Sono andato a letto` / `Mi sono svegliato` (ora nativa 24 h, `TimeInput`). Se mancano, partono da un valore suggerito (mediana delle notti recenti, altrimenti 23:30 / 07:30) ma restano «mancanti» finché non si salva.
   - **Qualità** e **Energia**: `MoonRating`, con `Togli il voto` per rimuoverlo.
   - **Giornata particolare**: `ExceptionChips` (inclusi `+ Aggiungi`).
   - **Sera prima** (`Sera di venerdì 23 ottobre`): stanchezza (`MoonRating`), umore (chip), fattori (chip), nota sulla giornata (`TextField`, max 280).
   - Sonnellino del giorno: sola lettura.
   - **Un solo pulsante pieno**: `Salva notte`. Nessun salvataggio automatico. Nessun campo obbligatorio.
   - Frecce `Notte prima` / `Notte dopo` per passare alla notte vicina senza tornare al calendario; se ci sono modifiche non salvate si chiede conferma con le parole (`Hai modifiche non salvate. Salvarle prima di spostarti?` → `Salva e vai`, `Vai senza salvare`).
4. **Salvataggio** (`actionSaveNightDetails`): invia solo i campi cambiati. Esito: messaggio calmo `Notte salvata.` con link `Torna allo Storico`; in errore `Non sono riuscito a salvare. Le tue modifiche sono ancora qui: riprova.`
5. **Provenienza**: orari salvati → `confermato` (la notte diventa `confermata`); voti → `confermato`; valori rimossi → `mancante`. Le notti stimate non cambiano stato se si tocca solo qualità/energia/fattori.
6. **Coerenza dati**: i fattori della sera sono salvati sia nel check serale (data − 1) sia in `Night.factors`; gli imprevisti aggiornano `night_exceptions` + `isException` (contatore d'uso dei tipi). Le statistiche, la regolarità e gli insight leggono già questi dati: non serve altro.

## Fuori ambito (v1)
- Modifica dei sonnellini dalla schermata (sola lettura).
- Eliminare del tutto una notte; creare notti future.
- Modifiche in blocco su più notti.

## Sicurezza e vincoli
- Stessa regola di tutte le azioni: sessione verificata, input validato con Zod `strictObject`, nessun dettaglio interno negli errori.
- `nightDate` non nel futuro (confronto con oggi a Roma, `todayInRome`), anno ≥ 2000.
- Orari: letto prima della sveglia, durata ≤ 16 h (stesse regole di `confirmNight`).
- La nota giornata resta soggetta all'eccezione AI già documentata (`dayContext`, `docs/AI_GATEWAY.md` §8): nessun cambiamento.

## Architettura e file
| Parte | File |
| --- | --- |
| Contratto | `app/src/server/night-edit-contract.ts` |
| Mutation | `app/src/server/night-edit.ts` (`saveNightDetails`) |
| Action | `app/src/app/actions.ts` (`actionSaveNightDetails`) |
| View | `app/src/server/views/night-edit.ts` (`buildNightEditView`) |
| Pagina dati | `app/src/server/pages/night-edit.ts` (`loadNightEditPage`) |
| Componente | `app/src/components/TimeInput.tsx` (+ `.module.css`) |
| Schermata | `app/src/app/storico/[date]/page.tsx`, `NightEditScreen.tsx`, `.module.css` |
| Storico | `HistoryScreen.tsx` (pulsante, «Da sistemare»), `views/history.ts`, `pages/history.ts` |
| Test | `app/test/…` (unit) e `app/e2e/night-edit.spec.ts` |

## Note di implementazione
- `MoonRating` ha la nuova prop facoltativa `subject` (etichette delle singole lune, es. «Qualità 3 di 5»).
- `TimeInput` è un'aggiunta al design system: campo orario nativo 24 h con parola «Mancante» e pulsante `Usa HH:MM` col valore suggerito. Serve a compilare notti lontane senza premere cinquanta volte `+` del `TimeStepper` (che resta nella pagina Notte).
- Nessuna migrazione di database: usa le tabelle esistenti (`nights`, `evening_checks`, `night_exceptions`).
- E2E: i campi orario si riempiono solo dopo l'idratazione di React (`fillTime` in `e2e/night-edit.spec.ts`).
