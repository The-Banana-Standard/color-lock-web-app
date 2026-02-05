import { HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";

/**
 * Admin UID allowlist, populated from the ADMIN_UIDS environment variable.
 * Format: comma-separated Firebase Auth UIDs, e.g. "uid1,uid2,uid3"
 *
 * Set in functions/.env for production, functions/.env.local for emulator.
 * Find your UID in Firebase Console > Authentication > Users.
 */
const ADMIN_UIDS: Set<string> = new Set(
    (process.env.ADMIN_UIDS || "")
        .split(",")
        .map(uid => uid.trim())
        .filter(uid => uid.length > 0)
);

if (ADMIN_UIDS.size === 0) {
    logger.warn("adminAuth: ADMIN_UIDS is empty or not set. All admin functions will reject all callers.");
} else {
    logger.info(`adminAuth: Loaded ${ADMIN_UIDS.size} admin UID(s)`);
}

/**
 * Assert that the caller is an authenticated admin user.
 * Returns the caller's UID on success.
 * Throws HttpsError if not authenticated or not in the admin allowlist.
 */
export function assertAdmin(request: CallableRequest): string {
    if (!request.auth) {
        logger.warn("assertAdmin: Unauthenticated call to admin function");
        throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const uid = request.auth.uid;

    if (!ADMIN_UIDS.has(uid)) {
        logger.warn(`assertAdmin: Non-admin user ${uid} attempted admin function call`);
        throw new HttpsError("permission-denied", "Admin access required.");
    }

    logger.info(`assertAdmin: Admin access granted for ${uid}`);
    return uid;
}
