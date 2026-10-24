Navigazione principale. Su telefono è una barra flottante a pillola, isolata dai bordi; su PC è una barra laterale.

**Cosa fornisci:** le voci (etichetta, icona) e quale è attiva (`aria-current="page"`).

**Telefono (`navpill`)**
- Pillola larga quanto lo schermo meno `nav-inset` (14px) per lato, a 16px dal fondo, altezza `nav-pill` (68px), `radius-pill`, bordo `line`, `shadow-float`. Non tocca mai i bordi.
- Cinque voci: Notte, Regolarità, Grafici, Storico, Sera. "Segnali" si apre da un pulsante in alto, non dalla barra.
- Voce attiva: sfondo `blue-soft`, testo `blue-ink` in grassetto. Le altre `ink-muted`. Icona su griglia 24px, tratto 1.6px, etichetta di 11px.
- Lascia almeno 120px di spazio in fondo al contenuto, così l'ultima riga non finisce sotto la barra.

**PC (`side`)**
- Larghezza `sidebar` (240px), logo "Sleep Tracker" in `font-display` peso 300, sei voci (con Segnali), riepilogo di oggi e interruttore del tema in fondo. Voce attiva con lo stesso stile.

**Regole**
- Mai più di cinque voci nella barra del telefono. Aree toccabili da 56px di altezza.
