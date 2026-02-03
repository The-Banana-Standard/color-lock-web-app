Color Lock Gameplay Explained
Color Lock is a daily puzzle game with flood-fill mechanics. Here's how it works:

Core Objective
Transform a 5x5 grid into a single target color. Each tile can be one of 6 colors (Red, Green, Blue, Yellow, Purple, Orange).

How Moves Work
Click a tile and select a new color
All connected tiles of the same color change together (flood fill)
Only adjacent tiles (up/down/left/right, not diagonal) are connected
The "Lock" Mechanic
The largest contiguous region of the same color becomes "locked" - you cannot directly select those tiles. This creates the strategic tension.

Win Condition
All 25 tiles become the target color.

Lose Condition
The locked region grows too large (threshold varies by difficulty) and it's the wrong color. Once this happens, no other region can overtake it.

Difficulty Levels
Difficulty	Loss Threshold	Starting Point
Easy	8 tiles (32%)	3 moves pre-done
Medium	13 tiles (52%)	1 move pre-done
Hard	18 tiles (72%)	Original puzzle
Scoring
Your moves are compared to an optimal algorithm solution
Streaks track first-try wins, beating/tying the bot, and daily completions
Best scores are tracked per difficulty
Extra Features
Hints - Shows the next optimal move
Bot Solution - Demonstrates the optimal path (doesn't count as a win)
Autocomplete - Triggers when you're very close to winning
The strategy involves growing your target color region while preventing any non-target region from dominating the board!