# Tasks

## Audit Summary
**Codebase**: Color Lock Web App
**Audited**: 2026-02-05
**Total Issues Found**: 16
**Tasks Created**: 5
**Health Score Before**: 7.0/10

---

## Current Task

None

---

## Backlog

### Audit Tasks
| # | Task | Impact | Effort | Priority | Source |
|---|------|--------|--------|----------|--------|
| 1 | Fix failing test suite | 9 | S | 9.0 | Critical: 7 tests fail with stale assertions in helpers.test.ts and App.test.tsx |
| 2 | Add Error Boundary | 8 | S | 8.0 | High: No error boundary — single runtime error crashes entire app |
| 3 | Remove unused dependencies | 7 | S | 7.0 | High: 8 unused packages bloating node_modules and security surface |
| 4 | Fix dependency vulnerabilities | 7 | S | 7.0 | High: npm audit shows moderate-to-high severity vulnerabilities |
| 5 | Code-split to reduce bundle size | 8 | M | 2.7 | High: 913KB JS bundle, 83% over Vite's 500KB warning |

### Other
- [ ] Tutorial overhaul — redesign to better teach the game

## Completed

- [x] Mobile responsiveness — fix layout issues at small screen sizes (2026-02-04)
- [x] Light mode fix — sign up on game screen off-theme (2026-02-04)
- [x] Deferred guest auth — move Firebase guest account creation to first move (2026-02-04)
- [x] Dark mode theming sweep
- [x] Streaks UI — surface streak data in stats view

## Deferred (Audit)
- [ ] Clean up 138 console.log statements — Medium effort, lower priority
- [ ] Add client-side input validation — Low impact
- [ ] Split monolithic functions/src/index.ts (3,399 lines) — Large effort
- [ ] Increase frontend test coverage (1 test file for 10,600 LOC) — Large effort
- [ ] Improve accessibility (ARIA, keyboard nav) — Large effort
- [ ] Update TypeScript to 5.x — Low priority
- [ ] Add PWA/Service Worker support — Low priority
- [ ] Add .env.example — Low priority
