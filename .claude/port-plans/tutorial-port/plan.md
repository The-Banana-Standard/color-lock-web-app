# Implementation Plan: Interactive Watch Phase + Tutorial Improvements

## Overview

Replace the passive watch phase (user clicks Next to step through pre-applied moves) with an interactive guided demo matching the iOS experience (user taps highlighted tiles and selects colors from a demo picker with animated hand guidance). Also: reduce try puzzles from 3 to 2 (puzzle 0 becomes the watch demo), add auto-show on first launch, and delete the dead compare phase.

## Files

**New files:**
- `src/components/tutorial/TutorialDemoColorPicker.tsx` -- Demo-only color picker with highlighted target color and hand pointer
- `src/components/tutorial/TutorialInstructionCard.tsx` -- Reusable color-coded instruction card

**Modified files:**
- `src/contexts/tutorialTypes.ts` -- Replace `WatchStepState` enum, add `StartingBoardPhase` enum, new state fields, new action types
- `src/contexts/tutorialConfig.ts` -- New instruction card config, watch demo move definitions, remove puzzle 0 from try puzzles
- `src/contexts/TutorialContext.tsx` -- New reducer cases for demo tile tap/picker select, new context methods, update try phase to start at puzzle index 1
- `src/components/tutorial/TutorialWatchPhase.tsx` -- Full rewrite: interactive guided demo with PreIntro + StartingBoard sub-phases
- `src/components/tutorial/AnimatedHand.tsx` -- Add support for picker positioning (second target mode)
- `src/components/tutorial/TutorialTile.tsx` -- Add tile spin animation props (`isSpinning`, `spinDelay`)
- `src/components/tutorial/TutorialGrid.tsx` -- Add `isTransitioning` prop, pass spin state to tiles
- `src/components/tutorial/TutorialTryPhase.tsx` -- Update to use 2 puzzles (indices 1 and 2)
- `src/components/tutorial/TutorialModal.tsx` -- Remove compare phase import/route
- `src/components/tutorial/TutorialComparePhase.tsx` -- DELETE this file
- `src/scss/components/_tutorial.scss` -- Add instruction card styles, tile spin keyframes, demo picker styles
- `src/utils/animationTimings.ts` -- Add tile spin, stagger, lock fade, header fade timing constants
- `src/App.tsx` -- Add auto-show tutorial on first launch

## Approach

### Step 1: Animation Timings (`src/utils/animationTimings.ts`)

Add these constants to the existing file, in a new section `// WATCH PHASE INTERACTIVE DEMO`:

```ts
/** Duration of each tile's 3D Y-axis rotation during grid transition */
export const TILE_SPIN_DURATION = 600; // ms

/** Stagger delay between tiles (diagonal cascade: delay = (row + col) * STAGGER) */
export const TILE_STAGGER_DELAY = 60; // ms

/** Lock overlay fade duration (fade in/out) */
export const TILE_LOCK_FADE_DURATION = 1000; // ms

/** Delay after spin completes before re-locking largest region */
export const TILE_RELOCK_DELAY = 150; // ms

/** Duration for post-transition header fade-in */
export const HEADER_FADE_IN_DURATION = 1000; // ms

/** Delay after color applied before updating locks and showing result */
export const DEMO_RESULT_DELAY = 400; // ms

/** Delay showing result card before auto-advancing to next waitingFor* phase */
export const DEMO_RESULT_SHOW_MOVE1 = 2500; // ms (after green->red, explain locks)
export const DEMO_RESULT_SHOW_MOVE2 = 2000; // ms (after purple->blue)
export const DEMO_RESULT_SHOW_MOVE3 = 1500; // ms (after blue->red)

/** Debounce interval for rapid tap prevention */
export const DEMO_DEBOUNCE_INTERVAL = 300; // ms
```

### Step 2: Types & Config (`src/contexts/tutorialTypes.ts`)

**Replace `WatchStepState` enum** with:

```ts
export enum WatchStepState {
  PreIntro = 'preIntro',
  StartingBoard = 'startingBoard'
}
```

**Add `StartingBoardPhase` enum:**

```ts
export enum StartingBoardPhase {
  Transitioning = 'transitioning',
  WaitingForTileTap = 'waitingForTileTap',
  PickerOpen = 'pickerOpen',
  ResultShown = 'resultShown',
  WaitingForPurpleTap = 'waitingForPurpleTap',
  PurplePickerOpen = 'purplePickerOpen',
  PurpleResultShown = 'purpleResultShown',
  WaitingForBlueTap = 'waitingForBlueTap',
  BluePickerOpen = 'bluePickerOpen',
  BlueResultShown = 'blueResultShown',
  WaitingForYellowTap = 'waitingForYellowTap',
  YellowPickerOpen = 'yellowPickerOpen',
  PuzzleCompleted = 'puzzleCompleted'
}
```

**Add new fields to `TutorialState`:**

```ts
/** Sub-phase within StartingBoard interactive demo */
startingBoardPhase: StartingBoardPhase;

/** Whether the demo color picker is visible */
showDemoPicker: boolean;

/** Whether the tile spin transition is active */
isTransitioningToStartingBoard: boolean;

/** Whether the post-transition header should be visible */
showPostTransitionHeader: boolean;
```

**Add new action types to `TutorialAction`:**

```ts
| { type: 'SET_STARTING_BOARD_PHASE'; phase: StartingBoardPhase }
| { type: 'HANDLE_DEMO_TILE_TAP'; row: number; col: number }
| { type: 'HANDLE_DEMO_PICKER_SELECT'; color: TileColor; phase: StartingBoardPhase }
| { type: 'SET_DEMO_PICKER_VISIBLE'; visible: boolean }
| { type: 'SET_TRANSITIONING_TO_STARTING_BOARD'; transitioning: boolean }
| { type: 'SET_POST_TRANSITION_HEADER'; visible: boolean }
| { type: 'RESET_WATCH_PHASE' }
```

