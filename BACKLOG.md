# Feature Backlog

Deferred features and ideas, not in v1 scope.

## Deferred (agreed out of v1)
- [ ] **Multi-currency** — per-expense currency + conversion at settle time. Affects `expenses` schema and all balance math.
- [ ] **Recurring bills** — auto-create expenses on a schedule (rent, utilities). Needs a scheduler + template model.

## Ideas / nice-to-haves
- [ ] Receipt photo uploads (attach image to an expense)
- [ ] Real accounts (password / OAuth) on top of magic-link
- [ ] Push/email notifications ("you were added to an expense", "X settled up")
- [ ] Export to CSV / monthly summary
- [ ] Split types beyond equal: exact amounts, percentages, shares/weights
- [ ] Per-group spending charts
- [ ] "Simplify debts" toggle (on by default) vs. raw who-owes-whom view

## v1 scope (for reference)
- Magic-link entry via group invite, no passwords
- Groups, members, expenses, equal splits, settlements
- Net-balance + greedy debt-simplification settle-up
- Mobile-first UI
