Correzione degli orari a passi di 5 minuti, per quando la stima non è giusta. Appare sotto la scheda Stanotte dopo il tocco su `Correggi orari`.

**Cosa fornisci:** orario di letto e di sveglia correnti e il gestore dei passi.

**Regole**
- Due righe, "Sono andato a letto" e "Mi sono svegliato". Ogni riga ha `−` (anticipa), l'orario in cifre tabulari e `+` (posticipa).
- I pulsanti sono `btn-round` da 44px con `aria-label` "Anticipa di 5 minuti" e "Posticipa di 5 minuti".
- Il pannello usa `surface-sunken` con raggio `radius-lg` dentro la scheda.
- Cambiare un orario aggiorna subito durata e barra. Non chiedere conferma a ogni passo: la conferma è `Conferma` della scheda.