**Add new methods to `TutorialContextValue`:**

```ts
handleDemoTileTap: (row: number, col: number) => void;
handleDemoPickerSelect: (color: TileColor) => void;
resetWatchPhase: () => void;
```

**Remove these actions** (no longer needed for the old step-through):
- `ADVANCE_WATCH_STEP` (the old sequential stepper)

Keep `SET_WATCH_STEP` since it's used to transition between PreIntro and StartingBoard.

### Step 3: Config Updates (`src/contexts/tutorialConfig.ts`)

**Remove** `WATCH_PHASE_MESSAGES` (the old 6-step message map), `getWatchStepMessageKey`, `getMoveIndexForWatchStep`, `isHighlightStep`, `isTapStep`, `isLockStep`. These were all for the old passive watch phase.

**Add watch demo move definitions.** These are the 4 hardcoded moves for the interactive demo, specific to the web's puzzle 0 grid:

```ts
export interface WatchDemoMove {
  /** Tile the user taps */
  tapRow: number;
  tapCol: number;
  /** Color to select in picker */
  targetColor: TileColor;
  /** Which StartingBoardPhase the tap triggers from */
  waitingPhase: StartingBoardPhase;
  /** Which StartingBoardPhase the picker opens to */
  pickerPhase: StartingBoardPhase;
  /** Which StartingBoardPhase shows the result */
  resultPhase: StartingBoardPhase;
}

export const WATCH_DEMO_MOVES: WatchDemoMove[] = [
  {
    tapRow: 2, tapCol: 0,
    targetColor: TileColor.Blue,
    waitingPhase: StartingBoardPhase.WaitingForTileTap,
    pickerPhase: StartingBoardPhase.PickerOpen,
    resultPhase: StartingBoardPhase.ResultShown
  },
  {
    tapRow: 1, tapCol: 2,
    targetColor: TileColor.Yellow,
    waitingPhase: StartingBoardPhase.WaitingForPurpleTap,
    pickerPhase: StartingBoardPhase.PurplePickerOpen,
    resultPhase: StartingBoardPhase.PurpleResultShown
  },
  {
    tapRow: 1, tapCol: 0,
    targetColor: TileColor.Red,
    waitingPhase: StartingBoardPhase.WaitingForBlueTap,
    pickerPhase: StartingBoardPhase.BluePickerOpen,
    resultPhase: StartingBoardPhase.BlueResultShown
  },
  {
    tapRow: 0, tapCol: 0,
    targetColor: TileColor.Red,
    waitingPhase: StartingBoardPhase.WaitingForYellowTap,
    pickerPhase: StartingBoardPhase.YellowPickerOpen,
    resultPhase: StartingBoardPhase.PuzzleCompleted
  }
];
```

