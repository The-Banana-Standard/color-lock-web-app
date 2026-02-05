import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { User, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, signInAnonymously, EmailAuthProvider, linkWithCredential, updateProfile } from 'firebase/auth';
import { auth, deleteAccountCallable } from '../services/firebaseService';
import { debugLog, LogLevel } from '../utils/debugUtils';

interface AuthContextType {
  currentUser: User | null;
  isGuest: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  isUnauthenticatedBrowsing: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (email: string, password: string, displayName: string) => Promise<User>;
  logOut: () => Promise<void>;
  playAsGuest: () => Promise<void>;
  deleteAccount: (email: string, password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isGuest, setIsGuest] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUnauthenticatedBrowsing, setIsUnauthenticatedBrowsing] = useState<boolean>(false);

  /**
   * Signs in anonymously as a guest user.
   * Called on first move for unauthenticated users.
   *
   * Dependencies intentionally empty: This callback captures only stable references
   * (Firebase `auth` module, `debugLog` utility) - no React state. It reads
   * `auth.currentUser` directly from Firebase rather than closure state, ensuring
   * it always has fresh values. State updates flow through onAuthStateChanged.
   */
  const playAsGuest = useCallback(async (): Promise<void> => {
    if (!auth) {
      debugLog('authContext', 'Auth Service not available for playAsGuest.', null, LogLevel.ERROR);
      throw new Error('Authentication service is not available');
    }
    if (auth.currentUser) {
      debugLog('authContext', 'User already authenticated, skipping guest sign-in.');
      setCurrentUser(auth.currentUser);
      setIsAuthenticated(true);
      setIsGuest(auth.currentUser.isAnonymous);
      setIsUnauthenticatedBrowsing(false);
      setIsLoading(false);
      return;
    }
    debugLog('authContext', 'Attempting anonymous sign-in (triggered by user action)...');
    try {
      const userCredential = await signInAnonymously(auth);
      debugLog('authContext', 'Anonymous sign-in successful:', userCredential.user.uid);
      localStorage.setItem('authPreference', 'guest');
      setIsUnauthenticatedBrowsing(false);
      // Note: onAuthStateChanged will handle setting currentUser, isAuthenticated, isGuest
    } catch (error) {
      debugLog('authContext', 'Anonymous sign-in failed:', error, LogLevel.ERROR);
      setIsLoading(false);
      throw error;
    }
  }, []);

  useEffect(() => {
    if (!auth) {
      debugLog('authContext', 'Auth service not initialized. Cannot set up listener.', null, LogLevel.ERROR);
      setIsLoading(false);
      return;
    }

    debugLog('authContext', 'Setting up onAuthStateChanged listener...');
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      debugLog('authContext', 'Auth State Changed:', user ? { uid: user.uid, isAnonymous: user.isAnonymous, displayName: user.displayName } : 'No user');
      setCurrentUser(user);

      if (user) {
        setIsAuthenticated(true);
        const wasAnonymous = isGuest; // capture previous state
        setIsGuest(user.isAnonymous);
        setIsLoading(false); // Auth state determined

        debugLog('authContext', 'Auth state updated', { isAuthenticated: true, isGuest: user.isAnonymous, changedFromGuest: wasAnonymous && !user.isAnonymous });

        if (!user.isAnonymous) {
           localStorage.setItem('authPreference', 'user');
        }
        // *** Data fetching is now triggered in AuthenticatedApp ***
      } else {
        setIsAuthenticated(false);
        setIsGuest(false);
        setIsUnauthenticatedBrowsing(true);
        setIsLoading(false);
        debugLog('authContext', 'No user found, allowing unauthenticated browsing. Guest account will be created on first move.');
        // Guest account creation is now deferred to first move in GameContext
      }
    });

    return () => {
      debugLog('authContext', 'Cleaning up onAuthStateChanged listener.', null, LogLevel.DEBUG);
      unsubscribe();
    };
    /**
     * Intentional empty deps: Auth listener sets up once on mount.
     * - setState functions (setCurrentUser, etc.) are stable references
     * - No closure captures state variables - Firebase auth is the source of truth
     * - Cleanup properly unsubscribes on unmount
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (email: string, password: string): Promise<User> => {
    if (!auth) {
      throw new Error('Authentication service is not available');
    }
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    setCurrentUser(userCredential.user);
    setIsAuthenticated(true);
    setIsGuest(false);
    localStorage.setItem('authPreference', 'user');
    return userCredential.user;
  };

  const signUp = async (email: string, password: string, displayName: string): Promise<User> => {
      if (!auth) throw new Error('Authentication service is not available');
      const currentAuthUser = auth.currentUser;
      let userCredential; // Declare userCredential outside the blocks

      try {
          if (currentAuthUser && currentAuthUser.isAnonymous) {
              debugLog('authContext', 'Attempting to link anonymous user with email', { uid: currentAuthUser.uid, email });
              const credential = EmailAuthProvider.credential(email, password);
              userCredential = await linkWithCredential(currentAuthUser, credential); // Assign here
              debugLog('authContext', 'Successfully linked anonymous user', { uid: userCredential.user.uid });

              // Explicitly update state for converted anonymous user
              setIsGuest(false);
              setIsAuthenticated(true);
          } else {
              debugLog('authContext', 'No anonymous user detected, creating new user', { email });
              userCredential = await createUserWithEmailAndPassword(auth, email, password); // Assign here
              debugLog('authContext', 'Successfully created new user', { uid: userCredential.user.uid });

              // For new users, set these states as well
              setIsGuest(false);
              setIsAuthenticated(true);
          }

          // --- Update Profile with Display Name ---
          if (userCredential.user) {
              try {
                  await updateProfile(userCredential.user, { displayName: displayName });
                  debugLog('authContext', 'Display name set for user', { displayName, uid: userCredential.user.uid });
                  // Update local state immediately to reflect the change faster
                  // Note: onAuthStateChanged will also fire, but this makes the UI update quicker
                  setCurrentUser({ ...userCredential.user, displayName: displayName });
              } catch (profileError) {
                  debugLog('authContext', 'Error setting display name:', profileError, LogLevel.ERROR);
                  // Decide how to handle this - maybe log it but don't fail the whole signup?
                  // For now, just log and continue.
              }
          }
          // --- End Profile Update ---

          localStorage.setItem('authPreference', 'user');
          return userCredential.user; // Return the user object

      } catch (error: unknown) {
          debugLog('authContext', 'Sign Up Error:', error, LogLevel.ERROR);
          const code = error && typeof error === 'object' && 'code' in error ? (error as { code: string }).code : '';
          if (code === 'auth/credential-already-in-use') {
              throw new Error("This email address is already associated with an account. Please sign in or use a different email.");
          } else if (code === 'auth/email-already-in-use') {
              throw new Error("This email address is already registered. Please sign in.");
          } else if (code === 'auth/provider-already-linked') {
              throw new Error("This guest account is already linked to an email.");
          }
          throw error;
      }
  };

  const logOut = async (): Promise<void> => {
    if (!auth) {
      throw new Error('Authentication service is not available');
    }
    await signOut(auth);
    setCurrentUser(null);
    setIsAuthenticated(false);
    setIsGuest(false);
    localStorage.removeItem('authPreference');
  };

  const deleteAccount = async (email: string, password: string): Promise<void> => {
    if (!auth) {
      throw new Error('Authentication service is not available');
    }

    if (!currentUser) {
      throw new Error('No user is currently signed in');
    }

    if (currentUser.isAnonymous) {
      throw new Error('Anonymous accounts cannot be deleted this way. Please sign in with an email account first.');
    }

    debugLog('authContext', 'Attempting to delete account', { uid: currentUser.uid });

    try {
      // Call the Cloud Function to delete the account
      const result = await deleteAccountCallable({ email, password });

      if (result.data.success) {
        debugLog('authContext', 'Account deleted successfully via Cloud Function');

        // Clear local state
        setCurrentUser(null);
        setIsAuthenticated(false);
        setIsGuest(false);
        localStorage.removeItem('authPreference');

        // Clear any other local storage data related to the app
        // Note: The Cloud Function already deleted server-side data
        localStorage.clear();

        debugLog('authContext', 'Local state cleared after account deletion');
      } else {
        throw new Error(result.data.error || 'Failed to delete account');
      }
    } catch (error: unknown) {
      debugLog('authContext', 'Delete account error:', error, LogLevel.ERROR);

      const code = error && typeof error === 'object' && 'code' in error ? (error as { code: string }).code : '';
      const message = error instanceof Error ? error.message : '';
      if (code === 'functions/invalid-argument') {
        throw new Error(message || 'Invalid email or password');
      } else if (code === 'functions/unauthenticated') {
        throw new Error('You must be signed in to delete your account');
      } else if (code === 'functions/failed-precondition') {
        throw new Error(message || 'Account deletion is not available for this account type');
      }

      throw error;
    }
  };

  const value: AuthContextType = {
    currentUser,
    isGuest,
    isAuthenticated,
    isLoading,
    isUnauthenticatedBrowsing,
    signIn,
    signUp,
    logOut,
    playAsGuest,
    deleteAccount
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
} 