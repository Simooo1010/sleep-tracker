# CLAUDE.md — Sleep Tracker

Regole e istruzioni del progetto. Va letto all'inizio di ogni sessione.
La memoria (contesto utente, stato) sta in `MEMORY.md`. Prodotto: `docs/PROJECT.md`. Decisioni: `docs/DECISIONS.md`.

## Principio di prodotto
- Frizione di inserimento quasi nulla: raccolta passiva/automatica dove possibile, all'utente si chiede solo una conferma.

## Processo di lavoro (obbligatorio)
1. Pianificazione e definizione → 2. Design system → 3. UI (mockup) → 4. Codice → 5. Test → 6. Deploy.
   Non si scrive codice applicativo prima che design system e UI siano approvati.
2. Ogni task ha la sua chat/sessione. Le task vanno spezzate nelle unità più piccole possibili.
3. `MEMORY.md` e `docs/` sono la fonte di verità tra una sessione e l'altra: aggiornarli quando cambia qualcosa.

## Regole sui subagent
- **Haiku / Sonnet**: ricerca, lettura, attività read-only, task leggere o a basso rischio; Sonnet esegue quando l'obiettivo è già chiaro.
- **Opus (o Fable se disponibile)**: pianificazione, chiarimento, architettura, implementazione, fix, test, verifica — tutto ciò che richiede precisione.
- Sforzo massimo: **high**. Mai max/ultra.
- Subagent indipendenti → in parallelo nello stesso turno.

## Automazione e accessi
- Obiettivo: zero azioni manuali per l'utente su GitHub, Vercel, Supabase.
- Sicurezza: mai segreti nel repo; chiavi solo in env Vercel/Supabase. Azioni distruttive (drop tabelle, delete progetti) sempre confermate.
- Branch → PR draft → merge. Niente push diretti su `main`.