Note: the iOS watch demo naming is confusing because the phase names reference color names from the *iOS* grid (e.g., "WaitingForPurpleTap" = move 2). The web's puzzle 0 grid has different colors at those positions:
- Move 1: Tap purple tile at [2,0] -> change to blue (same as iOS name)
- Move 2: Tap green tile at [1,2] -> change to yellow (iOS calls this "WaitingForPurpleTap" but it's actually a green tile in web grid -- keep the enum name for iOS parity, the names are just identifiers)
- Move 3: Tap blue tile at [1,0] -> change to red
- Move 4: Tap yellow tile at [0,0] -> change to red

**Add instruction card configuration:**

```ts
export interface InstructionCardConfig {
  text: string;
  color: string; // CSS color for card background/border
}

export const INSTRUCTION_CARDS: Partial<Record<StartingBoardPhase, InstructionCardConfig>> = {
  [StartingBoardPhase.WaitingForTileTap]: {
    text: 'Tap the highlighted tile to change its color.',
    color: '#e07766' // coral
  },
  [StartingBoardPhase.PickerOpen]: {
    text: 'Turning this tile blue creates a group of 3 blue tiles.',
    color: '#d4a843' // gold
  },
  [StartingBoardPhase.ResultShown]: {
    text: 'As the new largest group, the blues lock. You can\'t change locked tiles until a bigger group forms.',
    color: '#5ba8d4' // sky blue
  },
  [StartingBoardPhase.WaitingForPurpleTap]: {
    text: 'As the new largest group, the blues lock. You can\'t change locked tiles until a bigger group forms.',
    color: '#5ba8d4' // sky blue (same card persists)
  },
  [StartingBoardPhase.PurplePickerOpen]: {
    text: 'Creating groups helps you complete puzzles in fewer moves.',
    color: '#c27ba0' // mauve pink
  },
  [StartingBoardPhase.PurpleResultShown]: {
    text: 'Finish this puzzle by changing the two remaining groups to red.',
    color: '#7fa87a' // sage green
  },
  [StartingBoardPhase.WaitingForBlueTap]: {
    text: 'Finish this puzzle by changing the two remaining groups to red.',
    color: '#7fa87a' // sage green
  },
  [StartingBoardPhase.BluePickerOpen]: {
    text: 'Finish this puzzle by changing the two remaining groups to red.',
    color: '#7fa87a'
  },
  [StartingBoardPhase.BlueResultShown]: {
    text: 'Finish this puzzle by changing the two remaining groups to red.',
    color: '#7fa87a'
  },
  [StartingBoardPhase.WaitingForYellowTap]: {
    text: 'Finish this puzzle by changing the two remaining groups to red.',
    color: '#7fa87a'
  },
  [StartingBoardPhase.YellowPickerOpen]: {
    text: 'Finish this puzzle by changing the two remaining groups to red.',
    color: '#7fa87a'
  },
  [StartingBoardPhase.PuzzleCompleted]: {
    text: 'Solved in just 4 moves!',
    color: '#7fa87a' // sage green
  }
};

export const PREINTRO_INSTRUCTION: InstructionCardConfig = {
  text: 'Turn every tile into the target color.',
  color: '#7fa87a' // sage green
};

export const PREINTRO_HINT = 'Click "Reset Puzzle" to see how this puzzle was solved.';
```

**Update try puzzle config** -- remove puzzle 0 from `TUTORIAL_TRY_PUZZLES`:

```ts
export const TUTORIAL_TRY_PUZZLES: TutorialTryPuzzleConfig[] = [
  {
    id: 'tutorial-puzzle-2',
    targetColor: TileColor.Blue,
    goalMoves: 5,
    startingGrid: [
      [TileColor.Blue, TileColor.Blue, TileColor.Green],
      [TileColor.Blue, TileColor.Purple, TileColor.Orange],
      [TileColor.Blue, TileColor.Orange, TileColor.Green]
    ],
    indicatorColor: '#4ca9ef'
  },
  {
    id: 'tutorial-puzzle-3',
    targetColor: TileColor.Green,
    goalMoves: 6,
    startingGrid: [
      [TileColor.Blue, TileColor.Green, TileColor.Orange],
      [TileColor.Blue, TileColor.Orange, TileColor.Red],
      [TileColor.Green, TileColor.Blue, TileColor.Orange]
    ],
    indicatorColor: '#a6bf59'
  }
];
```

**Add helper** to create a completed grid (all tiles = target color):

```ts
export function createCompletedGrid(): TileColor[][] {
  return Array.from({ length: TUTORIAL_GRID_SIZE }, () =>
    Array.from({ length: TUTORIAL_GRID_SIZE }, () => TUTORIAL_TARGET_COLOR)
  );
}

export function createAllLockedCells(): Set<string> {
  const cells = new Set<string>();
  for (let r = 0; r < TUTORIAL_GRID_SIZE; r++) {
    for (let c = 0; c < TUTORIAL_GRID_SIZE; c++) {
      cells.add(`${r},${c}`);
    }
  }
  return cells;
}
```

**Keep** `getCompareMessage`, `COMPARE_PHASE_MESSAGES`, and related items can be removed since we're deleting compare phase. But `TUTORIAL_OPTIMAL_MOVES`, `TUTORIAL_TARGET_COLOR`, `TUTORIAL_OPTIMAL_SOLUTION` should stay (used for other purposes). Actually remove `getCompareMessage` and `COMPARE_PHASE_MESSAGES` as part of compare phase deletion.

### Step 4: State Management (`src/contexts/TutorialContext.tsx`)

**Update initial state** to include new fields:

```ts
startingBoardPhase: StartingBoardPhase.Transitioning,
showDemoPicker: false,
isTransitioningToStartingBoard: false,
showPostTransitionHeader: false,
```

And set `watchStep: WatchStepState.PreIntro` instead of `WatchStepState.Intro`.

**Update `getInitialState()`** to initialize the demo grid as the **completed** grid (all red, all locked) for the PreIntro state:

```ts
const completedGrid = createCompletedGrid();
const allLocked = createAllLockedCells();
// ...
demoGrid: completedGrid,
demoLockedCells: allLocked,
```

**Add new reducer cases:**

`RESET_WATCH_PHASE`: Reset watch state to PreIntro with completed grid.

`SET_STARTING_BOARD_PHASE`: Update `startingBoardPhase` field.

`HANDLE_DEMO_TILE_TAP`: Validate the tap is on the correct tile for the current phase, then transition to the corresponding picker phase and set `showDemoPicker: true`. The validation logic:
- `WaitingForTileTap`: only accept tap at [2,0] (purple tile)
- `WaitingForPurpleTap`: only accept tap at [1,2] (green tile)
- `WaitingForBlueTap` or `PurpleResultShown`: only accept tap on a blue tile (`demoGrid[row][col] === TileColor.Blue`)
- `WaitingForYellowTap` or `BlueResultShown`: only accept tap on a yellow tile

On valid tap: set `startingBoardPhase` to the corresponding picker phase, set `showDemoPicker: true`.

`HANDLE_DEMO_PICKER_SELECT`: Validate the color matches the expected target for the current phase. Apply flood fill to `demoGrid`, close picker, update to result phase. The reducer should:
1. Get the region via `floodFill(demoGrid, tapRow, tapCol, sourceColor)` -- but the reducer needs to know *which* tile was tapped. Since the tap tile is deterministic per phase (from `WATCH_DEMO_MOVES`), look it up from the current `startingBoardPhase`.
2. Apply the color change to create a new grid.
3. Set `showDemoPicker: false`.
4. Return the updated `demoGrid`. Do NOT update `demoLockedCells` here -- that happens after a delay via a dispatched `SET_STARTING_BOARD_PHASE` + `UPDATE_DEMO_GRID` from the component's useEffect.

Actually, to keep the reducer pure and avoid complex async logic in it, the reducer's `HANDLE_DEMO_PICKER_SELECT` action should include enough data to apply the change synchronously:

```ts
| { type: 'HANDLE_DEMO_PICKER_SELECT'; color: TileColor }
```

The reducer will:
1. Determine the current move from the `startingBoardPhase` (map picker phases to move indices: PickerOpen->0, PurplePickerOpen->1, BluePickerOpen->2, YellowPickerOpen->3).
2. Look up the corresponding `WATCH_DEMO_MOVES[moveIndex]` to get `tapRow`, `tapCol`.
3. Validate `color === move.targetColor`, reject if not.
4. Run flood fill on `state.demoGrid` using the source color at `[tapRow, tapCol]`.
5. Build new grid with the color change applied.
6. Set `showDemoPicker: false`, set `startingBoardPhase` to a transient "applying" state -- actually, just leave the phase as the picker phase. The component's useEffect will handle the async sequence (delay -> update locks -> delay -> advance to next waiting phase).

Better approach: The reducer handles the immediate state change (grid update, picker close). The component handles the async sequence via `useEffect` watching `startingBoardPhase` changes.

So the reducer for `HANDLE_DEMO_PICKER_SELECT`:
- Applies flood fill, updates `demoGrid`
- Sets `showDemoPicker: false`
- Transitions to the corresponding result phase (PickerOpen -> ResultShown, etc.)
- For PuzzleCompleted (move 4): also set `demoLockedCells` to all cells

The async lock update and phase advancement happens in TutorialWatchPhase via useEffect.

`SET_DEMO_PICKER_VISIBLE`, `SET_TRANSITIONING_TO_STARTING_BOARD`, `SET_POST_TRANSITION_HEADER`: Simple boolean setters.

**Update `START_WATCH_PHASE`** to reset to PreIntro state with completed grid.

**Update `START_TRY_PHASE`** to start at puzzle index 0 (which now maps to the old puzzle 1 / blue target since we removed puzzle 0 from the array).

**Update `RESET_FOR_REPLAY`** similarly.

**Update `OPEN_TUTORIAL`** to use the new initial state.

**Remove** the `ADVANCE_WATCH_STEP` case (replaced by phase-specific handlers).

**Add context methods:**

```ts
const handleDemoTileTap = useCallback((row: number, col: number) => {
  dispatch({ type: 'HANDLE_DEMO_TILE_TAP', row, col });
}, []);

const handleDemoPickerSelect = useCallback((color: TileColor) => {
  dispatch({ type: 'HANDLE_DEMO_PICKER_SELECT', color });
}, []);

const resetWatchPhase = useCallback(() => {
  dispatch({ type: 'RESET_WATCH_PHASE' });
}, []);
```

Remove `advanceWatchStep` from context value (no longer needed).

**Remove** re-exports related to compare phase.

### Step 5: TutorialInstructionCard Component (NEW)

Create `src/components/tutorial/TutorialInstructionCard.tsx`:

```tsx
interface TutorialInstructionCardProps {
  text: string;
  color: string; // e.g., '#e07766'
  visible: boolean;
}
```

Renders a rounded card with:
- Background: `color` at 15% opacity
- Border: `color` at 60% opacity, 2px solid
- Text: italic, medium weight, system font, centered
- Opacity animated via CSS transition (0 or 1 based on `visible`)
- Max width 300px, horizontal padding 16px, vertical 12px
- CSS class: `tutorial-instruction-card`

The card is always in the DOM (for layout stability) and toggled via opacity + `pointer-events: none` when not visible. Use `position: absolute` within a ZStack-like container so multiple cards can overlap, only one visible at a time.

### Step 6: TutorialDemoColorPicker Component (NEW)

Create `src/components/tutorial/TutorialDemoColorPicker.tsx`:

```tsx
interface TutorialDemoColorPickerProps {
  highlightedColor: TileColor;
  onColorSelect: (color: TileColor) => void;
  getColorCSS: (color: TileColor) => string;
}
```

Renders:
- A floating card with all 6 color bubbles in a row (matching `allColors` order)
- Each bubble is 44px diameter with the tile color background
- The highlighted color gets a double ring: white 3px inner ring, yellow 2px outer ring
- "Color Picker" label above, "(Demo)" label below in secondary color
- Card has rounded corners (16px), background matching the modal background, shadow
- Bubbles are clickable -- `onColorSelect(color)` fires on tap
- CSS class: `tutorial-demo-picker`

The picker slides/fades in below the grid. Use CSS transition for entry.

### Step 7: AnimatedHand Updates (`src/components/tutorial/AnimatedHand.tsx`)

Add a `target` prop mode to support pointing at picker bubbles:

```tsx
interface AnimatedHandProps {
  visible: boolean;
  isTapping: boolean;
  x: number;
  y: number;
  size?: number;
}
```

The interface stays the same. The parent component (TutorialWatchPhase) will calculate the position based on whether the hand should point at a grid tile or a picker bubble, and pass the computed (x, y) to AnimatedHand. No changes needed to AnimatedHand itself beyond ensuring it renders when visible and transitions smoothly when position changes.

Actually, the existing AnimatedHand returns `null` when `!visible`. This causes a mount/unmount cycle that prevents smooth CSS transitions. Change it to always render but use `opacity: 0` and `pointer-events: none` when not visible:

```tsx
const AnimatedHand: React.FC<AnimatedHandProps> = ({
  visible,
  isTapping,
  x,
  y,
  size = 42
}) => {
  const classes = ['animated-hand'];
  if (isTapping) classes.push('animated-hand--tapping');
  if (!visible) classes.push('animated-hand--hidden');

  return (
    <div
      className={classes.join(' ')}
      style={{
        left: x,
        top: y,
        fontSize: size
      }}
      aria-hidden="true"
    >
      <span className="animated-hand__emoji">{String.fromCodePoint(0x1f446)}</span>
    </div>
  );
};
```

Add `.animated-hand--hidden` to SCSS:
```scss
&--hidden {
  opacity: 0;
  pointer-events: none;
}
```

### Step 8: TutorialTile Spin Animation (`src/components/tutorial/TutorialTile.tsx`)

Add two new optional props:

```tsx
/** Whether this tile should play the spin animation */
isSpinning?: boolean;
/** Stagger delay for the spin (ms) */
spinDelay?: number;
```

When `isSpinning` is true, add class `tutorial-tile--spinning` and set a CSS custom property `--spin-delay` on the tile's style:

```tsx
if (isSpinning) {
  classes.push('tutorial-tile--spinning');
  style['--spin-delay'] = `${spinDelay ?? 0}ms`;
}
```

The lock overlay should use CSS transition on opacity (already exists via `tutorial-tile--locked` class) with duration matching `TILE_LOCK_FADE_DURATION`. Currently the lock icon is conditionally rendered. Keep that, but ensure the CSS transition on the lock overlay opacity is smooth. The existing implementation already shows/hides lock via `isLocked` prop, which is sufficient.

### Step 9: TutorialGrid Transitioning Prop (`src/components/tutorial/TutorialGrid.tsx`)

Add `isTransitioning?: boolean` prop. When true, pass `isSpinning={true}` and `spinDelay={(rowIndex + colIndex) * TILE_STAGGER_DELAY}` to each TutorialTile:

```tsx
interface TutorialGridProps {
  // ... existing props
  isTransitioning?: boolean;
}
```

Import `TILE_STAGGER_DELAY` from animationTimings.

### Step 10: TutorialWatchPhase Rewrite (`src/components/tutorial/TutorialWatchPhase.tsx`)

This is the largest change. Full rewrite of the component.

**Props:** Same interface (`getColorCSS`).

**State management:** Uses `useTutorialContext()` to get:
- `state.watchStep`, `state.startingBoardPhase`, `state.demoGrid`, `state.demoLockedCells`, `state.showDemoPicker`, `state.isTransitioningToStartingBoard`, `state.showPostTransitionHeader`
- `handleDemoTileTap`, `handleDemoPickerSelect`, `resetWatchPhase`, `startTryPhase`, `closeTutorial`, `showSkipConfirmation`
- New dispatch wrappers for `SET_WATCH_STEP`, `SET_STARTING_BOARD_PHASE`, `SET_TRANSITIONING_TO_STARTING_BOARD`, `SET_POST_TRANSITION_HEADER`, `UPDATE_DEMO_GRID`

**The component needs to dispatch actions directly for the async sequences.** The context should expose a `dispatch` function (or more setter methods). Simplest approach: add thin wrapper methods to the context for each action the watch phase needs. Alternatively, expose `dispatch` directly in the context value for advanced usage. I recommend adding these methods to the context:

```ts
setStartingBoardPhase: (phase: StartingBoardPhase) => void;
setTransitioningToStartingBoard: (transitioning: boolean) => void;
setPostTransitionHeader: (visible: boolean) => void;
updateDemoGrid: (grid: TileColor[][], lockedCells: Set<string>) => void;
setWatchStep: (step: WatchStepState) => void;
```

These are simple dispatch wrappers. Add them to the context value.

**Rendering structure:**

```
<div className="tutorial-watch-phase">
  {/* Header: crossfades between "How To Win?", "Learn Color Lock", "Puzzle Solved!" */}
  <div className="tutorial-watch-header">
    <h2 style={{ opacity: isPreIntro ? 1 : 0 }}>How To Win?</h2>
    <h2 style={{ opacity: isStartingBoard && !isPuzzleCompleted ? 1 : 0 }}>Learn Color Lock</h2>
    <h2 style={{ opacity: isPuzzleCompleted ? 1 : 0 }}>Puzzle Solved!</h2>
  </div>

  {/* Instruction card zone (stacked, opacity-toggled) */}
  <div className="tutorial-watch-instruction-zone">
    {/* PreIntro card */}
    <TutorialInstructionCard ... visible={isPreIntro && !isTransitioning} />
    {/* One card per startingBoard phase */}
    {Object.entries(INSTRUCTION_CARDS).map(([phase, config]) => (
      <TutorialInstructionCard
        key={phase}
        text={config.text}
        color={config.color}
        visible={startingBoardPhase === phase}
      />
    ))}
  </div>

  {/* Target color indicator (hidden during puzzle completed) */}
  <div className="tutorial-target-indicator" style={{ opacity: isPuzzleCompleted ? 0 : 1 }}>
    Target: [Red dot] (Red)
  </div>

  {/* Grid + hand + picker zone */}
  <div className="tutorial-watch-grid-zone">
    <div className="tutorial-watch-grid-shell">
      <TutorialGrid
        grid={demoGrid}
        lockedCells={demoLockedCells}
        highlightedCells={highlightedCells}
        highlightColor={highlightColor}
        getColorCSS={getColorCSS}
        interactive={isInteractivePhase}
        onTileClick={handleDemoTileTap}
        isTransitioning={isTransitioningToStartingBoard}
      />
      <AnimatedHand
        visible={showGridHand}
        isTapping={false}
        x={gridHandX}
        y={gridHandY}
      />
    </div>

    {/* Demo picker (below grid) */}
    {showDemoPicker && (
      <TutorialDemoColorPicker
        highlightedColor={pickerHighlightColor}
        onColorSelect={handleDemoPickerSelect}
        getColorCSS={getColorCSS}
      />
    )}

    {/* Hand on picker */}
    <AnimatedHand
      visible={showPickerHand}
      isTapping={false}
      x={pickerHandX}
      y={pickerHandY}
    />
  </div>

  {/* Hint text (preIntro only) */}
  <div style={{ opacity: isPreIntro && !isTransitioning ? 1 : 0 }}>
    <p className="tutorial-watch-hint">{PREINTRO_HINT}</p>
  </div>

  {/* Action button: "Reset Puzzle" (preIntro) or "Try Tutorial Puzzles" (completed) */}
  <button
    style={{ opacity: buttonOpacity }}
    onClick={handlePrimaryAction}
    disabled={isInteractivePhase || isTransitioning}
  >
    {isPuzzleCompleted ? 'Try Tutorial Puzzles' : 'Reset Puzzle'}
  </button>

  {/* Skip button */}
  <button onClick={handleSkip}>Skip Tutorial</button>
</div>
```

**Computed values:**

`highlightedCells`: Computed via `useMemo` based on `startingBoardPhase`. For each waiting phase, flood-fill from the target tile in `demoGrid` to get the connected region. The highlight color is the target color of the upcoming move (the color the region will become).

| Phase | Highlighted Region | Highlight Color |
|-------|-------------------|-----------------|
| WaitingForTileTap | floodFill from [2,0] in demoGrid | Blue |
| WaitingForPurpleTap | floodFill from [1,2] in demoGrid | Yellow |
| PurpleResultShown, WaitingForBlueTap | floodFill from [1,0] in demoGrid | Red |
| BlueResultShown, WaitingForYellowTap | floodFill from [0,0] in demoGrid | Red |

`gridHandPosition`: Calculated the same way as the old watch phase but with different target cells per phase:
- WaitingForTileTap: [2,0]
- WaitingForPurpleTap: [1,2]
- WaitingForBlueTap: [1,0]
- WaitingForYellowTap: [0,0]

`pickerHandPosition`: When a picker is open, calculate the position of the highlighted color bubble. The picker renders below the grid. The hand should point at the correct bubble. Calculate X based on the color's index in `allColors` array and the bubble size/spacing.

`isInteractivePhase`: True when `startingBoardPhase` is one of: WaitingForTileTap, WaitingForPurpleTap, PurpleResultShown, WaitingForBlueTap, BlueResultShown, WaitingForYellowTap.

**Async sequences via useEffect:**

1. **PreIntro -> StartingBoard transition** (`handlePrimaryAction` when in PreIntro):
   - Dispatch `SET_WATCH_STEP(StartingBoard)` -- this triggers the useEffect below.

2. **useEffect watching `watchStep === StartingBoard` entry:**
   ```
   1. Dispatch UPDATE_DEMO_GRID with starting grid and empty locked cells
   2. Set startingBoardPhase = Transitioning
   3. After brief delay (50ms), set isTransitioningToStartingBoard = true (triggers tile spin CSS)
   4. Wait for spin to complete: maxDiagonal * TILE_STAGGER_DELAY + TILE_SPIN_DURATION + TILE_RELOCK_DELAY
      (maxDiagonal for 3x3 = 4, so 4*60 + 600 + 150 = 990ms)
   5. Dispatch UPDATE_DEMO_GRID with new lockedCells = findLargestRegion(startingGrid)
   6. Wait TILE_LOCK_FADE_DURATION (1000ms) for lock fade-in
   7. Set showPostTransitionHeader = true
   8. Wait 500ms more
   9. Set isTransitioningToStartingBoard = false
   10. Set startingBoardPhase = WaitingForTileTap
   ```

3. **useEffect watching `startingBoardPhase` for result phases:**
   When phase transitions to ResultShown, PurpleResultShown, BlueResultShown:
   ```
   1. After DEMO_RESULT_DELAY (400ms): update demoLockedCells = findLargestRegion(demoGrid)
   2. After additional delay (DEMO_RESULT_SHOW_MOVE1/2/3): advance to next waiting phase
   ```

   When phase transitions to PuzzleCompleted:
   ```
   1. After DEMO_RESULT_DELAY: set demoLockedCells = all cells
   ```

All timeouts must be cleaned up in useEffect return functions. Use a ref to track active timeouts for cleanup on unmount.

**Important**: Every `useEffect` that runs async sequences should use an `aborted` flag pattern:
```ts
useEffect(() => {
  let aborted = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const delay = (ms: number) => new Promise<void>(resolve => {
    timers.push(setTimeout(() => { if (!aborted) resolve(); }, ms));
  });

  // ... async sequence using await delay(...)

  return () => {
    aborted = true;
    timers.forEach(clearTimeout);
  };
}, [dependencies]);
```

### Step 11: Try Phase Update (`src/components/tutorial/TutorialTryPhase.tsx`)

The try puzzle array is now 2 items (indices 0 and 1 in the new `TUTORIAL_TRY_PUZZLES`). The component already reads from `TUTORIAL_TRY_PUZZLES` and uses `currentTryPuzzleIndex` as an index into that array. Since we reduced the array to 2 items, the component should work without code changes -- but verify:

- `TUTORIAL_TRY_PUZZLE_COUNT` will be 2
- The progress dots iterate over `TUTORIAL_TRY_PUZZLES` which now has 2 items
- `isLastPuzzle` check: `currentTryPuzzleIndex >= TUTORIAL_TRY_PUZZLE_COUNT - 1` = `>= 1`, so puzzle 1 is the last

The `START_TRY_PHASE` reducer case sets `currentTryPuzzleIndex: 0` and calls `createFreshTryGrid(0)` which now returns the blue-target puzzle. This is correct.

The `RESET_FOR_REPLAY` case also starts at index 0. Correct.

No code changes needed in TutorialTryPhase.tsx beyond verifying it still works after the config change.

### Step 12: Auto-Show on First Launch (`src/App.tsx`)

In the `GameContainer` component, add a `useEffect` that checks localStorage and opens the tutorial on first launch:

```tsx
// Auto-show tutorial for first-time users
useEffect(() => {
  const hasCompleted = localStorage.getItem('colorlock_tutorial_completed') === 'true';
  const hasLaunched = localStorage.getItem('colorlock_has_launched') === 'true';

  if (!hasLaunched) {
    localStorage.setItem('colorlock_has_launched', 'true');
    if (!hasCompleted) {
      // Small delay to let the game UI render first
      const timer = setTimeout(() => {
        openTutorial();
      }, 500);
      return () => clearTimeout(timer);
    }
  }
}, [openTutorial]);
```

This runs once when GameContainer mounts. The `colorlock_has_launched` key prevents re-triggering on subsequent visits. The `colorlock_tutorial_completed` check prevents showing it to users who somehow completed it already.

### Step 13: Compare Phase Removal

**Delete** `src/components/tutorial/TutorialComparePhase.tsx`.

**In `src/components/tutorial/TutorialModal.tsx`:**
- Remove the import of `TutorialComparePhase`
- Remove the `case TutorialPhase.Compare:` from `renderPhase()`
- The compare phase case in the reducer can stay as a no-op or be removed. Since the iOS code skips it (Try -> Ready directly), and we're already doing that via `startReadyPhase()` in TutorialTryPhase, just remove the route.

**In `src/contexts/tutorialTypes.ts`:**
- Keep `Compare` in the `TutorialPhase` enum for now (removing it would require updating all switch statements). It's dead code but harmless. Or remove it if you prefer -- just update the reducer to not have a `START_COMPARE_PHASE` case.

Actually, remove it cleanly:
- Remove `Compare = 'compare'` from `TutorialPhase` enum
- Remove `START_COMPARE_PHASE` from `TutorialAction` union
- Remove the `START_COMPARE_PHASE` reducer case
- Remove `startComparePhase` from `TutorialContextValue` and the provider
- Remove `COMPARE_PHASE_MESSAGES` and `getCompareMessage` from tutorialConfig.ts

**In `src/contexts/TutorialContext.tsx`:**
- Remove `startComparePhase` callback and its dispatch
- Remove it from the context value object

### Step 14: Styling (`src/scss/components/_tutorial.scss`)

Add new sections:

**Tile Spin Animation:**
```scss
.tutorial-tile--spinning {
  animation: tileSpin 600ms ease-in-out var(--spin-delay, 0ms) forwards;
}

@keyframes tileSpin {
  0% { transform: perspective(400px) rotateY(0deg); }
  100% { transform: perspective(400px) rotateY(360deg); }
}
```

Note: `animation-delay` uses the CSS custom property `--spin-delay` set inline.

**Instruction Card:**
```scss
.tutorial-instruction-card {
  font-size: 15px;
  font-weight: 500;
  font-style: italic;
  color: $color-text-primary;
  text-align: center;
  line-height: 1.45;
  padding: 12px 16px;
  max-width: 300px;
  margin: 0 auto;
  border-radius: 12px;
  border: 2px solid var(--card-border-color);
  background-color: var(--card-bg-color);
  transition: opacity 0.3s ease-in-out;
  position: absolute;
  left: 0;
  right: 0;

  @include dark-mode {
    color: $color-light-taupe;
  }

  &--hidden {
    opacity: 0;
    pointer-events: none;
  }
}

.tutorial-watch-instruction-zone {
  position: relative;
  min-height: 72px; // Reserve space for tallest card
  margin-bottom: 8px;
}
```

The card's `--card-bg-color` and `--card-border-color` are set inline using the `color` prop at 15% and 60% opacity respectively. Use inline styles for this since the colors are dynamic.

**Demo Color Picker:**
```scss
.tutorial-demo-picker {
  padding: 14px 18px;
  background-color: #d8d3bb;
  border-radius: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  text-align: center;
  margin-top: 16px;
  animation: demoPickerFadeIn 0.3s ease-out;

  @include dark-mode {
    background-color: $bg-dark-elevated;
  }
}

@keyframes demoPickerFadeIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

.tutorial-demo-picker__label {
  font-size: 12px;
  color: $color-description-text;
  margin-bottom: 10px;

  @include dark-mode {
    color: rgba($color-light-taupe, 0.7);
  }
}

.tutorial-demo-picker__bubbles {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.tutorial-demo-picker__bubble {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  position: relative;
  transition: transform 0.15s ease;

  &:hover {
    transform: scale(1.08);
  }

  &--highlighted {
    box-shadow: 0 0 0 3px white, 0 0 0 5px #f7ce45;
  }
}

.tutorial-demo-picker__sublabel {
  font-size: 10px;
  color: rgba($color-description-text, 0.6);
  margin-top: 8px;

  @include dark-mode {
    color: rgba($color-light-taupe, 0.5);
  }
}
```

**Watch Phase Layout:**
```scss
.tutorial-watch-phase {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 590px;
}

.tutorial-watch-header {
  position: relative;
  height: 32px;
  margin-bottom: 4px;

  h2 {
    position: absolute;
    left: 0;
    right: 0;
    transition: opacity 0.4s ease-in-out;
    font-family: $font-family-display;
    font-size: $font-size-modal-title;
    font-weight: $font-weight-bolder;
    color: $color-text-primary;
    text-align: center;
    margin: 0;

    @include dark-mode {
      color: $color-light-taupe;
    }
  }
}

.tutorial-watch-grid-zone {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.tutorial-watch-hint {
  font-size: 14px;
  font-style: italic;
  color: $color-description-text;
  text-align: center;
  padding: 10px 16px;
  margin: 8px auto;
  max-width: 300px;
  border-radius: 12px;
  background-color: rgba($bg-warm-taupe, 0.5);
  transition: opacity 0.3s ease-in-out;

  @include dark-mode {
    background-color: rgba($bg-dark-elevated, 0.6);
    color: rgba($color-light-taupe, 0.75);
  }
}
```

**Lock overlay fade transition** (already partially exists, ensure it works):
```scss
.tutorial-tile {
  // Add to existing rules:
  .tutorial-tile__lock-overlay {
    position: absolute;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 1s ease-out;
  }
}
```

Actually, the current TutorialTile renders the lock icon directly without a separate overlay div. The lock appears/disappears based on `isLocked` prop. The CSS transition on `tutorial-tile--locked` class handles the visual. This is sufficient; no structural changes needed for lock fading.

**Reduced motion:**
```scss
@media (prefers-reduced-motion: reduce) {
  .tutorial-tile--spinning {
    animation: none;
  }

  .tutorial-instruction-card,
  .animated-hand {
    transition: none;
  }

  .tutorial-demo-picker {
    animation: none;
  }
}
```

### Step 15: Remove Old Watch Phase Artifacts

Clean up references to the old watch phase approach:
- Remove `HAND_OFFSETS_BY_MOVE` from old TutorialWatchPhase (the whole file is rewritten)
- Remove `getAppliedMoveCount`, `getProgressCount` helper functions
- Remove `WATCH_PHASE_MESSAGES` from tutorialConfig.ts
- Remove `getWatchStepMessageKey`, `getMoveIndexForWatchStep`, `isHighlightStep`, `isTapStep`, `isLockStep` from tutorialConfig.ts
- Remove `advanceWatchStep` from context value and provider
- Clean up any stale re-exports in TutorialContext.tsx

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Phase naming | Keep iOS StartingBoardPhase names (WaitingForPurpleTap etc.) even though web grid has different colors at those positions | Names are just identifiers; renaming adds confusion for anyone cross-referencing iOS code. The move sequence is well-documented in WATCH_DEMO_MOVES. |
| Async handling | useEffect with abort flag + setTimeout arrays, not requestAnimationFrame | Matches existing codebase patterns (TutorialTryPhase uses setTimeout for solve advance). Simple and reliable for sequenced delays. |
| Reducer purity | Reducer handles synchronous state changes; components handle async sequences | Standard React reducer pattern. Async logic in reducers is an anti-pattern. |
| Lock update timing | Lock cells update dispatched from component after delay, not in reducer | Keeps reducer pure; lock update needs to happen after a visible delay for the animation. |
| Demo picker as separate component | New TutorialDemoColorPicker, not reusing TutorialColorPicker | Try phase picker is a full-screen bottom sheet with backdrop; demo picker is an inline card below the grid. Different layout, different interaction model. |
| Grid hand vs picker hand | Two separate AnimatedHand instances, not one that animates between positions | Moving a single hand from grid to picker adds animation complexity. Two instances with opacity toggling is simpler and matches the iOS approach (separate containers). |
| Auto-show implementation | localStorage flag in GameContainer useEffect | Simple, no backend changes. GameContainer is where TutorialProvider is available. |

## Gotchas

- **The web puzzle 0 grid is different from the iOS puzzle 0 grid.** The web grid is `[Red,Red,Yellow / Blue,Yellow,Green / Purple,Blue,Yellow]` while iOS is `[Yellow,Yellow,Red / Blue,Red,Green / Purple,Blue,Red]`. The demo moves must match the web grid. Use `WATCH_DEMO_MOVES` config and trace through each move carefully to verify the grid states are correct.

- **StartingBoardPhase names don't match the web grid's colors.** "WaitingForPurpleTap" in the web context means "waiting for the user to tap the green tile at [1,2]" because that's move 2 in the web's puzzle. This is confusing but intentional for iOS parity. Document it in code comments.

- **The instruction card for ResultShown and WaitingForPurpleTap should be the same card** (lock explanation). The iOS implementation shows the same text across both phases. Map both phases to the same instruction card config.

- **The `floodFill` function in gameLogic.ts returns `[number[], number[]]`** (parallel arrays of row and column indices), not a Set. When computing highlighted cells for the watch phase, convert to `Set<string>` using the same pattern as TutorialWatchPhase currently does.

- **setTimeout cleanup is critical.** The transition sequence has 5+ chained timeouts. If the user skips the tutorial or navigates away during the transition, all pending timeouts must be cleared. Use the abort flag pattern described in Step 10.

- **`TUTORIAL_TRY_PUZZLES` index shift.** After removing puzzle 0, the try phase's `currentTryPuzzleIndex` still starts at 0, but now index 0 maps to the blue-target puzzle (old index 1). The `getTryPuzzleConfig(0)` will return the blue puzzle. This is correct and no try phase code changes are needed.

- **The demo grid for PreIntro must be all-red with all cells locked.** This is different from the old initial state which used the starting grid with its largest region locked. Update `getInitialState()` to use `createCompletedGrid()` and `createAllLockedCells()`.

- **CSS `animation-delay` via custom property.** The tile spin uses `var(--spin-delay)` in the animation shorthand. Some browsers may have issues with custom properties in animation shorthand. If so, use `animation-delay: var(--spin-delay)` as a separate property.

- **The tile spin animation should only fire once per transition.** After spinning, tiles should not spin again if props re-render. Use `animation-fill-mode: forwards` and only add the spinning class during the transition. Remove the class after the transition completes.

## Risks

- **Animation timing mismatch**: The sequenced delays (spin -> lock -> header -> hand appear) have a total of ~3.5s. If any timing is off, the phases will overlap or gap. Mitigation: Make all timings configurable via animationTimings.ts constants, test the full sequence, and verify with the iOS app side-by-side.

- **Stale closures in useEffect async sequences**: Multiple chained setTimeout calls can capture stale state. Mitigation: Use refs for values that change during the sequence, or dispatch actions that the reducer handles with current state.

- **Mobile touch interaction**: The demo tiles need to respond to touch taps (not just clicks). The existing `onClick` handlers should work on mobile since React normalizes touch events to clicks, but verify the demo picker bubbles are large enough (44px minimum tap target).

## Verification

1. **Watch phase flow**: Open tutorial -> see completed red grid -> click "Reset Puzzle" -> tiles spin to starting grid -> hand appears on purple tile -> tap purple -> picker appears with hand on blue -> tap blue -> tiles change, locks update -> instruction card explains locks -> hand moves to green tile -> tap green -> picker with yellow highlighted -> tap yellow -> result shown -> hand on blue tile -> tap blue -> picker with red -> tap red -> result -> hand on yellow -> tap -> picker with red -> tap red -> "Puzzle Solved!" -> click "Try Tutorial Puzzles" -> enters try phase.

2. **Try phase**: Now shows 2 puzzles (blue target, green target) instead of 3. Progress dots show 2 dots. Solve both to reach Ready phase.

3. **Auto-show**: Clear localStorage (`colorlock_tutorial_completed`, `colorlock_has_launched`), load the game -> tutorial should auto-open after ~500ms.

4. **Skip flow**: Click X during watch phase -> first-timer gets confirmation dialog, returning user closes immediately.

5. **Compare phase removed**: Verify no reference to TutorialComparePhase exists. Try phase completes directly to Ready.

6. **Dark mode**: All new components (instruction cards, demo picker) respect dark mode via the `@include dark-mode` mixin.

7. **Reduced motion**: With `prefers-reduced-motion: reduce`, tile spin is disabled, instruction cards swap instantly.

8. **Existing tests**: Run `npm run test` and verify no test failures. Tests for tutorialConfig may need updating if they reference the old `WATCH_PHASE_MESSAGES` or the 3-puzzle try config.
