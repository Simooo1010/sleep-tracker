Calendario del mese con la durata di ogni notte e un riquadro di dettaglio per la notte selezionata. È lo Storico.

**Cosa fornisci:** le notti del mese con durata e stato, il giorno selezionato e il dettaglio (orari, stato, qualità, energia, tag).

**Regole**
- Griglia di sette colonne (L–D) con celle alte 66px su PC e 48px su telefono (su telefono solo il numero del giorno, senza durata). Raggio `radius-md`, distanza 4px.
- Colore della cella per durata: 8h o più salvia, 7–8h azzurro, meno di 7h pesca. Stimata: bordo tratteggiato `peach-edge`. Mancante: bordo punteggiato `line-strong` e `—`. Giorni futuri: vuoti e disabilitati.
- Cella selezionata: bordo di 2px `ink`.
- Riquadro dettaglio: durata in serif 54px, intervallo `23:48 → 07:20`, badge di stato, nota, tag (`Qualità 4 su 5`, `Energia 3 su 5`, `Notte del weekend`, `Sonnellino 32 min`).
- Legenda sotto: "Verde 8h+ · Azzurro 7–8h · Pesca meno di 7h · Tratteggio = stimata · Punti = mancante".
