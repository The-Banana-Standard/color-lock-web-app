# Audit Pipeline Tasks

## Audit Summary
**Codebase**: Color Lock Web App
**Audited**: 2026-02-05
**Total Issues Found**: 26
**Tasks Created**: 15
**Health Score Before**: 6.5/10

---

## Active Tasks

### strip-userids-from-usage-stats
**Task**: Strip userIds from getUsageStats response
**Priority**: 3 of 15
**Stage**: PLAN
**Pipeline**: code-workflow
**Started**: 2026-02-05
**Issue**: High: exposes all player UIDs to any caller
**Attempts**: 0
**Files**: TBD
**Quality Scores**:
| Stage | Score | Attempts | Status |
|-------|-------|----------|--------|
| RESEARCH | 9.1 | 1 | PASS |
| PLAN | - | 0 | CURRENT |

### parallelize-datacache-fetches
**Task**: Parallelize DataCacheContext fetches
**Priority**: 4 of 15
**Stage**: RESEARCH
**Pipeline**: code-workflow
**Started**: 2026-02-05
**Issue**: High: 6 sequential API calls on load
**Attempts**: 0
**Files**: TBD
**Quality Scores**:
| Stage | Score | Attempts | Status |
|-------|-------|----------|--------|
| RESEARCH | - | 0 | CURRENT |

---

## Backlog

| # | Task | Impact | Effort | Priority | Source |
|---|------|--------|--------|----------|--------|
| 5 | Replace dangerouslySetInnerHTML in tutorials | 8 | S | 8.0 | High: fragile XSS-risk pattern |
| 6 | Quick wins cleanup (typo, .bak, unused deps, dead code) | 5 | S | 5.0 | Medium: notification typo, .bak files, firebase-admin in root, unused zod/statsStorage |
| 7 | Fix N+1 auth calls in sendDailyPuzzleReminders | 7 | S | 7.0 | High: N sequential Auth API calls |
| 8 | Add keyboard accessibility to game tiles & modals | 6 | S | 6.0 | Low: core game inaccessible to keyboard users |
| 9 | Type safety improvements (replace `any` types) | 5 | S | 5.0 | Medium: 56 `any` usages weaken type checking |
| 10 | Add client-side input validation to auth forms | 6 | S | 6.0 | Medium: no validation before Firebase calls |
| 11 | Pre-compute leaderboard snapshots | 8 | M | 2.7 | High: full collection group scan per request |
| 12 | Extract shared types between frontend/functions | 5 | S | 5.0 | Medium: functions import from ../../src/types |
| 13 | Complete CRA-to-Vite migration cleanup | 4 | S | 4.0 | Low: CRA env shim, eslintConfig, reportWebVitals |
| 14 | Remove console.logs / add production log stripping | 5 | M | 1.7 | Medium: 139 console.log in production builds |
| 15 | Fix functions npm audit vulnerabilities | 5 | S | 5.0 | Medium: 9 vulnerabilities in functions deps |

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

## Deferred

- [ ] Secure service account keys & add runtimeconfig to gitignore — deferred (requires manual key rotation in GCP Console)
