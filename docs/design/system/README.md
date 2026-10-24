Sleep Tracker è un diario del sonno personale, in italiano, per un solo utente. Il design è calmo, pastello, con numeri grandi in serif leggero. L'app chiede il meno possibile: stima da sola e domanda soltanto una conferma. Segui queste regole in ogni schermata, su PC, telefono e 4K, nel tema chiaro e nel tema scuro.

## Principi

- **Stima, poi conferma.** Mostra sempre la notte già ricostruita e chiedi un tocco: `Conferma`. Un dato stimato non viene mai nascosto, viene marcato.
- **Un solo gesto principale per schermata.** Usa un solo pulsante pieno `peach` per schermata. Tutto il resto è `btn-secondary` o `btn-ghost`.
- **Calma prima dei dati.** Su telefono mostra un dato per volta. Le viste larghe (confronto tra notti, tabelle, heatmap) restano su PC.
- **Nessun dato è obbligatorio.** Un dato mancante resta mancante: mai zero, mai una stima nascosta, mai un errore. Niente serie di giorni consecutivi, niente rimproveri, niente colpe.
- **Poche domande.** Al massimo 2–3 domande rapide al giorno (`QuickQuestion`, un tocco ciascuna). Se l'utente salta dei giorni si chiedono solo gli ultimi 2–3, i precedenti restano stimati.
- **Il telefono si apre tardi.** L'utente lo usa circa 1h–1h30 dopo il risveglio e subito prima di dormire. Il mattino serve una conferma in 1 tap, la sera un check breve.
- **Niente NFC nella v1.** Non disegnare tag, scansioni o impostazioni NFC. Il risveglio arriva dalla sveglia interrotta, il letto da Full Immersion Riposo.

## Voce e contenuti

- Scrivi in italiano, dando del tu. Frasi brevi e concrete: "Inizio stimato da Riposo (23:48). Controlla e conferma."
- Pulsanti: verbo all'imperativo, una o due parole. `Conferma`, `Correggi orari`, `Annulla`, `Avanti`, `Vado a dormire`.
- Nessun punto esclamativo, nessuna emoji, nessun tono da coach o da gioco. Gli errori spiegano cosa fare, senza scuse.
- Orari in 24 ore: `23:48`. Durate compatte: `7h 32m`. Intervalli: `23:48 → 07:20`. Scarti con segno: `+12 min`, `−8 min` (usa il segno meno vero `−`). Decimali con la virgola: `+0,6`.
- Date per esteso e minuscole nelle frasi: "Sabato 24 ottobre". Nelle etichette in maiuscolo: `STANOTTE`.
- Le correlazioni sono indizi, mai cause. Scrivi "si lega a", non "causa". Mostrale solo con almeno 14 notti di dati e, per ogni fattore, almeno 5 occorrenze.
- Dichiara l'origine di ogni insight con un badge: `AI` (generato dal modello) o `Regole` (calcolato dalle statistiche).

Esempi reali: "Gli schermi a letto spostano la notte." · "Il tuo orario sta scivolando." · "Un debito piccolo, facile da chiudere." · "Ieri sera sembra tu sia andato a letto alle 00:40. Confermi?"

## Colore

Il tema principale è `chiaro` (grigio-azzurro freddo, non crema), il secondo è `scuro` (blu-notte, mai nero puro). Il tema scuro non è un'inversione: ha accenti più chiari e testi che non arrivano al bianco. Segui il sistema operativo per scegliere il tema e permetti di cambiarlo a mano.

Usa `ground` per lo sfondo della schermata e `surface` per schede e pannelli. Usa `surface-sunken` per piste e campi incassati. Usa `line` per le linee sottili e `line-strong` per il bordo dei controlli.

Ogni colore di accento ha un ruolo preciso. Non usarlo per decorare.

| Accento | Ruolo | Dove |
|---|---|---|
| `blue` azzurro | Sonno e dati confermati | Barre di durata, notti confermate, voce attiva di navigazione |
| `sage` salvia | Benessere e regolarità | Fascia di tolleranza ±30 min, stato OK, tendenze positive |
| `peach` pesca | Azione e dati stimati | L'unico pulsante pieno, badge Stimata, barre tratteggiate, debito |
| `yellow` giallo pastello | Energia e sonno diurno | Voto di energia, sonnellini, previsione di domani |

