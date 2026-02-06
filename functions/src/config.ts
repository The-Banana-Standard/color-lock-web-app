/**
 * Firebase configuration and shared utilities for Cloud Functions.
 * This module initializes the Firebase Admin SDK and exports shared resources.
 */

import * as admin from "firebase-admin";
import { logger as v2Logger } from "firebase-functions/v2";

/**
 * App Check Strategy:
 *
 * In this codebase, we use a dynamic approach to App Check enforcement:
 *
 * 1. Production Environment:
 *    - App Check is strictly enforced (`enforceAppCheck: true`)
 *    - All requests must have valid App Check tokens
 *    - Full security is maintained
 *
 * 2. Emulator/Development Environment:
 *    - App Check is automatically disabled (`enforceAppCheck: false`)
 *    - Allows for easier local testing without dealing with App Check complexities
 *    - The environment is detected using multiple methods (FUNCTIONS_EMULATOR env var, etc.)
 *
 * This approach maintains security in production while enabling seamless local development.
 * The `getAppCheckConfig()` helper function handles this logic.
 */

// Initialize Firebase app
admin.initializeApp();

// Initialize Firestore client
export const db = admin.firestore();

// Export the admin module for access to auth, messaging, etc.
export { admin };

// Configure logging (choose v1 or v2 logger)
export const logger = v2Logger; // Using v2 logger

/**
 * Utility function to determine App Check enforcement based on environment.
 * Returns an object that can be spread into onCall options.
 */
export function getAppCheckConfig(): { enforceAppCheck: boolean } {
    // Multiple ways to detect emulator environment
    const isEmulatorEnv =
        process.env.FUNCTIONS_EMULATOR === 'true' ||
        process.env.FIRESTORE_EMULATOR_HOST !== undefined ||
        process.env.FIREBASE_CONFIG?.includes('"emulators"') ||
        process.env.NODE_ENV === 'development';

    // Log the detection for debugging purposes
    logger.info(`Running in ${isEmulatorEnv ? 'emulator/development' : 'production'} environment. App Check will be ${isEmulatorEnv ? 'disabled' : 'enforced'}.`);

    return {
        enforceAppCheck: !isEmulatorEnv, // false in emulator, true in production
    };
}

/**
 * Helper function to get Firebase API key and detect environment.
 * Returns both the API key (if available) and whether we're in emulator mode.
 *
 * In production, FIREBASE_API_KEY must be set for password verification to work.
 * In emulator mode, password verification can be safely skipped.
 */
export function getFirebaseApiKey(): { apiKey: string | null; isEmulator: boolean } {
    // Detect emulator mode (must match getAppCheckConfig() logic)
    const isEmulator =
        process.env.FUNCTIONS_EMULATOR === 'true' ||
        process.env.FIRESTORE_EMULATOR_HOST !== undefined ||
        process.env.FIREBASE_CONFIG?.includes('"emulators"') ||
        process.env.NODE_ENV === 'development';

    // Check environment variable for API key
    const apiKey = process.env.FIREBASE_API_KEY || null;

    if (isEmulator) {
        logger.info("getFirebaseApiKey: Running in emulator mode");
    } else if (!apiKey) {
        logger.error("getFirebaseApiKey: FIREBASE_API_KEY not set in production environment!");
    }

    return { apiKey, isEmulator };
}
