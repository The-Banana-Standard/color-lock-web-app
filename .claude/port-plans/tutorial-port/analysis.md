# Feature Analysis: Tutorial System Port (iOS to Web)

**Source**: `/Users/jacobpress/Desktop/Projects/color-lock/` (Swift/SwiftUI iOS app)
**Target**: `/Users/jacobpress/Desktop/Projects/color-lock-web-app/` (React/TypeScript web app)
**Analyzed**: 2026-02-17

## Executive Summary

The iOS tutorial is a sophisticated, multi-phase interactive walkthrough with a guided "watch" demo (user taps highlighted tiles with animated hand guidance through 4 moves), followed by 2 self-directed practice puzzles, a ready phase, and skip/loss handling. The web app already has a full tutorial implementation that mirrors this structure closely but uses a simpler non-interactive watch phase (user clicks "Next" buttons to step through pre-applied moves). The key gap is that the iOS watch phase is a fully interactive guided demo where the user physically taps tiles and picks colors with hand pointer guidance, while the web watch phase is a passive step-through slideshow.

## Feature Boundaries

### Source (iOS) Primary Files
| File | Purpose | Lines |
|------|---------|-------|
| `ColorCluster/ViewModels/TutorialViewModel.swift` | State machine: phases, watch step states, interactive demo logic, puzzle solving, replay | 827 |
| `ColorCluster/Models/TutorialPuzzle.swift` | Puzzle data: grids, optimal solutions, WatchStepState/StartingBoardPhase enums, 3 puzzles | 322 |
| `ColorCluster/Views/MainViews/TutorialView.swift` | Main coordinator: phase routing, skip confirmation overlay, ready phase UI | 308 |
| `ColorCluster/Views/TutorialViews/TutorialWatchPhaseView.swift` | Watch phase: interactive guided demo with instruction cards, hand pointers, picker | 468 |
| `ColorCluster/Views/TutorialViews/TutorialTryPhaseView.swift` | Try phase: 2 interactive puzzles with progress dots, color picker, soft fail, loss modal | 467 |
| `ColorCluster/Views/TutorialViews/TutorialComparePhaseView.swift` | Compare phase: score count-up, replay animation, "You vs Best" (currently skipped) | 336 |
| `ColorCluster/Views/TutorialViews/TutorialGridView.swift` | 3x3 grid with tiles, locks, highlights, spin animation | 243 |
| `ColorCluster/Views/TutorialViews/TutorialDemoColorPickerView.swift` | Demo color picker with highlighted target color | 86 |
| `ColorCluster/Views/ModalViews/TutorialLostModalView.swift` | Loss modal with target color reminder and Try Again | 100 |
| `ColorCluster/Views/ModalViews/LearnToPlayModalView.swift` | "How to Play" entry modal (info button trigger) | 106 |
| `ColorCluster/Views/HelperViews/AnimatedHandView.swift` | Animated hand pointer (tile + picker targeting) | 190 |
| `ColorCluster/Utilities/AnimationTimings.swift` | Centralized timing constants | 177 |

### Source Supporting Files
| File | Purpose | Required |
|------|---------|----------|
| `ColorCluster/Utilities/AppStorageKeys.swift` | UserDefaults keys for completion tracking | Yes |
| `ColorCluster/Views/MainViews/PuzzleView.swift` | First-launch detection, tutorial trigger logic | Yes (reference only) |
| `ColorCluster/Models/PuzzleModels.swift` | TileColor enum definition | Yes (shared) |

