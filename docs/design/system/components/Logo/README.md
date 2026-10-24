Logo e icona dell'app: una nuvola molto stilizzata con una luna a falce nascosta in parte dietro di essa, in sfumature di azzurro pastello su sfondo bianco.

**Cosa fornisci:** niente, usa i file della cartella `assets/Logo/`. Per l'icona dell'app usa sempre `app-icon.svg` o i PNG derivati, mai ricostruirla.

**File**
- `app-icon.svg` e `app-icon-1024.png`: icona completa con sfondo bianco a tutto campo, da usare per l'icona della schermata Home di iPhone e per l'App Store. Il disegno resta dentro i margini che iOS arrotonda (circa il 22%).
- `apple-touch-icon.png` (180×180): icona della schermata Home di iOS per la web app.
- `mark.svg`: solo il segno su fondo trasparente, per l'interfaccia (intestazioni, schermata di apertura).

**Regole**
- Il bianco dell'icona è sempre bianco, anche nel tema scuro. Nel tema scuro il segno si appoggia su una tessera bianca con raggio ~22% (`icon-tile`), mai direttamente sullo sfondo scuro.
- Il colore non è un gradiente lineare: sono più sfumature di azzurro pastello (`#e1edfd`, `#bcd3f4`, `#9dbbe8`, `#86a9e0`, `#7499d6`, con luci `#f3f8ff` e tocchi `#aab9ec`) sovrapposte e sfumate dentro la forma. Non sostituirle con un gradiente semplice.
- Un filo bianco separa la luna dalla nuvola: non rimuoverlo, né ridurlo sotto i 18px su 1024.
- Il nome in testo è "Sleep Tracker" in `font-display`, peso 300. Non affiancare il segno a un altro simbolo.
- Per il PWA: `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, `favicon-32.png` sono esportati dal SVG e vanno rigenerati se il SVG cambia.
