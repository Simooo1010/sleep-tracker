Confronto tra notti: una barra oraria per notte sullo stesso asse (21:00 → 11:00), con la fascia di tolleranza attorno alla media mobile a 14 giorni. È il grafico della regolarità, solo per PC (su telefono si apre da una voce).

**Cosa fornisci:** le notti con orario di letto, durata e stato; la media a 14 giorni di letto e sveglia.

**Come si legge**
- Ogni riga: giorno (`M 21`), pista `surface-sunken` con la barra posizionata in percentuale su 840 minuti, scarto da media (`+8 / −12`, letto e sveglia) e un badge `OK` o `Fuori`.
- Due fasce `sage` al 28% (media ± 30 min) per il letto e la sveglia, e una linea media tratteggiata `sage-edge` da 2px. Una notte è regolare se letto e sveglia cadono dentro le fasce.
- Barra confermata: azzurra con bordo `blue-edge`. Stimata: tratteggio pesca a 135° con bordo tratteggiato `peach-edge`. Mancante: bordo punteggiato.
- Ultima riga: "Oggi", che si aggiorna quando l'utente corregge gli orari.

**Regole**
- Le tick delle ore sono 21, 00, 03, 06, 09 in `caption`. Legenda sempre visibile sotto il grafico.
- Il confronto non usa mai solo il colore: parola `OK`/`Fuori` e stile della barra.