### Target (Web) Primary Files
| File | Purpose | Lines |
|------|---------|-------|
| `src/contexts/TutorialContext.tsx` | useReducer state management, actions, provider | 534 |
| `src/contexts/tutorialTypes.ts` | TypeScript enums, interfaces, action types | 185 |
| `src/contexts/tutorialConfig.ts` | Puzzle data, messages, helpers (mirrors TutorialPuzzle.swift) | 266 |
| `src/components/tutorial/TutorialModal.tsx` | Main container, phase routing, close handling | 121 |
| `src/components/tutorial/TutorialWatchPhase.tsx` | Watch phase: passive step-through with animated hand | 273 |
| `src/components/tutorial/TutorialTryPhase.tsx` | Try phase: 3 interactive puzzles (same as iOS) | 264 |
| `src/components/tutorial/TutorialComparePhase.tsx` | Compare phase: score comparison with count-up | 109 |
| `src/components/tutorial/TutorialReadyPhase.tsx` | Ready phase: "You're Ready!" with play/practice buttons | 69 |
| `src/components/tutorial/TutorialGrid.tsx` | 3x3 grid component | 103 |
| `src/components/tutorial/TutorialTile.tsx` | Individual tile with lock, highlight, selection states | 99 |
| `src/components/tutorial/TutorialColorPicker.tsx` | Bottom-sheet color picker for try phase | 92 |
| `src/components/tutorial/AnimatedHand.tsx` | Emoji hand pointer (simpler than iOS) | 52 |
| `src/components/tutorial/SkipConfirmationModal.tsx` | Skip confirmation dialog | 85 |
| `src/scss/components/_tutorial.scss` | All tutorial styling | 1209 |
| `src/utils/animationTimings.ts` | Centralized timing constants | 101 |

### Total Scope
- **iOS Source Files**: 12 primary + 3 supporting
- **iOS Lines of Code**: ~3,630
- **Web Target Files**: 15 primary
- **Web Lines of Code**: ~3,562
- **Complexity**: High (interactive state machine with guided animations)

## Dependencies

### Internal Dependencies (iOS)
| Dependency | Used For | Web Equivalent |
|------------|----------|----------------|
| `TileColor` enum | Color model for grid tiles | `TileColor` in `src/types.ts` |
| `PuzzleGridUtils.floodFill` | Region detection for color changes | `floodFill` in `src/utils/gameLogic.ts` |
| `PuzzleGridUtils.findLargestRegion` | Lock detection | `findLargestRegion` in `src/utils/gameLogic.ts` |
| `AppStorageKeys` | UserDefaults key management | `localStorage` key strings |
| `AnimationTimings` | Centralized timing constants | `src/utils/animationTimings.ts` |
| `ColorLockTitle` | Brand title component (ready phase) | `GradientTitle` component |
| `Color.*` extensions | App color palette | SCSS variables |

### External Dependencies
| Package | iOS | Web Equivalent |
|---------|-----|----------------|
| SwiftUI | View framework | React 19 |
| Combine | Reactive state (@Published) | useReducer + Context |
| UserDefaults | Persistence | localStorage |
| UIAccessibility | VoiceOver support | ARIA attributes |
| SF Symbols | Icons (lock, hand, star) | FontAwesome / SVG |

## Detailed Feature Comparison

### Phase 1: Watch Phase

#### iOS Implementation (Interactive Guided Demo)
The iOS watch phase is a **fully interactive guided walkthrough** with two sub-phases:

1. **PreIntro** (completed puzzle display):
   - Shows a 3x3 grid where all tiles are red (the target color) with all tiles locked
   - Header: "How To Win?"
   - Instruction card: "Turn every tile into the target color."
   - Hint card: "Click 'Reset Puzzle' to see how this puzzle was solved."
   - Button: "Reset Puzzle" triggers transition to startingBoard

2. **StartingBoard** (interactive demo with 13 sub-phases):
   The `StartingBoardPhase` enum defines a rich interactive sequence:

   | Sub-Phase | User Action | What Happens |
   |-----------|-------------|--------------|
   | `transitioning` | (automatic) | Tiles spin 3D rotation with diagonal stagger, locks fade out then re-appear on largest region |
   | `waitingForTileTap` | Tap green tile at [1,2] | Hand pointer bounces on green tile. Instruction: "Tap the highlighted tile to change its color" |
   | `pickerOpen` | Tap red in picker | Demo picker appears, hand points at red. Instruction: "Turning this tile red creates a new group of 4 red tiles" |
   | `resultShown` | (automatic 2.5s) | Color changes, locks update. Instruction: "As the new largest group, the reds lock..." |
   | `waitingForPurpleTap` | Tap purple tile at [2,0] | Hand moves to purple tile |
   | `purplePickerOpen` | Tap blue in picker | Picker shows, hand on blue. Instruction: "Creating groups helps you complete puzzles in fewer moves" |
   | `purpleResultShown` | (automatic 2.0s) | Purple becomes blue, locks update |
   | `waitingForBlueTap` | Tap any blue tile | Hand on blue tiles. Instruction: "Finish this puzzle by changing the two remaining groups to red" |
   | `bluePickerOpen` | Tap red in picker | Picker shows, hand on red |
   | `blueResultShown` | (automatic 1.5s) | Blues become red, locks update |
   | `waitingForYellowTap` | Tap any yellow tile | Hand on yellow tiles |
   | `yellowPickerOpen` | Tap red in picker | Picker shows, hand on red |
   | `puzzleCompleted` | Tap "Try Tutorial Puzzles" | All red, "Puzzle Solved!" header, "Solved in just 4 moves!" instruction |

   Key features:
   - **Animated hand pointer** bounces on target tiles and picker colors
   - **Demo color picker** with highlighted target color (yellow ring + white ring)
   - **Tile spin animation**: 3D Y-axis rotation with diagonal stagger delay (0.06s per diagonal)
   - **Lock fade transitions**: smooth opacity animations on lock overlays
   - **Region highlighting**: flashing border in target color on tiles that will be affected
   - **Contextual instruction cards**: 6 different cards color-coded (coral, gold, sky blue, mauve pink, sage green)
   - **Debounce protection**: 0.3s between advances to prevent rapid tapping

