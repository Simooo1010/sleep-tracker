Cronologia della notte: i segnali ricevuti in ordine, dal check serale al primo uso del telefono. Mostra da dove viene ogni orario.

**Cosa fornisci:** un elenco di eventi con ora, titolo, origine e tipo (`confermato`, `serale/mattutino` o `da confermare`).

**Regole**
- Colonna ora (tabulare), binario con punto e filo, poi titolo (`body-sm` peso 500) e origine in `caption` `ink-muted`.
- Punto azzurro = segnale confermato (Riposo, sveglia interrotta). Punto salvia = check serale o primo uso. Punto vuoto con bordo tratteggiato `peach-edge` = da confermare, ad esempio un possibile risveglio.
- Origini ammesse: Comando Full Immersion, Comando "Sera", Comando automatico, Movimento del telefono, Notte ricostruita. Niente NFC.
- Su telefono è dietro la voce "La notte, in ordine" e occupa tutta la schermata.
