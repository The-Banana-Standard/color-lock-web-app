# Web Developer Agent Memory

## Project Architecture
- Vite + React 19 + TypeScript, SCSS styling, Firebase backend
- Tutorial system: TutorialContext (useReducer), modal-based with Watch -> Try -> Ready phases
- Compare phase was removed (2026-02-17)
- Tutorial try puzzles: 2 puzzles (blue target, green target) - reduced from 3
- Watch phase is now interactive guided demo with StartingBoardPhase state machine

## Key Patterns
- Async sequences in tutorial use abort flag + setTimeout cleanup pattern in useEffect
- floodFill returns [number[], number[]] parallel arrays, convert to Set<string> as needed
- SCSS uses @include dark-mode mixin (not @media query directly)
- Custom CSS properties set inline need type cast: `(style as React.CSSProperties & Record<string, string>)`

## Testing
- 275 tests pass (all Vitest, no dedicated tutorial tests)
- Pre-existing tsc errors in test files (missing test runner types) and unrelated files - do not need fixing
- Build: `npx vite build` succeeds

## Recent Changes
- Interactive watch phase port from iOS (2026-02-17): 13 files changed/created
- Auto-show tutorial on first launch via localStorage flags