#### Web Implementation (Passive Step-Through)
The web watch phase is a **passive demo** where the user clicks "Start" then "Next" buttons:

1. **Intro**: Shows starting grid, "Click start to solve this puzzle"
2. **Move1**: Shows grid + hand on purple tile, "Click Next to change purple to blue"
3. **Move2**: Shows grid after move 1, "Blue is now the largest region - it locks!"
4. **Move3**: Shows grid after move 2, "Click Next to change blue to red"
5. **Move4**: Shows grid after move 3, "Click Next to change yellow to red"
6. **Win**: Shows solved grid, "Solved in just 4 moves!", button "Now You Try!"

Key differences:
- User never interacts with the grid (no tapping tiles, no picking colors)
- Grid state is computed per step (not animated in real-time)
- Hand pointer is static (points at tile being described, no movement to picker)
- No color picker display during watch phase
- No tile spin animation
- No contextual instruction cards (just text lines below grid)
- Progress dots show move count, not sub-phase progress

### Phase 2: Try Phase

#### iOS Implementation
- **2 puzzles** (indices 1 and 2 -- puzzle 0 was completed in watch phase)
- Puzzles: Blue target (5 optimal), Green target (6 optimal)
- Progress dots with theme colors (pink, blue, green)
- Goal hint card on first display: "Our bot sets a goal for each puzzle. Try solving in 5 moves or less!"
- Soft fail warning based on region analysis (checks all non-target regions >= 4 tiles)
- Loss at 5+ tiles locked in wrong color
- Loss modal: "Puzzle Lost" with coral title, target color reminder
- Auto-advance after solve (1.0s delay)
- Color picker: inline floating card with target color star badge
- Reset button with icon
- After all puzzles: advances directly to Ready (compare phase skipped)

#### Web Implementation
- **3 puzzles** (indices 0, 1, 2 -- same puzzles)
- Puzzles: Red target (4 optimal), Blue target (5 optimal), Green target (6 optimal)
- Progress dots with custom indicator colors
- Warning based on locked cells count reaching threshold - 1
- Loss at 5+ tiles locked in wrong color
- Loss modal: "Puzzle Lost" with target color display
- Auto-advance after solve (1.0s delay)
- Color picker: bottom sheet with color names and checkmark
- Reset and Skip buttons in footer
- After all puzzles: advances to Ready phase

**Key difference**: Web includes puzzle 0 (Red target, 4 moves) in the try phase, while iOS uses puzzle 0 only in the watch phase demo. This means web users solve 3 puzzles manually, iOS users solve 2 manually (after completing 1 guided).

### Phase 3: Compare Phase

#### iOS Implementation
Currently **skipped** (ViewModel transitions directly from Try to Ready). Code exists but is not exercised. Would show:
- "You vs Best" score comparison with count-up animation
- Replay of optimal solution if user was suboptimal
- Competitive message: "Can you match today's goals?"

#### Web Implementation
Exists and is routed to but the flow goes Try -> Ready (startReadyPhase is called directly from TutorialTryPhase on last puzzle solve). The compare phase component exists with:
- Score count-up animation
- Performance-based messaging
- "Perfect Score!" badge

