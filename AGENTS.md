# AGENTS.md — Always Read

This file must be read in its entirety at the start of every task. It contains only rules that apply to every task, regardless of feature or area. Feature-specific instructions live in [ARCHITECTURE.md](ARCHITECTURE.md) and should only be consulted (searched, not fully read) when working on the relevant section.

## Mandatory rules

1. **Keep docs in sync with code.** Whenever you make a code change, update AGENTS.md and/or ARCHITECTURE.md in the same task if the change affects a rule, workflow, or feature described there. Do not leave documentation stale — treat doc updates as part of the change, not a follow-up.
2. **Git is read-only by default.** Never run any git command that changes repository or working-tree state (e.g. `commit`, `add`, `push`, `pull`, `merge`, `rebase`, `reset`, `checkout` to discard changes, `branch -d`, `tag`, `stash` other than inspecting) unless the user explicitly asks for that specific action in the current request. Read-only commands (`status`, `log`, `diff`, `show`, `blame`) are always fine.
3. **When adding a new feature or section**, add or update the corresponding section in ARCHITECTURE.md rather than leaving knowledge only in code comments or commit messages.
4. **Keep this file general.** Do not add feature-specific instructions here — they belong in ARCHITECTURE.md, organized by section.
5. **Verify before finishing.** Run `pnpm check` and `pnpm test`. For any visual change, render it (`pnpm screenshots`, or the mock preview at `/preview`) and look at the result at mobile and desktop sizes — passing tests alone does not mean a UI change is done.
6. **Secrets stay in the environment.** Never commit `.env*` files (other than `.env.example`), never log tokens or API keys, and never move service credentials into the database or admin UI.
