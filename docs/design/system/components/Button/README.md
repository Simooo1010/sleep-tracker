Pulsante a pillola per le azioni dell'app: una sola azione principale piena per schermata, le altre in stile secondario o ghost.

**Cosa fornisci:** l'etichetta (verbo all'imperativo, una o due parole) e il gestore del click.

**Varianti**
- `btn btn-primary` (pesca): l'azione che porta avanti la schermata. `Conferma`, `Vado a dormire`. Una sola per schermata. Testo `on-fill`.
- `btn btn-soft` (azzurro): azione di navigazione dentro un flusso, come `Avanti`.
- `btn btn-secondary`: azione alternativa, bordo `line-strong` da 1px, come `Indietro`.
- `btn btn-ghost`: azione terziaria sottolineata, come `Correggi orari` e `Annulla`.
- `btn btn-round`: passo di ±5 minuti nel `TimeStepper`. Richiede `aria-label`.
- `btn-lg` (56px) per il pulsante finale di un flusso, `btn-block` per la larghezza piena su telefono.

**Regole**
- Altezza minima `tap` (48px), area toccabile mai sotto `tap-min` (44px).
- Focus con `shadow-focus`. Premuto: scurisci il riempimento del 6%. Disabilitato: testo `ink-muted` su `surface-sunken`.
- Non usare due `btn-primary` vicini. Non usare il serif nei pulsanti.