**Both skip the compare phase in practice.**

### Phase 4: Ready Phase

Both are essentially identical:
- Brand logo/title
- Star icon/badge
- "You're Ready!" title
- "Now try to beat the daily goal." subtitle
- "Start Playing" primary button -> completes tutorial
- "Practice Again" secondary button -> resets to try phase

### Skip Flow

Both implement the same logic:
- First-time users: show confirmation dialog ("Skip Tutorial?" / "Continue Tutorial")
- Returning users: skip immediately without confirmation
- X button / Close triggers skip logic

### Completion Tracking

| Aspect | iOS | Web |
|--------|-----|-----|
| Storage | UserDefaults (`hasCompletedTutorial`) | localStorage (`colorlock_tutorial_completed`) |
| First launch | `hasLaunchedBefore` flag, auto-show tutorial | Info button trigger only |
| Re-access | Info button -> LearnToPlayModal -> Tutorial | Info button -> openTutorial() |

### Trigger Logic

| Trigger | iOS | Web |
|---------|-----|-----|
| First launch | Auto-shows tutorial if `!hasCompletedTutorial` | No auto-show |
| Second launch | Shows "Learn to Play" modal if `!hasSeenLearnToPlayModal` | N/A |
| Manual | Info button -> LearnToPlayModal -> "Yes, show me" | Info button -> openTutorial() directly |

## Gap Analysis

### What iOS Has That Web Lacks

1. **Interactive Watch Phase Demo** (HIGH PRIORITY)
   - User physically taps highlighted tiles on the grid
   - Demo color picker appears after tile tap, user taps the correct color
   - 13 sub-phases with contextual instruction cards
   - This is the core pedagogical difference -- learning by doing vs. watching

2. **Tile Spin Animation** (MEDIUM)
   - 3D Y-axis rotation when transitioning from completed to starting grid
   - Diagonal stagger delay creates cascade effect
   - CSS `transform: rotateY(360deg)` equivalent possible

3. **Animated Hand on Color Picker** (MEDIUM)
   - Hand moves from grid to picker to guide color selection
   - `AnimatedHandPickerContainer` calculates bubble positions
   - Web hand only points at grid tiles, never at picker

4. **Contextual Color-Coded Instruction Cards** (LOW-MEDIUM)
   - 6 different instruction cards with distinct background colors:
     - Sage green (preIntro), Coral (default), Gold (picker preview), Sky blue (lock explanation), Mauve pink (strategy), Sage green (finish)
   - Web uses plain text lines below the grid

5. **Lock Fade Animations** (LOW)
   - Smooth opacity transitions when locks appear/disappear
   - iOS uses `AnimationTimings.Tutorial.tileLockFadeDuration` (1.0s)

6. **First-Launch Auto-Show** (LOW)
   - iOS shows tutorial automatically on first app launch
   - Web only shows via manual info button click

7. **"Learn to Play" Entry Modal** (LOW)
   - iOS shows this on second launch if tutorial wasn't completed
   - Graduation cap icon with "Would you like a quick walkthrough?"

### What Web Has That iOS Lacks

1. **3 Try Puzzles** (web includes puzzle 0 in try phase)
   - iOS only has 2 try puzzles since puzzle 0 is used in watch demo
   - This is actually better for the interactive watch approach -- puzzle 0 IS the watch demo

2. **Keyboard Accessibility** (web has Enter/Space handlers, Escape for modals)
   - iOS relies on VoiceOver; web has explicit keyboard support

3. **Color Names in Picker** (web shows text labels under bubbles)

### What Needs to Change for Parity

| Change | Effort | Description |
|--------|--------|-------------|
| Rewrite Watch Phase | **High** | Replace passive step-through with interactive guided demo matching iOS StartingBoardPhase flow |
| Add Demo Color Picker | **Medium** | New component for watch phase (highlighted target, hand pointer on correct color) |
| Add Tile Spin Animation | **Medium** | CSS 3D transform with stagger delay for grid transition |
| Add Instruction Cards | **Low** | Styled card components with color-coded backgrounds |
| Update Watch State Machine | **High** | Replace WatchStepState enum (Intro/Move1-4/Win) with PreIntro + StartingBoardPhase (13 sub-phases) |
| Animate Hand to Picker | **Medium** | Extend AnimatedHand to calculate picker bubble positions |
| Reduce Try Puzzles to 2 | **Low** | Remove puzzle 0 from try phase (it becomes the watch demo) |
| Add PreIntro State | **Low** | Show completed grid with "Reset Puzzle" button before interactive demo |

