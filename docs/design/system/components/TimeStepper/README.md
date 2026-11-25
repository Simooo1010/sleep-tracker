Correzione degli orari a passi di 5 minuti o scrivendo l'orario, per quando la stima non è giusta. Appare sotto la scheda Stanotte dopo il tocco su `Correggi orari`.

**Cosa fornisci:** orario di letto e di sveglia correnti e il gestore dei passi.

**Regole**
- Due righe, "Sono andato a letto" e "Mi sono svegliato". Ogni riga ha `−` (anticipa), l'orario in cifre tabulari e `+` (posticipa).
- I pulsanti sono `btn-round` da 44px con `aria-label` "Anticipa di 5 minuti" e "Posticipa di 5 minuti".
- Il pannello usa `surface-sunken` con raggio `radius-lg` dentro la scheda.
- Cambiare un orario aggiorna subito durata e barra. Non chiedere conferma a ogni passo: la conferma è `Conferma` della scheda.
- **Scrivere l'orario:** le cifre sono un pulsante (sottolineatura tratteggiata, 44px di altezza, nome "Sono andato a letto: 23:48. Tocca per scrivere l'orario"). Al tocco diventano un campo da 16px (niente zoom su iPhone, tastiera numerica) con il testo selezionato. `Invio` o l'uscita dal campo confermano, `Esc` annulla. Mentre si scrive i `±` sono disattivati.
- **Formati accettati:** `2345`, `23:45`, `23.45`, `23 45`, `23h45`, `730` (07:30), `7` (07:00). Il minuto è libero (21:47 va bene); i `±` poi muovono di 5 da lì (21:47 → 21:52).
- **Orario non valido** (`25:99`, `abc`): il campo torna al valore di prima e sotto la riga compare "Orario non valido. Prova per esempio 23:45." (`role="alert"`, a parole). Non si inventa mai un orario. Campo vuoto o immutato: chiude senza messaggio.
