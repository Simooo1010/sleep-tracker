# Schermate

Struttura delle schermate dei prototipi D1 (generale) e D2 (completo). I sorgenti dei prototipi sono in `docs/design/prototype/` nel repository. Ogni schermata esiste in quattro varianti: PC e telefono, chiaro e scuro.

## Navigazione

- **D1:** Notte, Sera, Settimana.
- **D2:** Notte, Regolarità, Grafici, Storico, Sera, Segnali.
- **Telefono:** barra flottante a pillola con cinque voci (Notte, Regolarità, Grafici, Storico, Sera). Segnali si apre dal pulsante in alto. Voce attiva = pillola `blue-soft` + testo in grassetto.
- **PC:** barra laterale di 240px con le sei voci, riepilogo di oggi e interruttore del tema.

## Notte (mattino, conferma)

Scheda **Stanotte**: durata (`display-xl` su PC, `display-lg` su telefono), barra con orari, badge di stato, spiegazione di come è stata stimata, `Conferma` (peach), `Correggi orari` (apre il `TimeStepper` a passi di 5 minuti), voto di energia con `MoonRating` giallo. Dopo la conferma: "Registrata. Grazie." con `Annulla`.
Altre sezioni: `Timeline` "La notte, in ordine" (check serale, Riposo, risveglio da confermare, sveglia interrotta, primo uso del telefono), solo D2: `EnergyCard` Sonnellino con comando rapido (Inizia, Termina, Registrato), confronto con il solito, quattro `StatTile` (durata media, regolarità, debito, sonno 24 ore). Su telefono la scheda Stanotte è l'unica visibile; le altre sono voci di un elenco.

## Regolarità (D2)

PC: confronto tra 14 notti e stanotte su asse 21–11 con fasce di tolleranza e scarti `OK/Fuori`, cinque `StatTile` (scarto letto, scarto sveglia, nella tolleranza, punto medio, social jet lag), `DriftChart`, feriali contro weekend. Telefono: un solo numero ("9 su 14") con il badge di deriva, poi voci per ogni grafico.

## Grafici e insight (D2)

Sei `InsightCard`, `DurationChart` (14 notti, linea obiettivo, debito), `Heatmap` per giorno della settimana, `CorrelationTable`, trend mensile, previsione di energia di domani (`EnergyCard`), statistiche e lista dei sonnellini. Su telefono è un elenco di voci, una per grafico.

## Storico (D2)

`Calendar` del mese con la durata per giorno (su telefono solo il giorno) e riquadro dettaglio della notte selezionata: durata, orari, stato, qualità, energia, tag.

## Sera (check serale)

PC: una scheda con stanchezza (`MoonRating` azzurro), umore (5 chip), fattori (chip), solo D2 sonnellino di oggi (5 chip gialli), `Vado a dormire`. Telefono: una domanda per schermata con barra di avanzamento e `Avanti`/`Indietro`; l'ultima mostra `Vado a dormire`. Conferma: "Buonanotte. Check salvato. Riposo è attivo e la sveglia è impostata."

## Segnali (D2)

`SignalRow` per ogni automazione (Sveglia interrotta, Riposo attivato, Check serale, Sonnellino rapido, Stima di riserva, Recupero sonnellino) con stato `Attivo` o `Da configurare`, e registro degli ultimi eventi.

## Imprevedibilità (valida in tutte le schermate)

- Nessun dato è obbligatorio: un dato mancante resta mancante. Niente serie di giorni consecutivi, niente rimproveri.
- Ogni valore mostra la provenienza con una parola (`Automatico`, `Confermato`, `Stimato`, `Mancante`).
- Ogni statistica mostra la copertura (`Coverage`): "Calcolata su 12 su 14 notti".
- Le eccezioni (`ExceptionChips`) stanno nel check serale e come scorciatoia nella scheda Stanotte.
- Al massimo 2–3 domande rapide al giorno (`QuickQuestion`), con `Salta` sempre disponibile.

## Regole di adattamento

- Telefono: un dato per volta, elenco di voci che aprono una sezione, "Indietro" in alto.
- PC: tutte le viste larghe insieme, contenuto centrato con `content-max`.
- 4K: stesso layout a 1920×1080 logici con densità 2×, più colonne affiancate, mai schede più larghe di `content-max`.
