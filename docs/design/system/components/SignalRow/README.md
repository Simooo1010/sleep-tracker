Riga di una automazione che raccoglie la notte: nome, come funziona, quando è arrivato l'ultimo segnale e se è attiva.

**Cosa fornisci:** nome, descrizione di una riga (con il nome dell'evento tra virgolette, ad esempio "wake"), data dell'ultimo segnale, stato.

**Regole**
- Stato con parola: `Attivo` su `sage-soft`, `Da configurare` su `peach-soft`. Non usare mai solo un colore.
- Segnali della v1: Sveglia interrotta, Riposo attivato, Check serale, Sonnellino rapido, Stima di riserva, Recupero sonnellino. Nessun segnale NFC.
- Una riga ha nome in `body` peso 500, descrizione in `caption` `ink-muted`, data in `caption`. Separatore `line` da 1px.
- Sotto l'elenco, il registro degli ultimi eventi: data, evento (`Sveglia interrotta → wake`), esito (`Registrato`, `Da confermare`, `Stima usata`).
