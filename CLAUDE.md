# CLAUDE.md — Sleep Tracker

Memoria operativa del progetto. Va letta all'inizio di ogni sessione e aggiornata quando cambia una decisione.
Dettagli di prodotto: `docs/PROJECT.md`. Registro decisioni: `docs/DECISIONS.md`.

## Contesto utente
- Sleep tracker personale, per un solo utente (il proprietario del repo). Lingua: italiano.
- Problema centrale: dimentica di registrare il sonno e fatica a mantenere i dati nel tempo.
- NON usa il telefono come ultima cosa prima di dormire né come prima dopo il risveglio → l'inserimento manuale "a letto" non è una soluzione affidabile.
- Requisito n.1: frizione di inserimento quasi nulla. La raccolta deve essere passiva/automatica dove possibile.

## Processo di lavoro (obbligatorio)
1. Pianificazione e definizione → 2. Design system → 3. UI (mockup) → 4. Codice → 5. Test → 6. Deploy.
   Non si scrive codice applicativo prima che design system e UI siano approvati.
2. Ogni task ha la sua chat/sessione. Le task vanno spezzate nelle unità più piccole possibili.
3. Questo file e `docs/` sono la fonte di verità tra una sessione e l'altra.

## Regole sui subagent
- **Haiku / Sonnet**: ricerca, lettura, attività read-only, task leggere o a basso rischio; Sonnet esegue quando l'obiettivo è già chiaro.
- **Opus (o Fable se disponibile)**: pianificazione, chiarimento, architettura, implementazione, fix, test, verifica — tutto ciò che richiede precisione.
- Sforzo massimo: **high**. Mai max/ultra.
- Subagent indipendenti → in parallelo nello stesso turno.

## Automazione e accessi
- Obiettivo: zero azioni manuali per l'utente su GitHub, Vercel, Supabase.
- GitHub e Vercel: accessibili via MCP. Supabase: da collegare (vedi `docs/PROJECT.md` → Accessi).
- Sicurezza: mai segreti nel repo; chiavi solo in env Vercel/Supabase. Azioni distruttive (drop tabelle, delete progetti) sempre confermate.
- Branch → PR draft → merge. Niente push diretti su `main`.
