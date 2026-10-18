import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

/**
 * ADMIN AUTH — emails-from-Firebase-Auth model
 * ────────────────────────────────────────────
 * A user is treated as admin if ALL of these are true:
 *
 *   1. They are signed in via Firebase Email/Password.
 *   2. Their email does NOT match the auto-generated phone-auth pattern
 *      `userXXXXXXXX@chtv.app` (those accounts are regular users from the
 *      user app's phone-signup flow).
 *   3. Optionally, their email is in the allowlist at
 *      `settings/admin_config.admin_emails` (an array of strings). If the
 *      allowlist does not exist or is empty, ANY non-phone email is accepted
 *      (bootstrap mode — convenient for the first admin, but you should
 *      populate the allowlist as soon as possible).
 *
 * The first time an allowed admin signs in, the admin app auto-creates
 * `admins/{uid}` so that Firestore rules (which look at that collection)
 * grant them write access. This is gated by Firestore rules — see
 * firestore.rules.
 *
 * SECURITY NOTE — open Firebase Email/Password signup
 * ───────────────────────────────────────────────────
 * Firebase Email/Password signup is open by default on the public API.
 * Anyone with your project's public API key can create accounts. To prevent
 * arbitrary admin elevation, you should either:
 *
 *   a) Populate `settings/admin_config.admin_emails` with the specific
 *      emails of trusted admins, OR
 *
 *   b) Upgrade to Identity Platform and use a `beforeCreate` blocking
 *      function to reject signups from outside your domain.
 *
 * Without one of these, anyone signing up a new email/password account
 * directly via Firebase Auth REST API would gain admin access in
 * bootstrap mode.
 */

const PHONE_EMAIL_DOMAIN = '@chtv.app';

interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Fetch admin_emails allowlist from Firestore (returns lowercase strings). */
async function fetchAdminAllowlist(): Promise<string[]> {
  if (!db) return [];
  try {
    const snap = await getDoc(doc(db, 'settings', 'admin_config'));
    if (!snap.exists()) return [];
    const data = snap.data() as any;
    const list = Array.isArray(data.admin_emails) ? data.admin_emails : [];
    return list.map((e: string) => String(e).trim().toLowerCase()).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Decide whether a signed-in user qualifies as admin.
 * Returns reason string on failure for logging.
 */
async function evaluateAdmin(user: User): Promise<{ ok: boolean; reason?: string }> {
  if (!user.email) return { ok: false, reason: 'no email on account' };

  const email = user.email.toLowerCase();

  // Hard exclusion: phone-auth users
  if (email.endsWith(PHONE_EMAIL_DOMAIN)) {
    return { ok: false, reason: 'phone-auth account cannot be admin' };
  }

  // Optional allowlist gate
  const allowlist = await fetchAdminAllowlist();
  if (allowlist.length > 0 && !allowlist.includes(email)) {
    return { ok: false, reason: 'email not in admin allowlist' };
  }

  // Self-bootstrap admins/{uid} so Firestore rules grant write access
  if (db) {
    try {
      const adminRef = doc(db, 'admins', user.uid);
      const adminSnap = await getDoc(adminRef);
      if (!adminSnap.exists()) {
        await setDoc(adminRef, {
          email: user.email,
          created_at: new Date().toISOString(),
          bootstrap: allowlist.length === 0,
        });
      }
    } catch (e) {
      // If we can't write to admins/, Firestore rules will block them anyway
      console.warn('Could not bootstrap admin doc:', e);
    }
  }

  return { ok: true };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const { ok, reason } = await evaluateAdmin(firebaseUser);
        if (ok) {
          setUser(firebaseUser);
          setIsAdmin(true);
        } else {
          console.warn('Admin sign-out:', reason);
          await firebaseSignOut(auth);
          setUser(null);
          setIsAdmin(false);
        }
      } else {
        setUser(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!auth || !db) {
      return { error: new Error('Firebase setup is incomplete.') };
    }
    try {
      const { user: firebaseUser } = await signInWithEmailAndPassword(auth, email, password);

      const { ok, reason } = await evaluateAdmin(firebaseUser);

      if (!ok) {
        await firebaseSignOut(auth);
        if (reason === 'phone-auth account cannot be admin') {
          return { error: new Error('Akaunti hii ni ya mtumiaji wa kawaida, si admin.') };
        }
        if (reason === 'email not in admin allowlist') {
          return { error: new Error(`Email "${firebaseUser.email}" haiko kwenye allowlist ya admin. Ongeza kwenye Firestore: settings/admin_config.admin_emails`) };
        }
        if (reason === 'no email on account') {
          return { error: new Error('Akaunti hii haina email.') };
        }
        return { error: new Error(`Imekataliwa: ${reason || 'sababu haijulikani'}`) };
      }
      setUser(firebaseUser);
      setIsAdmin(true);
      return { error: null };
    } catch (error: any) {
      console.error('❌ [Admin] Sign-in error:', error?.code, error?.message);
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    if (!auth) return;
    await firebaseSignOut(auth);
    setUser(null);
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
