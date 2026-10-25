# Comandi iOS — guida rapida

Cinque Comandi sull'iPhone. Dopo, la notte si registra da sola. Ci vogliono circa 15 minuti.

**Nota onesta:** i nomi dei menu e delle azioni di iOS cambiano un po' da una versione all'altra. Qui uso i nomi italiani più comuni. Se un nome non torna, cerca l'azione con la lente dentro Comandi. Il contratto con l'app (indirizzo, intestazioni, JSON) invece è fisso.

## Prima di iniziare

Ti servono tre cose.

1. **iPhone con l'app Comandi** (c'è già di serie) e iOS aggiornato.
2. **`<URL_APP>`**: l'indirizzo dell'app, senza barra finale (quello che usi per aprirla in Safari). Nei Comandi userai `<URL_APP>/api/events`. Dopo aver creato il token, **Impostazioni** ti mostra l'indirizzo completo già pronto.
3. **`<TOKEN>`**: la chiave che fa entrare i tuoi Comandi. Comincia con `st_`. Lo crei tu dall'app, in pochi secondi:
   1. Apri l'app e accedi con la tua password.
   2. Tocca **Impostazioni** (in alto su telefono, nella barra laterale su PC) e apri **Token per i Comandi**.
   3. Lascia l'etichetta `iPhone` (o scrivine una tua) e tocca **Crea token**.
   4. Tocca **Copia** e incollalo subito nelle Note o in un gestore di password. L'app lo mostra **una sola volta**: il server ne conserva solo un'impronta, quindi non si può rileggere.

   Se lo perdi, o pensi che qualcuno l'abbia visto, apri di nuovo Impostazioni: **Revoca** (due tocchi: **Revoca** e **Conferma revoca**) e crea un token nuovo. I Comandi che usavano il vecchio smettono di funzionare subito, quindi sostituiscilo anche nei Comandi.

Dove tenere il token:

- Salvalo subito nelle Note o in un gestore di password.
- Non incollarlo in chat, nel repo o in uno screenshot.
- Dentro i Comandi resta scritto in chiaro. Non usare "Condividi Comando" con altri.

In questo file `<URL_APP>` e `<TOKEN>` sono segnaposto. Sostituiscili tu sul telefono.

## Come è fatta ogni chiamata

Tutti i Comandi usano la stessa azione: **Ottieni contenuti URL**.