- Il giallo esiste **solo nel tema chiaro**. Nel tema scuro `yellow`, `yellow-soft`, `yellow-ink` e `yellow-edge` sono alias della salvia. Non introdurre un giallo nel tema scuro.
- Per ogni accento ci sono `-soft` (sfondo di badge e tessere), `-ink` (testo sopra il soft) e `-edge` (contorno nitido dei segni dati). Testo sopra un riempimento pieno (`blue`, `sage`, `peach`, `yellow`): sempre `on-fill`.
- Testo su `soft`: usa l'`-ink` della stessa famiglia (`blue-ink` su `blue-soft`). Non mescolare famiglie.
- Ogni coppia testo/sfondo dichiarata nelle note dei token raggiunge 4.5:1 in entrambi i temi. I controlli e i segni con significato raggiungono 3:1. Non cambiare un valore senza rimisurare.
- Mai un solo colore per trasmettere un significato. Aggiungi sempre una parola, una forma o un tratteggio (vedi "Dati e provenienza").

## Tipografia

- Numeri e titoli grandi: `font-display` (Newsreader, peso 300–400, asse ottico attivo). Interfaccia e testo: `font-sans` (Instrument Sans).
- Usa gli stili: `display-xl` per il numero della notte su PC, `display-lg` su telefono, `display-md` per i dati secondari, `heading-lg` e `heading-md` per i titoli, `title` per gli insight, `body-lg`/`body`/`body-sm` per il testo, `caption` per le note e `label` per le etichette in maiuscolo.
- Abilita sempre `font-variant-numeric: tabular-nums` su orari, durate, scarti e tabelle. Abilita `font-optical-sizing: auto` e `font-kerning: normal`. Applica `-webkit-font-smoothing: antialiased` e `text-rendering: optimizeLegibility`.
- Mai sotto i 16px nei campi di input su telefono. Mai testo informativo sotto i 11px.
- Mai due serif nella stessa schermata e mai il serif per pulsanti o etichette.

## Alta risoluzione e 4K

L'interfaccia deve restare nitida e definita su schermi 2x, 3x e 4K (3840×2160). La qualità visiva si ottiene così:

- **Tutto vettoriale.** Grafici, icone, lune e barre sono HTML, CSS e SVG. Vietate le immagini raster per elementi di interfaccia.
- **Unità scalabili.** Scrivi dimensioni in `rem`, `em`, percentuali e `clamp()`. Un solo valore di base sul `html` fa scalare l'intera interfaccia.
- **Contenuto con larghezza massima.** Su PC il contenuto si ferma a `content-max` (1480px) e resta centrato. Su un 4K mostra più colonne affiancate invece di allargare le schede.
- **Linee da 1px logico** (`hairline`). Non usare mezzi pixel. I bordi dei dati usano 1px pieno o 1.5px tratteggiato nel colore `-edge`.
- **Ombre a due livelli** (`shadow-card`, `shadow-float`): una stretta per il contorno, una diffusa per la profondità. Nel tema scuro aggiungi il filo di luce interno di 1px già incluso nel token.
- **Spigoli coerenti.** Ogni raggio viene da `radius-*`. Per barre e piste usa `radius-pill`. Allinea i bordi ai pixel interi a 1x e usa `shape-rendering: geometricPrecision` sugli SVG.
- **Icone** su griglia 24px, tratto 1.6px con estremità arrotondate, mai riempite tranne le lune.
- **Test.** Verifica ogni schermata a 390×844 (DPR 3), 1280×800 (DPR 2) e 3840×2160 (DPR 1), nei due temi.

## Layout

- **Telefono (390×844).** Margine laterale `space-5`. Navigazione in una barra flottante a pillola (`nav-pill`, 68px) staccata di `nav-inset` (14px) dai bordi, con `shadow-float`. Lascia in fondo almeno 120px di spazio al contenuto. Le sezioni si aprono una alla volta da un elenco (`ListRow`) con "Indietro". Il check serale è una domanda per schermata.
- **PC.** Barra laterale `sidebar` (240px) e contenuto con `content-max`. Mostra insieme le viste larghe: confronto tra notti, tabelle, heatmap, calendario con dettaglio.
- **Adattamento.** Usa flex e grid con `flex-wrap`, mai larghezze fisse sul contenuto. Le colonne si impilano da sole sotto i 340px.
- **Aree toccabili.** Mai sotto `tap-min` (44px). I pulsanti e i chip sono alti almeno `tap` (48px).

