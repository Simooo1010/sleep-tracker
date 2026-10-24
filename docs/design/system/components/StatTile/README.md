Tessera con un indicatore: etichetta, valore in serif, nota. Colora la tessera con l'accento del significato del dato.

**Cosa fornisci:** etichetta (`label`), valore già formattato (`7h 18m`, `± 24 min`) e una nota di una riga.

**Colori per significato**
- `tile-blue`: durata, punto medio, scarti. `tile-sage`: regolarità, nella tolleranza. `tile-peach`: debito, social jet lag, avvisi gentili. `tile-yellow`: energia, sonnellini, sonno delle 24 ore.
- Sfondo `-soft`, testo `-ink` della stessa famiglia. Nel tema scuro il giallo diventa salvia.

**Regole**
- Valore in `font-display`, peso 300, 32px. Etichetta in maiuscolo `label` 11px.
- Su PC `repeat(auto-fit, minmax(190px, 1fr))`; su telefono due colonne.
- Non aggiungere frecce o icone: la nota scrive il confronto ("12 min sopra la media del mese").
