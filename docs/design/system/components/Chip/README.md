Chip a pillola selezionabile, per umore, fattori della giornata e durata del sonnellino nel check serale.

**Cosa fornisci:** l'etichetta, lo stato `aria-pressed` e il gestore del click. Il chip non gestisce lo stato da solo.

**Regole**
- Selezione singola (umore, sonnellino): un solo chip con `is-on`. Selezione multipla (fattori): ogni chip si accende da sé.
- Chip selezionato: bordo 1.5px `sage-ink`, sfondo `sage-soft`, testo `sage-ink`. Il chip dei sonnellini (`chip-nap`) usa `yellow` con testo `on-fill`.
- Chip non selezionato: bordo `line-strong` da 1px, sfondo trasparente. Altezza minima `tap` (48px).
- Imposta sempre `aria-pressed`. Lo stato non dipende solo dal colore: bordo più spesso e sfondo pieno.
- Elenco fattori: Schermo a letto, Sport, Giornata stressante, Cena tardi, Alcol, Mal di testa. Mai il caffè.
