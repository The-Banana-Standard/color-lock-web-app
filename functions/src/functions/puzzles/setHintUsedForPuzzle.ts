/**
 * Cloud Function to mark hint/solution usage for a puzzle+difficulty.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, logger, getAppCheckConfig } from "../../config.js";
import { DifficultyLevel } from "../../../../shared/types.js";
import { UserPuzzleDocument, PuzzleDifficultyEntry } from "../../firestoreTypes.js";
import { normalizeDifficulty } from "../../helpers.js";

interface SetHintUsedRequest {
    puzzleId: string;
    difficulty: DifficultyLevel | "easy" | "medium" | "hard";
}

export const setHintUsedForPuzzle = onCall(
    {
        memory: "256MiB",
        timeoutSeconds: 60,
        ...getAppCheckConfig(),
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Authentication required.");
        }
        const userId = request.auth.uid;
        const { puzzleId, difficulty } = (request.data || {}) as SetHintUsedRequest;

        if (!puzzleId || !difficulty) {
            throw new HttpsError("invalid-argument", "puzzleId and difficulty are required.");
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(puzzleId)) {
            throw new HttpsError("invalid-argument", "Invalid puzzleId format. Expected YYYY-MM-DD.");
        }

        const normalizedDifficulty = normalizeDifficulty(difficulty);
        const userHistoryRef = db.collection("userPuzzleHistory").doc(userId);
        const puzzleRef = userHistoryRef.collection("puzzles").doc(puzzleId);

        await db.runTransaction(async (tx) => {
            const snap = await tx.get(puzzleRef);
            const data: UserPuzzleDocument = snap.exists ? (snap.data() as UserPuzzleDocument) : {};
            const existingDiffData: PuzzleDifficultyEntry = (data && typeof data[normalizedDifficulty] === "object") ? (data[normalizedDifficulty] as PuzzleDifficultyEntry) : {};

            tx.set(puzzleRef, {
                [normalizedDifficulty]: {
                    ...existingDiffData,
                    hintUsed: true
                }
            }, { merge: true });
        });

        logger.info("setHintUsedForPuzzle: hint marked as used", { userId, puzzleId, difficulty: normalizedDifficulty });
        return { success: true };
    }
);
