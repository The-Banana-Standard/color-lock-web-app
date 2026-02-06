/**
 * Firestore trigger that sends best score notifications when a new best score is written.
 * Triggers on creates and updates to bestScores/{docId} documents.
 */

import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { db, logger } from "../../config.js";
import { DifficultyLevel } from "../../../../shared/types.js";
import { qualifiesForBestScoreNotification, sendBestScoreNotifications } from "../../helpers.js";

export const onBestScoreWritten = onDocumentWritten(
    {
        document: "bestScores/{docId}",
        memory: "256MiB",
        timeoutSeconds: 60,
    },
    async (event) => {
        const before = event.data?.before?.data();
        const after = event.data?.after?.data();

        // Skip if document was deleted
        if (!after) {
            logger.info("onBestScoreWritten: Document deleted, skipping");
            return;
        }

        // Skip if score didn't change (same user updating other fields)
        if (before?.userScore === after.userScore && before?.userId === after.userId) {
            logger.info("onBestScoreWritten: Score unchanged, skipping");
            return;
        }

        // Parse difficulty from docId (format: YYYY-MM-DD-difficulty)
        const docId = event.params.docId;
        const parts = docId.split("-");
        if (parts.length !== 4) {
            logger.warn("onBestScoreWritten: Invalid docId format", { docId });
            return;
        }
        const validDifficulties = [DifficultyLevel.Easy, DifficultyLevel.Medium, DifficultyLevel.Hard];
        const difficultyStr = parts[3];
        if (!validDifficulties.includes(difficultyStr as DifficultyLevel)) {
            logger.warn("onBestScoreWritten: Invalid difficulty", { docId, difficulty: difficultyStr });
            return;
        }
        const difficulty = difficultyStr as DifficultyLevel;
        const puzzleId = parts.slice(0, 3).join("-"); // 'YYYY-MM-DD'

        // Fetch bot score from puzzle document
        const puzzleDoc = await db.collection("puzzlesV2").doc(docId).get();
        const botMoves = puzzleDoc.data()?.algoScore;

        if (typeof botMoves !== "number") {
            logger.warn("onBestScoreWritten: Could not fetch bot score", { docId });
            return;
        }

        // Check if score qualifies for notification
        if (!qualifiesForBestScoreNotification(after.userScore, botMoves, difficulty)) {
            logger.info("onBestScoreWritten: Score doesn't meet threshold", {
                userScore: after.userScore,
                botMoves,
                difficulty
            });
            return;
        }

        logger.info("onBestScoreWritten: Sending notifications", {
            puzzleId,
            difficulty,
            userScore: after.userScore,
            userId: after.userId
        });

        // Send notifications
        await sendBestScoreNotifications(puzzleId, difficulty, after.userScore, after.userId);
    }
);
