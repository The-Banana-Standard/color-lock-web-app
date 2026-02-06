/**
 * Cloud function for clients to update their notification preferences.
 * Updates the user's document in the users collection.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, logger, getAppCheckConfig } from "../../config.js";

interface UpdateNotificationPreferencesRequest {
    notifyOnBestScores: boolean;
}

export const updateNotificationPreferences = onCall(
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
        const { notifyOnBestScores } = (request.data || {}) as UpdateNotificationPreferencesRequest;

        if (typeof notifyOnBestScores !== "boolean") {
            throw new HttpsError("invalid-argument", "notifyOnBestScores must be a boolean.");
        }

        logger.info(`updateNotificationPreferences: userId=${userId}, notifyOnBestScores=${notifyOnBestScores}`);

        const userRef = db.collection("users").doc(userId);
        await userRef.set(
            { notifyOnBestScores },
            { merge: true }
        );

        return { success: true, notifyOnBestScores };
    }
);
