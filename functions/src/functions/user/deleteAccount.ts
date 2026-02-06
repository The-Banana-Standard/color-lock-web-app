/**
 * Deletes a user's account and all associated data.
 * Requires re-authentication with email/password for security.
 *
 * Flow:
 * 1. Verify user is authenticated
 * 2. Re-authenticate with provided credentials (email/password)
 * 3. Delete Firestore data (users/{userId}, userPuzzleHistory/{userId})
 * 4. Delete Firebase Auth account
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, admin, logger, getAppCheckConfig, getFirebaseApiKey } from "../../config.js";
import { verifyPassword } from "../../helpers.js";

interface DeleteAccountRequest {
    email: string;
    password: string;
}

export const deleteAccount = onCall(
    {
        memory: "256MiB",
        timeoutSeconds: 60,
        ...getAppCheckConfig(),
    },
    async (request) => {
        // Step 1: Verify user is authenticated
        if (!request.auth) {
            logger.error("deleteAccount: unauthenticated call");
            throw new HttpsError("unauthenticated", "Authentication required.");
        }

        const userId = request.auth.uid;
        const { email, password } = (request.data || {}) as DeleteAccountRequest;

        logger.info(`deleteAccount: Request received for user ${userId}`);

        // Validate input
        if (!email || !password) {
            throw new HttpsError("invalid-argument", "Email and password are required for account deletion.");
        }

        try {
            // Step 2: Verify the user's credentials match
            // Get the user's auth record to verify email matches
            const userRecord = await admin.auth().getUser(userId);

            if (!userRecord.email) {
                logger.error(`deleteAccount: User ${userId} has no email (anonymous user)`);
                throw new HttpsError(
                    "failed-precondition",
                    "Account deletion requires an email-based account. Anonymous accounts cannot be deleted this way."
                );
            }

            if (userRecord.email.toLowerCase() !== email.toLowerCase()) {
                logger.error(`deleteAccount: Email mismatch for user ${userId}`);
                throw new HttpsError("invalid-argument", "The provided email does not match your account.");
            }

            // For security, we verify the password by attempting to sign in via REST API
            // This is the recommended approach for server-side password verification
            const { apiKey, isEmulator } = getFirebaseApiKey();

            if (isEmulator) {
                // In emulator mode, skip password verification for easier testing
                logger.warn(`deleteAccount: Skipping password verification (emulator mode)`);
            } else if (apiKey) {
                // Production with API key configured - verify password
                const isValidPassword = await verifyPassword(email, password, apiKey);
                if (!isValidPassword) {
                    logger.error(`deleteAccount: Invalid password for user ${userId}`);
                    throw new HttpsError("invalid-argument", "The provided password is incorrect.");
                }
                logger.info(`deleteAccount: Password verified for user ${userId}`);
            } else {
                // Production without API key - FAIL the request for security
                logger.error(`deleteAccount: FIREBASE_API_KEY not configured in production. Cannot verify password.`);
                throw new HttpsError(
                    "failed-precondition",
                    "Account deletion is temporarily unavailable. Please try again later."
                );
            }

            // Step 3: Delete Firestore data using a batch operation
            logger.info(`deleteAccount: Deleting Firestore data for user ${userId}`);

            const batch = db.batch();

            // Delete user document
            const userDocRef = db.collection("users").doc(userId);
            batch.delete(userDocRef);

            // Delete userPuzzleHistory document (and subcollections will be orphaned but that's ok)
            const userHistoryRef = db.collection("userPuzzleHistory").doc(userId);
            batch.delete(userHistoryRef);

            // Note: Firestore doesn't delete subcollections automatically
            // For a complete cleanup, we'd need to delete subcollections too
            // Let's delete the leaderboard and puzzles subcollections
            try {
                // Delete puzzles subcollection
                const puzzlesSnapshot = await userHistoryRef.collection("puzzles").get();
                puzzlesSnapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });

                // Delete leaderboard subcollection
                const leaderboardSnapshot = await userHistoryRef.collection("leaderboard").get();
                leaderboardSnapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });

                logger.info(`deleteAccount: Queued ${puzzlesSnapshot.size} puzzle docs and ${leaderboardSnapshot.size} leaderboard docs for deletion`);
            } catch (subcollectionError) {
                logger.warn(`deleteAccount: Error querying subcollections for user ${userId}:`, subcollectionError);
                // Continue with deletion even if subcollection query fails
            }

            // Commit the batch
            await batch.commit();
            logger.info(`deleteAccount: Firestore data deleted for user ${userId}`);

            // Step 4: Delete Firebase Auth account
            // This is done AFTER Firestore deletion to ensure data is cleaned up
            // even if auth deletion fails (the user would just need to re-authenticate)
            logger.info(`deleteAccount: Deleting Auth account for user ${userId}`);
            await admin.auth().deleteUser(userId);
            logger.info(`deleteAccount: Auth account deleted for user ${userId}`);

            return {
                success: true,
                message: "Account and all associated data have been permanently deleted."
            };

        } catch (error: unknown) {
            logger.error(`deleteAccount: Error deleting account for user ${userId}:`, error);

            // Re-throw HttpsError as-is
            if (error instanceof HttpsError) {
                throw error;
            }

            // Handle specific Firebase errors
            if ((error as { code?: string })?.code === 'auth/user-not-found') {
                throw new HttpsError("not-found", "User account not found.");
            }

            throw new HttpsError("internal", "Failed to delete account. Please try again later.");
        }
    }
);
