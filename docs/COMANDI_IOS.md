# Comandi iOS — guida

Cinque Comandi (app **Comandi**) e tre automazioni. Tempo: circa 20 minuti la prima volta.

**Legenda.** Ogni passo è marcato così:
- **[codice]**: verificato nel codice dell'app (contratto API, testi della pagina Impostazioni e della Sera, valori dei sonnellini).
- **[iOS 27]**: nome o comportamento di iOS che non ho potuto controllare sul telefono. Se non corrisponde, cerca l'azione con la lente dentro Comandi e segnala la differenza a Claude.

## Prima di iniziare

1. iPhone con iOS 27 e l'app **Comandi** (di serie).
2. **`<URL_APP>`**: l'indirizzo dell'app, senza barra finale. In **Impostazioni** l'app mostra l'indirizzo completo `<URL_APP>/api/events`, già pronto da copiare. [codice]
3. **`<TOKEN>`**: la chiave che autorizza i Comandi. Inizia con `st_`. Si crea dall'app:
   1. Apri l'app e accedi con la tua password.
   2. Tocca **Impostazioni** (in alto su telefono, nella barra laterale su PC) e apri **Token per i Comandi**. [codice]
   3. Lascia l'etichetta `iPhone` (o scrivine una tua) e tocca **Crea token**. [codice]
   4. Tocca **Copia** e incollalo subito in Note o in un gestore di password. L'app dice «Copialo adesso: non lo rivedrai». Il server conserva solo un'impronta. [codice]

   **Revoca** (se perdi il token o pensi che qualcuno l'abbia visto): in Impostazioni tocca **Revoca**, poi **Conferma revoca**. Il token vecchio smette di funzionare subito: sostituiscilo anche nei Comandi. [codice]

Dove tenerlo:
- Salvalo subito in Note o in un gestore di password.
- Non incollarlo in chat, nel repo o in uno screenshot.
- Dentro i Comandi resta in chiaro. Non usare **Condividi Comando** con altri: il file conterrebbe il token.

In questo file `<URL_APP>` e `<TOKEN>` sono segnaposto. Li sostituisci tu sul telefono.

## Il contratto (uguale per tutti i Comandi)

Tutti i Comandi usano l'azione **Ottieni contenuti URL**. [iOS 27]

- **URL:** `<URL_APP>/api/events`
- **Metodo:** `POST`
- **Intestazioni:**
  - `Authorization` = `Bearer <TOKEN>` (uno spazio dopo `Bearer`, nessuna virgoletta). [codice]
  - `Content-Type`: non serve impostarlo. Con un corpo Dizionario iOS invia JSON. [iOS 27, da verificare]
- **Corpo della richiesta:** scegli **Dizionario** e aggiungi i campi con **Aggiungi nuovo campo**.

**Non scrivere il JSON come testo con le variabili dentro** (per esempio `"factors": ["<Fattori>"]` scritto a mano): un elenco inserito come testo non diventa un array valido. Ogni campo ha un tipo, indicato nelle tabelle qui sotto.

### Campi del corpo [codice]

| Campo | Tipo in Comandi | Obbligatorio | Valori ammessi |
|---|---|---|---|
| `type` | Testo | sì | `wake`, `bedtime_candidate`, `evening_check`, `nap_start`, `nap_end`, `app_open` |
| `ts` | Testo | no | data e ora ISO 8601 **con fuso** (`Z` oppure `+02:00`). Senza fuso: 400. Non più di 5 minuti nel futuro, non più di 7 giorni nel passato. Se manca, vale l'ora di arrivo |
| `idempotencyKey` | Testo | no | da 8 a 100 caratteri: lettere, cifre, `: _ . -`. Senza spazi |
| `check` | Dizionario | solo con `evening_check` | vedi sotto |

Dentro `check` (tutti facoltativi):

| Campo | Tipo | Valori |
|---|---|---|
| `tiredness` | Testo | intero da 1 a 5 |
| `mood` | Testo | intero da 1 a 5 |
| `factors` | Elenco | etichette in minuscolo con trattini, max 12 voci, max 40 caratteri l'una |
| `napMinutesToday` | Testo | intero da 0 a 600 |
| `dayNote` | Testo | testo libero, max 280 caratteri. Facoltativo: i Comandi di questa guida non lo inviano. Lo scrivi nella Sera dell'app |

Regole generali [codice]:
- I numeri si possono inviare come testo (`"3"`): l'app li accetta.
- Un campo vuoto o non valorizzato viene trattato come assente.
- Campi non previsti vengono rifiutati con 400.

### Come costruire il corpo, passo per passo

1. Azione **Ottieni contenuti URL**.
2. **URL**: `<URL_APP>/api/events`.
3. **Metodo**: `POST`.
4. **Intestazioni**: aggiungi `Authorization` con valore `Bearer <TOKEN>`.
5. **Corpo della richiesta**: scegli **JSON** e poi **Dizionario** come tipo dei campi. Se nella tua versione il corpo si chiama diversamente, cerca l'opzione che permette di aggiungere campi con tipi. [iOS 27, da verificare]
6. Per ogni campo della tabella: **Aggiungi nuovo campo**, scegli il nome e il tipo, poi inserisci il valore (testo fisso o variabile).

## Due pezzi all'inizio di ogni Comando

Mettili prima di **Ottieni contenuti URL**, in ogni Comando.

**Pezzo A: l'ora (`Ts`)**
1. Azione **Data corrente**.
2. Azione **Formatta data**: formato **Personalizzato**, scrivi esattamente `yyyy-MM-dd'T'HH:mm:ssXXX`. [iOS 27, da confermare]
   - Perché non ISO 8601: l'opzione ISO 8601 di iOS potrebbe non includere il fuso, e il server lo richiede. `XXX` produce `+02:00`, oppure `Z` in UTC.
   - Prova: se un Comando dà 400 con un messaggio sul fuso, prova al suo posto **ISO 8601** e controlla il risultato.
3. **Imposta variabile**: nome `Ts`.

**Pezzo B: il giorno (`Giorno`)**
1. Azione **Data corrente**.
2. Azione **Formatta data**: formato **Personalizzato**, `yyyy-MM-dd`. [iOS 27]
3. **Imposta variabile**: nome `Giorno`.

### Trucco per fare in fretta
Costruisci bene il primo Comando (Sveglia). Per gli altri usa **Duplica** e cambia `type` e la chiave. Il token lo scrivi una volta sola, nel primo.

## I cinque Comandi

### a) Sveglia interrotta → `wake`

Comando "Sveglia":

1. Pezzo A e Pezzo B.
2. **Ottieni contenuti URL** (vedi sopra), corpo Dizionario:

| Campo | Tipo | Valore |
|---|---|---|
| `type` | Testo | `wake` |
| `ts` | Testo | variabile `Ts` |
| `idempotencyKey` | Testo | `wake-` seguito dalla variabile `Giorno` |

Il risveglio vale per la notte solo tra le **03:00 e le 14:00** [codice]. Fuori da quella fascia l'evento viene salvato, ma non entra in nessuna notte: la risposta arriva comunque con `nightDate: null`.

Automazione:
1. **Comandi** → **Automazione** → **+** → **Sveglia**. [iOS 27]
2. Scegli **Viene fermata** (la sveglia che usi di solito). [iOS 27]
3. **Avanti** → **Esegui Comando** → "Sveglia".
4. Scegli **Esegui subito**. Spegni **Notifica quando viene eseguita**. [iOS 27]

Se la sveglia suona due volte (rinvio), la seconda richiesta ha la stessa chiave e viene riconosciuta come duplicato. È corretto.

### b) Riposo attivato → `bedtime_candidate`

Comando "Riposo":

1. Pezzo A e Pezzo B.
2. **Ottieni contenuti URL**, corpo Dizionario:

| Campo | Tipo | Valore |
|---|---|---|
| `type` | Testo | `bedtime_candidate` |
| `ts` | Testo | variabile `Ts` |
| `idempotencyKey` | Testo | `bedtime-` seguito dalla variabile `Giorno` |

Automazione:
1. **Automazione** → **+** → **Focus** (in alcune versioni **Full Immersion**). [iOS 27]
2. Scegli **Riposo** → **Si attiva**.
3. **Esegui Comando** → "Riposo" → **Esegui subito**. Spegni **Notifica quando viene eseguita**.

Se Riposo si attiva senza rete, iOS non ritenta: il segnale va perso. Rilancia il Comando "Riposo" a mano appena torni in rete. Il duplicato è impedito dalla chiave.

### c) Check serale + Riposo, in un solo Comando

Comando "Sera". Fa quattro domande, invia il check e attiva Riposo.

1. **Scegli dal menu**, prompt `Stanchezza (1 poco, 5 tanto)`. Opzioni `1`, `2`, `3`, `4`, `5`. Sotto ogni opzione: **Testo** con il numero → **Imposta variabile** `Stanchezza`. [codice: la pagina Sera mostra «Stanchezza N di 5»]
2. **Scegli dal menu**, prompt `Umore`. Opzioni con il testo esatto dell'app, ciascuna con il numero corrispondente: `1 Pesante`, `2 Così così`, `3 Neutro`, `4 Leggero`, `5 Sereno`. Sotto ogni opzione: **Testo** con solo il numero (`1`…`5`) → **Imposta variabile** `Umore`. [codice]
3. **Scegli dall'elenco**, prompt `Fattori di oggi`, attiva **Seleziona più elementi**. Voci (testo esatto, minuscolo, con trattini) [codice]:
   - `schermo-a-letto`
   - `sport`
   - `giornata-stressante`
   - `cena-tardi`
   - `alcol`
   - `mal-di-testa`

   **Imposta variabile** `Fattori`. Nessuna selezione: da provare. [iOS 27] Se il Comando si ferma qui, dillo a Claude.
4. **Scegli dal menu**, prompt `Sonnellino oggi?`. Opzioni `Nessuno`, `15 min`, `30 min`, `45 min`, `1 ora`. Sotto ogni opzione: **Testo** con `0`, `15`, `30`, `45`, `60` rispettivamente → **Imposta variabile** `Sonnellino`. [codice]
5. Pezzo A e Pezzo B.
6. **Ottieni contenuti URL**, corpo Dizionario:

| Campo | Tipo | Valore |
|---|---|---|
| `type` | Testo | `evening_check` |
| `ts` | Testo | variabile `Ts` |
| `idempotencyKey` | Testo | `check-` seguito dalla variabile `Giorno` |
| `check` | Dizionario | vedi sotto |

   Dentro `check`:

| Campo | Tipo | Valore |
|---|---|---|
| `tiredness` | Testo | variabile `Stanchezza` |
| `mood` | Testo | variabile `Umore` |
| `factors` | Elenco | variabile `Fattori` |
| `napMinutesToday` | Testo | variabile `Sonnellino` |

7. **Imposta Focus** (o **Imposta Full Immersion**) → **Riposo** → **Attiva**. [iOS 27]

Ordine dei passi 6 e 7, da scegliere:
- **6 poi 7** (come sopra): se sei offline, il check fallisce e Riposo non si accende.
- **7 poi 6**: Riposo si accende sempre. Se sei offline, il check fallisce e va rilanciato a mano. L'automazione di Riposo (b) invia `bedtime_candidate` e, se offline, non ritenta.

Metti il Comando "Sera" nella Home: **Dettagli del Comando** → **Aggiungi alla schermata Home**. [iOS 27]

La nota sulla giornata (`dayNote`) non viene inviata da questo Comando: si scrive nella Sera dell'app. [codice]

### d) Sonnellino rapido → `nap_start` / `nap_end`

Comando "Sonnellino", uno solo:

1. Pezzo A e Pezzo B.
2. **Data corrente** → **Formatta data** → Personalizzato `HHmm` → **Imposta variabile** `Ora`. [iOS 27]
3. **Scegli dal menu**, prompt `Sonnellino`, opzioni `Inizio` e `Fine`.
4. Sotto **Inizio**: **Ottieni contenuti URL**, corpo Dizionario:

| Campo | Tipo | Valore |
|---|---|---|
| `type` | Testo | `nap_start` |
| `ts` | Testo | variabile `Ts` |
| `idempotencyKey` | Testo | `nap-start-` + `Giorno` + `-` + `Ora` |

5. Sotto **Fine**: **Ottieni contenuti URL**, corpo Dizionario con `type` = `nap_end`, `ts` = `Ts`, `idempotencyKey` = `nap-end-` + `Giorno` + `-` + `Ora`.

Regole [codice]: il sonnellino vale se inizio e fine sono nello stesso giorno e dura tra 5 e 240 minuti. Il sonnellino si può anche registrare nel check serale (passo 4 di c): in quel caso viene salvato con un orario segnaposto a mezzogiorno, che viene sostituito se nello stesso giorno c'è un sonnellino con orario reale.

La risposta di `nap_start` e `nap_end` ha sempre `nightDate: null`: è normale.

Metti il Comando nella Home. Due tocchi: apri, scegli.

### e) Prima apertura al mattino → `app_open`

Questo segnale è un **limite superiore**: dice «alle 9:40 ero già sveglio», non l'ora esatta. L'app lo usa solo se manca `wake`. [codice]

Comando "Apertura":

1. Pezzo A e Pezzo B.
2. **Data corrente** → **Formatta data** → Personalizzato `H` (ora senza zero iniziale: `7`, `19`) → **Imposta variabile** `OraDelGiorno`. [iOS 27]
3. **Se** `OraDelGiorno` **è minore di** `12`. [iOS 27: se il confronto non funziona con il testo, usa il numero]
4. Dentro il Se: **Ottieni contenuti URL**, corpo Dizionario:

| Campo | Tipo | Valore |
|---|---|---|
| `type` | Testo | `app_open` |
| `ts` | Testo | variabile `Ts` |
| `idempotencyKey` | Testo | `open-` seguito dalla variabile `Giorno` |

5. **Fine Se**.

Il controllo delle 12 evita di registrare come «mattina» un'apertura del pomeriggio. Come per la sveglia, la finestra 03:00–14:00 vale anche qui [codice].

Automazione:
1. **Automazione** → **+** → **App**.
2. Scegli **Viene aperta** e seleziona l'app che apri di solito per prima al mattino. [iOS 27]
3. **Esegui Comando** → "Apertura" → **Esegui subito**. Spegni **Notifica quando viene eseguita**.

Con la chiave `open-<Giorno>`, le aperture successive dello stesso giorno sono duplicati.

## Chiavi di idempotenza

La chiave evita doppioni se un Comando parte due volte nello stesso giorno. Regole [codice]: 8–100 caratteri, solo lettere, cifre e `: _ . -`, niente spazi. Il giorno si scrive `yyyy-MM-dd`.

| Comando | Chiave | Esempio |
|---|---|---|
| Sveglia | `wake-` + data | `wake-2026-10-24` |
| Riposo | `bedtime-` + data | `bedtime-2026-10-24` |
| Check serale | `check-` + data | `check-2026-10-24` |
| Sonnellino inizio | `nap-start-` + data + `-` + ora | `nap-start-2026-10-24-1415` |
| Sonnellino fine | `nap-end-` + data + `-` + ora | `nap-end-2026-10-24-1445` |
| Prima apertura | `open-` + data | `open-2026-10-24` |

## Come provare

Prova un Comando alla volta.

1. Apri il Comando e toccalo (▶).
2. Per vedere la risposta, aggiungi in fondo **Mostra risultato**. Toglilo quando hai finito, soprattutto nelle automazioni.
3. Risposta attesa [codice]:

```json
{ "ok": true, "duplicate": false, "nightDate": "2026-10-24" }
```

   Per `nap_start` e `nap_end`, `nightDate` è `null`. `duplicate: true` vuol dire che esisteva già un evento con la stessa chiave: non è un errore.
4. Apri l'app → **Segnali** (pulsante in alto su telefono, voce nella barra laterale su PC). [codice] Nella sezione **Ultimi segnali** trovi l'evento appena inviato. Le automazioni passano a **Attivo**. [codice]
5. Le automazioni provale dal vivo: ferma la sveglia, attiva Riposo, apri l'app. Poi guarda di nuovo Segnali.

**Attenzione:** una prova è un dato vero e finisce nei calcoli. Prova nei momenti reali, oppure dimmi di toglierla.

## Errori e rimedi

Il messaggio `error` della risposta è in italiano e dice quale campo non va. [codice]

- **401 «Non autorizzato.»** Il token è sbagliato. Controlla `Bearer`, uno spazio, poi il token. Niente virgolette, niente spazi o a capo alla fine. In dubbio: revoca in Impostazioni e crea un token nuovo.
- **400.** Cause tipiche:
  - `type` diverso dai valori ammessi;
  - `ts` senza fuso (vedi il passo Formatta data del Pezzo A);
  - chiave con meno di 8 caratteri o con spazi;
  - `check` in un Comando diverso da `evening_check`;
  - campo non previsto;
  - orologio del telefono avanti di oltre 5 minuti;
  - voce di `factors` non in minuscolo con trattini.
- **413** «Richiesta troppo grande.» Non dovrebbe accadere con questi Comandi.
- **503 o 500.** Il problema è sul server, non sul telefono. Riprova dopo un minuto. Se resta, dillo a Claude.
- **Nessuna connessione.** iOS non ritenta da solo: il Comando si ferma con un errore. Rilancialo a mano quando torna la rete. È sicuro: la chiave impedisce i doppioni. Attenzione: `Ts` sarà la nuova ora.
- **L'automazione chiede conferma ogni volta.** Apri l'automazione, scegli **Esegui subito**, spegni **Chiedi prima di eseguire**. Se vedi ancora una notifica, spegni **Notifica quando viene eseguita**. [iOS 27]
- **L'automazione non parte.** Controlla che sia attiva (interruttore in Automazione) e di aver scelto la sveglia, l'app o il Focus giusti. Per Riposo, verifica che sia lo stesso Focus delle impostazioni.
- **Il Comando funziona a mano ma non in automatico.** Quasi sempre è la conferma di cui sopra, oppure il telefono è bloccato. Riprova con lo schermo acceso.

## Cosa non è stato verificato

Questi punti dipendono da iOS 27 e non ho potuto provarli. Quando li provi, segnala a Claude l'esito:
- Formato del `ts` (`yyyy-MM-dd'T'HH:mm:ssXXX`, con ISO 8601 come alternativa).
- Confronto `OraDelGiorno` minore di 12.
- Comportamento di **Scegli dall'elenco** senza selezioni.
- Nomi di azioni e automazioni (Sveglia, Focus/Full Immersion, Imposta Focus, Esegui subito, Chiedi prima di eseguire, Aggiungi alla schermata Home).
- Probabilmente le automazioni non vengono incluse nei Comandi condivisi: considerale passi manuali anche se un giorno importassi i Comandi da file.

## PWA nella Home (consigliato)

1. Apri `<URL_APP>` in **Safari** (non in altri browser).
2. Tocca **Condividi** (il quadrato con la freccia).
3. Scorri e scegli **Aggiungi alla schermata Home**.
4. Controlla il nome e tocca **Aggiungi**.

Da ora l'app si apre a schermo intero.

**Notifiche:** non servono per i Comandi. Abilitale solo se ti sono utili.
1. Apri l'app dall'icona nella Home (non da Safari).
2. Se l'app te lo chiede, tocca **Consenti**.
3. Se hai rifiutato per sbaglio: **Impostazioni** → **Notifiche** → Sleep Tracker.

Le notifiche delle app web su iPhone funzionano solo dopo l'aggiunta alla Home e con iOS 16.4 o successivo.

## Riepilogo veloce

1. Crea il token da **Impostazioni** e salva `<URL_APP>/api/events` e `<TOKEN>`.
2. Crea "Sveglia" con il suo corpo, poi la sua automazione. Duplicalo per gli altri.
3. Crea "Riposo" e la sua automazione (Focus).
4. Crea "Sera" e mettilo nella Home.
5. Crea "Sonnellino" e mettilo nella Home.
6. Crea "Apertura" e la sua automazione (facoltativo).
7. Prova tutto e guarda **Segnali**.
8. Aggiungi la PWA alla Home.
