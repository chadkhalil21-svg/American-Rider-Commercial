// American Rider — real authentication state (Firebase).
// Tracks the signed-in user and exposes sign up / sign in / sign out.
import { updateProfile,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  verifyBeforeUpdateEmail,
  User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { t } from '../i18n';
import { clearAccountStorage, clearAllStorage } from './accountStorage';
import { deleteAccountOnServer } from '../backend/account';
import { clearPushToken } from '../backend/push';

type AuthState = {
  user: User | null;
  /** Existing verified profile name, kept separate from Firebase User methods. */
  accountName: string | null;
  initializing: boolean;
  busy: boolean;
  error: string | null;
  diagnosticCode: string | null;
  signUp: (email: string, password: string, name?: string, mobile?: string) => Promise<boolean>;
  // True while the post-signup onboarding steps (code, role, ready) are on screen —
  // keeps the front-door overlay up even though Firebase already has a user.
  onboarding: boolean;
  setOnboarding: (b: boolean) => void;
  signIn: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<boolean>;
  /**
   * Reauthenticates, asks the server to stop operational work and delete the Firebase
   * identity, and clears device data. The server deletes the profile synchronously or
   * retries it through its leased worker; retained records still need a legal policy.
   * Requires a fresh credential from the account's linked Password, Apple, or Google
   * provider because Firebase refuses to delete an account whose sign-in is not recent.
   */
  /**
   * Set the name on this account.
   *
   * Sign-up takes a name but does not insist on one, and nothing anywhere could add one
   * afterwards — so an account created without one was stuck showing the local part of its
   * owner's email address wherever a name belonged, including to every traveler they drove.
   */
  setDisplayName: (name: string) => Promise<boolean>;
  resendEmailVerification: () => Promise<boolean>;
  requestEmailChange: (newEmail: string, reauthenticate: () => Promise<void>) => Promise<boolean>;
  /** One explicit Firebase Auth refresh after following the verification link. */
  refreshEmailStatus: () => Promise<boolean>;
  deleteAccount: (reauthenticate: () => Promise<void>) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used inside <AuthProvider>');
  return c;
}

// Turn Firebase's error codes into plain, friendly language.
function friendly(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return t('traveler.errEmailInUse');
    case 'auth/invalid-email':
      return "That doesn't look like a valid email.";
    case 'auth/weak-password':
      return t('traveler.errWeakPassword');
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return t('traveler.errBadCredentials');
    case 'auth/network-request-failed':
      return t('traveler.errNetwork');
    default:
      return t('traveler.errGeneric');
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnosticCode, setDiagnosticCode] = useState<string | null>(null);
  // Firebase reload mutates the User object in place. Publish a revision so
  // account/profile consumers redraw without spreading a User and losing SDK methods.
  const [, setIdentityRevision] = useState(0);

  useEffect(() => {
    let version = 0;
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      const request = ++version;
      setUser(u);
      setAccountName(u?.displayName?.trim() || null);
      setInitializing(false);
      // Provider sign-in can yield an Auth user with no displayName even when
      // American Rider already saved the account's name in the user profile.
      // Read that record once on sign-in, never per booking or per render.
      if (!u || u.displayName?.trim()) return;
      void getDoc(doc(db, 'users', u.uid)).then((snap) => {
        if (version !== request || auth.currentUser?.uid !== u.uid) return;
        const name = snap.data()?.name;
        if (typeof name !== 'string' || !name.trim()) return;
        // Never spread Firebase User into a plain object: its authentication
        // methods are provided by the SDK prototype and must be preserved.
        setAccountName(name.trim().slice(0, 40));
      }).catch(() => { /* A failed profile read cannot block signing in. */ });
    });
    return () => { ++version; unsubscribe(); };
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    setDiagnosticCode(null);
    try {
      await fn();
    } catch (e: any) {
      const code = typeof e?.code === 'string' ? e.code : 'auth/unknown';
      setDiagnosticCode(code);
      setError(friendly(code));
    } finally {
      setBusy(false);
    }
  };

  // Destructive flows must report failure to their caller. The ordinary sign-in helper stores
  // an error for the front-door screen and resolves; account deletion has its own confirmation
  // screen, whose try/catch must know whether any step failed before it dismisses itself.
  const runStrict = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      setError(friendly(e?.code ?? ''));
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const value: AuthState = {
    accountName,
    user,
    initializing,
    busy,
    error,
    signUp: async (email, password, name, mobile) => {
      setBusy(true);
      setError(null);
      setDiagnosticCode(null);
      try {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (name) await updateProfile(cred.user, { displayName: name.trim() });
        // THE VERIFICATION EMAIL WAS NEVER SENT, so `emailVerified` was false on every
        // email-and-password account that has ever existed — and the server, which carries the
        // flag on every request, checked it nowhere. A free control, plumbed end to end, and
        // switched on at neither end.
        //
        // IT IS WHAT ACTUALLY ANSWERS "hundreds of accounts annoying the platform", and it
        // costs nothing. Google and Apple sign-in arrive verified already; only this path did
        // not. Failing to send is not failing to sign up: the account exists, the traveler is
        // in, and the gates that need a verified address say so when they are reached.
        try {
          await sendEmailVerification(cred.user);
        } catch {
          // Firebase rate-limits these; a refusal here must not cost somebody their account.
        }
        // The traveler's profile record — name and mobile live in Firestore, not the repo.
        try {
          const { doc, setDoc } = await import('firebase/firestore');
          const { db } = await import('../firebase');
          await setDoc(
            doc(db, 'users', cred.user.uid),
            { name: name?.trim() || '', mobile: mobile?.trim() || '', email: email.trim() },
            { merge: true },
          );
        } catch {
          // profile write is best-effort; the account itself is created
        }
        return true;
      } catch (e: any) {
        const code = typeof e?.code === 'string' ? e.code : 'auth/unknown';
        setDiagnosticCode(code);
        setError(friendly(code));
        return false;
      } finally {
        setBusy(false);
      }
    },
    signIn: (email, password) =>
      run(() => signInWithEmailAndPassword(auth, email.trim(), password)),
    // The demo's sign-in screen offers "Forgot password?"; here it really sends the
    // reset email. Firebase deliberately succeeds even for unknown addresses, so the
    // screen's confirmation never reveals whether an account exists.
    resetPassword: async (email) => {
      setBusy(true);
      setError(null);
      try {
        await sendPasswordResetEmail(auth, email.trim());
        return true;
      } catch (e: any) {
        setError(friendly(e?.code ?? ''));
        return false;
      } finally {
        setBusy(false);
      }
    },
    setDisplayName: async (name) => {
      setBusy(true);
      setError(null);
      setDiagnosticCode(null);
      try {
        const u = auth.currentUser;
        if (!u) throw new Error(t('traveler.errNoAccount'));
        const clean = name.trim().slice(0, 40);
        if (!clean) throw new Error(t('traveler.errNameRequired'));
        await updateProfile(u, { displayName: clean });
        await import('firebase/firestore').then(({ setDoc }) =>
          setDoc(doc(db, 'users', u.uid), { name: clean }, { merge: true }),
        );
        // React does not re-render on a Firebase profile change — the user object is the
        // same instance — so the new name is published deliberately.
        setAccountName(clean);
        return true;
      } catch (e: any) {
        const code = typeof e?.code === 'string' ? e.code : 'auth/unknown';
        setDiagnosticCode(code);
        setError(friendly(code));
        return false;
      } finally {
        setBusy(false);
      }
    },
    resendEmailVerification: async () => {
      const u = auth.currentUser;
      if (!u || !u.email || u.emailVerified) return !!u?.emailVerified;
      try {
        await sendEmailVerification(u);
        return true;
      } catch {
        return false;
      }
    },
    requestEmailChange: async (newEmail, reauthenticate) => {
      const u = auth.currentUser;
      // Firebase owns normalization. Preserve the entered local-part's casing;
      // changing every letter here can alter technically case-sensitive addresses.
      const clean = newEmail.trim();
      if (!u || !clean) return false;
      setBusy(true);
      setError(null);
      try {
        await reauthenticate();
        await verifyBeforeUpdateEmail(u, clean);
        return true;
      } catch (e: any) {
        setError(friendly(e?.code ?? ''));
        return false;
      } finally {
        setBusy(false);
      }
    },
    refreshEmailStatus: async () => {
      const u = auth.currentUser;
      if (!u) return false;
      try {
        const beforeEmail = u.email;
        const beforeVerified = u.emailVerified;
        await reload(u);
        if (auth.currentUser?.uid !== u.uid) return false;
        if (u.email !== beforeEmail || u.emailVerified !== beforeVerified) {
          // Authenticated API routes derive the receipt/contact address from
          // the Firebase ID token, not just from the visible profile. A
          // verification change needs ONE refreshed token before future Travel.
          await u.getIdToken(true);
        }
        setIdentityRevision(v => v + 1);
        return true;
      } catch {
        return false;
      }
    },
    deleteAccount: (reauthenticate) =>
      runStrict(async () => {
        const u = auth.currentUser;
        if (!u) throw new Error(t('traveler.errNoAccountDelete'));
        // 1. Use the credential provider already linked to this account. Cancellation and a
        // failed credential both throw, so no operational or destructive step can follow.
        await reauthenticate();
        if (auth.currentUser?.uid !== u.uid) throw new Error(t('traveler.errNoAccountDelete'));
        // The backend atomically fences new operational work, verifies the recent Firebase
        // sign-in and deletes Auth BEFORE profile cleanup. A provider failure keeps the
        // profile intact and leaves a retryable server-only closing fence. Keep push and
        // local account data intact on a 409, 503, lost response or transient auth outage.
        // A failed token refresh is NOT proof the account was deleted.
        await deleteAccountOnServer();
        // Remove locally retained role, preferences and contacts even if sign-out fails.
        try { await clearAllStorage(); }
        finally { await fbSignOut(auth); }
      }),
    // THE DEVICE IS CLEARED BEFORE THE SESSION ENDS. Firebase sign-out alone left every
    // `ar:` value on the phone for the next person who signed in — see accountStorage.ts.
    signOut: () =>
      run(async () => {
        // Retire this device's push destination before ending the Firebase session.
        await clearPushToken();
        await clearAccountStorage();
        await fbSignOut(auth);
      }),
    onboarding,
    setOnboarding,
    diagnosticCode,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
