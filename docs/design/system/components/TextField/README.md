Campo di testo libero: una riga (`input`) per nomi brevi, più righe (`textarea`) per una descrizione. Si usa per un imprevisto in più ("Altro imprevisto", max 30 caratteri), per la descrizione della giornata nel check serale (max 280) e per i nomi in Impostazioni.

**Cosa fornisci:** etichetta, valore, `maxLength` e il gestore di modifica. Facoltativi: suggerimento (`hint`), errore, segnaposto, `multiline`.

**Regole**
- Stile come `.input`: altezza minima `tap` (48px), testo 16px (niente zoom su iPhone), bordo `line-strong` da 1px, sfondo `surface-sunken`, raggio `radius-md`. Con più righe l'altezza minima è 7rem e si può allargare in verticale.
- Focus: anello `shadow-focus`, sempre visibile. Mai `outline` rimosso senza sostituto.
- Etichetta sempre presente: visibile sopra il campo (`body-sm`) o, con `hideLabel`, solo come nome accessibile. Il segnaposto non sostituisce l'etichetta.
- Contatore sotto il campo, a destra, in `caption` `ink-muted`: "12 su 30". Conta i caratteri veri (le emoji valgono uno) e il testo più lungo viene tagliato al limite.
- Errore scritto a parole, tono calmo e mai di rimprovero ("Scrivi il nome dell'imprevisto."), con `aria-invalid` e bordo `peach-ink` da 1.5px: il colore non è l'unico segnale.
- Invio conferma nei campi a una riga, Esc li chiude; nei campi a più righe Invio va a capo.
- Sempre facoltativo: nessun campo di testo è obbligatorio per salvare il check.
- Unità `rem`, larghezza piena del contenitore, `min-width: 0`.
