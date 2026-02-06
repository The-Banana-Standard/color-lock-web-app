/**
 * v2 Firebase Cloud Function to fetch a puzzle by date.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, logger, getAppCheckConfig } from "../../config.js";

export const fetchPuzzle = onCall(
    {
        // Runtime options
        memory: "256MiB",
        timeoutSeconds: 60,
        // App Check options
        ...getAppCheckConfig(), // Use helper to determine App Check enforcement
    },
    async (request) => {
        // request.app will be defined if enforceAppCheck is true and validation passed
        // request.auth contains user authentication info (or null if unauthenticated)
        const userId = request.auth?.uid || "guest/unauthenticated";
        logger.info(`fetchPuzzle invoked by user: ${userId}, App Check verified: ${!!request.app}`);

        // Validate Input Data
        const date = request.data.date;
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            logger.error("Missing or invalid 'date' parameter in fetchPuzzle call.");
            throw new HttpsError("invalid-argument", "The function must be called with a valid \"date\" argument in YYYY-MM-DD format.");
        }

        // Function Logic
        try {
            logger.info(`Attempting to fetch puzzle for date: ${date}`);
            const puzzleRef = db.collection("puzzles").doc(date);
            const puzzleSnap = await puzzleRef.get();

            if (puzzleSnap.exists) {
                logger.info("Puzzle found in Firestore");
                const puzzleData = puzzleSnap.data();

                // Add stricter validation
                if (!puzzleData || typeof puzzleData.algoScore !== "number" || !puzzleData.targetColor || !Array.isArray(puzzleData.states) || puzzleData.states.length === 0 || !Array.isArray(puzzleData.actions)) {
                    logger.error(`Invalid puzzle data format found for date: ${date}`, puzzleData);
                    throw new HttpsError("internal", "Invalid puzzle data format found.");
                }

                return { success: true, data: puzzleData }; // Return data on success
            } else {
                logger.warn(`No puzzle found for date: ${date}`);
                throw new HttpsError("not-found", `Puzzle not found for date: ${date}`);
            }
        } catch (error) {
            logger.error(`Error in fetchPuzzle for date ${date}:`, error);
            if (error instanceof HttpsError) {
                throw error; // Re-throw HttpsError
            }
            throw new HttpsError("internal", "Internal server error fetching puzzle");
        }
    }
);
