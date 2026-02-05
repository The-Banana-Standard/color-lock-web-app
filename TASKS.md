# Audit Pipeline Tasks

## Audit Summary
**Codebase**: Color Lock Web App
**Audited**: 2026-02-05
**Total Issues Found**: 26
**Tasks Created**: 15
**Health Score Before**: 6.5/10

---

## Active Tasks

### type-safety-improvements
**Task**: Type safety improvements (replace `any` types)
**Priority**: 9 of 15
**Stage**: RESEARCH
**Pipeline**: code-workflow
**Started**: 2026-02-05
**Issue**: Medium: 56 `any` usages weaken type checking
**Attempts**: 0
**Files**: TBD
**Quality Scores**:
| Stage | Score | Attempts | Status |
|-------|-------|----------|--------|
| RESEARCH | - | 0 | CURRENT |

### parallelize-datacache-fetches
**Task**: Parallelize DataCacheContext fetches
**Priority**: 4 of 15
**Stage**: REVIEW
**Pipeline**: code-workflow
**Started**: 2026-02-05
**Issue**: High: 6 sequential API calls on load
**Attempts**: 0
**Files**:
- MOD: src/contexts/DataCacheContext.tsx
- NEW: src/contexts/__tests__/DataCacheContext.test.tsx
**Quality Scores**:
| Stage | Score | Attempts | Status |
|-------|-------|----------|--------|
| RESEARCH | 9.8 | 1 | PASS |
| PLAN | 9.1 | 1 | PASS |
| IMPLEMENT | 9.8 | 1 | PASS |
| WRITE-TESTS | 9.3 | 1 | PASS |
| SIMPLIFY | 9.0 | 1 | PASS |
| VERIFY | 9.0 | 1 | PASS |
| REVIEW | - | 0 | CURRENT |

---

## Backlog

| # | Task | Impact | Effort | Priority | Source |
|---|------|--------|--------|----------|--------|
| ~~9~~ | ~~Type safety improvements (replace `any` types)~~ | - | - | - | Completed: 0 `any` in non-test src |
| 11 | Pre-compute leaderboard snapshots | 8 | M | 2.7 | High: full collection group scan per request |
| ~~12~~ | ~~Extract shared types between frontend/functions~~ | - | - | - | Completed |
| ~~13~~ | ~~Complete CRA-to-Vite migration cleanup~~ | - | - | - | Completed |
| ~~14~~ | ~~Remove console.logs / add production log stripping~~ | - | - | - | Completed: esbuild pure drops console.log/debug/info |
| ~~15~~ | ~~Fix functions npm audit vulnerabilities~~ | - | - | - | Done: 9→3 remaining (fast-xml-parser in firebase-admin) |

## Non-Audit Backlog (pre-existing)

- [ ] Tutorial overhaul — redesign to better teach the game
- [ ] Split monolithic functions/src/index.ts (3,399 lines) — Large effort
- [ ] Increase frontend test coverage (1 test file for 10,600 LOC) — Large effort
- [ ] Update TypeScript to 5.x — Low priority
- [ ] Add PWA/Service Worker support — Low priority
- [ ] Add .env.example — Low priority

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

## Deferred

- [ ] Secure service account keys & add runtimeconfig to gitignore — deferred (requires manual key rotation in GCP Console)