- **URL:** `<URL_APP>/api/events`
- **Metodo:** `POST`
- **Intestazioni:**
  - `Authorization` = `Bearer <TOKEN>` (c'è uno spazio dopo `Bearer`, niente virgolette)
  - `Content-Type` = `application/json` (di solito la mette iOS da sola quando il corpo è JSON)
- **Corpo della richiesta:** `JSON`. Aggiungi i campi con "Aggiungi nuovo campo".

Campi ammessi nel corpo:

| Campo | Obbligatorio | Cosa metterci |
|---|---|---|
| `type` | sì | `wake`, `bedtime_candidate`, `evening_check`, `nap_start`, `nap_end`, `app_open` |
| `ts` | no | data e ora ISO 8601 con fuso, es. `2026-10-24T22:30:00+02:00`. Se manca, vale l'ora in cui arriva la richiesta |
| `idempotencyKey` | no | da 8 a 100 caratteri: lettere, cifre e `: _ . -`. Se manca, la crea il server |
| `check` | solo per `evening_check` | oggetto con `tiredness`, `mood`, `factors`, `napMinutesToday` (tutti facoltativi) |

Altri campi vengono rifiutati. Un `ts` nel futuro di oltre 5 minuti o più vecchio di 7 giorni viene rifiutato.

### Due pezzi che ripeti in ogni Comando

Mettili all'inizio di ogni Comando, prima di "Ottieni contenuti URL".

**Pezzo A, l'ora (`Ts`):**

1. Azione **Data corrente**.
2. Azione **Formatta data**: formato **ISO 8601**.
3. **Imposta variabile** → nome `Ts`.

**Pezzo B, il giorno (`Giorno`):**

1. Azione **Data corrente**.
2. Azione **Formatta data**: formato **Personalizzato** → `yyyy-MM-dd`.
3. **Imposta variabile** → nome `Giorno`.

### Trucco per fare in fretta

Costruisci bene il **primo** Comando (la Sveglia). Poi per gli altri usa **Duplica** e cambia solo `type` e la chiave. Il token lo scrivi una volta sola.

## I cinque Comandi

### a) Sveglia interrotta → `wake`

Comando "Sveglia":

1. Pezzo A e Pezzo B.
2. **Ottieni contenuti URL** con questo corpo:

```json
{
  "type": "wake",
  "ts": "<Ts>",
  "idempotencyKey": "wake-<Giorno>"
}
```

Qui `<Ts>` e `<Giorno>` sono le variabili: nel campo scrivi `wake-` e poi inserisci la variabile `Giorno`.

Automazione:

1. Comandi → **Automazione** → **+** → **Sveglia**.
2. Scegli **Viene fermata** (la sveglia che usi la mattina, o qualsiasi).
3. **Avanti** → **Esegui Comando** → scegli "Sveglia".
4. Seleziona **Esegui subito**. Spegni **Notifica quando viene eseguita**.

Se la sveglia suona due volte (rinvio), la seconda richiesta ha la stessa chiave e viene riconosciuta come duplicato. Va bene così.

### b) Riposo attivato → `bedtime_candidate`

Comando "Riposo":

1. Pezzo A e Pezzo B.
2. **Ottieni contenuti URL** con questo corpo:

```json
{
  "type": "bedtime_candidate",
  "ts": "<Ts>",
  "idempotencyKey": "bedtime-<Giorno>"
}
```

Automazione:

1. **Automazione** → **+** → **Full Immersion** (a volte **Focus**).
2. Scegli **Riposo** → **Si attiva**.
3. **Esegui Comando** → "Riposo".
4. Seleziona **Esegui subito**. Spegni **Notifica quando viene eseguita**.

### c) Check serale + Riposo, in un solo Comando

Comando "Sera". Ti fa 4 domande, invia il check e accende Riposo.

1. **Scegli dal menu**, prompt "Stanchezza (1 poco, 5 tanto)". Opzioni: `1`, `2`, `3`, `4`, `5`.
   Sotto ogni opzione: azione **Testo** con il numero → **Imposta variabile** `Stanchezza`.
2. **Scegli dal menu**, prompt "Umore (1 giù, 5 su)". Stessa struttura. Variabile `Umore`.
3. **Scegli dall'elenco**, prompt "Fattori di oggi", attiva **Seleziona più elementi**. Voci (testo esatto, minuscolo, con i trattini):
   - `schermo-a-letto`
   - `sport`
   - `giornata-stressante`
   - `cena-tardi`
   - `alcol`
   - `mal-di-testa`

   Non scegliere nulla va bene. **Imposta variabile** `Fattori`.
4. **Scegli dal menu**, prompt "Sonnellino oggi?". Opzioni: `Nessuno`, `15 min`, `30 min`, `45 min`, `1 ora`.
   Sotto ogni opzione: **Testo** con `0`, `15`, `30`, `45`, `60` → **Imposta variabile** `Sonnellino`.
5. Pezzo A e Pezzo B.
6. **Ottieni contenuti URL** con questo corpo:

```json
{
  "type": "evening_check",
  "ts": "<Ts>",
  "idempotencyKey": "check-<Giorno>",
  "check": {
    "tiredness": "<Stanchezza>",
    "mood": "<Umore>",
    "factors": ["<Fattori>"],
    "napMinutesToday": "<Sonnellino>"
  }
}
```

   In Comandi: `check` è un campo di tipo **Dizionario**, `factors` di tipo **Elenco**. I numeri possono restare testo: l'app li accetta.
7. **Imposta Full Immersion** (o **Imposta Focus**) → **Riposo** → **Attiva**.

Note:

- Se Riposo si accende, parte anche l'automazione b e arriva `bedtime_candidate`. Questo Comando non lo invia: ci pensa lei.
- Se vuoi Riposo acceso anche senza rete, sposta il passo 7 prima del passo 6.
- Se `factors` dà errore 400, prova a togliere quel campo e dillo a Claude: dipende da come la tua versione di iOS espande l'elenco.
- Metti il Comando "Sera" nella Home (Dettagli del Comando → **Aggiungi alla schermata Home**) o sul tasto Azione.

### d) Sonnellino rapido → `nap_start` / `nap_end`

Comando "Sonnellino", uno solo:

1. Pezzo A e Pezzo B.
2. Azione **Data corrente** → **Formatta data** → Personalizzato `HHmm` → **Imposta variabile** `Ora`.
3. **Scegli dal menu**, prompt "Sonnellino", opzioni `Inizio` e `Fine`.
4. Sotto **Inizio**: **Ottieni contenuti URL** con

```json
{
  "type": "nap_start",
  "ts": "<Ts>",
  "idempotencyKey": "nap-start-<Giorno>-<Ora>"
}
```

5. Sotto **Fine**: **Ottieni contenuti URL** con

```json
{
  "type": "nap_end",
  "ts": "<Ts>",
  "idempotencyKey": "nap-end-<Giorno>-<Ora>"
}
```

Metti il Comando nella Home. Due tocchi: apri, scegli.

### e) Prima apertura al mattino → `app_open`

Questo segnale è solo un **limite superiore**: dice "alle 9:40 ero già sveglio", non l'ora esatta. L'app lo usa solo se manca `wake`.

Comando "Apertura":

1. Pezzo A e Pezzo B.
2. **Data corrente** → **Formatta data** → Personalizzato `HH` → **Imposta variabile** `OraDelGiorno`.
3. **Se** `OraDelGiorno` **è minore di** `12`.
4. Dentro il Se: **Ottieni contenuti URL** con

```json
{
  "type": "app_open",
  "ts": "<Ts>",
  "idempotencyKey": "open-<Giorno>"
}
```

5. **Fine Se**.

Il controllo delle 12 serve a non registrare come "mattina" un'apertura del pomeriggio.

Automazione:

1. **Automazione** → **+** → **App**.
2. Scegli **Viene aperta** (a volte **È aperta**) e seleziona l'app che apri di solito per prima al mattino. Puoi provare anche la PWA di Sleep Tracker, ma non so se iOS la mostra nell'elenco delle app: se manca, usa un'altra app.
3. **Esegui Comando** → "Apertura". **Esegui subito**. Spegni **Notifica quando viene eseguita**.

Con la chiave `open-<Giorno>`, le aperture successive nello stesso giorno sono riconosciute come duplicati.

## Chiavi di idempotenza consigliate

La chiave evita doppioni se un Comando parte due volte. Stesso giorno, stessa chiave: la seconda richiesta non crea un nuovo evento.

| Comando | Chiave | Esempio |
|---|---|---|
| Sveglia | `wake-` + data | `wake-2026-10-24` |
| Riposo | `bedtime-` + data | `bedtime-2026-10-24` |
| Check serale | `check-` + data | `check-2026-10-24` |
| Sonnellino inizio | `nap-start-` + data + `-` + ora | `nap-start-2026-10-24-1415` |
| Sonnellino fine | `nap-end-` + data + `-` + ora | `nap-end-2026-10-24-1445` |
| Prima apertura | `open-` + data | `open-2026-10-24` |

Regole: da 8 a 100 caratteri; solo lettere, cifre e `: _ . -`. Niente spazi. Il giorno si scrive `yyyy-MM-dd`.

## Come provare

Prova un Comando alla volta.

1. Apri il Comando e toccalo (▶).
2. Per vedere la risposta, aggiungi in fondo **Mostra risultato**. Toglilo quando hai finito, soprattutto nelle automazioni.
3. Risposta giusta:

```json
{ "ok": true, "duplicate": false, "nightDate": "2026-10-24" }
```

   `duplicate: true` vuol dire che esisteva già un evento con la stessa chiave. Non è un errore.
4. Apri l'app → pulsante **Segnali** in alto (o la voce **Segnali** nella barra laterale). Nel registro degli ultimi eventi trovi quello appena inviato. Anche la riga della sua automazione deve passare a `Attivo`.
5. Le automazioni (sveglia, Riposo, apertura app) provale **dal vivo**: ferma una sveglia, attiva Riposo, apri l'app. Poi guarda di nuovo Segnali.

Attenzione: **una prova è un dato vero**. Finisce nei calcoli della notte. Meglio provare nei momenti reali, oppure dire a Claude di togliere le prove.

## Problemi comuni

- **L'automazione chiede conferma ogni volta.** Apri l'automazione e seleziona **Esegui subito**. Spegni **Chiedi prima di eseguire**. Se vedi ancora una notifica, spegni anche **Notifica quando viene eseguita**.
- **Errore 401 "Non autorizzato".** Il token è sbagliato. Controlla `Bearer`, uno spazio, poi il token. Niente virgolette, niente spazi o a capo alla fine. Se sei in dubbio, apri Impostazioni, revoca il token e creane uno nuovo, poi sostituiscilo nei Comandi. In Impostazioni vedi anche l'ultimo uso di ogni token: **Mai usato** vuol dire che nessuna richiesta è arrivata con quello.
- **Errore 400.** Il messaggio `error` è in italiano e dice quale campo non va. Cause tipiche: `type` sbagliato, `ts` senza fuso orario, chiave troppo corta, orologio del telefono avanti di oltre 5 minuti.
- **Errore 503 o 500.** Il problema è sul server, non sul telefono. Riprova dopo un minuto. Se resta, dillo a Claude.
- **Nessuna connessione.** iOS non garantisce un nuovo tentativo automatico: il Comando può fermarsi con un errore. Rilancialo a mano appena torna la rete. È sicuro: la chiave impedisce i doppioni. Attenzione: se rilanci, `Ts` è la nuova ora, non quella originale. Per la sveglia va bene lo stesso, perché è comunque una stima.
- **L'automazione non parte.** Controlla che sia attiva (interruttore in Automazione). Controlla di aver scelto la sveglia o l'app giusta. Per Riposo, verifica di usare lo stesso Focus delle impostazioni.
- **Il Comando funziona a mano ma non in automatico.** Quasi sempre è la conferma di cui sopra, oppure il telefono è bloccato e iOS chiede di sbloccarlo. Riprova con lo schermo acceso.

## PWA nella Home (consigliato)

1. Apri `<URL_APP>` in **Safari** (non in altri browser).
2. Tocca **Condividi** (il quadrato con la freccia).
3. Scorri e scegli **Aggiungi alla schermata Home**.
4. Controlla il nome e tocca **Aggiungi**.

Da ora l'app si apre a schermo intero, come un'app normale.

**Notifiche:** non servono per far funzionare i Comandi. Abilitale solo se ti sono utili.

1. Apri l'app dall'icona nella Home (non da Safari).
2. Se l'app te lo chiede, tocca **Consenti** alle notifiche.
3. Se hai rifiutato per sbaglio: **Impostazioni** → **Notifiche** → Sleep Tracker.

Su iPhone le notifiche delle PWA funzionano solo dopo l'aggiunta alla Home e solo con iOS abbastanza recente (16.4 o più).

## Riepilogo veloce

1. Crea il token da **Impostazioni** e salva `<URL_APP>` e `<TOKEN>`.
2. Crea "Sveglia" e la sua automazione. Duplicalo per gli altri.
3. Crea "Riposo" e la sua automazione.
4. Crea "Sera" e mettilo nella Home.
5. Crea "Sonnellino" e mettilo nella Home.
6. Crea "Apertura" e la sua automazione (facoltativo).
7. Prova tutto e guarda **Segnali**.
8. Aggiungi la PWA alla Home.
