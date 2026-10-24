# Design system — Sleep Tracker

Fonte di verità del design. Da leggere prima di scrivere qualsiasi UI. Il resto del design sta in `docs/design/`.

- **Design system (artefatto):** https://claude.ai/artifact/3bLXhSQ61PrRXtpzM9F2mR (token, brand book, 25 componenti con anteprima, logo)
- **Prototipi e confronti (canvas):** https://claude.ai/artifact/8MfknmomX1jzdWa26CRFRP — pagina "Atmosfere A B C" (scartate) e pagina "Prototipi D1 D2" (approvati)
- **Copia nel repository:** `docs/design/system/` (README del brand book, `tokens.json`, `components/*` con README e preview, `bundle.css`)

## Identità in una riga

Calma, pastello, serif leggero. Base grigio-azzurra (`chiaro`) e blu-notte (`scuro`), quattro accenti con ruoli fissi: **azzurro** (sonno e dati confermati), **salvia** (benessere e regolarità), **pesca** (azione e dati stimati), **giallo pastello** (energia e sonno diurno, solo nel tema chiaro; nel tema scuro è salvia). Numeri in Newsreader Light (serif), interfaccia in Instrument Sans. Le fasi lunari sono la scala di voto 1–5.

## Decisioni di design (2026-10-24)

| Decisione | Dettaglio |
|---|---|
| Direzione | Calma, colori pastello, serif leggero, stile tra Apple Salute e Headspace |
| Font | Newsreader Light (display) + Instrument Sans (interfaccia). Instrument Serif e Cormorant scartati |
| Colore | Base "Nebbia" con tre accenti insieme (azzurro, salvia, pesca) + giallo pastello per energia e sonno diurno |
| Giallo | Solo tema chiaro; nel tema scuro alias della salvia |
| Temi | `chiaro` e `scuro`, seguono il sistema; il tema scuro non è un'inversione |
| Dispositivi | Una sola app adattabile: telefono (390×844) e PC fino al 4K |
| Telefono | Un dato per volta: elenco di sezioni che si aprono una alla volta; il check serale è una domanda per schermata; viste larghe solo su PC |
| Navigazione telefono | Barra flottante a pillola, staccata dai bordi (14px dai lati, 16px dal fondo), `shadow-float` |
| Alta risoluzione | Tutto vettoriale, linee da 1px, ombre a due livelli, icone su griglia 24px, test a 390×844 DPR3, 1280×800 DPR2, 3840×2160 |
| Logo/icona | Nuvola stilizzata con luna a falce in parte nascosta, sfumature di azzurro pastello (non gradiente lineare) su bianco |
| Provenienza dei dati | Automatico (contorno azzurro), Confermato (pieno), Stimato (tratteggiato), Mancante (punteggiato): sempre con parola, mai solo colore |
| Riferimento di regolarità | Mediana mobile a 14 giorni; i giorni-eccezione sono visibili ma esclusi; ogni statistica mostra la copertura (`9 su 14 notti`) |
| Imprevedibilità | Nessun dato obbligatorio, niente serie né rimproveri, chip delle eccezioni a un tocco, 2–3 domande rapide al giorno (principio in `docs/PROJECT.md` §3c) |

## Cosa usare nel codice

- `docs/design/tokens.json`: i token (colori per tema, tipografia, spaziatura, raggi, dimensioni, ombre). È il sorgente.
- `docs/design/tokens.css`: variabili CSS già generate dal JSON (temi `chiaro`/`scuro` con `data-theme` e preferenza del sistema). Rigenerare se cambia `tokens.json`.
- `docs/design/system/components/bundle.css`: classi dei componenti (`btn`, `chip`, `badge`, `moon`, `card`, `tile`, `navpill`, `track`/`hbar`/`band`, ...). Usa solo le variabili di `tokens.css`.
- `docs/design/system/components/<Nome>/README.md` e `preview.html`: regole e markup di riferimento di ogni componente.
- `docs/design/system/Dati-e-calcoli.md`: definizioni di regolarità, debito, deriva, correlazioni, sonnellini.
- `docs/design/system/Schermate.md`: struttura delle schermate D1 e D2.
- `docs/design/prototype/Proto.dc.html`: prototipo interattivo (tutte le sezioni, PC e telefono, chiaro e scuro) con i dati di esempio usati per i confronti. Serve come riferimento di layout e comportamento, non va copiato così com'è.

Mapping tra i nomi del prototipo e i token: `bg→ground`, `card→surface`, `mut→ink-muted`, `lineStrong→line-strong`, `onFill→on-fill`, `blueSoft→blue-soft`, `blueInk→blue-ink`, ecc. (camelCase → kebab-case).

## Logo e icona dell'app (iPhone)

File in `docs/design/logo/`: `app-icon.svg` (sorgente), `app-icon-1024.png`, `apple-touch-icon.png` (180), `icon-512.png`, `icon-192.png`, `favicon-32.png`, `mark.svg` (solo il segno su trasparente). I PNG si rigenerano con `node render.js` (Playwright) partendo dal SVG.

Per aggiungere l'app alla schermata Home di iPhone (PWA):

```html
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Sleep Tracker">
<meta name="theme-color" content="#eef2f6" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#161a22" media="(prefers-color-scheme: dark)">
```

Il manifest dichiara nome "Sleep Tracker", `display: "standalone"`, `background_color` bianco e le icone 192 e 512. Copiare i PNG nella cartella `public/` dell'app.

## Regole da rispettare sempre

1. Un solo pulsante pieno pesca per schermata. Un solo numero grande per schermata.
2. Mai solo il colore per trasmettere un significato: parola, forma o tratteggio.
3. Su telefono mai viste dense: una sezione per schermata, "Indietro" in alto.
4. Niente NFC nella v1, niente caffè tra i fattori (l'utente non lo consuma).
5. Le correlazioni sono indizi, mai cause; si mostrano con almeno 14 notti e 5 occorrenze per fattore.
6. Nessun giallo nel tema scuro. Nessun bianco puro nel tema scuro.
7. Unità `rem` e fluide, contenuto centrato con `content-max` (1480px): su 4K più colonne, non schede più larghe.
8. Contrasti: testo 4.5:1 e controlli 3:1 in entrambi i temi; non cambiare un valore senza rimisurarlo.
