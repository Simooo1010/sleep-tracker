Durata del sonno per giorno della settimana, nelle ultime quattro settimane: sette righe (Lun–Dom) per quattro celle, dalla più vecchia alla più recente. Fa emergere il pattern settimanale (ad esempio il venerdì corto).

**Cosa fornisci:** per ogni giorno della settimana, le ultime quattro durate e il loro stato.

**Regole**
- Ogni cella contiene sempre la durata scritta (`7h12`): il colore non è l'unica informazione.
- Fasce: 8h o più `cell-8` (salvia), 7h–8h `cell-7` (azzurro), meno di 7h `cell-6` (pesca). Cella stimata: bordo tratteggiato `peach-edge`. Notte mancante: bordo punteggiato e `—`.
- Altezza cella 36px, raggio `radius-sm`, distanza 4px. Etichette del giorno a sinistra in `ink-muted`.
- Sotto, la legenda con le tre fasce.
