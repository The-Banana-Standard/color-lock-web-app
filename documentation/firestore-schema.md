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

Container for user's puzzle attempt history. Uses subcollections for individual puzzle records.

**Document ID:** Firebase Auth UID

**Subcollections:** Individual puzzle attempts (structure TBD based on app implementation)

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

Records of the best solution for each puzzle/difficulty combination.

**Document ID:** `YYYY-MM-DD-{difficulty}` (e.g., `2025-12-14-easy`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `puzzleId` | string | Yes | Puzzle date (YYYY-MM-DD) |
| `userId` | string | Yes | Firebase Auth UID of best solver |
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
  "userScore": 7,
  "targetColor": "blue",
  "actions": [20, 44, 68, 30, 12],
  "colorMap": [3, 4, 0, 1, 5, 2],
  "states": [...]
}
```

---

## usageStats

Daily aggregate usage analytics.

**Document ID:** `YYYY-MM-DD`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `uniqueUsers` | integer | Yes | Count of unique users that day |
| `userIds` | array[string] | Yes | List of user IDs who played |
| `totalAttempts` | integer | Yes | Total puzzle attempts |
| `processedAt` | Timestamp | Yes | When stats were computed |

### Example

```json
{
  "uniqueUsers": 3,
  "userIds": [
    "6aA9GFXtGcdGiWho5Q6ffVK9T2G2",
    "SGDI2BjUImhOYGfsdrZzJFnj2V12",
    "iNlRwQKXq4NxCItrGnInbGUFjen1"
  ],
  "totalAttempts": 0,
  "processedAt": "2025-11-25T20:29:40.615Z"
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
