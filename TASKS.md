# Audit Pipeline Tasks

## Audit Summary
**Codebase**: Color Lock Web App
**Audited**: 2026-02-05
**Total Issues Found**: 26
**Tasks Created**: 15
**Health Score Before**: 6.5/10

---

## Active Tasks

*No active tasks*

---

## Backlog

| # | Task | Impact | Effort | Priority | Source |
|---|------|--------|--------|----------|--------|
| ~~9~~ | ~~Type safety improvements (replace `any` types)~~ | - | - | - | Completed: 0 `any` in non-test src |
| ~~11~~ | ~~Pre-compute leaderboard snapshots~~ | - | - | - | Completed |
| ~~12~~ | ~~Extract shared types between frontend/functions~~ | - | - | - | Completed |
| ~~13~~ | ~~Complete CRA-to-Vite migration cleanup~~ | - | - | - | Completed |
| ~~14~~ | ~~Remove console.logs / add production log stripping~~ | - | - | - | Completed: esbuild pure drops console.log/debug/info |
| ~~15~~ | ~~Fix functions npm audit vulnerabilities~~ | - | - | - | Done: 9→3 remaining (fast-xml-parser in firebase-admin) |

## Non-Audit Backlog (pre-existing)

- [ ] Tutorial overhaul — redesign to better teach the game (discarded 2026-02-05, needs better task definition)
- [ ] Dead code cleanup: TutorialContext.tsx:29-32 getMoveIndexForStep (discovered during tutorial-overhaul RESEARCH)
- [ ] Extract magic numbers in TutorialContext.tsx to constants (discovered during tutorial-overhaul RESEARCH)
- [ ] Add tutorial analytics tracking (discovered during tutorial-overhaul RESEARCH)
- [x] Split monolithic functions/src/index.ts — Completed (3,753→39 lines)
- [x] Increase frontend test coverage — Completed (28→253 tests)
- [x] Update TypeScript to 5.x — Completed
- [ ] Add PWA/Service Worker support — Low priority
- [x] Add .env.example — Completed

## Completed

- [x] Fix failing test suite — resolve 9 failing Vitest files (2026-02-05, audit)
- [x] Add Error Boundary — catch runtime crashes with fallback UI (2026-02-05, audit)
- [x] Remove unused dependencies — remove 7 unused packages + CRA leftovers (2026-02-05, audit)
- [x] Fix dependency vulnerabilities — resolve 8 of 11 npm audit issues (2026-02-05, audit)
- [x] Code-split to reduce bundle size — 914KB → 259KB main bundle (2026-02-05, audit)
- [x] Mobile responsiveness — fix layout issues at small screen sizes (2026-02-04)
- [x] Light mode fix — sign up on game screen off-theme (2026-02-04)
- [x] Deferred guest auth — move Firebase guest account creation to first move (2026-02-04)
- [x] Dark mode theming sweep
- [x] Streaks UI — surface streak data in stats view
- [x] Add admin auth to backfillUsageStats & getUsageStats — UID allowlist via env var (2026-02-05, audit)
- [x] Replace dangerouslySetInnerHTML in TutorialModal — safe React elements (2026-02-05, audit)
- [x] Quick wins cleanup — typo fix, .bak files, unused zod, dead statsStorage (2026-02-05, audit)
- [x] Fix N+1 auth calls in sendDailyPuzzleReminders — batched getUsers() (2026-02-05, audit)
- [x] Add keyboard accessibility to game tiles & color picker (2026-02-05, audit)
- [x] Add client-side input validation to auth forms (2026-02-05, audit)
- [x] Fix functions npm audit vulnerabilities — 9→3 remaining (2026-02-05, audit)
- [x] Complete CRA-to-Vite migration cleanup — removed CRA artifacts, 3 unused deps (2026-02-05, audit)
- [x] Extract shared types to shared/ directory — functions no longer import from ../../src/types (2026-02-05, audit)
- [x] Strip userIds from getUsageStats response — defense-in-depth, remove UIDs from API response (2026-02-05, audit)
- [x] Type safety improvements — eliminated all `any` types from non-test source (0 remaining) (2026-02-05, audit)
- [x] Production log stripping — esbuild drops console.log/debug/info in builds (2026-02-05, audit)
- [x] Parallelize DataCacheContext fetches — 6 sequential API calls → Promise.all parallel execution (2026-02-05, audit)
- [x] Pre-compute leaderboard snapshots — fix 4 bugs: collection name, userRanks map, totalEntries, ELO recomputation (2026-02-05, audit)
- [x] Quick wins: TypeScript 4.9.5 → 5.9.3, tsconfig improvements, .env.example updates (2026-02-05)
- [x] Split monolithic functions/src/index.ts — 3,753→39 lines, 17 functions into domain-based modules (2026-02-05)
- [x] Increase frontend test coverage — 28→253 tests, 8 new test files for utils + components (2026-02-05)

## Deferred

- [ ] Secure service account keys & add runtimeconfig to gitignore — deferred (requires manual key rotation in GCP Console)
