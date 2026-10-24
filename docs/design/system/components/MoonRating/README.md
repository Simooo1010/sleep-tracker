Scala di voto da 1 a 5 con le fasi lunari, dalla luna nuova alla luna piena. Si usa per stanchezza (sera), energia (mattina) e per la previsione di domani.

**Cosa fornisci:** il valore selezionato (0–4) e il gestore. Ogni luna è un pulsante con `aria-label` ("Energia 3 di 5") e `aria-pressed`.

**Regole**
- Le cinque fasi sono: luna nuova, quarto crescente, mezza luna, gibbosa, luna piena. Si disegnano in SVG su griglia 24px, tratto 1.5px. Sono le sole icone riempite del sistema.
- Il voto selezionato cambia fondo e anello, non solo colore: energia `yellow` con anello `yellow-edge` (nel tema scuro diventa salvia), stanchezza `blue-soft` con anello `blue-ink`, previsione `yellow`.
- Sotto la scala della stanchezza scrivi gli estremi: "Per niente" e "Esausto".
- Dimensione 48px (52px nel check serale su telefono), distanza 14px. Su telefono distribuisci con `space-between`.
