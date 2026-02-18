# Feature Analyzer Memory

## Project Structure

### iOS App (~/Desktop/Projects/color-lock/)
- Swift/SwiftUI, MVVM pattern
- Tutorial files: `ColorCluster/ViewModels/TutorialViewModel.swift`, `ColorCluster/Models/TutorialPuzzle.swift`
- Views in `ColorCluster/Views/TutorialViews/`, `MainViews/`, `ModalViews/`, `HelperViews/`
- Shared utilities: `PuzzleGridUtils` for flood fill, `AnimationTimings` for constants
- 6 TileColors: red, green, blue, yellow, purple, orange

### Web App (~/Desktop/Projects/color-lock-web-app/)
- React 19 + TypeScript, Context + useReducer pattern
- Tutorial context: `src/contexts/TutorialContext.tsx`, types in `tutorialTypes.ts`, config in `tutorialConfig.ts`
- Components in `src/components/tutorial/` (10 files)
- Styling in `src/scss/components/_tutorial.scss` (1209 lines)
- Shared utils: `src/utils/gameLogic.ts` (floodFill, findLargestRegion)

## Key Patterns
- iOS uses `@Published` + `@ObservedObject` for reactive state; web uses `useReducer` + Context
- iOS async sequences use `Task.sleep` with cancellation; web uses `setTimeout` in `useEffect`
- Both apps share identical puzzle data (3x3 grids, 3 puzzles, same optimal solutions)
- Both skip the Compare phase (code exists but flow bypasses it)
- Tutorial completion: iOS=UserDefaults, Web=localStorage

## Analysis Notes (2026-02-17)
- iOS watch phase has 13 sub-phases (`StartingBoardPhase` enum) for interactive guided demo
- Web watch phase has 6 steps (passive "Next" button step-through)
- This is the primary gap for tutorial port
- iOS try phase has 2 puzzles (indices 1,2); web has 3 (indices 0,1,2)
