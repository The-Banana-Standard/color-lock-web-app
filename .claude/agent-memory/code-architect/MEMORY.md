# Code Architect Memory

## Project: Color Lock Web App

### Key Architecture Facts
- React 19 + TypeScript, Vite, Firebase backend, SCSS styling
- Tutorial uses Context + useReducer pattern (not Redux)
- TutorialProvider wraps GameContainer inside AuthenticatedApp
- `floodFill()` returns `[number[], number[]]` parallel arrays, not a Set
- Locked cells stored as `Set<string>` with `"row,col"` format keys
- `allColors` array order: Red, Green, Blue, Yellow, Purple, Orange (6 colors)
- Tutorial modal is lazy-loaded via `React.lazy()`

### Web vs iOS Grid Difference (Puzzle 0)
- **Web grid**: `[Red,Red,Yellow / Blue,Yellow,Green / Purple,Blue,Yellow]`
- **iOS grid**: `[Yellow,Yellow,Red / Blue,Red,Green / Purple,Blue,Red]`
- These are DIFFERENT grids. Any port from iOS must use web's grid and trace moves accordingly.

### SCSS Conventions
- Dark mode: `@include dark-mode` mixin (prefers-color-scheme)
- Variables: `$bg-warm-taupe`, `$bg-dark-elevated`, `$color-light-taupe`, `$color-text-primary`
- Spacing: `$spacing-xs` through `$spacing-xxxxl`
- Fonts: `$font-family-display` (Arvo), `$font-family-base` (system)
- DO NOT USE: `$text-dark`, `$text-muted-dark`, `$font-display`, `$border-radius-lg`

### Testing
- Root: Vitest (`npm run test`), Functions: Jest (`cd functions && npx jest`)
- Tutorial tests may reference `WATCH_PHASE_MESSAGES` and try puzzle configs

### Rules from CLAUDE.md
- Do NOT add minimum player threshold to weekly hardest calculation
