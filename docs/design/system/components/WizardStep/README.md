Una domanda per schermata, per il check serale su telefono. Ogni fattore ha il suo momento, così lo schermo resta calmo prima di dormire.

**Cosa fornisci:** il numero del passo, il totale, la domanda e il controllo (`MoonRating` o gruppo di `Chip`). Il flusso decide l'ultimo passo.

**Passi del check serale:** 1 "Quanto sei stanco?" (lune azzurre), 2 "Com'è il tuo umore?" (cinque chip), 3 "Cosa è successo oggi?" (chip dei fattori), 4 "Hai fatto un sonnellino?" (chip gialli). L'ultimo mostra `Vado a dormire`.

**Regole**
- In alto: `label` "Check serale · domanda 2 di 4", `heading-lg` con la domanda e una barra di avanzamento di quattro segmenti (piena `blue-ink`, vuota `line`).
- In basso: `btn-soft btn-lg` "Avanti" e `btn-secondary` "Indietro" (non sul primo passo). Sull'ultimo passo il pulsante `btn-primary btn-lg` è l'unico pieno.
- Su PC lo stesso check è una sola scheda con tutte le domande; le etichette piccole restano.
- Non animare i passaggi di notte e rispetta `prefers-reduced-motion`.
- Dopo l'invio: "Buonanotte. Check salvato. Riposo è attivo e la sveglia delle 07:15 è impostata." su `sage-soft`.