## Dati e provenienza

La fiducia nel dato si vede. Ogni notte è in uno di tre stati e lo stato non dipende solo dal colore:

| Stato | Barra | Badge |
|---|---|---|
| Confermata | piena `blue`, contorno `blue-edge` | `Confermata` su `blue-soft` |
| Stimata | tratteggiata `peach` (diagonale 135°), bordo tratteggiato `peach-edge` | `Stimata` su `peach-soft` |
| Mancante | contorno punteggiato `line-strong`, nessun riempimento | `Mancante`, testo `ink-muted` |

- Il voto 1–5 (energia, qualità, stanchezza) si mostra con le **fasi lunari**: luna nuova, quarto crescente, mezza, gibbosa, piena. Il voto selezionato ha anello e fondo colorati: energia in `yellow`, stanchezza in `blue-soft`.
- La regolarità mostra due fasce `sage` (letto e sveglia, mediana mobile a 14 giorni ±30 min) e una linea tratteggiata sulla mediana. Ogni notte riporta `OK` o `Fuori` come parola, mai solo un colore.
- Le definizioni dei calcoli sono in "Dati e calcoli".
- Ogni valore dichiara la sua provenienza con una parola: `Automatico` (arrivato da un segnale, senza intervento), `Confermato` (l'utente ha toccato Conferma), `Stimato`, `Mancante`.
- Ogni statistica mostra la **copertura** dei dati (`9 su 14 notti`) con il componente `Coverage`. Sotto la soglia di dati l'insight non compare: si scrive quanti dati mancano.

## Logo e icona

L'icona dell'app è una nuvola molto stilizzata con una luna a falce in parte nascosta dietro, in sfumature di azzurro pastello su sfondo bianco. Usa i file di `assets/Logo/` (`app-icon.svg`, `app-icon-1024.png`, `apple-touch-icon.png`, `mark.svg`) senza ridisegnarli.

- Per l'icona della schermata Home di iPhone: `apple-touch-icon.png` (180×180) con `<link rel="apple-touch-icon">`. Per il manifest della PWA: 192 e 512 px.
- Il bianco dell'icona resta bianco anche nel tema scuro: nel tema scuro il segno sta su una tessera bianca, mai direttamente sullo sfondo scuro.
- Il nome si compone in `font-display` peso 300 come "Sleep Tracker", accanto al segno solo nelle intestazioni.
- Il colore sono più sfumature di azzurro pastello sovrapposte, non un gradiente lineare. Vedi il componente `Logo`.

## Componenti

Costruisci le schermate con i componenti del sistema (vedi l'indice dei componenti): `Button`, `Chip`, `Badge`, `MoonRating`, `SessionCard`, `TimeStepper`, `Timeline`, `StatTile`, `ListRow`, `FloatingNav` (barra flottante e barra laterale), `NightBars`, `DriftChart`, `DurationChart`, `Heatmap`, `CorrelationTable`, `Calendar`, `InsightCard`, `EnergyCard`, `SignalRow`, `WizardStep`, `Coverage`, `ExceptionChips`, `QuickQuestion`, `Logo`. Le schermate complete sono descritte in "Schermate" e i calcoli in "Dati e calcoli".

## Stati e movimento

- Focus visibile con `shadow-focus` su ogni controllo. Stato premuto: scurisci il riempimento del 6%. Disabilitato: testo `ink-muted`, nessuna ombra.
- Movimento minimo: dissolvenze e spostamenti di 150–200ms con curva ease-out. Rispetta `prefers-reduced-motion`. Mai animazioni durante la notte o nel check serale.

## Cosa evitare

- Verde e rosso come unico segnale. Stato sempre con parola o forma.
- Più di un pulsante pieno `peach` per schermata. Più di un numero `display-xl` per schermata.
- Gradienti viola-blu, emoji, schede con barra colorata a sinistra, icone riempite.
- Bianco puro nel tema scuro, nero puro ovunque, giallo nel tema scuro.
- Dati densi su telefono: se serve il confronto largo, rimanda al PC.
