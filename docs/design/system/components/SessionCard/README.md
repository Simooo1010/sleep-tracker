La scheda "Stanotte": il cuore dell'app. Mostra la notte già ricostruita, di quanto è durata, a che ora, se è stimata o confermata, e chiede un solo tocco.

**Cosa fornisci:** durata, ora di letto e di sveglia, stato (`stimata` o `confermata`), la frase che spiega come è stata stimata e i gestori di `Conferma`, `Correggi orari` e `Annulla`.

**Struttura (dall'alto)**
1. Etichetta `STANOTTE` (`label`).
2. Durata in `display-xl` su PC, `display-lg` su telefono.
3. Barra della notte con gli orari ai lati: piena azzurra se confermata, tratteggiata pesca se stimata.
4. Badge di stato e, su PC, la pillola di regolarità ("Letto +8 min · Sveglia −12 min · nella tolleranza").
5. Frase di spiegazione in `body-sm`: "Inizio stimato da Riposo (23:48), fine dalla sveglia interrotta (07:20)."
6. `Conferma` (peach, `btn-lg`) oppure, dopo il tocco, "Registrata. Grazie." su `sage-soft` con `Annulla`.
7. `Correggi orari` (ghost) e il voto di energia con `MoonRating`.

**Regole**
- È l'unico punto della schermata con un numero `display-*` e l'unico pulsante pieno.
- Su telefono mostra solo questa scheda al primo livello; il resto è in un elenco.
- Se la notte è stimata, la barra non può essere piena: la stima si vede.
