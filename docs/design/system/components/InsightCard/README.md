Scheda di insight testuale: un'osservazione breve sul sonno, con l'origine dichiarata (AI o Regole) e il momento dell'ultimo aggiornamento.

**Cosa fornisci:** titolo (una frase), corpo (una o due frasi con i numeri reali), origine (`AI` o `Regole`) e data di aggiornamento.

**Regole**
- Riga in alto: badge `badge-ai` (azzurro) o `badge-rules` (salvia) e "Stamattina", "Ogni lunedì", "Aggiornato ieri" in `caption`.
- Titolo in `font-display`, 22px, peso 400. Corpo in `body-sm` `ink-muted`, massimo 65 caratteri per riga.
- Il corpo contiene sempre un dato: "ti sei addormentato in media 38 minuti più tardi", non "dormi male".
- Nessun verbo causale. Usa "si lega a", "è associato a". Quando i dati non bastano scrivi "Dati insufficienti" e quanto manca ("Servono almeno 5 notti. Per ora ne hai 2.").
- Senza AI gateway disponibile l'app mostra comunque gli insight a regole: la sezione non resta mai vuota.
