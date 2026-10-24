Deriva della mediana: sei mediane settimanali dell'orario di letto e un badge che dice di quanto si è spostata. Serve a notare uno scivolamento lento che le singole notti nascondono.

**Cosa fornisci:** sei mediane settimanali (dalla più vecchia) e la differenza totale in minuti.

**Regole**
- Sei barre verticali con l'orario sopra (cifre tabulari) e l'etichetta sotto: "5 sett. fa", "4", "3", "2", "1", "Ora". Altezza proporzionale allo scostamento dalla prima media.
- Barre azzurre con bordo `blue-edge`; l'ultima, "Ora", in pesca con bordo `peach-edge`.
- Badge in alto a destra con la deriva ("+42 min in 5 settimane"): `badge-out` quando supera la tolleranza di ± 30 min, `badge-ok` in caso contrario.
- Sotto, una frase in `body-sm`: "La mediana del tuo orario di letto si è spostata da 23:04 a 23:46."
- Il riferimento è la mediana mobile di 14 giorni: nessun orario obiettivo fisso.
