/**
 * v2 Firebase Cloud Function to fetch all puzzles (easy/medium/hard) for a date from puzzlesV2.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, logger, getAppCheckConfig } from "../../config.js";
import { PuzzleV2Document } from "../../firestoreTypes.js";

export const fetchPuzzleV2 = onCall(
    {
        memory: "256MiB",
        timeoutSeconds: 60,
        ...getAppCheckConfig(),
    },
    async (request) => {
        const userId = request.auth?.uid || "guest/unauthenticated";
        const date = request.data?.date as string | undefined;

        logger.info(`fetchPuzzleV2 invoked by user: ${userId}, date: ${date}`);

        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            logger.error("Missing or invalid 'date' parameter in fetchPuzzleV2 call.");
            throw new HttpsError("invalid-argument", "The function must be called with a valid \"date\" argument in YYYY-MM-DD format.");
        }

        const difficulties = ["easy", "medium", "hard"] as const;

        try {
            logger.info(`fetchPuzzleV2: Attempting to fetch puzzles for date: ${date}`);
            const docRefs = difficulties.map((difficulty) => db.collection("puzzlesV2").doc(`${date}-${difficulty}`));
            const docSnaps = await Promise.all(docRefs.map((ref) => ref.get()));

            const missingDifficulties = docSnaps
                .map((snap, idx) => (!snap.exists ? difficulties[idx] : null))
                .filter((v): v is typeof difficulties[number] => v !== null);

            if (missingDifficulties.length > 0) {
                logger.warn(`fetchPuzzleV2: Missing puzzle documents for difficulties: ${missingDifficulties.join(", ")}`);
                throw new HttpsError("not-found", `Puzzle(s) not found for difficulties: ${missingDifficulties.join(", ")}`);
            }

            const puzzleData = {} as Record<(typeof difficulties)[number], PuzzleV2Document>;

            docSnaps.forEach((snap, idx) => {
                const difficulty = difficulties[idx];
                const data = snap.data();

                if (
                    !data ||
                    typeof data.algoScore !== "number" ||
                    typeof data.targetColor !== "string" ||
                    !Array.isArray(data.states) ||
                    data.states.length === 0 ||
                    !Array.isArray(data.actions) ||
                    !Array.isArray(data.colorMap) ||
                    data.colorMap.length === 0
                ) {
                    logger.error(`fetchPuzzleV2: Invalid puzzle data format for ${date}-${difficulty}`, data);
                    throw new HttpsError("internal", `Invalid puzzle data format for difficulty: ${difficulty}`);
                }

                puzzleData[difficulty] = data as PuzzleV2Document;
            });

            return { success: true, data: puzzleData };
        } catch (error) {
            logger.error(`fetchPuzzleV2: Error fetching puzzles for date ${date}:`, error);
            if (error instanceof HttpsError) {
                throw error;
            }
            throw new HttpsError("internal", "Internal server error fetching puzzle");
        }
    }
);