## Patterns & Conventions

### Architecture (iOS)
- **Pattern**: MVVM with `@ObservableObject` ViewModel
- **State Management**: `@Published` properties + SwiftUI bindings
- **Data Flow**: ViewModel owns state, View reads via `@ObservedObject`, callbacks via closures
- **Async**: `Task` + `Task.sleep` for sequenced animations

### Architecture (Web)
- **Pattern**: Context + useReducer (Flux-like)
- **State Management**: Single `TutorialState` object with discriminated union actions
- **Data Flow**: Context Provider -> useContext hook -> dispatch actions
- **Async**: `setTimeout`/`useEffect` for sequenced animations

### Code Conventions
- iOS: Enum-based state machines, computed properties, `withAnimation` blocks
- Web: Reducer pattern, `useMemo`/`useCallback`, CSS classes for animation

## Portability Assessment

| Aspect | Source (iOS) | Target (Web) | Effort |
|--------|-------------|--------------|--------|
| Language | Swift 5 | TypeScript 5.9 | Low |
| Framework | SwiftUI | React 19 | Medium |
| State Mgmt | @Published/ObservableObject | useReducer/Context | Medium |
| UI Layer | SwiftUI Views | React Components + SCSS | Medium |
| Animations | SwiftUI `withAnimation` + Task.sleep | CSS transitions + setTimeout | High |
| Tile Interactions | onTapGesture | onClick handlers | Low |
| Color Picker | Custom SwiftUI View | React Component | Low |
| Hand Animation | SwiftUI offset + scale | CSS position + transform | Medium |
| 3D Tile Spin | rotation3DEffect | CSS transform: rotateY | Medium |

**Overall Portability Score**: 6/10 (Moderate)

The data model and flow logic port straightforwardly. The main challenge is translating the iOS interactive watch phase's complex animation sequences (tile spins, hand movement, timed delays, lock fades) into CSS/JS equivalents with the same feel.

## Risks

### Technical Risks
1. **Animation Sequencing Complexity**: The iOS watch phase uses 5+ chained `Task.sleep` calls with cancellation tokens. Web equivalent needs careful setTimeout management with cleanup in useEffect return functions to avoid memory leaks and stale state.
   - *Mitigation*: Use AbortController or ref-based cancellation pattern.

2. **3D Tile Spin on Mobile Browsers**: CSS `transform: rotateY()` with perspective may have performance issues on lower-end mobile browsers.
   - *Mitigation*: Use `will-change: transform`, test on real devices, fall back to fade for reduced-motion.

3. **Hand Position Calculation for Picker**: iOS uses hardcoded picker layout math (`AnimatedHandPickerContainer`). Web picker is a bottom sheet with responsive sizing -- hand positioning needs dynamic calculation.
   - *Mitigation*: Use refs to measure actual picker bubble positions at render time.

### Scope Risks
1. **13 Sub-Phases in Watch Demo**: The `StartingBoardPhase` enum has 13 states, each with specific UI, hand targets, instruction cards, and transitions. This is substantially more complex than the current 6-step web watch phase.
   - *Mitigation*: Implement incrementally -- start with the 4 tile-tap + picker states, add polish animations later.

2. **Regression Risk**: The existing web tutorial works. Rewriting the watch phase risks breaking the try/ready/skip flows.
   - *Mitigation*: Keep TutorialContext actions stable, only change WatchStepState enum and TutorialWatchPhase component. Test full flow after each sub-phase addition.

### Knowledge Gaps
1. **CSS 3D Transform Stagger**: Need to verify the diagonal stagger pattern works smoothly with CSS `animation-delay` across a 3x3 grid.

## Code to Replace

