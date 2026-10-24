# Dati e calcoli

Definizioni che l'interfaccia deve mostrare in modo coerente. Fonte: `docs/PROJECT.md` §5b e §5c.

## Stato di una notte

- `confermata`: l'utente ha toccato `Conferma` (con eventuali correzioni).
- `stimata`: ricostruita dai segnali, in attesa di conferma. Un buco di dati viene colmato con una stima marcata, mai lasciato vuoto.
- `mancante`: nessun segnale e nessuna stima possibile.

## Segnali (eventi)

| Segnale | Evento | Origine |
|---|---|---|
| Full Immersion Riposo attivata a mano | `bedtime_candidate` | Comando iOS |
| Check serale (stanchezza, umore, fattori) | salvataggio check | Comando "Sera" |
| Sveglia interrotta | `wake` (coincide con l'alzata) | Comando automatico |
| Sonnellino inizio / fine | `nap_start` / `nap_end` | Comando rapido, o timer chiuso dalla sveglia |
| Movimento del telefono di notte | possibile risveglio | Da confermare |

Nella v1 non esistono segnali NFC. Se un segnale manca, la notte è stimata dai giorni simili.

## Regolarità (priorità alta)

- **Riferimento:** **mediana** mobile degli ultimi 14 giorni per orario di letto e di risveglio (robusta alle notti anomale). Non esiste un orario obiettivo fisso. I giorni-eccezione restano visibili ma sono esclusi dal riferimento.
- **Tolleranza:** ±30 min. Una notte è "regolare" se letto e sveglia sono entro 30 min dalla mediana.
- **Scarto di una notte:** `orario − mediana`, in minuti, con segno. Si mostra come `letto / sveglia`.
- **Deviazione standard:** di letto e di sveglia sulle ultime 14 notti.
- **Punto medio del sonno:** metà tra letto e risveglio.
- **Social jet lag:** punto medio del weekend meno punto medio dei feriali. Weekend = notti di venerdì e sabato. Stessi criteri dei feriali: lo scostamento del weekend conta.
- **Deriva:** la mediana dell'orario di letto si sposta nel tempo. Si mostra con 6 mediane settimanali e un badge, ad esempio "+42 min in 5 settimane". Segnala quando supera la tolleranza.
- **Asse del grafico:** 21:00 → 11:00 (840 min). Le barre sono posizionate in percentuale su questo asse.

## Provenienza e copertura

- **Provenienza di ogni valore:** `automatico` (da un segnale), `confermato` (toccato Conferma), `stimato`, `mancante`. Si mostra sempre con una parola.
- **Segnali ridondanti per evento.** Letto: Full Immersion, poi check serale, poi stima. Risveglio: sveglia interrotta, poi prima app aperta al mattino (limite superiore), poi stima.
- **Copertura:** ogni statistica mostra su quante notti è calcolata (`9 su 14 notti`). Sotto soglia l'insight resta nascosto con "Servono almeno N notti. Per ora ne hai M."
- **Eccezioni:** chip a un tocco (malattia, viaggio, festa, notte in bianco, alcol...), lista aperta e personalizzabile, ordinata per frequenza d'uso. Un giorno-eccezione è visibile ma non entra nel riferimento della regolarità.
- **Domande rapide:** 2–3 al giorno, un tocco ciascuna, scelte per valore informativo. Recupero solo degli ultimi 2–3 giorni. Se un segnale non viene usato per giorni, l'app smette di attenderlo e avvisa una sola volta, solo se cala la precisione.
- **Nessun dato obbligatorio:** mancante resta mancante.

## Durata e debito

- **Obiettivo:** 7h 30m a notte (valore di esempio, configurabile).
- **Debito di sonno:** somma di `max(0, obiettivo − durata)` sulle ultime 7 notti.
- **Medie:** ultime 7 notti e media del mese. Trend mensile: durata media degli ultimi 6 mesi.
- **Sonno delle 24 ore:** notte più sonnellino del giorno.
- **Fasce di colore** (calendario, heatmap): 8h o più `sage`, 7h–8h `blue`, meno di 7h `peach`.

## Correlazioni

- Fattori: schermo a letto, sport, giornata stressante, cena tardi, alcol, mal di testa. Il caffè non è un fattore: l'utente non lo consuma.
- Risultati: qualità percepita, energia mattutina, umore serale (voti 1–5).
- Per ogni fattore: differenza media di voto nelle notti con il fattore meno quelle senza. Si colora `sage-soft` se ≥ +0,3 e `peach-soft` se ≤ −0,3, ma il segno e il numero sono sempre scritti.
- Si mostrano solo con almeno 14 notti di dati. Un fattore con meno di 5 occorrenze resta grigio con "ne servono 5".
- Sono sempre indizi, mai cause.

## Sonnellini

- Frequenza (giorni con sonnellino su 14), durata media, orario di inizio tipico.
- Effetto sull'orario di letto (minuti di differenza tra giorni con e senza sonnellino) e sull'energia del giorno dopo.
- Inclusi nel sonno delle 24 ore. Cattura: comando rapido inizio/fine, oppure recupero nel check serale ("Sonnellino oggi? Nessuno, 15, 30, 45 min, 1 ora").

## Previsioni e insight

- **Previsione di energia per domani:** stima basata sulle notti passate simili (orario di letto, durata, sonnellino). Si presenta con "Stima su N notti" e mai come certezza.
- **Insight testuali:** da statistiche (sempre) e dall'AI gateway (quando disponibile). Ogni insight ha il badge `AI` o `Regole` e un'indicazione di quando è stato aggiornato.
