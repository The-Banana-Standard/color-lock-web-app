# Changelog

All notable changes to Color Lock will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Dark mode styling across all modals (Settings, Stats, Tutorial, Win, Loss, Sign in/Sign up, Autocomplete)
- Gradient title text matching emoji colors for modal headers
- Best score notification trigger cloud function for alerting users when their scores are beaten
- Streak counting for usage stats aggregation (3+ day streaks for puzzles and goal achievement)
- New documentation: `color_lock.md` product overview and `TASKS.md` task tracking
- `notifyOnBestScores` user preference field for push notification opt-in

### Changed

- Moved `styling-guide.md` from `.claude/skills/` to `documentation/` for better discoverability
- Firebase emulator port changed from 8080 to 8081 to avoid conflicts
- Expanded `firestore-schema.md` with complete collection reference documentation
- Refactored `UsageStatsScreen` component with improved data visualization
- Updated `StatsModal` and `TutorialModal` styling for dark mode consistency
- Enhanced seed script with more comprehensive test data
- Refactored auth component styles to use SCSS variables and design tokens for consistency

### Removed

- Deprecated `TODO.md` from documentation folder (replaced by `TASKS.md`)
- Unused `.claude/commands/review.md` command file
- `.cursor/mcp.json` configuration file