### Files to Significantly Modify
| File | Changes | Reason |
|------|---------|--------|
| `src/contexts/tutorialTypes.ts` | Replace `WatchStepState` enum (6 values) with PreIntro + StartingBoardPhase approach (2 + 13 values) | iOS has a richer watch phase state machine |
| `src/contexts/tutorialConfig.ts` | Add instruction card text/colors, update watch phase messages, add StartingBoardPhase descriptions | New contextual content per sub-phase |
| `src/contexts/TutorialContext.tsx` | Add new actions for StartingBoardPhase transitions, demo picker, tile tap handling during watch | Interactive demo needs new state transitions |
| `src/components/tutorial/TutorialWatchPhase.tsx` | **Full rewrite** -- replace passive step-through with interactive guided demo | Core gap between iOS and web |
| `src/components/tutorial/AnimatedHand.tsx` | Add picker targeting support (calculate position over color bubbles) | Hand needs to point at picker during demo |
| `src/components/tutorial/TutorialTile.tsx` | Add spin animation support (CSS 3D transform with delay) | Tile spin transition effect |
| `src/components/tutorial/TutorialGrid.tsx` | Add transitioning prop, pass spin state to tiles | Grid needs to coordinate spin animation |
| `src/scss/components/_tutorial.scss` | Add instruction card styles, tile spin keyframes, demo picker styles, hand-on-picker positioning | New visual elements |

### New Files Needed
| File | Purpose |
|------|---------|
| `src/components/tutorial/TutorialDemoColorPicker.tsx` | Demo-mode color picker with highlighted target (for watch phase) |
| `src/components/tutorial/TutorialInstructionCard.tsx` | Color-coded instruction card component |

### Files to Keep Unchanged
| File | Reason |
|------|--------|
| `src/components/tutorial/TutorialTryPhase.tsx` | Try phase works correctly (may reduce to 2 puzzles) |
| `src/components/tutorial/TutorialComparePhase.tsx` | Skipped in both platforms |
| `src/components/tutorial/TutorialReadyPhase.tsx` | Already matches iOS |
| `src/components/tutorial/SkipConfirmationModal.tsx` | Already matches iOS |
| `src/components/tutorial/TutorialColorPicker.tsx` | Used in try phase, unchanged |

### References to Update
| File | Current Reference | Action |
|------|-------------------|--------|
| `src/contexts/tutorialConfig.ts` | `WATCH_PHASE_MESSAGES` object (6 entries) | Replace with per-sub-phase instruction card content |
| `src/contexts/tutorialConfig.ts` | `TUTORIAL_TRY_PUZZLES` (3 puzzles including puzzle 0) | Consider removing puzzle 0 from try phase |
| `src/components/tutorial/TutorialModal.tsx` | Routes `TutorialPhase.Watch` to `TutorialWatchPhase` | No change needed (component internally rewritten) |

### Functionality to Preserve
- Tutorial completion tracking (localStorage)
- Skip flow with confirmation for first-timers
- Try phase interactive puzzles (2-3 puzzles)
- Ready phase with play/practice options
- TutorialContext provider API (openTutorial/closeTutorial/completeTutorial)
- All existing ARIA accessibility attributes

## Recommended Approach

### Strategy
**Hybrid: Rewrite Watch Phase + Adapt Existing Infrastructure**

The TutorialContext reducer pattern and component architecture are sound. The watch phase component needs a full rewrite, but the context, types, config, and all other phase components can be incrementally updated.

### Phased Implementation

1. **Phase 1: State Machine Update** (Types + Context)
   - Add `StartingBoardPhase` enum to `tutorialTypes.ts`
   - Update `WatchStepState` to have `PreIntro` and `StartingBoard` values
   - Add new reducer actions: `HANDLE_DEMO_TILE_TAP`, `HANDLE_DEMO_PICKER_SELECT`, `SET_STARTING_BOARD_PHASE`, `SET_DEMO_PICKER_VISIBLE`
   - Add demo state fields to `TutorialState`: `startingBoardPhase`, `showDemoPicker`, `demoPickerTargetColor`
   - Add instruction card content to `tutorialConfig.ts`

2. **Phase 2: Watch Phase Component Rewrite**
   - Create `TutorialDemoColorPicker.tsx` (highlighted target color, onColorTap)
   - Create `TutorialInstructionCard.tsx` (color-coded card with text)
   - Rewrite `TutorialWatchPhase.tsx`:
     - PreIntro: completed grid, "Reset Puzzle" button
     - StartingBoard: interactive grid with tile tap -> picker -> color change flow
     - 4 guided moves with hand animations and instruction cards
     - puzzleCompleted: "Try Tutorial Puzzles" button
   - Update `AnimatedHand.tsx` to support picker position targeting

