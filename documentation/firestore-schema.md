# Firestore Database Schema

Reference documentation for the Color Lock Firestore database. Use this when building code that interacts with the datastore.

**Project:** `color-lock-prod`

---

## Collections Overview

| Collection | Document ID | Purpose | Access |
|------------|-------------|---------|--------|
| `users` | Firebase Auth UID | User profiles and settings | Owner only |
| `userPuzzleHistory` | Firebase Auth UID | Per-user puzzle attempt history | Owner only |
| `puzzlesV2` | `YYYY-MM-DD-{difficulty}` | Daily puzzles by difficulty | Read: authenticated |
| `dailyScoresV2` | `YYYY-MM-DD` | Daily leaderboard by difficulty | Read: authenticated |
| `bestScores` | `YYYY-MM-DD-{difficulty}` | Best solutions per puzzle | Read: authenticated |
| `usageStats` | `YYYY-MM-DD` | Daily usage analytics | Backend only |

---

## users

User profile and device settings.

**Document ID:** Firebase Auth UID (e.g., `04qa3ZpxSJd9ef61oabFcNIbmfL2`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `timezone` | string | Yes | IANA timezone (e.g., `US/Pacific`, `Asia/Dhaka`) |
| `fcmToken` | string | No | Firebase Cloud Messaging token for push notifications |
| `timezoneUpdatedAt` | Timestamp | No | When timezone was last updated |
| `tokenUpdatedAt` | Timestamp | No | When FCM token was last updated |
| `notifyOnBestScores` | boolean | No | Opt-in for best score notifications (default: false) |

### Example

```json
{
  "timezone": "US/Pacific",
  "fcmToken": "cjzLq6u8jkkVmcV9-2SJ1k:APA91bF...",
  "timezoneUpdatedAt": "2026-01-30T21:32:22.455Z",
  "tokenUpdatedAt": "2026-01-30T21:32:22.455Z",
  "notifyOnBestScores": true
}
```

---

## userPuzzleHistory

Container for user's puzzle attempt history. Uses subcollections for puzzle records and leaderboard stats.

**Document ID:** Firebase Auth UID

### Subcollections

#### puzzles/{puzzleId}

Individual puzzle attempt records by date.

**Document ID:** `YYYY-MM-DD`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `totalAttempts` | integer | Yes | Total attempts across all difficulties |
| `easy` | object | No | Easy difficulty data (see below) |
| `medium` | object | No | Medium difficulty data (see below) |
| `hard` | object | No | Hard difficulty data (see below) |

**Per-difficulty object structure:**

| Field | Type | Description |
|-------|------|-------------|
| `attempts` | integer | Number of attempts on this difficulty |
| `totalAttempts` | integer | Same as attempts (legacy compatibility) |
| `lowestMovesAttemptNumber` | integer or null | Attempt number when lowest score was achieved |
| `moves` | integer or null | Best (lowest) move count achieved |
| `firstTry` | boolean | True if tied/beat bot on first attempt without hints |
| `firstToBeatBot` | boolean | True if first player to beat bot threshold |
| `eloScore` | number or null | Elo score for this difficulty (null if hint used) |
| `attemptToTieBot` | integer or null | First attempt number that tied bot |
| `attemptToBeatBot` | integer or null | First attempt number that beat bot |
| `hintUsed` | boolean | True if solution/hint was ever used |

#### leaderboard/levelAgnostic

Aggregated stats across all difficulties.

| Field | Type | Description |
|-------|------|-------------|
| `moves` | integer | Total moves across all games |
| `puzzleAttempts` | integer | Total puzzle attempts |
| `puzzleSolved` | integer | Total puzzles solved |
| `currentPuzzleCompletedStreak` | integer | Current consecutive days with puzzle completed |
| `longestPuzzleCompletedStreak` | integer | Longest streak of consecutive days |
| `lastPuzzleCompletedDate` | string | Last puzzle completion date (YYYY-MM-DD) |
| `lastEasyCompletedDate` | string | Last Easy puzzle completion date |
| `lastMediumCompletedDate` | string | Last Medium puzzle completion date |
| `lastHardCompletedDate` | string | Last Hard puzzle completion date |
| `eloScoreByDay` | map | Map of puzzleId -> sum Elo score for that day |
| `eloScoreAllTime` | number | Total Elo score across all time |
| `eloScoreLast30` | number | Total Elo score for last 30 days |
| `eloScoreLast7` | number | Total Elo score for last 7 days |

#### leaderboard/{difficulty}

Per-difficulty streak and goal tracking. Difficulty is `easy`, `medium`, or `hard`.

| Field | Type | Description |
|-------|------|-------------|
| `currentFirstTryStreak` | integer | Current streak of first-try wins |
| `longestFirstTryStreak` | integer | Longest first-try streak |
| `lastFirstTryDate` | string | Date of last first-try win |
| `goalsAchieved` | integer | Times user tied bot score |
| `goalAchievedDate` | string | Last date goal was achieved |
| `goalsBeaten` | integer | Times user beat bot score |
| `goalBeatenDate` | string | Last date goal was beaten |
| `currentTieBotStreak` | integer | Current streak of tying/beating bot |
| `longestTieBotStreak` | integer | Longest tie/beat bot streak |
| `lastTieBotDate` | string | Last date user tied/beat bot |

---

## puzzlesV2

Daily puzzles with difficulty levels. Grid size varies by difficulty.

**Document ID:** `YYYY-MM-DD-{difficulty}` where difficulty is `easy`, `medium`, or `hard`

Examples: `2025-01-16-easy`, `2025-01-16-hard`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `targetColor` | string | Yes | Winning color |
| `algoScore` | integer | Yes | Bot's optimal move count |
| `actions` | array[integer] | Yes | Encoded solution moves |
| `colorMap` | array[integer] | Yes | Color index mapping |
| `states` | array[object] | Yes | Grid states from start to solution |

### Grid Sizes by Difficulty

| Difficulty | Grid Size |
|------------|-----------|
| easy | 4x4 |
| medium | 5x5 |
| hard | 6x6 |

---

## dailyScoresV2

Daily leaderboard scores organized by difficulty.

**Document ID:** `YYYY-MM-DD`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `easy` | map | No | `{userId: moveCount}` |
| `medium` | map | No | `{userId: moveCount}` |
| `hard` | map | No | `{userId: moveCount}` |

### Example

```json
{
  "easy": {
    "mYNN21F0IYMD3HG6T02oUVTuhhf1": 8,
    "pxqCwocIm2hGCu2bqNHhgskPycn1": 6
  },
  "medium": {
    "K2Eb5ZpdjAM0wiT7PNTZGZfZeVJ3": 9
  },
  "hard": {
    "8xJYITAu04U8Lt4yPh2noqdluls1": 8,
    "aDhsr9UHCCf951GCRrNU9aD0c3J2": 8
  }
}
```

---

## bestScores

Records of the best solution for each puzzle/difficulty combination. Triggers notifications to opted-in users when a new best score is set.

**Document ID:** `YYYY-MM-DD-{difficulty}` (e.g., `2025-12-14-easy`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `puzzleId` | string | Yes | Puzzle date (YYYY-MM-DD) |
| `userId` | string | Yes | Firebase Auth UID of best solver |
| `userName` | string | Yes | Display name of best solver |
| `userScore` | integer | Yes | Move count of best solution |
| `targetColor` | string | Yes | Winning color |
| `actions` | array[integer] | Yes | Encoded solution moves |
| `colorMap` | array[integer] | Yes | Color index mapping |
| `states` | array[object] | Yes | Grid states showing the solution |

### Example

```json
{
  "puzzleId": "2025-12-14",
  "userId": "7JGMro6xzgMZMbb8YcvmXOiqyuj2",
  "userName": "PlayerOne",
  "userScore": 7,
  "targetColor": "blue",
  "actions": [20, 44, 68, 30, 12],
  "colorMap": [3, 4, 0, 1, 5, 2],
  "states": [...]
}
```

### Best Score Notification Thresholds

Notifications are sent to users who played today's puzzle when someone sets a new best score that meets these thresholds:

| Difficulty | Threshold |
|------------|-----------|
| Easy | Must beat bot by 3+ moves |
| Medium | Must beat bot by 2+ moves |
| Hard | Must beat bot by 1+ move |

---

## usageStats

Daily and aggregate usage analytics. Contains both daily documents and aggregate documents.

### Daily Documents

**Document ID:** `YYYY-MM-DD`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `uniqueUsers` | integer | Yes | Count of unique users that day |
| `userIds` | array[string] | Yes | List of user IDs who played |
| `totalAttempts` | integer | Yes | Total puzzle attempts |
| `puzzleStreak3PlusCount` | integer | Yes | Users with 3+ day puzzle completion streaks ending this day |
| `easyGoalStreak3PlusCount` | integer | Yes | Users with 3+ day Easy goal streaks ending this day |
| `mediumGoalStreak3PlusCount` | integer | Yes | Users with 3+ day Medium goal streaks ending this day |
| `hardGoalStreak3PlusCount` | integer | Yes | Users with 3+ day Hard goal streaks ending this day |
| `processedAt` | Timestamp | Yes | When stats were computed |

#### Daily Example

```json
{
  "uniqueUsers": 8,
  "userIds": ["user1", "user2", "..."],
  "totalAttempts": 24,
  "puzzleStreak3PlusCount": 5,
  "easyGoalStreak3PlusCount": 2,
  "mediumGoalStreak3PlusCount": 3,
  "hardGoalStreak3PlusCount": 1,
  "processedAt": "2025-11-25T20:29:40.615Z"
}
```

### Aggregate Documents

**Document ID:** `aggregate_7d`, `aggregate_30d`, `aggregate_90d`, `aggregate_allTime`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `uniqueUsers` | integer | Yes | Count of unique users in period |
| `userIds` | array[string] | Yes | List of user IDs who played |
| `totalAttempts` | integer | Yes | Total puzzle attempts in period |
| `daysWithData` | integer | Yes | Number of days with activity |
| `startDate` | string | Yes | Period start date (YYYY-MM-DD) |
| `endDate` | string | Yes | Period end date (YYYY-MM-DD) |
| `puzzleStreak3PlusSum` | integer | Yes | Sum of daily puzzle streak counts |
| `easyGoalStreak3PlusSum` | integer | Yes | Sum of daily Easy goal streak counts |
| `mediumGoalStreak3PlusSum` | integer | Yes | Sum of daily Medium goal streak counts |
| `hardGoalStreak3PlusSum` | integer | Yes | Sum of daily Hard goal streak counts |
| `processedAt` | Timestamp | Yes | When stats were computed |

#### Aggregate Example

```json
{
  "uniqueUsers": 10,
  "userIds": ["user1", "user2", "..."],
  "totalAttempts": 450,
  "daysWithData": 30,
  "startDate": "2025-01-01",
  "endDate": "2025-01-30",
  "puzzleStreak3PlusSum": 85,
  "easyGoalStreak3PlusSum": 32,
  "mediumGoalStreak3PlusSum": 28,
  "hardGoalStreak3PlusSum": 15,
  "processedAt": "2025-01-30T20:29:40.615Z"
}
```

---

## Security Rules Summary

| Collection | Read | Write |
|------------|------|-------|
| `users/{userId}` | Owner only | Owner only (restricted fields) |
| `userPuzzleHistory/{userId}/**` | Owner only | Owner only |
| `puzzlesV2/*` | Authenticated | Backend only |
| `dailyScoresV2/*` | Authenticated | Backend only |
| `bestScores/*` | Authenticated | Backend only |
| `leaderboards/**` | Authenticated | Backend only |
| All other paths | Denied | Denied |

**Protected fields on user update:** `email`, `emailVerified`, `createdAt`

---

## Common Patterns

### Querying Today's Puzzle

```typescript
const today = new Date().toISOString().split('T')[0]; // "2025-01-31"
const puzzleRef = doc(db, 'puzzlesV2', `${today}-hard`);
```

### Getting User Stats

```typescript
const userStatsRef = doc(db, 'userStats', auth.currentUser.uid);
```

### Checking Daily Leaderboard

```typescript
const today = new Date().toISOString().split('T')[0];
const scoresRef = doc(db, 'dailyScoresV2', today);
const scores = await getDoc(scoresRef);
const hardScores = scores.data()?.hard || {};
```

---

## Cloud Functions

All functions use Firebase Cloud Functions v2 with automatic App Check enforcement in production (disabled in emulator).

### Callable Functions

| Function | Auth Required | Description |
|----------|--------------|-------------|
| `fetchPuzzle` | No | Legacy: Fetch single puzzle by date |
| `fetchPuzzleV2` | No | Fetch all difficulty puzzles for a date |
| `recordPuzzleHistory` | Yes | Record puzzle attempt, update scores and streaks |
| `setHintUsedForPuzzle` | Yes | Mark hint/solution usage for a puzzle |
| `updateNotificationPreferences` | Yes | Update user notification settings |
| `getDailyScoresV2Stats` | No | Get per-difficulty stats for a puzzle |
| `getWinModalStats` | Yes | Get streak stats for win modal display |
| `getPersonalStats` | Yes | Get personal stats for stats modal |
| `getGlobalLeaderboardV2` | No | Get global leaderboard by category |
| `getUsageStats` | Yes | Get usage statistics (admin) |
| `backfillUsageStats` | Yes | Backfill historical usage stats (admin) |
| `deleteAccount` | Yes | Delete user account and data |

### Firestore Triggers

| Trigger | Document Path | Description |
|---------|--------------|-------------|
| `onBestScoreWritten` | `bestScores/{docId}` | Sends push notifications when new best score is set |

### Scheduled Functions

| Function | Schedule | Description |
|----------|----------|-------------|
| `sendDailyPuzzleReminders` | Every hour at :30 | Sends puzzle reminder at 8:30 PM user local time |

---

## Firestore Indexes

Composite index for notification queries:

```json
{
  "collectionGroup": "users",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "notifyOnBestScores", "order": "ASCENDING" },
    { "fieldPath": "fcmToken", "order": "ASCENDING" }
  ]
}
```
