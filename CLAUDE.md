# CLAUDE.md

## Project Overview
Color Lock - A React/TypeScript web game with Firebase backend. Features include daily puzzles, ELO scoring, and leaderboards.

## Commands
```bash
npm run dev          # Start Vite dev server
npm run build        # Build for production
npm run test         # Run Vitest tests
npm run emulators    # Start Firebase emulators
npm run seed         # Seed emulator with test data
```

## Rules
- Do NOT add minimum player threshold to weekly hardest calculation (the suggestion of requiring 5+ players has been rejected)

## Patterns
- Uses Vite for bundling
- Firebase for backend (Firestore, Cloud Functions)
- SCSS for styling
- React 19 with TypeScript