3. **Phase 3: Animations + Polish**
   - Add tile spin CSS animation (3D rotateY with diagonal stagger)
   - Add lock fade transitions
   - Add instruction card fade transitions
   - Update animation timings to match iOS values
   - Add hand movement animation to/from picker

4. **Phase 4: Puzzle Alignment + Testing**
   - Optionally reduce try puzzles from 3 to 2 (remove puzzle 0 since it's now the watch demo)
   - Full flow testing: Watch -> Try -> Ready -> Complete
   - Skip flow testing
   - Loss/reset testing in try phase
   - Dark mode verification
   - Mobile/touch testing
   - Reduced motion testing

### Key Decisions Needed
- [ ] **Keep 3 try puzzles or reduce to 2?** iOS uses puzzle 0 in watch demo and has 2 try puzzles. Web currently has 3 try puzzles. If watch becomes interactive with puzzle 0, should we drop it from try phase?
- [ ] **Add first-launch auto-show?** iOS auto-shows tutorial on first launch. Web currently requires manual trigger via info button. Should we add auto-show?
- [ ] **Add "Learn to Play" entry modal?** iOS shows this on second launch if tutorial incomplete. Worth adding to web?
- [ ] **Port compare phase?** Both platforms skip it currently. Should we remove the dead code or keep it?

## Files for Code Architect

The code architect should examine these files when creating the implementation plan:

### Source (iOS) -- Key Logic
- `/Users/jacobpress/Desktop/Projects/color-lock/ColorCluster/ViewModels/TutorialViewModel.swift` -- All state machine logic, especially `handleStartingBoardTileTap`, `handleStartingBoardPickerSelection`, `handleEfficiencyPickerSelection`, `handleBluePickerSelection`, `handleYellowPickerSelection`, `applyStateChanges`
- `/Users/jacobpress/Desktop/Projects/color-lock/ColorCluster/Models/TutorialPuzzle.swift` -- `StartingBoardPhase` enum (13 states), `WatchStepState` enum, puzzle definitions
- `/Users/jacobpress/Desktop/Projects/color-lock/ColorCluster/Views/TutorialViews/TutorialWatchPhaseView.swift` -- UI layout, instruction card content per phase, hand target logic, picker routing
- `/Users/jacobpress/Desktop/Projects/color-lock/ColorCluster/Views/TutorialViews/TutorialGridView.swift` -- Tile spin animation implementation
- `/Users/jacobpress/Desktop/Projects/color-lock/ColorCluster/Views/HelperViews/AnimatedHandView.swift` -- Hand animation + picker container positioning
- `/Users/jacobpress/Desktop/Projects/color-lock/ColorCluster/Utilities/AnimationTimings.swift` -- All timing constants

### Target (Web) -- Files to Modify
- `/Users/jacobpress/Desktop/Projects/color-lock-web-app/src/contexts/tutorialTypes.ts` -- State machine types to update
- `/Users/jacobpress/Desktop/Projects/color-lock-web-app/src/contexts/tutorialConfig.ts` -- Config data to update
- `/Users/jacobpress/Desktop/Projects/color-lock-web-app/src/contexts/TutorialContext.tsx` -- Reducer logic to update
- `/Users/jacobpress/Desktop/Projects/color-lock-web-app/src/components/tutorial/TutorialWatchPhase.tsx` -- Full rewrite target
- `/Users/jacobpress/Desktop/Projects/color-lock-web-app/src/components/tutorial/AnimatedHand.tsx` -- Needs picker support
- `/Users/jacobpress/Desktop/Projects/color-lock-web-app/src/components/tutorial/TutorialTile.tsx` -- Needs spin animation
- `/Users/jacobpress/Desktop/Projects/color-lock-web-app/src/components/tutorial/TutorialGrid.tsx` -- Needs transitioning prop
- `/Users/jacobpress/Desktop/Projects/color-lock-web-app/src/scss/components/_tutorial.scss` -- New styles needed
- `/Users/jacobpress/Desktop/Projects/color-lock-web-app/src/utils/animationTimings.ts` -- New timing constants
